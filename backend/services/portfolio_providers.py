"""
EPIC-IBKR-LIVE-001 / HERMES — Portfolio Data Provider Abstraction

Providers:
  mock       — built-in demo data from state.py
  demo       — IBKR sample JSON files (data/ibkr-live/*.sample.json)
  ibkr-live  — Client Portal Gateway REST API (https://localhost:5000/v1/api)

Fallback chain: ibkr-live → demo → mock
"""
import json
import os
import re
import ssl
import threading
import urllib.request
import urllib.error
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "ibkr-live"
_SNAPSHOT_DIR = Path(__file__).resolve().parents[1] / "data" / "snapshots" / "ibkr"
_SNAPSHOT_POSITIONS_FILE = _SNAPSHOT_DIR / "positions_latest.json"
_SNAPSHOT_SUMMARY_FILE = _SNAPSHOT_DIR / "summary_latest.json"
_SNAPSHOT_TRADES_FILE = _SNAPSHOT_DIR / "trades_latest.json"
_SNAPSHOT_META_FILE = _SNAPSHOT_DIR / "meta.json"
_GATEWAY_BASE = "https://localhost:5000/v1/api"
_PROVIDER_MODES = ("mock", "last-update", "ibkr-live")
_ACTIVE_SOURCE_MAP = {"mock": "MOCK", "last-update": "LAST_UPDATE", "ibkr-live": "IBKR_LIVE"}
_MODE_LABELS = {"mock": "Mock Data", "last-update": "Last Update Real Data", "ibkr-live": "Live Data"}
_SOURCE_LABELS = {"MOCK": "Mock", "MOCK_FALLBACK": "Mock", "LAST_UPDATE": "Last Update", "IBKR_LIVE": "IBKR Live"}
_LIVE_MODE_ALIASES = {"live", "ibkr-live"}
_LAST_UPDATE_MODE_ALIASES = {"demo", "demo-samples", "sample", "snapshot", "last-update"}
_SNAPSHOT_LOCK = threading.RLock()


def _num(v: Any, d: float = 0.0) -> float:
    try:
        return float(v) if v not in (None, "") else d
    except Exception:
        return d


def provider_mode_label(mode: str) -> str:
    return _MODE_LABELS.get(mode, mode or "Mock")


def provider_source_label(source: str) -> str:
    return _SOURCE_LABELS.get(source, source or "Mock")


def _normalize_side(side: str) -> str:
    s = (side or "").upper()
    if s in ("BOT", "B", "BUY"):
        return "BUY"
    if s in ("SLD", "S", "SELL", "SS"):
        return "SELL"
    return s or "UNKNOWN"


def _parse_trade_time(t: str) -> str:
    """Parse IBKR tradeTime '20260611-21:20:58' → ISO 8601."""
    t = (t or "").strip()
    m = re.match(r"^(\d{8})-(\d{2}:\d{2}:\d{2})$", t)
    if m:
        try:
            dt = datetime.strptime(f"{m.group(1)} {m.group(2)}", "%Y%m%d %H:%M:%S")
            return dt.replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            pass
    return t


def _normalize_mode(mode: str) -> str:
    raw = (mode or "").strip().lower()
    if raw in _LIVE_MODE_ALIASES:
        return "ibkr-live"
    if raw in _LAST_UPDATE_MODE_ALIASES:
        return "last-update"
    if raw == "mock":
        return "mock"
    return raw


def _snapshot_paths() -> list[Path]:
    return [_SNAPSHOT_POSITIONS_FILE, _SNAPSHOT_SUMMARY_FILE, _SNAPSHOT_TRADES_FILE, _SNAPSHOT_META_FILE]


def _ensure_snapshot_dir() -> None:
    _SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)


def _read_json_file(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def _write_json_file(path: Path, payload: Any) -> None:
    _ensure_snapshot_dir()
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, path)


def _load_snapshot_bundle() -> Dict[str, Any]:
    positions_payload = _read_json_file(_SNAPSHOT_POSITIONS_FILE, {})
    summary_payload = _read_json_file(_SNAPSHOT_SUMMARY_FILE, {})
    trades_payload = _read_json_file(_SNAPSHOT_TRADES_FILE, {})
    meta_payload = _read_json_file(_SNAPSHOT_META_FILE, {})
    return {
        "positions_payload": positions_payload if isinstance(positions_payload, dict) else {"positions": positions_payload or []},
        "summary_payload": summary_payload if isinstance(summary_payload, dict) else {"summary": summary_payload or {}},
        "trades_payload": trades_payload if isinstance(trades_payload, dict) else {"trades": trades_payload or []},
        "meta_payload": meta_payload if isinstance(meta_payload, dict) else {},
    }


def _snapshot_timestamp(meta_payload: Dict[str, Any]) -> Optional[str]:
    timestamp = meta_payload.get("snapshot_timestamp") or meta_payload.get("as_of") or meta_payload.get("updated_at")
    return str(timestamp) if timestamp else None


def _position_contract_desc(position: Dict[str, Any]) -> str:
    return str(
        position.get("contractDesc")
        or position.get("contract_desc")
        or position.get("description")
        or position.get("name")
        or position.get("symbol")
        or position.get("ticker")
        or "",
    ).strip()


def _position_account_id(position: Dict[str, Any]) -> str:
    return str(position.get("accountId") or position.get("account_id") or position.get("account") or "").strip()


def _position_conid(position: Dict[str, Any]) -> str:
    return str(position.get("conid") or position.get("conId") or position.get("con_id") or position.get("contract_id") or "").strip()


def _position_asset_class(position: Dict[str, Any]) -> str:
    raw = position.get("assetClass") or position.get("asset_class") or position.get("sec_type") or position.get("asset_type") or "STK"
    return str(raw).upper()


def _position_currency(position: Dict[str, Any]) -> str:
    return str(position.get("currency") or "USD").upper()


def _position_key(position: Dict[str, Any]) -> tuple[str, str, str, str, str]:
    contract_desc = _position_contract_desc(position)
    symbol = str(position.get("symbol") or position.get("underlying") or position.get("ticker") or contract_desc).upper().strip()
    return (
        _position_account_id(position),
        symbol or contract_desc.upper(),
        _position_conid(position),
        _position_asset_class(position),
        _position_currency(position),
    )


def _position_multiplier(position: Dict[str, Any]) -> float:
    if str(_position_asset_class(position)).upper() == "OPT":
        return _num(position.get("multiplier") or 100, 100)
    return _num(position.get("multiplier") or 1, 1)


def _aggregate_positions(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    grouped: Dict[tuple[str, str, str, str, str], Dict[str, Any]] = {}
    for raw in rows or []:
        if not isinstance(raw, dict):
            continue
        key = _position_key(raw)
        current = grouped.get(key)
        qty = _num(raw.get("qty") or raw.get("quantity") or raw.get("position"))
        multiplier = _position_multiplier(raw)
        market_value = _num(raw.get("market_value") or raw.get("marketValue") or raw.get("mktValue"))
        unrealized = _num(raw.get("unrealized") or raw.get("unrealizedPnl") or raw.get("unrealPnl"))
        realized = _num(raw.get("realized") or raw.get("realizedPnl") or raw.get("realPnl"))
        cost_basis = _num(raw.get("cost_basis") or raw.get("costBasis"))
        if not cost_basis and qty:
            avg_price = _num(raw.get("avg_price") or raw.get("avgPrice") or raw.get("averageCost"))
            cost_basis = round(qty * avg_price * multiplier, 2)
        day_pnl = _num(raw.get("day_pnl"))
        if current is None:
            grouped[key] = {
                **raw,
                "qty": qty,
                "quantity": qty,
                "market_value": round(market_value, 2),
                "unrealized": round(unrealized, 2),
                "realized": round(realized, 2),
                "cost_basis": round(cost_basis, 2),
                "day_pnl": round(day_pnl, 2),
                "_weighted_avg_sum": round(_num(raw.get("avg_price")) * qty * multiplier if raw.get("avg_price") is not None else cost_basis, 6),
                "_weighted_last_sum": round(_num(raw.get("last")) * qty if raw.get("last") is not None else market_value, 6),
                "_weighted_qty": qty * multiplier if qty else multiplier,
            }
            continue
        current["qty"] = round(_num(current.get("qty")) + qty, 6)
        current["quantity"] = current["qty"]
        current["market_value"] = round(_num(current.get("market_value")) + market_value, 2)
        current["unrealized"] = round(_num(current.get("unrealized")) + unrealized, 2)
        current["realized"] = round(_num(current.get("realized")) + realized, 2)
        current["cost_basis"] = round(_num(current.get("cost_basis")) + cost_basis, 2)
        current["day_pnl"] = round(_num(current.get("day_pnl")) + day_pnl, 2)
        current["_weighted_avg_sum"] = round(_num(current.get("_weighted_avg_sum")) + (_num(raw.get("avg_price")) * qty * multiplier if raw.get("avg_price") is not None else cost_basis), 6)
        current["_weighted_last_sum"] = round(_num(current.get("_weighted_last_sum")) + (_num(raw.get("last")) * qty if raw.get("last") is not None else market_value), 6)
        current["_weighted_qty"] = round(_num(current.get("_weighted_qty")) + (qty * multiplier if qty else multiplier), 6)
        if raw.get("last") is not None:
            current["last"] = _num(raw.get("last"))
        if raw.get("ai_view"):
            current["ai_view"] = raw.get("ai_view")
    aggregated: List[Dict[str, Any]] = []
    for row in grouped.values():
        weighted_qty = _num(row.pop("_weighted_qty", 0))
        weighted_avg = _num(row.pop("_weighted_avg_sum", 0))
        weighted_last = _num(row.pop("_weighted_last_sum", 0))
        qty = _num(row.get("qty"))
        row["avg_price"] = round(weighted_avg / weighted_qty, 4) if weighted_qty else round(_num(row.get("avg_price")), 4)
        row["last"] = round(weighted_last / qty, 4) if qty else round(_num(row.get("last")), 4)
        row["unrealized_pct"] = round(row["unrealized"] / row["cost_basis"] * 100, 2) if row.get("cost_basis") else 0
        row["symbol"] = str(row.get("symbol") or row.get("underlying") or _position_contract_desc(row) or "").strip()
        row["underlying"] = str(row.get("underlying") or row.get("symbol") or "").strip()
        row["sec_type"] = str(row.get("sec_type") or row.get("assetClass") or row.get("asset_type") or "STK").upper()
        row["assetClass"] = str(row.get("assetClass") or row.get("sec_type") or row.get("asset_type") or "STK").upper()
        row["contractDesc"] = str(row.get("contractDesc") or row.get("name") or row.get("symbol") or "").strip()
        row["contract_desc"] = row["contractDesc"]
        row["accountId"] = str(row.get("accountId") or row.get("account_id") or "")
        row["account_id"] = row["accountId"]
        row["conid"] = str(row.get("conid") or row.get("conId") or row.get("contract_id") or "")
        row["currency"] = _position_currency(row)
        row["portfolio_pct"] = _num(row.get("portfolio_pct"))
        aggregated.append(row)
    return aggregated


def _save_snapshot_bundle(bundle: Dict[str, Any]) -> None:
    with _SNAPSHOT_LOCK:
        _ensure_snapshot_dir()
        _write_json_file(_SNAPSHOT_POSITIONS_FILE, bundle.get("positions_payload") or {"positions": []})
        _write_json_file(_SNAPSHOT_SUMMARY_FILE, bundle.get("summary_payload") or {"summary": {}})
        _write_json_file(_SNAPSHOT_TRADES_FILE, bundle.get("trades_payload") or {"trades": []})
        _write_json_file(_SNAPSHOT_META_FILE, bundle.get("meta_payload") or {})


def _snapshot_available() -> bool:
    return _SNAPSHOT_META_FILE.exists() and _SNAPSHOT_POSITIONS_FILE.exists() and _SNAPSHOT_SUMMARY_FILE.exists()


# ─── Mock Provider (built-in demo data) ───────────────────────────────────────

class MockPortfolioProvider:
    source_name = "MOCK"

    def is_available(self) -> bool:
        return True

    def get_portfolio(self) -> Dict[str, Any]:
        from services.state import portfolio_snapshot
        p = portfolio_snapshot()
        p["source"] = "MOCK"
        return p

    def get_positions(self) -> List[Dict]:
        from services.state import portfolio_snapshot
        return portfolio_snapshot().get("positions", [])

    def get_summary(self) -> Dict[str, Any]:
        from services.state import portfolio_snapshot
        p = portfolio_snapshot()
        return {
            "source": "MOCK",
            "total_value": p.get("total_value", 0),
            "cash": p.get("cash", 0),
            "buying_power": p.get("buying_power", 0),
            "unrealized": p.get("unrealized", 0),
            "unrealized_pct": p.get("unrealized_pct", 0),
            "daily_pnl": p.get("daily_pnl", 0),
            "currency": "USD",
        }

    def get_trades(self) -> List[Dict]:
        return []


@dataclass(frozen=True)
class ProviderResolution:
    provider: Any
    configured_mode: str
    active_source: str
    fallback_active: bool
    fallback_reason: Optional[str]
    provider_class: str
    gateway_status: str = "not_applicable"
    gateway_error: Optional[str] = None
    ibkr_gateway_reachable: bool = False
    ibkr_authenticated: bool = False
    accounts_available: bool = False
    positions_available: bool = False
    trades_available: bool = False
    snapshot_available: bool = False
    snapshot_timestamp: Optional[str] = None


def _read_settings_mode() -> tuple[dict[str, Any], str, str]:
    settings: dict[str, Any] = {}
    data_mode = ""
    ibkr_mode = ""
    try:
        from services.settings_store import get_settings

        settings = get_settings()
        data_mode = str((settings.get("data_source") or {}).get("mode") or "").lower()
        ibkr_mode = str((settings.get("ibkr") or {}).get("mode") or "").lower()
    except Exception:
        pass
    return settings, data_mode, ibkr_mode


# ─── Demo Sample Provider (data/ibkr-live/*.sample.json) ──────────────────────

class SnapshotPortfolioProvider:
    source_name = "LAST_UPDATE"

    def is_available(self) -> bool:
        return _snapshot_available()

    def _load_json(self, filename: str) -> Any:
        if filename == "positions.sample.json":
            return _load_snapshot_bundle()["positions_payload"]
        if filename == "summary.sample.json":
            return _load_snapshot_bundle()["summary_payload"]
        if filename == "trades.sample.json":
            return _load_snapshot_bundle()["trades_payload"]
        if filename == "meta.json":
            return _load_snapshot_bundle()["meta_payload"]
        return None

    def _load_bundle(self) -> Dict[str, Any]:
        bundle = _load_snapshot_bundle()
        positions = bundle["positions_payload"].get("positions") or []
        summary_payload = bundle["summary_payload"]
        if isinstance(summary_payload, dict) and "summary" in summary_payload and isinstance(summary_payload["summary"], dict):
            summary = summary_payload["summary"]
        else:
            summary = summary_payload if isinstance(summary_payload, dict) else {}
        trades_payload = bundle["trades_payload"]
        if isinstance(trades_payload, dict) and "trades" in trades_payload and isinstance(trades_payload["trades"], list):
            trades = trades_payload["trades"]
        else:
            trades = trades_payload if isinstance(trades_payload, list) else []
        return {"positions": positions, "summary": summary, "trades": trades, "meta": bundle["meta_payload"] or {}}

    def get_positions(self) -> List[Dict]:
        bundle = self._load_bundle()
        return _aggregate_positions(list(bundle["positions"]))

    def get_summary(self) -> Dict[str, Any]:
        bundle = self._load_bundle()
        meta = bundle["meta"] or {}
        summary = dict(bundle["summary"]) if isinstance(bundle["summary"], dict) else {}
        positions = self.get_positions()
        total_value = _num(summary.get("total_value") or summary.get("net_liquidation") or summary.get("netLiquidation") or sum(p.get("market_value", 0) for p in positions))
        total_cb = sum(_num(p.get("cost_basis")) for p in positions)
        total_unr = sum(_num(p.get("unrealized")) for p in positions)
        summary.update({
            "source": "LAST_UPDATE",
            "mode": "last-update",
            "as_of": summary.get("as_of") or _snapshot_timestamp(meta),
            "snapshot_available": True,
            "snapshot_timestamp": _snapshot_timestamp(meta),
            "total_value": round(total_value, 2),
            "cash": _num(summary.get("cash")),
            "buying_power": _num(summary.get("buying_power") or summary.get("buyingPower")),
            "available_funds": _num(summary.get("available_funds") or summary.get("availableFunds")),
            "maint_margin_req": _num(summary.get("maint_margin_req") or summary.get("maintMarginReq")),
            "init_margin_req": _num(summary.get("init_margin_req") or summary.get("initMarginReq")),
            "excess_liquidity": _num(summary.get("excess_liquidity") or summary.get("excessLiquidity")),
            "gross_position_value": _num(summary.get("gross_position_value") or summary.get("grossPositionValue")),
            "currency": str(summary.get("currency") or "USD"),
            "daily_pnl": _num(summary.get("daily_pnl")),
            "unrealized": round(total_unr, 2),
            "unrealized_pct": round(total_unr / total_cb * 100, 2) if total_cb else 0,
            "positions_count": len(positions),
        })
        return summary

    def get_trades(self) -> List[Dict]:
        bundle = self._load_bundle()
        return list(bundle["trades"]) if isinstance(bundle["trades"], list) else []

    def get_snapshot_meta(self) -> Dict[str, Any]:
        return self._load_bundle()["meta"]

    def get_portfolio(self) -> Dict[str, Any]:
        from services.state import compute_exposures, risk_doctor, today_actions, stress_tests, macro_snapshot
        positions = self.get_positions()
        summary = self.get_summary()
        meta = self._load_bundle()["meta"]
        total_value = summary.get("total_value", 0) or sum(p.get("market_value", 0) for p in positions)
        for p in positions:
            p["portfolio_pct"] = round(p.get("market_value", 0) / total_value * 100, 2) if total_value else 0
        macros = macro_snapshot()
        total_cb = sum(p.get("cost_basis", 0) for p in positions)
        total_unr = sum(p.get("unrealized", 0) for p in positions)
        return {
            "source": "LAST_UPDATE",
            "mode": "last-update",
            "as_of": summary.get("as_of") or _snapshot_timestamp(meta) or datetime.now(timezone.utc).isoformat(),
            "snapshot_available": True,
            "snapshot_timestamp": _snapshot_timestamp(meta),
            "total_value": round(total_value, 2),
            "cost_basis": round(total_cb, 2),
            "daily_pnl": summary.get("daily_pnl", 0),
            "daily_pnl_pct": summary.get("daily_pnl_pct", 0),
            "unrealized": round(total_unr, 2),
            "unrealized_pct": round(total_unr / total_cb * 100, 2) if total_cb else 0,
            "cash": summary.get("cash", 0),
            "buying_power": summary.get("buying_power", 0),
            "margin_used": round(summary.get("maint_margin_req", 0) / total_value * 100, 2) if total_value else 0,
            "risk_mode": "LAST UPDATE",
            "positions": positions,
            "exposures": compute_exposures(positions, total_value),
            "guardrails": risk_doctor(positions, macros),
            "today_actions": today_actions(positions, macros),
            "stress_tests": stress_tests(total_value),
            "journal": [],
        }


# ─── IBKR Live Provider (Client Portal Gateway REST) ──────────────────────────

class IbkrLivePortfolioProvider:
    source_name = "IBKR_LIVE"

    def __init__(self) -> None:
        self._ssl_ctx = ssl._create_unverified_context()
        self._account_id: Optional[str] = None

    def _get(self, path: str, timeout: float = 5.0) -> Any:
        url = f"{_GATEWAY_BASE}{path}"
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout, context=self._ssl_ctx) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def is_available(self) -> bool:
        try:
            data = self._get("/iserver/auth/status", timeout=2.0)
            return bool(data.get("authenticated"))
        except Exception:
            return False

    def get_auth_status(self) -> Dict[str, Any]:
        try:
            return self._get("/iserver/auth/status", timeout=2.0)
        except Exception as e:
            return {"authenticated": False, "error": str(e)}

    def _get_account_id(self) -> Optional[str]:
        if self._account_id:
            return self._account_id
        try:
            accounts = self._get("/portfolio/accounts", timeout=5.0)
            if accounts and isinstance(accounts, list) and accounts[0].get("id"):
                self._account_id = accounts[0]["id"]
                return self._account_id
        except Exception:
            pass
        return None

    def _fetch_live_bundle(self) -> Dict[str, Any]:
        account_id = self._get_account_id()
        if not account_id:
            raise RuntimeError("IBKR: could not resolve account ID")
        raw_positions = self._get(f"/portfolio/{account_id}/positions/0", timeout=8.0)
        if not isinstance(raw_positions, list):
            raw_positions = []
        raw_summary = self._get(f"/portfolio/{account_id}/summary", timeout=8.0)
        raw_trades: List[Dict[str, Any]] = []
        try:
            fetched_trades = self._get("/iserver/account/trades", timeout=8.0)
            if isinstance(fetched_trades, list):
                raw_trades = fetched_trades
        except Exception:
            raw_trades = []
        positions = self._normalize_live_positions(raw_positions, account_id)
        summary = self._normalize_live_summary(raw_summary, positions)
        trades = self._normalize_live_trades(raw_trades, account_id)
        as_of = datetime.now(timezone.utc).isoformat()
        bundle = {
            "source": "IBKR_LIVE",
            "mode": "ibkr-live",
            "as_of": as_of,
            "account_id": account_id,
            "positions": positions,
            "summary": summary,
            "trades": trades,
            "snapshot_timestamp": as_of,
            "snapshot_available": True,
        }
        self._persist_live_snapshot(bundle)
        return bundle

    def _normalize_live_positions(self, raw_positions: List[Dict[str, Any]], account_id: str) -> List[Dict[str, Any]]:
        normalized: List[Dict[str, Any]] = []
        for p in raw_positions or []:
            sym = p.get("ticker") or p.get("symbol", "")
            asset_class = (p.get("assetClass") or p.get("instrumentType") or "STK").upper()
            is_opt = asset_class == "OPT"
            qty = _num(p.get("position") or p.get("quantity"))
            avg_price = _num(p.get("avgPrice") or p.get("averageCost"))
            avg_cost = _num(p.get("avgCost") or p.get("averageCost") or avg_price)
            mv = _num(p.get("mktValue") or p.get("marketValue"))
            unr = _num(p.get("unrealizedPnl") or p.get("unrealPnl"))
            real = _num(p.get("realizedPnl") or p.get("realPnl"))
            last = _num(p.get("mktPrice") or p.get("lastPrice"))
            contract_desc = str(p.get("contractDesc") or p.get("description") or p.get("name") or sym).strip()
            base_sym = re.split(r"\s+", sym)[0] if is_opt else sym
            normalized.append({
                "accountId": account_id,
                "account_id": account_id,
                "conid": str(p.get("conid") or p.get("conId") or p.get("contractId") or ""),
                "contractDesc": contract_desc,
                "contract_desc": contract_desc,
                "symbol": sym,
                "underlying": base_sym,
                "sec_type": asset_class,
                "assetClass": asset_class,
                "name": p.get("name") or contract_desc or sym,
                "sector": "Options" if is_opt else "Stock",
                "qty": qty,
                "quantity": qty,
                "avg_price": round(avg_price, 4),
                "avg_cost": round(avg_cost, 4),
                "last": round(last, 4),
                "day_change_pct": _num(p.get("pctChangeDay") or p.get("changePercentDay")),
                "day_change": _num(p.get("changeDay") or p.get("change")),
                "market_value": round(mv, 2),
                "cost_basis": round(avg_cost * qty * (100 if is_opt else 1), 2),
                "unrealized": round(unr, 2),
                "realized": round(real, 2),
                "unrealized_pct": round(unr / (avg_cost * qty * (100 if is_opt else 1)) * 100, 2) if avg_cost and qty else 0,
                "risk": 90 if is_opt else 70,
                "brand": "#3B82F6",
                "accent": "#60A5FA",
                "logo": (base_sym or sym)[:2],
                "momentum_score": 55,
                "news_score": 50,
                "macro_sensitivity": 75,
                "ai_view": "Live IBKR position",
                "currency": p.get("currency", "USD"),
                "multiplier": _num(p.get("multiplier") or (100 if is_opt else 1), 100 if is_opt else 1),
            })
        return _aggregate_positions(normalized)

    def _normalize_live_summary(self, raw_summary: Any, positions: List[Dict[str, Any]]) -> Dict[str, Any]:
        raw = raw_summary if isinstance(raw_summary, dict) else {}

        def _amt(key: str) -> float:
            node = raw.get(key, {})
            return _num(node.get("amount") if isinstance(node, dict) else node)

        total_value = _amt("netliquidation")
        if not total_value:
            total_value = sum(_num(p.get("market_value")) for p in positions)
        currency = "USD"
        for key in ("netliquidation", "availablefunds", "buyingpower"):
            node = raw.get(key, {})
            if isinstance(node, dict) and node.get("currency"):
                currency = node["currency"]
                break
        total_cb = sum(_num(p.get("cost_basis")) for p in positions)
        total_unr = sum(_num(p.get("unrealized")) for p in positions)
        return {
            "source": "IBKR_LIVE",
            "mode": "ibkr-live",
            "as_of": datetime.now(timezone.utc).isoformat(),
            "total_value": round(total_value, 2),
            "cash": round(_amt("totalcashvalue"), 2),
            "buying_power": round(_amt("buyingpower"), 2),
            "available_funds": round(_amt("availablefunds"), 2),
            "maint_margin_req": round(_amt("maintmarginreq"), 2),
            "init_margin_req": round(_amt("initmarginreq"), 2),
            "excess_liquidity": round(_amt("excessliquidity"), 2),
            "gross_position_value": round(_amt("grosspositionvalue"), 2),
            "currency": currency,
            "daily_pnl": 0,
            "daily_pnl_pct": 0,
            "unrealized": round(total_unr, 2),
            "unrealized_pct": round(total_unr / total_cb * 100, 2) if total_cb else 0,
            "positions_count": len(positions),
        }

    def _normalize_live_trades(self, raw_trades: List[Dict[str, Any]], account_id: str) -> List[Dict[str, Any]]:
        trades = []
        for t in raw_trades or []:
            sym = t.get("symbol") or t.get("ticker", "")
            qty = t.get("quantity") or t.get("size")
            trades.append({
                "accountId": account_id,
                "account_id": account_id,
                "symbol": sym,
                "side": _normalize_side(t.get("side", "")),
                "quantity": _num(qty) if qty is not None else None,
                "price": _num(t.get("price") or t.get("lastPrice")),
                "currency": t.get("currency", "USD"),
                "trade_time": _parse_trade_time(t.get("tradeTime") or t.get("trade_time", "")),
                "exchange": t.get("exchange", ""),
                "commission": _num(t.get("commission")) if t.get("commission") is not None else None,
            })
        return trades

    def _persist_live_snapshot(self, bundle: Dict[str, Any]) -> None:
        positions_payload = {
            "source": bundle.get("source", "IBKR_LIVE"),
            "mode": bundle.get("mode", "ibkr-live"),
            "as_of": bundle.get("as_of"),
            "account_id": bundle.get("account_id"),
            "positions": bundle.get("positions", []),
        }
        summary_payload = {
            **(bundle.get("summary") or {}),
            "source": bundle.get("source", "IBKR_LIVE"),
            "mode": bundle.get("mode", "ibkr-live"),
            "as_of": bundle.get("as_of"),
        }
        trades_payload = {
            "source": bundle.get("source", "IBKR_LIVE"),
            "mode": bundle.get("mode", "ibkr-live"),
            "as_of": bundle.get("as_of"),
            "trades": bundle.get("trades", []),
        }
        meta_payload = {
            "source": bundle.get("source", "IBKR_LIVE"),
            "mode": bundle.get("mode", "ibkr-live"),
            "snapshot_timestamp": bundle.get("snapshot_timestamp") or bundle.get("as_of"),
            "as_of": bundle.get("as_of"),
            "account_id": bundle.get("account_id"),
            "provider_class": self.__class__.__name__,
            "positions_count": len(bundle.get("positions", [])),
            "trades_count": len(bundle.get("trades", [])),
            "snapshot_available": True,
        }
        _save_snapshot_bundle({
            "positions_payload": positions_payload,
            "summary_payload": {"summary": summary_payload},
            "trades_payload": {"trades": trades_payload["trades"], "source": trades_payload["source"], "mode": trades_payload["mode"], "as_of": trades_payload["as_of"]},
            "meta_payload": meta_payload,
        })

    def get_positions(self) -> List[Dict]:
        return self._fetch_live_bundle()["positions"]

    def get_summary(self) -> Dict[str, Any]:
        return self._fetch_live_bundle()["summary"]

    def get_trades(self) -> List[Dict]:
        try:
            bundle = self._fetch_live_bundle()
            if bundle.get("trades") is not None:
                return bundle["trades"]
        except Exception as live_error:
            bundle = _load_snapshot_bundle()
            trades_payload = bundle.get("trades_payload") or {}
            trades = trades_payload.get("trades") if isinstance(trades_payload, dict) else []
            if isinstance(trades, list):
                return trades
            raise live_error
        return []

    def get_portfolio(self) -> Dict[str, Any]:
        from services.state import compute_exposures, risk_doctor, today_actions, stress_tests, macro_snapshot
        bundle = self._fetch_live_bundle()
        positions = bundle["positions"]
        summary = bundle["summary"]
        total_value = summary.get("total_value", 0) or sum(p.get("market_value", 0) for p in positions)
        for p in positions:
            p["portfolio_pct"] = round(p.get("market_value", 0) / total_value * 100, 2) if total_value else 0
        macros = macro_snapshot()
        total_cb = sum(p.get("cost_basis", 0) for p in positions)
        total_unr = sum(p.get("unrealized", 0) for p in positions)
        return {
            "source": "IBKR_LIVE",
            "mode": "ibkr-live",
            "as_of": bundle["as_of"],
            "snapshot_available": True,
            "snapshot_timestamp": bundle["snapshot_timestamp"],
            "total_value": round(total_value, 2),
            "cost_basis": round(total_cb, 2),
            "daily_pnl": summary.get("daily_pnl", 0),
            "daily_pnl_pct": summary.get("daily_pnl_pct", 0),
            "unrealized": round(total_unr, 2),
            "unrealized_pct": round(total_unr / total_cb * 100, 2) if total_cb else 0,
            "cash": summary.get("cash", 0),
            "buying_power": summary.get("buying_power", 0),
            "margin_used": round(summary.get("maint_margin_req", 0) / total_value * 100, 2) if total_value else 0,
            "risk_mode": "IBKR LIVE",
            "positions": positions,
            "exposures": compute_exposures(positions, total_value),
            "guardrails": risk_doctor(positions, macros),
            "today_actions": today_actions(positions, macros),
            "stress_tests": stress_tests(total_value),
            "journal": [],
        }

    def get_snapshot_meta(self) -> Dict[str, Any]:
        return _load_snapshot_bundle()["meta_payload"] or {}


# ─── Provider Factory ─────────────────────────────────────────────────────────

def _normalize_mode(mode: str) -> str:
    mode = (mode or "").strip().lower()
    if mode in _LIVE_MODE_ALIASES:
        return "ibkr-live"
    if mode in _LAST_UPDATE_MODE_ALIASES:
        return "last-update"
    if mode == "mock":
        return "mock"
    return mode


def get_data_source_mode() -> str:
    """Resolve active mode from persisted settings, keeping IBKR live state synchronized."""
    settings, data_mode, ibkr_mode = _read_settings_mode()
    normalized_data_mode = _normalize_mode(data_mode)
    if normalized_data_mode in _PROVIDER_MODES:
        return normalized_data_mode
    if _normalize_mode(ibkr_mode) == "ibkr-live" and bool((settings.get("ibkr") or {}).get("enabled", True)):
        return "ibkr-live"
    env = os.getenv("PIA_PORTFOLIO_DATA_SOURCE", "").lower()
    env_mode = _normalize_mode(env)
    if env_mode in _PROVIDER_MODES:
        return env_mode
    return "mock"


def set_data_source_mode(mode: str) -> str:
    """Persist mode to settings DB. Returns the resolved mode."""
    mode = _normalize_mode(mode)
    if mode not in _PROVIDER_MODES:
        raise ValueError(f"Invalid mode '{mode}'. Must be one of: {', '.join(_PROVIDER_MODES)}")
    from services.settings_store import get_settings, save_settings
    settings = get_settings()
    settings.setdefault("data_source", {})["mode"] = mode
    settings.setdefault("ibkr", {})["mode"] = "live" if mode == "ibkr-live" else "client_portal_gateway"
    save_settings(settings)
    return mode


def _diagnose_live_provider(provider: IbkrLivePortfolioProvider) -> Dict[str, Any]:
    gateway_reachable = False
    ibkr_authenticated = False
    gateway_status = "not_applicable"
    gateway_error = None
    accounts_available = False
    positions_available = False
    trades_available = False
    account_id = None
    try:
        auth = provider.get_auth_status()
        gateway_error = auth.get("error")
        gateway_reachable = "authenticated" in auth and not gateway_error
        ibkr_authenticated = bool(auth.get("authenticated"))
        if not gateway_reachable:
            gateway_status = "gateway_down"
        else:
            try:
                accounts = provider._get("/portfolio/accounts", timeout=2.0)
                accounts_available = isinstance(accounts, list) and len(accounts) > 0
                if accounts_available:
                    account_id = accounts[0].get("id")
                    provider._account_id = account_id
            except Exception as e:
                gateway_error = gateway_error or str(e)
            try:
                if account_id:
                    positions = provider._get(f"/portfolio/{account_id}/positions/0", timeout=3.0)
                    positions_available = isinstance(positions, list) and len(positions) > 0
            except Exception as e:
                gateway_error = gateway_error or str(e)
            try:
                trades = provider._get("/iserver/account/trades", timeout=3.0)
                trades_available = isinstance(trades, list)
            except Exception:
                trades_available = False
            if accounts_available or positions_available:
                gateway_status = "connected"
            elif ibkr_authenticated:
                gateway_status = "connected"
            else:
                gateway_status = "unauthenticated"
    except Exception as e:
        gateway_status = "error"
        gateway_error = gateway_error or str(e)
    return {
        "gateway_status": gateway_status,
        "gateway_error": gateway_error,
        "ibkr_gateway_reachable": gateway_reachable,
        "ibkr_authenticated": ibkr_authenticated,
        "accounts_available": accounts_available,
        "positions_available": positions_available,
        "trades_available": trades_available,
    }


def resolve_portfolio_provider() -> ProviderResolution:
    """Resolve the active portfolio provider and expose fallback metadata."""
    mode = get_data_source_mode()
    snapshot = SnapshotPortfolioProvider()
    snapshot_available = snapshot.is_available()
    snapshot_meta = snapshot.get_snapshot_meta() if snapshot_available else {}
    snapshot_timestamp = _snapshot_timestamp(snapshot_meta)

    if mode == "last-update":
        if snapshot_available:
            return ProviderResolution(
                provider=snapshot,
                configured_mode=mode,
                active_source=snapshot.source_name,
                fallback_active=False,
                fallback_reason=None,
                provider_class=snapshot.__class__.__name__,
                snapshot_available=True,
                snapshot_timestamp=snapshot_timestamp,
            )
        mock = MockPortfolioProvider()
        return ProviderResolution(
            provider=mock,
            configured_mode=mode,
            active_source=mock.source_name,
            fallback_active=True,
            fallback_reason="No saved IBKR snapshot available; using mock fallback.",
            provider_class=mock.__class__.__name__,
            snapshot_available=False,
            snapshot_timestamp=None,
        )

    if mode == "ibkr-live":
        live = IbkrLivePortfolioProvider()
        diagnostics = _diagnose_live_provider(live)
        if diagnostics["gateway_status"] == "connected" and (diagnostics["positions_available"] or diagnostics["accounts_available"] or diagnostics["ibkr_authenticated"]):
            live_meta = live.get_snapshot_meta() if hasattr(live, "get_snapshot_meta") else {}
            live_timestamp = _snapshot_timestamp(live_meta) or snapshot_timestamp
            return ProviderResolution(
                provider=live,
                configured_mode=mode,
                active_source=live.source_name,
                fallback_active=False,
                fallback_reason=None,
                provider_class=live.__class__.__name__,
                snapshot_available=bool(live_timestamp or snapshot_available),
                snapshot_timestamp=live_timestamp or snapshot_timestamp,
                **diagnostics,
            )
        if snapshot_available:
            return ProviderResolution(
                provider=snapshot,
                configured_mode=mode,
                active_source=snapshot.source_name,
                fallback_active=True,
                fallback_reason="Client Portal Gateway unavailable; using last-update snapshot.",
                provider_class=snapshot.__class__.__name__,
                snapshot_available=True,
                snapshot_timestamp=snapshot_timestamp,
                **diagnostics,
            )
        mock = MockPortfolioProvider()
        return ProviderResolution(
            provider=mock,
            configured_mode=mode,
            active_source=mock.source_name,
            fallback_active=True,
            fallback_reason="Client Portal Gateway unavailable and no saved snapshot exists; using mock fallback.",
            provider_class=mock.__class__.__name__,
            snapshot_available=False,
            snapshot_timestamp=None,
            **diagnostics,
        )

    mock = MockPortfolioProvider()
    return ProviderResolution(
        provider=mock,
        configured_mode=mode if mode in _PROVIDER_MODES else "mock",
        active_source=mock.source_name,
        fallback_active=False,
        fallback_reason=None,
        provider_class=mock.__class__.__name__,
        snapshot_available=False,
        snapshot_timestamp=None,
    )


def get_active_provider():
    """Return the resolved active provider."""
    return resolve_portfolio_provider().provider


def get_provider_status() -> Dict[str, Any]:
    """Return provider status info for API consumers."""
    resolution = resolve_portfolio_provider()
    mode = resolution.configured_mode
    snapshot_available = resolution.snapshot_available
    fallback_active = resolution.fallback_active
    if fallback_active:
        status = "fallback"
        message = resolution.fallback_reason or f"{provider_mode_label(mode)} unavailable. Using {provider_source_label(resolution.active_source)}."
    elif mode == "ibkr-live":
        if resolution.gateway_status == "connected" and (resolution.ibkr_authenticated or resolution.positions_available or resolution.accounts_available):
            status = "connected"
            message = "Connected to Client Portal Gateway."
        elif resolution.gateway_status == "unauthenticated":
            status = "unauthenticated"
            message = "Client Portal Gateway is running. Login required."
        elif resolution.gateway_status == "gateway_down":
            status = "gateway_down"
            message = "Client Portal Gateway is not reachable at https://localhost:5000."
        else:
            status = "error"
            message = "Client Portal Gateway status could not be verified."
    else:
        status = "connected"
        message = f"{provider_mode_label(mode)} portfolio data selected."
    return {
        "status": status,
        "message": message,
        "configured_mode": mode,
        "configured_mode_label": provider_mode_label(mode),
        "active_source": resolution.active_source,
        "active_source_label": provider_source_label(resolution.active_source),
        "fallback_active": fallback_active,
        "fallback_reason": resolution.fallback_reason,
        "fallback_from": provider_mode_label(mode) if fallback_active else None,
        "provider_class": resolution.provider_class,
        "gateway_url": "https://localhost:5000",
        "gateway_api": _GATEWAY_BASE,
        "gateway_status": resolution.gateway_status,
        "gateway_error": resolution.gateway_error,
        "ibkr_gateway_reachable": resolution.ibkr_gateway_reachable,
        "ibkr_authenticated": resolution.ibkr_authenticated,
        "accounts_available": resolution.accounts_available,
        "positions_available": resolution.positions_available,
        "trades_available": resolution.trades_available,
        "snapshot_available": snapshot_available,
        "snapshot_timestamp": resolution.snapshot_timestamp,
        "mock_available": True,
    }
