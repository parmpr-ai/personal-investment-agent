"""
Finnhub free-tier news sentiment: 60 RPM, no daily cap, no CC required.
Returns pre-scored sentiment (bullishPercent, score) without any LLM tokens.
Use as a first-pass filter; escalate to LLM for borderline/high-buzz tickers.
"""
import asyncio
import os
from typing import Any, Dict, List

import httpx

_BASE = "https://finnhub.io/api/v1"
_TIMEOUT = 6


def is_available() -> bool:
    return bool(os.getenv("FINNHUB_API_KEY"))


async def fetch_sentiment(tickers: List[str]) -> Dict[str, Any]:
    """
    Returns per-ticker Finnhub sentiment. Requires FINNHUB_API_KEY env var.
    Schema mirrors news_scorer output: {ticker: {sentiment_score, direction, ...}}.
    """
    api_key = os.getenv("FINNHUB_API_KEY")
    if not api_key:
        return {}

    sem = asyncio.Semaphore(8)  # Finnhub allows 60 RPM, so can be more aggressive

    async def _fetch(client: httpx.AsyncClient, ticker: str) -> tuple[str, Dict[str, Any]]:
        ticker_upper = ticker.upper()
        async with sem:
            try:
                r = await client.get(
                    f"{_BASE}/news-sentiment",
                    params={"symbol": ticker_upper, "token": api_key},
                    timeout=_TIMEOUT,
                )
                r.raise_for_status()
                d = r.json()
                if not d or not d.get("sentiment"):
                    return ticker_upper, {}

                sentiment = d.get("sentiment", {})
                buzz = d.get("buzz", {})

                # Finnhub score: 0 (most bearish) → 1 (most bullish), 0.5 = neutral
                raw_score = sentiment.get("score", 0.5)
                # Normalize to -100..+100
                normalized = round((raw_score - 0.5) * 200, 1)

                direction = "NEUTRAL"
                if normalized >= 15:
                    direction = "BULLISH"
                elif normalized <= -15:
                    direction = "BEARISH"

                buzz_score = buzz.get("buzz", 0)
                # High buzz (>1.0 = above weekly average) = more signal weight
                is_high_buzz = buzz_score > 1.2

                return ticker_upper, {
                    "sentiment_score": normalized,
                    "direction": direction,
                    "catalysts": [],   # Finnhub doesn't return catalysts; fill from headlines
                    "headline_count": buzz.get("articlesInLastWeek", 0),
                    "top_headlines": [],
                    "buzz": round(buzz_score, 2),
                    "high_buzz": is_high_buzz,
                    "bullish_pct": round((sentiment.get("bullishPercent") or 0) * 100, 1),
                    "bearish_pct": round((sentiment.get("bearishPercent") or 0) * 100, 1),
                    "sector_avg_score": d.get("sectorAverageNewsScore"),
                    "vs_sector": round(raw_score - (d.get("sectorAverageNewsScore") or 0.5), 3),
                    "provider": "finnhub",
                    "ok": True,
                }
            except Exception as e:
                return ticker_upper, {"ok": False, "error": str(e)}

    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(*[_fetch(client, t) for t in tickers], return_exceptions=True)

    out: Dict[str, Any] = {}
    for item in results:
        if isinstance(item, tuple):
            ticker, data = item
            if data:
                out[ticker] = data
    return out


def sentiment_boost_finnhub(finnhub: Dict[str, Any], ticker: str) -> tuple[int, str]:
    """Returns (score_delta, reason) to plug into agent signal scoring."""
    info = finnhub.get(ticker.upper(), {})
    if not info.get("ok"):
        return 0, ""
    s = info.get("sentiment_score", 0)
    buzz = info.get("high_buzz", False)
    delta = 0
    reasons = []

    if s >= 30:
        delta += 20
        reasons.append(f"Finnhub BULLISH ({s:+.0f})")
    elif s >= 12:
        delta += 10
        reasons.append(f"Finnhub positive ({s:+.0f})")
    elif s <= -30:
        delta -= 20
        reasons.append(f"Finnhub BEARISH ({s:+.0f})")
    elif s <= -12:
        delta -= 10
        reasons.append(f"Finnhub negative ({s:+.0f})")

    if buzz and abs(s) > 10:
        # High buzz amplifies the signal
        delta = round(delta * 1.3)
        reasons.append("high buzz")

    return delta, ", ".join(reasons)
