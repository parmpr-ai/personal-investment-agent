# AI Trading Engine — Source of Truth

> Last updated: 2026-06-28  
> Branch: `claude/autonomous-trading-agent-ct0nji`  
> Overall Tier 1 Engine: **80%**

---

## Progress Overview

```
1. Backtesting Engine          ████████████████░░░░  78%
2. ML Signal Combination       ██████████████████░░  90%  (+7)
3. Regime Detection            █████████████████░░░  83%  (+5)
4. Correlation-Aware Sizing    ███████████████████░  96%  (+4)
5. Institutional Signals       █████████████░░░░░░░  63%  (+5)
─────────────────────────────────────────────────────
Overall Tier 1 Engine          ████████████████░░░░  80%  (+5)
```

---

## 1. Backtesting Engine — 78%

**File:** `backend/services/backtester.py`

### ✅ Implemented
- Single-ticker simulation with entry/exit logic (take-profit, cut-loss, max-hold)
- Sharpe / Sortino / MaxDD / Calmar / Win Rate metrics (`compute_metrics`)
- SPY buy-and-hold benchmark (`_spy_benchmark`)
- Monte Carlo simulation — 1,000 bootstrap paths (`monte_carlo_simulation`)
- GBM synthetic data fallback for offline environments
- SQLite result persistence + frontend-ready output builder
- [x] **Slippage model** — ✅ DONE: `SLIPPAGE_PCT=0.0005` + `COMMISSION_PER_SHR=0.005` per leg
- [x] **Regime-aware simulation** — ✅ DONE: `_classify_historical_regimes()` rolls SPY data through `_classify()` with 20-day realized-vol VIX proxy; `simulate_strategy(regime_series=...)` gates entries by `active_long/short_strategies`, scales size by `size_multiplier`, adjusts threshold by `confidence_bonus`; trades tagged with `entry_regime`; `compute_metrics()` returns `regime_stats` (win rate/avg P&L per regime) and `regime_distribution`; `run_backtest()` computes regime series once from SPY and date-aligns to each ticker

### ❌ Missing
- [ ] **Walk-forward integration** — WF validation lives only in `ml_scorer.py`, not in backtester
  - Target: backtester runs rolling 126d train / 63d test windows
- [ ] **Portfolio-level backtest** — each ticker simulated independently, no cross-asset correlation
  - Target: simulate portfolio with position sizing + correlation limits

---

## 2. ML Signal Combination — 90%

**File:** `backend/services/ml_scorer.py`

### ✅ Implemented
- GradientBoostingClassifier per strategy (6 models)
- 21 engineered features (RSI, MACD, BB, ATR, volume, z-score, etc.)
- Walk-forward validation with accuracy / precision / recall
- Feature importance tracking
- `ml_confidence_boost()` — adds ±15 pts to rule-engine score
- [x] **Calibrated probabilities** — ✅ DONE: `CalibratedClassifierCV(cv='prefit', method='sigmoid')` wraps GBC; 70/30 split reserves calibration set
- [x] **Cross-strategy signal combination** — ✅ DONE: `cross_strategy_consensus_boost()` adds +8 (2 agree) / +15 (3+); wired into `autonomous_agent._decide_for_ticker`
- [x] **SHORT-specific training** — ✅ DONE: `extract_features(for_short=True)` inverts RSI, trend, SMA position, BB bands; `build_dataset(for_short=True)` labels price-fall as positive
- [x] **Auto-retrain trigger** — ✅ DONE: `record_trade_outcome()` tracks rolling 20-trade accuracy per strategy; `needs_retrain()` fires if accuracy < 45% with ≥10 trades; `maybe_retrain_async()` has 24h cooldown; wired into `autonomous_agent` — records outcome on SELL/COVER, checks retraining every 10 cycles

### ❌ Missing
- (nothing remaining in scope)

---

## 3. Regime Detection — 83%

**File:** `backend/services/regime_detector.py`

### ✅ Implemented
- SPY SMA20 / SMA50 / golden cross
- 5d / 20d trend percentage
- VIX thresholds (>35 → CRISIS, >22 → BEAR pressure)
- 4 regimes: `BULL_TREND` / `BEAR_TREND` / `CHOPPY_RANGE` / `CRISIS`
- Confidence scoring per regime
- `apply_regime_to_config()` — adjusts position_size_mult, stop_loss_mult
- [x] **RSI of SPY** — ✅ DONE: 14-period RSI adds ±10 pts to BULL/BEAR scoring
- [x] **Volume confirmation** — ✅ DONE: `vol_ratio` (5d/20d avg) adds ±5 pts to scoring
- [x] **Hysteresis** — ✅ DONE: `_pending_regime` requires 2 consecutive detections to commit change
- [x] **Market breadth proxy** — ✅ DONE: `_fetch_sector_breadth()` fetches XLK/XLF/XLE 20d returns; `breadth_advance` (sectors positive 0-3) and `breadth_spread` (max-min %) wired into `_classify()`; broad rally (3/3) adds +10 BULL; broad decline (0/3) adds +10 BEAR; high spread (>15%) adds +10 CHOPPY; exposed in `detect_regime()` result as `breadth` field

### ❌ Missing
- [ ] **DST-aware market hours** — ✅ DONE (autonomous_agent.py, S1)
- [ ] **Regime in backtester** — ✅ DONE (backtester.py)

---

## 4. Correlation-Aware Sizing — 96%

**File:** `backend/services/risk_manager.py`

### ✅ Implemented
- `correlation_penalty()` — reduces size if new position correlates with existing
- `portfolio_cvar()` — 95% CVaR across positions
- `_fetch_returns()` — 30d historical returns for correlation matrix
- `drawdown_scalar()` — reduces size proportional to drawdown from peak
- `position_size_shares()` — ATR-based stop distance sizing
- 1-hour returns cache to avoid redundant fetches
- [x] **CVaR enforcement for SHORT positions** — ✅ DONE: `correlation_penalty(is_short=True)` inverts direction; `portfolio_cvar` applies `direction=-1` for short positions in weighted returns
- [x] **Sector concentration limit** — ✅ DONE: `SECTOR_MAP` (65 tickers, 11 GICS sectors); `sector_concentration_check()` blocks/caps trades that would push any sector above 40%; `portfolio_health()` exposes `sector_exposure_pct`; `DEFAULT_LIMITS["max_sector_pct"]=40.0`
- [x] **Marginal VaR per position** — ✅ DONE: `marginal_var_per_position()` computes delta-CVaR (CVaR_full − CVaR_without_position) per position; exposed in portfolio risk budget

### ❌ Missing
- (nothing remaining in scope)

---

## 5. Institutional Signals — 63%

**File:** `backend/services/institutional_signals.py`

### ✅ Implemented
- SEC EDGAR Form 4 Atom feed — insider buy/sell transactions
- [x] **Robust Form 4 parsing** — ✅ DONE: replaced fragile regex with `xml.etree.ElementTree`; CDATA sanitisation fallback; proper Atom namespace handling (`http://www.w3.org/2005/Atom`)
- Yahoo Finance `quoteSummary` — analyst consensus + price targets
- Short interest proxy via Yahoo `shortPercentOfFloat` + `daysToShort`
- Score range: −45 to +50 additive bonus to rule engine
- 4-hour cache per ticker
- [x] **Options flow proxy** — ✅ DONE: `fetch_options_flow()` hits Yahoo Finance `/v7/finance/options/{ticker}` (free, no key); detects OTM vol/OI > 1.5× with vol > 200; computes call/put volume ratio and IV skew (put_iv/call_iv); `_score_options_flow()` adds −15..+15; wired into `get_institutional_signal()` as parallel fetch; score range updated to −45..+50; `options_flow` dict exposed in result

### ❌ Missing
- [ ] **13F quarterly ownership changes** — no institutional accumulation/distribution tracking
  - Target: EDGAR 13F-HR filings → detect funds entering/exiting a position
- [ ] **Block trade / dark pool proxy** — no large-trade detection
  - Target: infer from FINRA ATS data (free, delayed) or volume spike + price flat pattern
- [ ] **Congressional trading** — STOCK Act disclosures not monitored
  - Target: House stock watcher free JSON endpoint

---

## Roadmap: Remaining Tasks

Priority order for remaining ~20% to completion:

| # | Task | Component | Impact | Effort |
|---|---|---|---|---|
| 1 | Walk-forward backtest integration | Backtesting | High | Medium |
| 2 | Portfolio-level backtest | Backtesting | High | High |
| 3 | 13F quarterly ownership changes | Institutional | Medium | Medium |
| 4 | Congressional trading (House stock watcher) | Institutional | Medium | Low |
| 5 | Dark pool / block trade proxy | Institutional | Low | Medium |

---

## Changelog

| Date | Component | Change | New % |
|---|---|---|---|
| 2026-06-28 | — | Initial source of truth created | — |
| 2026-06-28 | Backtesting | Slippage 0.05% + commission $0.005/share per leg | 65% |
| 2026-06-28 | Regime | RSI(14) + volume_ratio + 2-cycle hysteresis | 78% |
| 2026-06-28 | ML | CalibratedClassifierCV + cross-strategy consensus (+8/+15) + short-inverted features | 83% |
| 2026-06-28 | Correlation | CVaR for shorts (inverted returns) + sector concentration limit (40% / GICS, 65 tickers) | 92% |
| 2026-06-28 | Institutional | Options flow proxy: Yahoo options chain, OTM vol/OI >1.5×, C/P ratio, IV skew (−15..+15) | 58% |
| 2026-06-28 | Backtesting | Regime-aware simulation: _classify_historical_regimes, entry gating, size_mult, regime_stats | 78% |
| 2026-06-28 | Autonomous Agent | DST-aware market hours via zoneinfo; paper-trading guard unchanged | — |
| 2026-06-28 | ML | Auto-retrain trigger: record_trade_outcome, rolling_accuracy, maybe_retrain_async (24h cooldown) | 90% |
| 2026-06-28 | Correlation | Marginal VaR per position: delta-CVaR = CVaR_full − CVaR_without_position | 96% |
| 2026-06-28 | Regime | Market breadth proxy: XLK/XLF/XLE 20d returns; breadth_advance/spread wired into _classify() | 83% |
| 2026-06-28 | Institutional | Robust Form4 parsing: xml.etree.ElementTree + CDATA fallback replaces regex | 63% |
