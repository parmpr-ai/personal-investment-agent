from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Literal, Protocol

from services.connectors import yahoo_news
from services.state import WATCHLIST

CatalystType = Literal[
    "earnings",
    "guidance",
    "analyst_upgrade",
    "analyst_downgrade",
    "deal",
    "product",
    "regulation",
    "sector",
    "macro",
    "lawsuit",
    "dilution",
    "insider",
    "capex",
    "general",
]

Sentiment = Literal["positive", "neutral", "negative", "mixed"]
SellTheNewsRisk = Literal["low", "medium", "high"]
SuggestedAction = Literal["WATCH", "REVIEW", "AVOID", "ACT"]


@dataclass(frozen=True)
class RawNewsItem:
    ticker: str
    title: str
    source: str
    source_url: str
    published_at: datetime
    catalyst_type: CatalystType
    sentiment: Sentiment
    summary: str


@dataclass(frozen=True)
class NewsIntelligenceItem:
    id: str
    ticker: str
    title: str
    source: str
    source_url: str
    published_at: str
    freshness_minutes: int
    catalyst_type: CatalystType
    sentiment: Sentiment
    relevance_score: int
    impact_score: int
    sell_the_news_risk: SellTheNewsRisk
    suggested_action: SuggestedAction
    summary: str


class NewsProvider(Protocol):
    name: str

    def fetch(self) -> list[RawNewsItem]:
        ...


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _minutes_old(published_at: datetime, now: datetime) -> int:
    return max(0, int((now - published_at).total_seconds() // 60))


def _bounded(value: int) -> int:
    return max(0, min(100, value))


def _classify_sell_the_news(raw: RawNewsItem, impact_score: int, freshness_minutes: int) -> SellTheNewsRisk:
    if raw.catalyst_type in {"analyst_upgrade", "product", "sector"} and raw.sentiment == "positive":
        if impact_score >= 80 and freshness_minutes < 90:
            return "high"
        return "medium"
    if raw.catalyst_type in {"earnings", "guidance", "macro"} and impact_score >= 70:
        return "medium"
    return "low"


def _suggest_action(raw: RawNewsItem, impact_score: int, risk: SellTheNewsRisk) -> SuggestedAction:
    if raw.sentiment == "negative" and impact_score >= 70:
        return "REVIEW"
    if raw.sentiment == "negative":
        return "AVOID"
    if raw.sentiment == "positive" and risk == "low" and impact_score >= 80:
        return "ACT"
    return "WATCH"


def _score(raw: RawNewsItem, freshness_minutes: int) -> tuple[int, int]:
    catalyst_weight = {
        "earnings": 20,
        "guidance": 22,
        "analyst_upgrade": 16,
        "analyst_downgrade": 16,
        "deal": 18,
        "product": 15,
        "regulation": 18,
        "sector": 12,
        "macro": 14,
        "lawsuit": 17,
        "dilution": 20,
        "insider": 10,
        "capex": 13,
        "general": 6,
    }[raw.catalyst_type]
    freshness_bonus = 20 if freshness_minutes <= 30 else 14 if freshness_minutes <= 120 else 8
    sentiment_bonus = 10 if raw.sentiment in {"positive", "negative"} else 4
    relevance = _bounded(50 + catalyst_weight + freshness_bonus + sentiment_bonus)
    impact = _bounded(44 + catalyst_weight + sentiment_bonus + (10 if raw.ticker in {"AMD", "NBIS", "SOFI"} else 4))
    return relevance, impact


def human_bias(sentiment: Sentiment) -> str:
    return {
        "positive": "Bullish",
        "negative": "Bearish",
        "neutral": "Neutral",
        "mixed": "Mixed",
    }[sentiment]


def human_possible_move(risk: SellTheNewsRisk) -> str:
    return {
        "low": "Trend likely holds",
        "medium": "Pullback risk after pop",
        "high": "Sell-the-news fade likely",
    }[risk]


def human_action(action: SuggestedAction) -> str:
    return {
        "WATCH": "Watch for confirmation",
        "REVIEW": "Review position sizing",
        "AVOID": "Avoid adding exposure",
        "ACT": "Consider acting on setup",
    }[action]


def build_digest(items: list[NewsIntelligenceItem]) -> str:
    if not items:
        return "No live headlines in the current scan window."
    lines: list[str] = []
    for item in items[:3]:
        lines.append(f"{item.ticker}: {item.title}")
    return " · ".join(lines)


def normalize_news(raw_items: list[RawNewsItem], now: datetime | None = None) -> list[NewsIntelligenceItem]:
    now = now or _utc_now()
    items: list[NewsIntelligenceItem] = []
    for index, raw in enumerate(raw_items, start=1):
        freshness = _minutes_old(raw.published_at, now)
        relevance_score, impact_score = _score(raw, freshness)
        sell_the_news_risk = _classify_sell_the_news(raw, impact_score, freshness)
        items.append(
            NewsIntelligenceItem(
                id=str(index),
                ticker=raw.ticker,
                title=raw.title,
                source=raw.source,
                source_url=raw.source_url,
                published_at=raw.published_at.isoformat(),
                freshness_minutes=freshness,
                catalyst_type=raw.catalyst_type,
                sentiment=raw.sentiment,
                relevance_score=relevance_score,
                impact_score=impact_score,
                sell_the_news_risk=sell_the_news_risk,
                suggested_action=_suggest_action(raw, impact_score, sell_the_news_risk),
                summary=raw.summary,
            )
        )
    return sorted(items, key=lambda item: (item.relevance_score, item.impact_score), reverse=True)


def serialize_item(item: NewsIntelligenceItem) -> dict[str, Any]:
    payload = asdict(item)
    payload["bias"] = human_bias(item.sentiment)
    payload["confidence"] = item.impact_score
    payload["possible_move"] = human_possible_move(item.sell_the_news_risk)
    payload["action_label"] = human_action(item.suggested_action)
    return payload


class DemoNewsProvider:
    name = "demo"

    def fetch(self) -> list[RawNewsItem]:
        now = _utc_now()
        return [
            RawNewsItem(
                ticker="AMD",
                title="AMD receives bullish analyst commentary",
                source="Yahoo Finance",
                source_url="https://finance.yahoo.com/quote/AMD/news/",
                published_at=now - timedelta(minutes=22),
                catalyst_type="analyst_upgrade",
                sentiment="positive",
                summary="Momentum positive but move may already be partially priced in.",
            ),
            RawNewsItem(
                ticker="SOFI",
                title="Fintech lenders trade higher as credit sentiment improves",
                source="MarketWatch",
                source_url="https://www.marketwatch.com/investing/stock/sofi",
                published_at=now - timedelta(minutes=64),
                catalyst_type="sector",
                sentiment="positive",
                summary="Sector tone supports the setup, but rates remain the main risk filter.",
            ),
            RawNewsItem(
                ticker="NBIS",
                title="AI infrastructure names react to hyperscaler capex headlines",
                source="RSS Monitor",
                source_url="https://news.google.com/search?q=AI%20infrastructure%20capex",
                published_at=now - timedelta(minutes=118),
                catalyst_type="capex",
                sentiment="mixed",
                summary="Demand read-through is constructive, while concentration risk argues for discipline.",
            ),
            RawNewsItem(
                ticker="MELI",
                title="Latin America ecommerce basket gains on consumer data",
                source="Yahoo Finance",
                source_url="https://finance.yahoo.com/quote/MELI/news/",
                published_at=now - timedelta(minutes=185),
                catalyst_type="macro",
                sentiment="positive",
                summary="Macro data improves sentiment, but position changes should wait for volume confirmation.",
            ),
        ]


def _parse_published(value: str) -> datetime:
    if not value:
        return _utc_now()
    try:
        parsed = parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return _utc_now()


def _infer_sentiment(title: str) -> Sentiment:
    text = title.lower()
    negative = ("down", "cut", "miss", "lawsuit", "probe", "warning", "decline", "fall", "drop")
    positive = ("up", "beat", "raise", "upgrade", "surge", "gain", "record", "bullish", "strong")
    if any(word in text for word in negative):
        return "negative"
    if any(word in text for word in positive):
        return "positive"
    return "neutral"


class YahooNewsProvider:
    name = "yahoo"

    def fetch(self) -> list[RawNewsItem]:
        tickers = list({entry["symbol"] for entry in WATCHLIST if entry.get("symbol")})
        items: list[RawNewsItem] = []
        for ticker in tickers[:6]:
            for article in yahoo_news(ticker, limit=2):
                title = str(article.get("title") or "").strip()
                link = str(article.get("link") or "").strip()
                if not title or not link:
                    continue
                published_at = _parse_published(str(article.get("published") or ""))
                sentiment = _infer_sentiment(title)
                items.append(
                    RawNewsItem(
                        ticker=ticker,
                        title=title,
                        source=str(article.get("source") or "Yahoo Finance"),
                        source_url=link,
                        published_at=published_at,
                        catalyst_type="general",
                        sentiment=sentiment,
                        summary=f"Live headline for {ticker}. Confirm price action before sizing.",
                    )
                )
        return items


def get_news_intelligence(providers: list[NewsProvider] | None = None) -> dict[str, Any]:
    live_providers: list[NewsProvider] = providers or [YahooNewsProvider()]
    raw_items: list[RawNewsItem] = []
    used_demo = False

    for provider in live_providers:
        try:
            fetched = provider.fetch()
            if fetched:
                raw_items.extend(fetched)
        except Exception:
            continue

    if not raw_items:
        used_demo = True
        raw_items = DemoNewsProvider().fetch()

    normalized = normalize_news(raw_items)
    return {
        "is_demo": used_demo,
        "digest": build_digest(normalized),
        "items": [serialize_item(item) for item in normalized],
    }
