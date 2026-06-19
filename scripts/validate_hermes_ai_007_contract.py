from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from services.ai_intelligence_context import build_ai_intelligence_context_batch  # noqa: E402
from services.ai_intelligence_v25 import V25_VERDICT_WEIGHTS  # noqa: E402
from services.settings_store import get_settings  # noqa: E402
from services.state import WATCHLIST, catalyst_calendar, macro_snapshot, portfolio_snapshot  # noqa: E402


DEFAULT_SYMBOLS = ["AAPL", "AMD", "NBIS", "TSM"]
IMPORTANCE = {"Low", "Medium", "High"}
REQUIRED_V25_FIELDS = ["executiveBrief", "catalysts", "moat", "institutionalView", "newsImpact"]


def provider_status(portfolio: dict[str, Any]) -> dict[str, Any]:
    return {
        "configured_mode": portfolio.get("configured_mode") or "mock",
        "active_source": portfolio.get("active_source") or portfolio.get("source") or "DEMO",
        "fallback_active": bool(portfolio.get("fallback_active")),
        "status": "connected",
    }


def build_batch(symbols: list[str], *, refresh: bool = False) -> dict[str, Any]:
    portfolio = portfolio_snapshot()
    portfolio["configured_mode"] = "mock"
    portfolio["active_source"] = portfolio.get("source", "DEMO")
    portfolio["fallback_active"] = False
    return build_ai_intelligence_context_batch(
        symbols,
        settings=get_settings(),
        portfolio=portfolio,
        macro=macro_snapshot(),
        calendar=catalyst_calendar(),
        watchlist=WATCHLIST,
        provider_status=provider_status(portfolio),
        refresh=refresh,
        debug=False,
    )


def assert_true(condition: bool, message: str, failures: list[str]) -> None:
    if not condition:
        failures.append(message)


def _score_in_range(value: Any) -> bool:
    return isinstance(value, (int, float)) and 0 <= value <= 100


def _validate_catalyst_row(symbol: str, row: dict[str, Any], failures: list[str]) -> None:
    assert_true(bool(row.get("title")), f"{symbol}: catalyst title missing", failures)
    assert_true(row.get("impact") in IMPORTANCE, f"{symbol}: catalyst impact invalid", failures)
    assert_true(_score_in_range(row.get("probability")), f"{symbol}: catalyst probability invalid", failures)
    assert_true(bool(row.get("timeframe")), f"{symbol}: catalyst timeframe missing", failures)
    assert_true(bool(row.get("description")), f"{symbol}: catalyst description missing", failures)


def _validate_upcoming_row(symbol: str, row: dict[str, Any], failures: list[str]) -> None:
    assert_true(bool(row.get("event")), f"{symbol}: upcoming event missing", failures)
    assert_true(bool(row.get("date")), f"{symbol}: upcoming date missing", failures)
    assert_true(row.get("importance") in IMPORTANCE, f"{symbol}: upcoming importance invalid", failures)


def validate_payload(symbol: str, payload: dict[str, Any], failures: list[str]) -> None:
    for field in REQUIRED_V25_FIELDS:
        assert_true(field in payload, f"{symbol}: missing {field}", failures)

    brief = payload.get("executiveBrief")
    assert_true(isinstance(brief, list) and 3 <= len(brief) <= 5, f"{symbol}: executiveBrief must have 3-5 bullets", failures)
    assert_true(all(isinstance(item, str) and item.strip() for item in brief or []), f"{symbol}: executiveBrief bullets must be text", failures)

    catalysts = payload.get("catalysts") or {}
    assert_true(isinstance(catalysts.get("positive"), list), f"{symbol}: positive catalysts must be a list", failures)
    assert_true(isinstance(catalysts.get("negative"), list), f"{symbol}: negative catalysts must be a list", failures)
    assert_true(isinstance(catalysts.get("upcoming"), list), f"{symbol}: upcoming catalysts must be a list", failures)
    for row in (catalysts.get("positive") or []) + (catalysts.get("negative") or []):
        _validate_catalyst_row(symbol, row, failures)
    for row in catalysts.get("upcoming") or []:
        _validate_upcoming_row(symbol, row, failures)

    moat = payload.get("moat") or {}
    assert_true(_score_in_range(moat.get("score")), f"{symbol}: moat score invalid", failures)
    assert_true(isinstance(moat.get("rating"), str) and bool(moat.get("rating")), f"{symbol}: moat rating missing", failures)
    assert_true(isinstance(moat.get("drivers"), list), f"{symbol}: moat drivers must be a list", failures)

    institutional = payload.get("institutionalView") or {}
    assert_true(isinstance(institutional.get("buyReasons"), list), f"{symbol}: buyReasons must be a list", failures)
    assert_true(isinstance(institutional.get("avoidReasons"), list), f"{symbol}: avoidReasons must be a list", failures)
    assert_true(isinstance(institutional.get("thesis"), str) and bool(institutional.get("thesis")), f"{symbol}: institutional thesis missing", failures)

    news_impact = payload.get("newsImpact") or {}
    assert_true(_score_in_range(news_impact.get("score")), f"{symbol}: newsImpact score invalid", failures)
    assert_true(news_impact.get("importance") in IMPORTANCE, f"{symbol}: newsImpact importance invalid", failures)
    assert_true(isinstance(news_impact.get("headlineCount"), int), f"{symbol}: headlineCount must be an int", failures)
    assert_true(isinstance(news_impact.get("materialEvents"), list), f"{symbol}: materialEvents must be a list", failures)

    weighting = payload.get("verdictWeighting") or {}
    assert_true(weighting.get("weights") == V25_VERDICT_WEIGHTS, f"{symbol}: verdict weights do not match HERMES-AI-007", failures)
    assert_true(sum((weighting.get("weights") or {}).values()) == 100, f"{symbol}: verdict weights must sum to 100", failures)


def validate_acceptance(payloads: dict[str, dict[str, Any]], failures: list[str]) -> None:
    nbis = payloads.get("NBIS") or {}
    assert_true(bool(nbis.get("executiveBrief")), "NBIS: executive brief missing", failures)
    assert_true(bool((nbis.get("catalysts") or {}).get("positive")), "NBIS: catalysts missing", failures)
    assert_true(bool((nbis.get("moat") or {}).get("drivers")), "NBIS: moat drivers missing", failures)
    assert_true(bool((nbis.get("institutionalView") or {}).get("thesis")), "NBIS: institutional thesis missing", failures)

    amd = payloads.get("AMD") or {}
    amd_catalysts = amd.get("catalysts") or {}
    assert_true(
        any("earnings" in str(row.get("event", "")).lower() for row in amd_catalysts.get("upcoming", []) or []),
        "AMD: upcoming earnings catalyst missing",
        failures,
    )
    assert_true(
        any("ai" in str(row.get("title", "")).lower() and any(token in str(row.get("title", "")).lower() for token in ("growth", "demand", "adoption")) for row in amd_catalysts.get("positive", []) or []),
        "AMD: AI growth/demand catalyst missing",
        failures,
    )
    assert_true(
        len(((amd.get("newsImpact") or {}).get("materialEvents") or [])) >= 1,
        "AMD: material news impact missing",
        failures,
    )

    tsm = payloads.get("TSM") or {}
    moat = tsm.get("moat") or {}
    assert_true((moat.get("score") or 0) >= 75 and moat.get("rating") == "Strong", "TSM: strong moat score missing", failures)
    assert_true(bool((tsm.get("institutionalView") or {}).get("thesis")), "TSM: institutional thesis missing", failures)


def percentile_95(values: list[float]) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return values[0]
    return statistics.quantiles(values, n=100, method="inclusive")[94]


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate HERMES-AI-007 frontend payload contract.")
    parser.add_argument("--refresh", action="store_true", help="Refresh source caches during the warmup pass.")
    parser.add_argument("--write-examples", action="store_true", help="Write frontend payload examples and validation summary.")
    parser.add_argument("--examples-dir", default=str(ROOT / "docs" / "examples" / "ai-intelligence" / "HERMES-AI-007"))
    args = parser.parse_args()

    build_batch(DEFAULT_SYMBOLS, refresh=args.refresh)
    batch = build_batch(DEFAULT_SYMBOLS, refresh=False)
    failures: list[str] = []
    payloads = batch.get("frontendPayloads") or {}
    for symbol in DEFAULT_SYMBOLS:
        validate_payload(symbol, payloads.get(symbol) or {}, failures)
    validate_acceptance(payloads, failures)

    timings = list(((batch.get("performance") or {}).get("perSymbolMs") or {}).values())
    p95_ms = percentile_95([float(value or 0) for value in timings])
    assert_true(p95_ms < 2000, f"performance: p95 {round(p95_ms, 2)}ms exceeds 2000ms", failures)

    result = {
        "ok": not failures,
        "symbols": DEFAULT_SYMBOLS,
        "payloadComplete": batch.get("payloadComplete"),
        "dataComplete": batch.get("dataComplete"),
        "performance": batch.get("performance"),
        "p95Ms": round(p95_ms, 2),
        "failures": failures,
        "examplesWritten": str(Path(args.examples_dir)) if args.write_examples else None,
    }

    if args.write_examples:
        output_dir = Path(args.examples_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        for symbol in DEFAULT_SYMBOLS:
            (output_dir / f"{symbol}.frontend-payload.json").write_text(
                json.dumps(payloads[symbol], indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
            )
        (output_dir / "validation-summary.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print(json.dumps(result, indent=2, sort_keys=True))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
