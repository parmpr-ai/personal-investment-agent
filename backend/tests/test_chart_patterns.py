"""Unit tests for chart pattern detection."""
import pytest
from services.chart_patterns import detect, _find_pivots, _linreg_slope


# ── Helper builders ───────────────────────────────────────────────────────────

def _wrap(closes, shadow=1.0):
    highs = [c + shadow for c in closes]
    lows  = [c - shadow for c in closes]
    return highs, lows, closes


# ── Pivot helpers ─────────────────────────────────────────────────────────────

def test_find_pivots_peaks():
    closes = [1, 2, 3, 2, 1, 2, 3, 2, 1]
    highs  = [c + 0.5 for c in closes]
    lows   = [c - 0.5 for c in closes]
    peaks, troughs = _find_pivots(highs, lows, window=2)
    assert len(peaks) >= 1
    assert all(h > 0 for _, h in peaks)


def test_linreg_slope_rising():
    assert _linreg_slope([1, 2, 3, 4, 5]) > 0


def test_linreg_slope_falling():
    assert _linreg_slope([5, 4, 3, 2, 1]) < 0


def test_linreg_slope_flat():
    assert abs(_linreg_slope([3, 3, 3, 3, 3])) < 0.01


# ── Head & Shoulders ──────────────────────────────────────────────────────────

def _hs_closes():
    """Classic H&S: left shoulder (110) → head (120) → right shoulder (110) → neckline break.
    Extra trailing bars ensure right-shoulder peak is inside pivot detection window."""
    c = (
        [100] * 5 +
        [100, 105, 110, 105, 100] +     # left shoulder peak ~110
        [100, 110, 120, 110, 100] +     # head peak ~120
        [100, 105, 110, 105, 100] +     # right shoulder peak ~110
        [97, 95, 93, 92]                # breakdown below neckline (~100) + padding
    )
    return c


def _ihs_closes():
    """Inv H&S: left shoulder (110) → head (100) → right shoulder (110) → neckline breakout."""
    c = (
        [120] * 5 +
        [120, 115, 110, 115, 120] +     # left shoulder trough ~110
        [120, 110, 100, 110, 120] +     # head trough ~100
        [120, 115, 110, 115, 120] +     # right shoulder trough ~110
        [123, 125, 127, 128]            # breakout above neckline (~120) + padding
    )
    return c


def test_head_and_shoulders_detected():
    closes = _hs_closes()
    h, l, c = _wrap(closes)
    r = detect(h, l, c)
    assert r["ptn_head_shoulders"] is True


def test_inv_head_and_shoulders_detected():
    closes = _ihs_closes()
    h, l, c = _wrap(closes)
    r = detect(h, l, c)
    assert r["ptn_inv_head_shoulders"] is True


def test_hs_is_bearish():
    h, l, c = _wrap(_hs_closes())
    r = detect(h, l, c)
    assert r["chart_bear_patterns"] >= 1


def test_ihs_is_bullish():
    h, l, c = _wrap(_ihs_closes())
    r = detect(h, l, c)
    assert r["chart_bull_patterns"] >= 1


# ── Double Top / Bottom ───────────────────────────────────────────────────────

def _double_top_closes():
    """Two equal peaks ~110 with a trough ~100; price ends below neckline ~100."""
    return [100]*3 + [100, 105, 110, 105, 100] + [100, 105, 110, 105, 100] + [98]


def _double_bottom_closes():
    """Two equal troughs ~90 with a peak ~100; price ends above neckline ~100."""
    return [100]*3 + [100, 95, 90, 95, 100] + [100, 95, 90, 95, 100] + [102]


def test_double_top_detected():
    c = _double_top_closes()
    h = [v + 1 for v in c]
    l = [v - 1 for v in c]
    r = detect(h, l, c)
    assert r["ptn_double_top"] is True


def test_double_bottom_detected():
    c = _double_bottom_closes()
    h = [v + 1 for v in c]
    l = [v - 1 for v in c]
    r = detect(h, l, c)
    assert r["ptn_double_bottom"] is True


# ── Triangle Patterns ─────────────────────────────────────────────────────────

def _ascending_triangle_data(n=30):
    """Flat top at 110, rising lows from 90 to 105."""
    closes = [110 - (n - i) * 0.1 + (i % 2) * 0.5 for i in range(n)]
    highs  = [109.5 + (i % 2) * 0.5 for i in range(n)]  # ~flat
    lows   = [90 + i * 0.5 for i in range(n)]             # rising
    return highs, lows, closes


def _descending_triangle_data(n=30):
    """Falling highs from 110 to 95, flat support at 90."""
    closes = [90 + (n - i) * 0.1 - (i % 2) * 0.5 for i in range(n)]
    highs  = [110 - i * 0.5 for i in range(n)]            # falling
    lows   = [90.5 - (i % 2) * 0.5 for i in range(n)]    # ~flat
    return highs, lows, closes


def _symmetrical_triangle_data(n=30):
    """Converging highs and lows toward center."""
    mid = 100
    highs  = [mid + (n - i) * 0.3 for i in range(n)]   # falling highs
    lows   = [mid - (n - i) * 0.3 for i in range(n)]   # rising lows
    closes = [mid + (i % 3 - 1) * 0.2 for i in range(n)]
    return highs, lows, closes


def test_ascending_triangle_detected():
    h, l, c = _ascending_triangle_data()
    r = detect(h, l, c)
    assert r["ptn_ascending_triangle"] is True


def test_descending_triangle_detected():
    h, l, c = _descending_triangle_data()
    r = detect(h, l, c)
    assert r["ptn_descending_triangle"] is True


def test_symmetrical_triangle_detected():
    h, l, c = _symmetrical_triangle_data()
    r = detect(h, l, c)
    assert r["ptn_symmetrical_triangle"] is True


# ── Flag & Pennant ────────────────────────────────────────────────────────────

def _bull_flag_data():
    """8-bar sharp up pole (+10%), then 10-bar slight downward drift."""
    pole   = [100 + i * 1.25 for i in range(8)]    # +10% move
    flag   = [109 - i * 0.3  for i in range(10)]   # gentle pullback
    closes = pole + flag
    highs  = [c + 0.5 for c in closes]
    lows   = [c - 0.5 for c in closes]
    return highs, lows, closes


def _bear_flag_data():
    """8-bar sharp down pole (−10%), then 10-bar slight upward drift."""
    pole   = [110 - i * 1.25 for i in range(8)]    # −10% move
    flag   = [101 + i * 0.3  for i in range(10)]   # gentle bounce
    closes = pole + flag
    highs  = [c + 0.5 for c in closes]
    lows   = [c - 0.5 for c in closes]
    return highs, lows, closes


def test_bull_flag_detected():
    h, l, c = _bull_flag_data()
    r = detect(h, l, c)
    assert r["ptn_bull_flag"] is True


def test_bear_flag_detected():
    h, l, c = _bear_flag_data()
    r = detect(h, l, c)
    assert r["ptn_bear_flag"] is True


def test_bull_flag_is_bullish():
    h, l, c = _bull_flag_data()
    r = detect(h, l, c)
    assert r["chart_bull_patterns"] >= 1


# ── Cup & Handle ──────────────────────────────────────────────────────────────

def _cup_handle_data(n=40):
    """Rim at 110, cup bottom at 95, recovery back to 110, handle pullback to 107."""
    import math
    rim = 110
    bottom = 95
    cup_bars = n - 8
    cup = [rim - (rim - bottom) * math.sin(math.pi * i / cup_bars) for i in range(cup_bars)]
    handle = [109 - i * 0.3 for i in range(8)]
    closes = cup + handle
    highs  = [c + 1 for c in closes]
    lows   = [c - 1 for c in closes]
    return highs, lows, closes


def test_cup_handle_detected():
    h, l, c = _cup_handle_data()
    r = detect(h, l, c)
    assert r["ptn_cup_handle"] is True


def test_cup_handle_is_bullish():
    h, l, c = _cup_handle_data()
    r = detect(h, l, c)
    assert r["chart_bull_patterns"] >= 1


# ── Insufficient data ─────────────────────────────────────────────────────────

def test_insufficient_data_returns_neutral():
    r = detect([], [], [])
    assert r["chart_signal"] == "NEUTRAL"
    assert r["chart_bull_patterns"] == 0
    assert r["chart_bear_patterns"] == 0


def test_all_false_on_tiny_data():
    h, l, c = _wrap([100, 101, 100])
    r = detect(h, l, c)
    assert all(not r[k] for k in r if k.startswith("ptn_"))


# ── Signal summary ────────────────────────────────────────────────────────────

def test_signal_bullish_when_bull_patterns():
    h, l, c = _wrap(_ihs_closes())
    r = detect(h, l, c)
    # Inv H&S detected → chart_signal = BULLISH
    if r["ptn_inv_head_shoulders"]:
        assert r["chart_signal"] == "BULLISH"


def test_signal_bearish_when_bear_patterns():
    c = _hs_closes()
    h = [v + 1 for v in c]
    l = [v - 1 for v in c]
    r = detect(h, l, c)
    if r["ptn_head_shoulders"]:
        assert r["chart_signal"] == "BEARISH"
