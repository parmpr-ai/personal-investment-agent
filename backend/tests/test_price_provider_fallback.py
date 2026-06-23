from __future__ import annotations

from types import SimpleNamespace
import unittest
from unittest.mock import patch

from services.manual_holdings import _market_price
from services.portfolio_providers import IbkrLivePortfolioProvider


class PriceProviderFallbackTests(unittest.TestCase):
    def _resolution(self, *, active_source: str, is_live: bool, snapshot_available: bool = True, fallback_active: bool = False, fallback_reason: str | None = None):
        return SimpleNamespace(
            configured_mode="ibkr-live",
            active_source=active_source,
            is_live=is_live,
            snapshot_available=snapshot_available,
            snapshot_timestamp="2026-06-23T12:00:00+00:00",
            fallback_active=fallback_active,
            fallback_reason=fallback_reason,
        )

    def _base_portfolio(self):
        timestamp = "2026-06-23T11:59:30+00:00"
        return {
            "source": "IBKR_LIVE",
            "active_source": "IBKR_LIVE",
            "portfolioMode": "IBKR_LIVE",
            "mode": "ibkr-live",
            "snapshot_available": True,
            "snapshot_timestamp": "2026-06-23T12:00:00+00:00",
            "pricesLive": True,
            "isLivePricing": True,
            "isLivePositions": True,
            "isHybrid": False,
            "activePriceProvider": "IBKR",
            "activePositionProvider": "IBKR_LIVE",
            "priceSource": "IBKR_LIVE",
            "positionsSource": "IBKR_LIVE",
            "positionsLastRefresh": timestamp,
            "pricesLastRefresh": timestamp,
            "summaryLastRefresh": "2026-06-23T12:00:00+00:00",
            "lastRefresh": "2026-06-23T12:00:00+00:00",
            "lastPositionsTimestamp": timestamp,
            "lastPriceTimestamp": timestamp,
            "cash": 1000.0,
            "positions": [
                {
                    "accountId": "DU123",
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
                    "market_value": 1000.0,
                    "unrealized": 0.0,
                    "last": 100.0,
                    "previousClose": 100.0,
                    "quoteSource": "IBKR_MARKETDATA_SNAPSHOT",
                    "quoteLastRefresh": "2026-06-23T11:59:30+00:00",
                    "quoteStale": False,
                    "quoteStaleReason": None,
                    "isLiveQuote": True,
                }
            ],
            "summary": {
                "cash": 1000.0,
                "total_value": 2000.0,
                "buying_power": 0.0,
                "daily_pnl": 0.0,
                "daily_pnl_pct": 0.0,
                "unrealized": 0.0,
                "unrealized_pct": 0.0,
            },
        }

    def test_live_ibkr_keeps_ibkr_mode_without_fallback(self) -> None:
        provider = IbkrLivePortfolioProvider.__new__(IbkrLivePortfolioProvider)
        with patch("services.portfolio_providers.get_yahoo_live_quotes") as mock_quotes, patch(
            "services.portfolio_providers._cached_ai_technical_snapshot",
            return_value={},
        ):
            result = provider._normalize_portfolio_after_price_overlay(
                self._base_portfolio(),
                resolution=self._resolution(active_source="IBKR_LIVE", is_live=True, fallback_active=False),
            )
        mock_quotes.assert_not_called()
        self.assertEqual(result["portfolioMode"], "IBKR_LIVE")
        self.assertEqual(result["positionsSource"], "IBKR_LIVE")
        self.assertEqual(result["priceSource"], "IBKR_LIVE")
        self.assertTrue(result["isLivePricing"])
        self.assertTrue(result["isLivePositions"])
        self.assertFalse(result["isHybrid"])

    def test_snapshot_uses_yahoo_fallback_prices(self) -> None:
        provider = IbkrLivePortfolioProvider.__new__(IbkrLivePortfolioProvider)
        yahoo_quotes = {
            "available": True,
            "pricesLive": True,
            "activePriceProvider": "YAHOO",
            "lastQuoteTimestamp": "2026-06-23T12:00:10+00:00",
            "quotes": {
                "AMD": {
                    "symbol": "AMD",
                    "last": 110.0,
                    "previousClose": 100.0,
                    "dayChange": 10.0,
                    "dayChangePercent": 10.0,
                    "quoteTimestamp": "2026-06-23T12:00:10+00:00",
                    "quoteAgeSeconds": 1.0,
                    "priceSource": "YAHOO_LIVE",
                    "quoteSource": "YAHOO_LIVE",
                    "isLiveQuote": True,
                    "quoteStale": False,
                    "quoteStaleReason": None,
                }
            },
        }
        with patch("services.portfolio_providers.get_yahoo_live_quotes", return_value=yahoo_quotes), patch(
            "services.portfolio_providers._cached_ai_technical_snapshot",
            return_value={},
        ):
            result = provider._normalize_portfolio_after_price_overlay(
                self._base_portfolio(),
                resolution=self._resolution(
                    active_source="LAST_UPDATE",
                    is_live=False,
                    fallback_active=True,
                    fallback_reason="Client Portal Gateway unavailable; using last-update snapshot.",
                ),
            )
        row = result["positions"][0]
        self.assertEqual(result["portfolioMode"], "HYBRID_LAST_POSITIONS_LIVE_QUOTES")
        self.assertEqual(result["positionsSource"], "IBKR_LAST_UPDATE")
        self.assertEqual(result["priceSource"], "YAHOO_LIVE")
        self.assertTrue(result["isLivePricing"])
        self.assertFalse(result["isLivePositions"])
        self.assertTrue(result["isHybrid"])
        self.assertAlmostEqual(row["last"], 110.0)
        self.assertAlmostEqual(row["market_value"], 1100.0)
        self.assertAlmostEqual(row["day_change"], 10.0)
        self.assertAlmostEqual(row["day_pnl"], 100.0)
        self.assertAlmostEqual(result["total_value"], 2100.0)
        self.assertAlmostEqual(result["daily_pnl"], 100.0)
        self.assertEqual(row["priceSource"], "YAHOO_LIVE")

    def test_snapshot_only_when_fallback_quotes_are_missing(self) -> None:
        provider = IbkrLivePortfolioProvider.__new__(IbkrLivePortfolioProvider)
        with patch("services.portfolio_providers.get_yahoo_live_quotes", return_value={"available": False, "pricesLive": False, "quotes": {}, "lastQuoteTimestamp": None}), patch(
            "services.portfolio_providers._cached_ai_technical_snapshot",
            return_value={},
        ):
            result = provider._normalize_portfolio_after_price_overlay(
                self._base_portfolio(),
                resolution=self._resolution(
                    active_source="LAST_UPDATE",
                    is_live=False,
                    fallback_active=True,
                    fallback_reason="Client Portal Gateway unavailable; using last-update snapshot.",
                ),
            )
        row = result["positions"][0]
        self.assertEqual(result["portfolioMode"], "LAST_UPDATE_ONLY")
        self.assertEqual(result["positionsSource"], "IBKR_LAST_UPDATE")
        self.assertEqual(result["priceSource"], "STALE")
        self.assertFalse(result["isLivePricing"])
        self.assertTrue(result["fallback_active"])
        self.assertEqual(row["quoteSource"], "IBKR_MARKETDATA_SNAPSHOT")

    def test_manual_holdings_use_live_quote_provider(self) -> None:
        with patch("services.price_providers.get_yahoo_live_quote", return_value={
            "last": 12.5,
            "currency": "USD",
            "priceSource": "YAHOO_LIVE",
            "quoteTimestamp": "2026-06-23T12:00:10+00:00",
            "quoteAgeSeconds": 1.0,
            "isLiveQuote": True,
        }):
            pricing = _market_price("AMD")
        self.assertEqual(pricing["quote_source"], "YAHOO_LIVE")
        self.assertTrue(pricing["is_live_quote"])
        self.assertEqual(pricing["price"], 12.5)


if __name__ == "__main__":
    unittest.main()
