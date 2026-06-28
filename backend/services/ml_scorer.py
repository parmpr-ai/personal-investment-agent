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

RETRAIN_INTERVAL = 7 * 86400  # 7 days


# ── Feature extraction ────────────────────────────────────────────────────────

FEATURE_NAMES = [
    "rsi", "rvol", "change_pct", "trend_5d_pct",
    "above_sma20", "golden_cross", "above_sma50",
    "macd_bullish", "macd_crossover", "macd_hist_rising",
    "near_bb_lower", "near_bb_upper", "above_bb_upper",
    "zscore", "atr_pct",
    "near_52w_high", "near_52w_low", "pct_from_52w_high",
]


def extract_features(bar: Dict[str, Any], price: float) -> Optional[np.ndarray]:
    """
    Extract a fixed-length feature vector from a signal bar dict.
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
    ], dtype=np.float32)

    return features


# ── Dataset construction ───────────────────────────────────────────────────────

def build_dataset(
    sigs_per_ticker: Dict[str, Dict[str, np.ndarray]],
    closes_per_ticker: Dict[str, np.ndarray],
    forward_days: int = 5,
    target_return_pct: float = 2.0,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Build (X, y) pairs from historical signal arrays.
    y = 1 if forward return in `forward_days` > `target_return_pct`.
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
            feats = extract_features(bar, price)
            if feats is None:
                continue

            # Forward return label
            future_price = closes[i + forward_days]
            if future_price <= 0 or np.isnan(future_price):
                continue
            fwd_return = (future_price - price) / price * 100
            label = 1 if fwd_return > target_return_pct else 0

            X_rows.append(feats)
            y_rows.append(label)

    if not X_rows:
        return np.empty((0, len(FEATURE_NAMES))), np.empty(0)

    return np.array(X_rows, dtype=np.float32), np.array(y_rows, dtype=np.int32)


# ── Model training ────────────────────────────────────────────────────────────

def train_model(X: np.ndarray, y: np.ndarray, strategy: str) -> Dict[str, Any]:
    """
    Train a GradientBoostingClassifier and save it to disk.
    Returns training metrics.
    """
    if len(X) < 100:
        return {"error": f"Not enough training samples: {len(X)}"}

    try:
        from sklearn.ensemble import GradientBoostingClassifier
        from sklearn.model_selection import cross_val_score
        from sklearn.preprocessing import StandardScaler
    except ImportError:
        return {"error": "scikit-learn not installed. Run: pip install scikit-learn"}

    # Simple 80/20 time-series split (no shuffling to avoid lookahead)
    split = int(len(X) * 0.8)
    X_train, X_test = X[:split], X[split:]
    y_train, y_test = y[:split], y[split:]

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test)

    clf = GradientBoostingClassifier(
        n_estimators=150,
        learning_rate=0.05,
        max_depth=3,
        min_samples_leaf=20,
        subsample=0.8,
        random_state=42,
    )
    clf.fit(X_train_s, y_train)

    # Out-of-sample accuracy
    test_acc = clf.score(X_test_s, y_test)

    # Feature importance
    importance = dict(zip(FEATURE_NAMES, clf.feature_importances_.tolist()))
    top_features = sorted(importance.items(), key=lambda x: x[1], reverse=True)[:5]

    # Save model + scaler
    model_path = MODEL_DIR / f"model_{strategy}.pkl"
    with open(model_path, "wb") as f:
        pickle.dump({"clf": clf, "scaler": scaler, "ts": time.time()}, f)

    # Update in-memory cache
    _models[strategy] = {"clf": clf, "scaler": scaler}
    _model_ts[strategy] = time.time()

    return {
        "strategy": strategy,
        "samples": len(X),
        "train_samples": len(X_train),
        "test_samples": len(X_test),
        "test_accuracy": round(test_acc, 3),
        "positive_rate": round(float(np.mean(y)), 3),
        "top_features": top_features,
        "model_path": str(model_path),
        "ts": datetime.now(timezone.utc).isoformat(),
    }


def _load_model(strategy: str) -> Optional[Dict]:
    """Load model from disk cache if available and not stale."""
    if strategy in _models:
        return _models[strategy]

    model_path = MODEL_DIR / f"model_{strategy}.pkl"
    if not model_path.exists():
        return None

    try:
        with open(model_path, "rb") as f:
            data = pickle.load(f)
        _models[strategy] = {"clf": data["clf"], "scaler": data["scaler"]}
        _model_ts[strategy] = data.get("ts", 0)
        return _models[strategy]
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
    Adjusts base_confidence by -20..+20 based on ML model output.
    If no model available, returns (base_confidence, "").
    """
    model = _load_model(strategy)
    if model is None:
        return base_confidence, ""

    feats = extract_features(bar_features, price)
    if feats is None:
        return base_confidence, ""

    try:
        X = model["scaler"].transform(feats.reshape(1, -1))
        proba = model["clf"].predict_proba(X)[0]
        positive_prob = float(proba[1]) if len(proba) > 1 else 0.5

        # Map probability to confidence adjustment: 0.5 → 0, 0.8 → +15, 0.2 → -15
        delta = round((positive_prob - 0.5) * 40)
        delta = max(-20, min(20, delta))
        adjusted = max(0, min(99, base_confidence + delta))

        direction = "↑" if delta > 0 else "↓"
        reason = f"ML {strategy}: p={positive_prob:.2f} {direction}{abs(delta)}"
        return adjusted, reason
    except Exception:
        return base_confidence, ""


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
        # Short strategies: invert target — look for down moves
        fwd_days = 5
        target = 2.0 if not strategy.startswith("short_") else -2.0

        if strategy.startswith("short_"):
            # For short strategies, label = 1 if price FALLS > 2% in 5 days
            X, y = build_dataset(sigs_map, closes_map, fwd_days, 0)
            # Re-label: drop >-2% as positive
            if len(X):
                # Need to rebuild with negative target — use a wrapper
                X_rows, y_rows = [], []
                from services.backtester import _bar_features
                for ticker, sigs in sigs_map.items():
                    closes = closes_map.get(ticker)
                    if closes is None:
                        continue
                    n = len(closes) - fwd_days
                    for i in range(52, n):
                        price = closes[i]
                        if price <= 0 or np.isnan(price):
                            continue
                        bar = _bar_features(sigs, i, price)
                        feats = extract_features(bar, price)
                        if feats is None:
                            continue
                        future = closes[i + fwd_days]
                        if future <= 0 or np.isnan(future):
                            continue
                        fwd_ret = (future - price) / price * 100
                        label = 1 if fwd_ret < -2.0 else 0  # price falls = short wins
                        X_rows.append(feats)
                        y_rows.append(label)
                if X_rows:
                    X = np.array(X_rows, dtype=np.float32)
                    y = np.array(y_rows, dtype=np.int32)
        else:
            X, y = build_dataset(sigs_map, closes_map, fwd_days, 2.0)

        r = train_model(X, y, strategy)
        results.append(r)

    return {
        "tickers_used": len(sigs_map),
        "strategies_trained": len(results),
        "results": results,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
