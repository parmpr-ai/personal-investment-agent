import os
import time
from typing import Any, Dict, List
import httpx
import feedparser
from dotenv import load_dotenv

from services.settings_store import get_settings

load_dotenv()


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


def yahoo_fundamentals(ticker: str) -> Dict[str, Any]:
    # Free public endpoints are not guaranteed; this returns a robust schema with best-effort values.
    # V5.6 intentionally avoids paid providers.
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range=1d&interval=1d"
    out = {"source": "Yahoo public", "ticker": ticker.upper(), "price": None, "currency": None, "status": "no_data"}
    try:
        r = httpx.get(url, timeout=8, headers={"User-Agent": "Mozilla/5.0"})
        data = r.json()
        meta = data.get("chart", {}).get("result", [{}])[0].get("meta", {})
        out.update({"price": meta.get("regularMarketPrice"), "currency": meta.get("currency"), "exchange": meta.get("exchangeName"), "status": "ok" if meta else "no_data"})
    except Exception as e:
        out["error"] = str(e)
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
    url = "https://query1.finance.yahoo.com/v1/finance/search"
    rows: List[Dict[str, Any]] = []
    seen: set[str] = set()
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
    except Exception:
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
