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
    get_portfolio_summary,
)

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


def _decide_for_ticker(
    ticker: str,
    q: Dict,
    macro: Dict,
    open_positions: List[Dict],
    config: Dict,
    strategies: List[str],
) -> Optional[Dict[str, Any]]:
    if not q.get("ok") or not q.get("price"):
        return None
    price = q["price"]

    # Check open position for this ticker — manage existing first
    pos = next((p for p in open_positions if p["ticker"] == ticker), None)
    if pos:
        avg = pos.get("avg_price", price)
        pnl_pct = (price - avg) / avg * 100 if avg else 0
        take_profit = config.get("take_profit_pct", 15.0)
        cut_loss = config.get("cut_loss_pct", 7.0)
        if pnl_pct >= take_profit:
            return {"action": "SELL", "ticker": ticker, "qty": pos["qty"], "price": price,
                    "confidence": 85, "reasoning": f"Take profit: +{pnl_pct:.1f}% >= {take_profit}%"}
        if pnl_pct <= -cut_loss:
            return {"action": "SELL", "ticker": ticker, "qty": pos["qty"], "price": price,
                    "confidence": 92, "reasoning": f"Cut loss: {pnl_pct:.1f}% <= -{cut_loss}%"}
        return None  # hold existing

    # No open position — look for entry
    if macro.get("hostile") and macro.get("vix", 0) > config.get("vix_pause_threshold", 27):
        return None

    best_score = 0
    best_reason = ""

    strategy_fns = {
        "momentum": _score_momentum,
        "mean_reversion": _score_mean_reversion,
        "breakout": _score_breakout,
        "trend_follow": _score_trend_follow,
    }

    for strat in strategies:
        fn = strategy_fns.get(strat)
        if fn:
            score, reason = fn(q, macro)
            if score > best_score:
                best_score = score
                best_reason = reason

    # Map score (0-100+) → confidence (0-100)
    confidence = min(int(best_score * 1.1), 99)

    if confidence >= config.get("min_confidence", 65):
        return {"action": "BUY", "ticker": ticker, "qty": None, "price": price,
                "confidence": confidence, "reasoning": best_reason}
    return None


def generate_decisions(
    quotes: Dict[str, Dict],
    macro: Dict,
    open_positions: List[Dict],
    config: Dict,
) -> List[Dict[str, Any]]:
    strategies = config.get("strategies", ["momentum", "mean_reversion"])
    decisions = []
    for ticker, q in quotes.items():
        decision = _decide_for_ticker(ticker, q, macro, open_positions, config, strategies)
        if decision:
            decisions.append(decision)
    # Sort: SELLs first (risk management), then BUYs by confidence desc
    decisions.sort(key=lambda d: (d["action"] != "SELL", -d.get("confidence", 0)))
    return decisions[:8]  # cap at 8 per cycle


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
        open_positions = get_open_positions()
        paper = get_portfolio_summary({t: q.get("price", 0) for t, q in quotes.items()})

        # Auto stop-loss check
        await self._check_stops(open_positions, quotes, cycle_id)

        # Generate decisions via rule engine
        decisions = generate_decisions(quotes, macro, open_positions, self.config)

        executed = 0
        blocked = 0
        for d in decisions:
            action = d["action"].upper()
            ticker = d["ticker"].upper()
            confidence = d.get("confidence", 50)
            price = d.get("price") or quotes.get(ticker, {}).get("price", 0)
            qty = d.get("qty") or self._risk.position_size_shares(ticker, price, paper["total_value"], self.config.get("risk_per_trade_pct", 2.0))

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
            stop = self._risk.compute_stop_loss(price) if self.config.get("auto_stop_loss") else None
            target = round(price * (1 + self.config.get("take_profit_pct", 15) / 100), 2) if self.config.get("auto_take_profit") else None

            if self.config["mode"] == "paper":
                result = execute_paper_trade(ticker=ticker, action=action, qty=qty, price=price, stop_loss=stop, target=target, reason=d.get("reasoning", "")[:400], confidence=confidence)
            else:
                result = {"ok": False, "error": "Live trading not enabled"}

            _save_decision(cycle_id, {**d, "qty": qty, "price": price, "executed": result.get("ok", False), "execution_result": result, "blocked_reason": result.get("error") if not result.get("ok") else None})
            if result.get("ok"):
                executed += 1
                _log("info", f"[{cycle_id}] {action} {qty:.1f}x {ticker} @ ${price:.2f} | {d.get('reasoning','')}")
            else:
                _log("warning", f"[{cycle_id}] FAILED {action} {ticker}: {result.get('error')}")

        summary = {
            "cycle_id": cycle_id,
            "ts": datetime.now(timezone.utc).isoformat(),
            "quotes_fetched": len([q for q in quotes.values() if q.get("ok")]),
            "decisions": len(decisions),
            "executed": executed,
            "blocked": blocked,
            "macro_regime": macro.get("regime"),
            "vix": macro.get("vix"),
            "portfolio_value": paper["total_value"],
            "total_return_pct": paper["total_return_pct"],
        }
        self._last_cycle_ts = summary["ts"]
        self._last_cycle_summary = summary
        _log("info", f"[{cycle_id}] Done: executed={executed}, blocked={blocked}, regime={macro.get('regime')}, portfolio=${paper['total_value']:,.0f} ({paper['total_return_pct']:+.2f}%)")

    async def _check_stops(self, open_positions: List[Dict], quotes: Dict, cycle_id: str):
        for pos in open_positions:
            ticker = pos["ticker"]
            price = quotes.get(ticker, {}).get("price", 0)
            if not price:
                continue
            if self._risk.should_trigger_stop(pos, price):
                _log("warning", f"[{cycle_id}] STOP-LOSS: {ticker} @ ${price:.2f} (avg ${pos['avg_price']:.2f})")
                result = execute_paper_trade(ticker=ticker, action="SELL", qty=pos["qty"], price=price, reason="AUTO STOP-LOSS", confidence=99)
                _save_decision(cycle_id, {"ticker": ticker, "action": "SELL", "qty": pos["qty"], "price": price, "confidence": 99, "reasoning": "Auto stop-loss triggered", "executed": result.get("ok", False), "execution_result": result})


agent = AutonomousAgent()
