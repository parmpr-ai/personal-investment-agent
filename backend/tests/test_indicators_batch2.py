"""Unit tests for Batch 2 technical indicators: Fibonacci, Ichimoku, CCI, IVR, Short Interest."""
import pytest
from services.market_data import (
    _compute_fibonacci,
    _compute_ichimoku,
    _compute_cci,
    _compute_ivr,
    _compute_short_interest,
)


# ── Fibonacci ─────────────────────────────────────────────────────────────────

def _fib_data():
    closes = list(range(90, 110))        # swing low ~90, swing high ~109
    highs  = [c + 1 for c in closes]
    lows   = [c - 1 for c in closes]
    return highs, lows, closes


def test_fibonacci_returns_all_levels():
    h, l, c = _fib_data()
    r = _compute_fibonacci(h, l, c)
    for key in ("fib_0", "fib_236", "fib_382", "fib_500", "fib_618", "fib_786", "fib_100"):
        assert key in r, f"Missing {key}"


def test_fibonacci_levels_ordered():
    h, l, c = _fib_data()
    r = _compute_fibonacci(h, l, c)
    assert r["fib_0"] < r["fib_236"] < r["fib_382"] < r["fib_500"] < r["fib_618"] < r["fib_786"] < r["fib_100"]


def test_fibonacci_pct_range():
    h, l, c = _fib_data()
    r = _compute_fibonacci(h, l, c)
    assert 0 <= r["fib_pct"] <= 1


def test_fibonacci_golden_zone():
    # Range: swing low ~89, swing high ~100, last close ~95 → ~55% retrace (in golden zone 38.2-61.8%)
    closes = list(range(90, 100)) + [95]  # swing high ~100, low ~89, last 95 → fib_pct ≈ 0.55
    highs  = [c + 1 for c in closes]
    lows   = [c - 1 for c in closes]
    r = _compute_fibonacci(highs, lows, closes)
    assert r.get("fib_golden_zone") is True


def test_fibonacci_insufficient_data():
    r = _compute_fibonacci([1, 2], [0, 1], [1, 2])
    assert r == {}


def test_fibonacci_flat_range():
    r = _compute_fibonacci([100] * 10, [100] * 10, [100] * 10)
    assert r == {}


# ── Ichimoku ──────────────────────────────────────────────────────────────────

def _ichi_uptrend():
    """52 bars strong uptrend."""
    closes = [100 + i for i in range(52)]
    highs  = [c + 2 for c in closes]
    lows   = [c - 2 for c in closes]
    return highs, lows, closes


def _ichi_downtrend():
    """52 bars strong downtrend."""
    closes = [200 - i for i in range(52)]
    highs  = [c + 2 for c in closes]
    lows   = [c - 2 for c in closes]
    return highs, lows, closes


def test_ichimoku_returns_keys():
    h, l, c = _ichi_uptrend()
    r = _compute_ichimoku(h, l, c)
    for key in ("ichi_tenkan", "ichi_kijun", "ichi_senkou_a", "ichi_senkou_b",
                "ichi_above_cloud", "ichi_below_cloud", "ichi_bullish_cloud", "ichi_tk_cross_bull"):
        assert key in r, f"Missing {key}"


def test_ichimoku_above_cloud_in_uptrend():
    h, l, c = _ichi_uptrend()
    r = _compute_ichimoku(h, l, c)
    assert r.get("ichi_above_cloud") is True


def test_ichimoku_below_cloud_in_downtrend():
    h, l, c = _ichi_downtrend()
    r = _compute_ichimoku(h, l, c)
    assert r.get("ichi_below_cloud") is True


def test_ichimoku_insufficient_data():
    r = _compute_ichimoku([1] * 10, [0] * 10, [1] * 10)
    assert r == {}


def test_ichimoku_tk_cross_in_uptrend():
    h, l, c = _ichi_uptrend()
    r = _compute_ichimoku(h, l, c)
    # In a steady uptrend Tenkan (9-period high+low / 2) > Kijun (26-period)
    assert r.get("ichi_tk_cross_bull") is True


# ── CCI ───────────────────────────────────────────────────────────────────────

def test_cci_returns_value():
    closes = [100 + (i % 5) for i in range(25)]
    highs  = [c + 2 for c in closes]
    lows   = [c - 2 for c in closes]
    r = _compute_cci(highs, lows, closes)
    assert "cci" in r
    assert isinstance(r["cci"], float)


def test_cci_overbought():
    # Price consistently closing near high — CCI should be > 100
    closes = [100 + i * 2 for i in range(25)]
    highs  = [c + 0.1 for c in closes]   # very small upper shadow
    lows   = [c - 5   for c in closes]   # large lower shadow → TP near high
    r = _compute_cci(highs, lows, closes)
    assert r.get("cci_overbought") is True


def test_cci_oversold():
    # Price consistently closing near low — CCI should be < -100
    closes = [100 - i * 2 for i in range(25)]
    highs  = [c + 5   for c in closes]
    lows   = [c - 0.1 for c in closes]
    r = _compute_cci(highs, lows, closes)
    assert r.get("cci_oversold") is True


def test_cci_insufficient_data():
    r = _compute_cci([1, 2, 3], [2, 3, 4], [0, 1, 2])
    assert r == {}


# ── IVR ───────────────────────────────────────────────────────────────────────

def test_ivr_returns_value():
    closes = [100 + (i % 7) * 0.5 for i in range(50)]
    r = _compute_ivr(closes)
    assert "ivr" in r
    assert 0 <= r["ivr"] <= 100


def test_ivr_high_when_volatile():
    import math
    # Last bar has high volatility vs history
    base = [100.0] * 30           # very stable
    spike = [100 + (i % 2) * 10 for i in range(20)]  # high vol
    closes = base + spike
    r = _compute_ivr(closes)
    assert r.get("iv_high") is True


def test_ivr_insufficient_data():
    r = _compute_ivr([100] * 10)
    assert r == {}


# ── Short Interest ────────────────────────────────────────────────────────────

def test_short_interest_basic():
    r = _compute_short_interest("TSLA", float_shares=1e9, short_shares=2e8, avg_volume=5e7)
    assert "days_to_cover" in r
    assert "short_float_pct" in r
    assert abs(r["days_to_cover"] - 4.0) < 0.1      # 200M / 50M = 4 days
    assert abs(r["short_float_pct"] - 20.0) < 0.1   # 200M / 1B = 20%


def test_short_interest_squeeze_candidate():
    r = _compute_short_interest("GME", float_shares=5e7, short_shares=1.5e7, avg_volume=2e6)
    assert r.get("squeeze_candidate") is True   # 30% float, 7.5 DTC


def test_short_interest_high_float_no_squeeze():
    # 16% float short, 2 DTC — high interest (>15%) but not squeeze (DTC < 3)
    r = _compute_short_interest("AAPL", float_shares=1e10, short_shares=1.6e9, avg_volume=8e8)
    assert r.get("high_short_interest") is True
    assert r.get("squeeze_candidate") is False


def test_short_interest_missing_data():
    r = _compute_short_interest("SPY", float_shares=None, short_shares=None, avg_volume=None)
    assert r == {}
