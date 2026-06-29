"""Central quote cache and provider selection for portfolio pricing.

QuoteEngine is intentionally independent from portfolio calculations. It owns
provider priority, last-known quote cache, quote freshness metadata, and the
instrument identity rule that options are priced only by contract id.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

_LOG = logging.getLogger("pia.quote_engine")

_LIVE_SOURCES = frozenset({"IBKR_LIVE", "YAHOO_LIVE", "YAHOO_DELAYED"})
_STALE_SOURCES = frozenset({"LAST_KNOWN", "NO_DATA"})
_IBKR_SOURCES = frozenset({"IBKR_LIVE", "IBKR_MARKETDATA", "IBKR_MARKETDATA_SNAPSHOT"})


@dataclass
class Quote:
    symbol: str
    last: float
    conid: Optional[str] = None
    asset_type: str = "STK"
    currency: Optional[str] = None
    bid: Optional[float] = None
    ask: Optional[float] = None
    previous_close: Optional[float] = None
    change: Optional[float] = None
    change_pct: Optional[float] = None
    market_state: Optional[str] = None
    source: str = "NO_DATA"
    provider: str = "NO_DATA"
    timestamp: Optional[str] = None
    fetched_at: float = field(default_factory=time.time)

    @property
    def is_live(self) -> bool:
        return self.source in _LIVE_SOURCES

    @property
    def age_seconds(self) -> float:
        return time.time() - self.fetched_at


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _f(value: Any) -> Optional[float]:
    try:
        if value in (None, ""):
            return None
        parsed = float(value)
        return None if parsed != parsed else parsed
    except (TypeError, ValueError):
        return None


def _normalize_instrument(item: Dict[str, Any]) -> Dict[str, str]:
    raw_asset = str(
        item.get("assetClass")
        or item.get("asset_type")
        or item.get("sec_type")
        or item.get("assetType")
        or "STK"
    ).upper()
    if raw_asset in {"OPT", "OPTION", "OPTIONS"}:
        asset_type = "OPT"
    elif raw_asset in {"CRYPTO", "CASHCRYPTO"}:
        asset_type = "CRYPTO"
    elif raw_asset in {"ETF", "FUND"}:
        asset_type = "ETF"
    else:
        asset_type = "STK"
    symbol = str(item.get("symbol") or item.get("underlying") or item.get("ticker") or "").upper().split()[0]
    return {
        "conid": str(item.get("conid") or item.get("conId") or item.get("contractId") or "").strip(),
        "symbol": symbol,
        "asset_type": asset_type,
        "currency": str(item.get("currency") or "USD").upper(),
    }


def quote_key_for_instrument(item: Dict[str, Any]) -> str:
    inst = _normalize_instrument(item)
    conid = inst["conid"]
    symbol = inst["symbol"]
    if inst["asset_type"] == "OPT":
        return f"CONID:{conid}" if conid else "OPT:NO_CONID"
    return f"CONID:{conid}" if conid else symbol


class QuoteEngine:
    """Priority-ordered market data engine with one in-memory quote cache."""

    def __init__(self) -> None:
        self._last_known: Dict[str, Quote] = {}
        self._active_provider = "NO_DATA"
        self._provider_failures: Dict[str, int] = {"IBKR": 0, "YAHOO": 0, "LAST_KNOWN": 0}
        self._provider_retries: Dict[str, int] = {"IBKR": 0, "YAHOO": 0, "LAST_KNOWN": 0}
        self._last_status: Dict[str, Any] = {
            "activeProvider": "NO_DATA",
            "quoteSource": "NO_DATA",
            "quoteLatencyMs": None,
            "retryDelaySeconds": 0.0,
            "retryCount": 0,
            "failureCount": 0,
            "failedSymbols": [],
            "successfulSymbols": [],
            "lastRefresh": None,
            "quoteFreshnessSeconds": None,
        }

    def _record_status(
        self,
        *,
        provider: str,
        latency_ms: float,
        quote_map: Dict[str, Quote],
        requested: List[Dict[str, str]],
        failure_reasons: Dict[str, str],
    ) -> None:
        requested_symbols = sorted({item["symbol"] for item in requested if item.get("symbol")})
        successful_symbols = sorted(
            {
                (quote.symbol or "").upper()
                for quote in quote_map.values()
                if quote.symbol
            }
        )
        failed_symbols = sorted(symbol for symbol in requested_symbols if symbol not in successful_symbols)
        quote_freshness = None
        if quote_map:
            quote_freshness = round(max(quote.age_seconds for quote in quote_map.values()), 3)
        primary_provider = "LAST_KNOWN" if provider == "NO_DATA" and quote_map else provider
        if primary_provider in {"IBKR_LIVE", "HYBRID"}:
            self._provider_failures["IBKR"] = 0
            self._provider_retries["IBKR"] = 0
        elif any(item.get("reason") == "ibkr_unavailable" for item in [{"reason": reason} for reason in failure_reasons.values()]):
            self._provider_failures["IBKR"] += 1
            self._provider_retries["IBKR"] += 1
        if primary_provider in {"YAHOO_LIVE", "HYBRID"}:
            self._provider_failures["YAHOO"] = 0
            self._provider_retries["YAHOO"] = 0
        elif any(item.get("reason") == "yahoo_unavailable" for item in [{"reason": reason} for reason in failure_reasons.values()]):
            self._provider_failures["YAHOO"] += 1
            self._provider_retries["YAHOO"] += 1
        retry_delay = 0.0
        if failed_symbols and primary_provider in {"LAST_KNOWN", "NO_DATA"}:
            retry_delay = 5.0
        elif primary_provider == "YAHOO_LIVE" and self._provider_retries["IBKR"] > 0:
            retry_delay = 2.0
        self._last_status = {
            "activeProvider": primary_provider,
            "quoteSource": primary_provider,
            "quoteLatencyMs": latency_ms,
            "retryDelaySeconds": retry_delay,
            "retryCount": max(self._provider_retries.values()) if self._provider_retries else 0,
            "failureCount": sum(self._provider_failures.values()),
            "failedSymbols": failed_symbols,
            "successfulSymbols": successful_symbols,
            "lastRefresh": _utc_now_iso(),
            "quoteFreshnessSeconds": quote_freshness,
            "failureReasons": failure_reasons,
            "providerFailures": dict(self._provider_failures),
            "providerRetries": dict(self._provider_retries),
        }

    def get_quotes(
        self,
        symbols: List[str],
        *,
        ibkr_positions: Optional[List[Dict[str, Any]]] = None,
    ) -> Tuple[Dict[str, Quote], str]:
        instruments = [{"symbol": symbol, "assetClass": "STK"} for symbol in symbols]
        return self.get_quotes_for_instruments(instruments, ibkr_positions=ibkr_positions)

    def get_quotes_for_instruments(
        self,
        instruments: Iterable[Dict[str, Any]],
        *,
        ibkr_positions: Optional[List[Dict[str, Any]]] = None,
    ) -> Tuple[Dict[str, Quote], str]:
        started = time.time()
        requested = [_normalize_instrument(item) for item in instruments]
        quote_map: Dict[str, Quote] = {}
        provider = "NO_DATA"
        failure_reasons: Dict[str, str] = {}

        if ibkr_positions:
            for position in ibkr_positions:
                inst = _normalize_instrument(position)
                symbol = inst["symbol"]
                last = _f(position.get("last") or position.get("mktPrice"))
                quote_source = str(position.get("priceSource") or position.get("quoteSource") or "").upper()
                quote_stale = bool(position.get("quoteStale"))
                if not symbol or last is None:
                    continue
                if quote_stale or quote_source not in _IBKR_SOURCES:
                    failure_reasons.setdefault(symbol, "ibkr_unavailable")
                    continue
                qty = _f(position.get("qty") or position.get("quantity") or 1) or 1.0
                multiplier = _f(position.get("multiplier") or 1) or 1.0
                raw_day_change = _f(position.get("day_change"))
                raw_day_pnl = _f(position.get("day_pnl"))
                change = raw_day_change
                if change is None and raw_day_pnl is not None and qty and multiplier:
                    change = raw_day_pnl / (qty * multiplier)
                quote = Quote(
                    symbol=symbol,
                    conid=inst["conid"] or None,
                    asset_type=inst["asset_type"],
                    currency=inst["currency"],
                    last=last,
                    bid=_f(position.get("bid")),
                    ask=_f(position.get("ask")),
                    previous_close=_f(position.get("previousClose") or position.get("prevClose") or position.get("closePrice")),
                    change=change,
                    change_pct=_f(position.get("day_change_pct") or position.get("day_pnl_pct")),
                    market_state=position.get("marketState"),
                    source="IBKR_LIVE",
                    provider="IBKR",
                    timestamp=position.get("quoteLastRefresh") or _utc_now_iso(),
                )
                key = quote_key_for_instrument(inst)
                quote_map[key] = quote
                self._last_known[key] = quote
                if inst["asset_type"] != "OPT":
                    self._last_known[symbol] = quote
            if quote_map:
                provider = "IBKR_LIVE"

        missing_yahoo_symbols = []
        for item in requested:
            key = quote_key_for_instrument(item)
            if key in quote_map or item["asset_type"] == "OPT" or not item["symbol"]:
                continue
            missing_yahoo_symbols.append(item["symbol"])
        missing_yahoo_symbols = list(dict.fromkeys(missing_yahoo_symbols))
        if missing_yahoo_symbols:
            yahoo_quotes = _fetch_yahoo(missing_yahoo_symbols)
            for symbol, quote in yahoo_quotes.items():
                quote_map[symbol] = quote
                self._last_known[symbol] = quote
                if symbol in failure_reasons:
                    failure_reasons.pop(symbol, None)
            for item in requested:
                if item["asset_type"] == "OPT" or not item["symbol"]:
                    continue
                key = quote_key_for_instrument(item)
                if key in quote_map:
                    continue
                yahoo_quote = yahoo_quotes.get(item["symbol"])
                if yahoo_quote:
                    quote_map[key] = yahoo_quote
            if yahoo_quotes:
                provider = "HYBRID" if provider == "IBKR_LIVE" else "YAHOO_LIVE"
            for symbol in missing_yahoo_symbols:
                if symbol not in yahoo_quotes:
                    failure_reasons.setdefault(symbol, "yahoo_unavailable")

        for item in requested:
            key = quote_key_for_instrument(item)
            if key in quote_map:
                continue
            candidates = [key]
            if item["asset_type"] != "OPT" and item["symbol"]:
                candidates.append(item["symbol"])
            cached_key = next((candidate for candidate in candidates if candidate in self._last_known), None)
            if not cached_key:
                continue
            cached = self._last_known[cached_key]
            quote_map[key] = Quote(
                symbol=cached.symbol,
                conid=cached.conid,
                asset_type=cached.asset_type,
                currency=cached.currency,
                last=cached.last,
                bid=cached.bid,
                ask=cached.ask,
                previous_close=cached.previous_close,
                change=cached.change,
                change_pct=cached.change_pct,
                market_state=cached.market_state,
                source="LAST_KNOWN",
                provider=cached.provider,
                timestamp=cached.timestamp,
                fetched_at=cached.fetched_at,
            )
            if item["symbol"]:
                failure_reasons.pop(item["symbol"], None)

        if provider == "NO_DATA" and quote_map:
            provider = "LAST_KNOWN"

        latency_ms = round((time.time() - started) * 1000, 1)
        live_count = sum(1 for quote in quote_map.values() if quote.source not in _STALE_SOURCES)
        self._record_status(
            provider=provider,
            latency_ms=latency_ms,
            quote_map=quote_map,
            requested=requested,
            failure_reasons=failure_reasons,
        )
        if provider != self._active_provider:
            _LOG.info("[PROVIDER_SWITCH] source=%s destination=%s reason=quote_provider_change", self._active_provider, provider)
            self._active_provider = provider
        _LOG.info("[QUOTE_REFRESH] provider=%s instruments=%s quotes_updated=%s latency_ms=%s", provider, len(requested), live_count, latency_ms)
        _LOG.debug("[QUOTE_CACHE] provider=%s cache_size=%s", provider, len(self._last_known))
        return quote_map, provider

    def prime_cache(self, positions: List[Dict[str, Any]]) -> None:
        for position in positions:
            inst = _normalize_instrument(position)
            symbol = inst["symbol"]
            last = _f(position.get("last") or position.get("mktPrice"))
            if not symbol or last is None:
                continue
            quote = Quote(
                symbol=symbol,
                conid=inst["conid"] or None,
                asset_type=inst["asset_type"],
                currency=inst["currency"],
                last=last,
                previous_close=_f(position.get("previousClose") or position.get("prevClose")),
                change=_f(position.get("day_change")),
                change_pct=_f(position.get("day_change_pct")),
                source="LAST_KNOWN",
                provider=str(position.get("quoteSource") or position.get("priceSource") or "LAST_KNOWN"),
                timestamp=position.get("quoteLastRefresh"),
            )
            key = quote_key_for_instrument(inst)
            self._last_known.setdefault(key, quote)
            if inst["asset_type"] != "OPT":
                self._last_known.setdefault(symbol, quote)

    def cache_snapshot(self) -> Dict[str, Any]:
        now = time.time()
        return {
            "activeProvider": self._active_provider,
            "status": dict(self._last_status),
            "quoteCount": len(self._last_known),
            "items": [
                {
                    "key": key,
                    "conid": quote.conid,
                    "symbol": quote.symbol,
                    "assetType": quote.asset_type,
                    "currency": quote.currency,
                    "lastPrice": quote.last,
                    "bid": quote.bid,
                    "ask": quote.ask,
                    "previousClose": quote.previous_close,
                    "change": quote.change,
                    "changePercent": quote.change_pct,
                    "marketState": quote.market_state,
                    "timestamp": quote.timestamp,
                    "provider": quote.provider or quote.source,
                    "source": quote.source,
                    "quoteAge": round(now - quote.fetched_at, 3),
                }
                for key, quote in sorted(self._last_known.items())
            ],
        }

    def diagnostics_snapshot(self) -> Dict[str, Any]:
        return {
            **dict(self._last_status),
            "activeProvider": self._active_provider,
            "quoteCount": len(self._last_known),
        }


def _fetch_yahoo(symbols: List[str]) -> Dict[str, Quote]:
    try:
        from services.portfolio_providers import get_yahoo_live_quotes

        bundle = get_yahoo_live_quotes(symbols, wait_timeout_seconds=0.45)
        raw = (bundle or {}).get("quotes") if isinstance(bundle, dict) else {}
        if not isinstance(raw, dict):
            return {}
        result: Dict[str, Quote] = {}
        for symbol, data in raw.items():
            if not isinstance(data, dict):
                continue
            last = _f(data.get("last") or data.get("regularMarketPrice"))
            if last is None:
                continue
            source = "YAHOO_LIVE" if data.get("isLiveQuote") else "YAHOO_DELAYED"
            result[symbol.upper()] = Quote(
                symbol=symbol.upper(),
                last=last,
                previous_close=_f(data.get("previousClose")),
                change=_f(data.get("dayChange") or data.get("regularMarketChange")),
                change_pct=_f(data.get("dayChangePercent") or data.get("regularMarketChangePercent")),
                market_state=data.get("marketState"),
                currency=data.get("currency"),
                source=source,
                provider="YAHOO",
                timestamp=data.get("quoteTimestamp"),
            )
        return result
    except Exception as exc:
        _LOG.warning("[QUOTE_REFRESH] provider=YAHOO status=error error=%s", exc)
        return {}
