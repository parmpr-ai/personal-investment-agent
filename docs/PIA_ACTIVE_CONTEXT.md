# PIA ACTIVE CONTEXT

## Current Branch

feat/pia-v3-foundation-integration

## Current Sprint

ARTEMIS Portfolio Engine Stabilization (ARTEMIS-PORTFOLIO-ENGINE-STABILIZATION-060)

## Completed Sprints (in order)

| Sprint | Owner | Status | Key Fix |
|---|---|---|---|
| HERMES-PROD-STABILIZATION-057 | HERMES | PENDING UAT | Options cost_basis, Day P&L, provider labels |
| ARTEMIS-PORTFOLIO-UX-058 | ARTEMIS | PENDING UAT | Currency toggle, option labels, settings cleanup |
| ARTEMIS-PORTFOLIO-PRODUCTION-POLISH-059 | ARTEMIS | PENDING UAT | Header cleanup, segmented currency, dot indicator |
| ARTEMIS-PORTFOLIO-ENGINE-STABILIZATION-060 | ARTEMIS | PENDING UAT | Portfolio total fix, metric accuracy, trade history |

## Current Focus

### Completed in ARTEMIS-060 (2026-06-25)

* **Portfolio Total ~30K deviation fixed** — `_normalize_live_summary` now uses IBKR `netliquidation` as primary total value. Previously used `cash + sum(position.market_value)` which excluded non-position assets.
* **Frontend metrics fixed** — Desktop `ibkrMetrics` and Mobile `fullMetrics` now use actual backend fields: `excess_liquidity`, `maint_margin_req`, `init_margin_req`, `realized_pnl`. Previously used hardcoded approximations.
* **Margin fields propagated** — `excess_liquidity`, `maint_margin_req`, `init_margin_req`, `available_funds`, `gross_position_value` now explicitly included in `payload.update()` and `summary.update()` in overlay function.
* **Observability added** — `[QUOTE_UPDATE]` log after Yahoo fallback; `[PORTFOLIO_RECALCULATED]` log at end of overlay.
* **Trade History Panel** — `IBKRTradesPanel` added to Portfolio page. Paginated (25/page), filterable by symbol and side. Backend endpoint updated with full pagination support.
* **IBKR Field Mapping document created** — `docs/IBKR_FIELD_MAPPING.md` canonical reference.

### Pending UAT
* **CRITICAL**: Force-refresh snapshot after deploy: `POST /api/portfolio/snapshot/refresh?force=true` (existing snapshot has pre-fix `total_value`).
* Verify Portfolio Total on Desktop matches IBKR app exactly.
* Verify Excess Liq, Maint Mgn, Init Mgn show correct values (not approximations).
* Verify Trade History panel populates correctly.



## Open P0



### Settings Integrations Configuration Missing

Task ID: PIA-P0-001



Status: IN VALIDATION

Reason: Needs live backend verification for save, check connection, source-health.



Area: Settings → Integrations



Impact:

Cannot configure IBKR, Yahoo, Seeking Alpha, Discord, X/Twitter, RSS feeds.

Commit: d2f6601

Validation: npm run build passed



### Custom Workspaces Lose Widgets

Task ID: PIA-BUG-027

Status: OPEN (2026-05-30)

Area: Workspace layout normalization

Root cause: normalizeWorkspaceLayout intersects saved widgets with supportedWorkspaces; custom workspace ids match no catalog widget, so template-seeded widgets are filtered out.

Fix defined in: docs/PIA_WORKSPACE_ARCHITECTURE_FINAL.md (PIA-ARCH-001-C).



## Open P1



### Analyst Targets V2

Task ID: CR-AT-003 / CR-AT-004 / BUG-AT-001 / CR-AT-005

Status: IMPLEMENTED (2026-06-08)

Area: Stock Intelligence

Commit: latest HERMES Analyst Targets V2 commit

Validation: `npm run build` passed; `/`, `/mobile`, `/setup` route smoke passed.

Notes:

* Overview Analyst Targets card appears before News and now emphasizes consensus target upside/downside plus dollar delta.
* Tapping the Overview card opens the Analysis tab.
* Analysis tab contains Analyst Targets detail: consensus/bull/bear targets, recommendation summary, analyst count, and analyst history empty state.
* Yahoo fallback provides consensus and recommendation summary but not reliable firm/date previous-target/new-target history.

---



### Workspace Manager UX Trap

Task ID: PIA-UX-019



Status: CLOSED


---


### News Intelligence overflow

Task ID: PIA-BUG-028


Status: OPEN

Area: News Intelligence

Impact:

Desktop News cards may overflow or clip action text when density is high.


---


### Stock Intelligence News Compact Redesign

Task ID: PIA-UX-029


Status: OPEN

Area: Stock Intelligence

Impact:

Stock news cards are too wide and require tighter premium hierarchy for mobile/desktop.


---

Validated by: APOLLO

Commit: b28dfa9



Observed:



* Create Workspace leaves user trapped in manager.

* No Done button.

* No Back/Close arrow.



Expected:



* Done closes manager.

* Back closes manager.

* Return to dashboard after create.



---



### Mobile Contextual Top Bar

Task ID: PIA-UX-018



Status: CLOSED

Validated by: APOLLO

Commit: 49c7e05



Observed:

Global PIA header wastes vertical space.



Expected:

Context-aware title:



* Home

* Portfolio

* Watchlists

* Markets



IBKR-style contextual menu.


---



### Watchlist Mobile Scroll Lock

Task ID: PIA-BUG-024



Status: CLOSED

Implementation Commit: 3a8284d

QA: PIA-QA-006 PASS

Reason: APOLLO validated all acceptance criteria and recommended closure.



## Latest Validated Commit



87cef1e



feat: upgrade watchlists with custom lists and IBKR-style views



## Architecture State



* Mobile shell stabilized

* Workspace Manager implemented

* Hamburger menu implemented

* Bottom navigation customizable

* Watchlists upgraded

* Portfolio table/card mode implemented

* Stock search implemented

* Shared news pipeline implemented

* Privacy mode globalized



## Governance



Implemented ≠ Closed



Closed = Implemented + Mobile UAT validated



Before any task:



1. Read PIA_ACTIVE_CONTEXT.md

2. Read 09_Governance_Rules.md



Do not load full MASTER_BACKLOG by default.

Use MASTER_BACKLOG only for historical lookup.



---

## 2026-06-09 Documentation Sync (incremental)

Latest Validated Commit: e5736e9 (range 02dfcdf … e5736e9; requested anchor 72499e9). `npm run build` PASS; `/`, `/mobile`, `/setup` 200.

### Analyst Targets V3 — Task CR-AT-V3 — IMPLEMENTED (HERMES)

* Options tab removed (tabs: Overview, Chart, News, Financials, Analysis); chart only in Chart tab; fixed sticky stock header.
* Overview: Bull/Base/Bear (percent + target price), target range (current + consensus markers), consensus + analyst count, analyst distribution bars.
* Tap Overview Analyst Targets card → Analysis > Analyst Targets; analyst history as mobile cards (no tables).
* Current data source only (no Finnhub/FMP this sprint). Commits 2b9d1de, 5602655, ecbe06d, ac0ca6f.

### Portfolio Density Sprint — SPRINT-PORT-DENSITY — IMPLEMENTED (ATHENA)

* Cards v2, card customization framework, grid + filters, 2x2 compact IBKR style, live price emphasis (dynamic color + tick pop), visual system v2 (larger logo / price hierarchy / 2x2 density), logo ring, portfolio view selector, mobile density pass + persistence validation.
* Commits 23bce57, 54bf30e, b7c646f, 6038934, edca406, 5e8daca, 72499e9, e5736e9.

### Open items from latest UAT / visual audit (2026-06-09)

* PIA-UX-060 (Medium, ATHENA, OPEN): card logo still under-weighted as a visual anchor.
* PIA-BUG-032 (Medium, ATHENA/Platform, OPEN): empty workspace preview widgets read as broken-premium.
* PIA-CSS-001 (Medium, HERMES, OPEN): duplicated/overriding `.stock-intel-header` CSS; consolidate before V3 fixed header.
* PIA-UX-061 (Low, PO decision, OPEN): Cards view discoverability — view mode buried in overflow menu.
* Watchlist UAT carry-forward (OPEN): PIA-WL-008..014.

### Governance additions (LOCKED)

* DEC-DESIGN-LOCK — Design Lock process: a DESIGN LOCKED feature freezes layout/IA; implementation must match the locked spec; deviations require re-approval.
* DEC-NEXT-CACHE — Next.js cache rule: on PageNotFoundError during page-data collection, clear `.next` then rebuild; never delete `.next` while a server holds it (file lock); avoid concurrent `.next` access in the shared working tree.

Backlog parity: these items are mirrored identically in PIA_MASTER_BACKLOG_SOURCE_OF_TRUTH.md and .xlsx (Backlog / UAT Log / Architecture Decisions / CHANGELOG sheets).



---

## 2026-06-10 AI Intelligence V2 — DESIGN LOCK (PO approved)

* AI Intelligence V2 is approved (Product Owner, design score 10/10) and is the official design. V1 is superseded / deprecated.
* Implementation may proceed: **CR-AI-010 — READY FOR IMPLEMENTATION** (HERMES). No code in this entry (governance/docs only).
* All future AI Intelligence work must reference V2: `docs/design-system/mocks/stock-workspace/ai-intelligence-widget-v2.md`.
* Locked decisions:
  * DEC-AI-001 — KPI Cards (replace rings with cards; full-card tap; score vs directional families).
  * DEC-AI-002 — Single Bottom Sheet Explainability (Why It Matters → Score Breakdown → Historical Evolution → Disclaimer; no nested drilldowns).
  * DEC-AI-003 — No Widget Collapse (missing values render as `--`; never replace the section with "Data gathering in progress").
* Mirrored identically in MASTER_BACKLOG .md and .xlsx (Architecture Decisions DEC-AI-001/002/003, Backlog CR-AI-010, CHANGELOG).



---

## 2026-06-11 PIA-GOV-004 — Approved Mock Preservation & Design Lock Traceability (LOCKED)

* **DEC-GOV-004 (LOCKED):** every Design Lock must archive the approved mock under `docs/mocks/<feature>/APPROVED_<feature>_v<version>.png` and COMMIT it **before implementation starts**. Record the approved-mock path in the backlog item, UAT ticket, and Design Lock notes.
* **Process (locked):** Requirement → UX Mockup → Design Review → Design Lock → SAVE approved mock → COMMIT approved mock → Implementation → UAT.
* **UAT requirement:** every UAT report must contain `Approved Mock: <repo path>`, `Design Lock Commit: <id>`, `Implementation Commit: <id>`.
* **Non-compliance:** implementation started without an archived approved mock is a governance violation and is blocked until the mock is committed.
* **Compliance audit:** existing approved mocks are non-compliant with the naming convention and split across `docs/mocks/` and `docs/design-system/mocks/`. Tracked by **GOV-004-REMEDIATION (OPEN, ATHENA)**.
* **Traceability backfill:**
  * AI Intelligence V2 — Approved Mock `docs/mocks/AI Intelligence/mock v1.png` (rename pending) · Design Lock `3bb14df` · Implementation `b7d591e`.
  * Analyst Targets — Approved Mock `docs/mocks/analyst-targets/Approved_mobile_mock_analyst_target.jpg` (+ `analyst-targets-v3-desktop.png`); historical drift motivated this policy.
* Mirrored identically in MASTER_BACKLOG .md and .xlsx (Architecture Decisions DEC-GOV-004, Backlog GOV-004-REMEDIATION, CHANGELOG).





---

## GOVERNANCE STATE — REBUILT 2026-06-17 (ATHENA-GOV-006)

Snapshot rebuilt from actual repository state (branch feat/pia-v3-foundation-integration). Additive; no prior content deleted. Ownership detail also lives in docs/PIA_AGENT_GOVERNANCE.md (Product Ownership / CTO Ownership / Work Assignment Rule).

### Current Sprint
AI Intelligence Foundation + Explainable Engine; Position Summary V3 (mobile + expanded, analytics-first); Portfolio Analytics backend (EPIC-PORTFOLIO-ANALYTICS-001); Stock Intelligence header / IA; mobile popup UX hardening (X + double-tap close). Branch: feat/pia-v3-foundation-integration.

### Open P0
- AI Intelligence V2 Approved Mock MISSING — Design Lock Package INVALID (DEC-GOV-004/005); blocks further AI V2 work until an approved mock is committed under docs/mocks/ai-intelligence/APPROVED/. Owner: ATHENA + Product Owner.
- PIA-P0-001 Settings Integrations Configuration — IN VALIDATION (IBKR Client Portal correction shipped, v0.3.23). Owner: HERMES / Backend.
- PIA-BUG-027 Custom Workspaces Lose Widgets — RESOLVED (custom-safe layout storage); pending UAT closure. Owner: ATHENA.

### Open P1
- Analyst Targets V3 follow-ups (CR-AT-024 / CR-AT-025 refinements) — HERMES.
- News Intelligence overflow (PIA-BUG-028); Stock Intelligence News Compact (PIA-UX-029).
- Workspace System refactor (PIA-ARCH-001-FINAL) and PIA-BUG-027 follow-through — ATHENA.
- AI roadmap ATHENA-AI-002..010 (engine, persistence, Portfolio Fit, Position Intelligence, Opportunity Radar, Analyst Verdict, News V2, Investor Bot, Auto Investor) — ROADMAP.
- GOV-004-REMEDIATION and Mock Consolidation Phase 2 (ATHENA-GOV-005) — ATHENA.

### Ownership Model / Assigned Ownership Area
- ATHENA — Architecture, layout/UX, design governance, mock lifecycle, documentation and backlog, workspace system.
- HERMES — Stock Intelligence, Analyst Targets, AI data/engine, Company/Financials, integrations data.
- ARTEMIS — Watchlists, mobile shell and modals (double-tap close), Notification Center, Position Summary mobile.
- APOLLO — UAT validation and QA.
- HERCULES — Governance validation/reader (HERCULES-GOV-001).
- HEPHAESTUS / Backend — data layer, portfolio analytics infrastructure.

### Approved Mocks
Structure scaffolded under docs/mocks/<feature>/{APPROVED,WORKING,UAT} for ai-intelligence, analyst-targets, stock-intelligence, watchlists, portfolio, position-summary, settings (ATHENA-GOV-005, commit 12e11cf). Plan: docs/mocks/MIGRATION_PLAN.md.
- APPROVED present: analyst-targets, stock-intelligence, position-summary, watchlists (spec).
- APPROVED MISSING: ai-intelligence (V2), portfolio, settings.

### AI Intelligence Status
- V2 DESIGN LOCKED (commit 3bb14df; DEC-AI-001/002/003). CR-AI-010 implemented (b7d591e). Foundation UI shipped (ARTEMIS-AI-001, 3433330). Explainable Intelligence Engine v1 (120bf92). Source registry + connector matrix (c936de4). Architecture: docs/architecture/AI_INTELLIGENCE_ARCHITECTURE.md (ATHENA-AI-001).
- Approved Mock MISSING — Design Lock Package invalid (governance P0).
- Roadmap: ATHENA-AI-002..010 (ROADMAP).

### Analyst Targets Status
- V3 IMPLEMENTED and design-locked (CR-AT-V3). Approved mock archived under docs/mocks/analyst-targets/. Active refinements: CR-AT-024, CR-AT-025.

### UAT Status
- Latest build PASS (9/9 pages, TypeScript valid). Route smoke historically 200 for /, /mobile, /setup. Multiple items pending Product Owner real-device UAT; PIA-P0-001 in validation. Tracking: docs/UAT_TRACKING.md.
- HERMES-IBKR-SNAPSHOT-LIFECYCLE-048 local backend validation passed; snapshot persistence, startup warm-up, and explicit NO_DATA fallback reporting are now in place for the portfolio stack.
- HERMES-IBKR-RECOVERY-052 local backend and frontend validation passed; provider status, portfolio, dashboard, and mobile now resolve Live IBKR from the runtime source contract and the settings source card is compact again.

### Active Epics
- EPIC-PORTFOLIO-ANALYTICS-001 — portfolio analytics backend data infrastructure.
- AI Intelligence — V2 + Explainable Engine + roadmap AI-002..010.
- Position Summary V3 — mobile + expanded analytics-first.
- Stock Intelligence — header and IA.
- Mock Lifecycle Governance — PIA-GOV-004 / PIA-GOV-005 / ATHENA-GOV-006.
- Workspace System — PIA-ARCH-001-FINAL.

### Agent Responsibilities
- ATHENA: design/layout/UX, governance, mocks, docs/backlog, architecture.
- HERMES: stock intelligence, analyst targets, AI data/engine.
- ARTEMIS: mobile UX, watchlists, notifications, position summary mobile.
- APOLLO: UAT/QA validation.
- HERCULES: governance reads/validation.
- Backend / HEPHAESTUS: data layer, analytics.



---

## 2026-06-22 AI Intelligence Compact V3 — Documentation Sync (incremental)

* AiIntelligenceCompactV3 shipped (ARTEMIS): premium compact widget (1b7d426) + card customization + semantic tone engine (3887882).
* Design LOCKED (DEC-AI-CV3): no Last Updated; no score badge; no dots/arrows; 3 rows; 4 cards per row; 2.2 visible per row; card customization; semantic card coloring (High=red, Low=green; a BUY widget may contain red cards).
* Customization: three-dot Customize AI Cards sheet — show/hide, reorder, persisted; cards drawn from a card source pool.
* UAT PENDING (PO PASS decision): NVDA BUY / NBIS HOLD / AAPL HOLD screenshots at 390/430 under frontend/uat-screenshots/cr-ai-compact-v3-cr002/.
* Governance: per DESIGN-LOCK-002 (GOV-007), a committed DESIGN_SPEC.md in docs/mocks/ai-intelligence/APPROVED/ is required to fully validate the Compact V3 lock (currently a stub).
* Architecture documented: docs/architecture/AI_INTELLIGENCE_ARCHITECTURE.md §1b. Mirrored in MASTER_BACKLOG .md/.xlsx (Backlog, Architecture Decisions DEC-AI-CV3, CHANGELOG) and CHANGELOG.md v0.3.27.



---

## 2026-06-22 AI Intelligence V2 — Governance Refresh (ATHENA-GOV-021)

* AI Intelligence V2 = **Release Candidate pending UAT**. Backend 98% / Frontend 80% / Overall 92–93%.
* LOCKED: DEC-AI-009 (Shared Intelligence Data Layer), DEC-AI-010 (AI Verdict Separation: AI Verdict ⟂ Portfolio Recommendation), DEC-AI-011 (Hero System Standardization).
* Backend HERMES-AI-005 + HERMES-AI-006 COMPLETE/Accepted (contract ready; warm 6/9ms, cold 1.9–2.8s). ARTEMIS-AI-011 IN PROGRESS; CR-AI-011 OPEN (release blocker).
* Backlog: HERMES-AI-007 (Parallel Context Hydration P2), CR-HERMES-006-01 (Contract Versioning P3).
* Release blockers: CR-AI-011 visual parity · real endpoint wiring · final UAT.
* New trackers: docs/PROJECT_STATUS.md, docs/ROADMAP.md, docs/RELEASE_NOTES_DRAFT.md. Mirrored in MASTER_BACKLOG .md/.xlsx (Architecture Decisions, Backlog, CHANGELOG) + CHANGELOG.md v0.3.28 + AI_INTELLIGENCE_ARCHITECTURE.md §1c.



---

## 2026-06-22 AI Intelligence V3 — Research Documentation (ATHENA-GOV-022)

* V3 splits into: A) Overview/Compact/Expanded hero (locked; CR-AI-V3-UI-001 CLOSED 89bad3a), B) Research Tab V2 (implemented ARTEMIS-AI-V3-RESEARCH-003 8657868+b056bc1 but Design Lock INVALID), C) Backend Research V1+Provenance (HERMES-AI-V3-002/003 COMPLETE, contract ready).
* Backend: HERMES-AI-V3-001 gap analysis, HERMES-AI-V3-002 endpoint V1 (thesis-only; p50 9.93/p95 11.86ms), HERMES-AI-V3-003 provenance + real-data (schema V3.0; p50 12.12/p95 17.29ms). Endpoint GET /api/intelligence/{symbol}/research.
* Decisions LOCKED: DEC-AI-RESEARCH-001 (thesis-only), -002 (Overview/Portfolio/Research ownership split), -003 (no dummy data), -004 (real-peer-only comparison), -005 (approved mock = research-approved.png — ASSET MISSING), -006 (accordion down=collapsed/up=expanded), -007 (research customization locked).
* Epics: EPIC-AI-RESEARCH-V2 (in progress), EPIC-AI-PROVENANCE (backend done, FE pending), EPIC-AI-COMPETITIVE-COMPARISON (backlog). Bugs: BUG-HERMES-AI-007-AMD-MATERIAL-NEWS, BUG-AI-RESEARCH-COMPETITIVE-DATA-MISSING, BUG-AI-RESEARCH-PROVIDER-GAPS.
* **P0 BLOCKER GOV-022-RESEARCH-MOCK-MISSING:** research-approved.png absent (typo research-aproved.png + drafts no longer present, never committed). DEC-AI-RESEARCH-005 reference broken; Research V2 Design Lock invalid per DESIGN-LOCK-002 until approved image + RESEARCH_DESIGN_SPEC.md committed.

### Continuation — next actions (AI Intelligence V3)

1. **[P0] Remediate GOV-022-RESEARCH-MOCK-MISSING:** obtain + commit the approved Research mock at `docs/mocks/ai-intelligence/APPROVED/research-approved.png` (correct spelling) and author `RESEARCH_DESIGN_SPEC.md`; then DEC-AI-RESEARCH-005 reference resolves and the Design Lock becomes valid.
2. **Capture Research V2 UAT screenshots:** 390px Research tab, Customize Research drawer, expanded Investment Thesis, Data Source & Details provenance drawer; log a UAT entry and PASS decision.
3. **Wire real endpoint** end-to-end (frontend consuming HERMES-AI-V3-003.0 contract); verify <1s load.
4. **Close ARTEMIS-AI-V3-RESEARCH-003** once #1–#3 done.
5. **Provider roadmap:** peer-selection provider (Competitive Comparison) + financials/TAM/guidance/ownership/fund-sentiment/DCF providers to replace placeholders.

---

## 2026-06-24 ATHENA-DOCS-SYNC-049 — Thread Outcomes & Project Priority Reset

### Current Priority (NO new features until P0s pass UAT)

**P0 #1 — Fix portfolio calculations (HERMES-PORTFOLIO-CALCULATION-046)**
Portfolio Total, Day P/L, Day P/L %, Unrealized P/L are still incorrect. Root cause not yet isolated. Blocks all live portfolio UAT.

**P0 #2 — Fix live quote propagation (HERMES-LIVE-QUOTES-037)**
Quotes not propagating correctly to portfolio table, hero, and AI context. Dependency of P0 #1.

**P0 #3 — Fix snapshot lifecycle + hybrid mode (HERMES-IBKR-SNAPSHOT-LIFECYCLE-048)**
Snapshot persistence behavior still not matching requirements after v1 implementation. Hybrid mode fallback needs rework.

### Thread UAT Outcomes

| Task | UAT Result | Notes |
|---|---|---|
| HERMES-LIVE-REFRESH-FIX-025 | IMPLEMENTED | Commit 3c4a4b6 — WebSocket reconnect, polling, TFA polling |
| ARTEMIS-SETTINGS-DATASOURCE-UX-018 | IMPLEMENTED | Portfolio Data Source card, gateway validation |
| ARTEMIS-PIA-IBKR-APP-SWITCH-027 | IMPLEMENTED | pageshow + TFA polling + auto refresh |
| HERMES-IBKR-MARKETDATA-STATUS-028 | IMPLEMENTED | Fixed C5.10 prefix parse; pricesLive restored |
| HERMES-LIVE-POSITION-METRICS-MAPPING-036 | **FAIL** | Portfolio calculations still wrong |
| ARTEMIS-AI-RESEARCH-TAB-IMPLEMENTATION-038 | **PARTIAL** | V3 visible; backend gaps, object rendering bug, card nesting |
| HERMES-RESEARCH-DATA-AND-LIVE-CONTRACT-040 | READY FOR UAT | Commit 9d20e03 |
| HERMES-MOBILE-LIVE-REFRESH-BLINK-041 | **FAIL** | Reduced blink; calcs still wrong; quotes not propagating. Commits b684469, dfd7335 |
| HERMES-PRICE-PROVIDER-FALLBACK-044 | **PARTIAL** | Snapshot persistence not matching requirements. Commits a27ba55, 3374c7d |
| HERMES-IBKR-SNAPSHOT-LIFECYCLE-048 | **FAIL** | Lifecycle not as required. Commit 8a9d43b0 |
| HERMES-IBKR-RECOVERY-052 | READY FOR UAT | Runtime source detection aligned across settings, provider status, portfolio, dashboard, and mobile; Live IBKR now shows as connected when the Gateway is authenticated. |
| ARTEMIS-PRICE-PROVIDER-FALLBACK-UX-045 | READY FOR UAT | Badge variants, timestamps, stale banner, source markers, settings split |
| HERMES-END-TO-END-PORTFOLIO-RECOVERY-056 | READY FOR UAT | Full lifecycle engine: snapshot recovery, write guard, source honesty, lifecycle logs, `/api/debug/source-trace`. 8/8 tests pass. |
| ARTEMIS-PORTFOLIO-TABLE-CUSTOMIZE-054 | READY FOR UAT | Desktop three-dot column menu, drag reorder, show/hide, persists. Shared localStorage with mobile. |

### Open Items (no task ID yet)
- Research data coverage audit
- Research mobile layout optimization
- Compact AI widget vignette regression

### Open P0 Task Register

| Task ID | Title | Owner | Status |
|---|---|---|---|
| HERMES-PORTFOLIO-CALCULATION-046 | Portfolio calculations incorrect | HERMES | OPEN P0 |
| HERMES-LIVE-QUOTES-037 | Live quote propagation audit | HERMES | OPEN P0 |
| HERMES-LIVE-REFRESH-039 | Full dashboard refresh architecture | HERMES | OPEN P0 |
| ARTEMIS-PORTFOLIO-TABLE-COLUMNS-047 | Portfolio table columns, ordering, sorting, desktop parity | ARTEMIS | DELIVERED — see ARTEMIS-PORTFOLIO-TABLE-CUSTOMIZE-054 |
