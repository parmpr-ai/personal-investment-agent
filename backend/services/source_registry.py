from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from services.ai_data_sources import (
    DiscordConnector,
    SeekingAlphaConnector,
    SourceStatus,
    XSentimentConnector,
    has_value,
    source_status,
    status_from_fields,
    summarize_sources,
    STATUS_AVAILABLE,
    STATUS_DISABLED,
    STATUS_MISSING,
    STATUS_PARTIAL,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean_symbol(symbol: str | None) -> str | None:
    parts = str(symbol or "").strip().split()
    return parts[0].upper() if parts else None


def _first(payload: dict[str, Any] | None, *keys: str) -> Any:
    payload = payload or {}
    for key in keys:
        value = payload.get(key)
        if has_value(value):
            return value
    return None


def _compact(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if has_value(value)}


def _yahoo_enabled(settings: dict[str, Any], feature: str) -> bool:
    cfg = settings.get("yahoo") or {}
    return bool(cfg.get("enabled", True)) and bool(cfg.get(feature, True))


def _symbol_required_status(source_id: str, enabled: bool, provider_field: str, note: str) -> SourceStatus:
    if not enabled:
        return source_status(source_id, STATUS_DISABLED, enabled=False, notes=note)
    return source_status(
        source_id,
        STATUS_PARTIAL,
        available_fields=[provider_field],
        missing_fields=["symbol"],
        notes=f"{note} Symbol-level availability is checked by /api/intelligence/{{symbol}}/inputs.",
    )


def _calendar_matches(calendar: list[dict[str, Any]] | None, symbol: str | None, *, earnings_only: bool = False) -> list[dict[str, Any]]:
    matches: list[dict[str, Any]] = []
    for event in calendar or []:
        event_text = f"{event.get('event', '')} {event.get('symbol', '')} {event.get('ticker', '')}".upper()
        if earnings_only and "EARNINGS" not in event_text:
            continue
        if symbol and symbol not in event_text:
            continue
        matches.append(event)
    return matches


def _find_position(portfolio: dict[str, Any] | None, symbol: str | None) -> dict[str, Any] | None:
    if not symbol:
        return None
    for position in (portfolio or {}).get("positions", []) or []:
        raw_symbol = str(position.get("symbol") or "").split()[0].upper()
        underlying = str(position.get("underlying") or "").upper()
        if raw_symbol == symbol or underlying == symbol:
            return position
    return None


def _fundamental_payload(fundamentals: dict[str, Any] | None) -> dict[str, Any]:
    fundamentals = fundamentals or {}
    return _compact(
        {
            "ticker": _first(fundamentals, "ticker", "symbol"),
            "name": _first(fundamentals, "name", "longName", "shortName"),
            "price": _first(fundamentals, "price", "regularMarketPrice", "last"),
            "currency": fundamentals.get("currency"),
            "exchange": fundamentals.get("exchange"),
            "market_cap": _first(fundamentals, "market_cap", "marketCap"),
            "eps": _first(fundamentals, "eps", "eps_ttm", "trailingEps"),
            "beta": fundamentals.get("beta"),
            "source": fundamentals.get("source"),
            "status": fundamentals.get("status"),
        }
    )


def _valuation_payload(fundamentals: dict[str, Any] | None) -> dict[str, Any]:
    fundamentals = fundamentals or {}
    return _compact(
        {
            "pe": _first(fundamentals, "pe", "pe_ttm", "trailingPE"),
            "eps": _first(fundamentals, "eps", "eps_ttm", "trailingEps"),
            "market_cap": _first(fundamentals, "market_cap", "marketCap"),
            "dividend_yield": _first(fundamentals, "dividend_yield", "dividendYield"),
            "beta": fundamentals.get("beta"),
            "analyst_upside_pct": fundamentals.get("analyst_upside_pct"),
        }
    )


def _analyst_targets_payload(fundamentals: dict[str, Any] | None) -> dict[str, Any]:
    fundamentals = fundamentals or {}
    targets = fundamentals.get("analyst_targets") if isinstance(fundamentals.get("analyst_targets"), dict) else {}
    return _compact(
        {
            "current_price": _first(targets, "current_price") or _first(fundamentals, "price", "regularMarketPrice", "last"),
            "average_target": _first(targets, "average_target") or _first(fundamentals, "targetMeanPrice"),
            "high_target": _first(targets, "high_target") or _first(fundamentals, "targetHighPrice"),
            "low_target": _first(targets, "low_target") or _first(fundamentals, "targetLowPrice"),
            "median_target": _first(targets, "median_target") or _first(fundamentals, "targetMedianPrice"),
            "consensus_rating": _first(targets, "consensus_rating") or _first(fundamentals, "recommendationKey"),
            "average_analyst_rating": _first(targets, "average_analyst_rating") or _first(fundamentals, "averageAnalystRating"),
            "analyst_count": _first(targets, "analyst_count") or _first(fundamentals, "numberOfAnalystOpinions"),
            "rating_distribution": targets.get("rating_distribution"),
        }
    )


def _analyst_revisions_payload(fundamentals: dict[str, Any] | None) -> dict[str, Any]:
    fundamentals = fundamentals or {}
    return _compact(
        {
            "rating_distribution": fundamentals.get("recommendationTrend"),
            "recommendation_key": fundamentals.get("recommendationKey"),
            "average_analyst_rating": fundamentals.get("averageAnalystRating"),
            "recommendation_mean": fundamentals.get("recommendationMean"),
        }
    )


def _technical_payload(
    fundamentals: dict[str, Any] | None,
    position: dict[str, Any] | None,
    watch: dict[str, Any] | None,
) -> dict[str, Any]:
    fundamentals = fundamentals or {}
    source = position or watch or {}
    return _compact(
        {
            "price": _first(fundamentals, "price", "regularMarketPrice", "last") or _first(source, "last", "price"),
            "sparkline": _first(fundamentals, "sparkline", "spark"),
            "today_range": fundamentals.get("today_range"),
            "fifty_two_week_high": _first(fundamentals, "52w_high", "fiftyTwoWeekHigh"),
            "fifty_two_week_low": _first(fundamentals, "52w_low", "fiftyTwoWeekLow"),
            "day_change_pct": _first(source, "day_change_pct", "change_pct"),
        }
    )


def _momentum_payload(
    fundamentals: dict[str, Any] | None,
    position: dict[str, Any] | None,
    watch: dict[str, Any] | None,
) -> dict[str, Any]:
    source = position or watch or {}
    fundamentals = fundamentals or {}
    return _compact(
        {
            "momentum_score": _first(source, "momentum_score", "momentum"),
            "sparkline": _first(fundamentals, "sparkline", "spark"),
            "day_change_pct": _first(source, "day_change_pct", "change_pct"),
        }
    )


def _volume_payload(fundamentals: dict[str, Any] | None) -> dict[str, Any]:
    fundamentals = fundamentals or {}
    return _compact(
        {
            "current_volume": _first(fundamentals, "volume", "regularMarketVolume"),
            "average_volume": _first(fundamentals, "avg_volume", "averageVolume", "averageDailyVolume3Month"),
        }
    )


def _earnings_payload(
    fundamentals: dict[str, Any] | None,
    calendar: list[dict[str, Any]] | None,
    symbol: str | None,
) -> dict[str, Any]:
    fundamentals = fundamentals or {}
    events = _calendar_matches(calendar, symbol, earnings_only=True)
    return _compact(
        {
            "earnings_date": _first(fundamentals, "earnings_date", "earningsDate"),
            "eps_estimate": _first(fundamentals, "eps_estimate", "epsEstimate"),
            "reported_eps": _first(fundamentals, "reported_eps", "reportedEPS"),
            "calendar_events": events,
        }
    )


def _news_payload(
    news: list[dict[str, Any]] | None,
    news_intelligence: dict[str, Any] | None,
) -> dict[str, Any]:
    news_intelligence = news_intelligence or {}
    items: list[dict[str, Any]] = []
    source = "news"
    if not news_intelligence.get("is_demo") and not news_intelligence.get("unavailable"):
        items = list(news_intelligence.get("items") or [])
        source = "news_intelligence"
    if not items:
        items = list(news or [])
        source = "news"
    return _compact(
        {
            "digest": news_intelligence.get("digest") if not news_intelligence.get("is_demo") else None,
            "items": items,
            "count": len(items),
            "source": source,
        }
    )


def _macro_payload(macro: dict[str, Any] | None) -> dict[str, Any]:
    macro = macro or {}
    return _compact(
        {
            "vix": macro.get("vix"),
            "skew": macro.get("skew"),
            "dxy": macro.get("dxy"),
            "us10y": macro.get("us10y"),
            "risk_mode": macro.get("risk_mode"),
            "market_strip": macro.get("market_strip"),
        }
    )


def _geopolitical_payload(macro: dict[str, Any] | None, news_payload: dict[str, Any]) -> dict[str, Any]:
    macro = macro or {}
    geopolitics = []
    for item in news_payload.get("items", []) or []:
        text = f"{item.get('title', '')} {item.get('summary', '')}".lower()
        if any(token in text for token in ("war", "sanction", "tariff", "geopolitical", "conflict")):
            geopolitics.append(item)
    return _compact(
        {
            "geopolitical_risk": macro.get("geopolitical_risk"),
            "headlines": geopolitics,
        }
    )


def _competitors_payload(fundamentals: dict[str, Any] | None) -> dict[str, Any]:
    fundamentals = fundamentals or {}
    return _compact(
        {
            "competitors": _first(fundamentals, "competitors", "peers", "peerSymbols"),
        }
    )


def _events_payload(calendar: list[dict[str, Any]] | None, symbol: str | None) -> dict[str, Any]:
    events = _calendar_matches(calendar, symbol, earnings_only=False)
    return _compact({"events": events, "count": len(events)})


def _portfolio_payload(portfolio: dict[str, Any] | None, position: dict[str, Any] | None, symbol: str | None) -> dict[str, Any]:
    if symbol:
        return _compact({"position": position, "portfolio_source": (portfolio or {}).get("source"), "active_source": (portfolio or {}).get("active_source")})
    positions = (portfolio or {}).get("positions") or []
    return _compact(
        {
            "positions_count": len(positions) if positions else None,
            "portfolio_source": (portfolio or {}).get("source"),
            "active_source": (portfolio or {}).get("active_source"),
        }
    )


def _ibkr_status(settings: dict[str, Any], provider_status: dict[str, Any] | None) -> SourceStatus:
    provider_status = provider_status or {}
    data_source = settings.get("data_source") or {}
    configured_mode = provider_status.get("configured_mode") or data_source.get("mode")
    if configured_mode != "ibkr-live":
        return source_status(
            "ibkr",
            STATUS_DISABLED,
            enabled=False,
            notes="IBKR live mode is not selected.",
            metadata={"configured_mode": configured_mode},
        )
    if provider_status.get("status") == "connected" and provider_status.get("active_source") == "IBKR_LIVE":
        return source_status(
            "ibkr",
            STATUS_AVAILABLE,
            available_fields=["gateway", "positions", "trades"],
            notes="IBKR live source is connected.",
            metadata=provider_status,
        )
    if provider_status.get("ibkr_gateway_reachable") or provider_status.get("fallback_active"):
        return source_status(
            "ibkr",
            STATUS_PARTIAL,
            available_fields=["gateway" if provider_status.get("ibkr_gateway_reachable") else "fallback"],
            missing_fields=["authenticated_live_positions"],
            notes=provider_status.get("message") or "IBKR live source is not fully available.",
            metadata=provider_status,
        )
    return source_status(
        "ibkr",
        STATUS_MISSING,
        missing_fields=["gateway", "authenticated_live_positions"],
        notes=provider_status.get("message") or "IBKR live source is selected but unavailable.",
        metadata=provider_status,
    )


class SourceRegistry:
    def __init__(self, settings: dict[str, Any] | None = None):
        self.settings = settings or {}

    def _payloads(
        self,
        *,
        symbol: str | None = None,
        portfolio: dict[str, Any] | None = None,
        position: dict[str, Any] | None = None,
        watch: dict[str, Any] | None = None,
        macro: dict[str, Any] | None = None,
        calendar: list[dict[str, Any]] | None = None,
        fundamentals: dict[str, Any] | None = None,
        news: list[dict[str, Any]] | None = None,
        news_intelligence: dict[str, Any] | None = None,
        provider_status: dict[str, Any] | None = None,
    ) -> dict[str, dict[str, Any]]:
        if position is None:
            position = _find_position(portfolio, symbol)
        news_data = _news_payload(news, news_intelligence)
        return {
            "fundamentals": _fundamental_payload(fundamentals),
            "earnings": _earnings_payload(fundamentals, calendar, symbol),
            "valuation": _valuation_payload(fundamentals),
            "analyst_targets": _analyst_targets_payload(fundamentals),
            "analyst_revisions": _analyst_revisions_payload(fundamentals),
            "technical_analysis": _technical_payload(fundamentals, position, watch),
            "momentum": _momentum_payload(fundamentals, position, watch),
            "volume": _volume_payload(fundamentals),
            "news": news_data,
            "macro": _macro_payload(macro),
            "geopolitical": _geopolitical_payload(macro, news_data),
            "competitors": _competitors_payload(fundamentals),
            "upcoming_events": _events_payload(calendar, symbol),
            "portfolio_positions": _portfolio_payload(portfolio, position, symbol),
            "ibkr": provider_status or {},
            "advisor_discord": {},
            "x_sentiment": {},
            "seeking_alpha": {},
        }

    def evaluate(
        self,
        *,
        symbol: str | None = None,
        portfolio: dict[str, Any] | None = None,
        position: dict[str, Any] | None = None,
        watch: dict[str, Any] | None = None,
        macro: dict[str, Any] | None = None,
        calendar: list[dict[str, Any]] | None = None,
        fundamentals: dict[str, Any] | None = None,
        news: list[dict[str, Any]] | None = None,
        news_intelligence: dict[str, Any] | None = None,
        provider_status: dict[str, Any] | None = None,
    ) -> tuple[list[SourceStatus], dict[str, dict[str, Any]]]:
        clean_symbol = _clean_symbol(symbol)
        payloads = self._payloads(
            symbol=clean_symbol,
            portfolio=portfolio,
            position=position,
            watch=watch,
            macro=macro,
            calendar=calendar,
            fundamentals=fundamentals,
            news=news,
            news_intelligence=news_intelligence,
            provider_status=provider_status,
        )
        fundamentals_enabled = _yahoo_enabled(self.settings, "fundamentals_enabled")
        news_enabled = _yahoo_enabled(self.settings, "news_enabled")

        statuses: list[SourceStatus] = []
        if not clean_symbol:
            statuses.extend(
                [
                    _symbol_required_status("fundamentals", fundamentals_enabled, "yahoo_fundamentals", "Yahoo fundamentals are configured."),
                    status_from_fields("earnings", payloads["earnings"], ["calendar_events"], notes="Global calendar events are available when populated."),
                    _symbol_required_status("valuation", fundamentals_enabled, "yahoo_fundamentals", "Yahoo valuation fields are configured."),
                    _symbol_required_status("analyst_targets", fundamentals_enabled, "yahoo_fundamentals", "Yahoo analyst target fields are configured."),
                    _symbol_required_status("analyst_revisions", fundamentals_enabled, "yahoo_fundamentals", "Yahoo analyst revision fields are configured."),
                    _symbol_required_status("technical_analysis", fundamentals_enabled, "yahoo_chart", "Yahoo chart fields are configured."),
                    _symbol_required_status("momentum", fundamentals_enabled, "yahoo_chart", "Momentum inputs require a symbol."),
                    _symbol_required_status("volume", fundamentals_enabled, "yahoo_chart", "Volume inputs require a symbol."),
                    _symbol_required_status("news", news_enabled, "yahoo_news", "Yahoo news is configured."),
                ]
            )
        else:
            statuses.extend(
                [
                    status_from_fields("fundamentals", payloads["fundamentals"], ["price", "currency", "exchange"], enabled=fundamentals_enabled),
                    status_from_fields("earnings", payloads["earnings"], ["earnings_date", "eps_estimate", "reported_eps", "calendar_events"]),
                    status_from_fields("valuation", payloads["valuation"], ["pe", "eps", "market_cap"], enabled=fundamentals_enabled),
                    status_from_fields("analyst_targets", payloads["analyst_targets"], ["average_target", "high_target", "low_target", "analyst_count"], enabled=fundamentals_enabled),
                    status_from_fields("analyst_revisions", payloads["analyst_revisions"], ["rating_distribution", "recommendation_key"], enabled=fundamentals_enabled),
                    status_from_fields("technical_analysis", payloads["technical_analysis"], ["price", "sparkline", "fifty_two_week_high", "fifty_two_week_low"], enabled=fundamentals_enabled),
                    status_from_fields("momentum", payloads["momentum"], ["momentum_score", "sparkline"], enabled=fundamentals_enabled),
                    status_from_fields("volume", payloads["volume"], ["current_volume", "average_volume"], enabled=fundamentals_enabled),
                    status_from_fields("news", payloads["news"], ["items"], enabled=news_enabled),
                ]
            )

        statuses.extend(
            [
                status_from_fields("macro", payloads["macro"], ["vix", "us10y", "risk_mode"], notes="Macro snapshot is available from the current app state."),
                status_from_fields("geopolitical", payloads["geopolitical"], ["geopolitical_risk", "headlines"]),
                status_from_fields("competitors", payloads["competitors"], ["competitors"]),
                status_from_fields("upcoming_events", payloads["upcoming_events"], ["events"]),
                status_from_fields("portfolio_positions", payloads["portfolio_positions"], ["position" if clean_symbol else "positions_count"]),
                _ibkr_status(self.settings, provider_status),
                DiscordConnector(self.settings).status(clean_symbol, payloads["advisor_discord"]),
                XSentimentConnector(self.settings).status(clean_symbol, payloads["x_sentiment"]),
                SeekingAlphaConnector(self.settings).status(clean_symbol, payloads["seeking_alpha"]),
            ]
        )
        return statuses, payloads

    def status_response(self, **kwargs: Any) -> dict[str, Any]:
        symbol = _clean_symbol(kwargs.get("symbol"))
        statuses, _ = self.evaluate(**kwargs)
        return {
            "as_of": _now_iso(),
            "scope": "symbol" if symbol else "global",
            "symbol": symbol,
            "source_availability": {row.definition.id: row.status for row in statuses},
            "coverage": summarize_sources(statuses),
            "sources": [row.to_dict() for row in statuses],
            "settings": {
                "enableDiscordSignals": DiscordConnector(self.settings).enabled,
                "enableSeekingAlpha": SeekingAlphaConnector(self.settings).enabled,
                "enableXSentiment": XSentimentConnector(self.settings).enabled,
            },
        }

    def coverage_response(self, **kwargs: Any) -> dict[str, Any]:
        status = self.status_response(**kwargs)
        return {
            "as_of": status["as_of"],
            "scope": status["scope"],
            "symbol": status["symbol"],
            "coverage": status["coverage"],
            "source_availability": status["source_availability"],
            "confidence_impact": status["coverage"]["confidence_impact"],
            "confidence_score_ceiling": status["coverage"]["confidence_score_ceiling"],
            "rule": status["coverage"]["confidence_rule"],
        }

    def inputs_response(self, **kwargs: Any) -> dict[str, Any]:
        symbol = _clean_symbol(kwargs.get("symbol"))
        statuses, payloads = self.evaluate(**kwargs)
        source_rows = {row.definition.id: row for row in statuses}
        inputs: dict[str, Any] = {}
        for source_id, row in source_rows.items():
            payload = payloads.get(source_id) or {}
            inputs[source_id] = {
                "status": row.status,
                "enabled": row.status != STATUS_DISABLED,
                "data": payload if has_value(payload) and row.status != STATUS_MISSING else None,
                "available_fields": row.available_fields,
                "missing_fields": row.missing_fields,
                "confidence_impact": row.confidence_impact,
                "notes": row.notes,
            }
        return {
            "as_of": _now_iso(),
            "symbol": symbol,
            "coverage": summarize_sources(statuses),
            "source_availability": {row.definition.id: row.status for row in statuses},
            "inputs": inputs,
        }


def build_source_status(settings: dict[str, Any] | None = None, **kwargs: Any) -> dict[str, Any]:
    return SourceRegistry(settings).status_response(**kwargs)


def build_source_coverage(settings: dict[str, Any] | None = None, **kwargs: Any) -> dict[str, Any]:
    return SourceRegistry(settings).coverage_response(**kwargs)


def build_symbol_inputs(symbol: str, settings: dict[str, Any] | None = None, **kwargs: Any) -> dict[str, Any]:
    kwargs["symbol"] = symbol
    return SourceRegistry(settings).inputs_response(**kwargs)
