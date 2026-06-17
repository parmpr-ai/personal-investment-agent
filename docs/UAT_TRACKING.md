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

## UAT Governance Rules

Per DEC-GOV-004 (LOCKED 2026-06-11):

1. Every UAT entry must contain: Approved Mock path, Design Lock Commit, Implementation Commit.
2. Approved mock must be committed before implementation starts.
3. Build must pass before UAT entry is marked PASS.
4. Documentation-only tasks are marked DOCUMENTATION ONLY with N/A for mock/commits.
5. Entries must be mirrored in `docs/PIA_MASTER_BACKLOG_SOURCE_OF_TRUTH.md` and `.xlsx`.

---

See also: `docs/PIA_UAT_RESULTS.md` for legacy UAT findings format.
