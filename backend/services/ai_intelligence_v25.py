from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


V25_VERDICT_WEIGHTS: dict[str, int] = {
    "fundamentals": 25,
    "analysts": 15,
    "technicals": 15,
    "momentum": 10,
    "news": 10,
    "macro": 10,
    "catalysts": 10,
    "portfolioFit": 5,
}

MATERIAL_EVENT_RULES: tuple[tuple[str, tuple[str, ...], tuple[str, ...], int], ...] = (
    (
        "Earnings surprise",
        ("earnings beat", "beats estimates", "beat estimates", "eps beat", "revenue beat", "loss narrower"),
        ("earnings miss", "misses estimates", "missed estimates", "revenue miss", "loss wider"),
        92,
    ),
    (
        "Guidance revision",
        ("raises guidance", "raised guidance", "boosts outlook", "lifts outlook", "raises forecast"),
        ("cuts guidance", "lowered guidance", "weak outlook", "guidance cut", "cuts forecast"),
        90,
    ),
    (
        "FDA approval",
        ("fda approval", "approved by fda", "fda clears"),
        ("fda rejects", "clinical hold", "complete response letter"),
        95,
    ),
    (
        "Major contract",
        ("major contract", "contract win", "wins contract", "large order", "supply deal", "hyperscaler contract"),
        ("contract loss", "customer loss", "order cancellation"),
        88,
    ),
    (
        "Acquisition",
        ("acquires", "acquisition", "merger", "takeover"),
        ("deal blocked", "terminates merger", "deal falls through"),
        86,
    ),
    (
        "CEO change",
        ("new ceo", "appoints ceo", "names ceo"),
        ("ceo resigns", "ceo steps down", "chief executive resigns"),
        82,
    ),
    (
        "Product cycle",
        ("launches", "unveils", "new product", "product cycle", "blackwell", "mi300", "mi350", "iphone", "gpu cluster"),
        ("product delay", "delays launch", "launch delayed"),
        76,
    ),
    (
        "Analyst action",
        ("upgrade", "raises price target", "bullish analyst", "analyst commentary"),
        ("downgrade", "cuts price target", "bearish analyst"),
        72,
    ),
    (
        "Regulatory action",
        ("regulatory approval", "approval"),
        ("regulation", "probe", "lawsuit", "antitrust", "tariff", "export control"),
        78,
    ),
    (
        "AI demand",
        ("ai demand", "ai infrastructure", "gpu demand", "ai super-cycle", "hyperscaler capex", "sovereign ai"),
        ("ai slowdown", "capex cut", "capex pause"),
        74,
    ),
)


def _num(value: Any) -> float | None:
    try:
        if value in (None, ""):
            return None
        if isinstance(value, str):
            normalized = (
                value.strip()
                .replace("$", "")
                .replace(",", "")
                .replace("%", "")
                .replace("x", "")
                .replace("X", "")
            )
            if not normalized or normalized.upper() in {"N/A", "NA", "--"}:
                return None
            value = normalized.split()[0]
        parsed = float(value)
        return parsed if parsed == parsed else None
    except (TypeError, ValueError):
        return None


def _clamp(value: float, low: float = 0, high: float = 100) -> float:
    return max(low, min(high, value))


def _int(value: float) -> int:
    return int(round(value))


def _first(*values: Any) -> Any:
    for value in values:
        if value not in (None, "", [], {}):
            return value
    return None


def _compact(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if value not in (None, "", [], {})}


def _contains_any(text: str, tokens: tuple[str, ...]) -> bool:
    return any(token in text for token in tokens)


def _importance(score: float) -> str:
    if score >= 75:
        return "High"
    if score >= 45:
        return "Medium"
    return "Low"


def _impact_label(score: float) -> str:
    if score >= 76:
        return "High"
    if score >= 52:
        return "Medium"
    return "Low"


def _parse_event_date(value: Any) -> str | None:
    text = str(value or "").replace("(est.)", "").strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%b %d, %Y", "%B %d, %Y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    return text


def _item_text(item: dict[str, Any]) -> str:
    return f"{item.get('title', '')} {item.get('summary', '')} {item.get('catalyst_type', '')}".lower()


def _item_direction(item: dict[str, Any], text: str, positive_tokens: tuple[str, ...], negative_tokens: tuple[str, ...]) -> str:
    sentiment = str(_first(item.get("sentiment"), item.get("bias"), item.get("impact"), "")).lower()
    if _contains_any(text, negative_tokens) or "negative" in sentiment or "bearish" in sentiment:
        return "Negative"
    if _contains_any(text, positive_tokens) or "positive" in sentiment or "bullish" in sentiment:
        return "Positive"
    if "mixed" in sentiment:
        return "Mixed"
    return "Neutral"


def detect_material_events(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    catalyst_type_boost = {
        "earnings": "Earnings surprise",
        "guidance": "Guidance revision",
        "deal": "Major contract",
        "product": "Product cycle",
        "regulation": "Regulatory action",
        "capex": "AI demand",
        "analyst_upgrade": "Analyst action",
        "analyst_downgrade": "Analyst action",
    }
    for item in items:
        if not isinstance(item, dict):
            continue
        text = _item_text(item)
        event_type: str | None = None
        direction = "Neutral"
        base_score = 0
        for candidate, positive_tokens, negative_tokens, score in MATERIAL_EVENT_RULES:
            if _contains_any(text, positive_tokens) or _contains_any(text, negative_tokens):
                event_type = candidate
                direction = _item_direction(item, text, positive_tokens, negative_tokens)
                base_score = score
                break
        catalyst_type = str(item.get("catalyst_type") or "").lower()
        if event_type is None and catalyst_type in catalyst_type_boost:
            event_type = catalyst_type_boost[catalyst_type]
            direction = _item_direction(item, text, (), ())
            base_score = 76 if catalyst_type in {"capex", "product", "analyst_upgrade", "analyst_downgrade"} else 84
        raw_impact = _num(_first(item.get("impact_score"), item.get("confidence"), item.get("relevance_score"))) or 0
        if event_type is None and raw_impact >= 72:
            event_type = "High-impact headline"
            direction = _item_direction(item, text, (), ())
            base_score = 70
        if event_type is None:
            continue
        title = str(item.get("title") or event_type).strip()
        key = (event_type, title)
        if key in seen:
            continue
        seen.add(key)
        impact_score = _int(_clamp(max(base_score, raw_impact)))
        events.append(
            _compact(
                {
                    "eventType": event_type,
                    "title": title,
                    "direction": direction,
                    "impactScore": impact_score,
                    "importance": _importance(impact_score),
                    "source": item.get("source"),
                    "date": item.get("published_at") or item.get("published") or item.get("date"),
                    "summary": item.get("summary"),
                }
            )
        )
    return sorted(events, key=lambda row: row.get("impactScore", 0), reverse=True)[:5]


def build_news_impact(news_payload: dict[str, Any] | None) -> dict[str, Any]:
    payload = news_payload or {}
    items = [item for item in payload.get("items", []) or [] if isinstance(item, dict)]
    material_events = detect_material_events(items)
    signed_scores: list[float] = []
    for event in material_events:
        score = float(event.get("impactScore") or 0)
        direction = str(event.get("direction") or "Neutral")
        if direction == "Positive":
            signed_scores.append(score)
        elif direction == "Negative":
            signed_scores.append(-score)
        elif direction == "Mixed":
            signed_scores.append(score * 0.2)
    if not signed_scores:
        for item in items[:8]:
            raw = _num(_first(item.get("impact_score"), item.get("confidence"), item.get("relevance_score"))) or 45
            direction = _item_direction(item, _item_text(item), (), ())
            if direction == "Positive":
                signed_scores.append(raw * 0.35)
            elif direction == "Negative":
                signed_scores.append(-raw * 0.35)
    directional_score = _int(_clamp(sum(signed_scores) / max(len(signed_scores), 1), -100, 100)) if signed_scores else 0
    score = max([float(event.get("impactScore") or 0) for event in material_events] or [abs(directional_score)])
    if not material_events and items:
        score = max(score, min(55, len(items) * 8))
    direction = "Neutral"
    if directional_score >= 18:
        direction = "Positive"
    elif directional_score <= -18:
        direction = "Negative"
    elif directional_score:
        direction = "Mixed"
    return {
        "score": _int(_clamp(score)),
        "importance": _importance(score),
        "headlineCount": int(_num(_first(payload.get("headlineCount"), payload.get("count"))) or len(items)),
        "materialEvents": material_events,
        "direction": direction,
        "directionalScore": directional_score,
    }


def build_moat_engine(symbol: str, profile: dict[str, Any], fundamentals: dict[str, Any]) -> dict[str, Any]:
    text = " ".join(
        str(value or "")
        for value in (
            symbol,
            profile.get("name"),
            profile.get("sector"),
            profile.get("industry"),
            profile.get("description"),
        )
    ).lower()
    market_cap = _num(_first(fundamentals.get("market_cap"), fundamentals.get("marketCap")))
    components: dict[str, float] = {
        "Brand": 50,
        "Network Effects": 45,
        "Switching Costs": 45,
        "Cost Advantage": 45,
        "Proprietary Technology": 50,
        "Scale": 50,
    }
    if any(token in text for token in ("apple", "consumer", "iphone", "google", "nvidia", "tesla")):
        components["Brand"] += 30
    if any(token in text for token in ("platform", "ecosystem", "cloud", "software", "data", "marketplace")):
        components["Network Effects"] += 25
        components["Switching Costs"] += 22
    if any(token in text for token in ("foundry", "semiconductor foundry", "fab", "manufacturing")):
        components["Switching Costs"] += 28
        components["Cost Advantage"] += 32
        components["Scale"] += 32
        components["Proprietary Technology"] += 25
    if any(token in text for token in ("ai", "gpu", "accelerator", "semiconductor", "chip", "autonomous", "robotics")):
        components["Proprietary Technology"] += 28
        components["Switching Costs"] += 14
    if any(token in text for token in ("low power", "owned infrastructure", "scale", "hyperscaler")):
        components["Cost Advantage"] += 18
        components["Scale"] += 18
    if market_cap is not None:
        if market_cap >= 500_000_000_000:
            components["Scale"] += 30
            components["Brand"] += 12
        elif market_cap >= 50_000_000_000:
            components["Scale"] += 18
        elif market_cap < 5_000_000_000:
            components["Scale"] -= 8
    components = {key: _clamp(value) for key, value in components.items()}
    score = _int(sum(components.values()) / len(components))
    if score >= 75:
        rating = "Strong"
    elif score >= 65:
        rating = "Moderate"
    elif score >= 45:
        rating = "Developing"
    else:
        rating = "Weak"
    driver_map = {
        "Brand": "Brand Strength",
        "Network Effects": "Network Effects",
        "Switching Costs": "High Switching Costs",
        "Cost Advantage": "Cost Advantage",
        "Proprietary Technology": "Technology Leadership",
        "Scale": "Scale Advantage",
    }
    drivers = [driver_map[key] for key, value in sorted(components.items(), key=lambda row: row[1], reverse=True) if value >= 70]
    if not drivers and score >= 45:
        drivers = [driver_map[max(components, key=components.get)]]
    return {"score": score, "rating": rating, "drivers": drivers[:4], "components": {key: _int(value) for key, value in components.items()}}


def _add_catalyst(rows: list[dict[str, Any]], title: str, impact: str, probability: float, timeframe: str, description: str) -> None:
    if any(row.get("title") == title for row in rows):
        return
    rows.append(
        {
            "title": title,
            "impact": impact,
            "probability": _int(_clamp(probability)),
            "timeframe": timeframe,
            "description": description,
        }
    )


def _add_upcoming(rows: list[dict[str, Any]], event: str, date: Any, importance: str) -> None:
    parsed = _parse_event_date(date)
    if not event or any(row.get("event") == event and row.get("date") == parsed for row in rows):
        return
    rows.append({"event": event, "date": parsed, "importance": importance})


def build_catalyst_engine(
    symbol: str,
    *,
    profile: dict[str, Any],
    fundamentals: dict[str, Any],
    analyst_consensus: dict[str, Any],
    analyst_targets: dict[str, Any],
    earnings_history: dict[str, Any],
    earnings_calendar: dict[str, Any],
    technical: dict[str, Any],
    news_sentiment: dict[str, Any],
    news_impact: dict[str, Any],
    macro_context: dict[str, Any],
    calendar: list[dict[str, Any]] | None = None,
    sizing_context: dict[str, Any] | None = None,
) -> dict[str, list[dict[str, Any]]]:
    positive: list[dict[str, Any]] = []
    negative: list[dict[str, Any]] = []
    upcoming: list[dict[str, Any]] = []
    text = " ".join(
        str(value or "")
        for value in (profile.get("sector"), profile.get("industry"), profile.get("description"), news_sentiment.get("digest"))
    ).lower()
    target_upside = _num(analyst_targets.get("upsidePct"))
    surprise = _num(((earnings_history.get("latest") or {}).get("surprisePct")))
    pe = _num(_first(fundamentals.get("pe"), fundamentals.get("trailingPE")))
    momentum = _num(technical.get("momentumScore")) or 50
    consensus = str(analyst_consensus.get("consensusVerdict") or analyst_consensus.get("consensusRating") or "").lower()

    if any(token in text for token in ("ai", "gpu", "semiconductor", "cloud", "hyperscaler", "sovereign ai")):
        probability = 70 + max(0, (news_impact.get("directionalScore") or 0)) * 0.15 + max(0, momentum - 50) * 0.15
        _add_catalyst(
            positive,
            "AI Demand Acceleration",
            "High",
            probability,
            "3-6 months",
            "AI infrastructure and compute demand remain visible in company and news context.",
        )
    if surprise is not None and surprise > 0:
        _add_catalyst(
            positive,
            "Earnings Beat Potential",
            "Medium" if surprise < 10 else "High",
            58 + min(25, surprise),
            "0-3 months",
            "Recent reported results exceeded available estimates.",
        )
    if target_upside is not None and target_upside > 5:
        _add_catalyst(
            positive,
            "Analyst Target Support",
            "High" if target_upside >= 15 else "Medium",
            58 + min(28, target_upside),
            "3-12 months",
            "Consensus target data implies upside from the current reference price.",
        )
    if "overweight" in consensus or "buy" in consensus:
        _add_catalyst(
            positive,
            "Analyst Upgrades",
            "Medium",
            66,
            "1-3 months",
            "Consensus tone remains constructive across available analyst inputs.",
        )
    if any(token in text for token in ("mi300", "mi350", "blackwell", "iphone", "launch", "product", "cluster")):
        _add_catalyst(
            positive,
            "New Product Cycle",
            "Medium",
            64,
            "3-6 months",
            "Product cycle language is present in company, headline, or sector context.",
        )
    if any("buyback" in str(item.get("title", "")).lower() or "repurchase" in str(item.get("title", "")).lower() for item in news_sentiment.get("items", []) or []):
        _add_catalyst(positive, "Buyback Program", "Medium", 68, "0-6 months", "Recent headline flow references capital return.")

    if pe is not None and pe >= 45:
        _add_catalyst(
            negative,
            "Valuation Compression",
            "High" if pe >= 80 else "Medium",
            min(88, 48 + pe * 0.35),
            "0-6 months",
            "The valuation multiple is elevated relative to a broad market baseline.",
        )
    risk_mode = str(macro_context.get("riskMode") or "").lower()
    vix = _num(macro_context.get("vix"))
    us10y = _num(macro_context.get("us10y"))
    if (risk_mode and "buy" not in risk_mode) or (vix is not None and vix >= 22) or (us10y is not None and us10y >= 4.4):
        _add_catalyst(
            negative,
            "Macro Slowdown",
            "Medium",
            58 + (8 if us10y and us10y >= 4.4 else 0) + (8 if vix and vix >= 22 else 0),
            "0-3 months",
            "Rates, volatility, or risk regime can pressure growth and high-duration equities.",
        )
    if surprise is not None and surprise < 0:
        _add_catalyst(negative, "Earnings Miss", "High", 68 + min(20, abs(surprise)), "0-3 months", "Recent earnings surprise was negative.")
    if any(event.get("eventType") == "Regulatory action" for event in news_impact.get("materialEvents", []) or []):
        _add_catalyst(negative, "Regulation", "High", 72, "0-6 months", "Material headline detection flagged regulatory risk.")
    if (sizing_context or {}).get("suggestedAction") in {"trim_or_hold_no_add", "sector_full_no_add"}:
        _add_catalyst(
            negative,
            "Portfolio Concentration",
            "High",
            80,
            "Current",
            "Portfolio guardrails limit additional exposure despite the stock thesis.",
        )
    if profile.get("sector") and (profile.get("industry") or profile.get("sector")):
        _add_catalyst(
            negative,
            "Competition",
            "Medium",
            54,
            "6-12 months",
            "Peer competition remains a standing risk in the industry context.",
        )

    next_earnings = earnings_calendar.get("nextEarningsDate")
    if next_earnings:
        _add_upcoming(upcoming, f"{symbol} Earnings", next_earnings, "High")
    for event in earnings_calendar.get("events", []) or []:
        _add_upcoming(upcoming, str(event.get("event") or f"{symbol} Earnings"), event.get("date"), "High")
    macro_sensitive = _num(_first((sizing_context or {}).get("riskScore"), fundamentals.get("macro_sensitivity"))) or 0
    for event in calendar or []:
        event_text = str(event.get("event") or "")
        upper = event_text.upper()
        if symbol in upper or "EARNINGS" in upper:
            continue
        if any(token in upper for token in ("CPI", "FED", "FOMC", "JOBS")) and (macro_sensitive >= 60 or "ai" in text or "semiconductor" in text):
            _add_upcoming(upcoming, event_text, event.get("date"), "Medium")
    return {
        "positive": sorted(positive, key=lambda row: row.get("probability", 0), reverse=True)[:5],
        "negative": sorted(negative, key=lambda row: row.get("probability", 0), reverse=True)[:5],
        "upcoming": upcoming[:5],
    }


def build_institutional_view(
    symbol: str,
    *,
    moat: dict[str, Any],
    catalysts: dict[str, list[dict[str, Any]]],
    analyst_consensus: dict[str, Any],
    analyst_targets: dict[str, Any],
    technical: dict[str, Any],
    news_impact: dict[str, Any],
    sizing_context: dict[str, Any],
) -> dict[str, Any]:
    buy_reasons: list[str] = []
    avoid_reasons: list[str] = []
    if moat.get("rating") == "Strong":
        buy_reasons.append("Strong moat profile")
    buy_reasons.extend(moat.get("drivers", [])[:2])
    if analyst_targets.get("upsidePct") is not None and (_num(analyst_targets.get("upsidePct")) or 0) > 5:
        buy_reasons.append("Analyst targets imply upside")
    if "overweight" in str(analyst_consensus.get("consensusVerdict") or "").lower():
        buy_reasons.append("Constructive analyst consensus")
    if catalysts.get("positive"):
        buy_reasons.append(catalysts["positive"][0]["title"])
    if news_impact.get("direction") == "Positive" and news_impact.get("importance") in {"Medium", "High"}:
        buy_reasons.append("Material headline flow is supportive")

    risk = _num(technical.get("riskScore"))
    if risk is not None and risk >= 70:
        avoid_reasons.append("Elevated risk score")
    avoid_reasons.extend(row["title"] for row in catalysts.get("negative", [])[:2])
    if sizing_context.get("suggestedAction") in {"trim_or_hold_no_add", "sector_full_no_add"}:
        avoid_reasons.append("Portfolio guardrails limit adding")
    if news_impact.get("direction") == "Negative" and news_impact.get("importance") in {"Medium", "High"}:
        avoid_reasons.append("Material headline flow is negative")

    buy_reasons = list(dict.fromkeys(buy_reasons))[:5]
    avoid_reasons = list(dict.fromkeys(avoid_reasons))[:5]
    if buy_reasons and len(buy_reasons) >= len(avoid_reasons):
        thesis = f"Institutional investors are likely to remain constructive on {symbol} due to {buy_reasons[0].lower()} and visible catalyst support."
    elif buy_reasons:
        thesis = f"Institutional investors may keep {symbol} on watch, but risk controls matter because {avoid_reasons[0].lower() if avoid_reasons else 'the setup is mixed'}."
    else:
        thesis = f"Institutional investors are likely to require stronger confirmation before underwriting a more constructive {symbol} thesis."
    return {"buyReasons": buy_reasons, "avoidReasons": avoid_reasons, "thesis": thesis}


def build_executive_brief(
    symbol: str,
    *,
    analyst_targets: dict[str, Any],
    catalysts: dict[str, list[dict[str, Any]]],
    moat: dict[str, Any],
    news_impact: dict[str, Any],
    technical: dict[str, Any],
    sizing_context: dict[str, Any],
) -> list[str]:
    bullets: list[str] = []
    upside = _num(analyst_targets.get("upsidePct"))
    if upside is not None:
        direction = "upside" if upside >= 0 else "downside"
        bullets.append(f"Analyst target context implies {round(abs(upside), 1)}% {direction}.")
    if moat.get("rating"):
        bullets.append(f"Moat rating is {moat.get('rating').lower()} with {', '.join(moat.get('drivers', [])[:2]) or 'limited explicit drivers'}.")
    if catalysts.get("positive"):
        bullets.append(f"Primary positive catalyst is {catalysts['positive'][0]['title'].lower()}.")
    if catalysts.get("upcoming"):
        event = catalysts["upcoming"][0]
        bullets.append(f"Upcoming {event.get('event')} remains a key catalyst window.")
    if news_impact.get("headlineCount"):
        bullets.append(f"News impact is {str(news_impact.get('importance')).lower()} across {news_impact.get('headlineCount')} recent headlines.")
    action = sizing_context.get("suggestedAction")
    if action in {"trim_or_hold_no_add", "sector_full_no_add"}:
        bullets.append("Portfolio guardrails argue against adding exposure here.")
    elif action:
        bullets.append("Portfolio fit allows measured sizing if the thesis holds.")
    if not bullets:
        risk = _num(technical.get("riskScore"))
        bullets.append(f"{symbol} has a balanced setup with {_impact_label(100 - (risk or 50)).lower()} risk-adjusted support.")
    return bullets[:5]


def build_verdict_weighting_v2(
    *,
    source_contexts: dict[str, dict[str, Any]],
    technical: dict[str, Any],
    analyst_consensus: dict[str, Any],
    analyst_targets: dict[str, Any],
    news_impact: dict[str, Any],
    macro_context: dict[str, Any],
    catalysts: dict[str, list[dict[str, Any]]],
    moat: dict[str, Any],
    fit_inputs: dict[str, Any],
) -> dict[str, Any]:
    market = (((source_contexts.get("companyFundamentals") or {}).get("data") or {}).get("market") or {})
    earnings_latest = ((((source_contexts.get("earningsHistory") or {}).get("data") or {}).get("latest") or {}))
    eps = _num(_first(market.get("eps"), earnings_latest.get("reportedEps")))
    pe = _num(market.get("pe"))
    surprise = _num(earnings_latest.get("surprisePct"))
    fundamentals = 50.0
    if eps is not None:
        fundamentals += 10 if eps > 0 else -10
    if pe is not None:
        fundamentals += 10 if 0 < pe <= 35 else (-12 if pe >= 80 else -5 if pe >= 45 else 0)
    if surprise is not None:
        fundamentals += max(-12, min(12, surprise * 0.6))
    fundamentals += (float(moat.get("score") or 50) - 50) * 0.2

    upside = _num(analyst_targets.get("upsidePct"))
    analyst_count = _num(analyst_consensus.get("analystCount"))
    analysts = 50.0
    if upside is not None:
        analysts += max(-22, min(24, upside * 0.9))
    verdict = str(analyst_consensus.get("consensusVerdict") or "").lower()
    analysts += 12 if "overweight" in verdict else -12 if "underweight" in verdict else 0
    if analyst_count is not None:
        analysts += min(8, analyst_count / 6)

    trend = _num(technical.get("trendScore")) or 50
    risk = _num(technical.get("riskScore")) or 50
    technicals = trend * 0.65 + (100 - risk) * 0.35
    momentum = _num(technical.get("momentumScore")) or 50

    news = 50 + (float(news_impact.get("directionalScore") or 0) * 0.38)
    risk_mode = str(macro_context.get("riskMode") or "").lower()
    vix = _num(macro_context.get("vix"))
    us10y = _num(macro_context.get("us10y"))
    macro = 54.0 if "buy" in risk_mode else 48.0
    if vix is not None:
        macro += 7 if vix < 18 else -8 if vix >= 25 else -2 if vix >= 20 else 0
    if us10y is not None and us10y >= 4.4:
        macro -= 6

    positive_prob = sum(float(row.get("probability") or 0) for row in catalysts.get("positive", []))
    negative_prob = sum(float(row.get("probability") or 0) for row in catalysts.get("negative", []))
    catalyst_count = len(catalysts.get("positive", [])) + len(catalysts.get("negative", []))
    catalyst_score = 50 + ((positive_prob - negative_prob) / max(catalyst_count, 1)) * 0.22
    if catalysts.get("upcoming"):
        catalyst_score += 3

    portfolio_fit = _num(fit_inputs.get("portfolioFitScore")) or 50
    component_scores = {
        "fundamentals": _int(_clamp(fundamentals)),
        "analysts": _int(_clamp(analysts)),
        "technicals": _int(_clamp(technicals)),
        "momentum": _int(_clamp(momentum)),
        "news": _int(_clamp(news)),
        "macro": _int(_clamp(macro)),
        "catalysts": _int(_clamp(catalyst_score)),
        "portfolioFit": _int(_clamp(portfolio_fit)),
    }
    composite = sum(component_scores[key] * weight for key, weight in V25_VERDICT_WEIGHTS.items()) / 100
    event_adjustment = 0.0
    if news_impact.get("materialEvents"):
        materiality = float(news_impact.get("score") or 0) / 100
        event_adjustment = float(news_impact.get("directionalScore") or 0) / 100 * (3 + materiality * 5)
    catalyst_adjustment = (component_scores["catalysts"] - 50) * 0.08
    return {
        "version": "HERMES-AI-007-V2.5",
        "weights": V25_VERDICT_WEIGHTS,
        "componentScores": component_scores,
        "compositeScore": _int(_clamp(composite)),
        "expectedReturnAdjustmentPct": round(event_adjustment + catalyst_adjustment, 2),
        "method": "Dynamic V2 weighting: fundamentals 25, analysts 15, technicals 15, momentum 10, news 10, macro 10, catalysts 10, portfolio fit 5.",
    }
