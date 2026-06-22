from __future__ import annotations

import os
import sqlite3
import time
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any


ALLOWED_ASSET_TYPES = {"Stock", "ETF", "Crypto", "Option", "Other"}
ALLOWED_BROKERS = {"IBKR", "Freedom24", "Revolut", "Manual"}

DB_PATH = Path(os.getenv("MANUAL_HOLDINGS_DB", Path(__file__).resolve().parents[1] / "pia_manual_holdings.sqlite3"))
_PRICE_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
PRICE_CACHE_SECONDS = 300
_DB_LOCK = threading.RLock()
_DB_INITIALIZED = False


def initialize_manual_holdings_store() -> None:
    global _DB_INITIALIZED
    if _DB_INITIALIZED:
        return
    with _DB_LOCK:
        if _DB_INITIALIZED:
            return
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS manual_holdings (
                    id TEXT PRIMARY KEY,
                    ticker TEXT NOT NULL,
                    name TEXT NOT NULL,
                    asset_type TEXT NOT NULL,
                    broker TEXT NOT NULL,
                    quantity REAL NOT NULL,
                    avg_price REAL NOT NULL,
                    currency TEXT NOT NULL,
                    notes TEXT NOT NULL DEFAULT '',
                    asset_class TEXT,
                    sec_type TEXT,
                    underlying TEXT,
                    expiry TEXT,
                    strike REAL,
                    call_put TEXT,
                    multiplier REAL,
                    contract_desc TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                )
                """
            )
            columns = {row[1] for row in conn.execute("PRAGMA table_info(manual_holdings)")}
            for col, ddl in [
                ("asset_class", "TEXT"),
                ("sec_type", "TEXT"),
                ("underlying", "TEXT"),
                ("expiry", "TEXT"),
                ("strike", "REAL"),
                ("call_put", "TEXT"),
                ("multiplier", "REAL"),
                ("contract_desc", "TEXT"),
            ]:
                if col not in columns:
                    conn.execute(f"ALTER TABLE manual_holdings ADD COLUMN {col} {ddl}")
        _DB_INITIALIZED = True


def _connect() -> sqlite3.Connection:
    initialize_manual_holdings_store()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _row_to_holding(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "ticker": row["ticker"],
        "name": row["name"],
        "asset_type": row["asset_type"],
        "assetClass": row["asset_class"] if "asset_class" in row.keys() else None,
        "sec_type": row["sec_type"] if "sec_type" in row.keys() else None,
        "underlying": row["underlying"] if "underlying" in row.keys() else None,
        "expiry": row["expiry"] if "expiry" in row.keys() else None,
        "expiration": row["expiry"] if "expiry" in row.keys() else None,
        "strike": row["strike"] if "strike" in row.keys() else None,
        "callPut": row["call_put"] if "call_put" in row.keys() else None,
        "multiplier": row["multiplier"] if "multiplier" in row.keys() else None,
        "contractDesc": row["contract_desc"] if "contract_desc" in row.keys() else None,
        "broker": row["broker"],
        "quantity": row["quantity"],
        "avg_price": row["avg_price"],
        "currency": row["currency"],
        "notes": row["notes"],
    }


def _normalize_asset_class(asset_class: str | None, asset_type: str | None, ticker: str, underlying: str | None = None) -> str:
    raw = str(asset_class or "").strip().upper()
    if raw in {"STK", "OPT", "CRYPTO"}:
        return raw
    asset_type_raw = str(asset_type or "").strip().lower()
    if asset_type_raw == "option":
        return "OPT"
    if asset_type_raw == "crypto" or ticker.upper() in {"BTC", "ETH", "XRP", "SOL", "DOGE"}:
        return "CRYPTO"
    if underlying:
        return "OPT"
    return "STK"


def _option_contract_desc(underlying: str, expiry: str, strike: float | int | str, call_put: str) -> str:
    expiry_value = str(expiry or "").strip()
    strike_value = str(strike or "").strip()
    call_put_value = str(call_put or "").strip().upper()
    return f"{underlying} {expiry_value} {strike_value} {call_put_value}".strip()


def normalize_holding(data: dict[str, Any], existing_id: str | None = None) -> dict[str, Any]:
    ticker = str(data.get("ticker") or "").strip().upper()
    name = str(data.get("name") or ticker).strip()
    asset_type = str(data.get("asset_type") or "Stock").strip()
    asset_class = _normalize_asset_class(data.get("assetClass"), asset_type, ticker, data.get("underlying"))
    sec_type = str(data.get("sec_type") or asset_class).strip().upper()
    underlying = str(data.get("underlying") or "").strip().upper()
    expiry = str(data.get("expiry") or data.get("expiration") or "").strip()
    call_put = str(data.get("callPut") or data.get("call_put") or "").strip().upper()
    strike_raw = data.get("strike")
    broker = str(data.get("broker") or "Manual").strip()
    currency = str(data.get("currency") or "USD").strip().upper()
    notes = str(data.get("notes") or "").strip()
    try:
        quantity = float(data.get("quantity"))
        avg_price = float(data.get("avg_price"))
    except (TypeError, ValueError):
        raise ValueError("quantity and avg_price must be numbers")
    if asset_class == "OPT":
        if not underlying:
            raise ValueError("underlying is required for options")
        if not expiry:
            raise ValueError("expiry is required for options")
        if not call_put:
            raise ValueError("callPut is required for options")
        try:
            strike = float(strike_raw)
        except (TypeError, ValueError):
            raise ValueError("strike is required for options")
        if not ticker:
            ticker = underlying
    else:
        if not ticker:
            raise ValueError("ticker is required")
        strike = float(strike_raw) if strike_raw not in (None, "") else None
    if not name:
        raise ValueError("name is required")
    if asset_type not in ALLOWED_ASSET_TYPES:
        raise ValueError(f"asset_type must be one of {sorted(ALLOWED_ASSET_TYPES)}")
    if broker not in ALLOWED_BROKERS:
        raise ValueError(f"broker must be one of {sorted(ALLOWED_BROKERS)}")
    if quantity <= 0:
        raise ValueError("quantity must be greater than zero")
    if avg_price < 0:
        raise ValueError("avg_price cannot be negative")
    if not currency:
        raise ValueError("currency is required")
    return {
        "id": existing_id or str(data.get("id") or uuid.uuid4()),
        "ticker": ticker,
        "name": name,
        "asset_type": asset_type,
        "assetClass": asset_class,
        "sec_type": sec_type,
        "underlying": underlying,
        "expiry": expiry or None,
        "expiration": expiry or None,
        "strike": strike,
        "callPut": call_put or None,
        "multiplier": float(data.get("multiplier") or (100 if asset_class == "OPT" else 1)),
        "contractDesc": str(data.get("contractDesc") or data.get("contract_desc") or (_option_contract_desc(underlying or ticker, expiry, strike_raw, call_put) if asset_class == "OPT" else name)).strip(),
        "broker": broker,
        "quantity": quantity,
        "avg_price": avg_price,
        "currency": currency[:8],
        "notes": notes,
    }


def list_manual_holdings() -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM manual_holdings ORDER BY broker, ticker").fetchall()
    return [_row_to_holding(row) for row in rows]


def create_manual_holding(data: dict[str, Any]) -> dict[str, Any]:
    holding = normalize_holding(data)
    now = int(time.time())
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO manual_holdings
            (id, ticker, name, asset_type, broker, quantity, avg_price, currency, notes, asset_class, sec_type, underlying, expiry, strike, call_put, multiplier, contract_desc, created_at, updated_at)
            VALUES (:id, :ticker, :name, :asset_type, :broker, :quantity, :avg_price, :currency, :notes, :assetClass, :sec_type, :underlying, :expiry, :strike, :callPut, :multiplier, :contractDesc, :created_at, :updated_at)
            """,
            {**holding, "created_at": now, "updated_at": now},
        )
    return holding


def update_manual_holding(holding_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
    with _connect() as conn:
        existing = conn.execute("SELECT id FROM manual_holdings WHERE id = ?", (holding_id,)).fetchone()
        if not existing:
            return None
        holding = normalize_holding(data, existing_id=holding_id)
        conn.execute(
            """
            UPDATE manual_holdings
            SET ticker = :ticker, name = :name, asset_type = :asset_type, broker = :broker,
                quantity = :quantity, avg_price = :avg_price, currency = :currency,
                notes = :notes, asset_class = :assetClass, sec_type = :sec_type, underlying = :underlying,
                expiry = :expiry, strike = :strike, call_put = :callPut, multiplier = :multiplier,
                contract_desc = :contractDesc, updated_at = :updated_at
            WHERE id = :id
            """,
            {**holding, "updated_at": int(time.time())},
        )
    return holding


def delete_manual_holding(holding_id: str) -> bool:
    with _connect() as conn:
        result = conn.execute("DELETE FROM manual_holdings WHERE id = ?", (holding_id,))
    return result.rowcount > 0


def _asset_sec_type(asset_type: str) -> str:
    return {"Stock": "STK", "ETF": "ETF", "Crypto": "CRYPTO", "Option": "OPT"}.get(asset_type, "OTHER")


def _market_price(ticker: str) -> dict[str, Any]:
    key = ticker.upper()
    cached = _PRICE_CACHE.get(key)
    now = time.time()
    cache_seconds = PRICE_CACHE_SECONDS if cached and cached[1].get("price") is not None else 1
    if cached and now - cached[0] < cache_seconds:
        return cached[1]
    out: dict[str, Any] = {"price": None, "currency": None, "status": "manual_fallback"}
    try:
        from services.connectors import yahoo_fundamentals

        data = yahoo_fundamentals(key, wait_timeout_seconds=0.55)
        out = {
            "price": data.get("price"),
            "currency": data.get("currency"),
            "status": data.get("status") or "manual_fallback",
            "source": data.get("source"),
        }
    except Exception as exc:
        out["error"] = str(exc)
    _PRICE_CACHE[key] = (now, out)
    return out


def manual_positions(total_before_cash: float = 0) -> list[dict[str, Any]]:
    holdings = list_manual_holdings()
    tickers = list(dict.fromkeys(holding["ticker"] for holding in holdings))
    if tickers:
        with ThreadPoolExecutor(max_workers=min(8, len(tickers))) as executor:
            pricing_by_ticker = dict(zip(tickers, executor.map(_market_price, tickers)))
    else:
        pricing_by_ticker = {}
    positions = []
    for holding in holdings:
        pricing = pricing_by_ticker.get(holding["ticker"], {})
        last = pricing.get("price")
        try:
            last_price = float(last) if last is not None else float(holding["avg_price"])
        except (TypeError, ValueError):
            last_price = float(holding["avg_price"])
        asset_class = str(holding.get("assetClass") or _normalize_asset_class(None, holding["asset_type"], holding["ticker"], holding.get("underlying"))).upper()
        multiplier = float(holding.get("multiplier") or (100 if asset_class == "OPT" else 1))
        quantity = float(holding["quantity"])
        avg_price = float(holding["avg_price"])
        cost_basis = round(quantity * avg_price * multiplier, 2)
        market_value = round(quantity * last_price * multiplier, 2)
        unrealized = round(market_value - cost_basis, 2)
        symbol = holding["underlying"] if asset_class == "OPT" and holding.get("underlying") else holding["ticker"]
        contract_desc = holding.get("contractDesc") or (holding["name"] if asset_class != "OPT" else _option_contract_desc(symbol, holding.get("expiry") or "", holding.get("strike") or "", holding.get("callPut") or ""))
        positions.append(
            {
                "id": holding["id"],
                "accountId": f"MANUAL:{holding['broker']}",
                "account_id": f"MANUAL:{holding['broker']}",
                "conid": f"manual:{holding['id']}",
                "contractDesc": contract_desc,
                "contract_desc": contract_desc,
                "symbol": symbol,
                "underlying": holding.get("underlying") or symbol,
                "name": holding["name"],
                "sec_type": asset_class,
                "asset_type": holding["asset_type"],
                "assetClass": asset_class,
                "sector": holding["asset_type"],
                "expiry": holding.get("expiry"),
                "expiration": holding.get("expiry"),
                "strike": holding.get("strike"),
                "call_put": holding.get("callPut"),
                "broker": holding["broker"],
                "qty": quantity,
                "avg_price": round(avg_price, 4),
                "last": round(last_price, 4),
                "day_change_pct": 0,
                "day_change": 0,
                "day_pnl": 0,
                "market_value": market_value,
                "cost_basis": cost_basis,
                "unrealized": unrealized,
                "realized": 0,
                "unrealized_pct": round((unrealized / cost_basis * 100), 2) if cost_basis else 0,
                "portfolio_pct": round((market_value / total_before_cash * 100), 2) if total_before_cash else 0,
                "risk": 86 if asset_class in {"CRYPTO", "OPT"} else 58,
                "brand": "#24d18c",
                "accent": "#60a5fa" if holding["broker"] != "Revolut" else "#24d18c",
                "logo": symbol[:2],
                "momentum_score": 50,
                "news_score": 50,
                "macro_sensitivity": 65,
                "ai_view": f"Manual {holding['broker']} holding. Price uses market data when available, otherwise average price.",
                "why_moving": "Manual holding; verify external broker statement and market price.",
                "currency": pricing.get("currency") or holding["currency"],
                "notes": holding["notes"],
                "pricing_status": pricing.get("status", "manual_fallback"),
                "pricing_source": pricing.get("source", "manual"),
                "manual": True,
            }
        )
    return positions


def merge_manual_holdings(portfolio: dict[str, Any], macro: dict[str, Any], state_module: Any) -> dict[str, Any]:
    holdings = manual_positions(float(portfolio.get("total_value") or 0))
    if not holdings:
        portfolio.setdefault("manual_holdings_count", 0)
        return portfolio

    merged = {**portfolio}
    positions = [*merged.get("positions", []), *holdings]
    manual_value = sum(float(p.get("market_value", 0)) for p in holdings)
    manual_cost = sum(float(p.get("cost_basis", 0)) for p in holdings)
    manual_unrealized = sum(float(p.get("unrealized", 0)) for p in holdings)
    total_value = round(float(merged.get("total_value") or 0) + manual_value, 2)
    cost_basis = round(float(merged.get("cost_basis") or 0) + manual_cost, 2)
    unrealized = round(float(merged.get("unrealized") or 0) + manual_unrealized, 2)

    for position in positions:
        mv = float(position.get("market_value") or 0)
        position["portfolio_pct"] = round(mv / total_value * 100, 2) if total_value else 0

    merged.update(
        {
            "total_value": total_value,
            "cost_basis": cost_basis,
            "unrealized": unrealized,
            "unrealized_pct": round(unrealized / cost_basis * 100, 2) if cost_basis else 0,
            "positions": positions,
            "exposures": state_module.compute_exposures(positions, total_value),
            "guardrails": state_module.risk_doctor(positions, macro),
            "today_actions": state_module.today_actions(positions, macro),
            "manual_holdings_count": len(holdings),
            "manual_holdings_value": round(manual_value, 2),
        }
    )
    return merged
