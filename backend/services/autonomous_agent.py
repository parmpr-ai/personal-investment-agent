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
from services.strategy_tracker import save_pnl_snapshot, record_entry, record_exit, kelly_scale
from services.risk_manager import RiskManager
from services.paper_trading import (
    execute_paper_trade,
    get_open_positions,
    get_open_longs,
    get_open_shorts,
    get_portfolio_summary,
)
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
            blocked_reason TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS agent_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            level TEXT NOT NULL,
            message TEXT NOT NULL
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
            "INSERT INTO decisions(ts,cycle_id,ticker,action,qty,price,confidence,reasoning,executed,execution_result,blocked_reason) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
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

    def configure(self, updates: Dict[str, Any]) -> Dict[str, Any]:
        self.config.update(updates)
        risk_cfg = {k: self.config[k] for k in ["max_position_pct", "stop_loss_pct", "daily_loss_limit_pct", "vix_pause_threshold"] if k in self.config}
        self._risk = RiskManager(risk_cfg)
        return self.config

    def start(self) -> Dict[str, Any]:
        if self._running:
            return {"ok": False, "message": "Agent already running"}
        self._running = True
        self._task = asyncio.create_task(self._run_loop())
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
        now_et_hour = (now_utc.hour - 5) % 24  # approximate ET (UTC-5)
        now_et_min = now_utc.minute
        market_open = now_et_hour == 9 and now_et_min < 30    # 9:00-9:30 ET
        market_close = now_et_hour == 15 and now_et_min >= 45  # 15:45-16:00 ET
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

        # Auto stop-loss check (hard stops before signal-based decisions)
        await self._check_stops(open_longs, open_shorts, quotes, cycle_id)

        # Refresh positions after stops
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

            # ── ML confidence boost: adjust confidence based on learned model ──
            if not is_close:
                q_features = quotes.get(ticker, {})
                ml_conf, ml_reason = ml_confidence_boost(q_features, price, d.get("strategy", "unknown"), confidence)
                if ml_reason:
                    _log("info", f"[{cycle_id}] ML adj {ticker}: {ml_reason}")
                    d = {**d, "confidence": ml_conf, "reasoning": d.get("reasoning", "") + f" | {ml_reason}"}
                    confidence = ml_conf

            # ── Regime size multiplier ──────────────────────────────────────
            regime_size_mult = regime_cfg.get("_regime_size_mult", 1.0) if not is_close else 1.0

            # ── Correlation penalty: reduce size if correlated with open pos ─
            corr_mult = 1.0
            corr_reason = ""
            if not is_close and self._returns_cache:
                corr_mult, corr_reason = self._risk.correlation_penalty(
                    ticker, paper.get("positions", []), self._returns_cache
                )
                if corr_reason:
                    _log("info", f"[{cycle_id}] Correlation penalty {ticker}: {corr_reason}")

            # Kelly-scaled position sizing for new entries
            if not is_close:
                kelly_risk_pct = kelly_scale(
                    d.get("strategy", "unknown"),
                    paper["total_value"],
                    self.config.get("risk_per_trade_pct", 2.0),
                )
                qty = d.get("qty") or self._risk.position_size_shares(
                    ticker, price, paper["total_value"],
                    kelly_risk_pct,
                    atr=atr,
                    drawdown_scale=drawdown_scale * regime_size_mult * corr_mult,
                )
            else:
                qty = d.get("qty") or 1

            if not is_close:
                mock_portfolio = {
                    "total_value": paper["total_value"],
                    "cash": paper["cash"],
                    "positions": [{"symbol": p["ticker"], "market_value": p["market_value"], "portfolio_pct": p["market_value"] / max(paper["total_value"], 1) * 100, "qty": p["qty"]} for p in paper["positions"]],
                    "daily_pnl_pct": 0,
                }
                risk = self._risk.check_trade(action, ticker, qty, price, mock_portfolio, macro)
                if not risk["approved"]:
                    _save_decision(cycle_id, {**d, "executed": False, "blocked_reason": "; ".join(risk["reasons"])})
                    blocked += 1
                    _log("warning", f"[{cycle_id}] {action} {ticker} BLOCKED: {risk['reasons']}")
                    continue
                qty = risk["adjusted_qty"]

            # Compute stops/targets for new entries
            if action == "BUY":
                stop = self._risk.compute_stop_loss(price, "BUY", atr) if self.config.get("auto_stop_loss") else None
                target = round(price * (1 + self.config.get("take_profit_pct", 15) / 100), 2) if self.config.get("auto_take_profit") else None
            elif action == "SHORT":
                stop = self._risk.compute_stop_loss(price, "SELL", atr) if self.config.get("auto_stop_loss") else None
                target = round(price * (1 - self.config.get("short_profit_pct", 12) / 100), 2) if self.config.get("auto_take_profit") else None
            else:
                stop = target = None

            result = self._execute(action, ticker, qty, price, stop, target, d.get("reasoning", "")[:400], confidence)

            _save_decision(cycle_id, {**d, "qty": qty, "price": price, "executed": result.get("ok", False), "execution_result": result, "blocked_reason": result.get("error") if not result.get("ok") else None})
            if result.get("ok"):
                executed += 1
                _log("info", f"[{cycle_id}] {action} {qty:.1f}x {ticker} @ ${price:.2f} | {d.get('reasoning','')}")
                try:
                    if action in ("BUY", "SHORT"):
                        record_entry(d.get("strategy", "unknown"), ticker, action, price, qty, cycle_id)
                    elif action in ("SELL", "COVER"):
                        record_exit(ticker, price, qty, cycle_id)
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
            "open_longs": len(paper_after["longs"]),
            "open_shorts": len(paper_after["shorts"]),
            "news_bullish": bullish_count,
            "news_bearish": bearish_count,
            "top_sectors": sectors.get("top_sectors", []) if isinstance(sectors, dict) else [],
            "drawdown_scale": drawdown_scale,
            "peak_value": self._peak_value,
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
                                       stop_loss=stop, target=target, reason=reason, confidence=confidence)
        elif mode == "ibkr_paper":
            ibkr_result = place_ibkr_order(ticker=ticker, action=action, qty=qty, price=price,
                                            order_type="MKT", mode="ibkr_paper")
            if ibkr_result.get("ok"):
                # Mirror into internal book so portfolio_summary stays consistent
                execute_paper_trade(ticker=ticker, action=action, qty=qty, price=price,
                                    stop_loss=stop, target=target, reason=reason, confidence=confidence)
            return ibkr_result
        else:
            return {"ok": False, "error": f"Mode '{mode}' not enabled for execution"}

    async def _check_stops(self, open_longs: List[Dict], open_shorts: List[Dict], quotes: Dict, cycle_id: str):
        # Long stops: fixed stop-loss + trailing stop (5% from peak, activates after 3% profit)
        for pos in open_longs:
            ticker = pos["ticker"]
            price = quotes.get(ticker, {}).get("price", 0)
            if not price:
                continue
            avg = pos.get("avg_price", price)

            # Update trailing high watermark
            trailing_high = self._trailing_stops.get(ticker, avg)
            if price > trailing_high:
                self._trailing_stops[ticker] = price
                trailing_high = price

            # Fixed stop-loss (8%+ below entry)
            if self._risk.should_trigger_stop(pos, price):
                _log("warning", f"[{cycle_id}] LONG STOP: {ticker} @ ${price:.2f} (avg ${avg:.2f})")
                result = self._execute("SELL", ticker, pos["qty"], price, None, None, "AUTO LONG STOP-LOSS", 99)
                _save_decision(cycle_id, {"ticker": ticker, "action": "SELL", "qty": pos["qty"], "price": price,
                                          "confidence": 99, "reasoning": "Auto long stop-loss",
                                          "executed": result.get("ok", False), "execution_result": result})
                if result.get("ok"):
                    self._trailing_stops.pop(ticker, None)
                    try: record_exit(ticker, price, pos["qty"], cycle_id)
                    except Exception: pass
                    asyncio.create_task(send_stop_alert(
                        "SELL", ticker, pos["qty"], price,
                        f"Stop-loss: −{self._risk.limits['stop_loss_pct']:.0f}% below entry ${avg:.2f}",
                        avg_price=avg,
                    ))
                continue

            # Trailing stop: only activate after 3% profit to avoid whipsaw near entry
            profit_pct = (trailing_high - avg) / avg * 100 if avg else 0
            if profit_pct >= 3.0:
                drop_pct = (trailing_high - price) / trailing_high * 100 if trailing_high else 0
                if drop_pct >= 5.0:
                    _log("warning", f"[{cycle_id}] TRAILING STOP: {ticker} @ ${price:.2f} ({drop_pct:.1f}% below peak ${trailing_high:.2f})")
                    result = self._execute("SELL", ticker, pos["qty"], price, None, None, f"TRAILING STOP: {drop_pct:.1f}% below peak ${trailing_high:.2f}", 99)
                    _save_decision(cycle_id, {"ticker": ticker, "action": "SELL", "qty": pos["qty"], "price": price,
                                              "confidence": 99, "reasoning": f"Trailing stop: {drop_pct:.1f}% below peak ${trailing_high:.2f}",
                                              "executed": result.get("ok", False), "execution_result": result})
                    if result.get("ok"):
                        self._trailing_stops.pop(ticker, None)
                        try: record_exit(ticker, price, pos["qty"], cycle_id)
                        except Exception: pass
                        asyncio.create_task(send_stop_alert(
                            "SELL", ticker, pos["qty"], price,
                            f"Trailing stop: {drop_pct:.1f}% below peak ${trailing_high:.2f}",
                            avg_price=avg,
                        ))

        # Short stop: cover if price rises 8%+ above entry
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
                result = self._execute("COVER", ticker, pos["qty"], price, None, None, f"AUTO SHORT STOP: +{rise_pct:.1f}%", 99)
                _save_decision(cycle_id, {"ticker": ticker, "action": "COVER", "qty": pos["qty"], "price": price,
                                          "confidence": 99, "reasoning": f"Auto short stop: price +{rise_pct:.1f}%",
                                          "executed": result.get("ok", False), "execution_result": result})
                if result.get("ok"):
                    try: record_exit(ticker, price, pos["qty"], cycle_id)
                    except Exception: pass
                    asyncio.create_task(send_stop_alert(
                        "COVER", ticker, pos["qty"], price,
                        f"Short stop: price +{rise_pct:.1f}% above entry ${avg:.2f}",
                        avg_price=avg,
                    ))


agent = AutonomousAgent()
