"""Market data engine facade for the portfolio stack.

Portfolio code calls this module for market prices. Provider details, cache
identity, session labels, and fallback behavior stay out of portfolio
calculation code.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

from services.quote_engine import Quote, QuoteEngine

_LOG = logging.getLogger("pia.market_data_engine")

_ENGINE = QuoteEngine()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _market_session(now: Optional[datetime] = None) -> Tuple[str, str]:
    current = now or _utc_now()
    # US Eastern is UTC-4 during the current summer release window. This is a
    # pragmatic label until a trading-calendar dependency is introduced.
    eastern_hour = (current.hour - 4) % 24
    minute = current.minute
    minutes = eastern_hour * 60 + minute
    if 4 * 60 <= minutes < 9 * 60 + 30:
        return "PREMARKET", "OPEN"
    if 9 * 60 + 30 <= minutes < 16 * 60:
        return "REGULAR", "OPEN"
    if 16 * 60 <= minutes < 20 * 60:
        return "AFTER_HOURS", "OPEN"
    return "CLOSED", "CLOSED"


class MarketDataEngine:
    """Single market-data entry point used by portfolio and diagnostics."""

    def get_quotes(
        self,
        instruments: Iterable[Dict[str, Any]],
        *,
        ibkr_positions: Optional[List[Dict[str, Any]]] = None,
    ) -> Tuple[Dict[str, Quote], Dict[str, Any]]:
        started = time.time()
        market_session, market_status = _market_session()
        quote_map, provider = _ENGINE.get_quotes_for_instruments(instruments, ibkr_positions=ibkr_positions)
        quote_ages = [quote.age_seconds for quote in quote_map.values()]
        quote_age = round(max(quote_ages), 3) if quote_ages else None
        latency_ms = round((time.time() - started) * 1000, 1)
        meta = {
            "provider": provider,
            "marketSession": market_session,
            "marketStatus": market_status,
            "quoteAge": quote_age,
            "quoteCount": len(quote_map),
            "latencyMs": latency_ms,
            "timestamp": _utc_now().isoformat(),
            "cache": _ENGINE.cache_snapshot(),
        }
        _LOG.info(
            "[MARKET_SESSION] session=%s status=%s provider=%s quotes=%s latency_ms=%s",
            market_session,
            market_status,
            provider,
            len(quote_map),
            latency_ms,
        )
        return quote_map, meta

    def prime_cache(self, positions: List[Dict[str, Any]]) -> None:
        _ENGINE.prime_cache(positions)

    def cache_snapshot(self) -> Dict[str, Any]:
        return _ENGINE.cache_snapshot()


market_data_engine = MarketDataEngine()
