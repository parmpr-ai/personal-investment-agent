"""
EPIC-IBKR-LIVE-001 / HERMES — Portfolio Data Provider Abstraction

Providers:
  mock       — built-in demo data from state.py
  demo       — IBKR sample JSON files (data/ibkr-live/*.sample.json)
  ibkr-live  — Client Portal Gateway REST API (https://localhost:5000/v1/api)

Fallback chain: ibkr-live → demo → mock
"""
import json
import logging
import math
import os
import re
import socket
import ssl
import time
import threading
from collections import deque
from datetime import timedelta
import urllib.request
import urllib.error
import urllib.parse
from dataclasses import dataclass
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from services.price_providers import get_price_provider_status as _quote_provider_status
from services.price_providers import get_yahoo_live_quotes

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "ibkr-live"
_SNAPSHOT_DIR = Path(__file__).resolve().parents[1] / "data" / "snapshots" / "ibkr"
_SNAPSHOT_HISTORY_DIR = _SNAPSHOT_DIR / "history"
_SNAPSHOT_POSITIONS_FILE = _SNAPSHOT_DIR / "positions_latest.json"
_SNAPSHOT_SUMMARY_FILE = _SNAPSHOT_DIR / "summary_latest.json"
_SNAPSHOT_TRADES_FILE = _SNAPSHOT_DIR / "trades_latest.json"
_SNAPSHOT_META_FILE = _SNAPSHOT_DIR / "meta.json"
_SNAPSHOT_STATE_FILE = _SNAPSHOT_DIR / "state.json"
_SNAPSHOT_HISTORY_FILE = _SNAPSHOT_HISTORY_DIR / "history.jsonl"
_SNAPSHOT_SCHEMA_VERSION = 1
_SNAPSHOT_REFRESH_INTERVAL_SECONDS = 30 * 60
_DEFAULT_GATEWAY_URL = "https://localhost:5000"
_PROVIDER_MODES = ("mock", "last-update", "ibkr-live")
_ACTIVE_SOURCE_MAP = {"mock": "MOCK", "last-update": "LAST_UPDATE", "ibkr-live": "IBKR_LIVE"}
_MODE_LABELS = {"mock": "Mock Data", "last-update": "Last Update Real Data", "ibkr-live": "Live Data"}
_SOURCE_LABELS = {
    "MOCK": "Mock",
    "MOCK_FALLBACK": "Mock",
    "LAST_UPDATE": "Last Update",
    "IBKR_LIVE": "IBKR Live",
    "IBKR_LAST_UPDATE": "IBKR Last Update",
    "HYBRID_LAST_POSITIONS_LIVE_QUOTES": "Hybrid Live Quotes",
    "MANUAL_HOLDINGS_LIVE_QUOTES": "Manual Live Quotes",
    "MANUAL_HOLDINGS": "Manual Holdings",
    "NO_DATA": "No Data",
    "DISCONNECTED": "Disconnected",
}
_LIVE_MODE_ALIASES = {"live", "ibkr-live"}
_LAST_UPDATE_MODE_ALIASES = {"demo", "demo-samples", "sample", "snapshot", "last-update"}
_SNAPSHOT_STALE_AFTER_SECONDS = 15 * 60
_LIVE_REFRESH_SECONDS = 12.0
_SNAPSHOT_LOCK = threading.RLock()
_LIVE_QUOTE_TRACE_LOCK = threading.RLock()
_LIVE_QUOTE_TRACE: deque[Dict[str, Any]] = deque(maxlen=500)
_SOURCE_TRACE_LOCK = threading.RLock()
_SOURCE_TRACE_EVENTS: deque[Dict[str, Any]] = deque(maxlen=100)
_SOURCE_TRACE_STATE: Dict[str, Any] = {
    "currentSource": None,
    "previousSource": None,
    "lastSwitchReason": None,
    "lastSwitchTimestamp": None,
}
_SURFACE_SOURCE_STATE: Dict[str, str] = {}
_IBKR_LOGGER = logging.getLogger("uvicorn.error")


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def get_ibkr_gateway_config() -> Dict[str, Any]:
    """Resolve the user-facing gateway URL and the backend transport URL."""
    settings_url = _DEFAULT_GATEWAY_URL
    try:
        from services.settings_store import get_settings

        settings_url = str((get_settings().get("ibkr") or {}).get("gateway_url") or settings_url)
    except Exception:
        pass

    configured_url = str(os.getenv("IBKR_BASE_URL") or settings_url).strip().rstrip("/")
    if "://" not in configured_url:
        configured_url = f"https://{configured_url}"
    parsed = urllib.parse.urlsplit(configured_url)
    scheme = parsed.scheme or "https"
    configured_host = parsed.hostname or "localhost"
    configured_port = parsed.port or (443 if scheme == "https" else 80)
    port = int(os.getenv("IBKR_PORT") or configured_port)
    prefer_ipv4 = _env_bool("IBKR_PREFER_IPV4", True)
    effective_host = "127.0.0.1" if prefer_ipv4 and configured_host.lower() == "localhost" else configured_host
    path = parsed.path.rstrip("/")
    api_path = path if path.endswith("/v1/api") else f"{path}/v1/api"
    api_path = f"/{api_path.lstrip('/')}"
    configured_api_url = f"{scheme}://{configured_host}:{port}{api_path}"
    effective_api_url = f"{scheme}://{effective_host}:{port}{api_path}"
    ssl_verify = _env_bool("IBKR_SSL_VERIFY", _env_bool("SSL_VERIFY", False))
    try:
        timeout_seconds = max(0.2, float(os.getenv("IBKR_TIMEOUT") or 2.0))
    except ValueError:
        timeout_seconds = 2.0
    return {
        "configured_url": configured_api_url,
        "effective_url": effective_api_url,
        "configured_host": configured_host,
        "effective_host": effective_host,
        "port": port,
        "ssl_verify": ssl_verify,
        "timeout_seconds": timeout_seconds,
        "prefer_ipv4": prefer_ipv4,
        "proxy_bypassed": True,
    }


def log_ibkr_startup_config() -> Dict[str, Any]:
    config = get_ibkr_gateway_config()
    _IBKR_LOGGER.info(
        "IBKR startup config IBKR_BASE_URL=%s IBKR_EFFECTIVE_BASE_URL=%s IBKR_PORT=%s SSL_VERIFY=%s TIMEOUT=%ss",
        config["configured_url"],
        config["effective_url"],
        config["port"],
        config["ssl_verify"],
        config["timeout_seconds"],
    )
    return config


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


# IBKR Client Portal field 31 (last price) may carry a single-letter prefix:
#   C = Close  H = Halted  O = Open  B = Bid  A = Ask  E = Extended  N = No data
# Strip it so _maybe_num can parse the numeric part.
_IBKR_PRICE_PREFIX_CHARS = frozenset("CHOBAENRchobaenr")

def _ibkr_price(v: Any) -> Optional[float]:
    """Parse an IBKR price field, stripping any leading status prefix."""
    if v is None or v == "":
        return None
    s = str(v).strip()
    if s and s[0] in _IBKR_PRICE_PREFIX_CHARS:
        s = s[1:]
    try:
        return float(s) if s else None
    except (ValueError, TypeError):
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


def _load_snapshot_state() -> Dict[str, Any]:
    state = _read_json_file(_SNAPSHOT_STATE_FILE, {})
    return state if isinstance(state, dict) else {}


def _write_snapshot_state(state: Dict[str, Any]) -> None:
    _ensure_snapshot_dir()
    _write_json_file(_SNAPSHOT_STATE_FILE, state if isinstance(state, dict) else {})


def _snapshot_state_from_meta(meta_payload: Dict[str, Any], *, state_payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    state_payload = state_payload or {}
    snapshot_timestamp = _snapshot_timestamp(meta_payload) or state_payload.get("snapshotTimestamp")
    snapshot_age_seconds = _snapshot_age_seconds(meta_payload)
    return {
        "schemaVersion": int(meta_payload.get("schemaVersion") or state_payload.get("schemaVersion") or _SNAPSHOT_SCHEMA_VERSION),
        "snapshotAvailable": bool(meta_payload or state_payload.get("snapshotAvailable")),
        "snapshotTimestamp": snapshot_timestamp,
        "snapshotAgeSeconds": snapshot_age_seconds,
        "positionsCount": int(meta_payload.get("positions_count") or state_payload.get("positionsCount") or 0),
        "source": meta_payload.get("source") or state_payload.get("source") or "IBKR_LIVE",
        "lastRefreshAttempt": state_payload.get("lastRefreshAttempt") or meta_payload.get("lastRefreshAttempt") or meta_payload.get("lastRefresh"),
        "lastRefreshStatus": state_payload.get("lastRefreshStatus") or meta_payload.get("lastRefreshStatus") or ("ok" if snapshot_timestamp else "failed"),
        "lastRefreshError": state_payload.get("lastRefreshError") or meta_payload.get("lastRefreshError"),
        "snapshotValid": bool(state_payload.get("snapshotValid", meta_payload.get("snapshot_valid", True))),
        "snapshotPersisted": bool(state_payload.get("snapshotPersisted", meta_payload.get("snapshotPersisted", True))),
        "refreshIntervalSeconds": int(state_payload.get("refreshIntervalSeconds") or _SNAPSHOT_REFRESH_INTERVAL_SECONDS),
    }


def _snapshot_bundle_is_valid(bundle: Dict[str, Any]) -> tuple[bool, str]:
    if not isinstance(bundle, dict):
        return False, "Snapshot bundle must be a dictionary."

    meta_payload = bundle.get("meta_payload") if isinstance(bundle.get("meta_payload"), dict) else {}
    positions_payload = bundle.get("positions_payload") if isinstance(bundle.get("positions_payload"), dict) else {}
    summary_payload = bundle.get("summary_payload") if isinstance(bundle.get("summary_payload"), dict) else {}
    source = bundle.get("source") or meta_payload.get("source") or positions_payload.get("source")
    if str(source or "").upper() != "IBKR_LIVE":
        return False, "Snapshot bundle is not sourced from IBKR_LIVE."
    account_id = str(bundle.get("account_id") or meta_payload.get("account_id") or positions_payload.get("account_id") or "").strip()
    if not account_id:
        return False, "Snapshot bundle is missing an account id."
    positions = bundle.get("positions")
    if positions is None:
        positions = positions_payload.get("positions")
    if not isinstance(positions, list) or not positions:
        return False, "Snapshot bundle returned no positions."
    summary = bundle.get("summary")
    if summary is None:
        summary = summary_payload.get("summary") if isinstance(summary_payload.get("summary"), dict) else summary_payload
    if not isinstance(summary, dict):
        return False, "Snapshot bundle is missing summary data."
    if not any(isinstance(position, dict) and (str(position.get("conid") or "").strip() or str(position.get("symbol") or position.get("underlying") or "").strip()) for position in positions):
        return False, "Snapshot bundle positions are not identifiable."

    portfolio_value = _maybe_num(summary.get("total_value") or summary.get("net_liquidation") or summary.get("netLiquidation"))
    if portfolio_value is None or not math.isfinite(portfolio_value) or portfolio_value <= 0:
        return False, "Snapshot portfolio value must be a finite positive number."

    for position in positions:
        if not isinstance(position, dict):
            return False, "Snapshot contains an invalid position row."
        for field in ("quantity", "qty", "last", "market_value", "cost_basis", "unrealized"):
            if field not in position or position.get(field) in (None, ""):
                continue
            value = _maybe_num(position.get(field))
            if value is None or not math.isfinite(value):
                return False, f"Snapshot position field '{field}' is not a finite number."
    return True, ""


def _stored_snapshot_validation() -> tuple[bool, str]:
    if not (_SNAPSHOT_META_FILE.exists() and _SNAPSHOT_POSITIONS_FILE.exists() and _SNAPSHOT_SUMMARY_FILE.exists()):
        return False, "Snapshot files are incomplete."
    return _snapshot_bundle_is_valid(_load_snapshot_bundle())


def _source_switch_reason(resolution: "ProviderResolution") -> str:
    if resolution.active_source == "IBKR_LIVE":
        return "IBKR Gateway is reachable and authenticated."
    if resolution.active_source == "LAST_UPDATE":
        return resolution.fallback_reason or "IBKR unavailable; selected last known good snapshot."
    if resolution.active_source == "MOCK":
        return resolution.fallback_reason or "No valid live or snapshot portfolio; selected demo data."
    return resolution.fallback_reason or resolution.stale_reason or "Portfolio source resolved."


def _record_provider_resolution(resolution: "ProviderResolution", *, switch_duration_ms: Optional[float] = None) -> "ProviderResolution":
    source = str(resolution.active_source or "DISCONNECTED")
    reason = _source_switch_reason(resolution)
    now = datetime.now(timezone.utc).isoformat()
    with _SOURCE_TRACE_LOCK:
        previous = _SOURCE_TRACE_STATE.get("currentSource")
        if previous != source:
            _SOURCE_TRACE_STATE.update(
                {
                    "previousSource": previous,
                    "currentSource": source,
                    "lastSwitchReason": reason,
                    "lastSwitchTimestamp": now,
                    "lastSwitchDurationMs": round(switch_duration_ms, 1) if switch_duration_ms is not None else None,
                }
            )
            event = {
                "timestamp": now,
                "event": "SOURCE_SWITCH",
                "previousSource": previous,
                "currentSource": source,
                "reason": reason,
                "switchDurationMs": round(switch_duration_ms, 1) if switch_duration_ms is not None else None,
            }
            _SOURCE_TRACE_EVENTS.appendleft(event)
            _IBKR_LOGGER.info(
                "[SOURCE_SWITCH] previous=%s current=%s reason=%s duration_ms=%s",
                previous or "NONE",
                source,
                reason,
                round(switch_duration_ms, 1) if switch_duration_ms is not None else "n/a",
            )
            _IBKR_LOGGER.info(
                "[LIFECYCLE] source=%s gateway=%s authenticated=%s snapshot=%s provider=%s",
                source,
                resolution.gateway_status,
                resolution.ibkr_authenticated,
                resolution.snapshot_available,
                resolution.provider_class,
            )
    return resolution


def record_surface_source(surface: str, portfolio: Dict[str, Any]) -> None:
    normalized_surface = "mobile" if str(surface or "").lower() == "mobile" else "dashboard"
    marker = "MOBILE_SOURCE" if normalized_surface == "mobile" else "DASHBOARD_SOURCE"
    source = str(portfolio.get("source") or portfolio.get("active_source") or "UNKNOWN")
    position_count = len(portfolio.get("positions") or []) if isinstance(portfolio.get("positions"), list) else 0
    signature = f"{source}:{portfolio.get('total_value')}:{position_count}:{portfolio.get('snapshot_timestamp')}"
    with _SOURCE_TRACE_LOCK:
        if _SURFACE_SOURCE_STATE.get(normalized_surface) == signature:
            return
        _SURFACE_SOURCE_STATE[normalized_surface] = signature
    _IBKR_LOGGER.info(
        "[%s] source=%s portfolio_value=%s positions=%s timestamp=%s",
        marker,
        source,
        portfolio.get("total_value"),
        position_count,
        portfolio.get("as_of") or portfolio.get("snapshot_timestamp"),
    )


def get_source_trace() -> Dict[str, Any]:
    bundle = _load_snapshot_bundle()
    positions_payload = bundle.get("positions_payload") if isinstance(bundle.get("positions_payload"), dict) else {}
    summary_payload = bundle.get("summary_payload") if isinstance(bundle.get("summary_payload"), dict) else {}
    summary = summary_payload.get("summary") if isinstance(summary_payload.get("summary"), dict) else summary_payload
    positions = positions_payload.get("positions") if isinstance(positions_payload.get("positions"), list) else []
    meta = bundle.get("meta_payload") if isinstance(bundle.get("meta_payload"), dict) else {}
    valid, invalid_reason = _stored_snapshot_validation()
    with _SOURCE_TRACE_LOCK:
        state = deepcopy(_SOURCE_TRACE_STATE)
        events = list(_SOURCE_TRACE_EVENTS)
    snapshot_positions = []
    if valid and positions:
        snapshot_positions = [
            {
                "symbol": str(p.get("symbol") or p.get("underlying") or p.get("contractDesc") or "").strip(),
                "qty": _maybe_num(p.get("qty") or p.get("quantity") or p.get("position")),
                "market_value": _maybe_num(p.get("market_value") or p.get("marketValue")),
                "assetClass": str(p.get("assetClass") or p.get("sec_type") or "STK"),
            }
            for p in positions[:50]
        ]
    state.update(
        {
            "snapshotTimestamp": _snapshot_timestamp(meta) if valid else None,
            "snapshotPortfolioValue": _maybe_num(summary.get("total_value") or summary.get("net_liquidation")) if valid else None,
            "snapshotPositionCount": len(positions) if valid else 0,
            "snapshotPositions": snapshot_positions,
            "snapshotValid": valid,
            "snapshotInvalidReason": None if valid else invalid_reason,
            "lastSwitchDurationMs": state.get("lastSwitchDurationMs"),
            "events": events,
        }
    )
    return state


def _snapshot_refresh_is_due(meta_payload: Dict[str, Any], *, force: bool = False) -> bool:
    if force:
        return True
    if not meta_payload:
        return True
    age = _snapshot_age_seconds(meta_payload)
    if age is None:
        return True
    return age >= _SNAPSHOT_REFRESH_INTERVAL_SECONDS


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


def _cached_ai_technical_snapshot(symbol: str) -> Dict[str, Any]:
    try:
        from services.ai_intelligence_context import get_cached_technical_snapshot

        return get_cached_technical_snapshot(symbol) or {}
    except Exception:
        return {}


def _validated_value(official: Optional[float], computed: Optional[float], *, tolerance_pct: float = 1.0) -> Optional[float]:
    if official is None:
        return computed
    if computed is None:
        return official
    threshold = max(0.01, abs(computed) * tolerance_pct / 100.0)
    return official if abs(official - computed) <= threshold else computed


def _derive_day_metrics(
    *,
    last: Optional[float],
    previous_close: Optional[float],
    quantity: Optional[float],
    multiplier: Optional[float],
    official_day_change: Optional[float] = None,
    official_day_change_pct: Optional[float] = None,
) -> Dict[str, Optional[float]]:
    computed_change = None
    computed_pct = None
    if last is not None and previous_close not in (None, 0):
        computed_change = round(last - previous_close, 4)
        computed_pct = round(((last - previous_close) / previous_close) * 100, 4)
    day_change = _validated_value(official_day_change, computed_change)
    day_change_pct = _validated_value(official_day_change_pct, computed_pct)
    day_pnl = None
    day_pnl_pct = None
    prev_market_value = None
    if day_change is not None and quantity not in (None, 0):
        qty_multiplier = multiplier if multiplier not in (None, 0) else 1.0
        day_pnl = round(day_change * quantity * qty_multiplier, 2)
    if previous_close not in (None, 0) and quantity not in (None, 0):
        qty_multiplier = multiplier if multiplier not in (None, 0) else 1.0
        prev_market_value = round(previous_close * quantity * qty_multiplier, 2)
    if day_pnl is not None and prev_market_value not in (None, 0):
        day_pnl_pct = round((day_pnl / prev_market_value) * 100, 2)
    elif day_change_pct is not None:
        day_pnl_pct = round(day_change_pct, 2)
    return {
        "day_change": round(day_change, 2) if day_change is not None else None,
        "day_change_pct": round(day_change_pct, 2) if day_change_pct is not None else None,
        "day_pnl": day_pnl,
        "day_pnl_pct": day_pnl_pct,
        "previous_market_value": prev_market_value,
    }


def _build_position_calculation_provenance(
    row: Dict[str, Any],
    day_metrics: Dict[str, Optional[float]],
    *,
    live_quote_used: bool,
) -> Dict[str, Any]:
    quantity = _maybe_num(row.get("qty") or row.get("quantity") or row.get("position"))
    multiplier = _maybe_num(row.get("multiplier") or _position_multiplier(row))
    last = _maybe_num(row.get("last"))
    previous_close = _maybe_num(row.get("previousClose") or row.get("prevClose") or row.get("closePrice") or row.get("close"))
    market_value = _maybe_num(row.get("market_value"))
    cost_basis = _maybe_num(row.get("cost_basis") or row.get("costBasis"))
    previous_market_value = day_metrics.get("previous_market_value")

    final_day_change = _maybe_num(row.get("day_change"))
    final_day_change_pct = _maybe_num(row.get("day_change_pct"))
    final_day_pnl = _maybe_num(row.get("day_pnl"))
    final_day_pnl_pct = _maybe_num(row.get("day_pnl_pct"))
    final_unrealized = _maybe_num(row.get("unrealized"))
    final_unrealized_pct = _maybe_num(row.get("unrealized_pct"))
    unrealized = final_unrealized
    unrealized_pct = final_unrealized_pct
    if market_value is not None and cost_basis not in (None, 0):
        unrealized = round(market_value - cost_basis, 2)
        unrealized_pct = round((unrealized / cost_basis) * 100, 2)

    def _metric_payload(name: str, formula: str, value: Optional[float], inputs: Dict[str, Any], source: str) -> Dict[str, Any]:
        payload = {
            "name": name,
            "formula": formula,
            "value": value,
            "inputs": inputs,
            "source": source,
            "isDerived": value is not None,
        }
        return payload

    has_live_inputs = last is not None and previous_close not in (None, 0) and quantity not in (None, 0)
    return {
        "liveQuoteUsed": bool(live_quote_used),
        "hasLiveInputs": bool(has_live_inputs),
        "inputs": {
            "last": last,
            "previousClose": previous_close,
            "quantity": quantity,
            "multiplier": multiplier,
            "marketValue": market_value,
            "costBasis": cost_basis,
            "previousMarketValue": previous_market_value,
        },
        "day_change": _metric_payload(
            "day_change",
            "last - previousClose",
            final_day_change if final_day_change is not None else day_metrics.get("day_change"),
            {"last": last, "previousClose": previous_close},
            "derived" if final_day_change is not None else "missing",
        ),
        "day_change_pct": _metric_payload(
            "day_change_pct",
            "((last - previousClose) / previousClose) * 100",
            final_day_change_pct if final_day_change_pct is not None else day_metrics.get("day_change_pct"),
            {"last": last, "previousClose": previous_close},
            "derived" if final_day_change_pct is not None else "missing",
        ),
        "day_pnl": _metric_payload(
            "day_pnl",
            "(last - previousClose) * quantity * multiplier",
            final_day_pnl if final_day_pnl is not None else day_metrics.get("day_pnl"),
            {"last": last, "previousClose": previous_close, "quantity": quantity, "multiplier": multiplier},
            "derived" if final_day_pnl is not None else "missing",
        ),
        "day_pnl_pct": _metric_payload(
            "day_pnl_pct",
            "day_pnl / previous_market_value * 100",
            final_day_pnl_pct if final_day_pnl_pct is not None else day_metrics.get("day_pnl_pct"),
            {"day_pnl": final_day_pnl if final_day_pnl is not None else day_metrics.get("day_pnl"), "previousMarketValue": previous_market_value},
            "derived" if final_day_pnl_pct is not None else "missing",
        ),
        "unrealized": _metric_payload(
            "unrealized",
            "market_value - cost_basis",
            unrealized,
            {"marketValue": market_value, "costBasis": cost_basis},
            "derived" if market_value is not None and cost_basis not in (None, 0) else "missing",
        ),
        "unrealized_pct": _metric_payload(
            "unrealized_pct",
            "unrealized / cost_basis * 100",
            unrealized_pct,
            {"unrealized": unrealized, "costBasis": cost_basis},
            "derived" if unrealized_pct is not None else "missing",
        ),
    }


def _finalize_position_metrics(row: Dict[str, Any]) -> Dict[str, Any]:
    quantity = _maybe_num(row.get("qty") or row.get("quantity") or row.get("position"))
    multiplier = _maybe_num(row.get("multiplier") or _position_multiplier(row))
    last = _maybe_num(row.get("last"))
    previous_close = _maybe_num(row.get("previousClose") or row.get("prevClose") or row.get("closePrice") or row.get("close"))
    quote_source = str(row.get("quoteSource") or row.get("source") or "").upper()
    live_quote_used = bool(row.get("quoteLastRefresh")) or quote_source in {
        "IBKR_MARKETDATA_SNAPSHOT",
        "PREVIOUS_LIVE_SNAPSHOT",
        "CACHE",
        "LIVE",
        "IBKR_LIVE",
    }
    day_metrics = _derive_day_metrics(
        last=last,
        previous_close=previous_close,
        quantity=quantity,
        multiplier=multiplier,
        official_day_change=_maybe_num(row.get("day_change")),
        official_day_change_pct=_maybe_num(row.get("day_change_pct")),
    )
    if day_metrics["day_change"] is not None:
        row["day_change"] = day_metrics["day_change"]
    if day_metrics["day_change_pct"] is not None:
        row["day_change_pct"] = day_metrics["day_change_pct"]
    if day_metrics["day_pnl"] is not None:
        row["day_pnl"] = day_metrics["day_pnl"]
    elif live_quote_used and _maybe_num(row.get("day_pnl")) == 0:
        row["day_pnl"] = None
    if day_metrics["day_pnl_pct"] is not None:
        row["day_pnl_pct"] = day_metrics["day_pnl_pct"]
    elif live_quote_used and _maybe_num(row.get("day_pnl_pct")) == 0:
        row["day_pnl_pct"] = None
    if day_metrics.get("previous_market_value") is not None:
        row["previous_market_value"] = day_metrics["previous_market_value"]

    market_value = _maybe_num(row.get("market_value"))
    cost_basis = _maybe_num(row.get("cost_basis") or row.get("costBasis"))
    if market_value is not None and cost_basis not in (None, 0):
        row["unrealized"] = round(market_value - cost_basis, 2)
        row["unrealized_pct"] = round((row["unrealized"] / cost_basis) * 100, 2)
    elif live_quote_used and _maybe_num(row.get("unrealized_pct")) == 0 and cost_basis in (None, 0):
        row["unrealized_pct"] = None

    row["previous_market_value"] = day_metrics.get("previous_market_value")
    row["calculationProvenance"] = _build_position_calculation_provenance(row, day_metrics, live_quote_used=live_quote_used)
    return row


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
        day_pnl = _maybe_num(raw.get("day_pnl"))
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
                "day_pnl": round(day_pnl, 2) if day_pnl is not None else None,
                "day_pnl_pct": _maybe_num(raw.get("day_pnl_pct")),
                "previous_market_value": _maybe_num(raw.get("previous_market_value")),
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
        current_day_pnl = _maybe_num(current.get("day_pnl"))
        if day_pnl is not None and current_day_pnl is not None:
            current["day_pnl"] = round(current_day_pnl + day_pnl, 2)
        elif day_pnl is not None:
            current["day_pnl"] = round(day_pnl, 2)
        elif current_day_pnl is not None:
            current["day_pnl"] = round(current_day_pnl, 2)
        current_day_pnl_pct = _maybe_num(current.get("day_pnl_pct"))
        incoming_day_pnl_pct = _maybe_num(raw.get("day_pnl_pct"))
        if incoming_day_pnl_pct is not None and current_day_pnl_pct is not None:
            current["day_pnl_pct"] = round(current_day_pnl_pct + incoming_day_pnl_pct, 2)
        elif incoming_day_pnl_pct is not None:
            current["day_pnl_pct"] = round(incoming_day_pnl_pct, 2)
        elif current_day_pnl_pct is not None:
            current["day_pnl_pct"] = round(current_day_pnl_pct, 2)
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
        row = _finalize_position_metrics(row)
        row = _apply_position_metric_provenance(row)
        aggregated.append(row)
    return aggregated


def _apply_position_metric_provenance(row: Dict[str, Any]) -> Dict[str, Any]:
    symbol = str(row.get("symbol") or row.get("underlying") or "").strip().upper()
    ai_snapshot = _cached_ai_technical_snapshot(symbol) if symbol else {}
    technical = ai_snapshot.get("technicalIndicators") if isinstance(ai_snapshot, dict) else {}
    ai_updated_at = ai_snapshot.get("updatedAt") or ai_snapshot.get("updated_at") or ai_snapshot.get("lastUpdated")
    momentum_score = _maybe_num(technical.get("momentumScore")) if isinstance(technical, dict) else None
    risk_score = _maybe_num(technical.get("riskScore")) if isinstance(technical, dict) else None
    if risk_score is not None:
        row["risk"] = risk_score
        row["risk_source"] = "AI_INTELLIGENCE_CACHE"
        row["risk_is_placeholder"] = False
        row["risk_last_updated"] = ai_updated_at
    else:
        row["risk"] = None
        row["risk_source"] = "missing"
        row["risk_is_placeholder"] = True
        row["risk_last_updated"] = None
    if momentum_score is not None:
        row["momentum_score"] = momentum_score
        row["momentum_source"] = "AI_INTELLIGENCE_CACHE"
        row["momentum_is_placeholder"] = False
        row["momentum_last_updated"] = ai_updated_at
    else:
        row["momentum_score"] = None
        row["momentum_source"] = "missing"
        row["momentum_is_placeholder"] = True
        row["momentum_last_updated"] = None
    row["news_score"] = None
    row["news_score_source"] = "missing"
    row["news_score_is_placeholder"] = True
    row["placeholder_scores"] = momentum_score is None or risk_score is None
    row["scores_are_placeholders"] = momentum_score is None or risk_score is None
    row["score_status"] = "missing" if momentum_score is None or risk_score is None else "available"
    row["metrics_source"] = "AI_INTELLIGENCE_CACHE" if (momentum_score is not None or risk_score is not None) else "missing"
    quote_provider = str(row.get("quoteSource") or row.get("source") or "missing")
    metric_fields = {
        "last": (row.get("last"), quote_provider),
        "avg_cost": (row.get("avg_cost"), str(row.get("pricing_source") or row.get("pricing_status") or quote_provider)),
        "market_value": (row.get("market_value"), quote_provider),
        "day_change": (row.get("day_change"), quote_provider),
        "day_pnl": (row.get("day_pnl"), quote_provider),
        "day_pnl_pct": (row.get("day_pnl_pct"), quote_provider),
        "unrealized": (row.get("unrealized"), quote_provider),
        "unrealized_pct": (row.get("unrealized_pct"), quote_provider),
        "risk": (row.get("risk"), str(row.get("risk_source") or "missing")),
        "momentum": (row.get("momentum_score"), str(row.get("momentum_source") or "missing")),
        "news_score": (row.get("news_score"), str(row.get("news_score_source") or "missing")),
    }
    metric_states: Dict[str, Dict[str, Any]] = {}
    missing_metrics: List[Dict[str, Any]] = []
    for field, (value, provider) in metric_fields.items():
        is_missing = value is None or value == ""
        state = {
            "value": value if not is_missing else None,
            "isMissing": is_missing,
            "provider": provider if not is_missing else "missing",
            "availabilityPct": 100 if not is_missing else 0,
        }
        if is_missing:
            state["reason"] = "Value unavailable from provider."
            missing_metrics.append({"field": field, "provider": provider, "reason": state["reason"]})
        metric_states[field] = state
    if row.get("calculationProvenance"):
        metric_states["day_change"]["calculationProvenance"] = row["calculationProvenance"].get("day_change")
        metric_states["day_pnl"]["calculationProvenance"] = row["calculationProvenance"].get("day_pnl")
        metric_states["day_pnl_pct"]["calculationProvenance"] = row["calculationProvenance"].get("day_pnl_pct")
        metric_states["unrealized"]["calculationProvenance"] = row["calculationProvenance"].get("unrealized")
        metric_states["unrealized_pct"]["calculationProvenance"] = row["calculationProvenance"].get("unrealized_pct")
    row["metricStates"] = metric_states
    row["missingMetrics"] = missing_metrics
    return row


def normalize_positions(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return _aggregate_positions(list(rows or []))


def _save_snapshot_bundle(bundle: Dict[str, Any]) -> None:
    with _SNAPSHOT_LOCK:
        _ensure_snapshot_dir()
        _write_json_file(_SNAPSHOT_POSITIONS_FILE, bundle.get("positions_payload") or {"positions": []})
        _write_json_file(_SNAPSHOT_SUMMARY_FILE, bundle.get("summary_payload") or {"summary": {}})
        _write_json_file(_SNAPSHOT_TRADES_FILE, bundle.get("trades_payload") or {"trades": []})
        _write_json_file(_SNAPSHOT_META_FILE, bundle.get("meta_payload") or {})
        _write_snapshot_state(bundle.get("state_payload") or {})


def _snapshot_available() -> bool:
    valid, _ = _stored_snapshot_validation()
    return valid


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

    def get_runtime_status(self) -> Dict[str, Any]:
        summary = self.get_summary()
        return {
            "status": "MOCK",
            "message": "Mock portfolio data is active.",
            "configured_mode": "mock",
            "configured_mode_label": provider_mode_label("mock"),
            "active_source": "MOCK",
            "active_source_label": provider_source_label("MOCK"),
            "fallback_active": False,
            "fallback_reason": None,
            "provider_class": self.__class__.__name__,
            "gateway_url": get_ibkr_gateway_config()["configured_url"],
            "gateway_api": get_ibkr_gateway_config()["effective_url"],
            "gateway_status": "not_applicable",
            "gateway_error": None,
            "ibkr_gateway_reachable": False,
            "ibkr_authenticated": False,
            "accounts_available": False,
            "positions_available": False,
            "trades_available": False,
            "snapshot_available": False,
            "snapshot_timestamp": None,
            "snapshotAvailable": False,
            "snapshotTimestamp": None,
            "snapshotAgeSeconds": None,
            "snapshotRefreshStatus": None,
            "snapshotLastRefreshAttempt": None,
            "snapshotLastRefreshError": None,
            "snapshotSchemaVersion": None,
            "is_live": False,
            "is_stale": False,
            "stale_reason": None,
            "portfolioMode": "MOCK",
            "positionsSource": "MOCK",
            "priceSource": "MOCK",
            "activePriceProvider": "MOCK",
            "activePositionProvider": "MOCK",
            "isLivePositions": False,
            "isLivePricing": False,
            "isHybrid": False,
            "lastPositionsTimestamp": None,
            "lastPriceTimestamp": None,
            "lastRefresh": summary.get("as_of"),
            "nextRefresh": None,
            "isLiveUpdating": False,
            "pricesLive": False,
            "pricesLastRefresh": None,
            "pricesAgeSeconds": None,
            "positionsLastRefresh": None,
            "summaryLastRefresh": None,
        }


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

    def get_runtime_status(self) -> Dict[str, Any]:
        return {
            "status": "DISCONNECTED",
            "message": "Client Portal Gateway is unavailable and no saved snapshot exists.",
            "configured_mode": get_data_source_mode(),
            "configured_mode_label": provider_mode_label(get_data_source_mode()),
            "active_source": "DISCONNECTED",
            "active_source_label": provider_source_label("DISCONNECTED"),
            "fallback_active": False,
            "fallback_reason": "Gateway offline and no saved snapshot is available.",
            "provider_class": self.__class__.__name__,
            "gateway_url": get_ibkr_gateway_config()["configured_url"],
            "gateway_api": get_ibkr_gateway_config()["effective_url"],
            "gateway_status": "gateway_down",
            "gateway_error": "Gateway offline.",
            "ibkr_gateway_reachable": False,
            "ibkr_authenticated": False,
            "accounts_available": False,
            "positions_available": False,
            "trades_available": False,
            "snapshot_available": False,
            "snapshot_timestamp": None,
            "snapshotAvailable": False,
            "snapshotTimestamp": None,
            "snapshotAgeSeconds": None,
            "snapshotRefreshStatus": None,
            "snapshotLastRefreshAttempt": None,
            "snapshotLastRefreshError": None,
            "snapshotSchemaVersion": None,
            "is_live": False,
            "is_stale": True,
            "stale_reason": "Gateway offline and no saved snapshot is available.",
            "portfolioMode": "DISCONNECTED",
            "positionsSource": "DISCONNECTED",
            "priceSource": "STALE",
            "activePriceProvider": "STALE",
            "activePositionProvider": "DISCONNECTED",
            "isLivePositions": False,
            "isLivePricing": False,
            "isHybrid": False,
            "lastPositionsTimestamp": None,
            "lastPriceTimestamp": None,
            "lastRefresh": None,
            "nextRefresh": None,
            "isLiveUpdating": False,
            "pricesLive": False,
            "pricesLastRefresh": None,
            "pricesAgeSeconds": None,
            "positionsLastRefresh": None,
            "summaryLastRefresh": None,
        }


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

    def get_snapshot_state(self) -> Dict[str, Any]:
        bundle = self._load_bundle()
        meta = bundle.get("meta") if isinstance(bundle.get("meta"), dict) else {}
        state = _load_snapshot_state()
        snapshot_state = _snapshot_state_from_meta(meta, state_payload=state)
        snapshot_state.update(
            {
                "source": "LAST_UPDATE",
                "snapshotAvailable": self.is_available(),
                "snapshotTimestamp": _snapshot_timestamp(meta),
                "snapshotAgeSeconds": _snapshot_age_seconds(meta),
                "positionsCount": len(bundle.get("positions") or []),
                "lastRefreshAttempt": state.get("lastRefreshAttempt") or snapshot_state.get("lastRefreshAttempt"),
                "lastRefreshStatus": state.get("lastRefreshStatus") or snapshot_state.get("lastRefreshStatus"),
                "lastRefreshError": state.get("lastRefreshError") or snapshot_state.get("lastRefreshError"),
            }
        )
        return snapshot_state

    def get_portfolio(self) -> Dict[str, Any]:
        from services.state import compute_exposures, risk_doctor, today_actions, stress_tests, macro_snapshot
        positions = self.get_positions()
        summary = self.get_summary()
        meta = self._load_bundle()["meta"]
        snapshot_state = self.get_snapshot_state()
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
            "snapshotAvailable": True,
            "snapshotTimestamp": _snapshot_timestamp(meta),
            "snapshotAgeSeconds": snapshot_state.get("snapshotAgeSeconds"),
            "snapshotRefreshStatus": snapshot_state.get("lastRefreshStatus"),
            "snapshotLastRefreshAttempt": snapshot_state.get("lastRefreshAttempt"),
            "snapshotLastRefreshError": snapshot_state.get("lastRefreshError"),
            "snapshotSchemaVersion": snapshot_state.get("schemaVersion"),
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

    def get_runtime_status(self) -> Dict[str, Any]:
        snapshot_state = self.get_snapshot_state()
        meta = self.get_snapshot_meta()
        snapshot_available = self.is_available()
        snapshot_timestamp = _snapshot_timestamp(meta) if snapshot_available else None
        snapshot_age = snapshot_state.get("snapshotAgeSeconds") if isinstance(snapshot_state, dict) else None
        last_refresh = snapshot_state.get("lastRefresh") if isinstance(snapshot_state, dict) else None
        if not last_refresh:
            last_refresh = snapshot_timestamp
        return {
            "status": "LAST_UPDATE",
            "message": "Using saved IBKR snapshot.",
            "configured_mode": "last-update",
            "configured_mode_label": provider_mode_label("last-update"),
            "active_source": "LAST_UPDATE",
            "active_source_label": provider_source_label("LAST_UPDATE"),
            "fallback_active": False,
            "fallback_reason": None,
            "provider_class": self.__class__.__name__,
            "gateway_url": get_ibkr_gateway_config()["configured_url"],
            "gateway_api": get_ibkr_gateway_config()["effective_url"],
            "gateway_status": "not_applicable",
            "gateway_error": None,
            "gateway_open": False,
            "ibkr_gateway_reachable": False,
            "ibkr_authenticated": False,
            "accounts_available": False,
            "positions_available": False,
            "trades_available": False,
            "snapshot_available": snapshot_available,
            "snapshot_timestamp": snapshot_timestamp,
            "snapshotAvailable": snapshot_available,
            "snapshotTimestamp": snapshot_timestamp,
            "snapshotAgeSeconds": snapshot_age,
            "snapshotRefreshStatus": snapshot_state.get("lastRefreshStatus"),
            "snapshotLastRefreshAttempt": snapshot_state.get("lastRefreshAttempt"),
            "snapshotLastRefreshError": snapshot_state.get("lastRefreshError"),
            "snapshotSchemaVersion": snapshot_state.get("schemaVersion"),
            "is_live": False,
            "is_stale": bool(_is_snapshot_stale(meta)) if snapshot_available else True,
            "stale_reason": "Saved snapshot is stale." if snapshot_available and _is_snapshot_stale(meta) else ("No saved IBKR snapshot available." if not snapshot_available else None),
            "portfolioMode": "LAST_UPDATE_ONLY",
            "positionsSource": "IBKR_LAST_UPDATE",
            "priceSource": "STALE",
            "activePriceProvider": "STALE",
            "activePositionProvider": "IBKR_LAST_UPDATE",
            "isLivePositions": False,
            "isLivePricing": False,
            "isHybrid": False,
            "lastPositionsTimestamp": last_refresh,
            "lastPriceTimestamp": None,
            "lastRefresh": last_refresh,
            "nextRefresh": None,
            "isLiveUpdating": False,
            "pricesLive": False,
            "pricesLastRefresh": None,
            "pricesAgeSeconds": None,
            "positionsLastRefresh": last_refresh,
            "summaryLastRefresh": last_refresh,
        }


# ─── IBKR Live Provider (Client Portal Gateway REST) ──────────────────────────

class IbkrLivePortfolioProvider:
    source_name = "IBKR_LIVE"
    _CACHE_LOCK = threading.RLock()
    _CACHE_BUNDLE: Optional[Dict[str, Any]] = None
    _CACHE_AT: Optional[datetime] = None
    _CACHE_ERROR: Optional[str] = None
    _CACHE_TTL_SECONDS = _LIVE_REFRESH_SECONDS
    _QUOTE_REFRESH_SECONDS = 2.5
    _HEARTBEAT_LOCK = threading.RLock()
    _HEARTBEAT_CACHE: Optional[Dict[str, Any]] = None
    _HEARTBEAT_AT: Optional[datetime] = None
    _HEARTBEAT_TTL_SECONDS = 4.0
    _QUOTE_FIELDS = "31,82,83,84,85,86,87,88,7059"
    _QUOTE_BATCH_SIZE = 25
    _REFRESH_THREAD_LOCK = threading.RLock()
    _REFRESH_THREAD: Optional[threading.Thread] = None
    _REFRESH_STOP = threading.Event()

    def __init__(self) -> None:
        self._gateway_config = get_ibkr_gateway_config()
        self._ssl_ctx = ssl.create_default_context() if self._gateway_config["ssl_verify"] else ssl._create_unverified_context()
        self._opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}),
            urllib.request.HTTPSHandler(context=self._ssl_ctx),
        )
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

    def _refresh_quotes_only(self) -> None:
        """Lightweight quote-only refresh: updates prices in the cached bundle without a full IBKR round-trip."""
        with self._CACHE_LOCK:
            if not self._CACHE_BUNDLE:
                return
            positions = deepcopy(self._CACHE_BUNDLE.get("positions", []))
        conids = [str(p.get("conid") or "").strip() for p in positions if str(p.get("conid") or "").strip()]
        if not conids:
            return
        quote_map = self._fetch_market_quotes(conids)
        if not quote_map:
            return
        new_positions, prices_live, _, prices_lr, _ = self._overlay_live_quotes(positions, quote_map, positions)
        as_of = datetime.now(timezone.utc).isoformat()
        with self._CACHE_LOCK:
            if self._CACHE_BUNDLE and prices_live:
                self._CACHE_BUNDLE["positions"] = new_positions
                self._CACHE_BUNDLE["pricesLive"] = True
                self._CACHE_BUNDLE["isLiveUpdating"] = True
                self._CACHE_BUNDLE["pricesLastRefresh"] = prices_lr or as_of
                self._CACHE_BUNDLE["pricesAgeSeconds"] = _position_quote_refresh_age(prices_lr) if prices_lr else None
                self._CACHE_AT = datetime.now(timezone.utc)

    def _refresh_loop(self) -> None:
        last_full_at = 0.0
        while not self._REFRESH_STOP.is_set():
            try:
                if self.get_gateway_heartbeat().get("gateway_open"):
                    now = time.time()
                    if (now - last_full_at) >= self._CACHE_TTL_SECONDS:
                        self._fetch_live_bundle()
                        last_full_at = time.time()
                    else:
                        self._refresh_quotes_only()
            except Exception as exc:
                with self._CACHE_LOCK:
                    if self._CACHE_BUNDLE:
                        self._CACHE_BUNDLE["is_stale"] = True
                        self._CACHE_BUNDLE["stale_reason"] = str(exc)
                        self._CACHE_BUNDLE["fallback_active"] = True
                        self._CACHE_BUNDLE["fallback_reason"] = str(exc)
                        self._CACHE_BUNDLE["pricesLive"] = False
            self._REFRESH_STOP.wait(self._QUOTE_REFRESH_SECONDS)

    def _get(self, path: str, timeout: Optional[float] = None) -> Any:
        request_timeout = float(timeout if timeout is not None else self._gateway_config["timeout_seconds"])
        url = f"{self._gateway_config['effective_url']}{path}"
        parsed = urllib.parse.urlsplit(url)
        request_path = parsed.path + (f"?{parsed.query}" if parsed.query else "")
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        started = time.perf_counter()
        try:
            with self._opener.open(req, timeout=request_timeout) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
            _IBKR_LOGGER.info(
                "IBKR request url=%s host=%s port=%s path=%s timeout=%ss elapsed_ms=%s status=ok",
                url, parsed.hostname, parsed.port, request_path, request_timeout, elapsed_ms,
            )
            return payload
        except Exception as exc:
            elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
            _IBKR_LOGGER.warning(
                "IBKR request url=%s host=%s port=%s path=%s timeout=%ss elapsed_ms=%s status=error exception=%s",
                url, parsed.hostname, parsed.port, request_path, request_timeout, elapsed_ms, str(exc),
            )
            raise

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
        # Some gateway sessions can briefly time out on /auth/status while portfolio endpoints are still available.
        # Use a lightweight accounts probe as a secondary signal before declaring the gateway down.
        if status != "connected":
            accounts, accounts_error = self._safe_get("/portfolio/accounts", timeout=2.0)
            if accounts_error is None and isinstance(accounts, list) and len(accounts) > 0:
                reachable = True
                authenticated = True
                status = "connected"
                auth_error = None
                if not isinstance(auth, dict):
                    auth = {}
                auth.update(
                    {
                        "authenticated": True,
                        "connected": True,
                        "established": True,
                        "competing": False,
                        "fallbackProbe": "accounts",
                    }
                )
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

    def get_connectivity_diagnostics(self, timeout: Optional[float] = None) -> Dict[str, Any]:
        started = time.perf_counter()
        request_timeout = float(timeout if timeout is not None else self._gateway_config["timeout_seconds"])
        auth_result: Dict[str, Any] = {}
        exception: Optional[str] = None
        try:
            result = self._get("/iserver/auth/status", timeout=request_timeout)
            if isinstance(result, dict):
                auth_result = {
                    "authenticated": bool(result.get("authenticated")),
                    "established": bool(result.get("established")),
                    "connected": bool(result.get("connected")),
                    "competing": bool(result.get("competing")),
                    "message": str(result.get("message") or ""),
                }
        except Exception as exc:
            exception = f"{type(exc).__name__}: {exc}"
        elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
        addresses: List[str] = []
        try:
            addresses = sorted({row[4][0] for row in socket.getaddrinfo(self._gateway_config["configured_host"], self._gateway_config["port"])})
        except OSError:
            pass
        proxy_names = sorted(key for key in urllib.request.getproxies() if key.lower() in {"http", "https", "all", "no"})
        return {
            "configuredUrl": self._gateway_config["configured_url"],
            "effectiveUrl": self._gateway_config["effective_url"],
            "authStatusResult": auth_result,
            "responseTimeMs": elapsed_ms,
            "exception": exception,
            "sslVerification": self._gateway_config["ssl_verify"],
            "timeoutSeconds": request_timeout,
            "configuredHost": self._gateway_config["configured_host"],
            "effectiveHost": self._gateway_config["effective_host"],
            "port": self._gateway_config["port"],
            "path": "/v1/api/iserver/auth/status",
            "preferIpv4Loopback": self._gateway_config["prefer_ipv4"],
            "resolvedAddresses": addresses,
            "proxyBypassed": self._gateway_config["proxy_bypassed"],
            "detectedProxyNames": proxy_names,
        }

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
                symbol = str(entry.get("55") or entry.get("symbol") or entry.get("ticker") or "").strip().upper()
                quote_last_refresh = refresh_at
                # IBKR field 85 = Ask, field 86 = Close/PrevClose (not the reverse).
                # Field 31 may carry a prefix (C=close, H=halted, etc.) — strip it.
                raw_last = entry.get("31") or entry.get("last") or entry.get("lastPrice") or entry.get("mktPrice")
                last_val = _ibkr_price(raw_last)
                # Track whether IBKR reported a closing price (C prefix) vs a live trade
                price_prefix = str(raw_last)[0].upper() if raw_last and str(raw_last)[0].upper() in _IBKR_PRICE_PREFIX_CHARS else None
                quote_map[conid] = {
                    "conid": conid,
                    "symbol": symbol,
                    "last": last_val,
                    "pricePrefix": price_prefix,
                    # Field 83 = Change (absolute), Field 82 = Change % — both day changes from IBKR.
                    "day_change": _maybe_num(entry.get("83") or entry.get("change") or entry.get("dayChange")),
                    "day_change_pct": _maybe_num(entry.get("82") or entry.get("changePercent") or entry.get("dayChangePct")),
                    "bid": _maybe_num(entry.get("84") or entry.get("bid")),
                    "ask": _maybe_num(entry.get("85") or entry.get("ask")),
                    "previous_close": _maybe_num(entry.get("86") or entry.get("previousClose") or entry.get("prevClose") or entry.get("close")),
                    "volume": _maybe_num(entry.get("87") or entry.get("volume")),
                    "bid_size": _maybe_num(entry.get("88") or entry.get("bidSize")),
                    "quoteLastRefresh": quote_last_refresh,
                    "quoteSource": "IBKR_LIVE",
                    "priceSource": "IBKR_LIVE",
                    "quoteTransport": "IBKR_MARKETDATA_SNAPSHOT",
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
                # Prefer IBKR-reported day change (fields 82/83) over derivation — critical for
                # options where previousClose may be absent.
                official_day_change = _maybe_num(quote.get("day_change") or merged.get("day_change"))
                official_day_change_pct = _maybe_num(quote.get("day_change_pct") or merged.get("day_change_pct"))
                day_metrics = _derive_day_metrics(
                    last=last_price,
                    previous_close=prev_close,
                    quantity=qty,
                    multiplier=multiplier,
                    official_day_change=official_day_change,
                    official_day_change_pct=official_day_change_pct,
                )
                merged.update(
                    {
                        "last": round(last_price, 4),
                        "previousClose": round(prev_close, 4) if prev_close is not None else merged.get("previousClose"),
                        "prevClose": round(prev_close, 4) if prev_close is not None else merged.get("prevClose"),
                        "day_change": day_metrics["day_change"] if day_metrics["day_change"] is not None else official_day_change,
                        "day_change_pct": day_metrics["day_change_pct"] if day_metrics["day_change_pct"] is not None else official_day_change_pct,
                        "day_pnl": day_metrics["day_pnl"],
                        "day_pnl_pct": day_metrics["day_pnl_pct"] if day_metrics["day_pnl_pct"] is not None else official_day_change_pct,
                        "market_value": round(market_value, 2) if market_value is not None else merged.get("market_value"),
                        "unrealized": round(unrealized, 2) if unrealized is not None else merged.get("unrealized"),
                        "unrealized_pct": round(unrealized / cost_basis * 100, 2) if cost_basis else _num(merged.get("unrealized_pct")),
                        "quoteLastRefresh": quote_last_refresh,
                        "quoteAgeSeconds": 0,
                        "quoteSource": quote.get("quoteSource") or quote.get("priceSource") or "IBKR_LIVE",
                        "priceSource": quote.get("priceSource") or quote.get("quoteSource") or "IBKR_LIVE",
                        "quoteTransport": quote.get("quoteTransport") or "IBKR_MARKETDATA_SNAPSHOT",
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
                    day_metrics = _derive_day_metrics(
                        last=_num(merged.get("last")),
                        previous_close=_maybe_num(merged.get("previousClose") or merged.get("prevClose") or merged.get("closePrice")),
                        quantity=qty,
                        multiplier=multiplier,
                        official_day_change=_maybe_num(merged.get("day_change")),
                        official_day_change_pct=_maybe_num(merged.get("day_change_pct")),
                    )
                    merged["day_change"] = day_metrics["day_change"]
                    merged["day_change_pct"] = day_metrics["day_change_pct"]
                    merged["day_pnl"] = day_metrics["day_pnl"]
                    merged["day_pnl_pct"] = day_metrics["day_pnl_pct"]
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

    def _apply_yahoo_price_fallback(
        self,
        positions: List[Dict[str, Any]],
        *,
        prefer_live_ibkr: bool,
        resolution_source: str,
        snapshot_available: bool,
    ) -> tuple[List[Dict[str, Any]], bool, Optional[str], Optional[str], List[str]]:
        """Overlay Yahoo Finance quotes for eligible positions when IBKR quotes are stale or unavailable."""
        if not positions:
            return positions, False, None, None, []

        eligible_positions: List[Dict[str, Any]] = []
        symbols: List[str] = []
        for position in positions:
            asset_class = str(position.get("assetClass") or position.get("sec_type") or "").upper()
            if asset_class not in {"STK", "ETF", "CRYPTO"}:
                continue
            symbol = str(position.get("symbol") or position.get("underlying") or "").strip().upper().split()[0]
            if not symbol:
                continue
            eligible_positions.append(position)
            symbols.append(symbol)

        symbols = list(dict.fromkeys(symbols))
        if not symbols:
            return positions, False, None, None, []

        quote_bundle = get_yahoo_live_quotes(symbols, wait_timeout_seconds=0.9)
        quote_map = quote_bundle.get("quotes") if isinstance(quote_bundle, dict) else {}
        if not isinstance(quote_map, dict):
            quote_map = {}

        refreshed_at = datetime.now(timezone.utc).isoformat()
        prices_live = bool(quote_bundle.get("pricesLive"))
        quote_refreshes: List[str] = []
        used_fallback = False
        fallback_reason = None
        overlay_sources: List[str] = []
        merged_positions: List[Dict[str, Any]] = []

        for position in positions:
            merged = dict(position)
            asset_class = str(merged.get("assetClass") or merged.get("sec_type") or "").upper()
            symbol = str(merged.get("symbol") or merged.get("underlying") or "").strip().upper().split()[0]
            position_source = str(merged.get("positionSource") or merged.get("source") or "").upper()
            if not position_source:
                if merged.get("manual"):
                    position_source = "MANUAL_HOLDINGS"
                elif resolution_source == "IBKR_LIVE" and prefer_live_ibkr:
                    position_source = "IBKR_LIVE"
                elif snapshot_available:
                    position_source = "IBKR_LAST_UPDATE"
                else:
                    position_source = "MOCK"
            merged["positionSource"] = position_source

            quote = quote_map.get(symbol) if symbol else None
            if asset_class in {"STK", "ETF", "CRYPTO"} and quote and quote.get("last") is not None:
                used_fallback = True
                quote_source = str(quote.get("priceSource") or quote.get("quoteSource") or "YAHOO_LIVE").upper()
                quote_last_refresh = quote.get("quoteTimestamp") or refreshed_at
                last_price = _num(quote.get("last"))
                prev_close = _maybe_num(quote.get("previousClose"))
                qty = _num(merged.get("qty") or merged.get("quantity") or merged.get("position"))
                multiplier = _num(merged.get("multiplier") or _position_multiplier(merged), _position_multiplier(merged))
                cost_basis = _num(merged.get("cost_basis") or merged.get("costBasis"))
                market_value = round(last_price * qty * multiplier, 2) if qty else _num(merged.get("market_value"))
                if market_value is None:
                    market_value = round(last_price, 4) if last_price is not None else _num(merged.get("market_value"))
                day_metrics = _derive_day_metrics(
                    last=last_price,
                    previous_close=prev_close,
                    quantity=qty,
                    multiplier=multiplier,
                    official_day_change=_maybe_num(merged.get("day_change")),
                    official_day_change_pct=_maybe_num(merged.get("day_change_pct")),
                )
                unrealized = None
                unrealized_pct = None
                if market_value is not None and cost_basis not in (None, 0):
                    unrealized = round(market_value - cost_basis, 2)
                    unrealized_pct = round((unrealized / cost_basis) * 100, 2)
                merged.update(
                    {
                        "last": round(last_price, 4) if last_price is not None else merged.get("last"),
                        "previousClose": round(prev_close, 4) if prev_close is not None else merged.get("previousClose"),
                        "prevClose": round(prev_close, 4) if prev_close is not None else merged.get("prevClose"),
                        "day_change": day_metrics["day_change"],
                        "day_change_pct": day_metrics["day_change_pct"],
                        "day_pnl": day_metrics["day_pnl"],
                        "day_pnl_pct": day_metrics["day_pnl_pct"],
                        "market_value": round(market_value, 2) if market_value is not None else merged.get("market_value"),
                        "unrealized": round(unrealized, 2) if unrealized is not None else merged.get("unrealized"),
                        "unrealized_pct": unrealized_pct if unrealized_pct is not None else merged.get("unrealized_pct"),
                        "quoteLastRefresh": quote_last_refresh,
                        "quoteAgeSeconds": quote.get("quoteAgeSeconds"),
                        "quoteSource": quote_source,
                        "priceSource": quote_source,
                        "quoteStale": False,
                        "quoteStaleReason": None,
                        "isLiveQuote": bool(quote.get("isLiveQuote", True)),
                    }
                )
                quote_refreshes.append(str(quote_last_refresh))
                overlay_sources.append(quote_source)
                _record_live_quote_trace(
                    symbol=symbol,
                    conid=str(merged.get("conid") or ""),
                    source="LIVE" if quote_source != "STALE" else "CACHE",
                    quote_timestamp=str(quote_last_refresh),
                    server_timestamp=refreshed_at,
                    age_seconds=quote.get("quoteAgeSeconds"),
                )
            else:
                stale_reason = None
                if asset_class in {"STK", "ETF", "CRYPTO"}:
                    stale_reason = "Yahoo fallback quote unavailable for this symbol."
                elif asset_class == "OPT":
                    stale_reason = "Fallback quote provider does not price this option contract."
                if merged.get("quoteLastRefresh"):
                    quote_refreshes.append(str(merged.get("quoteLastRefresh")))
                if stale_reason and not merged.get("quoteStaleReason"):
                    merged["quoteStaleReason"] = stale_reason
                if not merged.get("quoteSource"):
                    merged["quoteSource"] = "STALE"
                if not merged.get("priceSource"):
                    merged["priceSource"] = "STALE"
                merged["quoteStale"] = bool(merged.get("quoteStale", True))
                if merged.get("priceSource") == "STALE":
                    fallback_reason = fallback_reason or stale_reason
            merged_positions.append(merged)

        if quote_bundle.get("available") and quote_refreshes:
            prices_live = True
        if overlay_sources and resolution_source == "IBKR_LIVE":
            fallback_reason = "IBKR quotes stale; using Yahoo Finance fallback prices for eligible positions."
        elif overlay_sources and resolution_source != "IBKR_LIVE":
            fallback_reason = "Using Yahoo Finance fallback prices for last-known IBKR positions."
        elif not overlay_sources and resolution_source == "IBKR_LIVE" and not prefer_live_ibkr:
            fallback_reason = fallback_reason or "IBKR quote snapshot stale; using Yahoo Finance fallback prices."

        return merged_positions, bool(prices_live), fallback_reason, quote_bundle.get("lastQuoteTimestamp"), overlay_sources

    @staticmethod
    def _portfolio_source_fields(
        *,
        portfolio_mode: str,
        positions_source: str,
        price_source: str,
        positions_last_refresh: Optional[str],
        prices_last_refresh: Optional[str],
        snapshot_timestamp: Optional[str],
        fallback_active: bool,
        fallback_reason: Optional[str],
    ) -> Dict[str, Any]:
        if positions_source == "IBKR_LIVE":
            active_source = "IBKR_LIVE"
        elif positions_source == "IBKR_LAST_UPDATE":
            active_source = "LAST_UPDATE"
        elif positions_source == "MOCK":
            active_source = "MOCK"
        else:
            active_source = portfolio_mode
        active_price_provider = "IBKR" if price_source == "IBKR_LIVE" else ("YAHOO" if price_source in {"YAHOO_LIVE", "YAHOO_DELAYED", "FALLBACK_PROVIDER"} else "STALE")
        is_live_positions = positions_source == "IBKR_LIVE"
        is_live_pricing = price_source != "STALE"
        is_hybrid = portfolio_mode in {"HYBRID_LAST_POSITIONS_LIVE_QUOTES", "MANUAL_HOLDINGS_LIVE_QUOTES"} or (positions_source != "IBKR_LIVE" and is_live_pricing)
        return {
            "source": active_source,
            "active_source": active_source,
            "portfolioMode": portfolio_mode,
            "positionsSource": positions_source,
            "priceSource": price_source,
            "activePriceProvider": active_price_provider,
            "activePositionProvider": positions_source,
            "isLivePositions": is_live_positions,
            "isLivePricing": is_live_pricing,
            "isHybrid": is_hybrid,
            "positionsLastRefresh": positions_last_refresh,
            "lastPositionsTimestamp": positions_last_refresh or snapshot_timestamp,
            "pricesLastRefresh": prices_last_refresh,
            "lastPriceTimestamp": prices_last_refresh,
            "snapshot_timestamp": snapshot_timestamp,
            "fallback_active": fallback_active,
            "fallback_reason": fallback_reason,
        }

    def _normalize_portfolio_after_price_overlay(
        self,
        portfolio: Dict[str, Any],
        *,
        resolution: ProviderResolution,
    ) -> Dict[str, Any]:
        payload = deepcopy(portfolio or {})
        positions = normalize_positions(payload.get("positions", []))
        payload["positions"] = positions
        snapshot_timestamp = payload.get("snapshot_timestamp") or resolution.snapshot_timestamp or payload.get("as_of")
        positions_source = "MOCK"
        payload_source = str(payload.get("source") or "").upper()
        payload_is_live = bool(
            payload.get("is_live")
            or payload.get("isLiveUpdating")
            or payload.get("pricesLive")
            or payload.get("isLivePricing")
            or payload.get("active_source") == "IBKR_LIVE"
        )
        if resolution.configured_mode == "ibkr-live":
            if resolution.is_live and resolution.active_source == "IBKR_LIVE" and payload_source == "IBKR_LIVE":
                positions_source = "IBKR_LIVE"
            elif payload_source in {"LAST_UPDATE", "IBKR_LAST_UPDATE"} or (resolution.snapshot_available and not resolution.is_live):
                positions_source = "IBKR_LAST_UPDATE"
            elif resolution.snapshot_available and positions:
                positions_source = "IBKR_LAST_UPDATE"
            else:
                positions_source = "NO_DATA"
        elif resolution.configured_mode == "last-update":
            positions_source = "IBKR_LAST_UPDATE" if resolution.snapshot_available else "NO_DATA"
        elif resolution.configured_mode == "mock":
            positions_source = "MOCK"

        price_source = "IBKR_LIVE" if resolution.is_live and payload.get("pricesLive") else "STALE"
        if positions_source == "IBKR_LIVE":
            portfolio_mode = "IBKR_LIVE"
        elif positions_source == "IBKR_LAST_UPDATE":
            portfolio_mode = "LAST_UPDATE_ONLY"
        elif positions_source == "NO_DATA":
            portfolio_mode = "NO_DATA"
        else:
            portfolio_mode = "MOCK"
        fallback_active = bool(resolution.fallback_active or positions_source == "IBKR_LAST_UPDATE" or price_source != "IBKR_LIVE")
        fallback_reason = resolution.fallback_reason
        prices_live = bool(payload.get("pricesLive"))
        prices_last_refresh = payload.get("pricesLastRefresh")
        quote_sources: List[str] = []

        if positions:
            use_price_fallback = (
                resolution.configured_mode == "ibkr-live"
                and (not resolution.is_live or not prices_live or any(bool(p.get("quoteStale")) for p in positions))
            ) or resolution.configured_mode == "last-update"

            if use_price_fallback:
                positions, prices_live, fallback_reason, fallback_prices_last_refresh, overlay_sources = self._apply_yahoo_price_fallback(
                    positions,
                    prefer_live_ibkr=bool(resolution.is_live),
                    resolution_source=resolution.active_source,
                    snapshot_available=bool(resolution.snapshot_available),
                )
                prices_last_refresh = fallback_prices_last_refresh or prices_last_refresh
                if overlay_sources:
                    quote_sources.extend(overlay_sources)
                    portfolio_mode = "HYBRID_LAST_POSITIONS_LIVE_QUOTES" if positions_source != "MOCK" else "MANUAL_HOLDINGS_LIVE_QUOTES"
                    fallback_active = True
                    if not fallback_reason:
                        fallback_reason = "Using Yahoo Finance fallback prices."
                yahoo_updated = len([p for p in positions if str(p.get("quoteSource") or "").upper() not in ("", "STALE")])
                _IBKR_LOGGER.info(
                    "[QUOTE_UPDATE] source=YAHOO_FALLBACK updated_positions=%s prices_live=%s positions_source=%s refresh=%s",
                    yahoo_updated,
                    prices_live,
                    positions_source,
                    prices_last_refresh,
                )
            else:
                quote_sources.extend([str(p.get("priceSource") or p.get("quoteSource") or "STALE").upper() for p in positions if p.get("priceSource") or p.get("quoteSource")])

        quote_sources = [src for src in quote_sources if src]
        if resolution.configured_mode == "ibkr-live" and resolution.is_live and not fallback_active:
            normalized_sources: List[str] = []
            for pos in positions:
                current_source = str(pos.get("priceSource") or pos.get("quoteSource") or "").upper()
                if current_source in {"IBKR_MARKETDATA_SNAPSHOT", "IBKR_MARKETDATA", "POSITION_ENDPOINT", "CACHE"} or not current_source:
                    pos["quoteSource"] = "IBKR_LIVE"
                    pos["priceSource"] = "IBKR_LIVE"
                    pos["quoteStale"] = False
                    pos["quoteStaleReason"] = None
                    normalized_sources.append("IBKR_LIVE")
                elif current_source:
                    normalized_sources.append(current_source)
            quote_sources = normalized_sources or quote_sources
        if quote_sources:
            unique_sources = set(quote_sources)
            if len(unique_sources) == 1:
                price_source = next(iter(unique_sources))
            elif "YAHOO_LIVE" in unique_sources or "YAHOO_DELAYED" in unique_sources:
                price_source = "FALLBACK_PROVIDER"
            elif "IBKR_LIVE" in unique_sources:
                price_source = "FALLBACK_PROVIDER"
            else:
                price_source = "STALE"

        if positions_source == "IBKR_LIVE":
            active_source = "IBKR_LIVE"
        elif positions_source == "IBKR_LAST_UPDATE":
            active_source = "LAST_UPDATE"
        elif positions_source == "MOCK":
            active_source = "MOCK"
        else:
            active_source = portfolio_mode

        total_market_value = round(sum(_num(p.get("market_value")) for p in positions), 2)
        _summary_ref = payload.get("summary") if isinstance(payload.get("summary"), dict) else {}
        cash = _num(payload.get("cash") or _summary_ref.get("cash"))
        computed_total = round(total_market_value + cash, 2) if total_market_value or cash else 0.0
        ibkr_nlv = _num(payload.get("net_liquidation") or payload.get("total_value") or _summary_ref.get("net_liquidation") or _summary_ref.get("total_value"))
        # IBKR_LIVE: preserve the NLV from summary (includes all assets, exact margin accounting)
        # LAST_UPDATE/snapshot: recompute from live-priced positions; stored NLV is stale
        total_value = ibkr_nlv if positions_source == "IBKR_LIVE" and ibkr_nlv > 0 else (computed_total or ibkr_nlv)
        cost_basis = round(sum(_num(p.get("cost_basis") or p.get("costBasis")) for p in positions), 2)
        unrealized = round(sum(_num(p.get("unrealized")) for p in positions), 2)
        day_pnls = [_maybe_num(p.get("day_pnl")) for p in positions if _maybe_num(p.get("day_pnl")) is not None]
        daily_pnl = round(sum(day_pnls), 2) if day_pnls else None
        previous_market_values = [_maybe_num(p.get("previous_market_value")) for p in positions if _maybe_num(p.get("previous_market_value")) is not None]
        previous_portfolio_value = round(sum(previous_market_values), 2) if previous_market_values else None
        daily_pnl_pct = None
        if daily_pnl is not None and previous_portfolio_value not in (None, 0):
            daily_pnl_pct = round((daily_pnl / previous_portfolio_value) * 100, 2)
        elif payload.get("daily_pnl_pct") is not None and portfolio_mode == "IBKR_LIVE":
            daily_pnl_pct = _maybe_num(payload.get("daily_pnl_pct"))
        summary_last_refresh = datetime.now(timezone.utc).isoformat()
        prices_last_refresh = prices_last_refresh or summary_last_refresh
        positions_last_refresh = payload.get("positionsLastRefresh") or payload.get("positions_refreshed_at") or snapshot_timestamp or summary_last_refresh
        summary = dict(payload.get("summary") or {})
        summary.update(
            {
                "source": active_source,
                "mode": portfolio_mode,
                "configured_mode": resolution.configured_mode,
            }
        )
        payload.update(
            {
                **self._portfolio_source_fields(
                    portfolio_mode=portfolio_mode,
                    positions_source=positions_source,
                    price_source=price_source,
                    positions_last_refresh=positions_last_refresh,
                    prices_last_refresh=prices_last_refresh,
                    snapshot_timestamp=snapshot_timestamp,
                    fallback_active=fallback_active,
                    fallback_reason=fallback_reason,
                ),
                "positions": positions,
                "total_value": total_value,
                "cash": round(cash, 2),
                "buying_power": _num(payload.get("buying_power") or _summary_ref.get("buying_power")),
                "excess_liquidity": _num(payload.get("excess_liquidity") or _summary_ref.get("excess_liquidity")),
                "maint_margin_req": _num(payload.get("maint_margin_req") or _summary_ref.get("maint_margin_req")),
                "init_margin_req": _num(payload.get("init_margin_req") or _summary_ref.get("init_margin_req")),
                "available_funds": _num(payload.get("available_funds") or _summary_ref.get("available_funds")),
                "gross_position_value": _num(payload.get("gross_position_value") or _summary_ref.get("gross_position_value")),
                "cost_basis": round(cost_basis, 2),
                "unrealized": round(unrealized, 2),
                "unrealized_pct": round(unrealized / cost_basis * 100, 2) if cost_basis not in (None, 0) else payload.get("unrealized_pct"),
                "daily_pnl": daily_pnl,
                "daily_pnl_pct": daily_pnl_pct,
                "net_liquidation": round(total_value, 2),
                "portfolioMode": portfolio_mode,
                "positionsSource": positions_source,
                "priceSource": price_source,
                "activePriceProvider": "IBKR" if price_source == "IBKR_LIVE" else ("YAHOO" if price_source in {"YAHOO_LIVE", "YAHOO_DELAYED", "FALLBACK_PROVIDER"} else "STALE"),
                "activePositionProvider": positions_source,
                "isLivePositions": positions_source == "IBKR_LIVE",
                "isLivePricing": price_source != "STALE",
                "isHybrid": portfolio_mode in {"HYBRID_LAST_POSITIONS_LIVE_QUOTES", "MANUAL_HOLDINGS_LIVE_QUOTES"},
                "lastPositionsTimestamp": positions_last_refresh,
                "lastPriceTimestamp": prices_last_refresh,
                "pricesLive": price_source != "STALE",
                "pricesAgeSeconds": _position_quote_refresh_age(prices_last_refresh) if prices_last_refresh else None,
                "pricesLastRefresh": prices_last_refresh,
                "positionsLastRefresh": positions_last_refresh,
                "summaryLastRefresh": summary_last_refresh,
                "lastRefresh": summary_last_refresh,
                "as_of": summary_last_refresh,
                "active_source": active_source,
                "source": active_source,
                "fallback_active": fallback_active,
                "fallback_reason": fallback_reason,
                "is_live": portfolio_mode == "IBKR_LIVE",
                "is_stale": portfolio_mode in {"LAST_UPDATE_ONLY", "NO_DATA"},
                "stale_reason": fallback_reason if portfolio_mode != "IBKR_LIVE" else None,
            }
        )

        summary.update(
            {
                "source": active_source,
                "mode": portfolio_mode,
                "portfolioMode": portfolio_mode,
                "positionsSource": positions_source,
                "priceSource": price_source,
                "activePriceProvider": payload["activePriceProvider"],
                "activePositionProvider": positions_source,
                "isLivePositions": positions_source == "IBKR_LIVE",
                "isLivePricing": price_source != "STALE",
                "isHybrid": portfolio_mode in {"HYBRID_LAST_POSITIONS_LIVE_QUOTES", "MANUAL_HOLDINGS_LIVE_QUOTES"},
                "lastPositionsTimestamp": positions_last_refresh,
                "lastPriceTimestamp": prices_last_refresh,
                "pricesLive": price_source != "STALE",
                "pricesAgeSeconds": _position_quote_refresh_age(prices_last_refresh) if prices_last_refresh else None,
                "pricesLastRefresh": prices_last_refresh,
                "positionsLastRefresh": positions_last_refresh,
                "summaryLastRefresh": summary_last_refresh,
                "lastRefresh": summary_last_refresh,
                "as_of": summary_last_refresh,
                "snapshot_available": bool(resolution.snapshot_available or positions),
                "snapshot_timestamp": snapshot_timestamp,
                "fallback_active": fallback_active,
                "fallback_reason": fallback_reason,
                "is_live": portfolio_mode == "IBKR_LIVE",
                "is_stale": portfolio_mode in {"LAST_UPDATE_ONLY", "NO_DATA"},
                "stale_reason": fallback_reason if portfolio_mode != "IBKR_LIVE" else None,
                "total_value": total_value,
                "cash": round(cash, 2),
                "buying_power": _num(summary.get("buying_power") or payload.get("buying_power")),
                "excess_liquidity": _num(summary.get("excess_liquidity") or payload.get("excess_liquidity")),
                "maint_margin_req": _num(summary.get("maint_margin_req") or payload.get("maint_margin_req")),
                "init_margin_req": _num(summary.get("init_margin_req") or payload.get("init_margin_req")),
                "available_funds": _num(summary.get("available_funds") or payload.get("available_funds")),
                "unrealized": round(unrealized, 2),
                "unrealized_pct": round(unrealized / cost_basis * 100, 2) if cost_basis not in (None, 0) else summary.get("unrealized_pct"),
                "daily_pnl": daily_pnl,
                "daily_pnl_pct": daily_pnl_pct,
                "net_liquidation": round(total_value, 2),
                "positions_count": len(positions),
            }
        )
        payload["summary"] = summary
        _IBKR_LOGGER.info(
            "[PORTFOLIO_RECALCULATED] source=%s total_value=%s net_liq=%s positions=%s daily_pnl=%s prices_live=%s",
            active_source,
            round(total_value, 2),
            round(total_value, 2),
            len(positions),
            round(daily_pnl, 2) if daily_pnl is not None else None,
            price_source != "STALE",
        )
        return payload

    def _fetch_live_bundle(self, *, force_snapshot: bool = False) -> Dict[str, Any]:
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
                    "source": "LAST_UPDATE",
                    "mode": "last-update",
                    "snapshot_available": True,
                    "snapshot_timestamp": _snapshot_timestamp(snapshot_bundle.get("meta_payload", {})),
                    "as_of": snapshot_summary.get("as_of") if isinstance(snapshot_summary, dict) else None,
                    "positions": snapshot_positions or [],
                    "summary": snapshot_summary or {},
                    "trades": snapshot_bundle.get("trades_payload", {}).get("trades", []) if isinstance(snapshot_bundle.get("trades_payload"), dict) else [],
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
        valid_bundle, invalid_reason = _snapshot_bundle_is_valid(bundle)
        if not valid_bundle:
            self._persist_live_snapshot(bundle, force=force_snapshot, refresh_status="failed", refresh_error=invalid_reason)
            with self._CACHE_LOCK:
                if self._CACHE_BUNDLE:
                    self._CACHE_BUNDLE["is_stale"] = True
                    self._CACHE_BUNDLE["stale_reason"] = invalid_reason
                    self._CACHE_BUNDLE["fallback_active"] = True
                    self._CACHE_BUNDLE["fallback_reason"] = invalid_reason
                    self._CACHE_BUNDLE["pricesLive"] = False
            if previous_bundle:
                return deepcopy(previous_bundle)
            raise RuntimeError(invalid_reason)
        self._persist_live_snapshot(bundle, force=force_snapshot, refresh_status="ok")
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
        if heartbeat.get("gateway_open"):
            try:
                return self._fetch_live_bundle()
            except Exception as live_exc:
                if _snapshot_available():
                    snapshot = SnapshotPortfolioProvider()
                    bundle = snapshot._load_bundle()
                    snap_meta = bundle.get("meta", {})
                    snap_stale = _is_snapshot_stale(snap_meta)
                    snap_prices_live = bool(snap_meta.get("pricesLive", False)) and not snap_stale
                    snap_live_updating = bool(snap_meta.get("isLiveUpdating", False)) and not snap_stale
                    as_of = bundle.get("summary", {}).get("as_of") or snap_meta.get("snapshot_timestamp") or datetime.now(timezone.utc).isoformat()
                    return {
                        "source": "LAST_UPDATE",
                        "mode": "last-update",
                        "as_of": as_of,
                        "account_id": snap_meta.get("account_id"),
                        "positions": bundle.get("positions", []),
                        "summary": bundle.get("summary", {}),
                        "trades": bundle.get("trades", []),
                        "snapshot_timestamp": snap_meta.get("snapshot_timestamp") or snap_meta.get("as_of"),
                        "snapshot_available": True,
                        "heartbeat": heartbeat,
                        "refreshed_at": as_of,
                        "lastRefresh": as_of,
                        "nextRefresh": None,
                        "pricesLive": snap_prices_live,
                        "pricesLastRefresh": snap_meta.get("pricesLastRefresh") or snap_meta.get("lastRefresh") or snap_meta.get("snapshot_timestamp"),
                        "pricesAgeSeconds": snap_meta.get("pricesAgeSeconds"),
                        "isLiveUpdating": snap_live_updating,
                        "positions_refreshed_at": snap_meta.get("positionsLastRefresh") or snap_meta.get("positions_refreshed_at"),
                        "positionsLastRefresh": snap_meta.get("positionsLastRefresh") or snap_meta.get("positions_refreshed_at"),
                        "summary_refreshed_at": snap_meta.get("summaryLastRefresh") or snap_meta.get("summary_refreshed_at"),
                        "summaryLastRefresh": snap_meta.get("summaryLastRefresh") or snap_meta.get("summary_refreshed_at"),
                        "trades_refreshed_at": snap_meta.get("trades_refreshed_at"),
                        "is_live": False,
                        "is_stale": snap_stale,
                        "stale_reason": "Saved snapshot is stale." if snap_stale else str(live_exc),
                        "fallback_active": True,
                        "fallback_reason": "Live fetch failed; using last saved snapshot.",
                        "quotes_stale": not snap_prices_live,
                        "quotes_stale_reason": None if snap_prices_live else "Live fetch failed; using last saved snapshot.",
                    }
                return {
                    "source": "NO_DATA",
                    "mode": "no-data",
                    "as_of": None,
                    "account_id": None,
                    "positions": [],
                    "summary": {
                        "source": "NO_DATA",
                        "mode": "no-data",
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
                        "stale_reason": "Client Portal Gateway is unavailable and no saved snapshot exists.",
                        "pricesLive": False,
                        "pricesLastRefresh": None,
                        "pricesAgeSeconds": None,
                        "positionsLastRefresh": None,
                        "summaryLastRefresh": None,
                    },
                    "trades": [],
                    "snapshot_timestamp": None,
                    "snapshot_available": False,
                    "heartbeat": heartbeat,
                    "refreshed_at": None,
                    "lastRefresh": None,
                    "nextRefresh": None,
                    "pricesLive": False,
                    "pricesLastRefresh": None,
                    "pricesAgeSeconds": None,
                    "isLiveUpdating": False,
                    "positions_refreshed_at": None,
                    "positionsLastRefresh": None,
                    "summary_refreshed_at": None,
                    "summaryLastRefresh": None,
                    "trades_refreshed_at": None,
                    "is_live": False,
                    "is_stale": True,
                    "stale_reason": "Client Portal Gateway is unavailable and no saved snapshot exists.",
                    "fallback_active": False,
                    "fallback_reason": "Client Portal Gateway is unavailable and no saved snapshot exists.",
                    "quotes_stale": True,
                    "quotes_stale_reason": "Client Portal Gateway is unavailable and no saved snapshot exists.",
                }
        if _snapshot_available():
            snapshot = SnapshotPortfolioProvider()
            bundle = snapshot._load_bundle()
            snap_meta = bundle.get("meta", {})
            snap_stale = _is_snapshot_stale(snap_meta)
            as_of = bundle.get("summary", {}).get("as_of") or snap_meta.get("snapshot_timestamp") or datetime.now(timezone.utc).isoformat()
            return {
                "source": "LAST_UPDATE",
                "mode": "last-update",
                "as_of": as_of,
                "account_id": snap_meta.get("account_id"),
                "positions": bundle.get("positions", []),
                "summary": bundle.get("summary", {}),
                "trades": bundle.get("trades", []),
                "snapshot_timestamp": snap_meta.get("snapshot_timestamp") or snap_meta.get("as_of"),
                "snapshot_available": True,
                "heartbeat": heartbeat,
                "refreshed_at": as_of,
                "lastRefresh": as_of,
                "nextRefresh": None,
                "pricesLive": bool(snap_meta.get("pricesLive", False)) and not snap_stale,
                "pricesLastRefresh": snap_meta.get("pricesLastRefresh") or snap_meta.get("lastRefresh") or snap_meta.get("snapshot_timestamp"),
                "pricesAgeSeconds": snap_meta.get("pricesAgeSeconds"),
                "isLiveUpdating": bool(snap_meta.get("isLiveUpdating", False)) and not snap_stale,
                "positions_refreshed_at": snap_meta.get("positionsLastRefresh") or snap_meta.get("positions_refreshed_at"),
                "positionsLastRefresh": snap_meta.get("positionsLastRefresh") or snap_meta.get("positions_refreshed_at"),
                "summary_refreshed_at": snap_meta.get("summaryLastRefresh") or snap_meta.get("summary_refreshed_at"),
                "summaryLastRefresh": snap_meta.get("summaryLastRefresh") or snap_meta.get("summary_refreshed_at"),
                "trades_refreshed_at": snap_meta.get("trades_refreshed_at"),
                "is_live": False,
                "is_stale": snap_stale,
                "stale_reason": "Saved snapshot is stale." if snap_stale else "Live cache warming; using last saved snapshot.",
                "fallback_active": True,
                "fallback_reason": "Live cache warming; using last saved snapshot.",
                "quotes_stale": not bool(snap_meta.get("pricesLive", False)) or snap_stale,
                "quotes_stale_reason": None if bool(snap_meta.get("pricesLive", False)) and not snap_stale else "Live cache warming; using last saved snapshot.",
            }
        return {
            "source": "NO_DATA",
            "mode": "no-data",
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
                "source": "NO_DATA",
                "mode": "no-data",
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
            base_sym = re.split(r"\s+", sym)[0] if is_opt and sym else sym
            option_meta = _option_metadata(contract_desc, fallback_symbol=base_sym or sym)
            multiplier = _num(p.get("multiplier") or (100 if is_opt else 1), 100 if is_opt else 1)
            # IBKR avgCost is already per-contract (avgPrice × multiplier for options).
            # Do NOT multiply by multiplier again — that would be 100× overstatement.
            cost_basis = round(avg_cost * qty if qty else 0, 2)
            position_symbol = option_meta.get("underlying") or base_sym or sym or contract_desc
            day_metrics = _derive_day_metrics(
                last=last,
                previous_close=prev_close,
                quantity=qty,
                multiplier=multiplier,
                official_day_change=_maybe_num(p.get("changeDay") or p.get("dayChange") or p.get("change")),
                official_day_change_pct=_maybe_num(p.get("pctChangeDay") or p.get("changePercentDay") or p.get("dayChangePct")),
            )
            ai_snapshot = _cached_ai_technical_snapshot(position_symbol or contract_desc or sym)
            ai_technical = ai_snapshot.get("technicalIndicators") or {}
            ai_updated_at = ai_snapshot.get("updatedAt") or ai_snapshot.get("cachedAt") or ai_snapshot.get("asOf")
            momentum_score = _maybe_num(ai_technical.get("momentumScore"))
            risk_score = _maybe_num(ai_technical.get("riskScore"))
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
                "previousClose": round(prev_close, 4) if prev_close is not None else None,
                "prevClose": round(prev_close, 4) if prev_close is not None else None,
                "day_change_pct": day_metrics["day_change_pct"],
                "day_change": day_metrics["day_change"],
                "day_pnl": day_metrics["day_pnl"],
                "day_pnl_pct": day_metrics["day_pnl_pct"],
                "market_value": round(mv, 2),
                "cost_basis": cost_basis,
                "unrealized": round(unr, 2),
                "realized": round(real, 2),
                "unrealized_pct": round(unr / cost_basis * 100, 2) if cost_basis else 0,
                "risk": risk_score,
                "risk_source": "AI_INTELLIGENCE_CACHE" if risk_score is not None else "missing",
                "risk_is_placeholder": risk_score is None,
                "risk_last_updated": ai_updated_at if risk_score is not None else None,
                "brand": "#3B82F6",
                "accent": "#60A5FA",
                "logo": (base_sym or sym)[:2],
                "momentum_score": momentum_score,
                "momentum_source": "AI_INTELLIGENCE_CACHE" if momentum_score is not None else "missing",
                "momentum_is_placeholder": momentum_score is None,
                "momentum_last_updated": ai_updated_at if momentum_score is not None else None,
                "news_score": None,
                "news_score_source": "missing",
                "news_score_is_placeholder": True,
                "macro_sensitivity": 75,
                "ai_view": "Live IBKR position",
                "currency": p.get("currency", "USD"),
                "multiplier": multiplier,
                "quoteLastRefresh": None,
                "quoteAgeSeconds": None,
                "quoteSource": "POSITION_ENDPOINT",
                "quoteStale": True,
                "quoteStaleReason": "Awaiting market data snapshot.",
                "placeholder_scores": momentum_score is None or risk_score is None,
                "scores_are_placeholders": momentum_score is None or risk_score is None,
                "score_status": "missing" if momentum_score is None or risk_score is None else "available",
                "metrics_source": "AI_INTELLIGENCE_CACHE" if (momentum_score is not None or risk_score is not None) else "missing",
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
        ibkr_nlv = _amt("netliquidation")
        # Prefer IBKR's reported NLV — it accounts for all assets (cash equivalents, T-bills,
        # bonds, accrued interest, pending settlements, margin) that are not in the positions list.
        # Using cash + position market values undercount by ~30K in typical portfolios.
        computed_total = round(cash + total_market_value, 2) if (total_market_value or cash) else 0.0
        total_value = ibkr_nlv if ibkr_nlv > 0 else (computed_total or total_market_value)
        currency = "USD"
        for key in ("netliquidation", "availablefunds", "buyingpower"):
            node = raw.get(key, {})
            if isinstance(node, dict) and node.get("currency"):
                currency = node["currency"]
                break
        total_cb_values = [_maybe_num(p.get("cost_basis")) for p in positions if p.get("cost_basis") is not None]
        total_unr_values = [_maybe_num(p.get("unrealized")) for p in positions if p.get("unrealized") is not None]
        total_daily_pnl_values = [_maybe_num(p.get("day_pnl")) for p in positions if p.get("day_pnl") is not None]
        total_previous_market_value_values = [_maybe_num(p.get("previous_market_value")) for p in positions if p.get("previous_market_value") is not None]
        total_cb = round(sum(total_cb_values), 2) if total_cb_values else None
        total_unr = round(sum(total_unr_values), 2) if total_unr_values else None
        total_daily_pnl = round(sum(total_daily_pnl_values), 2) if total_daily_pnl_values else None
        total_previous_market_value = round(sum(total_previous_market_value_values), 2) if total_previous_market_value_values else None
        daily_pnl = None
        daily_pnl_pct = None
        daily_pnl_source = None
        if pnl:
            daily_pnl = pnl.get("daily_pnl")
            daily_pnl_pct = pnl.get("daily_pnl_pct")
            daily_pnl_source = "pnl_endpoint"
        if positions:
            daily_pnl = total_daily_pnl
            daily_pnl_source = "positions"
        elif daily_pnl is None:
            field_pnl = _field("dailyPnl", "dailyPnL", "dayPnl", "dayPnL", "pnl", "daily_pnl", "dailyProfitLoss")
            daily_pnl = field_pnl
            daily_pnl_source = "summary_field" if field_pnl is not None else "missing"
        if daily_pnl_pct is None and daily_pnl is not None:
            previous_portfolio_value = total_previous_market_value if total_previous_market_value not in (None, 0) else _field("previousNetLiquidation", "prevNetLiquidation", "priorNetLiquidation")
            if previous_portfolio_value in (None, 0) and total_value is not None and daily_pnl is not None:
                previous_portfolio_value = total_value - daily_pnl
            if previous_portfolio_value not in (None, 0):
                daily_pnl_pct = round((daily_pnl / previous_portfolio_value) * 100, 2)
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
            "unrealized": round(total_unr, 2) if total_unr is not None else None,
            "unrealized_pct": round(total_unr / total_cb * 100, 2) if total_cb not in (None, 0) and total_unr is not None else None,
            "positions_count": len(positions),
            "lastRefresh": datetime.now(timezone.utc).isoformat(),
            "nextRefresh": (datetime.now(timezone.utc) + timedelta(seconds=self._CACHE_TTL_SECONDS)).isoformat(),
            "isLiveUpdating": bool(prices_live),
            "pricesLive": bool(prices_live),
            "pricesLastRefresh": prices_last_refresh,
            "pricesAgeSeconds": _position_quote_refresh_age(prices_last_refresh) if prices_last_refresh else None,
            "positionsLastRefresh": positions_last_refresh,
            "summaryLastRefresh": datetime.now(timezone.utc).isoformat(),
            "calculationProvenance": {
                "daily_pnl": {
                    "formula": "sum(position.day_pnl)",
                    "value": round(daily_pnl, 2) if daily_pnl is not None else None,
                    "source": daily_pnl_source or ("positions" if positions else "summary_field"),
                    "position_count": len(positions),
                    "pnl_endpoint_value": _maybe_num(pnl.get("daily_pnl")) if pnl else None,
                },
                "daily_pnl_pct": {
                    "formula": "daily_pnl / previous_portfolio_value * 100",
                    "value": round(daily_pnl_pct, 2) if daily_pnl_pct is not None else None,
                    "previous_portfolio_value": total_previous_market_value if total_previous_market_value not in (None, 0) else _field("previousNetLiquidation", "prevNetLiquidation", "priorNetLiquidation"),
                },
                "unrealized": {
                    "formula": "sum(position.unrealized)",
                    "value": round(total_unr, 2) if total_unr is not None else None,
                    "source": "positions",
                },
                "unrealized_pct": {
                    "formula": "unrealized / cost_basis * 100",
                    "value": round(total_unr / total_cb * 100, 2) if total_cb not in (None, 0) and total_unr is not None else None,
                    "source": "positions",
                },
            },
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

    def _persist_live_snapshot(self, bundle: Dict[str, Any], *, force: bool = False, refresh_status: str = "ok", refresh_error: Optional[str] = None) -> bool:
        total_value = _num((bundle.get("summary") or {}).get("total_value"))
        cash = _num((bundle.get("summary") or {}).get("cash"))
        unrealized = _num((bundle.get("summary") or {}).get("unrealized"))
        net_liquidation = _num((bundle.get("summary") or {}).get("net_liquidation") or (bundle.get("summary") or {}).get("total_value"))
        attempt_at = bundle.get("snapshot_timestamp") or bundle.get("as_of") or datetime.now(timezone.utc).isoformat()
        current_bundle = _load_snapshot_bundle()
        current_meta = current_bundle.get("meta_payload") if isinstance(current_bundle.get("meta_payload"), dict) else {}
        current_state = _load_snapshot_state()
        valid, invalid_reason = _snapshot_bundle_is_valid(bundle)
        snapshot_available_before = _snapshot_available()
        should_persist = bool(valid and (_snapshot_refresh_is_due(current_meta, force=force) or not snapshot_available_before))
        candidate_timestamp = bundle.get("snapshot_timestamp") or bundle.get("as_of") or attempt_at
        persisted_timestamp = _snapshot_timestamp(current_meta) or current_state.get("snapshotTimestamp")
        snapshot_timestamp = candidate_timestamp if should_persist else persisted_timestamp
        positions_count = len(bundle.get("positions", [])) if isinstance(bundle.get("positions"), list) else 0
        state_payload = {
            "schemaVersion": _SNAPSHOT_SCHEMA_VERSION,
            "source": bundle.get("source", "IBKR_LIVE") if should_persist else (current_meta.get("source") or current_state.get("source") or "IBKR_LIVE"),
            "snapshotAvailable": bool(snapshot_available_before or should_persist),
            "snapshotTimestamp": snapshot_timestamp,
            "snapshotAgeSeconds": 0.0 if should_persist else (_snapshot_age_seconds(current_meta) if current_meta else current_state.get("snapshotAgeSeconds")),
            "positionsCount": positions_count if should_persist else int(current_meta.get("positions_count") or current_state.get("positionsCount") or 0),
            "lastRefreshAttempt": attempt_at,
            "lastRefreshStatus": "ok" if valid else "failed",
            "lastRefreshError": None if valid else (refresh_error or invalid_reason),
            "snapshotValid": bool(valid or current_state.get("snapshotValid", False)),
            "snapshotPersisted": bool(should_persist),
            "refreshIntervalSeconds": _SNAPSHOT_REFRESH_INTERVAL_SECONDS,
        }
        if valid and should_persist:
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
                "schemaVersion": _SNAPSHOT_SCHEMA_VERSION,
                "snapshot_valid": True,
                "source": bundle.get("source", "IBKR_LIVE"),
                "mode": bundle.get("mode", "ibkr-live"),
                "snapshot_timestamp": snapshot_timestamp,
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
                "lastRefreshAttempt": attempt_at,
                "lastRefreshStatus": "ok",
                "lastRefreshError": None,
                "snapshotPersisted": True,
                "snapshotRefreshStatus": "ok",
            }
            _save_snapshot_bundle({
                "positions_payload": positions_payload,
                "summary_payload": {"summary": summary_payload},
                "trades_payload": {"trades": trades_payload["trades"], "source": trades_payload["source"], "mode": trades_payload["mode"], "as_of": trades_payload["as_of"]},
                "meta_payload": meta_payload,
                "state_payload": state_payload,
            })
            _append_snapshot_history(
                {
                    "timestamp": snapshot_timestamp,
                    "total_value": round(total_value, 2),
                    "cash": round(cash, 2),
                    "unrealized": round(unrealized, 2),
                    "net_liquidation": round(net_liquidation, 2),
                    "pricesLive": bundle.get("pricesLive"),
                    "pricesLastRefresh": bundle.get("pricesLastRefresh"),
                }
            )
            marker = "SNAPSHOT_REFRESH" if snapshot_available_before else "SNAPSHOT_SAVE"
            _IBKR_LOGGER.info(
                "[%s] timestamp=%s portfolio_value=%s positions=%s account=%s",
                marker,
                snapshot_timestamp,
                round(total_value, 2),
                positions_count,
                bundle.get("account_id"),
            )
            return True

        state_payload["snapshotPersisted"] = False
        if valid:
            state_payload["lastRefreshStatus"] = "ok"
            state_payload["lastRefreshError"] = None
            state_payload["snapshotRefreshStatus"] = "skipped"
        else:
            state_payload["snapshotRefreshStatus"] = "rejected"
            _IBKR_LOGGER.warning(
                "[SNAPSHOT_REJECTED] reason=%s preserved_timestamp=%s preserved_positions=%s candidate_positions=%s candidate_value=%s",
                refresh_error or invalid_reason,
                persisted_timestamp,
                state_payload["positionsCount"],
                positions_count,
                total_value,
            )
        _write_snapshot_state({**current_state, **state_payload})
        return False

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
        snapshot_state = self.get_snapshot_state()
        total_value = summary.get("total_value", 0) or sum(p.get("market_value", 0) for p in positions)
        for p in positions:
            p["portfolio_pct"] = round(p.get("market_value", 0) / total_value * 100, 2) if total_value else 0
        macros = macro_snapshot()
        total_cb = sum(p.get("cost_basis", 0) for p in positions)
        total_unr = sum(p.get("unrealized", 0) for p in positions)
        # Use the bundle's actual source — _load_bundle() may fall back to snapshot
        # mid-request (gateway went offline between heartbeat check and data fetch).
        bundle_source = bundle.get("source", "IBKR_LIVE")
        bundle_mode = bundle.get("mode", "ibkr-live")
        is_live_source = bundle_source == "IBKR_LIVE"
        _IBKR_LOGGER.debug(
            "[LIFECYCLE] get_portfolio bundle_source=%s is_live=%s positions=%s value=%s",
            bundle_source, is_live_source, len(positions), round(total_value, 2),
        )
        return {
            "source": bundle_source,
            "mode": bundle_mode,
            "as_of": bundle["as_of"],
            "snapshot_available": bool(bundle.get("snapshot_available", True)),
            "snapshot_timestamp": bundle.get("snapshot_timestamp"),
            "snapshotAvailable": bool(bundle.get("snapshot_available", True)),
            "snapshotTimestamp": bundle.get("snapshot_timestamp"),
            "snapshotAgeSeconds": snapshot_state.get("snapshotAgeSeconds"),
            "snapshotRefreshStatus": snapshot_state.get("lastRefreshStatus"),
            "snapshotLastRefreshAttempt": snapshot_state.get("lastRefreshAttempt"),
            "snapshotLastRefreshError": snapshot_state.get("lastRefreshError"),
            "snapshotSchemaVersion": snapshot_state.get("schemaVersion"),
            "lastRefresh": bundle.get("lastRefresh") or bundle.get("refreshed_at") or bundle.get("as_of"),
            "nextRefresh": bundle.get("nextRefresh"),
            "isLiveUpdating": bundle.get("isLiveUpdating", is_live_source),
            "fallback_active": bundle.get("fallback_active", not is_live_source),
            "fallback_reason": bundle.get("fallback_reason"),
            "pricesLive": bundle.get("pricesLive"),
            "pricesLastRefresh": bundle.get("pricesLastRefresh"),
            "pricesAgeSeconds": bundle.get("pricesAgeSeconds"),
            "positionsLastRefresh": bundle.get("positionsLastRefresh") or bundle.get("positions_refreshed_at"),
            "summaryLastRefresh": bundle.get("summaryLastRefresh") or bundle.get("summary_refreshed_at"),
            "is_live": bundle.get("is_live", is_live_source),
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
            "risk_mode": "IBKR LIVE" if is_live_source else "LAST UPDATE",
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
        state = _load_snapshot_state()
        snapshot_state = _snapshot_state_from_meta(meta, state_payload=state)
        meta.update(
            {
                "schemaVersion": snapshot_state.get("schemaVersion", _SNAPSHOT_SCHEMA_VERSION),
                "source": bundle.get("source", "IBKR_LIVE"),
                "mode": bundle.get("mode", "ibkr-live"),
                "snapshot_timestamp": bundle.get("snapshot_timestamp") or bundle.get("as_of"),
                "as_of": bundle.get("as_of"),
                "snapshot_valid": bool(snapshot_state.get("snapshotValid", True)),
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
                "lastRefreshAttempt": snapshot_state.get("lastRefreshAttempt"),
                "lastRefreshStatus": snapshot_state.get("lastRefreshStatus"),
                "lastRefreshError": snapshot_state.get("lastRefreshError"),
                "snapshotPersisted": snapshot_state.get("snapshotPersisted"),
            }
        )
        return meta

    def get_snapshot_state(self) -> Dict[str, Any]:
        bundle = self._load_bundle()
        meta = _load_snapshot_bundle()["meta_payload"] or {}
        state = _load_snapshot_state()
        snapshot_state = _snapshot_state_from_meta(meta, state_payload=state)
        snapshot_state.update(
            {
                "source": bundle.get("source", "IBKR_LIVE"),
                "snapshotAvailable": bool(bundle.get("snapshot_available", _snapshot_available())),
                "snapshotTimestamp": bundle.get("snapshot_timestamp") or bundle.get("as_of") or snapshot_state.get("snapshotTimestamp"),
                "snapshotAgeSeconds": _snapshot_age_seconds(meta) if meta else snapshot_state.get("snapshotAgeSeconds"),
                "positionsCount": len(bundle.get("positions", []) if isinstance(bundle.get("positions"), list) else []),
                "lastRefreshAttempt": state.get("lastRefreshAttempt") or snapshot_state.get("lastRefreshAttempt"),
                "lastRefreshStatus": state.get("lastRefreshStatus") or snapshot_state.get("lastRefreshStatus"),
                "lastRefreshError": state.get("lastRefreshError") or snapshot_state.get("lastRefreshError"),
                "schemaVersion": int(state.get("schemaVersion") or snapshot_state.get("schemaVersion") or _SNAPSHOT_SCHEMA_VERSION),
            }
        )
        return snapshot_state

    def refresh_snapshot(self, force: bool = False) -> Dict[str, Any]:
        return self._fetch_live_bundle(force_snapshot=force)

    def get_live_quote_trace(self, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        return get_live_quote_trace(limit=limit)


# ─── Provider Factory ─────────────────────────────────────────────────────────


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
    if mode == "ibkr-live":
        prime_ibkr_snapshot(force=True)
    return mode


def prime_ibkr_snapshot(*, force: bool = False, respect_mode: bool = True) -> Dict[str, Any]:
    """Warm the live snapshot cache without blocking the caller."""
    result: Dict[str, Any] = {"ok": False, "skipped": True, "reason": "Live provider not active."}
    try:
        resolution = resolve_portfolio_provider()
        provider = resolution.provider
        if not isinstance(provider, IbkrLivePortfolioProvider):
            if not respect_mode:
                live_provider = IbkrLivePortfolioProvider()
                if not live_provider.get_gateway_heartbeat().get("gateway_open"):
                    return {"ok": False, "skipped": True, "reason": "Client Portal Gateway is unavailable."}
                provider = live_provider
            else:
                return result
        bundle = provider.refresh_snapshot(force=force)
        result = {
            "ok": True,
            "skipped": False,
            "source": bundle.get("source"),
            "mode": bundle.get("mode"),
            "snapshot_timestamp": bundle.get("snapshot_timestamp") or bundle.get("as_of"),
            "positions_count": len(bundle.get("positions", [])),
            "pricesLastRefresh": bundle.get("pricesLastRefresh"),
            "pricesLive": bool(bundle.get("pricesLive")),
        }
    except Exception as exc:
        result = {"ok": False, "skipped": False, "reason": str(exc)}
    return result


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
    """Resolve Live IBKR -> valid snapshot -> demo for the production lifecycle."""
    _t0 = time.monotonic()
    mode = get_data_source_mode()
    snapshot = SnapshotPortfolioProvider()
    snapshot_available = snapshot.is_available()
    snapshot_meta = snapshot.get_snapshot_meta() if snapshot_available else {}
    snapshot_timestamp = _snapshot_timestamp(snapshot_meta)
    snapshot_stale = _is_snapshot_stale(snapshot_meta) if snapshot_available else False

    def resolved(value: ProviderResolution) -> ProviderResolution:
        duration_ms = (time.monotonic() - _t0) * 1000
        return _record_provider_resolution(value, switch_duration_ms=duration_ms)

    if mode == "mock":
        mock = MockPortfolioProvider()
        return resolved(ProviderResolution(
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
        ))

    if mode == "last-update":
        if snapshot_available:
            return resolved(ProviderResolution(
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
            ))
        mock = MockPortfolioProvider()
        return resolved(ProviderResolution(
            provider=mock,
            configured_mode=mode,
            active_source=mock.source_name,
            fallback_active=True,
            fallback_reason="No valid saved IBKR snapshot; using demo portfolio.",
            provider_class=mock.__class__.__name__,
            snapshot_available=False,
            snapshot_timestamp=None,
            is_live=False,
            is_stale=False,
            stale_reason=None,
        ))

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
            return resolved(ProviderResolution(
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
            ))
        if snapshot_available:
            return resolved(ProviderResolution(
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
            ))
        mock = MockPortfolioProvider()
        return resolved(ProviderResolution(
            provider=mock,
            configured_mode=mode,
            active_source=mock.source_name,
            fallback_active=True,
            fallback_reason="Client Portal Gateway unavailable and no valid snapshot exists; using demo portfolio.",
            provider_class=mock.__class__.__name__,
            snapshot_available=False,
            snapshot_timestamp=None,
            is_live=False,
            is_stale=False,
            stale_reason=None,
            **diagnostics,
        ))

    mock = MockPortfolioProvider()
    return resolved(ProviderResolution(
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
    ))


def get_active_provider():
    """Return the resolved active provider."""
    return resolve_portfolio_provider().provider


def get_provider_status() -> Dict[str, Any]:
    """Return provider status info for API consumers."""
    resolution = resolve_portfolio_provider()
    provider_meta: Dict[str, Any] = {}
    try:
        provider = resolution.provider
        if hasattr(provider, "get_runtime_status"):
            runtime_status = provider.get_runtime_status() or {}
            if isinstance(runtime_status, dict):
                provider_meta = dict(runtime_status)
        if not provider_meta:
            raw_portfolio: Dict[str, Any] = {}
            if hasattr(provider, "get_portfolio"):
                raw_portfolio = provider.get_portfolio() or {}
            elif hasattr(provider, "get_summary"):
                raw_portfolio = {"summary": provider.get_summary() or {}}
            helper = IbkrLivePortfolioProvider.__new__(IbkrLivePortfolioProvider)
            if isinstance(raw_portfolio, dict):
                if resolution.configured_mode == "mock":
                    provider_meta = dict(raw_portfolio.get("summary") or raw_portfolio)
                else:
                    portfolio_payload = helper._normalize_portfolio_after_price_overlay(raw_portfolio, resolution=resolution)
                    provider_meta = dict(portfolio_payload.get("summary") or portfolio_payload)
    except Exception:
        provider_meta = {}
    mode = resolution.configured_mode
    snapshot_available = bool(provider_meta.get("snapshot_available", resolution.snapshot_available))
    fallback_active = bool(resolution.fallback_active or provider_meta.get("fallback_active"))
    gateway_status = provider_meta.get("gateway_status") or resolution.gateway_status
    gateway_error = provider_meta.get("gateway_error") or resolution.gateway_error
    gateway_open = bool(provider_meta.get("gateway_open", resolution.ibkr_gateway_reachable and resolution.ibkr_authenticated))
    portfolio_mode = provider_meta.get("portfolioMode") or provider_meta.get("mode")
    if resolution.active_source == "IBKR_LIVE":
        portfolio_mode = "IBKR_LIVE"
    elif resolution.active_source == "LAST_UPDATE":
        portfolio_mode = "LAST_UPDATE_ONLY"
    elif resolution.active_source == "MOCK":
        portfolio_mode = "MOCK"
    portfolio_mode = portfolio_mode or mode.upper().replace("-", "_")
    positions_source = provider_meta.get("positionsSource") or (
        "IBKR_LIVE" if resolution.active_source == "IBKR_LIVE" else (
            "IBKR_LAST_UPDATE" if resolution.active_source == "LAST_UPDATE" else "MOCK"
        )
    )
    prices_live = bool(provider_meta.get("pricesLive"))
    price_source = provider_meta.get("priceSource") or (
        "IBKR_LIVE" if resolution.active_source == "IBKR_LIVE" and prices_live else (
            "STALE" if resolution.active_source == "LAST_UPDATE" else "MOCK"
        )
    )
    if portfolio_mode == "IBKR_LIVE" and provider_meta.get("isLivePricing", True):
        status = "LIVE"
        message = "Live IBKR Client Portal Gateway is available."
    elif portfolio_mode == "IBKR_LIVE":
        status = "FALLBACK"
        message = provider_meta.get("fallback_reason") or "IBKR positions are live, but quote data is stale or unavailable."
    elif portfolio_mode in {"HYBRID_LAST_POSITIONS_LIVE_QUOTES", "MANUAL_HOLDINGS_LIVE_QUOTES", "MANUAL_HOLDINGS"}:
        status = "FALLBACK"
        message = provider_meta.get("fallback_reason") or "Using fallback-priced manual or snapshot positions."
    elif portfolio_mode == "NO_DATA":
        status = "NO_DATA"
        message = provider_meta.get("fallback_reason") or "No portfolio data is currently available."
    elif portfolio_mode == "LAST_UPDATE_ONLY":
        status = "LAST_UPDATE"
        message = provider_meta.get("fallback_reason") or "Using saved IBKR snapshot."
    elif portfolio_mode == "MOCK":
        status = "MOCK"
        message = f"{provider_mode_label(mode)} portfolio data selected."
    elif snapshot_available:
        status = "LAST_UPDATE"
        message = provider_meta.get("fallback_reason") or "Using saved IBKR snapshot."
    else:
        status = "DISCONNECTED"
        message = provider_meta.get("fallback_reason") or "Client Portal Gateway is unavailable and no saved snapshot exists."
    return {
        "status": status,
        "message": message,
        "configured_mode": mode,
        "configured_mode_label": provider_mode_label(mode),
        "active_source": provider_meta.get("active_source") or resolution.active_source,
        "active_source_label": provider_source_label(provider_meta.get("active_source") or resolution.active_source),
        "fallback_active": fallback_active,
        "fallback_reason": provider_meta.get("fallback_reason") or resolution.fallback_reason,
        "fallback_from": provider_mode_label(mode) if fallback_active else None,
        "provider_class": resolution.provider_class,
        "gateway_url": get_ibkr_gateway_config()["configured_url"],
        "gateway_api": get_ibkr_gateway_config()["effective_url"],
        "gateway_status": gateway_status,
        "gateway_error": gateway_error,
        "gateway_open": gateway_open,
        "ibkr_gateway_reachable": bool(provider_meta.get("ibkr_gateway_reachable", resolution.ibkr_gateway_reachable)),
        "ibkr_authenticated": bool(provider_meta.get("ibkr_authenticated", resolution.ibkr_authenticated)),
        "accounts_available": resolution.accounts_available,
        "positions_available": resolution.positions_available,
        "trades_available": resolution.trades_available,
        "snapshot_available": snapshot_available,
        "snapshot_timestamp": provider_meta.get("snapshot_timestamp") or resolution.snapshot_timestamp,
        "snapshotAvailable": snapshot_available,
        "snapshotTimestamp": provider_meta.get("snapshot_timestamp") or resolution.snapshot_timestamp,
        "snapshotAgeSeconds": provider_meta.get("snapshotAgeSeconds"),
        "snapshotRefreshStatus": provider_meta.get("snapshotRefreshStatus") or provider_meta.get("lastRefreshStatus"),
        "snapshotLastRefreshAttempt": provider_meta.get("snapshotLastRefreshAttempt") or provider_meta.get("lastRefreshAttempt"),
        "snapshotLastRefreshError": provider_meta.get("snapshotLastRefreshError") or provider_meta.get("lastRefreshError"),
        "snapshotSchemaVersion": provider_meta.get("snapshotSchemaVersion") or provider_meta.get("schemaVersion"),
        "is_live": bool(provider_meta.get("is_live", resolution.is_live)),
        "is_stale": bool(provider_meta.get("is_stale", resolution.is_stale)),
        "stale_reason": provider_meta.get("stale_reason") or resolution.stale_reason,
        "portfolioMode": provider_meta.get("portfolioMode") or portfolio_mode,
        "positionsSource": positions_source,
        "priceSource": price_source,
        "activePriceProvider": provider_meta.get("activePriceProvider") or ("IBKR" if price_source == "IBKR_LIVE" else ("STALE" if price_source == "STALE" else "MOCK")),
        "activePositionProvider": provider_meta.get("activePositionProvider") or positions_source,
        "isLivePositions": bool(provider_meta.get("isLivePositions", positions_source == "IBKR_LIVE")),
        "isLivePricing": bool(provider_meta.get("isLivePricing", price_source == "IBKR_LIVE")),
        "isHybrid": bool(provider_meta.get("isHybrid", False)),
        "lastPositionsTimestamp": provider_meta.get("lastPositionsTimestamp"),
        "lastPriceTimestamp": provider_meta.get("lastPriceTimestamp"),
        "lastRefresh": provider_meta.get("lastRefresh") or provider_meta.get("refreshed_at") or resolution.snapshot_timestamp,
        "nextRefresh": provider_meta.get("nextRefresh"),
        "isLiveUpdating": bool(provider_meta.get("isLiveUpdating")) if provider_meta else bool(resolution.is_live),
        "pricesLive": prices_live if provider_meta else None,
        "pricesLastRefresh": provider_meta.get("pricesLastRefresh"),
        "pricesAgeSeconds": provider_meta.get("pricesAgeSeconds"),
        "positionsLastRefresh": provider_meta.get("positionsLastRefresh") or provider_meta.get("positions_refreshed_at"),
        "summaryLastRefresh": provider_meta.get("summaryLastRefresh") or provider_meta.get("summary_refreshed_at"),
        "mock_available": True,
    }
