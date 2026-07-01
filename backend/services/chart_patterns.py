"""Chart pattern detection — pure Python, zero external deps.

All detectors work on recent daily OHLCV data (≥30 bars recommended).
detect() returns a dict with ptn_* boolean flags + chart_bull_patterns,
chart_bear_patterns, chart_signal.
"""
from typing import Any, Dict, List, Tuple


# ── Pivot helpers ─────────────────────────────────────────────────────────────

def _find_pivots(highs: list, lows: list, window: int = 5) -> Tuple[List, List]:
    """Local maxima (peaks) and minima (troughs) within ±window bars."""
    n = min(len(highs), len(lows))
    peaks, troughs = [], []
    for i in range(window, n - window):
        local_h = highs[i - window: i + window + 1]
        local_l = lows[i  - window: i + window + 1]
        if highs[i] >= max(local_h):
            peaks.append((i, highs[i]))
        if lows[i] <= min(local_l):
            troughs.append((i, lows[i]))
    return peaks, troughs


def _linreg_slope(values: list) -> float:
    """Slope of linear regression through values (OLS)."""
    n = len(values)
    if n < 2:
        return 0.0
    xs = list(range(n))
    mx = sum(xs) / n
    my = sum(values) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, values))
    den = sum((x - mx) ** 2 for x in xs)
    return num / den if den else 0.0


# ── Pattern detectors ─────────────────────────────────────────────────────────

def _head_and_shoulders(peaks: list, troughs: list, closes: list,
                        tol: float = 0.08) -> Tuple[bool, bool]:
    """
    Returns (head_shoulders, inv_head_shoulders).
    H&S: 3 peaks where middle > both shoulders (≤tol apart) + neckline break.
    Inv H&S: 3 troughs where middle < both shoulders + neckline break above.
    """
    last = closes[-1] if closes else 0.0

    hs = False
    for i in range(len(peaks) - 2):
        l_sh, head, r_sh = peaks[i], peaks[i + 1], peaks[i + 2]
        if head[1] <= l_sh[1] or head[1] <= r_sh[1]:
            continue
        if abs(l_sh[1] - r_sh[1]) / (head[1] or 1) > tol:
            continue
        t_inner = [t for t in troughs if l_sh[0] < t[0] < r_sh[0]]
        if len(t_inner) < 2:
            continue
        neckline = (t_inner[0][1] + t_inner[-1][1]) / 2
        if last <= neckline * 1.02:      # price at/below neckline
            hs = True
            break

    ihs = False
    for i in range(len(troughs) - 2):
        l_sh, head, r_sh = troughs[i], troughs[i + 1], troughs[i + 2]
        if head[1] >= l_sh[1] or head[1] >= r_sh[1]:
            continue
        if abs(l_sh[1] - r_sh[1]) / (head[1] or 1) > tol:
            continue
        p_inner = [p for p in peaks if l_sh[0] < p[0] < r_sh[0]]
        if len(p_inner) < 2:
            continue
        neckline = (p_inner[0][1] + p_inner[-1][1]) / 2
        if last >= neckline * 0.98:      # price at/above neckline
            ihs = True
            break

    return hs, ihs


def _double_top_bottom(peaks: list, troughs: list, closes: list,
                       tol: float = 0.03) -> Tuple[bool, bool]:
    """
    Returns (double_top, double_bottom).
    Double Top: two peaks within tol%, trough between, price near/below neckline.
    Double Bottom: two troughs within tol%, peak between, price near/above neckline.
    """
    last = closes[-1] if closes else 0.0

    double_top = False
    for i in range(len(peaks) - 1):
        p1, p2 = peaks[i], peaks[i + 1]
        avg = (p1[1] + p2[1]) / 2
        if avg == 0 or abs(p1[1] - p2[1]) / avg > tol:
            continue
        t_between = [t for t in troughs if p1[0] < t[0] < p2[0]]
        if not t_between:
            continue
        neckline = min(t[1] for t in t_between)
        if last <= neckline * 1.02:
            double_top = True
            break

    double_bottom = False
    for i in range(len(troughs) - 1):
        t1, t2 = troughs[i], troughs[i + 1]
        avg = (t1[1] + t2[1]) / 2
        if avg == 0 or abs(t1[1] - t2[1]) / avg > tol:
            continue
        p_between = [p for p in peaks if t1[0] < p[0] < t2[0]]
        if not p_between:
            continue
        neckline = max(p[1] for p in p_between)
        if last >= neckline * 0.98:
            double_bottom = True
            break

    return double_top, double_bottom


def _triangle_patterns(highs: list, lows: list, lookback: int = 30) -> Tuple[bool, bool, bool]:
    """
    Returns (ascending, descending, symmetrical).
    Uses linear regression slope on highs vs lows over the lookback window.
    """
    n = min(len(highs), len(lows), lookback)
    if n < 10:
        return False, False, False
    h_seg = highs[-n:]
    l_seg = lows[-n:]
    price_range = max(h_seg) - min(l_seg)
    if price_range == 0:
        return False, False, False
    h_slope = _linreg_slope(h_seg) * n / price_range   # normalised
    l_slope = _linreg_slope(l_seg) * n / price_range
    # Both converging toward each other
    if not (h_slope < 0.2 and l_slope > -0.2):
        return False, False, False
    ascending   = l_slope >  0.05 and abs(h_slope) < 0.08
    descending  = h_slope < -0.05 and abs(l_slope) < 0.08
    symmetrical = h_slope < -0.04 and l_slope > 0.04 and not ascending and not descending
    return ascending, descending, symmetrical


def _flag_pennant(highs: list, lows: list, closes: list,
                  pole_bars: int = 8, flag_bars: int = 10) -> Tuple[bool, bool, bool]:
    """
    Returns (bull_flag, bear_flag, pennant).
    Pole = sharp directional move; flag = tight consolidation after it.
    """
    n = min(len(highs), len(lows), len(closes))
    if n < pole_bars + flag_bars:
        return False, False, False
    pole_start = n - pole_bars - flag_bars
    pole_end   = n - flag_bars
    flag_start = n - flag_bars
    pole_move_pct = (closes[pole_end - 1] - closes[pole_start]) / (closes[pole_start] or 1) * 100
    flag_highs  = highs[flag_start:]
    flag_lows   = lows[flag_start:]
    flag_closes = closes[flag_start:]
    flag_range  = max(flag_highs) - min(flag_lows)
    flag_range_pct = flag_range / (closes[flag_start] or 1) * 100
    # Consolidation must be tight (< 50% of pole move)
    if flag_range_pct >= abs(pole_move_pct) * 0.5:
        return False, False, False
    flag_slope = _linreg_slope(flag_closes)
    h_slope    = _linreg_slope(flag_highs)
    l_slope    = _linreg_slope(flag_lows)
    bull_flag = pole_move_pct >  5 and flag_slope <= 0
    bear_flag = pole_move_pct < -5 and flag_slope >= 0
    # Pennant: sharp pole + converging consolidation (not parallel channel)
    pennant_converge = (h_slope < 0 and l_slope > 0) or (h_slope > 0 and l_slope < 0)
    pennant = abs(pole_move_pct) > 5 and pennant_converge and not bull_flag and not bear_flag
    return bull_flag, bear_flag, pennant


def _cup_and_handle(closes: list, highs: list, lows: list, min_bars: int = 30) -> bool:
    """
    Cup & Handle: U-shaped recovery (cup) + small pullback (handle) near rim.
    Bullish continuation pattern.
    """
    n = min(len(closes), len(highs), len(lows))
    if n < min_bars:
        return False
    seg = closes[-n:]
    third = n // 3
    fifth = max(n // 5, 1)
    peak1  = max(seg[:third])
    trough = min(seg[fifth: 4 * fifth])
    peak2  = max(seg[2 * third:])
    avg_peak = (peak1 + peak2) / 2
    if avg_peak == 0:
        return False
    cup_depth      = (avg_peak - trough) / avg_peak
    peaks_equal    = abs(peak1 - peak2) / avg_peak < 0.08
    handle_seg     = seg[-fifth:]
    handle_low     = min(handle_seg)
    handle_pullback = (peak2 - handle_low) / (peak2 or 1)
    handle_valid   = 0.015 < handle_pullback < 0.15
    near_breakout  = seg[-1] >= peak2 * 0.95
    return cup_depth > 0.08 and peaks_equal and handle_valid and near_breakout


# ── Public API ────────────────────────────────────────────────────────────────

_BULLISH_PATTERNS = ("ptn_inv_head_shoulders", "ptn_double_bottom",
                     "ptn_ascending_triangle", "ptn_symmetrical_triangle",
                     "ptn_bull_flag", "ptn_pennant", "ptn_cup_handle")
_BEARISH_PATTERNS = ("ptn_head_shoulders", "ptn_double_top",
                     "ptn_descending_triangle", "ptn_bear_flag")


def detect(highs: list, lows: list, closes: list) -> Dict[str, Any]:
    """
    Detect all chart patterns from daily OHLCV data.

    Returns a dict with:
    - ptn_* boolean flags for each pattern
    - chart_bull_patterns (int): count of active bullish patterns
    - chart_bear_patterns (int): count of active bearish patterns
    - chart_signal: "BULLISH" | "BEARISH" | "NEUTRAL"
    """
    n = min(len(highs), len(lows), len(closes))
    base: Dict[str, Any] = {
        "ptn_head_shoulders":       False,
        "ptn_inv_head_shoulders":   False,
        "ptn_double_top":           False,
        "ptn_double_bottom":        False,
        "ptn_ascending_triangle":   False,
        "ptn_descending_triangle":  False,
        "ptn_symmetrical_triangle": False,
        "ptn_bull_flag":            False,
        "ptn_bear_flag":            False,
        "ptn_pennant":              False,
        "ptn_cup_handle":           False,
        "chart_bull_patterns":      0,
        "chart_bear_patterns":      0,
        "chart_signal":             "NEUTRAL",
    }
    if n < 10:
        return base

    window  = max(3, n // 15)
    peaks, troughs = _find_pivots(highs, lows, window)

    hs,  ihs        = _head_and_shoulders(peaks, troughs, closes)
    dt,  db         = _double_top_bottom(peaks, troughs, closes)
    asc, desc, sym  = _triangle_patterns(highs, lows)
    bull_f, bear_f, pennant = _flag_pennant(highs, lows, closes)
    cup             = _cup_and_handle(closes, highs, lows)

    base.update({
        "ptn_head_shoulders":       hs,
        "ptn_inv_head_shoulders":   ihs,
        "ptn_double_top":           dt,
        "ptn_double_bottom":        db,
        "ptn_ascending_triangle":   asc,
        "ptn_descending_triangle":  desc,
        "ptn_symmetrical_triangle": sym,
        "ptn_bull_flag":            bull_f,
        "ptn_bear_flag":            bear_f,
        "ptn_pennant":              pennant,
        "ptn_cup_handle":           cup,
    })

    bull_count = sum(1 for k in _BULLISH_PATTERNS if base.get(k))
    bear_count = sum(1 for k in _BEARISH_PATTERNS if base.get(k))
    base["chart_bull_patterns"] = bull_count
    base["chart_bear_patterns"] = bear_count
    if bull_count > bear_count:
        base["chart_signal"] = "BULLISH"
    elif bear_count > bull_count:
        base["chart_signal"] = "BEARISH"
    return base
