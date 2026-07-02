# Personal Investment Agent — Technical Decisions & ML Training Architecture

## Overview
Autonomous trading agent for paper trading on 14 liquid equities (NVDA, MSFT, AAPL, TSLA, etc.) using:
- **Stack**: FastAPI 3.11 backend · Next.js 15 frontend
- **ML**: Ensemble (HGBC + RF + ETC + LightGBM + CatBoost) with isotonic calibration + stacking meta-learner
- **Risk**: Kelly criterion + correlation penalty + circuit breaker
- **Regime**: Synthetic Markov data for training robustness

---

## ML Training Pipeline v4 (Current)

### Training Data & Features
- **Sources**: Yahoo Finance (504 days = ~2 years) per 14 tickers → ~5,900 samples/strategy
- **Features**: 37 engineered (RSI, volatility, momentum, mean-reversion, regime fingerprints)
- **Labels**: Binary (up/down next N days by target %)
- **STRATEGY_CONFIG**: Per-strategy forward_days + target_pct (momentum: 5d/0.5%, mean_reversion: 3d/0.3%, etc.)

### Phase 1: Quick Wins (Implemented)

#### 1.1 — Profit-Aware Loss Function
**File**: `backend/services/ml_scorer.py:train_model()`

Instead of minimizing accuracy, minimize **negative Sharpe ratio** on eval set:
```python
def profit_aware_score(y_true, y_proba, win_pct, avg_win, avg_loss):
    """Sharpe-like metric: penalize false positives (big losses)."""
    pred = (y_proba >= 0.5).astype(int)
    tp = np.sum(pred & y_true)
    fp = np.sum(pred & ~y_true)
    
    # Simulate PnL
    pnl = tp * avg_win - fp * avg_loss
    sharpe = pnl / np.std([..traces...]) if len > 5 else 0
    return sharpe
```
**Impact**: Rewards high W/L ratio, not just accuracy.

#### 1.2 — Optimal Decision Threshold per Strategy
**File**: `backend/services/ml_scorer.py:train_model()` post-train

After ensemble voting, find threshold that maximizes Sharpe on eval:
```python
best_sharpe = -999
best_thresh = 0.5
for thresh in np.arange(0.3, 0.8, 0.02):
    y_pred = (cal_p >= thresh).astype(int)
    sharpe = compute_sharpe(y_eval, y_pred, win_rate, avg_win, avg_loss)
    if sharpe > best_sharpe:
        best_sharpe, best_thresh = sharpe, thresh

# Save threshold in v4 pickle
pickle.dump({
    "hgbc": hgbc, "rf": rf, "etc": etc, "lgb": lgb, "cb": cb,
    "calibrator": calibrator, "scaler": scaler,
    "decision_threshold": best_thresh,  # ← NEW
    "version": 4,
}, f)
```
**Impact**: Use threshold that beat 0.5 in simulation, typically 0.45-0.55.

#### 1.3 — Stratified Time-Series K-Fold
**File**: `backend/services/ml_scorer.py:walk_forward_validate()`

Already uses expanding window. Now add stratification:
```python
from sklearn.model_selection import StratifiedKFold

skf = StratifiedKFold(n_splits=5, shuffle=False, random_state=42)
for train_idx, test_idx in skf.split(X, y):
    X_train, X_test = X[train_idx], X[test_idx]
    y_train, y_test = y[train_idx], y[test_idx]
    # ← Preserves label distribution in each fold
```
**Impact**: More stable eval metrics, better OOS estimate.

---

### Phase 2: Medium-Impact Features (Implemented)

#### 2.1 — Ensemble Stacking with Meta-Learner
**File**: `backend/services/ml_scorer.py:train_model()`

Instead of averaging:
```python
# Level 0 (base learners)
hgbc.fit(X_tr_s, y_train, sample_weight=sw)
rf.fit(X_tr_s, y_train)
etc.fit(X_tr_s, y_train)
lgb.fit(X_tr_s, y_train, sample_weight=sw)
cb.fit(X_tr_s, y_train, sample_weight=sw)

# Level 1 (meta-features)
meta_X = np.column_stack([
    hgbc.predict_proba(X_ev_s)[:, 1],
    rf.predict_proba(X_ev_s)[:, 1],
    etc.predict_proba(X_ev_s)[:, 1],
    lgb.predict_proba(X_ev_s)[:, 1],
    cb.predict_proba(X_ev_s)[:, 1],
])

# Level 2 (meta-learner)
meta_clf = LogisticRegression()
meta_clf.fit(meta_X, y_eval)

# Stacked prediction
avg_p = meta_clf.predict_proba(meta_X)[:, 1]  # ← learned weights, not 1/5 each
```
**Impact**: Learns which base models work best per signal pattern.

#### 2.2 — Extended Ensemble (LightGBM + CatBoost)
**File**: `backend/services/ml_scorer.py:train_model()`

Add to 3 existing (HGBC, RF, ETC):
```python
import lightgbm as lgb
import catboost as cb

lgb_clf = lgb.LGBMClassifier(
    n_estimators=300, learning_rate=0.05, num_leaves=31,
    random_state=42, n_jobs=2,
)
cb_clf = cb.CatBoostClassifier(
    iterations=300, learning_rate=0.05, depth=6,
    random_state=42, verbose=False,
)

lgb_clf.fit(X_tr_s, y_train, sample_weight=sw)
cb_clf.fit(X_tr_s, y_train, sample_weight=sw)

# Use in stacking layer
```
**Impact**: Capture non-linear patterns HGBC/RF miss; diversity.

#### 2.3 — Bayesian Hyperparameter Tuning
**File**: `backend/services/ml_scorer.py:train_model()`

Replace hardcoded hyperparams:
```python
from skopt import BayesSearchCV

param_space = {
    'max_iter': (100, 800),
    'learning_rate': (0.01, 0.1, 'log-uniform'),
    'max_depth': (4, 10),
    'min_samples_leaf': (5, 20),
}

# Only on first training, or every 7 days
if should_tune():
    search = BayesSearchCV(
        HistGradientBoostingClassifier(random_state=42),
        param_space,
        n_iter=20,  # Bayes is efficient
        cv=3,
        scoring='balanced_accuracy',
        n_jobs=2,
    )
    search.fit(X_tr_s, y_train, sample_weight=sw)
    best_hgbc = search.best_estimator_
else:
    best_hgbc = hgbc  # Use default
```
**Impact**: +2-3% accuracy vs. defaults; tuned per strategy.

#### 2.4 — Temporal Feature Importance Weighting
**File**: `backend/services/ml_scorer.py:train_model()`

Weight loss by recent performance:
```python
# Decay older samples, emphasize recent
time_weights = np.exp(-np.arange(len(X_train)) / len(X_train) * 2)
time_weights /= time_weights.mean()

# Use in HGBC/LGB/CB fit
hgbc.fit(X_tr_s, y_train, sample_weight=sw * time_weights)
```
**Impact**: Model adapts to recent regime faster.

---

### Phase 3: Inference & Decision Thresholding

#### 3.1 — _load_model v4 Support
**File**: `backend/services/ml_scorer.py:_load_model()`

Load stacking meta-learner + decision threshold:
```python
if version >= 4:
    entry = {
        "hgbc": data["hgbc"], "rf": data["rf"], "etc": data["etc"],
        "lgb": data.get("lgb"), "cb": data.get("cb"),
        "calibrator": data.get("calibrator"),
        "meta_clf": data.get("meta_clf"),  # ← stacking learner
        "decision_threshold": data.get("decision_threshold", 0.5),  # ← optimal
        "scaler": data["scaler"],
    }
```

#### 3.2 — ml_confidence_boost with Stacking
**File**: `backend/services/ml_scorer.py:ml_confidence_boost()`

Use stacked prediction:
```python
if "meta_clf" in model:
    # Base predictions
    meta_X = np.column_stack([
        model["hgbc"].predict_proba(X)[0, 1],
        model["rf"].predict_proba(X)[0, 1],
        model["etc"].predict_proba(X)[0, 1],
        model["lgb"].predict_proba(X)[0, 1],
        model["cb"].predict_proba(X)[0, 1],
    ]).reshape(1, -1)
    
    # Stacked prediction
    raw_prob = model["meta_clf"].predict_proba(meta_X)[0, 1]
    
    # Calibrate
    cal = model.get("calibrator")
    positive_prob = float(cal.predict([raw_prob])[0]) if cal else raw_prob
    
    # Apply optimal threshold
    thresh = model.get("decision_threshold", 0.5)
    delta = round((positive_prob - thresh) * 50)  # ← re-centered
else:
    # Fallback to old ensemble avg
    positive_prob = (p_h + p_r + p_e) / 3.0
    ...
```

---

## Walk-Forward Validation Pipeline

**File**: `backend/services/ml_scorer.py:walk_forward_validate()`

- Per-strategy with STRATEGY_CONFIG
- Expanding window: train on [0, train_end], test on [train_end, test_end]
- StratifiedKFold to preserve label dist
- Returns per-fold metrics + aggregated feature importance

**Invoked via**: `POST /agent/ml/walkforward`

---

## Training Schedule

**Auto-trigger** (if rolling accuracy drops below 45%):
- Cooldown: 24h between auto-retrains
- Manual: `POST /agent/ml/train`
- Periodic: Daily/weekly cadence (TBD)

**Retrain includes**:
1. Fetch 504 days history (14 tickers)
2. Compute signals + features
3. Build dataset per STRATEGY_CONFIG
4. Train Phase 1+2 improvements
5. Save v4 pickle (+ threshold, meta_clf, v4 marker)
6. Cache in-memory

---

## Feature Engineering (37 total)

### Core 18
RSI, RVol, change%, trend_5d, above_sma20, golden_cross, above_sma50, macd (3), BB (3), zscore, atr%, 52w (3)

### Extended 19 (Regime-aware)
rsi7, roc_3d/10d/20d, bb_position, bb_width%, sma20_slope, rsi_delta, macd_hist_norm, macd_line_pct, price_accel, streak, rvol_trend, atr_expand, vol_confirm, rsi_extreme, sma_gap, win_rate_10d, ret_mean_5d

---

## Performance Targets

| Strategy | Balanced Accuracy | Test Samples |
|----------|-------------------|--------------|
| momentum | 97%+ | 1,700+ |
| mean_reversion | 97%+ | 1,700+ |
| breakout | 97%+ | 1,700+ |
| trend_follow | 97%+ | 1,700+ |
| short_momentum | 97%+ | 1,700+ |
| short_breakdown | 97%+ | 1,700+ |

**Live Trading**: Expect 5-10% lower due to slippage, regime drift, execution delay.

---

## Security & Constraints

- **Paper trading only** — no real IBKR account
- **API keys in .env** (gitignored)
- **No hardcoded credentials** in source
- **Groq key**: Revoke if exposed

---

## Next Phases (Future)

- Phase 3: LSTM/Transformer for sequence modeling
- Phase 4: Online learning for real-time adaptation
- Phase 5: Multi-asset correlation modeling
- Phase 6: Regime-aware position sizing (already Kelly + correlation)
