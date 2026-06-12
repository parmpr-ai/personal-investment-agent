# CR-SI-027..031 AI Intelligence Data Audit

Date: 2026-06-12

## Summary

Implemented AI Intelligence data and interaction hardening in `frontend/components/intelligence/StockAiIntelligenceWidget.tsx`.

Key changes:

- Removed synthetic fallback scoring for composite, trend, institutional, confidence, metric deltas, and history.
- Suppressed manual placeholder scores such as `momentum_score: 50` and `news_score: 50`.
- Replaced metric bottom sheets with full-screen intelligence detail views.
- Made AI Insights interactive with full-screen detail views.
- Hardened Fair Value so unavailable valuation data hides scenarios, chart, and upside/downside.
- Added per-metric Source and Last Updated display.
- Historical Evolution now renders only when stored history arrays are present.

## AI Metric Audit

Metric: Momentum

Current Formula:
Uses explicit `momentum_score`, `momentumScore`, or `momentum` only. Composite scoring includes Momentum only when this explicit score is valid.

Data Sources:
Portfolio position rows, watchlist rows, manual holding rows, stock intelligence source payload.

API Sources:
`/api/dashboard`, `/api/stock/[ticker]`; source assembly in `frontend/components/intelligence/useStockIntelligence.ts`.

Fallback Logic:
No UI fallback score. Manual placeholder `50` values are rejected.

Placeholder Values:
`backend/services/manual_holdings.py` seeds `momentum_score: 50`; now treated as missing for manual holdings.

Historical Persistence:
NO. UI only reads persisted arrays such as `ai_metric_history.momentum`; no backend writer was found.

Known Limitations:
Existing demo positions expose momentum scores without metric-level provenance or timestamps.

Affected Files:
`frontend/components/intelligence/StockAiIntelligenceWidget.tsx`, `backend/services/state.py`, `backend/services/manual_holdings.py`, `frontend/components/intelligence/useStockIntelligence.ts`.

Metric: Trend

Current Formula:
Uses explicit `trend_score`, `trendScore`, `trend_strength_score`, or `trendStrengthScore` only. Trend text labels are evidence only and are not converted into scores.

Data Sources:
Technical payload from stock panel intelligence.

API Sources:
`/api/stock/[ticker]`; `backend/services/stock_intelligence.py`.

Fallback Logic:
No derived score from labels such as Sideways or Uptrend. No day-change-derived score.

Placeholder Values:
Previous UI converted labels/day change into scores including neutral `50`; this is removed.

Historical Persistence:
NO. No stored trend score snapshots found.

Known Limitations:
Backend currently provides `technical.trend` label from day change, not a persisted trend score.

Affected Files:
`frontend/components/intelligence/StockAiIntelligenceWidget.tsx`, `backend/services/stock_intelligence.py`.

Metric: Sentiment

Current Formula:
Uses explicit `sentiment_score`, `sentimentScore`, `news_score`, or `newsScore` only.

Data Sources:
Position/watchlist source rows, news intelligence signals when available.

API Sources:
`/api/dashboard`, `/api/stock/[ticker]`; news provider path uses Yahoo news in `backend/services/stock_intelligence.py`.

Fallback Logic:
No UI fallback score. Manual `news_score: 50` is rejected.

Placeholder Values:
`backend/services/manual_holdings.py` seeds `news_score: 50`; now treated as missing for manual holdings.

Historical Persistence:
NO. No stored sentiment score snapshots found.

Known Limitations:
The stock panel news feed can provide articles, but the current widget only receives source-level sentiment/news scores.

Affected Files:
`frontend/components/intelligence/StockAiIntelligenceWidget.tsx`, `backend/services/manual_holdings.py`, `backend/services/stock_intelligence.py`.

Metric: Institutional

Current Formula:
Uses explicit `institutional_score`, `institutionalScore`, `institutional_flow_score`, `institutionalFlowScore`, or `inst_score` only.

Data Sources:
Any future provider/source payload fields with institutional ownership or flow scores.

API Sources:
No confirmed current backend provider. UI is prepared for payload fields.

Fallback Logic:
No derivation from volume trend, momentum, or sentiment.

Placeholder Values:
Previous UI derived an institutional score from other metrics; this is removed.

Historical Persistence:
NO. No stored institutional score snapshots found.

Known Limitations:
Most current payloads will show "Not enough data available to calculate this metric." until a real institutional feed is added.

Affected Files:
`frontend/components/intelligence/StockAiIntelligenceWidget.tsx`.

Metric: Fair Value

Current Formula:
Requires current price and fair value estimate or average analyst target. Score is `clamp(50 + upside_pct * 1.1)`, where upside is calculated from fair value versus current price.

Data Sources:
Market price fields from source/fundamentals; target fields from source targets/fundamentals.

API Sources:
`/api/stock/[ticker]`; potential Yahoo/fundamentals target data via connector payloads.

Fallback Logic:
If current price or fair value estimate is missing, no Fair Value score is shown. Bear/Base/Bull, valuation chart, and upside/downside are hidden.

Placeholder Values:
Previous UI displayed fallback scenario text even when Fair Value said Needs Data; this is removed.

Historical Persistence:
NO. No stored Fair Value score snapshots found.

Known Limitations:
Scenario detail depends on available target low/base/high fields; the widget does not fabricate missing scenarios.

Affected Files:
`frontend/components/intelligence/StockAiIntelligenceWidget.tsx`.

Metric: Risk

Current Formula:
Uses explicit `risk_score`, `riskScore`, or `risk`. Risk remains Lower Is Better.

Data Sources:
Portfolio positions, watchlist rows, manual holdings, stock source payload.

API Sources:
`/api/dashboard`, `/api/stock/[ticker]`.

Fallback Logic:
No UI fallback score. Manual holdings may still provide an asset-type-derived `risk` from backend.

Placeholder Values:
Manual holdings seed `risk: 58` for non-crypto/non-option assets and `risk: 86` for crypto/options. This is documented as a Derived Signal, not a hidden UI fallback.

Historical Persistence:
NO. No stored risk score snapshots found.

Known Limitations:
Risk provenance is coarse unless backend adds metric-level source and timestamp fields.

Affected Files:
`frontend/components/intelligence/StockAiIntelligenceWidget.tsx`, `backend/services/manual_holdings.py`, `backend/services/state.py`.

## Data Source Mapping

| Metric | Accepted Score Fields | Source Display | Last Updated Fields |
| --- | --- | --- | --- |
| Momentum | `momentum_score`, `momentumScore`, `momentum` | Metric source map, provider source, IBKR, Derived Signal, Internal Calculation | `momentum_updated_at`, `last_updated`, `updated_at`, `as_of` |
| Trend | `trend_score`, `trendScore`, `trend_strength_score`, `trendStrengthScore` | Metric source map, provider source, Internal Calculation | `trend_updated_at`, `last_updated`, `updated_at`, `as_of` |
| Sentiment | `sentiment_score`, `sentimentScore`, `news_score`, `newsScore` | Yahoo, Seeking Alpha, provider source, Derived Signal | `sentiment_updated_at`, `news_updated_at`, `last_updated`, `updated_at`, `as_of` |
| Institutional | `institutional_score`, `institutionalScore`, `institutional_flow_score`, `institutionalFlowScore`, `inst_score` | Metric source map, Derived Signal | `institutional_updated_at`, `inst_flow_updated_at`, `last_updated`, `updated_at`, `as_of` |
| Fair Value | current price plus `fair_value`, `fairValue`, `average_target`, `averageTarget`, `targetMeanPrice`, `base` | Yahoo, provider source, Internal Calculation | `fair_value_updated_at`, `target_updated_at`, `last_updated`, `updated_at`, `as_of` |
| Risk | `risk_score`, `riskScore`, `risk` | IBKR, Derived Signal, Internal Calculation | `risk_updated_at`, `last_updated`, `updated_at`, `as_of` |

## Historical Data Validation Report

Historical Charts Validated: YES

Findings:

- Previous widget generated synthetic sparkline history with `buildSpark`.
- No backend persistence table or service for AI metric score snapshots was found.
- `backend/services/stock_intelligence.py` computes current labels and summaries only.
- `backend/services/manual_holdings.py` and `backend/services/state.py` expose current scores, not history.

Implemented behavior:

- Removed synthetic history generation.
- Mini-sparklines and Historical Evolution render only when the source payload contains stored arrays such as `ai_metric_history`, `metric_history`, `metrics_history`, `historical_metrics`, or `history`.
- When stored history is absent, the chart is not rendered.

## Confidence Hardening

Previous behavior:

- Confidence used `source.confidence`, otherwise `composite + 4`, otherwise static `82`.

Current behavior:

- Confidence is derived from metric coverage, source coverage, freshness coverage, and stored history coverage.
- Missing metrics reduce confidence.
- If no valid scored metrics exist, confidence displays `--`.
- Confidence notes are shown in the widget to explain the coverage basis.

## Implemented Files

- `frontend/components/intelligence/StockAiIntelligenceWidget.tsx`
- `frontend/app/globals.css`
- `docs/CR-SI-027-031_AI_Intelligence_Data_Audit.md`

## Screenshots

- Mobile: `docs/mocks/cr-si-027-mobile.png`
- Full-screen metric detail: `docs/mocks/cr-si-027-fullscreen-momentum.png`
- AI insight detail: `docs/mocks/cr-si-027-insight-detail.png`
- Fair Value no-data: `docs/mocks/cr-si-027-fair-value-no-data.png`

## Validation

- `npm run build`: passed.
- Warning: Next.js workspace-root lockfile warning remains pre-existing.
