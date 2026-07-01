"""
Candlestick pattern detection — pure Python, no external deps.

Patterns implemented (25 total):

Single candle (7)
  doji, hammer, inverted_hammer, hanging_man, shooting_star,
  bullish_marubozu, bearish_marubozu

Two candle (10)
  bullish_engulfing, bearish_engulfing,
  bullish_harami, bearish_harami,
  tweezer_bottom, tweezer_top,
  dark_cloud_cover, piercing_line,
  on_neck, in_neck

Three candle (8)
  morning_star, evening_star,
  morning_doji_star, evening_doji_star,
  three_white_soldiers, three_black_crows,
  three_inside_up, three_inside_down

Returns
-------
detect(opens, highs, lows, closes) -> Dict[str, bool | int]
  All pattern flags plus:
  - candle_bull_score  : +1 per bullish pattern detected
  - candle_bear_score  : +1 per bearish pattern detected
  - candle_signal      : "BULLISH" | "BEARISH" | "NEUTRAL"
"""
from __future__ import annotations
from typing import Dict, List


# ─── helpers ──────────────────────────────────────────────────────────────────

def _body(o: float, c: float) -> float:
    return abs(c - o)

def _range(h: float, l: float) -> float:
    return h - l if h > l else 0.0001

def _upper_shadow(o: float, h: float, c: float) -> float:
    return h - max(o, c)

def _lower_shadow(o: float, l: float, c: float) -> float:
    return min(o, c) - l

def _is_bullish(o: float, c: float) -> bool:
    return c > o

def _is_bearish(o: float, c: float) -> bool:
    return c < o

def _is_doji(o: float, h: float, l: float, c: float, threshold: float = 0.1) -> bool:
    rng = _range(h, l)
    return _body(o, c) / rng < threshold

def _body_pct(o: float, h: float, l: float, c: float) -> float:
    rng = _range(h, l)
    return _body(o, c) / rng


# ─── single-candle patterns ───────────────────────────────────────────────────

def _doji(o, h, l, c) -> bool:
    return _is_doji(o, h, l, c)

def _hammer(o, h, l, c) -> bool:
    """Bullish reversal: small body near top, long lower shadow ≥ 2× body, tiny upper shadow."""
    body = _body(o, c)
    rng  = _range(h, l)
    if body / rng > 0.35:
        return False
    lower = _lower_shadow(o, l, c)
    upper = _upper_shadow(o, h, c)
    return lower >= 2 * body and upper <= 0.1 * rng

def _inverted_hammer(o, h, l, c) -> bool:
    """Bullish reversal: small body near bottom, long upper shadow ≥ 2× body, tiny lower shadow."""
    body  = _body(o, c)
    rng   = _range(h, l)
    if body / rng > 0.35:
        return False
    upper = _upper_shadow(o, h, c)
    lower = _lower_shadow(o, l, c)
    return upper >= 2 * body and lower <= 0.1 * rng

def _hanging_man(o, h, l, c) -> bool:
    """Bearish reversal: same shape as hammer — small body top, long lower shadow."""
    return _hammer(o, h, l, c)  # shape is identical; context (uptrend) differentiates

def _shooting_star(o, h, l, c) -> bool:
    """Bearish reversal: same shape as inverted hammer."""
    return _inverted_hammer(o, h, l, c)

def _bullish_marubozu(o, h, l, c) -> bool:
    """Strong bull: no/tiny shadows, full body up."""
    if not _is_bullish(o, c):
        return False
    rng  = _range(h, l)
    body = _body(o, c)
    return body / rng > 0.90 and _upper_shadow(o, h, c) < 0.05 * rng and _lower_shadow(o, l, c) < 0.05 * rng

def _bearish_marubozu(o, h, l, c) -> bool:
    """Strong bear: no/tiny shadows, full body down."""
    if not _is_bearish(o, c):
        return False
    rng  = _range(h, l)
    body = _body(o, c)
    return body / rng > 0.90 and _upper_shadow(o, h, c) < 0.05 * rng and _lower_shadow(o, l, c) < 0.05 * rng

def _spinning_top(o, h, l, c) -> bool:
    """Indecision: small body, shadows on both sides."""
    rng = _range(h, l)
    body = _body(o, c)
    upper = _upper_shadow(o, h, c)
    lower = _lower_shadow(o, l, c)
    return body / rng < 0.30 and upper > 0.2 * rng and lower > 0.2 * rng


# ─── two-candle patterns ──────────────────────────────────────────────────────

def _bullish_engulfing(o1, h1, l1, c1, o2, h2, l2, c2) -> bool:
    """[1] bearish  [2] bullish larger body that engulfs [1]."""
    return (_is_bearish(o1, c1) and _is_bullish(o2, c2)
            and o2 <= c1 and c2 >= o1)

def _bearish_engulfing(o1, h1, l1, c1, o2, h2, l2, c2) -> bool:
    """[1] bullish  [2] bearish larger body that engulfs [1]."""
    return (_is_bullish(o1, c1) and _is_bearish(o2, c2)
            and o2 >= c1 and c2 <= o1)

def _bullish_harami(o1, h1, l1, c1, o2, h2, l2, c2) -> bool:
    """[1] large bearish  [2] small bullish contained within [1]'s body."""
    return (_is_bearish(o1, c1) and _is_bullish(o2, c2)
            and o2 < o1 and c2 > c1
            and _body(o2, c2) < 0.5 * _body(o1, c1))

def _bearish_harami(o1, h1, l1, c1, o2, h2, l2, c2) -> bool:
    """[1] large bullish  [2] small bearish contained within [1]'s body."""
    return (_is_bullish(o1, c1) and _is_bearish(o2, c2)
            and o2 < c1 and c2 > o1
            and _body(o2, c2) < 0.5 * _body(o1, c1))

def _tweezer_bottom(o1, h1, l1, c1, o2, h2, l2, c2, tol: float = 0.002) -> bool:
    """[1] bearish  [2] bullish with nearly equal lows."""
    return (_is_bearish(o1, c1) and _is_bullish(o2, c2)
            and abs(l1 - l2) / max(l1, 0.0001) < tol)

def _tweezer_top(o1, h1, l1, c1, o2, h2, l2, c2, tol: float = 0.002) -> bool:
    """[1] bullish  [2] bearish with nearly equal highs."""
    return (_is_bullish(o1, c1) and _is_bearish(o2, c2)
            and abs(h1 - h2) / max(h1, 0.0001) < tol)

def _dark_cloud_cover(o1, h1, l1, c1, o2, h2, l2, c2) -> bool:
    """[1] bullish  [2] opens above [1] high, closes below midpoint of [1] body."""
    if not _is_bullish(o1, c1) or not _is_bearish(o2, c2):
        return False
    mid1 = (o1 + c1) / 2
    return o2 > h1 and c2 < mid1

def _piercing_line(o1, h1, l1, c1, o2, h2, l2, c2) -> bool:
    """[1] bearish  [2] opens below [1] low, closes above midpoint of [1] body."""
    if not _is_bearish(o1, c1) or not _is_bullish(o2, c2):
        return False
    mid1 = (o1 + c1) / 2
    return o2 < l1 and c2 > mid1

def _on_neck(o1, h1, l1, c1, o2, h2, l2, c2, tol: float = 0.002) -> bool:
    """[1] bearish  [2] bullish that closes near [1] low — bearish continuation."""
    if not _is_bearish(o1, c1) or not _is_bullish(o2, c2):
        return False
    return abs(c2 - l1) / max(l1, 0.0001) < tol

def _in_neck(o1, h1, l1, c1, o2, h2, l2, c2, tol: float = 0.004) -> bool:
    """[1] bearish  [2] bullish that closes near [1] close — bearish continuation."""
    if not _is_bearish(o1, c1) or not _is_bullish(o2, c2):
        return False
    return abs(c2 - c1) / max(c1, 0.0001) < tol


# ─── three-candle patterns ────────────────────────────────────────────────────

def _morning_star(o1, h1, l1, c1, o2, h2, l2, c2, o3, h3, l3, c3) -> bool:
    """[1] large bearish  [2] small body (gap down)  [3] large bullish closes > mid [1]."""
    if not _is_bearish(o1, c1) or not _is_bullish(o3, c3):
        return False
    mid1 = (o1 + c1) / 2
    small_body2 = _body(o2, c2) < 0.3 * _body(o1, c1)
    gap_down = max(o2, c2) < c1
    closes_above_mid = c3 > mid1
    return small_body2 and gap_down and closes_above_mid

def _evening_star(o1, h1, l1, c1, o2, h2, l2, c2, o3, h3, l3, c3) -> bool:
    """[1] large bullish  [2] small body (gap up)  [3] large bearish closes < mid [1]."""
    if not _is_bullish(o1, c1) or not _is_bearish(o3, c3):
        return False
    mid1 = (o1 + c1) / 2
    small_body2 = _body(o2, c2) < 0.3 * _body(o1, c1)
    gap_up = min(o2, c2) > c1
    closes_below_mid = c3 < mid1
    return small_body2 and gap_up and closes_below_mid

def _morning_doji_star(o1, h1, l1, c1, o2, h2, l2, c2, o3, h3, l3, c3) -> bool:
    """Morning star where [2] is a doji."""
    return (_morning_star(o1, h1, l1, c1, o2, h2, l2, c2, o3, h3, l3, c3)
            and _is_doji(o2, h2, l2, c2))

def _evening_doji_star(o1, h1, l1, c1, o2, h2, l2, c2, o3, h3, l3, c3) -> bool:
    """Evening star where [2] is a doji."""
    return (_evening_star(o1, h1, l1, c1, o2, h2, l2, c2, o3, h3, l3, c3)
            and _is_doji(o2, h2, l2, c2))

def _three_white_soldiers(o1, h1, l1, c1, o2, h2, l2, c2, o3, h3, l3, c3) -> bool:
    """Three consecutive strong bullish candles, each opening within previous body."""
    return (
        _is_bullish(o1, c1) and _is_bullish(o2, c2) and _is_bullish(o3, c3)
        and c2 > c1 and c3 > c2
        and o2 > o1 and o2 < c1
        and o3 > o2 and o3 < c2
        and _body_pct(o1, h1, l1, c1) > 0.5
        and _body_pct(o2, h2, l2, c2) > 0.5
        and _body_pct(o3, h3, l3, c3) > 0.5
    )

def _three_black_crows(o1, h1, l1, c1, o2, h2, l2, c2, o3, h3, l3, c3) -> bool:
    """Three consecutive strong bearish candles, each opening within previous body."""
    return (
        _is_bearish(o1, c1) and _is_bearish(o2, c2) and _is_bearish(o3, c3)
        and c2 < c1 and c3 < c2
        and o2 < o1 and o2 > c1
        and o3 < o2 and o3 > c2
        and _body_pct(o1, h1, l1, c1) > 0.5
        and _body_pct(o2, h2, l2, c2) > 0.5
        and _body_pct(o3, h3, l3, c3) > 0.5
    )

def _three_inside_up(o1, h1, l1, c1, o2, h2, l2, c2, o3, h3, l3, c3) -> bool:
    """Bullish harami ([1],[2]) confirmed by bullish [3] closing above [1] open."""
    return (_bullish_harami(o1, h1, l1, c1, o2, h2, l2, c2)
            and _is_bullish(o3, c3) and c3 > o1)

def _three_inside_down(o1, h1, l1, c1, o2, h2, l2, c2, o3, h3, l3, c3) -> bool:
    """Bearish harami ([1],[2]) confirmed by bearish [3] closing below [1] open."""
    return (_bearish_harami(o1, h1, l1, c1, o2, h2, l2, c2)
            and _is_bearish(o3, c3) and c3 < o1)


# ─── public API ───────────────────────────────────────────────────────────────

def detect(
    opens:  List[float],
    highs:  List[float],
    lows:   List[float],
    closes: List[float],
) -> Dict[str, object]:
    """
    Run all pattern detectors against the last 3 daily candles.
    Needs at least 3 data points; silently returns empty result with neutral signal
    if data is insufficient.
    """
    result: Dict[str, object] = {}

    n = min(len(opens), len(highs), len(lows), len(closes))
    if n < 1:
        return {"candle_signal": "NEUTRAL", "candle_bull_score": 0, "candle_bear_score": 0}

    # last 3 candles (c = current / most recent)
    O = opens[-3:]  if n >= 3 else opens[-n:]
    H = highs[-3:]  if n >= 3 else highs[-n:]
    L = lows[-3:]   if n >= 3 else lows[-n:]
    C = closes[-3:] if n >= 3 else closes[-n:]

    def g(i):
        return O[i], H[i], L[i], C[i]

    # ── single candle (last candle = index -1) ────────────────────────────────
    o, h, l, c = g(-1)
    result["cdl_doji"]             = _doji(o, h, l, c)
    result["cdl_spinning_top"]     = _spinning_top(o, h, l, c)
    result["cdl_bullish_marubozu"] = _bullish_marubozu(o, h, l, c)
    result["cdl_bearish_marubozu"] = _bearish_marubozu(o, h, l, c)

    # hammer/inverted_hammer context: should follow a downtrend
    # hanging_man/shooting_star context: should follow an uptrend
    # We detect the shape; the agent scorer applies trend context.
    result["cdl_hammer"]           = _hammer(o, h, l, c)
    result["cdl_inverted_hammer"]  = _inverted_hammer(o, h, l, c)
    result["cdl_hanging_man"]      = _hanging_man(o, h, l, c)
    result["cdl_shooting_star"]    = _shooting_star(o, h, l, c)

    bull_score = sum([
        result["cdl_bullish_marubozu"],
        result["cdl_hammer"],
        result["cdl_inverted_hammer"],
    ])
    bear_score = sum([
        result["cdl_bearish_marubozu"],
        result["cdl_hanging_man"],
        result["cdl_shooting_star"],
    ])

    # ── two candle (candles -2 and -1) ────────────────────────────────────────
    if len(O) >= 2:
        o1, h1, l1, c1 = g(-2)
        o2, h2, l2, c2 = g(-1)

        result["cdl_bullish_engulfing"] = _bullish_engulfing(o1, h1, l1, c1, o2, h2, l2, c2)
        result["cdl_bearish_engulfing"] = _bearish_engulfing(o1, h1, l1, c1, o2, h2, l2, c2)
        result["cdl_bullish_harami"]    = _bullish_harami(o1, h1, l1, c1, o2, h2, l2, c2)
        result["cdl_bearish_harami"]    = _bearish_harami(o1, h1, l1, c1, o2, h2, l2, c2)
        result["cdl_tweezer_bottom"]    = _tweezer_bottom(o1, h1, l1, c1, o2, h2, l2, c2)
        result["cdl_tweezer_top"]       = _tweezer_top(o1, h1, l1, c1, o2, h2, l2, c2)
        result["cdl_dark_cloud_cover"]  = _dark_cloud_cover(o1, h1, l1, c1, o2, h2, l2, c2)
        result["cdl_piercing_line"]     = _piercing_line(o1, h1, l1, c1, o2, h2, l2, c2)
        result["cdl_on_neck"]           = _on_neck(o1, h1, l1, c1, o2, h2, l2, c2)
        result["cdl_in_neck"]           = _in_neck(o1, h1, l1, c1, o2, h2, l2, c2)

        bull_score += sum([
            result["cdl_bullish_engulfing"],
            result["cdl_bullish_harami"],
            result["cdl_tweezer_bottom"],
            result["cdl_piercing_line"],
        ])
        bear_score += sum([
            result["cdl_bearish_engulfing"],
            result["cdl_bearish_harami"],
            result["cdl_tweezer_top"],
            result["cdl_dark_cloud_cover"],
            result["cdl_on_neck"],
            result["cdl_in_neck"],
        ])

    # ── three candle (candles -3, -2, -1) ─────────────────────────────────────
    if len(O) >= 3:
        o1, h1, l1, c1 = g(-3)
        o2, h2, l2, c2 = g(-2)
        o3, h3, l3, c3 = g(-1)

        result["cdl_morning_star"]        = _morning_star(o1,h1,l1,c1, o2,h2,l2,c2, o3,h3,l3,c3)
        result["cdl_evening_star"]        = _evening_star(o1,h1,l1,c1, o2,h2,l2,c2, o3,h3,l3,c3)
        result["cdl_morning_doji_star"]   = _morning_doji_star(o1,h1,l1,c1, o2,h2,l2,c2, o3,h3,l3,c3)
        result["cdl_evening_doji_star"]   = _evening_doji_star(o1,h1,l1,c1, o2,h2,l2,c2, o3,h3,l3,c3)
        result["cdl_three_white_soldiers"]= _three_white_soldiers(o1,h1,l1,c1, o2,h2,l2,c2, o3,h3,l3,c3)
        result["cdl_three_black_crows"]   = _three_black_crows(o1,h1,l1,c1, o2,h2,l2,c2, o3,h3,l3,c3)
        result["cdl_three_inside_up"]     = _three_inside_up(o1,h1,l1,c1, o2,h2,l2,c2, o3,h3,l3,c3)
        result["cdl_three_inside_down"]   = _three_inside_down(o1,h1,l1,c1, o2,h2,l2,c2, o3,h3,l3,c3)

        bull_score += sum([
            result["cdl_morning_star"],
            result["cdl_morning_doji_star"],
            result["cdl_three_white_soldiers"],
            result["cdl_three_inside_up"],
        ])
        bear_score += sum([
            result["cdl_evening_star"],
            result["cdl_evening_doji_star"],
            result["cdl_three_black_crows"],
            result["cdl_three_inside_down"],
        ])

    result["candle_bull_score"] = int(bull_score)
    result["candle_bear_score"] = int(bear_score)
    result["candle_signal"] = (
        "BULLISH" if bull_score > bear_score
        else "BEARISH" if bear_score > bull_score
        else "NEUTRAL"
    )
    return result
