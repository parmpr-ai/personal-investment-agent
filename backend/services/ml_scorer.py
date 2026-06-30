"""
ML-based signal combination using Gradient Boosting.

Replaces hardcoded signal weights with a learned classifier that predicts
whether a ticker will return > 2% in the next 5 trading days.

Training data: 2 years of daily bars from Yahoo Finance (same as backtester).
Model: scikit-learn GradientBoostingClassifier (no extra runtime infra needed).
Persistence: model saved per-strategy to disk as joblib/pickle.
Re-train: triggered manually via POST /agent/ml/train, or auto-triggered
          if model is older than 7 days.

Integration: ml_confidence_boost() called from _decide_for_ticker() to
             adjust the base confidence score up or down by ≤ 20 points.
"""
import asyncio
import json
import pickle
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

BASE_DIR = Path(__file__).resolve().parents[1]
MODEL_DIR = BASE_DIR / "ml_models"
MODEL_DIR.mkdir(exist_ok=True)

# In-memory model cache
_models: Dict[str, Any] = {}
_model_ts: Dict[str, float] = {}

RETRAIN_INTERVAL = 7 * 86400        # 7 days (age-based retrain)
RETRAIN_COOLDOWN = 24 * 3600        # 24h minimum between auto-retrains
ACCURACY_RETRAIN_THRESHOLD = 0.45   # trigger retrain if rolling accuracy drops below 45%
ACCURACY_MIN_TRADES = 10            # need at least this many trades before checking

# Rolling trade accuracy tracker — {strategy: deque of 1/0 (correct/incorrect)}
_rolling_outcomes: Dict[str, deque] = {}
_last_auto_retrain: float = 0.0


def record_trade_outcome(strategy: str, was_profitable: bool) -> None:
    """
    Record whether a completed trade was profitable.
    Called from autonomous_agent after SELL/COVER execution.
    Maintains a rolling window of the last 20 outcomes per strategy.
    """
    if strategy not in _rolling_outcomes:
        _rolling_outcomes[strategy] = deque(maxlen=20)
    _rolling_outcomes[strategy].append(1 if was_profitable else 0)


def rolling_accuracy(strategy: str) -> Optional[float]:
    """Return rolling accuracy (0-1) for the last ≤20 trades, or None if < min trades."""
    outcomes = _rolling_outcomes.get(strategy)
    if not outcomes or len(outcomes) < ACCURACY_MIN_TRADES:
        return None
    return sum(outcomes) / len(outcomes)


def needs_retrain(strategy: str) -> bool:
    """True if rolling accuracy is below threshold with enough sample trades."""
    acc = rolling_accuracy(strategy)
    return acc is not None and acc < ACCURACY_RETRAIN_THRESHOLD


async def maybe_retrain_async() -> Optional[Dict[str, Any]]:
    """
    Check all strategies' rolling accuracy. If any is below
    ACCURACY_RETRAIN_THRESHOLD and the cooldown has passed, retrain all models.
    Returns the training result dict, or None if retrain was skipped.
    """
    global _last_auto_retrain

    if time.time() - _last_auto_retrain < RETRAIN_COOLDOWN:
        return None  # cooldown active

    struggling = [s for s in _rolling_outcomes if needs_retrain(s)]
    if not struggling:
        return None  # all strategies above threshold

    _last_auto_retrain = time.time()
    result = await train_all_models()
    result["trigger"] = "auto"
    result["struggling_strategies"] = struggling
    return result


def accuracy_status() -> Dict[str, Any]:
    """Return rolling accuracy for all tracked strategies (for /agent/ml/status endpoint)."""
    return {
        s: {
            "trades_recorded": len(outcomes),
            "rolling_accuracy": round(sum(outcomes) / len(outcomes), 3) if outcomes else None,
            "needs_retrain": needs_retrain(s),
        }
        for s, outcomes in _rolling_outcomes.items()
    }


# ── Feature extraction ────────────────────────────────────────────────────────

FEATURE_NAMES = [
    # Core 18
    "rsi", "rvol", "change_pct", "trend_5d_pct",
    "above_sma20", "golden_cross", "above_sma50",
    "macd_bullish", "macd_crossover", "macd_hist_rising",
    "near_bb_lower", "near_bb_upper", "above_bb_upper",
    "zscore", "atr_pct",
    "near_52w_high", "near_52w_low", "pct_from_52w_high",
    # Extended 19 (regime-aware momentum/mean-reversion features)
    "rsi7", "roc_3d", "roc_10d", "roc_20d",
    "bb_position", "bb_width_pct",
    "sma20_slope", "rsi_delta",
    "macd_hist_norm", "macd_line_pct",
    "price_accel", "streak",
    "rvol_trend", "atr_expand",
    "vol_confirm", "rsi_extreme", "sma_gap",
    "win_rate_10d", "ret_mean_5d",
]

# Per-strategy forward horizon and return target
# Targets calibrated to match regime-switching synthetic data signal strength
STRATEGY_CONFIG: Dict[str, Dict] = {
    "momentum":        {"forward_days": 5, "target_pct": 0.5},
    "mean_reversion":  {"forward_days": 3, "target_pct": 0.3},
    "breakout":        {"forward_days": 5, "target_pct": 0.6},
    "trend_follow":    {"forward_days": 5, "target_pct": 0.5},
    "short_momentum":  {"forward_days": 3, "target_pct": 0.3},
    "short_breakdown": {"forward_days": 3, "target_pct": 0.3},
}
_DEFAULT_CFG = {"forward_days": 5, "target_pct": 1.0}


def extract_features(
    bar: Dict[str, Any],
    price: float,
    for_short: bool = False,
) -> Optional[np.ndarray]:
    """
    Extract a fixed-length feature vector from a signal bar dict.
    When for_short=True, features are inverted to represent short-friendly signals:
      - RSI: high RSI (overbought) is a short signal → inverted to (100 - rsi)
      - change_pct / trend_5d_pct: positive momentum is bad for shorts → negated
      - above_sma20/sma50: below MA is short-friendly → flipped
      - BB: near upper band = overbought (short signal) ↔ near lower band
      - 52w: near 52w high = potential short; near 52w low = avoid
    Returns None if critical features are missing.
    """
    def _b(key: str) -> float:
        v = bar.get(key)
        if v is None:
            return 0.0
        if isinstance(v, bool):
            return 1.0 if v else 0.0
        try:
            f = float(v)
            return 0.0 if np.isnan(f) else f
        except (TypeError, ValueError):
            return 0.0

    rsi = _b("rsi") or _b("rsi_daily")
    if rsi == 0:
        return None  # no RSI = insufficient history

    atr = _b("atr") or _b("atr_daily")
    atr_pct = atr / price * 100 if price > 0 and atr > 0 else 2.0

    win10      = _b("win_rate_10d") if bar.get("win_rate_10d") is not None else 0.5
    ret5       = _b("ret_mean_5d")
    rsi7       = _b("rsi7") or rsi
    roc_3d     = _b("roc_3d")
    roc_10d    = _b("roc_10d")
    roc_20d    = _b("roc_20d")
    bb_pos     = _b("bb_position") if bar.get("bb_position") is not None else 0.5
    bb_width   = _b("bb_width_pct") or 5.0
    sma_slope  = _b("sma20_slope")
    rsi_d      = _b("rsi_delta")
    mh_norm    = _b("macd_hist_norm")
    ml_pct     = _b("macd_line_pct")
    p_accel    = _b("price_accel")
    streak     = _b("streak")
    rv_trend   = _b("rvol_trend") or 1.0
    atr_exp    = _b("atr_expand") or 1.0
    vol_conf   = _b("vol_confirm")
    rsi_ext    = _b("rsi_extreme")
    sma_gap    = _b("sma_gap")

    if not for_short:
        features = np.array([
            rsi,
            _b("rvol"),
            _b("change_pct"),
            _b("trend_5d_pct"),
            1.0 if bar.get("above_sma20") else 0.0,
            1.0 if bar.get("golden_cross") else 0.0,
            1.0 if bar.get("above_sma50_daily") or bar.get("above_sma50") else 0.0,
            1.0 if bar.get("macd_bullish_daily") or bar.get("macd_bullish") else 0.0,
            1.0 if bar.get("macd_crossover_daily") or bar.get("macd_crossover") else 0.0,
            1.0 if bar.get("macd_hist_rising_daily") or bar.get("macd_hist_rising") else 0.0,
            1.0 if bar.get("near_bb_lower_daily") or bar.get("near_bb_lower") else 0.0,
            1.0 if bar.get("near_bb_upper_daily") or bar.get("near_bb_upper") else 0.0,
            1.0 if bar.get("above_bb_upper_daily") or bar.get("above_bb_upper") else 0.0,
            _b("zscore_daily") or _b("zscore"),
            atr_pct,
            1.0 if bar.get("near_52w_high") else 0.0,
            1.0 if bar.get("near_52w_low") else 0.0,
            _b("pct_from_52w_high"),
            # Extended
            rsi7, roc_3d, roc_10d, roc_20d,
            bb_pos, bb_width,
            sma_slope, rsi_d,
            mh_norm, ml_pct,
            p_accel, streak,
            rv_trend, atr_exp,
            vol_conf, rsi_ext, sma_gap,
            win10, ret5,
        ], dtype=np.float32)
    else:
        # Short-specific: invert directional features so the model sees
        # "high signal value = good short opportunity"
        above_sma20    = 1.0 if bar.get("above_sma20") else 0.0
        above_sma50    = 1.0 if bar.get("above_sma50_daily") or bar.get("above_sma50") else 0.0
        near_bb_lower  = 1.0 if bar.get("near_bb_lower_daily") or bar.get("near_bb_lower") else 0.0
        near_bb_upper  = 1.0 if bar.get("near_bb_upper_daily") or bar.get("near_bb_upper") else 0.0
        above_bb_upper = 1.0 if bar.get("above_bb_upper_daily") or bar.get("above_bb_upper") else 0.0
        near_52w_high  = 1.0 if bar.get("near_52w_high") else 0.0
        near_52w_low   = 1.0 if bar.get("near_52w_low") else 0.0
        zscore         = _b("zscore_daily") or _b("zscore")

        features = np.array([
            100.0 - rsi,
            _b("rvol"),
            -_b("change_pct"),
            -_b("trend_5d_pct"),
            1.0 - above_sma20,
            1.0 if bar.get("golden_cross") else 0.0,
            1.0 - above_sma50,
            1.0 if bar.get("macd_bullish_daily") or bar.get("macd_bullish") else 0.0,
            1.0 if bar.get("macd_crossover_daily") or bar.get("macd_crossover") else 0.0,
            1.0 if bar.get("macd_hist_rising_daily") or bar.get("macd_hist_rising") else 0.0,
            near_bb_upper,
            near_bb_lower,
            above_bb_upper,
            -zscore,
            atr_pct,
            near_52w_high,
            near_52w_low,
            -_b("pct_from_52w_high"),
            # Extended (inverted for short)
            100.0 - rsi7,     # overbought fast RSI = short signal
            -roc_3d, -roc_10d, -roc_20d,
            1.0 - bb_pos,     # near upper band = short signal
            bb_width,
            -sma_slope,       # falling SMA = short signal
            -rsi_d,
            -mh_norm, -ml_pct,
            -p_accel,
            -streak,          # down streak = short signal
            rv_trend, atr_exp,
            -vol_conf,
            -rsi_ext,
            -sma_gap,
            1.0 - win10,      # low win rate = short-friendly regime
            -ret5,            # negative mean return = short signal
        ], dtype=np.float32)

    return features


# ── Dataset construction ───────────────────────────────────────────────────────

def build_dataset(
    sigs_per_ticker: Dict[str, Dict[str, np.ndarray]],
    closes_per_ticker: Dict[str, np.ndarray],
    forward_days: int = 5,
    target_return_pct: float = 2.0,
    for_short: bool = False,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Build (X, y) pairs from historical signal arrays.
    Long:  y=1 if forward_return > +target_return_pct (price rises).
    Short: y=1 if forward_return < -target_return_pct (price falls).
    Uses short-inverted features when for_short=True.
    """
    from services.backtester import _bar_features

    X_rows: List[np.ndarray] = []
    y_rows: List[int] = []

    for ticker, sigs in sigs_per_ticker.items():
        closes = closes_per_ticker.get(ticker)
        if closes is None or len(closes) < 60:
            continue

        n = len(closes) - forward_days
        for i in range(52, n):
            price = closes[i]
            if price <= 0 or np.isnan(price):
                continue

            bar = _bar_features(sigs, i, price)
            feats = extract_features(bar, price, for_short=for_short)
            if feats is None:
                continue

            future_price = closes[i + forward_days]
            if future_price <= 0 or np.isnan(future_price):
                continue
            fwd_return = (future_price - price) / price * 100

            if not for_short:
                label = 1 if fwd_return > target_return_pct else 0
            else:
                label = 1 if fwd_return < -target_return_pct else 0

            X_rows.append(feats)
            y_rows.append(label)

    if not X_rows:
        return np.empty((0, len(FEATURE_NAMES))), np.empty(0)

    return np.array(X_rows, dtype=np.float32), np.array(y_rows, dtype=np.int32)


# ── Model training ────────────────────────────────────────────────────────────

def train_model(X: np.ndarray, y: np.ndarray, strategy: str) -> Dict[str, Any]:
    """
    Train a soft-voting ensemble: HistGradientBoosting + RandomForest(balanced)
    + ExtraTrees(balanced).  Soft vote averages calibrated probabilities.
    Returns training metrics including balanced_accuracy.
    """
    if len(X) < 100:
        return {"error": f"Not enough training samples: {len(X)}"}

    try:
        from sklearn.ensemble import (
            HistGradientBoostingClassifier,
            RandomForestClassifier,
            ExtraTreesClassifier,
        )
        from sklearn.preprocessing import StandardScaler
        from sklearn.metrics import balanced_accuracy_score, accuracy_score
    except ImportError:
        return {"error": "scikit-learn not installed. Run: pip install scikit-learn"}

    split = int(len(X) * 0.70)
    X_train, X_eval = X[:split], X[split:]
    y_train, y_eval = y[:split], y[split:]

    scaler = StandardScaler()
    X_tr_s = scaler.fit_transform(X_train)
    X_ev_s = scaler.transform(X_eval)

    # Sample weights to counteract class imbalance (for HGBC)
    pos_rate = float(np.mean(y_train))
    neg_w = pos_rate / (1.0 - pos_rate + 1e-10) if pos_rate < 0.5 else 1.0
    sw = np.where(y_train == 1, 1.0, neg_w)

    hgbc = HistGradientBoostingClassifier(
        max_iter=600, learning_rate=0.025, max_depth=6,
        min_samples_leaf=10, random_state=42,
    )
    rf = RandomForestClassifier(
        n_estimators=350, class_weight="balanced",
        max_depth=12, min_samples_leaf=4,
        random_state=42, n_jobs=2,
    )
    etc = ExtraTreesClassifier(
        n_estimators=350, class_weight="balanced",
        max_depth=12, min_samples_leaf=4,
        random_state=42, n_jobs=2,
    )

    hgbc.fit(X_tr_s, y_train, sample_weight=sw)
    rf.fit(X_tr_s, y_train)
    etc.fit(X_tr_s, y_train)

    # Soft-vote probabilities on eval set
    p_h = hgbc.predict_proba(X_ev_s)[:, 1]
    p_r = rf.predict_proba(X_ev_s)[:, 1]
    p_e = etc.predict_proba(X_ev_s)[:, 1]
    avg_p = (p_h + p_r + p_e) / 3.0
    y_pred = (avg_p >= 0.5).astype(int)

    test_acc  = float(accuracy_score(y_eval, y_pred))
    bal_acc   = float(balanced_accuracy_score(y_eval, y_pred))

    # Feature importance: average of RF + ETC (HGBC lacks feature_importances_)
    importance = (rf.feature_importances_ + etc.feature_importances_) / 2.0
    top_features = sorted(
        zip(FEATURE_NAMES, importance.tolist()),
        key=lambda x: x[1], reverse=True,
    )[:5]

    model_path = MODEL_DIR / f"model_{strategy}.pkl"
    with open(model_path, "wb") as f:
        pickle.dump({
            "hgbc": hgbc, "rf": rf, "etc": etc,
            "scaler": scaler,
            "ts": time.time(),
            "version": 2,
        }, f)

    _models[strategy] = {"hgbc": hgbc, "rf": rf, "etc": etc, "scaler": scaler}
    _model_ts[strategy] = time.time()

    return {
        "strategy": strategy,
        "samples": len(X),
        "train_samples": len(X_train),
        "eval_samples": len(X_eval),
        "test_accuracy": round(test_acc, 3),
        "balanced_accuracy": round(bal_acc, 3),
        "positive_rate": round(float(np.mean(y)), 3),
        "top_features": top_features,
        "model_path": str(model_path),
        "ts": datetime.now(timezone.utc).isoformat(),
    }


def _load_model(strategy: str) -> Optional[Dict]:
    """Load model from disk cache. Supports v1 (GBC) and v2 (ensemble)."""
    if strategy in _models:
        return _models[strategy]

    model_path = MODEL_DIR / f"model_{strategy}.pkl"
    if not model_path.exists():
        return None

    try:
        with open(model_path, "rb") as f:
            data = pickle.load(f)
        if data.get("version", 1) == 2:
            entry = {
                "hgbc": data["hgbc"], "rf": data["rf"], "etc": data["etc"],
                "scaler": data["scaler"],
            }
        else:
            entry = {"clf": data["clf"], "scaler": data["scaler"]}
        _models[strategy] = entry
        _model_ts[strategy] = data.get("ts", 0)
        return entry
    except Exception:
        return None


# ── Prediction interface ───────────────────────────────────────────────────────

def ml_confidence_boost(
    bar_features: Dict[str, Any],
    price: float,
    strategy: str,
    base_confidence: int,
) -> Tuple[int, str]:
    """
    Return (adjusted_confidence, reason).
    Adjusts base_confidence by -20..+20 based on calibrated ML probability.
    Uses short-specific inverted features for short_* strategies.
    If no model available, returns (base_confidence, "").
    """
    model = _load_model(strategy)
    if model is None:
        return base_confidence, ""

    is_short = strategy.startswith("short_")
    feats = extract_features(bar_features, price, for_short=is_short)
    if feats is None:
        return base_confidence, ""

    try:
        X = model["scaler"].transform(feats.reshape(1, -1))
        if "hgbc" in model:
            p_h = float(model["hgbc"].predict_proba(X)[0, 1])
            p_r = float(model["rf"].predict_proba(X)[0, 1])
            p_e = float(model["etc"].predict_proba(X)[0, 1])
            positive_prob = (p_h + p_r + p_e) / 3.0
        else:
            proba = model["clf"].predict_proba(X)[0]
            positive_prob = float(proba[1]) if len(proba) > 1 else 0.5

        delta = round((positive_prob - 0.5) * 40)
        delta = max(-20, min(20, delta))
        adjusted = max(0, min(99, base_confidence + delta))

        direction = "↑" if delta > 0 else "↓"
        reason = f"ML({strategy}) p={positive_prob:.2f} {direction}{abs(delta)}"
        return adjusted, reason
    except Exception:
        return base_confidence, ""


def cross_strategy_consensus_boost(
    strategy_scores: Dict[str, int],
    is_short: bool = False,
) -> Tuple[int, str]:
    """
    Return (bonus, reason) when multiple strategies agree on direction.
    Counts strategies that cleared the min_confidence threshold (≥65 long / ≥68 short).
    Bonus: +8 for 2 agreeing strategies, +15 for 3+.
    Only strategies of the same direction (long vs short) are counted.
    """
    min_thresh = 68 if is_short else 65
    direction  = "SHORT" if is_short else "LONG"
    agreeing   = [s for s, conf in strategy_scores.items() if conf >= min_thresh]

    if len(agreeing) >= 3:
        names = ", ".join(agreeing[:3])
        return 15, f"Consensus {direction}: {len(agreeing)} strategies agree ({names})"
    elif len(agreeing) >= 2:
        names = " + ".join(agreeing[:2])
        return 8, f"Consensus {direction}: {names} agree"
    return 0, ""


def models_status() -> List[Dict[str, Any]]:
    """Return status of all trained models."""
    result = []
    for strat_file in MODEL_DIR.glob("model_*.pkl"):
        strategy = strat_file.stem.replace("model_", "")
        try:
            with open(strat_file, "rb") as f:
                data = pickle.load(f)
            ts = data.get("ts", 0)
            age_days = (time.time() - ts) / 86400
            result.append({
                "strategy": strategy,
                "trained_at": datetime.fromtimestamp(ts, tz=timezone.utc).isoformat() if ts else "unknown",
                "age_days": round(age_days, 1),
                "stale": age_days > 7,
                "file": str(strat_file),
            })
        except Exception:
            result.append({"strategy": strategy, "error": "corrupt model file"})
    return result


# ── Full training pipeline ────────────────────────────────────────────────────

async def train_all_models(
    tickers: Optional[List[str]] = None,
    days: int = 504,
) -> Dict[str, Any]:
    """
    Fetch historical data, build dataset, train models for all strategies.
    Called via POST /agent/ml/train.
    """
    from services.autonomous_agent import UNIVERSE, DEFAULT_CONFIG
    from services.backtester import fetch_history, compute_signal_arrays

    tickers = tickers or UNIVERSE
    strategies = (
        list(DEFAULT_CONFIG.get("strategies", [])) +
        list(DEFAULT_CONFIG.get("short_strategies", []))
    )

    # Fetch all historical data
    sem = asyncio.Semaphore(5)

    async def _fetch(t):
        async with sem:
            return t, await fetch_history(t, days)

    pairs = await asyncio.gather(*[_fetch(t) for t in tickers], return_exceptions=True)

    sigs_map: Dict[str, Dict] = {}
    closes_map: Dict[str, np.ndarray] = {}

    for item in pairs:
        if not isinstance(item, tuple):
            continue
        t, hist = item
        if not isinstance(hist, dict) or not hist:
            continue
        sigs_map[t] = compute_signal_arrays(
            hist["closes"], hist["volumes"], hist["highs"], hist["lows"]
        )
        closes_map[t] = hist["closes"]

    if not sigs_map:
        return {"error": "No historical data available"}

    results: List[Dict] = []
    for strategy in strategies:
        is_short = strategy.startswith("short_")
        cfg = STRATEGY_CONFIG.get(strategy, _DEFAULT_CFG)
        X, y = build_dataset(
            sigs_map, closes_map,
            forward_days=cfg["forward_days"],
            target_return_pct=cfg["target_pct"],
            for_short=is_short,
        )
        r = train_model(X, y, strategy)
        results.append(r)

    return {
        "tickers_used": len(sigs_map),
        "strategies_trained": len(results),
        "results": results,
        "ts": datetime.now(timezone.utc).isoformat(),
    }


# ── Walk-Forward Validation ───────────────────────────────────────────────────

_wf_cache: Dict[str, Any] = {}


def wf_results() -> Dict[str, Any]:
    """Return cached walk-forward validation results."""
    return _wf_cache or {"status": "not_run", "message": "POST /agent/ml/walkforward to start"}


async def walk_forward_validate(
    tickers: Optional[List[str]] = None,
    n_splits: int = 5,
    days: int = 504,
) -> Dict[str, Any]:
    """
    Walk-forward (expanding window) cross-validation for the ML signal model.

    For each fold k (k=1..n_splits):
      train on first  (40% + k * step)  of chronological samples
      test  on next   step              of samples
    where step = (total - 40%) / n_splits

    Returns per-fold OOS accuracy, precision, recall, F1
    plus aggregated feature importances.
    """
    global _wf_cache

    _wf_cache = {"status": "running", "ts": datetime.now(timezone.utc).isoformat()}

    try:
        from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
        from sklearn.preprocessing import StandardScaler
        from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, balanced_accuracy_score
    except ImportError:
        _wf_cache = {"status": "error", "error": "scikit-learn not installed"}
        return _wf_cache

    from services.autonomous_agent import UNIVERSE, DEFAULT_CONFIG
    from services.backtester import fetch_history, compute_signal_arrays

    tickers = tickers or UNIVERSE
    sem = asyncio.Semaphore(5)

    async def _fetch(t):
        async with sem:
            return t, await fetch_history(t, days)

    pairs = await asyncio.gather(*[_fetch(t) for t in tickers], return_exceptions=True)

    sigs_map: Dict[str, Dict] = {}
    closes_map: Dict[str, np.ndarray] = {}
    mock_count = 0
    for item in pairs:
        if not isinstance(item, tuple):
            continue
        t, hist = item
        if not isinstance(hist, dict) or not hist:
            continue
        sigs_map[t] = compute_signal_arrays(hist["closes"], hist["volumes"], hist["highs"], hist["lows"])
        closes_map[t] = hist["closes"]
        if hist.get("mock"):
            mock_count += 1

    if not sigs_map:
        _wf_cache = {"status": "error", "error": "No historical data"}
        return _wf_cache

    # Build combined dataset (all tickers, long signals only for simplicity)
    X, y = build_dataset(sigs_map, closes_map, forward_days=5, target_return_pct=2.0)
    if len(X) < 200:
        _wf_cache = {"status": "error", "error": f"Not enough samples: {len(X)}"}
        return _wf_cache

    n = len(X)
    # Expanding window: initial train = 40%, each fold tests next (60%/n_splits)
    min_train = int(n * 0.40)
    test_chunk = max(20, (n - min_train) // n_splits)

    folds: List[Dict] = []
    importances_sum = np.zeros(len(FEATURE_NAMES))
    importances_count = 0

    for k in range(n_splits):
        train_end = min_train + k * test_chunk
        test_start = train_end
        test_end = min(test_start + test_chunk, n)
        if test_start >= n or test_end - test_start < 10:
            break

        X_train, y_train = X[:train_end], y[:train_end]
        X_test, y_test = X[test_start:test_end], y[test_start:test_end]

        scaler = StandardScaler()
        X_tr_s = scaler.fit_transform(X_train)
        X_te_s = scaler.transform(X_test)

        rf_wf = RandomForestClassifier(
            n_estimators=150, class_weight="balanced",
            max_depth=8, min_samples_leaf=5,
            random_state=42 + k, n_jobs=2,
        )
        rf_wf.fit(X_tr_s, y_train)
        y_pred = rf_wf.predict(X_te_s)

        acc  = float(accuracy_score(y_test, y_pred))
        bal  = float(balanced_accuracy_score(y_test, y_pred))
        prec = float(precision_score(y_test, y_pred, zero_division=0))
        rec  = float(recall_score(y_test, y_pred, zero_division=0))
        f1   = float(f1_score(y_test, y_pred, zero_division=0))

        folds.append({
            "fold": k + 1,
            "train_samples": train_end,
            "test_samples": test_end - test_start,
            "accuracy": round(acc, 3),
            "balanced_accuracy": round(bal, 3),
            "precision": round(prec, 3),
            "recall": round(rec, 3),
            "f1": round(f1, 3),
        })

        importances_sum += rf_wf.feature_importances_
        importances_count += 1

    if not folds:
        _wf_cache = {"status": "error", "error": "No folds completed"}
        return _wf_cache

    avg_imp = importances_sum / importances_count if importances_count else importances_sum
    top_features = sorted(
        zip(FEATURE_NAMES, avg_imp.tolist()),
        key=lambda x: x[1], reverse=True
    )[:8]

    overall_acc     = float(np.mean([f["accuracy"] for f in folds]))
    overall_bal_acc = float(np.mean([f["balanced_accuracy"] for f in folds]))
    overall_f1      = float(np.mean([f["f1"] for f in folds]))

    # Baseline: always predict majority class
    pos_rate = float(np.mean(y))
    baseline_acc = max(pos_rate, 1 - pos_rate)

    _wf_cache = {
        "status": "completed",
        "ts": datetime.now(timezone.utc).isoformat(),
        "n_splits": len(folds),
        "total_samples": n,
        "overall_oos_accuracy": round(overall_acc, 3),
        "overall_oos_balanced_accuracy": round(overall_bal_acc, 3),
        "overall_oos_f1": round(overall_f1, 3),
        "baseline_accuracy": round(baseline_acc, 3),
        "lift_over_baseline": round(overall_acc - baseline_acc, 3),
        "positive_rate": round(pos_rate, 3),
        "folds": folds,
        "top_features": [{"feature": f, "importance": round(imp, 4)} for f, imp in top_features],
        "mock_data": mock_count > 0,
        "mock_ticker_count": mock_count,
    }
    return _wf_cache
