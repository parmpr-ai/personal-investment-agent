import asyncio
import os
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; InvestAgent/6.0)"}
_TIMEOUT = 8

# Optional API keys for data source fallbacks
_FINNHUB_KEY: str = os.environ.get("FINNHUB_API_KEY", "")
_AV_KEY: str = os.environ.get("ALPHA_VANTAGE_API_KEY", "")

# Sector ETFs for rotation detection
SECTOR_ETFS = {
    "XLK": "Tech", "XLF": "Financials", "XLE": "Energy",
    "XLV": "Healthcare", "XLY": "ConsumerDisc", "XLI": "Industrials",
    "XLC": "Comms", "XLRE": "RealEstate", "XLB": "Materials",
}

# Yahoo Chart hosts — tried in order; first success wins
_YAHOO_HOSTS = [
    "query1.finance.yahoo.com",
    "query2.finance.yahoo.com",
]


async def _get(url: str, params: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS) as client:
        r = await client.get(url, params=params)
        r.raise_for_status()
        return r.json()


async def _yahoo_chart(ticker: str, params: dict) -> dict:
    """Try query1 then query2 Yahoo Finance endpoints."""
    last_exc: Exception = RuntimeError("no hosts")
    for host in _YAHOO_HOSTS:
        try:
            url = f"https://{host}/v8/finance/chart/{ticker}"
            return await _get(url, params)
        except Exception as exc:
            last_exc = exc
    raise last_exc


async def _finnhub_quote(ticker: str) -> Optional[Dict[str, Any]]:
    """Finnhub real-time quote fallback (requires FINNHUB_API_KEY)."""
    if not _FINNHUB_KEY:
        return None
    try:
        data = await _get(
            "https://finnhub.io/api/v1/quote",
            {"symbol": ticker, "token": _FINNHUB_KEY},
        )
        c, pc = data.get("c", 0), data.get("pc", 0)
        if not c:
            return None
        change_pct = round((c - pc) / pc * 100, 2) if pc else 0
        return {
            "ticker": ticker.upper(), "price": round(c, 2),
            "prev_close": round(pc, 2), "change_pct": change_pct,
            "volume": data.get("v") or 0, "rvol": 1.0,
            "sma20": round(c, 2), "above_sma20": True,
            "rsi": None, "52w_high": data.get("h") or c,
            "52w_low": data.get("l") or c,
            "pct_from_52w_high": 0, "near_52w_high": False, "near_52w_low": False,
            "market_cap": None, "currency": "USD", "exchange": "FINNHUB",
            "as_of": datetime.now(timezone.utc).isoformat(),
            "source": "finnhub", "ok": True,
            "vwap": None, "above_vwap": None, "vwap_pct": None, "zscore": None,
        }
    except Exception:
        return None


async def _av_daily(ticker: str, days: int = 60) -> Optional[Dict[str, Any]]:
    """Alpha Vantage daily OHLCV fallback (requires ALPHA_VANTAGE_API_KEY, free = 25 req/day)."""
    if not _AV_KEY:
        return None
    try:
        data = await _get(
            "https://www.alphavantage.co/query",
            {"function": "TIME_SERIES_DAILY", "symbol": ticker,
             "outputsize": "compact", "apikey": _AV_KEY},
        )
        ts = data.get("Time Series (Daily)", {})
        if not ts:
            return None
        dates = sorted(ts.keys(), reverse=True)[:days]
        closes = [float(ts[d]["4. close"]) for d in reversed(dates)]
        highs  = [float(ts[d]["2. high"])  for d in reversed(dates)]
        lows   = [float(ts[d]["3. low"])   for d in reversed(dates)]
        if not closes:
            return None
        last = closes[-1]
        sma20 = sum(closes[-20:]) / min(20, len(closes))
        sma50 = sum(closes[-50:]) / min(50, len(closes))
        slope = (closes[-1] - closes[-5]) / closes[-5] * 100 if len(closes) >= 5 else 0
        adx = _compute_adx(highs, lows, closes)
        atr = _compute_atr_last(highs, lows, closes)
        return {
            "ticker": ticker.upper(), "ok": True, "closes": closes,
            "sma20_daily": round(sma20, 2), "sma50_daily": round(sma50, 2),
            "above_sma20_daily": last > sma20, "above_sma50_daily": last > sma50,
            "golden_cross": sma20 > sma50,
            "trend_5d_pct": round(slope, 2),
            "trend_direction": "UP" if slope > 1 else ("DOWN" if slope < -1 else "FLAT"),
            "adx": adx, "strong_trend": adx is not None and adx > 25,
            "atr": round(atr, 4) if atr else None,
            "atr_pct": round(atr / last * 100, 2) if atr and last else None,
            "zscore_daily": _compute_zscore(closes),
            "source": "alphavantage",
        }
    except Exception:
        return None


async def fetch_quote(ticker: str) -> Dict[str, Any]:
    """Fetch intraday quote + indicators. Tries Yahoo query1→query2→Finnhub fallback."""
    try:
        data = await _yahoo_chart(ticker, {"range": "1d", "interval": "5m"})
        result = data.get("chart", {}).get("result", [{}])[0]
        meta = result.get("meta", {})
        closes = (result.get("indicators", {}).get("quote", [{}])[0].get("close") or [])
        volumes = (result.get("indicators", {}).get("quote", [{}])[0].get("volume") or [])
        valid_closes = [c for c in closes if c is not None]
        valid_volumes = [v for v in volumes if v is not None]
        prev_close = meta.get("previousClose") or meta.get("chartPreviousClose") or 0
        last = meta.get("regularMarketPrice") or (valid_closes[-1] if valid_closes else 0)
        change_pct = round((last - prev_close) / prev_close * 100, 2) if prev_close else 0
        avg_vol = meta.get("regularMarketVolume", 0)
        recent_vol = valid_volumes[-1] if valid_volumes else avg_vol
        rvol = round(recent_vol / avg_vol, 2) if avg_vol else 1.0
        sma20 = round(sum(valid_closes[-20:]) / min(20, len(valid_closes)), 2) if valid_closes else last
        rsi = _compute_rsi(valid_closes)
        w52_high = meta.get("fiftyTwoWeekHigh") or last
        w52_low = meta.get("fiftyTwoWeekLow") or last
        w52_range = w52_high - w52_low
        pct_from_high = round((w52_high - last) / w52_range * 100, 1) if w52_range else 0
        # Intraday technicals from 5m bars
        vwap = _compute_vwap(valid_closes, valid_volumes)
        bb = _compute_bollinger(valid_closes)
        macd = _compute_macd(valid_closes)
        zscore = _compute_zscore(valid_closes)
        out = {
            "ticker": ticker.upper(),
            "price": round(last, 2),
            "prev_close": round(prev_close, 2),
            "change_pct": change_pct,
            "volume": recent_vol,
            "rvol": rvol,
            "sma20": sma20,
            "above_sma20": last > sma20 if sma20 else True,
            "rsi": rsi,
            "52w_high": w52_high,
            "52w_low": w52_low,
            "pct_from_52w_high": pct_from_high,
            "near_52w_high": pct_from_high < 5,
            "near_52w_low": pct_from_high > 85,
            "market_cap": meta.get("marketCap"),
            "currency": meta.get("currency", "USD"),
            "exchange": meta.get("exchangeName", ""),
            "as_of": datetime.now(timezone.utc).isoformat(),
            "source": "yahoo",
            "ok": True,
            # VWAP
            "vwap": vwap,
            "above_vwap": (last > vwap) if vwap else None,
            "vwap_pct": round((last - vwap) / vwap * 100, 2) if vwap else None,
            # Z-score (intraday)
            "zscore": zscore,
        }
        out.update(bb)   # bb_upper, bb_lower, bb_pct, bb_width, bb_squeeze, near_bb_lower, near_bb_upper
        out.update(macd) # macd, macd_signal, macd_hist, macd_bullish, macd_crossover, macd_hist_rising
        return out
    except Exception as e:
        # Finnhub fallback for real-time price when Yahoo is unavailable
        fb = await _finnhub_quote(ticker)
        if fb:
            return fb
        return {"ticker": ticker.upper(), "ok": False, "error": str(e), "price": 0, "change_pct": 0}


async def fetch_quote_daily(ticker: str, days: int = 60) -> Dict[str, Any]:
    """Fetch daily OHLCV for trend/ADX/SMA50. Tries Yahoo query1→query2→Alpha Vantage fallback."""
    try:
        data = await _yahoo_chart(ticker, {"range": f"{days}d", "interval": "1d"})
        result = data.get("chart", {}).get("result", [{}])[0]
        q = result.get("indicators", {}).get("quote", [{}])[0]
        highs = [h for h in (q.get("high") or []) if h is not None]
        lows  = [l for l in (q.get("low")  or []) if l is not None]
        closes = [c for c in (q.get("close") or []) if c is not None]
        if not closes:
            return {"ticker": ticker.upper(), "ok": False, "error": "no daily data"}
        sma20 = sum(closes[-20:]) / min(20, len(closes)) if len(closes) >= 5 else closes[-1]
        sma50 = sum(closes[-50:]) / min(50, len(closes)) if len(closes) >= 10 else closes[-1]
        last = closes[-1]
        # 5-day trend: slope of last 5 closes
        if len(closes) >= 5:
            slope = (closes[-1] - closes[-5]) / closes[-5] * 100
        else:
            slope = 0
        adx = _compute_adx(highs, lows, closes)
        atr = _compute_atr_last(highs, lows, closes)
        bb_daily = _compute_bollinger(closes)
        macd_daily = _compute_macd(closes)
        zscore_daily = _compute_zscore(closes)
        out = {
            "ticker": ticker.upper(),
            "ok": True,
            "closes": closes,
            "sma20_daily": round(sma20, 2),
            "sma50_daily": round(sma50, 2),
            "above_sma20_daily": last > sma20,
            "above_sma50_daily": last > sma50,
            "golden_cross": sma20 > sma50,
            "trend_5d_pct": round(slope, 2),
            "trend_direction": "UP" if slope > 1 else ("DOWN" if slope < -1 else "FLAT"),
            "adx": adx,
            "strong_trend": adx is not None and adx > 25,
            "atr": round(atr, 4) if atr else None,
            "atr_pct": round(atr / last * 100, 2) if atr and last else None,
            "zscore_daily": zscore_daily,
        }
        # prefix daily Bollinger/MACD keys to avoid clash with intraday
        for k, v in bb_daily.items():
            out[f"{k}_daily"] = v
        for k, v in macd_daily.items():
            out[f"{k}_daily"] = v
        return out
    except Exception as e:
        # Alpha Vantage fallback for daily OHLCV when Yahoo is unavailable
        av = await _av_daily(ticker, days)
        if av:
            return av
        return {"ticker": ticker.upper(), "ok": False, "error": str(e)}


def _compute_macd(closes: list, fast: int = 12, slow: int = 26, signal: int = 9) -> Dict[str, Any]:
    """MACD line, signal line, histogram, crossover flags."""
    if len(closes) < slow + signal:
        return {}
    def ema(data: list, period: int) -> list:
        k = 2 / (period + 1)
        r = [data[0]]
        for v in data[1:]:
            r.append(v * k + r[-1] * (1 - k))
        return r
    ef = ema(closes, fast)
    es = ema(closes, slow)
    macd_line = [f - s for f, s in zip(ef[slow - 1:], es[slow - 1:])]
    if len(macd_line) < signal:
        return {}
    sig_line = ema(macd_line, signal)
    hist = [m - s for m, s in zip(macd_line, sig_line)]
    lm, ls, lh = macd_line[-1], sig_line[-1], hist[-1]
    ph = hist[-2] if len(hist) >= 2 else 0
    pm, ps = macd_line[-2] if len(macd_line) >= 2 else lm, sig_line[-2] if len(sig_line) >= 2 else ls
    return {
        "macd": round(lm, 4),
        "macd_signal": round(ls, 4),
        "macd_hist": round(lh, 4),
        "macd_bullish": lm > ls,
        "macd_crossover": lm > ls and pm <= ps,   # just crossed bullish
        "macd_crossunder": lm < ls and pm >= ps,  # just crossed bearish
        "macd_hist_rising": lh > ph,
    }


def _compute_bollinger(closes: list, period: int = 20, std_mult: float = 2.0) -> Dict[str, Any]:
    """Bollinger Bands: SMA ± 2*std. Returns band position (bb_pct), width, squeeze flag."""
    if len(closes) < period:
        return {}
    window = closes[-period:]
    sma = sum(window) / period
    std = (sum((c - sma) ** 2 for c in window) / period) ** 0.5
    upper = sma + std_mult * std
    lower = sma - std_mult * std
    last = closes[-1]
    band_width = (upper - lower) / sma if sma else 0
    bb_pct = (last - lower) / (upper - lower) if upper != lower else 0.5
    return {
        "bb_upper": round(upper, 2),
        "bb_lower": round(lower, 2),
        "bb_mid": round(sma, 2),
        "bb_width": round(band_width * 100, 2),
        "bb_pct": round(bb_pct, 3),      # 0=at lower band, 1=at upper band
        "bb_squeeze": band_width < 0.04,  # tight bands → breakout likely
        "above_bb_upper": last > upper,
        "below_bb_lower": last < lower,
        "near_bb_lower": bb_pct < 0.15,
        "near_bb_upper": bb_pct > 0.85,
    }


def _compute_vwap(closes: list, volumes: list) -> Optional[float]:
    """VWAP = Σ(price × volume) / Σ(volume) across all intraday bars."""
    pairs = [(c, v) for c, v in zip(closes, volumes) if c is not None and v and v > 0]
    if not pairs:
        return None
    total_vol = sum(v for _, v in pairs)
    return round(sum(c * v for c, v in pairs) / total_vol, 2) if total_vol else None


def _compute_zscore(closes: list, period: int = 20) -> Optional[float]:
    """Z-score: how many std deviations is price from its SMA (mean-reversion signal)."""
    if len(closes) < period:
        return None
    window = closes[-period:]
    sma = sum(window) / period
    std = (sum((c - sma) ** 2 for c in window) / period) ** 0.5
    return round((closes[-1] - sma) / std, 2) if std else 0.0


def _compute_atr_last(highs: list, lows: list, closes: list, period: int = 14) -> Optional[float]:
    """Return the most recent ATR value (absolute price units)."""
    n = min(len(highs), len(lows), len(closes))
    if n < period + 1:
        return None
    highs, lows, closes = highs[-n:], lows[-n:], closes[-n:]
    tr_list = [
        max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1]))
        for i in range(1, n)
    ]
    atr = sum(tr_list[:period])
    for v in tr_list[period:]:
        atr = atr - atr / period + v
    return atr / period  # Wilder smoothing approximation


def _compute_rsi(closes: list, period: int = 14) -> Optional[float]:
    if len(closes) < period + 1:
        return None
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains = [max(d, 0) for d in deltas[-period:]]
    losses = [abs(min(d, 0)) for d in deltas[-period:]]
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    if avg_loss == 0:
        return 100.0
    return round(100 - (100 / (1 + avg_gain / avg_loss)), 1)


def _compute_adx(highs: list, lows: list, closes: list, period: int = 14) -> Optional[float]:
    """Average Directional Index — measures trend strength (>25 = strong trend)."""
    n = min(len(highs), len(lows), len(closes))
    if n < period + 2:
        return None
    highs, lows, closes = highs[-n:], lows[-n:], closes[-n:]
    plus_dm, minus_dm, tr_list = [], [], []
    for i in range(1, n):
        up   = highs[i]  - highs[i-1]
        down = lows[i-1] - lows[i]
        plus_dm.append(up   if up > down and up > 0 else 0)
        minus_dm.append(down if down > up and down > 0 else 0)
        tr = max(highs[i] - lows[i], abs(highs[i] - closes[i-1]), abs(lows[i] - closes[i-1]))
        tr_list.append(tr)
    def smooth(lst):
        s = sum(lst[:period])
        result = [s]
        for v in lst[period:]:
            s = s - s / period + v
            result.append(s)
        return result
    atr   = smooth(tr_list)
    s_pdm = smooth(plus_dm)
    s_mdm = smooth(minus_dm)
    dx_list = []
    for a, p, m in zip(atr, s_pdm, s_mdm):
        if a == 0:
            continue
        di_plus  = 100 * p / a
        di_minus = 100 * m / a
        denom = di_plus + di_minus
        dx_list.append(100 * abs(di_plus - di_minus) / denom if denom else 0)
    if not dx_list:
        return None
    return round(sum(dx_list[-period:]) / min(period, len(dx_list)), 1)


def _relative_strength(ticker_closes: list, spy_closes: list, days: int = 20) -> Optional[float]:
    """RS = stock return / SPY return over N days. >1.0 = outperforming."""
    if len(ticker_closes) < days + 1 or len(spy_closes) < days + 1:
        return None
    t_ret = (ticker_closes[-1] - ticker_closes[-days]) / ticker_closes[-days]
    s_ret = (spy_closes[-1]  - spy_closes[-days])  / spy_closes[-days]
    if s_ret == 0:
        return None
    return round(t_ret / abs(s_ret) if s_ret < 0 else t_ret / s_ret, 2)


async def fetch_enhanced_quotes(tickers: List[str]) -> Dict[str, Dict[str, Any]]:
    """
    Returns intraday quote enriched with daily trend, ADX, relative strength vs SPY.
    Runs all fetches concurrently.
    """
    all_tickers = list(set(tickers + ["SPY"]))
    intraday_tasks  = [fetch_quote(t) for t in all_tickers]
    daily_tasks     = [fetch_quote_daily(t, 60) for t in all_tickers]

    intraday_results, daily_results = await asyncio.gather(
        asyncio.gather(*intraday_tasks, return_exceptions=True),
        asyncio.gather(*daily_tasks,    return_exceptions=True),
    )

    intraday = {}
    for t, r in zip(all_tickers, intraday_results):
        intraday[t.upper()] = r if isinstance(r, dict) else {"ok": False, "error": str(r)}

    daily = {}
    for t, r in zip(all_tickers, daily_results):
        daily[t.upper()] = r if isinstance(r, dict) else {"ok": False, "error": str(r)}

    spy_closes = daily.get("SPY", {}).get("closes", [])

    out = {}
    for ticker in tickers:
        t = ticker.upper()
        base = intraday.get(t, {"ok": False})
        d    = daily.get(t, {})
        if d.get("ok"):
            base.update({
                "sma20_daily":          d.get("sma20_daily"),
                "sma50_daily":          d.get("sma50_daily"),
                "above_sma20_daily":    d.get("above_sma20_daily"),
                "above_sma50_daily":    d.get("above_sma50_daily"),
                "golden_cross":         d.get("golden_cross"),
                "trend_5d_pct":         d.get("trend_5d_pct"),
                "trend_direction":      d.get("trend_direction"),
                "adx":                  d.get("adx"),
                "strong_trend":         d.get("strong_trend"),
                "rs_vs_spy":            _relative_strength(d.get("closes", []), spy_closes),
                # New: ATR, daily Bollinger, daily MACD, daily z-score
                "atr":                  d.get("atr"),
                "atr_pct":              d.get("atr_pct"),
                "zscore_daily":         d.get("zscore_daily"),
                "bb_upper_daily":       d.get("bb_upper_daily"),
                "bb_lower_daily":       d.get("bb_lower_daily"),
                "bb_pct_daily":         d.get("bb_pct_daily"),
                "bb_width_daily":       d.get("bb_width_daily"),
                "bb_squeeze_daily":     d.get("bb_squeeze_daily"),
                "near_bb_lower_daily":  d.get("near_bb_lower_daily"),
                "near_bb_upper_daily":  d.get("near_bb_upper_daily"),
                "macd_daily":           d.get("macd_daily"),
                "macd_signal_daily":    d.get("macd_signal_daily"),
                "macd_hist_daily":      d.get("macd_hist_daily"),
                "macd_bullish_daily":   d.get("macd_bullish_daily"),
                "macd_crossover_daily": d.get("macd_crossover_daily"),
                "macd_crossunder_daily":d.get("macd_crossunder_daily"),
                "macd_hist_rising_daily":d.get("macd_hist_rising_daily"),
            })
        out[t] = base
    return out


async def fetch_sector_momentum() -> Dict[str, Any]:
    """Fetch all sector ETFs to detect rotation — which sectors are hot."""
    tasks = [fetch_quote(etf) for etf in SECTOR_ETFS]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    sectors = {}
    for etf, res in zip(SECTOR_ETFS.keys(), results):
        if isinstance(res, dict) and res.get("ok"):
            sectors[etf] = {
                "name": SECTOR_ETFS[etf],
                "change_pct": res.get("change_pct", 0),
                "above_sma20": res.get("above_sma20", False),
                "rvol": res.get("rvol", 1.0),
                "rsi": res.get("rsi"),
            }
    # Rank by day change
    ranked = sorted(sectors.items(), key=lambda x: x[1]["change_pct"], reverse=True)
    top_sectors    = [v["name"] for _, v in ranked[:3]]
    bottom_sectors = [v["name"] for _, v in ranked[-3:]]
    return {
        "sectors": sectors,
        "top_sectors": top_sectors,
        "bottom_sectors": bottom_sectors,
        "rotation_signal": top_sectors[0] if top_sectors else "Unknown",
    }


async def fetch_macro() -> Dict[str, Any]:
    indices = {
        "^GSPC": "SP500", "^NDX": "NDX100", "^RUT": "Russell2K",
        "^VIX": "VIX", "^TNX": "US10Y", "DX-Y.NYB": "DXY", "BTC-USD": "BTC",
    }
    tasks = {alias: fetch_quote(sym) for sym, alias in indices.items()}
    results = {alias: await coro for alias, coro in tasks.items()}
    vix   = results.get("VIX",   {}).get("price", 18.4)
    us10y = results.get("US10Y", {}).get("price", 4.43)
    dxy   = results.get("DXY",   {}).get("price", 104.1)
    btc   = results.get("BTC",   {}).get("price", 102400)
    return {
        "vix": vix, "us10y": us10y, "dxy": dxy, "btc": btc,
        "sp500_chg": results.get("SP500", {}).get("change_pct", 0),
        "ndx_chg":   results.get("NDX100", {}).get("change_pct", 0),
        "regime":    _classify_regime(vix, us10y, dxy),
        "hostile":   vix > 25 or us10y > 4.65,
        "as_of":     datetime.now(timezone.utc).isoformat(),
        "indices":   results,
    }


def _classify_regime(vix: float, us10y: float, dxy: float) -> str:
    if vix > 30:
        return "RISK_OFF_EXTREME"
    if vix > 22:
        return "RISK_OFF"
    if vix < 15 and us10y < 4.3:
        return "RISK_ON_STRONG"
    if vix < 20:
        return "RISK_ON"
    return "NEUTRAL"


async def fetch_quotes(tickers: List[str]) -> Dict[str, Dict[str, Any]]:
    """Backward-compatible simple fetch (intraday only)."""
    tasks = [fetch_quote(t) for t in tickers]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return {
        t.upper(): (r if isinstance(r, dict) else {"ticker": t.upper(), "ok": False, "error": str(r)})
        for t, r in zip(tickers, results)
    }


async def fetch_news_sentiment(tickers: List[str]) -> Dict[str, List[Dict]]:
    out: Dict[str, List[Dict]] = {}
    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS) as client:
        for ticker in tickers:
            url = f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={ticker}&region=US&lang=en-US"
            try:
                r = await client.get(url)
                root = ET.fromstring(r.text)
                out[ticker.upper()] = [
                    {"title": (item.findtext("title") or ""), "published": (item.findtext("pubDate") or "")}
                    for item in root.findall(".//item")[:5]
                ]
            except Exception:
                out[ticker.upper()] = []
    return out
