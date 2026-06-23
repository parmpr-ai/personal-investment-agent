from __future__ import annotations

import math
import re
import time
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Callable

from services.ai_data_sources import (
    STATUS_AVAILABLE,
    STATUS_MISSING,
    STATUS_PARTIAL,
    has_value,
    summarize_sources,
)
from services.ai_intelligence import build_ai_intelligence_bounded
from services.ai_intelligence_v25 import (
    build_catalyst_engine,
    build_executive_brief,
    build_institutional_view,
    build_moat_engine,
    build_news_impact,
    build_verdict_weighting_v2,
)
from services.connectors import yahoo_fundamentals, yahoo_news
from mock_intelligence_data import get_mock_intelligence
from services.source_registry import SourceRegistry
from services.stock_intelligence import get_ticker_news_intelligence
from services.trade_engine import opportunity_for, trade_plan_for
from services.performance_timing import record_stage, time_stage


AI_CONTEXT_SCHEMA_VERSION = "1.2"
FRONTEND_CONTRACT_SCHEMA_VERSION = "ARTEMIS-AI-007.0"

CACHE_POLICY_SECONDS = {
    "fundamentals": 15 * 60,
    "analyst": 60 * 60,
    "earnings": 60 * 60,
    "technical": 5 * 60,
    "news": 2 * 60,
    "macro": 60,
    "portfolio": 10,
    "watchlist": 30,
    "context": 10,
}

_SOURCE_CACHE: dict[str, tuple[float, str, Any]] = {}
_CONTEXT_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}

REQUIRED_CONTEXT_SOURCES: tuple[dict[str, str], ...] = (
    {"id": "companyFundamentals", "label": "Company Fundamentals"},
    {"id": "analystConsensus", "label": "Analyst Consensus"},
    {"id": "analystTargets", "label": "Analyst Targets"},
    {"id": "earningsHistory", "label": "Earnings History"},
    {"id": "earningsCalendar", "label": "Earnings Calendar"},
    {"id": "technicalIndicators", "label": "Technical Indicators"},
    {"id": "newsSentiment", "label": "News Sentiment"},
    {"id": "macroEnvironment", "label": "Macro Environment"},
    {"id": "sectorComparison", "label": "Sector Comparison"},
    {"id": "competitorComparison", "label": "Competitor Comparison"},
    {"id": "portfolioContext", "label": "Portfolio Context"},
    {"id": "watchlistContext", "label": "Watchlist Context"},
    {"id": "positionSizingContext", "label": "Position Sizing Context"},
    {"id": "portfolioFitInputs", "label": "Portfolio Fit Inputs"},
)

REQUIRED_SOURCE_IDS = tuple(row["id"] for row in REQUIRED_CONTEXT_SOURCES)

FALLBACK_COMPANY_CATALOG: dict[str, dict[str, Any]] = {
    "AAPL": {
        "name": "Apple Inc.",
        "sector": "Consumer Electronics",
        "industry": "Technology hardware and services",
        "country": "US",
        "exchange": "NASDAQ",
        "peers": ["MSFT", "GOOGL", "META", "DELL", "HPQ"],
        "macro_sensitivity": 54,
    },
    "NVDA": {
        "name": "NVIDIA Corporation",
        "sector": "Semiconductors",
        "industry": "AI accelerators and graphics processors",
        "country": "US",
        "exchange": "NASDAQ",
        "peers": ["AMD", "AVGO", "TSM", "INTC", "QCOM"],
        "macro_sensitivity": 86,
    },
    "AMD": {
        "name": "Advanced Micro Devices, Inc.",
        "sector": "Semiconductors",
        "industry": "CPUs, GPUs, and data-center accelerators",
        "country": "US",
        "exchange": "NASDAQ",
        "peers": ["NVDA", "INTC", "QCOM", "AVGO", "TSM"],
        "macro_sensitivity": 77,
    },
    "TSM": {
        "name": "Taiwan Semiconductor Manufacturing Company Limited",
        "sector": "Semiconductors",
        "industry": "Semiconductor foundry",
        "country": "Taiwan",
        "exchange": "NYSE",
        "peers": ["NVDA", "AMD", "INTC", "ASML", "UMC"],
        "macro_sensitivity": 72,
    },
    "NBIS": {
        "name": "Nebius Group N.V.",
        "sector": "AI Infrastructure",
        "industry": "AI cloud and GPU infrastructure",
        "country": "Netherlands",
        "exchange": "NASDAQ",
        "peers": ["CRWV", "IREN", "NVDA", "AMD", "TSM"],
        "macro_sensitivity": 98,
    },
    "PLTR": {
        "name": "Palantir Technologies Inc.",
        "sector": "Software",
        "industry": "Data analytics and AI platforms",
        "country": "US",
        "exchange": "NASDAQ",
        "peers": ["SNOW", "DDOG", "CRM", "AI", "MSFT"],
        "macro_sensitivity": 82,
    },
}

SECTOR_ALIASES: dict[str, tuple[str, ...]] = {
    "semiconductors": ("semis", "ai semis", "semiconductor", "chip"),
    "software": ("software", "ai software", "analytics"),
    "consumer electronics": ("mega-cap tech", "technology hardware", "consumer electronics"),
    "ai infrastructure": ("ai infra", "ai compute", "ai cloud", "digital infrastructure"),
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _elapsed_ms(start: float) -> int:
    return max(0, int((time.perf_counter() - start) * 1000))


def _clean_symbol(symbol: str | None) -> str:
    return str(symbol or "").strip().split()[0].upper()


def _clean_json(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _clean_json(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_clean_json(item) for item in value]
    if isinstance(value, tuple):
        return [_clean_json(item) for item in value]
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def _num(value: Any) -> float | None:
    try:
        if value in (None, ""):
            return None
        if isinstance(value, str):
            value = value.strip().replace(",", "")
            if not value or value.upper() in {"N/A", "NA", "--"}:
                return None
            value = value.replace("x", "").replace("X", "")
        parsed = float(value)
        return parsed if math.isfinite(parsed) else None
    except (TypeError, ValueError):
        return None


def _round(value: Any, digits: int = 2) -> float | None:
    parsed = _num(value)
    return round(parsed, digits) if parsed is not None else None


def _pct(target: Any, base: Any) -> float | None:
    target_num = _num(target)
    base_num = _num(base)
    if target_num is None or base_num in (None, 0):
        return None
    return (target_num / base_num - 1) * 100


def _clamp(value: float, low: float = 0, high: float = 100) -> float:
    return max(low, min(high, value))


def _first(*values: Any) -> Any:
    for value in values:
        if has_value(value):
            return value
    return None


def _get_path(payload: dict[str, Any] | None, path: str) -> Any:
    current: Any = payload or {}
    for part in path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def _compact(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if has_value(value)}


def _timed_call(fn: Callable[..., Any], *args: Any, fallback: Any = None, **kwargs: Any) -> dict[str, Any]:
    start = time.perf_counter_ns()
    try:
        return {"data": fn(*args, **kwargs), "timingMs": round((time.perf_counter_ns() - start) / 1_000_000, 3), "error": None}
    except Exception as exc:
        return {"data": fallback, "timingMs": round((time.perf_counter_ns() - start) / 1_000_000, 3), "error": str(exc)}


def _cache_entry_valid(saved_at: float, ttl_seconds: int) -> bool:
    return time.time() - saved_at <= ttl_seconds


def _cache_metadata(cache_status: str, updated_at: str, ttl_seconds: int, provider: str) -> dict[str, Any]:
    return {
        "cacheStatus": cache_status,
        "updatedAt": updated_at,
        "ttlSeconds": ttl_seconds,
        "provider": provider,
    }


def _cached_call(
    cache_name: str,
    key: str,
    ttl_seconds: int,
    provider: str,
    fn: Callable[..., Any],
    *args: Any,
    refresh: bool = False,
    fallback: Any = None,
    **kwargs: Any,
) -> dict[str, Any]:
    cache_key = f"{cache_name}:{key}"
    cached = _SOURCE_CACHE.get(cache_key)
    if not refresh and cached and _cache_entry_valid(cached[0], ttl_seconds):
        return {
            "data": deepcopy(cached[2]),
            "timingMs": 0,
            "error": None,
            "metadata": _cache_metadata("cached", cached[1], ttl_seconds, provider),
        }

    result = _timed_call(fn, *args, fallback=fallback, **kwargs)
    updated_at = _now_iso()
    if result.get("error") is None and has_value(result.get("data")):
        _SOURCE_CACHE[cache_key] = (time.time(), updated_at, deepcopy(result.get("data")))
    result["metadata"] = _cache_metadata("fresh", updated_at, ttl_seconds, provider)
    return result


def _cached_value(
    cache_name: str,
    key: str,
    ttl_seconds: int,
    provider: str,
    value: Any,
    *,
    refresh: bool = False,
) -> dict[str, Any]:
    cache_key = f"{cache_name}:{key}"
    cached = _SOURCE_CACHE.get(cache_key)
    if not refresh and cached and _cache_entry_valid(cached[0], ttl_seconds):
        return {
            "data": deepcopy(cached[2]),
            "timingMs": 0,
            "error": None,
            "metadata": _cache_metadata("cached", cached[1], ttl_seconds, provider),
        }
    updated_at = _now_iso()
    _SOURCE_CACHE[cache_key] = (time.time(), updated_at, deepcopy(value))
    return {
        "data": deepcopy(value),
        "timingMs": 0,
        "error": None,
        "metadata": _cache_metadata("fresh", updated_at, ttl_seconds, provider),
    }


def _apply_context_cache_hit(context: dict[str, Any], start: float) -> dict[str, Any]:
    cached = deepcopy(context)
    for section in (cached.get("sourceContexts") or {}).values():
        freshness = section.get("freshness") or {}
        if freshness.get("status") == "fresh":
            freshness["status"] = "cached"
        section["freshness"] = freshness
        source_status = section.get("sourceStatus") or {}
        if source_status.get("status") == "fresh":
            source_status["status"] = "cached"
        if source_status.get("freshnessStatus") == "fresh":
            source_status["freshnessStatus"] = "cached"
        section["sourceStatus"] = source_status
    source_status = cached.get("sourceStatus") or {}
    for row in source_status.values():
        if row.get("status") == "fresh":
            row["status"] = "cached"
        if row.get("freshnessStatus") == "fresh":
            row["freshnessStatus"] = "cached"
    frontend_status = ((cached.get("frontendPayload") or {}).get("sourceStatus") or {})
    for row in frontend_status.values():
        if row.get("status") == "fresh":
            row["status"] = "cached"
        if row.get("freshnessStatus") == "fresh":
            row["freshnessStatus"] = "cached"
    cached["asOf"] = _now_iso()
    performance = cached.setdefault("performance", {})
    performance["totalMs"] = _elapsed_ms(start)
    performance["cacheStatus"] = "cached"
    return cached


def get_cached_technical_snapshot(symbol: str) -> dict[str, Any] | None:
    """Return the cached frontend technical payload without forcing a recompute."""
    clean = _clean_symbol(symbol)
    if not clean:
        return None
    cached = _CONTEXT_CACHE.get(f"context:{clean}")
    if not cached or not _cache_entry_valid(cached[0], CACHE_POLICY_SECONDS["context"]):
        return None
    context = deepcopy(cached[1])
    frontend_payload = dict(context.get("frontendPayload") or {})
    technical = dict(frontend_payload.get("technicalIndicators") or {})
    source_status = dict(context.get("sourceStatus") or {})
    technical_status = dict(source_status.get("technicalIndicators") or {})
    snapshot = {
        "symbol": clean,
        "asOf": context.get("asOf"),
        "cachedAt": datetime.fromtimestamp(cached[0], timezone.utc).isoformat(),
        "frontendPayload": frontend_payload,
        "technicalIndicators": technical,
        "sourceStatus": source_status,
        "technicalSourceStatus": technical_status,
    }
    if technical_status.get("updatedAt"):
        snapshot["updatedAt"] = technical_status.get("updatedAt")
    return snapshot


def _parse_display_number(value: Any) -> float | None:
    text = str(value or "").strip()
    if not text:
        return None
    normalized = (
        text.replace("\u2212", "-")
        .replace("\u2013", "-")
        .replace("\u2014", "-")
        .replace("\u00e2\u02c6\u2019", "-")
        .replace(",", "")
    )
    match = re.search(r"[-+]?\$?\s*([0-9]+(?:\.[0-9]+)?)", normalized)
    if not match:
        return None
    parsed = _num(match.group(1))
    if parsed is None:
        return None
    is_negative = "-" in normalized[: match.start(1)]
    return -parsed if is_negative else parsed


def _parse_percent(value: Any) -> float | None:
    parsed = _parse_display_number(value)
    return parsed


def _parse_mock_targets(mock: dict[str, Any]) -> dict[str, Any]:
    targets = mock.get("targets") or {}
    if not targets:
        return {}
    bull = _parse_display_number(targets.get("bull"))
    base = _parse_display_number(targets.get("base"))
    bear = _parse_display_number(targets.get("bear"))
    consensus = str(targets.get("consensus") or "").strip()
    rating_distribution: dict[str, int] = {}
    for count, label in re.findall(r"(\d+)\s+(Buy|Hold|Sell)", consensus, flags=re.IGNORECASE):
        key = label.lower()
        rating_distribution[key] = rating_distribution.get(key, 0) + int(count)
    consensus_rating = None
    if consensus:
        consensus_rating = re.split(r"\s+[-\u2014]\s+|\s+-\s+", consensus, maxsplit=1)[0].strip()
        if " " in consensus_rating and len(consensus_rating) > 18:
            consensus_rating = consensus_rating.split()[0]
    return _compact(
        {
            "average_target": base,
            "high_target": bull,
            "low_target": bear,
            "consensus_rating": consensus_rating,
            "rating_distribution": rating_distribution,
            "upside_downside_text": targets.get("upside_downside"),
            "source": "PIA mock intelligence fallback",
        }
    )


def _parse_calendar_date(value: Any) -> tuple[str | None, int | None]:
    text = str(value or "").replace("(est.)", "").strip()
    if not text:
        return None, None
    candidates = [text]
    if "," in text:
        candidates.append(text.split("(")[0].strip())
    for fmt in ("%Y-%m-%d", "%b %d, %Y", "%B %d, %Y"):
        for candidate in candidates:
            try:
                parsed = datetime.strptime(candidate, fmt).date()
                today = datetime.now(timezone.utc).date()
                return parsed.isoformat(), (parsed - today).days
            except ValueError:
                continue
    return text, None


def _find_position(portfolio: dict[str, Any] | None, symbol: str) -> dict[str, Any] | None:
    for position in (portfolio or {}).get("positions", []) or []:
        raw_symbol = str(position.get("symbol") or "").split()[0].upper()
        underlying = str(position.get("underlying") or "").upper()
        if raw_symbol == symbol or underlying == symbol:
            return position
    return None


def _find_watch(watchlist: list[dict[str, Any]] | None, symbol: str, macro: dict[str, Any] | None) -> dict[str, Any] | None:
    for item in watchlist or []:
        if str(item.get("symbol") or "").split()[0].upper() == symbol:
            try:
                return opportunity_for(item, macro or {})
            except Exception:
                return dict(item)
    return None


def _calendar_matches(calendar: list[dict[str, Any]] | None, symbol: str, *, earnings_only: bool = False) -> list[dict[str, Any]]:
    matches: list[dict[str, Any]] = []
    for event in calendar or []:
        event_text = f"{event.get('event', '')} {event.get('symbol', '')} {event.get('ticker', '')}".upper()
        if earnings_only and "EARNINGS" not in event_text:
            continue
        if symbol and symbol not in event_text:
            continue
        matches.append(event)
    return matches


def _catalog(symbol: str) -> dict[str, Any]:
    return dict(FALLBACK_COMPANY_CATALOG.get(symbol, {}))


def _company_profile(
    symbol: str,
    fundamentals: dict[str, Any],
    mock: dict[str, Any],
    position: dict[str, Any] | None,
    watch: dict[str, Any] | None,
) -> dict[str, Any]:
    catalog = _catalog(symbol)
    mock_company = mock.get("company") or {}
    source = position or watch or {}
    return _compact(
        {
            "symbol": symbol,
            "name": _first(fundamentals.get("name"), source.get("name"), catalog.get("name")),
            "sector": _first(fundamentals.get("sector"), source.get("sector"), catalog.get("sector"), mock_company.get("sector")),
            "industry": _first(fundamentals.get("industry"), catalog.get("industry"), mock_company.get("industry")),
            "country": _first(fundamentals.get("country"), catalog.get("country")),
            "exchange": _first(fundamentals.get("exchange"), catalog.get("exchange"), mock_company.get("exchange")),
            "currency": fundamentals.get("currency"),
            "description": mock_company.get("description"),
            "hq": mock_company.get("hq"),
            "ceo": mock_company.get("ceo"),
            "employees": mock_company.get("employees"),
        }
    )


def _merge_fundamentals(
    symbol: str,
    live: dict[str, Any] | None,
    ai_signal: dict[str, Any] | None,
    position: dict[str, Any] | None,
    watch: dict[str, Any] | None,
) -> dict[str, Any]:
    merged = dict(live or {})
    mock = get_mock_intelligence(symbol)
    mock_fundamentals = mock.get("fundamentals") or {}
    mock_targets = _parse_mock_targets(mock)
    source = position or watch or {}
    metrics = (ai_signal or {}).get("metrics") or {}

    price = _first(
        merged.get("price"),
        merged.get("regularMarketPrice"),
        merged.get("last"),
        (ai_signal or {}).get("price"),
        metrics.get("current_price"),
        source.get("last"),
        source.get("price"),
    )
    if price is not None:
        merged.setdefault("price", price)
        merged.setdefault("regularMarketPrice", price)
        merged.setdefault("last", price)
    merged.setdefault("ticker", symbol)
    merged.setdefault("symbol", symbol)
    if (ai_signal or {}).get("currency"):
        merged.setdefault("currency", (ai_signal or {}).get("currency"))
    if (ai_signal or {}).get("exchange"):
        merged.setdefault("exchange", (ai_signal or {}).get("exchange"))
    if source.get("name"):
        merged.setdefault("name", source.get("name"))

    if mock_fundamentals:
        mock_field_map = {
            "pe": ("pe", "pe_ttm", "trailingPE"),
            "eps_actual": ("reported_eps", "reportedEPS"),
            "eps_estimate": ("eps_estimate", "epsEstimate"),
            "eps_surprise_pct": ("eps_surprise_pct",),
            "next_earnings": ("earnings_date", "earningsDate"),
            "forward_pe": ("forward_pe",),
            "peg": ("peg",),
            "debt_equity": ("debt_equity",),
            "fcf_yield": ("fcf_yield",),
        }
        for mock_key, target_keys in mock_field_map.items():
            raw = mock_fundamentals.get(mock_key)
            if raw is None:
                continue
            parsed = _parse_percent(raw) if "pct" in mock_key or "yield" in mock_key else _parse_display_number(raw)
            value: Any = parsed if parsed is not None and mock_key not in {"next_earnings"} else raw
            for target_key in target_keys:
                merged.setdefault(target_key, value)

    if mock_targets:
        analyst_targets = dict(merged.get("analyst_targets") or {})
        for key, value in mock_targets.items():
            analyst_targets.setdefault(key, value)
        if analyst_targets:
            merged["analyst_targets"] = analyst_targets
        target_map = {
            "average_target": "targetMeanPrice",
            "high_target": "targetHighPrice",
            "low_target": "targetLowPrice",
            "consensus_rating": "recommendationKey",
            "rating_distribution": "recommendationTrend",
        }
        for source_key, target_key in target_map.items():
            if source_key in mock_targets:
                merged.setdefault(target_key, mock_targets[source_key])
    peers = _first(merged.get("peerSymbols"), merged.get("peers"), _catalog(symbol).get("peers"))
    if peers:
        merged.setdefault("peerSymbols", peers)
        merged.setdefault("competitors", peers)

    return merged


def _source_section(
    source_id: str,
    label: str,
    data: dict[str, Any],
    required_fields: list[str],
    *,
    source: str,
    timing_ms: int = 0,
    freshness_meta: dict[str, Any] | None = None,
    ttl_seconds: int = 0,
    provider: str | None = None,
    notes: list[str] | None = None,
    errors: list[str] | None = None,
) -> dict[str, Any]:
    available_fields = [field for field in required_fields if has_value(_get_path(data, field))]
    missing_fields = [field for field in required_fields if field not in available_fields]
    if required_fields and len(available_fields) == len(required_fields):
        status = STATUS_AVAILABLE
    elif has_value(data) or available_fields:
        status = STATUS_PARTIAL
    else:
        status = STATUS_MISSING
    freshness_meta = freshness_meta or {}
    provider_value = provider or freshness_meta.get("provider") or source
    updated_at = freshness_meta.get("updatedAt") or _now_iso()
    ttl_value = int(ttl_seconds or freshness_meta.get("ttlSeconds") or 0)
    freshness_status = freshness_meta.get("cacheStatus") or "fresh"
    if status == STATUS_MISSING:
        freshness_status = "missing"
    elif status == STATUS_PARTIAL:
        freshness_status = "partial"
    freshness = {
        "status": freshness_status,
        "updatedAt": updated_at,
        "ttlSeconds": ttl_value,
        "provider": provider_value,
    }
    source_status = {
        "status": freshness_status,
        "availabilityStatus": status,
        "freshnessStatus": freshness_status,
        "updatedAt": updated_at,
        "ttlSeconds": ttl_value,
        "provider": provider_value,
    }
    return {
        "id": source_id,
        "label": label,
        "status": status,
        "source": source,
        "freshness": freshness,
        "sourceStatus": source_status,
        "data": data if has_value(data) else {},
        "availableFields": available_fields,
        "missingFields": missing_fields,
        "notes": notes or [],
        "errors": [error for error in (errors or []) if error],
        "timingMs": timing_ms,
    }


def _analyst_consensus(fundamentals: dict[str, Any]) -> dict[str, Any]:
    targets = fundamentals.get("analyst_targets") if isinstance(fundamentals.get("analyst_targets"), dict) else {}
    distribution = _first(targets.get("rating_distribution"), fundamentals.get("recommendationTrend"))
    mean = _first(targets.get("recommendation_mean"), fundamentals.get("recommendationMean"))
    key = _first(targets.get("consensus_rating"), fundamentals.get("recommendationKey"))
    analyst_count = _first(targets.get("analyst_count"), fundamentals.get("numberOfAnalystOpinions"))
    verdict = None
    mean_num = _num(mean)
    key_text = str(key or "").lower()
    if "strong" in key_text and "buy" in key_text:
        verdict = "Overweight"
    elif "buy" in key_text or "outperform" in key_text:
        verdict = "Overweight"
    elif "sell" in key_text or "underperform" in key_text:
        verdict = "Underweight"
    elif key_text or mean_num is not None:
        verdict = "Neutral"
    if mean_num is not None:
        if mean_num <= 2.0:
            verdict = "Overweight"
        elif mean_num >= 3.5:
            verdict = "Underweight"
        else:
            verdict = verdict or "Neutral"
    return _compact(
        {
            "consensusRating": key,
            "consensusVerdict": verdict,
            "averageAnalystRating": _first(targets.get("average_analyst_rating"), fundamentals.get("averageAnalystRating")),
            "recommendationMean": mean,
            "analystCount": analyst_count,
            "ratingDistribution": distribution,
        }
    )


def _analyst_targets(fundamentals: dict[str, Any]) -> dict[str, Any]:
    targets = fundamentals.get("analyst_targets") if isinstance(fundamentals.get("analyst_targets"), dict) else {}
    current = _first(targets.get("current_price"), fundamentals.get("price"), fundamentals.get("regularMarketPrice"), fundamentals.get("last"))
    average = _first(targets.get("average_target"), fundamentals.get("targetMeanPrice"))
    high = _first(targets.get("high_target"), fundamentals.get("targetHighPrice"))
    low = _first(targets.get("low_target"), fundamentals.get("targetLowPrice"))
    median = _first(targets.get("median_target"), fundamentals.get("targetMedianPrice"))
    upside = _first(targets.get("upside_downside_pct"), fundamentals.get("analyst_upside_pct"), _pct(average, current))
    spread = None
    average_num = _num(average)
    high_num = _num(high)
    low_num = _num(low)
    if average_num not in (None, 0) and high_num is not None and low_num is not None:
        spread = (high_num - low_num) / average_num * 100
    return _compact(
        {
            "currentPrice": _round(current),
            "averageTarget": _round(average),
            "highTarget": _round(high),
            "lowTarget": _round(low),
            "medianTarget": _round(median),
            "upsidePct": _round(upside),
            "targetSpreadPct": _round(spread),
            "analystCount": _first(targets.get("analyst_count"), fundamentals.get("numberOfAnalystOpinions")),
            "source": targets.get("source") or fundamentals.get("source") or "Yahoo Finance",
        }
    )


def _earnings_history(fundamentals: dict[str, Any]) -> dict[str, Any]:
    reported = _first(fundamentals.get("reported_eps"), fundamentals.get("reportedEPS"), fundamentals.get("eps_actual"))
    estimate = _first(fundamentals.get("eps_estimate"), fundamentals.get("epsEstimate"))
    surprise = _first(fundamentals.get("eps_surprise_pct"), fundamentals.get("epsSurprisePct"))
    latest = _compact(
        {
            "reportedEps": _round(reported),
            "epsEstimate": _round(estimate),
            "surprisePct": _round(surprise),
            "period": fundamentals.get("earnings_period"),
        }
    )
    return _compact(
        {
            "latest": latest,
            "history": [latest] if has_value(latest) else [],
            "source": "Yahoo Finance / PIA fallback",
        }
    )


def _earnings_calendar(symbol: str, fundamentals: dict[str, Any], calendar: list[dict[str, Any]] | None) -> dict[str, Any]:
    events = _calendar_matches(calendar, symbol, earnings_only=True)
    raw_next = _first(fundamentals.get("earnings_date"), fundamentals.get("earningsDate"))
    parsed_next, days_until = _parse_calendar_date(raw_next)
    if not parsed_next and events:
        parsed_next, days_until = _parse_calendar_date(events[0].get("date"))
    return _compact(
        {
            "nextEarningsDate": parsed_next,
            "daysUntilNextEarnings": days_until,
            "events": events,
            "eventCount": len(events),
            "source": "Portfolio calendar / Yahoo Finance / PIA fallback",
        }
    )


def _technical_indicators(
    fundamentals: dict[str, Any],
    ai_signal: dict[str, Any],
    position: dict[str, Any] | None,
    watch: dict[str, Any] | None,
) -> dict[str, Any]:
    metrics = ai_signal.get("metrics") or {}
    source = position or watch or {}
    price = _first(
        metrics.get("current_price"),
        ai_signal.get("price"),
        fundamentals.get("price"),
        fundamentals.get("regularMarketPrice"),
        source.get("last"),
        source.get("price"),
    )
    fair_value = _first(metrics.get("fair_value"), fundamentals.get("targetMeanPrice"))
    return _compact(
        {
            "currentPrice": _round(price),
            "momentumScore": _first(metrics.get("momentum"), source.get("momentum_score"), source.get("momentum")),
            "trendScore": metrics.get("trend"),
            "riskScore": _first(metrics.get("risk"), source.get("risk")),
            "sentimentScore": metrics.get("sentiment"),
            "relativeStrength": metrics.get("relative_strength"),
            "relativeStrengthScore": metrics.get("relative_strength_score"),
            "volatility30d": metrics.get("volatility_30d"),
            "drawdown90d": metrics.get("drawdown_90d"),
            "beta": _first(metrics.get("beta"), fundamentals.get("beta")),
            "shortInterestPct": metrics.get("short_interest_pct"),
            "institutionalFlow30d": metrics.get("institutional_flow_30d"),
            "institutionalScore": metrics.get("institutional_score"),
            "relativeVolume30d": metrics.get("relative_volume_30d"),
            "fairValue": _round(fair_value),
            "fairValueSource": metrics.get("fair_value_source"),
            "expectedReturnPct": _round(_pct(fair_value, price)),
            "priceReturn1d": metrics.get("price_return_1d"),
            "priceReturn5d": metrics.get("price_return_5d"),
            "priceReturn30d": metrics.get("price_return_30d"),
            "priceReturn90d": metrics.get("price_return_90d"),
            "history": metrics.get("history"),
            "todayRange": fundamentals.get("today_range"),
            "fiftyTwoWeekHigh": _first(fundamentals.get("fiftyTwoWeekHigh"), fundamentals.get("52w_high")),
            "fiftyTwoWeekLow": _first(fundamentals.get("fiftyTwoWeekLow"), fundamentals.get("52w_low")),
        }
    )


def _news_sentiment(raw_news: list[dict[str, Any]], news_intelligence: dict[str, Any], ai_signal: dict[str, Any]) -> dict[str, Any]:
    metrics = ai_signal.get("metrics") or {}
    items = []
    if not news_intelligence.get("is_demo") and not news_intelligence.get("unavailable"):
        items = list(news_intelligence.get("items") or [])
    if not items:
        items = list(raw_news or [])
    bias_counts: dict[str, int] = {}
    for item in items:
        bias = str(item.get("bias") or item.get("sentiment") or item.get("impact") or "Unknown")
        bias_counts[bias] = bias_counts.get(bias, 0) + 1
    return _compact(
        {
            "sentimentScore": metrics.get("sentiment"),
            "digest": news_intelligence.get("digest") if not news_intelligence.get("is_demo") else None,
            "headlineCount": len(items),
            "biasCounts": bias_counts,
            "items": items[:8],
            "source": "Yahoo RSS / News Intelligence",
        }
    )


def _macro_environment(macro: dict[str, Any] | None) -> dict[str, Any]:
    macro = macro or {}
    return _compact(
        {
            "vix": macro.get("vix"),
            "skew": macro.get("skew"),
            "dxy": macro.get("dxy"),
            "us10y": macro.get("us10y"),
            "move": macro.get("move"),
            "riskMode": macro.get("risk_mode"),
            "marketStrip": macro.get("market_strip"),
        }
    )


def _normalized_sector_name(value: Any) -> str:
    text = str(value or "").strip().lower()
    if not text:
        return ""
    for canonical, aliases in SECTOR_ALIASES.items():
        if canonical in text or any(alias in text for alias in aliases):
            return canonical
    return text


def _sector_weight(portfolio: dict[str, Any] | None, sector: str | None) -> tuple[float, dict[str, Any] | None]:
    target = _normalized_sector_name(sector)
    best_row = None
    best_weight = 0.0
    for row in ((portfolio or {}).get("exposures") or {}).get("rows", []) or []:
        name = str(row.get("name") or "")
        normalized = _normalized_sector_name(name)
        if target and (target == normalized or target in normalized or normalized in target):
            weight = _num(row.get("pct")) or 0
            if weight >= best_weight:
                best_weight = weight
                best_row = row
    return best_weight, best_row


def _sector_comparison(
    symbol: str,
    profile: dict[str, Any],
    portfolio: dict[str, Any] | None,
    watchlist: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    sector = profile.get("sector")
    weight, row = _sector_weight(portfolio, sector)
    peers = set(_catalog(symbol).get("peers") or [])
    watched_peers = [item for item in watchlist or [] if str(item.get("symbol") or "").upper() in peers]
    portfolio_peers = [
        item
        for item in (portfolio or {}).get("positions", []) or []
        if str(item.get("symbol") or item.get("underlying") or "").split()[0].upper() in peers
    ]
    exposure_rows = ((portfolio or {}).get("exposures") or {}).get("rows", []) or []
    rank = None
    for index, exposure in enumerate(exposure_rows, start=1):
        if row is exposure:
            rank = index
            break
    return _compact(
        {
            "sector": sector,
            "industry": profile.get("industry"),
            "portfolioSectorWeightPct": round(weight, 2),
            "matchedExposureBucket": row,
            "sectorExposureRank": rank,
            "watchlistPeers": watched_peers,
            "portfolioPeers": portfolio_peers,
            "sectorLimitPct": 35,
            "isSectorOverLimit": weight > 35,
        }
    )


def _competitor_comparison(
    symbol: str,
    profile: dict[str, Any],
    portfolio: dict[str, Any] | None,
    watchlist: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    peer_symbols = list(dict.fromkeys(_first(profile.get("peers"), _catalog(symbol).get("peers"), []) or []))
    rows: list[dict[str, Any]] = []
    for peer in peer_symbols[:8]:
        peer_symbol = str(peer).upper()
        position = _find_position(portfolio, peer_symbol)
        watch = _find_watch(watchlist, peer_symbol, None)
        peer_catalog = _catalog(peer_symbol)
        rows.append(
            _compact(
                {
                    "symbol": peer_symbol,
                    "name": _first(peer_catalog.get("name"), (watch or {}).get("name"), (position or {}).get("name")),
                    "sector": _first(peer_catalog.get("sector"), (watch or {}).get("sector"), (position or {}).get("sector")),
                    "held": bool(position),
                    "watchlisted": bool(watch),
                    "portfolioPct": (position or {}).get("portfolio_pct"),
                    "risk": _first((position or {}).get("risk"), (watch or {}).get("risk")),
                    "relationship": "peer",
                }
            )
        )
    return {"peers": rows, "peerCount": len(rows), "source": "PIA peer catalog / portfolio / watchlist"}


def _portfolio_context(portfolio: dict[str, Any] | None, position: dict[str, Any] | None) -> dict[str, Any]:
    portfolio = portfolio or {}
    return _compact(
        {
            "source": portfolio.get("source"),
            "activeSource": portfolio.get("active_source"),
            "configuredMode": portfolio.get("configured_mode"),
            "fallbackActive": portfolio.get("fallback_active"),
            "asOf": portfolio.get("as_of"),
            "totalValue": portfolio.get("total_value"),
            "cash": portfolio.get("cash"),
            "buyingPower": portfolio.get("buying_power"),
            "riskMode": portfolio.get("risk_mode"),
            "positionCount": len(portfolio.get("positions") or []),
            "currentPosition": position,
            "exposures": portfolio.get("exposures"),
            "guardrails": portfolio.get("guardrails"),
            "todayActions": portfolio.get("today_actions"),
            "stressTests": portfolio.get("stress_tests"),
        }
    )


def _watchlist_context(symbol: str, watch: dict[str, Any] | None, watchlist: list[dict[str, Any]] | None) -> dict[str, Any]:
    return {
        "isWatchlisted": bool(watch),
        "watchItem": watch or None,
        "watchlistSize": len(watchlist or []),
        "watchlistSymbols": [str(item.get("symbol") or "").upper() for item in watchlist or [] if item.get("symbol")],
    }


def _position_sizing_context(
    profile: dict[str, Any],
    technical: dict[str, Any],
    portfolio: dict[str, Any] | None,
    position: dict[str, Any] | None,
    watch: dict[str, Any] | None,
    sector_context: dict[str, Any],
    macro: dict[str, Any] | None,
) -> dict[str, Any]:
    portfolio_value = _num((portfolio or {}).get("total_value"))
    current_price = _num(technical.get("currentPrice"))
    current_weight = _num((position or {}).get("portfolio_pct")) or 0.0
    current_value = _num((position or {}).get("market_value")) or 0.0
    risk = _num(_first(technical.get("riskScore"), (position or {}).get("risk"), (watch or {}).get("risk")))
    risk_for_calc = risk if risk is not None else 50.0
    sector_weight = _num(sector_context.get("portfolioSectorWeightPct")) or 0.0
    single_limit = 25.0
    sector_limit = 35.0
    single_headroom = max(0.0, single_limit - current_weight)
    sector_headroom = max(0.0, sector_limit - sector_weight)
    risk_multiplier = 1.0
    if risk_for_calc >= 85:
        risk_multiplier = 0.35
    elif risk_for_calc >= 75:
        risk_multiplier = 0.5
    elif risk_for_calc >= 65:
        risk_multiplier = 0.7
    risk_mode = str((macro or {}).get("risk_mode") or "").lower()
    if risk_mode and "buy" not in risk_mode:
        risk_multiplier *= 0.75
    base_add_pct = min(5.0, single_headroom, sector_headroom)
    suggested_add_pct = max(0.0, base_add_pct * risk_multiplier)
    expected_return = _num(technical.get("expectedReturnPct"))
    if expected_return is not None and expected_return < 0:
        suggested_add_pct = min(suggested_add_pct, 1.0)
    if current_weight >= single_limit:
        action = "trim_or_hold_no_add"
    elif sector_weight >= sector_limit:
        action = "sector_full_no_add"
    elif suggested_add_pct <= 0.25:
        action = "watch_only"
    elif position:
        action = "measured_add_allowed"
    else:
        action = "starter_size_allowed"
    max_add_value = portfolio_value * suggested_add_pct / 100 if portfolio_value is not None else None
    return _compact(
        {
            "symbol": profile.get("symbol"),
            "isHeld": bool(position),
            "currentPrice": _round(current_price),
            "portfolioValue": _round(portfolio_value),
            "currentPositionValue": _round(current_value),
            "currentWeightPct": round(current_weight, 2),
            "singlePositionLimitPct": single_limit,
            "sectorLimitPct": sector_limit,
            "sectorWeightPct": round(sector_weight, 2),
            "singlePositionHeadroomPct": round(single_headroom, 2),
            "sectorHeadroomPct": round(sector_headroom, 2),
            "riskScore": round(risk, 2) if risk is not None else None,
            "riskScoreSource": "technicalIndicators" if risk is not None else "missing",
            "riskScoreIsPlaceholder": risk is None,
            "riskMultiplier": round(risk_multiplier, 2),
            "suggestedMaxAddPct": round(suggested_add_pct, 2),
            "suggestedMaxAddValue": _round(max_add_value),
            "suggestedAction": action,
            "sizingBand": "none" if suggested_add_pct <= 0.25 else ("small" if suggested_add_pct < 2 else "normal"),
        }
    )


def _portfolio_fit_inputs(
    profile: dict[str, Any],
    technical: dict[str, Any],
    sector_context: dict[str, Any],
    sizing: dict[str, Any],
    position: dict[str, Any] | None,
    watch: dict[str, Any] | None,
) -> dict[str, Any]:
    expected_return = _num(technical.get("expectedReturnPct"))
    momentum = _num(technical.get("momentumScore"))
    trend = _num(technical.get("trendScore"))
    risk = _num(sizing.get("riskScore"))
    momentum_for_calc = momentum if momentum is not None else 50.0
    trend_for_calc = trend if trend is not None else 50.0
    risk_for_calc = risk if risk is not None else 50.0
    sector_weight = _num(sector_context.get("portfolioSectorWeightPct")) or 0.0
    suggested_add = _num(sizing.get("suggestedMaxAddPct")) or 0.0
    hypothetical_add_pct = min(3.0, suggested_add)
    diversification = "High" if sector_weight == 0 else ("Medium" if sector_weight < 12 else ("Low" if sector_weight < 35 else "Negative"))
    diversification_bonus = {"High": 12, "Medium": 7, "Low": 1, "Negative": -12}[diversification]
    fit_score = (
        50
        + (expected_return or 0) * 0.75
        + (momentum_for_calc - 50) * 0.18
        + (trend_for_calc - 50) * 0.16
        - max(0.0, risk_for_calc - 60) * 0.45
        + diversification_bonus
        - max(0.0, sector_weight - 30) * 0.8
    )
    return _compact(
        {
            "candidateSector": profile.get("sector"),
            "candidateIndustry": profile.get("industry"),
            "candidateCountry": profile.get("country"),
            "currentPrice": technical.get("currentPrice"),
            "expectedReturnPct": _round(expected_return),
            "momentumScore": round(momentum, 2) if momentum is not None else None,
            "momentumScoreSource": "technicalIndicators" if momentum is not None else "missing",
            "momentumScoreIsPlaceholder": momentum is None,
            "trendScore": round(trend, 2) if trend is not None else None,
            "trendScoreSource": "technicalIndicators" if trend is not None else "missing",
            "trendScoreIsPlaceholder": trend is None,
            "riskScore": round(risk, 2) if risk is not None else None,
            "riskScoreSource": "technicalIndicators" if risk is not None else "missing",
            "riskScoreIsPlaceholder": risk is None,
            "beta": technical.get("beta"),
            "macroSensitivity": _first((position or {}).get("macro_sensitivity"), (watch or {}).get("macro_sensitivity"), _catalog(str(profile.get("symbol") or "")).get("macro_sensitivity")),
            "currentPortfolioWeightPct": sizing.get("currentWeightPct"),
            "sectorWeightPct": sector_context.get("portfolioSectorWeightPct"),
            "hypotheticalAddPct": round(hypothetical_add_pct, 2),
            "concentrationAfterHypotheticalAddPct": round((_num(sizing.get("currentWeightPct")) or 0) + hypothetical_add_pct, 2),
            "diversificationBenefit": diversification,
            "portfolioFitScore": int(round(_clamp(fit_score))),
            "constraints": {
                "singlePositionLimitPct": sizing.get("singlePositionLimitPct"),
                "sectorLimitPct": sizing.get("sectorLimitPct"),
                "suggestedMaxAddPct": sizing.get("suggestedMaxAddPct"),
                "suggestedAction": sizing.get("suggestedAction"),
            },
            "correlationGroup": {
                "sector": profile.get("sector"),
                "peers": _catalog(str(profile.get("symbol") or "")).get("peers") or [],
            },
        }
    )


def _recommendation_engine_inputs(
    symbol: str,
    position: dict[str, Any] | None,
    watch: dict[str, Any] | None,
    macro: dict[str, Any] | None,
    technical: dict[str, Any],
    sizing: dict[str, Any],
    fit_inputs: dict[str, Any],
) -> dict[str, Any]:
    trade_plan = None
    if position:
        trade_plan = trade_plan_for(position, macro or {})
    elif watch:
        trade_plan = watch
    return _compact(
        {
            "symbol": symbol,
            "hasPosition": bool(position),
            "isWatchlisted": bool(watch),
            "tradePlan": trade_plan,
            "technical": technical,
            "positionSizing": sizing,
            "portfolioFit": fit_inputs,
            "macroRiskMode": (macro or {}).get("risk_mode"),
        }
    )


def _source_status_map(source_contexts: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {
        source_id: dict(section.get("sourceStatus") or {})
        for source_id, section in source_contexts.items()
    }


def _score_level(value: float | None) -> str:
    if value is None:
        return "unknown"
    if value >= 75:
        return "high"
    if value >= 55:
        return "medium"
    if value >= 40:
        return "balanced"
    return "low"


def _risk_label(value: float | None) -> str:
    if value is None:
        return "Unknown"
    if value >= 82:
        return "High"
    if value >= 64:
        return "Elevated"
    if value >= 42:
        return "Moderate"
    return "Low"


def _case_from_score(score: float, risk: float | None, expected_return: float | None, owned: bool, sizing_action: str | None) -> tuple[str, str]:
    case_type = "BUY" if score >= 64 else ("SELL" if score <= 38 else "HOLD")
    if risk is not None and risk >= 86 and score < 72:
        case_type = "HOLD" if (expected_return or 0) >= 0 else "SELL"
    if owned and sizing_action in {"trim_or_hold_no_add", "sector_full_no_add"} and case_type == "BUY":
        case_type = "HOLD"
    return case_type, case_type


def _driver_scorecard(
    technical: dict[str, Any],
    analyst_consensus: dict[str, Any],
    fit_inputs: dict[str, Any],
) -> list[dict[str, Any]]:
    momentum = _num(technical.get("momentumScore"))
    trend = _num(technical.get("trendScore"))
    sentiment = _num(technical.get("sentimentScore"))
    risk = _num(technical.get("riskScore"))
    expected = _num(technical.get("expectedReturnPct"))
    analyst_count = _num(analyst_consensus.get("analystCount"))
    analyst_score = 50.0
    verdict = str(analyst_consensus.get("consensusVerdict") or "").lower()
    if "overweight" in verdict:
        analyst_score += 18
    elif "underweight" in verdict:
        analyst_score -= 18
    if analyst_count is not None:
        analyst_score += min(12, analyst_count / 4)
    fair_value_score = 50 + (expected or 0) * 1.1
    fit_score = _num(fit_inputs.get("portfolioFitScore"))
    rows = [
        ("Momentum", momentum, "technicalIndicators"),
        ("Trend", trend, "technicalIndicators"),
        ("Sentiment", sentiment, "newsSentiment"),
        ("Risk", 100 - risk if risk is not None else None, "technicalIndicators"),
        ("Analysts", analyst_score, "analystConsensus"),
        ("Fair Value", fair_value_score, "analystTargets"),
    ]
    if fit_score is not None:
        rows[-1] = ("Portfolio Fit", fit_score, "portfolioFitInputs")
    scorecard: list[dict[str, Any]] = []
    for label, value, source in rows:
        score = int(round(_clamp(value if value is not None else 50)))
        scorecard.append(
            {
                "label": label,
                "score": score,
                "level": _score_level(score),
                "sourceSection": source,
            }
        )
    return scorecard[:6]


def _evidence_items(
    symbol: str,
    technical: dict[str, Any],
    analyst_targets: dict[str, Any],
    news_sentiment: dict[str, Any],
    sector_context: dict[str, Any],
) -> list[dict[str, str]]:
    expected = _num(technical.get("expectedReturnPct"))
    momentum = _num(technical.get("momentumScore"))
    headline_count = int(_num(news_sentiment.get("headlineCount")) or 0)
    items = [
        {
            "sourceSection": "technicalIndicators",
            "title": "Technical setup",
            "detail": f"Momentum {int(round(momentum or 50))}, trend {int(round(_num(technical.get('trendScore')) or 50))}, risk {_risk_label(_num(technical.get('riskScore')))}.",
        },
        {
            "sourceSection": "analystTargets",
            "title": "Analyst target context",
            "detail": f"Consensus target implies {round(expected, 1)}% expected return." if expected is not None else "Target data is available but expected return is not decisive.",
        },
        {
            "sourceSection": "newsSentiment",
            "title": "News and sector read",
            "detail": f"{headline_count} recent headlines plus sector weight {sector_context.get('portfolioSectorWeightPct', 0)}% inform the view on {symbol}.",
        },
    ]
    return items[:3]


def _scenario_outlook(
    current_price: float | None,
    expected_return: float | None,
    risk: float | None,
    news_impact: dict[str, Any] | None = None,
) -> dict[str, Any]:
    base_return = expected_return if expected_return is not None else 0.0
    risk_penalty = max(0.0, (risk or 50) - 60) * 0.18
    bear_return = min(base_return - 12 - risk_penalty, -6)
    bull_return = max(base_return + 12, 8)
    bull_probability = 25 if (risk or 50) < 75 else 20
    bear_probability = 25 if (risk or 50) >= 75 else 20
    impact = news_impact or {}
    if impact.get("materialEvents"):
        direction = str(impact.get("direction") or "")
        importance = str(impact.get("importance") or "")
        shift = 7 if importance == "High" else 4 if importance == "Medium" else 2
        if direction == "Positive":
            bull_probability += shift
            bear_probability = max(8, bear_probability - max(2, shift // 2))
            bull_return += shift * 0.8
        elif direction == "Negative":
            bear_probability += shift
            bull_probability = max(8, bull_probability - max(2, shift // 2))
            bear_return -= shift * 0.8
    base_probability = max(5, 100 - bull_probability - bear_probability)

    def scenario(return_pct: float, probability: int) -> dict[str, Any]:
        return {
            "returnPct": round(return_pct, 1),
            "price": round(current_price * (1 + return_pct / 100), 2) if current_price is not None else None,
            "probability": probability,
        }

    return {
        "bear": scenario(bear_return, bear_probability),
        "base": scenario(base_return, base_probability),
        "bull": scenario(bull_return, bull_probability),
    }


def _verdict_history(technical: dict[str, Any], case_type: str, score: int) -> list[dict[str, Any]]:
    history = technical.get("history") if isinstance(technical.get("history"), dict) else {}
    momentum = history.get("momentum") if isinstance(history.get("momentum"), list) else []
    trend = history.get("trend") if isinstance(history.get("trend"), list) else []
    sentiment = history.get("sentiment") if isinstance(history.get("sentiment"), list) else []
    risk = history.get("risk") if isinstance(history.get("risk"), list) else []
    size = max(len(momentum), len(trend), len(sentiment), len(risk))
    if size < 2:
        return [{"period": "current", "caseType": case_type, "score": score}]
    rows: list[dict[str, Any]] = []
    for index in range(max(0, size - 6), size):
        m = _num(momentum[index]) if index < len(momentum) else 50
        t = _num(trend[index]) if index < len(trend) else 50
        s = _num(sentiment[index]) if index < len(sentiment) else 50
        r = _num(risk[index]) if index < len(risk) else 50
        point = int(round(_clamp((m or 50) * 0.3 + (t or 50) * 0.25 + (s or 50) * 0.2 + (100 - (r or 50)) * 0.25)))
        rows.append(
            {
                "period": f"T-{size - index - 1}" if index < size - 1 else "current",
                "caseType": "BUY" if point >= 64 else ("SELL" if point <= 38 else "HOLD"),
                "score": point,
            }
        )
    return rows


def _frontend_payload(
    symbol: str,
    *,
    source_contexts: dict[str, dict[str, Any]],
    technical: dict[str, Any],
    analyst_consensus: dict[str, Any],
    analyst_targets: dict[str, Any],
    news_sentiment: dict[str, Any],
    macro_context: dict[str, Any],
    sector_context: dict[str, Any],
    sizing_context: dict[str, Any],
    fit_inputs: dict[str, Any],
    executive_brief: list[str],
    catalysts: dict[str, list[dict[str, Any]]],
    moat: dict[str, Any],
    institutional_view: dict[str, Any],
    news_impact: dict[str, Any],
    position: dict[str, Any] | None,
) -> dict[str, Any]:
    source_status = _source_status_map(source_contexts)
    current_price = _num(technical.get("currentPrice"))
    expected_return = _num(technical.get("expectedReturnPct"))
    risk = _num(technical.get("riskScore"))
    verdict_weighting = build_verdict_weighting_v2(
        source_contexts=source_contexts,
        technical=technical,
        analyst_consensus=analyst_consensus,
        analyst_targets=analyst_targets,
        news_impact=news_impact,
        macro_context=macro_context,
        catalysts=catalysts,
        moat=moat,
        fit_inputs=fit_inputs,
    )
    composite = _clamp(float(verdict_weighting.get("compositeScore") or 50))
    adjusted_expected_return = expected_return
    if adjusted_expected_return is not None:
        adjusted_expected_return += float(verdict_weighting.get("expectedReturnAdjustmentPct") or 0)
    owned = bool(position)
    ai_verdict, case_type = _case_from_score(composite, risk, adjusted_expected_return, owned, sizing_context.get("suggestedAction"))
    conviction = int(round(_clamp(composite * 0.72 + ((_context_coverage(source_contexts).get("coveragePercent") or 0) * 0.28))))
    driver_scorecard = _driver_scorecard(technical, analyst_consensus, fit_inputs)
    evidence = _evidence_items(symbol, technical, analyst_targets, news_sentiment, sector_context)
    scenario_outlook = _scenario_outlook(current_price, adjusted_expected_return, risk, news_impact)
    risk_payload = {
        "score": int(round(risk)) if risk is not None else None,
        "level": _risk_label(risk),
        "source": "technicalIndicators" if risk is not None else "missing",
        "isPlaceholder": risk is None,
        "lastUpdated": _last_updated(source_contexts, ["technicalIndicators"]) if risk is not None else None,
    }
    ai_summary = (
        f"{symbol} is a {case_type} setup with {round(adjusted_expected_return, 1)}% expected return and {_risk_label(risk).lower()} risk."
        if adjusted_expected_return is not None
        else f"{symbol} is a {case_type} setup based on available technical, analyst, macro and portfolio context."
    )
    payload: dict[str, Any] = {
        "type": "AIIntelligenceFrontendPayload",
        "schemaVersion": FRONTEND_CONTRACT_SCHEMA_VERSION,
        "symbol": symbol,
        "aiVerdict": ai_verdict,
        "caseType": case_type,
        "expectedReturn": {
            "pct": round(adjusted_expected_return, 2) if adjusted_expected_return is not None else None,
            "sourceSection": "analystTargets",
            "basePct": round(expected_return, 2) if expected_return is not None else None,
            "eventAdjustmentPct": verdict_weighting.get("expectedReturnAdjustmentPct"),
        },
        "conviction": conviction,
        "risk": risk_payload,
        "aiSummary": ai_summary,
        "executiveBrief": executive_brief,
        "catalysts": catalysts,
        "moat": moat,
        "institutionalView": institutional_view,
        "newsImpact": news_impact,
        "verdictWeighting": verdict_weighting,
        "driverScorecard": driver_scorecard,
        "evidence": evidence,
        "scenarioOutlook": scenario_outlook,
        "bullCase": [
            "Momentum and trend continue to confirm the setup.",
            "Analyst target support remains constructive.",
            "Macro regime remains supportive for risk exposure.",
        ],
        "bearCase": [
            "Risk rises faster than expected return improves.",
            "Earnings or news flow weakens the thesis.",
            "Sector or portfolio concentration limits actionability.",
        ],
        "whatCouldChangeThisView": [
            "A material change in analyst targets or consensus.",
            "A break in trend, momentum, or relative strength.",
            "A change in macro risk mode or portfolio concentration.",
        ],
        "analystConsensus": analyst_consensus,
        "verdictHistory": _verdict_history(technical, case_type, int(round(composite))),
        "methodology": {
            "name": "PIA rules-based AI Intelligence V2.5",
            "version": FRONTEND_CONTRACT_SCHEMA_VERSION,
            "summary": "Combines cached fundamentals, analyst data, technicals, momentum, material news, macro, catalysts and portfolio fit. This is not financial advice.",
            "compactUsesCachedSummary": True,
            "expandedHydration": "Expanded views can hydrate sourceContexts and engineInputs after the compact contract renders.",
        },
        "sourceStatus": source_status,
    }
    if owned:
        payload["portfolioFit"] = fit_inputs
        payload["portfolioImpact"] = {
            "currentWeightPct": sizing_context.get("currentWeightPct"),
            "sectorWeightPct": sizing_context.get("sectorWeightPct"),
            "suggestedMaxAddPct": sizing_context.get("suggestedMaxAddPct"),
            "suggestedMaxAddValue": sizing_context.get("suggestedMaxAddValue"),
        }
        payload["portfolioAssessment"] = {
            "isHeld": True,
            "sizingBand": sizing_context.get("sizingBand"),
            "suggestedAction": sizing_context.get("suggestedAction"),
            "constraints": fit_inputs.get("constraints"),
        }
        payload["recommendedAction"] = sizing_context.get("suggestedAction")
    return _clean_json(payload)


def _missing_report(source_contexts: dict[str, dict[str, Any]]) -> dict[str, Any]:
    missing = [row for row in source_contexts.values() if row["status"] == STATUS_MISSING]
    partial = [row for row in source_contexts.values() if row["status"] == STATUS_PARTIAL]
    unavailable_fields = {
        row["id"]: row["missingFields"]
        for row in source_contexts.values()
        if row.get("missingFields")
    }
    return {
        "payloadComplete": all(source_id in source_contexts for source_id in REQUIRED_SOURCE_IDS),
        "dataComplete": not missing and not partial,
        "missingRequiredSourceCount": len(missing),
        "partialRequiredSourceCount": len(partial),
        "missingRequiredSources": [{"id": row["id"], "label": row["label"]} for row in missing],
        "partialRequiredSources": [{"id": row["id"], "label": row["label"]} for row in partial],
        "missingFieldsBySource": unavailable_fields,
        "blocking": [],
        "rule": "All 14 context sections are always present. Provider gaps are reported here and reduce confidence; they do not block payload creation.",
    }


def _context_coverage(source_contexts: dict[str, dict[str, Any]]) -> dict[str, Any]:
    counts = {STATUS_AVAILABLE: 0, STATUS_PARTIAL: 0, STATUS_MISSING: 0}
    for row in source_contexts.values():
        counts[row["status"]] = counts.get(row["status"], 0) + 1
    available_equivalent = counts[STATUS_AVAILABLE] + counts[STATUS_PARTIAL] * 0.5
    total = max(len(source_contexts), 1)
    return {
        "coveragePercent": round(available_equivalent / total * 100, 1),
        "sourceCount": len(source_contexts),
        "statusCounts": counts,
    }


def build_ai_intelligence_context(
    symbol: str,
    *,
    settings: dict[str, Any] | None = None,
    portfolio: dict[str, Any] | None = None,
    macro: dict[str, Any] | None = None,
    calendar: list[dict[str, Any]] | None = None,
    watchlist: list[dict[str, Any]] | None = None,
    provider_status: dict[str, Any] | None = None,
    refresh: bool = False,
    debug: bool = False,
) -> dict[str, Any]:
    start = time.perf_counter()
    clean = _clean_symbol(symbol)
    context_cache_key = f"context:{clean}"
    cached_context = _CONTEXT_CACHE.get(context_cache_key)
    if not debug and not refresh and cached_context and _cache_entry_valid(cached_context[0], CACHE_POLICY_SECONDS["context"]):
        record_stage("Fundamentals Provider", 0)
        record_stage("Analyst Provider", 0)
        record_stage("AI Scoring Engine", 0)
        return _apply_context_cache_hit(cached_context[1], start)

    macro_result = _cached_value("macro", "global", CACHE_POLICY_SECONDS["macro"], "PIA macro snapshot", macro or {}, refresh=refresh)
    portfolio_result = _cached_value("portfolio", "global", CACHE_POLICY_SECONDS["portfolio"], "PIA portfolio provider", portfolio or {}, refresh=refresh)
    watchlist_result = _cached_value("watchlist", "global", CACHE_POLICY_SECONDS["watchlist"], "PIA watchlist state", watchlist or [], refresh=refresh)
    macro = macro_result["data"] or {}
    portfolio = portfolio_result["data"] or {}
    watchlist = watchlist_result["data"] or []
    position = _find_position(portfolio, clean)
    watch = _find_watch(watchlist, clean, macro)

    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {
            "fundamentals": executor.submit(
                _cached_call,
                "fundamentals",
                clean,
                CACHE_POLICY_SECONDS["fundamentals"],
                "Yahoo Finance",
                lambda ticker: yahoo_fundamentals(ticker, refresh=refresh, wait_timeout_seconds=0.55),
                clean,
                refresh=refresh,
                fallback={},
            ),
            "rawNews": executor.submit(
                _cached_call,
                "rawNews",
                clean,
                CACHE_POLICY_SECONDS["news"],
                "Yahoo RSS",
                yahoo_news,
                clean,
                refresh=refresh,
                fallback=[],
            ),
            "newsIntelligence": executor.submit(
                _cached_call,
                "newsIntelligence",
                clean,
                CACHE_POLICY_SECONDS["news"],
                "PIA News Intelligence",
                get_ticker_news_intelligence,
                clean,
                refresh=refresh,
                fallback={"items": [], "unavailable": True},
            ),
            "aiSignal": executor.submit(
                _cached_call,
                "aiSignal",
                clean,
                CACHE_POLICY_SECONDS["technical"],
                "PIA AI signal engine",
                lambda ticker: build_ai_intelligence_bounded(ticker, refresh=refresh),
                clean,
                refresh=refresh,
                fallback={},
            ),
        }
        fetched = {name: future.result() for name, future in futures.items()}
    record_stage("Fundamentals Provider", fetched["fundamentals"]["timingMs"])
    record_stage("AI Scoring Engine", fetched["aiSignal"]["timingMs"])
    fetched["macro"] = macro_result
    fetched["portfolio"] = portfolio_result
    fetched["watchlist"] = watchlist_result
    news_meta = dict((fetched["newsIntelligence"].get("metadata") or {}))
    if (fetched["rawNews"].get("metadata") or {}).get("cacheStatus") == "fresh":
        news_meta["cacheStatus"] = "fresh"

    ai_signal = fetched["aiSignal"]["data"] or {}
    raw_fundamentals = fetched["fundamentals"]["data"] or {}
    raw_news = fetched["rawNews"]["data"] or []
    news_intelligence = fetched["newsIntelligence"]["data"] or {}
    fundamentals = _merge_fundamentals(clean, raw_fundamentals, ai_signal, position, watch)
    mock = get_mock_intelligence(clean)
    profile = _company_profile(clean, fundamentals, mock, position, watch)
    if profile.get("sector"):
        fundamentals.setdefault("sector", profile.get("sector"))
    if profile.get("industry"):
        fundamentals.setdefault("industry", profile.get("industry"))

    with time_stage("Analyst Provider"):
        analyst_consensus = _analyst_consensus(fundamentals)
        analyst_targets = _analyst_targets(fundamentals)
    earnings_history = _earnings_history(fundamentals)
    earnings_calendar = _earnings_calendar(clean, fundamentals, calendar)
    technical = _technical_indicators(fundamentals, ai_signal, position, watch)
    news_sentiment = _news_sentiment(raw_news, news_intelligence, ai_signal)
    macro_context = _macro_environment(macro)
    sector_context = _sector_comparison(clean, profile, portfolio, watchlist)
    competitor_context = _competitor_comparison(clean, {**profile, "peers": fundamentals.get("peerSymbols")}, portfolio, watchlist)
    portfolio_context = _portfolio_context(portfolio, position)
    watch_context = _watchlist_context(clean, watch, watchlist)
    sizing_context = _position_sizing_context(profile, technical, portfolio, position, watch, sector_context, macro)
    fit_inputs = _portfolio_fit_inputs(profile, technical, sector_context, sizing_context, position, watch)
    news_impact = build_news_impact(news_sentiment)
    moat = build_moat_engine(clean, profile, fundamentals)
    catalysts = build_catalyst_engine(
        clean,
        profile=profile,
        fundamentals=fundamentals,
        analyst_consensus=analyst_consensus,
        analyst_targets=analyst_targets,
        earnings_history=earnings_history,
        earnings_calendar=earnings_calendar,
        technical=technical,
        news_sentiment=news_sentiment,
        news_impact=news_impact,
        macro_context=macro_context,
        calendar=calendar,
        sizing_context=sizing_context,
    )
    institutional_view = build_institutional_view(
        clean,
        moat=moat,
        catalysts=catalysts,
        analyst_consensus=analyst_consensus,
        analyst_targets=analyst_targets,
        technical=technical,
        news_impact=news_impact,
        sizing_context=sizing_context,
    )
    executive_brief = build_executive_brief(
        clean,
        analyst_targets=analyst_targets,
        catalysts=catalysts,
        moat=moat,
        news_impact=news_impact,
        technical=technical,
        sizing_context=sizing_context,
    )

    source_contexts = {
        "companyFundamentals": _source_section(
            "companyFundamentals",
            "Company Fundamentals",
            {"company": profile, "market": _compact({
                "price": fundamentals.get("price"),
                "marketCap": _first(fundamentals.get("market_cap"), fundamentals.get("marketCap")),
                "pe": _first(fundamentals.get("pe"), fundamentals.get("trailingPE")),
                "eps": _first(fundamentals.get("eps"), fundamentals.get("trailingEps")),
                "beta": fundamentals.get("beta"),
                "dividendYield": _first(fundamentals.get("dividend_yield"), fundamentals.get("dividendYield")),
                "volume": _first(fundamentals.get("volume"), fundamentals.get("regularMarketVolume")),
                "averageVolume": _first(fundamentals.get("avg_volume"), fundamentals.get("averageVolume")),
            })},
            ["company.name", "company.sector", "market.price"],
            source="Yahoo Finance / PIA fallback catalog",
            timing_ms=fetched["fundamentals"]["timingMs"],
            freshness_meta=fetched["fundamentals"].get("metadata"),
            ttl_seconds=CACHE_POLICY_SECONDS["fundamentals"],
            provider="Yahoo Finance",
            errors=[fetched["fundamentals"]["error"]],
        ),
        "analystConsensus": _source_section(
            "analystConsensus",
            "Analyst Consensus",
            analyst_consensus,
            ["consensusVerdict", "analystCount"],
            source="Yahoo Finance recommendation trend / PIA fallback",
            timing_ms=fetched["fundamentals"]["timingMs"],
            freshness_meta=fetched["fundamentals"].get("metadata"),
            ttl_seconds=CACHE_POLICY_SECONDS["analyst"],
            provider="Yahoo Finance",
        ),
        "analystTargets": _source_section(
            "analystTargets",
            "Analyst Targets",
            analyst_targets,
            ["currentPrice", "averageTarget", "highTarget", "lowTarget"],
            source="Yahoo Finance analyst targets / PIA fallback",
            timing_ms=fetched["fundamentals"]["timingMs"],
            freshness_meta=fetched["fundamentals"].get("metadata"),
            ttl_seconds=CACHE_POLICY_SECONDS["analyst"],
            provider="Yahoo Finance",
        ),
        "earningsHistory": _source_section(
            "earningsHistory",
            "Earnings History",
            earnings_history,
            ["latest.reportedEps", "latest.epsEstimate"],
            source="Yahoo Finance / PIA fallback",
            timing_ms=fetched["fundamentals"]["timingMs"],
            freshness_meta=fetched["fundamentals"].get("metadata"),
            ttl_seconds=CACHE_POLICY_SECONDS["earnings"],
            provider="Yahoo Finance",
        ),
        "earningsCalendar": _source_section(
            "earningsCalendar",
            "Earnings Calendar",
            earnings_calendar,
            ["nextEarningsDate"],
            source="Portfolio calendar / Yahoo Finance / PIA fallback",
            timing_ms=0,
            freshness_meta=fetched["fundamentals"].get("metadata"),
            ttl_seconds=CACHE_POLICY_SECONDS["earnings"],
            provider="Yahoo Finance",
        ),
        "technicalIndicators": _source_section(
            "technicalIndicators",
            "Technical Indicators",
            technical,
            ["currentPrice", "momentumScore", "trendScore", "riskScore"],
            source="AI signal engine / Yahoo chart / portfolio context",
            timing_ms=fetched["aiSignal"]["timingMs"],
            freshness_meta=fetched["aiSignal"].get("metadata"),
            ttl_seconds=CACHE_POLICY_SECONDS["technical"],
            provider="PIA AI signal engine",
            errors=[fetched["aiSignal"]["error"]],
        ),
        "newsSentiment": _source_section(
            "newsSentiment",
            "News Sentiment",
            news_sentiment,
            ["sentimentScore", "items"],
            source="Yahoo RSS / News Intelligence",
            timing_ms=fetched["newsIntelligence"]["timingMs"] + fetched["rawNews"]["timingMs"],
            freshness_meta=news_meta,
            ttl_seconds=CACHE_POLICY_SECONDS["news"],
            provider="Yahoo RSS / PIA News Intelligence",
            errors=[fetched["newsIntelligence"]["error"], fetched["rawNews"]["error"]],
        ),
        "macroEnvironment": _source_section(
            "macroEnvironment",
            "Macro Environment",
            macro_context,
            ["vix", "us10y", "riskMode"],
            source="PIA macro snapshot",
            timing_ms=0,
            freshness_meta=fetched["macro"].get("metadata"),
            ttl_seconds=CACHE_POLICY_SECONDS["macro"],
            provider="PIA macro snapshot",
        ),
        "sectorComparison": _source_section(
            "sectorComparison",
            "Sector Comparison",
            sector_context,
            ["sector", "portfolioSectorWeightPct"],
            source="Portfolio exposures / PIA sector catalog",
            timing_ms=0,
            freshness_meta=fetched["portfolio"].get("metadata"),
            ttl_seconds=CACHE_POLICY_SECONDS["portfolio"],
            provider="PIA portfolio provider / PIA sector catalog",
        ),
        "competitorComparison": _source_section(
            "competitorComparison",
            "Competitor Comparison",
            competitor_context,
            ["peers"],
            source="PIA peer catalog / portfolio / watchlist",
            timing_ms=0,
            freshness_meta=fetched["watchlist"].get("metadata"),
            ttl_seconds=CACHE_POLICY_SECONDS["watchlist"],
            provider="PIA peer catalog / watchlist",
        ),
        "portfolioContext": _source_section(
            "portfolioContext",
            "Portfolio Context",
            portfolio_context,
            ["totalValue", "positionCount", "exposures"],
            source="PIA portfolio provider",
            timing_ms=0,
            freshness_meta=fetched["portfolio"].get("metadata"),
            ttl_seconds=CACHE_POLICY_SECONDS["portfolio"],
            provider="PIA portfolio provider",
        ),
        "watchlistContext": _source_section(
            "watchlistContext",
            "Watchlist Context",
            watch_context,
            ["isWatchlisted"],
            source="PIA watchlist state",
            timing_ms=0,
            freshness_meta=fetched["watchlist"].get("metadata"),
            ttl_seconds=CACHE_POLICY_SECONDS["watchlist"],
            provider="PIA watchlist state",
        ),
        "positionSizingContext": _source_section(
            "positionSizingContext",
            "Position Sizing Context",
            sizing_context,
            ["currentPrice", "portfolioValue", "currentWeightPct", "suggestedMaxAddValue"],
            source="PIA sizing rules",
            timing_ms=0,
            freshness_meta=fetched["portfolio"].get("metadata"),
            ttl_seconds=CACHE_POLICY_SECONDS["portfolio"],
            provider="PIA sizing rules",
        ),
        "portfolioFitInputs": _source_section(
            "portfolioFitInputs",
            "Portfolio Fit Inputs",
            fit_inputs,
            ["candidateSector", "currentPrice", "portfolioFitScore", "constraints.suggestedAction"],
            source="PIA portfolio fit input adapter",
            timing_ms=0,
            freshness_meta=fetched["portfolio"].get("metadata"),
            ttl_seconds=CACHE_POLICY_SECONDS["portfolio"],
            provider="PIA portfolio fit input adapter",
        ),
    }
    source_status = _source_status_map(source_contexts)
    frontend_payload = _frontend_payload(
        clean,
        source_contexts=source_contexts,
        technical=technical,
        analyst_consensus=analyst_consensus,
        analyst_targets=analyst_targets,
        news_sentiment=news_sentiment,
        macro_context=macro_context,
        sector_context=sector_context,
        sizing_context=sizing_context,
        fit_inputs=fit_inputs,
        executive_brief=executive_brief,
        catalysts=catalysts,
        moat=moat,
        institutional_view=institutional_view,
        news_impact=news_impact,
        position=position,
    )

    registry_statuses, registry_payloads = SourceRegistry(settings).evaluate(
        symbol=clean,
        portfolio=portfolio,
        position=position,
        watch=watch,
        macro=macro,
        calendar=calendar,
        fundamentals=fundamentals,
        news=raw_news,
        news_intelligence=news_intelligence,
        provider_status=provider_status,
    )
    registry_status_map = {row.definition.id: row.status for row in registry_statuses}
    registry_coverage = summarize_sources(registry_statuses)

    score_args = {
        "portfolio": portfolio,
        "position": position,
        "watch": watch,
        "macro": macro,
        "calendar": calendar,
        "fundamentals": fundamentals,
        "news": raw_news,
        "news_intelligence": news_intelligence,
        "provider_status": provider_status,
    }
    recommendation_inputs = _recommendation_engine_inputs(clean, position, watch, macro, technical, sizing_context, fit_inputs)
    missing_report = _missing_report(source_contexts)
    context = {
        "type": "AIIntelligenceContext",
        "schemaVersion": AI_CONTEXT_SCHEMA_VERSION,
        "symbol": clean,
        "asOf": _now_iso(),
        "payloadComplete": missing_report["payloadComplete"],
        "dataComplete": missing_report["dataComplete"],
        "requiredSources": REQUIRED_CONTEXT_SOURCES,
        "sourceContexts": source_contexts,
        "sourceStatus": source_status,
        "frontendPayload": frontend_payload,
        "coverage": _context_coverage(source_contexts),
        "sourceRegistry": {
            "coverage": registry_coverage,
            "sourceAvailability": registry_status_map,
        },
        "engineInputs": {
            "verdictEngine": {
                "sourceRegistryPayloads": registry_payloads,
                "sourceAvailability": registry_status_map,
                "coverage": registry_coverage,
                "scoreArgs": score_args,
            },
            "portfolioFitEngine": fit_inputs,
            "recommendationEngine": recommendation_inputs,
            "intelligenceEngineV25": {
                "executiveBrief": executive_brief,
                "catalysts": catalysts,
                "moat": moat,
                "institutionalView": institutional_view,
                "newsImpact": news_impact,
            },
        },
        "uiHydration": {
            "compact": {
                "uses": "frontendPayload",
                "targetPerceivedMs": 1000,
                "cachePolicy": "Served from very-short context cache or cached source bundle.",
            },
            "expanded": {
                "uses": ["frontendPayload", "sourceContexts"],
                "targetInitialRenderMs": 1500,
                "progressiveSections": ["sourceContexts", "engineInputs.verdictEngine.sourceRegistryPayloads", "engineInputs.portfolioFitEngine"],
            },
        },
        "performance": {
            "totalMs": _elapsed_ms(start),
            "fetchTimingsMs": {
                "fundamentals": fetched["fundamentals"]["timingMs"],
                "rawNews": fetched["rawNews"]["timingMs"],
                "newsIntelligence": fetched["newsIntelligence"]["timingMs"],
                "aiSignal": fetched["aiSignal"]["timingMs"],
            },
            "cacheStatus": "fresh",
            "sourceCacheStatus": {
                "fundamentals": (fetched["fundamentals"].get("metadata") or {}).get("cacheStatus"),
                "analyst": (fetched["fundamentals"].get("metadata") or {}).get("cacheStatus"),
                "earnings": (fetched["fundamentals"].get("metadata") or {}).get("cacheStatus"),
                "technical": (fetched["aiSignal"].get("metadata") or {}).get("cacheStatus"),
                "news": news_meta.get("cacheStatus"),
                "macro": (fetched["macro"].get("metadata") or {}).get("cacheStatus"),
                "portfolio": (fetched["portfolio"].get("metadata") or {}).get("cacheStatus"),
                "watchlist": (fetched["watchlist"].get("metadata") or {}).get("cacheStatus"),
            },
            "upstreamAiSignalCacheStatus": ai_signal.get("cache_status"),
        },
        "missingDataReport": missing_report,
    }
    if debug:
        context["debug"] = {
            "rawFundamentals": raw_fundamentals,
            "aiSignal": ai_signal,
            "newsIntelligence": news_intelligence,
            "rawNews": raw_news,
        }
    context = _clean_json(context)
    if not debug:
        _CONTEXT_CACHE[context_cache_key] = (time.time(), deepcopy(context))
    return context


def context_score_kwargs(context: dict[str, Any]) -> dict[str, Any]:
    args = (((context.get("engineInputs") or {}).get("verdictEngine") or {}).get("scoreArgs") or {})
    allowed = {
        "portfolio",
        "position",
        "watch",
        "macro",
        "calendar",
        "fundamentals",
        "news",
        "news_intelligence",
        "provider_status",
    }
    return {key: deepcopy(value) for key, value in args.items() if key in allowed}


def build_ai_intelligence_context_batch(
    symbols: list[str],
    *,
    settings: dict[str, Any] | None = None,
    portfolio: dict[str, Any] | None = None,
    macro: dict[str, Any] | None = None,
    calendar: list[dict[str, Any]] | None = None,
    watchlist: list[dict[str, Any]] | None = None,
    provider_status: dict[str, Any] | None = None,
    refresh: bool = False,
    debug: bool = False,
) -> dict[str, Any]:
    start = time.perf_counter()
    cleaned = list(dict.fromkeys(_clean_symbol(symbol) for symbol in symbols if _clean_symbol(symbol)))[:25]
    contexts = [
        build_ai_intelligence_context(
            symbol,
            settings=settings,
            portfolio=portfolio,
            macro=macro,
            calendar=calendar,
            watchlist=watchlist,
            provider_status=provider_status,
            refresh=refresh,
            debug=debug,
        )
        for symbol in cleaned
    ]
    missing_by_symbol = {
        context["symbol"]: context.get("missingDataReport", {})
        for context in contexts
        if (context.get("missingDataReport") or {}).get("missingRequiredSourceCount")
        or (context.get("missingDataReport") or {}).get("partialRequiredSourceCount")
    }
    return {
        "type": "AIIntelligenceContextBatch",
        "schemaVersion": AI_CONTEXT_SCHEMA_VERSION,
        "symbols": cleaned,
        "count": len(contexts),
        "asOf": _now_iso(),
        "payloadComplete": all(context.get("payloadComplete") for context in contexts),
        "dataComplete": all(context.get("dataComplete") for context in contexts),
        "contexts": contexts,
        "frontendPayloads": {context["symbol"]: context.get("frontendPayload") for context in contexts},
        "performance": {
            "totalMs": _elapsed_ms(start),
            "perSymbolMs": {context["symbol"]: (context.get("performance") or {}).get("totalMs") for context in contexts},
        },
        "missingDataReport": {
            "symbolsWithMissingOrPartialData": list(missing_by_symbol.keys()),
            "bySymbol": missing_by_symbol,
        },
    }
