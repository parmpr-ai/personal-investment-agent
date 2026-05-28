from __future__ import annotations

from typing import Any

from mock_intelligence_data import enrich_technical, get_mock_intelligence, get_mock_overview_hints
from services.news_intelligence import (
    DemoNewsProvider,
    RawNewsItem,
    YahooNewsProvider,
    _infer_sentiment,
    _parse_published,
    build_digest,
    generate_mock_news,
    get_news_intelligence,
    normalize_news,
    serialize_item,
)
from services.connectors import yahoo_news


def _momentum_label(score: int) -> str:
    if score >= 75:
        return "Strong momentum — extension risk rising"
    if score >= 55:
        return "Constructive momentum — trend intact"
    if score >= 40:
        return "Mixed momentum — wait for confirmation"
    return "Weak momentum — downside pressure possible"


def _volatility_label(risk: int) -> str:
    if risk >= 80:
        return "Elevated volatility — size defensively"
    if risk >= 60:
        return "Above-average risk — tighten stops"
    if risk >= 40:
        return "Moderate volatility — normal sizing"
    return "Contained volatility — cleaner risk profile"


def _macro_label(sensitivity: int, macro: dict[str, Any]) -> str:
    regime = macro.get("risk_mode") or "Neutral"
    if sensitivity >= 80:
        return f"High macro sensitivity — {regime} regime matters"
    if sensitivity >= 60:
        return f"Moderate macro sensitivity — watch rates and {regime}"
    return f"Lower macro beta — less driven by {regime}"


def _earnings_proximity(ticker: str, calendar: list[dict[str, Any]]) -> str:
    matches = [event for event in calendar if ticker.upper() in str(event.get("event", "")).upper()]
    if matches:
        first = matches[0]
        return f"{first.get('event')} on {first.get('date')} — catalyst window active"
    return "No earnings headline in the current calendar window"


def _trend_label(change_pct: float) -> str:
    if change_pct >= 1.5:
        return "Uptrend"
    if change_pct >= 0.25:
        return "Mild uptrend"
    if change_pct <= -1.5:
        return "Downtrend"
    if change_pct <= -0.25:
        return "Mild pullback"
    return "Sideways"


def _build_actions(position: dict[str, Any] | None, watch: dict[str, Any] | None, news_items: list[dict[str, Any]]) -> list[dict[str, str]]:
    risk = int((position or watch or {}).get("risk") or 50)
    momentum = int((position or {}).get("momentum_score") or (watch or {}).get("momentum") or 50)
    weight = float((position or {}).get("portfolio_pct") or 0)
    actions: list[dict[str, str]] = []

    if weight >= 15:
        actions.append({"label": "Scale carefully", "detail": "Position weight is elevated versus portfolio guardrails."})
    if risk >= 75:
        actions.append({"label": "Hedge candidate", "detail": "Risk score suggests hedging or trim before adding."})
    elif risk >= 55:
        actions.append({"label": "Watch", "detail": "Monitor intraday tone before sizing up."})
    else:
        actions.append({"label": "Momentum continuation", "detail": "Risk profile allows measured adds if thesis holds."})

    if momentum >= 70:
        actions.append({"label": "Momentum continuation", "detail": "Tape and momentum scores remain supportive."})
    if risk >= 70 or any(item.get("bias") == "Bearish" for item in news_items[:2]):
        actions.append({"label": "Elevated volatility", "detail": "Headline tone or risk score argues for patience."})

    if not actions:
        actions.append({"label": "Watch", "detail": "No urgent action — confirm catalyst and liquidity."})
    return actions[:4]


def get_ticker_news_intelligence(ticker: str) -> dict[str, Any]:
    symbol = ticker.upper().split()[0]
    raw_items: list[RawNewsItem] = []
    used_demo = False

    for article in yahoo_news(symbol, limit=6):
        title = str(article.get("title") or "").strip()
        link = str(article.get("link") or "").strip()
        if not title or not link:
            continue
        raw_items.append(
            RawNewsItem(
                ticker=symbol,
                title=title,
                source=str(article.get("source") or "Yahoo Finance"),
                source_url=link,
                published_at=_parse_published(str(article.get("published") or "")),
                catalyst_type="general",
                sentiment=_infer_sentiment(title),
                summary=f"Live headline for {symbol}. Confirm price action before sizing.",
            )
        )

    if not raw_items:
        global_bundle = get_news_intelligence()
        filtered = [item for item in global_bundle.get("items", []) if str(item.get("ticker", "")).upper() == symbol]
        if filtered:
            digest = f"{symbol}: " + " · ".join(item.get("title", "") for item in filtered[:2]) if filtered else "No headlines."
            return {"is_demo": bool(global_bundle.get("is_demo")), "digest": digest, "items": filtered}

        demo_items = [item for item in DemoNewsProvider().fetch() if item.ticker == symbol]
        if demo_items:
            used_demo = True
            raw_items = demo_items
        else:
            provider_items = YahooNewsProvider().fetch()
            real_items = [item for item in provider_items if item.ticker == symbol][:4]
            if real_items:
                # Real Yahoo headlines for this symbol — not demo.
                raw_items = real_items
                used_demo = False
            else:
                # Final fallback: deterministic per-ticker mock so every symbol shows source-badged news.
                raw_items = generate_mock_news(symbol)
                used_demo = True

    normalized = normalize_news(raw_items)
    return {
        "is_demo": used_demo,
        "digest": build_digest(normalized) if normalized else f"No live headlines for {symbol} in the current scan.",
        "items": [serialize_item(item) for item in normalized],
    }


def build_stock_panel_intelligence(
    ticker: str,
    position: dict[str, Any] | None,
    watch: dict[str, Any] | None,
    macro: dict[str, Any],
    forecast: dict[str, str],
    news_bundle: dict[str, Any],
    calendar: list[dict[str, Any]],
) -> dict[str, Any]:
    source = position or watch or {}
    change_pct = float(source.get("day_change_pct") or source.get("change_pct") or 0)
    momentum = int(source.get("momentum_score") or source.get("momentum") or 50)
    risk = int(source.get("risk") or 50)
    macro_sensitivity = int(source.get("macro_sensitivity") or 60)
    news_items = news_bundle.get("items") or []

    overview = {
        "why_moving": (position or {}).get("why_moving") or (watch or {}).get("reason") or "No dominant catalyst flagged — confirm with news and sector tape.",
        "momentum_state": _momentum_label(momentum),
        "macro_sensitivity": _macro_label(macro_sensitivity, macro),
        "earnings_proximity": _earnings_proximity(ticker, calendar),
        "volatility_state": _volatility_label(risk),
        "summary": (position or {}).get("ai_view") or (watch or {}).get("reason") or forecast.get("base") or "Rules-based view using portfolio and macro inputs.",
    }

    mock_intel = get_mock_intelligence(ticker)
    mock_overview = get_mock_overview_hints(ticker)

    technical = enrich_technical(
        {
            "trend": _trend_label(change_pct),
            "momentum_state": _momentum_label(momentum),
            "day_change_pct": change_pct,
        },
        ticker,
    )

    overview["why_moving"] = mock_overview.get("why_moving") or overview["why_moving"]
    overview["summary"] = mock_overview.get("ai_view") or overview["summary"]

    scenarios = [
        {
            "label": "Bullish",
            "probability": "35%",
            "text": forecast.get("bull") or "Momentum and catalysts remain supportive if macro stays stable.",
        },
        {
            "label": "Base",
            "probability": "45%",
            "text": forecast.get("base") or "Range trade until the next confirmed catalyst.",
        },
        {
            "label": "Bearish",
            "probability": "20%",
            "text": forecast.get("bear") or "Multiple compression if macro or thesis deteriorates.",
        },
    ]

    return {
        "overview": overview,
        "technical": technical,
        "scenarios": scenarios,
        "actions": _build_actions(position, watch, news_items),
        "company": mock_intel.get("company"),
        "fundamentals": mock_intel.get("fundamentals"),
        "targets": mock_intel.get("targets"),
        "future_tabs": ["Videos", "Earnings", "Macro exposure", "Options flow"],
    }
