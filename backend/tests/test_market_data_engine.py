from __future__ import annotations

import unittest
from unittest.mock import patch

from services.quote_engine import QuoteEngine


class HybridMarketDataEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = QuoteEngine()

    def test_ibkr_stale_stock_falls_back_to_yahoo(self) -> None:
        instruments = [{"symbol": "AMD", "assetClass": "STK", "conid": "101"}]
        ibkr_positions = [
            {
                "symbol": "AMD",
                "assetClass": "STK",
                "conid": "101",
                "last": 100.0,
                "quoteSource": "POSITION_ENDPOINT",
                "quoteStale": True,
            }
        ]
        yahoo_quotes = {
            "AMD": {
                "last": 111.0,
                "previousClose": 109.0,
                "dayChange": 2.0,
                "dayChangePercent": 1.83,
                "quoteTimestamp": "2026-06-29T12:00:00+00:00",
                "isLiveQuote": True,
                "priceSource": "YAHOO_LIVE",
            }
        }
        with patch("services.quote_engine._fetch_yahoo", return_value={"AMD": self._quote_from_yahoo("AMD", yahoo_quotes["AMD"])}):
            quotes, provider = self.engine.get_quotes_for_instruments(instruments, ibkr_positions=ibkr_positions)
        self.assertEqual(provider, "YAHOO_LIVE")
        self.assertAlmostEqual(quotes["CONID:101"].last, 111.0)
        diag = self.engine.diagnostics_snapshot()
        self.assertEqual(diag["activeProvider"], "YAHOO_LIVE")
        self.assertEqual(diag["failedSymbols"], [])
        self.assertIn("AMD", diag["successfulSymbols"])

    def test_yahoo_failure_falls_back_to_last_known(self) -> None:
        self.engine.prime_cache(
            [
                {
                    "symbol": "AMD",
                    "assetClass": "STK",
                    "conid": "101",
                    "last": 105.0,
                    "quoteSource": "IBKR_LIVE",
                    "quoteLastRefresh": "2026-06-29T11:55:00+00:00",
                }
            ]
        )
        instruments = [{"symbol": "AMD", "assetClass": "STK", "conid": "101"}]
        ibkr_positions = [
            {
                "symbol": "AMD",
                "assetClass": "STK",
                "conid": "101",
                "last": 100.0,
                "quoteSource": "POSITION_ENDPOINT",
                "quoteStale": True,
            }
        ]
        with patch("services.quote_engine._fetch_yahoo", return_value={}):
            quotes, provider = self.engine.get_quotes_for_instruments(instruments, ibkr_positions=ibkr_positions)
        self.assertEqual(provider, "LAST_KNOWN")
        self.assertEqual(quotes["CONID:101"].source, "LAST_KNOWN")
        self.assertAlmostEqual(quotes["CONID:101"].last, 105.0)
        diag = self.engine.diagnostics_snapshot()
        self.assertEqual(diag["activeProvider"], "LAST_KNOWN")
        self.assertIn("AMD", diag["successfulSymbols"])

    def test_ibkr_recovery_replaces_yahoo_automatically(self) -> None:
        instruments = [{"symbol": "AMD", "assetClass": "STK", "conid": "101"}]
        stale_positions = [
            {
                "symbol": "AMD",
                "assetClass": "STK",
                "conid": "101",
                "last": 100.0,
                "quoteSource": "POSITION_ENDPOINT",
                "quoteStale": True,
            }
        ]
        with patch(
            "services.quote_engine._fetch_yahoo",
            return_value={"AMD": self._quote_from_yahoo("AMD", {"last": 110.0, "previousClose": 100.0, "dayChange": 10.0, "dayChangePercent": 10.0, "quoteTimestamp": "2026-06-29T12:00:00+00:00", "isLiveQuote": True, "priceSource": "YAHOO_LIVE"})},
        ):
            _, provider1 = self.engine.get_quotes_for_instruments(instruments, ibkr_positions=stale_positions)
        fresh_positions = [
            {
                "symbol": "AMD",
                "assetClass": "STK",
                "conid": "101",
                "last": 112.0,
                "previousClose": 110.0,
                "day_change": 2.0,
                "day_change_pct": 1.82,
                "quoteSource": "IBKR_LIVE",
                "priceSource": "IBKR_LIVE",
                "quoteStale": False,
            }
        ]
        with patch("services.quote_engine._fetch_yahoo", return_value={}):
            quotes, provider2 = self.engine.get_quotes_for_instruments(instruments, ibkr_positions=fresh_positions)
        self.assertEqual(provider1, "YAHOO_LIVE")
        self.assertEqual(provider2, "IBKR_LIVE")
        self.assertAlmostEqual(quotes["CONID:101"].last, 112.0)
        diag = self.engine.diagnostics_snapshot()
        self.assertEqual(diag["activeProvider"], "IBKR_LIVE")
        self.assertEqual(diag["failedSymbols"], [])

    @staticmethod
    def _quote_from_yahoo(symbol: str, row: dict) -> object:
        from services.quote_engine import Quote

        return Quote(
            symbol=symbol,
            last=float(row["last"]),
            previous_close=float(row.get("previousClose") or 0),
            change=float(row.get("dayChange") or 0),
            change_pct=float(row.get("dayChangePercent") or 0),
            source="YAHOO_LIVE" if row.get("isLiveQuote", True) else "YAHOO_DELAYED",
            provider="YAHOO",
            timestamp=row.get("quoteTimestamp"),
        )


if __name__ == "__main__":
    unittest.main()
