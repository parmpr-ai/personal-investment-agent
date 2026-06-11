# PIA ACTIVE CONTEXT



## Current Branch



feat/pia-v3-foundation-integration



## Current Sprint



Stabilization Sprint / Mobile UAT



## Current Focus



* Mobile UAT

* Watchlists

* Stock Intelligence

* Workspace Manager polish

* Governance artifact sync and branch finalization

* Home Dashboard refinement



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



