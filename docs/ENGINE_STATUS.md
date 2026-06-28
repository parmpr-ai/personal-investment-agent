# AI Trading Engine — Source of Truth

> Last updated: 2026-06-28  
> Branch: `claude/autonomous-trading-agent-ct0nji`  
> Overall Tier 1 Engine: **75%**

---

## Progress Overview

```
1. Backtesting Engine          ████████████████░░░░  78%  (+13)
2. ML Signal Combination       ████████████████░░░░  83%  (+13)
3. Regime Detection            ████████████████░░░░  78%
4. Correlation-Aware Sizing    ██████████████████░░  92%  (+12)
5. Institutional Signals       ████████████░░░░░░░░  58%  (+23)
─────────────────────────────────────────────────────
Overall Tier 1 Engine          ███████████████░░░░░  75%  (+3)
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

## 2. ML Signal Combination — 70%

**File:** `backend/services/ml_scorer.py`

### ✅ Implemented
- GradientBoostingClassifier per strategy (6 models)
- 21 engineered features (RSI, MACD, BB, ATR, volume, z-score, etc.)
- Walk-forward validation with accuracy / precision / recall
- Feature importance tracking
- `ml_confidence_boost()` — adds ±15 pts to rule-engine score

### ❌ Missing
- [x] **Calibrated probabilities** — ✅ DONE: `CalibratedClassifierCV(cv='prefit', method='sigmoid')` wraps GBC; 70/30 split reserves calibration set
- [x] **Cross-strategy signal combination** — ✅ DONE: `cross_strategy_consensus_boost()` adds +8 (2 agree) / +15 (3+); wired into `autonomous_agent._decide_for_ticker`
- [x] **SHORT-specific training** — ✅ DONE: `extract_features(for_short=True)` inverts RSI, trend, SMA position, BB bands; `build_dataset(for_short=True)` labels price-fall as positive
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
- [x] **RSI of SPY** — ✅ DONE: 14-period RSI adds ±10 pts to BULL/BEAR scoring
- [x] **Volume confirmation** — ✅ DONE: `vol_ratio` (5d/20d avg) adds ±5 pts to scoring
- [x] **Hysteresis** — ✅ DONE: `_pending_regime` requires 2 consecutive detections to commit change
- [ ] **Market breadth proxy** — A/D line via sector ETF divergence
  - Target: use XLK/XLF/XLE spread as breadth proxy (free, no extra API)
- [ ] **DST-aware market hours** — hardcoded UTC-5 offset misses EDT (UTC-4)
  - Target: use `zoneinfo` / `pytz` for proper US/Eastern conversion

---

## 4. Correlation-Aware Sizing — 92%

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

### ❌ Missing
- [ ] **VaR contribution per position** — no per-position risk budget tracking
  - Target: expose marginal VaR so agent avoids breaching portfolio risk budget

---

## 5. Institutional Signals — 58%

**File:** `backend/services/institutional_signals.py`

### ✅ Implemented
- SEC EDGAR Form 4 RSS — insider buy/sell transactions (regex parser)
- Yahoo Finance `quoteSummary` — analyst consensus + price targets
- Short interest proxy via Yahoo `shortPercentOfFloat` + `daysToShort`
- Score range: −30 to +35 additive bonus to rule engine
- 4-hour cache per ticker
- [x] **Options flow proxy** — ✅ DONE: `fetch_options_flow()` hits Yahoo Finance `/v7/finance/options/{ticker}` (free, no key); detects OTM vol/OI > 1.5× with vol > 200; computes call/put volume ratio and IV skew (put_iv/call_iv); `_score_options_flow()` adds −15..+15; wired into `get_institutional_signal()` as parallel fetch; score range updated to −45..+50; `options_flow` dict exposed in result

### ❌ Missing
- [ ] **Robust Form 4 parsing** — current regex on EDGAR HTML is fragile; breaks on layout changes
  - Target: use `https://efts.sec.gov/LATEST/search-index` JSON API instead
- [ ] **13F quarterly ownership changes** — no institutional accumulation/distribution tracking
  - Target: EDGAR 13F-HR filings → detect funds entering/exiting a position
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
| 2026-06-28 | Backtesting | Slippage 0.05% + commission $0.005/share per leg | 65% |
| 2026-06-28 | Regime | RSI(14) + volume_ratio + 2-cycle hysteresis | 78% |
| 2026-06-28 | ML | CalibratedClassifierCV + cross-strategy consensus (+8/+15) + short-inverted features | 83% |
| 2026-06-28 | Correlation | CVaR for shorts (inverted returns) + sector concentration limit (40% / GICS, 65 tickers) | 92% |
| 2026-06-28 | Institutional | Options flow proxy: Yahoo options chain, OTM vol/OI >1.5×, C/P ratio, IV skew (−15..+15) | 58% |
| 2026-06-28 | Backtesting | Regime-aware simulation: _classify_historical_regimes, entry gating, size_mult, regime_stats | 78% |
