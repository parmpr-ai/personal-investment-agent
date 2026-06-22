# AI Intelligence Architecture

Task: ATHENA-AI-001
Status: Active canonical reference
Last updated: 2026-06-17
Branch: `feat/pia-v3-foundation-integration`

This document is the canonical architecture source for every AI Intelligence, Portfolio Fit, Position Intelligence, Opportunity Radar, and Investor Bot subsystem in PIA. All implementation must reference this document.

---

## 1. AI Intelligence V2 — Widget Architecture

### Status

DESIGN LOCKED (Product Owner approved 2026-06-10, score 10/10). CR-AI-010 READY FOR IMPLEMENTATION (HERMES).
Spec: `docs/design-system/mocks/stock-workspace/ai-intelligence-widget-v2.md`
Locked decisions: DEC-AI-001, DEC-AI-002, DEC-AI-003.

### Verdict-First Architecture

The widget always opens at the composite verdict. The user sees the outcome before any detail.

```
Composite dial + headline chip          ← verdict layer (always visible)
4 read-only metric bars                 ← signal layer (quick glance)
5 KPI cards                             ← drill layer (tap to expand)
Bottom Sheet per card                   ← explainability layer (on demand)
```

Hierarchy is fixed. No reordering. No collapse. No data-gathering replacement states.

### Composite Verdict States

| State     | Chip label   | Composite range | Dial color |
|-----------|--------------|-----------------|------------|
| Bullish   | `[ Bullish ]`  | ≥ 65            | Green/teal |
| Balanced  | `[ Balanced ]` | 40–64           | Amber      |
| Bearish   | `[ Bearish ]`  | < 40            | Red        |

The composite score is tappable. Tapping opens the same Bottom Sheet structure as a KPI card, with breakdown showing the four bar factors (Momentum / Trend / Sentiment / Risk) and their weights.

### KPI Card Families

**Score family (0–100):** Momentum Score, Trend Strength, Sentiment Score — conic dial + numeric value + trend delta.

**Directional family:** Institutional Flow (▲ Inflow / ▼ Outflow / ▬ Neutral), Price vs Fair Value (signed %, ≥0 green / < 0 red).

Layout: 2-up grid on mobile (390/430), 5-column row on desktop. Grid never collapses for missing data.

Missing values render as `--` (DEC-AI-003). The card stays visible.

### Explainability Requirements (DEC-AI-002)

Tap any KPI card or the composite dial → **single scrollable Bottom Sheet** with four stacked sections:

1. **Why it matters** — 1–2 plain-language sentences explaining the metric's relevance.
2. **Score breakdown** — sub-factor contributions (price vs 50DMA, RSI, volume trend, etc.) shown as bar contributions. Missing sub-factors are omitted without empty headers.
3. **Historical evolution** — sparkline of the metric score over time. Rendered only when stored history arrays are present in the payload (`ai_metric_history`, `metric_history`, `metrics_history`, `historical_metrics`, `history`). If absent, the section is hidden.
4. **Disclaimer** — "Rules-based signal, not advice."

No nested screens. No modal chains. One sheet per KPI.

### No Live/Updated Indicators (governance rule)

The widget never renders "Live", "Updated", or "Refreshing" badges on metric values. Metric provenance is shown via source label only (e.g., "Yahoo", "IBKR", "Derived Signal", "Internal Calculation"). Timestamp display is limited to the metric detail sheet.

### Metric Data Source Map

| Metric | Accepted score fields | Source labels |
|---|---|---|
| Momentum | `momentum_score`, `momentumScore`, `momentum` | IBKR, Derived Signal, Internal |
| Trend | `trend_score`, `trendScore`, `trend_strength_score`, `trendStrengthScore` | Internal Calculation |
| Sentiment | `sentiment_score`, `sentimentScore`, `news_score`, `newsScore` | Yahoo, Seeking Alpha, Derived |
| Institutional | `institutional_score`, `institutionalScore`, `institutional_flow_score`, `inst_score` | Derived Signal |
| Fair Value | current price + `fair_value`, `fairValue`, `average_target`, `targetMeanPrice` | Yahoo, Internal |
| Risk | `risk_score`, `riskScore`, `risk` | IBKR, Derived Signal, Internal |

Manual placeholder scores (`momentum_score: 50`, `news_score: 50`) are rejected — treated as missing, not rendered. Exception: `risk` from manual holdings is a documented Derived Signal (58 for equities, 86 for crypto/options).

### Confidence Engine

Confidence is derived from coverage across four dimensions:

1. **Metric coverage** — fraction of the 6 metrics that have valid (non-placeholder) scores.
2. **Source coverage** — fraction of metrics with a known, non-fallback source.
3. **Freshness coverage** — fraction of metrics with a timestamp within 24h.
4. **History coverage** — fraction of metrics with stored history arrays.

If no valid scored metrics exist, confidence renders as `--`. Confidence notes are displayed inline to explain the coverage basis.

Previous behavior (static 82, or `composite + 4`) is removed.

---

## 1b. AI Intelligence Compact V3 — Widget Architecture

Delivered 2026-06-22 (ARTEMIS). Component: `frontend/components/intelligence/AiIntelligenceCompactV3.{tsx,css}`, mounted via `StockAiIntelligenceWidget`. Commits: 1b7d426 (widget), 3887882 (customization + semantic tones).

### Design Lock principles (DEC-AI-CV3 — LOCKED)
1. No "Last Updated".
2. No score badge.
3. No dots/arrows.
4. 3 rows.
5. 4 cards per row.
6. 2.2 visible cards per row (horizontal-scroll rail; the partial third card signals more).
7. Card customization.
8. Semantic card coloring.

### Layout
Compact widget = a fixed grid of metric cards arranged in 3 rows × 4 cards, with ~2.2 cards visible per row (the rail scrolls horizontally). Header carries the verdict and a three-dot Customize entry; no timestamp, no score badge, no directional dot/arrow glyphs.

### Card source pool
Cards are selected from a pool of available AI metric cards (the "card source pool"). The active set, order, and visibility are driven by user customization (below); cards absent from the pool/data degrade per DEC-AI-003 (render structure, `--` for missing — never collapse).

### Customization framework (CR-AI-COMPACT-REDESIGN-002)
- Entry: three-dot "Customize AI Cards" sheet in the compact header.
- Controls: show/hide each card, drag-reorder, persisted preferences (survive reload).
- Scope: per-widget card selection/order from the source pool.

### Semantic tone system (CR-AI-COMPACT-REDESIGN-003)
- Each card carries a semantic tone derived from its metric level, independent of the overall verdict.
- Tone drives: card border colour, icon glow, and mini-chart stroke.
- Mapping: Level High → red; Level Low → green (risk-semantics). Consequence: a BUY verdict widget may contain red cards (a high-risk metric reads red even when the composite verdict is bullish).

### UAT
Screenshots committed under `frontend/uat-screenshots/cr-ai-compact-v3-cr002/` for NVDA (BUY), NBIS (HOLD), AAPL (HOLD) at 390/430. PASS decision pending. Governance note: per DESIGN-LOCK-002, a committed `DESIGN_SPEC.md` is required to fully validate the Compact V3 lock (currently a stub).

---

## 2. AI Engine

### Status

Rules-based engine: PARTIALLY IMPLEMENTED. Mock data layer deployed for 9 tickers. Full scoring pipeline: ROADMAP.

### Scoring Engine

Each metric produces a score on a normalized scale (0–100 for score family, directional signal for directional family). Sub-factor contributions are assembled per metric:

**Momentum:** price vs 50DMA, RSI(14), volume trend (14d), price momentum (20d).

**Trend:** moving average alignment (20/50/200), trend consistency, breakout/breakdown proximity.

**Sentiment:** news tone (Yahoo/Seeking Alpha), analyst consensus direction, earnings sentiment delta.

**Institutional:** flow signal (inflow/outflow/neutral), ownership change delta, short interest direction.

**Fair Value:** `clamp(50 + upside_pct × 1.1, 0, 100)` where `upside_pct = (fair_value - current_price) / current_price × 100`. Requires both current price and a fair value estimate.

**Risk:** position-level risk score from portfolio source, or asset-class-derived fallback.

**Composite:** weighted average of the four bar metrics (Momentum, Trend, Sentiment, Risk). Weights are equal (25% each) unless backend provides explicit weights.

### Confidence Engine

Described in Section 1. The confidence engine is the single source of confidence displayed in the widget. No static fallback scores.

### Thesis Strength

Derived from composite score consistency across multiple readings:
- High consistency + high composite → Strong thesis.
- High composite, declining → Weakening thesis.
- Low composite + negative delta → Thesis under pressure.

Thesis strength drives the "What Changed" summary in Position Intelligence (Section 4).

Not yet implemented as a persistence layer. Roadmap item: ATHENA-AI-003.

### Expected Return

`expected_return_pct = (fair_value - current_price) / current_price × 100`

Displayed as the Price vs Fair Value KPI card. Also surfaced in Opportunity Radar (Section 5) as part of opportunity scoring.

Requires fair value data. If unavailable, the directional KPI card shows `--`.

### Portfolio-Aware Recommendations

`today_actions` (from `backend/services/state.py`) and `guardrails` (from `risk_doctor`) provide portfolio-level recommendations that are injected into the Stock Intelligence response. These are rules-based signals, not AI/LLM outputs.

Portfolio-aware AI recommendations that account for existing portfolio composition, correlation, and concentration are a Roadmap item (ATHENA-AI-004 — Portfolio Fit Engine).

---

## 3. Portfolio Fit Engine

### Status

ROADMAP (ATHENA-AI-004). Rules-based scoring engine. Not yet implemented.

### Concentration Analysis

For a candidate position against the current portfolio:

- Current portfolio breakdown by symbol, sector, asset class, and risk tier.
- Impact of adding N shares at current price on portfolio_pct, sector concentration, and total risk.
- Warning thresholds: single position > 25%, sector > 35%.

### Correlation Analysis

- Peer group correlation for candidate symbol vs existing positions (based on sector, beta, and macro sensitivity tags).
- Portfolio beta delta if candidate is added.
- High-beta alert when macro_sensitivity > 85 for the candidate or if adding it raises average macro_sensitivity above portfolio threshold.

### Diversification Benefit

- Sector gap identification: sectors with 0% exposure that the candidate would fill.
- Asset class balance: equities / options / crypto mix.
- Positive diversification signals if the candidate reduces sector concentration.

### Opportunity Score

Composite of:
- Expected return (Fair Value → current price).
- Momentum + Trend directional signals.
- Diversification benefit.
- Risk-adjusted sizing headroom.

The Opportunity Score drives the Opportunity Radar ranking (Section 5).

### Output

```json
{
  "concentration_ok": true,
  "sector_gap_filled": "AI Infra",
  "portfolio_beta_delta": 0.04,
  "diversification_benefit": "Medium",
  "opportunity_score": 74,
  "recommendation": "Fits portfolio. Small-mid size appropriate. Confirm macro regime before adding."
}
```

---

## 4. Position Intelligence

### Status

ROADMAP (ATHENA-AI-005). Thesis Vault scaffold: IMPLEMENTED (THESIS_STORE in `backend/main.py`). Position-level analytics: PARTIAL (analytics endpoint, CR-PS-021 sample data).

### Thesis Memory

`THESIS_STORE` persists thesis entries (title, summary, full text) per ticker in memory. Stored via `POST /thesis`. Retrieved via `GET /stock/{ticker}` → `thesis` field.

Roadmap: persist to SQLite; add version tracking; link thesis entry to entry price and date.

### What Changed

Compares current AI Engine metric scores against scores at thesis creation date:

| Metric | At entry | Now | Delta | Direction |
|---|---|---|---|---|
| Momentum | 65 | 72 | +7 | ▲ Improving |
| Trend | 70 | 68 | -2 | ▼ Slight fade |
| Sentiment | 55 | 61 | +6 | ▲ Improving |
| Risk | 45 | 38 | -7 | ▼ Risk up |

Requires metric score persistence layer (ATHENA-AI-003). Not yet implemented.

### Thesis Health

State machine driven by composite delta and consistency:

| Health state | Condition |
|---|---|
| `On Track` | Composite ≥ entry composite, major metrics consistent |
| `Monitoring` | Composite within ±10 of entry, one metric diverging |
| `Weakening` | Composite dropped > 10 below entry, or two metrics diverging |
| `Exit Review` | Composite dropped > 20 below entry, or exit condition triggered |
| `No Data` | No metric history available |

### Exit Conditions

Exit conditions are defined at thesis creation time and evaluated by the rules engine:

- **Price target hit:** current price ≥ bull target from analyst targets.
- **Stop loss hit:** current price ≤ stop level (user-defined or -15% from avg cost).
- **Thesis invalidation:** specific metric below threshold (e.g., Trend drops below 35).
- **Portfolio concentration breach:** position exceeds 30% portfolio weight.
- **Time-based exit:** holding period > max_hold_days (user-defined).

### Position Verdict

A single-sentence verdict rendered per position in the Position Intelligence panel:

- "Thesis intact. Momentum improving. Hold with awareness of elevated risk."
- "Thesis weakening. Two signals diverging from entry. Consider sizing review."
- "Exit review. Composite dropped 22 points since entry. Check invalidation levels."

---

## 5. Opportunity Radar

### Status

ROADMAP (ATHENA-AI-006). Partial foundation exists via `scanner_items()` in `backend/services/trade_engine.py` and `today_actions()` in `backend/services/state.py`.

### Best Opportunities

Ranked list of watchlist + portfolio candidates by Opportunity Score (Section 3):

- Expected return (upside to fair value).
- Momentum + Trend momentum alignment.
- Portfolio fit (diversification benefit, low concentration impact).
- Macro regime filter (flag if macro_sensitivity > 85 when risk_mode is not BUY).

Output: top 3–5 candidates with opportunity score, primary catalyst, and sizing recommendation.

### Highest Risks

Derived from `risk_doctor` guardrails plus position-level thesis health:

- Concentration alerts: positions > 25% portfolio weight.
- Exit review positions: thesis health = "Exit Review".
- Macro exposure: high-beta positions in hostile macro regime.
- Options expiry proximity.

Output: risk items sorted by severity (Critical → High → Medium), with 1-sentence action.

### Diversification Ideas

Gap analysis against current portfolio:

- Sectors with no exposure but positive macro fit.
- Asset classes underrepresented vs target allocation.
- Candidates from watchlist that fill sector gaps.

Output: 2–3 diversification suggestions with reasoning.

### Portfolio Actions

Consolidated action queue derived from risk + opportunity signals:

1. **Trim actions:** overweight positions where thesis is weakening.
2. **Add actions:** underweight positions where opportunity score is high and portfolio fit is positive.
3. **Watch actions:** positions approaching key levels or thesis inflection.
4. **Do nothing:** macro regime filter blocks new risk.

Output: ordered action queue, one sentence per action, no more than 5 items.

---

## 6. Analyst Verdict Engine — Roadmap

### Status

ROADMAP (ATHENA-AI-007). Foundation: Analyst Targets V3 IMPLEMENTED 2026-06-09 (CR-AT-V3).

### Objective

Convert raw analyst targets + consensus data into a structured, actionable verdict for each stock.

### Components

**Consensus Verdict:** weighted average of Buy/Hold/Sell ratings → Overweight / Neutral / Underweight label.

**Target Spread:** bull/base/bear target range vs current price → upside/downside distribution.

**Conviction Score:** analyst count × consensus concentration. More analysts + tighter consensus = higher conviction.

**Price Target Delta:** direction of target revisions over last 90d (analysts raising or lowering).

**Analyst Alignment with AI Engine:** does the consensus direction agree with PIA's Momentum / Trend signals? Divergence is flagged.

### Output

```
AMD — Analyst Verdict
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Consensus: Overweight · 28 analysts
Base target: $172 (+8.4% upside)
Bull: $195 · Bear: $138
Conviction: High (tight spread, 28 coverage)
Target trend: ▲ Rising (3 upgrades / 90d)
AI alignment: ✓ In-sync (Momentum 72, Trend 68)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Data Sources

Current: Yahoo Finance consensus (no firm-level history).
Roadmap: Finnhub analyst targets (firm, date, from/to target), FMP consensus grades.

---

## 7. News Intelligence — Roadmap

### Status

ROADMAP (ATHENA-AI-008). Foundation: Yahoo RSS + news_intelligence endpoint IMPLEMENTED. PIA Digest and Bias engine: pending.

### Approved Design Changes (pending implementation)

- **Real article titles** with exact links (no synthetic summaries).
- **PIA Digest** — 3-sentence market narrative updated on fetch, not on a tick.
- **Bias instead of Sentiment** — label reflects the article's directional lean (Bullish / Neutral / Bearish) not a sentiment polarity score.
- **Confidence instead of Impact** — replaces vague "impact" levels with a 0–100 confidence signal derived from source credibility and article recency.
- **Possible Move instead of Sell the News** — action suggestion describes the likely price range movement, not a generic trading action.
- **Human-readable actions** — no "Sell the News", "Buy the Dip" synthetic labels. Actions are 1-sentence directional notes.
- **Demo badge** — mock/demo data receives a persistent `DEMO DATA` badge. Live data has no badge.

### Components

**Article Triage:** source credibility scoring, relevance to holdings/watchlist, recency weighting.

**Bias Engine:** NLP or rule-based directional lean per article. Input: headline + summary. Output: Bullish / Neutral / Bearish + confidence (0–100).

**Digest Builder:** assembles the top 3 signals into a 3-sentence portfolio-level narrative. Refreshed on each news fetch cycle.

**Position Link:** maps each article to held positions and watchlist items. Surfaces in Position Intelligence "What Changed."

---

## 8. Investor Bot — Roadmap

### Status

ROADMAP (ATHENA-AI-009). No implementation started.

### Objective

A conversational assistant embedded in PIA that answers portfolio and market questions in plain language, using PIA's live portfolio context.

### Capabilities (planned)

- "What is my biggest risk today?" → synthesizes risk_doctor output.
- "Should I add AMD given my portfolio?" → runs Portfolio Fit Engine for AMD vs current portfolio.
- "What happened to NBIS today?" → summarizes news + price + AI signal delta.
- "What is my P&L if NASDAQ drops 5%?" → runs stress test scenario for user's portfolio.
- "What is my thesis on SOFI?" → retrieves and summarizes THESIS_STORE entry.

### Architecture

- Frontend: floating chat panel, accessible from any workspace.
- Backend: `POST /api/bot/query` → intent parser → handler → response formatter.
- Intent categories: Portfolio Query, Position Query, Market Query, Scenario Query, Thesis Query.
- Context injection: live portfolio payload + macro snapshot passed with every query.
- No LLM by default: rule-based intent handlers first. LLM layer optional (OpenAI API, cost-gated).
- Privacy mode: all amounts masked in bot responses when privacy is on.

### Non-goals

- Trade execution (out of scope for Investor Bot; belongs to Auto Investor).
- Portfolio rebalancing suggestions without Portfolio Fit Engine complete.
- Real-time streaming market data.

---

## 9. Auto Investor — Roadmap

### Status

ROADMAP (ATHENA-AI-010). No implementation started. Requires Investor Bot + Portfolio Fit Engine complete first.

### Objective

Rules-based automated trade execution gateway that executes pre-approved trade conditions via IBKR Client Portal Gateway.

### Architecture

**Rule Engine:** user-defined entry/exit conditions evaluated on a configurable interval (e.g., every 5 minutes).

**Condition Types:**
- Price-based: `price ≤ target_entry` or `price ≥ stop_loss`.
- Signal-based: `momentum_score ≥ 70 AND trend_score ≥ 65`.
- Portfolio-based: `portfolio_pct(AMD) ≤ 10%` (auto-rebalance to target weight).
- Calendar-based: pre-scheduled trim before earnings event.

**Execution Gateway:**
- Uses IBKR Client Portal Gateway `POST /v1/api/iserver/account/{accountId}/orders`.
- All orders are limit orders. No market orders.
- Order confirmation required by default (safety gate). Full auto mode requires explicit PO unlock.
- Dry-run mode: evaluates and logs rules without submitting orders. Default.

**Guardrails (non-negotiable):**
- Maximum single-order value: user-configured (default: 5% of portfolio).
- Daily loss limit: auto-disables if daily P&L < -3%.
- IBKR session must be authenticated before any execution attempt.
- All execution logs persisted to SQLite with timestamp, symbol, order type, quantity, price, status.
- `data/ibkr-live/*.raw.json` must never be committed (see `.gitignore`).

**Security:**
- No credentials stored by PIA (IBKR session managed entirely by Client Portal Gateway).
- Execution only via authenticated Client Portal Gateway session.
- Local-only. Remote execution API is out of scope.

---

## Architectural Decisions Reference

| ID | Decision | Status | Date |
|---|---|---|---|
| DEC-AI-001 | KPI Cards (replace rings; full-card tap; score vs directional families) | LOCKED | 2026-06-10 |
| DEC-AI-002 | Single Bottom Sheet Explainability (Why / Breakdown / History / Disclaimer) | LOCKED | 2026-06-10 |
| DEC-AI-003 | No Widget Collapse (missing → `--`, never replace widget with gathering state) | LOCKED | 2026-06-10 |
| DEC-AI-V2 | AI Intelligence V2 supersedes V1; V1 deprecated | LOCKED | 2026-06-10 |

---

## Implementation State Summary

| Component | Status | CR/Task | Owner |
|---|---|---|---|
| AI Intelligence V2 Widget | DESIGN LOCKED, READY FOR IMPL | CR-AI-010 | HERMES |
| AI Metric Hardening (CR-SI-027-031) | IMPLEMENTED | CR-SI-027..031 | HERMES |
| AI Engine — mock data layer | IMPLEMENTED (9 tickers) | SPRINT-V0.3.6 | HEPHAESTUS |
| AI Engine — scoring pipeline | ROADMAP | ATHENA-AI-002 | ATHENA |
| Portfolio Fit Engine | ROADMAP | ATHENA-AI-004 | ATHENA |
| Position Intelligence | ROADMAP | ATHENA-AI-005 | ATHENA |
| Opportunity Radar | ROADMAP | ATHENA-AI-006 | ATHENA |
| Analyst Verdict Engine | ROADMAP | ATHENA-AI-007 | ATHENA |
| News Intelligence V2 | ROADMAP | ATHENA-AI-008 | ATHENA |
| Investor Bot | ROADMAP | ATHENA-AI-009 | ATHENA |
| Auto Investor | ROADMAP | ATHENA-AI-010 | ATHENA |

---

## Files Reference

| File | Role |
|---|---|
| `frontend/components/intelligence/StockAiIntelligenceWidget.tsx` | AI Intelligence widget implementation |
| `frontend/components/intelligence/useStockIntelligence.ts` | Data assembly hook |
| `backend/services/ai_intelligence.py` | `build_ai_intelligence()`, `build_ai_intelligence_test()` |
| `backend/services/stock_intelligence.py` | `build_stock_panel_intelligence()` |
| `backend/mock_intelligence_data.py` | Bloomberg-lite mock for 9 tickers |
| `backend/main.py` | `THESIS_STORE`, `/thesis`, `/ai-intelligence/{symbol}` routes |
| `docs/design-system/mocks/stock-workspace/ai-intelligence-widget-v2.md` | V2 design spec (LOCKED) |
| `docs/CR-SI-027-031_AI_Intelligence_Data_Audit.md` | Metric hardening audit |
