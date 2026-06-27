import asyncio
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; InvestAgent/6.0)"}
_TIMEOUT = 8


async def _get(url: str, params: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS) as client:
        r = await client.get(url, params=params)
        r.raise_for_status()
        return r.json()


async def fetch_quote(ticker: str) -> Dict[str, Any]:
    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
        data = await _get(url, {"range": "1d", "interval": "5m"})
        result = data.get("chart", {}).get("result", [{}])[0]
        meta = result.get("meta", {})
        timestamps = result.get("timestamp", [])
        closes = (result.get("indicators", {}).get("quote", [{}])[0].get("close") or [])
        volumes = (result.get("indicators", {}).get("quote", [{}])[0].get("volume") or [])
        valid_closes = [c for c in closes if c is not None]
        valid_volumes = [v for v in volumes if v is not None]
        prev_close = meta.get("previousClose") or meta.get("chartPreviousClose") or 0
        last = meta.get("regularMarketPrice") or (valid_closes[-1] if valid_closes else 0)
        change_pct = round((last - prev_close) / prev_close * 100, 2) if prev_close else 0
        avg_vol_20 = meta.get("regularMarketVolume", 0)
        recent_vol = valid_volumes[-1] if valid_volumes else avg_vol_20
        rvol = round(recent_vol / avg_vol_20, 2) if avg_vol_20 else 1.0
        sma20 = round(sum(valid_closes[-20:]) / min(20, len(valid_closes)), 2) if valid_closes else last
        above_sma20 = last > sma20 if sma20 else True
        rsi = _compute_rsi(valid_closes)
        return {
            "ticker": ticker.upper(),
            "price": round(last, 2),
            "prev_close": round(prev_close, 2),
            "change_pct": change_pct,
            "volume": recent_vol,
            "rvol": rvol,
            "sma20": sma20,
            "above_sma20": above_sma20,
            "rsi": rsi,
            "52w_high": meta.get("fiftyTwoWeekHigh"),
            "52w_low": meta.get("fiftyTwoWeekLow"),
            "market_cap": meta.get("marketCap"),
            "currency": meta.get("currency", "USD"),
            "exchange": meta.get("exchangeName", ""),
            "as_of": datetime.now(timezone.utc).isoformat(),
            "source": "yahoo",
            "ok": True,
        }
    except Exception as e:
        return {"ticker": ticker.upper(), "ok": False, "error": str(e), "price": 0, "change_pct": 0}


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
    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 1)


async def fetch_quotes(tickers: List[str]) -> Dict[str, Dict[str, Any]]:
    tasks = [fetch_quote(t) for t in tickers]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    out = {}
    for ticker, res in zip(tickers, results):
        out[ticker.upper()] = res if isinstance(res, dict) else {"ticker": ticker.upper(), "ok": False, "error": str(res)}
    return out


async def fetch_macro() -> Dict[str, Any]:
    indices = {"^GSPC": "SP500", "^NDX": "NDX100", "^RUT": "Russell2K", "^VIX": "VIX", "^TNX": "US10Y", "DX-Y.NYB": "DXY", "BTC-USD": "BTC"}
    tasks = {alias: fetch_quote(sym) for sym, alias in indices.items()}
    results = {}
    for alias, coro in tasks.items():
        results[alias] = await coro
    vix = results.get("VIX", {}).get("price", 18.4)
    us10y = results.get("US10Y", {}).get("price", 4.43)
    dxy = results.get("DXY", {}).get("price", 104.1)
    btc = results.get("BTC", {}).get("price", 102400)
    macro_regime = _classify_regime(vix, us10y, dxy)
    return {
        "vix": vix,
        "us10y": us10y,
        "dxy": dxy,
        "btc": btc,
        "sp500_chg": results.get("SP500", {}).get("change_pct", 0),
        "ndx_chg": results.get("NDX100", {}).get("change_pct", 0),
        "regime": macro_regime,
        "hostile": vix > 25 or us10y > 4.65,
        "as_of": datetime.now(timezone.utc).isoformat(),
        "indices": results,
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


async def fetch_news_sentiment(tickers: List[str]) -> Dict[str, List[Dict]]:
    out: Dict[str, List[Dict]] = {}
    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS) as client:
        for ticker in tickers:
            url = f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={ticker}&region=US&lang=en-US"
            try:
                r = await client.get(url)
                root = ET.fromstring(r.text)
                items = []
                for item in root.findall(".//item")[:5]:
                    title_el = item.find("title")
                    pub_el = item.find("pubDate")
                    items.append({
                        "title": title_el.text if title_el is not None else "",
                        "published": pub_el.text if pub_el is not None else "",
                    })
                out[ticker.upper()] = items
            except Exception:
                out[ticker.upper()] = []
    return out
