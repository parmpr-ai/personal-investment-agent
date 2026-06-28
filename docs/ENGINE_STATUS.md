# AI Trading Engine — Source of Truth

> Last updated: 2026-06-28  
> Branch: `claude/autonomous-trading-agent-ct0nji`  
> Overall Tier 1 Engine: **62%**

---

## Progress Overview

```
1. Backtesting Engine          ████████████░░░░░░░░  55%
2. ML Signal Combination       ██████████████░░░░░░  70%
3. Regime Detection            █████████████░░░░░░░  68%
4. Correlation-Aware Sizing    ████████████████░░░░  80%
5. Institutional Signals       ███████░░░░░░░░░░░░░  35%
─────────────────────────────────────────────────────
Overall Tier 1 Engine          █████████████░░░░░░░  62%
```

---

## 1. Backtesting Engine — 55%

**File:** `backend/services/backtester.py`

### ✅ Implemented
- Single-ticker simulation with entry/exit logic (take-profit, cut-loss, max-hold)
- Sharpe / Sortino / MaxDD / Calmar / Win Rate metrics (`compute_metrics`)
- SPY buy-and-hold benchmark (`_spy_benchmark`)
- Monte Carlo simulation — 1,000 bootstrap paths (`monte_carlo_simulation`)
- GBM synthetic data fallback for offline environments
- SQLite result persistence + frontend-ready output builder

### ❌ Missing
- [ ] **Slippage model** — zero slippage/commission makes returns unrealistically high
  - Target: 0.05% slippage per trade + $0.005/share commission
- [ ] **Regime-aware simulation** — `macro_neutral` is hardcoded; backtest ignores detected regime
  - Target: replay historical regimes during simulation
- [ ] **Walk-forward integration** — WF validation lives only in `ml_scorer.py`, not in backtester
  - Target: backtester runs rolling 126d train / 63d test windows
- [ ] **Portfolio-level backtest** — each ticker simulated independently, no cross-asset correlation
  - Target: simulate portfolio with position sizing + correlation limits

---

## 2. ML Signal Combination — 70%

**File:** `backend/services/ml_scorer.py`

### ✅ Implemented
- GradientBoostingClassifier per strategy (6 models)
- 21 engineered features (RSI, MACD, BB, ATR, volume, z-score, etc.)
- Walk-forward validation with accuracy / precision / recall
- Feature importance tracking
- `ml_confidence_boost()` — adds ±15 pts to rule-engine score

### ❌ Missing
- [ ] **Calibrated probabilities** — `predict_proba` not used; only class label returned
  - Target: `CalibratedClassifierCV` wrapper, return probability as boost magnitude
- [ ] **Cross-strategy signal combination** — when momentum + breakout both fire → no synergy boost
  - Target: +10 confidence when ≥2 strategies agree on same ticker/direction
- [ ] **SHORT-specific training** — comment in code: "long signals only for simplicity"
  - Target: separate training dataset for short strategies with inverted features
- [ ] **Auto-retrain trigger** — accuracy drop doesn't trigger retraining
  - Target: retrain if rolling 20-trade accuracy < 45%

---

## 3. Regime Detection — 68%

**File:** `backend/services/regime_detector.py`

### ✅ Implemented
- SPY SMA20 / SMA50 / golden cross
- 5d / 20d trend percentage
- VIX thresholds (>35 → CRISIS, >22 → BEAR pressure)
- 4 regimes: `BULL_TREND` / `BEAR_TREND` / `CHOPPY_RANGE` / `CRISIS`
- Confidence scoring per regime
- `apply_regime_to_config()` — adjusts position_size_mult, stop_loss_mult

### ❌ Missing
- [ ] **RSI of SPY** — momentum confirmation missing from classification
  - Target: RSI<40 adds BEAR evidence; RSI>60 adds BULL evidence
- [ ] **Volume confirmation** — bull move without volume is weak
  - Target: compare 5d avg volume vs 20d avg volume
- [ ] **Market breadth proxy** — A/D line via sector ETF divergence
  - Target: use XLK/XLF/XLE spread as breadth proxy (free, no extra API)
- [ ] **Hysteresis** — regime can flip-flop cycle-to-cycle on borderline conditions
  - Target: require 2 consecutive cycles to confirm a regime change
- [ ] **DST-aware market hours** — hardcoded UTC-5 offset misses EDT (UTC-4)
  - Target: use `zoneinfo` / `pytz` for proper US/Eastern conversion

---

## 4. Correlation-Aware Sizing — 80%

**File:** `backend/services/risk_manager.py`

### ✅ Implemented
- `correlation_penalty()` — reduces size if new position correlates with existing
- `portfolio_cvar()` — 95% CVaR across positions
- `_fetch_returns()` — 30d historical returns for correlation matrix
- `drawdown_scalar()` — reduces size proportional to drawdown from peak
- `position_size_shares()` — ATR-based stop distance sizing
- 1-hour returns cache to avoid redundant fetches

### ❌ Missing
- [ ] **CVaR enforcement for SHORT positions** — `correlation_penalty` uses longs only
  - Target: include short positions in correlation matrix with inverted returns
- [ ] **VaR contribution per position** — no per-position risk budget tracking
  - Target: expose marginal VaR so agent avoids breaching portfolio risk budget
- [ ] **Sector concentration limit** — multiple TECH positions not capped
  - Target: max 40% exposure per GICS sector

---

## 5. Institutional Signals — 35%

**File:** `backend/services/institutional_signals.py`

### ✅ Implemented
- SEC EDGAR Form 4 RSS — insider buy/sell transactions (regex parser)
- Yahoo Finance `quoteSummary` — analyst consensus + price targets
- Short interest proxy via Yahoo `shortPercentOfFloat` + `daysToShort`
- Score range: −30 to +35 additive bonus to rule engine
- 4-hour cache per ticker

### ❌ Missing
- [ ] **Robust Form 4 parsing** — current regex on EDGAR HTML is fragile; breaks on layout changes
  - Target: use `https://efts.sec.gov/LATEST/search-index` JSON API instead
- [ ] **13F quarterly ownership changes** — no institutional accumulation/distribution tracking
  - Target: EDGAR 13F-HR filings → detect funds entering/exiting a position
- [ ] **Options flow proxy** — no unusual options activity signal
  - Target: Yahoo Finance options chain → detect abnormal call/put volume vs OI
- [ ] **Block trade / dark pool proxy** — no large-trade detection
  - Target: infer from FINRA ATS data (free, delayed) or volume spike + price flat pattern
- [ ] **Congressional trading** — STOCK Act disclosures not monitored
  - Target: `https://efts.sec.gov` House/Senate disclosure RSS

---

## Roadmap: Next Implementations

Priority order based on impact vs effort:

| # | Task | Component | Impact | Effort |
|---|---|---|---|---|
| 1 | Slippage + commission model | Backtesting | High | Low |
| 2 | RSI + volume + hysteresis | Regime | High | Low |
| 3 | Calibrated probabilities | ML | High | Medium |
| 4 | Cross-strategy signal combination | ML | Medium | Low |
| 5 | SHORT training dataset | ML | High | Medium |
| 6 | Regime-aware backtest simulation | Backtesting | High | Medium |
| 7 | Options flow proxy | Institutional | Medium | Medium |
| 8 | 13F ownership tracking | Institutional | Medium | Medium |
| 9 | CVaR for shorts | Correlation | Low | Low |
| 10 | Sector concentration limit | Correlation | Medium | Low |

---

## Changelog

| Date | Component | Change | New % |
|---|---|---|---|
| 2026-06-28 | — | Initial source of truth created | — |
