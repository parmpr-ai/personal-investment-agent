"""
Free earnings calendar from Yahoo Finance.
Used to avoid opening new positions 1-2 days before scheduled earnings
(binary risk event) and detect post-earnings drift opportunities.
"""
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import httpx

_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; InvestAgent/6.0)"}
_TIMEOUT = 6

# In-memory cache: {ticker: {date, days_until, ...}} refreshed every 6h
_cache: Dict[str, Any] = {}
_cache_ts: float = 0.0


async def fetch_earnings_date(ticker: str) -> Optional[Dict[str, Any]]:
    """Fetch next earnings date from Yahoo Finance quoteSummary."""
    try:
        url = f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{ticker.upper()}"
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS) as client:
            r = await client.get(url, params={"modules": "calendarEvents,earningsTrend"})
            r.raise_for_status()
            data = r.json()
        result = data.get("quoteSummary", {}).get("result", [{}])[0]
        cal = result.get("calendarEvents", {})
        earnings = cal.get("earnings", {})
        dates = earnings.get("earningsDate", [])
        if not dates:
            return None
        # earningsDate is a list of {raw: epoch, fmt: "YYYY-MM-DD"}
        next_date_raw = dates[0].get("raw") if isinstance(dates[0], dict) else None
        if not next_date_raw:
            return None
        earnings_dt = datetime.fromtimestamp(next_date_raw, tz=timezone.utc)
        now = datetime.now(timezone.utc)
        days_until = (earnings_dt - now).days
        return {
            "ticker": ticker.upper(),
            "earnings_date": earnings_dt.strftime("%Y-%m-%d"),
            "days_until": days_until,
            "earnings_soon": 0 <= days_until <= 2,    # within 2 days = high risk
            "earnings_week": 0 <= days_until <= 7,    # within 1 week = pre-position window
            "just_reported": -3 <= days_until < 0,   # just reported = PEAD opportunity
        }
    except Exception:
        return None


async def refresh_calendar(tickers: List[str]) -> Dict[str, Any]:
    """Fetch earnings dates for all tickers concurrently."""
    global _cache, _cache_ts
    import time
    tasks = [fetch_earnings_date(t) for t in tickers]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    for ticker, res in zip(tickers, results):
        if isinstance(res, dict):
            _cache[ticker.upper()] = res
    _cache_ts = time.time()
    return _cache


def get_cached(ticker: str) -> Optional[Dict[str, Any]]:
    return _cache.get(ticker.upper())


def should_avoid_entry(ticker: str) -> tuple[bool, str]:
    """
    Returns (avoid, reason). Avoid opening new positions if earnings within 2 days.
    The binary risk of missing/beating earnings is too high for systematic entry.
    """
    info = get_cached(ticker.upper())
    if not info:
        return False, ""
    if info.get("earnings_soon"):
        return True, f"Earnings in {info['days_until']}d ({info['earnings_date']}) — binary risk, skip entry"
    return False, ""


def pead_signal(ticker: str) -> tuple[int, str]:
    """
    Post-Earnings Announcement Drift: stock just reported.
    Caller should check if it was a beat (from news sentiment) and add score.
    Returns (score_bonus, reason) — neutral here, let news sentiment decide direction.
    """
    info = get_cached(ticker.upper())
    if not info or not info.get("just_reported"):
        return 0, ""
    return 8, f"just reported earnings ({info['earnings_date']}) — PEAD window"


def pre_earnings_signal(ticker: str) -> tuple[int, str]:
    """Pre-earnings momentum: stocks often drift up 3-5 days before earnings."""
    info = get_cached(ticker.upper())
    if not info:
        return 0, ""
    d = info.get("days_until", 99)
    if 3 <= d <= 7:
        return 10, f"earnings in {d}d — pre-earnings drift window"
    return 0, ""
