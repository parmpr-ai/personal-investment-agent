import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

BASE_DIR = Path(__file__).resolve().parents[1]
DB_PATH = BASE_DIR / "paper_trading.sqlite3"

INITIAL_CASH = 100_000.0


def _connect():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS paper_book (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL,
            action TEXT NOT NULL,
            qty REAL NOT NULL,
            price REAL NOT NULL,
            stop_loss REAL,
            target REAL,
            reason TEXT,
            confidence INTEGER,
            ts TEXT NOT NULL,
            closed INTEGER DEFAULT 0,
            close_price REAL,
            close_ts TEXT,
            pnl REAL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS paper_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)
    conn.commit()
    return conn


def _get_cash(conn) -> float:
    row = conn.execute("SELECT value FROM paper_state WHERE key='cash'").fetchone()
    return float(row["value"]) if row else INITIAL_CASH


def _set_cash(conn, cash: float):
    conn.execute("INSERT OR REPLACE INTO paper_state(key,value) VALUES('cash',?)", (str(cash),))


def reset_book(initial_cash: float = INITIAL_CASH):
    conn = _connect()
    try:
        conn.execute("DELETE FROM paper_book")
        _set_cash(conn, initial_cash)
        conn.commit()
    finally:
        conn.close()
    return {"ok": True, "cash": initial_cash}


def execute_paper_trade(
    ticker: str,
    action: str,
    qty: float,
    price: float,
    stop_loss: Optional[float] = None,
    target: Optional[float] = None,
    reason: str = "",
    confidence: int = 50,
) -> Dict[str, Any]:
    if action not in ("BUY", "SELL", "SHORT"):
        return {"ok": False, "error": f"Unknown action: {action}"}
    if qty <= 0 or price <= 0:
        return {"ok": False, "error": "Invalid qty or price"}

    conn = _connect()
    try:
        cash = _get_cash(conn)
        ts = datetime.now(timezone.utc).isoformat()

        if action == "BUY":
            cost = qty * price
            if cost > cash:
                return {"ok": False, "error": f"Insufficient paper cash: need ${cost:.2f}, have ${cash:.2f}"}
            _set_cash(conn, cash - cost)
            conn.execute(
                "INSERT INTO paper_book(ticker,action,qty,price,stop_loss,target,reason,confidence,ts) VALUES(?,?,?,?,?,?,?,?,?)",
                (ticker, action, qty, price, stop_loss, target, reason, confidence, ts),
            )
            conn.commit()
            return {"ok": True, "action": action, "ticker": ticker, "qty": qty, "price": price,
                    "cost": round(cost, 2), "cash_remaining": round(cash - cost, 2)}

        elif action == "SELL":
            open_buys = conn.execute(
                "SELECT id, qty, price FROM paper_book WHERE ticker=? AND action='BUY' AND closed=0 ORDER BY ts ASC",
                (ticker,),
            ).fetchall()
            if not open_buys:
                return {"ok": False, "error": f"No open BUY position for {ticker}"}
            remaining = qty
            total_pnl = 0.0
            for row in open_buys:
                if remaining <= 0:
                    break
                sell_qty = min(remaining, row["qty"])
                pnl = (price - row["price"]) * sell_qty
                total_pnl += pnl
                remaining -= sell_qty
                if sell_qty >= row["qty"]:
                    conn.execute(
                        "UPDATE paper_book SET closed=1, close_price=?, close_ts=?, pnl=? WHERE id=?",
                        (price, ts, round(pnl, 2), row["id"]),
                    )
                else:
                    conn.execute("UPDATE paper_book SET qty=qty-? WHERE id=?", (sell_qty, row["id"]))
                    conn.execute(
                        "INSERT INTO paper_book(ticker,action,qty,price,stop_loss,target,reason,confidence,ts,closed,close_price,close_ts,pnl) VALUES(?,?,?,?,?,?,?,?,?,1,?,?,?)",
                        (ticker, "BUY", sell_qty, row["price"], None, None, f"Partial close", confidence, row["ts"], price, ts, round(pnl, 2)),
                    )
            _set_cash(conn, cash + qty * price)
            conn.commit()
            return {"ok": True, "action": action, "ticker": ticker, "qty": qty, "price": price,
                    "pnl": round(total_pnl, 2), "cash_remaining": round(cash + qty * price, 2)}
    finally:
        conn.close()
    return {"ok": False, "error": "Unknown error"}


def get_open_positions() -> List[Dict[str, Any]]:
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT ticker, SUM(qty) as qty, AVG(price) as avg_price, MIN(stop_loss) as stop_loss, MAX(target) as target FROM paper_book WHERE action='BUY' AND closed=0 GROUP BY ticker"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_trade_history(limit: int = 100) -> List[Dict[str, Any]]:
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT * FROM paper_book ORDER BY ts DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_portfolio_summary(current_prices: Dict[str, float] | None = None) -> Dict[str, Any]:
    open_pos = get_open_positions()
    conn = _connect()
    try:
        cash = _get_cash(conn)
    finally:
        conn.close()
    current_prices = current_prices or {}
    positions_value = 0.0
    positions_out = []
    for p in open_pos:
        ticker = p["ticker"]
        cp = current_prices.get(ticker, p["avg_price"])
        mv = p["qty"] * cp
        cost = p["qty"] * p["avg_price"]
        unrealized = mv - cost
        positions_value += mv
        positions_out.append({
            "ticker": ticker,
            "qty": round(p["qty"], 4),
            "avg_price": round(p["avg_price"], 2),
            "current_price": round(cp, 2),
            "market_value": round(mv, 2),
            "unrealized_pnl": round(unrealized, 2),
            "unrealized_pct": round(unrealized / cost * 100, 2) if cost else 0,
            "stop_loss": p.get("stop_loss"),
            "target": p.get("target"),
        })
    total_value = cash + positions_value
    closed = [t for t in get_trade_history(500) if t.get("closed") and t.get("pnl") is not None]
    realized_pnl = sum(t.get("pnl", 0) for t in closed)
    return {
        "total_value": round(total_value, 2),
        "cash": round(cash, 2),
        "positions_value": round(positions_value, 2),
        "positions": positions_out,
        "realized_pnl": round(realized_pnl, 2),
        "unrealized_pnl": round(sum(p["unrealized_pnl"] for p in positions_out), 2),
        "total_return_pct": round((total_value - INITIAL_CASH) / INITIAL_CASH * 100, 2),
        "trade_count": len(closed),
        "initial_cash": INITIAL_CASH,
    }
