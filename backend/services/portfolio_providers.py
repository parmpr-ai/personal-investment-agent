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
import urllib.request
import urllib.error
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "ibkr-live"
_GATEWAY_BASE = "https://localhost:5000/v1/api"
_PROVIDER_MODES = ("mock", "demo", "ibkr-live")
_ACTIVE_SOURCE_MAP = {"mock": "MOCK", "demo": "DEMO_SAMPLE", "ibkr-live": "IBKR_LIVE"}
_MODE_LABELS = {"mock": "Mock", "demo": "Demo Samples", "ibkr-live": "Live IBKR"}
_SOURCE_LABELS = {"MOCK": "Mock", "MOCK_FALLBACK": "Mock", "DEMO_SAMPLE": "Demo Samples", "IBKR_LIVE": "Live IBKR"}
_LIVE_MODE_ALIASES = {"live", "client_portal_gateway", "ibkr-live"}


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
    demo_sample_available: bool = False


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

class DemoSamplePortfolioProvider:
    source_name = "DEMO_SAMPLE"

    def is_available(self) -> bool:
        return (_DATA_DIR / "positions.sample.json").exists()

    def _load_json(self, filename: str) -> Any:
        path = _DATA_DIR / filename
        if not path.exists():
            return None
        with open(path, encoding="utf-8") as f:
            return json.load(f)

    def get_positions(self) -> List[Dict]:
        raw = self._load_json("positions.sample.json") or []
        total_mv = sum(_num(p.get("marketValue")) for p in raw)
        positions = []
        for p in raw:
            sym = p.get("symbol", "")
            asset_class = (p.get("assetClass") or "STK").upper()
            is_opt = asset_class == "OPT"
            qty = _num(p.get("position", 0))
            avg_price = _num(p.get("avgPrice"))
            avg_cost = _num(p.get("avgCost") or p.get("avgPrice"))
            mv = _num(p.get("marketValue"))
            unr = _num(p.get("unrealizedPnl"))
            real = _num(p.get("realizedPnl"))
            cost_basis = round(avg_cost * qty * (100 if is_opt else 1), 2)
            unr_pct = round(unr / cost_basis * 100, 2) if cost_basis else 0
            base_sym = re.split(r"\s+", sym)[0] if is_opt else sym
            positions.append({
                "symbol": sym,
                "underlying": base_sym,
                "sec_type": asset_class,
                "name": sym,
                "sector": "Options" if is_opt else "Stock",
                "qty": qty,
                "avg_price": round(avg_price, 4),
                "last": round(_num(p.get("marketPrice")), 4),
                "day_change_pct": 0,
                "day_change": 0,
                "market_value": round(mv, 2),
                "cost_basis": cost_basis,
                "unrealized": round(unr, 2),
                "realized": round(real, 2),
                "unrealized_pct": unr_pct,
                "portfolio_pct": round(mv / total_mv * 100, 2) if total_mv else 0,
                "risk": 90 if is_opt else 70,
                "brand": "#3B82F6",
                "accent": "#60A5FA",
                "logo": base_sym[:2],
                "momentum_score": 55,
                "news_score": 50,
                "macro_sensitivity": 75,
                "ai_view": "Sample IBKR position",
                "currency": p.get("currency", "USD"),
            })
        return positions

    def get_summary(self) -> Dict[str, Any]:
        raw = self._load_json("summary.sample.json") or {}

        def _amt(key: str) -> float:
            node = raw.get(key, {})
            return _num(node.get("amount") if isinstance(node, dict) else node)

        currency = "EUR"
        for key in ("netliquidation", "availablefunds", "buyingpower"):
            node = raw.get(key, {})
            if isinstance(node, dict) and node.get("currency"):
                currency = node["currency"]
                break
        return {
            "source": "DEMO_SAMPLE",
            "total_value": round(_amt("netliquidation"), 2),
            "cash": round(_amt("totalcashvalue"), 2),
            "buying_power": round(_amt("buyingpower"), 2),
            "available_funds": round(_amt("availablefunds"), 2),
            "maint_margin_req": round(_amt("maintmarginreq"), 2),
            "init_margin_req": round(_amt("initmarginreq"), 2),
            "excess_liquidity": round(_amt("excessliquidity"), 2),
            "gross_position_value": round(_amt("grosspositionvalue"), 2),
            "currency": currency,
            "daily_pnl": 0,
            "unrealized": 0,
        }

    def get_trades(self) -> List[Dict]:
        raw = self._load_json("trades.sample.json") or []
        trades = []
        for t in raw:
            sym = t.get("symbol", "")
            qty = t.get("quantity")
            trades.append({
                "symbol": sym,
                "side": _normalize_side(t.get("side", "")),
                "quantity": _num(qty) if qty is not None else None,
                "price": _num(t.get("price")),
                "currency": t.get("currency") or "USD",
                "trade_time": _parse_trade_time(t.get("tradeTime", "")),
                "exchange": t.get("exchange", ""),
                "commission": _num(t.get("commission")) if t.get("commission") is not None else None,
            })
        return trades

    def get_portfolio(self) -> Dict[str, Any]:
        from services.state import compute_exposures, risk_doctor, today_actions, stress_tests, macro_snapshot
        positions = self.get_positions()
        summary = self.get_summary()
        total_value = summary.get("total_value", 0) or sum(p.get("market_value", 0) for p in positions)
        for p in positions:
            p["portfolio_pct"] = round(p.get("market_value", 0) / total_value * 100, 2) if total_value else 0
        macros = macro_snapshot()
        total_cb = sum(p.get("cost_basis", 0) for p in positions)
        total_unr = sum(p.get("unrealized", 0) for p in positions)
        return {
            "source": "DEMO_SAMPLE",
            "as_of": datetime.now(timezone.utc).isoformat(),
            "total_value": round(total_value, 2),
            "cost_basis": round(total_cb, 2),
            "daily_pnl": summary.get("daily_pnl", 0),
            "daily_pnl_pct": 0,
            "unrealized": round(total_unr, 2),
            "unrealized_pct": round(total_unr / total_cb * 100, 2) if total_cb else 0,
            "cash": summary.get("cash", 0),
            "buying_power": summary.get("buying_power", 0),
            "margin_used": round(summary.get("maint_margin_req", 0) / total_value * 100, 2) if total_value else 0,
            "risk_mode": "SAMPLE DATA",
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

    def get_positions(self) -> List[Dict]:
        account_id = self._get_account_id()
        if not account_id:
            raise RuntimeError("IBKR: could not resolve account ID")
        raw = self._get(f"/portfolio/{account_id}/positions/0", timeout=8.0)
        if not isinstance(raw, list):
            return []
        total_mv = sum(_num(p.get("mktValue") or p.get("marketValue")) for p in raw)
        positions = []
        for p in raw:
            sym = p.get("ticker") or p.get("symbol", "")
            asset_class = (p.get("assetClass") or p.get("instrumentType") or "STK").upper()
            is_opt = asset_class == "OPT"
            qty = _num(p.get("position") or p.get("quantity"))
            avg_price = _num(p.get("avgPrice") or p.get("averageCost"))
            avg_cost = _num(p.get("avgCost") or p.get("averageCost") or avg_price)
            mv = _num(p.get("mktValue") or p.get("marketValue"))
            unr = _num(p.get("unrealizedPnl") or p.get("unrealPnl"))
            real = _num(p.get("realizedPnl") or p.get("realPnl"))
            cost_basis = round(avg_cost * qty * (100 if is_opt else 1), 2)
            unr_pct = round(unr / cost_basis * 100, 2) if cost_basis else 0
            base_sym = re.split(r"\s+", sym)[0] if is_opt else sym
            positions.append({
                "symbol": sym,
                "underlying": base_sym,
                "sec_type": asset_class,
                "name": p.get("name") or sym,
                "sector": "Options" if is_opt else "Stock",
                "qty": qty,
                "avg_price": round(avg_price, 4),
                "last": round(_num(p.get("mktPrice") or p.get("lastPrice")), 4),
                "day_change_pct": _num(p.get("pctChangeDay") or p.get("changePercentDay")),
                "day_change": _num(p.get("changeDay") or p.get("change")),
                "market_value": round(mv, 2),
                "cost_basis": cost_basis,
                "unrealized": round(unr, 2),
                "realized": round(real, 2),
                "unrealized_pct": unr_pct,
                "portfolio_pct": round(mv / total_mv * 100, 2) if total_mv else 0,
                "risk": 90 if is_opt else 70,
                "brand": "#3B82F6",
                "accent": "#60A5FA",
                "logo": base_sym[:2],
                "momentum_score": 55,
                "news_score": 50,
                "macro_sensitivity": 75,
                "ai_view": "Live IBKR position",
                "currency": p.get("currency", "USD"),
            })
        return positions

    def get_summary(self) -> Dict[str, Any]:
        account_id = self._get_account_id()
        if not account_id:
            raise RuntimeError("IBKR: could not resolve account ID")
        raw = self._get(f"/portfolio/{account_id}/summary", timeout=8.0)

        def _amt(key: str) -> float:
            node = raw.get(key, {})
            return _num(node.get("amount") if isinstance(node, dict) else node)

        currency = "USD"
        for key in ("netliquidation", "availablefunds", "buyingpower"):
            node = raw.get(key, {})
            if isinstance(node, dict) and node.get("currency"):
                currency = node["currency"]
                break
        return {
            "source": "IBKR_LIVE",
            "total_value": round(_amt("netliquidation"), 2),
            "cash": round(_amt("totalcashvalue"), 2),
            "buying_power": round(_amt("buyingpower"), 2),
            "available_funds": round(_amt("availablefunds"), 2),
            "maint_margin_req": round(_amt("maintmarginreq"), 2),
            "init_margin_req": round(_amt("initmarginreq"), 2),
            "excess_liquidity": round(_amt("excessliquidity"), 2),
            "gross_position_value": round(_amt("grosspositionvalue"), 2),
            "currency": currency,
            "daily_pnl": 0,
            "unrealized": 0,
        }

    def get_trades(self) -> List[Dict]:
        raw = self._get("/iserver/account/trades", timeout=8.0)
        if not isinstance(raw, list):
            return []
        trades = []
        for t in raw:
            sym = t.get("symbol") or t.get("ticker", "")
            qty = t.get("quantity") or t.get("size")
            trades.append({
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

    def get_portfolio(self) -> Dict[str, Any]:
        from services.state import compute_exposures, risk_doctor, today_actions, stress_tests, macro_snapshot
        positions = self.get_positions()
        summary = self.get_summary()
        total_value = summary.get("total_value", 0) or sum(p.get("market_value", 0) for p in positions)
        for p in positions:
            p["portfolio_pct"] = round(p.get("market_value", 0) / total_value * 100, 2) if total_value else 0
        macros = macro_snapshot()
        total_cb = sum(p.get("cost_basis", 0) for p in positions)
        total_unr = sum(p.get("unrealized", 0) for p in positions)
        return {
            "source": "IBKR_LIVE",
            "as_of": datetime.now(timezone.utc).isoformat(),
            "total_value": round(total_value, 2),
            "cost_basis": round(total_cb, 2),
            "daily_pnl": summary.get("daily_pnl", 0),
            "daily_pnl_pct": 0,
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


# ─── Provider Factory ─────────────────────────────────────────────────────────

def _normalize_mode(mode: str) -> str:
    mode = (mode or "").strip().lower()
    if mode == "client_portal_gateway" or mode in _LIVE_MODE_ALIASES:
        return "ibkr-live"
    return mode


def get_data_source_mode() -> str:
    """Resolve active mode from persisted settings, keeping IBKR live state synchronized."""
    settings, data_mode, ibkr_mode = _read_settings_mode()
    if data_mode in _PROVIDER_MODES and data_mode != "mock":
        return data_mode
    if _normalize_mode(ibkr_mode) == "ibkr-live" and bool((settings.get("ibkr") or {}).get("enabled", True)):
        return "ibkr-live"
    if data_mode in _PROVIDER_MODES:
        return data_mode
    env = os.getenv("PIA_PORTFOLIO_DATA_SOURCE", "").lower()
    if env in _PROVIDER_MODES:
        return env
    return "mock"


def set_data_source_mode(mode: str) -> str:
    """Persist mode to settings DB. Returns the resolved mode."""
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
        elif not ibkr_authenticated:
            gateway_status = "unauthenticated"
        else:
            gateway_status = "connected"
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
                    positions_available = isinstance(positions, list)
            except Exception as e:
                gateway_error = gateway_error or str(e)
            try:
                trades = provider._get("/iserver/account/trades", timeout=3.0)
                trades_available = isinstance(trades, list)
            except Exception as e:
                gateway_error = gateway_error or str(e)
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
    if mode == "demo":
        demo = DemoSamplePortfolioProvider()
        if demo.is_available():
            return ProviderResolution(
                provider=demo,
                configured_mode=mode,
                active_source=demo.source_name,
                fallback_active=False,
                fallback_reason=None,
                provider_class=demo.__class__.__name__,
                demo_sample_available=True,
            )
        mock = MockPortfolioProvider()
        return ProviderResolution(
            provider=mock,
            configured_mode=mode,
            active_source=mock.source_name,
            fallback_active=True,
            fallback_reason="Demo samples unavailable; using mock fallback.",
            provider_class=mock.__class__.__name__,
            demo_sample_available=False,
        )

    if mode == "ibkr-live":
        live = IbkrLivePortfolioProvider()
        diagnostics = _diagnose_live_provider(live)
        if diagnostics["gateway_status"] == "connected" and diagnostics["ibkr_authenticated"]:
            return ProviderResolution(
                provider=live,
                configured_mode=mode,
                active_source=live.source_name,
                fallback_active=False,
                fallback_reason=None,
                provider_class=live.__class__.__name__,
                **diagnostics,
            )
        demo = DemoSamplePortfolioProvider()
        if demo.is_available():
            return ProviderResolution(
                provider=demo,
                configured_mode=mode,
                active_source=demo.source_name,
                fallback_active=True,
                fallback_reason="Client Portal Gateway unavailable; using demo samples.",
                provider_class=demo.__class__.__name__,
                demo_sample_available=True,
                **diagnostics,
            )
        mock = MockPortfolioProvider()
        return ProviderResolution(
            provider=mock,
            configured_mode=mode,
            active_source=mock.source_name,
            fallback_active=True,
            fallback_reason="Client Portal Gateway unavailable; using mock fallback.",
            provider_class=mock.__class__.__name__,
            demo_sample_available=False,
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
    )


def get_active_provider():
    """Return the resolved active provider."""
    return resolve_portfolio_provider().provider


def get_provider_status() -> Dict[str, Any]:
    """Return provider status info for API consumers."""
    resolution = resolve_portfolio_provider()
    mode = resolution.configured_mode
    demo_available = resolution.demo_sample_available or DemoSamplePortfolioProvider().is_available()
    fallback_active = resolution.fallback_active
    if fallback_active:
        status = "fallback"
        message = resolution.fallback_reason or f"{provider_mode_label(mode)} unavailable. Using {provider_source_label(resolution.active_source)}."
        if mode == "ibkr-live" and resolution.active_source == "DEMO_SAMPLE":
            message = resolution.fallback_reason or "Live IBKR unavailable. Using Demo Samples."
    elif mode == "ibkr-live":
        if resolution.gateway_status == "connected" and resolution.ibkr_authenticated:
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
        "demo_sample_available": demo_available,
        "mock_available": True,
    }
