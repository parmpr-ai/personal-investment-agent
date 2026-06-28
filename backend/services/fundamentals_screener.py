"""
Free fundamental screening via Yahoo Finance quoteSummary endpoint.
No API key required. Fetches P/E, revenue growth, margins, FCF, debt/equity.
Returns per-ticker fundamental_score (-50 to +50) and reasons.
"""
import asyncio
from typing import Any, Dict, List, Optional

import httpx

_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; InvestAgent/6.0)"}
_TIMEOUT = 8
_MODULES = "financialData,defaultKeyStatistics,summaryDetail,earningsTrend"


async def fetch_fundamentals(ticker: str) -> Dict[str, Any]:
    """Fetch key fundamental metrics from Yahoo quoteSummary."""
    url = f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{ticker.upper()}"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS) as client:
            r = await client.get(url, params={"modules": _MODULES})
            r.raise_for_status()
            data = r.json()
        result = data.get("quoteSummary", {}).get("result", [{}])[0]
        fd = result.get("financialData", {})
        ks = result.get("defaultKeyStatistics", {})
        sd = result.get("summaryDetail", {})
        et = result.get("earningsTrend", {})

        def val(d: dict, key: str) -> Optional[float]:
            v = d.get(key)
            if isinstance(v, dict):
                return v.get("raw")
            return v if isinstance(v, (int, float)) else None

        # Revenue growth (YoY quarterly)
        rev_growth = val(fd, "revenueGrowth")
        # Earnings growth
        earnings_growth = val(fd, "earningsGrowth")
        # Margins
        gross_margin = val(fd, "grossMargins")
        operating_margin = val(fd, "operatingMargins")
        profit_margin = val(fd, "profitMargins")
        # Balance sheet health
        current_ratio = val(fd, "currentRatio")
        debt_to_equity = val(fd, "debtToEquity")  # in %, so 150 = 1.5x
        # Valuation
        trailing_pe = val(ks, "trailingPE") or val(sd, "trailingPE")
        forward_pe = val(ks, "forwardPE") or val(sd, "forwardPE")
        peg = val(ks, "pegRatio")
        price_to_book = val(ks, "priceToBook")
        ev_to_ebitda = val(ks, "enterpriseToEbitda")
        # Cash flow
        fcf = val(fd, "freeCashflow")
        total_cash = val(fd, "totalCash")
        total_debt = val(fd, "totalDebt")
        # Forward revenue growth estimate (next year)
        fwd_rev_growth = None
        trends = et.get("trend", [])
        for trend in trends:
            if trend.get("period") == "+1y":
                growth_est = trend.get("revenueEstimate", {}).get("growth", {})
                if isinstance(growth_est, dict):
                    fwd_rev_growth = growth_est.get("raw")
                break

        out = {
            "ticker": ticker.upper(),
            "ok": True,
            "trailing_pe": round(trailing_pe, 1) if trailing_pe else None,
            "forward_pe": round(forward_pe, 1) if forward_pe else None,
            "peg": round(peg, 2) if peg else None,
            "price_to_book": round(price_to_book, 2) if price_to_book else None,
            "ev_to_ebitda": round(ev_to_ebitda, 1) if ev_to_ebitda else None,
            "revenue_growth": round(rev_growth * 100, 1) if rev_growth is not None else None,
            "fwd_revenue_growth": round(fwd_rev_growth * 100, 1) if fwd_rev_growth is not None else None,
            "earnings_growth": round(earnings_growth * 100, 1) if earnings_growth is not None else None,
            "gross_margin": round(gross_margin * 100, 1) if gross_margin is not None else None,
            "operating_margin": round(operating_margin * 100, 1) if operating_margin is not None else None,
            "profit_margin": round(profit_margin * 100, 1) if profit_margin is not None else None,
            "current_ratio": round(current_ratio, 2) if current_ratio else None,
            "debt_to_equity": round(debt_to_equity / 100, 2) if debt_to_equity is not None else None,
            "fcf_positive": fcf is not None and fcf > 0,
            "fcf": fcf,
            "total_cash": total_cash,
            "total_debt": total_debt,
        }
        out["fundamental_score"], out["fundamental_reason"] = _score_fundamentals(out)
        return out
    except Exception as e:
        return {"ticker": ticker.upper(), "ok": False, "error": str(e),
                "fundamental_score": 0, "fundamental_reason": ""}


def _score_fundamentals(f: Dict[str, Any]) -> tuple[int, str]:
    """
    Score fundamentals -50 to +50.
    Positive = healthy/growing company worth buying.
    Negative = overvalued / declining / leveraged.
    """
    score = 0
    reasons = []

    # ── Revenue growth ────────────────────────────────────────────────────────
    rg = f.get("revenue_growth")
    if rg is not None:
        if rg >= 30:   score += 20; reasons.append(f"rev growth +{rg:.0f}%")
        elif rg >= 15: score += 12; reasons.append(f"rev growth +{rg:.0f}%")
        elif rg >= 5:  score += 5;  reasons.append(f"rev growth +{rg:.0f}%")
        elif rg < 0:   score -= 15; reasons.append(f"rev declining {rg:.0f}%")

    # ── Earnings / profit growth ──────────────────────────────────────────────
    eg = f.get("earnings_growth")
    if eg is not None:
        if eg >= 25:   score += 15; reasons.append(f"earnings +{eg:.0f}%")
        elif eg >= 10: score += 8;  reasons.append(f"earnings +{eg:.0f}%")
        elif eg < -10: score -= 12; reasons.append(f"earnings {eg:.0f}%")

    # ── Profit margin ─────────────────────────────────────────────────────────
    pm = f.get("profit_margin")
    if pm is not None:
        if pm >= 20:   score += 10; reasons.append(f"margin {pm:.0f}%")
        elif pm >= 10: score += 5
        elif pm < 0:   score -= 10; reasons.append("negative margin")

    # ── Valuation (P/E) ───────────────────────────────────────────────────────
    pe = f.get("trailing_pe")
    fpe = f.get("forward_pe")
    if pe is not None and pe > 0:
        if pe < 15:    score += 10; reasons.append(f"PE={pe:.0f} cheap")
        elif pe < 25:  score += 5;  reasons.append(f"PE={pe:.0f} fair")
        elif pe > 60:  score -= 10; reasons.append(f"PE={pe:.0f} expensive")
        elif pe > 40:  score -= 5;  reasons.append(f"PE={pe:.0f} elevated")
    # Forward P/E < trailing = earnings improving → bullish
    if pe and fpe and pe > 0 and fpe > 0 and fpe < pe * 0.85:
        score += 8; reasons.append(f"fwd PE={fpe:.0f}<trailing (improving)")

    # ── PEG ratio (growth-adjusted valuation) ─────────────────────────────────
    peg = f.get("peg")
    if peg is not None and peg > 0:
        if peg < 1.0:  score += 12; reasons.append(f"PEG={peg:.1f} undervalued")
        elif peg < 1.5: score += 5; reasons.append(f"PEG={peg:.1f} fair")
        elif peg > 3.0: score -= 8; reasons.append(f"PEG={peg:.1f} expensive")

    # ── Balance sheet ─────────────────────────────────────────────────────────
    de = f.get("debt_to_equity")
    if de is not None:
        if de < 0.3:   score += 8;  reasons.append(f"D/E={de:.1f} conservative")
        elif de < 1.0: score += 3
        elif de > 3.0: score -= 10; reasons.append(f"D/E={de:.1f} over-leveraged")
        elif de > 1.5: score -= 5;  reasons.append(f"D/E={de:.1f} leveraged")

    if f.get("fcf_positive"):
        score += 5; reasons.append("FCF positive")
    elif f.get("fcf") is not None and not f.get("fcf_positive"):
        score -= 5; reasons.append("FCF negative")

    cr = f.get("current_ratio")
    if cr is not None:
        if cr >= 2.0:  score += 5; reasons.append(f"current ratio {cr:.1f}")
        elif cr < 1.0: score -= 8; reasons.append(f"current ratio {cr:.1f} tight")

    return max(-50, min(50, score)), ", ".join(reasons)


async def fetch_fundamentals_batch(tickers: List[str], max_concurrent: int = 5) -> Dict[str, Dict[str, Any]]:
    """Fetch fundamentals for multiple tickers with concurrency limit."""
    sem = asyncio.Semaphore(max_concurrent)

    async def _fetch(t: str) -> tuple[str, Dict]:
        async with sem:
            return t.upper(), await fetch_fundamentals(t)

    results = await asyncio.gather(*[_fetch(t) for t in tickers], return_exceptions=True)
    out = {}
    for item in results:
        if isinstance(item, tuple):
            ticker, data = item
            out[ticker] = data
        # silently skip exceptions
    return out


def fundamental_adj(fundamentals: Dict[str, Any], ticker: str) -> tuple[int, str]:
    """Returns (score_delta, reason) to add to any signal score."""
    info = fundamentals.get(ticker.upper(), {})
    if not info.get("ok"):
        return 0, ""
    score = info.get("fundamental_score", 0)
    reason = info.get("fundamental_reason", "")
    # Scale: fundamental score is -50..+50; map to -20..+20 for signal contribution
    scaled = round(score * 0.4)
    return scaled, f"fundamentals: {reason}" if reason else ""
