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
    Half-Kelly risk % for a strategy based on live win/loss statistics.

    Uses separate avg_win and avg_loss from actual trade outcomes.
    Half-Kelly (f*/2) reduces variance while preserving positive expected edge.
    Caps at 2× default (4% max) and floors at 0.5%.
    Falls back to default_risk_pct when fewer than 10 closed trades exist.
    """
    conn = _conn()
    try:
        row = conn.execute("""
            SELECT
                COUNT(*)                                           AS n,
                AVG(CASE WHEN win=1 THEN 1.0 ELSE 0.0 END)       AS win_rate,
                AVG(CASE WHEN win=1 THEN ABS(pnl_pct) ELSE NULL END) AS avg_win_pct,
                AVG(CASE WHEN win=0 THEN ABS(pnl_pct) ELSE NULL END) AS avg_loss_pct
            FROM strategy_stats
            WHERE strategy=? AND exit_price IS NOT NULL AND pnl_pct IS NOT NULL
        """, (strategy,)).fetchone()
        n = row["n"] if row else 0
        if n < 10:
            return default_risk_pct
        wr = row["win_rate"] or 0.5
        avg_win  = row["avg_win_pct"]  or 5.0
        avg_loss = row["avg_loss_pct"] or 5.0
        k = _kelly_half(wr, avg_win, avg_loss)
        return max(0.5, min(default_risk_pct * 2, k))
    finally:
        conn.close()


def kelly_diagnostics(strategy: str) -> Dict[str, Any]:
    """Return Kelly diagnostics for a strategy (for API/debug use)."""
    conn = _conn()
    try:
        row = conn.execute("""
            SELECT
                COUNT(*) AS n,
                AVG(CASE WHEN win=1 THEN 1.0 ELSE 0.0 END)           AS win_rate,
                AVG(CASE WHEN win=1 THEN ABS(pnl_pct) ELSE NULL END)  AS avg_win_pct,
                AVG(CASE WHEN win=0 THEN ABS(pnl_pct) ELSE NULL END)  AS avg_loss_pct,
                SUM(CASE WHEN win=1 THEN 1 ELSE 0 END)                AS wins,
                SUM(CASE WHEN win=0 THEN 1 ELSE 0 END)                AS losses
            FROM strategy_stats
            WHERE strategy=? AND exit_price IS NOT NULL AND pnl_pct IS NOT NULL
        """, (strategy,)).fetchone()
        n = row["n"] if row else 0
        if n < 10:
            return {"strategy": strategy, "trades": n, "status": "insufficient_data",
                    "kelly_pct": None, "half_kelly_pct": None}
        wr = row["win_rate"] or 0.5
        avg_win  = row["avg_win_pct"]  or 5.0
        avg_loss = row["avg_loss_pct"] or 5.0
        full_k = _kelly_full(wr, avg_win, avg_loss)
        half_k = full_k / 2
        return {
            "strategy": strategy,
            "trades": n,
            "wins": row["wins"],
            "losses": row["losses"],
            "win_rate_pct": round(wr * 100, 1),
            "avg_win_pct": round(avg_win, 2),
            "avg_loss_pct": round(avg_loss, 2),
            "payoff_ratio": round(avg_win / max(avg_loss, 0.01), 2),
            "full_kelly_pct": round(full_k, 2),
            "half_kelly_pct": round(half_k, 2),
            "recommended_risk_pct": round(max(0.5, min(4.0, half_k)), 2),
            "status": "ok" if full_k > 0 else "negative_edge",
        }
    finally:
        conn.close()


def _kelly_full(win_rate: float, avg_win_pct: float, avg_loss_pct: float) -> float:
    """
    Full Kelly fraction as % of portfolio.
    f* = W/L_avg - (1-W)/W_avg  (continuous approximation)
    where W = win_rate, W_avg = avg_win%, L_avg = avg_loss%
    """
    if avg_win_pct <= 0 or avg_loss_pct <= 0 or win_rate <= 0:
        return 0.0
    payoff_ratio = avg_win_pct / avg_loss_pct  # R = avg_win / avg_loss
    kelly = win_rate - (1 - win_rate) / max(payoff_ratio, 0.01)
    return round(kelly * 100, 2)  # as % of portfolio


def _kelly_half(win_rate: float, avg_win_pct: float, avg_loss_pct: float) -> float:
    """Half-Kelly: f*/2 — same edge, roughly half the variance."""
    return _kelly_full(win_rate, avg_win_pct, avg_loss_pct) / 2


def _kelly(win_rate: float, avg_return_pct: float) -> float:
    """Legacy approximation (kept for backward compatibility)."""
    if avg_return_pct <= 0 or win_rate <= 0:
        return 1.0
    payoff = avg_return_pct / max(avg_return_pct * 0.5, 1.0)
    kelly = win_rate - (1 - win_rate) / max(payoff, 0.1)
    return round(max(0.5, min(4.0, kelly * 100)), 2)


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
