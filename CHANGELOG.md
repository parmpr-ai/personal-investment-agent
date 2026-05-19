# Personal Investment Agent — Changelog

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
