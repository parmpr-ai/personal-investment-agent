# PIA UAT Tracking

This document tracks UAT status for all implemented tasks and design locks.

Format per entry:
- **Task ID** — unique identifier
- **Status** — PASS | PASS WITH CR | FAIL | DOCUMENTATION ONLY | PENDING
- **Owner** — agent responsible for delivery
- **Approved Mock** — repo path to committed approved mock (DEC-GOV-004)
- **Design Lock Commit** — commit where design was locked
- **Implementation Commit** — commit where feature was delivered
- **Build** — `npm run build` result
- **Notes** — findings, CRs, next steps

---

## UAT Log

### HERMES-IBKR-RECOVERY-052

Status: READY FOR UAT
Owner: HERMES
Date: 2026-06-24
Approved Mock: N/A
Design Lock Commit: N/A
Implementation Commit: (pending commit in this branch)

Build: PASS (`python -m py_compile backend/main.py backend/services/portfolio_providers.py`, `python -m unittest discover -s tests -p 'test_*.py'`, `npm run build`)

Notes:
- Runtime provider status now resolves from the live heartbeat path instead of stale persisted mode, so settings, provider status, portfolio, dashboard, and mobile agree on `IBKR_LIVE` when the Gateway is authenticated.
- Live IBKR now falls back to snapshot/demo only when required, and the compact settings source card shows Current Source and Last Updated.
- Local backend/frontend validation passed in this workspace; PO UAT still pending.

### ARTEMIS-PRICE-PROVIDER-FALLBACK-UX-045

Status: READY FOR UAT
Owner: ARTEMIS
Date: 2026-06-24
Approved Mock: N/A
Design Lock Commit: N/A
Implementation Commit: (current branch — this thread)

Build: PASS (`npm run build` — compiled in 11.2s, 12/12 static pages)

Notes:
- `resolvePortfolioBadge()` and `resolvePositionPriceSource()` added to `pia-api.ts`; all new mode strings supported (HYBRID_LAST_POSITIONS_LIVE_QUOTES, MANUAL_HOLDINGS_LIVE_QUOTES, DISCONNECTED, auto-inferred HYBRID).
- Portfolio header badge now uses correct PiaBadge variant (ibkr=green, warning=amber, info=blue) with hybrid subtitle and dual timestamps row.
- Amber stale-prices banner shown when `pricesLive === false` in non-mock mode; never a full-screen block.
- Per-position source markers (YH / IBKR / STALE) in the Last column, shown only when `priceSource` explicitly set.
- Settings card shows "Fallback Live Pricing Active" / "IBKR Gateway Offline" instead of fatal "Gateway Not Connected" when `pricesLive` is true.
- Settings card Positions/Prices split row added.
- Mobile: MobileStatusDock badge, stale strip, hybrid-aware IBKR row, badge--hybrid CSS class.
- PO live-Gateway UAT still pending.

---

### HERMES-IBKR-SNAPSHOT-LIFECYCLE-048 — UAT OUTCOME: FAIL

Status: FAIL PO UAT
Owner: HERMES
Date: 2026-06-24
Implementation Commit: 8a9d43b0

Notes:
- Snapshot lifecycle still not behaving exactly as required per PO UAT.
- Durable persistence, startup warm-up, NO_DATA state, and debug endpoint were all implemented and locally validated.
- PO UAT found snapshot persistence behavior still not matching requirements.
- Tracked by HERMES-IBKR-SNAPSHOT-LIFECYCLE-048; P0 fix needed before UAT re-entry.

---

### HERMES-PRICE-PROVIDER-FALLBACK-044 — UAT OUTCOME: PARTIAL

Status: PARTIAL PO UAT
Owner: HERMES
Date: 2026-06-24
Implementation Commits: a27ba55, 3374c7d

Notes:
- Yahoo fallback pricing, hybrid mode, manual holdings live pricing implemented and locally validated.
- PO finding: snapshot persistence behavior not matching requirements.
- Upstream dependency on HERMES-IBKR-SNAPSHOT-LIFECYCLE-048 fix before full re-test.

---

### HERMES-MOBILE-LIVE-REFRESH-BLINK-041 — UAT OUTCOME: FAIL

Status: FAIL PO UAT
Owner: HERMES
Date: 2026-06-24
Implementation Commits: b684469, dfd7335

Notes:
- Flashing reduced; component identity preserved across polls; mock fallback flashes eliminated per local validation.
- PO UAT findings: portfolio calculations still wrong; quotes still not propagating correctly.
- Upstream root cause: HERMES-PORTFOLIO-CALCULATION-046 (P0 open). Cannot re-UAT until calculations are fixed.

---

### ARTEMIS-AI-RESEARCH-TAB-IMPLEMENTATION-038 — UAT OUTCOME: PARTIAL

Status: PARTIAL PO UAT
Owner: ARTEMIS
Date: 2026-06-24
Implementation Commit: (this branch)

Notes:
- Research V3 tab visible and renderable. ResearchTabV3.tsx delivered as drop-in replacement.
- PO findings: many backend data gaps; `[object Object]` rendering bug; excessive card nesting; missing analyst distributions; placeholder values suspected.
- Design Lock invalid until research-approved.png is committed (GOV-022-RESEARCH-MOCK-MISSING).
- Backend gaps tracked under HERMES-RESEARCH-DATA-AND-LIVE-CONTRACT-040 (READY FOR UAT).

---

### HERMES-LIVE-POSITION-METRICS-MAPPING-036 — UAT OUTCOME: FAIL

Status: FAIL PO UAT
Owner: HERMES
Date: 2026-06-24
Implementation Commits: 4a15052, a38becd

Notes:
- Day Change, Day P/L, Day P/L %, portfolio aggregation, risk/momentum provenance, fake News Score 50 removal, quote cache preference all implemented and locally validated.
- PO UAT: portfolio calculations still incorrect.
- Root cause isolated to open P0 HERMES-PORTFOLIO-CALCULATION-046.

---

### HERMES-RESEARCH-DATA-AND-LIVE-CONTRACT-040

Status: READY FOR UAT
Owner: HERMES
Date: 2026-06-24
Implementation Commit: 9d20e03

Notes:
- Explicit missing states, metricStates, missingMetrics, safer null-risk handling implemented.
- Local backend validation passed.
- PO UAT pending.

---

### HERMES-IBKR-MARKETDATA-STATUS-028

Status: IMPLEMENTED (no UAT result provided)
Owner: HERMES
Date: 2026-06-24

Notes:
- Root cause: IBKR returns prefix values like `C5.10` which were treated as invalid numeric.
- Fix: support IBKR-prefix field values; correct field mapping 85/86; `pricesLive` flag restored.
- Commit recorded in this branch.

---

### ARTEMIS-PIA-IBKR-APP-SWITCH-027

Status: IMPLEMENTED (no UAT result provided)
Owner: ARTEMIS
Date: 2026-06-24

Notes:
- `pageshow` listener added to detect return from IBKR app.
- TFA polling integrated.
- Auto dashboard refresh triggered when returning from IBKR app.

---

### ARTEMIS-SETTINGS-DATASOURCE-UX-018

Status: IMPLEMENTED (no UAT result provided)
Owner: ARTEMIS
Date: 2026-06-24

Notes:
- Portfolio Data Source card placed at top of Settings.
- Mock / Last Update / Live IBKR selector implemented.
- Auto gateway validation on mode switch.
- Live status indicators (pill, tone, detail) added.

---

### HERMES-LIVE-REFRESH-FIX-025

Status: IMPLEMENTED
Owner: HERMES
Date: 2026-06-24
Implementation Commit: 3c4a4b6

Notes:
- Shared `API_BASE_URL` and `WS_BASE_URL` runtime configuration.
- Removed hardcoded port 8000 references.
- WebSocket reconnect with 10-second polling fallback.
- Focus/visibility refresh trigger.
- Setup/TFA polling (2s interval, max 90s) with automatic Ready transition.

---

### HERMES-IBKR-SNAPSHOT-LIFECYCLE-048

Status: PENDING
Owner: HERMES
Date: 2026-06-24
Approved Mock: N/A
Design Lock Commit: N/A
Implementation Commit: pending commit in this branch

Build: PASS (`python -m py_compile backend/main.py backend/services/portfolio_providers.py backend/tests/test_snapshot_lifecycle.py`, `python -m unittest discover -s tests -p 'test_*.py'`)

Notes:
- Snapshot lifecycle persistence now keeps the last valid IBKR bundle durable, refuses to overwrite good data with empty or failed refreshes, and records explicit refresh-state metadata.
- Startup warm-up can seed the live snapshot cache without changing the selected mode, and the portfolio stack now exposes explicit `NO_DATA` when neither live nor snapshot data is available.
- PO UAT screenshots and live Gateway validation are still pending in this workspace.

### HERMES-PRICE-PROVIDER-FALLBACK-044

Status: PENDING
Owner: HERMES
Date: 2026-06-23
Approved Mock: N/A
Design Lock Commit: N/A
Implementation Commit: pending commit in this branch

Build: PASS (`python -m py_compile backend/main.py backend/services/portfolio_providers.py backend/services/price_providers.py backend/services/manual_holdings.py backend/tests/test_price_provider_fallback.py`, `python -m unittest discover -s tests -p 'test_*.py'`, `npm run build`)

Notes:
- Added Yahoo Finance fallback pricing so portfolios keep updating when IBKR is unavailable.
- Portfolio contracts now expose hybrid fallback source metadata instead of freezing on stale LAST_UPDATE values.
- PO UAT validation against a live authenticated Gateway is still pending in this workspace.

### HERMES-LIVE-QUOTES-037

Status: PENDING
Owner: HERMES
Date: 2026-06-23
Approved Mock: N/A
Design Lock Commit: N/A
Implementation Commit: pending commit in this branch

Build: PASS (`npm run build`)

Notes:
- Live quote diagnostics now report advancing timestamps, quote count, and symbol list for IBKR_LIVE.
- Stock hero consumers prefer the live dashboard seed over the original selected-row snapshot for held positions.
- PO UAT screenshots are still pending in this workspace.

### HERMES-MOBILE-LIVE-REFRESH-BLINK-041

Status: PENDING
Owner: HERMES
Date: 2026-06-23
Approved Mock: N/A
Design Lock Commit: N/A
Implementation Commit: pending commit in this branch

Build: PASS (`npm run build`)

Notes:
- Mobile live dashboard updates now preserve component identity across polls and keep the last non-empty live portfolio rows to avoid mock fallback flashes.
- Dev-only remount / loading-toggle diagnostics added for MobileExperience and portfolio table/card views.
- PO UAT evidence is still pending in this workspace.

### HERMES-LIVE-POSITION-METRICS-038

Status: PENDING
Owner: HERMES
Date: 2026-06-23
Approved Mock: N/A
Design Lock Commit: N/A
Implementation Commit: pending commit in this branch

Build: PASS (`python -m py_compile backend/main.py backend/services/portfolio_providers.py backend/tests/test_portfolio_metrics.py`, `python -m unittest tests.test_portfolio_metrics`)

Notes:
- Live position finalization now recomputes day P/L, day %, unrealized, and unrealized % from validated quote inputs and preserves nullable outputs when inputs are missing.
- Portfolio summary now sums live position day P/L values and exposes calculation provenance in the debug live-quotes payload.
- Backend regression tests cover stock, option, mixed portfolio, nullable-input, and summary aggregation cases.
- Live Gateway UAT evidence is still pending in this workspace.

### AI Intelligence Compact V3 — ARTEMIS-AI-COMPACT-REDESIGN-001 / CR-AI-COMPACT-REDESIGN-002 / -003

Status: PENDING (PASS decision)
Owner: ARTEMIS (impl) · APOLLO / Product Owner (UAT decision)
Date: 2026-06-22
Approved Mock: docs/mocks/ai-intelligence/APPROVED/ (Compact V3 — confirm canonical image; see GOV-007 spec requirement)
Design Lock Commit: DEC-AI-CV3 (principles recorded 2026-06-22)
Implementation Commit: 1b7d426 (widget), 3887882 (customization + semantic tones)

Build: PASS (per implementation commits)

Screenshots (390 / 430, captured):
- NVDA — BUY verdict: `frontend/uat-screenshots/cr-ai-compact-v3-cr002/nvda-widget-390.png`, `nvda-widget-430.png`, `nvda-customize-390.png`, `nvda-customize-430.png`
- NBIS — HOLD verdict: `frontend/uat-screenshots/cr-ai-compact-v3-cr002/nbis-widget-390.png`, `nbis-widget-430.png`, `nbis-customize-390.png`, `nbis-customize-430.png`
- AAPL — HOLD verdict: `frontend/uat-screenshots/cr-ai-compact-v3-cr002/aapl-widget-390.png`, `aapl-widget-430.png`, `aapl-customize-390.png`, `aapl-customize-430.png`

Notes:
- Verified: 3 rows × 4 cards, 2.2 visible per row; no Last Updated, no score badge, no dots/arrows; three-dot Customize sheet (show/hide, reorder, persisted); semantic tone (High=red, Low=green; a BUY widget may contain red cards).
- Pending: Product Owner PASS / PASS WITH CR / FAIL decision.
- Governance (GOV-007 / DESIGN-LOCK-002): Compact V3 requires a committed DESIGN_SPEC.md in APPROVED/ before the design lock is fully valid — currently the AI Compact spec is a stub.

### HERMES-AI-002 - Explainable AI Intelligence Engine V1

Status: PASS
Owner: HERMES
Date: 2026-06-17
Approved Mock: N/A (backend intelligence engine)
Design Lock Commit: N/A
Implementation Commit: pending commit in this PR

Build: PASS (`py_compile`, contract smoke, fixtures, `npx tsc --noEmit --pretty false`, `npm run build`)

Deliverables verified:
- [x] `/api/intelligence/{symbol}/score` returns a full verdict contract
- [x] `debug=true` returns raw factors, weights, missing sources, coverage calculation, normalization, and cache status
- [x] Missing Seeking Alpha / Discord / X sentiment does not block verdict
- [x] Deterministic bull, balanced, bear, and portfolio-aware fixtures created
- [x] Portfolio-aware fixture returns `stockVerdict=STRONG BUY`, `portfolioRecommendation=HOLD`, `finalVerdict=HOLD`, `visualState=BALANCED`
- [x] Cached response path returns immediately in backend smoke test

Notes:
- Normal score responses avoid "Live", "Updated", and source timestamps.
- Official frontend build passed after stopping the running Next dev server per repo governance.

---

### ARTEMIS-AI-011-CR04 — AI Intelligence Compact V2 Premium Redesign

Status: PASS
Owner: ARTEMIS
Date: 2026-06-18
Approved Mock: `docs/mocks/ai-intelligence/APPROVED/ai-intelligence-all-cases-compact-approved.png`
Design Lock Commit: N/A (approved mock committed in ARTEMIS-AI-011)
Implementation Commit: pending (this commit)
Prior Commit (first pass, rejected): 4982058

Build: PASS (9/9 pages, `npx tsc --noEmit` clean, `npm run build` clean)
Screenshots: `frontend/uat-screenshots/artemis-ai-011/`

Deliverables verified:
- [x] State badge top-left: BULL CASE / EVEN CASE / BEAR CASE
- [x] Title "AI Intelligence" (13px/600, inside card, NOT all-caps, NO info icon, NO Beta)
- [x] Verdict 44px 800 weight left-aligned — BUY / HOLD / SELL (non-owned); ADD / REDUCE / TRIM (owned)
- [x] Portfolio logic: non-owned bull→BUY, bear→SELL, balanced→HOLD; owned bull→ADD, bear→REDUCE, trim→TRIM; non-owned trim→HOLD
- [x] Hero visual: 3D-look SVG animals with radialGradient + feGaussianBlur glow (not flat SVG)
- [x] CSS breathing animation: scale 1→1.04 at 3.5s ease-in-out infinite
- [x] Risk: colored dot + label text (not a badge or pill)
- [x] Key Drivers: colored circle dots (good=green, bad=red, neutral=orange)
- [x] REMOVED: High Risk badge, top-right menu, trend arrow, Beta label, score bar, View Full Analysis
- [x] Shell header hidden in compact mode
- [x] 390px BUY (non-owned): "BUY", green bull, Conviction 78/100, Medium Risk ✓
- [x] 390px HOLD (non-owned): "HOLD", amber balance pair, Conviction 52/100, Medium Risk ✓
- [x] 390px SELL (non-owned): "SELL", red bear, Conviction 22/100, High Risk ✓
- [x] 390px ADD (owned 150 shares): "ADD", green bull, Conviction 78/100, Medium Risk ✓
- [x] 414px BUY: layout intact ✓
- [x] 768px Tablet BUY: wide layout ✓

Animation: SVG radialGradient (3D lighting) + feGaussianBlur/feColorMatrix/feMerge (neon glow) + CSS sai-p2-breathe keyframes. No Lottie/Rive dependency.

Notes:
- `GlowBull`, `GlowBear`, `GlowBalance` replace all flat SVG animal components
- `PremiumHero` selects animal by VerdictState
- `AiCompactV2` receives `isOwned`; `effectiveState` overrides trim→balanced for non-owned positions
- CSS vars `--p2-color`, `--p2-rgb`, `--p2-glow` per state variant
- UAT script fix: `positions` must be nested inside `portfolio` in `makeDashboard` mock

---

### ARTEMIS-AI-011 — AI Intelligence Compact V2 (first pass — superseded by CR04)

Status: PASS WITH CR
Owner: ARTEMIS
Date: 2026-06-17
Implementation Commit: 4982058
Note: Flat SVG animals rejected per CR04 spec. See CR04 entry above.

---

### ARTEMIS-AI-001 — AI Intelligence UI Foundation

Status: PASS
Owner: ARTEMIS
Date: 2026-06-17
Approved Mock: N/A (UI foundation — no separate approved mock committed)
Design Lock Commit: N/A (foundations task)
Implementation Commit: 3433330

Build: PASS (9/9 pages, types valid)

Deliverables verified:
- [x] Compact mode: Verdict chip + Expected Return + Conviction + Risk + Top Reason
- [x] NO Live badge, NO Updated timestamp, NO Source Labels in compact mode
- [x] Expanded mode: 8 labeled sections (AI Verdict, Why AI Thinks This, Bull Case, Bear Case, Scenario Outlook, Score Breakdown, Factors Evaluated, Confidence Notes)
- [x] 4 visual states: bull (green), bear (red), balanced (orange + TrendingDown/Scale/TrendingUp), trim (amber)
- [x] deriveVerdictState: trim if composite≥55 AND risk≥80; bull≥65; bear<40; else balanced
- [x] Settings: Discord Signals (not_connected) and X Sentiment (planned) integration cards added
- [x] integrationNavTone: planned→warn, not_connected→bad
- [x] CSS: compact/expanded section styles, verdict chip variants

Notes:
- Compact view is the default (isExpanded=false). Clicking "Full Analysis ›" opens expanded.
- Expanded view collapses back via "Compact ‹" in header.
- Drill-down fullscreen views (MetricFullScreenView, InsightFullScreenView) preserved unchanged.
- SourceGrid (Source + Last Updated) retained only in drill-down detail views per spec.

---

### ATHENA-AI-001 — AI Intelligence Architecture & Documentation Consolidation

Status: DOCUMENTATION ONLY
Owner: ATHENA
Date: 2026-06-17
Approved Mock: N/A (documentation task — no UI change)
Design Lock Commit: N/A
Implementation Commit: pending commit in this PR

Build: PASS (no code changes; frontend build unaffected)

Deliverables verified:
- [x] `docs/architecture/AI_INTELLIGENCE_ARCHITECTURE.md` created
- [x] `CHANGELOG.md` updated with v0.3.24 entry
- [x] `docs/PIA_MASTER_BACKLOG_SOURCE_OF_TRUTH.md` updated with ATHENA-AI-001..AI-010 backlog items
- [x] `docs/UAT_TRACKING.md` created (this file)

Notes:
- All 9 required AI Intelligence subsystem areas documented.
- 9 roadmap tasks registered (ATHENA-AI-002 through ATHENA-AI-010).
- No frontend or backend code changed in this task.

---

### IBKR-CR-002 — IBKR Client Portal Settings Correction

Status: PASS
Owner: HERMES
Date: 2026-06-16
Approved Mock: N/A (correction — no mock required)
Design Lock Commit: N/A
Implementation Commit: see git log for IBKR-CR-002 commit

Build: PASS
Screenshots: `frontend/uat-screenshots/ibkr-cr-002/`

Notes:
- Replaced legacy TWS/socket Settings UI with Client Portal Gateway UI.
- Portfolio Data Source selector: Mock / Demo Samples / Live IBKR.
- Provider status display, fallback visibility, Test Connection action, portfolio source badge.
- Provider mode persisted to SQLite via `data_source.mode` in settings_store.

---

### HERMES-RESEARCH-DATA-AND-LIVE-CONTRACT-040 ??? Research data and live contract hardening

Status: PASS WITH CR
Owner: HERMES
Date: 2026-06-23
Approved Mock: N/A (backend + contract correction)
Design Lock Commit: N/A
Implementation Commit: 4a15052

Build: PASS

Notes:
- Research payloads now return explicit section missing states, provenance, and confidence for AMD and NBIS.
- Live portfolio positions now expose `metricStates` and `missingMetrics` for blank fields.
- Null-safe risk handling prevents live route crashes when `risk` is unavailable.
- Fresh backend validation confirmed `/api/intelligence/AMD/research` and `/api/intelligence/NBIS/research` return full payloads.
- Live portfolio route now returns data instead of failing on null-risk guardrails.

---

### CR-PS-021 — Position Summary Expanded V3 Alignment

Status: PASS (32/32 UAT checks)
Owner: ARTEMIS
Date: 2026-06-02
Approved Mock: `docs/mocks/position-summary/`
Design Lock Commit: see DESIGN_LOCK.md
Implementation Commit: 469e6ea

Build: PASS
UAT Script: `frontend/uat-scripts/cr-ps-021-capture.js`
Screenshots: `frontend/uat-screenshots/cr-ps-021/`

Notes: 2×4 metrics grid; pinned sections (Health + Value Evolution); optional sections (Analytics, Cost Basis, Contribution, Timeline); Customize View redesign; interactive chart markers; sample/fallback data; range filters 1W/1M/3M/YTD/1Y/ALL.

---

### CR-SI-027..031 — AI Intelligence Data Hardening

Status: PASS
Owner: HERMES
Date: 2026-06-12
Approved Mock: N/A (hardening — behavior only)
Design Lock Commit: N/A
Implementation Commit: b7d591e

Build: PASS

Notes:
- Removed synthetic fallback scoring across all 6 metrics.
- Suppressed manual placeholder scores (momentum_score: 50, news_score: 50).
- Confidence engine replaced static fallback with coverage-based calculation.
- Historical Evolution renders only when stored history arrays are present.
- Fair Value: missing data hides scenarios, chart, upside/downside.
- See `docs/CR-SI-027-031_AI_Intelligence_Data_Audit.md` for full metric audit.

---

### CR-AT-V3 — Analyst Targets V3

Status: PASS
Owner: HERMES
Date: 2026-06-09
Implementation Commit: 2b9d1de..e5736e9

Build: PASS

Notes: Options tab removed; tabs fixed as Overview/Chart/News/Financials/Analysis; chart only in Chart tab; fixed sticky header; Overview has Bull/Base/Bear, target range, consensus, distribution bars; tap Overview → Analysis > Analyst Targets; analyst history as mobile cards.

---

### SPRINT-PORT-DENSITY — Portfolio Density Sprint

Status: PASS
Owner: ATHENA
Date: 2026-06-09
Implementation Commit: 23bce57..e5736e9

Build: PASS

Notes: Cards v2, card customization, grid + filters, 2x2 compact IBKR style, live price color + tick pop, visual system v2, logo ring, portfolio view selector, mobile density pass + persistence.

---

### HERMES-LIVE-POSITION-METRICS-MAPPING-036 â€” Live position metrics and score provenance hardening

Status: PASS WITH CR
Owner: HERMES
Date: 2026-06-23
Approved Mock: N/A (backend + contract correction)
Design Lock Commit: N/A
Implementation Commit: pending commit in this PR

Build: PASS

Notes:
- Removed fake real-metric defaults from live stock surfaces.
- Day change / day P&L / day P&L% now derive from validated quote fields and formulas.
- Risk and momentum come from cached AI intelligence when available; otherwise they return null with provenance.
- News score remains null until real scoring exists.
- Backend regression tests cover stock, option, crypto, mixed portfolio, and missing-previous-close cases.
- The local Gateway-connected process was unavailable during validation in this workspace, so live endpoint output here still reflects the last-update fallback path.

---

## UAT Governance Rules

Per DEC-GOV-004 (LOCKED 2026-06-11):

1. Every UAT entry must contain: Approved Mock path, Design Lock Commit, Implementation Commit.
2. Approved mock must be committed before implementation starts.
3. Build must pass before UAT entry is marked PASS.
4. Documentation-only tasks are marked DOCUMENTATION ONLY with N/A for mock/commits.
5. Entries must be mirrored in `docs/PIA_MASTER_BACKLOG_SOURCE_OF_TRUTH.md` and `.xlsx`.

---

See also: `docs/PIA_UAT_RESULTS.md` for legacy UAT findings format.
