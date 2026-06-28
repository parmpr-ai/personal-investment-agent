"""
Free institutional flow signals — zero API key required.

Sources:
  1. SEC EDGAR Form 4 Atom feed — insider buy/sell transactions (officers, directors, 10%+ holders)
  2. Yahoo Finance quoteSummary  — analyst consensus, price targets, short interest
  3. FINRA short interest proxy  — via Yahoo shortPercentOfFloat + daysToShort
  4. Yahoo Finance options chain — unusual call/put vol/OI ratio, IV skew (options flow proxy)
  5. Yahoo Finance 13F ownership — institutional ownership %, top holders, accumulation/distribution

Score range: -55 to +65 additive bonus to the rule engine.
High-conviction signals (cluster insider buys + unusual call sweep + institutional accumulation): can add 40+.
"""
import asyncio
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

import re
import xml.etree.ElementTree as ET
import httpx

_TIMEOUT = 8
_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; InvestAgent/6.0; institutional-signals)"}

# Per-ticker cache: { ticker: {result, ts} }
_cache: Dict[str, Dict[str, Any]] = {}
_CACHE_TTL = 3600 * 4  # 4h — institutional data changes slowly


# ── 1. SEC EDGAR Form 4 — Insider Transactions ───────────────────────────────

async def fetch_insider_trades(ticker: str, days: int = 30) -> List[Dict[str, Any]]:
    """
    Fetch recent Form 4 filings for a ticker via SEC EDGAR Atom feed.
    Uses xml.etree.ElementTree for robust parsing (replaces fragile regex).
    Returns list of {date, title, type, source}.
    """
    edgar_rss = (
        f"https://www.sec.gov/cgi-bin/browse-edgar"
        f"?action=getcompany&company={ticker.upper()}&type=4"
        f"&dateb=&owner=include&count=15&search_text=&output=atom"
    )
    _ATOM_NS = {"a": "http://www.w3.org/2005/Atom"}

    def _strip_html(text: str) -> str:
        return re.sub(r"<[^>]+>", " ", text or "").strip()

    trades: List[Dict[str, Any]] = []
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS) as client:
            r = await client.get(edgar_rss)
            r.raise_for_status()
            feed_text = r.text

        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        try:
            root = ET.fromstring(feed_text)
            entries = root.findall("a:entry", _ATOM_NS)
        except ET.ParseError:
            # Feed occasionally wraps content in CDATA; fall back to a permissive parse
            sanitised = re.sub(r"<!\[CDATA\[.*?\]\]>", "", feed_text, flags=re.DOTALL)
            try:
                root = ET.fromstring(sanitised)
                entries = root.findall("a:entry", _ATOM_NS)
            except ET.ParseError:
                entries = []

        for entry in entries:
            try:
                def _text(tag: str) -> str:
                    el = entry.find(f"a:{tag}", _ATOM_NS)
                    return _strip_html(el.text or "") if el is not None else ""

                title   = _text("title")
                summary = _text("summary")
                updated = _text("updated") or _text("published")

                try:
                    filed_dt = datetime.fromisoformat(updated.replace("Z", "+00:00")) if updated else None
                except ValueError:
                    filed_dt = None

                if filed_dt and filed_dt < cutoff:
                    continue

                combined = (title + " " + summary).lower()
                is_buy  = any(w in combined for w in ["purchase", "acquisition", "bought", "a - acquisition"])
                is_sell = any(w in combined for w in ["sale", "disposed", "sold", "d - disposition"])

                if not is_buy and not is_sell:
                    continue

                trades.append({
                    "date":   filed_dt.strftime("%Y-%m-%d") if filed_dt else "unknown",
                    "title":  title[:120],
                    "type":   "BUY" if is_buy else "SELL",
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


# ── 3. Yahoo Finance Options Chain — Unusual Activity Proxy ──────────────────

async def fetch_options_flow(ticker: str) -> Dict[str, Any]:
    """
    Fetch the front two expirations from Yahoo Finance options chain and detect
    unusual activity: OTM contracts with volume/OI ratio > 1.5× and vol > 200.
    Also computes call/put volume ratio and IV skew (put_iv / call_iv).

    No API key required — same Yahoo endpoint used elsewhere in this module.
    """
    url = f"https://query1.finance.yahoo.com/v7/finance/options/{ticker.upper()}"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS) as client:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()

        chain_result = data.get("optionChain", {}).get("result", [])
        if not chain_result:
            return {}

        chain = chain_result[0]
        current_price: float = chain.get("quote", {}).get("regularMarketPrice", 0) or 0
        options_list = chain.get("options", [])
        if not options_list:
            return {}

        total_call_vol = 0
        total_put_vol = 0
        unusual_calls: List[Dict] = []
        unusual_puts: List[Dict] = []
        atm_call_iv: Optional[float] = None
        atm_put_iv: Optional[float] = None

        for exp_data in options_list[:2]:   # front two expirations
            calls = exp_data.get("calls", [])
            puts  = exp_data.get("puts",  [])

            # ATM call IV = lowest-strike OTM call (strikes sorted ascending in Yahoo response)
            otm_calls = sorted(
                [c for c in calls if not c.get("inTheMoney", False) and c.get("impliedVolatility")],
                key=lambda x: x.get("strike", 0),
            )
            if otm_calls and atm_call_iv is None:
                atm_call_iv = otm_calls[0].get("impliedVolatility")

            # ATM put IV = highest-strike OTM put (highest OTM strike closest to price)
            otm_puts = sorted(
                [p for p in puts if not p.get("inTheMoney", False) and p.get("impliedVolatility")],
                key=lambda x: x.get("strike", 0),
                reverse=True,
            )
            if otm_puts and atm_put_iv is None:
                atm_put_iv = otm_puts[0].get("impliedVolatility")

            for c in calls:
                vol = c.get("volume") or 0
                oi  = c.get("openInterest") or 0
                total_call_vol += vol
                if not c.get("inTheMoney", False) and vol > 200 and oi > 0 and vol / oi > 1.5:
                    unusual_calls.append({
                        "strike":        c.get("strike"),
                        "volume":        vol,
                        "open_interest": oi,
                        "vol_oi_ratio":  round(vol / oi, 2),
                        "iv":            round(c["impliedVolatility"], 3) if c.get("impliedVolatility") else None,
                    })

            for p in puts:
                vol = p.get("volume") or 0
                oi  = p.get("openInterest") or 0
                total_put_vol += vol
                if not p.get("inTheMoney", False) and vol > 200 and oi > 0 and vol / oi > 1.5:
                    unusual_puts.append({
                        "strike":        p.get("strike"),
                        "volume":        vol,
                        "open_interest": oi,
                        "vol_oi_ratio":  round(vol / oi, 2),
                        "iv":            round(p["impliedVolatility"], 3) if p.get("impliedVolatility") else None,
                    })

        unusual_calls.sort(key=lambda x: x["vol_oi_ratio"], reverse=True)
        unusual_puts.sort(key=lambda x: x["vol_oi_ratio"], reverse=True)

        cp_ratio = round(total_call_vol / total_put_vol, 2) if total_put_vol > 0 else None
        iv_skew  = round(atm_put_iv / atm_call_iv, 2) if atm_call_iv and atm_put_iv and atm_call_iv > 0 else None

        return {
            "total_call_vol":        total_call_vol,
            "total_put_vol":         total_put_vol,
            "call_put_vol_ratio":    cp_ratio,       # >1.8 bullish, <0.6 bearish
            "unusual_calls_count":   len(unusual_calls),
            "unusual_puts_count":    len(unusual_puts),
            "unusual_calls":         unusual_calls[:3],
            "unusual_puts":          unusual_puts[:3],
            "atm_call_iv":           round(atm_call_iv, 3) if atm_call_iv else None,
            "atm_put_iv":            round(atm_put_iv, 3)  if atm_put_iv  else None,
            "iv_skew":               iv_skew,         # put_iv/call_iv; >1.2 = fear premium
            "current_price":         current_price,
        }
    except Exception:
        return {}


def _score_options_flow(opts: Dict[str, Any]) -> Tuple[int, List[str]]:
    """
    Convert options flow data into a -15..+15 score adjustment.
    Signals: unusual OTM call/put sweeps, call/put volume ratio, IV skew.
    """
    if not opts:
        return 0, []

    score = 0
    reasons: List[str] = []

    unusual_calls = opts.get("unusual_calls_count", 0)
    unusual_puts  = opts.get("unusual_puts_count",  0)
    cp_ratio      = opts.get("call_put_vol_ratio")
    iv_skew       = opts.get("iv_skew")

    # Unusual OTM call buying — smart money positioning long
    if unusual_calls >= 5:
        score += 15
        reasons.append(f"Heavy unusual call sweeps ({unusual_calls} OTM strikes, vol/OI >1.5×)")
    elif unusual_calls >= 3:
        score += 10
        reasons.append(f"Unusual call buying ({unusual_calls} OTM strikes)")
    elif unusual_calls >= 1:
        score += 5
        reasons.append(f"Some unusual call activity ({unusual_calls} strike)")

    # Unusual OTM put buying — hedging / directional short bet
    if unusual_puts >= 5:
        score -= 15
        reasons.append(f"Heavy unusual put sweeps ({unusual_puts} OTM strikes)")
    elif unusual_puts >= 3:
        score -= 10
        reasons.append(f"Unusual put buying ({unusual_puts} OTM strikes)")
    elif unusual_puts >= 1:
        score -= 5
        reasons.append(f"Some unusual put activity ({unusual_puts} strike)")

    # Call/put volume ratio
    if cp_ratio is not None:
        if cp_ratio >= 2.5:
            score += 8
            reasons.append(f"Strong bullish options flow (C/P={cp_ratio:.1f}×)")
        elif cp_ratio >= 1.8:
            score += 4
            reasons.append(f"Bullish options flow (C/P={cp_ratio:.1f}×)")
        elif cp_ratio <= 0.4:
            score -= 8
            reasons.append(f"Strong bearish options flow (P/C={1/cp_ratio:.1f}×)")
        elif cp_ratio <= 0.6:
            score -= 4
            reasons.append(f"Bearish options flow (C/P={cp_ratio:.1f}×)")

    # IV skew: puts trading richer than calls = market pricing downside protection
    if iv_skew is not None:
        if iv_skew >= 1.3:
            score -= 5
            reasons.append(f"Bearish IV skew {iv_skew:.2f}× (put premium elevated)")
        elif iv_skew <= 0.9:
            score += 3
            reasons.append(f"Low IV skew {iv_skew:.2f}× (calls favoured)")

    return score, reasons


# ── 4. Yahoo Finance 13F — Institutional Ownership + Accumulation/Distribution ─

async def fetch_13f_ownership(ticker: str) -> Dict[str, Any]:
    """
    Fetch institutional ownership % and top holders from Yahoo Finance quoteSummary.
    Uses free Yahoo endpoints — no API key required.
    Returns ownership%, institution count, top-5 holders with any pct_change data.
    """
    url = f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{ticker.upper()}"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS) as client:
            r = await client.get(url, params={"modules": "institutionOwnership,majorHoldersBreakdown"})
            r.raise_for_status()
            data = r.json()
        result = data.get("quoteSummary", {}).get("result", [{}])[0]
    except Exception:
        return {}

    out: Dict[str, Any] = {}

    # Total institutional ownership (from majorHoldersBreakdown)
    mhb = result.get("majorHoldersBreakdown", {})
    inst_pct = mhb.get("institutionsPercentHeld", {}).get("raw")
    inst_count = mhb.get("numberOfInstitutionsHeld", {}).get("raw")
    if inst_pct is not None:
        out["institutions_pct"] = round(inst_pct * 100, 1)
    if inst_count is not None:
        out["institution_count"] = int(inst_count)

    # Individual top institutional holders with position change data
    holders_raw = result.get("institutionOwnership", {}).get("ownershipList", [])
    top_holders: List[Dict] = []
    for h in holders_raw[:5]:
        pct_held   = (h.get("pctHeld", {}) or {}).get("raw")
        pct_change = (h.get("pctChange", {}) or {}).get("raw")   # None if no prior period
        top_holders.append({
            "name":       h.get("organization", ""),
            "pct_held":   round(pct_held   * 100, 2) if pct_held   is not None else None,
            "pct_change": round(pct_change * 100, 2) if pct_change is not None else None,
        })
    out["top_holders"] = top_holders

    # Detect accumulation vs distribution from pct_change data
    changers    = [h for h in top_holders if h["pct_change"] is not None]
    increasing  = sum(1 for h in changers if h["pct_change"] >  0.5)
    decreasing  = sum(1 for h in changers if h["pct_change"] < -0.5)
    out["holders_increasing"] = increasing
    out["holders_decreasing"] = decreasing

    return out


def _score_13f_ownership(ownership: Dict[str, Any]) -> Tuple[int, List[str]]:
    """
    Convert institutional ownership data into a -10..+12 score.
    Signals: total institutional %, accumulation/distribution from pct_change.
    """
    if not ownership:
        return 0, []

    score   = 0
    reasons: List[str] = []

    inst_pct = ownership.get("institutions_pct")
    if inst_pct is not None:
        if inst_pct >= 80:
            score += 8
            reasons.append(f"High institutional ownership ({inst_pct:.0f}%)")
        elif inst_pct >= 60:
            score += 4
            reasons.append(f"Moderate institutional ownership ({inst_pct:.0f}%)")
        elif 0 < inst_pct < 20:
            score -= 5
            reasons.append(f"Low institutional ownership ({inst_pct:.0f}%)")

    increasing = ownership.get("holders_increasing", 0)
    decreasing = ownership.get("holders_decreasing", 0)

    if increasing >= 2 and increasing > decreasing:
        score += min(increasing * 2, 6)   # up to +6 for 3+ holders adding
        reasons.append(f"Institutional accumulation ({increasing} top holders increasing positions)")
    elif decreasing >= 2 and decreasing > increasing:
        score -= min(decreasing * 2, 6)   # down to -6 for 3+ holders cutting
        reasons.append(f"Institutional distribution ({decreasing} top holders reducing positions)")

    return score, reasons


# ── 5. Scoring function ───────────────────────────────────────────────────────

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


# ── 6. Main API ───────────────────────────────────────────────────────────────

async def get_institutional_signal(ticker: str) -> Dict[str, Any]:
    """
    Return institutional signal score + details for one ticker.
    Cached for 4h — these signals don't change cycle-to-cycle.
    Sources: Form 4 insider trades, Yahoo analyst/short data, options flow, 13F ownership.
    """
    ticker = ticker.upper()
    cached = _cache.get(ticker)
    if cached and time.time() - cached["ts"] < _CACHE_TTL:
        return cached["data"]

    insider_trades, yahoo_data, options_data, ownership_data = await asyncio.gather(
        fetch_insider_trades(ticker, days=30),
        fetch_yahoo_institutional(ticker),
        fetch_options_flow(ticker),
        fetch_13f_ownership(ticker),
        return_exceptions=True,
    )

    if isinstance(insider_trades,  Exception): insider_trades  = []
    if isinstance(yahoo_data,      Exception): yahoo_data      = {}
    if isinstance(options_data,    Exception): options_data    = {}
    if isinstance(ownership_data,  Exception): ownership_data  = {}

    inst_score, inst_reasons  = _score_institutional(insider_trades, yahoo_data)
    opts_score, opts_reasons  = _score_options_flow(options_data)
    own_score,  own_reasons   = _score_13f_ownership(ownership_data)
    score = inst_score + opts_score + own_score

    result = {
        "ticker": ticker,
        "score": score,
        "insider_buys":             len([t for t in insider_trades if t["type"] == "BUY"]),
        "insider_sells":            len([t for t in insider_trades if t["type"] == "SELL"]),
        "analyst_consensus":        yahoo_data.get("analyst_consensus", "N/A"),
        "analyst_buy_pct":          yahoo_data.get("analyst_buy_pct"),
        "price_target_upside_pct":  yahoo_data.get("price_target_upside_pct"),
        "short_float_pct":          yahoo_data.get("short_float_pct"),
        "short_squeeze_candidate":  yahoo_data.get("short_squeeze_candidate", False),
        "yahoo_recommendation":     yahoo_data.get("yahoo_recommendation", ""),
        "options_flow": {
            "call_put_ratio":    options_data.get("call_put_vol_ratio"),
            "unusual_calls":     options_data.get("unusual_calls_count", 0),
            "unusual_puts":      options_data.get("unusual_puts_count",  0),
            "iv_skew":           options_data.get("iv_skew"),
            "top_unusual_calls": options_data.get("unusual_calls", []),
            "top_unusual_puts":  options_data.get("unusual_puts",  []),
        },
        "institutional_ownership": {
            "institutions_pct":   ownership_data.get("institutions_pct"),
            "institution_count":  ownership_data.get("institution_count"),
            "holders_increasing": ownership_data.get("holders_increasing", 0),
            "holders_decreasing": ownership_data.get("holders_decreasing", 0),
            "top_holders":        ownership_data.get("top_holders", []),
        },
        "signals":               inst_reasons + opts_reasons + own_reasons,
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
