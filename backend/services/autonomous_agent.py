"""
Autonomous Trading Agent — AI brain using Claude claude-sonnet-4-6.
Cycle: fetch market data → analyze → decide → risk-check → paper execute → log.
"""
import asyncio
import json
import logging
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import anthropic

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
    "strategies": ["momentum", "mean_reversion", "macro_aligned"],
    "risk_per_trade_pct": 2.0,
    "max_position_pct": 20.0,
    "stop_loss_pct": 8.0,
    "daily_loss_limit_pct": 3.0,
    "vix_pause_threshold": 27.0,
    "min_confidence": 65,
    "auto_stop_loss": True,
    "auto_take_profit": True,
}


def _log_db():
    conn = sqlite3.connect(LOG_DB)
    conn.row_factory = sqlite3.Row
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
        rows = conn.execute(
            "SELECT * FROM decisions ORDER BY ts DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_agent_log(limit: int = 100) -> List[Dict[str, Any]]:
    conn = _log_db()
    try:
        rows = conn.execute(
            "SELECT * FROM agent_log ORDER BY ts DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


class AutonomousAgent:
    def __init__(self):
        self.config: Dict[str, Any] = {**DEFAULT_CONFIG}
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._cycle_count = 0
        self._last_cycle_ts: Optional[str] = None
        self._last_cycle_summary: Optional[Dict[str, Any]] = None
        self._risk = RiskManager()
        self._client: Optional[anthropic.AsyncAnthropic] = None

    def _get_client(self) -> anthropic.AsyncAnthropic:
        if self._client is None:
            api_key = os.getenv("ANTHROPIC_API_KEY")
            if not api_key:
                raise RuntimeError("ANTHROPIC_API_KEY not set. Add it to your .env file.")
            self._client = anthropic.AsyncAnthropic(api_key=api_key)
        return self._client

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
        _log("info", f"Autonomous agent started. Mode={self.config['mode']}, Cycle={self.config['cycle_minutes']}m")
        return {"ok": True, "message": "Agent started", "config": self.config}

    def stop(self) -> Dict[str, Any]:
        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None
        _log("info", "Autonomous agent stopped.")
        return {"ok": True, "message": "Agent stopped"}

    def status(self) -> Dict[str, Any]:
        paper = get_portfolio_summary()
        return {
            "running": self._running,
            "mode": self.config["mode"],
            "cycle_count": self._cycle_count,
            "last_cycle": self._last_cycle_ts,
            "last_summary": self._last_cycle_summary,
            "config": self.config,
            "paper_portfolio": paper,
        }

    async def _run_loop(self):
        _log("info", "Agent loop started.")
        while self._running:
            try:
                await self._run_cycle()
            except asyncio.CancelledError:
                break
            except Exception as e:
                _log("error", f"Cycle error: {e}")
            interval = self.config.get("cycle_minutes", 15) * 60
            await asyncio.sleep(interval)

    async def _run_cycle(self):
        self._cycle_count += 1
        cycle_id = f"c{self._cycle_count}_{datetime.now(timezone.utc).strftime('%H%M%S')}"
        _log("info", f"[{cycle_id}] Cycle start")

        universe = self.config.get("universe", UNIVERSE)
        quotes = await fetch_quotes(universe)
        macro = await fetch_macro()
        news = await fetch_news_sentiment(universe[:8])
        open_positions = get_open_positions()
        paper_summary = get_portfolio_summary({t: q.get("price", 0) for t, q in quotes.items()})

        # Check stops on open positions
        await self._check_stops(open_positions, quotes, cycle_id)

        # Build context for Claude
        context = self._build_context(quotes, macro, news, paper_summary, open_positions)

        # Ask Claude for decisions
        decisions = await self._ask_claude(context, cycle_id)

        executed = 0
        blocked = 0
        for d in decisions:
            action = d.get("action", "HOLD").upper()
            ticker = d.get("ticker", "").upper()
            confidence = int(d.get("confidence", 50))

            if action == "HOLD" or not ticker:
                _save_decision(cycle_id, {**d, "action": "HOLD", "executed": False})
                continue
            if confidence < self.config.get("min_confidence", 65):
                _save_decision(cycle_id, {**d, "executed": False, "blocked_reason": f"Confidence {confidence} < min {self.config['min_confidence']}"})
                blocked += 1
                continue

            price = quotes.get(ticker, {}).get("price", d.get("price", 0))
            qty = d.get("qty") or self._risk.position_size_shares(ticker, price, paper_summary["total_value"], self.config.get("risk_per_trade_pct", 2.0))

            mock_portfolio = {
                "total_value": paper_summary["total_value"],
                "cash": paper_summary["cash"],
                "positions": [{"symbol": p["ticker"], "market_value": p["market_value"], "portfolio_pct": p["market_value"] / paper_summary["total_value"] * 100, "qty": p["qty"]} for p in paper_summary["positions"]],
                "daily_pnl_pct": 0,
            }
            risk_check = self._risk.check_trade(action, ticker, qty, price, mock_portfolio, macro)

            if not risk_check["approved"]:
                _save_decision(cycle_id, {**d, "executed": False, "blocked_reason": "; ".join(risk_check["reasons"])})
                blocked += 1
                _log("warning", f"[{cycle_id}] {action} {ticker} BLOCKED: {risk_check['reasons']}")
                continue

            qty = risk_check["adjusted_qty"]
            stop = self._risk.compute_stop_loss(price) if self.config.get("auto_stop_loss") else d.get("stop_loss")
            target = price * 1.15 if self.config.get("auto_take_profit") else d.get("target")

            if self.config["mode"] == "paper":
                result = execute_paper_trade(
                    ticker=ticker,
                    action=action,
                    qty=qty,
                    price=price,
                    stop_loss=stop,
                    target=target,
                    reason=d.get("reasoning", "")[:500],
                    confidence=confidence,
                )
            else:
                result = {"ok": False, "error": "Live trading not yet enabled"}

            _save_decision(cycle_id, {**d, "qty": qty, "price": price, "executed": result.get("ok", False), "execution_result": result, "blocked_reason": result.get("error") if not result.get("ok") else None})
            if result.get("ok"):
                executed += 1
                _log("info", f"[{cycle_id}] EXECUTED {action} {qty:.2f}x {ticker} @ ${price:.2f}")
            else:
                _log("warning", f"[{cycle_id}] FAILED {action} {ticker}: {result.get('error')}")

        summary = {
            "cycle_id": cycle_id,
            "ts": datetime.now(timezone.utc).isoformat(),
            "decisions": len(decisions),
            "executed": executed,
            "blocked": blocked,
            "macro_regime": macro.get("regime"),
            "vix": macro.get("vix"),
        }
        self._last_cycle_ts = summary["ts"]
        self._last_cycle_summary = summary
        _log("info", f"[{cycle_id}] Done: {executed} executed, {blocked} blocked")

    async def _check_stops(self, open_positions: List[Dict], quotes: Dict, cycle_id: str):
        for pos in open_positions:
            ticker = pos["ticker"]
            q = quotes.get(ticker, {})
            price = q.get("price", 0)
            if not price:
                continue
            if self._risk.should_trigger_stop(pos, price):
                _log("warning", f"[{cycle_id}] STOP TRIGGERED: {ticker} @ ${price:.2f} (avg ${pos['avg_price']:.2f})")
                result = execute_paper_trade(ticker=ticker, action="SELL", qty=pos["qty"], price=price, reason="AUTO STOP-LOSS TRIGGERED", confidence=99)
                _save_decision(cycle_id, {"ticker": ticker, "action": "SELL", "qty": pos["qty"], "price": price, "confidence": 99, "reasoning": "Auto stop-loss triggered", "executed": result.get("ok", False), "execution_result": result})

    def _build_context(self, quotes: Dict, macro: Dict, news: Dict, paper: Dict, open_pos: List) -> str:
        lines = [
            "=== MARKET DATA ===",
        ]
        for ticker, q in quotes.items():
            if q.get("ok"):
                rsi_str = f", RSI={q['rsi']}" if q.get("rsi") else ""
                lines.append(f"{ticker}: ${q['price']:.2f} ({q['change_pct']:+.2f}%), RVOL={q.get('rvol',1):.1f}, SMA20={'above' if q.get('above_sma20') else 'below'}{rsi_str}")
        lines += [
            "",
            "=== MACRO ===",
            f"Regime: {macro.get('regime')} | VIX={macro.get('vix')} | US10Y={macro.get('us10y')} | DXY={macro.get('dxy')}",
            f"SP500: {macro.get('sp500_chg',0):+.2f}% | NDX: {macro.get('ndx_chg',0):+.2f}%",
            f"Hostile: {macro.get('hostile', False)}",
            "",
            "=== PAPER PORTFOLIO ===",
            f"Total: ${paper.get('total_value',0):,.0f} | Cash: ${paper.get('cash',0):,.0f} ({paper.get('cash',0)/max(paper.get('total_value',1),1)*100:.1f}%)",
            f"Total Return: {paper.get('total_return_pct',0):+.2f}% | Realized P&L: ${paper.get('realized_pnl',0):+,.0f}",
        ]
        if paper.get("positions"):
            lines.append("Open positions:")
            for p in paper["positions"]:
                lines.append(f"  {p['ticker']}: {p['qty']:.2f}sh @ avg ${p['avg_price']:.2f} | now ${p['current_price']:.2f} | PnL: {p['unrealized_pct']:+.1f}%")
        if news:
            lines += ["", "=== TOP NEWS HEADLINES ==="]
            for ticker, items in news.items():
                if items:
                    lines.append(f"{ticker}: {items[0]['title'][:100]}")
        return "\n".join(lines)

    async def _ask_claude(self, context: str, cycle_id: str) -> List[Dict[str, Any]]:
        client = self._get_client()
        strategies = self.config.get("strategies", ["momentum"])
        universe = self.config.get("universe", UNIVERSE)
        prompt = f"""You are an elite autonomous trading agent managing a paper portfolio.
Your goal: maximize risk-adjusted returns using disciplined, rules-based decisions.

STRATEGIES ACTIVE: {', '.join(strategies)}
UNIVERSE: {', '.join(universe)}

CURRENT MARKET SNAPSHOT:
{context}

DECISION RULES:
1. MOMENTUM: If price > SMA20, RVOL > 1.3, RSI 50-70, change_pct > 1% → BUY with confidence 70-85
2. MEAN REVERSION: If RSI < 35, price below SMA20 but macro not hostile → BUY with confidence 65-75
3. TAKE PROFIT: If open position unrealized PnL > +15% → SELL with confidence 80
4. CUT LOSERS: If open position unrealized PnL < -7% → SELL with confidence 90
5. AVOID: If VIX > 27 or regime is RISK_OFF → no new BUYs
6. HOLD CASH: If no high-conviction setup, return HOLD

Return a JSON array of decisions. Each decision:
{{
  "action": "BUY"|"SELL"|"HOLD",
  "ticker": "SYMBOL",
  "qty": null,
  "confidence": 0-100,
  "reasoning": "concise reason (1-2 sentences)"
}}

Return 3-8 decisions maximum. Prefer quality over quantity.
Be conservative with cash. Only BUY when you have strong conviction (>= 70).
Return ONLY the JSON array, no other text."""

        try:
            msg = await client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=1024,
                messages=[{"role": "user", "content": prompt}],
            )
            text = msg.content[0].text.strip()
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            decisions = json.loads(text)
            if not isinstance(decisions, list):
                decisions = [decisions]
            _log("info", f"[{cycle_id}] Claude returned {len(decisions)} decisions")
            return decisions
        except json.JSONDecodeError as e:
            _log("error", f"[{cycle_id}] Claude JSON parse error: {e}")
            return []
        except Exception as e:
            _log("error", f"[{cycle_id}] Claude API error: {e}")
            return []


agent = AutonomousAgent()
