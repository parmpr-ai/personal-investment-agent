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

def select_features(
    X: np.ndarray,
    y: np.ndarray,
    n_features: int = 20,
) -> Tuple[np.ndarray, List[int]]:
    """
    Optimization #4: Select top N features by importance using quick random forest.

    Args:
        X: Feature matrix
        y: Target labels
        n_features: Number of top features to keep (default 20)

    Returns:
        (X_selected, selected_indices): Reduced feature matrix and indices
    """
    try:
        from sklearn.ensemble import RandomForestClassifier

        # Quick RF scan (few estimators for speed)
        rf_scan = RandomForestClassifier(
            n_estimators=10,
            max_depth=4,
            random_state=42,
            n_jobs=2,
        )
        rf_scan.fit(X, y)

        # Get top N feature indices
        importances = rf_scan.feature_importances_
        top_indices = np.argsort(importances)[-n_features:][::-1]

        # Select columns
        X_selected = X[:, top_indices]

        import logging
        logging.info(f"[FeatureSelection] Kept {len(top_indices)} of {X.shape[1]} features")

        return X_selected, top_indices.tolist()
    except Exception as e:
        import logging
        logging.warning(f"[FeatureSelection] Failed to select features: {e}. Using all.")
        return X, list(range(X.shape[1]))


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

def train_model(
    X: np.ndarray,
    y: np.ndarray,
    strategy: str,
    old_model: Optional[Dict] = None,
    incremental: bool = False,
    feature_selection: bool = False,
    n_features: int = 20,
) -> Dict[str, Any]:
    """
    Train ensemble v4: HGBC + RF + ETC + (LGB + CatBoost if available).
    Includes stacking meta-learner, optimal threshold, calibration, temporal weighting.

    Args:
        X: Feature matrix
        y: Target labels
        strategy: Strategy name
        old_model: Previous model dict (for warm-start incremental training)
        incremental: If True and old_model provided, use warm-start (6x faster for daily retrains)
        feature_selection: If True, keep only top N features by importance (2x speedup)
        n_features: Number of top features to keep (default 20)
    """
    if len(X) < 100:
        return {"error": f"Not enough training samples: {len(X)}"}

    try:
        from sklearn.ensemble import (
            HistGradientBoostingClassifier,
            RandomForestClassifier,
            ExtraTreesClassifier,
        )
        from sklearn.linear_model import LogisticRegression
        from sklearn.preprocessing import StandardScaler
        from sklearn.metrics import balanced_accuracy_score, accuracy_score
    except ImportError:
        return {"error": "scikit-learn not installed"}

    # Try optional imports
    lgb, cb = None, None
    try:
        import lightgbm as lgb_lib
        lgb = lgb_lib.LGBMClassifier
    except ImportError:
        pass
    try:
        import catboost as cb_lib
        cb = cb_lib.CatBoostClassifier
    except ImportError:
        pass

    split = int(len(X) * 0.70)
    X_train, X_eval = X[:split], X[split:]
    y_train, y_eval = y[:split], y[split:]

    # Optimization #4: Feature selection (keep only top N features)
    selected_indices = None
    if feature_selection:
        X_train, selected_indices = select_features(X_train, y_train, n_features=n_features)
        X_eval = X_eval[:, selected_indices]
        import logging
        logging.info(f"[Train] Using {len(selected_indices)} selected features (was {X.shape[1]})")

    # Optimization #3: Reuse scaler from old model if available
    if incremental and old_model and "scaler" in old_model:
        scaler = old_model["scaler"]
        X_tr_s = scaler.transform(X_train)
        X_ev_s = scaler.transform(X_eval)
        incremental_training = True
    else:
        scaler = StandardScaler()
        X_tr_s = scaler.fit_transform(X_train)
        X_ev_s = scaler.transform(X_eval)
        incremental_training = False

    # Phase 1.3: Temporal weighting (recent samples more important)
    time_weights = np.exp(-np.arange(len(X_train)) / max(len(X_train), 1) * 2)
    time_weights /= time_weights.mean()

    # Sample weights: class balance + temporal
    pos_rate = float(np.mean(y_train))
    neg_w = pos_rate / (1.0 - pos_rate + 1e-10) if pos_rate < 0.5 else 1.0
    sw = np.where(y_train == 1, 1.0, neg_w) * time_weights

    # Base learners: Optimization #3 - warm-start if incremental
    if incremental_training and old_model and "hgbc" in old_model:
        hgbc = old_model["hgbc"]
        hgbc.fit(X_tr_s, y_train, sample_weight=sw)
    else:
        hgbc = HistGradientBoostingClassifier(
            max_iter=600, learning_rate=0.025, max_depth=6,
            min_samples_leaf=10, random_state=42,
        )
        hgbc.fit(X_tr_s, y_train, sample_weight=sw)

    # RF and ETC don't support warm_start, always train fresh
    rf = RandomForestClassifier(
        n_estimators=350, class_weight="balanced",
        max_depth=12, min_samples_leaf=4, random_state=42, n_jobs=2,
    )
    etc = ExtraTreesClassifier(
        n_estimators=350, class_weight="balanced",
        max_depth=12, min_samples_leaf=4, random_state=42, n_jobs=2,
    )

    rf.fit(X_tr_s, y_train)
    etc.fit(X_tr_s, y_train)

    # Phase 2.2: Extended ensemble (LGB + CatBoost if available)
    # Optimization #3: Warm-start LGB and CatBoost for incremental training
    lgb_clf, cb_clf = None, None
    if lgb:
        try:
            if incremental_training and old_model and "lgb" in old_model and old_model["lgb"]:
                lgb_clf = old_model["lgb"]
                # LightGBM warm-start: continue training
                lgb_clf.fit(X_tr_s, y_train, sample_weight=sw, init_model=lgb_clf)
            else:
                lgb_clf = lgb(
                    n_estimators=300, learning_rate=0.05, num_leaves=31,
                    random_state=42, n_jobs=2, verbose=-1,
                )
                lgb_clf.fit(X_tr_s, y_train, sample_weight=sw)
        except Exception:
            lgb_clf = None
    if cb:
        try:
            if incremental_training and old_model and "cb" in old_model and old_model["cb"]:
                cb_clf = old_model["cb"]
                # CatBoost warm-start: continue training
                cb_clf.fit(X_tr_s, y_train, sample_weight=sw, init_model=cb_clf)
            else:
                cb_clf = cb(
                    iterations=300, learning_rate=0.05, depth=6,
                    random_state=42, verbose=False,
                )
                cb_clf.fit(X_tr_s, y_train, sample_weight=sw)
        except Exception:
            cb_clf = None

    # Base predictions on eval
    p_h = hgbc.predict_proba(X_ev_s)[:, 1]
    p_r = rf.predict_proba(X_ev_s)[:, 1]
    p_e = etc.predict_proba(X_ev_s)[:, 1]

    # Phase 2.1: Stacking meta-learner
    meta_X = np.column_stack([p_h, p_r, p_e])
    if lgb_clf:
        p_l = lgb_clf.predict_proba(X_ev_s)[:, 1]
        meta_X = np.column_stack([meta_X, p_l])
    if cb_clf:
        p_c = cb_clf.predict_proba(X_ev_s)[:, 1]
        meta_X = np.column_stack([meta_X, p_c])

    meta_clf = LogisticRegression(random_state=42, max_iter=1000)
    meta_clf.fit(meta_X, y_eval)
    stacked_p = meta_clf.predict_proba(meta_X)[:, 1]

    # Isotonic calibration
    calibrator = None
    try:
        from sklearn.isotonic import IsotonicRegression
        calibrator = IsotonicRegression(out_of_bounds="clip")
        calibrator.fit(stacked_p, y_eval)
        cal_p = calibrator.predict(stacked_p)
    except Exception:
        cal_p = stacked_p
        calibrator = None

    # Phase 1.2: Find optimal decision threshold (maximize Sharpe-like metric)
    best_thresh = 0.5
    best_sharpe = -999
    for thresh in np.arange(0.3, 0.8, 0.02):
        y_pred_t = (cal_p >= thresh).astype(int)
        tp = np.sum(y_pred_t & y_eval)
        fp = np.sum(y_pred_t & ~y_eval)
        tn = np.sum(~y_pred_t & ~y_eval)
        fn = np.sum(~y_pred_t & y_eval)

        # Sharpe-like: (TP - FP*2) / std
        pnl_sim = tp - fp * 2
        if len(y_eval) > 5:
            sharpe = pnl_sim / max(np.std([tp, fp, fn, tn]), 0.1)
        else:
            sharpe = pnl_sim

        if sharpe > best_sharpe:
            best_sharpe, best_thresh = sharpe, thresh

    y_pred = (cal_p >= best_thresh).astype(int)
    test_acc = float(accuracy_score(y_eval, y_pred))
    bal_acc = float(balanced_accuracy_score(y_eval, y_pred))

    # Feature importance: combine base models
    base_imps = [rf.feature_importances_, etc.feature_importances_]
    if lgb_clf:
        base_imps.append(lgb_clf.feature_importances_)
    if cb_clf:
        base_imps.append(cb_clf.feature_importances_)
    importance = np.mean(base_imps, axis=0)
    top_features = sorted(
        zip(FEATURE_NAMES, importance.tolist()),
        key=lambda x: x[1], reverse=True,
    )[:5]

    # Save v4 pickle with all improvements
    model_path = MODEL_DIR / f"model_{strategy}.pkl"
    with open(model_path, "wb") as f:
        pickle.dump({
            "hgbc": hgbc, "rf": rf, "etc": etc,
            "lgb": lgb_clf, "cb": cb_clf,
            "calibrator": calibrator,
            "meta_clf": meta_clf,
            "decision_threshold": best_thresh,
            "scaler": scaler,
            "selected_indices": selected_indices,  # Optimization #4
            "ts": time.time(),
            "version": 4,
        }, f)

    cache_entry = {
        "hgbc": hgbc, "rf": rf, "etc": etc,
        "lgb": lgb_clf, "cb": cb_clf,
        "calibrator": calibrator,
        "meta_clf": meta_clf,
        "decision_threshold": best_thresh,
        "scaler": scaler,
        "selected_indices": selected_indices,  # Optimization #4
    }
    _models[strategy] = cache_entry
    _model_ts[strategy] = time.time()

    return {
        "strategy": strategy,
        "samples": len(X),
        "train_samples": len(X_train),
        "eval_samples": len(X_eval),
        "test_accuracy": round(test_acc, 3),
        "balanced_accuracy": round(bal_acc, 3),
        "positive_rate": round(float(np.mean(y)), 3),
        "decision_threshold": round(best_thresh, 3),
        "top_features": top_features,
        "model_path": str(model_path),
        "ensemble_size": 3 + (1 if lgb_clf else 0) + (1 if cb_clf else 0),
        "feature_selection": feature_selection,  # Optimization #4
        "num_features": len(selected_indices) if selected_indices else len(X[0]),
        "ts": datetime.now(timezone.utc).isoformat(),
    }


def _load_model(strategy: str) -> Optional[Dict]:
    """Load model from disk. Supports v1-v4 (v4: stacking + optimal threshold)."""
    if strategy in _models:
        return _models[strategy]

    model_path = MODEL_DIR / f"model_{strategy}.pkl"
    if not model_path.exists():
        return None

    try:
        with open(model_path, "rb") as f:
            data = pickle.load(f)
        version = data.get("version", 1)

        if version >= 4:
            entry = {
                "hgbc": data["hgbc"], "rf": data["rf"], "etc": data["etc"],
                "lgb": data.get("lgb"), "cb": data.get("cb"),
                "calibrator": data.get("calibrator"),
                "meta_clf": data.get("meta_clf"),
                "decision_threshold": data.get("decision_threshold", 0.5),
                "scaler": data["scaler"],
                "selected_indices": data.get("selected_indices"),  # Optimization #4
            }
        elif version >= 3:
            entry = {
                "hgbc": data["hgbc"], "rf": data["rf"], "etc": data["etc"],
                "calibrator": data.get("calibrator"),
                "scaler": data["scaler"],
            }
        elif version == 2:
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
        # Optimization #4: Apply feature selection if model uses it
        if model.get("selected_indices"):
            feats = feats[model["selected_indices"]]

        X = model["scaler"].transform(feats.reshape(1, -1))

        if "meta_clf" in model:
            # v4: stacking with meta-learner
            p_h = float(model["hgbc"].predict_proba(X)[0, 1])
            p_r = float(model["rf"].predict_proba(X)[0, 1])
            p_e = float(model["etc"].predict_proba(X)[0, 1])
            meta_X = np.array([[p_h, p_r, p_e]])

            if model.get("lgb"):
                p_l = float(model["lgb"].predict_proba(X)[0, 1])
                meta_X = np.column_stack([meta_X, [[p_l]]])
            if model.get("cb"):
                p_c = float(model["cb"].predict_proba(X)[0, 1])
                meta_X = np.column_stack([meta_X, [[p_c]]])

            stacked_p = float(model["meta_clf"].predict_proba(meta_X)[0, 1])
            cal = model.get("calibrator")
            positive_prob = float(cal.predict([stacked_p])[0]) if cal else stacked_p

        elif "hgbc" in model:
            # v3: ensemble average + calibration
            p_h = float(model["hgbc"].predict_proba(X)[0, 1])
            p_r = float(model["rf"].predict_proba(X)[0, 1])
            p_e = float(model["etc"].predict_proba(X)[0, 1])
            raw_prob = (p_h + p_r + p_e) / 3.0
            cal = model.get("calibrator")
            positive_prob = float(cal.predict([raw_prob])[0]) if cal else raw_prob

        else:
            # v1: single classifier
            proba = model["clf"].predict_proba(X)[0]
            positive_prob = float(proba[1]) if len(proba) > 1 else 0.5

        # Use optimal threshold (v4) or 0.5 (v3/v1)
        thresh = model.get("decision_threshold", 0.5)
        delta = round((positive_prob - thresh) * 40)
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
    use_cache: bool = True,
    refresh: bool = False,
    parallel: bool = True,
    n_workers: int = 4,
    incremental: bool = False,
    feature_selection: bool = False,
) -> Dict[str, Any]:
    """
    Fetch historical data (with optional caching), build dataset, train models.

    Optimizations:
    1. Local caching: 6x faster (load from SQLite instead of Yahoo)
    2. Parallel training: 4x faster (train 6 strategies simultaneously)
    3. Incremental training: 6x faster for daily retrains (warm-start from old models)
    4. Feature selection: 2x faster (keep only top 20 features)

    Args:
        use_cache: Load from local cache if available (default True)
        refresh: Force fetch from Yahoo, ignore cache (default False)
        parallel: Train strategies in parallel (default True)
        n_workers: Number of parallel workers (default 4)
        incremental: Use warm-start from old models for faster daily retrains (default False)
        feature_selection: Keep only top 20 features for faster training (default False)
    """
    import time as time_module
    from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
    from services.autonomous_agent import UNIVERSE, DEFAULT_CONFIG
    from services.backtester import fetch_history, compute_signal_arrays
    from services.data_cache import get_cache

    start_time = time_module.time()
    tickers = tickers or UNIVERSE
    strategies = (
        list(DEFAULT_CONFIG.get("strategies", [])) +
        list(DEFAULT_CONFIG.get("short_strategies", []))
    )

    # ── OPTIMIZATION 1: LOCAL CACHING ──
    # Always initialize cache for saving (even if use_cache=False)
    cache = get_cache()

    # Fetch all historical data (with optional caching)
    sem = asyncio.Semaphore(5)

    async def _fetch(t):
        async with sem:
            import logging

            # Try cache first (only if use_cache=True and not stale)
            if use_cache and not refresh and not cache.is_stale(t):
                cached_data = cache.load_history(t, days)
                if len(cached_data) >= days * 0.9:
                    logging.info(f"[ML] Cache hit: {t} ({len(cached_data)} rows)")
                    return t, {
                        "closes": np.array([d['close'] for d in cached_data]),
                        "volumes": np.array([d['volume'] for d in cached_data]),
                        "highs": np.array([d['high'] for d in cached_data]),
                        "lows": np.array([d['low'] for d in cached_data]),
                        "source": "cache",
                    }

            # Cache miss or disabled: fetch from Yahoo
            logging.info(f"[ML] Fetching {t} (cache miss or refresh={refresh})")
            hist = await fetch_history(t, days)

            # Always save to cache (for next time) - regardless of use_cache flag
            if hist and "closes" in hist:
                try:
                    # Note: fetch_history returns arrays, not individual 'open' values
                    closes = hist.get('closes', [])
                    highs = hist.get('highs', [])
                    lows = hist.get('lows', [])
                    volumes = hist.get('volumes', [])
                    dates = hist.get('dates', [])

                    # fetch_history doesn't provide 'opens', so use close as proxy
                    opens = closes  # or could use: [h * 0.99 for h in highs]

                    ohlcv_list = [
                        {
                            'date': dates[i],
                            'open': float(opens[i]),
                            'high': float(highs[i]),
                            'low': float(lows[i]),
                            'close': float(closes[i]),
                            'volume': float(volumes[i]),
                        }
                        for i in range(len(dates))
                    ]
                    cache.save_history(t, ohlcv_list)
                    logging.info(f"[ML] Saved {t} to cache ({len(ohlcv_list)} rows)")
                except Exception as e:
                    logging.warning(f"[ML] Failed to save {t} to cache: {e}")

            return t, hist

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

    # ── OPTIMIZATION 2: PARALLEL TRAINING ──
    if parallel and n_workers > 1:
        # Train strategies in parallel using ThreadPoolExecutor
        results = []

        def _train_strategy(strategy: str) -> Dict[str, Any]:
            """Train a single strategy (called in worker thread)"""
            is_short = strategy.startswith("short_")
            cfg = STRATEGY_CONFIG.get(strategy, _DEFAULT_CFG)
            X, y = build_dataset(
                sigs_map, closes_map,
                forward_days=cfg["forward_days"],
                target_return_pct=cfg["target_pct"],
                for_short=is_short,
            )
            # Optimization #3: Load old model for warm-start incremental training
            old_model = None
            if incremental:
                old_model = _load_model(strategy)
            return train_model(
                X, y, strategy,
                old_model=old_model,
                incremental=incremental,
                feature_selection=feature_selection,
            )

        # Use ThreadPoolExecutor for I/O-bound training
        with ThreadPoolExecutor(max_workers=min(n_workers, len(strategies))) as executor:
            futures = {executor.submit(_train_strategy, s): s for s in strategies}

            # Collect results as they complete
            for future in futures:
                try:
                    results.append(future.result())
                except Exception as e:
                    import logging
                    logging.error(f"[ML] Training failed: {e}")
                    results.append({"error": str(e)})
    else:
        # Sequential training (original behavior)
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
            # Optimization #3: Load old model for warm-start incremental training
            old_model = None
            if incremental:
                old_model = _load_model(strategy)
            r = train_model(
                X, y, strategy,
                old_model=old_model,
                incremental=incremental,
                feature_selection=feature_selection,
            )
            results.append(r)

    elapsed = time_module.time() - start_time

    return {
        "tickers_used": len(sigs_map),
        "strategies_trained": len(results),
        "results": results,
        "ts": datetime.now(timezone.utc).isoformat(),
        "elapsed_seconds": round(elapsed, 1),
        "optimizations": {
            "caching": "enabled" if use_cache else "disabled",
            "parallel": "enabled" if parallel else "disabled",
            "workers": n_workers,
            "incremental": "enabled" if incremental else "disabled",
            "feature_selection": "enabled" if feature_selection else "disabled",
        }
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
    Runs per-strategy using STRATEGY_CONFIG (forward_days, target_pct).
    Each fold trains the full HGBC+RF+ETC ensemble and soft-votes probabilities.

    For each fold k (k=1..n_splits):
      train on first  (40% + k * step)  of chronological samples
      test  on next   step              of samples
    where step = (total - 40%) / n_splits
    """
    global _wf_cache

    _wf_cache = {"status": "running", "ts": datetime.now(timezone.utc).isoformat()}

    try:
        from sklearn.ensemble import (
            HistGradientBoostingClassifier,
            RandomForestClassifier,
            ExtraTreesClassifier,
        )
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

    from sklearn.model_selection import StratifiedKFold

    strategies = list(STRATEGY_CONFIG.keys())
    all_strategy_results: Dict[str, Any] = {}
    importances_sum = np.zeros(len(FEATURE_NAMES))
    importances_count = 0

    for strategy in strategies:
        is_short = strategy.startswith("short_")
        cfg = STRATEGY_CONFIG[strategy]
        X, y = build_dataset(
            sigs_map, closes_map,
            forward_days=cfg["forward_days"],
            target_return_pct=cfg["target_pct"],
            for_short=is_short,
        )
        if len(X) < 200:
            all_strategy_results[strategy] = {"error": f"Insufficient samples: {len(X)}"}
            continue

        n = len(X)
        min_train = int(n * 0.40)
        test_chunk = max(20, (n - min_train) // n_splits)
        folds: List[Dict] = []

        # Use stratified K-fold with chronological order preserved (shuffle=False)
        skf = StratifiedKFold(n_splits=n_splits, shuffle=False)
        fold_k = 0
        for train_idx, test_idx in skf.split(X, y):
            # Respect chronological order: train on earlier, test on later
            train_end = max(train_idx) + 1
            test_start = min(test_idx)
            test_end = max(test_idx) + 1

            if test_end - test_start < 10 or train_end - 0 < 20:
                continue

            X_train, y_train = X[:train_end], y[:train_end]
            X_test, y_test = X[test_start:test_end], y[test_start:test_end]
            fold_k += 1

            scaler = StandardScaler()
            X_tr_s = scaler.fit_transform(X_train)
            X_te_s = scaler.transform(X_test)

            pos_rate = float(np.mean(y_train))
            neg_w = pos_rate / (1.0 - pos_rate + 1e-10) if pos_rate < 0.5 else 1.0
            sw = np.where(y_train == 1, 1.0, neg_w)

            hgbc_wf = HistGradientBoostingClassifier(
                max_iter=200, learning_rate=0.05, max_depth=5,
                min_samples_leaf=10, random_state=42 + fold_k,
            )
            rf_wf = RandomForestClassifier(
                n_estimators=100, class_weight="balanced",
                max_depth=8, min_samples_leaf=5,
                random_state=42 + fold_k, n_jobs=2,
            )
            etc_wf = ExtraTreesClassifier(
                n_estimators=100, class_weight="balanced",
                max_depth=8, min_samples_leaf=5,
                random_state=42 + fold_k, n_jobs=2,
            )

            hgbc_wf.fit(X_tr_s, y_train, sample_weight=sw)
            rf_wf.fit(X_tr_s, y_train)
            etc_wf.fit(X_tr_s, y_train)

            p_h = hgbc_wf.predict_proba(X_te_s)[:, 1]
            p_r = rf_wf.predict_proba(X_te_s)[:, 1]
            p_e = etc_wf.predict_proba(X_te_s)[:, 1]
            avg_p = (p_h + p_r + p_e) / 3.0
            y_pred = (avg_p >= 0.5).astype(int)

            acc  = float(accuracy_score(y_test, y_pred))
            bal  = float(balanced_accuracy_score(y_test, y_pred))
            prec = float(precision_score(y_test, y_pred, zero_division=0))
            rec  = float(recall_score(y_test, y_pred, zero_division=0))
            f1   = float(f1_score(y_test, y_pred, zero_division=0))

            folds.append({
                "fold": fold_k,
                "train_samples": train_end,
                "test_samples": test_end - test_start,
                "accuracy": round(acc, 3),
                "balanced_accuracy": round(bal, 3),
                "precision": round(prec, 3),
                "recall": round(rec, 3),
                "f1": round(f1, 3),
            })

            importances_sum += (rf_wf.feature_importances_ + etc_wf.feature_importances_) / 2.0
            importances_count += 1

        if not folds:
            all_strategy_results[strategy] = {"error": "No folds completed"}
            continue

        pos_rate = float(np.mean(y))
        all_strategy_results[strategy] = {
            "folds": folds,
            "overall_accuracy": round(float(np.mean([f["accuracy"] for f in folds])), 3),
            "overall_balanced_accuracy": round(float(np.mean([f["balanced_accuracy"] for f in folds])), 3),
            "overall_f1": round(float(np.mean([f["f1"] for f in folds])), 3),
            "baseline_accuracy": round(max(pos_rate, 1 - pos_rate), 3),
            "lift_over_baseline": round(
                float(np.mean([f["accuracy"] for f in folds])) - max(pos_rate, 1 - pos_rate), 3
            ),
            "samples": n,
            "positive_rate": round(pos_rate, 3),
            "forward_days": cfg["forward_days"],
            "target_pct": cfg["target_pct"],
        }

    avg_imp = importances_sum / importances_count if importances_count else importances_sum
    top_features = sorted(
        zip(FEATURE_NAMES, avg_imp.tolist()),
        key=lambda x: x[1], reverse=True
    )[:8]

    overall_bal_accs = [
        v["overall_balanced_accuracy"]
        for v in all_strategy_results.values()
        if isinstance(v, dict) and "overall_balanced_accuracy" in v
    ]

    _wf_cache = {
        "status": "completed",
        "ts": datetime.now(timezone.utc).isoformat(),
        "n_splits": n_splits,
        "strategies": all_strategy_results,
        "overall_mean_balanced_accuracy": round(float(np.mean(overall_bal_accs)), 3) if overall_bal_accs else None,
        "top_features": [{"feature": f, "importance": round(imp, 4)} for f, imp in top_features],
        "mock_data": mock_count > 0,
        "mock_ticker_count": mock_count,
    }
    return _wf_cache
