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
import time
import threading
from collections import deque
from datetime import timedelta
import urllib.request
import urllib.error
from dataclasses import dataclass
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "ibkr-live"
_SNAPSHOT_DIR = Path(__file__).resolve().parents[1] / "data" / "snapshots" / "ibkr"
_SNAPSHOT_HISTORY_DIR = _SNAPSHOT_DIR / "history"
_SNAPSHOT_POSITIONS_FILE = _SNAPSHOT_DIR / "positions_latest.json"
_SNAPSHOT_SUMMARY_FILE = _SNAPSHOT_DIR / "summary_latest.json"
_SNAPSHOT_TRADES_FILE = _SNAPSHOT_DIR / "trades_latest.json"
_SNAPSHOT_META_FILE = _SNAPSHOT_DIR / "meta.json"
_SNAPSHOT_HISTORY_FILE = _SNAPSHOT_HISTORY_DIR / "history.jsonl"
_GATEWAY_BASE = "https://localhost:5000/v1/api"
_PROVIDER_MODES = ("mock", "last-update", "ibkr-live")
_ACTIVE_SOURCE_MAP = {"mock": "MOCK", "last-update": "LAST_UPDATE", "ibkr-live": "IBKR_LIVE"}
_MODE_LABELS = {"mock": "Mock Data", "last-update": "Last Update Real Data", "ibkr-live": "Live Data"}
_SOURCE_LABELS = {"MOCK": "Mock", "MOCK_FALLBACK": "Mock", "LAST_UPDATE": "Last Update", "IBKR_LIVE": "IBKR Live"}
_LIVE_MODE_ALIASES = {"live", "ibkr-live"}
_LAST_UPDATE_MODE_ALIASES = {"demo", "demo-samples", "sample", "snapshot", "last-update"}
_SNAPSHOT_STALE_AFTER_SECONDS = 15 * 60
_LIVE_REFRESH_SECONDS = 12.0
_SNAPSHOT_LOCK = threading.RLock()
_LIVE_QUOTE_TRACE_LOCK = threading.RLock()
_LIVE_QUOTE_TRACE: deque[Dict[str, Any]] = deque(maxlen=500)


def _num(v: Any, d: float = 0.0) -> float:
    try:
        return float(v) if v not in (None, "") else d
    except Exception:
        return d


def _maybe_num(v: Any) -> Optional[float]:
    try:
        return float(v) if v not in (None, "") else None
    except Exception:
        return None


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
    _SNAPSHOT_HISTORY_DIR.mkdir(parents=True, exist_ok=True)


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


def _snapshot_age_seconds(meta_payload: Dict[str, Any]) -> Optional[float]:
    timestamp = _snapshot_timestamp(meta_payload)
    if not timestamp:
        return None
    try:
        dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except Exception:
        return None
    return max(0.0, (datetime.now(timezone.utc) - dt).total_seconds())


def _append_snapshot_history(entry: Dict[str, Any]) -> None:
    _ensure_snapshot_dir()
    line = json.dumps(entry, ensure_ascii=False)
    with open(_SNAPSHOT_HISTORY_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def _load_snapshot_history(limit: Optional[int] = None) -> List[Dict[str, Any]]:
    if not _SNAPSHOT_HISTORY_FILE.exists():
        return []
    entries: List[Dict[str, Any]] = []
    try:
        with open(_SNAPSHOT_HISTORY_FILE, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                    if isinstance(row, dict):
                        entries.append(row)
                except Exception:
                    continue
    except Exception:
        return []
    entries.sort(key=lambda row: str(row.get("timestamp") or row.get("snapshot_timestamp") or ""), reverse=True)
    if limit and limit > 0:
        return entries[:limit]
    return entries


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
    contract_desc = _position_contract_desc(position)
    symbol = str(position.get("symbol") or position.get("ticker") or "").strip()
    return _classify_asset_class(raw, contract_desc, symbol)


def _position_currency(position: Dict[str, Any]) -> str:
    return str(position.get("currency") or "USD").upper()


def _position_key(position: Dict[str, Any]) -> tuple[str, str, str, str, str]:
    return (
        _position_account_id(position),
        _position_conid(position),
        _position_asset_class(position),
        _position_contract_desc(position).upper(),
        _position_currency(position),
    )


def _position_multiplier(position: Dict[str, Any]) -> float:
    if str(_position_asset_class(position)).upper() == "OPT":
        return _num(position.get("multiplier") or 100, 100)
    return _num(position.get("multiplier") or 1, 1)


def _position_quote_refresh_age(refresh_at: Optional[str]) -> Optional[float]:
    if not refresh_at:
        return None
    try:
        dt = datetime.fromisoformat(str(refresh_at).replace("Z", "+00:00"))
    except Exception:
        return None
    return max(0.0, (datetime.now(timezone.utc) - dt).total_seconds())


def _record_live_quote_trace(
    *,
    symbol: str,
    conid: str,
    source: str,
    quote_timestamp: Optional[str],
    server_timestamp: Optional[str] = None,
    age_seconds: Optional[float] = None,
) -> None:
    payload = {
        "symbol": str(symbol or "").upper(),
        "conid": str(conid or ""),
        "source": source,
        "quoteTimestamp": quote_timestamp,
        "serverTimestamp": server_timestamp or datetime.now(timezone.utc).isoformat(),
        "ageSeconds": age_seconds,
    }
    with _LIVE_QUOTE_TRACE_LOCK:
        _LIVE_QUOTE_TRACE.append(payload)


def get_live_quote_trace(limit: Optional[int] = None) -> List[Dict[str, Any]]:
    with _LIVE_QUOTE_TRACE_LOCK:
        rows = list(_LIVE_QUOTE_TRACE)
    rows.sort(key=lambda row: str(row.get("serverTimestamp") or ""), reverse=True)
    if limit and limit > 0:
        return rows[:limit]
    return rows


def _is_snapshot_stale(meta_payload: Dict[str, Any], threshold_seconds: float = _SNAPSHOT_STALE_AFTER_SECONDS) -> bool:
    age = _snapshot_age_seconds(meta_payload)
    return bool(age is not None and age > threshold_seconds)


def _option_metadata(contract_desc: str, fallback_symbol: str = "") -> Dict[str, Any]:
    text = str(contract_desc or "").strip()
    bracket = re.search(r"\[([^\]]+)\]", text)
    candidate = bracket.group(1).strip() if bracket else text
    normalized = re.sub(r"\s+", " ", candidate).upper()
    underlying = fallback_symbol.strip().upper()
    expiration = None
    strike = None
    call_put = None
    iso_match = re.search(r"(?P<underlying>[A-Z0-9.\-]+)\s+(?P<expiry>\d{6}|\d{8})(?P<cp>[CP])(?P<strike>\d{8})", normalized)
    if iso_match:
        underlying = iso_match.group("underlying").strip().upper() or underlying
        expiry = iso_match.group("expiry")
        call_put = iso_match.group("cp")
        strike = _num(int(iso_match.group("strike")) / 1000.0)
        try:
            if len(expiry) == 6:
                expiration = datetime.strptime(expiry, "%y%m%d").date().isoformat()
            else:
                expiration = datetime.strptime(expiry, "%Y%m%d").date().isoformat()
        except Exception:
            expiration = expiry
    else:
        text_match = re.search(
            r"(?P<underlying>[A-Z0-9.\-]+)\s+(?P<month>[A-Z]{3})\s*(?P<year>\d{4}|\d{2})\s+(?P<strike>\d+(?:\.\d+)?)(?:\s*)?(?P<cp>[CP])",
            normalized,
        )
        if text_match:
            underlying = text_match.group("underlying").strip().upper() or underlying
            call_put = text_match.group("cp")
            strike = _num(text_match.group("strike"))
            try:
                month_map = {
                    "JAN": 1,
                    "FEB": 2,
                    "MAR": 3,
                    "APR": 4,
                    "MAY": 5,
                    "JUN": 6,
                    "JUL": 7,
                    "AUG": 8,
                    "SEP": 9,
                    "OCT": 10,
                    "NOV": 11,
                    "DEC": 12,
                }
                month = month_map.get(text_match.group("month"))
                if month:
                    year = text_match.group("year")
                    year_value = int(year)
                    if len(year) == 2:
                        year_value += 2000 if year_value < 70 else 1900
                    expiration = f"{year_value:04d}-{month:02d}"
            except Exception:
                pass
    return {
        "underlying": underlying or fallback_symbol.upper(),
        "expiration": expiration,
        "strike": strike,
        "call_put": call_put,
    }


def _classify_asset_class(raw: Any, contract_desc: str = "", symbol: str = "") -> str:
    value = str(raw or "").upper().strip()
    desc = f"{contract_desc} {symbol}".upper()
    if value in {"OPT", "OPTION", "OPTIONS"}:
        return "OPT"
    if value == "CRYPTO":
        return "CRYPTO"
    if re.search(r"\b\d{6,8}[CP]\b", desc) or re.search(r"\b[A-Z0-9.\-]+\s+[A-Z]{3}\s*\d{2,4}\s+\d+(?:\.\d+)?\s*[CP]\b", desc):
        return "OPT"
    if any(token in desc for token in ("CASH", "CURRENCY", "FX")):
        return "CASH"
    if any(token in desc for token in ("BTC", "ETH", "XRP", "SOL", "DOGE", "CRYPTO")):
        return "CRYPTO"
    if value == "STK":
        return "STK"
    if value == "ETF":
        return "STK"
    return "STK"


def _aggregate_positions(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    grouped: Dict[tuple[str, str, str, str, str], Dict[str, Any]] = {}
    for raw in rows or []:
        if not isinstance(raw, dict):
            continue
        key = _position_key(raw)
        current = grouped.get(key)
        qty = _num(raw.get("qty") or raw.get("quantity") or raw.get("position"))
        contract_desc = _position_contract_desc(raw)
        symbol = str(raw.get("symbol") or raw.get("ticker") or raw.get("underlying") or "").strip()
        asset_class = _classify_asset_class(raw.get("assetClass") or raw.get("sec_type") or raw.get("asset_type"), contract_desc, symbol)
        is_opt = asset_class == "OPT"
        option_meta = _option_metadata(contract_desc, fallback_symbol=symbol)
        multiplier = _num(raw.get("multiplier") or (100 if is_opt else 1), 100 if is_opt else 1)
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
                "assetClass": asset_class,
                "sec_type": asset_class,
                "contractDesc": contract_desc,
                "contract_desc": contract_desc,
                "symbol": str(raw.get("symbol") or option_meta.get("underlying") or symbol or contract_desc or "").strip(),
                "underlying": str(raw.get("underlying") or option_meta.get("underlying") or symbol or "").strip(),
                "expiry": raw.get("expiry") or raw.get("expiration") or option_meta.get("expiration"),
                "expiration": raw.get("expiry") or raw.get("expiration") or option_meta.get("expiration"),
                "strike": raw.get("strike") if raw.get("strike") is not None else option_meta.get("strike"),
                "call_put": raw.get("call_put") or option_meta.get("call_put"),
                "multiplier": multiplier,
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
        if raw.get("expiration"):
            current["expiry"] = raw.get("expiration")
            current["expiration"] = raw.get("expiration")
        if raw.get("expiry"):
            current["expiry"] = raw.get("expiry")
            current["expiration"] = raw.get("expiry")
        if raw.get("strike") is not None:
            current["strike"] = raw.get("strike")
        if raw.get("call_put"):
            current["call_put"] = raw.get("call_put")
        current["multiplier"] = multiplier
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
        row["sec_type"] = _classify_asset_class(row.get("sec_type") or row.get("assetClass") or row.get("asset_type"), row.get("contractDesc", ""), row.get("symbol", ""))
        row["assetClass"] = row["sec_type"]
        row["contractDesc"] = str(row.get("contractDesc") or row.get("name") or row.get("symbol") or "").strip()
        row["contract_desc"] = row["contractDesc"]
        row["accountId"] = str(row.get("accountId") or row.get("account_id") or "")
        row["account_id"] = row["accountId"]
        row["conid"] = str(row.get("conid") or row.get("conId") or row.get("contract_id") or "")
        row["currency"] = _position_currency(row)
        if row["assetClass"] == "OPT":
            option_meta = _option_metadata(row["contractDesc"], fallback_symbol=row["underlying"] or row["symbol"])
            row.setdefault("underlying", option_meta.get("underlying") or row["symbol"])
            row.setdefault("expiry", option_meta.get("expiration"))
            row.setdefault("expiration", option_meta.get("expiration"))
            row.setdefault("strike", option_meta.get("strike"))
            row.setdefault("call_put", option_meta.get("call_put"))
            row.setdefault("multiplier", _num(row.get("multiplier") or 100, 100))
        else:
            row.setdefault("multiplier", _num(row.get("multiplier") or 1, 1))
        row["portfolio_pct"] = _num(row.get("portfolio_pct"))
        aggregated.append(row)
    return aggregated


def normalize_positions(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return _aggregate_positions(list(rows or []))


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
        p["positions"] = normalize_positions(p.get("positions", []))
        p["source"] = "MOCK"
        return p

    def get_positions(self) -> List[Dict]:
        from services.state import portfolio_snapshot
        return normalize_positions(portfolio_snapshot().get("positions", []))

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
            "daily_pnl_pct": p.get("daily_pnl_pct", 0),
            "net_liquidation": p.get("total_value", 0),
            "currency": "USD",
            "is_live": False,
            "is_stale": False,
            "stale_reason": None,
        }

    def get_trades(self) -> List[Dict]:
        return []


class DisconnectedPortfolioProvider:
    source_name = "DISCONNECTED"

    def is_available(self) -> bool:
        return False

    def get_portfolio(self) -> Dict[str, Any]:
        return {
            "source": "DISCONNECTED",
            "mode": "disconnected",
            "as_of": None,
            "snapshot_available": False,
            "snapshot_timestamp": None,
            "is_live": False,
            "is_stale": True,
            "stale_reason": "Gateway offline and no saved snapshot is available.",
            "total_value": 0,
            "cash": 0,
            "buying_power": 0,
            "unrealized": 0,
            "unrealized_pct": 0,
            "daily_pnl": 0,
            "daily_pnl_pct": 0,
            "cost_basis": 0,
            "margin_used": 0,
            "risk_mode": "DISCONNECTED",
            "positions": [],
            "exposures": {"rows": [], "top_name": None, "top_pct": 0},
            "guardrails": [],
            "today_actions": [],
            "stress_tests": [],
            "journal": [],
        }

    def get_positions(self) -> List[Dict]:
        return []

    def get_summary(self) -> Dict[str, Any]:
        return {
            "source": "DISCONNECTED",
            "mode": "disconnected",
            "as_of": None,
            "total_value": 0,
            "cash": 0,
            "buying_power": 0,
            "unrealized": 0,
            "unrealized_pct": 0,
            "daily_pnl": 0,
            "daily_pnl_pct": 0,
            "currency": "USD",
            "snapshot_available": False,
            "snapshot_timestamp": None,
            "net_liquidation": 0,
            "is_live": False,
            "is_stale": True,
            "stale_reason": "Gateway offline and no saved snapshot is available.",
        }

    def get_trades(self) -> List[Dict]:
        return []

    def get_snapshot_meta(self) -> Dict[str, Any]:
        return {}


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
    is_live: bool = False
    is_stale: bool = False
    stale_reason: Optional[str] = None


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
            "is_live": False,
            "is_stale": _is_snapshot_stale(meta),
            "stale_reason": "Saved snapshot is stale." if _is_snapshot_stale(meta) else None,
            "total_value": round(total_value, 2),
            "cash": _num(summary.get("cash")),
            "buying_power": _num(summary.get("buying_power") or summary.get("buyingPower")),
            "available_funds": _num(summary.get("available_funds") or summary.get("availableFunds")),
            "maint_margin_req": _num(summary.get("maint_margin_req") or summary.get("maintMarginReq")),
            "init_margin_req": _num(summary.get("init_margin_req") or summary.get("initMarginReq")),
            "excess_liquidity": _num(summary.get("excess_liquidity") or summary.get("excessLiquidity")),
            "gross_position_value": _num(summary.get("gross_position_value") or summary.get("grossPositionValue")),
            "net_liquidation": round(total_value, 2),
            "currency": str(summary.get("currency") or "USD"),
            "daily_pnl": _num(summary.get("daily_pnl")),
            "daily_pnl_pct": _num(summary.get("daily_pnl_pct")),
            "unrealized": round(total_unr, 2),
            "unrealized_pct": round(total_unr / total_cb * 100, 2) if total_cb else 0,
            "positions_count": len(positions),
            "is_live": False,
            "is_stale": _is_snapshot_stale(meta),
            "stale_reason": "Saved snapshot is stale." if _is_snapshot_stale(meta) else None,
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
            "is_live": False,
            "is_stale": _is_snapshot_stale(meta),
            "stale_reason": "Saved snapshot is stale." if _is_snapshot_stale(meta) else None,
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
    _CACHE_LOCK = threading.RLock()
    _CACHE_BUNDLE: Optional[Dict[str, Any]] = None
    _CACHE_AT: Optional[datetime] = None
    _CACHE_ERROR: Optional[str] = None
    _CACHE_TTL_SECONDS = _LIVE_REFRESH_SECONDS
    _HEARTBEAT_LOCK = threading.RLock()
    _HEARTBEAT_CACHE: Optional[Dict[str, Any]] = None
    _HEARTBEAT_AT: Optional[datetime] = None
    _HEARTBEAT_TTL_SECONDS = 4.0
    _QUOTE_FIELDS = "31,7059,84,85,86,87,88"
    _QUOTE_BATCH_SIZE = 25
    _REFRESH_THREAD_LOCK = threading.RLock()
    _REFRESH_THREAD: Optional[threading.Thread] = None
    _REFRESH_STOP = threading.Event()

    def __init__(self) -> None:
        self._ssl_ctx = ssl._create_unverified_context()
        self._account_id: Optional[str] = None
        self.__class__._ensure_refresh_loop(self)

    @classmethod
    def invalidate_cache(cls) -> None:
        with cls._CACHE_LOCK:
            cls._CACHE_BUNDLE = None
            cls._CACHE_AT = None
            cls._CACHE_ERROR = None

    @classmethod
    def _ensure_refresh_loop(cls, instance: Optional["IbkrLivePortfolioProvider"] = None) -> None:
        with cls._REFRESH_THREAD_LOCK:
            if cls._REFRESH_THREAD and cls._REFRESH_THREAD.is_alive():
                return
            if instance is None:
                return

            def _run() -> None:
                instance._refresh_loop()

            cls._REFRESH_STOP.clear()
            cls._REFRESH_THREAD = threading.Thread(target=_run, daemon=True, name="IbkrLivePortfolioRefresh")
            cls._REFRESH_THREAD.start()

    def _refresh_loop(self) -> None:
        while not self._REFRESH_STOP.is_set():
            try:
                if self.get_gateway_heartbeat().get("gateway_open"):
                    self._fetch_live_bundle()
            except Exception as exc:
                with self._CACHE_LOCK:
                    if self._CACHE_BUNDLE:
                        self._CACHE_BUNDLE["is_stale"] = True
                        self._CACHE_BUNDLE["stale_reason"] = str(exc)
                        self._CACHE_BUNDLE["fallback_active"] = True
                        self._CACHE_BUNDLE["fallback_reason"] = str(exc)
                        self._CACHE_BUNDLE["pricesLive"] = False
            self._REFRESH_STOP.wait(self._CACHE_TTL_SECONDS)

    def _get(self, path: str, timeout: float = 5.0) -> Any:
        url = f"{_GATEWAY_BASE}{path}"
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout, context=self._ssl_ctx) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def _safe_get(self, path: str, timeout: float = 5.0) -> tuple[Any, Optional[str]]:
        try:
            return self._get(path, timeout=timeout), None
        except Exception as exc:
            return None, str(exc)

    def get_gateway_heartbeat(self) -> Dict[str, Any]:
        with self._HEARTBEAT_LOCK:
            if self._HEARTBEAT_CACHE and self._HEARTBEAT_AT:
                age = (datetime.now(timezone.utc) - self._HEARTBEAT_AT).total_seconds()
                if age <= self._HEARTBEAT_TTL_SECONDS:
                    return deepcopy(self._HEARTBEAT_CACHE)
        auth, auth_error = self._safe_get("/iserver/auth/status", timeout=2.0)
        reachable = auth_error is None and isinstance(auth, dict)
        authenticated = bool(auth.get("authenticated")) if isinstance(auth, dict) else False
        status = "connected" if reachable and authenticated else ("unauthenticated" if reachable else "gateway_down")
        payload = {
            "gateway_open": bool(reachable and authenticated),
            "gateway_status": status,
            "gateway_error": auth_error,
            "ibkr_authenticated": authenticated,
            "auth_status": auth if isinstance(auth, dict) else {},
        }
        with self._HEARTBEAT_LOCK:
            self._HEARTBEAT_CACHE = deepcopy(payload)
            self._HEARTBEAT_AT = datetime.now(timezone.utc)
        return payload

    def is_available(self) -> bool:
        return bool(self.get_gateway_heartbeat().get("gateway_open"))

    def get_auth_status(self) -> Dict[str, Any]:
        heartbeat = self.get_gateway_heartbeat()
        auth = heartbeat.get("auth_status") or {}
        if isinstance(auth, dict):
            auth.setdefault("authenticated", False)
            if heartbeat.get("gateway_error"):
                auth["error"] = heartbeat["gateway_error"]
            return auth
        return {"authenticated": False, "error": heartbeat.get("gateway_error")}

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

    @staticmethod
    def _chunk(values: List[str], size: int) -> List[List[str]]:
        return [values[idx: idx + size] for idx in range(0, len(values), max(1, size))]

    @staticmethod
    def _quote_entry_is_populated(entry: Any) -> bool:
        if not isinstance(entry, dict):
            return False
        for key in ("31", "last", "lastPrice", "mktPrice", "marketPrice", "84", "86"):
            value = entry.get(key)
            if value not in (None, ""):
                return True
        return False

    def _fetch_market_quotes(self, conids: List[str]) -> Dict[str, Dict[str, Any]]:
        conid_list = [str(conid).strip() for conid in conids if str(conid).strip()]
        if not conid_list:
            return {}
        quote_map: Dict[str, Dict[str, Any]] = {}
        refresh_at = datetime.now(timezone.utc).isoformat()
        for batch in self._chunk(conid_list, self._QUOTE_BATCH_SIZE):
            query = f"/iserver/marketdata/snapshot?conids={','.join(batch)}&fields={self._QUOTE_FIELDS}"
            raw_quotes = self._get(query, timeout=2.5)
            if not isinstance(raw_quotes, list):
                raw_quotes = []
            if raw_quotes and not any(self._quote_entry_is_populated(entry) for entry in raw_quotes):
                time.sleep(0.1)
                raw_quotes = self._get(f"/iserver/marketdata/snapshot?conids={','.join(batch)}", timeout=2.5)
                if not isinstance(raw_quotes, list):
                    raw_quotes = []
            for entry in raw_quotes:
                if not isinstance(entry, dict):
                    continue
                conid = str(entry.get("conid") or entry.get("conidEx") or entry.get("conId") or "").strip()
                if not conid:
                    continue
                symbol = str(entry.get("symbol") or entry.get("ticker") or entry.get("55") or "").strip().upper()
                quote_last_refresh = refresh_at
                quote_map[conid] = {
                    "conid": conid,
                    "last": _maybe_num(entry.get("31") or entry.get("last") or entry.get("lastPrice") or entry.get("mktPrice")),
                    "bid": _maybe_num(entry.get("84") or entry.get("bid")),
                    "ask": _maybe_num(entry.get("86") or entry.get("ask")),
                    "previous_close": _maybe_num(entry.get("85") or entry.get("previousClose") or entry.get("prevClose") or entry.get("close")),
                    "volume": _maybe_num(entry.get("87") or entry.get("volume")),
                    "bid_size": _maybe_num(entry.get("88") or entry.get("bidSize")),
                    "quoteLastRefresh": quote_last_refresh,
                    "quoteSource": "IBKR_MARKETDATA_SNAPSHOT",
                    "quoteStale": False,
                    "quoteStaleReason": None,
                    "raw": entry,
                }
                _record_live_quote_trace(
                    symbol=symbol or conid,
                    conid=conid,
                    source="LIVE",
                    quote_timestamp=quote_last_refresh,
                    server_timestamp=quote_last_refresh,
                    age_seconds=0.0,
                )
        return quote_map

    def _fetch_partitioned_pnl(self) -> Optional[Dict[str, Any]]:
        try:
            raw = self._get("/iserver/account/pnl/partitioned", timeout=2.0)
        except Exception:
            return None
        if isinstance(raw, list):
            raw = raw[0] if raw else {}
        if not isinstance(raw, dict):
            return None
        for key in ("dpl", "dailyPnL", "dailyPnl", "dayPnL", "dayPnl"):
            daily = _maybe_num(raw.get(key))
            if daily is not None:
                return {
                    "daily_pnl": daily,
                    "daily_pnl_pct": _maybe_num(raw.get("dpnlpct") or raw.get("dailyPnLPct") or raw.get("daily_pnl_pct")),
                    "unrealized": _maybe_num(raw.get("upl") or raw.get("unrealizedPnL") or raw.get("unrealized_pnl")),
                    "net_liquidation": _maybe_num(raw.get("nl") or raw.get("netLiquidation") or raw.get("netliquidation")),
                    "market_value": _maybe_num(raw.get("mv") or raw.get("marketValue") or raw.get("market_value")),
                }
        return None

    def _position_quote_key(self, position: Dict[str, Any]) -> tuple[str, str, str, str, str]:
        return _position_key(position)

    def _overlay_live_quotes(
        self,
        positions: List[Dict[str, Any]],
        quote_map: Dict[str, Dict[str, Any]],
        previous_positions: Optional[List[Dict[str, Any]]] = None,
    ) -> tuple[List[Dict[str, Any]], bool, bool, Optional[str], Optional[str]]:
        previous_lookup = {_position_key(position): position for position in previous_positions or [] if isinstance(position, dict)}
        refreshed_at = datetime.now(timezone.utc).isoformat()
        quote_refreshes = []
        prices_live = True
        any_quote_refresh = False
        fallback_reason = None
        merged_positions: List[Dict[str, Any]] = []
        for position in positions:
            raw_conid = str(position.get("conid") or "").strip()
            quote = quote_map.get(raw_conid) if raw_conid else None
            previous = previous_lookup.get(self._position_quote_key(position))
            merged = dict(position)
            has_fresh_quote = bool(quote and quote.get("last") is not None)
            if has_fresh_quote:
                any_quote_refresh = True
                quote_last_refresh = quote.get("quoteLastRefresh") or refreshed_at
                last_price = _num(quote.get("last"))
                prev_close = quote.get("previous_close")
                if prev_close is None:
                    prev_close = _maybe_num(merged.get("previousClose") or merged.get("prevClose") or merged.get("closePrice"))
                multiplier = _num(merged.get("multiplier") or _position_multiplier(merged), _position_multiplier(merged))
                qty = _num(merged.get("qty") or merged.get("quantity") or merged.get("position"))
                market_value = round(last_price * qty * multiplier, 2) if qty else _num(merged.get("market_value"))
                cost_basis = _num(merged.get("cost_basis") or merged.get("costBasis"))
                unrealized = round(market_value - cost_basis, 2) if cost_basis or market_value else _num(merged.get("unrealized"))
                merged.update(
                    {
                        "last": round(last_price, 4),
                        "previousClose": round(prev_close, 4) if prev_close is not None else merged.get("previousClose"),
                        "prevClose": round(prev_close, 4) if prev_close is not None else merged.get("prevClose"),
                        "day_change": round(last_price - prev_close, 2) if prev_close is not None else _num(merged.get("day_change")),
                        "day_change_pct": round(((last_price - prev_close) / prev_close) * 100, 2) if prev_close else _num(merged.get("day_change_pct")),
                        "market_value": round(market_value, 2) if market_value is not None else merged.get("market_value"),
                        "unrealized": round(unrealized, 2) if unrealized is not None else merged.get("unrealized"),
                        "unrealized_pct": round(unrealized / cost_basis * 100, 2) if cost_basis else _num(merged.get("unrealized_pct")),
                        "quoteLastRefresh": quote_last_refresh,
                        "quoteAgeSeconds": 0,
                        "quoteSource": quote.get("quoteSource") or "IBKR_MARKETDATA_SNAPSHOT",
                        "quoteStale": False,
                        "quoteStaleReason": None,
                    }
                )
                quote_refreshes.append(quote_last_refresh)
            else:
                prices_live = False
                fallback_source = None
                stale_reason = None
                if previous:
                    fallback_source = previous.get("quoteSource") or previous.get("quote_source") or "PREVIOUS_LIVE_SNAPSHOT"
                    stale_reason = "IBKR market data snapshot unavailable; reused previous live quote."
                else:
                    fallback_source = "POSITION_ENDPOINT"
                    stale_reason = "IBKR market data snapshot unavailable; using position endpoint price."
                if previous:
                    for key in (
                        "last",
                        "previousClose",
                        "prevClose",
                        "day_change",
                        "day_change_pct",
                        "market_value",
                        "unrealized",
                        "unrealized_pct",
                        "quoteLastRefresh",
                        "quoteSource",
                    ):
                        if previous.get(key) not in (None, ""):
                            merged[key] = previous.get(key)
                if merged.get("quoteLastRefresh"):
                    merged["quoteAgeSeconds"] = _position_quote_refresh_age(str(merged.get("quoteLastRefresh")))
                else:
                    merged["quoteAgeSeconds"] = None
                merged["quoteLastRefresh"] = merged.get("quoteLastRefresh") or (previous.get("quoteLastRefresh") if previous else None)
                merged["quoteSource"] = fallback_source
                merged["quoteStale"] = True
                merged["quoteStaleReason"] = stale_reason
                if merged.get("last") is not None:
                    qty = _num(merged.get("qty") or merged.get("quantity") or merged.get("position"))
                    multiplier = _num(merged.get("multiplier") or _position_multiplier(merged), _position_multiplier(merged))
                    cost_basis = _num(merged.get("cost_basis") or merged.get("costBasis"))
                    market_value = _num(merged.get("market_value"))
                    if qty and market_value == 0 and merged.get("last") is not None:
                        merged["market_value"] = round(_num(merged.get("last")) * qty * multiplier, 2)
                    if cost_basis:
                        merged["unrealized"] = round(_num(merged.get("market_value")) - cost_basis, 2)
                        merged["unrealized_pct"] = round(_num(merged.get("unrealized")) / cost_basis * 100, 2)
                if merged.get("quoteLastRefresh"):
                    quote_refreshes.append(str(merged.get("quoteLastRefresh")))
                fallback_reason = fallback_reason or stale_reason
                _record_live_quote_trace(
                    symbol=str(merged.get("symbol") or merged.get("underlying") or merged.get("contractDesc") or "").upper(),
                    conid=str(merged.get("conid") or ""),
                    source="LAST_UPDATE" if fallback_source == "POSITION_ENDPOINT" else "CACHE",
                    quote_timestamp=str(merged.get("quoteLastRefresh") or ""),
                    server_timestamp=refreshed_at,
                    age_seconds=_position_quote_refresh_age(str(merged.get("quoteLastRefresh"))) if merged.get("quoteLastRefresh") else None,
                )
            merged_positions.append(merged)
        if not quote_refreshes:
            prices_live = False
        prices_last_refresh = max(quote_refreshes) if quote_refreshes else None
        return merged_positions if merged_positions else positions, prices_live, any_quote_refresh, prices_last_refresh, fallback_reason

    def _fetch_live_bundle(self) -> Dict[str, Any]:
        heartbeat = self.get_gateway_heartbeat()
        if not heartbeat.get("gateway_open"):
            raise RuntimeError(heartbeat.get("gateway_error") or "Client Portal Gateway is not reachable.")
        account_id = self._get_account_id()
        if not account_id:
            raise RuntimeError("IBKR: could not resolve account ID")
        previous_bundle = self._get_cached_bundle()
        if not previous_bundle and _snapshot_available():
            snapshot_bundle = _load_snapshot_bundle()
            snapshot_positions = snapshot_bundle.get("positions_payload", {}).get("positions") if isinstance(snapshot_bundle.get("positions_payload"), dict) else []
            snapshot_summary = snapshot_bundle.get("summary_payload", {}).get("summary") if isinstance(snapshot_bundle.get("summary_payload"), dict) else {}
            if isinstance(snapshot_positions, list) or isinstance(snapshot_summary, dict):
                previous_bundle = {
                    "positions": snapshot_positions or [],
                    "summary": snapshot_summary or {},
                }
        raw_positions = self._get(f"/portfolio/{account_id}/positions/0", timeout=4.0)
        if not isinstance(raw_positions, list):
            raw_positions = []
        raw_summary = self._get(f"/portfolio/{account_id}/summary", timeout=4.0)
        raw_trades: List[Dict[str, Any]] = []
        try:
            fetched_trades = self._get("/iserver/account/trades", timeout=3.0)
            if isinstance(fetched_trades, list):
                raw_trades = fetched_trades
        except Exception:
            raw_trades = []
        positions = self._normalize_live_positions(raw_positions, account_id)
        quote_map = self._fetch_market_quotes([str(p.get("conid") or "").strip() for p in positions if str(p.get("conid") or "").strip()])
        previous_positions = []
        if previous_bundle and isinstance(previous_bundle.get("positions"), list):
            previous_positions = previous_bundle.get("positions") or []
        positions, prices_live, has_quote_refresh, prices_last_refresh, quote_fallback_reason = self._overlay_live_quotes(positions, quote_map, previous_positions)
        pnl = self._fetch_partitioned_pnl()
        positions_last_refresh = datetime.now(timezone.utc).isoformat()
        summary = self._normalize_live_summary(raw_summary, positions, pnl=pnl, prices_live=prices_live, prices_last_refresh=prices_last_refresh, positions_last_refresh=positions_last_refresh)
        trades = self._normalize_live_trades(raw_trades, account_id)
        as_of = datetime.now(timezone.utc).isoformat()
        next_refresh = (datetime.now(timezone.utc) + timedelta(seconds=self._CACHE_TTL_SECONDS)).isoformat()
        summary_last_refresh = as_of
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
            "heartbeat": heartbeat,
            "refreshed_at": as_of,
            "lastRefresh": as_of,
            "nextRefresh": next_refresh,
            "pricesLive": bool(prices_live),
            "pricesLastRefresh": prices_last_refresh or as_of,
            "pricesAgeSeconds": _position_quote_refresh_age(prices_last_refresh) if prices_last_refresh else None,
            "isLiveUpdating": bool(prices_live),
            "positions_refreshed_at": positions_last_refresh,
            "positionsLastRefresh": positions_last_refresh,
            "summary_refreshed_at": summary_last_refresh,
            "summaryLastRefresh": summary_last_refresh,
            "trades_refreshed_at": as_of if trades else None,
            "is_live": True,
            "is_stale": False,
            "stale_reason": quote_fallback_reason,
            "quotes_stale": not prices_live,
            "quotes_stale_reason": quote_fallback_reason,
        }
        self._persist_live_snapshot(bundle)
        with self._CACHE_LOCK:
            self._CACHE_BUNDLE = deepcopy(bundle)
            self._CACHE_AT = datetime.now(timezone.utc)
            self._CACHE_ERROR = None
        return bundle

    def _get_cached_bundle(self) -> Optional[Dict[str, Any]]:
        with self._CACHE_LOCK:
            if not self._CACHE_BUNDLE or not self._CACHE_AT:
                return None
            age = (datetime.now(timezone.utc) - self._CACHE_AT).total_seconds()
            if age > self._CACHE_TTL_SECONDS:
                return None
            return deepcopy(self._CACHE_BUNDLE)

    def _load_bundle(self) -> Dict[str, Any]:
        cached = self._get_cached_bundle()
        if cached:
            return cached
        heartbeat = self.get_gateway_heartbeat()
        if _snapshot_available():
            snapshot = SnapshotPortfolioProvider()
            bundle = snapshot._load_bundle()
            as_of = bundle.get("summary", {}).get("as_of") or bundle.get("meta", {}).get("snapshot_timestamp") or datetime.now(timezone.utc).isoformat()
            return {
                "source": "IBKR_LIVE",
                "mode": "ibkr-live",
                "as_of": as_of,
                "account_id": bundle.get("meta", {}).get("account_id"),
                "positions": bundle.get("positions", []),
                "summary": bundle.get("summary", {}),
                "trades": bundle.get("trades", []),
                "snapshot_timestamp": bundle.get("meta", {}).get("snapshot_timestamp") or bundle.get("meta", {}).get("as_of"),
                "snapshot_available": True,
                "heartbeat": heartbeat,
                "refreshed_at": as_of,
                "lastRefresh": as_of,
                "nextRefresh": None,
                "pricesLive": False,
                "pricesLastRefresh": bundle.get("meta", {}).get("pricesLastRefresh") or bundle.get("meta", {}).get("lastRefresh") or bundle.get("meta", {}).get("snapshot_timestamp"),
                "pricesAgeSeconds": bundle.get("meta", {}).get("pricesAgeSeconds"),
                "isLiveUpdating": False,
                "positions_refreshed_at": bundle.get("meta", {}).get("positionsLastRefresh") or bundle.get("meta", {}).get("positions_refreshed_at"),
                "positionsLastRefresh": bundle.get("meta", {}).get("positionsLastRefresh") or bundle.get("meta", {}).get("positions_refreshed_at"),
                "summary_refreshed_at": bundle.get("meta", {}).get("summaryLastRefresh") or bundle.get("meta", {}).get("summary_refreshed_at"),
                "summaryLastRefresh": bundle.get("meta", {}).get("summaryLastRefresh") or bundle.get("meta", {}).get("summary_refreshed_at"),
                "trades_refreshed_at": bundle.get("meta", {}).get("trades_refreshed_at"),
                "is_live": bool(heartbeat.get("gateway_open")),
                "is_stale": True,
                "stale_reason": "Live cache warming; using last saved snapshot.",
                "fallback_active": True,
                "fallback_reason": "Live cache warming; using last saved snapshot.",
                "quotes_stale": True,
                "quotes_stale_reason": "Live cache warming; using last saved snapshot.",
            }
        return {
            "source": "DISCONNECTED",
            "mode": "disconnected",
            "as_of": None,
            "snapshot_available": False,
            "snapshot_timestamp": None,
            "lastRefresh": None,
            "nextRefresh": None,
            "isLiveUpdating": False,
            "pricesLive": False,
            "pricesLastRefresh": None,
            "pricesAgeSeconds": None,
            "positionsLastRefresh": None,
            "summaryLastRefresh": None,
            "is_live": False,
            "is_stale": True,
            "stale_reason": "Gateway offline and no saved snapshot is available.",
            "fallback_active": False,
            "fallback_reason": "Gateway offline and no saved snapshot is available.",
            "positions": [],
            "summary": {
                "source": "DISCONNECTED",
                "mode": "disconnected",
                "as_of": None,
                "total_value": 0,
                "cash": 0,
                "buying_power": 0,
                "unrealized": 0,
                "unrealized_pct": 0,
                "daily_pnl": None,
                "daily_pnl_pct": None,
                "currency": "USD",
                "snapshot_available": False,
                "snapshot_timestamp": None,
                "net_liquidation": 0,
                "is_live": False,
                "is_stale": True,
                "stale_reason": "Gateway offline and no saved snapshot is available.",
                "pricesLive": False,
                "pricesLastRefresh": None,
                "pricesAgeSeconds": None,
                "positionsLastRefresh": None,
                "summaryLastRefresh": None,
            },
            "trades": [],
        }

    def get_runtime_status(self) -> Dict[str, Any]:
        heartbeat = self.get_gateway_heartbeat()
        cached = self._get_cached_bundle()
        snapshot_meta = self.get_snapshot_meta()
        snapshot_available = _snapshot_available()
        snapshot_timestamp = _snapshot_timestamp(snapshot_meta) if snapshot_meta else None
        is_live = bool(heartbeat.get("gateway_open"))
        is_stale = False
        stale_reason = None
        last_refresh = None
        next_refresh = None
        is_live_updating = False
        prices_live = False
        prices_last_refresh = None
        prices_age_seconds = None
        positions_last_refresh = None
        summary_last_refresh = None
        if not is_live:
            if snapshot_available:
                is_stale = _is_snapshot_stale(snapshot_meta) if snapshot_meta else False
                stale_reason = "Gateway offline; using last saved snapshot." if snapshot_available else "Gateway offline."
            else:
                stale_reason = "Gateway offline and no snapshot is available."
        elif cached and cached.get("is_stale"):
            is_stale = True
            stale_reason = cached.get("stale_reason") or "Live cache is stale."
        if cached:
            last_refresh = cached.get("lastRefresh") or cached.get("refreshed_at") or cached.get("as_of")
            next_refresh = cached.get("nextRefresh")
            is_live_updating = bool(cached.get("isLiveUpdating", False)) and not is_stale and is_live
            prices_live = bool(cached.get("pricesLive"))
            prices_last_refresh = cached.get("pricesLastRefresh")
            prices_age_seconds = cached.get("pricesAgeSeconds")
            positions_last_refresh = cached.get("positionsLastRefresh") or cached.get("positions_refreshed_at")
            summary_last_refresh = cached.get("summaryLastRefresh") or cached.get("summary_refreshed_at")
        elif snapshot_meta:
            last_refresh = snapshot_meta.get("snapshot_timestamp") or snapshot_meta.get("as_of")
        return {
            "gateway_open": bool(heartbeat.get("gateway_open")),
            "gateway_status": heartbeat.get("gateway_status"),
            "gateway_error": heartbeat.get("gateway_error"),
            "ibkr_authenticated": bool(heartbeat.get("ibkr_authenticated")),
            "is_live": is_live,
            "is_stale": is_stale,
            "stale_reason": stale_reason,
            "snapshot_available": snapshot_available,
            "snapshot_timestamp": snapshot_timestamp,
            "provider_class": self.__class__.__name__,
            "active_source": "IBKR_LIVE" if is_live else ("LAST_UPDATE" if snapshot_available else "DISCONNECTED"),
            "lastRefresh": last_refresh,
            "nextRefresh": next_refresh,
            "isLiveUpdating": is_live_updating,
            "pricesLive": prices_live,
            "pricesLastRefresh": prices_last_refresh,
            "pricesAgeSeconds": prices_age_seconds,
            "positionsLastRefresh": positions_last_refresh,
            "summaryLastRefresh": summary_last_refresh,
        }

    def _normalize_live_positions(self, raw_positions: List[Dict[str, Any]], account_id: str) -> List[Dict[str, Any]]:
        normalized: List[Dict[str, Any]] = []
        for p in raw_positions or []:
            sym = str(p.get("ticker") or p.get("symbol") or "").strip()
            contract_desc = str(p.get("contractDesc") or p.get("description") or p.get("name") or sym).strip()
            asset_class = _classify_asset_class(p.get("assetClass") or p.get("instrumentType") or p.get("secType"), contract_desc, sym)
            is_opt = asset_class == "OPT"
            qty = _num(p.get("position") or p.get("quantity"))
            avg_price = _num(p.get("avgPrice") or p.get("averageCost"))
            avg_cost = _num(p.get("avgCost") or p.get("averageCost") or avg_price)
            mv = _num(p.get("mktValue") or p.get("marketValue"))
            unr = _num(p.get("unrealizedPnl") or p.get("unrealPnl"))
            real = _num(p.get("realizedPnl") or p.get("realPnl"))
            last = _num(p.get("mktPrice") or p.get("lastPrice"))
            prev_close = _num(p.get("closePrice") or p.get("prevClose") or p.get("previousClose"))
            day_change = _num(p.get("changeDay") or p.get("dayChange") or p.get("change") or (last - prev_close if prev_close and last else 0))
            day_change_pct = _num(p.get("pctChangeDay") or p.get("changePercentDay") or p.get("dayChangePct") or ((day_change / prev_close) * 100 if prev_close else 0))
            base_sym = re.split(r"\s+", sym)[0] if is_opt and sym else sym
            option_meta = _option_metadata(contract_desc, fallback_symbol=base_sym or sym)
            multiplier = _num(p.get("multiplier") or (100 if is_opt else 1), 100 if is_opt else 1)
            cost_basis = round(avg_cost * qty * multiplier if qty else 0, 2)
            position_symbol = option_meta.get("underlying") or base_sym or sym or contract_desc
            normalized.append({
                "accountId": account_id,
                "account_id": account_id,
                "conid": str(p.get("conid") or p.get("conId") or p.get("contractId") or ""),
                "contractDesc": contract_desc,
                "contract_desc": contract_desc,
                "symbol": position_symbol,
                "underlying": option_meta.get("underlying") or base_sym or sym,
                "expiration": option_meta.get("expiration"),
                "strike": option_meta.get("strike"),
                "call_put": option_meta.get("call_put"),
                "sec_type": asset_class,
                "assetClass": asset_class,
                "name": p.get("name") or contract_desc or sym,
                "sector": "Options" if is_opt else ("Cash" if asset_class == "CASH" else "Stock"),
                "qty": qty,
                "quantity": qty,
                "avg_price": round(avg_price, 4),
                "avg_cost": round(avg_cost, 4),
                "last": round(last, 4),
                "day_change_pct": round(day_change_pct, 2),
                "day_change": round(day_change, 2),
                "market_value": round(mv, 2),
                "cost_basis": cost_basis,
                "unrealized": round(unr, 2),
                "realized": round(real, 2),
                "unrealized_pct": round(unr / cost_basis * 100, 2) if cost_basis else 0,
                "previousClose": round(prev_close, 4),
                "prevClose": round(prev_close, 4),
                "risk": 90 if is_opt else 70,
                "brand": "#3B82F6",
                "accent": "#60A5FA",
                "logo": (base_sym or sym)[:2],
                "momentum_score": 55,
                "news_score": 50,
                "macro_sensitivity": 75,
                "ai_view": "Live IBKR position",
                "currency": p.get("currency", "USD"),
                "multiplier": multiplier,
                "quoteLastRefresh": None,
                "quoteAgeSeconds": None,
                "quoteSource": "POSITION_ENDPOINT",
                "quoteStale": True,
                "quoteStaleReason": "Awaiting market data snapshot.",
                "lastRefresh": datetime.now(timezone.utc).isoformat(),
            })
        return [row for row in _aggregate_positions(normalized) if _num(row.get("qty")) != 0 or _num(row.get("market_value")) != 0]

    def _normalize_live_summary(
        self,
        raw_summary: Any,
        positions: List[Dict[str, Any]],
        pnl: Optional[Dict[str, Any]] = None,
        prices_live: bool = False,
        prices_last_refresh: Optional[str] = None,
        positions_last_refresh: Optional[str] = None,
    ) -> Dict[str, Any]:
        raw = raw_summary if isinstance(raw_summary, dict) else {}

        def _amt(key: str) -> float:
            node = raw.get(key, {})
            return _num(node.get("amount") if isinstance(node, dict) else node)

        def _field(*names: str) -> Optional[float]:
            for name in names:
                if name not in raw:
                    continue
                value = raw.get(name)
                if isinstance(value, dict):
                    value = value.get("amount", value.get("value", value.get("amountValue")))
                if value not in (None, ""):
                    return _maybe_num(value)
            return None

        total_market_value = sum(_num(p.get("market_value")) for p in positions)
        cash = _amt("totalcashvalue")
        total_value = round(cash + total_market_value, 2) if positions else _amt("netliquidation")
        if not total_value:
            total_value = _amt("netliquidation") or total_market_value
        currency = "USD"
        for key in ("netliquidation", "availablefunds", "buyingpower"):
            node = raw.get(key, {})
            if isinstance(node, dict) and node.get("currency"):
                currency = node["currency"]
                break
        total_cb = sum(_num(p.get("cost_basis")) for p in positions)
        total_unr = sum(_num(p.get("unrealized")) for p in positions)
        daily_pnl = None
        daily_pnl_pct = None
        if pnl:
            daily_pnl = pnl.get("daily_pnl")
            daily_pnl_pct = pnl.get("daily_pnl_pct")
        if daily_pnl is None:
            field_pnl = _field("dailyPnl", "dailyPnL", "dayPnl", "dayPnL", "pnl", "daily_pnl", "dailyProfitLoss")
            daily_pnl = field_pnl
        if daily_pnl_pct is None and daily_pnl is not None:
            prev_net_liq = _field("previousNetLiquidation", "prevNetLiquidation", "priorNetLiquidation")
            if prev_net_liq:
                daily_pnl_pct = round((daily_pnl / prev_net_liq) * 100, 2)
        return {
            "source": "IBKR_LIVE",
            "mode": "ibkr-live",
            "as_of": datetime.now(timezone.utc).isoformat(),
            "total_value": round(total_value, 2),
            "cash": round(cash, 2),
            "buying_power": round(_amt("buyingpower"), 2),
            "available_funds": round(_amt("availablefunds"), 2),
            "maint_margin_req": round(_amt("maintmarginreq"), 2),
            "init_margin_req": round(_amt("initmarginreq"), 2),
            "excess_liquidity": round(_amt("excessliquidity"), 2),
            "gross_position_value": round(_amt("grosspositionvalue"), 2),
            "net_liquidation": round(total_value, 2),
            "currency": currency,
            "daily_pnl": round(daily_pnl, 2) if daily_pnl is not None else None,
            "daily_pnl_pct": round(daily_pnl_pct, 2) if daily_pnl_pct is not None else None,
            "unrealized": round(total_unr, 2),
            "unrealized_pct": round(total_unr / total_cb * 100, 2) if total_cb else 0,
            "positions_count": len(positions),
            "lastRefresh": datetime.now(timezone.utc).isoformat(),
            "nextRefresh": (datetime.now(timezone.utc) + timedelta(seconds=self._CACHE_TTL_SECONDS)).isoformat(),
            "isLiveUpdating": bool(prices_live),
            "pricesLive": bool(prices_live),
            "pricesLastRefresh": prices_last_refresh,
            "pricesAgeSeconds": _position_quote_refresh_age(prices_last_refresh) if prices_last_refresh else None,
            "positionsLastRefresh": positions_last_refresh,
            "summaryLastRefresh": datetime.now(timezone.utc).isoformat(),
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
        total_value = _num((bundle.get("summary") or {}).get("total_value"))
        cash = _num((bundle.get("summary") or {}).get("cash"))
        unrealized = _num((bundle.get("summary") or {}).get("unrealized"))
        net_liquidation = _num((bundle.get("summary") or {}).get("net_liquidation") or (bundle.get("summary") or {}).get("total_value"))
        positions_payload = {
            "source": bundle.get("source", "IBKR_LIVE"),
            "mode": bundle.get("mode", "ibkr-live"),
            "as_of": bundle.get("as_of"),
            "account_id": bundle.get("account_id"),
            "positions": bundle.get("positions", []),
            "pricesLive": bundle.get("pricesLive"),
            "pricesLastRefresh": bundle.get("pricesLastRefresh"),
            "pricesAgeSeconds": bundle.get("pricesAgeSeconds"),
            "positionsLastRefresh": bundle.get("positionsLastRefresh") or bundle.get("positions_refreshed_at"),
            "summaryLastRefresh": bundle.get("summaryLastRefresh") or bundle.get("summary_refreshed_at"),
        }
        summary_payload = {
            **(bundle.get("summary") or {}),
            "source": bundle.get("source", "IBKR_LIVE"),
            "mode": bundle.get("mode", "ibkr-live"),
            "as_of": bundle.get("as_of"),
            "pricesLive": bundle.get("pricesLive"),
            "pricesLastRefresh": bundle.get("pricesLastRefresh"),
            "pricesAgeSeconds": bundle.get("pricesAgeSeconds"),
            "positionsLastRefresh": bundle.get("positionsLastRefresh") or bundle.get("positions_refreshed_at"),
            "summaryLastRefresh": bundle.get("summaryLastRefresh") or bundle.get("summary_refreshed_at"),
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
            "is_live": bundle.get("is_live", True),
            "is_stale": bundle.get("is_stale", False),
            "stale_reason": bundle.get("stale_reason"),
            "pricesLive": bundle.get("pricesLive"),
            "pricesLastRefresh": bundle.get("pricesLastRefresh"),
            "pricesAgeSeconds": bundle.get("pricesAgeSeconds"),
            "positions_refreshed_at": bundle.get("positions_refreshed_at"),
            "positionsLastRefresh": bundle.get("positionsLastRefresh") or bundle.get("positions_refreshed_at"),
            "summary_refreshed_at": bundle.get("summary_refreshed_at"),
            "summaryLastRefresh": bundle.get("summaryLastRefresh") or bundle.get("summary_refreshed_at"),
            "trades_refreshed_at": bundle.get("trades_refreshed_at"),
            "lastRefresh": bundle.get("lastRefresh") or bundle.get("refreshed_at") or bundle.get("as_of"),
            "nextRefresh": bundle.get("nextRefresh"),
            "isLiveUpdating": bundle.get("isLiveUpdating", True),
        }
        _save_snapshot_bundle({
            "positions_payload": positions_payload,
            "summary_payload": {"summary": summary_payload},
            "trades_payload": {"trades": trades_payload["trades"], "source": trades_payload["source"], "mode": trades_payload["mode"], "as_of": trades_payload["as_of"]},
            "meta_payload": meta_payload,
        })
        _append_snapshot_history(
            {
                "timestamp": bundle.get("snapshot_timestamp") or bundle.get("as_of"),
                "total_value": round(total_value, 2),
                "cash": round(cash, 2),
                "unrealized": round(unrealized, 2),
                "net_liquidation": round(net_liquidation, 2),
                "pricesLive": bundle.get("pricesLive"),
                "pricesLastRefresh": bundle.get("pricesLastRefresh"),
            }
        )

    def get_positions(self) -> List[Dict]:
        return self._load_bundle()["positions"]

    def get_summary(self) -> Dict[str, Any]:
        return self._load_bundle()["summary"]

    def get_trades(self) -> List[Dict]:
        bundle = self._load_bundle()
        return bundle.get("trades") or []

    def get_portfolio(self) -> Dict[str, Any]:
        from services.state import compute_exposures, risk_doctor, today_actions, stress_tests, macro_snapshot
        bundle = self._load_bundle()
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
            "lastRefresh": bundle.get("lastRefresh") or bundle.get("refreshed_at") or bundle.get("as_of"),
            "nextRefresh": bundle.get("nextRefresh"),
            "isLiveUpdating": bundle.get("isLiveUpdating", True),
            "pricesLive": bundle.get("pricesLive"),
            "pricesLastRefresh": bundle.get("pricesLastRefresh"),
            "pricesAgeSeconds": bundle.get("pricesAgeSeconds"),
            "positionsLastRefresh": bundle.get("positionsLastRefresh") or bundle.get("positions_refreshed_at"),
            "summaryLastRefresh": bundle.get("summaryLastRefresh") or bundle.get("summary_refreshed_at"),
            "is_live": bundle.get("is_live", True),
            "is_stale": bundle.get("is_stale", False),
            "stale_reason": bundle.get("stale_reason"),
            "total_value": round(total_value, 2),
            "cost_basis": round(total_cb, 2),
            "daily_pnl": summary.get("daily_pnl"),
            "daily_pnl_pct": summary.get("daily_pnl_pct"),
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
        bundle = self._load_bundle()
        meta = _load_snapshot_bundle()["meta_payload"] or {}
        meta.update(
            {
                "source": bundle.get("source", "IBKR_LIVE"),
                "mode": bundle.get("mode", "ibkr-live"),
                "snapshot_timestamp": bundle.get("snapshot_timestamp") or bundle.get("as_of"),
                "as_of": bundle.get("as_of"),
                "is_live": bundle.get("is_live", True),
                "is_stale": bundle.get("is_stale", False),
                "stale_reason": bundle.get("stale_reason"),
                "provider_class": self.__class__.__name__,
                "lastRefresh": bundle.get("lastRefresh") or bundle.get("refreshed_at") or bundle.get("as_of"),
                "nextRefresh": bundle.get("nextRefresh"),
                "isLiveUpdating": bundle.get("isLiveUpdating", True),
                "pricesLive": bundle.get("pricesLive"),
                "pricesLastRefresh": bundle.get("pricesLastRefresh"),
                "pricesAgeSeconds": bundle.get("pricesAgeSeconds"),
                "positionsLastRefresh": bundle.get("positionsLastRefresh") or bundle.get("positions_refreshed_at"),
                "summaryLastRefresh": bundle.get("summaryLastRefresh") or bundle.get("summary_refreshed_at"),
            }
        )
        return meta

    def get_live_quote_trace(self, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        return get_live_quote_trace(limit=limit)


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
    IbkrLivePortfolioProvider.invalidate_cache()
    return mode


def get_snapshot_history(limit: Optional[int] = None) -> List[Dict[str, Any]]:
    return _load_snapshot_history(limit=limit)


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
        gateway_reachable = isinstance(auth, dict) and not gateway_error
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
    snapshot_stale = _is_snapshot_stale(snapshot_meta) if snapshot_available else False

    if mode == "mock":
        mock = MockPortfolioProvider()
        return ProviderResolution(
            provider=mock,
            configured_mode=mode,
            active_source=mock.source_name,
            fallback_active=False,
            fallback_reason=None,
            provider_class=mock.__class__.__name__,
            snapshot_available=False,
            snapshot_timestamp=None,
            is_live=False,
            is_stale=False,
            stale_reason=None,
        )

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
                is_live=False,
                is_stale=snapshot_stale,
                stale_reason="Saved snapshot is stale." if snapshot_stale else None,
            )
        disconnected = DisconnectedPortfolioProvider()
        return ProviderResolution(
            provider=disconnected,
            configured_mode=mode,
            active_source=disconnected.source_name,
            fallback_active=False,
            fallback_reason="No saved IBKR snapshot available.",
            provider_class=disconnected.__class__.__name__,
            snapshot_available=False,
            snapshot_timestamp=None,
            is_live=False,
            is_stale=True,
            stale_reason="No saved IBKR snapshot available.",
        )

    if mode == "ibkr-live":
        live = IbkrLivePortfolioProvider()
        heartbeat = live.get_gateway_heartbeat()
        diagnostics = {
            "gateway_status": heartbeat.get("gateway_status", "gateway_down"),
            "gateway_error": heartbeat.get("gateway_error"),
            "ibkr_gateway_reachable": bool(heartbeat.get("gateway_open")),
            "ibkr_authenticated": bool(heartbeat.get("ibkr_authenticated")),
            "accounts_available": None,
            "positions_available": None,
            "trades_available": None,
        }
        if heartbeat.get("gateway_open"):
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
                is_live=True,
                is_stale=False,
                stale_reason=None,
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
                is_live=False,
                is_stale=snapshot_stale,
                stale_reason="Client Portal Gateway unavailable; using saved snapshot." if snapshot_stale else "Client Portal Gateway unavailable; using last-update snapshot.",
                **diagnostics,
            )
        disconnected = DisconnectedPortfolioProvider()
        return ProviderResolution(
            provider=disconnected,
            configured_mode=mode,
            active_source=disconnected.source_name,
            fallback_active=False,
            fallback_reason="Client Portal Gateway unavailable and no saved snapshot exists.",
            provider_class=disconnected.__class__.__name__,
            snapshot_available=False,
            snapshot_timestamp=None,
            is_live=False,
            is_stale=True,
            stale_reason="Client Portal Gateway unavailable and no saved snapshot exists.",
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
        is_live=False,
        is_stale=False,
        stale_reason=None,
    )


def get_active_provider():
    """Return the resolved active provider."""
    return resolve_portfolio_provider().provider


def get_provider_status() -> Dict[str, Any]:
    """Return provider status info for API consumers."""
    resolution = resolve_portfolio_provider()
    provider_meta: Dict[str, Any] = {}
    try:
        if hasattr(resolution.provider, "get_summary"):
            raw_meta = resolution.provider.get_summary() or {}
        elif hasattr(resolution.provider, "get_runtime_status"):
            raw_meta = resolution.provider.get_runtime_status() or {}
        elif hasattr(resolution.provider, "get_snapshot_meta"):
            raw_meta = resolution.provider.get_snapshot_meta() or {}
        if isinstance(raw_meta, dict):
            provider_meta = raw_meta
    except Exception:
        provider_meta = {}
    mode = resolution.configured_mode
    snapshot_available = bool(resolution.snapshot_available)
    fallback_active = bool(resolution.fallback_active)
    if mode == "ibkr-live":
        if resolution.is_live:
            status = "LIVE"
            if provider_meta.get("pricesLive", True):
                message = "Live IBKR Client Portal Gateway is available."
            else:
                message = "IBKR Gateway is connected, but live market quotes are stale or unavailable."
        elif snapshot_available:
            status = "LAST_UPDATE"
            message = resolution.fallback_reason or "Using saved IBKR snapshot."
        else:
            status = "DISCONNECTED"
            message = resolution.fallback_reason or "Client Portal Gateway is unavailable and no saved snapshot exists."
    elif mode == "last-update":
        if snapshot_available:
            status = "LAST_UPDATE"
            message = "Using saved IBKR snapshot."
        else:
            status = "DISCONNECTED"
            message = resolution.fallback_reason or "No saved IBKR snapshot exists."
    else:
        status = "MOCK"
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
        "is_live": resolution.is_live,
        "is_stale": resolution.is_stale,
        "stale_reason": resolution.stale_reason,
        "lastRefresh": provider_meta.get("lastRefresh") or provider_meta.get("refreshed_at") or resolution.snapshot_timestamp,
        "nextRefresh": provider_meta.get("nextRefresh"),
        "isLiveUpdating": bool(provider_meta.get("isLiveUpdating")) if provider_meta else bool(resolution.is_live),
        "pricesLive": provider_meta.get("pricesLive"),
        "pricesLastRefresh": provider_meta.get("pricesLastRefresh"),
        "pricesAgeSeconds": provider_meta.get("pricesAgeSeconds"),
        "positionsLastRefresh": provider_meta.get("positionsLastRefresh") or provider_meta.get("positions_refreshed_at"),
        "summaryLastRefresh": provider_meta.get("summaryLastRefresh") or provider_meta.get("summary_refreshed_at"),
        "mock_available": True,
    }
