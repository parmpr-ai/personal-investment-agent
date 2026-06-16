from __future__ import annotations

import math
import re
import statistics
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any

import feedparser
import httpx


PRICE_TTL_SECONDS = 10 * 60
NEWS_TTL_SECONDS = 60 * 60
QUOTE_TTL_SECONDS = 60 * 60
AI_TTL_SECONDS = 10 * 60
YAHOO_TIMEOUT = httpx.Timeout(1.6, connect=0.7)
OPTIONAL_TIMEOUT = httpx.Timeout(0.9, connect=0.5)
VALID_SYMBOL_RE = re.compile(r"^[A-Z][A-Z0-9.-]{0,14}$")

_AI_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_CHART_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_NEWS_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_QUOTE_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _latency_ms(start: float) -> int:
    return max(0, int((time.perf_counter() - start) * 1000))


def _clean_symbol(value: str) -> str:
    return str(value or "").strip().split()[0].upper()


def _cache_get(cache: dict[str, tuple[float, dict[str, Any]]], key: str, ttl: int, refresh: bool) -> dict[str, Any] | None:
    if refresh:
        return None
    cached = cache.get(key)
    if not cached:
        return None
    saved_at, payload = cached
    if time.time() - saved_at > ttl:
        cache.pop(key, None)
        return None
    return dict(payload)


def _cache_set(cache: dict[str, tuple[float, dict[str, Any]]], key: str, payload: dict[str, Any]) -> None:
    cache[key] = (time.time(), dict(payload))


def _num(value: Any) -> float | None:
    try:
        if value in (None, ""):
            return None
        parsed = float(value)
        if not math.isfinite(parsed):
            return None
        return parsed
    except (TypeError, ValueError):
        return None


def _clamp(value: float, low: float = 0, high: float = 100) -> int:
    return int(round(max(low, min(high, value))))


def _status(available: bool, partial: bool = False) -> str:
    if available:
        return "partial" if partial else "available"
    return "missing"


def _safe_round(value: float | None, digits: int = 2) -> float | None:
    if value is None:
        return None
    return round(value, digits)


def _pct_change(values: list[float], days: int) -> float | None:
    if not values:
        return None
    last = values[-1]
    if len(values) <= days:
        first = values[0]
    else:
        first = values[-days - 1]
    if not first:
        return None
    return (last / first - 1) * 100


def _sma(values: list[float], days: int) -> float | None:
    if len(values) < days:
        return None
    return sum(values[-days:]) / days


def _returns(values: list[float]) -> list[float]:
    rows: list[float] = []
    for index in range(1, len(values)):
        prior = values[index - 1]
        current = values[index]
        if prior > 0:
            rows.append(current / prior - 1)
    return rows


def _annualized_volatility(values: list[float], days: int = 30) -> float | None:
    daily = _returns(values)[-days:]
    if len(daily) < 5:
        return None
    return statistics.stdev(daily) * math.sqrt(252) * 100


def _max_drawdown(values: list[float], window: int = 90) -> float | None:
    recent = values[-window:] if len(values) > window else values
    if len(recent) < 2:
        return None
    peak = recent[0]
    worst = 0.0
    for value in recent:
        peak = max(peak, value)
        if peak > 0:
            worst = min(worst, value / peak - 1)
    return abs(worst) * 100


def _beta(values: list[float], benchmark: list[float]) -> float | None:
    own = _returns(values)
    spy = _returns(benchmark)
    size = min(len(own), len(spy), 90)
    if size < 20:
        return None
    own = own[-size:]
    spy = spy[-size:]
    spy_mean = sum(spy) / size
    own_mean = sum(own) / size
    variance = sum((x - spy_mean) ** 2 for x in spy)
    if not variance:
        return None
    covariance = sum((own[i] - own_mean) * (spy[i] - spy_mean) for i in range(size))
    return covariance / variance


def _parse_chart(symbol: str, data: dict[str, Any]) -> dict[str, Any]:
    result = (((data.get("chart") or {}).get("result") or [None])[0]) or {}
    meta = result.get("meta") or {}
    quote = (((result.get("indicators") or {}).get("quote") or [None])[0]) or {}
    timestamps = result.get("timestamp") or []
    closes_raw = quote.get("close") or []
    volumes_raw = quote.get("volume") or []
    highs_raw = quote.get("high") or []
    lows_raw = quote.get("low") or []

    closes: list[float] = []
    volumes: list[float] = []
    highs: list[float] = []
    lows: list[float] = []
    clean_timestamps: list[int] = []
    for index, close_raw in enumerate(closes_raw):
        close = _num(close_raw)
        if close is None or close <= 0:
            continue
        closes.append(close)
        volumes.append(_num(volumes_raw[index] if index < len(volumes_raw) else None) or 0)
        high = _num(highs_raw[index] if index < len(highs_raw) else None)
        low = _num(lows_raw[index] if index < len(lows_raw) else None)
        highs.append(high if high is not None else close)
        lows.append(low if low is not None else close)
        if index < len(timestamps):
            clean_timestamps.append(int(timestamps[index]))

    price = _num(meta.get("regularMarketPrice")) or (closes[-1] if closes else None)
    previous_close = _num(meta.get("chartPreviousClose")) or _num(meta.get("previousClose"))
    if previous_close is None and len(closes) >= 2:
        previous_close = closes[-2]

    return {
        "symbol": symbol,
        "meta": meta,
        "closes": closes,
        "volumes": volumes,
        "highs": highs,
        "lows": lows,
        "timestamps": clean_timestamps,
        "price": price,
        "previous_close": previous_close,
        "currency": meta.get("currency"),
        "exchange": meta.get("fullExchangeName") or meta.get("exchangeName") or meta.get("exchange"),
    }


def _fetch_chart(symbol: str, refresh: bool = False) -> dict[str, Any]:
    key = symbol.upper()
    cached = _cache_get(_CHART_CACHE, key, PRICE_TTL_SECONDS, refresh)
    if cached is not None:
        return cached

    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{key}"
    payload: dict[str, Any] = {"symbol": key, "error": "chart_unavailable", "closes": [], "volumes": []}
    try:
        response = httpx.get(
            url,
            params={"range": "1y", "interval": "1d", "includePrePost": "false"},
            timeout=YAHOO_TIMEOUT,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        response.raise_for_status()
        payload = _parse_chart(key, response.json())
    except Exception as exc:
        payload["error"] = str(exc)

    _cache_set(_CHART_CACHE, key, payload)
    return dict(payload)


def _fetch_quote(symbol: str, refresh: bool = False) -> dict[str, Any]:
    key = symbol.upper()
    cached = _cache_get(_QUOTE_CACHE, key, QUOTE_TTL_SECONDS, refresh)
    if cached is not None:
        return cached

    fields = ",".join(
        [
            "beta",
            "marketCap",
            "shortPercentOfFloat",
            "shortRatio",
            "targetMeanPrice",
            "targetHighPrice",
            "targetLowPrice",
            "targetMedianPrice",
            "recommendationMean",
            "recommendationKey",
            "numberOfAnalystOpinions",
        ]
    )
    payload: dict[str, Any] = {}
    try:
        response = httpx.get(
            "https://query1.finance.yahoo.com/v7/finance/quote",
            params={"symbols": key, "fields": fields},
            timeout=OPTIONAL_TIMEOUT,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        response.raise_for_status()
        payload = (((response.json().get("quoteResponse") or {}).get("result") or [None])[0]) or {}
    except Exception as exc:
        payload = {"error": str(exc)}

    _cache_set(_QUOTE_CACHE, key, payload)
    return dict(payload)


def _headline_sentiment(title: str) -> int:
    text = title.lower()
    negative = ("down", "cut", "miss", "lawsuit", "probe", "warning", "decline", "fall", "drop", "downgrade", "weak", "loss")
    positive = ("up", "beat", "raise", "upgrade", "surge", "gain", "record", "bullish", "strong", "growth", "wins")
    score = 0
    for word in positive:
        if word in text:
            score += 1
    for word in negative:
        if word in text:
            score -= 1
    return max(-2, min(2, score))


def _fetch_news_sentiment(symbol: str, refresh: bool = False) -> dict[str, Any]:
    key = symbol.upper()
    cached = _cache_get(_NEWS_CACHE, key, NEWS_TTL_SECONDS, refresh)
    if cached is not None:
        return cached

    payload: dict[str, Any] = {"available": False, "score": 50, "count": 0, "headlines": []}
    try:
        response = httpx.get(
            "https://feeds.finance.yahoo.com/rss/2.0/headline",
            params={"s": key, "region": "US", "lang": "en-US"},
            timeout=OPTIONAL_TIMEOUT,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        response.raise_for_status()
        parsed = feedparser.parse(response.content)
        entries = list(getattr(parsed, "entries", []) or [])[:8]
        headlines = [str(entry.get("title") or "").strip() for entry in entries if str(entry.get("title") or "").strip()]
        raw_scores = [_headline_sentiment(title) for title in headlines]
        if headlines:
            average = sum(raw_scores) / max(len(raw_scores), 1)
            payload = {
                "available": True,
                "score": _clamp(50 + average * 14),
                "count": len(headlines),
                "headlines": headlines[:4],
            }
    except Exception as exc:
        payload["error"] = str(exc)

    _cache_set(_NEWS_CACHE, key, payload)
    return dict(payload)


def _momentum_score(closes: list[float], spy_closes: list[float]) -> tuple[int, dict[str, float | None]]:
    perf_1d = _pct_change(closes, 1)
    perf_5d = _pct_change(closes, 5)
    perf_21d = _pct_change(closes, 21)
    perf_63d = _pct_change(closes, 63)
    spy_63d = _pct_change(spy_closes, 63)
    relative = (perf_63d or 0) - (spy_63d or 0) if perf_63d is not None and spy_63d is not None else 0
    score = 50 + (perf_5d or 0) * 1.2 + (perf_21d or 0) * 1.6 + (perf_63d or 0) * 0.45 + relative * 0.35
    return _clamp(score), {"price_return_1d": perf_1d, "price_return_5d": perf_5d, "price_return_30d": perf_21d, "price_return_90d": perf_63d}


def _trend_score(closes: list[float]) -> int:
    last = closes[-1]
    ma20 = _sma(closes, 20)
    ma50 = _sma(closes, 50)
    ma100 = _sma(closes, 100)
    slope = _pct_change(closes, 20)
    score = 50.0
    if ma20:
        score += max(-22, min(22, (last / ma20 - 1) * 180))
    if ma50:
        score += max(-18, min(18, (last / ma50 - 1) * 125))
    if ma100:
        score += max(-10, min(10, (last / ma100 - 1) * 80))
    if ma20 and ma50:
        score += max(-16, min(16, (ma20 / ma50 - 1) * 160))
    if slope is not None:
        score += max(-18, min(18, slope * 0.9))
    return _clamp(score)


def _risk_score(closes: list[float], spy_closes: list[float], quote_beta: float | None) -> tuple[int, dict[str, float | None]]:
    vol_30d = _annualized_volatility(closes, 30)
    drawdown = _max_drawdown(closes, 90)
    beta = quote_beta or _beta(closes, spy_closes)
    vol_component = min((vol_30d or 35) * 1.15, 100)
    drawdown_component = min((drawdown or 8) * 2.0, 100)
    beta_component = min(max((beta or 1.0) * 36, 0), 100)
    score = vol_component * 0.55 + drawdown_component * 0.30 + beta_component * 0.15
    return _clamp(score), {"volatility_30d": vol_30d, "drawdown_90d": drawdown, "beta": beta}


def _relative_strength(closes: list[float], spy_closes: list[float]) -> tuple[float | None, int | None]:
    own = _pct_change(closes, 63)
    spy = _pct_change(spy_closes, 63)
    if own is None or spy is None:
        return None, None
    denominator = 1 + spy / 100
    ratio = (1 + own / 100) / denominator if denominator else None
    score = _clamp(50 + (own - spy) * 1.2)
    return (_safe_round(ratio, 2) if ratio is not None else None), score


def _volume_flow(closes: list[float], volumes: list[float], perf_21d: float | None) -> tuple[int, float | None, float | None]:
    if len(closes) < 10 or len(volumes) < 10:
        return 50, None, None
    size = min(len(closes), len(volumes))
    closes = closes[-size:]
    volumes = volumes[-size:]
    recent_count = min(30, size - 1)
    flow = 0.0
    dollar_volume = 0.0
    for index in range(size - recent_count, size):
        direction = 1 if closes[index] >= closes[index - 1] else -1
        daily_dollar = closes[index] * volumes[index]
        dollar_volume += daily_dollar
        flow += direction * daily_dollar
    avg_recent = sum(volumes[-recent_count:]) / max(recent_count, 1)
    prior_slice = volumes[-(recent_count * 3) : -recent_count] if size > recent_count * 2 else volumes[:-recent_count]
    avg_prior = sum(prior_slice) / len(prior_slice) if prior_slice else avg_recent
    rel_volume = avg_recent / avg_prior if avg_prior else 1.0
    flow_ratio = flow / dollar_volume if dollar_volume else 0
    score = 50 + flow_ratio * 35 + (rel_volume - 1) * 12 + (perf_21d or 0) * 0.35
    return _clamp(score), flow if dollar_volume else None, rel_volume


def _fair_value(price: float, momentum: int, trend: int, risk: int, quote: dict[str, Any]) -> tuple[float, str, dict[str, float | None]]:
    target_mean = _num(quote.get("targetMeanPrice") or quote.get("targetMedianPrice"))
    target_high = _num(quote.get("targetHighPrice"))
    target_low = _num(quote.get("targetLowPrice"))
    if target_mean and target_mean > 0:
        return round(target_mean, 2), "analyst", {"high": target_high, "low": target_low}

    adjustment = ((momentum - 50) * 0.0018) + ((trend - 50) * 0.0014) - ((risk - 50) * 0.0011)
    adjustment = max(-0.14, min(0.14, adjustment))
    derived = round(price * (1 + adjustment), 2)
    return derived, "derived", {"high": round(derived * 1.12, 2), "low": round(derived * 0.88, 2)}


def _label_for_trend(score: int) -> str:
    if score >= 72:
        return "Uptrend"
    if score >= 58:
        return "Trend Intact"
    if score >= 42:
        return "Sideways"
    return "Deteriorating"


def _label_for_verdict(score: int) -> str:
    if score >= 78:
        return "Strong Bullish"
    if score >= 62:
        return "Bullish"
    if score >= 48:
        return "Neutral"
    if score >= 35:
        return "Cautious"
    return "Bearish"


def _confidence(sources: dict[str, str], history_count: int, news_fallback: bool) -> int:
    available = sum(1 for value in sources.values() if value == "available")
    partial = sum(1 for value in sources.values() if value == "partial")
    score = 30 + available * 8 + partial * 4
    if history_count >= 120:
        score += 10
    elif history_count >= 45:
        score += 6
    if news_fallback:
        score -= 4
    return _clamp(score)


def _reasons(
    symbol: str,
    momentum: int,
    trend: int,
    sentiment: int,
    risk: int,
    relative_strength: float | None,
    news_available: bool,
) -> list[str]:
    rows: list[str] = []
    rows.append("Price momentum is positive." if momentum >= 58 else "Price momentum is mixed and needs confirmation.")
    rows.append("Trend remains above key moving-average signals." if trend >= 58 else "Trend is not yet confirmed by moving-average signals.")
    if news_available:
        rows.append("Recent news sentiment is constructive." if sentiment >= 58 else "Recent news sentiment is neutral to cautious.")
    else:
        rows.append("News sentiment was unavailable, so a neutral fallback was used.")
    rows.append("Risk is elevated; size defensively." if risk >= 65 else "Risk is controlled enough for normal monitoring.")
    if relative_strength is not None:
        rows.append(f"{symbol} is outperforming SPY over the recent window." if relative_strength >= 1 else f"{symbol} is lagging SPY over the recent window.")
    return rows[:5]


def _history_samples(closes: list[float], spy_closes: list[float], sentiment: int, institutional: int) -> dict[str, list[int]]:
    samples: dict[str, list[int]] = {"sentiment": [sentiment] * 6, "institutional": [institutional] * 6}
    if len(closes) < 45:
        return samples
    momentum_values: list[int] = []
    trend_values: list[int] = []
    risk_values: list[int] = []
    points = [45, 36, 27, 18, 9, 0]
    for offset in points:
        end = len(closes) - offset if offset else len(closes)
        window = closes[:end]
        if len(window) < 30:
            continue
        momentum, _ = _momentum_score(window, spy_closes[: min(len(spy_closes), end)] or spy_closes)
        trend = _trend_score(window)
        risk, _ = _risk_score(window, spy_closes[: min(len(spy_closes), end)] or spy_closes, None)
        momentum_values.append(momentum)
        trend_values.append(trend)
        risk_values.append(risk)
    if len(momentum_values) >= 2:
        samples["momentum"] = momentum_values
    if len(trend_values) >= 2:
        samples["trend"] = trend_values
    if len(risk_values) >= 2:
        samples["risk"] = risk_values
    return samples


def _no_data_response(symbol: str, reason: str, start: float, cache_hit: bool = False) -> dict[str, Any]:
    return {
        "symbol": symbol,
        "data_quality": "no_data",
        "score": None,
        "verdict": "No Data",
        "metrics": {
            "momentum": None,
            "trend": None,
            "sentiment": None,
            "risk": None,
            "relative_strength": None,
            "volatility_30d": None,
            "short_interest_pct": None,
            "institutional_flow_30d": None,
        },
        "reasons": [reason],
        "sources": {
            "price": "missing",
            "history": "missing",
            "volume": "missing",
            "relative_strength": "missing",
            "news": "missing",
            "analyst": "missing",
            "fundamentals": "missing",
            "portfolio": "missing",
        },
        "latency_ms": _latency_ms(start),
        "cache_hit": cache_hit,
        "cache_status": "hit" if cache_hit else "miss",
        "as_of": _now_iso(),
        "error": reason,
    }


def build_ai_intelligence(symbol: str, refresh: bool = False) -> dict[str, Any]:
    start = time.perf_counter()
    clean = _clean_symbol(symbol)
    if not clean or not VALID_SYMBOL_RE.match(clean):
        return _no_data_response(clean or str(symbol), "Invalid ticker symbol.", start)

    cached = _cache_get(_AI_CACHE, clean, AI_TTL_SECONDS, refresh)
    if cached is not None:
        cached["latency_ms"] = _latency_ms(start)
        cached["cache_hit"] = True
        cached["cache_status"] = "hit"
        return cached

    with ThreadPoolExecutor(max_workers=4) as executor:
        symbol_future = executor.submit(_fetch_chart, clean, refresh)
        spy_future = executor.submit(_fetch_chart, "SPY", refresh)
        news_future = executor.submit(_fetch_news_sentiment, clean, refresh)
        quote_future = executor.submit(_fetch_quote, clean, refresh)
        chart = symbol_future.result()
        spy_chart = spy_future.result()
        news = news_future.result()
        quote = quote_future.result()

    closes = chart.get("closes") or []
    volumes = chart.get("volumes") or []
    spy_closes = spy_chart.get("closes") or []
    price = _num(chart.get("price"))
    if price is None or not closes:
        response = _no_data_response(clean, "No price data exists for this ticker.", start)
        _cache_set(_AI_CACHE, clean, response)
        return response

    quote_beta = _num(quote.get("beta"))
    momentum, returns = _momentum_score(closes, spy_closes)
    trend = _trend_score(closes)
    risk, risk_parts = _risk_score(closes, spy_closes, quote_beta)
    relative_strength, relative_strength_score = _relative_strength(closes, spy_closes)
    sentiment = int(news.get("score") or 50)
    institutional, institutional_flow, relative_volume = _volume_flow(closes, volumes, returns.get("price_return_30d"))
    fair_value, fair_value_source, fair_value_range = _fair_value(price, momentum, trend, risk, quote)
    short_interest_pct = _num(quote.get("shortPercentOfFloat"))
    if short_interest_pct is not None and short_interest_pct <= 1:
        short_interest_pct *= 100

    composite = _clamp(
        momentum * 0.27
        + trend * 0.25
        + sentiment * 0.17
        + (100 - risk) * 0.17
        + (relative_strength_score if relative_strength_score is not None else 50) * 0.08
        + institutional * 0.06
    )
    verdict = _label_for_verdict(composite)
    analyst_available = any(_num(quote.get(key)) is not None for key in ("targetMeanPrice", "recommendationMean", "numberOfAnalystOpinions"))
    sources = {
        "price": "available",
        "history": "available" if len(closes) >= 45 else ("partial" if closes else "missing"),
        "volume": _status(any(v > 0 for v in volumes), partial=False),
        "relative_strength": "available" if len(spy_closes) >= 45 else ("partial" if spy_closes else "missing"),
        "news": "available" if news.get("available") else "missing",
        "analyst": "available" if analyst_available else "missing",
        "fundamentals": "available" if quote and not quote.get("error") else "partial",
        "portfolio": "missing",
    }
    confidence = _confidence(sources, len(closes), not bool(news.get("available")))
    data_quality = "full" if len(closes) >= 90 and confidence >= 72 else "partial"
    as_of = _now_iso()
    history = _history_samples(closes, spy_closes, sentiment, institutional)

    metrics = {
        "momentum": momentum,
        "trend": trend,
        "sentiment": sentiment,
        "risk": risk,
        "relative_strength": relative_strength,
        "relative_strength_score": relative_strength_score,
        "volatility_30d": _safe_round(risk_parts.get("volatility_30d"), 2),
        "drawdown_90d": _safe_round(risk_parts.get("drawdown_90d"), 2),
        "beta": _safe_round(risk_parts.get("beta"), 2),
        "short_interest_pct": _safe_round(short_interest_pct, 2),
        "institutional_flow_30d": _safe_round(institutional_flow, 0),
        "institutional_score": institutional,
        "volume_score": institutional,
        "relative_volume_30d": _safe_round(relative_volume, 2),
        "fair_value": fair_value,
        "fair_value_source": fair_value_source,
        "target_high_price": fair_value_range.get("high"),
        "target_low_price": fair_value_range.get("low"),
        "confidence": confidence,
        "current_price": _safe_round(price, 2),
        "price_return_1d": _safe_round(returns.get("price_return_1d"), 2),
        "price_return_5d": _safe_round(returns.get("price_return_5d"), 2),
        "price_return_30d": _safe_round(returns.get("price_return_30d"), 2),
        "price_return_90d": _safe_round(returns.get("price_return_90d"), 2),
        "history": history,
    }

    response = {
        "symbol": clean,
        "data_quality": data_quality,
        "score": composite,
        "verdict": verdict,
        "metrics": metrics,
        "reasons": _reasons(clean, momentum, trend, sentiment, risk, relative_strength, bool(news.get("available"))),
        "sources": sources,
        "latency_ms": _latency_ms(start),
        "cache_hit": False,
        "cache_status": "miss",
        "as_of": as_of,
        "price": _safe_round(price, 2),
        "exchange": chart.get("exchange"),
        "currency": chart.get("currency"),
    }
    _cache_set(_AI_CACHE, clean, response)
    return dict(response)


def build_ai_intelligence_test(symbols: list[str], refresh: bool = False) -> dict[str, Any]:
    start = time.perf_counter()
    cleaned = [_clean_symbol(symbol) for symbol in symbols if _clean_symbol(symbol)]
    cleaned = list(dict.fromkeys(cleaned))[:25]
    results: list[dict[str, Any]] = []

    def run_one(symbol: str) -> dict[str, Any]:
        try:
            payload = build_ai_intelligence(symbol, refresh=refresh)
            metrics = payload.get("metrics") or {}
            return {
                "symbol": payload.get("symbol") or symbol,
                "score": payload.get("score"),
                "verdict": payload.get("verdict"),
                "momentum": metrics.get("momentum"),
                "trend": metrics.get("trend"),
                "sentiment": metrics.get("sentiment"),
                "risk": metrics.get("risk"),
                "data_quality": payload.get("data_quality"),
                "latency_ms": payload.get("latency_ms"),
                "cache_hit": payload.get("cache_hit"),
                "error": payload.get("error"),
            }
        except Exception as exc:
            return {
                "symbol": symbol,
                "score": None,
                "verdict": "No Data",
                "momentum": None,
                "trend": None,
                "sentiment": None,
                "risk": None,
                "data_quality": "no_data",
                "latency_ms": 0,
                "cache_hit": False,
                "error": str(exc),
            }

    with ThreadPoolExecutor(max_workers=min(6, max(1, len(cleaned)))) as executor:
        for result in executor.map(run_one, cleaned):
            results.append(result)

    return {
        "symbols": cleaned,
        "count": len(results),
        "latency_ms": _latency_ms(start),
        "cache_hit_count": sum(1 for row in results if row.get("cache_hit")),
        "results": results,
    }
