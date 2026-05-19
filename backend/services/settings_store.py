import json
import sqlite3
from pathlib import Path
from typing import Any, Dict

BASE_DIR = Path(__file__).resolve().parents[1]
DB_PATH = BASE_DIR / "pia_settings.sqlite3"

DEFAULT_SETTINGS: Dict[str, Any] = {
    "app": {
        "name": "Personal Investment Agent",
        "version": "v5.6",
        "theme": "premium_black",
        "privacy_default": False,
    },
    "ibkr": {
        "enabled": True,
        "host": "127.0.0.1",
        "port": 4001,
        "client_id": 21,
        "mode": "live",
        "read_only": True,
        "documentation": "Open IB Gateway/TWS, enable API socket clients, set read-only API, set trusted IP 127.0.0.1, then test connection.",
    },
    "yahoo": {
        "enabled": True,
        "news_enabled": True,
        "fundamentals_enabled": True,
        "test_ticker": "AMD",
        "documentation": "Uses free Yahoo Finance public endpoints/RSS where available. No Yahoo login required. If data is not received, fallback providers can be enabled later.",
    },
    "seeking_alpha": {
        "enabled": False,
        "rss_enabled": True,
        "rss_urls": ["https://seekingalpha.com/feed.xml"],
        "email_alerts_enabled": False,
        "authenticated_enabled": False,
        "auth_mode": "session_cookie",
        "cookie_header": "",
        "test_url": "https://seekingalpha.com/market-news",
        "documentation": "Recommended: RSS + email alerts. Authenticated deep parsing is optional and uses your own active subscriber session cookie/header, not your password. Reliability depends on Seeking Alpha session validity and website changes.",
    },
    "rss": {
        "enabled": True,
        "feeds": [
            {"name": "Yahoo AMD", "url": "https://feeds.finance.yahoo.com/rss/2.0/headline?s=AMD&region=US&lang=en-US"},
            {"name": "Yahoo NVDA", "url": "https://feeds.finance.yahoo.com/rss/2.0/headline?s=NVDA&region=US&lang=en-US"},
        ],
        "documentation": "Add ticker/news RSS URLs. Health check validates that feed items are received.",
    },
    "fred": {
        "enabled": False,
        "api_key": "",
        "documentation": "Optional free FRED API key for macro series. Without key, app uses built-in macro demo/fallback until connector is enabled.",
    },
    "telegram": {
        "enabled": False,
        "bot_token": "",
        "chat_id": "",
        "documentation": "Create a Telegram bot with BotFather, paste token and chat id, then use Send Test Alert.",
    },
    "discord_advisor": {
        "enabled": False,
        "mode": "manual_first",
        "thread_ids": [],
        "documentation": "V5.6 scaffolding only. Future modes: webhook / cloud browser connector / manual paste. Signals will map to holdings and watchlist tickers.",
    },
    "openai": {
        "enabled": False,
        "mode": "off",
        "daily_budget_eur": 0.50,
        "cache_hours": 24,
        "documentation": "Optional later. Plus subscription is separate from API. V5.6 uses rule engine first.",
    },
    "widgets": {
        "visible": ["portfolio", "brief", "positions", "risk", "exposure", "trades", "source_health"],
        "order": ["portfolio", "brief", "positions", "risk", "exposure", "trades", "source_health"],
    },
}


def _connect():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    return conn


def get_settings() -> Dict[str, Any]:
    conn = _connect()
    try:
        row = conn.execute("SELECT value FROM settings WHERE key='integrations'").fetchone()
        if not row:
            save_settings(DEFAULT_SETTINGS)
            return json.loads(json.dumps(DEFAULT_SETTINGS))
        data = json.loads(row[0])
        return deep_merge(json.loads(json.dumps(DEFAULT_SETTINGS)), data)
    finally:
        conn.close()


def save_settings(settings: Dict[str, Any]) -> Dict[str, Any]:
    merged = deep_merge(json.loads(json.dumps(DEFAULT_SETTINGS)), settings)
    conn = _connect()
    try:
        conn.execute(
            "INSERT OR REPLACE INTO settings(key,value) VALUES('integrations',?)",
            (json.dumps(merged, ensure_ascii=False),),
        )
        conn.commit()
        return merged
    finally:
        conn.close()


def deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    for k, v in (override or {}).items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            base[k] = deep_merge(base[k], v)
        else:
            base[k] = v
    return base
