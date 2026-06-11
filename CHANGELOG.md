# Personal Investment Agent — Changelog

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
