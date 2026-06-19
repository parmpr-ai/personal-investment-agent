from __future__ import annotations

import time
from copy import deepcopy
from typing import Any

from services.ai_data_sources import STATUS_AVAILABLE, STATUS_DISABLED, STATUS_MISSING, STATUS_PARTIAL
from services.ai_intelligence_v25 import V25_VERDICT_WEIGHTS, build_news_impact
from services.source_registry import SourceRegistry


DEFAULT_HORIZON = "6-12M"
SCORE_CACHE_TTL_SECONDS = 5 * 60

FACTOR_WEIGHTS = dict(V25_VERDICT_WEIGHTS)

_SCORE_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}


def _now() -> float:
    return time.time()


def _elapsed_ms(start: float) -> int:
    return max(0, int((time.perf_counter() - start) * 1000))


def _clean_symbol(symbol: str) -> str:
    return str(symbol or "").strip().split()[0].upper()


def _clamp(value: float, low: float = 0, high: float = 100) -> float:
    return max(low, min(high, value))


def _int(value: float) -> int:
    return int(round(value))


def _num(value: Any) -> float | None:
    try:
        if value in (None, ""):
            return None
        parsed = float(value)
        return parsed if parsed == parsed else None
    except (TypeError, ValueError):
        return None


def _pct(target: float | None, base: float | None) -> float | None:
    if target is None or base in (None, 0):
        return None
    return (target / base - 1) * 100


def _first(*values: Any) -> Any:
    for value in values:
        if value not in (None, "", [], {}):
            return value
    return None


def _status_multiplier(status: str) -> float:
    if status == STATUS_AVAILABLE:
        return 1.0
    if status == STATUS_PARTIAL:
        return 0.55
    return 0.0


def _combined_status(*statuses: str | None) -> str:
    usable = [status for status in statuses if status and status != STATUS_DISABLED]
    if not usable:
        return STATUS_MISSING
    if all(status == STATUS_AVAILABLE for status in usable):
        return STATUS_AVAILABLE
    if any(status == STATUS_AVAILABLE for status in usable) or any(status == STATUS_PARTIAL for status in usable):
        return STATUS_PARTIAL
    return STATUS_MISSING


def _direction(value: float) -> str:
    if value > 0:
        return "positive"
    if value < 0:
        return "negative"
    return "neutral"


def _strength(value: float, weight: float) -> str:
    ratio = abs(value) / max(weight, 1)
    if ratio >= 0.7:
        return "strong"
    if ratio >= 0.35:
        return "moderate"
    return "light"


def _sentiment_score(text: str) -> int:
    text = text.lower()
    positive = ("beat", "raise", "upgrade", "growth", "strong", "surge", "record", "win", "bullish", "accelerat")
    negative = ("miss", "cut", "downgrade", "weak", "lawsuit", "probe", "drop", "fall", "bearish", "slowdown")
    score = 0
    for word in positive:
        if word in text:
            score += 1
    for word in negative:
        if word in text:
            score -= 1
    return max(-3, min(3, score))


def _cache_key(symbol: str, strategy: str, portfolio: dict[str, Any] | None) -> str:
    mode = _first((portfolio or {}).get("configured_mode"), (portfolio or {}).get("active_source"), (portfolio or {}).get("source"), "unknown")
    return f"{_clean_symbol(symbol)}:{strategy or 'long_term'}:{mode}"


def _cache_get(key: str) -> dict[str, Any] | None:
    row = _SCORE_CACHE.get(key)
    if not row:
        return None
    saved_at, payload = row
    if _now() - saved_at > SCORE_CACHE_TTL_SECONDS:
        _SCORE_CACHE.pop(key, None)
        return None
    cached = deepcopy(payload)
    cached.setdefault("performance", {})["cacheStatus"] = "hit"
    return cached


def _cache_set(key: str, payload: dict[str, Any]) -> None:
    _SCORE_CACHE[key] = (_now(), deepcopy(payload))


def _find_position(portfolio: dict[str, Any] | None, symbol: str) -> dict[str, Any] | None:
    for position in (portfolio or {}).get("positions", []) or []:
        raw_symbol = str(position.get("symbol") or "").split()[0].upper()
        underlying = str(position.get("underlying") or "").upper()
        if raw_symbol == symbol or underlying == symbol:
            return position
    return None


def _seed_fundamentals(symbol: str, position: dict[str, Any] | None, watch: dict[str, Any] | None, fundamentals: dict[str, Any] | None) -> dict[str, Any]:
    seeded = dict(fundamentals or {})
    source = position or watch or {}
    price = _first(seeded.get("price"), seeded.get("regularMarketPrice"), seeded.get("last"), source.get("last"), source.get("price"))
    if price is not None:
        seeded.setdefault("price", price)
        seeded.setdefault("regularMarketPrice", price)
        seeded.setdefault("last", price)
    seeded.setdefault("ticker", symbol)
    if source.get("name"):
        seeded.setdefault("name", source.get("name"))
    if source.get("currency"):
        seeded.setdefault("currency", source.get("currency"))
    if price is not None:
        seeded.setdefault("status", "context")
    return seeded


def _factor(
    factor_id: str,
    label: str,
    contribution: float,
    summary: str,
    status: str,
    *,
    source_id: str | None = None,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    weight = FACTOR_WEIGHTS[factor_id]
    contribution = round(max(-weight, min(weight, contribution)), 2)
    return {
        "id": factor_id,
        "sourceId": source_id or factor_id,
        "label": label,
        "weight": weight,
        "contribution": contribution,
        "impact": contribution,
        "direction": _direction(contribution),
        "strength": _strength(contribution, weight),
        "summary": summary,
        "status": status,
        "confidenceImpact": 0 if status == STATUS_AVAILABLE else (-weight if status == STATUS_MISSING else -round(weight * 0.45, 2)),
        "details": details or {},
    }


def _score_fundamentals(data: dict[str, Any], status: str) -> dict[str, Any]:
    weight = FACTOR_WEIGHTS["fundamentals"]
    multiplier = _status_multiplier(status)
    eps = _num(data.get("eps"))
    beta = _num(data.get("beta"))
    market_cap = _num(data.get("market_cap"))
    score = 0.0
    if eps is not None:
        score += 4 if eps > 0 else -4
    if market_cap is not None:
        score += 2 if market_cap > 20_000_000_000 else 0.5
    if beta is not None:
        if beta <= 1.2:
            score += 2
        elif beta > 2:
            score -= 3
    if data.get("price") is not None:
        score += 2
    score *= multiplier
    summary = "Company fundamentals provide usable support for the thesis." if score >= 0 else "Fundamental inputs point to elevated business or balance-sheet risk."
    if status == STATUS_MISSING:
        summary = "Company fundamentals are limited, so this factor does not drive the verdict."
    return _factor("fundamentals", "Fundamentals", score, summary, status)


def _score_earnings(data: dict[str, Any], status: str) -> dict[str, Any]:
    score = 0.0
    events = data.get("calendar_events") or []
    reported = _num(data.get("reported_eps"))
    estimate = _num(data.get("eps_estimate"))
    if reported is not None and estimate not in (None, 0):
        surprise = (reported / estimate - 1) * 100
        score += max(-8, min(8, surprise / 2))
    elif events:
        score += 2
    score *= _status_multiplier(status)
    summary = "Earnings or catalyst calendar inputs support continued thesis evaluation."
    if score > 4:
        summary = "Earnings evidence is constructive and supports the bull case."
    elif score < -3:
        summary = "Earnings evidence is pressuring the thesis."
    elif status == STATUS_MISSING:
        summary = "Earnings and guidance inputs are not available, so confidence is reduced."
    return _factor("earningsGuidance", "Earnings Guidance", score, summary, status, source_id="earnings")


def _score_valuation(data: dict[str, Any], status: str) -> dict[str, Any]:
    pe = _num(data.get("pe"))
    upside = _num(data.get("analyst_upside_pct"))
    score = 0.0
    if pe is not None:
        if pe <= 0:
            score -= 4
        elif pe < 18:
            score += 5
        elif pe <= 40:
            score += 2
        elif pe <= 80:
            score -= 4
        else:
            score -= 8
    if upside is not None:
        score += max(-4, min(4, upside / 8))
    score *= _status_multiplier(status)
    summary = "Valuation is not the main constraint."
    if score >= 4:
        summary = "Valuation leaves room for upside versus available reference points."
    elif score <= -4:
        summary = "Valuation is stretched and reduces actionable conviction."
    elif status == STATUS_MISSING:
        summary = "Valuation data is incomplete, so this factor stays neutral."
    return _factor("valuation", "Valuation", score, summary, status)


def _score_analyst_targets(data: dict[str, Any], status: str) -> dict[str, Any]:
    current = _num(data.get("current_price"))
    average = _num(data.get("average_target"))
    upside = _pct(average, current)
    score = 0.0
    if upside is not None:
        if upside >= 25:
            score += 8
        elif upside >= 10:
            score += 5
        elif upside >= 0:
            score += 2
        elif upside <= -15:
            score -= 8
        else:
            score -= 3
    if _num(data.get("analyst_count")) is not None:
        score += 1
    score *= _status_multiplier(status)
    summary = "Analyst targets are supportive." if score > 0 else "Analyst target support is limited."
    if status == STATUS_MISSING:
        summary = "Analyst target data is unavailable and does not block the verdict."
    return _factor("analystTargets", "Analyst Targets", score, summary, status, source_id="analyst_targets", details={"upsidePct": round(upside, 2) if upside is not None else None})


def _score_analyst_revisions(data: dict[str, Any], status: str) -> dict[str, Any]:
    key = str(_first(data.get("recommendation_key"), data.get("average_analyst_rating"), "")).lower()
    mean = _num(data.get("recommendation_mean"))
    score = 0.0
    if "strong" in key and "buy" in key:
        score += 8
    elif "buy" in key or "outperform" in key:
        score += 5
    elif "hold" in key or "neutral" in key:
        score += 0
    elif "sell" in key or "underperform" in key:
        score -= 7
    if mean is not None:
        score += max(-3, min(3, (3 - mean) * 1.5))
    score *= _status_multiplier(status)
    summary = "Analyst revision tone is constructive." if score > 1 else "Analyst revision evidence is not strongly supportive."
    if status == STATUS_MISSING:
        summary = "Analyst revision data is missing, reducing confidence only."
    return _factor("analystRevisions", "Analyst Revisions", score, summary, status, source_id="analyst_revisions")


def _score_technical(data: dict[str, Any], status: str) -> dict[str, Any]:
    price = _num(data.get("price"))
    high = _num(data.get("fifty_two_week_high"))
    low = _num(data.get("fifty_two_week_low"))
    day_change = _num(data.get("day_change_pct"))
    spark = data.get("sparkline") if isinstance(data.get("sparkline"), list) else []
    score = 0.0
    if price is not None and high is not None and low is not None and high > low:
        range_pos = (price - low) / (high - low)
        score += (range_pos - 0.5) * 12
    if len(spark) >= 2:
        start = _num(spark[0])
        end = _num(spark[-1])
        trend = _pct(end, start)
        if trend is not None:
            score += max(-4, min(4, trend / 5))
    if day_change is not None:
        score += max(-3, min(3, day_change))
    score *= _status_multiplier(status)
    summary = "Technical trend is supportive." if score > 2 else "Technical trend is mixed."
    if score < -2:
        summary = "Technical trend is weakening and argues for patience."
    if status == STATUS_MISSING:
        summary = "Technical data is missing, so trend confirmation is limited."
    return _factor("technicalAnalysis", "Technical Analysis", score, summary, status, source_id="technical_analysis")


def _score_momentum(data: dict[str, Any], status: str) -> dict[str, Any]:
    raw = _num(data.get("momentum_score"))
    day_change = _num(data.get("day_change_pct"))
    score = 0.0
    if raw is not None:
        score += ((raw - 50) / 50) * FACTOR_WEIGHTS["momentum"]
    if day_change is not None:
        score += max(-2, min(2, day_change / 2))
    score *= _status_multiplier(status)
    summary = "Momentum is constructive." if score > 1 else "Momentum is not yet decisive."
    if score < -1:
        summary = "Momentum is deteriorating."
    if status == STATUS_MISSING:
        summary = "Momentum inputs are unavailable, so this factor stays neutral."
    return _factor("momentum", "Momentum", score, summary, status)


def _score_volume(data: dict[str, Any], status: str, momentum_data: dict[str, Any]) -> dict[str, Any]:
    current = _num(data.get("current_volume"))
    average = _num(data.get("average_volume"))
    day_change = _num(momentum_data.get("day_change_pct"))
    score = 0.0
    if current is not None and average not in (None, 0):
        ratio = current / average
        if ratio >= 1.5:
            score += 3 if (day_change or 0) >= 0 else -3
        elif ratio >= 1:
            score += 1
        elif ratio < 0.5:
            score -= 1
    score *= _status_multiplier(status)
    summary = "Volume confirms the move." if score > 0 else "Volume confirmation is limited."
    if status == STATUS_MISSING:
        summary = "Volume data is unavailable."
    return _factor("volume", "Volume", score, summary, status)


def _score_news(data: dict[str, Any], status: str) -> dict[str, Any]:
    items = data.get("items") or []
    titles = [str(item.get("title") or item.get("summary") or "") for item in items[:8] if isinstance(item, dict)]
    raw = sum(_sentiment_score(title) for title in titles)
    score = max(-FACTOR_WEIGHTS["news"], min(FACTOR_WEIGHTS["news"], raw * 1.5))
    score *= _status_multiplier(status)
    summary = "Recent headlines are supportive." if score > 1 else "Recent headline tone is mixed."
    if score < -1:
        summary = "Recent headlines create risk for the thesis."
    if status == STATUS_MISSING:
        summary = "Ticker news is unavailable, reducing confidence only."
    return _factor("news", "News", score, summary, status)


def _score_macro(data: dict[str, Any], status: str) -> dict[str, Any]:
    vix = _num(data.get("vix"))
    us10y = _num(data.get("us10y"))
    risk_mode = str(data.get("risk_mode") or "").lower()
    score = 0.0
    if "buy" in risk_mode:
        score += 2
    if "risk" in risk_mode and "off" in risk_mode:
        score -= 3
    if vix is not None:
        if vix < 18:
            score += 2
        elif vix > 25:
            score -= 4
    if us10y is not None and us10y > 4.5:
        score -= 2
    score *= _status_multiplier(status)
    summary = "Macro backdrop is acceptable for risk assets." if score >= 0 else "Macro backdrop is a headwind."
    if status == STATUS_MISSING:
        summary = "Macro inputs are missing, reducing confidence."
    return _factor("macro", "Macro", score, summary, status)


def _score_geopolitical(data: dict[str, Any], status: str) -> dict[str, Any]:
    headlines = data.get("headlines") or []
    score = -min(FACTOR_WEIGHTS["geopolitical"], len(headlines) * 1.5)
    score *= _status_multiplier(status)
    summary = "No explicit geopolitical pressure is detected." if score == 0 else "Geopolitical headlines add downside risk."
    if status == STATUS_MISSING:
        summary = "No dedicated geopolitical source is connected."
    return _factor("geopolitical", "Geopolitical", score, summary, status)


def _score_competitors(data: dict[str, Any], status: str) -> dict[str, Any]:
    peers = data.get("competitors") or []
    score = 1.0 if peers else 0.0
    score *= _status_multiplier(status)
    summary = "Peer context is available." if peers else "Peer comparison data is unavailable."
    return _factor("competitors", "Competitors", score, summary, status)


def _score_events(data: dict[str, Any], status: str) -> dict[str, Any]:
    count = int(_num(data.get("count")) or len(data.get("events") or []))
    score = 2 if count else 0
    score *= _status_multiplier(status)
    summary = "Upcoming catalysts are visible." if count else "No specific upcoming catalyst is visible."
    return _factor("upcomingEvents", "Upcoming Events", score, summary, status, source_id="upcoming_events")


def _score_optional(source_id: str, factor_id: str, label: str, status: str) -> dict[str, Any]:
    summary = f"{label} is not connected, so it reduces confidence but not the verdict."
    if status == STATUS_AVAILABLE:
        summary = f"{label} signal payload is available."
    elif status == STATUS_PARTIAL:
        summary = f"{label} access is partially configured but not fully normalized."
    return _factor(factor_id, label, 0, summary, status, source_id=source_id)


def _score_position(position_payload: dict[str, Any], status: str) -> dict[str, Any]:
    position = position_payload.get("position") or {}
    if not position:
        return _factor("positionContext", "Position Context", 0, "No current position, so portfolio context does not constrain the verdict.", status, source_id="portfolio_positions")
    weight = _num(position.get("portfolio_pct")) or 0
    risk = _num(position.get("risk")) or 50
    unrealized_pct = _num(position.get("unrealized_pct"))
    score = 0.0
    if weight > 30:
        score -= 10
    elif weight > 20:
        score -= 7
    elif weight > 15:
        score -= 4
    elif weight < 5:
        score += 2
    if unrealized_pct is not None and unrealized_pct > 25 and risk >= 75:
        score -= 3
    summary = "Portfolio exposure is acceptable."
    if score <= -8:
        summary = "Position concentration is high and materially lowers the actionable recommendation."
    elif score < 0:
        summary = "Position size already absorbs part of the opportunity."
    elif score > 0:
        summary = "Position size leaves room for measured exposure."
    return _factor("positionContext", "Position Context", score, summary, status, source_id="portfolio_positions", details={"portfolioWeight": weight, "risk": risk, "unrealizedPct": unrealized_pct})


def _score_fundamentals_v2(
    fundamentals: dict[str, Any],
    valuation: dict[str, Any],
    earnings: dict[str, Any],
    status: str,
) -> dict[str, Any]:
    eps = _num(_first(fundamentals.get("eps"), valuation.get("eps"), earnings.get("reported_eps")))
    pe = _num(valuation.get("pe"))
    market_cap = _num(_first(fundamentals.get("market_cap"), valuation.get("market_cap")))
    reported = _num(earnings.get("reported_eps"))
    estimate = _num(earnings.get("eps_estimate"))
    score = 0.0
    if eps is not None:
        score += 7 if eps > 0 else -8
    if pe is not None:
        if 0 < pe <= 28:
            score += 8
        elif pe <= 45:
            score += 3
        elif pe <= 80:
            score -= 7
        else:
            score -= 12
    if market_cap is not None:
        score += 4 if market_cap >= 50_000_000_000 else 1
    if reported is not None and estimate not in (None, 0):
        surprise = (reported / estimate - 1) * 100
        score += max(-8, min(8, surprise * 0.45))
    score *= _status_multiplier(status)
    summary = "Fundamentals support the thesis." if score > 2 else "Fundamentals are mixed and do not fully carry the thesis."
    if score < -2:
        summary = "Fundamentals or valuation pressure the thesis."
    if status == STATUS_MISSING:
        summary = "Fundamental inputs are missing, so this category stays neutral and reduces confidence."
    return _factor("fundamentals", "Fundamentals", score, summary, status, source_id="fundamentals")


def _score_analysts_v2(
    targets: dict[str, Any],
    revisions: dict[str, Any],
    target_status: str,
    revision_status: str,
) -> dict[str, Any]:
    status = _combined_status(target_status, revision_status)
    current = _num(targets.get("current_price"))
    average = _num(targets.get("average_target"))
    upside = _pct(average, current)
    key = str(_first(targets.get("consensus_rating"), revisions.get("recommendation_key"), revisions.get("average_analyst_rating"), "")).lower()
    mean = _num(revisions.get("recommendation_mean"))
    score = 0.0
    if upside is not None:
        score += max(-10, min(10, upside * 0.55))
    if "strong" in key and "buy" in key:
        score += 7
    elif "buy" in key or "outperform" in key:
        score += 5
    elif "sell" in key or "underperform" in key:
        score -= 8
    if mean is not None:
        score += max(-4, min(4, (3 - mean) * 1.6))
    if _num(targets.get("analyst_count")) is not None:
        score += 1.5
    score *= _status_multiplier(status)
    summary = "Analyst consensus and targets are constructive." if score > 2 else "Analyst support is balanced."
    if score < -2:
        summary = "Analyst targets or revisions are a headwind."
    if status == STATUS_MISSING:
        summary = "Analyst inputs are unavailable, reducing confidence only."
    return _factor("analysts", "Analysts", score, summary, status, source_id="analyst_targets", details={"upsidePct": round(upside, 2) if upside is not None else None})


def _score_technicals_v2(technical: dict[str, Any], status: str) -> dict[str, Any]:
    price = _num(technical.get("price"))
    high = _num(technical.get("fifty_two_week_high"))
    low = _num(technical.get("fifty_two_week_low"))
    day_change = _num(technical.get("day_change_pct"))
    spark = technical.get("sparkline") if isinstance(technical.get("sparkline"), list) else []
    score = 0.0
    if price is not None and high is not None and low is not None and high > low:
        range_pos = (price - low) / (high - low)
        score += (range_pos - 0.5) * 14
    if len(spark) >= 2:
        start = _num(spark[0])
        end = _num(spark[-1])
        trend = _pct(end, start)
        if trend is not None:
            score += max(-7, min(7, trend * 0.55))
    if day_change is not None:
        score += max(-3, min(3, day_change))
    score *= _status_multiplier(status)
    summary = "Technical trend confirms the setup." if score > 2 else "Technical trend is mixed."
    if score < -2:
        summary = "Technical trend argues for patience."
    if status == STATUS_MISSING:
        summary = "Technical inputs are unavailable, so trend confirmation is limited."
    return _factor("technicals", "Technicals", score, summary, status, source_id="technical_analysis")


def _score_momentum_v2(momentum_data: dict[str, Any], volume: dict[str, Any], status: str) -> dict[str, Any]:
    raw = _num(momentum_data.get("momentum_score"))
    day_change = _num(momentum_data.get("day_change_pct"))
    current_volume = _num(volume.get("current_volume"))
    average_volume = _num(volume.get("average_volume"))
    score = 0.0
    if raw is not None:
        score += ((raw - 50) / 50) * FACTOR_WEIGHTS["momentum"]
    if day_change is not None:
        score += max(-2, min(2, day_change / 2))
    if current_volume is not None and average_volume not in (None, 0):
        ratio = current_volume / average_volume
        if ratio >= 1.4:
            score += 1.5 if (day_change or 0) >= 0 else -1.5
    score *= _status_multiplier(status)
    summary = "Momentum is constructive." if score > 1 else "Momentum is not decisive."
    if score < -1:
        summary = "Momentum is deteriorating."
    if status == STATUS_MISSING:
        summary = "Momentum inputs are unavailable."
    return _factor("momentum", "Momentum", score, summary, status, source_id="momentum")


def _score_news_v2(news_data: dict[str, Any], status: str) -> dict[str, Any]:
    impact = build_news_impact(news_data)
    directional = _num(impact.get("directionalScore")) or 0
    score = directional / 100 * FACTOR_WEIGHTS["news"]
    if not impact.get("materialEvents"):
        items = news_data.get("items") or []
        titles = [str(item.get("title") or item.get("summary") or "") for item in items[:8] if isinstance(item, dict)]
        score = max(-FACTOR_WEIGHTS["news"], min(FACTOR_WEIGHTS["news"], sum(_sentiment_score(title) for title in titles) * 1.15))
    score *= _status_multiplier(status)
    summary = "Material news flow is supportive." if score > 2 else "Recent headline tone is mixed."
    if score < -2:
        summary = "Material news flow is pressuring the thesis."
    if status == STATUS_MISSING:
        summary = "Ticker news is unavailable, reducing confidence only."
    elif impact.get("materialEvents"):
        summary = f"{impact['importance']} material news impact detected: {impact['materialEvents'][0]['eventType']}."
    return _factor("news", "News Impact", score, summary, status, source_id="news", details={"newsImpact": impact})


def _score_macro_v2(macro_data: dict[str, Any], status: str) -> dict[str, Any]:
    vix = _num(macro_data.get("vix"))
    us10y = _num(macro_data.get("us10y"))
    risk_mode = str(macro_data.get("risk_mode") or "").lower()
    score = 0.0
    if "buy" in risk_mode:
        score += 3
    elif "risk" in risk_mode and "off" in risk_mode:
        score -= 5
    if vix is not None:
        score += 3 if vix < 18 else -5 if vix >= 25 else -2 if vix >= 20 else 0
    if us10y is not None and us10y >= 4.4:
        score -= 4
    score *= _status_multiplier(status)
    summary = "Macro backdrop is acceptable for risk assets." if score >= 0 else "Macro backdrop is a headwind."
    if status == STATUS_MISSING:
        summary = "Macro inputs are missing, reducing confidence."
    return _factor("macro", "Macro", score, summary, status, source_id="macro")


def _score_catalysts_v2(
    events_data: dict[str, Any],
    earnings_data: dict[str, Any],
    news_data: dict[str, Any],
    status: str,
) -> dict[str, Any]:
    impact = build_news_impact(news_data)
    events = events_data.get("events") or []
    reported = _num(earnings_data.get("reported_eps"))
    estimate = _num(earnings_data.get("eps_estimate"))
    score = 0.0
    if events:
        score += 2.5
    if reported is not None and estimate not in (None, 0):
        surprise = (reported / estimate - 1) * 100
        score += max(-4, min(4, surprise * 0.35))
    if impact.get("materialEvents"):
        score += (_num(impact.get("directionalScore")) or 0) / 100 * 6
    score *= _status_multiplier(status)
    summary = "Upcoming or active catalysts support the thesis." if score > 1 else "Catalysts are visible but not decisive."
    if score < -1:
        summary = "Catalyst risk is negative."
    if status == STATUS_MISSING:
        summary = "No specific upcoming catalyst is visible."
    return _factor("catalysts", "Catalysts", score, summary, status, source_id="upcoming_events", details={"eventCount": len(events), "newsImpact": impact})


def _score_portfolio_fit_v2(position_payload: dict[str, Any], status: str) -> dict[str, Any]:
    position = position_payload.get("position") or {}
    if not position:
        return _factor("portfolioFit", "Portfolio Fit", 1.0, "No current position leaves room for starter sizing if the stock thesis is strong.", status, source_id="portfolio_positions")
    weight = _num(position.get("portfolio_pct")) or 0
    risk = _num(position.get("risk")) or 50
    unrealized_pct = _num(position.get("unrealized_pct")) or 0
    score = 1.5
    if weight > 30:
        score -= 5
    elif weight > 20:
        score -= 3.5
    elif weight > 15:
        score -= 2
    if risk >= 85:
        score -= 2
    elif risk < 55:
        score += 1
    if unrealized_pct > 25 and risk >= 75:
        score -= 1.5
    score *= _status_multiplier(status)
    summary = "Portfolio fit leaves room for measured exposure."
    if score <= -3:
        summary = "Portfolio concentration materially constrains the recommendation."
    elif score < 0:
        summary = "Portfolio exposure limits the need to add risk."
    return _factor("portfolioFit", "Portfolio Fit", score, summary, status, source_id="portfolio_positions", details={"portfolioWeight": weight, "risk": risk, "unrealizedPct": unrealized_pct})


def _factor_rows(statuses: dict[str, str], inputs: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    rows = [
        _score_fundamentals_v2(
            inputs.get("fundamentals", {}),
            inputs.get("valuation", {}),
            inputs.get("earnings", {}),
            _combined_status(statuses.get("fundamentals"), statuses.get("valuation"), statuses.get("earnings")),
        ),
        _score_analysts_v2(
            inputs.get("analyst_targets", {}),
            inputs.get("analyst_revisions", {}),
            statuses.get("analyst_targets", STATUS_MISSING),
            statuses.get("analyst_revisions", STATUS_MISSING),
        ),
        _score_technicals_v2(inputs.get("technical_analysis", {}), statuses.get("technical_analysis", STATUS_MISSING)),
        _score_momentum_v2(
            inputs.get("momentum", {}),
            inputs.get("volume", {}),
            _combined_status(statuses.get("momentum"), statuses.get("volume")),
        ),
        _score_news_v2(inputs.get("news", {}), statuses.get("news", STATUS_MISSING)),
        _score_macro_v2(inputs.get("macro", {}), statuses.get("macro", STATUS_MISSING)),
        _score_catalysts_v2(
            inputs.get("upcoming_events", {}),
            inputs.get("earnings", {}),
            inputs.get("news", {}),
            _combined_status(statuses.get("upcoming_events"), statuses.get("earnings"), statuses.get("news")),
        ),
        _score_portfolio_fit_v2(inputs.get("portfolio_positions", {}), statuses.get("portfolio_positions", STATUS_MISSING)),
    ]
    return rows


def _normalize(contribution_sum: float, max_sum: float) -> int:
    return _int(_clamp(50 + contribution_sum * (60 / max_sum)))


def _position_verdict(score: int) -> str:
    if score >= 90:
        return "STRONG BUY"
    if score >= 75:
        return "BUY"
    if score >= 55:
        return "HOLD"
    if score >= 40:
        return "TRIM"
    if score >= 20:
        return "SELL"
    return "STRONG SELL"


def _candidate_verdict(score: int) -> str:
    if score >= 85:
        return "STRONG BUY"
    if score >= 65:
        return "BUY"
    if score >= 40:
        return "WATCH"
    return "AVOID"


def _visual_state(stock_verdict: str, portfolio_verdict: str) -> str:
    if stock_verdict == "STRONG BUY" and portfolio_verdict == "HOLD":
        return "BALANCED"
    if portfolio_verdict in {"STRONG BUY", "BUY"}:
        return "BULL"
    if portfolio_verdict in {"HOLD", "WATCH"}:
        return "BALANCED"
    if portfolio_verdict == "TRIM":
        return "TRIM"
    return "BEAR"


def _risk_level(factors: list[dict[str, Any]], position: dict[str, Any] | None, inputs: dict[str, dict[str, Any]]) -> str:
    risk = 35.0
    position_risk = _num((position or {}).get("risk"))
    if position_risk is not None:
        risk = max(risk, position_risk)
    beta = _num((inputs.get("fundamentals") or {}).get("beta"))
    if beta is not None and beta > 1.8:
        risk += 10
    if _num((position or {}).get("portfolio_pct")) and (_num((position or {}).get("portfolio_pct")) or 0) > 20:
        risk += 15
    negative_pressure = abs(sum(row["contribution"] for row in factors if row["contribution"] < 0))
    risk += min(20, negative_pressure)
    if risk >= 75:
        return "HIGH"
    if risk >= 50:
        return "MEDIUM"
    return "LOW"


def _confidence_label(score: int) -> str:
    if score >= 80:
        return "HIGH"
    if score >= 55:
        return "MEDIUM"
    return "LOW"


def _probabilities(stock_score: int, risk_level: str) -> dict[str, int]:
    bull = _int(_clamp(8 + stock_score * 0.35, 10, 45))
    bear = _int(_clamp(42 - stock_score * 0.32, 10, 40))
    if risk_level == "HIGH":
        bear += 6
        bull -= 4
    elif risk_level == "LOW":
        bear -= 3
        bull += 2
    bull = _int(_clamp(bull, 5, 50))
    bear = _int(_clamp(bear, 5, 55))
    base = max(5, 100 - bull - bear)
    total = bull + bear + base
    if total != 100:
        base += 100 - total
    return {"bear": bear, "base": base, "bull": bull}


def _adjust_probabilities_for_news(probabilities: dict[str, int], news_impact: dict[str, Any]) -> dict[str, int]:
    adjusted = dict(probabilities)
    if not news_impact.get("materialEvents"):
        return adjusted
    importance = str(news_impact.get("importance") or "")
    direction = str(news_impact.get("direction") or "")
    shift = 7 if importance == "High" else 4 if importance == "Medium" else 2
    if direction == "Positive":
        adjusted["bull"] = _int(_clamp(adjusted.get("bull", 0) + shift, 5, 55))
        adjusted["bear"] = _int(_clamp(adjusted.get("bear", 0) - max(2, shift // 2), 5, 55))
    elif direction == "Negative":
        adjusted["bear"] = _int(_clamp(adjusted.get("bear", 0) + shift, 5, 60))
        adjusted["bull"] = _int(_clamp(adjusted.get("bull", 0) - max(2, shift // 2), 5, 55))
    adjusted["base"] = max(5, 100 - adjusted["bear"] - adjusted["bull"])
    total = adjusted["bear"] + adjusted["base"] + adjusted["bull"]
    if total != 100:
        adjusted["base"] += 100 - total
    return adjusted


def _scenario_returns(stock_score: int, factors: list[dict[str, Any]], inputs: dict[str, dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], float]:
    targets = inputs.get("analyst_targets") or {}
    fundamentals = inputs.get("fundamentals") or {}
    price = _num(_first(targets.get("current_price"), fundamentals.get("price")))
    average = _num(targets.get("average_target"))
    high = _num(targets.get("high_target"))
    low = _num(targets.get("low_target"))
    base_return = _pct(average, price)
    if base_return is None:
        contribution_sum = sum(row["contribution"] for row in factors if row["id"] != "positionContext")
        base_return = max(-18, min(24, contribution_sum * 0.9))
    bull_return = _pct(high, price)
    if bull_return is None:
        bull_return = max(base_return + 12, (stock_score - 50) * 0.55 + 18)
    bear_return = _pct(low, price)
    if bear_return is None:
        bear_return = min(base_return - 12, (stock_score - 50) * 0.35 - 14)
    news_impact = build_news_impact(inputs.get("news") or {})
    if news_impact.get("materialEvents"):
        directional = (_num(news_impact.get("directionalScore")) or 0) / 100
        materiality = (_num(news_impact.get("score")) or 0) / 100
        adjustment = directional * (3 + materiality * 5)
        base_return += adjustment
        if adjustment > 0:
            bull_return += adjustment * 1.3
            bear_return += adjustment * 0.4
        elif adjustment < 0:
            bear_return += adjustment * 1.3
            bull_return += adjustment * 0.4

    def scenario(return_pct: float) -> dict[str, Any]:
        return {"price": round(price * (1 + return_pct / 100), 2) if price is not None else None, "returnPct": _int(return_pct)}

    scenarios = {"bear": scenario(bear_return), "base": scenario(base_return), "bull": scenario(bull_return)}
    probabilities = _adjust_probabilities_for_news(_probabilities(stock_score, _risk_level(factors, None, inputs)), news_impact)
    expected = (
        scenarios["bear"]["returnPct"] * probabilities["bear"]
        + scenarios["base"]["returnPct"] * probabilities["base"]
        + scenarios["bull"]["returnPct"] * probabilities["bull"]
    ) / 100
    return scenarios, expected


def _confidence_notes(statuses: dict[str, str], coverage_pct: float) -> list[str]:
    notes: list[str] = []
    optional = {
        "seeking_alpha": "Seeking Alpha is not connected, so external article sentiment was not included.",
        "advisor_discord": "Discord advisor signals are not connected.",
        "x_sentiment": "X sentiment is not connected.",
    }
    for source_id, message in optional.items():
        if statuses.get(source_id) in {STATUS_MISSING, STATUS_DISABLED, STATUS_PARTIAL}:
            notes.append(message)
    if coverage_pct < 50:
        notes.append("Data coverage is limited, so conviction is intentionally conservative.")
    elif any(statuses.get(source) in {STATUS_MISSING, STATUS_PARTIAL} for source in ("analyst_targets", "valuation", "earnings")):
        notes.append("Some core research inputs are incomplete, so confidence is moderated.")
    notes.append("Verdict is still based on available fundamentals, analysts, technicals, news, macro and portfolio context.")
    return notes[:5]


def _drivers_and_risks(factors: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    positives = sorted([row for row in factors if row["contribution"] > 0], key=lambda row: row["contribution"], reverse=True)
    negatives = sorted([row for row in factors if row["contribution"] < 0], key=lambda row: row["contribution"])

    def public_row(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "name": row["label"],
            "impact": _int(row["contribution"]),
            "direction": row["direction"],
            "strength": row["strength"],
            "summary": row["summary"],
        }

    drivers = [public_row(row) for row in positives[:5]]
    risks = [public_row(row) for row in negatives[:5]]
    if not drivers:
        drivers.append({"name": "Base Case Discipline", "impact": 0, "direction": "neutral", "strength": "light", "summary": "The engine finds a balanced setup rather than a decisive bull driver."})
    if not risks:
        risks.append({"name": "Incomplete Data", "impact": 0, "direction": "neutral", "strength": "light", "summary": "No dominant negative factor is detected, but missing sources still moderate confidence."})
    return drivers, risks


def _cases(drivers: list[dict[str, Any]], risks: list[dict[str, Any]], stock_verdict: str, portfolio_verdict: str) -> tuple[list[str], list[str]]:
    bull = [row["summary"] for row in drivers[:3]]
    bear = [row["summary"] for row in risks[:3]]
    while len(bull) < 3:
        bull.append("Available evidence can still support upside if execution and market tone improve.")
    while len(bear) < 3:
        bear.append("Missing sources or macro volatility could weaken conviction.")
    if portfolio_verdict in {"HOLD", "TRIM"} and stock_verdict in {"STRONG BUY", "BUY"}:
        bear[-1] = "Portfolio exposure already limits the need to add risk."
    return bull[:3], bear[:3]


def _top_reason(stock_verdict: str, portfolio_verdict: str, drivers: list[dict[str, Any]], risks: list[dict[str, Any]], has_position: bool) -> str:
    if stock_verdict in {"STRONG BUY", "BUY"} and portfolio_verdict in {"HOLD", "TRIM"}:
        return "Stock thesis is strong, but current portfolio exposure already limits the action."
    if portfolio_verdict in {"SELL", "STRONG SELL", "AVOID"}:
        return risks[0]["summary"] if risks else "Risk outweighs reward based on available evidence."
    if portfolio_verdict in {"STRONG BUY", "BUY"}:
        return drivers[0]["summary"] if drivers else "Available evidence supports adding exposure."
    if has_position:
        return "The thesis is balanced enough to hold while waiting for stronger confirmation."
    return "The setup is balanced enough to watch, but not strong enough for a buy verdict."


def _portfolio_recommendation(
    has_position: bool,
    stock_verdict: str,
    final_score: int,
    position: dict[str, Any] | None,
    risk_level: str,
) -> str:
    if not has_position:
        return _candidate_verdict(final_score)
    recommendation = _position_verdict(final_score)
    weight = _num((position or {}).get("portfolio_pct")) or 0
    unrealized_pct = _num((position or {}).get("unrealized_pct")) or 0
    position_risk = _num((position or {}).get("risk")) or 50
    if weight > 20 and recommendation == "STRONG BUY":
        recommendation = "BUY" if weight <= 30 else "HOLD"
    if weight > 30:
        if final_score < 92:
            recommendation = "TRIM" if stock_verdict not in {"STRONG BUY"} or risk_level == "HIGH" else "HOLD"
    if unrealized_pct > 25 and position_risk >= 75 and final_score < 75:
        recommendation = "TRIM"
    return recommendation


def _score_response(
    symbol: str,
    *,
    settings: dict[str, Any] | None = None,
    portfolio: dict[str, Any] | None = None,
    position: dict[str, Any] | None = None,
    watch: dict[str, Any] | None = None,
    macro: dict[str, Any] | None = None,
    calendar: list[dict[str, Any]] | None = None,
    fundamentals: dict[str, Any] | None = None,
    news: list[dict[str, Any]] | None = None,
    news_intelligence: dict[str, Any] | None = None,
    provider_status: dict[str, Any] | None = None,
    strategy: str = "long_term",
    debug: bool = False,
    cache_status: str = "fresh",
    start: float | None = None,
) -> dict[str, Any]:
    start = start or time.perf_counter()
    clean = _clean_symbol(symbol)
    position = position if position is not None else _find_position(portfolio, clean)
    seeded_fundamentals = _seed_fundamentals(clean, position, watch, fundamentals)
    statuses, payloads = SourceRegistry(settings).evaluate(
        symbol=clean,
        portfolio=portfolio,
        position=position,
        watch=watch,
        macro=macro,
        calendar=calendar,
        fundamentals=seeded_fundamentals,
        news=news,
        news_intelligence=news_intelligence,
        provider_status=provider_status,
    )
    status_map = {row.definition.id: row.status for row in statuses}
    coverage = SourceRegistry(settings).inputs_response(
        symbol=clean,
        portfolio=portfolio,
        position=position,
        watch=watch,
        macro=macro,
        calendar=calendar,
        fundamentals=seeded_fundamentals,
        news=news,
        news_intelligence=news_intelligence,
        provider_status=provider_status,
    )["coverage"]
    data_coverage = float(coverage.get("coverage_percent") or 0)
    factors = _factor_rows(status_map, payloads)
    stock_factors = [row for row in factors if row["id"] != "portfolioFit"]
    stock_weight = sum(FACTOR_WEIGHTS[row["id"]] for row in stock_factors)
    all_weight = sum(FACTOR_WEIGHTS[row["id"]] for row in factors)
    stock_score = _normalize(sum(row["contribution"] for row in stock_factors), stock_weight)
    final_score = _normalize(sum(row["contribution"] for row in factors), all_weight)
    has_position = bool(position)
    stock_verdict = _position_verdict(stock_score) if has_position else _candidate_verdict(stock_score)
    risk_level = _risk_level(factors, position, payloads)
    portfolio_verdict = _portfolio_recommendation(has_position, stock_verdict, final_score, position, risk_level)
    final_verdict = portfolio_verdict
    visual_state = _visual_state(stock_verdict, portfolio_verdict)
    news_impact = build_news_impact(payloads.get("news") or {})
    probabilities = _adjust_probabilities_for_news(_probabilities(stock_score, risk_level), news_impact)
    price_scenarios, expected_return = _scenario_returns(stock_score, factors, payloads)
    expected_return = (
        price_scenarios["bear"]["returnPct"] * probabilities["bear"]
        + price_scenarios["base"]["returnPct"] * probabilities["base"]
        + price_scenarios["bull"]["returnPct"] * probabilities["bull"]
    ) / 100
    missing_critical = sum(1 for source in ("fundamentals", "valuation", "technical_analysis", "analyst_targets") if status_map.get(source) in {STATUS_MISSING, STATUS_PARTIAL})
    contradiction = min(12, abs(sum(row["contribution"] for row in factors if row["contribution"] > 0) + sum(row["contribution"] for row in factors if row["contribution"] < 0)) / 5)
    confidence_score = _int(_clamp(data_coverage * 0.65 + (100 - missing_critical * 8) * 0.25 + (100 - contradiction) * 0.10))
    if data_coverage < 50:
        confidence_score = min(confidence_score, 54)
    thesis_strength = _int(_clamp(stock_score * 0.72 + data_coverage * 0.18 + max(0, expected_return) * 0.35))
    conviction = _int(_clamp(final_score * 0.55 + confidence_score * 0.35 + max(-10, min(15, expected_return)) * 0.5))
    if portfolio_verdict in {"HOLD", "TRIM"} and stock_verdict in {"STRONG BUY", "BUY"}:
        conviction = min(conviction, 78)
    drivers, risks = _drivers_and_risks(factors)
    bull_case, bear_case = _cases(drivers, risks, stock_verdict, portfolio_verdict)
    top_reason = _top_reason(stock_verdict, portfolio_verdict, drivers, risks, has_position)
    confidence_notes = _confidence_notes(status_map, data_coverage)
    score_breakdown = {row["id"]: _int(row["contribution"]) for row in factors}
    factors_evaluated = [{"id": row.definition.id, "label": row.definition.label, "status": row.status} for row in statuses]
    explanation = f"{top_reason} The final verdict is {final_verdict} because the engine weighs the stock thesis separately from the portfolio action, then adjusts for source coverage, risk and position context."
    response = {
        "symbol": clean,
        "hasPosition": has_position,
        "stockVerdict": stock_verdict,
        "portfolioRecommendation": portfolio_verdict,
        "finalVerdict": final_verdict,
        "expectedReturnPct": _int(expected_return),
        "convictionScore": conviction,
        "thesisStrength": thesis_strength,
        "riskLevel": risk_level,
        "confidence": _confidence_label(confidence_score),
        "dataCoveragePct": round(data_coverage, 1),
        "visualState": visual_state,
        "topReason": top_reason,
        "scenarioProbabilities": probabilities,
        "priceScenarios": price_scenarios,
        "drivers": drivers,
        "risks": risks,
        "bullCase": bull_case,
        "bearCase": bear_case,
        "scoreBreakdown": score_breakdown,
        "verdictWeights": FACTOR_WEIGHTS,
        "newsImpact": news_impact,
        "factorsEvaluated": factors_evaluated,
        "confidenceNotes": confidence_notes,
        "explanation": explanation,
        "horizon": DEFAULT_HORIZON,
        "strategy": strategy or "long_term",
        "performance": {"calculationTimeMs": _elapsed_ms(start), "cacheStatus": cache_status},
    }
    if debug:
        response["debug"] = {
            "rawFactorScores": factors,
            "weights": FACTOR_WEIGHTS,
            "normalization": {
                "stockContributionSum": round(sum(row["contribution"] for row in stock_factors), 2),
                "portfolioContributionSum": round(sum(row["contribution"] for row in factors), 2),
                "stockWeight": stock_weight,
                "totalWeight": all_weight,
                "stockScore": stock_score,
                "portfolioAdjustedScore": final_score,
            },
            "missingSources": [row.definition.id for row in statuses if row.status in {STATUS_MISSING, STATUS_PARTIAL, STATUS_DISABLED}],
            "coverageCalculation": coverage,
            "cache": {"key": _cache_key(clean, strategy, portfolio), "status": cache_status, "ttlSeconds": SCORE_CACHE_TTL_SECONDS},
            "sourceAvailability": status_map,
        }
    return response


def build_ai_intelligence_score(
    symbol: str,
    *,
    settings: dict[str, Any] | None = None,
    portfolio: dict[str, Any] | None = None,
    position: dict[str, Any] | None = None,
    watch: dict[str, Any] | None = None,
    macro: dict[str, Any] | None = None,
    calendar: list[dict[str, Any]] | None = None,
    fundamentals: dict[str, Any] | None = None,
    news: list[dict[str, Any]] | None = None,
    news_intelligence: dict[str, Any] | None = None,
    provider_status: dict[str, Any] | None = None,
    strategy: str = "long_term",
    debug: bool = False,
    refresh: bool = False,
) -> dict[str, Any]:
    start = time.perf_counter()
    clean = _clean_symbol(symbol)
    key = _cache_key(clean, strategy, portfolio)
    if not debug and not refresh:
        cached = _cache_get(key)
        if cached is not None:
            cached["performance"]["calculationTimeMs"] = _elapsed_ms(start)
            return cached
    response = _score_response(
        clean,
        settings=settings,
        portfolio=portfolio,
        position=position,
        watch=watch,
        macro=macro,
        calendar=calendar,
        fundamentals=fundamentals,
        news=news,
        news_intelligence=news_intelligence,
        provider_status=provider_status,
        strategy=strategy,
        debug=debug,
        cache_status="fresh" if not refresh else "refresh",
        start=start,
    )
    if not debug:
        _cache_set(key, response)
    return response


def build_ai_score_fixtures() -> dict[str, dict[str, Any]]:
    settings = {"enableDiscordSignals": False, "enableSeekingAlpha": False, "enableXSentiment": False}
    macro = {"vix": 16, "us10y": 4.1, "risk_mode": "BUY WITH CASH"}
    base_portfolio = {"source": "fixture", "configured_mode": "mock", "positions": []}
    bull = build_ai_intelligence_score(
        "BULL",
        settings=settings,
        portfolio=base_portfolio,
        macro=macro,
        fundamentals={
            "ticker": "BULL",
            "price": 100,
            "currency": "USD",
            "exchange": "NASDAQ",
            "eps": 4,
            "pe": 24,
            "market_cap": 50_000_000_000,
            "beta": 1.1,
            "targetMeanPrice": 135,
            "targetHighPrice": 155,
            "targetLowPrice": 92,
            "recommendationKey": "buy",
            "numberOfAnalystOpinions": 18,
            "sparkline": [86, 90, 95, 100],
            "volume": 200,
            "avg_volume": 100,
        },
        news=[{"title": "BULL raises guidance after strong growth"}],
        news_intelligence={"is_demo": False, "items": [{"title": "BULL raises guidance after strong growth"}]},
        refresh=True,
    )
    balanced = build_ai_intelligence_score(
        "BAL",
        settings=settings,
        portfolio=base_portfolio,
        macro={"vix": 20, "us10y": 4.3, "risk_mode": "Neutral"},
        fundamentals={"ticker": "BAL", "price": 100, "currency": "USD", "exchange": "NYSE", "eps": 1, "pe": 38, "sparkline": [99, 101, 100]},
        news=[{"title": "BAL outlook remains mixed"}],
        refresh=True,
    )
    bear = build_ai_intelligence_score(
        "BEAR",
        settings=settings,
        portfolio=base_portfolio,
        macro={"vix": 29, "us10y": 4.8, "risk_mode": "risk off"},
        fundamentals={
            "ticker": "BEAR",
            "price": 100,
            "currency": "USD",
            "exchange": "NYSE",
            "eps": -1,
            "pe": 95,
            "targetMeanPrice": 75,
            "targetHighPrice": 82,
            "targetLowPrice": 60,
            "recommendationKey": "sell",
            "numberOfAnalystOpinions": 12,
            "fiftyTwoWeekHigh": 150,
            "fiftyTwoWeekLow": 95,
            "volume": 250,
            "avg_volume": 100,
            "sparkline": [120, 110, 100],
        },
        news=[{"title": "BEAR cuts guidance after weak demand"}, {"title": "BEAR downgraded after earnings miss"}],
        refresh=True,
    )
    concentrated = deepcopy(base_portfolio)
    concentrated["positions"] = [{"symbol": "CONC", "qty": 100, "last": 100, "market_value": 35_000, "portfolio_pct": 35, "unrealized_pct": 40, "risk": 40, "momentum_score": 95, "day_change_pct": 4}]
    portfolio_case = build_ai_intelligence_score(
        "CONC",
        settings=settings,
        portfolio=concentrated,
        position=concentrated["positions"][0],
        macro=macro,
        fundamentals={
            "ticker": "CONC",
            "price": 100,
            "currency": "USD",
            "exchange": "NASDAQ",
            "eps": 5,
            "pe": 16,
            "market_cap": 80_000_000_000,
            "beta": 1.0,
            "analyst_upside_pct": 45,
            "eps_estimate": 2,
            "reportedEPS": 2.5,
            "earningsDate": "fixture",
            "targetMeanPrice": 145,
            "targetHighPrice": 170,
            "targetLowPrice": 95,
            "recommendationKey": "strong_buy",
            "recommendationMean": 1.2,
            "recommendationTrend": {"strong_buy": 12, "buy": 8, "hold": 2},
            "numberOfAnalystOpinions": 24,
            "fiftyTwoWeekHigh": 105,
            "fiftyTwoWeekLow": 55,
            "competitors": ["PEER1", "PEER2"],
            "sparkline": [80, 92, 100],
            "volume": 300,
            "avg_volume": 100,
        },
        calendar=[{"event": "CONC earnings", "date": "fixture"}],
        news=[{"title": "CONC beats estimates and raises outlook"}, {"title": "CONC upgraded after strong growth"}],
        news_intelligence={"is_demo": False, "items": [{"title": "CONC beats estimates and raises outlook"}, {"title": "CONC upgraded after strong growth"}]},
        refresh=True,
    )
    return {"bull": bull, "balanced": balanced, "bear": bear, "portfolioAware": portfolio_case}
