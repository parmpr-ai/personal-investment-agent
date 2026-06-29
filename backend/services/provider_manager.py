"""
Provider Manager — ARTEMIS-PORTFOLIO-ENGINE-REFACTOR-061

Deterministic portfolio pipeline.  All portfolio data requests flow through
get_canonical_portfolio(); no caller computes values independently.

Pipeline:
  Provider (IBKR / Snapshot / Mock)
    → QuoteEngine   (IBKR_LIVE | YAHOO | LAST_KNOWN | NO_DATA)
      → PortfolioCalculator  (positions + quotes + ibkr_summary → DTO)
        → Canonical Portfolio DTO  → all consumers

Provider priority (mirrors resolve_portfolio_provider):
  IBKR Live  →  Snapshot + Yahoo  →  Demo

Emits structured log events:
  [SNAPSHOT_LOAD]   — snapshot loaded with age + position count
  [PROVIDER_SWITCH] — provider changed (reason included)
  [CANONICAL_DTO]   — final DTO produced (source, total, consumers)
"""

import logging
import time
from typing import Any, Dict, List, Optional

from services.market_data_engine import market_data_engine
from services.portfolio_calculator import calculate, strip_stale_fields

_LOG = logging.getLogger("pia.provider_manager")

# Module-level QuoteEngine singleton — preserves last-known price cache
# across all requests within a server session.
def get_canonical_portfolio(
    *,
    resolution=None,
) -> Dict[str, Any]:
    """
    Entry point for ALL portfolio data.  Returns the Canonical Portfolio DTO.

    Pass `resolution` (from resolve_portfolio_provider()) to avoid calling it
    twice when the caller already has it.  If omitted, it is called internally.
    """
    t0 = time.time()

    from services.portfolio_providers import (
        IbkrLivePortfolioProvider,
        SnapshotPortfolioProvider,
        MockPortfolioProvider,
        resolve_portfolio_provider,
    )

    if resolution is None:
        resolution = resolve_portfolio_provider()

    active_source: str = resolution.active_source or "NO_DATA"

    # ── MOCK path — delegate entirely to existing mock provider ───────────────
    if active_source == "MOCK":
        mock = resolution.provider if isinstance(resolution.provider, MockPortfolioProvider) \
            else MockPortfolioProvider()
        result = mock.get_portfolio()
        result["_via_provider_manager"] = True
        return result

    # ── Data layer ─────────────────────────────────────────────────────────────
    positions: List[Dict] = []
    ibkr_summary: Optional[Dict] = None
    bundle_meta: Dict = {}       # timing / refresh timestamps from the bundle
    snapshot_state: Dict = {}    # snapshotAgeSeconds, lastRefreshStatus, etc.

    if active_source == "IBKR_LIVE":
        ibkr = resolution.provider if isinstance(resolution.provider, IbkrLivePortfolioProvider) \
            else IbkrLivePortfolioProvider()
        try:
            bundle = ibkr._load_bundle()
            actual_source = bundle.get("source", "NO_DATA")
            positions = list(bundle.get("positions") or [])
            raw_summary = bundle.get("summary") or {}

            if actual_source == "IBKR_LIVE":
                # Use IBKR's authoritative NLV + account fields
                ibkr_summary = _extract_ibkr_summary(raw_summary)
                _LOG.info("[PROVIDER_MANAGER] IBKR_LIVE bundle positions=%s", len(positions))
            else:
                # Live fetch failed internally; bundle contains snapshot fallback
                active_source = actual_source  # "LAST_UPDATE" or "NO_DATA"
                last_cash = _f(raw_summary.get("cash") or 0)
                if last_cash:
                    ibkr_summary = {
                        "cash": last_cash,
                        "currency": raw_summary.get("currency") or "USD",
                    }
                # Prime QuoteEngine cache with snapshot prices (for options)
                market_data_engine.prime_cache(positions)
                # Strip stale computed fields before recalculating
                positions = [strip_stale_fields(p) for p in positions]
                _LOG.warning(
                    "[PROVIDER_SWITCH] source=IBKR_LIVE destination=%s "
                    "reason=live_fetch_failed_snapshot_fallback positions=%s",
                    actual_source, len(positions),
                )
                try:
                    from services import runtime_state as _rs
                    _rs.on_resolution(
                        active_source=actual_source,
                        is_live=False,
                        configured_mode=resolution.configured_mode or "",
                        provider_class="SnapshotPortfolioProvider",
                        fallback_active=True,
                    )
                except Exception:
                    pass
            bundle_meta = _extract_bundle_meta(bundle)
        except Exception as exc:
            prev = active_source
            active_source = "LAST_UPDATE"
            _LOG.warning(
                "[PROVIDER_SWITCH] source=%s destination=LAST_UPDATE reason=%s", prev, exc
            )

    if active_source in ("LAST_UPDATE",) and not positions:
        snap = resolution.provider if isinstance(resolution.provider, SnapshotPortfolioProvider) \
            else SnapshotPortfolioProvider()
        try:
            snap_bundle = snap._load_bundle()
            raw_positions = snap_bundle.get("positions") or []
            raw_summary = snap_bundle.get("summary") or {}
            snap_meta = snap_bundle.get("meta") or {}

            # Prime cache before stripping (lets options get LAST_KNOWN prices)
            market_data_engine.prime_cache(raw_positions)
            positions = [strip_stale_fields(p) for p in raw_positions]

            last_cash = _f(raw_summary.get("cash") or 0)
            if last_cash:
                ibkr_summary = {
                    "cash": last_cash,
                    "currency": raw_summary.get("currency") or "USD",
                }

            try:
                snapshot_state = snap.get_snapshot_state() or {}
            except Exception:
                snapshot_state = {}

            snap_ts = (
                raw_summary.get("snapshot_timestamp")
                or raw_summary.get("as_of")
                or snap_meta.get("snapshot_timestamp")
            )
            bundle_meta["snapshot_timestamp"] = snap_ts
            bundle_meta["snapshotAgeSeconds"] = snapshot_state.get("snapshotAgeSeconds")
            bundle_meta["snapshotRefreshStatus"] = snapshot_state.get("lastRefreshStatus")

            _LOG.info(
                "[SNAPSHOT_LOAD] age=%s positions=%s timestamp=%s",
                bundle_meta.get("snapshotAgeSeconds", "?"),
                len(positions),
                snap_ts,
            )
        except Exception as exc:
            _LOG.warning("[PROVIDER_MANAGER] Snapshot load failed: %s", exc)
            active_source = "NO_DATA"

    # ── Fallback to demo ───────────────────────────────────────────────────────
    if not positions:
        _LOG.info(
            "[PROVIDER_SWITCH] source=%s destination=MOCK reason=no_positions_available",
            active_source,
        )
        mock = MockPortfolioProvider()
        result = mock.get_portfolio()
        result["_via_provider_manager"] = True
        return result

    # ── Quote Engine ───────────────────────────────────────────────────────────
    ibkr_live_data = positions if active_source == "IBKR_LIVE" else None
    quotes, market_meta = market_data_engine.get_quotes(positions, ibkr_positions=ibkr_live_data)
    quote_provider = str(market_meta.get("provider") or "NO_DATA")

    # ── Portfolio Calculator ───────────────────────────────────────────────────
    mode = "ibkr-live" if active_source == "IBKR_LIVE" else "last-update"
    snap_ts = bundle_meta.get("snapshot_timestamp")

    # For offline mode, pass cash + currency so the calculator can apply FX conversion
    # correctly. All other account fields (margins, buying power) are unavailable without
    # a live IBKR connection and are intentionally excluded.
    calc_summary = ibkr_summary if active_source == "IBKR_LIVE" else (
        {
            "cash": ibkr_summary.get("cash", 0),
            "currency": ibkr_summary.get("currency") or "USD",
        } if ibkr_summary else None
    )

    dto = calculate(
        positions,
        quotes,
        ibkr_summary=calc_summary,
        source=active_source,
        mode=mode,
        quote_provider=quote_provider,
        snapshot_timestamp=snap_ts,
    )

    # ── Provider meta enrichment ───────────────────────────────────────────────
    prices_live = quote_provider in ("IBKR_LIVE", "YAHOO_LIVE", "YAHOO_DELAYED", "HYBRID")
    quote_fallback_active = quote_provider not in ("IBKR_LIVE",)
    fallback_active = active_source != "IBKR_LIVE" or resolution.fallback_active or quote_fallback_active
    positions_source = "IBKR_LIVE" if active_source == "IBKR_LIVE" else "IBKR_LAST_UPDATE"
    portfolio_mode = (
        "IBKR_LIVE" if active_source == "IBKR_LIVE"
        else ("HYBRID_LAST_POSITIONS_LIVE_QUOTES" if prices_live else "LAST_UPDATE_ONLY")
    )
    price_provider_label = (
        "IBKR" if "IBKR" in quote_provider
        else ("YAHOO" if "YAHOO" in quote_provider else ("LAST_KNOWN" if quote_provider == "LAST_KNOWN" else "STALE"))
    )
    quote_diagnostics = market_meta.get("diagnostics") or {}
    fallback_reason = resolution.fallback_reason
    if active_source == "IBKR_LIVE" and quote_provider in ("YAHOO_LIVE", "YAHOO_DELAYED", "HYBRID"):
        fallback_reason = fallback_reason or "IBKR live positions retained; quote provider degraded to Yahoo fallback."
    elif active_source == "IBKR_LIVE" and quote_provider == "LAST_KNOWN":
        fallback_reason = fallback_reason or "IBKR live positions retained; quote provider degraded to last known quotes."
    elif active_source == "IBKR_LIVE" and quote_provider == "NO_DATA":
        fallback_reason = fallback_reason or "IBKR live positions retained; no fresh quotes are currently available."

    dto.update({
        "portfolioMode": portfolio_mode,
        "positionsSource": positions_source,
        "priceSource": quote_provider,
        "activePriceProvider": price_provider_label,
        "activePositionProvider": positions_source,
        "is_live": active_source == "IBKR_LIVE",
        "is_stale": active_source != "IBKR_LIVE",
        "stale_reason": (
            resolution.stale_reason
            if active_source != "IBKR_LIVE"
            else None
        ),
        "fallback_active": fallback_active,
        "fallback_reason": (
            fallback_reason
            if fallback_active
            else None
        ),
        "pricesLive": prices_live,
        "isLivePositions": active_source == "IBKR_LIVE",
        "isLivePricing": prices_live,
        "isHybrid": (active_source != "IBKR_LIVE") and prices_live,
        "isLiveUpdating": active_source == "IBKR_LIVE",
        # Snapshot state
        "snapshot_available": resolution.snapshot_available,
        "snapshot_timestamp": snap_ts or resolution.snapshot_timestamp,
        "snapshotAvailable": resolution.snapshot_available,
        "snapshotTimestamp": snap_ts or resolution.snapshot_timestamp,
        "snapshotAgeSeconds": bundle_meta.get("snapshotAgeSeconds"),
        "snapshot_age_seconds": bundle_meta.get("snapshotAgeSeconds"),
        "snapshotRefreshStatus": bundle_meta.get("snapshotRefreshStatus"),
        "snapshot_refresh_status": bundle_meta.get("snapshotRefreshStatus"),
        "snapshotLastRefreshAttempt": snapshot_state.get("lastRefreshAttempt"),
        "snapshot_last_refresh_attempt": snapshot_state.get("lastRefreshAttempt"),
        "snapshotLastRefreshError": snapshot_state.get("lastRefreshError"),
        "snapshot_last_refresh_error": snapshot_state.get("lastRefreshError"),
        "snapshotSchemaVersion": snapshot_state.get("schemaVersion"),
        "snapshot_schema_version": snapshot_state.get("schemaVersion"),
        # Refresh timestamps
        "pricesLastRefresh": bundle_meta.get("pricesLastRefresh") or market_meta.get("timestamp"),
        "pricesAgeSeconds": market_meta.get("quoteAge", bundle_meta.get("pricesAgeSeconds")),
        "positionsLastRefresh": bundle_meta.get("positionsLastRefresh") or snap_ts,
        "summaryLastRefresh": bundle_meta.get("summaryLastRefresh") or snap_ts,
        "lastRefresh": bundle_meta.get("lastRefresh") or snap_ts,
        "nextRefresh": bundle_meta.get("nextRefresh"),
        "marketSession": market_meta.get("marketSession"),
        "marketStatus": market_meta.get("marketStatus"),
        "quoteAge": market_meta.get("quoteAge"),
        "marketData": {
            "provider": quote_provider,
            "latencyMs": market_meta.get("latencyMs"),
            "quoteCount": market_meta.get("quoteCount"),
            "timestamp": market_meta.get("timestamp"),
            "diagnostics": quote_diagnostics,
        },
        "quoteProvider": quote_provider,
        "quoteDiagnostics": quote_diagnostics,
        # Display / risk
        "risk_mode": "IBKR LIVE" if active_source == "IBKR_LIVE" else "LAST UPDATE",
        "journal": [],
        # Resolution meta
        "configured_mode": resolution.configured_mode,
        "provider_class": resolution.provider_class,
        "_via_provider_manager": True,
    })

    # ── Canonical DTO versioning ───────────────────────────────────────────────
    _portfolio_ts = dto.get("summaryLastRefresh") or dto.get("lastRefresh")
    _quote_ts = market_meta.get("timestamp")
    try:
        from services import runtime_state as _rs
        _cv = _rs.next_canonical_version(portfolio_timestamp=_portfolio_ts, quote_timestamp=_quote_ts)
        _rs_snap = _rs.get_state()
    except Exception:
        _cv = 0
        _rs_snap = {}
    dto["canonicalVersion"] = _cv
    dto["providerGeneration"] = _rs_snap.get("provider_generation", 0)
    dto["providerTimestamp"] = _rs_snap.get("provider_timestamp")
    dto["portfolioTimestamp"] = _portfolio_ts
    dto["quoteTimestamp"] = _quote_ts

    duration_ms = round((time.time() - t0) * 1000, 1)
    _LOG.info(
        "[DTO_CREATED] source=%s mode=%s total=%.2f positions=%s "
        "quote_provider=%s canonical_version=%s consumers=[Desktop,Mobile,Dashboard,AI] duration_ms=%s",
        active_source, mode, dto.get("total_value", 0),
        len(positions), quote_provider, _cv, duration_ms,
    )

    return dto


# ── Private helpers ────────────────────────────────────────────────────────────

def _extract_ibkr_summary(summary: Dict) -> Dict:
    """
    Extract account-level fields from a normalized IBKR summary dict
    (as returned by _normalize_live_summary()).
    """
    return {
        "net_liquidation": _f(
            summary.get("net_liquidation") or summary.get("total_value") or 0
        ),
        "cash": _f(summary.get("cash") or 0),
        "buying_power": _f(summary.get("buying_power") or 0),
        "excess_liquidity": _f(summary.get("excess_liquidity") or 0),
        "maint_margin_req": _f(summary.get("maint_margin_req") or 0),
        "init_margin_req": _f(summary.get("init_margin_req") or 0),
        "available_funds": _f(summary.get("available_funds") or 0),
        "realized_pnl": _f(summary.get("realized_pnl") or 0),
        "daily_pnl_pct": summary.get("daily_pnl_pct"),
        "currency": summary.get("currency") or "USD",
    }


def _extract_bundle_meta(bundle: Dict) -> Dict:
    """Extract timing/refresh metadata from an IbkrLivePortfolioProvider bundle."""
    return {
        "snapshot_timestamp": bundle.get("snapshot_timestamp"),
        "pricesLastRefresh": bundle.get("pricesLastRefresh"),
        "pricesAgeSeconds": bundle.get("pricesAgeSeconds"),
        "positionsLastRefresh": bundle.get("positionsLastRefresh"),
        "summaryLastRefresh": bundle.get("summaryLastRefresh"),
        "lastRefresh": bundle.get("lastRefresh"),
        "nextRefresh": bundle.get("nextRefresh"),
        "snapshotAgeSeconds": bundle.get("snapshotAgeSeconds"),
        "snapshotRefreshStatus": bundle.get("snapshotRefreshStatus"),
    }


def _f(v: Any) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0
