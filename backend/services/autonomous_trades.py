"""
Autonomous Trade Manager — Paper trading specifically for autonomous executor v2.
Tracks trades with strategy, forward_days, entry/exit prices, P&L.
"""
import sqlite3
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from .strategy_config import get_forward_days, get_tier

BASE_DIR = Path(__file__).resolve().parents[1]
DB_PATH = BASE_DIR / "autonomous_trades.sqlite3"


def _connect():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS autonomous_trades (
            trade_id TEXT PRIMARY KEY,
            strategy TEXT NOT NULL,
            ticker TEXT NOT NULL,
            side TEXT NOT NULL,
            entry_price REAL NOT NULL,
            entry_ts TEXT NOT NULL,
            predicted_direction TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            forward_days INTEGER NOT NULL,
            exit_date TEXT,
            exit_price REAL,
            exit_ts TEXT,
            actual_direction TEXT,
            pnl REAL,
            pnl_pct REAL,
            was_correct INTEGER
        )
    """)
    conn.commit()
    return conn


def entry_trade(
    strategy: str,
    ticker: str,
    entry_price: float,
    predicted_direction: str,
    quantity: int,
    side: str = "long",
) -> Dict[str, Any]:
    """Create a new autonomous trade."""
    conn = _connect()
    try:
        trade_id = f"{ticker}_{strategy}_{datetime.now(timezone.utc).timestamp()}"
        forward_days = get_forward_days(strategy)
        entry_ts = datetime.now(timezone.utc).isoformat()
        exit_date = (datetime.now(timezone.utc) + timedelta(days=forward_days)).isoformat()

        conn.execute(
            """INSERT INTO autonomous_trades
               (trade_id, strategy, ticker, side, entry_price, entry_ts, predicted_direction,
                quantity, forward_days, exit_date)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                trade_id,
                strategy,
                ticker,
                side,
                entry_price,
                entry_ts,
                predicted_direction,
                quantity,
                forward_days,
                exit_date,
            ),
        )
        conn.commit()
        return {
            "ok": True,
            "trade_id": trade_id,
            "strategy": strategy,
            "ticker": ticker,
            "side": side,
            "entry_price": entry_price,
            "quantity": quantity,
            "forward_days": forward_days,
            "exit_date": exit_date,
        }
    finally:
        conn.close()


def exit_trade(
    trade_id: str,
    exit_price: float,
    actual_direction: str,
) -> Dict[str, Any]:
    """Close a trade and calculate P&L."""
    conn = _connect()
    try:
        trade = conn.execute("SELECT * FROM autonomous_trades WHERE trade_id=?", (trade_id,)).fetchone()
        if not trade:
            return {"ok": False, "error": f"Trade {trade_id} not found"}

        entry_price = trade["entry_price"]
        quantity = trade["quantity"]
        predicted_direction = trade["predicted_direction"]
        side = trade["side"]

        # Calculate P&L
        if side == "long":
            pnl = (exit_price - entry_price) * quantity
        else:  # short
            pnl = (entry_price - exit_price) * quantity

        pnl_pct = ((exit_price - entry_price) / entry_price * 100) if side == "long" else ((entry_price - exit_price) / entry_price * 100)

        # Check if prediction was correct
        was_correct = (actual_direction == "up" and exit_price > entry_price) or (actual_direction == "down" and exit_price < entry_price)

        exit_ts = datetime.now(timezone.utc).isoformat()

        conn.execute(
            """UPDATE autonomous_trades
               SET exit_price=?, exit_ts=?, actual_direction=?, pnl=?, pnl_pct=?, was_correct=?
               WHERE trade_id=?""",
            (exit_price, exit_ts, actual_direction, round(pnl, 2), round(pnl_pct, 2), int(was_correct), trade_id),
        )
        conn.commit()

        return {
            "ok": True,
            "trade_id": trade_id,
            "strategy": trade["strategy"],
            "ticker": trade["ticker"],
            "entry_price": entry_price,
            "exit_price": exit_price,
            "quantity": quantity,
            "pnl": round(pnl, 2),
            "pnl_pct": round(pnl_pct, 2),
            "was_correct": was_correct,
        }
    finally:
        conn.close()


def get_open_trades() -> Dict[str, Any]:
    """Get all open trades with days remaining."""
    conn = _connect()
    try:
        trades = conn.execute(
            "SELECT * FROM autonomous_trades WHERE exit_ts IS NULL ORDER BY entry_ts DESC"
        ).fetchall()

        open_trades = []
        now = datetime.now(timezone.utc)

        for trade in trades:
            exit_date = datetime.fromisoformat(trade["exit_date"])
            days_remaining = (exit_date - now).days

            open_trades.append({
                "trade_id": trade["trade_id"],
                "strategy": trade["strategy"],
                "ticker": trade["ticker"],
                "side": trade["side"],
                "entry_price": trade["entry_price"],
                "entry_ts": trade["entry_ts"],
                "predicted_direction": trade["predicted_direction"],
                "quantity": trade["quantity"],
                "forward_days": trade["forward_days"],
                "exit_date": trade["exit_date"],
                "days_remaining": days_remaining,
            })

        return {"ok": True, "open_trades": open_trades}
    finally:
        conn.close()


def get_closed_trades(limit: int = 100) -> Dict[str, Any]:
    """Get closed trades with results."""
    conn = _connect()
    try:
        trades = conn.execute(
            "SELECT * FROM autonomous_trades WHERE exit_ts IS NOT NULL ORDER BY exit_ts DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return {"ok": True, "closed_trades": [dict(t) for t in trades]}
    finally:
        conn.close()


def get_performance() -> Dict[str, Any]:
    """Get trading performance stats."""
    conn = _connect()
    try:
        trades = conn.execute("SELECT * FROM autonomous_trades WHERE exit_ts IS NOT NULL").fetchall()

        total_pnl = 0.0
        total_trades = 0
        winning_trades = 0

        tier_stats = {"day": {"pnl": 0, "trades": 0, "wins": 0}, "swing": {"pnl": 0, "trades": 0, "wins": 0}, "long": {"pnl": 0, "trades": 0, "wins": 0}}

        for trade in trades:
            total_pnl += trade["pnl"] or 0
            total_trades += 1
            if trade["was_correct"]:
                winning_trades += 1

            tier = get_tier(trade["strategy"])
            if tier in tier_stats:
                tier_stats[tier]["pnl"] += trade["pnl"] or 0
                tier_stats[tier]["trades"] += 1
                if trade["was_correct"]:
                    tier_stats[tier]["wins"] += 1

        win_rate = (winning_trades / total_trades * 100) if total_trades > 0 else 0

        return {
            "ok": True,
            "total_pnl": round(total_pnl, 2),
            "total_trades": total_trades,
            "winning_trades": winning_trades,
            "win_rate_pct": round(win_rate, 2),
            "tier_stats": tier_stats,
        }
    finally:
        conn.close()


def reset_trades():
    """Clear all trades."""
    conn = _connect()
    try:
        conn.execute("DELETE FROM autonomous_trades")
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()
