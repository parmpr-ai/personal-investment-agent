from __future__ import annotations

import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from services import portfolio_providers as pp


class SnapshotLifecycleTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        root = Path(self._tmpdir.name)
        self._patches = [
            patch.object(pp, "_SNAPSHOT_DIR", root / "snapshots"),
            patch.object(pp, "_SNAPSHOT_HISTORY_DIR", root / "snapshots" / "history"),
            patch.object(pp, "_SNAPSHOT_POSITIONS_FILE", root / "snapshots" / "positions_latest.json"),
            patch.object(pp, "_SNAPSHOT_SUMMARY_FILE", root / "snapshots" / "summary_latest.json"),
            patch.object(pp, "_SNAPSHOT_TRADES_FILE", root / "snapshots" / "trades_latest.json"),
            patch.object(pp, "_SNAPSHOT_META_FILE", root / "snapshots" / "meta.json"),
            patch.object(pp, "_SNAPSHOT_STATE_FILE", root / "snapshots" / "state.json"),
            patch.object(pp, "_SNAPSHOT_HISTORY_FILE", root / "snapshots" / "history" / "history.jsonl"),
        ]
        for item in self._patches:
            item.start()
            self.addCleanup(item.stop)
        self.addCleanup(self._tmpdir.cleanup)
        pp.IbkrLivePortfolioProvider.invalidate_cache()

    def _base_timestamp(self) -> datetime:
        return datetime(2026, 6, 23, 18, 40, 1, tzinfo=timezone.utc)

    def _valid_bundle(self, *, ts: datetime | None = None, last: float = 120.0, total_value: float = 2200.0) -> dict:
        ts = ts or self._base_timestamp()
        stamp = ts.isoformat()
        return {
            "source": "IBKR_LIVE",
            "mode": "ibkr-live",
            "as_of": stamp,
            "account_id": "DU12345",
            "positions": [
                {
                    "accountId": "DU12345",
                    "conid": "101",
                    "assetClass": "STK",
                    "sec_type": "STK",
                    "contractDesc": "AMD",
                    "symbol": "AMD",
                    "underlying": "AMD",
                    "currency": "USD",
                    "qty": 10,
                    "quantity": 10,
                    "avg_price": 100.0,
                    "avg_cost": 100.0,
                    "cost_basis": 1000.0,
                    "market_value": 1200.0,
                    "unrealized": 200.0,
                    "last": last,
                    "previousClose": 118.0,
                    "prevClose": 118.0,
                    "day_change": 2.0,
                    "day_change_pct": 1.69,
                    "day_pnl": 20.0,
                    "day_pnl_pct": 1.69,
                    "quoteSource": "IBKR_LIVE",
                    "quoteLastRefresh": stamp,
                    "quoteAgeSeconds": 0.0,
                    "quoteStale": False,
                    "isLiveQuote": True,
                }
            ],
            "summary": {
                "source": "IBKR_LIVE",
                "mode": "ibkr-live",
                "as_of": stamp,
                "total_value": total_value,
                "cash": 1000.0,
                "buying_power": 500.0,
                "unrealized": 200.0,
                "unrealized_pct": 20.0,
                "daily_pnl": 20.0,
                "daily_pnl_pct": 1.69,
                "net_liquidation": total_value,
            },
            "trades": [],
            "snapshot_timestamp": stamp,
            "snapshot_available": True,
            "lastRefresh": stamp,
            "pricesLive": True,
            "pricesLastRefresh": stamp,
            "pricesAgeSeconds": 0.0,
            "positionsLastRefresh": stamp,
            "summaryLastRefresh": stamp,
            "isLiveUpdating": True,
            "is_live": True,
            "is_stale": False,
            "stale_reason": None,
        }

    def _read_json(self, path: Path) -> dict:
        return json.loads(path.read_text(encoding="utf-8"))

    def test_valid_snapshot_persists_and_failed_refresh_does_not_overwrite_it(self) -> None:
        provider = pp.IbkrLivePortfolioProvider.__new__(pp.IbkrLivePortfolioProvider)
        bundle = self._valid_bundle()

        self.assertTrue(provider._persist_live_snapshot(bundle, force=True))

        positions_path = pp._SNAPSHOT_POSITIONS_FILE
        summary_path = pp._SNAPSHOT_SUMMARY_FILE
        meta_path = pp._SNAPSHOT_META_FILE
        state_path = pp._SNAPSHOT_STATE_FILE

        original_positions = self._read_json(positions_path)
        original_summary = self._read_json(summary_path)
        original_meta = self._read_json(meta_path)
        self.assertEqual(original_meta["snapshot_valid"], True)
        self.assertEqual(original_meta["snapshotPersisted"], True)
        self.assertEqual(original_meta["positions_count"], 1)
        self.assertEqual(original_meta["lastRefreshStatus"], "ok")
        self.assertEqual(original_positions["positions"][0]["symbol"], "AMD")
        self.assertEqual(original_summary["summary"]["total_value"], 2200.0)

        failed_bundle = self._valid_bundle(last=121.5)
        failed_bundle["positions"] = []
        failed_bundle["summary"] = {}
        self.assertFalse(
            provider._persist_live_snapshot(
                failed_bundle,
                force=False,
                refresh_status="failed",
                refresh_error="Empty IBKR response",
            )
        )

        self.assertEqual(self._read_json(positions_path), original_positions)
        self.assertEqual(self._read_json(summary_path), original_summary)
        failed_state = self._read_json(state_path)
        self.assertEqual(failed_state["lastRefreshStatus"], "failed")
        self.assertEqual(failed_state["snapshotPersisted"], False)
        self.assertIn("Empty IBKR response", failed_state["lastRefreshError"])

    def test_periodic_refresh_persists_again_after_refresh_interval(self) -> None:
        provider = pp.IbkrLivePortfolioProvider.__new__(pp.IbkrLivePortfolioProvider)
        first_bundle = self._valid_bundle()
        second_bundle = self._valid_bundle(ts=self._base_timestamp() + timedelta(minutes=31), last=123.0, total_value=2400.0)

        self.assertTrue(provider._persist_live_snapshot(first_bundle, force=True))

        meta_path = pp._SNAPSHOT_META_FILE
        meta = self._read_json(meta_path)
        old_stamp = (self._base_timestamp() - timedelta(minutes=31)).isoformat()
        meta["snapshot_timestamp"] = old_stamp
        meta["as_of"] = old_stamp
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

        self.assertTrue(provider._persist_live_snapshot(second_bundle, force=False))

        refreshed_meta = self._read_json(meta_path)
        self.assertEqual(refreshed_meta["positions_count"], 1)
        self.assertEqual(refreshed_meta["lastRefreshStatus"], "ok")
        self.assertGreaterEqual(
            datetime.fromisoformat(refreshed_meta["snapshot_timestamp"].replace("Z", "+00:00")),
            datetime.fromisoformat(first_bundle["snapshot_timestamp"].replace("Z", "+00:00")),
        )
        refreshed_positions = self._read_json(pp._SNAPSHOT_POSITIONS_FILE)
        self.assertEqual(refreshed_positions["positions"][0]["last"], 123.0)

    def test_live_load_bundle_uses_snapshot_fallback_when_refresh_fails(self) -> None:
        provider = pp.IbkrLivePortfolioProvider.__new__(pp.IbkrLivePortfolioProvider)
        saved_bundle = self._valid_bundle()
        self.assertTrue(provider._persist_live_snapshot(saved_bundle, force=True))

        with patch.object(provider, "get_gateway_heartbeat", return_value={"gateway_open": True, "gateway_error": None, "ibkr_authenticated": True}), patch.object(
            provider,
            "_fetch_live_bundle",
            side_effect=RuntimeError("boom"),
        ):
            bundle = provider._load_bundle()

        self.assertEqual(bundle["source"], "LAST_UPDATE")
        self.assertEqual(bundle["mode"], "last-update")
        self.assertFalse(bundle["is_live"])
        self.assertTrue(bundle["snapshot_available"])
        self.assertEqual(bundle["positions"][0]["symbol"], "AMD")

    def test_live_load_bundle_returns_no_data_when_no_snapshot_exists(self) -> None:
        provider = pp.IbkrLivePortfolioProvider.__new__(pp.IbkrLivePortfolioProvider)

        with patch.object(provider, "get_gateway_heartbeat", return_value={"gateway_open": True, "gateway_error": None, "ibkr_authenticated": True}), patch.object(
            provider,
            "_fetch_live_bundle",
            side_effect=RuntimeError("boom"),
        ), patch.object(pp, "_snapshot_available", return_value=False):
            bundle = provider._load_bundle()

        self.assertEqual(bundle["source"], "NO_DATA")
        self.assertEqual(bundle["mode"], "no-data")
        self.assertFalse(bundle["snapshot_available"])
        self.assertEqual(bundle["positions"], [])
        self.assertEqual(bundle["summary"]["mode"], "no-data")

    def test_prime_ibkr_snapshot_can_seed_live_provider_independent_of_mode(self) -> None:
        class FakeLiveProvider:
            def __init__(self) -> None:
                self.called = False

            def get_gateway_heartbeat(self) -> dict:
                return {"gateway_open": True}

            def refresh_snapshot(self, force: bool = False) -> dict:
                self.called = True
                return self_bundle

        self_bundle = self._valid_bundle()
        with patch.object(pp, "resolve_portfolio_provider", return_value=SimpleNamespace(provider=object(), configured_mode="mock")), patch.object(
            pp,
            "IbkrLivePortfolioProvider",
            FakeLiveProvider,
        ):
            result = pp.prime_ibkr_snapshot(force=True, respect_mode=False)

        self.assertTrue(result["ok"])
        self.assertFalse(result["skipped"])
        self.assertEqual(result["source"], "IBKR_LIVE")
        self.assertEqual(result["positions_count"], 1)


if __name__ == "__main__":
    unittest.main()
