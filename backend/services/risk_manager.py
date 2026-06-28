from typing import Any, Dict, List, Optional, Tuple  # noqa: F401
import asyncio
import time
import numpy as np

# Rolling returns cache for correlation / CVaR: {ticker: [daily_returns]}
_returns_cache: Dict[str, List[float]] = {}
_returns_cache_ts: float = 0.0
_RETURNS_CACHE_TTL = 3600  # 1h

DEFAULT_LIMITS = {
    "max_position_pct": 25.0,
    "max_single_trade_pct": 8.0,
    "stop_loss_pct": 8.0,
    "daily_loss_limit_pct": 3.0,
    "max_portfolio_beta": 1.4,
    "vix_pause_threshold": 27.0,
    "max_open_positions": 12,
    "min_cash_reserve_pct": 10.0,
    "max_leverage": 1.0,
}


class RiskManager:
    def __init__(self, limits: Dict[str, Any] | None = None):
        self.limits = {**DEFAULT_LIMITS, **(limits or {})}

    def check_trade(
        self,
        action: str,
        ticker: str,
        proposed_qty: float,
        price: float,
        portfolio: Dict[str, Any],
        macro: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Returns {approved, adjusted_qty, reasons}."""
        reasons: List[str] = []
        approved = True
        qty = proposed_qty
        total = float(portfolio.get("total_value", 1))
        cash = float(portfolio.get("cash", 0))
        positions = portfolio.get("positions", [])
        daily_pnl_pct = float(portfolio.get("daily_pnl_pct", 0))
        vix = float(macro.get("vix", 18))

        # Daily loss circuit breaker
        if daily_pnl_pct < -self.limits["daily_loss_limit_pct"]:
            return {
                "approved": False,
                "adjusted_qty": 0,
                "reasons": [f"Daily loss limit hit ({daily_pnl_pct:.1f}%). No new buys today."],
            }

        # VIX filter
        if action == "BUY" and vix > self.limits["vix_pause_threshold"]:
            return {
                "approved": False,
                "adjusted_qty": 0,
                "reasons": [f"VIX={vix} exceeds pause threshold {self.limits['vix_pause_threshold']}. Halting new buys."],
            }

        # Hostile macro
        if action == "BUY" and macro.get("hostile", False):
            reasons.append("Macro hostile - reducing size by 50%")
            qty = qty * 0.5

        # Cash reserve
        if action == "BUY":
            cash_pct = cash / total * 100
            if cash_pct < self.limits["min_cash_reserve_pct"]:
                return {
                    "approved": False,
                    "adjusted_qty": 0,
                    "reasons": [f"Cash reserve {cash_pct:.1f}% below minimum {self.limits['min_cash_reserve_pct']}%."],
                }

        # Position concentration
        trade_value = qty * price
        existing_pos = next((p for p in positions if p.get("symbol", "").split()[0] == ticker), None)
        existing_value = float(existing_pos.get("market_value", 0)) if existing_pos else 0
        new_total_value = existing_value + (trade_value if action == "BUY" else -trade_value)
        new_pct = new_total_value / total * 100

        if action == "BUY" and new_pct > self.limits["max_position_pct"]:
            allowed_value = self.limits["max_position_pct"] / 100 * total - existing_value
            if allowed_value <= 0:
                return {
                    "approved": False,
                    "adjusted_qty": 0,
                    "reasons": [f"{ticker} already at max concentration {existing_value/total*100:.1f}%"],
                }
            qty = min(qty, allowed_value / price)
            reasons.append(f"Size capped: max position {self.limits['max_position_pct']}%")

        # Single trade size cap
        max_trade_value = self.limits["max_single_trade_pct"] / 100 * total
        if action == "BUY" and qty * price > max_trade_value:
            qty = max_trade_value / price
            reasons.append(f"Single trade capped at {self.limits['max_single_trade_pct']}% of portfolio")

        # Max open positions
        if action == "BUY" and not existing_pos:
            open_count = len([p for p in positions if float(p.get("qty", 0)) > 0])
            if open_count >= self.limits["max_open_positions"]:
                return {
                    "approved": False,
                    "adjusted_qty": 0,
                    "reasons": [f"Max positions reached ({open_count}/{self.limits['max_open_positions']})"],
                }

        # Cash check for buys
        if action == "BUY" and qty * price > cash:
            qty = cash * 0.95 / price
            reasons.append("Size reduced to available cash")

        qty = max(0, round(qty, 6))
        if qty <= 0:
            approved = False
            reasons.append("Adjusted quantity is zero")

        return {"approved": approved, "adjusted_qty": qty, "reasons": reasons}

    def compute_stop_loss(self, price: float, action: str = "BUY", atr: Optional[float] = None) -> float:
        """ATR-based stop (2× ATR) when available, else fixed % fallback."""
        if atr and atr > 0:
            distance = atr * 2.0
        else:
            distance = price * self.limits["stop_loss_pct"] / 100
        if action == "BUY":
            return round(price - distance, 2)
        return round(price + distance, 2)

    def drawdown_scalar(self, portfolio_value: float, peak_value: float) -> float:
        """Position size multiplier: scales down as portfolio draws down from peak.
        At 0% drawdown → 1.0x, at 10% drawdown → 0.5x, at 20%+ drawdown → 0.25x."""
        if peak_value <= 0:
            return 1.0
        dd_pct = max(0.0, (peak_value - portfolio_value) / peak_value * 100)
        scalar = max(0.25, 1.0 - dd_pct / 13.3)  # 7.5% dd → ~0.44x, 20% dd → 0.25x
        return round(scalar, 3)

    def position_size_shares(self, ticker: str, price: float, portfolio_value: float,
                              risk_pct: float = 2.0, atr: Optional[float] = None,
                              drawdown_scale: float = 1.0) -> int:
        dollar_risk = portfolio_value * risk_pct / 100 * drawdown_scale
        stop_distance = (atr * 2.0) if (atr and atr > 0) else (price * self.limits["stop_loss_pct"] / 100)
        if stop_distance <= 0 or price <= 0:
            return 0
        shares = dollar_risk / stop_distance
        max_by_concentration = (self.limits["max_single_trade_pct"] / 100 * portfolio_value) / price
        return max(1, int(min(shares, max_by_concentration)))

    def should_trigger_stop(self, position: Dict[str, Any], current_price: float) -> bool:
        avg_price = float(position.get("avg_price", current_price))
        if avg_price <= 0:
            return False
        loss_pct = (current_price - avg_price) / avg_price * 100
        return loss_pct < -self.limits["stop_loss_pct"]

    # ── Correlation-aware sizing ───────────────────────────────────────────────

    @staticmethod
    async def _fetch_returns(tickers: List[str], days: int = 30) -> Dict[str, List[float]]:
        """Fetch 30-day daily returns for correlation computation."""
        global _returns_cache, _returns_cache_ts
        if _returns_cache and time.time() - _returns_cache_ts < _RETURNS_CACHE_TTL:
            return _returns_cache

        import httpx
        _HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; InvestAgent/6.0)"}
        result: Dict[str, List[float]] = {}
        sem = asyncio.Semaphore(6)

        async def _get(t: str):
            async with sem:
                url = f"https://query1.finance.yahoo.com/v8/finance/chart/{t.upper()}"
                try:
                    async with httpx.AsyncClient(timeout=8, headers=_HEADERS) as c:
                        r = await c.get(url, params={"interval": "1d", "range": "2mo"})
                        r.raise_for_status()
                        closes = r.json()["chart"]["result"][0]["indicators"]["quote"][0]["close"]
                        closes = [x for x in closes if x is not None][-days - 1:]
                        if len(closes) >= 2:
                            rets = [(closes[i] - closes[i-1]) / closes[i-1]
                                    for i in range(1, len(closes))]
                            result[t.upper()] = rets
                except Exception:
                    pass

        await asyncio.gather(*[_get(t) for t in tickers], return_exceptions=True)
        _returns_cache = result
        _returns_cache_ts = time.time()
        return result

    def correlation_penalty(
        self,
        new_ticker: str,
        open_positions: List[Dict[str, Any]],
        returns_cache: Dict[str, List[float]],
    ) -> Tuple[float, str]:
        """
        Returns (size_multiplier, reason).
        Reduces position size if the new ticker is highly correlated (>0.7)
        with existing open positions to avoid doubling up on the same risk.
        """
        new_rets = returns_cache.get(new_ticker.upper())
        if not new_rets or not open_positions:
            return 1.0, ""

        max_corr = 0.0
        max_corr_ticker = ""
        arr_new = np.array(new_rets)

        for pos in open_positions:
            t = pos.get("ticker", "").upper()
            if t == new_ticker.upper():
                continue
            pos_rets = returns_cache.get(t)
            if not pos_rets:
                continue
            min_len = min(len(arr_new), len(pos_rets))
            if min_len < 10:
                continue
            corr = float(np.corrcoef(arr_new[-min_len:], np.array(pos_rets[-min_len:]))[0, 1])
            if abs(corr) > max_corr:
                max_corr = abs(corr)
                max_corr_ticker = t

        if max_corr >= 0.85:
            return 0.5, f"High correlation {max_corr:.2f} with {max_corr_ticker} — size ×0.5"
        if max_corr >= 0.70:
            return 0.75, f"Moderate correlation {max_corr:.2f} with {max_corr_ticker} — size ×0.75"
        return 1.0, ""

    def portfolio_cvar(
        self,
        open_positions: List[Dict[str, Any]],
        returns_cache: Dict[str, List[float]],
        portfolio_value: float,
        confidence: float = 0.95,
    ) -> Dict[str, Any]:
        """
        Historical CVaR (Expected Shortfall) at 95% confidence.
        Uses position weights × returns to simulate portfolio daily P&L distribution.
        Returns {cvar_pct, var_pct, worst_day_pct}.
        """
        if not open_positions or not returns_cache or portfolio_value <= 0:
            return {"cvar_pct": 0.0, "var_pct": 0.0, "worst_day_pct": 0.0}

        # Build weighted portfolio returns
        min_len = min(
            (len(returns_cache.get(p["ticker"].upper(), [])) for p in open_positions),
            default=0,
        )
        if min_len < 10:
            return {"cvar_pct": 0.0, "var_pct": 0.0, "worst_day_pct": 0.0}

        portfolio_rets = np.zeros(min_len)
        for pos in open_positions:
            t = pos.get("ticker", "").upper()
            rets = returns_cache.get(t, [])
            if not rets:
                continue
            weight = abs(float(pos.get("market_value", 0))) / portfolio_value
            portfolio_rets += weight * np.array(rets[-min_len:])

        sorted_rets = np.sort(portfolio_rets)
        var_idx = int((1 - confidence) * len(sorted_rets))
        var_pct = float(sorted_rets[var_idx]) * 100 if var_idx < len(sorted_rets) else 0
        cvar_pct = float(np.mean(sorted_rets[:max(1, var_idx)])) * 100

        return {
            "cvar_pct": round(cvar_pct, 2),      # average loss in worst 5% of days
            "var_pct": round(var_pct, 2),          # loss threshold at 95% confidence
            "worst_day_pct": round(float(sorted_rets[0]) * 100, 2),
            "days_analyzed": min_len,
        }

    def portfolio_health(self, portfolio: Dict[str, Any], macro: Dict[str, Any]) -> Dict[str, Any]:
        total = float(portfolio.get("total_value", 1))
        cash = float(portfolio.get("cash", 0))
        positions = portfolio.get("positions", [])
        daily_pnl_pct = float(portfolio.get("daily_pnl_pct", 0))
        vix = float(macro.get("vix", 18))
        alerts = []
        if cash / total * 100 < self.limits["min_cash_reserve_pct"]:
            alerts.append({"level": "warning", "msg": f"Cash {cash/total*100:.1f}% below {self.limits['min_cash_reserve_pct']}% reserve"})
        if daily_pnl_pct < -self.limits["daily_loss_limit_pct"]:
            alerts.append({"level": "danger", "msg": f"Daily loss {daily_pnl_pct:.1f}% exceeded limit"})
        if vix > self.limits["vix_pause_threshold"]:
            alerts.append({"level": "warning", "msg": f"VIX={vix} - new buys paused"})
        for p in positions:
            pct = float(p.get("portfolio_pct", 0))
            if pct > self.limits["max_position_pct"]:
                alerts.append({"level": "warning", "msg": f"{p['symbol']} at {pct:.1f}% - over max concentration"})
        return {
            "ok": len([a for a in alerts if a["level"] == "danger"]) == 0,
            "alerts": alerts,
            "cash_pct": round(cash / total * 100, 1),
            "position_count": len(positions),
            "daily_pnl_pct": daily_pnl_pct,
            "vix": vix,
        }
