"""
Walk-forward backtester for all rule-engine strategies.

Pipeline:
  1. Fetch 2yr daily OHLCV from Yahoo Finance v8 chart API
  2. Compute all technical signals vectorized over each bar
  3. Simulate each strategy's entry/exit rules (no lookahead)
  4. Compute Sharpe / Sortino / MaxDD / Calmar / Win Rate per strategy
  5. Persist results to SQLite for API retrieval

Backtest results are NOT predictive of future performance, but
walk-forward out-of-sample testing is used to validate signal quality.
"""
import asyncio
import json
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx
import numpy as np

_TIMEOUT = 10
_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; InvestAgent/6.0)"}

BASE_DIR = Path(__file__).resolve().parents[1]
BACKTEST_DB = BASE_DIR / "agent_decisions.sqlite3"

# ── Database ──────────────────────────────────────────────────────────────────

def _conn():
    c = sqlite3.connect(BACKTEST_DB, timeout=10)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("""
        CREATE TABLE IF NOT EXISTS backtest_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            strategy TEXT NOT NULL,
            ticker TEXT NOT NULL,
            total_trades INTEGER,
            win_rate REAL,
            sharpe REAL,
            sortino REAL,
            max_dd REAL,
            calmar REAL,
            total_return_pct REAL,
            avg_return_pct REAL,
            equity_curve TEXT,
            trade_log TEXT
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS backtest_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            status TEXT NOT NULL,
            tickers TEXT,
            days INTEGER,
            summary TEXT
        )
    """)
    c.commit()
    return c


# ── Signal computation (pure numpy, no external deps) ─────────────────────────

def _ema(v: np.ndarray, p: int) -> np.ndarray:
    out = np.full(len(v), np.nan)
    if len(v) < p:
        return out
    out[p - 1] = float(np.mean(v[:p]))
    k = 2.0 / (p + 1)
    for i in range(p, len(v)):
        out[i] = v[i] * k + out[i - 1] * (1 - k)
    return out


def _sma(v: np.ndarray, p: int) -> np.ndarray:
    out = np.full(len(v), np.nan)
    for i in range(p - 1, len(v)):
        out[i] = float(np.mean(v[i - p + 1:i + 1]))
    return out


def _rsi(closes: np.ndarray, period: int = 14) -> np.ndarray:
    out = np.full(len(closes), 50.0)
    if len(closes) < period + 1:
        return out
    deltas = np.diff(closes)
    gains = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)
    ag = float(np.mean(gains[:period]))
    al = float(np.mean(losses[:period]))
    for i in range(period, len(gains)):
        ag = (ag * (period - 1) + gains[i]) / period
        al = (al * (period - 1) + losses[i]) / period
        rs = ag / al if al > 1e-10 else 100.0
        out[i + 1] = 100.0 - 100.0 / (1.0 + rs)
    return out


def _atr(h: np.ndarray, l: np.ndarray, c: np.ndarray, p: int = 14) -> np.ndarray:
    out = np.zeros(len(c))
    if len(c) < 2:
        return out
    tr = np.maximum(h[1:] - l[1:],
                    np.maximum(np.abs(h[1:] - c[:-1]), np.abs(l[1:] - c[:-1])))
    if len(tr) < p:
        return out
    out[p] = float(np.mean(tr[:p]))
    for i in range(p, len(tr)):
        out[i + 1] = (out[i] * (p - 1) + tr[i]) / p
    return out


def _zscore(closes: np.ndarray, p: int = 20) -> np.ndarray:
    out = np.zeros(len(closes))
    for i in range(p, len(closes)):
        w = closes[i - p:i]
        mu, sigma = float(np.mean(w)), float(np.std(w))
        out[i] = (closes[i] - mu) / sigma if sigma > 1e-10 else 0.0
    return out


def _rvol(volumes: np.ndarray, p: int = 10) -> np.ndarray:
    out = np.ones(len(volumes))
    for i in range(p, len(volumes)):
        avg = float(np.mean(volumes[i - p:i]))
        out[i] = volumes[i] / avg if avg > 0 else 1.0
    return out


def compute_signal_arrays(
    closes: np.ndarray,
    volumes: np.ndarray,
    highs: np.ndarray,
    lows: np.ndarray,
) -> Dict[str, np.ndarray]:
    """Compute all technical signal arrays over the full price history."""
    n = len(closes)

    sma20 = _sma(closes, 20)
    sma50 = _sma(closes, 50)
    ema12 = _ema(closes, 12)
    ema26 = _ema(closes, 26)
    macd_line = ema12 - ema26
    macd_sig = _ema(np.nan_to_num(macd_line), 9)
    macd_hist = macd_line - macd_sig
    rsi_arr = _rsi(closes, 14)
    atr_arr = _atr(highs, lows, closes, 14)
    z_arr = _zscore(closes, 20)
    rv_arr = _rvol(volumes, 10)

    # Bollinger
    bb_std = np.array([float(np.std(closes[max(0, i-19):i+1])) if i >= 19 else closes[i]*0.02
                        for i in range(n)])
    bb_upper = sma20 + 2 * bb_std
    bb_lower = sma20 - 2 * bb_std

    # Daily change %
    chg = np.zeros(n)
    chg[1:] = (closes[1:] - closes[:-1]) / closes[:-1] * 100

    # 5-day trend %
    trend5 = np.zeros(n)
    trend5[5:] = (closes[5:] - closes[:-5]) / closes[:-5] * 100

    # 52-week (252-bar) high/low proximity
    high52 = np.array([float(np.max(closes[max(0, i-251):i+1])) for i in range(n)])
    low52 = np.array([float(np.min(closes[max(0, i-251):i+1])) for i in range(n)])
    pct_from_h52 = (closes - high52) / high52 * 100

    return {
        "sma20": sma20, "sma50": sma50,
        "above_sma20": closes > sma20,
        "above_sma50": closes > sma50,
        "golden_cross": sma20 > sma50,
        "rsi": rsi_arr,
        "rvol": rv_arr,
        "atr": atr_arr,
        "zscore": z_arr,
        "macd_line": macd_line, "macd_signal": macd_sig, "macd_hist": macd_hist,
        "macd_bullish": macd_line > macd_sig,
        "macd_crossover": np.concatenate([[False], (macd_line[1:] > macd_sig[1:]) & (macd_line[:-1] <= macd_sig[:-1])]),
        "macd_hist_rising": np.concatenate([[False], macd_hist[1:] > macd_hist[:-1]]),
        "bb_upper": bb_upper, "bb_lower": bb_lower,
        "near_bb_lower": closes <= bb_lower + (bb_upper - bb_lower) * 0.08,
        "near_bb_upper": closes >= bb_upper - (bb_upper - bb_lower) * 0.08,
        "above_bb_upper": closes > bb_upper,
        "change_pct": chg,
        "trend_5d_pct": trend5,
        "trend_direction": np.where(trend5 > 1.5, "UP", np.where(trend5 < -1.5, "DOWN", "FLAT")),
        "near_52w_high": pct_from_h52 >= -5,
        "near_52w_low": (closes - low52) / (low52 + 1e-10) * 100 <= 5,
        "pct_from_52w_high": np.abs(pct_from_h52),
    }


def _bar_features(sigs: Dict[str, np.ndarray], idx: int, price: float) -> Dict:
    """Extract per-bar feature dict from signal arrays at index idx."""
    def g(k, default=None):
        arr = sigs.get(k)
        if arr is None:
            return default
        v = arr[idx]
        if isinstance(v, (np.bool_,)):
            return bool(v)
        if isinstance(v, np.ndarray):
            return str(v)
        if np.isnan(v):
            return default
        return float(v)

    return {
        "ok": True, "price": price,
        "change_pct": g("change_pct", 0),
        "above_sma20": g("above_sma20", False),
        "above_sma50_daily": g("above_sma50", False),
        "golden_cross": g("golden_cross", False),
        "rsi": g("rsi", 50),
        "rvol": g("rvol", 1.0),
        "atr": g("atr", price * 0.02),
        "zscore_daily": g("zscore", 0),
        "macd_bullish_daily": g("macd_bullish", False),
        "macd_crossover_daily": g("macd_crossover", False),
        "macd_hist_rising_daily": g("macd_hist_rising", False),
        "bb_squeeze_daily": False,
        "near_bb_lower_daily": g("near_bb_lower", False),
        "near_bb_upper_daily": g("near_bb_upper", False),
        "above_bb_upper_daily": g("above_bb_upper", False),
        "trend_5d_pct": g("trend_5d_pct", 0),
        "trend_direction": sigs["trend_direction"][idx] if "trend_direction" in sigs else "FLAT",
        "near_52w_high": g("near_52w_high", False),
        "near_52w_low": g("near_52w_low", False),
        "pct_from_52w_high": g("pct_from_52w_high", 10),
        "strong_trend": False, "adx": 20,
        "rs_vs_spy": 1.0,
        "above_vwap": True, "vwap_pct": 0,
        # intraday (not available in daily backtest — use None)
        "macd_bullish": None, "macd_crossover": None, "macd_hist_rising": None,
        "bb_squeeze": None,
    }


# ── Strategy simulation ────────────────────────────────────────────────────────

_STRATEGY_SCORE_FNS: Dict = {}  # filled lazily

def _get_score_fns():
    global _STRATEGY_SCORE_FNS
    if not _STRATEGY_SCORE_FNS:
        from services.autonomous_agent import LONG_STRATEGY_FNS, SHORT_STRATEGY_FNS
        _STRATEGY_SCORE_FNS = {**LONG_STRATEGY_FNS, **SHORT_STRATEGY_FNS}
    return _STRATEGY_SCORE_FNS


# ── Transaction cost model ────────────────────────────────────────────────────
# 0.05% slippage per leg (market impact) + $0.005/share commission (IB-style)
SLIPPAGE_PCT       = 0.0005
COMMISSION_PER_SHR = 0.005


# ── Historical regime classification ─────────────────────────────────────────

def _classify_historical_regimes(
    spy_closes: np.ndarray,
    spy_volumes: np.ndarray,
    window: int = 60,
) -> List[str]:
    """
    Compute a historical regime label for every bar in the SPY price series.

    For each bar i we look back `window` bars, estimate VIX from 20-day
    realised volatility (100 × annualised σ), then call the same _classify()
    logic used by the live regime detector.  Returns a list of regime strings
    the same length as spy_closes; bars inside the warm-up window get
    'CHOPPY_RANGE' (safest default before enough data is available).
    """
    from services.regime_detector import _classify as _rc

    n = len(spy_closes)
    regimes: List[str] = ["CHOPPY_RANGE"] * n

    # Pre-compute 20-day realised-vol VIX proxy for the full series
    vix_proxy = np.full(n, 18.0)
    log_ret = np.diff(np.log(np.maximum(spy_closes, 1e-10)))
    for i in range(20, n):
        rv = float(np.std(log_ret[i - 20:i]) * np.sqrt(252) * 100)
        vix_proxy[i] = float(np.clip(rv, 8.0, 80.0))

    for i in range(window, n):
        w_closes  = spy_closes[i - window + 1:i + 1].tolist()
        w_volumes = spy_volumes[i - window + 1:i + 1].tolist()
        vix       = float(vix_proxy[i])
        try:
            regime, _, _ = _rc({"closes": w_closes, "volumes": w_volumes}, vix)
        except Exception:
            regime = "CHOPPY_RANGE"
        regimes[i] = regime

    return regimes


def simulate_strategy(
    strategy: str,
    dates: List[str],
    closes: np.ndarray,
    sigs: Dict[str, np.ndarray],
    config: Optional[Dict] = None,
    regime_series: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Simulate one strategy on a single ticker's history.
    Returns equity curve, trade log, and performance metrics.
    Applies 0.05% slippage + $0.005/share commission per leg.

    regime_series: optional list of regime strings aligned to closes (from
    _classify_historical_regimes). When provided:
      - entries are gated by the regime's active_long/short_strategies list
      - position sizing is scaled by the regime's size_multiplier
      - confidence threshold is adjusted by confidence_bonus
      - each trade is tagged with its entry regime for post-analysis
    """
    from services.regime_detector import REGIME_CONFIG

    cfg = config or {}
    min_conf = cfg.get("min_confidence", 65)
    take_profit_pct = cfg.get("take_profit_pct", 15.0)
    cut_loss_pct = cfg.get("cut_loss_pct", 7.0)
    is_short = strategy.startswith("short_")

    score_fns = _get_score_fns()
    fn = score_fns.get(strategy)
    if fn is None:
        return {"error": f"Strategy '{strategy}' not found"}

    warmup = 52  # bars needed for reliable signals
    capital = 100_000.0
    equity = [capital] * warmup
    cash = capital
    position_qty = 0.0
    entry_price = 0.0      # effective (post-slippage) entry price
    entry_bar = -1
    entry_regime = ""
    trades: List[Dict] = []
    total_commission = 0.0
    total_slippage_cost = 0.0
    regime_bars: Dict[str, int] = {}

    for i in range(warmup, len(closes)):
        price = closes[i]
        if np.isnan(price) or price <= 0:
            equity.append(equity[-1])
            continue

        # ── Regime at this bar ─────────────────────────────────────────────
        regime = (regime_series[i]
                  if regime_series and i < len(regime_series)
                  else "CHOPPY_RANGE")
        regime_bars[regime] = regime_bars.get(regime, 0) + 1

        regime_cfg     = REGIME_CONFIG.get(regime, REGIME_CONFIG["CHOPPY_RANGE"])
        size_mult      = regime_cfg.get("size_multiplier", 1.0)
        conf_bonus     = regime_cfg.get("confidence_bonus", 0)
        allowed_longs  = regime_cfg.get("active_long_strategies", [])
        allowed_shorts = regime_cfg.get("active_short_strategies", [])

        macro_bar = {"hostile": regime == "CRISIS", "regime": regime, "vix": 18}

        # ── Exit logic (always runs — regime does not block exits) ─────────
        if position_qty != 0 and entry_price > 0:
            if not is_short:
                eff_exit = price * (1 - SLIPPAGE_PCT)
            else:
                eff_exit = price * (1 + SLIPPAGE_PCT)

            commission = position_qty * COMMISSION_PER_SHR

            pnl_pct = ((eff_exit - entry_price) / entry_price * 100
                       if not is_short
                       else (entry_price - eff_exit) / entry_price * 100)

            should_exit = (
                pnl_pct >= take_profit_pct or
                pnl_pct <= -cut_loss_pct or
                (i - entry_bar) >= 20
            )
            if should_exit:
                if not is_short:
                    cash = position_qty * eff_exit - commission
                else:
                    cash = cash + (entry_price - eff_exit) * position_qty - commission

                total_commission += commission
                total_slippage_cost += abs(price - eff_exit) * position_qty

                trades.append({
                    "entry_bar": entry_bar,
                    "exit_bar": i,
                    "entry_price": round(entry_price, 2),
                    "exit_price": round(eff_exit, 2),
                    "raw_exit_price": round(price, 2),
                    "pnl_pct": round(pnl_pct, 2),
                    "bars_held": i - entry_bar,
                    "win": pnl_pct > 0,
                    "commission": round(commission * 2, 2),
                    "date": dates[i] if i < len(dates) else "",
                    "entry_regime": entry_regime,
                })
                position_qty = 0.0
                entry_price = 0.0
                entry_regime = ""

        # ── Entry logic: gated by regime ───────────────────────────────────
        if position_qty == 0 and cash > 1000:
            # Check if this strategy is active in the current regime.
            # An empty allowed list means the regime blocks ALL entries of that side
            # (e.g. CRISIS blocks all longs; BULL blocks all shorts).
            if regime_series:
                if is_short:
                    entry_allowed = bool(allowed_shorts) and strategy in allowed_shorts
                else:
                    entry_allowed = bool(allowed_longs) and strategy in allowed_longs
            else:
                entry_allowed = True  # no regime data → no filtering

            if entry_allowed:
                features = _bar_features(sigs, i, price)
                features["ticker"] = "BACKTEST"
                score, _ = fn(features, macro_bar)
                confidence = min(int(score * 1.1), 99)

                # Regime confidence adjustment: bear/crisis raise the bar
                effective_min_conf = max(50, min_conf - conf_bonus)

                if confidence >= effective_min_conf:
                    risk_pct = (2.0 * size_mult) / 100
                    atr = sigs["atr"][i] if "atr" in sigs else price * 0.02
                    stop_dist = max(atr * 2, price * 0.05)
                    shares = int((cash * risk_pct) / stop_dist)
                    if shares < 1:
                        shares = 1

                    if not is_short:
                        eff_entry = price * (1 + SLIPPAGE_PCT)
                    else:
                        eff_entry = price * (1 - SLIPPAGE_PCT)

                    commission = shares * COMMISSION_PER_SHR
                    cost = shares * eff_entry + commission

                    if cost <= cash * 0.30:
                        total_commission += commission
                        total_slippage_cost += abs(price - eff_entry) * shares
                        entry_price = eff_entry
                        entry_bar = i
                        entry_regime = regime
                        if not is_short:
                            position_qty = shares
                            cash -= cost
                        else:
                            position_qty = shares
                            cash += shares * eff_entry - commission

        current_value = (
            cash + position_qty * price if not is_short
            else (cash - position_qty * price + 2 * position_qty * entry_price
                  if entry_price > 0 else cash)
        )
        equity.append(max(current_value, 0))

    total_bars = sum(regime_bars.values()) or 1
    regime_distribution = {
        r: round(cnt / total_bars * 100, 1)
        for r, cnt in sorted(regime_bars.items())
        if cnt > 0
    }

    return {
        "strategy": strategy,
        "trades": trades,
        "equity_curve": equity,
        "start_capital": 100_000.0,
        "end_capital": equity[-1] if equity else 100_000.0,
        "total_commission": round(total_commission, 2),
        "total_slippage_cost": round(total_slippage_cost, 2),
        "regime_distribution": regime_distribution,
    }


# ── Performance metrics ───────────────────────────────────────────────────────

def compute_metrics(result: Dict[str, Any], dates: List[str]) -> Dict[str, Any]:
    """Compute Sharpe / Sortino / MaxDD / Calmar / Win Rate from simulation result."""
    equity = np.array(result.get("equity_curve", [100_000.0]))
    trades = result.get("trades", [])

    if len(equity) < 2:
        return {"error": "Not enough data"}

    returns = np.diff(equity) / equity[:-1]
    returns = returns[np.isfinite(returns)]

    # Sharpe (annualized, assuming 252 trading days)
    mean_r = float(np.mean(returns)) if len(returns) else 0
    std_r = float(np.std(returns)) if len(returns) else 1e-10
    sharpe = (mean_r / std_r) * np.sqrt(252) if std_r > 1e-10 else 0.0

    # Sortino (downside deviation only)
    down_r = returns[returns < 0]
    down_std = float(np.std(down_r)) if len(down_r) > 1 else std_r
    sortino = (mean_r / down_std) * np.sqrt(252) if down_std > 1e-10 else 0.0

    # Max drawdown
    peak = np.maximum.accumulate(equity)
    drawdown = (equity - peak) / peak
    max_dd = float(np.min(drawdown)) * 100  # as %

    # Total return
    total_return_pct = (equity[-1] / equity[0] - 1) * 100 if equity[0] > 0 else 0.0

    # CAGR (approximate days as 252 * years)
    n_years = len(equity) / 252
    cagr = ((equity[-1] / equity[0]) ** (1 / n_years) - 1) * 100 if n_years > 0 and equity[0] > 0 else 0.0

    # Calmar
    calmar = cagr / abs(max_dd) if abs(max_dd) > 0.1 else 0.0

    # Win rate
    wins = [t for t in trades if t.get("win")]
    win_rate = len(wins) / len(trades) * 100 if trades else 0.0
    avg_return = float(np.mean([t["pnl_pct"] for t in trades])) if trades else 0.0

    # Regime breakdown: win rate + avg P&L per regime from trade log
    regime_stats: Dict[str, Any] = {}
    for t in trades:
        r = t.get("entry_regime") or "unknown"
        if r not in regime_stats:
            regime_stats[r] = {"trades": 0, "wins": 0, "total_pnl": 0.0}
        regime_stats[r]["trades"] += 1
        if t.get("win"):
            regime_stats[r]["wins"] += 1
        regime_stats[r]["total_pnl"] += float(t.get("pnl_pct", 0))
    for r, s in regime_stats.items():
        n = s["trades"]
        s["win_rate_pct"] = round(s["wins"] / n * 100, 1) if n else 0
        s["avg_pnl_pct"]  = round(s["total_pnl"] / n, 2) if n else 0
        del s["wins"], s["total_pnl"]

    return {
        "strategy": result.get("strategy", ""),
        "total_trades": len(trades),
        "win_rate": round(win_rate, 1),
        "sharpe": round(sharpe, 2),
        "sortino": round(sortino, 2),
        "max_dd_pct": round(max_dd, 1),
        "calmar": round(calmar, 2),
        "total_return_pct": round(total_return_pct, 1),
        "avg_return_pct": round(avg_return, 2),
        "cagr_pct": round(cagr, 1),
        "equity_curve_sampled": [round(float(v), 2) for v in equity[::5]],
        "trade_count_per_month": round(len(trades) / max(len(equity) / 21, 1), 1),
        "regime_stats": regime_stats,
        "regime_distribution": result.get("regime_distribution", {}),
    }


# ── Historical data fetching ──────────────────────────────────────────────────

# Approximate current price anchors for demo/mock data generation
_MOCK_PRICES = {
    "SPY": 510.0, "QQQ": 445.0, "IWM": 205.0, "DIA": 395.0,
    "AAPL": 195.0, "MSFT": 420.0, "NVDA": 950.0, "AMZN": 210.0,
    "TSLA": 245.0, "META": 605.0, "GOOGL": 175.0, "AMD": 165.0,
    "NFLX": 1050.0, "ORCL": 165.0, "CRM": 295.0, "ADBE": 440.0,
    "INTC": 25.0, "QCOM": 175.0, "AVGO": 1800.0, "MU": 120.0,
    "PANW": 390.0, "CRWD": 380.0, "SNOW": 165.0, "ZS": 215.0,
    "JPM": 230.0, "BAC": 44.0, "GS": 530.0, "MS": 118.0,
    "XLK": 238.0, "XLF": 48.0, "XLE": 88.0, "XLV": 148.0,
    "XLY": 198.0, "XLI": 138.0, "XLC": 88.0, "XLRE": 38.0, "XLB": 88.0,
}
_MOCK_VOL_ANNUAL = {
    "SPY": 0.14, "QQQ": 0.18, "NVDA": 0.50, "TSLA": 0.55, "AMD": 0.45,
    "AAPL": 0.22, "MSFT": 0.22, "AMZN": 0.28, "META": 0.32, "GOOGL": 0.25,
}


def _generate_mock_history(ticker: str, days: int = 504) -> Dict[str, Any]:
    """Generate synthetic OHLCV data via Geometric Brownian Motion for demo/offline use."""
    import random
    t = ticker.upper()
    seed = sum(ord(c) * (i + 1) for i, c in enumerate(t))
    rng_state = random.Random(seed)
    np_rng = np.random.default_rng(seed)

    s0 = _MOCK_PRICES.get(t, 100.0)
    sigma_annual = _MOCK_VOL_ANNUAL.get(t, 0.28)
    mu_annual = 0.09  # mild upward drift
    dt = 1.0 / 252
    sigma_dt = sigma_annual * (dt ** 0.5)
    drift = (mu_annual - 0.5 * sigma_annual ** 2) * dt

    # Simulate total_days + 30 extra bars then trim to `days`
    total = days + 30
    z = np_rng.standard_normal(total)
    log_returns = drift + sigma_dt * z
    prices = s0 * np.exp(np.cumsum(np.insert(log_returns, 0, 0.0)))
    prices = prices[30:][:days]  # warmup then trim

    # Build OHLC from close using realistic intrabar ranges (~ATR ≈ 0.8 * sigma_daily * price)
    sigma_daily = sigma_annual / (252 ** 0.5)
    n = len(prices)
    highs = np.zeros(n)
    lows = np.zeros(n)
    opens = np.zeros(n)
    vol_base = 30_000_000 if t in ("SPY", "QQQ") else 10_000_000

    for i in range(n):
        c = prices[i]
        rng_f = rng_state.gauss(0, sigma_daily * c * 0.6)
        o = max(c * 0.98, c + rng_f)
        hl_range = abs(rng_state.gauss(0, sigma_daily * c * 1.5)) + c * 0.003
        highs[i] = max(c, o) + hl_range * 0.6
        lows[i]  = min(c, o) - hl_range * 0.4
        opens[i] = o

    # Volume: log-normal random walk
    raw_vol = np_rng.lognormal(mean=0, sigma=0.3, size=n)
    volumes = (raw_vol / float(np.mean(raw_vol))) * vol_base

    # Build date strings (skip weekends, ending on today)
    import datetime as _dt
    end_date = _dt.date.today()
    dates = []
    d = end_date
    while len(dates) < n:
        if d.weekday() < 5:
            dates.append(d.strftime("%Y-%m-%d"))
        d -= _dt.timedelta(days=1)
    dates = list(reversed(dates))

    records = [
        {"date": dates[i], "open": round(opens[i], 2), "high": round(highs[i], 2),
         "low": round(lows[i], 2), "close": round(prices[i], 2), "volume": int(volumes[i])}
        for i in range(n)
    ]

    return {
        "ticker": t,
        "records": records,
        "closes": prices,
        "highs": highs,
        "lows": lows,
        "volumes": volumes,
        "dates": dates,
        "mock": True,
    }


async def fetch_history(ticker: str, days: int = 504) -> Optional[Dict[str, Any]]:
    """Fetch daily OHLCV from Yahoo Finance v8 chart; falls back to synthetic demo data."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker.upper()}"
    rng = "2y" if days > 365 else "1y"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS) as client:
            r = await client.get(url, params={"interval": "1d", "range": rng})
            r.raise_for_status()
            data = r.json()
        result = data["chart"]["result"][0]
        ts = result["timestamp"]
        q = result["indicators"]["quote"][0]
        closes_raw = q.get("close", [])
        highs_raw = q.get("high", [])
        lows_raw = q.get("low", [])
        volumes_raw = q.get("volume", [])
        opens_raw = q.get("open", [])

        # Filter None values
        records = []
        for i in range(len(ts)):
            c = closes_raw[i] if i < len(closes_raw) else None
            if c is None or c <= 0:
                continue
            records.append({
                "date": datetime.fromtimestamp(ts[i]).strftime("%Y-%m-%d"),
                "open": (opens_raw[i] or c) if i < len(opens_raw) else c,
                "high": (highs_raw[i] or c) if i < len(highs_raw) else c,
                "low": (lows_raw[i] or c) if i < len(lows_raw) else c,
                "close": c,
                "volume": (volumes_raw[i] or 0) if i < len(volumes_raw) else 0,
            })

        records = records[-days:]
        if len(records) < 60:
            return _generate_mock_history(ticker, days)

        return {
            "ticker": ticker.upper(),
            "records": records,
            "closes": np.array([r["close"] for r in records]),
            "highs": np.array([r["high"] for r in records]),
            "lows": np.array([r["low"] for r in records]),
            "volumes": np.array([r["volume"] for r in records], dtype=float),
            "dates": [r["date"] for r in records],
        }
    except Exception:
        return _generate_mock_history(ticker, days)


# ── Orchestrator ──────────────────────────────────────────────────────────────

def _spy_benchmark(spy_closes: np.ndarray) -> Dict[str, Any]:
    """Compute buy-and-hold SPY metrics over the given close series."""
    closes = spy_closes[~np.isnan(spy_closes)]
    if len(closes) < 10:
        return {}
    equity = np.ones(len(closes))
    for i in range(1, len(closes)):
        equity[i] = equity[i - 1] * (closes[i] / closes[i - 1])
    returns = np.diff(equity) / equity[:-1]
    mean_r = float(np.mean(returns))
    std_r = float(np.std(returns)) or 1e-10
    sharpe = (mean_r / std_r) * np.sqrt(252)
    down_r = returns[returns < 0]
    down_std = float(np.std(down_r)) if len(down_r) > 1 else std_r
    sortino = (mean_r / down_std) * np.sqrt(252) if down_std > 1e-10 else 0.0
    peak = np.maximum.accumulate(equity)
    max_dd = float(np.min((equity - peak) / peak)) * 100
    total_return = (equity[-1] - 1) * 100
    n_years = len(equity) / 252
    cagr = ((equity[-1]) ** (1 / n_years) - 1) * 100 if n_years > 0 else 0.0
    sampled = [round(float(v), 4) for v in equity[::5]]
    return {
        "sharpe": round(sharpe, 2),
        "sortino": round(sortino, 2),
        "max_dd_pct": round(max_dd, 1),
        "total_return_pct": round(total_return, 1),
        "cagr_pct": round(cagr, 1),
        "equity_sampled": sampled,  # normalized to 1.0 base
    }


async def run_backtest(
    tickers: Optional[List[str]] = None,
    strategies: Optional[List[str]] = None,
    days: int = 504,
) -> Dict[str, Any]:
    """
    Run full backtest for all tickers × strategies + SPY buy-and-hold benchmark.
    Saves results to SQLite. Returns summary dict.
    """
    from services.autonomous_agent import UNIVERSE, DEFAULT_CONFIG

    tickers = tickers or UNIVERSE
    strategies = strategies or list(DEFAULT_CONFIG["strategies"]) + list(DEFAULT_CONFIG["short_strategies"])
    run_ts = datetime.now(timezone.utc).isoformat()

    # Log run start
    conn = _conn()
    run_id = conn.execute(
        "INSERT INTO backtest_runs(ts,status,tickers,days,summary) VALUES(?,?,?,?,?)",
        (run_ts, "running", json.dumps(tickers), days, None)
    ).lastrowid
    conn.commit()
    conn.close()

    # Fetch historical data concurrently (always include SPY for benchmark)
    fetch_tickers = list(dict.fromkeys(["SPY"] + list(tickers)))
    sem = asyncio.Semaphore(5)

    async def _fetch(t):
        async with sem:
            return t, await fetch_history(t, days)

    pairs = await asyncio.gather(*[_fetch(t) for t in fetch_tickers], return_exceptions=True)
    hist_map: Dict[str, Any] = {}
    for item in pairs:
        if isinstance(item, tuple):
            t, h = item
            if isinstance(h, dict) and h:
                hist_map[t] = h

    # Compute SPY benchmark + historical regime series
    spy_benchmark: Dict[str, Any] = {}
    spy_regime_series: List[str] = []
    spy_date_index: Dict[str, int] = {}

    if "SPY" in hist_map:
        spy_hist = hist_map["SPY"]
        spy_benchmark = _spy_benchmark(spy_hist["closes"])
        spy_regime_series = _classify_historical_regimes(
            spy_hist["closes"], spy_hist["volumes"]
        )
        spy_date_index = {d: i for i, d in enumerate(spy_hist["dates"])}

    # Overall regime distribution during the test window
    overall_regime_dist: Dict[str, int] = {}
    for r in spy_regime_series:
        overall_regime_dist[r] = overall_regime_dist.get(r, 0) + 1

    all_metrics: List[Dict] = []
    strategy_summary: Dict[str, List] = {}
    # Track best equity curve per strategy (highest Sharpe, must have trades)
    best_ec_by_strat: Dict[str, Tuple[float, List[float]]] = {}

    for ticker, hist in hist_map.items():
        closes = hist["closes"]
        highs = hist["highs"]
        lows = hist["lows"]
        volumes = hist["volumes"]
        dates = hist["dates"]

        sigs = compute_signal_arrays(closes, volumes, highs, lows)

        # Align SPY regime series to this ticker's dates
        if spy_regime_series and spy_date_index:
            ticker_regime_series = [
                spy_regime_series[spy_date_index[d]]
                if d in spy_date_index and spy_date_index[d] < len(spy_regime_series)
                else "CHOPPY_RANGE"
                for d in dates
            ]
        else:
            ticker_regime_series = []

        for strat in strategies:
            try:
                sim = simulate_strategy(strat, dates, closes, sigs,
                                        regime_series=ticker_regime_series)
                if "error" in sim:
                    continue
                metrics = compute_metrics(sim, dates)
                metrics["ticker"] = ticker
                all_metrics.append(metrics)

                if strat not in strategy_summary:
                    strategy_summary[strat] = []
                strategy_summary[strat].append(metrics)

                # Track best equity curve for Monte Carlo (needs real trades)
                if metrics.get("total_trades", 0) > 0:
                    sharpe = metrics.get("sharpe", -999)
                    prev_sharpe = best_ec_by_strat.get(strat, (-999, []))[0]
                    if sharpe > prev_sharpe:
                        best_ec_by_strat[strat] = (sharpe, sim.get("equity_curve", []))

                # Persist per-ticker result
                _save_result(ticker, strat, metrics, sim.get("equity_curve", []), sim.get("trades", []), run_ts)
            except Exception:
                continue

    # Aggregate per strategy across tickers
    aggregated: List[Dict] = []
    for strat, ms in strategy_summary.items():
        if not ms:
            continue
        agg = {
            "strategy": strat,
            "tickers_tested": len(ms),
            "avg_trades": round(float(np.mean([m["total_trades"] for m in ms])), 1),
            "avg_win_rate": round(float(np.mean([m["win_rate"] for m in ms])), 1),
            "avg_sharpe": round(float(np.mean([m["sharpe"] for m in ms])), 2),
            "avg_sortino": round(float(np.mean([m["sortino"] for m in ms])), 2),
            "avg_max_dd": round(float(np.mean([m["max_dd_pct"] for m in ms])), 1),
            "avg_calmar": round(float(np.mean([m["calmar"] for m in ms])), 2),
            "avg_total_return_pct": round(float(np.mean([m["total_return_pct"] for m in ms])), 1),
        }
        aggregated.append(agg)

    aggregated.sort(key=lambda x: x["avg_sharpe"], reverse=True)

    # Monte Carlo on the best overall strategy
    mc_result: Dict[str, Any] = {}
    if best_ec_by_strat:
        best_strat = max(best_ec_by_strat, key=lambda s: best_ec_by_strat[s][0])
        _, best_ec = best_ec_by_strat[best_strat]
        mc_result = monte_carlo_simulation(best_ec, n_paths=1000)
        mc_result["strategy"] = best_strat

    mock_count = sum(1 for h in hist_map.values() if h.get("mock"))
    total_spy_bars = sum(overall_regime_dist.values()) or 1
    summary = {
        "run_ts": run_ts,
        "tickers_tested": len(hist_map) - (1 if "SPY" in hist_map else 0),
        "strategies_tested": len(strategies),
        "days": days,
        "aggregated_by_strategy": aggregated,
        "total_results": len(all_metrics),
        "spy_benchmark": spy_benchmark,
        "mock_data": mock_count > 0,
        "mock_ticker_count": mock_count,
        "monte_carlo": mc_result,
        "regime_distribution": {
            r: round(cnt / total_spy_bars * 100, 1)
            for r, cnt in sorted(overall_regime_dist.items())
            if cnt > 0
        },
        "regime_aware": bool(spy_regime_series),
    }

    # Update run status
    conn = _conn()
    conn.execute("UPDATE backtest_runs SET status=?, summary=? WHERE id=?",
                 ("completed", json.dumps(summary), run_id))
    conn.commit()
    conn.close()

    return summary


async def run_walkforward_backtest(
    tickers: Optional[List[str]] = None,
    strategies: Optional[List[str]] = None,
    train_days: int = 126,   # ~6 months IS window
    test_days: int = 63,     # ~3 months OOS window
    days: int = 504,          # ~2 years total history
) -> Dict[str, Any]:
    """
    Walk-forward out-of-sample validation.

    For each ticker × strategy, slides a train_days → test_days window
    across the full history (non-overlapping OOS periods → unbiased OOS estimate):

      Window k IS  : [win_start .. win_start + train_days)
      Window k OOS : [win_start + train_days .. win_start + train_days + test_days)
      Step         : test_days  (next OOS starts where previous OOS ended)

    Each slice includes SIM_WARMUP extra bars prepended so simulate_strategy
    gets proper indicator warmup without contaminating the evaluation period.

    Returns per-window IS/OOS metrics + aggregated OOS statistics per strategy.
    The is_oos_sharpe_ratio (OOS Sharpe / IS Sharpe) measures generalisation;
    a ratio < 0.7 indicates significant in-sample overfitting.
    """
    from services.autonomous_agent import UNIVERSE, DEFAULT_CONFIG

    tickers   = tickers   or UNIVERSE[:10]  # limit default for speed
    strategies = strategies or list(DEFAULT_CONFIG["strategies"])
    run_ts = datetime.now(timezone.utc).isoformat()

    # ── Fetch historical data ─────────────────────────────────────────────────
    fetch_tickers = list(dict.fromkeys(["SPY"] + list(tickers)))
    sem = asyncio.Semaphore(5)

    async def _fetch(t: str) -> Tuple[str, Optional[Dict]]:
        async with sem:
            return t, await fetch_history(t, days)

    pairs = await asyncio.gather(*[_fetch(t) for t in fetch_tickers], return_exceptions=True)
    hist_map: Dict[str, Any] = {}
    for item in pairs:
        if isinstance(item, tuple):
            t, h = item
            if isinstance(h, dict) and h:
                hist_map[t] = h

    # ── SPY regime series ─────────────────────────────────────────────────────
    spy_regime_series: List[str] = []
    spy_date_index: Dict[str, int] = {}
    if "SPY" in hist_map:
        spy_hist = hist_map["SPY"]
        spy_regime_series = _classify_historical_regimes(spy_hist["closes"], spy_hist["volumes"])
        spy_date_index = {d: i for i, d in enumerate(spy_hist["dates"])}

    # ── Walk-forward windows ──────────────────────────────────────────────────
    SIM_WARMUP = 52   # must match warmup constant in simulate_strategy
    min_bars   = SIM_WARMUP + train_days + test_days

    results_by_strategy: Dict[str, Dict[str, Any]] = {}

    for ticker, hist in hist_map.items():
        if ticker == "SPY":
            continue

        closes  = hist["closes"]
        highs   = hist["highs"]
        lows    = hist["lows"]
        volumes = hist["volumes"]
        dates   = hist["dates"]
        n       = len(closes)

        if n < min_bars:
            continue

        sigs = compute_signal_arrays(closes, volumes, highs, lows)

        ticker_regime: List[str] = (
            [spy_regime_series[spy_date_index[d]]
             if d in spy_date_index and spy_date_index[d] < len(spy_regime_series)
             else "CHOPPY_RANGE"
             for d in dates]
            if spy_regime_series and spy_date_index else []
        )

        for strat in strategies:
            windows: List[Dict] = []
            win_start = SIM_WARMUP   # first IS period starts after warmup

            while win_start + train_days + test_days <= n:
                is_end  = win_start + train_days
                oos_end = is_end + test_days

                # Prepend SIM_WARMUP bars so simulate_strategy has proper warmup
                is_s0  = win_start - SIM_WARMUP   # = 0 for first window
                oos_s0 = is_end    - SIM_WARMUP

                def _sl(arr, a: int, b: int):
                    return arr[a:b] if isinstance(arr, list) else arr[a:b]

                is_sigs  = {k: v[is_s0:is_end]  for k, v in sigs.items()}
                oos_sigs = {k: v[oos_s0:oos_end] for k, v in sigs.items()}

                is_r   = _sl(ticker_regime, is_s0,  is_end)  if ticker_regime else []
                oos_r  = _sl(ticker_regime, oos_s0, oos_end) if ticker_regime else []

                try:
                    is_sim  = simulate_strategy(strat, dates[is_s0:is_end],
                                                closes[is_s0:is_end],   is_sigs,  regime_series=is_r)
                    oos_sim = simulate_strategy(strat, dates[oos_s0:oos_end],
                                                closes[oos_s0:oos_end], oos_sigs, regime_series=oos_r)

                    if "error" in is_sim or "error" in oos_sim:
                        win_start += test_days
                        continue

                    is_m  = compute_metrics(is_sim,  dates[is_s0:is_end])
                    oos_m = compute_metrics(oos_sim, dates[oos_s0:oos_end])

                    windows.append({
                        "window_start": dates[win_start],
                        "is_end":       dates[is_end  - 1] if is_end  <= n else "",
                        "oos_end":      dates[oos_end - 1] if oos_end <= n else "",
                        "is":  {
                            "sharpe":           is_m["sharpe"],
                            "win_rate":         is_m["win_rate"],
                            "total_return_pct": is_m["total_return_pct"],
                            "trades":           is_m["total_trades"],
                        },
                        "oos": {
                            "sharpe":           oos_m["sharpe"],
                            "win_rate":         oos_m["win_rate"],
                            "total_return_pct": oos_m["total_return_pct"],
                            "trades":           oos_m["total_trades"],
                        },
                    })
                except Exception:
                    pass

                win_start += test_days

            if windows:
                if strat not in results_by_strategy:
                    results_by_strategy[strat] = {"windows": [], "tickers": []}
                results_by_strategy[strat]["windows"].extend(windows)
                results_by_strategy[strat]["tickers"].append(ticker)

    # ── Aggregate OOS metrics per strategy ────────────────────────────────────
    aggregated: List[Dict] = []
    for strat, data in results_by_strategy.items():
        wins = data["windows"]
        if not wins:
            continue
        oos_sharpes = [w["oos"]["sharpe"] for w in wins]
        oos_wr      = [w["oos"]["win_rate"] for w in wins]
        oos_rets    = [w["oos"]["total_return_pct"] for w in wins]
        is_sharpes  = [w["is"]["sharpe"] for w in wins]

        avg_is  = float(np.mean(is_sharpes))
        avg_oos = float(np.mean(oos_sharpes))
        # OOS/IS Sharpe ratio: 1.0 = no decay, <0.7 = significant overfitting
        oos_ratio = avg_oos / avg_is if abs(avg_is) > 0.1 else 0.0

        aggregated.append({
            "strategy":             strat,
            "tickers_tested":       len(set(data["tickers"])),
            "n_windows":            len(wins),
            "avg_is_sharpe":        round(avg_is,  2),
            "avg_oos_sharpe":       round(avg_oos, 2),
            "avg_oos_win_rate":     round(float(np.mean(oos_wr)),   1),
            "avg_oos_return_pct":   round(float(np.mean(oos_rets)), 1),
            "is_oos_sharpe_ratio":  round(oos_ratio, 2),
            "pct_windows_oos_pos":  round(
                sum(1 for s in oos_sharpes if s > 0) / len(oos_sharpes) * 100, 1
            ),
        })

    aggregated.sort(key=lambda x: x["avg_oos_sharpe"], reverse=True)

    return {
        "run_ts":             run_ts,
        "train_days":         train_days,
        "test_days":          test_days,
        "tickers_tested":     len([t for t in hist_map if t != "SPY"]),
        "strategies":         strategies,
        "aggregated_by_strategy": aggregated,
        "total_windows":      sum(a["n_windows"] for a in aggregated),
    }


def _np_default(obj):
    """JSON encoder helper for numpy scalar types."""
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        return float(obj)
    if isinstance(obj, np.bool_):
        return bool(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    raise TypeError(f"Not serializable: {type(obj)}")


# ── Monte Carlo simulation ─────────────────────────────────────────────────────

def monte_carlo_simulation(
    equity_curve: List[float],
    n_paths: int = 1000,
    seed: int = 42,
) -> Dict[str, Any]:
    """
    Bootstrap Monte Carlo: resample daily returns 1000× to estimate the
    distribution of outcomes and worst-case drawdowns for a strategy.

    Returns percentile stats + 3 representative paths (P5/P50/P95) for
    the fan-chart visualisation.
    """
    equity = np.array(equity_curve, dtype=float)
    equity = equity[np.isfinite(equity) & (equity > 0)]
    if len(equity) < 20:
        return {}

    returns = np.diff(equity) / equity[:-1]
    returns = returns[np.isfinite(returns)]
    n_bars = len(returns)

    rng = np.random.default_rng(seed)
    # Bootstrap: for each path draw n_bars returns with replacement
    idx = rng.integers(0, n_bars, size=(n_paths, n_bars))
    sampled = returns[idx]  # (n_paths, n_bars)

    # Build equity paths starting at 1.0
    log_ret = np.log1p(np.clip(sampled, -0.99, 5.0))
    paths = np.concatenate(
        [np.ones((n_paths, 1)), np.exp(np.cumsum(log_ret, axis=1))],
        axis=1,
    )  # (n_paths, n_bars+1)

    final = paths[:, -1]
    final_ret_pct = (final - 1.0) * 100

    # Max drawdown per path
    peaks = np.maximum.accumulate(paths, axis=1)
    max_dds = np.min((paths - peaks) / peaks, axis=1) * 100  # negative

    pct = np.percentile(final_ret_pct, [5, 25, 50, 75, 95]).tolist()
    dd_p5 = float(np.percentile(max_dds, 5))
    dd_median = float(np.median(max_dds))
    prob_loss = float(np.mean(final < 1.0)) * 100

    # Representative paths for fan chart (downsampled to ≤80 points)
    sorted_idx = np.argsort(final)
    p5_i  = sorted_idx[max(0, int(0.05 * n_paths))]
    p50_i = sorted_idx[int(0.50 * n_paths)]
    p95_i = sorted_idx[min(n_paths - 1, int(0.95 * n_paths))]
    step = max(1, paths.shape[1] // 80)

    def _path(i: int) -> List[float]:
        return [round(float(v) * 100 - 100, 2) for v in paths[i, ::step]]

    return {
        "n_paths": n_paths,
        "n_bars": n_bars,
        "final_return_pct": {
            "p5":  round(pct[0], 1),
            "p25": round(pct[1], 1),
            "p50": round(pct[2], 1),
            "p75": round(pct[3], 1),
            "p95": round(pct[4], 1),
        },
        "max_drawdown_pct": {
            "p5_worst": round(dd_p5, 1),
            "median":   round(dd_median, 1),
        },
        "prob_loss_pct": round(prob_loss, 1),
        "paths": {
            "p5":  _path(p5_i),
            "p50": _path(p50_i),
            "p95": _path(p95_i),
        },
    }


def _save_result(ticker, strategy, metrics, equity_curve, trades, ts):
    # Normalize equity to 1.0 base so frontend formula (v*100-100) gives % return
    start = float(equity_curve[0]) if equity_curve else 100_000.0
    norm = [round(float(v) / start, 6) for v in equity_curve[::5]] if equity_curve else []
    conn = _conn()
    try:
        conn.execute("""
            INSERT INTO backtest_results
            (ts,strategy,ticker,total_trades,win_rate,sharpe,sortino,max_dd,calmar,total_return_pct,avg_return_pct,equity_curve,trade_log)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            ts, strategy, ticker,
            int(metrics["total_trades"]), float(metrics["win_rate"]),
            float(metrics["sharpe"]), float(metrics["sortino"]),
            float(metrics["max_dd_pct"]), float(metrics["calmar"]),
            float(metrics["total_return_pct"]), float(metrics["avg_return_pct"]),
            json.dumps(norm),
            json.dumps(trades[:50], default=_np_default),
        ))
        conn.commit()
    finally:
        conn.close()


def _build_frontend_result(run_d: Dict, conn) -> Dict[str, Any]:
    """Build the result shape the frontend BacktestPanel expects."""
    summary = json.loads(run_d.get("summary") or "{}")
    spy_bm = summary.get("spy_benchmark", {})

    # Per-ticker rows: pick best Sharpe per strategy (rows with trades ranked first)
    rows = conn.execute(
        "SELECT strategy, ticker, sharpe, win_rate, total_return_pct, max_dd, calmar, total_trades, equity_curve "
        "FROM backtest_results WHERE ts=? "
        "ORDER BY CASE WHEN total_trades > 0 THEN 1 ELSE 0 END DESC, sharpe DESC",
        (run_d["ts"],)
    ).fetchall()

    # Best row per strategy (already sorted by sharpe desc)
    best: Dict[str, Dict] = {}
    for r in rows:
        d = dict(r)
        if d["strategy"] not in best:
            try:
                d["equity_curve"] = json.loads(d.get("equity_curve") or "[]")
            except Exception:
                d["equity_curve"] = []
            best[d["strategy"]] = d

    strategies_out = []
    for strat, d in best.items():
        strategies_out.append({
            "name": strat,
            "trades": d.get("total_trades", 0),
            "win_rate": d.get("win_rate", 0),
            "sharpe": d.get("sharpe", 0),
            "max_dd": d.get("max_dd", 0),
            "calmar": d.get("calmar", 0),
            "total_return": d.get("total_return_pct", 0),
            "equity": d.get("equity_curve", []),
        })
    # Sort by sharpe desc
    strategies_out.sort(key=lambda x: x["sharpe"], reverse=True)

    return {
        "status": "completed",
        "run_ts": run_d["ts"],
        "days": run_d.get("days", 504),
        "tickers": json.loads(run_d.get("tickers") or "[]"),
        "summary": summary,
        "strategies": strategies_out,
        "spy_equity": spy_bm.get("equity_sampled", []),
        "spy_benchmark": spy_bm,
        "monte_carlo": summary.get("monte_carlo", {}),
    }


def get_latest_results() -> Dict[str, Any]:
    """Return the most recent backtest run's aggregated results."""
    conn = _conn()
    try:
        run = conn.execute(
            "SELECT * FROM backtest_runs WHERE status='completed' ORDER BY ts DESC LIMIT 1"
        ).fetchone()
        if not run:
            return {"status": "no_results", "message": "No backtest run yet. POST /agent/backtest to start."}
        return _build_frontend_result(dict(run), conn)
    finally:
        conn.close()


def get_backtest_status() -> Dict[str, Any]:
    """Return status of the most recent run; includes full results when completed."""
    conn = _conn()
    try:
        run = conn.execute(
            "SELECT * FROM backtest_runs ORDER BY ts DESC LIMIT 1"
        ).fetchone()
        if not run:
            return {"status": "idle"}
        d = dict(run)
        if d["status"] == "completed":
            return _build_frontend_result(d, conn)
        return {"status": d["status"], "ts": d["ts"], "days": d.get("days")}
    finally:
        conn.close()
