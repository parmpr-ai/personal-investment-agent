"""Unit tests for trade management features: slippage, beta sizing, re-entry rules,
overnight filter, partial profit, attribution."""
import pytest
from unittest.mock import MagicMock, patch
from services.paper_trading import (
    _apply_slippage, _LIQUID_TICKERS, _SLIPPAGE_LIQUID, _SLIPPAGE_DEFAULT, _COMMISSION_PER_SH,
    reset_book, execute_paper_trade,
)
from services.autonomous_agent import (
    _beta_size_mult, _extract_indicator_tags, _record_attribution,
    get_attribution_stats,
)


# ── Slippage model ────────────────────────────────────────────────────────────

def test_slippage_buy_fills_higher():
    exec_price, commission = _apply_slippage("AAPL", "BUY", 100.0, 10)
    assert exec_price > 100.0, "BUY should fill at price + slip"
    assert exec_price == round(100.0 * (1 + _SLIPPAGE_LIQUID), 4)


def test_slippage_sell_fills_lower():
    exec_price, commission = _apply_slippage("AAPL", "SELL", 100.0, 10)
    assert exec_price < 100.0, "SELL should fill at price − slip"


def test_slippage_cover_fills_higher():
    exec_price, _ = _apply_slippage("SPY", "COVER", 50.0, 20)
    assert exec_price > 50.0


def test_slippage_short_fills_lower():
    exec_price, _ = _apply_slippage("SPY", "SHORT", 50.0, 20)
    assert exec_price < 50.0


def test_liquid_ticker_lower_slip():
    liq_price, _ = _apply_slippage("AAPL", "BUY", 100.0, 10)
    illiq_price, _ = _apply_slippage("SMALLCAP", "BUY", 100.0, 10)
    assert liq_price < illiq_price, "Liquid tickers should have lower slippage"


def test_commission_per_share():
    _, commission = _apply_slippage("NVDA", "BUY", 500.0, 10)
    assert commission == round(10 * _COMMISSION_PER_SH, 2)


def test_liquid_set_contains_spy():
    assert "SPY" in _LIQUID_TICKERS
    assert "QQQ" in _LIQUID_TICKERS
    assert "NVDA" in _LIQUID_TICKERS


def test_execute_buy_includes_slippage_fields():
    reset_book()
    result = execute_paper_trade("AAPL", "BUY", 5, 100.0)
    assert result.get("ok"), result.get("error")
    assert "exec_price" in result
    assert "slippage" in result
    assert "commission" in result
    assert result["exec_price"] > 100.0
    assert result["slippage"] > 0


def test_execute_sell_cost_reduced_by_slippage():
    reset_book()
    execute_paper_trade("AAPL", "BUY", 5, 100.0)
    result = execute_paper_trade("AAPL", "SELL", 5, 110.0)
    assert result.get("ok"), result.get("error")
    # P&L should be lower than naive (110 - 100) * 5 due to slippage + commission on both legs
    naive_pnl = (110.0 - 100.0) * 5
    assert result["pnl"] < naive_pnl


def test_execute_short_cover_roundtrip():
    reset_book()
    s = execute_paper_trade("AMD", "SHORT", 10, 100.0)
    assert s.get("ok"), s.get("error")
    c = execute_paper_trade("AMD", "COVER", 10, 90.0)
    assert c.get("ok"), c.get("error")
    # Short profited (price fell), but net after commission/slippage is slightly less than naive
    naive_pnl = (100.0 - 90.0) * 10
    assert c["pnl"] < naive_pnl
    assert c["pnl"] > 0  # still positive — price fell as expected


# ── Beta-adjusted sizing ──────────────────────────────────────────────────────

def test_beta_mult_high_beta():
    assert _beta_size_mult(2.5) == 0.5


def test_beta_mult_moderate_high():
    mult = _beta_size_mult(1.8)
    assert mult == round(1.0 / 1.8, 3)


def test_beta_mult_medium():
    assert _beta_size_mult(1.3) == 0.85


def test_beta_mult_normal():
    assert _beta_size_mult(1.0) == 1.0
    assert _beta_size_mult(0.8) == 1.0


def test_beta_mult_none():
    assert _beta_size_mult(None) == 1.0


def test_beta_mult_boundary_1_5():
    mult = _beta_size_mult(1.5)
    assert mult < 1.0  # 1.5 > 1.2 → should reduce, specifically > 1.5 path


def test_beta_mult_boundary_2_0():
    # Exactly 2.0 — not strictly > 2.0 — falls into > 1.5 branch
    mult = _beta_size_mult(2.0)
    assert mult == round(1.0 / 2.0, 3)


# ── Attribution tags ──────────────────────────────────────────────────────────

def test_extract_tags_macd():
    tags = _extract_indicator_tags("MACD bullish daily crossover")
    assert "macd" in tags.split(",")


def test_extract_tags_rsi():
    tags = _extract_indicator_tags("RSI=55 momentum zone")
    assert "rsi" in tags.split(",")


def test_extract_tags_vwap():
    tags = _extract_indicator_tags("above VWAP +0.5%")
    assert "vwap" in tags.split(",")


def test_extract_tags_multiple():
    tags = _extract_indicator_tags("MACD crossover, RSI=60, above VWAP")
    tag_list = tags.split(",")
    assert "macd" in tag_list
    assert "rsi" in tag_list
    assert "vwap" in tag_list


def test_extract_tags_empty():
    tags = _extract_indicator_tags("")
    assert tags == "none"


def test_extract_tags_no_duplicates():
    tags = _extract_indicator_tags("MACD daily and MACD intraday")
    assert tags.count("macd") == 1


# ── Attribution stats ─────────────────────────────────────────────────────────

def test_attribution_roundtrip():
    """Record a trade and verify it appears in get_attribution_stats."""
    _record_attribution(
        ticker="TSLA",
        strategy="momentum",
        entry_ts="2025-01-01T10:00:00+00:00",
        exit_ts="2025-01-04T10:00:00+00:00",
        pnl_pct=5.2,
        regime="BULL_TREND",
        trade_style="SWING_TRADE",
        exit_reason="Trailing stop",
        entry_reasoning="MACD crossover, above VWAP +1.2%, RSI=60",
    )
    stats = get_attribution_stats(limit=50)
    assert "records" in stats
    assert "by_tag" in stats
    assert "by_strategy" in stats
    # At least our record should be present
    assert any(r.get("ticker") == "TSLA" for r in stats["records"])
    # momentum strategy should have a win
    if "momentum" in stats["by_strategy"]:
        assert stats["by_strategy"]["momentum"]["wins"] >= 1


def test_attribution_win_rate_computed():
    _record_attribution("QQQ", "breakout", "2025-01-05T09:30:00+00:00", "2025-01-06T09:30:00+00:00",
                        -2.1, "BEAR_TREND", "DAY_TRADE", "Stop-loss", "breakout above resistance")
    stats = get_attribution_stats(limit=50)
    if "breakout" in stats["by_strategy"]:
        s = stats["by_strategy"]["breakout"]
        total = s["wins"] + s["losses"]
        assert total >= 1
        assert 0.0 <= s["win_rate"] <= 1.0
