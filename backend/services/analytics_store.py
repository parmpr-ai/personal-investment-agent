"""
Portfolio analytics persistence layer.
DB: backend/pia_analytics.sqlite3
Tables: executions, position_snapshots, portfolio_snapshots
"""
from __future__ import annotations

import re
import sqlite3
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).resolve().parents[1] / "pia_analytics.sqlite3"


# ─── DB SETUP ────────────────────────────────────────────────────────────────

def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS executions (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            execution_id   TEXT    UNIQUE NOT NULL,
            symbol         TEXT    NOT NULL,
            underlying     TEXT    NOT NULL,
            sec_type       TEXT    NOT NULL DEFAULT 'STK',
            side           TEXT    NOT NULL,
            quantity       REAL    NOT NULL,
            price          REAL    NOT NULL,
            execution_time TEXT    NOT NULL,
            commission     REAL,
            currency       TEXT    NOT NULL DEFAULT 'USD',
            account        TEXT,
            order_id       TEXT,
            realized_pnl   REAL,
            imported_at    TEXT    NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS position_snapshots (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            snapshot_date  TEXT    NOT NULL,
            symbol         TEXT    NOT NULL,
            underlying     TEXT    NOT NULL,
            sec_type       TEXT    NOT NULL DEFAULT 'STK',
            quantity       REAL    NOT NULL,
            avg_cost       REAL    NOT NULL,
            last_price     REAL,
            market_value   REAL    NOT NULL,
            cost_basis     REAL    NOT NULL,
            unrealized_pnl REAL    NOT NULL,
            realized_pnl   REAL,
            unrealized_pct REAL,
            portfolio_pct  REAL,
            created_at     TEXT    NOT NULL,
            UNIQUE(snapshot_date, symbol)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS portfolio_snapshots (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            snapshot_date  TEXT    NOT NULL UNIQUE,
            total_value    REAL    NOT NULL,
            cash           REAL,
            buying_power   REAL,
            margin_used    REAL,
            daily_pnl      REAL,
            unrealized     REAL,
            created_at     TEXT    NOT NULL
        )
    """)
    return conn


# ─── HELPERS ─────────────────────────────────────────────────────────────────

def _num(v: Any, default: float = 0.0) -> float:
    try:
        return float(v) if v not in (None, "") else default
    except (TypeError, ValueError):
        return default


def _now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─── EXECUTIONS ──────────────────────────────────────────────────────────────

def store_executions(fills: list[dict[str, Any]]) -> dict[str, int]:
    """
    Persist normalized execution fills. Deduplicates on execution_id.
    Returns {'stored': N, 'duplicates': N}.
    """
    stored = 0
    duplicates = 0
    now = _now_utc()
    with _connect() as conn:
        for fill in fills:
            try:
                cur = conn.execute(
                    """
                    INSERT OR IGNORE INTO executions
                    (execution_id, symbol, underlying, sec_type, side, quantity, price,
                     execution_time, commission, currency, account, order_id, realized_pnl,
                     imported_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        fill["execution_id"],
                        fill["symbol"],
                        fill["underlying"],
                        fill.get("sec_type") or "STK",
                        fill["side"],
                        _num(fill["quantity"]),
                        _num(fill["price"]),
                        fill["execution_time"],
                        fill.get("commission"),
                        fill.get("currency") or "USD",
                        fill.get("account"),
                        fill.get("order_id"),
                        fill.get("realized_pnl"),
                        now,
                    ),
                )
                if cur.rowcount > 0:
                    stored += 1
                else:
                    duplicates += 1
            except Exception:
                pass
    return {"stored": stored, "duplicates": duplicates}


def get_executions(symbol: str | None = None) -> list[dict[str, Any]]:
    """Return persisted executions, optionally filtered by symbol/underlying."""
    with _connect() as conn:
        if symbol:
            sym = symbol.upper()
            rows = conn.execute(
                """
                SELECT * FROM executions
                WHERE upper(symbol) = ? OR upper(underlying) = ?
                ORDER BY execution_time DESC
                """,
                (sym, sym),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM executions ORDER BY execution_time DESC"
            ).fetchall()
    return [dict(r) for r in rows]


# ─── POSITION SNAPSHOTS ───────────────────────────────────────────────────────

def store_position_snapshot(snapshot_date: str, position: dict[str, Any], force: bool = False) -> bool:
    """
    Store a single position snapshot. IGNORE duplicates unless force=True (REPLACE).
    Returns True if a row was written.
    """
    verb = "INSERT OR REPLACE" if force else "INSERT OR IGNORE"
    now = _now_utc()
    with _connect() as conn:
        cur = conn.execute(
            f"""
            {verb} INTO position_snapshots
            (snapshot_date, symbol, underlying, sec_type, quantity, avg_cost, last_price,
             market_value, cost_basis, unrealized_pnl, realized_pnl, unrealized_pct,
             portfolio_pct, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                snapshot_date,
                position.get("symbol") or "",
                position.get("underlying") or position.get("symbol") or "",
                position.get("sec_type") or "STK",
                _num(position.get("qty") or position.get("quantity")),
                _num(position.get("avg_price") or position.get("avg_cost")),
                _num(position.get("last")),
                _num(position.get("market_value")),
                _num(position.get("cost_basis")),
                _num(position.get("unrealized")),
                _num(position.get("realized")),
                _num(position.get("unrealized_pct")),
                _num(position.get("portfolio_pct")),
                now,
            ),
        )
    return cur.rowcount > 0


# ─── PORTFOLIO SNAPSHOTS ──────────────────────────────────────────────────────

def store_portfolio_snapshot(snapshot_date: str, portfolio: dict[str, Any], force: bool = False) -> bool:
    """
    Store a daily portfolio-level snapshot. IGNORE duplicates unless force=True.
    Returns True if a row was written.
    """
    verb = "INSERT OR REPLACE" if force else "INSERT OR IGNORE"
    now = _now_utc()
    with _connect() as conn:
        cur = conn.execute(
            f"""
            {verb} INTO portfolio_snapshots
            (snapshot_date, total_value, cash, buying_power, margin_used,
             daily_pnl, unrealized, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                snapshot_date,
                _num(portfolio.get("total_value")),
                _num(portfolio.get("cash")),
                _num(portfolio.get("buying_power")),
                _num(portfolio.get("margin_used")),
                _num(portfolio.get("daily_pnl")),
                _num(portfolio.get("unrealized")),
                now,
            ),
        )
    return cur.rowcount > 0


# ─── SNAPSHOT CAPTURE ────────────────────────────────────────────────────────

def capture_portfolio_snapshot(portfolio: dict[str, Any] | None = None, force: bool = False) -> dict[str, Any]:
    """
    Capture today's portfolio and per-position snapshots.

    Accepts an already-fetched portfolio dict or None (will attempt IBKR fetch).
    Safe to call multiple times — INSERT OR IGNORE prevents same-day duplicates
    unless force=True.
    """
    if portfolio is None:
        try:
            from services.ibkr_service import get_ibkr_portfolio
            portfolio = get_ibkr_portfolio()
        except Exception as exc:
            return {"ok": False, "error": f"Portfolio fetch failed: {exc}"}

    today = date.today().isoformat()
    portfolio_written = store_portfolio_snapshot(today, portfolio, force=force)

    positions = portfolio.get("positions") or []
    pos_created = 0
    pos_skipped = 0
    for pos in positions:
        if store_position_snapshot(today, pos, force=force):
            pos_created += 1
        else:
            pos_skipped += 1

    return {
        "ok": True,
        "snapshot_date": today,
        "portfolio_snapshot": "created" if portfolio_written else "skipped (exists)",
        "position_snapshots": {"created": pos_created, "skipped": pos_skipped},
        "source": portfolio.get("source", "unknown"),
    }


# ─── ANALYTICS ────────────────────────────────────────────────────────────────

def _range_cutoff(range_str: str) -> str | None:
    """Return ISO date string for the earliest date of the given range, None for ALL."""
    today = date.today()
    _deltas: dict[str, timedelta] = {
        "1W": timedelta(weeks=1),
        "1M": timedelta(days=30),
        "3M": timedelta(days=90),
        "1Y": timedelta(days=365),
    }
    r = range_str.upper()
    if r in _deltas:
        return (today - _deltas[r]).isoformat()
    if r == "YTD":
        return date(today.year, 1, 1).isoformat()
    return None  # ALL


def get_position_history(symbol: str, range_str: str = "ALL") -> dict[str, Any]:
    """
    Build position history response: value series, trades, summary.
    Returns structured response with data_quality field ('complete'|'partial'|'no_data').
    """
    sym = symbol.upper()
    cutoff = _range_cutoff(range_str)

    with _connect() as conn:
        # Position value series from snapshots
        if cutoff:
            snap_rows = conn.execute(
                """
                SELECT snapshot_date, quantity, avg_cost, last_price,
                       market_value, cost_basis, unrealized_pnl
                FROM position_snapshots
                WHERE (upper(symbol) = ? OR upper(underlying) = ?)
                  AND snapshot_date >= ?
                ORDER BY snapshot_date ASC
                """,
                (sym, sym, cutoff),
            ).fetchall()
        else:
            snap_rows = conn.execute(
                """
                SELECT snapshot_date, quantity, avg_cost, last_price,
                       market_value, cost_basis, unrealized_pnl
                FROM position_snapshots
                WHERE upper(symbol) = ? OR upper(underlying) = ?
                ORDER BY snapshot_date ASC
                """,
                (sym, sym),
            ).fetchall()

        # Trade history (executions) for range
        if cutoff:
            trade_rows = conn.execute(
                """
                SELECT execution_time, side, quantity, price, commission, realized_pnl
                FROM executions
                WHERE (upper(symbol) = ? OR upper(underlying) = ?)
                  AND execution_time >= ?
                ORDER BY execution_time ASC
                """,
                (sym, sym, cutoff),
            ).fetchall()
        else:
            trade_rows = conn.execute(
                """
                SELECT execution_time, side, quantity, price, commission, realized_pnl
                FROM executions
                WHERE upper(symbol) = ? OR upper(underlying) = ?
                ORDER BY execution_time ASC
                """,
                (sym, sym),
            ).fetchall()

        # First buy ever (all-time, not range-limited)
        first_buy_row = conn.execute(
            """
            SELECT MIN(execution_time) AS first_buy
            FROM executions
            WHERE (upper(symbol) = ? OR upper(underlying) = ?) AND side = 'BUY'
            """,
            (sym, sym),
        ).fetchone()

    # Build position value series
    position_value_series = [
        {
            "date": r["snapshot_date"],
            "market_value": round(_num(r["market_value"]), 2),
            "quantity": _num(r["quantity"]),
            "avg_cost": round(_num(r["avg_cost"]), 4),
            "unrealized_pnl": round(_num(r["unrealized_pnl"]), 2),
        }
        for r in snap_rows
    ]

    # Build trades list
    trades = [
        {
            "date": r["execution_time"][:10] if r["execution_time"] else None,
            "datetime": r["execution_time"],
            "side": r["side"],
            "quantity": _num(r["quantity"]),
            "price": round(_num(r["price"]), 4),
            "commission": _num(r["commission"]) if r["commission"] is not None else None,
            "realized_pnl": _num(r["realized_pnl"]) if r["realized_pnl"] is not None else None,
        }
        for r in trade_rows
    ]

    # Summary calculations
    first_buy_date = None
    if first_buy_row and first_buy_row["first_buy"]:
        raw = first_buy_row["first_buy"]
        first_buy_date = raw[:10] if len(raw) >= 10 else raw

    total_return = None
    total_return_pct = None
    if position_value_series:
        last = position_value_series[-1]
        total_return = last["unrealized_pnl"]
        cost = _num(snap_rows[-1]["cost_basis"]) if snap_rows else 0.0
        if cost:
            total_return_pct = round(total_return / cost * 100, 2)
        total_return = round(total_return, 2)

    # Best / worst day (requires ≥2 consecutive snapshots)
    best_day: dict[str, Any] | None = None
    worst_day: dict[str, Any] | None = None
    if len(position_value_series) >= 2:
        daily_changes = [
            {
                "date": position_value_series[i]["date"],
                "change": round(
                    position_value_series[i]["market_value"]
                    - position_value_series[i - 1]["market_value"],
                    2,
                ),
            }
            for i in range(1, len(position_value_series))
        ]
        if daily_changes:
            best_day = max(daily_changes, key=lambda x: x["change"])
            worst_day = min(daily_changes, key=lambda x: x["change"])

    # Aggregate trade analytics
    buys = [t for t in trades if t["side"] == "BUY"]
    sells = [t for t in trades if t["side"] == "SELL"]
    total_bought = sum(t["quantity"] for t in buys)
    total_sold = sum(t["quantity"] for t in sells)
    avg_buy_price = (
        round(sum(t["price"] * t["quantity"] for t in buys) / total_bought, 4)
        if total_bought else None
    )
    avg_sell_price = (
        round(sum(t["price"] * t["quantity"] for t in sells) / total_sold, 4)
        if total_sold else None
    )
    total_realized = sum(
        t["realized_pnl"] for t in trades if t["realized_pnl"] is not None
    ) or None

    # Data quality
    if not position_value_series and not trades:
        data_quality = "no_data"
    elif len(position_value_series) < 5:
        data_quality = "partial"
    else:
        data_quality = "complete"

    return {
        "symbol": sym,
        "range": range_str.upper(),
        "data_quality": data_quality,
        "position_value_series": position_value_series,
        "trades": trades,
        "summary": {
            "first_buy_date": first_buy_date,
            "total_return": total_return,
            "total_return_pct": total_return_pct,
            "best_day": best_day,
            "worst_day": worst_day,
            "snapshot_count": len(position_value_series),
            "trade_count": len(trades),
            "total_quantity_bought": total_bought if buys else None,
            "total_quantity_sold": total_sold if sells else None,
            "avg_buy_price": avg_buy_price,
            "avg_sell_price": avg_sell_price,
            "total_realized_pnl": round(total_realized, 2) if total_realized is not None else None,
        },
    }
