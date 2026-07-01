"""
LLM-based news sentiment scorer using free-tier APIs.
Provider priority (first with API key wins): Groq → Gemini 2.5 Flash → Cerebras → Mistral.
All use OpenAI-compatible chat completions — zero extra dependencies beyond openai SDK.

Cost: $0/month at 96 req/day (4 cycles/hour × 14 tickers batched per call).
"""
import asyncio
import json
import logging
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Provider registry — ordered by preference (quality + speed)
_PROVIDERS = [
    {
        "name": "groq",
        "env": "GROQ_API_KEY",
        "base_url": "https://api.groq.com/openai/v1",
        "model": "llama-3.3-70b-versatile",
        "max_tokens": 400,
        "rpm_limit": 30,
    },
    {
        "name": "cerebras",
        "env": "CEREBRAS_API_KEY",
        "base_url": "https://api.cerebras.ai/v1",
        "model": "llama-3.3-70b",
        "max_tokens": 400,
        "rpm_limit": 30,
    },
    {
        "name": "gemini",
        "env": "GEMINI_API_KEY",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "model": "gemini-2.5-flash",
        "max_tokens": 400,
        "rpm_limit": 15,
    },
    {
        "name": "mistral",
        "env": "MISTRAL_API_KEY",
        "base_url": "https://api.mistral.ai/v1",
        "model": "mistral-small-latest",
        "max_tokens": 400,
        "rpm_limit": 10,
    },
]

_SYSTEM_PROMPT = (
    "You are a quantitative financial analyst specializing in short-term trading signals. "
    "Analyze news headlines and return precise JSON sentiment signals. "
    "Be decisive — neutral is only for genuinely ambiguous cases."
)

_USER_TEMPLATE = """\
Analyze these news headlines for {ticker} and return a short-term trading signal as JSON.

Headlines:
{headlines}

Return ONLY valid JSON (no markdown fences, no explanation outside JSON):
{{"sentiment": "bullish|bearish|neutral", "score": <integer -100 to 100>, \
"catalysts": [<list from: "earnings","fda","ma","analyst","guidance","contract","buyback","lawsuit","layoffs","macro">], \
"reasoning": "<1 concise sentence on trading impact>"}}

Scoring guide: +80 to +100 = very bullish (major positive catalyst), +20 to +79 = bullish, \
-19 to +19 = neutral, -20 to -79 = bearish, -80 to -100 = very bearish (major negative catalyst)."""


def _get_active_provider() -> Optional[Dict[str, Any]]:
    for p in _PROVIDERS:
        if os.getenv(p["env"]):
            return p
    return None


def get_active_provider_name() -> Optional[str]:
    p = _get_active_provider()
    return p["name"] if p else None


def is_available() -> bool:
    return _get_active_provider() is not None


async def score_news_ai(
    tickers: List[str],
    headlines_map: Dict[str, List[str]],
) -> Dict[str, Any]:
    """
    Score news using LLM. Returns same schema as news_scorer.score_news().
    headlines_map: {ticker: ["headline1", "headline2", ...]}
    Falls back to empty dict if no provider configured or on error.
    """
    provider = _get_active_provider()
    if not provider:
        return {}

    try:
        from openai import AsyncOpenAI
    except ImportError:
        logger.warning("openai package not installed; AI news scorer unavailable")
        return {}

    client = AsyncOpenAI(
        base_url=provider["base_url"],
        api_key=os.getenv(provider["env"]),
        timeout=20.0,
    )

    sem = asyncio.Semaphore(3)

    async def _analyze(ticker: str) -> tuple[str, Dict[str, Any]]:
        headlines = [h for h in (headlines_map.get(ticker) or headlines_map.get(ticker.upper()) or []) if h]
        ticker_upper = ticker.upper()
        if not headlines:
            return ticker_upper, _neutral(ticker_upper, provider["name"])

        async with sem:
            try:
                prompt = _USER_TEMPLATE.format(
                    ticker=ticker_upper,
                    headlines="\n".join(f"- {h}" for h in headlines[:6]),
                )
                resp = await client.chat.completions.create(
                    model=provider["model"],
                    messages=[
                        {"role": "system", "content": _SYSTEM_PROMPT},
                        {"role": "user", "content": prompt},
                    ],
                    response_format={"type": "json_object"},
                    max_tokens=provider["max_tokens"],
                    temperature=0.1,
                )
                raw = json.loads(resp.choices[0].message.content)
                score = max(-100, min(100, int(raw.get("score", 0))))
                direction = _direction_from(raw.get("sentiment", ""), score)
                catalysts = [c for c in (raw.get("catalysts") or []) if isinstance(c, str)]
                return ticker_upper, {
                    "sentiment_score": score,
                    "direction": direction,
                    "catalysts": catalysts,
                    "headline_count": len(headlines),
                    "top_headlines": headlines[:3],
                    "reasoning": raw.get("reasoning", ""),
                    "provider": provider["name"],
                }
            except Exception as e:
                logger.warning(f"AI news scorer error for {ticker}: {e}")
                return ticker_upper, {**_neutral(ticker_upper, provider["name"]), "error": str(e)}

    tasks = [_analyze(t) for t in tickers]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    out: Dict[str, Any] = {}
    for item in results:
        if isinstance(item, tuple):
            t, d = item
            out[t] = d
    return out


def _neutral(ticker: str, provider: str) -> Dict[str, Any]:
    return {
        "sentiment_score": 0, "direction": "NEUTRAL",
        "catalysts": [], "headline_count": 0, "top_headlines": [],
        "provider": provider,
    }


def _direction_from(raw_sentiment: str, score: int) -> str:
    s = raw_sentiment.upper()
    if s in ("BULLISH", "BEARISH", "NEUTRAL"):
        return s
    if score >= 20:
        return "BULLISH"
    if score <= -20:
        return "BEARISH"
    return "NEUTRAL"
