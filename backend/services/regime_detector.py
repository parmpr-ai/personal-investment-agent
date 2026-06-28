"""
Market regime detection based on SPY price action + VIX.
Classifies the current market into 4 discrete states:

  BULL_TREND   : SPY above SMA20+SMA50, RSI>55, volume confirmation, VIX<20
  BEAR_TREND   : SPY below SMA20+SMA50, RSI<45, VIX>22
  CHOPPY_RANGE : SPY flat ±1.5% over 5d, no clear directional bias
  CRISIS       : VIX > 35 OR SPY down > 8% over 20 days

Regime changes require 2 consecutive detections (hysteresis) to avoid
flip-flopping on borderline conditions.

Each regime activates/deactivates specific strategies and adjusts
position sizing multipliers, stop-loss widths, and confidence thresholds.
"""
import asyncio
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

_TIMEOUT = 8
_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; InvestAgent/6.0)"}

# Cache: refresh every 15 min (regime doesn't change cycle-to-cycle)
_regime_cache: Optional[Dict[str, Any]] = None
_regime_cache_ts: float = 0.0
_CACHE_TTL = 900  # 15 min

# History ring-buffer (last 20 regime reads)
_regime_history: List[Dict[str, Any]] = []

# Hysteresis: track pending regime change — only commit after 2 consecutive detections
_pending_regime: Optional[str] = None
_confirmed_regime: Optional[str] = None


# ── Per-regime strategy configuration ────────────────────────────────────────

REGIME_CONFIG: Dict[str, Dict[str, Any]] = {
    "BULL_TREND": {
        "active_long_strategies":  ["momentum", "breakout", "trend_follow"],
        "active_short_strategies": [],                   # no shorts in strong bull
        "size_multiplier":         1.2,                  # slightly larger positions
        "stop_mult":               1.0,
        "confidence_bonus":        5,                    # easier entry threshold
        "description":             "Strong bull — momentum + breakout in focus",
    },
    "BEAR_TREND": {
        "active_long_strategies":  ["mean_reversion"],   # only counter-trend buys
        "active_short_strategies": ["short_momentum", "short_breakdown"],
        "size_multiplier":         0.7,                  # smaller longs
        "stop_mult":               0.8,                  # tighter stops
        "confidence_bonus":        -10,                  # harder entry threshold
        "description":             "Bear market — shorts preferred, reduce long exposure",
    },
    "CHOPPY_RANGE": {
        "active_long_strategies":  ["mean_reversion", "trend_follow"],
        "active_short_strategies": ["short_momentum"],
        "size_multiplier":         0.85,
        "stop_mult":               0.9,
        "confidence_bonus":        0,
        "description":             "Range-bound — mean-reversion in focus, no breakouts",
    },
    "CRISIS": {
        "active_long_strategies":  [],                   # no new longs in crisis
        "active_short_strategies": ["short_momentum", "short_breakdown"],
        "size_multiplier":         0.4,                  # minimal sizing
        "stop_mult":               0.6,                  # very tight stops
        "confidence_bonus":        -20,                  # nearly impossible to enter long
        "description":             "Crisis / extreme fear — preserve capital, shorts only",
    },
}


async def _fetch_spy_history(days: int = 60) -> Optional[Dict[str, List[float]]]:
    """Fetch SPY daily closes + volumes from Yahoo v8 chart."""
    url = "https://query1.finance.yahoo.com/v8/finance/chart/SPY"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS) as client:
            r = await client.get(url, params={"interval": "1d", "range": "3mo"})
            r.raise_for_status()
            data = r.json()
        q = data["chart"]["result"][0]["indicators"]["quote"][0]
        closes_raw  = q.get("close",  [])
        volumes_raw = q.get("volume", [])
        # Filter aligned pairs where close is valid
        closes, volumes = [], []
        for c, v in zip(closes_raw, volumes_raw):
            if c is not None and c > 0:
                closes.append(c)
                volumes.append(float(v) if v else 0.0)
        return {"closes": closes[-days:], "volumes": volumes[-days:]}
    except Exception:
        return None


async def _fetch_vix() -> Optional[float]:
    """Fetch current VIX from Yahoo Finance."""
    url = "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS) as client:
            r = await client.get(url, params={"interval": "1d", "range": "5d"})
            r.raise_for_status()
            data = r.json()
        closes = data["chart"]["result"][0]["indicators"]["quote"][0]["close"]
        vals = [c for c in closes if c is not None]
        return vals[-1] if vals else None
    except Exception:
        return None


def _rsi(closes: List[float], period: int = 14) -> float:
    """Simple RSI calculation from a list of closes."""
    if len(closes) < period + 1:
        return 50.0
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    recent = deltas[-period:]
    avg_gain = sum(max(d, 0) for d in recent) / period
    avg_loss = sum(max(-d, 0) for d in recent) / period
    if avg_loss == 0:
        return 100.0
    return round(100 - (100 / (1 + avg_gain / avg_loss)), 1)


def _volume_trend(volumes: List[float]) -> float:
    """Return ratio of 5d avg volume vs 20d avg volume. >1 = expanding, <1 = contracting."""
    if len(volumes) < 20:
        return 1.0
    vol_5d  = sum(volumes[-5:])  / 5
    vol_20d = sum(volumes[-20:]) / 20
    return round(vol_5d / vol_20d, 2) if vol_20d > 0 else 1.0


def _classify(spy_data: Dict[str, List[float]], vix: float) -> Tuple[str, float, Dict]:
    """
    Regime classification from SPY price/volume data + VIX + RSI.
    Returns (regime, confidence_pct, details).
    """
    spy_closes  = spy_data.get("closes",  [])
    spy_volumes = spy_data.get("volumes", [])

    if len(spy_closes) < 21:
        return "CHOPPY_RANGE", 50.0, {}

    import statistics

    price     = spy_closes[-1]
    sma20     = statistics.mean(spy_closes[-20:])
    sma50     = statistics.mean(spy_closes[-50:]) if len(spy_closes) >= 50 else sma20
    trend_5d  = (price - spy_closes[-6])  / spy_closes[-6]  * 100 if len(spy_closes) >= 6  else 0
    trend_20d = (price - spy_closes[-21]) / spy_closes[-21] * 100 if len(spy_closes) >= 21 else 0

    above_sma20  = price > sma20
    above_sma50  = price > sma50
    golden_cross = sma20 > sma50

    spy_rsi    = _rsi(spy_closes)
    vol_ratio  = _volume_trend(spy_volumes)   # >1.1 = volume confirming move

    details = {
        "spy_price":    round(price, 2),
        "sma20":        round(sma20, 2),
        "sma50":        round(sma50, 2),
        "trend_5d_pct": round(trend_5d, 2),
        "trend_20d_pct":round(trend_20d, 2),
        "above_sma20":  above_sma20,
        "above_sma50":  above_sma50,
        "golden_cross": golden_cross,
        "rsi":          spy_rsi,
        "volume_ratio": vol_ratio,
        "vix":          round(vix, 1),
    }

    # ── Crisis: VIX extreme or severe drawdown ────────────────────────────────
    if vix > 35 or trend_20d < -8:
        confidence = min(95, 60 + (vix - 35) * 2 if vix > 35 else 60 + abs(trend_20d + 8) * 3)
        return "CRISIS", round(confidence, 1), details

    # ── Bear: SPY structurally bearish ────────────────────────────────────────
    if not above_sma20 and not above_sma50 and trend_5d < -1.0 and vix > 22:
        bear_score = 0
        if not above_sma20:      bear_score += 30
        if not above_sma50:      bear_score += 25
        if not golden_cross:     bear_score += 20
        if trend_5d < -2:        bear_score += 15
        if vix > 25:             bear_score += 10
        if spy_rsi < 45:         bear_score += 10   # RSI confirmation
        if vol_ratio > 1.1:      bear_score += 5    # high volume selloff = conviction
        confidence = min(92, 40 + bear_score * 0.45)
        return "BEAR_TREND", round(confidence, 1), details

    # ── Bull: strong uptrend with low fear ────────────────────────────────────
    if above_sma20 and above_sma50 and golden_cross and trend_5d > 0.5 and vix < 22:
        bull_score = 0
        if above_sma20:          bull_score += 25
        if above_sma50:          bull_score += 20
        if golden_cross:         bull_score += 20
        if trend_5d > 1.5:       bull_score += 15
        if trend_20d > 3:        bull_score += 15
        if vix < 15:             bull_score += 10
        if spy_rsi > 55:         bull_score += 10   # RSI momentum confirmation
        if vol_ratio > 1.05:     bull_score += 5    # volume confirms the rally
        confidence = min(92, 35 + bull_score * 0.50)
        return "BULL_TREND", round(confidence, 1), details

    # ── Choppy: neither clearly bull nor bear ────────────────────────────────
    choppy_score = 50
    if abs(trend_5d) < 1.5:  choppy_score += 15
    if abs(trend_20d) < 3:   choppy_score += 10
    if 45 <= spy_rsi <= 55:  choppy_score += 10   # neutral RSI = choppy
    confidence = min(80, choppy_score)
    return "CHOPPY_RANGE", round(confidence, 1), details


async def detect_regime(force_refresh: bool = False) -> Dict[str, Any]:
    """
    Return current market regime with full details.
    Cached for 15 min. Applies hysteresis: a regime change is only committed
    after being detected in 2 consecutive calls (prevents flip-flopping).
    """
    global _regime_cache, _regime_cache_ts, _regime_history
    global _pending_regime, _confirmed_regime

    if not force_refresh and _regime_cache and time.time() - _regime_cache_ts < _CACHE_TTL:
        return _regime_cache

    spy_data, vix = await asyncio.gather(
        _fetch_spy_history(60),
        _fetch_vix(),
        return_exceptions=True,
    )

    if isinstance(spy_data, Exception) or not spy_data:
        spy_data = None
    if isinstance(vix, Exception) or vix is None:
        vix = 18.0  # fallback: assume calm market

    if not spy_data:
        result = {
            "regime": _confirmed_regime or "CHOPPY_RANGE",
            "confidence": 50.0,
            "vix": vix,
            "details": {},
            "config": REGIME_CONFIG[_confirmed_regime or "CHOPPY_RANGE"],
            "ts": datetime.now(timezone.utc).isoformat(),
            "data_ok": False,
        }
        _regime_cache = result
        _regime_cache_ts = time.time()
        return result

    raw_regime, confidence, details = _classify(spy_data, vix)

    # ── Hysteresis: require 2 consecutive detections to confirm a change ──────
    current = _confirmed_regime or raw_regime
    if raw_regime == current:
        # Stable — clear any pending change
        _pending_regime = None
        _confirmed_regime = raw_regime
        regime = raw_regime
    elif raw_regime == _pending_regime:
        # Second consecutive detection of a different regime → confirm change
        _confirmed_regime = raw_regime
        _pending_regime = None
        regime = raw_regime
    else:
        # First detection of a different regime → hold current, store as pending
        _pending_regime = raw_regime
        regime = current  # keep the confirmed regime for this cycle

    details["vix"] = round(vix, 1)
    details["raw_regime"] = raw_regime          # expose the raw signal
    details["pending_regime"] = _pending_regime  # expose hysteresis state

    # Days in current regime (count consecutive matching history entries)
    days_in_regime = 1
    for h in reversed(_regime_history):
        if h.get("regime") == regime:
            days_in_regime += 1
        else:
            break

    result = {
        "regime": regime,
        "confidence": confidence,
        "vix": round(vix, 1),
        "details": details,
        "config": REGIME_CONFIG[regime],
        "days_in_regime": days_in_regime,
        "history": list(_regime_history[-5:]),
        "ts": datetime.now(timezone.utc).isoformat(),
        "data_ok": True,
    }

    # Append to history only on confirmed regime changes
    if not _regime_history or _regime_history[-1].get("regime") != regime:
        _regime_history.append({"regime": regime, "ts": result["ts"], "vix": round(vix, 1)})
        if len(_regime_history) > 20:
            _regime_history = _regime_history[-20:]

    _regime_cache = result
    _regime_cache_ts = time.time()
    return result


def apply_regime_to_config(agent_config: Dict, regime_result: Dict) -> Dict:
    """
    Return a modified copy of agent_config with regime-specific adjustments.
    Does NOT mutate the original config.
    """
    regime = regime_result.get("regime", "CHOPPY_RANGE")
    cfg = REGIME_CONFIG.get(regime, REGIME_CONFIG["CHOPPY_RANGE"])

    adjusted = dict(agent_config)

    # Override active strategies
    adjusted["strategies"] = [
        s for s in agent_config.get("strategies", [])
        if s in cfg["active_long_strategies"]
    ] or cfg["active_long_strategies"]

    adjusted["short_strategies"] = [
        s for s in agent_config.get("short_strategies", [])
        if s in cfg["active_short_strategies"]
    ] or cfg["active_short_strategies"]

    # Raise confidence threshold in bear/crisis (harder to enter)
    bonus = cfg["confidence_bonus"]
    adjusted["min_confidence"] = max(50, agent_config.get("min_confidence", 65) - bonus)
    adjusted["min_short_confidence"] = max(55, agent_config.get("min_short_confidence", 68) - bonus)

    # Expose multiplier for caller to scale position sizes
    adjusted["_regime_size_mult"] = cfg["size_multiplier"]
    adjusted["_regime_stop_mult"] = cfg["stop_mult"]
    adjusted["_regime"] = regime

    return adjusted
