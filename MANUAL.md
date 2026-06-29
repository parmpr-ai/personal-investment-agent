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

## 6. ML Εκπαίδευση

### ΣΗΜΑΝΤΙΚΟ: Δεν χρειάζεται να τρέξει ο agent πρώτα

Η εκπαίδευση χρησιμοποιεί **2 χρόνια ιστορικά δεδομένα από Yahoo Finance** (504 trading days).  
Μπορείς να εκπαιδεύσεις αμέσως, χωρίς να περιμένεις να εκτελεστούν real trades.

### Εκπαίδευση

```bash
# Εκπαίδευση όλων των μοντέλων (momentum, mean_reversion, breakout, trend_follow, short_*)
curl -X POST http://localhost:8000/agent/ml/train
```

Αυτό:
1. Κατεβάζει 2 χρόνια ημερήσια OHLCV από Yahoo Finance για κάθε ticker
2. Υπολογίζει 18 technical features ανά μέρα
3. Labels: y=1 αν η τιμή +2% μέσα σε 5 ημέρες (long) ή -2% (short)
4. Εκπαιδεύει `GradientBoostingClassifier` με 70/30 time-series split
5. Εφαρμόζει Platt scaling (calibrated probabilities)
6. Αποθηκεύει στο `ml_models/model_{strategy}.pkl`

### Status μοντέλων

```bash
curl http://localhost:8000/agent/ml/status
# Δείχνει: strategy, trained_at, age_days, stale (>7 days)
```

### Walk-Forward Validation

```bash
curl -X POST http://localhost:8000/agent/ml/walkforward
# 5-fold expanding window validation
# Δείχνει: OOS accuracy, F1, feature importances per fold
```

### Auto-Retrain

Κάθε 10 cycles ο agent ελέγχει αν η rolling accuracy κάποιας στρατηγικής < 45%.  
Αν ναι, κάνει retrain αυτόματα (1 φορά ανά 24h max).

### Τα μοντέλα βοηθούν πόσο;

Το ML προσαρμόζει το confidence score κατά ±20 points (από -20 ως +20).  
Δεν αντικαθιστά το rule-based scoring — το συμπληρώνει.  
`p=0.8 → +12 pts`, `p=0.2 → -12 pts`, `p=0.5 → 0 pts`

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

| URL | Τι κάνει |
|-----|---------|
| `GET /agent/status` | Πλήρης κατάσταση agent + portfolio |
| `POST /agent/start` | Εκκίνηση |
| `POST /agent/stop` | Διακοπή |
| `POST /agent/configure` | Αλλαγή config |
| `POST /agent/reset` | Reset paper portfolio |
| `GET /agent/decisions?limit=50` | Τελευταίες αποφάσεις |
| `GET /agent/log?limit=100` | Agent log |
| `POST /agent/ml/train` | Εκπαίδευση ML |
| `GET /agent/ml/status` | Status μοντέλων |
| `POST /agent/ml/walkforward` | Walk-forward validation |
| `GET /agent/regime` | Τρέχον market regime |
| `GET /portfolio` | Portfolio summary |
| `GET /backtester/run` | Backtest |

---

*Ανανέωσε αυτό το αρχείο αν αλλάξεις βασικές παραμέτρους (thresholds, trade styles, strategies).*
