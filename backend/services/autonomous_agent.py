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

from services.market_data import fetch_quotes, fetch_macro, fetch_news_sentiment
from services.risk_manager import RiskManager
from services.paper_trading import (
    execute_paper_trade,
    get_open_positions,
    get_open_longs,
    get_open_shorts,
    get_portfolio_summary,
)
from services.ibkr_trader import place_ibkr_order, get_ibkr_paper_account, test_ibkr_paper

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

def _score_momentum(q: Dict, macro: Dict) -> tuple[int, str]:
    """Momentum: above SMA20, RVOL spike, positive day, RSI healthy."""
    score = 0
    reasons = []
    if q.get("above_sma20"):
        score += 20
        reasons.append("above SMA20")
    rvol = q.get("rvol", 1.0) or 1.0
    if rvol >= 2.0:
        score += 25
        reasons.append(f"RVOL={rvol:.1f} strong")
    elif rvol >= 1.3:
        score += 15
        reasons.append(f"RVOL={rvol:.1f} elevated")
    chg = q.get("change_pct", 0) or 0
    if chg >= 2.0:
        score += 20
        reasons.append(f"+{chg:.1f}% day")
    elif chg >= 0.8:
        score += 10
        reasons.append(f"+{chg:.1f}% day")
    rsi = q.get("rsi")
    if rsi is not None:
        if 52 <= rsi <= 68:
            score += 15
            reasons.append(f"RSI={rsi} healthy")
        elif rsi > 75:
            score -= 20
            reasons.append(f"RSI={rsi} overbought")
    if not macro.get("hostile"):
        score += 10
        reasons.append("macro supportive")
    return score, "Momentum: " + ", ".join(reasons) if reasons else "no signal"


def _score_mean_reversion(q: Dict, macro: Dict) -> tuple[int, str]:
    """Mean reversion: oversold RSI, below SMA20, macro not hostile."""
    score = 0
    reasons = []
    rsi = q.get("rsi")
    if rsi is None:
        return 0, "no RSI data"
    if rsi <= 30:
        score += 40
        reasons.append(f"RSI={rsi} oversold")
    elif rsi <= 38:
        score += 25
        reasons.append(f"RSI={rsi} weak")
    else:
        return 0, "RSI not oversold"
    if not q.get("above_sma20"):
        score += 15
        reasons.append("below SMA20 (reversion target)")
    chg = q.get("change_pct", 0) or 0
    if chg < -2.0:
        score += 15
        reasons.append(f"{chg:.1f}% pullback")
    if macro.get("hostile"):
        score -= 30
        reasons.append("macro hostile — penalized")
    return score, "MeanRev: " + ", ".join(reasons)


def _score_breakout(q: Dict, macro: Dict) -> tuple[int, str]:
    """Breakout: RVOL > 2, strong positive day, above SMA20, RSI not yet overbought."""
    score = 0
    reasons = []
    rvol = q.get("rvol", 1.0) or 1.0
    chg = q.get("change_pct", 0) or 0
    rsi = q.get("rsi") or 50
    if rvol < 1.8 or chg < 1.5:
        return 0, "no breakout signal"
    score += 30
    reasons.append(f"RVOL={rvol:.1f} + {chg:+.1f}% breakout")
    if q.get("above_sma20"):
        score += 20
        reasons.append("above SMA20")
    if rsi < 72:
        score += 15
        reasons.append(f"RSI={rsi} not exhausted")
    else:
        score -= 10
        reasons.append(f"RSI={rsi} extended")
    regime = macro.get("regime", "NEUTRAL")
    if "RISK_ON" in regime:
        score += 15
        reasons.append(f"regime={regime}")
    return score, "Breakout: " + ", ".join(reasons)


def _score_trend_follow(q: Dict, macro: Dict) -> tuple[int, str]:
    """Trend: steady above SMA20, positive but not parabolic, macro aligned."""
    score = 0
    reasons = []
    if not q.get("above_sma20"):
        return 0, "below SMA20"
    score += 20
    chg = q.get("change_pct", 0) or 0
    rsi = q.get("rsi") or 50
    if 0.2 <= chg <= 2.5:
        score += 20
        reasons.append(f"{chg:+.1f}% steady")
    if 45 <= rsi <= 65:
        score += 20
        reasons.append(f"RSI={rsi} mid-range")
    rvol = q.get("rvol", 1.0) or 1.0
    if rvol >= 1.0:
        score += 10
        reasons.append(f"RVOL={rvol:.1f}")
    regime = macro.get("regime", "NEUTRAL")
    if "RISK_ON" in regime:
        score += 15
        reasons.append(f"regime={regime}")
    elif "RISK_OFF" in regime:
        score -= 25
        reasons.append("risk-off regime")
    return score, "Trend: above SMA20, " + ", ".join(reasons) if reasons else "Trend: above SMA20"


# ── Short signal scorers ──────────────────────────────────────────────────────

def _score_short_momentum(q: Dict, macro: Dict) -> tuple[int, str]:
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

    return score, "SHORT-Momentum: " + ", ".join(reasons)


def _score_short_breakdown(q: Dict, macro: Dict) -> tuple[int, str]:
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
        best_score, best_reason = 0, ""
        for strat in long_strategies:
            fn = LONG_STRATEGY_FNS.get(strat)
            if fn:
                score, reason = fn(q, macro)
                if score > best_score:
                    best_score, best_reason = score, reason
        confidence = min(int(best_score * 1.1), 99)
        if confidence >= config.get("min_confidence", 65):
            decisions.append({"action": "BUY", "ticker": ticker, "qty": None, "price": price,
                              "confidence": confidence, "reasoning": best_reason})

    # ── Look for new SHORT entry ──────────────────────────────────────────────
    if config.get("allow_shorts", True):
        short_strategies = config.get("short_strategies", ["short_momentum", "short_breakdown"])
        best_score, best_reason = 0, ""
        for strat in short_strategies:
            fn = SHORT_STRATEGY_FNS.get(strat)
            if fn:
                score, reason = fn(q, macro)
                if score > best_score:
                    best_score, best_reason = score, reason
        confidence = min(int(best_score * 1.1), 99)
        if confidence >= config.get("min_short_confidence", 68):
            decisions.append({"action": "SHORT", "ticker": ticker, "qty": None, "price": price,
                              "confidence": confidence, "reasoning": best_reason})

    return decisions


def generate_decisions(
    quotes: Dict[str, Dict],
    macro: Dict,
    open_longs: List[Dict],
    open_shorts: List[Dict],
    config: Dict,
) -> List[Dict[str, Any]]:
    all_decisions = []
    for ticker, q in quotes.items():
        all_decisions.extend(_decide_for_ticker(ticker, q, macro, open_longs, open_shorts, config))
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
        _log("info", f"Agent started. Mode={self.config['mode']}, Cycle={self.config['cycle_minutes']}m, Strategies={self.config['strategies']}")
        return {"ok": True, "message": "Agent started", "config": self.config}

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
            "engine": "rule-based (zero API cost)",
            "cycle_count": self._cycle_count,
            "last_cycle": self._last_cycle_ts,
            "last_summary": self._last_cycle_summary,
            "config": self.config,
            "paper_portfolio": get_portfolio_summary(),
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
        quotes, macro = await asyncio.gather(fetch_quotes(universe), fetch_macro())
        open_longs = get_open_longs()
        open_shorts = get_open_shorts()
        paper = get_portfolio_summary({t: q.get("price", 0) for t, q in quotes.items()})

        # Auto stop-loss check (hard stops before signal-based decisions)
        await self._check_stops(open_longs, open_shorts, quotes, cycle_id)

        # Refresh positions after stops
        open_longs = get_open_longs()
        open_shorts = get_open_shorts()

        # Generate decisions via rule engine
        decisions = generate_decisions(quotes, macro, open_longs, open_shorts, self.config)

        executed = 0
        blocked = 0
        for d in decisions:
            action = d["action"].upper()
            ticker = d["ticker"].upper()
            confidence = d.get("confidence", 50)
            price = d.get("price") or quotes.get(ticker, {}).get("price", 0)
            qty = d.get("qty") or self._risk.position_size_shares(ticker, price, paper["total_value"], self.config.get("risk_per_trade_pct", 2.0))

            # COVER/SELL use qty from existing position — skip risk sizing
            is_close = action in ("SELL", "COVER")

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
                stop = self._risk.compute_stop_loss(price, "BUY") if self.config.get("auto_stop_loss") else None
                target = round(price * (1 + self.config.get("take_profit_pct", 15) / 100), 2) if self.config.get("auto_take_profit") else None
            elif action == "SHORT":
                stop = self._risk.compute_stop_loss(price, "SELL") if self.config.get("auto_stop_loss") else None
                target = round(price * (1 - self.config.get("short_profit_pct", 12) / 100), 2) if self.config.get("auto_take_profit") else None
            else:
                stop = target = None

            result = self._execute(action, ticker, qty, price, stop, target, d.get("reasoning", "")[:400], confidence)

            _save_decision(cycle_id, {**d, "qty": qty, "price": price, "executed": result.get("ok", False), "execution_result": result, "blocked_reason": result.get("error") if not result.get("ok") else None})
            if result.get("ok"):
                executed += 1
                _log("info", f"[{cycle_id}] {action} {qty:.1f}x {ticker} @ ${price:.2f} | {d.get('reasoning','')}")
            else:
                _log("warning", f"[{cycle_id}] FAILED {action} {ticker}: {result.get('error')}")

        paper_after = get_portfolio_summary({t: q.get("price", 0) for t, q in quotes.items()})
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
        }
        self._last_cycle_ts = summary["ts"]
        self._last_cycle_summary = summary
        _log("info", f"[{cycle_id}] Done: executed={executed}, blocked={blocked}, regime={macro.get('regime')}, portfolio=${paper['total_value']:,.0f} ({paper['total_return_pct']:+.2f}%)")

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
        # Long stop: sell if price falls 8%+ below entry
        for pos in open_longs:
            ticker = pos["ticker"]
            price = quotes.get(ticker, {}).get("price", 0)
            if not price:
                continue
            if self._risk.should_trigger_stop(pos, price):
                _log("warning", f"[{cycle_id}] LONG STOP: {ticker} @ ${price:.2f} (avg ${pos['avg_price']:.2f})")
                result = self._execute("SELL", ticker, pos["qty"], price, None, None, "AUTO LONG STOP-LOSS", 99)
                _save_decision(cycle_id, {"ticker": ticker, "action": "SELL", "qty": pos["qty"], "price": price, "confidence": 99, "reasoning": "Auto long stop-loss", "executed": result.get("ok", False), "execution_result": result})

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
                _save_decision(cycle_id, {"ticker": ticker, "action": "COVER", "qty": pos["qty"], "price": price, "confidence": 99, "reasoning": f"Auto short stop: price +{rise_pct:.1f}%", "executed": result.get("ok", False), "execution_result": result})


agent = AutonomousAgent()
