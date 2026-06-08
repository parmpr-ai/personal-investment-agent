import os
import time
from typing import Any, Dict, List
import httpx
import feedparser
from dotenv import load_dotenv

from services.settings_store import get_settings

load_dotenv()


class InstrumentSearchError(Exception):
    pass


def _result(source: str, ok: bool, message: str, data_received: bool = False, sample: Any = None, latency_ms: int = 0):
    return {
        "source": source,
        "ok": ok,
        "status": "healthy" if ok and data_received else ("connected_no_data" if ok else "failed"),
        "message": message,
        "data_received": data_received,
        "sample": sample,
        "latency_ms": latency_ms,
        "checked_at": int(time.time()),
    }


def test_ibkr(settings: Dict[str, Any] | None = None):
    t0 = time.time()
    cfg = (settings or get_settings()).get("ibkr", {})
    host = cfg.get("host") or os.getenv("IBKR_HOST", "127.0.0.1")
    port = int(cfg.get("port") or os.getenv("IBKR_PORT", "4001"))
    # Lightweight socket-level health check. This avoids creating extra IBKR API client sessions
    # just by opening the Health Monitor. Real portfolio pulls still use ib_insync.
    try:
        import socket
        with socket.create_connection((host, port), timeout=2):
            pass
        return _result("IBKR", True, f"IBKR socket reachable at {host}:{port}. Portfolio pull uses read-only client when enabled.", True, {"host": host, "port": port}, int((time.time()-t0)*1000))
    except Exception as e:
        return _result("IBKR", False, f"IBKR socket not reachable at {host}:{port}: {e}", False, {"host": host, "port": port}, int((time.time()-t0)*1000))


def test_yahoo(settings: Dict[str, Any] | None = None):
    t0 = time.time()
    cfg = (settings or get_settings()).get("yahoo", {})
    ticker = cfg.get("test_ticker", "AMD") or "AMD"
    url = f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={ticker}&region=US&lang=en-US"
    try:
        feed = feedparser.parse(url)
        entries = getattr(feed, "entries", [])
        sample = [{"title": e.get("title"), "link": e.get("link")} for e in entries[:3]]
        return _result("Yahoo Finance", True, f"Yahoo RSS checked for {ticker}", len(entries) > 0, sample, int((time.time()-t0)*1000))
    except Exception as e:
        return _result("Yahoo Finance", False, f"Yahoo failed: {e}", False, None, int((time.time()-t0)*1000))


def yahoo_news(ticker: str, limit: int = 8) -> List[Dict[str, Any]]:
    url = f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={ticker}&region=US&lang=en-US"
    try:
        feed = feedparser.parse(url)
        return [
            {"source": "Yahoo", "ticker": ticker.upper(), "title": e.get("title", ""), "link": e.get("link", ""), "published": e.get("published", "")}
            for e in feed.entries[:limit]
        ]
    except Exception:
        return []


_LOGO_URLS = {
    "AAPL": "https://companiesmarketcap.com/img/company-logos/64/AAPL.png",
    "AMD": "https://companiesmarketcap.com/img/company-logos/64/AMD.png",
    "GOOGL": "https://companiesmarketcap.com/img/company-logos/64/GOOG.png",
    "GOOG": "https://companiesmarketcap.com/img/company-logos/64/GOOG.png",
    "META": "https://companiesmarketcap.com/img/company-logos/64/META.png",
    "MSFT": "https://companiesmarketcap.com/img/company-logos/64/MSFT.png",
    "NVDA": "https://companiesmarketcap.com/img/company-logos/64/NVDA.png",
    "SOFI": "https://companiesmarketcap.com/img/company-logos/64/SOFI.png",
    "TSLA": "https://companiesmarketcap.com/img/company-logos/64/TSLA.png",
    "TSM": "https://companiesmarketcap.com/img/company-logos/64/TSM.png",
}

_COMPANY_NAMES = {
    "AAPL": "Apple",
    "AMD": "Advanced Micro Devices",
    "GOOGL": "Alphabet",
    "GOOG": "Alphabet",
    "META": "Meta Platforms",
    "MSFT": "Microsoft",
    "NVDA": "NVIDIA",
    "SOFI": "SoFi Technologies",
    "TSLA": "Tesla",
    "TSM": "Taiwan Semiconductor",
}


def _last_present(values: Any) -> Any:
    if isinstance(values, list):
        for value in reversed(values):
            if value is not None and value != "":
                return value
    return None


def _first_present(values: Any) -> Any:
    if isinstance(values, list):
        for value in values:
            if value is not None and value != "":
                return value
    return None


def _numbers(values: Any) -> List[float]:
    if not isinstance(values, list):
        return []
    rows: List[float] = []
    for value in values:
        try:
            if value is not None:
                rows.append(float(value))
        except (TypeError, ValueError):
            continue
    return rows


_YAHOO_HEADERS = {"User-Agent": "Mozilla/5.0", "Accept": "application/json,text/plain,*/*"}
_YAHOO_AUTH: tuple[float, str, Dict[str, str]] | None = None
_YAHOO_QUOTE_CACHE: dict[str, tuple[float, Dict[str, Any]]] = {}
_YAHOO_RECOMMENDATION_CACHE: dict[str, tuple[float, Dict[str, Any]]] = {}
_YAHOO_AUTH_SECONDS = 1800
_YAHOO_QUOTE_SECONDS = 300


def _number_or_none(value: Any) -> float | None:
    try:
        if value is None or value == "":
            return None
        parsed = float(value)
        return parsed if parsed == parsed else None
    except (TypeError, ValueError):
        return None


def _raw_yahoo_value(value: Any) -> Any:
    if isinstance(value, dict) and "raw" in value:
        return value.get("raw")
    return value


def _yahoo_auth(force: bool = False) -> tuple[str, Dict[str, str]]:
    global _YAHOO_AUTH
    now = time.time()
    if not force and _YAHOO_AUTH and now - _YAHOO_AUTH[0] < _YAHOO_AUTH_SECONDS:
        return _YAHOO_AUTH[1], _YAHOO_AUTH[2]
    with httpx.Client(headers=_YAHOO_HEADERS, timeout=8, follow_redirects=True) as client:
        try:
            client.get("https://fc.yahoo.com")
        except Exception:
            pass
        client.get("https://finance.yahoo.com/quote/AAPL")
        crumb_response = client.get("https://query1.finance.yahoo.com/v1/test/getcrumb")
        crumb_response.raise_for_status()
        crumb = crumb_response.text.strip()
        if not crumb:
            raise ValueError("Yahoo crumb unavailable")
        cookies = dict(client.cookies)
        _YAHOO_AUTH = (now, crumb, cookies)
        return crumb, cookies


def _yahoo_quote_snapshot(symbol: str) -> Dict[str, Any]:
    key = symbol.upper()
    now = time.time()
    cached = _YAHOO_QUOTE_CACHE.get(key)
    if cached and now - cached[0] < _YAHOO_QUOTE_SECONDS:
        return cached[1]
    fields = ",".join(
        [
            "trailingPE",
            "epsTrailingTwelveMonths",
            "beta",
            "dividendYield",
            "marketCap",
            "sharesOutstanding",
            "floatShares",
            "targetMeanPrice",
            "targetHighPrice",
            "targetLowPrice",
            "targetMedianPrice",
            "recommendationMean",
            "recommendationKey",
            "numberOfAnalystOpinions",
            "averageAnalystRating",
        ]
    )
    for attempt in range(2):
        try:
            crumb, cookies = _yahoo_auth(force=attempt > 0)
            with httpx.Client(headers=_YAHOO_HEADERS, cookies=cookies, timeout=8, follow_redirects=True) as client:
                response = client.get(
                    "https://query1.finance.yahoo.com/v7/finance/quote",
                    params={"symbols": key, "fields": fields, "crumb": crumb},
                )
                if response.status_code == 401 and attempt == 0:
                    continue
                response.raise_for_status()
                data = response.json()
                quote = ((data.get("quoteResponse") or {}).get("result") or [{}])[0]
                _YAHOO_QUOTE_CACHE[key] = (now, quote)
                return quote
        except Exception:
            if attempt == 1:
                return {}
    return {}


def _yahoo_recommendation_snapshot(symbol: str) -> Dict[str, Any]:
    key = symbol.upper()
    now = time.time()
    cached = _YAHOO_RECOMMENDATION_CACHE.get(key)
    if cached and now - cached[0] < _YAHOO_QUOTE_SECONDS:
        return cached[1]
    for attempt in range(2):
        try:
            crumb, cookies = _yahoo_auth(force=attempt > 0)
            with httpx.Client(headers=_YAHOO_HEADERS, cookies=cookies, timeout=8, follow_redirects=True) as client:
                response = client.get(
                    f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{key}",
                    params={"modules": "recommendationTrend,financialData", "crumb": crumb},
                )
                if response.status_code == 401 and attempt == 0:
                    continue
                response.raise_for_status()
                data = response.json()
                result = (((data.get("quoteSummary") or {}).get("result") or [{}])[0] or {})
                trend = (((result.get("recommendationTrend") or {}).get("trend") or [{}])[0] or {})
                financial_data = result.get("financialData") or {}
                normalized = {name: _raw_yahoo_value(value) for name, value in financial_data.items()}
                normalized.update({name: _raw_yahoo_value(value) for name, value in trend.items()})
                _YAHOO_RECOMMENDATION_CACHE[key] = (now, normalized)
                return normalized
        except Exception:
            if attempt == 1:
                return {}
    return {}


def yahoo_fundamentals(ticker: str) -> Dict[str, Any]:
    # Free public endpoints are not guaranteed; this returns a robust schema with best-effort live values.
    # V5.6 intentionally avoids paid providers.
    symbol = ticker.upper().split()[0]
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=1d&interval=5m"
    out: Dict[str, Any] = {"source": "Yahoo chart", "ticker": symbol, "price": None, "currency": None, "status": "no_data"}
    logo_url = _LOGO_URLS.get(symbol)
    if logo_url:
        out["logo_url"] = logo_url
    if symbol in _COMPANY_NAMES:
        out["name"] = _COMPANY_NAMES[symbol]

    try:
        r = httpx.get(url, timeout=8, headers={"User-Agent": "Mozilla/5.0"})
        r.raise_for_status()
        data = r.json()
        result = (data.get("chart", {}).get("result") or [{}])[0]
        meta = result.get("meta") or {}
        quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]

        opens = quote.get("open") or []
        highs = quote.get("high") or []
        lows = quote.get("low") or []
        closes = quote.get("close") or []
        volumes = quote.get("volume") or []
        close_values = _numbers(closes)
        high_values = _numbers(highs)
        low_values = _numbers(lows)
        volume_values = _numbers(volumes)

        price = meta.get("regularMarketPrice") or _last_present(closes)
        day_high = meta.get("regularMarketDayHigh") or (max(high_values) if high_values else _last_present(highs))
        day_low = meta.get("regularMarketDayLow") or (min(low_values) if low_values else _last_present(lows))
        volume = meta.get("regularMarketVolume") or (sum(volume_values) if volume_values else _last_present(volumes))
        previous_close = meta.get("chartPreviousClose") or meta.get("previousClose") or meta.get("regularMarketPreviousClose")
        open_value = meta.get("regularMarketOpen") or _first_present(opens)

        out.update(
            {
                "price": price,
                "regularMarketPrice": price,
                "last": price,
                "open": open_value,
                "regularMarketOpen": open_value,
                "day_high": day_high,
                "regularMarketDayHigh": day_high,
                "day_low": day_low,
                "regularMarketDayLow": day_low,
                "prev_close": previous_close,
                "regularMarketPreviousClose": previous_close,
                "volume": volume,
                "regularMarketVolume": volume,
                "currency": meta.get("currency"),
                "exchange": meta.get("fullExchangeName") or meta.get("exchangeName") or meta.get("exchange"),
                "asset_type": "Stock",
                "spark": close_values[-24:],
                "sparkline": close_values[-24:],
                "status": "ok" if meta else "no_data",
            }
        )
        if day_low is not None and day_high is not None:
            out["today_range"] = [day_low, day_high]
    except Exception as e:
        out["error"] = str(e)

    try:
        history_url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=1y&interval=1d"
        r = httpx.get(history_url, timeout=8, headers={"User-Agent": "Mozilla/5.0"})
        r.raise_for_status()
        data = r.json()
        result = (data.get("chart", {}).get("result") or [{}])[0]
        quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
        high_values = _numbers(quote.get("high") or [])
        low_values = _numbers(quote.get("low") or [])
        volume_values = _numbers(quote.get("volume") or [])
        if volume_values:
            avg_volume = sum(volume_values) / len(volume_values)
            out["avg_volume"] = avg_volume
            out["averageVolume"] = avg_volume
            out["averageDailyVolume3Month"] = avg_volume
        if high_values:
            out["52w_high"] = max(high_values)
            out["fiftyTwoWeekHigh"] = max(high_values)
        if low_values:
            out["52w_low"] = min(low_values)
            out["fiftyTwoWeekLow"] = min(low_values)
        if out.get("status") == "no_data" and (high_values or low_values or volume_values):
            out["status"] = "ok"
    except Exception as e:
        out["history_error"] = str(e)

    quote_snapshot = _yahoo_quote_snapshot(symbol)
    recommendation_snapshot = _yahoo_recommendation_snapshot(symbol)
    pe = _number_or_none(quote_snapshot.get("trailingPE"))
    eps = _number_or_none(quote_snapshot.get("epsTrailingTwelveMonths") or quote_snapshot.get("trailingEps"))
    beta = _number_or_none(quote_snapshot.get("beta"))
    dividend_yield = _number_or_none(quote_snapshot.get("dividendYield"))
    market_cap = _number_or_none(quote_snapshot.get("marketCap"))
    shares_outstanding = _number_or_none(quote_snapshot.get("sharesOutstanding"))
    float_shares = _number_or_none(quote_snapshot.get("floatShares"))
    target_mean = _number_or_none(quote_snapshot.get("targetMeanPrice") or recommendation_snapshot.get("targetMeanPrice"))
    target_high = _number_or_none(quote_snapshot.get("targetHighPrice") or recommendation_snapshot.get("targetHighPrice"))
    target_low = _number_or_none(quote_snapshot.get("targetLowPrice") or recommendation_snapshot.get("targetLowPrice"))
    target_median = _number_or_none(quote_snapshot.get("targetMedianPrice") or recommendation_snapshot.get("targetMedianPrice"))
    recommendation_mean = _number_or_none(quote_snapshot.get("recommendationMean") or recommendation_snapshot.get("recommendationMean"))
    analyst_count = _number_or_none(quote_snapshot.get("numberOfAnalystOpinions") or recommendation_snapshot.get("numberOfAnalystOpinions"))
    recommendation_key = quote_snapshot.get("recommendationKey") or recommendation_snapshot.get("recommendationKey")
    average_analyst_rating = quote_snapshot.get("averageAnalystRating") or recommendation_snapshot.get("averageAnalystRating")

    if pe is not None:
        out["pe"] = pe
        out["pe_ttm"] = pe
        out["trailingPE"] = pe
    if eps is not None:
        out["eps"] = eps
        out["eps_ttm"] = eps
        out["trailingEps"] = eps
    if beta is not None:
        out["beta"] = beta
    if dividend_yield is not None:
        normalized_yield = dividend_yield / 100
        out["dividend_yield"] = normalized_yield
        out["dividendYield"] = normalized_yield
    if market_cap is not None:
        out["market_cap"] = market_cap
        out["marketCap"] = market_cap
    if shares_outstanding is not None:
        out["shares_outstanding"] = shares_outstanding
        out["sharesOutstanding"] = shares_outstanding
    if float_shares is not None:
        out["float"] = float_shares
        out["floatShares"] = float_shares

    recommendation_trend = recommendation_snapshot
    strong_buy = _number_or_none(recommendation_trend.get("strongBuy"))
    buy = _number_or_none(recommendation_trend.get("buy"))
    hold = _number_or_none(recommendation_trend.get("hold"))
    sell = _number_or_none(recommendation_trend.get("sell"))
    strong_sell = _number_or_none(recommendation_trend.get("strongSell"))
    buy_count = None if strong_buy is None and buy is None else int((strong_buy or 0) + (buy or 0))
    hold_count = None if hold is None else int(hold)
    sell_count = None if sell is None and strong_sell is None else int((sell or 0) + (strong_sell or 0))

    analyst_targets: Dict[str, Any] = {}
    if price is not None:
        analyst_targets["current_price"] = price
    if target_mean is not None:
        out["targetMeanPrice"] = target_mean
        analyst_targets["average_target"] = target_mean
    if target_high is not None:
        out["targetHighPrice"] = target_high
        analyst_targets["high_target"] = target_high
    if target_low is not None:
        out["targetLowPrice"] = target_low
        analyst_targets["low_target"] = target_low
    if target_median is not None:
        out["targetMedianPrice"] = target_median
        analyst_targets["median_target"] = target_median
    if target_mean is not None and price:
        upside_pct = ((target_mean - float(price)) / float(price)) * 100
        out["analyst_upside_pct"] = upside_pct
        analyst_targets["upside_downside_pct"] = upside_pct
    if recommendation_mean is not None:
        out["recommendationMean"] = recommendation_mean
        analyst_targets["recommendation_mean"] = recommendation_mean
    if recommendation_key:
        out["recommendationKey"] = recommendation_key
        analyst_targets["consensus_rating"] = recommendation_key
    if average_analyst_rating:
        out["averageAnalystRating"] = average_analyst_rating
        analyst_targets["average_analyst_rating"] = average_analyst_rating
    if analyst_count is not None:
        out["numberOfAnalystOpinions"] = int(analyst_count)
        analyst_targets["analyst_count"] = int(analyst_count)
    rating_distribution = {
        key: value
        for key, value in {
            "strong_buy": int(strong_buy) if strong_buy is not None else None,
            "buy_only": int(buy) if buy is not None else None,
            "buy": buy_count,
            "hold": hold_count,
            "sell_only": int(sell) if sell is not None else None,
            "strong_sell": int(strong_sell) if strong_sell is not None else None,
            "sell": sell_count,
        }.items()
        if value is not None
    }
    if rating_distribution:
        out["recommendationTrend"] = rating_distribution
        analyst_targets["rating_distribution"] = rating_distribution
    if any(key in analyst_targets for key in ("average_target", "high_target", "low_target", "consensus_rating", "analyst_count", "rating_distribution")):
        out["analyst_targets"] = analyst_targets

    if quote_snapshot and out.get("status") == "no_data":
        out["status"] = "ok"
    return out


def _asset_type_from_quote_type(quote_type: Any) -> str:
    text = str(quote_type or "").upper()
    if "ETF" in text:
        return "ETF"
    if "CRYPTO" in text:
        return "Crypto"
    if "OPTION" in text:
        return "Option"
    if text in {"EQUITY", "STOCK"}:
        return "Stock"
    return "Other"


def yahoo_symbol_search(query: str, limit: int = 8) -> List[Dict[str, Any]]:
    q = str(query or "").strip()
    if not q:
        return []
    return yahoo_instrument_search(q, limit=limit)


def yahoo_instrument_search(query: str, limit: int = 8) -> List[Dict[str, Any]]:
    q = str(query or "").strip()
    if not q:
        return []
    url = "https://query1.finance.yahoo.com/v1/finance/search"
    rows: List[Dict[str, Any]] = []
    seen: set[str] = set()
    search_error: Exception | None = None
    try:
        r = httpx.get(
            url,
            params={"q": q, "quotesCount": limit, "newsCount": 0},
            timeout=8,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        r.raise_for_status()
        data = r.json()
        for quote in data.get("quotes", []):
            symbol = str(quote.get("symbol") or "").strip().upper()
            if not symbol or symbol in seen:
                continue
            seen.add(symbol)
            quote_type = quote.get("quoteType") or quote.get("typeDisp")
            rows.append(
                {
                    "symbol": symbol,
                    "name": quote.get("shortname") or quote.get("longname") or quote.get("name") or symbol,
                    "asset_type": _asset_type_from_quote_type(quote_type),
                    "quote_type": quote_type,
                    "exchange": quote.get("exchDisp") or quote.get("exchange"),
                    "currency": quote.get("currency") or "USD",
                    "source": "Yahoo search",
                }
            )
    except Exception as exc:
        search_error = exc
        rows = []
    if rows:
        return rows[:limit]
    exact = yahoo_fundamentals(q)
    if exact.get("status") == "ok":
        return [
            {
                "symbol": q.upper(),
                "name": q.upper(),
                "asset_type": "Stock",
                "quote_type": "EQUITY",
                "exchange": exact.get("exchange"),
                "currency": exact.get("currency") or "USD",
                "source": exact.get("source") or "Yahoo public",
            }
        ]
    if search_error:
        raise InstrumentSearchError(f"Yahoo Finance instrument search unavailable: {search_error}") from search_error
    return []


def test_rss(settings: Dict[str, Any] | None = None):
    t0 = time.time()
    cfg = (settings or get_settings()).get("rss", {})
    feeds = cfg.get("feeds", []) or []
    if not feeds:
        return _result("RSS", True, "No RSS feeds configured", False, [], int((time.time()-t0)*1000))
    samples = []
    total = 0
    for f in feeds[:5]:
        try:
            parsed = feedparser.parse(f.get("url", ""))
            total += len(parsed.entries)
            samples.append({"name": f.get("name"), "items": len(parsed.entries), "first": parsed.entries[0].get("title") if parsed.entries else None})
        except Exception as e:
            samples.append({"name": f.get("name"), "error": str(e)})
    return _result("RSS", True, f"Checked {len(feeds)} feeds", total > 0, samples, int((time.time()-t0)*1000))


def test_seeking_alpha(settings: Dict[str, Any] | None = None):
    t0 = time.time()
    cfg = (settings or get_settings()).get("seeking_alpha", {})
    samples = []
    data_received = False

    # RSS first: stable, preferred.
    for url in (cfg.get("rss_urls") or [])[:4]:
        try:
            feed = feedparser.parse(url)
            samples.append({"mode": "rss", "url": url, "items": len(feed.entries), "first": feed.entries[0].get("title") if feed.entries else None})
            data_received = data_received or len(feed.entries) > 0
        except Exception as e:
            samples.append({"mode": "rss", "url": url, "error": str(e)})

    # Authenticated deep parsing: optional user-owned subscriber session. No password stored.
    if cfg.get("authenticated_enabled") and cfg.get("cookie_header"):
        try:
            headers = {"User-Agent": "Mozilla/5.0", "Cookie": cfg.get("cookie_header", "")}
            r = httpx.get(cfg.get("test_url") or "https://seekingalpha.com/market-news", timeout=12, headers=headers, follow_redirects=True)
            text = r.text or ""
            auth_ok = r.status_code == 200 and ("Sign in" not in text[:5000])
            samples.append({"mode": "authenticated", "status_code": r.status_code, "auth_session_detected": auth_ok, "chars": len(text)})
            data_received = data_received or auth_ok
        except Exception as e:
            samples.append({"mode": "authenticated", "error": str(e)})

    return _result(
        "Seeking Alpha",
        True,
        "Seeking Alpha checked. RSS is preferred; authenticated mode uses your own session cookie/header if enabled.",
        data_received,
        samples,
        int((time.time()-t0)*1000),
    )


def test_fred(settings: Dict[str, Any] | None = None):
    t0 = time.time()
    cfg = (settings or get_settings()).get("fred", {})
    if not cfg.get("api_key"):
        return _result("FRED/Macro", True, "No FRED API key configured; macro fallback active", False, None, int((time.time()-t0)*1000))
    return _result("FRED/Macro", True, "FRED key saved. Full macro adapter pending series configuration.", True, {"key_present": True}, int((time.time()-t0)*1000))


def test_telegram(settings: Dict[str, Any] | None = None):
    t0 = time.time()
    cfg = (settings or get_settings()).get("telegram", {})
    if not cfg.get("bot_token") or not cfg.get("chat_id"):
        return _result("Telegram", True, "Telegram token/chat id not configured", False, None, int((time.time()-t0)*1000))
    return _result("Telegram", True, "Telegram credentials present. Send-test endpoint planned next.", True, {"chat_id": cfg.get("chat_id")}, int((time.time()-t0)*1000))


def source_health(settings: Dict[str, Any] | None = None):
    s = settings or get_settings()
    checks = [test_ibkr(s), test_yahoo(s), test_seeking_alpha(s), test_rss(s), test_fred(s), test_telegram(s)]
    checks.append(_result("Advisor Intel", True, "Scaffolding ready; connector deferred", False, {"mode": s.get("discord_advisor", {}).get("mode")}, 0))
    return checks


def test_source(source: str, settings: Dict[str, Any] | None = None):
    source = source.lower().replace("_", "-")
    mapping = {
        "ibkr": test_ibkr,
        "yahoo": test_yahoo,
        "seeking-alpha": test_seeking_alpha,
        "seeking_alpha": test_seeking_alpha,
        "rss": test_rss,
        "fred": test_fred,
        "macro": test_fred,
        "telegram": test_telegram,
    }
    fn = mapping.get(source)
    if not fn:
        return _result(source, False, f"Unknown source: {source}", False)
    return fn(settings)
