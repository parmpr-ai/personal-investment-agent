"""
Portfolio Calculator — ARTEMIS-PORTFOLIO-ENGINE-REFACTOR-061

Single, deterministic calculation path for all portfolio surfaces.
No consumer (Desktop, Mobile, AI, etc.) may recalculate values outside this module.

Input:
  positions    — raw position records (symbol, qty, avg_cost, multiplier, …)
                 must NOT contain pre-computed market_value / unrealized / day_pnl
  quotes       — Dict[str, Quote] from QuoteEngine
  ibkr_summary — normalised IBKR account fields (only when IBKR is live);
                 provides authoritative NLV, buying_power, margins, etc.

Output: Canonical Portfolio DTO (single dict consumed everywhere)

Emits: [PORTFOLIO_CALCULATED] structured log event.

Options cost_basis rule (HERMES-057, confirmed ARTEMIS-061):
  IBKR reports avgCost as the per-CONTRACT cost (avgPrice × multiplier).
  Therefore: cost_basis = avgCost × qty   (NOT × multiplier again).
  market_value = last × qty × multiplier   (last is per-share / per-option-share).
"""

import logging
import time
from typing import Any, Dict, List, Optional

from services.quote_engine import Quote, quote_key_for_instrument
from services.connectors import get_fx_rate

_LOG = logging.getLogger("pia.portfolio_calculator")

# Stale computed fields that must be stripped before recalculation.
# These are the fields that become stale when saved in a snapshot.
STALE_COMPUTED_FIELDS = frozenset({
    "market_value", "mktValue",
    "unrealized", "unrealizedPnl",
    "day_pnl", "day_change",
    "day_pnl_pct", "day_change_pct",
    "previous_market_value",
    "portfolio_pct",
    "priceSource", "quoteSource", "quoteStale", "quoteStaleReason",
    "price_source",
})


def strip_stale_fields(position: Dict) -> Dict:
    """
    Remove price-derived computed fields from a snapshot position.
    Must be called before passing snapshot positions to calculate().
    """
    return {k: v for k, v in position.items() if k not in STALE_COMPUTED_FIELDS}


def calculate(
    positions: List[Dict],
    quotes: Dict[str, Quote],
    ibkr_summary: Optional[Dict] = None,
    *,
    source: str = "UNKNOWN",
    mode: str = "unknown",
    quote_provider: str = "NO_DATA",
    snapshot_timestamp: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Single calculation path for all portfolio surfaces.

    IBKR live:  ibkr_summary provides authoritative NLV, buying_power, margins.
                These include non-position assets (T-bills, accrued interest, etc.)
                that cannot be computed from positions alone.

    Offline:    ibkr_summary is None. Portfolio total = Σ(market_value) + last_known_cash.
                Margin / buying_power fields are None (not available without IBKR connection).
    """
    t0 = time.time()
    enriched: List[Dict] = []
    symbols_updated: List[str] = []

    # Determine account currency and pre-fetch FX rate for position conversion.
    # Position monetary values (market_value, day_pnl, etc.) come from quote prices
    # which are always in the instrument's native currency (USD for US equities/options).
    # For EUR-base accounts we convert each position to EUR before aggregating so that
    # Σ(position.day_pnl) = portfolio.daily_pnl = IBKR (all in EUR).
    account_currency = ((ibkr_summary.get("currency") or "USD").upper()
                        if ibkr_summary else "USD")
    if account_currency != "USD":
        _fx_usd_to_acct = get_fx_rate("USD", account_currency) or 1.0
    else:
        _fx_usd_to_acct = 1.0

    for raw in positions:
        p = dict(raw)

        sym = str(p.get("symbol") or p.get("underlying") or "").upper().split()[0]
        qty = _f(p.get("qty") or p.get("quantity") or p.get("position") or 0)
        # multiplier: 100 for standard equity options, 1 for stocks/ETFs
        mult = _f(p.get("multiplier") or 1) or 1.0
        # avg_cost: per-contract for options (IBKR avgCost already × multiplier)
        avg_cost = _f(
            p.get("avg_cost") or p.get("avgCost") or p.get("avg_price")
            or p.get("averageCost") or 0
        )
        # cost_basis = avg_cost × qty  (no extra multiplier — avgCost is per-contract)
        cost_basis = _f(
            p.get("cost_basis") or p.get("costBasis") or (avg_cost * qty if avg_cost else 0)
        )

        quote_key = quote_key_for_instrument(p)
        quote: Optional[Quote] = None
        if quotes:
            quote = quotes.get(quote_key)
            if quote is None and str(p.get("assetClass") or p.get("sec_type") or "").upper() != "OPT":
                quote = quotes.get(sym)

        if quote and quote.last:
            last = quote.last
            # market_value = qty × last × multiplier
            market_value = round(qty * last * mult, 2)
            unrealized = round(market_value - cost_basis, 2)
            unrealized_pct = round(unrealized / cost_basis * 100, 2) if cost_basis else None
            # day_pnl = qty × per-share_change × multiplier
            day_pnl = (
                round(qty * quote.change * mult, 2)
                if quote.change is not None else None
            )
            day_pnl_pct = round(quote.change_pct, 4) if quote.change_pct is not None else None
            prev_close = quote.previous_close if quote.previous_close is not None else ((last - quote.change) if quote.change is not None else None)
            previous_market_value = (
                round(qty * prev_close * mult, 2) if prev_close is not None else None
            )
            price_source = quote.source

            # Convert USD instrument values to account base currency (e.g. EUR).
            # Applies only to USD-denominated positions in non-USD accounts.
            pos_currency = str(p.get("currency") or "USD").upper()
            if pos_currency == "USD" and account_currency != "USD" and _fx_usd_to_acct != 1.0:
                _fx = _fx_usd_to_acct
                market_value = round(market_value * _fx, 2)
                cost_basis = round(cost_basis * _fx, 2)
                unrealized = round(market_value - cost_basis, 2)
                unrealized_pct = round(unrealized / cost_basis * 100, 2) if cost_basis else None
                day_pnl = round(day_pnl * _fx, 2) if day_pnl is not None else None
                previous_market_value = (
                    round(previous_market_value * _fx, 2) if previous_market_value is not None else None
                )
        else:
            last = None
            market_value = None
            unrealized = None
            unrealized_pct = None
            day_pnl = None
            day_pnl_pct = None
            prev_close = None
            previous_market_value = None
            price_source = "NO_DATA"

        p.update({
            # Quantities (normalise aliases)
            "qty": qty,
            "quantity": qty,
            "avg_cost": avg_cost,
            "cost_basis": cost_basis,
            "multiplier": mult,
            # Price layer
            "last": last,
            "price": last,           # frontend alias
            "previousClose": prev_close,
            "prevClose": prev_close,
            "bid": quote.bid if quote else None,
            "ask": quote.ask if quote else None,
            "mid": round((quote.bid + quote.ask) / 2, 4) if quote and quote.bid is not None and quote.ask is not None else None,
            # Computed
            "market_value": market_value,
            "unrealized": unrealized,
            "unrealized_pct": unrealized_pct,
            "day_pnl": day_pnl,
            "day_change": quote.change if quote else None,
            "day_pnl_pct": day_pnl_pct,
            "day_change_pct": day_pnl_pct,
            "previous_market_value": previous_market_value,
            "price_source": price_source,
            "quoteSource": price_source,
            "priceSource": price_source,
            "quoteProvider": quote.provider if quote else "NO_DATA",
            "quoteLastRefresh": quote.timestamp if quote else None,
            "quoteTimestamp": quote.timestamp if quote else None,
            "quoteAgeSeconds": round(quote.age_seconds, 3) if quote else None,
            "quoteStale": not bool(quote and quote.is_live),
            "quoteStaleReason": None if quote and quote.is_live else "No live quote available from MarketDataEngine.",
            "marketSession": quote.market_state if quote and quote.market_state else None,
            "marketState": quote.market_state if quote and quote.market_state else None,
        })

        if qty != 0:
            enriched.append(p)
            if quote and sym:
                symbols_updated.append(sym)

    # ── Portfolio-level aggregation ────────────────────────────────────────────
    mv_list = [p["market_value"] for p in enriched if p.get("market_value") is not None]
    total_market_value = round(sum(mv_list), 2)

    total_cost = round(sum(_f(p.get("cost_basis") or 0) for p in enriched), 2)

    unr_list = [_f(p["unrealized"]) for p in enriched if p.get("unrealized") is not None]
    total_unrealized = round(sum(unr_list), 2)
    total_unrealized_pct = (
        round(total_unrealized / total_cost * 100, 2) if total_cost else None
    )

    dpnl_list = [_f(p["day_pnl"]) for p in enriched if p.get("day_pnl") is not None]
    total_day_pnl = round(sum(dpnl_list), 2) if dpnl_list else None

    # ── Account-level fields ───────────────────────────────────────────────────
    if ibkr_summary:
        # Authoritative NLV from IBKR (includes bonds, T-bills, accrued interest,
        # pending settlements — assets not reflected in the positions list).
        nlv = _f(ibkr_summary.get("net_liquidation") or ibkr_summary.get("total_value") or 0)
        cash = _f(ibkr_summary.get("cash") or 0)
        portfolio_total = nlv if nlv > 0 else total_market_value + cash
        buying_power = _nz(ibkr_summary.get("buying_power"))
        excess_liquidity = _nz(ibkr_summary.get("excess_liquidity"))
        maint_margin_req = _nz(ibkr_summary.get("maint_margin_req"))
        init_margin_req = _nz(ibkr_summary.get("init_margin_req"))
        available_funds = _nz(ibkr_summary.get("available_funds"))
        realized_pnl = _nz(ibkr_summary.get("realized_pnl"))
        currency = ibkr_summary.get("currency") or "USD"
    else:
        # Offline / snapshot mode — no broker-level account data available.
        cash = _f(ibkr_summary.get("cash") if ibkr_summary else 0)  # last-known cash
        portfolio_total = total_market_value + cash
        nlv = portfolio_total
        buying_power = None
        excess_liquidity = None
        maint_margin_req = None
        init_margin_req = None
        available_funds = None
        realized_pnl = None
        currency = account_currency  # preserved from ibkr_summary["currency"] passed offline

    # Derive daily_pnl_pct from the now-FX-adjusted total_day_pnl and portfolio total.
    # Using ibkr_summary.get("daily_pnl_pct") would be stale (computed before FX fix).
    if total_day_pnl is not None and portfolio_total > 0:
        _prev_portfolio = portfolio_total - total_day_pnl
        daily_pnl_pct_portfolio = (
            round(total_day_pnl / _prev_portfolio * 100, 4) if _prev_portfolio else None
        )
    else:
        daily_pnl_pct_portfolio = None

    margin_used = (
        round(maint_margin_req / nlv * 100, 2)
        if (maint_margin_req is not None and nlv > 0)
        else None
    )

    # ── Allocation % ───────────────────────────────────────────────────────────
    for p in enriched:
        mv = p.get("market_value")
        if portfolio_total and mv is not None:
            p["portfolio_pct"] = round(abs(mv) / portfolio_total * 100, 2)
        else:
            p["portfolio_pct"] = None

    duration_ms = round((time.time() - t0) * 1000, 1)
    _LOG.info(
        "[PORTFOLIO_CALCULATED] source=%s quote_provider=%s total=%.2f "
        "positions=%s day_pnl=%s duration_ms=%s",
        source, quote_provider, portfolio_total,
        len(enriched), total_day_pnl, duration_ms,
    )

    _prev_portfolio_total = (portfolio_total - total_day_pnl) if total_day_pnl is not None else None
    _provenance = {
        "daily_pnl": {
            "formula": f"Σ(position.day_pnl × fx_usd_to_{account_currency.lower()})",
            "fx_rate": _fx_usd_to_acct,
            "fx_pair": f"USD→{account_currency}",
            "value": total_day_pnl,
            "position_count": len(dpnl_list),
            "account_currency": account_currency,
            "quote_provider": quote_provider,
            "ibkr_field": "field_83_abs_change_per_share",
        },
        "daily_pnl_pct": {
            "formula": "daily_pnl / (total_value - daily_pnl) × 100",
            "value": daily_pnl_pct_portfolio,
            "previous_portfolio_value": round(_prev_portfolio_total, 2) if _prev_portfolio_total is not None else None,
        },
    }

    return {
        # ── Positions ──────────────────────────────────────────────────────────
        "positions": enriched,
        "positions_count": len(enriched),
        # ── Portfolio totals ───────────────────────────────────────────────────
        "total_value": round(portfolio_total, 2),
        "net_liquidation": round(nlv, 2),
        "cash": round(cash, 2),
        # ── P&L ───────────────────────────────────────────────────────────────
        "cost_basis": total_cost,
        "unrealized": total_unrealized,
        "unrealized_pct": total_unrealized_pct,
        "daily_pnl": total_day_pnl,
        "daily_pnl_pct": daily_pnl_pct_portfolio,
        "realized_pnl": realized_pnl,
        "calculationProvenance": _provenance,
        # ── Account fields (IBKR live only; None = not available offline) ──────
        "buying_power": buying_power,
        "excess_liquidity": excess_liquidity,
        "maint_margin_req": maint_margin_req,
        "init_margin_req": init_margin_req,
        "available_funds": available_funds,
        "margin_used": margin_used,
        # ── Meta ───────────────────────────────────────────────────────────────
        "source": source,
        "active_source": source,
        "mode": mode,
        "currency": currency,
        "quote_provider": quote_provider,
        "symbolsUpdated": sorted(set(symbols_updated)),
        "snapshot_timestamp": snapshot_timestamp,
        "_calculator_duration_ms": duration_ms,
    }


# ── Helpers ────────────────────────────────────────────────────────────────────

def _f(v: Any) -> float:
    """Safe float; returns 0.0 for None/falsy."""
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _nz(v: Any) -> Optional[float]:
    """Return float if non-zero, else None (signals 'not available')."""
    try:
        f = float(v or 0)
        return f if f != 0.0 else None
    except (TypeError, ValueError):
        return None
