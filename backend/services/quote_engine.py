"""
Quote Engine — ARTEMIS-PORTFOLIO-ENGINE-REFACTOR-061

Single source of all market prices. Maintains a last-known price cache so
provider transitions (IBKR → Yahoo or vice-versa) are seamless.

Provider priority:
  1. IBKR Live   — prices embedded in normalized positions from _load_bundle()
  2. Yahoo Finance — live/delayed quotes for STK, ETF, CRYPTO
  3. Last Known  — cached prices from the current server session
  4. NO_DATA      — no price available (options with no IBKR + cold start)

Emits structured log events: [QUOTE_PROVIDER], [PROVIDER_SWITCH]
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Any

_LOG = logging.getLogger("pia.quote_engine")

_LIVE_SOURCES = frozenset({"IBKR_LIVE", "YAHOO_LIVE", "YAHOO_DELAYED"})
_STALE_SOURCES = frozenset({"LAST_KNOWN", "NO_DATA"})


@dataclass
class Quote:
    symbol: str
    last: float
    # Per-share/per-contract price change from previous close
    change: Optional[float] = None
    change_pct: Optional[float] = None
    source: str = "NO_DATA"
    fetched_at: float = field(default_factory=time.time)

    @property
    def is_live(self) -> bool:
        return self.source in _LIVE_SOURCES

    @property
    def age_seconds(self) -> float:
        return time.time() - self.fetched_at


def _f(v: Any) -> Optional[float]:
    """Safe float conversion; returns None for None/NaN."""
    try:
        f = float(v)
        return None if f != f else f  # NaN guard
    except (TypeError, ValueError):
        return None


class QuoteEngine:
    """
    Priority-ordered market data provider.
    One instance per server process — preserves last-known price cache across requests.
    """

    def __init__(self) -> None:
        self._last_known: Dict[str, Quote] = {}
        self._active_provider: str = "NO_DATA"

    def get_quotes(
        self,
        symbols: List[str],
        *,
        ibkr_positions: Optional[List[Dict]] = None,
    ) -> Tuple[Dict[str, Quote], str]:
        """
        Return (quote_map, provider_name) for the given symbols.

        Provider priority:
          1. IBKR Live — extract `last` + `day_pnl` from normalized positions
          2. Yahoo Finance — for symbols missing from IBKR (or snapshot-only mode)
          3. Last Known — cached prices from this server session
          4. NO_DATA
        """
        t0 = time.time()
        quote_map: Dict[str, Quote] = {}
        provider = "NO_DATA"
        syms = [s.upper().split()[0] for s in symbols if s]

        # ── Priority 1: IBKR Live prices ──────────────────────────────────────
        if ibkr_positions:
            for pos in ibkr_positions:
                sym = str(pos.get("symbol") or pos.get("underlying") or "").upper().split()[0]
                last = _f(pos.get("last") or pos.get("mktPrice"))
                if not sym or not last:
                    continue
                qty = _f(pos.get("qty") or pos.get("quantity") or 1) or 1.0
                mult = _f(pos.get("multiplier") or 1) or 1.0
                # day_pnl is total $ P&L for the position; convert to per-share change
                raw_pnl = _f(pos.get("day_pnl") or pos.get("day_change"))
                change = (raw_pnl / (qty * mult)) if raw_pnl is not None else None
                change_pct = _f(pos.get("day_pnl_pct") or pos.get("day_change_pct"))
                q = Quote(
                    symbol=sym, last=last, change=change,
                    change_pct=change_pct, source="IBKR_LIVE",
                )
                quote_map[sym] = q
                self._last_known[sym] = q
            if quote_map:
                provider = "IBKR_LIVE"

        # ── Priority 2: Yahoo Finance for missing symbols ─────────────────────
        missing = [s for s in syms if s and s not in quote_map]
        if missing:
            yahoo = _fetch_yahoo(missing)
            for sym, q in yahoo.items():
                quote_map[sym] = q
                self._last_known[sym] = q
            if yahoo:
                provider = "HYBRID" if provider == "IBKR_LIVE" else "YAHOO_LIVE"

        # ── Priority 3: Last Known prices from cache ───────────────────────────
        for sym in syms:
            if sym and sym not in quote_map and sym in self._last_known:
                cached = self._last_known[sym]
                quote_map[sym] = Quote(
                    symbol=sym,
                    last=cached.last,
                    change=cached.change,
                    change_pct=cached.change_pct,
                    source="LAST_KNOWN",
                    fetched_at=cached.fetched_at,
                )

        # ── Observability ──────────────────────────────────────────────────────
        latency_ms = round((time.time() - t0) * 1000, 1)
        live_count = sum(1 for q in quote_map.values() if q.source not in _STALE_SOURCES)

        if provider != self._active_provider:
            _LOG.info(
                "[PROVIDER_SWITCH] source=%s destination=%s reason=quote_provider_change",
                self._active_provider, provider,
            )
            self._active_provider = provider

        _LOG.info(
            "[QUOTE_PROVIDER] provider=%s symbols=%s quotes_updated=%s latency_ms=%s",
            provider, len(syms), live_count, latency_ms,
        )
        return quote_map, provider

    def prime_cache(self, positions: List[Dict]) -> None:
        """
        Pre-populate last-known cache from snapshot positions' stored prices.
        Called when loading snapshot so options have a price of last record.
        Prices are tagged LAST_KNOWN so consumers know they may be stale.
        """
        for pos in positions:
            sym = str(pos.get("symbol") or pos.get("underlying") or "").upper().split()[0]
            last = _f(pos.get("last") or pos.get("mktPrice"))
            if not sym or not last or sym in self._last_known:
                continue
            self._last_known[sym] = Quote(
                symbol=sym,
                last=last,
                change=_f(pos.get("day_pnl") or pos.get("day_change")),
                change_pct=_f(pos.get("day_pnl_pct") or pos.get("day_change_pct")),
                source="LAST_KNOWN",
            )


def _fetch_yahoo(symbols: List[str]) -> Dict[str, "Quote"]:
    """Fetch quotes from Yahoo Finance. Returns {SYMBOL: Quote}."""
    try:
        from services.portfolio_providers import get_yahoo_live_quotes
        bundle = get_yahoo_live_quotes(symbols, wait_timeout_seconds=2.5)
        raw = (bundle or {}).get("quotes") if isinstance(bundle, dict) else {}
        if not isinstance(raw, dict):
            return {}
        result: Dict[str, Quote] = {}
        for sym, data in raw.items():
            if not isinstance(data, dict):
                continue
            last = _f(data.get("last") or data.get("regularMarketPrice"))
            if not last:
                continue
            change = _f(data.get("dayChange") or data.get("regularMarketChange"))
            change_pct = _f(data.get("dayChangePercent") or data.get("regularMarketChangePercent"))
            src = "YAHOO_LIVE" if data.get("isLiveQuote") else "YAHOO_DELAYED"
            result[sym.upper()] = Quote(
                symbol=sym.upper(), last=last, change=change, change_pct=change_pct, source=src,
            )
        return result
    except Exception as exc:
        _LOG.warning("[QUOTE_ENGINE] Yahoo fetch error: %s", exc)
        return {}
