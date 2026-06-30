"""
Autonomous Trading Agent — pure rule-based engine, zero API cost.
Cycle: fetch market data → score signals → decide → risk-check → paper execute → log.
"""
import asyncio
import json
import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from services.market_data import fetch_quotes, fetch_enhanced_quotes, fetch_macro, fetch_sector_momentum
from services.news_scorer import score_news_best, sentiment_boost
from services.fundamentals_screener import fetch_fundamentals_batch, fundamental_adj
from services.earnings_calendar import refresh_calendar, should_avoid_entry, pead_signal, pre_earnings_signal
from services.strategy_tracker import save_pnl_snapshot, record_entry, record_exit, kelly_scale, kelly_rolling
from services.risk_manager import RiskManager
from services.paper_trading import (
    execute_paper_trade,
    get_open_positions,
    get_open_longs,
    get_open_shorts,
    get_portfolio_summary,
    INITIAL_CASH,
)
INITIAL_CASH_DEFAULT = INITIAL_CASH
from services.ibkr_trader import place_ibkr_order, get_ibkr_paper_account, test_ibkr_paper
from services.regime_detector import detect_regime, apply_regime_to_config
from services.institutional_signals import institutional_score_delta, get_institutional_signals_batch
from services.ml_scorer import ml_confidence_boost, models_status
from services.telegram_alerts import send_trade_alert, send_stop_alert, send_cycle_summary, send_risk_alert

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parents[1]
LOG_DB = BASE_DIR / "agent_decisions.sqlite3"

UNIVERSE = ["AMD", "NVDA", "NBIS", "SOFI", "MELI", "META", "GOOGL", "CRWV", "MSFT", "AAPL", "TSLA", "AMZN", "QQQ", "SPY"]

DEFAULT_CONFIG = {
    "enabled": False,
    "mode": "paper",
    "cycle_minutes": 15,
    "universe": UNIVERSE,
    "strategies": ["momentum", "mean_reversion", "breakout", "trend_follow"],
    "risk_per_trade_pct": 2.0,
    "max_position_pct": 20.0,
    "stop_loss_pct": 8.0,
    "daily_loss_limit_pct": 3.0,
    "vix_pause_threshold": 27.0,
    "min_confidence": 65,
    "auto_stop_loss": True,
    "auto_take_profit": True,
    "take_profit_pct": 15.0,
    "cut_loss_pct": 7.0,
    # Short selling
    "allow_shorts": True,
    "short_strategies": ["short_momentum", "short_breakdown"],
    "short_stop_pct": 8.0,       # cut if price rises 8% above short entry
    "short_profit_pct": 12.0,    # cover when price falls 12% (take profit)
    "min_short_confidence": 68,
    # Risk mode + trade style: AUTO = computed dynamically each cycle
    "risk_mode":   "AUTO",   # AUTO | AGGRESSIVE | NORMAL | CONSERVATIVE | DEFENSIVE
    "trade_style": "AUTO",   # AUTO | DAY_TRADE | SWING_TRADE | POSITION_TRADE
}


# ── Trade style parameters ────────────────────────────────────────────────────

TRADE_STYLE_PARAMS: Dict[str, Dict] = {
    "DAY_TRADE": {
        "stop_loss_pct":    1.5,
        "take_profit_pct":  2.5,
        "cut_loss_pct":     1.5,
        "short_stop_pct":   1.5,
        "short_profit_pct": 2.5,
        "max_hold_days":    1,
        "min_confidence":   72,
        "size_mult":        0.8,
        "description":      "Intraday/same-day: tight stops, quick targets — bear/crisis environment",
    },
    "SWING_TRADE": {
        "stop_loss_pct":    6.0,
        "take_profit_pct":  12.0,
        "cut_loss_pct":     6.0,
        "short_stop_pct":   7.0,
        "short_profit_pct": 12.0,
        "max_hold_days":    7,
        "min_confidence":   65,
        "size_mult":        1.0,
        "description":      "3-7 day holds, standard risk/reward — trending or normal market",
    },
    "POSITION_TRADE": {
        "stop_loss_pct":    10.0,
        "take_profit_pct":  22.0,
        "cut_loss_pct":     10.0,
        "short_stop_pct":   10.0,
        "short_profit_pct": 20.0,
        "max_hold_days":    30,
        "min_confidence":   70,
        "size_mult":        1.1,
        "description":      "2-4 week holds, wide stops — strong bull trend + aggressive risk mode",
    },
}

# (regime, risk_mode) → trade_style
_STYLE_MATRIX: Dict[tuple, str] = {
    ("BULL_TREND",   "AGGRESSIVE"):   "POSITION_TRADE",
    ("BULL_TREND",   "NORMAL"):       "SWING_TRADE",
    ("BULL_TREND",   "CONSERVATIVE"): "SWING_TRADE",
    ("BULL_TREND",   "DEFENSIVE"):    "DAY_TRADE",
    ("BEAR_TREND",   "AGGRESSIVE"):   "DAY_TRADE",
    ("BEAR_TREND",   "NORMAL"):       "DAY_TRADE",
    ("BEAR_TREND",   "CONSERVATIVE"): "DAY_TRADE",
    ("BEAR_TREND",   "DEFENSIVE"):    "DAY_TRADE",
    ("CHOPPY_RANGE", "AGGRESSIVE"):   "SWING_TRADE",
    ("CHOPPY_RANGE", "NORMAL"):       "SWING_TRADE",
    ("CHOPPY_RANGE", "CONSERVATIVE"): "DAY_TRADE",
    ("CHOPPY_RANGE", "DEFENSIVE"):    "DAY_TRADE",
    ("CRISIS",       "AGGRESSIVE"):   "DAY_TRADE",
    ("CRISIS",       "NORMAL"):       "DAY_TRADE",
    ("CRISIS",       "CONSERVATIVE"): "DAY_TRADE",
    ("CRISIS",       "DEFENSIVE"):    "DAY_TRADE",
}


def _log_db():
    conn = sqlite3.connect(LOG_DB, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS decisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            cycle_id TEXT NOT NULL,
            ticker TEXT,
            action TEXT NOT NULL,
            qty REAL,
            price REAL,
            confidence INTEGER,
            reasoning TEXT,
            executed INTEGER DEFAULT 0,
            execution_result TEXT,
            blocked_reason TEXT,
            trade_style TEXT
        )
    """)
    try:
        conn.execute("ALTER TABLE decisions ADD COLUMN trade_style TEXT")
    except Exception:
        pass  # column already exists
    conn.execute("""
        CREATE TABLE IF NOT EXISTS agent_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            level TEXT NOT NULL,
            message TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS trade_attribution (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL,
            strategy TEXT,
            tags TEXT,
            entry_ts TEXT,
            exit_ts TEXT,
            hold_days REAL,
            pnl_pct REAL,
            regime TEXT,
            trade_style TEXT,
            exit_reason TEXT
        )
    """)
    conn.commit()
    return conn


def _log(level: str, msg: str):
    ts = datetime.now(timezone.utc).isoformat()
    conn = _log_db()
    try:
        conn.execute("INSERT INTO agent_log(ts,level,message) VALUES(?,?,?)", (ts, level, msg))
        conn.commit()
    finally:
        conn.close()
    getattr(logger, level.lower(), logger.info)(msg)


def _save_decision(cycle_id: str, d: Dict[str, Any]):
    conn = _log_db()
    try:
        conn.execute(
            "INSERT INTO decisions(ts,cycle_id,ticker,action,qty,price,confidence,reasoning,executed,execution_result,blocked_reason,trade_style) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                datetime.now(timezone.utc).isoformat(),
                cycle_id,
                d.get("ticker"),
                d.get("action", "HOLD"),
                d.get("qty"),
                d.get("price"),
                d.get("confidence"),
                d.get("reasoning", ""),
                1 if d.get("executed") else 0,
                json.dumps(d.get("execution_result")) if d.get("execution_result") else None,
                d.get("blocked_reason"),
                d.get("trade_style"),
            ),
        )
        conn.commit()
    finally:
        conn.close()


def get_recent_decisions(limit: int = 50) -> List[Dict[str, Any]]:
    conn = _log_db()
    try:
        rows = conn.execute("SELECT * FROM decisions ORDER BY ts DESC LIMIT ?", (limit,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_agent_log(limit: int = 100) -> List[Dict[str, Any]]:
    conn = _log_db()
    try:
        rows = conn.execute("SELECT * FROM agent_log ORDER BY ts DESC LIMIT ?", (limit,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# ── Risk mode & trade style helpers ──────────────────────────────────────────

def _degrade_mode(mode: str, steps: int = 1) -> str:
    _ORDER = ["AGGRESSIVE", "NORMAL", "CONSERVATIVE", "DEFENSIVE"]
    idx = _ORDER.index(mode) if mode in _ORDER else 1
    return _ORDER[min(idx + steps, len(_ORDER) - 1)]


def _upgrade_mode(mode: str) -> str:
    _ORDER = ["AGGRESSIVE", "NORMAL", "CONSERVATIVE", "DEFENSIVE"]
    idx = _ORDER.index(mode) if mode in _ORDER else 1
    return _ORDER[max(idx - 1, 0)]


def _determine_risk_mode(vix: float, drawdown_pct: float, recent_win_rate: float) -> str:
    """Compute risk mode from market fear (VIX), portfolio drawdown, and recent win rate."""
    if vix >= 28:
        return "DEFENSIVE"
    if vix < 15:
        base = "AGGRESSIVE"
    elif vix < 20:
        base = "NORMAL"
    else:
        base = "CONSERVATIVE"
    if drawdown_pct >= 10:
        base = _degrade_mode(base, 2)
    elif drawdown_pct >= 5:
        base = _degrade_mode(base, 1)
    if recent_win_rate < 0.35:
        base = _degrade_mode(base, 1)
    elif recent_win_rate > 0.65:
        base = _upgrade_mode(base)
    return base


def _get_trade_style(regime: str, risk_mode: str) -> str:
    """Map (market regime, risk mode) → trade style."""
    return _STYLE_MATRIX.get((regime, risk_mode), "SWING_TRADE")


def _get_recent_win_rate(n: int = 10) -> float:
    """Win rate from last N closed paper trades. Returns 0.5 if no history."""
    try:
        from services.paper_trading import get_trade_history
        trades = get_trade_history(limit=n * 3)
        closed = [t for t in trades if t.get("closed") and t.get("pnl") is not None][-n:]
        if not closed:
            return 0.5
        return sum(1 for t in closed if t["pnl"] > 0) / len(closed)
    except Exception:
        return 0.5


def _beta_size_mult(beta: Optional[float]) -> float:
    """Reduce position size for high-beta tickers to normalize risk exposure."""
    if beta is None:
        return 1.0
    if beta > 2.0:
        return 0.5
    if beta > 1.5:
        return round(1.0 / beta, 3)
    if beta > 1.2:
        return 0.85
    return 1.0


def _extract_indicator_tags(reasoning: str) -> str:
    """Parse reasoning string into comma-separated indicator tags for attribution."""
    keywords = {
        "MACD": "macd", "RSI": "rsi", "VWAP": "vwap", "BB": "bb",
        "SMA": "sma", "trend": "trend", "momentum": "momentum",
        "breakout": "breakout", "mean-rev": "mean_rev", "zscore": "zscore",
        "z=": "zscore", "ADX": "adx", "RS=": "rel_strength",
        "earnings": "earnings", "news": "news", "institutional": "institutional",
        "52w": "52w_pos",
    }
    tags = set()
    r = reasoning.lower()
    for kw, tag in keywords.items():
        if kw.lower() in r:
            tags.add(tag)
    return ",".join(sorted(tags)) or "none"


def _record_attribution(
    ticker: str, strategy: str, entry_ts: str, exit_ts: str,
    pnl_pct: float, regime: str, trade_style: str,
    exit_reason: str, entry_reasoning: str,
):
    """Persist trade attribution row for post-hoc performance analysis."""
    try:
        tags = _extract_indicator_tags(entry_reasoning)
        hold_days = 0.0
        if entry_ts and exit_ts:
            try:
                e = datetime.fromisoformat(entry_ts.replace("Z", "+00:00"))
                x = datetime.fromisoformat(exit_ts.replace("Z", "+00:00"))
                hold_days = round((x - e).total_seconds() / 86400, 3)
            except Exception:
                pass
        conn = _log_db()
        try:
            conn.execute(
                """INSERT INTO trade_attribution
                   (ticker,strategy,tags,entry_ts,exit_ts,hold_days,pnl_pct,regime,trade_style,exit_reason)
                   VALUES(?,?,?,?,?,?,?,?,?,?)""",
                (ticker, strategy, tags, entry_ts, exit_ts, hold_days,
                 round(pnl_pct, 4), regime, trade_style, exit_reason[:200]),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception:
        pass


def get_attribution_stats(limit: int = 200) -> Dict[str, Any]:
    """Per-tag and per-strategy win rates from the attribution log."""
    conn = _log_db()
    try:
        rows = conn.execute(
            "SELECT * FROM trade_attribution ORDER BY exit_ts DESC LIMIT ?", (limit,)
        ).fetchall()
    finally:
        conn.close()
    records = [dict(r) for r in rows]
    if not records:
        return {"records": [], "by_tag": {}, "by_strategy": {}}

    by_tag: Dict[str, Dict] = {}
    by_strat: Dict[str, Dict] = {}
    for r in records:
        pnl = r.get("pnl_pct") or 0.0
        win = pnl > 0
        for tag in (r.get("tags") or "").split(","):
            tag = tag.strip()
            if not tag or tag == "none":
                continue
            s = by_tag.setdefault(tag, {"wins": 0, "losses": 0, "total_pnl": 0.0})
            s["wins" if win else "losses"] += 1
            s["total_pnl"] += pnl
        strat = r.get("strategy") or "unknown"
        s = by_strat.setdefault(strat, {"wins": 0, "losses": 0, "total_pnl": 0.0})
        s["wins" if win else "losses"] += 1
        s["total_pnl"] += pnl

    for d in list(by_tag.values()) + list(by_strat.values()):
        total = d["wins"] + d["losses"]
        d["win_rate"] = round(d["wins"] / total, 3) if total else 0.0
        d["avg_pnl"] = round(d["total_pnl"] / total, 4) if total else 0.0

    return {"records": records[:50], "by_tag": by_tag, "by_strategy": by_strat}


# ── Rule-based signal engine ──────────────────────────────────────────────────

def _macd_adj(q: Dict) -> tuple[int, str]:
    """MACD crossover + histogram direction."""
    score = 0
    reasons = []
    if q.get("macd_bullish_daily"):
        score += 10
        reasons.append("MACD bullish daily")
    if q.get("macd_crossover_daily"):
        score += 18
        reasons.append("MACD daily bullish crossover")
    elif q.get("macd_crossunder_daily"):
        score -= 18
        reasons.append("MACD daily bearish crossunder")
    if q.get("macd_hist_rising_daily"):
        score += 8
        reasons.append("MACD hist rising")
    # Intraday MACD confirmation
    if q.get("macd_bullish") and q.get("macd_hist_rising"):
        score += 8
        reasons.append("MACD intraday bullish+rising")
    elif q.get("macd_crossover"):
        score += 12
        reasons.append("MACD intraday crossover")
    return score, ", ".join(reasons)


def _bb_adj(q: Dict) -> tuple[int, str]:
    """Bollinger Band position — breakout vs. mean-reversion signals."""
    score = 0
    reasons = []
    # Daily Bollinger
    if q.get("bb_squeeze_daily"):
        score += 8
        reasons.append("BB squeeze (breakout loading)")
    if q.get("near_bb_lower_daily"):
        score += 10
        reasons.append("near daily lower BB (oversold zone)")
    if q.get("near_bb_upper_daily"):
        score -= 8
        reasons.append("near daily upper BB (extended)")
    if q.get("above_bb_upper_daily"):
        score -= 15
        reasons.append("above daily BB upper (overextended)")
    # Intraday Bollinger
    if q.get("bb_squeeze"):
        score += 5
        reasons.append("intraday BB squeeze")
    return score, ", ".join(reasons)


def _vwap_adj(q: Dict) -> tuple[int, str]:
    """VWAP position: above = institutional buying, below = selling pressure."""
    above = q.get("above_vwap")
    pct = q.get("vwap_pct", 0) or 0
    if above is None:
        return 0, ""
    if above and pct >= 0.3:
        return 12, f"above VWAP +{pct:.1f}%"
    if above:
        return 5, "above VWAP"
    if not above and pct <= -0.3:
        return -10, f"below VWAP {pct:.1f}%"
    return -4, "below VWAP"


def _zscore_adj(q: Dict) -> tuple[int, str]:
    """Z-score mean-reversion signal: extreme values suggest price will revert."""
    zd = q.get("zscore_daily")
    zi = q.get("zscore")
    z = zd if zd is not None else zi
    if z is None:
        return 0, ""
    if z <= -2.0:
        return 20, f"z={z:.1f} deeply oversold (mean-rev buy)"
    if z <= -1.5:
        return 12, f"z={z:.1f} oversold"
    if z >= 2.0:
        return -15, f"z={z:.1f} deeply overbought"
    if z >= 1.5:
        return -8, f"z={z:.1f} extended"
    return 0, ""


def _earnings_adj(ticker: str) -> tuple[int, str]:
    """Pre-earnings drift bonus + post-earnings PEAD bonus."""
    score = 0
    reasons = []
    ps, pr = pre_earnings_signal(ticker)
    if ps:
        score += ps
        reasons.append(pr)
    pd, pdr = pead_signal(ticker)
    if pd:
        score += pd
        reasons.append(pdr)
    return score, ", ".join(reasons)


def _fundamental_adj_fn(fundamentals: Dict, ticker: str) -> tuple[int, str]:
    """Wrap fundamental_adj for use inside scorer lambdas."""
    return fundamental_adj(fundamentals, ticker)


def _news_adj(q: Dict, news: Dict, ticker: str) -> tuple[int, str]:
    """Add news sentiment + catalyst bonus from pre-scored news dict."""
    delta, reason = sentiment_boost(news, ticker)
    return delta, reason


def _institutional_adj(ticker: str) -> tuple[int, str]:
    """Institutional flow signal: insider buys, analyst consensus, short squeeze."""
    return institutional_score_delta(ticker)


def _multi_tf_adj(q: Dict) -> tuple[int, str]:
    """Multi-timeframe: daily trend + ADX + golden cross."""
    score = 0
    reasons = []
    td = q.get("trend_direction")
    if td == "UP":
        score += 15
        reasons.append(f"5d trend UP ({q.get('trend_5d_pct',0):+.1f}%)")
    elif td == "DOWN":
        score -= 15
        reasons.append(f"5d trend DOWN ({q.get('trend_5d_pct',0):+.1f}%)")
    if q.get("golden_cross"):
        score += 10
        reasons.append("SMA20>SMA50 golden cross")
    if q.get("above_sma50_daily") and q.get("above_sma20_daily"):
        score += 8
        reasons.append("above both SMA20+SMA50")
    if q.get("strong_trend") and q.get("adx"):
        score += 12
        reasons.append(f"ADX={q['adx']:.0f} strong trend")
    return score, ", ".join(reasons)


def _rs_adj(q: Dict) -> tuple[int, str]:
    """Relative strength vs SPY."""
    rs = q.get("rs_vs_spy")
    if rs is None:
        return 0, ""
    if rs >= 1.5:
        return 15, f"RS={rs:.1f}x SPY (leader)"
    if rs >= 1.1:
        return 8,  f"RS={rs:.1f}x SPY (outperform)"
    if rs <= 0.5:
        return -12, f"RS={rs:.1f}x SPY (laggard)"
    return 0, ""


def _52w_adj(q: Dict) -> tuple[int, str]:
    """52-week position bonus/penalty."""
    pct = q.get("pct_from_52w_high")
    if pct is None:
        return 0, ""
    if q.get("near_52w_high"):
        return 12, "near 52w high (strength)"
    if q.get("near_52w_low"):
        return -10, "near 52w low (caution)"
    if pct < 15:
        return 8, f"{pct:.0f}% from 52w high"
    return 0, ""


def _score_momentum(q: Dict, macro: Dict, news: Dict = {}, fundamentals: Dict = {}) -> tuple[int, str]:
    score = 0
    reasons = []
    if q.get("above_sma20"):
        score += 20; reasons.append("above SMA20")
    rvol = q.get("rvol", 1.0) or 1.0
    if rvol >= 2.0:
        score += 25; reasons.append(f"RVOL={rvol:.1f} strong")
    elif rvol >= 1.3:
        score += 15; reasons.append(f"RVOL={rvol:.1f} elevated")
    chg = q.get("change_pct", 0) or 0
    if chg >= 2.0:   score += 20; reasons.append(f"+{chg:.1f}% day")
    elif chg >= 0.8: score += 10; reasons.append(f"+{chg:.1f}% day")
    rsi = q.get("rsi")
    if rsi is not None:
        if 52 <= rsi <= 68: score += 15; reasons.append(f"RSI={rsi}")
        elif rsi > 75:      score -= 20; reasons.append(f"RSI={rsi} overbought")
    if not macro.get("hostile"):
        score += 10; reasons.append("macro OK")
    for adj_fn in [
        lambda: _multi_tf_adj(q), lambda: _rs_adj(q), lambda: _52w_adj(q),
        lambda: _macd_adj(q), lambda: _vwap_adj(q),
    ]:
        d, r = adj_fn()
        score += d
        if r: reasons.append(r)
    ticker = q.get("ticker", "")
    nd, nr = _news_adj(q, news, ticker)
    score += nd
    if nr: reasons.append(nr)
    fd, fr = _fundamental_adj_fn(fundamentals, ticker)
    score += fd
    if fr: reasons.append(fr)
    ed, er = _earnings_adj(ticker)
    score += ed
    if er: reasons.append(er)
    isd, isr = _institutional_adj(ticker)
    score += isd
    if isr: reasons.append(isr)
    return score, "Momentum: " + ", ".join(reasons)


def _score_mean_reversion(q: Dict, macro: Dict, news: Dict = {}, fundamentals: Dict = {}) -> tuple[int, str]:
    score = 0; reasons = []
    rsi = q.get("rsi")
    if rsi is None: return 0, "no RSI"
    if rsi <= 30:        score += 40; reasons.append(f"RSI={rsi} oversold")
    elif rsi <= 38:      score += 25; reasons.append(f"RSI={rsi} weak")
    else: return 0, "RSI not oversold"
    if not q.get("above_sma20"):
        score += 15; reasons.append("below SMA20")
    chg = q.get("change_pct", 0) or 0
    if chg < -2.0: score += 15; reasons.append(f"{chg:.1f}% pullback")
    if macro.get("hostile"): score -= 30; reasons.append("macro hostile")
    if q.get("near_52w_low"): score += 10; reasons.append("near 52w low — high reversion potential")
    rs = q.get("rs_vs_spy")
    if rs is not None and rs > 0.8: score += 8; reasons.append("RS holding vs SPY")
    # Z-score is core to mean reversion
    zd, zr = _zscore_adj(q)
    score += zd
    if zr: reasons.append(zr)
    # Near lower Bollinger Band = strong oversold confirmation
    bbd, bbr = _bb_adj(q)
    score += bbd
    if bbr: reasons.append(bbr)
    ticker = q.get("ticker", "")
    nd, nr = _news_adj(q, news, ticker)
    if nd < 0: score += abs(nd) * 0.3  # contrarian credit: bad news → oversold buy
    elif nd > 0: score += nd
    if nr: reasons.append(nr)
    # Fundamentals matter most for mean reversion: cheap P/E + FCF = real value
    fd, fr = _fundamental_adj_fn(fundamentals, ticker)
    score += fd
    if fr: reasons.append(fr)
    isd, isr = _institutional_adj(ticker)
    score += isd
    if isr: reasons.append(isr)
    return score, "MeanRev: " + ", ".join(reasons)


def _score_breakout(q: Dict, macro: Dict, news: Dict = {}, fundamentals: Dict = {}) -> tuple[int, str]:
    score = 0; reasons = []
    rvol = q.get("rvol", 1.0) or 1.0
    chg  = q.get("change_pct", 0) or 0
    rsi  = q.get("rsi") or 50
    if rvol < 1.8 or chg < 1.5: return 0, "no breakout"
    score += 30; reasons.append(f"RVOL={rvol:.1f} + {chg:+.1f}%")
    if q.get("above_sma20"): score += 20; reasons.append("above SMA20")
    if rsi < 72: score += 15; reasons.append(f"RSI={rsi} not exhausted")
    else:        score -= 10; reasons.append(f"RSI={rsi} extended")
    if "RISK_ON" in macro.get("regime", ""):
        score += 15; reasons.append(f"regime={macro.get('regime')}")
    if q.get("strong_trend") and q.get("trend_direction") == "UP":
        score += 12; reasons.append(f"ADX={q.get('adx',0):.0f} trend confirming")
    if q.get("near_52w_high"): score += 10; reasons.append("near 52w high breakout")
    if q.get("bb_squeeze") or q.get("bb_squeeze_daily"):
        score += 10; reasons.append("BB squeeze — volume breakout setup")
    if q.get("macd_crossover") or q.get("macd_crossover_daily"):
        score += 15; reasons.append("MACD crossover confirms breakout")
    if q.get("above_vwap"): score += 8; reasons.append("above VWAP")
    d, r = _rs_adj(q); score += d
    if r: reasons.append(r)
    ticker = q.get("ticker", "")
    nd, nr = _news_adj(q, news, ticker)
    score += nd
    if nr: reasons.append(nr)
    fd, fr = _fundamental_adj_fn(fundamentals, ticker)
    score += fd
    if fr: reasons.append(fr)
    isd, isr = _institutional_adj(ticker)
    score += isd
    if isr: reasons.append(isr)
    return score, "Breakout: " + ", ".join(reasons)


def _score_trend_follow(q: Dict, macro: Dict, news: Dict = {}, fundamentals: Dict = {}) -> tuple[int, str]:
    score = 0; reasons = []
    if not q.get("above_sma20"): return 0, "below SMA20"
    score += 20
    chg = q.get("change_pct", 0) or 0
    rsi = q.get("rsi") or 50
    if 0.2 <= chg <= 2.5: score += 20; reasons.append(f"{chg:+.1f}% steady")
    if 45 <= rsi <= 65:   score += 20; reasons.append(f"RSI={rsi}")
    rvol = q.get("rvol", 1.0) or 1.0
    if rvol >= 1.0: score += 10; reasons.append(f"RVOL={rvol:.1f}")
    regime = macro.get("regime", "NEUTRAL")
    if "RISK_ON" in regime:   score += 15; reasons.append(f"regime={regime}")
    elif "RISK_OFF" in regime: score -= 25; reasons.append("risk-off")
    for adj_fn in [
        lambda: _multi_tf_adj(q), lambda: _rs_adj(q),
        lambda: _macd_adj(q), lambda: _vwap_adj(q),
    ]:
        d, r = adj_fn(); score += d
        if r: reasons.append(r)
    ticker = q.get("ticker", "")
    nd, nr = _news_adj(q, news, ticker)
    score += nd
    if nr: reasons.append(nr)
    fd, fr = _fundamental_adj_fn(fundamentals, ticker)
    score += fd
    if fr: reasons.append(fr)
    isd, isr = _institutional_adj(ticker)
    score += isd
    if isr: reasons.append(isr)
    return score, "Trend: above SMA20, " + ", ".join(reasons)


# ── Short signal scorers ──────────────────────────────────────────────────────

def _score_short_momentum(q: Dict, macro: Dict, news: Dict = {}) -> tuple[int, str]:
    """Short momentum: overbought RSI + negative day + elevated volume."""
    score = 0
    reasons = []
    rsi = q.get("rsi") or 50
    chg = q.get("change_pct", 0) or 0
    rvol = q.get("rvol", 1.0) or 1.0

    if rsi >= 78:
        score += 35
        reasons.append(f"RSI={rsi} extremely overbought")
    elif rsi >= 72:
        score += 20
        reasons.append(f"RSI={rsi} overbought")
    else:
        return 0, "RSI not overbought"

    if chg <= -1.5:
        score += 25
        reasons.append(f"{chg:.1f}% reversal day")
    elif chg <= -0.5:
        score += 12
        reasons.append(f"{chg:.1f}% negative day")

    if rvol >= 1.5:
        score += 15
        reasons.append(f"RVOL={rvol:.1f} high volume")

    if not q.get("above_sma20"):
        score += 10
        reasons.append("broke below SMA20")

    regime = macro.get("regime", "NEUTRAL")
    if "RISK_OFF" in regime:
        score += 15
        reasons.append(f"regime={regime}")
    elif "RISK_ON_STRONG" in regime:
        score -= 20
        reasons.append("strong bull regime — penalized")

    # Multi-tf: downtrend + death cross confirm short
    td = q.get("trend_direction")
    if td == "DOWN":
        score += 12
        reasons.append(f"5d trend DOWN ({q.get('trend_5d_pct', 0):+.1f}%)")
    if not q.get("golden_cross") and not q.get("above_sma50_daily"):
        score += 8
        reasons.append("below SMA50 — bearish structure")
    if q.get("strong_trend") and td == "DOWN":
        score += 10
        reasons.append(f"ADX={q.get('adx', 0):.0f} strong downtrend")

    # RS: lagging SPY is a short candidate
    rs = q.get("rs_vs_spy")
    if rs is not None and rs <= 0.5:
        score += 12
        reasons.append(f"RS={rs:.1f}x SPY (laggard)")

    # News: bearish news confirms short; bullish news penalizes
    ticker = q.get("ticker", "")
    nd, nr = _news_adj(q, news, ticker)
    score -= nd  # invert: bearish news (negative nd) strengthens short
    if nr:
        reasons.append(nr)

    return score, "SHORT-Momentum: " + ", ".join(reasons)


def _score_short_breakdown(q: Dict, macro: Dict, news: Dict = {}) -> tuple[int, str]:
    """Short breakdown: price breaks below SMA20 with volume + macro risk-off."""
    score = 0
    reasons = []
    chg = q.get("change_pct", 0) or 0
    rvol = q.get("rvol", 1.0) or 1.0
    rsi = q.get("rsi") or 50

    if q.get("above_sma20"):
        return 0, "still above SMA20"

    score += 20
    reasons.append("below SMA20 breakdown")

    if chg <= -2.0:
        score += 25
        reasons.append(f"{chg:.1f}% strong sell-off")
    elif chg <= -0.8:
        score += 12
        reasons.append(f"{chg:.1f}% negative day")

    if rvol >= 1.8:
        score += 20
        reasons.append(f"RVOL={rvol:.1f} volume confirms")

    if rsi <= 45:
        score += 10
        reasons.append(f"RSI={rsi} weak momentum")

    regime = macro.get("regime", "NEUTRAL")
    if "RISK_OFF" in regime:
        score += 20
        reasons.append(f"regime={regime}")
    elif macro.get("hostile"):
        score += 15
        reasons.append("hostile macro")

    vix = macro.get("vix", 18)
    if vix > 22:
        score += 10
        reasons.append(f"VIX={vix} elevated fear")

    # Multi-tf daily confirmation
    td = q.get("trend_direction")
    if td == "DOWN":
        score += 12
        reasons.append(f"5d trend DOWN ({q.get('trend_5d_pct', 0):+.1f}%)")
    if not q.get("above_sma50_daily"):
        score += 8
        reasons.append("below daily SMA50")
    if q.get("near_52w_low"):
        score -= 8
        reasons.append("near 52w low — caution (may bounce)")

    # RS laggard confirms breakdown
    rs = q.get("rs_vs_spy")
    if rs is not None and rs <= 0.6:
        score += 10
        reasons.append(f"RS={rs:.1f}x SPY underperforming")

    # Bearish news confirms breakdown
    ticker = q.get("ticker", "")
    nd, nr = _news_adj(q, news, ticker)
    score -= nd  # invert sign: negative nd = bearish news = helps short
    if nr:
        reasons.append(nr)

    return score, "SHORT-Breakdown: " + ", ".join(reasons)


LONG_STRATEGY_FNS = {
    "momentum": _score_momentum,
    "mean_reversion": _score_mean_reversion,
    "breakout": _score_breakout,
    "trend_follow": _score_trend_follow,
}

SHORT_STRATEGY_FNS = {
    "short_momentum": _score_short_momentum,
    "short_breakdown": _score_short_breakdown,
}

_CLOSE_PRIORITY = {"SELL": 0, "COVER": 0, "BUY": 1, "SHORT": 2}


def _decide_for_ticker(
    ticker: str,
    q: Dict,
    macro: Dict,
    open_longs: List[Dict],
    open_shorts: List[Dict],
    config: Dict,
    news: Dict = {},
    fundamentals: Dict = {},
) -> List[Dict[str, Any]]:
    if not q.get("ok") or not q.get("price"):
        return []
    price = q["price"]
    decisions = []

    # ── Manage open LONG ──────────────────────────────────────────────────────
    long_pos = next((p for p in open_longs if p["ticker"] == ticker), None)
    if long_pos:
        avg = long_pos.get("avg_price", price)
        pnl_pct = (price - avg) / avg * 100 if avg else 0
        if pnl_pct >= config.get("take_profit_pct", 15.0):
            decisions.append({"action": "SELL", "ticker": ticker, "qty": long_pos["qty"], "price": price,
                              "confidence": 85, "reasoning": f"Long take-profit: +{pnl_pct:.1f}%"})
        elif pnl_pct <= -config.get("cut_loss_pct", 7.0):
            decisions.append({"action": "SELL", "ticker": ticker, "qty": long_pos["qty"], "price": price,
                              "confidence": 93, "reasoning": f"Long cut-loss: {pnl_pct:.1f}%"})

    # ── Manage open SHORT ─────────────────────────────────────────────────────
    short_pos = next((p for p in open_shorts if p["ticker"] == ticker), None)
    if short_pos:
        avg = short_pos.get("avg_price", price)
        # Short P&L: profit when price falls below entry
        pnl_pct = (avg - price) / avg * 100 if avg else 0
        if pnl_pct >= config.get("short_profit_pct", 12.0):
            decisions.append({"action": "COVER", "ticker": ticker, "qty": short_pos["qty"], "price": price,
                              "confidence": 85, "reasoning": f"Short take-profit: +{pnl_pct:.1f}% (price fell)"})
        elif pnl_pct <= -config.get("short_stop_pct", 8.0):
            decisions.append({"action": "COVER", "ticker": ticker, "qty": short_pos["qty"], "price": price,
                              "confidence": 95, "reasoning": f"Short stop-loss: {pnl_pct:.1f}% (price rose against us)"})

    # If already managing this ticker, don't open new entries
    if long_pos or short_pos:
        return decisions

    # ── Look for new LONG entry ───────────────────────────────────────────────
    vix_too_high = macro.get("vix", 0) > config.get("vix_pause_threshold", 27)
    if not (macro.get("hostile") and vix_too_high):
        long_strategies = config.get("strategies", ["momentum", "mean_reversion"])
        best_score, best_reason, best_strat = 0, "", "unknown"
        all_long_scores: Dict[str, int] = {}
        for strat in long_strategies:
            fn = LONG_STRATEGY_FNS.get(strat)
            if fn:
                score, reason = fn(q, macro, news, fundamentals)
                all_long_scores[strat] = min(int(score * 1.1), 99)
                if score > best_score:
                    best_score, best_reason, best_strat = score, reason, strat
        confidence = min(int(best_score * 1.1), 99)
        # Cross-strategy consensus boost
        try:
            from services.ml_scorer import cross_strategy_consensus_boost
            bonus, bonus_reason = cross_strategy_consensus_boost(all_long_scores, is_short=False)
            if bonus:
                confidence = min(99, confidence + bonus)
                best_reason = f"{best_reason} | {bonus_reason}"
        except Exception:
            pass
        if confidence >= config.get("min_confidence", 65):
            decisions.append({"action": "BUY", "ticker": ticker, "qty": None, "price": price,
                              "confidence": confidence, "reasoning": best_reason, "strategy": best_strat})

    # ── Look for new SHORT entry ──────────────────────────────────────────────
    if config.get("allow_shorts", True):
        short_strategies = config.get("short_strategies", ["short_momentum", "short_breakdown"])
        best_score, best_reason, best_strat = 0, "", "unknown"
        all_short_scores: Dict[str, int] = {}
        for strat in short_strategies:
            fn = SHORT_STRATEGY_FNS.get(strat)
            if fn:
                score, reason = fn(q, macro, news)
                all_short_scores[strat] = min(int(score * 1.1), 99)
                if score > best_score:
                    best_score, best_reason, best_strat = score, reason, strat
        confidence = min(int(best_score * 1.1), 99)
        # Cross-strategy consensus boost for shorts
        try:
            from services.ml_scorer import cross_strategy_consensus_boost
            bonus, bonus_reason = cross_strategy_consensus_boost(all_short_scores, is_short=True)
            if bonus:
                confidence = min(99, confidence + bonus)
                best_reason = f"{best_reason} | {bonus_reason}"
        except Exception:
            pass
        if confidence >= config.get("min_short_confidence", 68):
            decisions.append({"action": "SHORT", "ticker": ticker, "qty": None, "price": price,
                              "confidence": confidence, "reasoning": best_reason, "strategy": best_strat})

    return decisions


def generate_decisions(
    quotes: Dict[str, Dict],
    macro: Dict,
    open_longs: List[Dict],
    open_shorts: List[Dict],
    config: Dict,
    news: Dict = {},
    fundamentals: Dict = {},
) -> List[Dict[str, Any]]:
    all_decisions = []
    for ticker, q in quotes.items():
        all_decisions.extend(_decide_for_ticker(ticker, q, macro, open_longs, open_shorts, config, news, fundamentals))
    # Closes first (SELL/COVER), then new entries by confidence desc
    all_decisions.sort(key=lambda d: (_CLOSE_PRIORITY.get(d["action"], 3), -d.get("confidence", 0)))
    return all_decisions[:10]


# ── Agent loop ────────────────────────────────────────────────────────────────

class AutonomousAgent:
    def __init__(self):
        self.config: Dict[str, Any] = {**DEFAULT_CONFIG}
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._cycle_count = 0
        self._last_cycle_ts: Optional[str] = None
        self._last_cycle_summary: Optional[Dict[str, Any]] = None
        self._risk = RiskManager()
        self._peak_value: float = 0.0
        self._fundamentals_cache: Dict[str, Any] = {}
        self._fundamentals_last_fetch: float = 0.0
        self._earnings_last_fetch: float = 0.0
        self._trailing_stops: Dict[str, float] = {}  # ticker → highest price seen since entry
        self._regime_cache: Optional[Dict[str, Any]] = None
        self._regime_last_fetch: float = 0.0
        self._institutional_last_fetch: float = 0.0
        self._returns_cache: Dict[str, Any] = {}  # for correlation penalty
        self._position_strategies: Dict[str, str] = {}  # ticker → opening strategy
        # Daily P&L tracking for circuit breaker
        self._day_start_value: float = 0.0
        self._last_day: Optional[str] = None
        self._circuit_broken: bool = False  # True = daily loss limit hit, block new entries
        self._last_regime_name: Optional[str] = None  # for regime-change alerts
        self._last_risk_mode: Optional[str] = None
        self._current_trade_style: str = "SWING_TRADE"
        self._current_risk_mode: str = "NORMAL"
        # Trade management state
        self._partial_exits: Dict[str, bool] = {}       # ticker → partial profit taken
        self._breakeven_stops: Dict[str, float] = {}    # ticker → breakeven price after partial exit
        self._stop_out_times: Dict[str, float] = {}     # ticker → unix ts of last stop-out
        self._entry_reasoning: Dict[str, str] = {}      # ticker → reasoning at entry (for attribution)
        # Enhancement: dynamic position sizing & trailing stops
        self._intraday_high_value: float = 0.0           # session high portfolio value
        self._intraday_dd_limit_pct: float = 2.0         # intraday drawdown circuit breaker
        self._trailing_stop_pct: float = 3.0             # trailing stop as % below high
        self._sector_max_pct: float = 25.0               # max sector concentration
        self._position_entry_highs: Dict[str, float] = {} # ticker → highest price since entry (for trailing)
        self._position_entry_lows: Dict[str, float] = {}  # ticker → lowest price since entry (for shorts)
        self._last_ml_train_ts: float = 0.0  # unix timestamp of last model training (for 3-day refresh)
        self._ml_refresh_days: int = 3  # retrain models every N days if accuracy drops

    def configure(self, updates: Dict[str, Any]) -> Dict[str, Any]:
        self.config.update(updates)
        risk_cfg = {k: self.config[k] for k in ["max_position_pct", "stop_loss_pct", "daily_loss_limit_pct", "vix_pause_threshold"] if k in self.config}
        self._risk = RiskManager(risk_cfg)
        return self.config

    def start(self) -> Dict[str, Any]:
        if self._running:
            return {"ok": False, "message": "Agent already running"}
        self._running = True
        self._circuit_broken = False
        try:
            loop = asyncio.get_running_loop()
            self._task = loop.create_task(self._run_loop())
            alert_task = loop.create_task(send_risk_alert("🟢 Agent STARTED | Mode={} | Cycle={}m | News={}".format(
                self.config['mode'], self.config['cycle_minutes'],
                "finnhub"  # simplified for now
            )))
        except RuntimeError:
            self._task = asyncio.ensure_future(self._run_loop())
        from services.ai_news_scorer import get_active_provider_name
        from services.finnhub_sentiment import is_available as fh_ok
        news_provider = get_active_provider_name() or ("finnhub" if fh_ok() else "keyword-only")
        _log("info", f"Agent started. Mode={self.config['mode']}, Cycle={self.config['cycle_minutes']}m, NewsProvider={news_provider}, Strategies={self.config['strategies']}")
        return {"ok": True, "message": "Agent started", "config": self.config, "news_provider": news_provider}

    def stop(self) -> Dict[str, Any]:
        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None
        _log("info", "Agent stopped.")
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(send_risk_alert("🔴 Agent STOPPED"))
        except RuntimeError:
            pass
        return {"ok": True, "message": "Agent stopped"}

    def status(self) -> Dict[str, Any]:
        return {
            "running": self._running,
            "mode": self.config["mode"],
            "engine": "rule-based + ML + regime-aware",
            "cycle_count": self._cycle_count,
            "last_cycle": self._last_cycle_ts,
            "last_summary": self._last_cycle_summary,
            "config": self.config,
            "paper_portfolio": get_portfolio_summary(),
            "ml_models": models_status(),
            "regime": self._regime_cache,
            "risk_mode": self._current_risk_mode,
            "trade_style": self._current_trade_style,
            "trade_style_params": TRADE_STYLE_PARAMS.get(self._current_trade_style, {}),
        }

    async def _run_loop(self):
        _log("info", "Agent loop running.")
        while self._running:
            try:
                await self._run_cycle()
            except asyncio.CancelledError:
                break
            except Exception as e:
                _log("error", f"Cycle error: {e}")
            await asyncio.sleep(self.config.get("cycle_minutes", 15) * 60)

    async def _run_cycle(self):
        self._cycle_count += 1
        cycle_id = f"c{self._cycle_count}_{datetime.now(timezone.utc).strftime('%H%M%S')}"
        _log("info", f"[{cycle_id}] Cycle start")

        universe = self.config.get("universe", UNIVERSE)

        import time as _time
        from datetime import datetime as _dt, timezone as _tz

        # ── Time-of-day filter: avoid first 30 min and last 15 min of US session ──
        now_utc = _dt.now(_tz.utc)
        try:
            from zoneinfo import ZoneInfo
            now_et = now_utc.astimezone(ZoneInfo("America/New_York"))
        except Exception:
            from datetime import timedelta as _td
            # Rough DST heuristic: EDT (UTC-4) March–Nov, EST (UTC-5) otherwise
            _offset = -4 if 3 <= now_utc.month <= 10 else -5
            now_et = now_utc + _td(hours=_offset)
        now_et_hour = now_et.hour
        now_et_min  = now_et.minute
        market_open = now_et_hour == 9 and now_et_min < 30    # 9:00-9:30 ET
        market_close = now_et_hour == 15 and now_et_min >= 30  # 15:30+ ET — no new entries
        # Force-close all positions at 15:45 when running in DAY_TRADE mode
        day_trade_eod = (
            now_et_hour == 15 and now_et_min >= 45
            and self._current_trade_style == "DAY_TRADE"
        )
        avoid_new_entries = market_open or market_close
        if avoid_new_entries:
            _log("info", f"[{cycle_id}] Time filter: avoiding new entries (open/close window)")

        # Refresh fundamentals every 6 hours (they don't change cycle-to-cycle)
        if _time.time() - self._fundamentals_last_fetch > 21600:
            try:
                self._fundamentals_cache = await fetch_fundamentals_batch(universe)
                self._fundamentals_last_fetch = _time.time()
                _log("info", f"[{cycle_id}] Fundamentals refreshed for {len(self._fundamentals_cache)} tickers")
            except Exception as e:
                _log("warning", f"[{cycle_id}] Fundamentals fetch failed: {e}")
        fundamentals = self._fundamentals_cache

        # Fetch enhanced market data + macro + news concurrently
        quotes, macro, news, sectors = await asyncio.gather(
            fetch_enhanced_quotes(universe),
            fetch_macro(),
            score_news_best(universe),
            fetch_sector_momentum(),
            return_exceptions=True,
        )
        # Gracefully handle failures in non-critical data sources
        if isinstance(quotes, Exception):
            _log("error", f"[{cycle_id}] fetch_enhanced_quotes failed: {quotes}"); return
        if isinstance(macro, Exception):
            _log("error", f"[{cycle_id}] fetch_macro failed: {macro}"); return
        if isinstance(news, Exception):
            _log("warning", f"[{cycle_id}] score_news failed: {news}"); news = {}
        if isinstance(sectors, Exception):
            _log("warning", f"[{cycle_id}] fetch_sector_momentum failed: {sectors}"); sectors = {}

        # Refresh earnings calendar every 6 hours
        if _time.time() - self._earnings_last_fetch > 21600:
            try:
                await refresh_calendar(universe)
                self._earnings_last_fetch = _time.time()
                _log("info", f"[{cycle_id}] Earnings calendar refreshed")
            except Exception as e:
                _log("warning", f"[{cycle_id}] Earnings calendar failed: {e}")

        if sectors:
            _log("info", f"[{cycle_id}] Sector rotation: top={sectors.get('top_sectors')}, bottom={sectors.get('bottom_sectors')}")

        # ── Regime detection (every 15 min, cached internally) ────────────────
        try:
            regime_result = await detect_regime()
            regime_cfg = apply_regime_to_config(self.config, regime_result)
            regime_name = regime_result.get("regime", "CHOPPY_RANGE")
            self._regime_cache = regime_result
            _log("info", f"[{cycle_id}] Regime={regime_name} confidence={regime_result.get('confidence')}% VIX={regime_result.get('vix')}")
            # Alert on regime change
            if self._last_regime_name and regime_name != self._last_regime_name:
                asyncio.create_task(send_risk_alert(
                    f"📊 REGIME CHANGE: {self._last_regime_name} → {regime_name}\n"
                    f"Confidence: {regime_result.get('confidence')}% | VIX: {regime_result.get('vix')}"
                ))
            self._last_regime_name = regime_name
        except Exception as e:
            _log("warning", f"[{cycle_id}] Regime detection failed: {e}")
            regime_cfg = self.config
            regime_name = "UNKNOWN"

        # ── Institutional signals (every 4h, cached internally) ───────────────
        if _time.time() - self._institutional_last_fetch > 14400:
            try:
                await get_institutional_signals_batch(universe)
                self._institutional_last_fetch = _time.time()
                _log("info", f"[{cycle_id}] Institutional signals refreshed")
            except Exception as e:
                _log("warning", f"[{cycle_id}] Institutional signals failed: {e}")

        # ── Returns cache for correlation penalty (every 1h) ─────────────────
        if not self._returns_cache or _time.time() - getattr(self, '_returns_cache_ts', 0) > 3600:
            try:
                self._returns_cache = await self._risk._fetch_returns(universe, days=30)
                self._returns_cache_ts = _time.time()
            except Exception:
                pass

        open_longs = get_open_longs()
        open_shorts = get_open_shorts()
        paper = get_portfolio_summary({t: q.get("price", 0) for t, q in quotes.items()})

        # Track all-time peak for drawdown-proportional sizing
        pv = paper.get("total_value", 0)
        if pv > self._peak_value:
            self._peak_value = pv
        drawdown_scale = self._risk.drawdown_scalar(pv, self._peak_value)
        if drawdown_scale < 0.9:
            _log("warning", f"[{cycle_id}] Drawdown scalar={drawdown_scale:.2f} — reducing position sizes")

        # ── Risk mode + Trade style: adapt parameters to market conditions ────────
        _drawdown_pct = (
            (self._peak_value - pv) / self._peak_value * 100
            if self._peak_value > 0 else 0.0
        )
        _vix = float(self._regime_cache.get("vix", 18)) if self._regime_cache else float(macro.get("vix", 18))
        _win_rate = _get_recent_win_rate()

        _risk_mode   = self.config.get("risk_mode", "AUTO")
        _trade_style = self.config.get("trade_style", "AUTO")
        if _risk_mode == "AUTO":
            _risk_mode = _determine_risk_mode(_vix, _drawdown_pct, _win_rate)
        if _trade_style == "AUTO":
            _trade_style = _get_trade_style(regime_name, _risk_mode)

        style_p = TRADE_STYLE_PARAMS[_trade_style]
        regime_cfg["stop_loss_pct"]    = style_p["stop_loss_pct"]
        regime_cfg["take_profit_pct"]  = style_p["take_profit_pct"]
        regime_cfg["cut_loss_pct"]     = style_p["cut_loss_pct"]
        regime_cfg["short_stop_pct"]   = style_p["short_stop_pct"]
        regime_cfg["short_profit_pct"] = style_p["short_profit_pct"]
        regime_cfg["min_confidence"]   = max(
            regime_cfg.get("min_confidence", 65), style_p["min_confidence"]
        )
        regime_cfg["_regime_size_mult"] = regime_cfg.get("_regime_size_mult", 1.0) * style_p["size_mult"]
        regime_cfg["_trade_style"]     = _trade_style
        regime_cfg["_risk_mode"]       = _risk_mode
        # Update risk manager so _check_stops uses the correct stop %
        self._risk.limits["stop_loss_pct"] = style_p["stop_loss_pct"]

        self._current_trade_style = _trade_style
        self._current_risk_mode   = _risk_mode

        _log("info", f"[{cycle_id}] RiskMode={_risk_mode} TradeStyle={_trade_style} "
                     f"(DD={_drawdown_pct:.1f}% WR={_win_rate:.0%} VIX={_vix:.1f})")
        if self._last_risk_mode and _risk_mode != self._last_risk_mode:
            asyncio.create_task(send_risk_alert(
                f"⚠️ RISK MODE: {self._last_risk_mode} → {_risk_mode} | "
                f"Style: {_trade_style} | VIX={_vix:.1f} | DD={_drawdown_pct:.1f}%"
            ))
        self._last_risk_mode = _risk_mode

        # ── Daily P&L tracking: reset at start of each new trading day ───────────
        today_str = now_et.strftime("%Y-%m-%d") if hasattr(now_et, "strftime") else ""
        if today_str and today_str != self._last_day:
            self._day_start_value = pv if pv > 0 else INITIAL_CASH_DEFAULT
            self._intraday_high_value = pv if pv > 0 else INITIAL_CASH_DEFAULT  # Track intraday high (NEW)
            self._last_day = today_str
            self._circuit_broken = False  # reset circuit breaker at day start
            _log("info", f"[{cycle_id}] New trading day {today_str}: day_start=${self._day_start_value:,.0f}")

        # Update intraday high (NEW: for intraday DD check)
        if pv > self._intraday_high_value:
            self._intraday_high_value = pv

        daily_pnl_pct = (
            (pv - self._day_start_value) / self._day_start_value * 100
            if self._day_start_value > 0 else 0.0
        )

        # ── Circuit breaker: daily loss limit ────────────────────────────────────
        daily_limit = self.config.get("daily_loss_limit_pct", 3.0)
        if not self._circuit_broken and daily_pnl_pct < -daily_limit:
            self._circuit_broken = True
            msg = (f"⛔ CIRCUIT BREAKER TRIGGERED\n"
                   f"Daily P&L: {daily_pnl_pct:.2f}% (limit: -{daily_limit:.1f}%)\n"
                   f"Portfolio: ${pv:,.0f} | No new entries until market open tomorrow.")
            _log("warning", f"[{cycle_id}] {msg}")
            asyncio.create_task(send_risk_alert(msg))
        if self._circuit_broken:
            _log("warning", f"[{cycle_id}] Circuit breaker active — daily P&L={daily_pnl_pct:.2f}%. Skipping new entries.")

        # Auto stop-loss check (hard stops before signal-based decisions)
        await self._check_stops(open_longs, open_shorts, quotes, cycle_id)

        # Position aging: exit positions held beyond max_hold_days for current trade style
        await self._check_aged_positions(open_longs, open_shorts, quotes, cycle_id)

        # Regime change exit: close long positions on BULL->BEAR transition (NEW)
        regime_name = macro.get("regime", "UNKNOWN")
        if self._last_regime_name and regime_name != self._last_regime_name:
            old_regime = self._last_regime_name
            new_regime = regime_name
            _log("info", f"[{cycle_id}] Regime change detected: {old_regime} -> {new_regime}")
            # On BULL->BEAR transition, close all long positions
            if "BULL" in old_regime and "BEAR" in new_regime:
                for pos in open_longs:
                    _ticker = pos["ticker"]
                    _price = quotes.get(_ticker, {}).get("price", 0) or pos.get("avg_price", 0)
                    if not _price: continue
                    _reason = f"Regime exit: {old_regime} -> {new_regime}"
                    _result = self._execute("SELL", _ticker, pos["qty"], _price, None, None, _reason, 85)
                    _save_decision(cycle_id, {"ticker": _ticker, "action": "SELL", "qty": pos["qty"],
                                              "price": _price, "confidence": 85, "reasoning": _reason,
                                              "executed": _result.get("ok", False), "execution_result": _result})
                    if _result.get("ok"):
                        _log("info", f"[{cycle_id}] Regime exit SELL {_ticker} @${_price:.2f}")
                        try: record_exit(_ticker, _price, pos["qty"], cycle_id)
                        except Exception: pass
                        asyncio.create_task(send_trade_alert(
                            action="SELL", ticker=_ticker, qty=pos["qty"], price=_price,
                            stop=0, target=0, reason=_reason, confidence=85,
                        ))
        self._last_regime_name = regime_name

        # Overnight filter: force-close all DAY_TRADE positions before market close
        if day_trade_eod:
            _all = get_open_longs() + get_open_shorts()
            if _all:
                _log("info", f"[{cycle_id}] DAY_TRADE EOD: force-closing {len(_all)} position(s)")
            for _pos in _all:
                _ticker = _pos["ticker"]
                _action = "SELL" if _pos["action"] == "BUY" else "COVER"
                _price = quotes.get(_ticker, {}).get("price", 0) or _pos.get("avg_price", 0)
                if not _price:
                    continue
                _reason = "DAY_TRADE overnight filter: forced close at EOD"
                _result = self._execute(_action, _ticker, _pos["qty"], _price, None, None, _reason, 99)
                _save_decision(cycle_id, {"ticker": _ticker, "action": _action, "qty": _pos["qty"],
                                          "price": _price, "confidence": 99, "reasoning": _reason,
                                          "executed": _result.get("ok", False), "execution_result": _result})
                if _result.get("ok"):
                    _log("info", f"[{cycle_id}] EOD CLOSE {_action} {_ticker} @${_price:.2f}")
                    try: record_exit(_ticker, _price, _pos["qty"], cycle_id)
                    except Exception: pass
                    asyncio.create_task(send_trade_alert(
                        action=_action, ticker=_ticker, qty=_pos["qty"], price=_price,
                        stop=0, target=0, reason=_reason, confidence=99,
                    ))

        # Refresh positions after stops + aging + EOD exits
        open_longs = get_open_longs()
        open_shorts = get_open_shorts()

        # ── Cross-sectional ranking: tag top/bottom of universe ─────────────────
        scored_universe = []
        for t, q in quotes.items():
            if q.get("ok") and q.get("price"):
                composite = (
                    (q.get("change_pct") or 0) * 2
                    + (q.get("trend_5d_pct") or 0)
                    + ((q.get("rs_vs_spy") or 1) - 1) * 20
                    + (1 if q.get("macd_bullish_daily") else -1) * 5
                )
                scored_universe.append((t, composite))
        scored_universe.sort(key=lambda x: x[1], reverse=True)
        n = len(scored_universe)
        top_quintile = {t for t, _ in scored_universe[:max(1, n // 5)]}
        bottom_quintile = {t for t, _ in scored_universe[max(0, n - n // 5):]}
        for t in top_quintile:
            if t in quotes: quotes[t]["_rank_leader"] = True
        for t in bottom_quintile:
            if t in quotes: quotes[t]["_rank_laggard"] = True
        _log("info", f"[{cycle_id}] Cross-sectional leaders={list(top_quintile)[:5]} laggards={list(bottom_quintile)[:5]}")

        # ── Portfolio heat check: total open risk ≤ 15% of portfolio ────────────
        total_heat_pct = sum(
            abs(p.get("market_value", 0)) / max(paper.get("total_value", 1), 1) * 100
            for p in paper.get("positions", [])
        )
        portfolio_too_hot = total_heat_pct > 85.0  # > 85% deployed = no new entries
        if portfolio_too_hot:
            _log("warning", f"[{cycle_id}] Portfolio heat {total_heat_pct:.1f}% — blocking new entries")

        # Generate decisions via rule engine using regime-adjusted config
        decisions = generate_decisions(quotes, macro, open_longs, open_shorts, regime_cfg, news, fundamentals)

        executed = 0
        blocked = 0
        for d in decisions:
            action = d["action"].upper()
            ticker = d["ticker"].upper()
            confidence = d.get("confidence", 50)
            price = d.get("price") or quotes.get(ticker, {}).get("price", 0)
            atr = quotes.get(ticker, {}).get("atr")

            # COVER/SELL use qty from existing position — skip risk sizing
            is_close = action in ("SELL", "COVER")

            # ── Guard: block new entries during restricted windows ─────────────
            if not is_close:
                if avoid_new_entries:
                    _save_decision(cycle_id, {**d, "executed": False, "blocked_reason": "Time filter: market open/close window"})
                    blocked += 1
                    continue
                if portfolio_too_hot:
                    _save_decision(cycle_id, {**d, "executed": False, "blocked_reason": f"Portfolio heat {total_heat_pct:.1f}% > 85%"})
                    blocked += 1
                    continue
                avoid_entry, entry_reason = should_avoid_entry(ticker)
                if avoid_entry:
                    _save_decision(cycle_id, {**d, "executed": False, "blocked_reason": entry_reason})
                    blocked += 1
                    _log("info", f"[{cycle_id}] {action} {ticker} BLOCKED: {entry_reason}")
                    continue

                # ── Re-entry cooloff: block entry after recent stop-out ────────
                if ticker in self._stop_out_times:
                    since_stop = _time.time() - self._stop_out_times[ticker]
                    _cooloff = 2 * 86400  # 2-day hard block
                    if since_stop < _cooloff:
                        _hrs = since_stop / 3600
                        _save_decision(cycle_id, {**d, "executed": False,
                                                  "blocked_reason": f"Re-entry cooloff: {_hrs:.1f}h since stop-out (48h required)"})
                        blocked += 1
                        continue
                    elif since_stop < 5 * 86400:
                        # 2–5 days post-stop: allow but require higher conviction
                        _min_conf = regime_cfg.get("min_confidence", 65) + 10
                        if confidence < _min_conf:
                            _save_decision(cycle_id, {**d, "executed": False,
                                                      "blocked_reason": f"Re-entry needs confidence ≥{_min_conf} post-stop, got {confidence}"})
                            blocked += 1
                            continue
                    else:
                        del self._stop_out_times[ticker]  # cleared after 5 days

            # ── ML confidence boost: adjust confidence based on learned model ──
            if not is_close:
                q_features = quotes.get(ticker, {})
                ml_conf, ml_reason = ml_confidence_boost(q_features, price, d.get("strategy", "unknown"), confidence)
                if ml_reason:
                    _log("info", f"[{cycle_id}] ML adj {ticker}: {ml_reason}")
                    import re as _re
                    _mp = _re.search(r'p=([\d.]+)', ml_reason)
                    ml_prob_val = float(_mp.group(1)) if _mp else None
                    d = {**d, "confidence": ml_conf, "ml_prob": ml_prob_val, "ml_reason": ml_reason,
                         "reasoning": d.get("reasoning", "") + f" | {ml_reason}"}
                    confidence = ml_conf

            # ── Regime size multiplier ──────────────────────────────────────
            regime_size_mult = regime_cfg.get("_regime_size_mult", 1.0) if not is_close else 1.0

            # ── Intraday drawdown circuit breaker (NEW) ──────────────────────
            if not is_close and not self._circuit_broken:
                intraday_ok, intraday_msg = self._risk.intraday_drawdown_check(
                    paper, self._intraday_high_value, self._intraday_dd_limit_pct
                )
                if not intraday_ok:
                    _save_decision(cycle_id, {**d, "executed": False, "blocked_reason": intraday_msg})
                    blocked += 1
                    _log("warning", f"[{cycle_id}] Intraday DD check failed: {intraday_msg}")
                    continue

            # ── Correlation penalty: reduce size if correlated with open pos ─
            corr_mult = 1.0
            corr_reason = ""
            if not is_close and self._returns_cache:
                corr_mult, corr_reason = self._risk.correlation_penalty(
                    ticker, paper.get("positions", []), self._returns_cache
                )
                if corr_reason:
                    _log("info", f"[{cycle_id}] Correlation penalty {ticker}: {corr_reason}")

            # ── Sector concentration check (NEW) ────────────────────────────
            sector_ok = True
            sector_msg = ""
            if not is_close:
                sector_ok, sector_msg = self._risk.sector_exposure_check(
                    ticker, paper.get("positions", []),
                    max_sector_pct=self._sector_max_pct,
                    portfolio_value=paper["total_value"],
                )
                if not sector_ok:
                    _save_decision(cycle_id, {**d, "executed": False, "blocked_reason": sector_msg})
                    blocked += 1
                    _log("info", f"[{cycle_id}] Sector check blocked {ticker}: {sector_msg}")
                    continue

            # ── Cross-asset correlation check: prevent correlated entries (NEW) ──
            corr_entry_ok = True
            corr_entry_msg = ""
            if not is_close and self._returns_cache:
                corr_entry_ok, corr_entry_msg = self._risk.cross_asset_correlation_check(
                    ticker, action, paper.get("positions", []), self._returns_cache
                )
                if not corr_entry_ok:
                    _save_decision(cycle_id, {**d, "executed": False, "blocked_reason": corr_entry_msg})
                    blocked += 1
                    _log("info", f"[{cycle_id}] Cross-asset corr check blocked {ticker}: {corr_entry_msg}")
                    continue

            # ── Dynamic Kelly-scaled position sizing (NEW: rolling window) ──
            if not is_close:
                kelly_risk_pct = kelly_rolling(
                    d.get("strategy", "unknown"),
                    lookback_trades=20,
                    default_risk_pct=self.config.get("risk_per_trade_pct", 2.0),
                )
                qty = d.get("qty") or self._risk.position_size_shares(
                    ticker, price, paper["total_value"],
                    kelly_risk_pct,
                    atr=atr,
                    drawdown_scale=drawdown_scale * regime_size_mult * corr_mult,
                )
                # Beta-adjusted sizing: normalize risk for high-volatility stocks
                _beta = self._fundamentals_cache.get(ticker, {}).get("beta")
                _bmult = _beta_size_mult(_beta)
                if _bmult != 1.0:
                    qty = round(qty * _bmult, 6)
                    _log("info", f"[{cycle_id}] Beta-adj {ticker}: β={_beta:.2f} mult={_bmult:.2f} → qty={qty:.1f}")
            else:
                qty = d.get("qty") or 1

            if not is_close:
                # Block new entries if circuit breaker is active
                if self._circuit_broken:
                    _save_decision(cycle_id, {**d, "executed": False, "blocked_reason": f"Circuit breaker: daily P&L {daily_pnl_pct:.2f}%"})
                    blocked += 1
                    continue
                mock_portfolio = {
                    "total_value": paper["total_value"],
                    "cash": paper["cash"],
                    "positions": [{"symbol": p["ticker"], "market_value": p["market_value"], "portfolio_pct": p["market_value"] / max(paper["total_value"], 1) * 100, "qty": p["qty"]} for p in paper["positions"]],
                    "daily_pnl_pct": daily_pnl_pct,
                }
                risk = self._risk.check_trade(action, ticker, qty, price, mock_portfolio, macro)
                if not risk["approved"]:
                    _save_decision(cycle_id, {**d, "executed": False, "blocked_reason": "; ".join(risk["reasons"])})
                    blocked += 1
                    _log("warning", f"[{cycle_id}] {action} {ticker} BLOCKED: {risk['reasons']}")
                    continue
                qty = risk["adjusted_qty"]

            # Compute stops/targets for new entries using trade-style-aware params
            # VIX-adjusted stops: wider during high volatility to avoid whipsaws
            vix_val = macro.get("vix") or 20.0
            if action == "BUY":
                stop = self._risk.compute_stop_loss(price, "BUY", atr, vix_val) if self.config.get("auto_stop_loss") else None
                _tp_pct = regime_cfg.get("take_profit_pct", self.config.get("take_profit_pct", 15))
                target = round(price * (1 + _tp_pct / 100), 2) if self.config.get("auto_take_profit") else None
            elif action == "SHORT":
                stop = self._risk.compute_stop_loss(price, "SELL", atr, vix_val) if self.config.get("auto_stop_loss") else None
                _sp_pct = regime_cfg.get("short_profit_pct", self.config.get("short_profit_pct", 12))
                target = round(price * (1 - _sp_pct / 100), 2) if self.config.get("auto_take_profit") else None
            else:
                stop = target = None

            result = self._execute(action, ticker, qty, price, stop, target, d.get("reasoning", "")[:400], confidence)

            _save_decision(cycle_id, {**d, "qty": qty, "price": price, "executed": result.get("ok", False), "execution_result": result, "blocked_reason": result.get("error") if not result.get("ok") else None, "trade_style": self._current_trade_style})
            if result.get("ok"):
                executed += 1
                _log("info", f"[{cycle_id}] {action} {qty:.1f}x {ticker} @ ${price:.2f} | {d.get('reasoning','')}")
                try:
                    if action in ("BUY", "SHORT"):
                        record_entry(d.get("strategy", "unknown"), ticker, action, price, qty, cycle_id)
                        self._position_strategies[ticker] = d.get("strategy", "unknown")
                        self._entry_reasoning[ticker] = d.get("reasoning", "")
                        # Track entry highs/lows for trailing stops (NEW)
                        self._position_entry_highs[ticker] = price
                        self._position_entry_lows[ticker] = price
                        self._trailing_stops[ticker] = price
                    elif action in ("SELL", "COVER"):
                        record_exit(ticker, price, qty, cycle_id)
                        opening_strategy = self._position_strategies.pop(ticker, None)
                        # Attribution: record which indicators drove this trade's outcome
                        pos_list = open_longs if action == "SELL" else open_shorts
                        _pos = next((p for p in pos_list if p.get("ticker") == ticker), None)
                        if _pos:
                            _avg = _pos.get("avg_price", price)
                            _pnl_pct = ((price - _avg) / _avg * 100 if action == "SELL" else (_avg - price) / _avg * 100) if _avg else 0
                            _record_attribution(
                                ticker, opening_strategy or "unknown",
                                _pos.get("entry_ts", ""), datetime.now(timezone.utc).isoformat(),
                                _pnl_pct, self._last_regime_name or "UNKNOWN",
                                self._current_trade_style, d.get("reasoning", "")[:200],
                                self._entry_reasoning.get(ticker, ""),
                            )
                            # ML outcome for auto-retrain trigger
                            if opening_strategy:
                                from services import ml_scorer as _mls
                                _mls.record_trade_outcome(opening_strategy, _pnl_pct > 0)
                        self._entry_reasoning.pop(ticker, None)
                except Exception as _te:
                    _log("warning", f"[{cycle_id}] Strategy tracking error: {_te}")
                asyncio.create_task(send_trade_alert(
                    action=action, ticker=ticker, qty=qty, price=price,
                    stop=stop, target=target,
                    reason=d.get("reasoning", "")[:200],
                    confidence=confidence,
                ))
            else:
                _log("warning", f"[{cycle_id}] FAILED {action} {ticker}: {result.get('error')}")

        paper_after = get_portfolio_summary({t: q.get("price", 0) for t, q in quotes.items()})

        # Persist P&L snapshot for time-series chart
        try:
            save_pnl_snapshot(
                portfolio_value=paper_after["total_value"],
                cash=paper_after.get("cash", 0),
                longs_value=sum(p.get("market_value", 0) for p in paper_after.get("longs", [])),
                shorts_exposure=sum(abs(p.get("market_value", 0)) for p in paper_after.get("shorts", [])),
                total_return_pct=paper_after.get("total_return_pct", 0),
                open_longs=len(paper_after.get("longs", [])),
                open_shorts=len(paper_after.get("shorts", [])),
            )
        except Exception as _pe:
            _log("warning", f"[{cycle_id}] P&L snapshot failed: {_pe}")

        # Auto-retrain ML models: (1) every 10 cycles if accuracy drops, (2) periodically every 3 days
        should_retrain = False
        retrain_reason = ""
        if self._cycle_count % 10 == 0:
            should_retrain = True
            retrain_reason = "rolling accuracy check"
        else:
            import time as _time_module
            now_ts = _time_module.time()
            if self._last_ml_train_ts == 0 or (now_ts - self._last_ml_train_ts) > (self._ml_refresh_days * 86400):
                should_retrain = True
                retrain_reason = f"{self._ml_refresh_days}-day periodic refresh"

        if should_retrain:
            try:
                from services import ml_scorer as _mls
                import time as _time_module
                self._last_ml_train_ts = _time_module.time()
                _log("info", f"[{cycle_id}] Triggering ML model refresh ({retrain_reason})")
                asyncio.create_task(_mls.maybe_retrain_async())
            except Exception as _e:
                _log("warning", f"[{cycle_id}] ML retrain task failed: {_e}")

        bullish_count = sum(1 for v in news.values() if isinstance(v, dict) and v.get("direction") == "BULLISH")
        bearish_count = sum(1 for v in news.values() if isinstance(v, dict) and v.get("direction") == "BEARISH")
        summary = {
            "cycle_id": cycle_id,
            "ts": datetime.now(timezone.utc).isoformat(),
            "quotes_fetched": len([q for q in quotes.values() if q.get("ok")]),
            "decisions": len(decisions),
            "executed": executed,
            "blocked": blocked,
            "macro_regime": macro.get("regime"),
            "vix": macro.get("vix"),
            "portfolio_value": paper_after["total_value"],
            "total_return_pct": paper_after["total_return_pct"],
            "daily_pnl_pct": round(daily_pnl_pct, 2),
            "circuit_broken": self._circuit_broken,
            "open_longs": len(paper_after["longs"]),
            "open_shorts": len(paper_after["shorts"]),
            "news_bullish": bullish_count,
            "news_bearish": bearish_count,
            "top_sectors": sectors.get("top_sectors", []) if isinstance(sectors, dict) else [],
            "drawdown_scale": drawdown_scale,
            "peak_value": self._peak_value,
            "risk_mode": self._current_risk_mode,
            "trade_style": self._current_trade_style,
        }
        self._last_cycle_ts = summary["ts"]
        self._last_cycle_summary = summary
        _log("info", f"[{cycle_id}] Done: executed={executed}, blocked={blocked}, regime={macro.get('regime')}, portfolio=${paper['total_value']:,.0f} ({paper['total_return_pct']:+.2f}%)")
        asyncio.create_task(send_cycle_summary(summary))

    def _execute(self, action: str, ticker: str, qty: float, price: float,
                 stop: Optional[float], target: Optional[float], reason: str, confidence: int) -> Dict[str, Any]:
        mode = self.config["mode"]
        if mode == "paper":
            return execute_paper_trade(ticker=ticker, action=action, qty=qty, price=price,
                                       stop_loss=stop, target=target, reason=reason, confidence=confidence,
                                       trade_style=self._current_trade_style)
        elif mode == "ibkr_paper":
            ibkr_result = place_ibkr_order(ticker=ticker, action=action, qty=qty, price=price,
                                            order_type="MKT", mode="ibkr_paper")
            if ibkr_result.get("ok"):
                # Mirror into internal book so portfolio_summary stays consistent
                execute_paper_trade(ticker=ticker, action=action, qty=qty, price=price,
                                    stop_loss=stop, target=target, reason=reason, confidence=confidence,
                                    trade_style=self._current_trade_style)
            return ibkr_result
        else:
            return {"ok": False, "error": f"Mode '{mode}' not enabled for execution"}

    async def _check_aged_positions(
        self, open_longs: List[Dict], open_shorts: List[Dict], quotes: Dict, cycle_id: str
    ):
        """Exit positions held beyond max_hold_days for the current trade style."""
        max_hold = TRADE_STYLE_PARAMS.get(self._current_trade_style, {}).get("max_hold_days", 7)
        now = datetime.now(timezone.utc)

        for pos in open_longs + open_shorts:
            entry_ts = pos.get("entry_ts")
            if not entry_ts:
                continue
            try:
                entry_dt = datetime.fromisoformat(entry_ts.replace("Z", "+00:00"))
                age_days = (now - entry_dt).days
                if age_days < max_hold:
                    continue
                ticker = pos["ticker"]
                action = "SELL" if pos["action"] == "BUY" else "COVER"
                price  = quotes.get(ticker, {}).get("price", 0) or pos.get("avg_price", 0)
                if not price:
                    continue
                reason = (
                    f"Position aging: held {age_days}d ≥ max {max_hold}d "
                    f"[{self._current_trade_style}]"
                )
                result = self._execute(action, ticker, pos["qty"], price, None, None, reason, 90)
                _save_decision(cycle_id, {
                    "ticker": ticker, "action": action, "qty": pos["qty"], "price": price,
                    "confidence": 90, "reasoning": reason,
                    "executed": result.get("ok", False), "execution_result": result,
                })
                if result.get("ok"):
                    _log("info", f"[{cycle_id}] AGE-EXIT {action} {ticker} @${price:.2f} — {reason}")
                    try:
                        record_exit(ticker, price, pos["qty"], cycle_id)
                    except Exception:
                        pass
                    asyncio.create_task(send_trade_alert(
                        action=action, ticker=ticker, qty=pos["qty"], price=price,
                        stop=0, target=0, reason=reason, confidence=90,
                    ))
            except Exception as exc:
                _log("warning", f"[{cycle_id}] Age check error {pos.get('ticker', '?')}: {exc}")

    async def _check_stops(self, open_longs: List[Dict], open_shorts: List[Dict], quotes: Dict, cycle_id: str):
        import time as _time
        tp_pct = TRADE_STYLE_PARAMS.get(self._current_trade_style, {}).get("take_profit_pct", 12.0)

        # Long stops: partial profit → breakeven → fixed stop → trailing stop
        for pos in open_longs:
            ticker = pos["ticker"]
            price = quotes.get(ticker, {}).get("price", 0)
            if not price:
                continue
            avg = pos.get("avg_price", price)
            pnl_pct = (price - avg) / avg * 100 if avg else 0

            # ── Partial profit taking: sell 50% at first target ───────────────
            if not self._partial_exits.get(ticker) and pnl_pct >= tp_pct:
                half_qty = round(pos["qty"] * 0.5, 6)
                if half_qty > 0:
                    reason = f"Partial profit: +{pnl_pct:.1f}% ≥ {tp_pct:.0f}% target — selling 50%"
                    result = self._execute("SELL", ticker, half_qty, price, None, None, reason, 88)
                    _save_decision(cycle_id, {"ticker": ticker, "action": "SELL", "qty": half_qty, "price": price,
                                              "confidence": 88, "reasoning": reason,
                                              "executed": result.get("ok", False), "execution_result": result})
                    if result.get("ok"):
                        self._partial_exits[ticker] = True
                        self._breakeven_stops[ticker] = avg
                        _log("info", f"[{cycle_id}] PARTIAL EXIT {ticker} {half_qty:.1f}sh @ ${price:.2f}, BE stop=${avg:.2f}")
                        try: record_exit(ticker, price, half_qty, cycle_id)
                        except Exception: pass
                        _record_attribution(
                            ticker, self._position_strategies.get(ticker, "unknown"),
                            pos.get("entry_ts", ""), datetime.now(timezone.utc).isoformat(),
                            pnl_pct, self._last_regime_name or "UNKNOWN",
                            self._current_trade_style, reason,
                            self._entry_reasoning.get(ticker, ""),
                        )
                        asyncio.create_task(send_trade_alert(
                            action="SELL", ticker=ticker, qty=half_qty, price=price,
                            stop=avg, target=None, reason=reason, confidence=88,
                        ))
                continue  # skip further checks this cycle — let remaining run

            # ── Breakeven stop: close remaining if price reverts to cost basis ─
            if self._partial_exits.get(ticker):
                be_stop = self._breakeven_stops.get(ticker, avg)
                if price <= be_stop:
                    reason = f"Breakeven stop: ${price:.2f} ≤ cost basis ${be_stop:.2f}"
                    result = self._execute("SELL", ticker, pos["qty"], price, None, None, reason, 95)
                    _save_decision(cycle_id, {"ticker": ticker, "action": "SELL", "qty": pos["qty"], "price": price,
                                              "confidence": 95, "reasoning": reason,
                                              "executed": result.get("ok", False), "execution_result": result})
                    if result.get("ok"):
                        _pnl = (price - be_stop) / be_stop * 100 if be_stop else 0
                        self._partial_exits.pop(ticker, None)
                        self._breakeven_stops.pop(ticker, None)
                        self._trailing_stops.pop(ticker, None)
                        self._stop_out_times[ticker] = _time.time()
                        try: record_exit(ticker, price, pos["qty"], cycle_id)
                        except Exception: pass
                        _record_attribution(
                            ticker, self._position_strategies.get(ticker, "unknown"),
                            pos.get("entry_ts", ""), datetime.now(timezone.utc).isoformat(),
                            _pnl, self._last_regime_name or "UNKNOWN",
                            self._current_trade_style, reason,
                            self._entry_reasoning.get(ticker, ""),
                        )
                        self._entry_reasoning.pop(ticker, None)
                        asyncio.create_task(send_stop_alert(
                            "SELL", ticker, pos["qty"], price, reason, avg_price=avg,
                        ))
                    continue

            # ── Update trailing high watermark ────────────────────────────────
            trailing_high = self._trailing_stops.get(ticker, avg)
            if price > trailing_high:
                self._trailing_stops[ticker] = price
                trailing_high = price

            # ── Fixed stop-loss ───────────────────────────────────────────────
            if self._risk.should_trigger_stop(pos, price):
                _log("warning", f"[{cycle_id}] LONG STOP: {ticker} @ ${price:.2f} (avg ${avg:.2f})")
                result = self._execute("SELL", ticker, pos["qty"], price, None, None, "AUTO LONG STOP-LOSS", 99)
                _save_decision(cycle_id, {"ticker": ticker, "action": "SELL", "qty": pos["qty"], "price": price,
                                          "confidence": 99, "reasoning": "Auto long stop-loss",
                                          "executed": result.get("ok", False), "execution_result": result})
                if result.get("ok"):
                    _pnl = pnl_pct
                    self._trailing_stops.pop(ticker, None)
                    self._partial_exits.pop(ticker, None)
                    self._breakeven_stops.pop(ticker, None)
                    self._stop_out_times[ticker] = _time.time()
                    try: record_exit(ticker, price, pos["qty"], cycle_id)
                    except Exception: pass
                    _record_attribution(
                        ticker, self._position_strategies.get(ticker, "unknown"),
                        pos.get("entry_ts", ""), datetime.now(timezone.utc).isoformat(),
                        _pnl, self._last_regime_name or "UNKNOWN",
                        self._current_trade_style, f"Stop-loss −{self._risk.limits['stop_loss_pct']:.0f}%",
                        self._entry_reasoning.get(ticker, ""),
                    )
                    self._entry_reasoning.pop(ticker, None)
                    asyncio.create_task(send_stop_alert(
                        "SELL", ticker, pos["qty"], price,
                        f"Stop-loss: −{self._risk.limits['stop_loss_pct']:.0f}% below entry ${avg:.2f}",
                        avg_price=avg,
                    ))
                continue

            # ── Trailing stop: activate after 3% profit, trigger on 5% drop ──
            profit_pct = (trailing_high - avg) / avg * 100 if avg else 0
            if profit_pct >= 3.0:
                drop_pct = (trailing_high - price) / trailing_high * 100 if trailing_high else 0
                if drop_pct >= 5.0:
                    _log("warning", f"[{cycle_id}] TRAILING STOP: {ticker} @ ${price:.2f} ({drop_pct:.1f}% below peak ${trailing_high:.2f})")
                    reason = f"Trailing stop: {drop_pct:.1f}% below peak ${trailing_high:.2f}"
                    result = self._execute("SELL", ticker, pos["qty"], price, None, None, reason, 99)
                    _save_decision(cycle_id, {"ticker": ticker, "action": "SELL", "qty": pos["qty"], "price": price,
                                              "confidence": 99, "reasoning": reason,
                                              "executed": result.get("ok", False), "execution_result": result})
                    if result.get("ok"):
                        self._trailing_stops.pop(ticker, None)
                        self._partial_exits.pop(ticker, None)
                        self._breakeven_stops.pop(ticker, None)
                        self._stop_out_times[ticker] = _time.time()
                        try: record_exit(ticker, price, pos["qty"], cycle_id)
                        except Exception: pass
                        _record_attribution(
                            ticker, self._position_strategies.get(ticker, "unknown"),
                            pos.get("entry_ts", ""), datetime.now(timezone.utc).isoformat(),
                            pnl_pct, self._last_regime_name or "UNKNOWN",
                            self._current_trade_style, reason,
                            self._entry_reasoning.get(ticker, ""),
                        )
                        self._entry_reasoning.pop(ticker, None)
                        asyncio.create_task(send_stop_alert(
                            "SELL", ticker, pos["qty"], price, reason, avg_price=avg,
                        ))

        # Short stop: cover if price rises above stop % — record stop-out for re-entry cooloff
        short_stop_pct = self.config.get("short_stop_pct", 8.0)
        for pos in open_shorts:
            ticker = pos["ticker"]
            price = quotes.get(ticker, {}).get("price", 0)
            if not price:
                continue
            avg = pos.get("avg_price", price)
            rise_pct = (price - avg) / avg * 100 if avg else 0
            if rise_pct >= short_stop_pct:
                _log("warning", f"[{cycle_id}] SHORT STOP: {ticker} @ ${price:.2f} rose +{rise_pct:.1f}% vs entry ${avg:.2f}")
                reason = f"Auto short stop: price +{rise_pct:.1f}%"
                result = self._execute("COVER", ticker, pos["qty"], price, None, None, f"AUTO SHORT STOP: +{rise_pct:.1f}%", 99)
                _save_decision(cycle_id, {"ticker": ticker, "action": "COVER", "qty": pos["qty"], "price": price,
                                          "confidence": 99, "reasoning": reason,
                                          "executed": result.get("ok", False), "execution_result": result})
                if result.get("ok"):
                    import time as _time2
                    self._stop_out_times[ticker] = _time2.time()
                    pnl_pct = -rise_pct  # lost money on the short
                    try: record_exit(ticker, price, pos["qty"], cycle_id)
                    except Exception: pass
                    _record_attribution(
                        ticker, self._position_strategies.get(ticker, "unknown"),
                        pos.get("entry_ts", ""), datetime.now(timezone.utc).isoformat(),
                        pnl_pct, self._last_regime_name or "UNKNOWN",
                        self._current_trade_style, reason,
                        self._entry_reasoning.get(ticker, ""),
                    )
                    self._entry_reasoning.pop(ticker, None)
                    asyncio.create_task(send_stop_alert(
                        "COVER", ticker, pos["qty"], price,
                        f"Short stop: price +{rise_pct:.1f}% above entry ${avg:.2f}",
                        avg_price=avg,
                    ))


agent = AutonomousAgent()
