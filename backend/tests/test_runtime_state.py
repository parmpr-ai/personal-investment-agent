"""
Regression tests for the provider runtime state machine.

Covers:
  1. Snapshot -> Live promotion
  2. Live -> Live degraded when quotes degrade
  3. Live -> Snapshot when portfolio ownership is lost
  4. Degraded -> Live recovery
  5. Provider promotion idempotence
  6. Cache invalidation tracking
  7. Canonical version monotonicity
  8. Provider generation increments on distinct live promotions
"""
from __future__ import annotations

import unittest

from services import runtime_state as rs


class TestRuntimeStateMachine(unittest.TestCase):

    def setUp(self) -> None:
        with rs._LOCK:
            rs._STATE.update(
                {
                    "state": rs.NONE,
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
            )

    def _snapshot(self, fallback: bool = False) -> bool:
        return rs.on_resolution(
            active_source="LAST_UPDATE",
            is_live=False,
            configured_mode="last-update",
            provider_class="SnapshotPortfolioProvider",
            fallback_active=fallback,
        )

    def _live(self) -> bool:
        return rs.on_resolution(
            active_source="IBKR_LIVE",
            is_live=True,
            configured_mode="ibkr-live",
            provider_class="IbkrLivePortfolioProvider",
            fallback_active=False,
        )

    def _live_degraded(self) -> bool:
        return rs.on_resolution(
            active_source="IBKR_LIVE",
            is_live=True,
            configured_mode="ibkr-live",
            provider_class="IbkrLivePortfolioProvider",
            fallback_active=False,
            quote_degraded=True,
        )

    def test_snapshot_to_live_promotion(self) -> None:
        first = self._snapshot()
        self.assertTrue(first)
        self.assertEqual(rs.current_state(), rs.SNAPSHOT)

        second = self._live()
        self.assertTrue(second)
        self.assertEqual(rs.current_state(), rs.LIVE)
        self.assertTrue(rs.is_live())
        self.assertEqual(rs.get_state()["promotion_count"], 1)
        self.assertEqual(rs.get_state()["provider_generation"], 1)

    def test_live_to_degraded_on_quote_degradation(self) -> None:
        self._live()
        transitioned = self._live_degraded()
        self.assertTrue(transitioned)
        self.assertEqual(rs.current_state(), rs.DEGRADED)
        self.assertFalse(rs.is_live())

    def test_live_to_snapshot_when_live_source_is_lost(self) -> None:
        self._live()
        transitioned = self._snapshot(fallback=True)
        self.assertTrue(transitioned)
        self.assertEqual(rs.current_state(), rs.SNAPSHOT)

    def test_reconnect_promotes_from_degraded_to_live(self) -> None:
        self._live()
        self._live_degraded()
        self.assertEqual(rs.current_state(), rs.DEGRADED)

        transitioned = self._live()
        self.assertTrue(transitioned)
        self.assertEqual(rs.current_state(), rs.LIVE)
        self.assertTrue(rs.is_live())
        self.assertEqual(rs.get_state()["promotion_count"], 2)

    def test_promotion_fires_only_once_per_transition(self) -> None:
        first = self._live()
        second = self._live()
        third = self._live()
        self.assertTrue(first)
        self.assertFalse(second)
        self.assertFalse(third)
        self.assertEqual(rs.get_state()["promotion_count"], 1)

    def test_repeated_snapshot_is_idempotent(self) -> None:
        first = self._snapshot()
        second = self._snapshot()
        self.assertTrue(first)
        self.assertFalse(second)

    def test_cache_invalidated_timestamp_is_set(self) -> None:
        self.assertIsNone(rs.get_state()["cache_invalidated_at"])
        rs.mark_cache_invalidated()
        self.assertIsNotNone(rs.get_state()["cache_invalidated_at"])

    def test_canonical_version_increments_per_dto(self) -> None:
        v1 = rs.next_canonical_version(portfolio_timestamp="2026-06-29T10:00:00+00:00")
        v2 = rs.next_canonical_version(
            portfolio_timestamp="2026-06-29T10:00:01+00:00",
            quote_timestamp="2026-06-29T10:00:01+00:00",
        )
        v3 = rs.next_canonical_version()
        self.assertEqual((v1, v2, v3), (1, 2, 3))
        state = rs.get_state()
        self.assertEqual(state["canonical_version"], 3)
        self.assertEqual(state["portfolio_timestamp"], "2026-06-29T10:00:01+00:00")
        self.assertEqual(state["quote_timestamp"], "2026-06-29T10:00:01+00:00")

    def test_canonical_version_is_stable_without_dto_call(self) -> None:
        self._live()
        self._live()
        self.assertEqual(rs.get_state()["canonical_version"], 0)

    def test_provider_generation_increments_on_each_live_promotion(self) -> None:
        self._live()
        gen1 = rs.get_state()["provider_generation"]
        self._live_degraded()
        self._live()
        gen2 = rs.get_state()["provider_generation"]
        self.assertEqual(gen1, 1)
        self.assertEqual(gen2, 2)


if __name__ == "__main__":
    unittest.main()
