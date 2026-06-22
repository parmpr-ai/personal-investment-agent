# Personal Investment Agent — Changelog

## v0.3.31 - Backend Timeout Hotfix (HERMES-BACKEND-TIMEOUT-HOTFIX-013)

Date: 2026-06-22
Status: Implemented and locally validated.

### Backend

* Added hard route budgets and cache-first fallbacks for stock, dashboard, AI context, and provider status flows.
* Route responses now carry `sourceStatus` metadata with `status`, `latencyMs`, `fallbackUsed`, and `error`.
* Stock and dashboard now return partial 200 responses instead of waiting for upstream provider stalls.
* AI context frontend contract now returns a partial response within the proxy budget when the backend is still loading.

### Frontend

* Reduced frontend API proxy timeouts so user-facing routes fail fast into partial responses instead of 12s+ stalls.
* Proxy handlers now return partial 200 responses on timeout for stock, dashboard, and AI context routes.

## v0.3.29 - AI Intelligence V3 Research Documentation (ATHENA-GOV-022)

Date: 2026-06-22
Status: Documentation/governance only — no code.

### Backend Research contract (HERMES) — COMPLETE

* **HERMES-AI-V3-001** Research Backend Gap Analysis: coverage matrix for all 9 Research sections, data-source mapping, proposed `GET /api/intelligence/{symbol}/research` contract, provider gaps, thesis-only constraint.
* **HERMES-AI-V3-002** Research Endpoint V1: `backend/services/ai_research.py` + endpoint; thesis-only (no Buy/Hold/Sell, no portfolio action); explicit null/status placeholders. Perf p50 9.93ms / p95 11.86ms.
* **HERMES-AI-V3-003** Provenance & Real Data Upgrade: schema V3.0, `ResearchMetric` provenance wrapper + section-level provenance, `competitiveComparison` returns `shouldRender:false` when no peer provider (no dummy peers), auditable null placeholders for missing financials/TAM/guidance/ownership/fund-sentiment/DCF. Perf p50 12.12ms / p95 17.29ms (well under 500/1000ms).

### Frontend (ARTEMIS)

* **CR-AI-V3-UI-001** CLOSED (89bad3a): Overview/Compact/Expanded hero corrections — removed BULL/BEAR/EVEN case badge, hero sizing/alignment, risk-label shortening, Section Header Standard V1, 390/360 breakpoints.
* **ARTEMIS-AI-V3-RESEARCH-003** Research V2 tab IMPLEMENTED (8657868 + proxy b056bc1) — but **Design Lock INVALID**: the approved mock is missing.

### Decisions LOCKED

* DEC-AI-RESEARCH-001..007 (thesis-only; ownership split; no dummy data; real-peer-only comparison; approved-mock source of truth; accordion arrow direction; locked customization).

### Blockers

* **GOV-022-RESEARCH-MOCK-MISSING (P0):** `docs/mocks/ai-intelligence/APPROVED/research-approved.png` is absent (typo `research-aproved.png` and pre-approved drafts no longer present). DEC-AI-RESEARCH-005 reference is broken; Research V2 Design Lock invalid until the approved image + a Research design spec are committed.

## v0.3.28 - AI Intelligence V2 Governance Refresh (ATHENA-GOV-021)

Date: 2026-06-22
Status: Documentation/governance only — no code. AI Intelligence V2 is a Release Candidate pending UAT.

### Locked decisions

* **DEC-AI-009 — Shared Intelligence Data Layer:** AI Intelligence consumes data exclusively via the Shared Intelligence Context Layer; widgets may not access providers directly. Consumers: AI Intelligence, Analyst Targets, Company, Financials, News, Videos.
* **DEC-AI-010 — AI Verdict Separation:** AI Verdict (BUY/HOLD/SELL) is independent from Portfolio Recommendation (ADD/HOLD/TRIM/REDUCE/AVOID). Compact = verdict only; Expanded may show portfolio recommendation.
* **DEC-AI-011 — Hero System Standardization:** shared neon-wireframe/lattice hero assets across all states; solid-fill/mascot/cartoon/emoji rejected; compact + expanded use identical hero.

### Delivery / status

* HERMES-AI-005 (Shared Intelligence Context Layer) and HERMES-AI-006 (cache, freshness, frontend contract lock, example payloads, validation, lightweight contract mode) — COMPLETE/Accepted. Perf: warm 6ms compact / 9ms expanded; cold 1.9–2.8s.
* ARTEMIS-AI-011 V2 (Compact + Expanded) — IN PROGRESS. CR-AI-011 visual parity — OPEN (release blocker).
* Backlog added: HERMES-AI-007 (Parallel Context Hydration, P2), CR-HERMES-006-01 (Contract Versioning, P3).

### New trackers

* `docs/PROJECT_STATUS.md`, `docs/ROADMAP.md`, `docs/RELEASE_NOTES_DRAFT.md`. Progress: backend 98% / frontend 80% / overall 92–93%. Release blockers: CR-AI-011, real endpoint wiring, final UAT.

## v0.3.27 - AI Intelligence Compact V3 Redesign

Date: 2026-06-22
Status: Implemented (ARTEMIS). UAT PASS decision pending (NVDA BUY / NBIS HOLD / AAPL HOLD screenshots captured).
Tasks: ARTEMIS-AI-COMPACT-REDESIGN-001, CR-AI-COMPACT-REDESIGN-002, CR-AI-COMPACT-REDESIGN-003.
Commits: 1b7d426, 3887882.

### Added — Compact V3 redesign

* `AiIntelligenceCompactV3` premium compact widget (1b7d426): **3 rows × 4 cards**, **2.2 visible cards per row** (horizontal-scroll rail); **no Last Updated**, **no score badge**, **no dots/arrows** (per locked design principles).

### Added — Card customization (CR-AI-COMPACT-REDESIGN-002)

* Three-dot **Customize AI Cards** sheet in the compact widget header: show/hide cards, drag reorder, persisted preferences. Backed by a card source pool.

### Added — Semantic tone engine (CR-AI-COMPACT-REDESIGN-003)

* Semantic card coloring: a card's tone drives its border colour, icon glow, and mini-chart stroke. Level **High = red**, **Low = green**. A **BUY** widget may contain red cards (tone reflects each metric, not the overall verdict).

### Design Lock

* Compact V3 design principles locked (DEC-AI-CV3): no Last Updated; no score badge; no dots/arrows; 3 rows; 4 cards per row; 2.2 visible cards per row; card customization; semantic card coloring.

### UAT

* Screenshots: `frontend/uat-screenshots/cr-ai-compact-v3-cr002/` — NVDA / NBIS / AAPL × {widget, customize} × {390, 430}. Pending Product Owner PASS decision.

## v0.3.26 - Explainable AI Intelligence Engine V1

Date: 2026-06-17
Status: Implemented and locally validated.
Task: HERMES-AI-002
Owner: HERMES

### Added

* **Explainable scoring engine:** `backend/services/ai_intelligence_engine.py` builds an actionable verdict from source coverage, normalized inputs, macro/news context, and portfolio exposure.
* **Score endpoint:** `GET /api/intelligence/{symbol}/score` with optional `strategy` and `debug=true`.
* **Verdict contract:** stock verdict, portfolio recommendation, final verdict, expected return, conviction, thesis strength, risk, confidence, visual state, top reason, scenarios, drivers, risks, bull/bear cases, score breakdown, evaluated factors, and confidence notes.
* **Portfolio-aware logic:** concentration penalties can downgrade a strong stock thesis to HOLD/TRIM without changing the stock-level verdict.
* **Debug mode:** raw factor scores, weights, normalization details, missing sources, coverage calculation, and cache status.
* **In-memory score cache:** key includes symbol, strategy, and portfolio mode; cached responses return immediately.
* **Deterministic fixtures:** bull, balanced, bear, and portfolio-aware STRONG BUY -> HOLD cases.

### Notes

* Missing Seeking Alpha, Discord Advisor, and X Sentiment sources reduce confidence only; they do not block a verdict.
* Normal score responses do not expose source timestamps or "Live"/"Updated" labels.
* `npm run build` PASS - 9/9 pages, TypeScript types valid.

## v0.3.25 - AI Intelligence UI Foundation

Date: 2026-06-17
Status: Implemented.
Task: ARTEMIS-AI-001
Owner: ARTEMIS
Commit: 3433330

### Added

* **Compact mode (default):** verdict chip (Bullish/Bearish/Balanced/Trim) + Expected Return + Conviction + Risk stats + Top Reason sentence + "Full Analysis ›" expand button. No Live badge, no Updated timestamp, no source labels.
* **Expanded mode (8 sections):** AI Verdict, Why AI Thinks This, Bull Case, Bear Case, Scenario Outlook, Score Breakdown, Factors Evaluated, Confidence Notes.
* **Four visual states:** Bull (green), Bear (red), Balanced (orange, TrendingDown + Scale + TrendingUp icons), Trim (amber, composite ≥ 55 AND risk ≥ 80).
* **`deriveVerdictState()`** — trim if composite ≥ 55 AND risk ≥ 80; bull if composite ≥ 65; bear if composite < 40; else balanced.
* **`extractTopReason()`** — first sentence of AI summary, or top metric badge as fallback.
* **`BalancedArrows`**, **`VerdictChip`**, **`AiCompactView`** components added.
* **Settings integration cards** — Discord Signals (status: not_connected) and X Sentiment (status: planned) added to INTEGRATION_DEFS.
* **`integrationNavTone()`** — handles `planned` → `warn`, `not_connected` → `bad`.
* **CSS** — compact/expanded section styles, verdict chip color variants, balanced-icons layout.

### Removed

* `sai-live` "Live Analysis" badge from AI Intelligence widget header.
* `Clock` "Updated" span from hero meta (compact and expanded).

### Build

* `npm run build` PASS — 9/9 pages, TypeScript types valid.

## v0.3.24 - AI Intelligence Architecture & Documentation Consolidation

Date: 2026-06-17
Status: Documentation only — no code/implementation in this entry.
Task: ATHENA-AI-001
Owner: ATHENA

### Added

* `docs/architecture/AI_INTELLIGENCE_ARCHITECTURE.md` — canonical architecture document covering all 9 AI Intelligence subsystems: AI Intelligence V2, AI Engine, Portfolio Fit Engine, Position Intelligence, Opportunity Radar, Analyst Verdict Engine, News Intelligence, Investor Bot, and Auto Investor.

### Captured decisions

* Verdict-first architecture: composite dial → bars → KPI cards → Bottom Sheet.
* Bull / Balanced / Bearish composite state machine (≥65 / 40–64 / <40).
* No Live/Updated badges on metric values — source label only.
* Confidence engine: coverage-based (metric, source, freshness, history); no static fallback.
* Thesis Strength: composite consistency delta model.
* Portfolio Fit Engine: concentration + correlation + diversification + opportunity score.
* Position Intelligence: thesis memory, what changed, thesis health state machine, exit conditions, position verdict.
* Opportunity Radar: ranked opportunities, risk alerts, diversification ideas, portfolio action queue.
* Analyst Verdict Engine roadmap: consensus verdict, conviction score, analyst alignment with AI Engine.
* News Intelligence roadmap: PIA Digest, Bias, Confidence, Possible Move, Demo badge policy.
* Investor Bot roadmap: intent router, portfolio context injection, privacy-mode masking.
* Auto Investor roadmap: rules engine, limit-order-only gateway, dry-run default, guardrails.

### Updated

* `CHANGELOG.md` — this entry.
* `docs/PIA_MASTER_BACKLOG_SOURCE_OF_TRUTH.md` — ATHENA-AI-001 task and AI roadmap items added.
* `docs/UAT_TRACKING.md` — ATHENA-AI-001 documentation-only entry added.

### Roadmap tasks registered

| Task ID | Title | Status |
|---|---|---|
| ATHENA-AI-002 | AI Engine — full scoring pipeline | ROADMAP |
| ATHENA-AI-003 | Metric score persistence layer | ROADMAP |
| ATHENA-AI-004 | Portfolio Fit Engine | ROADMAP |
| ATHENA-AI-005 | Position Intelligence | ROADMAP |
| ATHENA-AI-006 | Opportunity Radar | ROADMAP |
| ATHENA-AI-007 | Analyst Verdict Engine | ROADMAP |
| ATHENA-AI-008 | News Intelligence V2 | ROADMAP |
| ATHENA-AI-009 | Investor Bot | ROADMAP |
| ATHENA-AI-010 | Auto Investor | ROADMAP |

## v0.3.23 - IBKR Client Portal Settings Correction

Date: 2026-06-16
Status: Implemented.

### Changed

* Replaced legacy TWS/IB Gateway socket settings with Client Portal Gateway integration UI.
* Added Portfolio Data Source selector for Mock, Demo Samples, and Live IBKR.
* Added provider status display, fallback visibility, Test Connection action, and portfolio source badge.

## v0.3.22 - Governance: Approved Mock Preservation & Design Lock Traceability (PIA-GOV-004)

Date: 2026-06-11
Status: LOCKED. Governance/documentation only — no code.

### Locked

* **DEC-GOV-004 — Approved Mock Preservation & Design Lock Traceability.** Every Design Lock must archive the approved mock under `docs/mocks/<feature>/APPROVED_<feature>_v<version>.png` and **commit it before implementation starts**. Record the approved-mock path in the backlog item, UAT ticket, and Design Lock notes.
* **Process (locked):** Requirement → UX Mockup → Design Review → Design Lock → **SAVE approved mock → COMMIT approved mock** → Implementation → UAT.
* **UAT requirement:** every UAT report must contain `Approved Mock: <repo path>`, `Design Lock Commit: <id>`, `Implementation Commit: <id>`.
* **Non-compliance:** any implementation started without an archived approved mock is a governance violation and is **blocked** until the mock is committed.

### Compliance audit (existing approved mocks are NON-COMPLIANT with the naming convention)

* `docs/mocks/AI Intelligence/mock v1.png` → should be `docs/mocks/ai-intelligence/APPROVED_ai_intelligence_v2.png` (folder has a space; file labeled v1 but locked design is V2 — version to confirm).
* `docs/mocks/analyst-targets/Approved_mobile_mock_analyst_target.jpg` → `APPROVED_analyst_targets_v3.png`.
* `docs/mocks/stock-intelligence/stock-intelligence-v1-approved.png` → `APPROVED_stock_intelligence_v1.png`.
* `docs/mocks/watchlists/watchlists-mobile-v1-approved.md` (markdown, not PNG).
* Structural note: mocks live in two places (`docs/mocks/` and `docs/design-system/mocks/`); policy mandates `docs/mocks/<feature>/`.

### Remediation

* **GOV-004-REMEDIATION (OPEN, ATHENA):** rename existing approved mocks to the convention, consolidate the two mock locations, resolve the AI version ambiguity, and backfill traceability triples. Renames deferred pending PO confirmation of versions (avoid mislabeling locked assets).

### Traceability backfill (existing locks)

* AI Intelligence V2 — Approved Mock: `docs/mocks/AI Intelligence/mock v1.png` (rename pending) · Design Lock Commit: `3bb14df` · Implementation Commit: `b7d591e` (CR-AI-010 recovery).
* Analyst Targets — Approved Mock: `docs/mocks/analyst-targets/Approved_mobile_mock_analyst_target.jpg` (+ `analyst-targets-v3-desktop.png`); historical drift is the motivating incident for this policy.

## v0.3.21 - AI Intelligence V2 Design Lock

Date: 2026-06-10
Status: Design Lock approved by Product Owner (10/10). Documentation only — no code/implementation in this entry. Implementation tracked as CR-AI-010 (READY FOR IMPLEMENTATION, HERMES).

### Approved (LOCKED) — AI Intelligence V2 supersedes V1 (V1 deprecated)

* **DEC-AI-001 — KPI Cards:** replace KPI rings with KPI cards (Value, Trend Delta, Label, Status, Chevron); full-card tap target; no ring gauges, no flat tiles. Score family (Momentum/Trend/Sentiment, 0–100) is visually distinct from the Directional family (Institutional Flow, Price vs Fair Value).
* **DEC-AI-002 — Single Bottom Sheet Explainability:** tap a KPI opens one scrollable bottom sheet — Why It Matters → Score Breakdown → Historical Evolution → Disclaimer. No nested drilldowns, no multiple screens, no modal chains.
* **DEC-AI-003 — No Widget Collapse:** missing data never collapses the widget; render the structure and show missing values as `--`; the "Data gathering in progress" full-section replacement is forbidden.

### Approved architecture

* KPI Card architecture, Explainability architecture, Bottom Sheet architecture, No-Collapse policy.
* Spec (locked): `docs/design-system/mocks/stock-workspace/ai-intelligence-widget-v2.md`. All future AI Intelligence work must follow V2.

## v0.3.20 - Portfolio Density + Analyst Targets V3 + UAT Fix Pack

Date: 2026-06-09
Status: Implemented and locally validated (`npm run build` PASS; `/`, `/mobile`, `/setup` 200). Pending Product Owner real-device UAT.
Commit range: 02dfcdf … e5736e9 (through requested anchor 72499e9).

### Added — Analyst Targets V3 (HERMES)

* V3 layout: Options tab removed (tabs: Overview, Chart, News, Financials, Analysis); chart now lives only in the Chart tab; fixed/sticky stock header.
* Overview Analyst Targets: Bull / Base / Bear (percentage + target price), target range with current + consensus markers, consensus + analyst count, and analyst distribution bars.
* Tapping the Overview Analyst Targets card navigates to Analysis → Analyst Targets; analyst history rendered as mobile cards (no tables).
* Commits: 2b9d1de, 5602655, ecbe06d, ac0ca6f (current data source only; no Finnhub/FMP this sprint).

### Added — Portfolio Density Sprint (ATHENA)

* Portfolio/Watchlist cards v2, card customization framework, grid + filters, 2x2 compact IBKR style, live price emphasis (dynamic color + tick pop), visual system v2 (larger logo, price hierarchy, 2x2 density), logo ring, portfolio view selector, mobile density pass + persistence validation.
* Commits: 23bce57, 54bf30e, b7c646f, 6038934, edca406, 5e8daca, 72499e9, e5736e9.

### Watchlist UAT findings

* Carried forward (still OPEN): PIA-WL-008..014 — column switches, Open Chart destination, Add-to-list, AI Coach, add-instrument UX, table sorting, watchlist columns.

### Open items discovered during latest UAT / visual audit (2026-06-09)

* PIA-UX-060 — card logo still under-weighted as a visual anchor.
* PIA-BUG-032 — empty workspace preview widgets read as broken-premium.
* PIA-CSS-001 — duplicated/overriding `.stock-intel-header` CSS; consolidate before the V3 fixed header.
* PIA-UX-061 — Cards view discoverability (view mode behind the overflow menu).

### Governance

* Design Lock process locked (DEC-DESIGN-LOCK): a DESIGN LOCKED feature freezes layout/IA; implementation must match the locked spec; deviations require re-approval.
* Next.js cache governance locked (DEC-NEXT-CACHE): on `PageNotFoundError` during page-data collection, clear `.next` then rebuild; never delete `.next` while a server holds it; avoid concurrent `.next` access in the shared tree.

## v0.3.19 - Analyst Targets V2

Date: 2026-06-08
Status: Implemented and locally validated.

### Added

* Analyst Targets Overview card now opens the Analysis tab on tap/click.
* Analysis tab now includes a dedicated Analyst Targets section with consensus target, bull target, bear target, recommendation summary, analyst count, and analyst history empty state.
* Yahoo recommendation payload now preserves raw Strong Buy / Buy / Hold / Sell detail where available while keeping existing aggregate overview counts.

### Enhanced

* Upside/downside is now the primary visual element on the Overview card.
* Dollar difference from current price to consensus target is shown directly below the percentage.
* Positive target deltas use green treatment; negative deltas use red treatment; neutral/unavailable values stay muted.

### Known limitations

* Yahoo fallback provides consensus and recommendation summary, but not reliable firm-by-firm previous/new analyst target history. The UI shows "Analyst history not available" when provider history is absent.

### Validation

* `npm run build` passed.
* `/`, `/mobile`, and `/setup` route smoke checks returned 200.
* UAT tickers checked: NVDA, AMD, MSFT, SOFI.

## v0.3.18 - Portfolio Mobile Card V2

Date: 2026-05-30
Status: Implemented and validated.

### Added

* Enhanced Portfolio mobile cards with institutional-style position details.
* Added Shares display.
* Added Market Value display.
* Added Last Price display.
* Added Avg Cost display.
* Added Today P&L ($ and %).
* Added Unrealized P&L ($ and %).
* Added fallback calculations for unrealized percentage when not supplied by the backend.

### Enhanced

* Preserved Momentum indicator.
* Preserved Risk indicator.
* Preserved Sparkline visualization.
* Preserved Stock Intelligence launch on card tap.
* Added optional News Intelligence, Macro Sensitivity, and AI indicator chips when data is available.

### Fixed / Improved

* Improved mobile portfolio information density without changing interaction patterns.
* Improved visibility of position performance metrics on smaller screens.
* Preserved privacy mode masking behavior.

### Validation

* Mobile portfolio cards render correctly.
* Stock Intelligence navigation preserved.
* Privacy mode preserved.
* No Desktop Experience changes.
* No Workspace System changes.
* No Workspace Architecture changes.


## v0.3.17 - Watchlists IBKR UX Upgrade
Date: 2026-05-29
Status: Implemented and locally validated.

### Added
- LocalStorage-backed custom watchlist model at `pia.watchlists.v1` with list id, name, tickers, view mode, visible columns, and order metadata.
- Default watchlists: Favorites, Tech, Fintech, and Swing with seeded symbols across NVDA, NBIS, META, AVGO, TSM, IONQ, QBTS, INOD, SOFI, ZETA, PLTR, NKE, AMD, and IREN.
- Mobile IBKR-style Watchlists workspace with horizontal custom tabs, Add Instrument flow, table/list toggle, dense INSTRMNT/LAST/CHNG/CHG%/VLM table, list cards, bottom sheet settings, and Edit Instruments screen.
- Desktop Watchlists workspace with shared persistence, custom list selector/tabs, create/rename/delete list, add/remove ticker, table/card toggle, column controls, and Stock Intelligence launch from watchlist rows/cards.

### Fixed / Preserved
- Removed nested button structure from watchlist cards.
- Preserved Portfolio, mobile shell, hamburger/workspace manager, bottom nav, privacy mode, and Stock Intelligence shell behavior.

### Validation
- `npm.cmd run build` passed.
- `next start` smoke checks returned 200 for `/` and `/mobile`.

## v5.6 — Integration + Product Hardening

### Added
- Renamed product to **Personal Investment Agent (PIA)**.
- Added **About / Version Center** with in-app changelog, roadmap, known issues, and QA checklist endpoints.
- Added **Integration Center** with all source configurations in one place.
- Added **Settings persistence** via SQLite (`backend/pia_settings.sqlite3`).
- Added **IBKR configuration card** with host, port, client id, enabled state, documentation, and health check.
- Added **Yahoo Finance connector** for best-effort RSS news and fundamentals health checks.
- Added **Seeking Alpha connector** with RSS support and optional authenticated subscriber-session parsing scaffold. It stores no password; authenticated mode uses a user-provided active session cookie/header and may break if the site/session changes.
- Added **RSS adapter** with configurable feed list and health checks.
- Added **FRED/Macro, Telegram, Advisor Intel, and AI Lite configuration scaffolds**.
- Added **Source Health Monitor** endpoint and dashboard widget.
- Added **TradingView chart embed** inside the Stock Intelligence Drawer.
- Added frontend health/test buttons that show whether each source received data.

### Fixed / Hardened
- Version metadata now reports v5.6.
- Product governance is available in-app instead of only `CHANGELOG.md`.
- Integration settings are no longer only hidden in `.env`; `.env` remains developer fallback.

### Known limitations
- Discord cloud connector and Advisor Intel parsing are deferred to v5.7+.
- AI API reasoning layer remains deferred for cost control.
- Yahoo public endpoints are best-effort and should have fallback providers later.
- Seeking Alpha authenticated parsing depends on user subscription/session validity and website changes.
- Persistent drag/drop resize grid is scaffolding only; full resize grid remains V5.7.

## v5.5 — Intelligence Workbench
- Live IBKR structure.
- Portfolio Snapshot.
- Positions tabs.
- Exposure Map.
- Risk Doctor.
- Opportunity Board.
- Rules-based Trade Engine.
- Stock Intelligence Drawer.
- Tax/Transactions shell.
- Thesis Vault shell.

## v5.3 — Black UI / Tax / Live Prep
- Black UI.
- Tax Center shell.
- Market strip.
- Portfolio scanner shell.
- Frontend TypeScript and environment setup fixes.

## v5.6 Internal UAT Fix Pack
- Fixed Trade Engine response schema: added `entry` and `reason` alongside existing `entry_zone`.
- Fixed Greek tax estimate to use net taxable stock/options gain after loss offset; UCITS ETFs excluded.
- Added basic drag-and-drop dashboard widget reorder with localStorage persistence.
- Added UAT report with simulation pass results.
