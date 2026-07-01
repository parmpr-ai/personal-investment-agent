"""Unit tests for candlestick pattern detection."""
import pytest
from services.candlestick import detect


def _r(opens, highs, lows, closes):
    return detect(opens, highs, lows, closes)


# ── single candle ─────────────────────────────────────────────────────────────

def test_bullish_marubozu():
    r = _r([100.0], [100.0], [100.0], [108.0])
    # open=low, close=high → marubozu
    r2 = detect([100.0], [108.0], [100.0], [108.0])
    assert r2["cdl_bullish_marubozu"] is True

def test_bearish_marubozu():
    r = detect([108.0], [108.0], [100.0], [100.0])
    assert r["cdl_bearish_marubozu"] is True

def test_doji():
    # open ≈ close, wide range
    r = detect([100.0], [105.0], [95.0], [100.1])
    assert r["cdl_doji"] is True

def test_hammer():
    # Small body near top, long lower tail
    r = detect([100.0], [101.0], [90.0], [100.5])
    assert r["cdl_hammer"] is True

def test_shooting_star():
    # Small body near bottom, long upper tail
    r = detect([100.0], [110.0], [99.5], [100.5])
    assert r["cdl_shooting_star"] is True


# ── two candle ────────────────────────────────────────────────────────────────

def test_bullish_engulfing():
    opens  = [104.0, 101.0]
    highs  = [104.0, 106.0]
    lows   = [101.0, 100.0]
    closes = [101.0, 105.0]  # [1] bearish, [2] bullish larger
    r = _r(opens, highs, lows, closes)
    assert r["cdl_bullish_engulfing"] is True
    assert r["cdl_bearish_engulfing"] is False

def test_bearish_engulfing():
    opens  = [100.0, 104.5]
    highs  = [103.0, 105.0]
    lows   = [100.0, 98.0]
    closes = [103.0, 99.0]   # [1] bullish, [2] bearish larger
    r = _r(opens, highs, lows, closes)
    assert r["cdl_bearish_engulfing"] is True

def test_dark_cloud_cover():
    opens  = [100.0, 107.0]  # [2] opens above [1] high
    highs  = [105.0, 108.0]
    lows   = [99.0,  101.0]
    closes = [105.0, 101.5]  # [2] closes below midpoint of [1]
    r = _r(opens, highs, lows, closes)
    assert r["cdl_dark_cloud_cover"] is True

def test_piercing_line():
    opens  = [105.0, 98.0]   # [2] opens below [1] low
    highs  = [105.0, 104.0]
    lows   = [100.0, 97.0]
    closes = [100.0, 103.0]  # [2] closes above midpoint of [1]
    r = _r(opens, highs, lows, closes)
    assert r["cdl_piercing_line"] is True


# ── three candle ──────────────────────────────────────────────────────────────

def test_morning_star():
    opens  = [105.0, 99.0, 99.5]
    highs  = [105.0, 100.0, 106.0]
    lows   = [100.0, 98.0, 99.0]
    closes = [100.0, 99.5, 105.0]  # [1] bearish, [2] small, [3] bullish above mid[1]
    r = _r(opens, highs, lows, closes)
    assert r["cdl_morning_star"] is True

def test_three_white_soldiers():
    opens  = [100.0, 103.0, 106.0]
    highs  = [104.0, 107.0, 110.0]
    lows   = [100.0, 103.0, 106.0]
    closes = [104.0, 107.0, 110.0]
    r = _r(opens, highs, lows, closes)
    assert r["cdl_three_white_soldiers"] is True

def test_three_black_crows():
    opens  = [110.0, 107.0, 104.0]
    highs  = [110.0, 107.0, 104.0]
    lows   = [106.0, 103.0, 100.0]
    closes = [106.0, 103.0, 100.0]
    r = _r(opens, highs, lows, closes)
    assert r["cdl_three_black_crows"] is True


# ── scoring ───────────────────────────────────────────────────────────────────

def test_bull_score_and_signal():
    opens  = [104.0, 101.0]
    highs  = [104.0, 106.0]
    lows   = [101.0, 100.0]
    closes = [101.0, 105.0]
    r = _r(opens, highs, lows, closes)
    assert r["candle_bull_score"] >= 1
    assert r["candle_signal"] == "BULLISH"

def test_neutral_when_doji_only():
    r = detect([100.0], [105.0], [95.0], [100.1])
    assert r["candle_signal"] == "NEUTRAL"  # doji is not counted in bull/bear score

def test_insufficient_data_returns_neutral():
    r = detect([], [], [], [])
    assert r["candle_signal"] == "NEUTRAL"
    assert r["candle_bull_score"] == 0
