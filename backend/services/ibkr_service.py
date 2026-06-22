from __future__ import annotations

from typing import Any

from services.portfolio_providers import IbkrLivePortfolioProvider

_LIVE_PROVIDER: IbkrLivePortfolioProvider | None = None


def _provider() -> IbkrLivePortfolioProvider:
    global _LIVE_PROVIDER
    if _LIVE_PROVIDER is None:
        _LIVE_PROVIDER = IbkrLivePortfolioProvider()
    return _LIVE_PROVIDER


def _require_live_provider() -> IbkrLivePortfolioProvider:
    provider = _provider()
    if not provider.is_available():
        raise RuntimeError("Client Portal Gateway is not authenticated or not reachable.")
    return provider


def _symbol_match(symbol: str | None, row: dict[str, Any]) -> bool:
    if not symbol:
        return True
    needle = symbol.upper().split()[0]
    haystack = {
        str(row.get("symbol", "")).upper(),
        str(row.get("underlying", "")).upper(),
        str(row.get("name", "")).upper(),
        str(row.get("ticker", "")).upper(),
    }
    return any(item.startswith(needle) or needle.startswith(item) for item in haystack if item)


def get_ibkr_portfolio():
    return _require_live_provider().get_portfolio()


def get_ibkr_executions(symbol=None):
    trades = _require_live_provider().get_trades()
    if symbol:
        trades = [trade for trade in trades if _symbol_match(symbol, trade)]
    return trades
