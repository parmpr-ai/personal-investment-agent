from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List

import httpx

from services.provider_cache import cached_provider_call

_YAHOO_HEADERS = {"User-Agent": "Mozilla/5.0", "Accept": "application/json,text/plain,*/*"}
_YAHOO_QUOTE_CACHE_SECONDS = 8
_YAHOO_QUOTE_TIMEOUT = 1.1
_DEFAULT_SYMBOLS = ("AMD", "NVDA", "TSM", "SOFI")


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _quote_timestamp(value: Any) -> str | None:
    try:
        if value in (None, ""):
            return None
        ts = float(value)
        if ts > 10_000_000_000:
            ts /= 1000.0
        return datetime.fromtimestamp(ts, timezone.utc).isoformat()
    except Exception:
        return None


def _price_source_label(*, quote_source_name: str | None, quote_age_seconds: float | None) -> str:
    source_name = str(quote_source_name or "").lower()
    if "delayed" in source_name:
        return "YAHOO_DELAYED"
    if quote_age_seconds is not None and quote_age_seconds > 120:
        return "YAHOO_DELAYED"
    return "YAHOO_LIVE"


def _normalize_symbol(symbol: str) -> str:
    return str(symbol or "").strip().upper().split()[0]


def _batch_key(symbols: Iterable[str]) -> str:
    cleaned = [_normalize_symbol(symbol) for symbol in symbols if _normalize_symbol(symbol)]
    return ",".join(sorted(dict.fromkeys(cleaned)))


def _fetch_yahoo_quote_batch(symbols: List[str]) -> Dict[str, Any]:
    cleaned = [_normalize_symbol(symbol) for symbol in symbols if _normalize_symbol(symbol)]
    cleaned = list(dict.fromkeys(cleaned))
    started = time.perf_counter()
    now = time.time()
    if not cleaned:
        return {
            "source": "YAHOO",
            "status": "missing",
            "available": False,
            "pricesLive": False,
            "activePriceProvider": "STALE",
            "symbols": [],
            "quotes": {},
            "quoteCount": 0,
            "lastQuoteTimestamp": None,
            "latencyMs": round((time.perf_counter() - started) * 1000, 1),
            "checkedAt": _utc_now_iso(),
        }
    try:
        response = httpx.get(
            "https://query1.finance.yahoo.com/v7/finance/quote",
            params={"symbols": ",".join(cleaned), "formatted": "false"},
            timeout=_YAHOO_QUOTE_TIMEOUT,
            headers=_YAHOO_HEADERS,
        )
        response.raise_for_status()
        data = response.json()
        raw_quotes = (data.get("quoteResponse") or {}).get("result") or []
    except Exception as exc:
        return {
            "source": "YAHOO",
            "status": "partial",
            "available": False,
            "pricesLive": False,
            "activePriceProvider": "STALE",
            "symbols": cleaned,
            "quotes": {},
            "quoteCount": 0,
            "lastQuoteTimestamp": None,
            "latencyMs": round((time.perf_counter() - started) * 1000, 1),
            "error": str(exc),
            "checkedAt": _utc_now_iso(),
        }

    quotes: Dict[str, Dict[str, Any]] = {}
    quote_timestamps: List[str] = []
    for raw in raw_quotes:
        symbol = _normalize_symbol(raw.get("symbol"))
        if not symbol:
            continue
        last = raw.get("regularMarketPrice")
        previous_close = raw.get("regularMarketPreviousClose") or raw.get("previousClose") or raw.get("chartPreviousClose")
        quote_timestamp = _quote_timestamp(raw.get("regularMarketTime") or raw.get("postMarketTime") or raw.get("preMarketTime"))
        quote_age_seconds = None
        if quote_timestamp:
            try:
                quote_age_seconds = max(0.0, (datetime.now(timezone.utc) - datetime.fromisoformat(quote_timestamp.replace("Z", "+00:00"))).total_seconds())
            except Exception:
                quote_age_seconds = None
        price_source = _price_source_label(
            quote_source_name=str(raw.get("quoteSourceName") or ""),
            quote_age_seconds=quote_age_seconds,
        )
        day_change = None
        day_change_pct = None
        try:
            if last is not None and previous_close not in (None, 0, ""):
                last_f = float(last)
                prev_f = float(previous_close)
                day_change = round(last_f - prev_f, 2)
                day_change_pct = round(((last_f - prev_f) / prev_f) * 100, 2)
        except Exception:
            day_change = None
            day_change_pct = None
        is_live_quote = price_source == "YAHOO_LIVE"
        quotes[symbol] = {
            "symbol": symbol,
            "last": float(last) if last is not None else None,
            "previousClose": float(previous_close) if previous_close not in (None, "") else None,
            "dayChange": day_change,
            "dayChangePercent": day_change_pct,
            "quoteTimestamp": quote_timestamp or _utc_now_iso(),
            "quoteAgeSeconds": quote_age_seconds,
            "priceSource": price_source,
            "quoteSource": price_source,
            "isLiveQuote": is_live_quote,
            "quoteStale": False,
            "quoteStaleReason": None,
            "marketState": raw.get("marketState"),
            "quoteSourceName": raw.get("quoteSourceName"),
            "exchange": raw.get("fullExchangeName") or raw.get("exchange"),
            "currency": raw.get("currency"),
            "source": "YAHOO",
            "raw": raw,
        }
        if quotes[symbol]["quoteTimestamp"]:
            quote_timestamps.append(quotes[symbol]["quoteTimestamp"])

    available = bool(quotes)
    last_quote_timestamp = None
    if quote_timestamps:
        try:
            last_quote_timestamp = max(datetime.fromisoformat(ts.replace("Z", "+00:00")) for ts in quote_timestamps).isoformat()
        except Exception:
            last_quote_timestamp = max(quote_timestamps)

    return {
        "source": "YAHOO",
        "status": "ok" if available else "missing",
        "available": available,
        "pricesLive": available,
        "activePriceProvider": "YAHOO" if available else "STALE",
        "symbols": cleaned,
        "quotes": quotes,
        "quoteCount": len(quotes),
        "lastQuoteTimestamp": last_quote_timestamp,
        "latencyMs": round((time.perf_counter() - started) * 1000, 1),
        "checkedAt": _utc_now_iso(),
    }


def get_yahoo_live_quotes(symbols: Iterable[str], *, refresh: bool = False, wait_timeout_seconds: float | None = None) -> Dict[str, Any]:
    cleaned = [_normalize_symbol(symbol) for symbol in symbols if _normalize_symbol(symbol)]
    key = _batch_key(cleaned)
    fallback = {
        "source": "YAHOO",
        "status": "partial",
        "available": False,
        "pricesLive": False,
        "activePriceProvider": "STALE",
        "symbols": cleaned,
        "quotes": {},
        "quoteCount": 0,
        "lastQuoteTimestamp": None,
        "latencyMs": 0.0,
        "checkedAt": _utc_now_iso(),
    }
    return cached_provider_call(
        "yahoo-live-quotes",
        key or "DEFAULT",
        _YAHOO_QUOTE_CACHE_SECONDS,
        lambda: _fetch_yahoo_quote_batch(cleaned or list(_DEFAULT_SYMBOLS)),
        wait_timeout_seconds=wait_timeout_seconds if wait_timeout_seconds is not None else 0.85,
        fallback=fallback,
        refresh=refresh,
    )


def get_yahoo_live_quote(symbol: str, *, refresh: bool = False, wait_timeout_seconds: float | None = None) -> Dict[str, Any]:
    result = get_yahoo_live_quotes([symbol], refresh=refresh, wait_timeout_seconds=wait_timeout_seconds)
    symbol_key = _normalize_symbol(symbol)
    quote = (result.get("quotes") or {}).get(symbol_key) if isinstance(result.get("quotes"), dict) else None
    if quote:
        return quote
    return {
        "symbol": symbol_key,
        "last": None,
        "previousClose": None,
        "dayChange": None,
        "dayChangePercent": None,
        "quoteTimestamp": None,
        "quoteAgeSeconds": None,
        "priceSource": "STALE",
        "quoteSource": "STALE",
        "isLiveQuote": False,
        "quoteStale": True,
        "quoteStaleReason": "Yahoo Finance quote unavailable.",
        "source": "YAHOO",
    }


def get_price_provider_status(symbols: Iterable[str] | None = None, *, refresh: bool = False) -> Dict[str, Any]:
    checked_symbols = list(symbols) if symbols else list(_DEFAULT_SYMBOLS)
    yahoo = get_yahoo_live_quotes(checked_symbols, refresh=refresh, wait_timeout_seconds=0.75)
    return {
        "yahoo": {
            "available": bool(yahoo.get("available")),
            "pricesLive": bool(yahoo.get("pricesLive")),
            "latencyMs": yahoo.get("latencyMs"),
            "status": yahoo.get("status"),
            "lastQuoteTimestamp": yahoo.get("lastQuoteTimestamp"),
            "quoteCount": yahoo.get("quoteCount"),
            "symbols": yahoo.get("symbols"),
        },
        "activePriceProvider": yahoo.get("activePriceProvider"),
        "quoteCount": yahoo.get("quoteCount"),
        "lastQuoteTimestamp": yahoo.get("lastQuoteTimestamp"),
    }

