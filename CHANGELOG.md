# Personal Investment Agent — Changelog

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
