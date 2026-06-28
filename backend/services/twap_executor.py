"""
TWAP (Time-Weighted Average Price) execution simulator.

Splits large orders into equal-sized child orders executed over time,
reducing market impact and slippage. Also tracks slippage vs decision price.

In paper mode: simulates realistic fill prices with bid-ask spread model.
In IBKR paper mode: routes child orders to IBKR TWS.

Slippage tracking: records decision price vs actual fill price for every trade,
enabling post-trade analysis of execution quality.
"""
import asyncio
import json
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx

BASE_DIR = Path(__file__).resolve().parents[1]
SLIPPAGE_DB = BASE_DIR / "agent_decisions.sqlite3"

_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; InvestAgent/6.0)"}

# ── Slippage database ─────────────────────────────────────────────────────────

def _conn():
    c = sqlite3.connect(SLIPPAGE_DB, timeout=10)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("""
        CREATE TABLE IF NOT EXISTS slippage_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            ticker TEXT NOT NULL,
            action TEXT NOT NULL,
            decision_price REAL NOT NULL,
            fill_price REAL NOT NULL,
            qty REAL NOT NULL,
            slippage_bps REAL NOT NULL,
            slippage_usd REAL NOT NULL,
            execution_type TEXT DEFAULT 'INSTANT',
            twap_slices INTEGER DEFAULT 1,
            cycle_id TEXT
        )
    """)
    c.commit()
    return c


def record_slippage(
    ticker: str,
    action: str,
    decision_price: float,
    fill_price: float,
    qty: float,
    execution_type: str = "INSTANT",
    twap_slices: int = 1,
    cycle_id: str = "",
):
    """Record slippage between decision price and actual fill."""
    slippage_bps = abs(fill_price - decision_price) / decision_price * 10000
    slippage_usd = abs(fill_price - decision_price) * qty
    conn = _conn()
    try:
        conn.execute(
            "INSERT INTO slippage_log(ts,ticker,action,decision_price,fill_price,qty,slippage_bps,slippage_usd,execution_type,twap_slices,cycle_id) "
            "VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            (datetime.now(timezone.utc).isoformat(), ticker, action,
             decision_price, fill_price, qty,
             round(slippage_bps, 1), round(slippage_usd, 2),
             execution_type, twap_slices, cycle_id),
        )
        conn.commit()
    finally:
        conn.close()


def get_slippage_stats() -> Dict[str, Any]:
    """Return aggregate slippage statistics."""
    conn = _conn()
    try:
        rows = conn.execute("""
            SELECT execution_type,
                   COUNT(*) AS trades,
                   AVG(slippage_bps) AS avg_bps,
                   SUM(slippage_usd) AS total_cost_usd,
                   AVG(slippage_bps) FILTER (WHERE action='BUY') AS buy_slippage_bps,
                   AVG(slippage_bps) FILTER (WHERE action='SELL') AS sell_slippage_bps
            FROM slippage_log
            GROUP BY execution_type
        """).fetchall()
        recent = conn.execute(
            "SELECT * FROM slippage_log ORDER BY ts DESC LIMIT 20"
        ).fetchall()
        return {
            "summary": [dict(r) for r in rows],
            "recent": [dict(r) for r in recent],
        }
    finally:
        conn.close()


# ── Bid-ask spread model ───────────────────────────────────────────────────────

async def _get_current_price(ticker: str) -> Optional[float]:
    """Fetch current mid-price for realistic fill simulation."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker.upper()}"
    try:
        async with httpx.AsyncClient(timeout=4, headers=_HEADERS) as client:
            r = await client.get(url, params={"interval": "1m", "range": "1d"})
            r.raise_for_status()
            data = r.json()
            closes = data["chart"]["result"][0]["indicators"]["quote"][0]["close"]
            vals = [c for c in closes if c]
            return vals[-1] if vals else None
    except Exception:
        return None


def _simulate_fill_price(decision_price: float, action: str, qty: float) -> float:
    """
    Simulate realistic fill price accounting for:
    1. Bid-ask spread (estimated from price range)
    2. Market impact (larger orders move price slightly)
    Typical spreads: <$50 stock: 2-5 bps, $50-$200: 1-3 bps, >$200: 0.5-2 bps
    """
    # Estimate spread in bps based on price level
    if decision_price < 20:
        spread_bps = 8.0
    elif decision_price < 50:
        spread_bps = 4.0
    elif decision_price < 200:
        spread_bps = 2.0
    else:
        spread_bps = 1.0

    # Market impact: 0.1 bps per $10k of order value (very rough)
    order_value = decision_price * qty
    impact_bps = min(5.0, order_value / 100_000)

    total_bps = spread_bps + impact_bps
    spread_fraction = total_bps / 10000

    if action in ("BUY", "SHORT"):
        # Pay the ask (slightly above mid)
        return round(decision_price * (1 + spread_fraction * 0.5), 4)
    else:
        # Receive the bid (slightly below mid)
        return round(decision_price * (1 - spread_fraction * 0.5), 4)


# ── TWAP executor ─────────────────────────────────────────────────────────────

async def execute_twap(
    ticker: str,
    action: str,
    total_qty: float,
    decision_price: float,
    n_slices: int = 5,
    interval_seconds: int = 60,
    cycle_id: str = "",
    paper_trade_fn=None,
    stop_loss: Optional[float] = None,
    target: Optional[float] = None,
    reason: str = "",
    confidence: int = 70,
) -> Dict[str, Any]:
    """
    Execute a TWAP order: split total_qty into n_slices executed every interval_seconds.

    For paper mode: paper_trade_fn is called for each slice.
    Returns aggregate fill result.
    """
    if n_slices <= 1 or total_qty < 2:
        # Small orders: execute immediately (no TWAP benefit)
        fill_price = _simulate_fill_price(decision_price, action, total_qty)
        record_slippage(ticker, action, decision_price, fill_price, total_qty,
                        "INSTANT", 1, cycle_id)
        if paper_trade_fn:
            result = paper_trade_fn(
                ticker=ticker, action=action, qty=total_qty,
                price=fill_price, stop_loss=stop_loss, target=target,
                reason=reason, confidence=confidence,
            )
            return {**result, "fill_price": fill_price, "slices": 1, "twap": False}
        return {"ok": True, "fill_price": fill_price, "slices": 1, "twap": False}

    slice_qty = total_qty / n_slices
    fills: List[float] = []
    errors: List[str] = []

    for i in range(n_slices):
        # Get current market price for this slice
        current_price = await _get_current_price(ticker)
        if current_price is None:
            current_price = decision_price  # fallback to decision price

        fill_price = _simulate_fill_price(current_price, action, slice_qty)
        fills.append(fill_price)

        if paper_trade_fn:
            # Execute this slice
            is_last = (i == n_slices - 1)
            result = paper_trade_fn(
                ticker=ticker, action=action, qty=round(slice_qty, 4),
                price=fill_price,
                stop_loss=stop_loss if is_last else None,  # only set SL on last slice
                target=target if is_last else None,
                reason=f"TWAP slice {i+1}/{n_slices}: {reason}",
                confidence=confidence,
            )
            if not result.get("ok"):
                errors.append(f"Slice {i+1}: {result.get('error', 'failed')}")

        # Wait between slices (except last)
        if i < n_slices - 1:
            await asyncio.sleep(interval_seconds)

    avg_fill = sum(fills) / len(fills) if fills else decision_price

    # Record aggregate slippage
    record_slippage(
        ticker, action, decision_price, avg_fill, total_qty,
        "TWAP", n_slices, cycle_id,
    )

    return {
        "ok": len(errors) == 0,
        "fill_price": round(avg_fill, 4),
        "slices": n_slices,
        "fills": [round(f, 4) for f in fills],
        "twap": True,
        "errors": errors,
        "avg_slippage_bps": round(abs(avg_fill - decision_price) / decision_price * 10000, 1),
    }


def should_use_twap(qty: float, price: float, portfolio_value: float) -> bool:
    """
    Use TWAP when order size > 1% of portfolio (meaningful market impact).
    Small orders (<$2000 or <1% of portfolio) execute instantly.
    """
    order_value = qty * price
    pct_of_portfolio = order_value / max(portfolio_value, 1) * 100
    return pct_of_portfolio > 1.0 and order_value > 2000
