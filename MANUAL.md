# Personal Investment Agent — User Manual

> **ΣΗΜΑΝΤΙΚΟ:** Μόνο paper trading. Ποτέ live IBKR σύνδεση. Τα API keys μπαίνουν ΜΟΝΟ στο `.env`.

---

## Περιεχόμενα
1. [Quick Start](#1-quick-start)
2. [Ρύθμιση Περιβάλλοντος](#2-ρύθμιση-περιβάλλοντος)
3. [Εκκίνηση Agent](#3-εκκίνηση-agent)
4. [Διαμόρφωση](#4-διαμόρφωση)
5. [Risk Modes & Trade Styles](#5-risk-modes--trade-styles)
6. [ML Εκπαίδευση](#6-ml-εκπαίδευση)
7. [Monitoring & Alerts](#7-monitoring--alerts)
8. [Paper Trading](#8-paper-trading)
9. [Backtesting](#9-backtesting)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Quick Start

```bash
# Backend
cd backend
pip install -r requirements.txt
cp .env.example .env   # προσθέτεις τα keys σου
uvicorn main:app --reload --port 8000

# Frontend (άλλο terminal)
cd frontend
npm install
npm run dev  # http://localhost:3000

# Εκκίνηση agent (curl ή μέσω dashboard)
curl -X POST http://localhost:8000/agent/start
```

Ο agent τρέχει κάθε 15 λεπτά by default. Αλλάζεις με:
```bash
curl -X POST http://localhost:8000/agent/configure \
  -H "Content-Type: application/json" \
  -d '{"cycle_minutes": 5}'
```

---

## 2. Ρύθμιση Περιβάλλοντος

### `.env` (ΜΟΝΟ εδώ — ποτέ στον κώδικα)

```env
# Telegram (για trade alerts)
TELEGRAM_BOT_TOKEN=7xxxxxxxxx:AAxxxxxxxxxxxxxx
TELEGRAM_CHAT_ID=-100xxxxxxxxxx

# Groq (AI news scoring — optional)
GROQ_API_KEY=gsk_...

# Finnhub (news sentiment — optional)
FINNHUB_API_KEY=...
```

**Χωρίς Telegram:** Ο agent τρέχει κανονικά, απλά δεν στέλνει alerts.  
**Χωρίς Groq/Finnhub:** Χρησιμοποιεί keyword-based news scoring (λιγότερο ακριβές).

### Εγκατάσταση dependencies

```bash
pip install fastapi uvicorn httpx scikit-learn numpy
# Για IBKR paper socket (optional):
pip install ib_insync
```

---

## 3. Εκκίνηση Agent

### Μέσω API

```bash
# Εκκίνηση
curl -X POST http://localhost:8000/agent/start

# Διακοπή
curl -X POST http://localhost:8000/agent/stop

# Status (portfolio + regime + risk_mode + trade_style)
curl http://localhost:8000/agent/status | python -m json.tool
```

### Μέσω Dashboard
Άνοιξε `http://localhost:3000` → κουμπί **Start Agent**

### Τι βλέπεις στο status

```json
{
  "running": true,
  "regime": { "regime": "BULL_TREND", "confidence": 78.5, "vix": 16.2 },
  "risk_mode": "NORMAL",
  "trade_style": "SWING_TRADE",
  "trade_style_params": { "stop_loss_pct": 6.0, "take_profit_pct": 12.0, "max_hold_days": 7 },
  "paper_portfolio": { "total_value": 103420.50, "total_return_pct": 3.42 }
}
```

---

## 4. Διαμόρφωση

### POST `/agent/configure`

Αλλάζεις οποιοδήποτε key από το `DEFAULT_CONFIG`:

```bash
# Αλλαγή universe (ποιες μετοχές παρακολουθεί)
curl -X POST http://localhost:8000/agent/configure \
  -d '{"universe": ["NVDA", "AMD", "MSFT", "TSLA", "QQQ"]}'

# Αλλαγή ορίων risk
curl -X POST http://localhost:8000/agent/configure \
  -d '{"risk_per_trade_pct": 1.5, "max_position_pct": 15.0}'

# Απενεργοποίηση shorts
curl -X POST http://localhost:8000/agent/configure \
  -d '{"allow_shorts": false}'

# Χειροκίνητος risk mode (παρακάμπτει το AUTO)
curl -X POST http://localhost:8000/agent/configure \
  -d '{"risk_mode": "CONSERVATIVE", "trade_style": "DAY_TRADE"}'

# Επαναφορά AUTO
curl -X POST http://localhost:8000/agent/configure \
  -d '{"risk_mode": "AUTO", "trade_style": "AUTO"}'
```

### Βασικές παράμετροι

| Παράμετρος | Default | Τι κάνει |
|------------|---------|---------|
| `cycle_minutes` | 15 | Πόσο συχνά τρέχει ο κύκλος |
| `risk_per_trade_pct` | 2.0 | % του portfolio που ρισκάρεις ανά trade |
| `max_position_pct` | 20.0 | Max % ανά ticker |
| `min_confidence` | 65 | Min score για να μπούμε σε trade |
| `vix_pause_threshold` | 27.0 | Άνω από αυτό: δεν ανοίγουμε longs |
| `daily_loss_limit_pct` | 3.0 | Circuit breaker: -3% σήμερα → σταματάμε |
| `risk_mode` | AUTO | AUTO ή AGGRESSIVE/NORMAL/CONSERVATIVE/DEFENSIVE |
| `trade_style` | AUTO | AUTO ή DAY_TRADE/SWING_TRADE/POSITION_TRADE |

---

## 5. Risk Modes & Trade Styles

### Πώς υπολογίζεται αυτόματα (AUTO)

Κάθε cycle, ο agent υπολογίζει:

```
1. VIX level:
   < 15  → AGGRESSIVE
   15–20 → NORMAL
   20–28 → CONSERVATIVE
   > 28  → DEFENSIVE (override — πάντα DEFENSIVE)

2. Portfolio drawdown:
   > 5%  → υποβαθμίζει 1 επίπεδο
   > 10% → υποβαθμίζει 2 επίπεδα

3. Win rate (τελευταίες 10 trades):
   < 35% → υποβαθμίζει 1 επίπεδο
   > 65% → αναβαθμίζει 1 επίπεδο

→ Risk Mode
→ + Market Regime → Trade Style
```

### Τι σημαίνει κάθε Trade Style

| Style | Πότε | Stop | Target | Hold | Size |
|-------|------|------|--------|------|------|
| **DAY_TRADE** | Bear/Crisis ή DEFENSIVE | 1.5% | 2.5% | 1 μέρα | ×0.8 |
| **SWING_TRADE** | Normal conditions | 6% | 12% | 7 μέρες | ×1.0 |
| **POSITION_TRADE** | Bull + Aggressive | 10% | 22% | 30 μέρες | ×1.1 |

### Χειροκίνητη επέμβαση

Αν θέλεις να κλειδώσεις ένα trade style (π.χ. volatile conditions):
```bash
curl -X POST http://localhost:8000/agent/configure \
  -d '{"trade_style": "DAY_TRADE", "risk_mode": "CONSERVATIVE"}'
```

Αν θέλεις να επαναφέρεις το AUTO:
```bash
curl -X POST http://localhost:8000/agent/configure \
  -d '{"trade_style": "AUTO", "risk_mode": "AUTO"}'
```

---

## 6. Autonomous Multi-Tier Trading (v2)

### Starting the Executor

```bash
# Start multi-tier executor (runs every 5 minutes)
curl -X POST http://localhost:8001/executor/start

# Stop executor
curl -X POST http://localhost:8001/executor/stop

# Get executor status
curl http://localhost:8001/executor/monitor
```

### Understanding Confidence Scores

- **Range**: -100 to +100
- **Minimum to enter**: 25 (configurable, +10 higher in VOLATILE regime)
- **Direction**: positive confidence = "up" prediction, negative = "down"
- **Strength**: |confidence| determines position sizing and win rate weighting

Example:
```json
{
  "strategy": "momentum",
  "ticker": "NVDA",
  "confidence": 65,      // Strong bullish signal
  "direction": "up",     // Long position
  "was_entered": true    // Passed all checks
}
```

### Trade Entry & Exit

**Automatic Entry**:
- Triggered when confidence ≥ threshold
- Position size: 100 shares (configurable per tier)
- Simulated entry price: $100 (demo; would use market price in live)
- Side: long if direction=up, short if direction=down

**Automatic Exit**:
- Triggered when `forward_days` has elapsed
- Example: day_momentum has forward_days=1, so exits after 1 day
- Simulated exit price: ±1% from entry (realistic slippage)
- P&L calculated and recorded

### Tier-Specific Position Limits

```bash
# View current open positions by tier
curl http://localhost:8001/executor/monitor | jq '.positions_by_tier'

# Example response:
{
  "day": 3,        // 3/10 day trades (emoji: ⚡)
  "swing": 2,      // 2/5 swing trades (emoji: 📊)
  "long": 1        // 1/3 long trades (emoji: 📈)
}
```

| Tier | Hold Period | Max/Tier | Total Limit | Strategies |
|------|-----------|----------|------------|-----------|
| **Day** (⚡) | 1-2 days | 10 | 25 total | day_momentum, day_mean_reversion, day_breakout |
| **Swing** (📊) | 5-10 days | 5 | 25 total | swing_momentum, swing_mean_reversion, swing_rsi, swing_bbands |
| **Long** (📈) | 20-60 days | 3 | 25 total | long_trend, long_rsi, long_macd, long_volume |

When a tier limit is hit, executor skips new entries for that tier.

---

## 6.5 ML Training with Ensemble v4

### ΣΗΜΑΝΤΙΚΟ: Δεν χρειάζεται να τρέξει ο agent πρώτα

Η εκπαίδευση χρησιμοποιεί **2 χρόνια ιστορικά δεδομένα από Yahoo Finance** (504 trading days).  
Μπορείς να εκπαιδεύσεις αμέσως, χωρίς να περιμένεις να εκτελεστούν real trades.

### Training with Auto-Optimization

```bash
# Train all strategies with full optimization
curl -X POST http://localhost:8001/agent/ml/train?use_cache=true&parallel=true&incremental=true
```

Training pipeline:
1. Fetch/cache 504 days OHLCV from Yahoo Finance
2. Compute 37 technical features
3. Build strategy-specific datasets per STRATEGY_CONFIG
4. Train 5-learner ensemble: HGBC, RF, ETC, LightGBM, CatBoost
5. Stack with meta-learner (learns optimal weights)
6. Calibrate with isotonic calibration (realistic confidence)
7. Optimize decision threshold (maximize Sharpe on eval set)
8. Save model_v4 with threshold + meta_learner + calibrator

### Status & Validation

```bash
curl http://localhost:8001/agent/ml/status
# Δείχνει: strategy, trained_at, age_days, model_version

curl -X POST http://localhost:8001/agent/ml/walkforward
# 5-fold expanding window validation with StratifiedKFold
# Δείχνει: OOS accuracy, F1, feature importances per fold
```

### Auto-Retrain Triggers

3 adaptive triggers:

```bash
# 1. Volume-based: ≥ 20 closed trades since last train
# 2. Time-based: ≥ 120 minutes elapsed since last train
# 3. Performance-based: win_rate < 70% triggers emergency retrain

curl http://localhost:8001/trainer/status
# Shows: should_retrain, reason, last_train_time, closed_trades_since_train, win_rate
```

### Manual Retrain

```bash
curl -X POST http://localhost:8001/trainer/retrain-now
# Forces immediate retrain (respects 24h cooldown)
```

---

## 7. Optimizer Modules (5x System Speed)

### Overview

Five integrated optimization modules work together to speed up training and improve trade execution:

```
Batch Predictor (6.6x)  →  Regime Classifier  →  Ensemble Rebalancer  →  Feature Selector  →  Incremental Learner
   Vectorize all              Detect market      Optimize learner         Prune low-value       Skip unchanged
   strategies/tickers at      conditions &       weights based on         features from 37      learners during
   once instead of            adapt training     recent performance       down to 10-18         retraining
   sequentially               config             dynamically
```

### 7.1 Batch Predictor — 6.6x Faster Predictions

```bash
curl http://localhost:8001/optimizer/batch-stats
# Shows: predictions_per_second, elapsed_seconds, estimated_speedup_ratio
```

**How it works**:
- Instead of sequential predictions: `for s in strategies: for t in tickers: predict(s,t)`
- Uses parallel batch: predict all 88 (8 strategies × 11 tickers) at once
- Batch size: 8 predictions per parallel request
- Result: 657 predictions/sec, 6.6x faster than sequential

**Example output**:
```json
{
  "batch_size": 8,
  "predictions_per_second": 657,
  "elapsed_seconds": 0.134,
  "total_predictions": 88,
  "sequential_equivalent_time": 0.89,
  "estimated_speedup_ratio": 6.6
}
```

### 7.2 Regime Classifier — Adaptive Training

```bash
curl http://localhost:8001/optimizer/regime
# Current market regime and historical transitions

curl http://localhost:8001/optimizer/regime-config
# Training config optimized for current regime
```

**5 Market States**:

| Regime | Conditions | Strategy Adjustment |
|--------|-----------|-------------------|
| **BULL** | High returns, low volatility, high win rate | momentum_weight=0.8, epochs=20, lr=0.05 |
| **BEAR** | Negative returns, high volatility, low win rate | momentum_weight=0.4, mean_reversion=0.7, lr=0.03 |
| **VOLATILE** | High volatility, erratic returns | mean_reversion=0.8, epochs=25, lr=0.02 |
| **MEAN_REVERSION** | Oscillating returns (40%+ sign changes) | mean_reversion=0.95, epochs=20 |
| **TREND** | Strong directional bias | momentum_weight=0.9, epochs=18 |

**Effect on entry**:
- VOLATILE regime: `MIN_CONFIDENCE` increased by +10 (25 → 35) for safety

### 7.3 Ensemble Rebalancer — Dynamic Learner Weights

```bash
curl http://localhost:8001/optimizer/ensemble
# Current weights of 5 base learners

curl -X POST http://localhost:8001/optimizer/ensemble-rebalance
# Force immediate rebalance
```

**5 Base Learners** (automatically weighted):
- `hgbc`: HistGradientBoosting (fast, robust)
- `rf`: RandomForest (diverse, stable)
- `etc`: ExtraTrees (random, handles nonlinearity)
- `lgb`: LightGBM (handles sparse data)
- `cb`: CatBoost (categorical handling)

**Weighting Formula**:
```
score = accuracy × (1 + confidence/100)
normalized_weight = score / sum(all_scores)
smoothed = 0.7 × old_weight + 0.3 × new_weight
```

**Example**:
```json
{
  "current_weights": {
    "hgbc": 0.22,
    "rf": 0.18,
    "etc": 0.20,
    "lgb": 0.19,
    "cb": 0.21
  },
  "dominant_learner": "hgbc",
  "weight_entropy": 1.609,  // Higher = more balanced
  "total_rebalances": 3
}
```

Rebalance triggers every 25 trades automatically.

### 7.4 Feature Selector — Intelligent Dimensionality Reduction

```bash
curl http://localhost:8001/optimizer/features
# Top/bottom 10 features, importance trends, current selection

curl -X POST http://localhost:8001/optimizer/features-optimize
# Optimize threshold and auto-select important features
```

**How it works**:
- Start with 37 features (18 core + 19 extended)
- Track importance across all training runs
- Auto-select top 60% of features (drop bottom 40%)
- Minimum: always keep at least 10 features
- Benefit: 2x faster training with same or better accuracy

**Example output**:
```json
{
  "total_features": 37,
  "selected_features": 16,
  "reduction_pct": 57.0,
  "current_threshold": 0.0142,
  "top_10_features": [
    {"name": "rsi", "avg_importance": 0.0892, "trend": "RISING"},
    {"name": "macd_hist", "avg_importance": 0.0756, "trend": "STABLE"},
    ...
  ],
  "bottom_10_features": [
    {"name": "week52_low", "avg_importance": 0.0001, "trend": "FALLING"},
    ...
  ]
}
```

**Feature Trends**:
- `RISING`: Recent importance > old importance × 1.1
- `STABLE`: Recent ≈ old
- `FALLING`: Recent < old × 0.9
- `NEW`: Less than 2 observations

### 7.5 Incremental Learner — Fast Weight Updates

```bash
curl http://localhost:8001/optimizer/incremental
# Current update efficiency
```

**How it works**:
- Compare old vs new model weights using L2 distance
- If delta < 1%: skip retraining that learner (unchanged)
- Only update learners with significant weight changes
- Result: 60-80% efficiency gain (3 out of 5 learners skipped on typical days)

**Example**:
```json
{
  "avg_learners_updated": 2,
  "total_learners": 5,
  "efficiency_gain_pct": 60.0  // Skipped 60% of retraining
}
```

### 7.6 Unified Optimizer Summary

```bash
curl http://localhost:8001/optimizer/summary
```

**Shows all 5 modules in one dashboard**:
- Batch efficiency: X predictions/sec
- Current regime: BULL/BEAR/VOLATILE/MEAN_REVERSION/TREND
- Ensemble weights: dominant learner + entropy
- Features: selected count, top trends
- Incremental: efficiency gain %

---

## 7.7 10 Critical Safety Features (v6.0)

### Διαθέσιμο σε πραγματικό χρόνο

```bash
curl http://localhost:8000/agent/safety/status | python -m json.tool
```

Αυτό δείχνει τη κατάσταση όλων των 10 ενσωματωμένων ελέγχων ασφαλείας:

### Περιγραφή κάθε ελέγχου

| # | Ονομα | Τι κάνει | Πότε ενεργοποιείται |
|---|-------|---------|-----------------|
| 1 | **Volume Check** | Παράβλεψη entries αν όγκος < 1M μετοχές | Πριν από κάθε νέα θέση |
| 2 | **Model Accuracy** | Αποκλεισμός αν ακρίβεια < 50% | Σε κάθε cycle ελέγχου |
| 3 | **Drawdown Reduction** | Μείωση μεγέθους θέσης στα -2% DD | Κατά τον υπολογισμό μεγέθους |
| 4 | **Regime Skip** | Αποκλεισμός entries σε BEAR_TREND/CRISIS | Πρώτα από τη δημιουργία απόφασης |
| 5 | **Human Override** | Σημειώστε θέσεις > $1k για χειροκίνητη έγκριση | Μετά τον υπολογισμό μεγέθους |
| 6 | **Daily Retrain** | Παρακολουθήστε αν χρειάζεται 24ώρο retraining ML | Στην αρχή κάθε κύκλου |
| 7 | **Correlation** | Αποκλεισμός αν συσχέτιση > 0.80 | Πριν από τον έλεγχο κινδύνου |
| 8 | **Slippage** | Μοντέλο 2.5% ρεαλιστικού κόστους | Στο backtest, όχι ζωντανές συναλλαγές |
| 9 | **Stress Test** | Προ-υπολογισμένα σενάρια ακραίων περιστατικών | Διαθέσιμο για ανάλυση |
| 10 | **Multi-Timeframe** | Απαιτούνται ημερήσιες + εβδομαδιαίες bullish | Διαθέσιμο για ολοκλήρωση σήματος |

### Παράδειγμα ασφάλειας σε δράση

Αν ο agent προσπαθήσει να ανοίξει θέση:
1. ✅ Έλεγχος όγκου: `NVDA volume 45M > 1M` → ΠΕΡΑΣΜΑ
2. ✅ Έλεγχος ακρίβειας: `momentum model 58% > 50%` → ΠΕΡΑΣΜΑ
3. ✅ Έλεγχος regime: `regime BULL_TREND in [BULL, CHOPPY]` → ΠΕΡΑΣΜΑ
4. ✅ Έλεγχος συσχέτισης: `corr with META 0.72 < 0.80` → ΠΕΡΑΣΜΑ
5. ⚠️  Έλεγχος override: `$1,200 > $1,000 threshold` → **ΠΡΟΕΙΔΟΠΟΙΗΣΗ ΚΑΤΑΓΡΑΦΗΣ**
6. ✅ Όλοι οι έλεγχοι ναι → Εκτέλεση

Καταγραφή:
```
[c123_143022] ⚠️  MANUAL APPROVAL NEEDED: Position $1,200 exceeds $1,000 threshold (NVDA 10sh @ $120.00)
[c123_143022] ✅ BUY 10sh NVDA @ $120.00
```

### Όταν ένας έλεγχος αποτυγχάνει

Εάν ο έλεγχος ασφαλείας αποτυγχάνει, ο agent:
1. Δεν ανοίγει τη θέση
2. Καταγράφει το λόγο (π.χ., `❌ Regime: BEAR_TREND not in allowed list`)
3. Στέλνει προαιρετικά προειδοποίηση Telegram

Παράδειγμα:
```
Decision: BUY TSLA confidence=72
Volume check: 12M > 1M ✓
Model accuracy: 48% < 50% ✗
→ BLOCKED: Model accuracy 48% < 50% threshold
→ Logged: blocked_reason = "❌ Model: Model accuracy 48.0% < 50.0% threshold"
```

---

## 7. Monitoring & Alerts

### Telegram Alerts

Στέλνει αυτόματα:
- **Trade alert:** Κάθε BUY/SELL/SHORT/COVER με ticker, qty, price, stop, target, reasoning
- **Stop alert:** Όταν χτυπάει stop loss ή trailing stop
- **Risk alert:** Circuit breaker, VIX spike, regime change, risk mode change
- **Cycle summary:** Μετά από κάθε cycle (executed, blocked, portfolio value)

### Log

```bash
# Τελευταία 100 log entries
curl http://localhost:8000/agent/log | python -m json.tool

# Τελευταίες 50 decisions
curl http://localhost:8000/agent/decisions | python -m json.tool
```

### Dashboard

`http://localhost:3000` → Portfolio tab, Decisions tab, Charts

---

## 8. Paper Trading

### Portfolio Summary

```bash
curl http://localhost:8000/portfolio
```

```json
{
  "cash": 85420.30,
  "total_value": 103420.50,
  "total_return_pct": 3.42,
  "longs": [ { "ticker": "NVDA", "qty": 10, "avg_price": 115.20, "pnl_pct": 4.8 } ],
  "shorts": [],
  "daily_pnl_pct": 0.82
}
```

### Reset Portfolio

```bash
# ΠΡΟΣΟΧΗ: διαγράφει όλες τις θέσεις και επαναφέρει $100,000
curl -X POST http://localhost:8000/agent/reset
```

### Πώς λειτουργεί το paper trading

- Αρχικό κεφάλαιο: **$100,000**
- BUY: αφαιρεί κόστος από cash
- SELL: επιστρέφει proceeds στο cash, υπολογίζει P&L (FIFO)
- SHORT: δεσμεύει collateral (100% notional)
- COVER: επιστρέφει collateral ± P&L
- **Χωρίς slippage** (perfect fills) — ρεαλιστικά αποτελέσματα θα είναι λίγο χειρότερα

---

## 9. Backtesting

```bash
# Backtest όλου του universe (τελευταίοι 6 μήνες)
curl "http://localhost:8000/backtester/run?days=126"

# Μόνο συγκεκριμένοι tickers
curl "http://localhost:8000/backtester/run?tickers=NVDA,AMD&days=252"
```

Επιστρέφει: total_return_pct, sharpe_ratio, max_drawdown, win_rate, per-strategy breakdown

---

## 10. Troubleshooting

### Agent δεν κάνει trades

1. Ελέγξε αν τρέχει: `curl http://localhost:8000/agent/status`
2. Ελέγξε VIX: αν > 27 παγώνει τα longs
3. Ελέγξε circuit breaker: αν daily_pnl < -3% δεν μπαίνει
4. Ελέγξε regime: CRISIS = μόνο exits
5. Ελέγξε portfolio heat: αν > 85% deployed = δεν ανοίγει νέα
6. Αύξησε το `min_confidence` ή κατέβασέ το (default 65)

### ML εκπαίδευση αποτυγχάνει

```
{"error": "Not enough training samples: 45"}
```
Σημαίνει ότι το Yahoo Finance δεν επέστρεψε αρκετά δεδομένα. Δοκίμασε αργότερα.

```
{"error": "scikit-learn not installed"}
```
```bash
pip install scikit-learn
```

### Telegram δεν στέλνει

1. Βεβαιώσου ότι `TELEGRAM_BOT_TOKEN` και `TELEGRAM_CHAT_ID` είναι στο `.env`
2. Ο bot πρέπει να είναι admin στο channel
3. Το CHAT_ID για groups/channels είναι αρνητικός αριθμός (π.χ. `-100xxxxxxxxxx`)

### Yahoo Finance rate limit

Αν βλέπεις πολλά 429 errors, μείωσε το universe ή αύξησε το `cycle_minutes`.

### Σφάλμα "No open long/short position"

Κανονικό — ο agent προσπάθησε να κλείσει θέση που δεν υπάρχει. Αγνόησέ το.

---

## Χρήσιμα URLs

### Executor Service (Port 8001)

| URL | Τι κάνει |
|-----|---------|
| `POST /executor/start` | Start autonomous multi-tier executor |
| `POST /executor/stop` | Stop executor |
| `GET /executor/monitor` | Executor status: positions by tier, stats, summary |
| `GET /executor/dashboard` | Formatted text dashboard |

### Training & ML (Port 8001)

| URL | Τι κάνει |
|-----|---------|
| `POST /agent/ml/train?use_cache=true&parallel=true&incremental=true` | Train all strategies with optimizations |
| `GET /agent/ml/status` | Status μοντέλων (trained_at, age, version) |
| `POST /agent/ml/walkforward` | Walk-forward validation with StratifiedKFold |
| `GET /trainer/status` | Adaptive retrain status (triggers, win_rate) |
| `GET /trainer/history?limit=10` | Retraining history |
| `POST /trainer/retrain-now` | Force immediate retrain |

### Optimizer Modules (Port 8001) — 5x Speed

| URL | Τι κάνει |
|-----|---------|
| `GET /optimizer/batch-stats` | Batch prediction efficiency (6.6x faster) |
| `GET /optimizer/batch-history` | Historical batch performance |
| `GET /optimizer/regime` | Current market regime + transitions |
| `GET /optimizer/regime-config` | Training config for current regime |
| `GET /optimizer/ensemble` | Learner weights, entropy, dominant |
| `POST /optimizer/ensemble-rebalance` | Force immediate weight rebalance |
| `GET /optimizer/features` | Top/bottom features, trends, threshold |
| `POST /optimizer/features-optimize` | Optimize feature selection threshold |
| `GET /optimizer/features-history?limit=5` | Feature selection history |
| `GET /optimizer/incremental` | Incremental learning efficiency % |
| `GET /optimizer/summary` | All 5 modules in one dashboard |

### PIA Core Backend (Port 8000)

| URL | Τι κάνει |
|-----|---------|
| `GET /agent/status` | Πλήρης κατάσταση agent + portfolio |
| `GET /agent/safety/status` | 10 safety features dashboard |
| `POST /agent/start` | Εκκίνηση |
| `POST /agent/stop` | Διακοπή |
| `POST /agent/sell-all?trade_style=DAY_TRADE` | Έκτακτη έξοδος με φίλτρο |
| `POST /agent/configure` | Αλλαγή config |
| `POST /agent/reset` | Reset paper portfolio |
| `GET /agent/decisions?limit=50` | Τελευταίες αποφάσεις |
| `GET /agent/log?limit=100` | Agent log |
| `GET /agent/regime` | Τρέχον market regime |
| `GET /agent/risk/report` | Risk metrics snapshot |
| `GET /agent/trades` | Trade history with attribution |
| `GET /portfolio` | Portfolio summary |
| `GET /backtester/run` | Backtest με slippage |

---

*Ανανέωσε αυτό το αρχείο αν αλλάξεις βασικές παραμέτρους (thresholds, trade styles, strategies).*
