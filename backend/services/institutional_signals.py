"""
Free institutional flow signals — zero API key required.

Sources:
  1. SEC EDGAR Form 4 RSS  — insider buy/sell transactions (officers, directors, 10%+ holders)
  2. Yahoo Finance quoteSummary — analyst consensus, price targets, short interest
  3. FINRA short interest proxy — via Yahoo shortPercentOfFloat + daysToShort

Score range: -30 to +35 additive bonus to the rule engine.
High-conviction signals (cluster insider buys, strong analyst upgrade): can add 20+.
"""
import asyncio
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

import re
import httpx

_TIMEOUT = 8
_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; InvestAgent/6.0; institutional-signals)"}

# Per-ticker cache: { ticker: {result, ts} }
_cache: Dict[str, Dict[str, Any]] = {}
_CACHE_TTL = 3600 * 4  # 4h — institutional data changes slowly


# ── 1. SEC EDGAR Form 4 — Insider Transactions ───────────────────────────────

async def fetch_insider_trades(ticker: str, days: int = 30) -> List[Dict[str, Any]]:
    """
    Fetch recent Form 4 filings for a ticker via SEC EDGAR full-text search RSS.
    Returns list of {date, insider_name, role, transaction_type, shares, value_usd}.
    """
    # SEC EDGAR full-text search for Form 4 filings by ticker
    rss_url = (
        f"https://efts.sec.gov/LATEST/search-index?q=%22{ticker.upper()}%22"
        f"&dateRange=custom&startdt={(datetime.now()-timedelta(days=days)).strftime('%Y-%m-%d')}"
        f"&forms=4&hits.hits._source=period_of_report,display_names,file_date,entity_name"
    )
    # Simpler: use the EDGAR RSS directly for the ticker's CIK
    # Most reliable: use the search endpoint
    edgar_rss = f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company={ticker}&type=4&dateb=&owner=include&count=10&search_text=&output=atom"

    trades: List[Dict[str, Any]] = []
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS) as client:
            r = await client.get(edgar_rss)
            r.raise_for_status()
            feed_text = r.text

        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        # Parse RSS with regex (avoids feedparser/sgmllib dependency)
        items = re.findall(r'<entry>(.*?)</entry>', feed_text, re.DOTALL)
        for item_xml in items[:15]:
            try:
                def _tag(tag: str) -> str:
                    m = re.search(rf'<{tag}[^>]*>(.*?)</{tag}>', item_xml, re.DOTALL)
                    return (m.group(1) if m else "").strip()

                title = re.sub(r'<[^>]+>', '', _tag("title"))
                summary = re.sub(r'<[^>]+>', '', _tag("summary"))
                updated = _tag("updated") or _tag("published")

                try:
                    filed_dt = datetime.fromisoformat(updated.replace("Z", "+00:00")) if updated else None
                except Exception:
                    filed_dt = None

                if filed_dt and filed_dt < cutoff:
                    continue

                combined = (title + " " + summary).lower()
                is_buy = any(w in combined for w in ["purchase", "acquisition", "bought", "a - acquisition"])
                is_sell = any(w in combined for w in ["sale", "disposed", "sold", "d - disposition"])

                if not is_buy and not is_sell:
                    continue

                trades.append({
                    "date": filed_dt.strftime("%Y-%m-%d") if filed_dt else "unknown",
                    "title": title[:120],
                    "type": "BUY" if is_buy else "SELL",
                    "source": "SEC Form 4",
                })
            except Exception:
                continue
    except Exception:
        pass

    return trades


# ── 2. Yahoo Finance — Analyst Recommendations + Short Interest ──────────────

async def fetch_yahoo_institutional(ticker: str) -> Dict[str, Any]:
    """
    Fetch analyst recommendations, price targets, and short interest from Yahoo quoteSummary.
    """
    url = f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{ticker.upper()}"
    modules = "recommendationTrend,defaultKeyStatistics,financialData,summaryDetail"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS) as client:
            r = await client.get(url, params={"modules": modules})
            r.raise_for_status()
            data = r.json()
        result = data.get("quoteSummary", {}).get("result", [{}])[0]
    except Exception:
        return {}

    out: Dict[str, Any] = {}

    # Analyst consensus
    rec_trend = result.get("recommendationTrend", {}).get("trend", [])
    if rec_trend:
        latest = rec_trend[0]  # most recent period
        strong_buy = latest.get("strongBuy", 0)
        buy = latest.get("buy", 0)
        hold = latest.get("hold", 0)
        sell = latest.get("sell", 0)
        strong_sell = latest.get("strongSell", 0)
        total = strong_buy + buy + hold + sell + strong_sell
        if total > 0:
            bull_pct = (strong_buy + buy) / total * 100
            bear_pct = (sell + strong_sell) / total * 100
            out["analyst_buy_pct"] = round(bull_pct, 1)
            out["analyst_sell_pct"] = round(bear_pct, 1)
            out["analyst_total"] = total
            if bull_pct >= 70:
                out["analyst_consensus"] = "STRONG_BUY"
            elif bull_pct >= 55:
                out["analyst_consensus"] = "BUY"
            elif bear_pct >= 50:
                out["analyst_consensus"] = "SELL"
            else:
                out["analyst_consensus"] = "HOLD"

    # Price target vs current price
    fin_data = result.get("financialData", {})
    current = fin_data.get("currentPrice", {}).get("raw")
    target_mean = fin_data.get("targetMeanPrice", {}).get("raw")
    target_high = fin_data.get("targetHighPrice", {}).get("raw")
    if current and target_mean:
        upside_pct = (target_mean - current) / current * 100
        out["price_target_mean"] = round(target_mean, 2)
        out["price_target_upside_pct"] = round(upside_pct, 1)
        if target_high:
            out["price_target_high"] = round(target_high, 2)

    # Short interest
    key_stats = result.get("defaultKeyStatistics", {})
    short_pct = key_stats.get("shortPercentOfFloat", {}).get("raw")
    days_to_cover = key_stats.get("shortRatioKey", {})
    short_ratio = key_stats.get("shortRatio", {}).get("raw") or \
                  result.get("summaryDetail", {}).get("shortRatio", {}).get("raw")
    if short_pct is not None:
        out["short_float_pct"] = round(short_pct * 100, 1)
        out["short_squeeze_candidate"] = short_pct > 0.20  # >20% float short
    if short_ratio is not None:
        out["days_to_cover"] = round(short_ratio, 1)

    # Recommendation key (string from Yahoo: "buy", "strongBuy", "hold", etc.)
    rec_key = fin_data.get("recommendationKey", "")
    if rec_key:
        out["yahoo_recommendation"] = rec_key

    return out


# ── 3. Scoring function ───────────────────────────────────────────────────────

def _score_institutional(insider_trades: List[Dict], yahoo: Dict) -> Tuple[int, List[str]]:
    """
    Convert raw data into a -30..+35 score with reasons list.
    """
    score = 0
    reasons: List[str] = []

    # Insider transactions
    buys = [t for t in insider_trades if t["type"] == "BUY"]
    sells = [t for t in insider_trades if t["type"] == "SELL"]

    if len(buys) >= 3:
        score += 20
        reasons.append(f"Cluster insider buying ({len(buys)} transactions)")
    elif len(buys) == 2:
        score += 12
        reasons.append(f"Multiple insider buys ({len(buys)})")
    elif len(buys) == 1:
        score += 8
        reasons.append("Insider buy signal")

    if len(sells) >= 3:
        score -= 15
        reasons.append(f"Cluster insider selling ({len(sells)} transactions)")
    elif len(sells) >= 2:
        score -= 8
        reasons.append(f"Multiple insider sells ({len(sells)})")

    # Analyst consensus
    consensus = yahoo.get("analyst_consensus", "")
    buy_pct = yahoo.get("analyst_buy_pct", 0)
    if consensus == "STRONG_BUY":
        score += 15
        reasons.append(f"Analysts strongly bullish ({buy_pct:.0f}% buy)")
    elif consensus == "BUY":
        score += 8
        reasons.append(f"Analysts bullish ({buy_pct:.0f}% buy)")
    elif consensus == "SELL":
        score -= 10
        reasons.append(f"Analysts bearish ({yahoo.get('analyst_sell_pct', 0):.0f}% sell)")

    # Price target upside
    upside = yahoo.get("price_target_upside_pct")
    if upside is not None:
        if upside >= 20:
            score += 10
            reasons.append(f"Analyst price target +{upside:.0f}% upside")
        elif upside <= -10:
            score -= 8
            reasons.append(f"Analyst price target {upside:.0f}% downside")

    # Short interest — high short + rising price = squeeze potential
    short_float = yahoo.get("short_float_pct", 0)
    squeeze = yahoo.get("short_squeeze_candidate", False)
    if squeeze:
        score += 12
        reasons.append(f"Short squeeze candidate ({short_float:.0f}% float shorted)")
    elif short_float > 10:
        score += 5
        reasons.append(f"Elevated short interest ({short_float:.0f}%)")

    return score, reasons


# ── 4. Main API ───────────────────────────────────────────────────────────────

async def get_institutional_signal(ticker: str) -> Dict[str, Any]:
    """
    Return institutional signal score + details for one ticker.
    Cached for 4h — these signals don't change cycle-to-cycle.
    """
    ticker = ticker.upper()
    cached = _cache.get(ticker)
    if cached and time.time() - cached["ts"] < _CACHE_TTL:
        return cached["data"]

    insider_trades, yahoo_data = await asyncio.gather(
        fetch_insider_trades(ticker, days=30),
        fetch_yahoo_institutional(ticker),
        return_exceptions=True,
    )

    if isinstance(insider_trades, Exception):
        insider_trades = []
    if isinstance(yahoo_data, Exception):
        yahoo_data = {}

    score, reasons = _score_institutional(insider_trades, yahoo_data)

    result = {
        "ticker": ticker,
        "score": score,
        "insider_buys": len([t for t in insider_trades if t["type"] == "BUY"]),
        "insider_sells": len([t for t in insider_trades if t["type"] == "SELL"]),
        "analyst_consensus": yahoo_data.get("analyst_consensus", "N/A"),
        "analyst_buy_pct": yahoo_data.get("analyst_buy_pct"),
        "price_target_upside_pct": yahoo_data.get("price_target_upside_pct"),
        "short_float_pct": yahoo_data.get("short_float_pct"),
        "short_squeeze_candidate": yahoo_data.get("short_squeeze_candidate", False),
        "yahoo_recommendation": yahoo_data.get("yahoo_recommendation", ""),
        "signals": reasons,
        "recent_insider_trades": insider_trades[:5],
        "ts": datetime.now(timezone.utc).isoformat(),
    }

    _cache[ticker] = {"data": result, "ts": time.time()}
    return result


async def get_institutional_signals_batch(tickers: List[str]) -> Dict[str, Dict[str, Any]]:
    """Fetch institutional signals for all tickers concurrently (max 5 at a time)."""
    sem = asyncio.Semaphore(5)

    async def _get(t: str) -> Tuple[str, Any]:
        async with sem:
            res = await get_institutional_signal(t)
            return t, res

    pairs = await asyncio.gather(*[_get(t) for t in tickers], return_exceptions=True)
    out: Dict[str, Dict] = {}
    for item in pairs:
        if isinstance(item, tuple):
            ticker, data = item
            if isinstance(data, dict):
                out[ticker] = data
    return out


def institutional_score_delta(ticker: str) -> Tuple[int, str]:
    """
    Quick lookup for autonomous_agent signal integration.
    Returns (score_delta, reason) from cache; 0 if not cached.
    """
    cached = _cache.get(ticker.upper())
    if not cached:
        return 0, ""
    d = cached["data"]
    if not d.get("signals"):
        return 0, ""
    return d["score"], "Institutional: " + "; ".join(d["signals"][:2])
