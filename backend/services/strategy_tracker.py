"""
Per-strategy performance tracking with Kelly Criterion position sizing.
Persists trade outcomes to SQLite and computes live win rates per strategy.
"""
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

BASE_DIR = Path(__file__).resolve().parents[1]
TRACKER_DB = BASE_DIR / "agent_decisions.sqlite3"


def _conn():
    c = sqlite3.connect(TRACKER_DB, timeout=10)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("""
        CREATE TABLE IF NOT EXISTS strategy_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            strategy TEXT NOT NULL,
            ticker TEXT NOT NULL,
            action TEXT NOT NULL,
            entry_price REAL,
            exit_price REAL,
            qty REAL,
            pnl REAL,
            pnl_pct REAL,
            win INTEGER,   -- 1=win, 0=loss, NULL=open
            cycle_id TEXT
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS pnl_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            portfolio_value REAL NOT NULL,
            cash REAL,
            longs_value REAL,
            shorts_exposure REAL,
            total_return_pct REAL,
            open_longs INTEGER DEFAULT 0,
            open_shorts INTEGER DEFAULT 0
        )
    """)
    c.commit()
    return c


def record_entry(strategy: str, ticker: str, action: str,
                 price: float, qty: float, cycle_id: str = ""):
    """Record when a position is opened."""
    conn = _conn()
    try:
        conn.execute(
            "INSERT INTO strategy_stats(ts,strategy,ticker,action,entry_price,qty,cycle_id) VALUES(?,?,?,?,?,?,?)",
            (datetime.now(timezone.utc).isoformat(), strategy, ticker, action, price, qty, cycle_id),
        )
        conn.commit()
    finally:
        conn.close()


def record_exit(ticker: str, exit_price: float, qty: float, cycle_id: str = ""):
    """Mark the most recent open position for this ticker as closed and compute P&L."""
    conn = _conn()
    try:
        row = conn.execute(
            "SELECT id, action, entry_price, qty FROM strategy_stats WHERE ticker=? AND exit_price IS NULL ORDER BY ts DESC LIMIT 1",
            (ticker,),
        ).fetchone()
        if not row:
            return
        action = row["action"]
        entry = row["entry_price"] or exit_price
        q = row["qty"] or qty
        if action == "BUY":
            pnl = (exit_price - entry) * q
            pnl_pct = (exit_price - entry) / entry * 100 if entry else 0
        else:  # SHORT
            pnl = (entry - exit_price) * q
            pnl_pct = (entry - exit_price) / entry * 100 if entry else 0
        win = 1 if pnl > 0 else 0
        conn.execute(
            "UPDATE strategy_stats SET exit_price=?, pnl=?, pnl_pct=?, win=?, ts=? WHERE id=?",
            (exit_price, round(pnl, 2), round(pnl_pct, 2), win,
             datetime.now(timezone.utc).isoformat(), row["id"]),
        )
        conn.commit()
    finally:
        conn.close()


def get_strategy_stats() -> List[Dict[str, Any]]:
    """Return per-strategy aggregated performance."""
    conn = _conn()
    try:
        rows = conn.execute("""
            SELECT strategy,
                   COUNT(*) AS total_trades,
                   SUM(CASE WHEN win=1 THEN 1 ELSE 0 END) AS wins,
                   SUM(CASE WHEN win=0 THEN 1 ELSE 0 END) AS losses,
                   AVG(CASE WHEN pnl_pct IS NOT NULL THEN pnl_pct END) AS avg_return_pct,
                   SUM(CASE WHEN pnl IS NOT NULL THEN pnl ELSE 0 END) AS total_pnl
            FROM strategy_stats
            WHERE exit_price IS NOT NULL
            GROUP BY strategy
            ORDER BY total_pnl DESC
        """).fetchall()
        out = []
        for r in rows:
            total = r["wins"] + r["losses"]
            win_rate = round(r["wins"] / total * 100, 1) if total else 0
            out.append({
                "strategy": r["strategy"],
                "total_trades": total,
                "wins": r["wins"],
                "losses": r["losses"],
                "win_rate": win_rate,
                "avg_return_pct": round(r["avg_return_pct"] or 0, 2),
                "total_pnl": round(r["total_pnl"] or 0, 2),
                "kelly_pct": _kelly(win_rate / 100, r["avg_return_pct"] or 0),
                "status": "active" if win_rate >= 40 or total < 5 else "underperforming",
            })
        return out
    finally:
        conn.close()


def get_recent_trades(limit: int = 50) -> List[Dict[str, Any]]:
    conn = _conn()
    try:
        rows = conn.execute(
            "SELECT * FROM strategy_stats ORDER BY ts DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def kelly_scale(strategy: str, portfolio_value: float, default_risk_pct: float = 2.0) -> float:
    """
    Kelly-adjusted risk % for a strategy based on recent performance.
    Capped at 4% (2x default) and floored at 0.5% (conservative).
    """
    conn = _conn()
    try:
        row = conn.execute("""
            SELECT COUNT(*) AS n,
                   AVG(CASE WHEN win=1 THEN 1.0 ELSE 0.0 END) AS win_rate,
                   AVG(ABS(pnl_pct)) AS avg_move
            FROM strategy_stats
            WHERE strategy=? AND exit_price IS NOT NULL
        """, (strategy,)).fetchone()
        if not row or (row["n"] or 0) < 10:
            return default_risk_pct  # not enough data yet
        wr = row["win_rate"] or 0.5
        avg_move = row["avg_move"] or 5.0
        k = _kelly(wr, avg_move)
        return max(0.5, min(4.0, k))
    finally:
        conn.close()


def _kelly(win_rate: float, avg_return_pct: float) -> float:
    """Full Kelly: f* = W - (1-W)/R where R = avg_win/avg_loss (approx from avg_return_pct)."""
    if avg_return_pct <= 0 or win_rate <= 0:
        return 1.0
    payoff = avg_return_pct / max(avg_return_pct * 0.5, 1.0)  # approximate R
    kelly = win_rate - (1 - win_rate) / max(payoff, 0.1)
    return round(max(0.5, min(4.0, kelly * 100)), 2)  # as % of portfolio


def save_pnl_snapshot(portfolio_value: float, cash: float = 0,
                       longs_value: float = 0, shorts_exposure: float = 0,
                       total_return_pct: float = 0,
                       open_longs: int = 0, open_shorts: int = 0):
    """Save a portfolio snapshot for the P&L time series chart."""
    conn = _conn()
    try:
        conn.execute(
            "INSERT INTO pnl_snapshots(ts,portfolio_value,cash,longs_value,shorts_exposure,total_return_pct,open_longs,open_shorts) VALUES(?,?,?,?,?,?,?,?)",
            (datetime.now(timezone.utc).isoformat(), portfolio_value, cash,
             longs_value, shorts_exposure, total_return_pct, open_longs, open_shorts),
        )
        conn.commit()
    finally:
        conn.close()


def get_pnl_series(hours: int = 24) -> List[Dict[str, Any]]:
    """Return portfolio value snapshots for last N hours."""
    conn = _conn()
    try:
        rows = conn.execute("""
            SELECT ts, portfolio_value, cash, total_return_pct, open_longs, open_shorts
            FROM pnl_snapshots
            WHERE ts >= datetime('now', ?)
            ORDER BY ts ASC
        """, (f"-{hours} hours",)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_hourly_stats(hours: int = 24) -> List[Dict[str, Any]]:
    """Return per-hour decision and execution counts for the last N hours."""
    conn = _conn()
    try:
        rows = conn.execute("""
            SELECT strftime('%H', ts) AS hour,
                   COUNT(*) AS decisions,
                   SUM(executed) AS executed,
                   SUM(CASE WHEN blocked_reason IS NOT NULL THEN 1 ELSE 0 END) AS blocked
            FROM decisions
            WHERE ts >= datetime('now', ?)
            GROUP BY strftime('%H', ts)
            ORDER BY hour
        """, (f"-{hours} hours",)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_today_summary() -> Dict[str, Any]:
    """High-level stats for today."""
    conn = _conn()
    try:
        row = conn.execute("""
            SELECT COUNT(*) AS total_decisions,
                   SUM(executed) AS executed,
                   SUM(CASE WHEN blocked_reason IS NOT NULL THEN 1 ELSE 0 END) AS blocked,
                   COUNT(DISTINCT ticker) AS tickers_touched
            FROM decisions
            WHERE ts >= datetime('now', 'start of day')
        """).fetchone()
        return dict(row) if row else {}
    finally:
        conn.close()
