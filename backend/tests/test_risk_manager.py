"""Unit tests for RiskManager — circuit breaker, sizing, sector concentration."""
import pytest
from services.risk_manager import RiskManager, SECTOR_MAP


def _portfolio(total=100_000, cash=80_000, daily_pnl_pct=0.0, positions=None):
    return {
        "total_value": total,
        "cash": cash,
        "positions": positions or [],
        "daily_pnl_pct": daily_pnl_pct,
    }


def _macro(vix=18.0, hostile=False, regime="RISK_ON"):
    return {"vix": vix, "hostile": hostile, "regime": regime}


class TestCircuitBreaker:
    def test_blocks_new_buy_when_daily_loss_exceeded(self):
        rm = RiskManager()
        result = rm.check_trade("BUY", "AAPL", 10, 150, _portfolio(daily_pnl_pct=-4.0), _macro())
        assert result["approved"] is False
        assert "Daily loss" in result["reasons"][0]

    def test_allows_buy_at_limit_boundary(self):
        rm = RiskManager()
        # exactly at limit (not exceeded) → should allow
        result = rm.check_trade("BUY", "AAPL", 10, 150, _portfolio(daily_pnl_pct=-3.0), _macro())
        # -3.0 is not < -3.0, so not triggered
        assert result["approved"] is True

    def test_allows_sell_when_loss_limit_hit(self):
        rm = RiskManager({"daily_loss_limit_pct": 3.0})
        result = rm.check_trade("SELL", "AAPL", 10, 150, _portfolio(daily_pnl_pct=-5.0), _macro())
        # circuit breaker should only block new BUY/SHORT entries, SELL always passes
        assert result["approved"] is True


class TestVIXFilter:
    def test_blocks_buy_when_vix_above_threshold(self):
        rm = RiskManager({"vix_pause_threshold": 27.0})
        result = rm.check_trade("BUY", "AAPL", 10, 150, _portfolio(), _macro(vix=30.0))
        assert result["approved"] is False
        assert "VIX" in result["reasons"][0]

    def test_allows_buy_when_vix_below_threshold(self):
        rm = RiskManager()
        result = rm.check_trade("BUY", "AAPL", 5, 150, _portfolio(), _macro(vix=20.0))
        assert result["approved"] is True


class TestCashReserve:
    def test_blocks_when_insufficient_cash(self):
        rm = RiskManager({"min_cash_reserve_pct": 10.0})
        # cash is 5% of total → below 10% minimum
        port = _portfolio(total=100_000, cash=5_000)
        result = rm.check_trade("BUY", "AAPL", 10, 150, port, _macro())
        assert result["approved"] is False
        assert "Cash reserve" in result["reasons"][0]


class TestPositionConcentration:
    def test_caps_size_at_max_position_pct(self):
        rm = RiskManager({"max_position_pct": 25.0})
        port = _portfolio(total=100_000, cash=100_000)
        # Trying to buy $50k of AAPL (50%) → should be capped
        result = rm.check_trade("BUY", "AAPL", 333, 150, port, _macro())
        assert result["approved"] is True
        assert result["adjusted_qty"] * 150 <= 25_001  # max 25% = $25k


class TestSectorConcentration:
    def test_sector_map_has_entries(self):
        assert "AAPL" in SECTOR_MAP
        assert "NVDA" in SECTOR_MAP
        assert SECTOR_MAP["AAPL"] == "Technology"

    def test_sector_concentration_check_caps_correctly(self):
        rm = RiskManager({"max_sector_pct": 40.0})
        # Simulate 35% already in Tech
        tech_positions = [
            {"ticker": "AAPL", "symbol": "AAPL", "market_value": 35_000, "portfolio_pct": 35.0, "qty": 100}
        ]
        port = _portfolio(total=100_000, cash=65_000, positions=tech_positions)
        # Try to buy $10k NVDA (Tech) → would push Tech to 45% → should be capped
        result = rm.check_trade("BUY", "NVDA", 100, 100, port, _macro())
        if result["approved"]:
            # Should be capped below 40%
            assert result["adjusted_qty"] * 100 <= 5_001


class TestPositionSizing:
    def test_returns_positive_qty(self):
        rm = RiskManager()
        qty = rm.position_size_shares("AAPL", 150.0, 100_000, 2.0, atr=3.0)
        assert qty > 0

    def test_larger_atr_gives_smaller_position(self):
        rm = RiskManager()
        # Use very different ATR values to ensure distinct integer share counts
        small_qty = rm.position_size_shares("AAPL", 150.0, 100_000, 2.0, atr=50.0)
        large_qty = rm.position_size_shares("AAPL", 150.0, 100_000, 2.0, atr=0.5)
        assert large_qty > small_qty

    def test_drawdown_scale_reduces_size(self):
        rm = RiskManager()
        # drawdown_scale=1.0 vs 0.1 to ensure distinct integer share counts
        full = rm.position_size_shares("AAPL", 150.0, 100_000, 2.0, atr=3.0, drawdown_scale=1.0)
        reduced = rm.position_size_shares("AAPL", 150.0, 100_000, 2.0, atr=3.0, drawdown_scale=0.1)
        assert reduced < full


class TestDrawdownScalar:
    def test_at_peak_returns_one(self):
        rm = RiskManager()
        assert rm.drawdown_scalar(100_000, 100_000) == 1.0

    def test_below_peak_returns_less_than_one(self):
        rm = RiskManager()
        scalar = rm.drawdown_scalar(90_000, 100_000)
        assert scalar < 1.0

    def test_severe_drawdown_approaches_zero(self):
        rm = RiskManager()
        scalar = rm.drawdown_scalar(50_000, 100_000)
        assert scalar < 0.5
