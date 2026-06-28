"""
Free news sentiment scoring via Yahoo RSS headline keyword analysis.
No API needed — scores -100 (very bearish) to +100 (very bullish).
"""
import asyncio
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any, Dict, List

import httpx

_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; InvestAgent/6.0)"}
_TIMEOUT = 6

# Weighted keyword dictionaries
_BULLISH = {
    # Earnings / guidance
    "beat": 25, "beats": 25, "record": 20, "raised guidance": 30, "raises guidance": 30,
    "raised forecast": 25, "raises forecast": 25, "above expectations": 25,
    "strong earnings": 30, "profit surge": 25, "revenue growth": 15,
    # Analyst actions
    "upgrade": 20, "upgraded": 20, "buy rating": 25, "outperform": 20,
    "overweight": 15, "price target raised": 25, "raised price target": 25,
    "bullish": 20, "strong buy": 30,
    # Catalysts
    "fda approval": 40, "approved": 20, "breakthrough": 25,
    "partnership": 15, "contract": 15, "deal": 10, "acquisition": 10,
    "buyback": 20, "dividend": 10, "spinoff": 10,
    # Market sentiment
    "rally": 15, "surge": 20, "soar": 25, "jump": 15, "climb": 10,
    "breakout": 20, "momentum": 10, "strength": 10, "gains": 10,
    "all-time high": 25, "52-week high": 20, "new high": 20,
}

_BEARISH = {
    # Earnings / guidance
    "miss": -25, "misses": -25, "below expectations": -25,
    "lowered guidance": -30, "lowers guidance": -30, "cut guidance": -30,
    "cuts guidance": -30, "warning": -20, "profit warning": -35,
    "revenue decline": -20, "loss widens": -25,
    # Analyst actions
    "downgrade": -20, "downgraded": -20, "sell rating": -25,
    "underperform": -20, "underweight": -15, "price target cut": -25,
    "cut price target": -25, "bearish": -20,
    # Negative catalysts
    "recall": -30, "investigation": -25, "lawsuit": -20, "fine": -15,
    "layoffs": -15, "job cuts": -15, "restructuring": -10,
    "delay": -15, "setback": -20, "rejected": -25, "fda rejection": -40,
    # Market sentiment
    "plunge": -25, "crash": -30, "tumble": -20, "slide": -15,
    "fall": -10, "drop": -10, "decline": -10, "selloff": -20,
    "sell-off": -20, "weakness": -10, "concern": -10, "fear": -15,
    "52-week low": -20, "new low": -20,
}

_CATALYST_KEYWORDS = {
    "earnings": "earnings", "results": "earnings", "quarterly": "earnings",
    "fda": "fda", "clinical": "clinical_trial", "trial": "clinical_trial",
    "merger": "merger", "acquisition": "acquisition", "buyout": "acquisition",
    "contract": "contract", "deal": "deal", "partnership": "partnership",
    "buyback": "buyback", "dividend": "dividend",
    "guidance": "guidance", "forecast": "guidance", "outlook": "guidance",
    "upgrade": "analyst", "downgrade": "analyst",
}


def _score_headline(title: str) -> tuple[int, List[str]]:
    text = title.lower()
    score = 0
    triggers = []
    for phrase, weight in _BULLISH.items():
        if phrase in text:
            score += weight
            triggers.append(f"+{phrase}")
    for phrase, weight in _BEARISH.items():
        if phrase in text:
            score += weight  # already negative
            triggers.append(f"{phrase}")
    return max(-100, min(100, score)), triggers


def _detect_catalysts(titles: List[str]) -> List[str]:
    found = set()
    for title in titles:
        text = title.lower()
        for keyword, category in _CATALYST_KEYWORDS.items():
            if keyword in text:
                found.add(category)
    return sorted(found)


async def _fetch_rss(client: httpx.AsyncClient, ticker: str) -> List[str]:
    url = f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={ticker}&region=US&lang=en-US"
    try:
        r = await client.get(url, timeout=_TIMEOUT)
        root = ET.fromstring(r.text)
        return [
            item.findtext("title") or ""
            for item in root.findall(".//item")[:8]
        ]
    except Exception:
        return []


async def score_news(tickers: List[str]) -> Dict[str, Any]:
    """
    Returns per-ticker: sentiment_score, direction, catalysts, headline_count, top_headlines.
    """
    results: Dict[str, Any] = {}
    async with httpx.AsyncClient(headers=_HEADERS) as client:
        tasks = {ticker: _fetch_rss(client, ticker) for ticker in tickers}
        fetched = {t: await coro for t, coro in tasks.items()}

    for ticker, titles in fetched.items():
        titles = [t for t in titles if t]
        if not titles:
            results[ticker.upper()] = {
                "sentiment_score": 0, "direction": "NEUTRAL",
                "catalysts": [], "headline_count": 0, "top_headlines": [],
            }
            continue

        total_score = 0
        all_triggers = []
        for title in titles:
            s, triggers = _score_headline(title)
            total_score += s
            all_triggers.extend(triggers)

        # Normalise: average across headlines, then scale
        avg = total_score / len(titles)
        catalysts = _detect_catalysts(titles)

        if avg >= 15:
            direction = "BULLISH"
        elif avg <= -15:
            direction = "BEARISH"
        else:
            direction = "NEUTRAL"

        results[ticker.upper()] = {
            "sentiment_score": round(avg, 1),
            "direction": direction,
            "catalysts": catalysts,
            "headline_count": len(titles),
            "top_headlines": titles[:3],
        }

    return results


def sentiment_boost(news: Dict[str, Any], ticker: str) -> tuple[int, str]:
    """Returns (score_delta, reason) to add to a long or short signal score."""
    info = news.get(ticker.upper(), {})
    s = info.get("sentiment_score", 0)
    catalysts = info.get("catalysts", [])
    direction = info.get("direction", "NEUTRAL")
    delta = 0
    reasons = []

    if s >= 20:
        delta += 18
        reasons.append(f"news BULLISH ({s:+.0f})")
    elif s >= 8:
        delta += 8
        reasons.append(f"news positive ({s:+.0f})")
    elif s <= -20:
        delta -= 18
        reasons.append(f"news BEARISH ({s:+.0f})")
    elif s <= -8:
        delta -= 8
        reasons.append(f"news negative ({s:+.0f})")

    if "earnings" in catalysts:
        delta += 10
        reasons.append("earnings catalyst")
    if "fda" in catalysts or "clinical_trial" in catalysts:
        delta += 15
        reasons.append("FDA/clinical catalyst")
    if "analyst" in catalysts:
        delta += 5
        reasons.append("analyst action")

    return delta, ", ".join(reasons) if reasons else ""
