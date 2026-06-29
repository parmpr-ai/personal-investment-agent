"""
Regression tests for CR-IBKR-LIVE-018 — Provider Lifecycle.

Verifies resolve_portfolio_provider() state-machine transitions:
  1. ibkr-live mode, gateway offline at startup → SnapshotPortfolioProvider
  2. ibkr-live mode, gateway reconnects → IbkrLivePortfolioProvider
  3. last-update mode + gateway open → auto-promote to IbkrLivePortfolioProvider (the fix)
  4. last-update mode + gateway down → stays on SnapshotPortfolioProvider
  5. ibkr-live mode, gateway drops → fallback to SnapshotPortfolioProvider
  6. last-update mode, no snapshot, no gateway → MockPortfolioProvider
  7. mock mode always returns MockPortfolioProvider
"""
from __future__ import annotations

import unittest
from unittest.mock import patch

from services import portfolio_providers as pp


_GATEWAY_CFG_STUB = {
    "configured_url": "https://localhost:5000",
    "effective_url": "https://localhost:5000",
    "configured_host": "localhost",
    "effective_host": "localhost",
    "port": 5000,
    "ssl_verify": False,
    "proxy_bypassed": True,
    "prefer_ipv4": False,
    "timeout_seconds": 3.0,
}

_HB_OPEN = {
    "gateway_open": True,
    "gateway_status": "connected",
    "ibkr_authenticated": True,
    "gateway_error": None,
    "auth_status": {},
}

_HB_CLOSED = {
    "gateway_open": False,
    "gateway_status": "gateway_down",
    "ibkr_authenticated": False,
    "gateway_error": "Connection refused",
    "auth_status": {},
}


def _mode_tuple(data_mode: str, ibkr_mode: str = "live") -> tuple:
    settings = {
        "data_source": {"mode": data_mode},
        "ibkr": {"mode": ibkr_mode, "enabled": True},
    }
    return settings, data_mode, ibkr_mode


def _resolve(
    data_mode: str,
    heartbeat: dict,
    *,
    snapshot_available: bool = True,
) -> pp.ProviderResolution:
    """Invoke resolve_portfolio_provider() under fully controlled conditions."""
    with (
        patch.object(pp, "_read_settings_mode", return_value=_mode_tuple(data_mode)),
        patch.object(pp, "get_ibkr_gateway_config", return_value=_GATEWAY_CFG_STUB),
        patch.object(pp.IbkrLivePortfolioProvider, "_ensure_refresh_loop", lambda *a, **kw: None),
        patch.object(pp.IbkrLivePortfolioProvider, "get_gateway_heartbeat", return_value=heartbeat),
        patch.object(pp.IbkrLivePortfolioProvider, "get_snapshot_meta", lambda self: {}, create=True),
        patch.object(pp.SnapshotPortfolioProvider, "is_available", return_value=snapshot_available),
        patch.object(
            pp.SnapshotPortfolioProvider,
            "get_snapshot_meta",
            return_value={"snapshot_timestamp": "2026-06-29T10:00:00+00:00"},
            create=True,
        ),
    ):
        pp.IbkrLivePortfolioProvider.invalidate_cache()
        return pp.resolve_portfolio_provider()


class TestProviderLifecycle(unittest.TestCase):

    # ── 1. ibkr-live, gateway offline at startup ───────────────────────────────

    def test_ibkr_live_gateway_offline_uses_snapshot(self) -> None:
        """ibkr-live mode + gateway DOWN → SnapshotPortfolioProvider (fallback)."""
        r = _resolve("ibkr-live", _HB_CLOSED)
        self.assertIsInstance(r.provider, pp.SnapshotPortfolioProvider)
        self.assertEqual(r.active_source, "LAST_UPDATE")
        self.assertTrue(r.fallback_active)
        self.assertFalse(r.is_live)

    # ── 2. ibkr-live, gateway reconnects → auto-promote ───────────────────────

    def test_ibkr_live_gateway_reconnects_promotes_to_live(self) -> None:
        """ibkr-live mode + gateway UP → IbkrLivePortfolioProvider (auto-promote)."""
        r = _resolve("ibkr-live", _HB_OPEN)
        self.assertIsInstance(r.provider, pp.IbkrLivePortfolioProvider)
        self.assertEqual(r.active_source, "IBKR_LIVE")
        self.assertFalse(r.fallback_active)
        self.assertTrue(r.is_live)

    # ── 3. last-update + gateway open → auto-promote (THE FIX) ────────────────

    def test_last_update_gateway_open_promotes_to_live(self) -> None:
        """CR-IBKR-LIVE-018 regression: last-update + gateway UP → IBKR_LIVE."""
        r = _resolve("last-update", _HB_OPEN)
        self.assertIsInstance(
            r.provider,
            pp.IbkrLivePortfolioProvider,
            "last-update with gateway open must promote to IbkrLivePortfolioProvider",
        )
        self.assertEqual(r.active_source, "IBKR_LIVE")
        self.assertTrue(r.is_live)
        self.assertFalse(r.fallback_active)

    # ── 4. last-update + gateway down → stays on snapshot ─────────────────────

    def test_last_update_gateway_down_stays_on_snapshot(self) -> None:
        """last-update mode + gateway DOWN → SnapshotPortfolioProvider (no lock bug)."""
        r = _resolve("last-update", _HB_CLOSED)
        self.assertIsInstance(r.provider, pp.SnapshotPortfolioProvider)
        self.assertEqual(r.active_source, "LAST_UPDATE")
        self.assertFalse(r.is_live)

    # ── 5. ibkr-live, gateway drops → fallback to snapshot ────────────────────

    def test_ibkr_live_fallback_to_snapshot_when_gateway_drops(self) -> None:
        """ibkr-live mode + gateway DOWN + snapshot present → SnapshotPortfolioProvider."""
        r = _resolve("ibkr-live", _HB_CLOSED, snapshot_available=True)
        self.assertIsInstance(r.provider, pp.SnapshotPortfolioProvider)
        self.assertEqual(r.active_source, "LAST_UPDATE")
        self.assertTrue(r.fallback_active)
        self.assertFalse(r.is_live)

    # ── 6. last-update + no snapshot + gateway down → mock ────────────────────

    def test_last_update_no_snapshot_no_gateway_falls_to_mock(self) -> None:
        """last-update mode + gateway DOWN + no snapshot → MockPortfolioProvider."""
        r = _resolve("last-update", _HB_CLOSED, snapshot_available=False)
        self.assertIsInstance(r.provider, pp.MockPortfolioProvider)
        self.assertEqual(r.active_source, "MOCK")
        self.assertTrue(r.fallback_active)

    # ── 7. mock mode ignores gateway state ────────────────────────────────────

    def test_mock_mode_never_promotes_regardless_of_gateway(self) -> None:
        """Mock mode always returns MockPortfolioProvider regardless of gateway state."""
        r = _resolve("mock", _HB_OPEN)
        self.assertIsInstance(r.provider, pp.MockPortfolioProvider)
        self.assertEqual(r.active_source, "MOCK")
        self.assertFalse(r.is_live)

    def test_live_quote_failure_keeps_ibkr_live_and_marks_degraded(self) -> None:
        provider = pp.IbkrLivePortfolioProvider.__new__(pp.IbkrLivePortfolioProvider)
        provider._gateway_config = _GATEWAY_CFG_STUB
        provider._account_id = "DU123"
        provider.invalidate_cache()
        raw_positions = [{
            "ticker": "AMD",
            "contractDesc": "AMD",
            "conid": "12345",
            "position": 10,
            "avgPrice": 100,
            "avgCost": 100,
            "mktPrice": 110,
            "mktValue": 1100,
            "unrealizedPnl": 100,
            "realizedPnl": 0,
            "currency": "USD",
        }]
        raw_summary = {"netliquidation": {"amount": 1500, "currency": "USD"}, "totalcashvalue": {"amount": 400, "currency": "USD"}}
        def _get_side_effect(path, timeout=None):
            if path.startswith("/portfolio/") and path.endswith("/positions/0"):
                return raw_positions
            if path.startswith("/portfolio/") and path.endswith("/summary"):
                return raw_summary
            if path == "/iserver/account/trades":
                return []
            if path.startswith("/iserver/marketdata/snapshot"):
                raise RuntimeError("HTTP 500")
            raise AssertionError(path)
        with (
            patch.object(provider, "get_gateway_heartbeat", return_value=_HB_OPEN),
            patch.object(provider, "_get_account_id", return_value="DU123"),
            patch.object(provider, "_get", side_effect=_get_side_effect),
            patch.object(provider, "_fetch_partitioned_pnl", return_value=None),
            patch.object(provider, "_persist_live_snapshot", return_value=True),
        ):
            bundle = provider._fetch_live_bundle()
            status = provider.get_runtime_status()
        self.assertEqual(bundle["source"], "IBKR_LIVE")
        self.assertFalse(bundle["pricesLive"])
        self.assertTrue(bundle["quotes_stale"])
        self.assertEqual(status["active_source"], "IBKR_LIVE")
        self.assertEqual(status["quoteHealth"], "DEGRADED")

    def test_trade_failure_keeps_ibkr_live(self) -> None:
        provider = pp.IbkrLivePortfolioProvider.__new__(pp.IbkrLivePortfolioProvider)
        provider._gateway_config = _GATEWAY_CFG_STUB
        provider._account_id = "DU123"
        provider.invalidate_cache()
        raw_positions = [{
            "ticker": "AMD",
            "contractDesc": "AMD",
            "conid": "12345",
            "position": 10,
            "avgPrice": 100,
            "avgCost": 100,
            "mktPrice": 110,
            "mktValue": 1100,
            "unrealizedPnl": 100,
            "realizedPnl": 0,
            "currency": "USD",
        }]
        raw_summary = {"netliquidation": {"amount": 1500, "currency": "USD"}, "totalcashvalue": {"amount": 400, "currency": "USD"}}
        quote_map = {
            "12345": {
                "conid": "12345",
                "symbol": "AMD",
                "last": 111.0,
                "previous_close": 109.0,
                "quoteLastRefresh": "2026-06-29T10:00:00+00:00",
                "quoteSource": "IBKR_LIVE",
                "priceSource": "IBKR_LIVE",
            }
        }
        def _get_side_effect(path, timeout=None):
            if path.startswith("/portfolio/") and path.endswith("/positions/0"):
                return raw_positions
            if path.startswith("/portfolio/") and path.endswith("/summary"):
                return raw_summary
            if path == "/iserver/account/trades":
                raise RuntimeError("HTTP 500")
            raise AssertionError(path)
        with (
            patch.object(provider, "get_gateway_heartbeat", return_value=_HB_OPEN),
            patch.object(provider, "_get_account_id", return_value="DU123"),
            patch.object(provider, "_get", side_effect=_get_side_effect),
            patch.object(provider, "_fetch_market_quotes", return_value=quote_map),
            patch.object(provider, "_fetch_partitioned_pnl", return_value=None),
            patch.object(provider, "_persist_live_snapshot", return_value=True),
        ):
            bundle = provider._fetch_live_bundle()
            status = provider.get_runtime_status()
        self.assertEqual(bundle["source"], "IBKR_LIVE")
        self.assertEqual(bundle["tradeHealth"], "DEGRADED")
        self.assertEqual(status["active_source"], "IBKR_LIVE")
        self.assertEqual(status["tradeHealth"], "DEGRADED")


if __name__ == "__main__":
    unittest.main()
