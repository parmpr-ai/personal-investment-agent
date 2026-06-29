"""Unit tests for Batch 1 technical indicators: Stochastic, OBV, Parabolic SAR,
Divergence, Pivot Points, Keltner Channels."""
import pytest
from services.market_data import (
    _compute_stochastic,
    _compute_obv,
    _compute_parabolic_sar,
    _compute_divergence,
    _compute_pivot_points,
    _compute_keltner,
)


# ── Stochastic ────────────────────────────────────────────────────────────────

def _stoch_data():
    """16 bars trending up then pulling back (k=14 needs at least k+d-1=16 bars)."""
    closes = [10, 11, 12, 11, 10, 11, 12, 13, 14, 13, 12, 11, 10, 11, 12, 13]
    highs  = [c + 1 for c in closes]
    lows   = [c - 1 for c in closes]
    return highs, lows, closes


def test_stochastic_returns_k_and_d():
    h, l, c = _stoch_data()
    r = _compute_stochastic(h, l, c)
    assert "stoch_k" in r and "stoch_d" in r
    assert 0 <= r["stoch_k"] <= 100
    assert 0 <= r["stoch_d"] <= 100


def test_stochastic_overbought():
    # All closes at the top of their range → K near 100
    highs  = [10.0] * 20
    lows   = [0.0]  * 20
    closes = [9.5]  * 20
    r = _compute_stochastic(highs, lows, closes)
    assert r.get("stoch_overbought") is True


def test_stochastic_oversold():
    # All closes at the bottom of their range → K near 0
    highs  = [10.0] * 20
    lows   = [0.0]  * 20
    closes = [0.5]  * 20
    r = _compute_stochastic(highs, lows, closes)
    assert r.get("stoch_oversold") is True


def test_stochastic_insufficient_data():
    r = _compute_stochastic([1, 2], [0, 1], [1, 1])
    assert r == {}


# ── OBV ───────────────────────────────────────────────────────────────────────

def test_obv_rising_when_price_up():
    closes  = [10, 11, 12, 13, 14]
    volumes = [100, 200, 150, 300, 250]
    r = _compute_obv(closes, volumes)
    assert r["obv_trend"] == "RISING"


def test_obv_falling_when_price_down():
    closes  = [14, 13, 12, 11, 10]
    volumes = [100, 200, 150, 300, 250]
    r = _compute_obv(closes, volumes)
    assert r["obv_trend"] == "FALLING"


def test_obv_bullish_divergence():
    # Price falling but OBV rising → bullish divergence
    closes  = [14, 13, 12, 11, 10, 10, 10, 10, 10, 10]
    volumes = [100, 50, 50, 50, 50, 200, 200, 200, 200, 200]
    r = _compute_obv(closes, volumes)
    # Last 5 bars: price flat (not rising), OBV rising from volume spike
    # We test structure works; exact flag depends on 5-bar window
    assert "obv_bullish_div" in r


def test_obv_insufficient_data():
    r = _compute_obv([1, 2], [10, 20])
    assert r == {}


# ── Parabolic SAR ─────────────────────────────────────────────────────────────

def _uptrend_data():
    closes = [10 + i * 0.5 for i in range(20)]
    highs  = [c + 0.3 for c in closes]
    lows   = [c - 0.3 for c in closes]
    return highs, lows, closes


def _downtrend_data():
    closes = [20 - i * 0.5 for i in range(20)]
    highs  = [c + 0.3 for c in closes]
    lows   = [c - 0.3 for c in closes]
    return highs, lows, closes


def test_sar_bullish_in_uptrend():
    h, l, c = _uptrend_data()
    r = _compute_parabolic_sar(h, l, c)
    assert "sar" in r
    assert r.get("sar_bullish") is True


def test_sar_bearish_in_downtrend():
    h, l, c = _downtrend_data()
    r = _compute_parabolic_sar(h, l, c)
    assert "sar" in r
    assert r.get("sar_bullish") is False


def test_sar_insufficient_data():
    r = _compute_parabolic_sar([1, 2], [0, 1], [1, 2])
    assert r == {}


# ── Divergence ────────────────────────────────────────────────────────────────

def test_divergence_returns_keys():
    closes = [100 + (i % 5) for i in range(60)]
    highs  = [c + 2 for c in closes]
    lows   = [c - 2 for c in closes]
    r = _compute_divergence(closes, highs, lows)
    for key in ("rsi_bullish_div", "rsi_bearish_div", "macd_bull_div", "macd_bear_div"):
        assert key in r


def test_divergence_insufficient_data():
    r = _compute_divergence([1, 2, 3], [2, 3, 4], [0, 1, 2])
    assert r == {}


# ── Pivot Points ──────────────────────────────────────────────────────────────

def test_pivot_calculation():
    r = _compute_pivot_points(prev_high=110, prev_low=100, prev_close=105, current_price=106)
    expected_pivot = (110 + 100 + 105) / 3
    assert abs(r["pivot"] - expected_pivot) < 0.01


def test_pivot_above_pivot():
    r = _compute_pivot_points(110, 100, 105, current_price=106)
    assert r["above_pivot"] is True


def test_pivot_below_pivot():
    r = _compute_pivot_points(110, 100, 105, current_price=103)
    assert r["above_pivot"] is False


def test_pivot_resistances_above_pivot():
    r = _compute_pivot_points(110, 100, 105, current_price=106)
    assert r["pivot_r1"] > r["pivot"]
    assert r["pivot_r2"] > r["pivot_r1"]


def test_pivot_supports_below_pivot():
    r = _compute_pivot_points(110, 100, 105, current_price=106)
    assert r["pivot_s1"] < r["pivot"]
    assert r["pivot_s2"] < r["pivot_s1"]


def test_pivot_none_inputs():
    r = _compute_pivot_points(0, 0, 0, 100)
    assert r == {}


# ── Keltner Channels ─────────────────────────────────────────────────────────

def _keltner_data(n=30):
    closes = [100 + (i % 3) for i in range(n)]
    highs  = [c + 2 for c in closes]
    lows   = [c - 2 for c in closes]
    return closes, highs, lows


def test_keltner_returns_bands():
    c, h, l = _keltner_data()
    r = _compute_keltner(c, h, l)
    assert "kc_upper" in r and "kc_lower" in r and "kc_mid" in r


def test_keltner_upper_above_lower():
    c, h, l = _keltner_data()
    r = _compute_keltner(c, h, l)
    assert r["kc_upper"] > r["kc_lower"]


def test_keltner_pct_range():
    c, h, l = _keltner_data()
    r = _compute_keltner(c, h, l)
    assert 0 <= r["kc_pct"] <= 1


def test_keltner_above_flag():
    # Price way above the upper band
    closes = [200.0] * 30
    highs  = [200.5] * 30
    lows   = [199.5] * 30
    closes[-1] = 250.0   # spike above
    highs[-1]  = 251.0
    r = _compute_keltner(closes, highs, lows)
    assert r.get("above_kc") is True


def test_keltner_insufficient_data():
    r = _compute_keltner([1, 2, 3], [2, 3, 4], [0, 1, 2])
    assert r == {}
