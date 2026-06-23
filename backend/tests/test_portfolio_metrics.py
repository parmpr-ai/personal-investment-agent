from __future__ import annotations

import unittest
from unittest.mock import patch

from services.portfolio_providers import (
    IbkrLivePortfolioProvider,
    _aggregate_positions,
    _derive_day_metrics,
    _ibkr_price,
)


class PortfolioMetricsTests(unittest.TestCase):
    def test_ibkr_price_prefixes_parse_numeric_values(self) -> None:
        for raw in ("C123.45", "H123.45", "O123.45", "B123.45", "A123.45", "E123.45"):
            with self.subTest(raw=raw):
                self.assertEqual(_ibkr_price(raw), 123.45)

    def test_day_metrics_stock_formula(self) -> None:
        metrics = _derive_day_metrics(last=120.0, previous_close=100.0, quantity=10, multiplier=1)
        self.assertEqual(metrics["day_change"], 20.0)
        self.assertEqual(metrics["day_change_pct"], 20.0)
        self.assertEqual(metrics["day_pnl"], 200.0)
        self.assertEqual(metrics["day_pnl_pct"], 20.0)

    def test_day_metrics_option_formula(self) -> None:
        metrics = _derive_day_metrics(last=2.8, previous_close=2.5, quantity=4, multiplier=100)
        self.assertEqual(metrics["day_change"], 0.3)
        self.assertAlmostEqual(metrics["day_pnl"], 120.0)
        self.assertAlmostEqual(metrics["day_pnl_pct"], 12.0)

    def test_day_metrics_crypto_formula(self) -> None:
        metrics = _derive_day_metrics(last=65000.0, previous_close=62000.0, quantity=0.5, multiplier=1)
        self.assertEqual(metrics["day_change"], 3000.0)
        self.assertEqual(metrics["day_pnl"], 1500.0)

    def test_day_metrics_missing_previous_close_returns_nulls(self) -> None:
        metrics = _derive_day_metrics(last=100.0, previous_close=None, quantity=10, multiplier=1)
        self.assertIsNone(metrics["day_change"])
        self.assertIsNone(metrics["day_change_pct"])
        self.assertIsNone(metrics["day_pnl"])
        self.assertIsNone(metrics["day_pnl_pct"])

    def test_aggregate_positions_dedupes_duplicate_rows(self) -> None:
        rows = [
            {
                "accountId": "DU123",
                "conid": "101",
                "assetClass": "STK",
                "contractDesc": "SOFI",
                "currency": "USD",
                "symbol": "SOFI",
                "qty": 10,
                "avg_price": 10.0,
                "last": 11.0,
                "market_value": 110.0,
                "unrealized": 10.0,
                "day_pnl": 10.0,
            },
            {
                "accountId": "DU123",
                "conid": "101",
                "assetClass": "STK",
                "contractDesc": "SOFI",
                "currency": "USD",
                "symbol": "SOFI",
                "qty": 5,
                "avg_price": 12.0,
                "last": 11.0,
                "market_value": 55.0,
                "unrealized": -5.0,
                "day_pnl": 5.0,
            },
        ]
        aggregated = _aggregate_positions(rows)
        self.assertEqual(len(aggregated), 1)
        row = aggregated[0]
        self.assertEqual(row["qty"], 15)
        self.assertEqual(row["day_pnl"], 15.0)
        self.assertEqual(row["market_value"], 165.0)

    def test_live_positions_use_cached_ai_scores_and_placeholders(self) -> None:
        provider = IbkrLivePortfolioProvider.__new__(IbkrLivePortfolioProvider)
        with patch("services.portfolio_providers._cached_ai_technical_snapshot", return_value={
            "technicalIndicators": {"momentumScore": 68, "riskScore": 72},
            "updatedAt": "2026-06-23T12:00:00+00:00",
        }):
            rows = provider._normalize_live_positions(
                [
                    {
                        "accountId": "DU123",
                        "conid": "101",
                        "symbol": "SOFI",
                        "contractDesc": "SOFI",
                        "assetClass": "STK",
                        "position": 10,
                        "mktPrice": 11.0,
                        "closePrice": 10.0,
                        "mktValue": 110.0,
                        "unrealizedPnl": 10.0,
                        "currency": "USD",
                    }
                ],
                "DU123",
            )
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["day_change"], 1.0)
        self.assertEqual(row["day_pnl"], 10.0)
        self.assertEqual(row["risk"], 72)
        self.assertEqual(row["risk_source"], "AI_INTELLIGENCE_CACHE")
        self.assertFalse(row["risk_is_placeholder"])
        self.assertEqual(row["momentum_score"], 68)
        self.assertEqual(row["momentum_source"], "AI_INTELLIGENCE_CACHE")
        self.assertFalse(row["momentum_is_placeholder"])
        self.assertIsNone(row["news_score"])
        self.assertTrue(row["news_score_is_placeholder"])

    def test_positions_without_ai_cache_do_not_expose_placeholder_scores(self) -> None:
        provider = IbkrLivePortfolioProvider.__new__(IbkrLivePortfolioProvider)
        with patch("services.portfolio_providers._cached_ai_technical_snapshot", return_value={}):
            rows = provider._normalize_live_positions(
                [
                    {
                        "accountId": "DU123",
                        "conid": "202",
                        "symbol": "SOFI",
                        "contractDesc": "SOFI",
                        "assetClass": "STK",
                        "position": 10,
                        "mktPrice": 11.0,
                        "closePrice": 10.0,
                        "mktValue": 110.0,
                        "unrealizedPnl": 10.0,
                        "currency": "USD",
                        "risk": 70,
                        "momentum_score": 55,
                        "news_score": 50,
                    }
                ],
                "DU123",
            )
        row = rows[0]
        self.assertIsNone(row["risk"])
        self.assertTrue(row["risk_is_placeholder"])
        self.assertIsNone(row["momentum_score"])
        self.assertTrue(row["momentum_is_placeholder"])
        self.assertIsNone(row["news_score"])
        self.assertTrue(row["news_score_is_placeholder"])

    def test_summary_aggregates_daily_pnl_from_positions(self) -> None:
        provider = IbkrLivePortfolioProvider.__new__(IbkrLivePortfolioProvider)
        summary = provider._normalize_live_summary(
            raw_summary={},
            positions=[
                {"market_value": 100.0, "day_pnl": 5.0, "cost_basis": 90.0, "unrealized": 10.0},
                {"market_value": 200.0, "day_pnl": -2.0, "cost_basis": 150.0, "unrealized": 50.0},
            ],
            pnl=None,
        )
        self.assertEqual(summary["daily_pnl"], 3.0)
        self.assertAlmostEqual(summary["daily_pnl_pct"], 1.01, places=2)


if __name__ == "__main__":
    unittest.main()
