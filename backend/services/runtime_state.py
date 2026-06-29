"""
Provider Runtime State Machine — ARTEMIS-PORTFOLIO-RUNTIME-064

Single source of truth for the active portfolio provider lifecycle.
Imported by portfolio_providers.py and provider_manager.py; no imports from either.

States:
  NONE       — server startup, no provider resolution yet
  SNAPSHOT   — serving from saved IBKR snapshot (or mock)
  CONNECTING — transitional; gateway probe in progress
  LIVE       — IBKR_LIVE is the active provider and healthy
  DEGRADED   — was LIVE; gateway went offline; using fallback
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from typing import Any, Dict, Optional

_LOG = logging.getLogger("uvicorn.error")

# ── State constants ────────────────────────────────────────────────────────────
NONE       = "NONE"
SNAPSHOT   = "SNAPSHOT"
CONNECTING = "CONNECTING"
LIVE       = "LIVE"
DEGRADED   = "DEGRADED"

_LOCK = threading.RLock()

_STATE: Dict[str, Any] = {
    "state": NONE,
    "active_source": None,
    "configured_mode": None,
    "provider_class": None,
    "promotion_count": 0,
    "last_promotion": None,
    "provider_generation": 0,
    "provider_timestamp": None,
    "canonical_version": 0,
    "portfolio_timestamp": None,
    "quote_timestamp": None,
    "cache_invalidated_at": None,
}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_state() -> Dict[str, Any]:
    """Return a copy of the current runtime state (thread-safe, read-only)."""
    with _LOCK:
        return dict(_STATE)


def current_state() -> str:
    """Return the current state string."""
    with _LOCK:
        return _STATE["state"]


def is_live() -> bool:
    """True if the current runtime state is LIVE."""
    with _LOCK:
        return _STATE["state"] == LIVE


def on_resolution(
    *,
    active_source: str,
    is_live: bool,
    configured_mode: str,
    provider_class: str,
    fallback_active: bool,
    quote_degraded: bool = False,
) -> bool:
    """
    Update runtime state based on a completed provider resolution.
    Returns True if a state transition actually occurred (caller should act on this).
    Thread-safe; does not hold any external lock.
    """
    with _LOCK:
        current = _STATE["state"]
        if is_live:
            new_state = DEGRADED if quote_degraded else LIVE
        elif fallback_active and current in (LIVE, DEGRADED):
            new_state = SNAPSHOT
        else:
            new_state = SNAPSHOT

        if current == new_state:
            return False

        old_state = current
        _STATE["state"] = new_state
        _STATE["provider_timestamp"] = _utc_now()
        _STATE["active_source"] = active_source
        _STATE["configured_mode"] = configured_mode
        _STATE["provider_class"] = provider_class
        if new_state == LIVE:
            _STATE["promotion_count"] = (_STATE.get("promotion_count") or 0) + 1
            _STATE["last_promotion"] = _STATE["provider_timestamp"]
            _STATE["provider_generation"] = (_STATE.get("provider_generation") or 0) + 1

    _LOG.info(
        "[RUNTIME_TRANSITION] %s → %s active_source=%s configured_mode=%s",
        old_state, new_state, active_source, configured_mode,
    )
    return True


def next_canonical_version(
    *,
    portfolio_timestamp: Optional[str] = None,
    quote_timestamp: Optional[str] = None,
) -> int:
    """Increment and return the canonical DTO version. Call once per get_canonical_portfolio()."""
    with _LOCK:
        _STATE["canonical_version"] = (_STATE.get("canonical_version") or 0) + 1
        if portfolio_timestamp:
            _STATE["portfolio_timestamp"] = portfolio_timestamp
        if quote_timestamp:
            _STATE["quote_timestamp"] = quote_timestamp
        return _STATE["canonical_version"]


def mark_cache_invalidated() -> None:
    """Record that route-level caches were just cleared."""
    with _LOCK:
        _STATE["cache_invalidated_at"] = _utc_now()
