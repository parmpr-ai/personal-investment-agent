"""
Paper trading engine.
Actions: BUY, SELL (close long), SHORT (open short), COVER (close short).
Short P&L = (entry_price - current_price) * qty  — profit when price falls.
Slippage model: liquid tickers 0.05%, others 0.15% + $0.005/share commission.
"""
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

BASE_DIR = Path(__file__).resolve().parents[1]
DB_PATH = BASE_DIR / "paper_trading.sqlite3"

INITIAL_CASH = 100_000.0
VALID_ACTIONS = ("BUY", "SELL", "SHORT", "COVER")

# ── Slippage & commission model ───────────────────────────────────────────────
_LIQUID_TICKERS = frozenset({
    "SPY", "QQQ", "AAPL", "MSFT", "NVDA", "META", "GOOGL", "AMZN", "TSLA",
    "AMD", "JPM", "V", "MA", "BRK.B", "UNH", "SOFI", "MELI", "NBIS", "CRWV",
})
_SLIPPAGE_LIQUID   = 0.0005   # 0.05% — tight spread for mega-caps/ETFs
_SLIPPAGE_DEFAULT  = 0.0015   # 0.15% — wider spread for mid/small caps
_COMMISSION_PER_SH = 0.005    # $0.005/share (IBKR tiered approximation)


def _apply_slippage(ticker: str, action: str, price: float, qty: float) -> Tuple[float, float]:
    """Return (exec_price, commission). BUY/COVER fill higher; SELL/SHORT fill lower."""
    slip = _SLIPPAGE_LIQUID if ticker.upper() in _LIQUID_TICKERS else _SLIPPAGE_DEFAULT
    if action in ("BUY", "COVER"):
        exec_price = round(price * (1 + slip), 4)
    else:
        exec_price = round(price * (1 - slip), 4)
    commission = round(qty * _COMMISSION_PER_SH, 2)
    return exec_price, commission


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
    action = action.upper()
    if action not in VALID_ACTIONS:
        return {"ok": False, "error": f"Unknown action: {action}. Valid: {VALID_ACTIONS}"}
    if qty <= 0 or price <= 0:
        return {"ok": False, "error": "Invalid qty or price"}

    conn = _connect()
    try:
        cash = _get_cash(conn)
        ts = datetime.now(timezone.utc).isoformat()

        # ── LONG: open ──────────────────────────────────────────────────────
        if action == "BUY":
            exec_price, commission = _apply_slippage(ticker, "BUY", price, qty)
            cost = qty * exec_price + commission
            if cost > cash:
                return {"ok": False, "error": f"Insufficient cash: need ${cost:.2f}, have ${cash:.2f}"}
            _set_cash(conn, cash - cost)
            conn.execute(
                "INSERT INTO paper_book(ticker,action,qty,price,stop_loss,target,reason,confidence,ts) VALUES(?,?,?,?,?,?,?,?,?)",
                (ticker, "BUY", qty, exec_price, stop_loss, target, reason, confidence, ts),
            )
            conn.commit()
            return {"ok": True, "action": "BUY", "ticker": ticker, "qty": qty, "price": price,
                    "exec_price": exec_price, "slippage": round(exec_price - price, 4),
                    "commission": commission, "cost": round(cost, 2),
                    "cash_remaining": round(cash - cost, 2)}

        # ── LONG: close ─────────────────────────────────────────────────────
        elif action == "SELL":
            exec_price, commission = _apply_slippage(ticker, "SELL", price, qty)
            open_buys = conn.execute(
                "SELECT id, qty, price FROM paper_book WHERE ticker=? AND action='BUY' AND closed=0 ORDER BY ts ASC",
                (ticker,),
            ).fetchall()
            if not open_buys:
                return {"ok": False, "error": f"No open long position for {ticker}"}
            remaining = qty
            total_pnl = 0.0
            for row in open_buys:
                if remaining <= 0:
                    break
                sell_qty = min(remaining, row["qty"])
                pnl = (exec_price - row["price"]) * sell_qty
                total_pnl += pnl
                remaining -= sell_qty
                if sell_qty >= row["qty"]:
                    conn.execute(
                        "UPDATE paper_book SET closed=1, close_price=?, close_ts=?, pnl=? WHERE id=?",
                        (exec_price, ts, round(pnl, 2), row["id"]),
                    )
                else:
                    conn.execute("UPDATE paper_book SET qty=qty-? WHERE id=?", (sell_qty, row["id"]))
                    conn.execute(
                        "INSERT INTO paper_book(ticker,action,qty,price,ts,closed,close_price,close_ts,pnl,confidence,reason) VALUES(?,?,?,?,?,1,?,?,?,?,?)",
                        (ticker, "BUY", sell_qty, row["price"], row["ts"], exec_price, ts, round(pnl, 2), confidence, "Partial close"),
                    )
            proceeds = qty * exec_price - commission
            _set_cash(conn, cash + proceeds)
            conn.commit()
            return {"ok": True, "action": "SELL", "ticker": ticker, "qty": qty, "price": price,
                    "exec_price": exec_price, "slippage": round(price - exec_price, 4),
                    "commission": commission, "pnl": round(total_pnl - commission, 2),
                    "cash_remaining": round(cash + proceeds, 2)}

        # ── SHORT: open ─────────────────────────────────────────────────────
        elif action == "SHORT":
            exec_price, commission = _apply_slippage(ticker, "SHORT", price, qty)
            # Reserve 100% notional + commission as collateral
            collateral = qty * exec_price + commission
            if collateral > cash:
                return {"ok": False, "error": f"Insufficient cash for short collateral: need ${collateral:.2f}, have ${cash:.2f}"}
            _set_cash(conn, cash - collateral)
            conn.execute(
                "INSERT INTO paper_book(ticker,action,qty,price,stop_loss,target,reason,confidence,ts) VALUES(?,?,?,?,?,?,?,?,?)",
                (ticker, "SHORT", qty, exec_price, stop_loss, target, reason, confidence, ts),
            )
            conn.commit()
            return {"ok": True, "action": "SHORT", "ticker": ticker, "qty": qty, "price": price,
                    "exec_price": exec_price, "slippage": round(price - exec_price, 4),
                    "commission": commission, "collateral": round(collateral, 2),
                    "cash_remaining": round(cash - collateral, 2),
                    "note": "Profit when price falls. Close with COVER."}

        # ── SHORT: close ────────────────────────────────────────────────────
        elif action == "COVER":
            exec_price, commission = _apply_slippage(ticker, "COVER", price, qty)
            open_shorts = conn.execute(
                "SELECT id, qty, price FROM paper_book WHERE ticker=? AND action='SHORT' AND closed=0 ORDER BY ts ASC",
                (ticker,),
            ).fetchall()
            if not open_shorts:
                return {"ok": False, "error": f"No open short position for {ticker}"}
            remaining = qty
            total_pnl = 0.0
            total_collateral = 0.0
            for row in open_shorts:
                if remaining <= 0:
                    break
                cover_qty = min(remaining, row["qty"])
                # Short P&L: profit when price fell (entry_exec - cover_exec) * qty
                pnl = (row["price"] - exec_price) * cover_qty
                total_pnl += pnl
                total_collateral += row["price"] * cover_qty
                remaining -= cover_qty
                if cover_qty >= row["qty"]:
                    conn.execute(
                        "UPDATE paper_book SET closed=1, close_price=?, close_ts=?, pnl=? WHERE id=?",
                        (exec_price, ts, round(pnl, 2), row["id"]),
                    )
                else:
                    conn.execute("UPDATE paper_book SET qty=qty-? WHERE id=?", (cover_qty, row["id"]))
                    conn.execute(
                        "INSERT INTO paper_book(ticker,action,qty,price,ts,closed,close_price,close_ts,pnl,confidence,reason) VALUES(?,?,?,?,?,1,?,?,?,?,?)",
                        (ticker, "SHORT", cover_qty, row["price"], row["ts"], exec_price, ts, round(pnl, 2), confidence, "Partial cover"),
                    )
            # Return collateral + P&L − commission
            net_return = total_collateral + total_pnl - commission
            _set_cash(conn, cash + net_return)
            conn.commit()
            return {"ok": True, "action": "COVER", "ticker": ticker, "qty": qty, "price": price,
                    "exec_price": exec_price, "slippage": round(exec_price - price, 4),
                    "commission": commission, "pnl": round(total_pnl - commission, 2),
                    "cash_remaining": round(cash + net_return, 2)}

    finally:
        conn.close()
    return {"ok": False, "error": "Unknown error"}


def get_open_positions() -> List[Dict[str, Any]]:
    """Returns all open longs (action=BUY) and shorts (action=SHORT)."""
    conn = _connect()
    try:
        rows = conn.execute(
            """SELECT action, ticker, SUM(qty) as qty, AVG(price) as avg_price,
               MIN(stop_loss) as stop_loss, MAX(target) as target,
               MIN(ts) as entry_ts
               FROM paper_book WHERE action IN ('BUY','SHORT') AND closed=0
               GROUP BY action, ticker""",
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_open_longs() -> List[Dict[str, Any]]:
    return [p for p in get_open_positions() if p["action"] == "BUY"]


def get_open_shorts() -> List[Dict[str, Any]]:
    return [p for p in get_open_positions() if p["action"] == "SHORT"]


def get_trade_history(limit: int = 100) -> List[Dict[str, Any]]:
    conn = _connect()
    try:
        rows = conn.execute("SELECT * FROM paper_book ORDER BY ts DESC LIMIT ?", (limit,)).fetchall()
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
    longs_value = 0.0
    shorts_exposure = 0.0
    positions_out = []

    for p in open_pos:
        ticker = p["ticker"]
        side = p["action"]  # "BUY" or "SHORT"
        cp = current_prices.get(ticker, p["avg_price"])
        cost = p["qty"] * p["avg_price"]

        if side == "BUY":
            mv = p["qty"] * cp
            unrealized = mv - cost
            longs_value += mv
            positions_out.append({
                "ticker": ticker,
                "side": "LONG",
                "qty": round(p["qty"], 4),
                "avg_price": round(p["avg_price"], 2),
                "current_price": round(cp, 2),
                "market_value": round(mv, 2),
                "unrealized_pnl": round(unrealized, 2),
                "unrealized_pct": round(unrealized / cost * 100, 2) if cost else 0,
                "stop_loss": p.get("stop_loss"),
                "target": p.get("target"),
            })
        else:  # SHORT
            # Short P&L: (entry - current) * qty
            unrealized = (p["avg_price"] - cp) * p["qty"]
            notional = p["qty"] * cp
            shorts_exposure += notional
            positions_out.append({
                "ticker": ticker,
                "side": "SHORT",
                "qty": round(p["qty"], 4),
                "avg_price": round(p["avg_price"], 2),
                "current_price": round(cp, 2),
                "market_value": round(notional, 2),
                "unrealized_pnl": round(unrealized, 2),
                "unrealized_pct": round(unrealized / cost * 100, 2) if cost else 0,
                "stop_loss": p.get("stop_loss"),
                "target": p.get("target"),
            })

    closed = [t for t in get_trade_history(500) if t.get("closed") and t.get("pnl") is not None]
    realized_pnl = sum(t.get("pnl", 0) for t in closed)
    unrealized_total = sum(p["unrealized_pnl"] for p in positions_out)
    total_value = cash + longs_value + unrealized_total  # cash includes short collateral

    return {
        "total_value": round(total_value, 2),
        "cash": round(cash, 2),
        "longs_value": round(longs_value, 2),
        "shorts_exposure": round(shorts_exposure, 2),
        "positions": positions_out,
        "longs": [p for p in positions_out if p["side"] == "LONG"],
        "shorts": [p for p in positions_out if p["side"] == "SHORT"],
        "realized_pnl": round(realized_pnl, 2),
        "unrealized_pnl": round(unrealized_total, 2),
        "total_return_pct": round((total_value - INITIAL_CASH) / INITIAL_CASH * 100, 2),
        "trade_count": len(closed),
        "initial_cash": INITIAL_CASH,
    }
