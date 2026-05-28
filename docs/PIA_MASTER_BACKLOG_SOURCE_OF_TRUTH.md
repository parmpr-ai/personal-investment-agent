# PIA Master Backlog Source Of Truth

Status: Active AI memory engine
Last updated: 2026-05-28
Branch: `feat/pia-v3-foundation-integration`

This Markdown is the canonical readable operating memory for PIA. The Excel workbook is the PM operational database. Both must stay synchronized after every approved sprint, merge, or implementation.

## Product Philosophy

PIA is a premium, mobile-first investment command platform. It should feel institutional, compact, dark, glass/neon, and optimized for fast scanning across Home, mobile, portfolio intelligence, and stock workspaces.

- Not a generic admin panel.
- Not a crypto toy dashboard.
- Not a static report.
- Must preserve working routes, widgets, privacy mode, and responsive behavior.
- Must prioritize IBKR-inspired ergonomics: dense controls, immediate status, restrained visuals, low-friction navigation.

## Current Active State

- Active branch: `feat/pia-v3-foundation-integration`
- Stable checkpoint: Sprint 2B implementation branches merged into integration.
- Current sprint: Sprint 2C execution and UAT failure remediation.
- Current status: Hybrid mock intelligence data layer deployed for UI evaluation; design governance and mock-first workflow locked; mobile correction mock pack available for Product Owner review.
- Current priorities:
  - Enforce mock-first design governance before any further UI implementation.
  - Interaction stabilization on Home and mobile.
  - Mobile density refinement across cards, scanner rails, and intelligence surfaces.
  - Stock workspace expansion around Technical, Company, News, and Videos. Completed for Sprint 2C HERMES scope.
  - Notification Center refactor for mobile-safe visibility.
  - Performance smoothing for motion/render cost.
  - Mobile correction mock review for Portfolio Snapshot, Position Full Screen, Workspace Navigation, Alerts, Stock Quote/Technical IA, and News/Videos cards.

## Sprint Summary

- Sprint 2B:
  - Stock workspace mock compliance merged.
  - Mobile/Home mock compliance merged.
  - Governance workbook and Markdown source of truth created.
  - Sprint 2C UAT failures and planned work captured.
- Sprint 2C:
  - Fix critical interaction failures.
  - Compress oversized mobile UI.
  - Expand technical intelligence.
  - Refactor Company and Videos tabs.
  - Stabilize Notification Center.
  - Improve performance smoothness.
  - Create mobile correction mock pack before final UI implementation.
  - Lock design-system governance and mock-first workflow before additional UI implementation.

## Current Sprint Priorities

- Design governance:
  - Mock-first development is mandatory.
  - Store reviewed and approved mocks under `docs/design-system/mocks/`.
  - Every UI change must reference an approved mock, design-system rule, mobile-first principle, and changelog entry.
  - Portfolio Snapshot redesign is blocked until an approved mobile mock exists.
- Interaction stabilization:
  - Fix Home widget clickability.
  - Fix Market Pulse swipe gestures.
  - Fix Release Center routing mismatch.
- Mobile density refinement:
  - Reduce oversized cards.
  - Keep controls thumb-friendly.
  - Preserve compact executive scanning.
- Technical intelligence expansion:
  - Add support/resistance levels.
  - Add AI interpretation.
  - Add trade scenarios.
  - Add confidence meter.
  - Add multi-timeframe modes.
- Company research hub:
  - Merge Earnings, Financials, Ratios, and Targets into Company.
  - Keep Company readable and research-oriented.
- Notification Center:
  - Build mobile-safe sheet behavior.
  - Group notifications by category.
  - Use premium stacked cards and clear category identities.
- Scanner compression:
  - Use compact filter chips.
  - Remove oversized sort controls.
  - Move toward a mobile-first scanner rail.
- Performance optimization:
  - Reduce motion/render cost.
  - Remove avoidable layout jank.
  - Preserve smooth native-feeling interactions.

## Active Backlog

- P0 News UX V2:
  - Real article titles.
  - Exact article links.
  - PIA Digest.
  - Bias instead of Sentiment.
  - Confidence instead of Impact.
  - Possible Move instead of Sell the News.
  - Human-readable actions.
  - Demo badge only for mock data.
- P0 Mobile/Home:
  - Portfolio Snapshot redesign requires approved mobile mock before implementation.
  - Quick controls mobile sheet stabilized.
  - Bell and Notification Center mobile bottom sheet fixed.
  - Home widget pointer/click targets stabilized.
  - Market Pulse swipe gestures fixed.
  - Mobile correction mock pack created for PO review.
  - Keep mobile settings useful and visible.
- P1 Stock Intelligence:
  - Analyst Targets widget per stock.
  - Stock targets required per stock.
  - Technical Snapshot expansion. Sprint 2C HERMES implementation complete; live data integration remains.
  - Company Research Hub refactor. Sprint 2C HERMES implementation complete with placeholder-marked fundamentals.
  - Videos Experience rework. Sprint 2C HERMES implementation complete.
  - Intelligence card density refactor. Sprint 2C HERMES implementation complete for stock news cards.
  - Stock Quote / Technical IA mock created for PO review; final IA change not implemented yet.
- P1 Workspaces:
  - Watchlists add/remove/sort/company logo/mini charts.
  - Sector and industry heatmap.
  - Opportunity Board compression.
  - Trade Coach voice mode.
  - Academy workspace.
- P2 Platform:
  - Mock-first design governance system. DONE 2026-05-28.
  - Hybrid mock intelligence data layer. DONE 2026-05-28: backend/mock_intelligence_data.py deployed for NVDA, AMD, SOFI, IREN, AVAV, GOOGL, TSLA, CRWV, NBIS.
  - Cloud backup/restore.
  - Performance and storage efficiency.

## Open Critical Bugs

| Bug | Owner | Severity | Sprint | Note |
| --- | --- | --- | --- | --- |
| Release Center routing mismatch | HERMES | HIGH | 2C | FIXED 2026-05-28: explicit `#tool=about` routing prevents Academy restore |
| Market Pulse swipe broken | ATHENA | HIGH | 2C | FIXED 2026-05-28: pointer swipe, snap state, and touch behavior stabilized |
| Home widgets not clickable | ATHENA | CRITICAL | 2C | FIXED 2026-05-28: widget/card pointer targets and mobile stacking stabilized |
| Notification Center mobile failure | ARTEMIS | CRITICAL | 2C | FIXED 2026-05-28: mobile-safe bottom sheet, stacked cards, and fallback notifications added |
| Performance lag | ATHENA + HERMES | HIGH | 2C | PARTIAL 2026-05-28: reduced mobile blur/shadow/hover cost; deeper profiling remains |

## Locked UX Decisions

- Stock tabs are fixed as:
  1. Quote
  2. Technical
  3. News
  4. Company
  5. Videos
- Technical owns:
  - Support/resistance.
  - Trade scenarios.
  - AI interpretation.
  - Decision intelligence.
  - Confidence and timeframe modes.
- Company owns:
  - About.
  - Earnings.
  - Financials.
  - Key Ratios.
  - Targets.
- Videos owns:
  - YouTube-style previews.
  - Featured media.
  - Thumbnail hierarchy.
  - Intelligence discovery.

## Mobile-first UX Principles

- One-hand usability is mandatory.
- Compact density beats oversized presentation cards.
- No oversized cards on mobile intelligence, scanner, or notification surfaces.
- Optimize for institutional scanning: fast comparison, strong hierarchy, minimal fluff.
- Interactions should feel native: swipe, sheets, rails, toggles, and bottom navigation must behave predictably.
- Use IBKR-inspired ergonomics: dense controls, immediate status, restrained visuals, and low-friction navigation.
- No horizontal overflow.
- No clipped text.
- No raw text blocks where structured cards, badges, chips, or rows are expected.

## UAT Memory

- Required before release:
  - `npm run build`
  - `/` route returns 200.
  - `/mobile` route returns 200.
  - `/setup` route returns 200.
  - Privacy toggle works and persists.
  - Mobile loads without horizontal overflow.
- Current failed UAT:
  - None for HERMES stock workspace scope after 2026-05-28 validation.
- Latest Sprint 2C validation, 2026-05-28:
  - `npm run build` passed.
  - `/` route returned 200.
  - `/mobile` route returned 200.
  - `/setup` route returned 200.
  - Privacy mode masking preserved in touched mobile and dashboard surfaces.
  - Market Pulse swipe, notification bell sheet, compact scanner controls, and mobile wrapping stabilized in implementation.
- Latest Sprint v0.3.6 validation, 2026-05-28:
  - `npm run build` passed (frontend).
  - All 9 tickers (NVDA, AMD, SOFI, IREN, AVAV, GOOGL, TSLA, CRWV, NBIS) return complete intelligence structure from mock layer.
  - IREN position and AVAV/TSLA watchlist items process correctly through portfolio snapshot and opportunity engine.
  - Backend Python imports clean; no route regressions.
- Remaining failed UAT:
  - Mobile correction mock pack requires Product Owner review before final UI implementation.
  - Mobile performance lag requires deeper device profiling after first-pass render-cost reduction.

## Agent Task Queue

- HERMES:
  - DONE 2026-05-28: Create Stock Quote / Technical IA and News/Videos mobile correction mocks.
  - DONE 2026-05-28: Fix Release Center routing mismatch.
  - DONE 2026-05-28: Refactor Company tab into research hub.
  - DONE 2026-05-28: Refine Technical tab into trade-entry decision workflow.
  - DONE 2026-05-28: Move Videos last and rework as media-first research feed.
  - PARTIAL 2026-05-28: Help reduce mobile performance lag.
- ATHENA:
  - DONE 2026-05-28: Create Mobile Portfolio Snapshot, Position Full Screen, Workspace Navigation, and Alerts mocks.
  - DONE 2026-05-28: Fix Market Pulse swipe gestures.
  - DONE 2026-05-28: Fix Home widget clickability.
  - DONE 2026-05-28: Compress mobile scanner and sort controls.
  - PARTIAL 2026-05-28: Help reduce mobile performance lag.
- ARTEMIS:
  - DONE 2026-05-28: Refactor Notification Center into a mobile-safe grouped sheet.
- HEPHAESTUS + APOLLO:
  - DONE 2026-05-28: Create backend/mock_intelligence_data.py with Bloomberg-lite mock data for NVDA, AMD, SOFI, IREN, AVAV, GOOGL, TSLA, CRWV, NBIS.
  - DONE 2026-05-28: Integrate mock company, fundamentals, targets, technical levels into stock intelligence response.
  - DONE 2026-05-28: Add IREN to DEMO_POSITIONS; add AVAV and TSLA to WATCHLIST.
  - DONE 2026-05-28: Make portfolio daily P/L dynamic; enrich catalyst calendar and news items.
- Future:
  - Create Product Owner-reviewed mobile mock for Portfolio Snapshot before redesign.
  - News UX V2.
  - Analyst Targets widget.
  - Unified Intelligence Feed: Yahoo, Discord, Seeking Alpha, Reuters, PIA, X, IBKR.

## Architecture Decisions

- Preserve existing architecture and routes.
- Everything is a widget.
- Reuse current dashboard widgets; do not create duplicate pages/widgets.
- Mobile customization uses the same workspace/widget registry direction.
- Local layout storage remains local-first and keyed by workspace ID.
- TradingView remains the planned shared chart widget.
- AI Core uses workspace redirect mode through short workspace context.
- Integrations and health live inside Settings, while compact source status may surface in the shell.
- No backend/API contract changes for visual compliance work unless explicitly scoped.
- Locked stock tab order: Quote, Technical, News, Company, Videos.
- Company tab absorbs Earnings, Financials, Ratios, and Targets.
- Technical tab owns trading decision intelligence.
- Videos tab must be media-first.
- Notification Center must be mobile-safe and grouped.
- Release Center uses explicit tool hash routing (`#tool=about`) so persisted workspace state cannot reopen Academy.
- Mock-first development is mandatory for every widget, screen, workspace, navigation change, or major UI refactor.
- Approved mocks must be stored in `docs/design-system/mocks/`.
- No developer may redesign freely without an approved mock reference.
- Every UI change must reference an approved mock, design-system rule, mobile-first principle, and changelog entry.
- Portfolio Snapshot must be redesigned only after an approved mobile mock.
- Mobile correction mock pack is the required gate before final UI corrections for Portfolio Snapshot, Position Full Screen, Workspace Navigation, Alerts, Stock Quote/Technical IA, and News/Videos cards.

## PM Operating Model

When user says "Καλημέρα PIA", assistant must:

1. Read `docs/PIA_MASTER_BACKLOG_SOURCE_OF_TRUTH.md`.
2. Review Current Active State, Sprint Summary, Active Backlog, Open Critical Bugs, UAT Memory, Agent Task Queue, Architecture Decisions, and CHANGELOG.
3. Brief user with:
   - What we completed yesterday.
   - Current status.
   - Risks/blockers.
   - Recommended priorities for today.
   - Recent release/changelog summary.
4. After approved implementation, update:
   - Backlog.
   - Project status.
   - UAT memory.
   - Agent queue.
   - CHANGELOG.

## Agent Workflow Rules

- Read this source-of-truth before governance, sprint planning, or "Καλημέρα PIA" briefings.
- Keep Markdown compact, operational, and readable in Git.
- Keep XLSX as the PM operational database.
- Keep MD and XLSX synchronized after approved implementation.
- Do not duplicate backlog entries.
- Do not turn this file into verbose process documentation.
- Do not commit `.next`, sqlite files, pycache, package-lock changes, or Office lock files unless explicitly required.
- Follow `docs/design-system/00_READ_ME_FIRST.md` before UI implementation.
- Mock-first development is mandatory for UI work.
- Do not implement widget, screen, workspace, navigation, or major refactor changes without an APPROVED mock unless the work is documentation-only, test-only, or non-visual bug repair.

## AUTONOMOUS EXECUTION RULE (MANDATORY)

- Senior developers must execute autonomously.
- Do not ask repeated confirmations.
- Do not ask micro-questions.
- Do not stop for obvious implementation choices.
- Read MD/XLSX first.
- Update backlog, UAT, changelog after implementation.
- Commit and push when validation passes.
- Developers may stop only for:
  - Destructive changes.
  - Force push.
  - Data deletion.
  - Schema-breaking change.
  - Conflicting product direction.
  - Missing external credentials/API access.

## TRUSTED SENIOR DEVELOPER MODE (MANDATORY)

PIA developers operate as trusted senior autonomous engineers.

They must NOT interrupt the user for safe, read-only, local validation, or normal development commands.

Auto-approved command categories:

- `git status` / `git diff` / `git log`.
- File reads and searches.
- `Select-String` / `Get-Content` / `dir` / `ls`.
- Process inspection.
- `Get-Process` / `Get-CimInstance` / `Get-NetTCPConnection`.
- Local runtime start/restart.
- `npm run dev`.
- `python -m uvicorn`.
- Localhost route checks.
- `npm run build`.
- Non-destructive diagnostics.

They may ask only for:

- Destructive file deletion.
- `git reset --hard`.
- Force push.
- Database destructive migration.
- Credential/secret changes.
- Production deploy.
- Irreversible actions.
- Conflicting product direction.

Default behavior:

- If action is local, non-destructive, and required for validation, proceed autonomously.

## Release Governance

- Every approved sprint or merge must update CHANGELOG.
- No integration merge is considered complete until CHANGELOG is updated.
- Required release checks stay in UAT Memory.
- Integration commits must preserve product continuity, route integrity, and privacy mode.

## Version History

- v0.1.0: Initial PIA dashboard and setup continuity baseline.
- v0.2.0: Sprint 2B stock workspace, mobile/Home direction, and governance source of truth.
- v0.3.0: Sprint 2C governance/memory foundation, changelog rule, PM operating model, and XLSX database consolidation.
- v0.3.1: Sprint 2C mobile stabilization for swipe, notification sheet, scanner density, and first-pass performance smoothing.
- v0.3.2: Sprint 2C stock workspace intelligence refinement and Release Center routing fix.
- v0.3.4: Mobile correction mock pack for Product Owner review.
- v0.3.5: Mock-first design governance system and locked design-system documentation.
- v0.3.6: Hybrid mock intelligence data layer for UI evaluation across 9 tickers.
- v0.3.7: Portfolio dual view mode — Terminal Table + Swipe Cards with localStorage persistence.

## Guardrails

- Do not rewrite architecture.
- Do not remove working routes or widgets.
- Do not remove privacy mode.
- Do not add duplicate widgets/pages.
- Do not redesign UI without approved mock reference.
- Do not redesign Portfolio Snapshot before approved mobile mock.
- Do not commit `.next`, sqlite files, pycache, package-lock changes, or Office lock files unless explicitly required.
- Always validate route integrity and responsive behavior before release.

## CHANGELOG

### v0.3.7 - Portfolio Dual View Mode
Date: 2026-05-28
Status: Implemented and validated.

## Added:

- Mobile (`MobileExperience.tsx`): `Table | Cards` view toggle for the Portfolio section with localStorage persistence (`pia.portfolioView.mobile`).
- `MobilePortfolioTable`: IBKR-style compact terminal table with sortable column headers (Symbol, Price, Chg%, Unrlzd, Wt%, Risk), horizontal scroll, compact row density, and portfolio totals footer row.
- Improved `PositionCards` (mobile): brand/accent color top border from position data; unrealized P/L row added to each card.
- Desktop (`Dashboard.tsx`): `Table | Cards` toggle (renamed from `List | Card`) with localStorage persistence (`pia.portfolioView.desktop`).
- Desktop `PositionsTable`: sortable column headers — Symbol, Qty, Mkt Value, Unrlzd, Day P/L, % Port. Day P/L column added.
- Desktop `PositionCards`: brand/accent color CSS variable hook (`--pos-brand`) applied from position data.
- CSS: `.portfolio-view-toggle`, `.mobile-terminal-table`, `.mtt-*`, `.mobile-position-pnl`, `.mobile-terminal-totals`, `th.col-sorted`, `.position-card.accented` added.

## Design principle preserved:

- Portfolio supports both operational terminal scanning (Table) and premium visual card exploration (Cards).
- Neither view is removed — both are first-class.
- Cards are future-ready: CSS variable `--pos-brand` / `--pos-accent` are the hooks for color theme variants.
- Table column headers follow IBKR-style locked UX principle: sorting via column headers, not dropdown-only.

## Known limitations:

- Sparklines in mobile cards use fallback data (no live intraday feed yet).
- Desktop Day P/L column displays `$0.00` for positions without `day_pnl` in fallback data.

### v0.3.6 - Hybrid Mock Intelligence Data Layer
Date: 2026-05-28
Status: Implemented and validated.

## Added:

- `backend/mock_intelligence_data.py`: Bloomberg-lite mock data for NVDA, AMD, SOFI, IREN, AVAV, GOOGL, TSLA, CRWV, NBIS.
- Per-ticker data: company profile (description, sector, industry, HQ, CEO, employees, exchange), financials (revenue, net income, EBITDA, FCF, margins), key ratios (PE, forward PE, PEG, EV/EBITDA, ROE, D/E, FCF yield), earnings (EPS estimate vs actual, surprise %, next date), analyst targets (consensus, bull, base, bear, upside/downside), and technical levels (support_1/2/3, resistance_1/2/3).
- Mock overview hints (why_moving, AI view) replace placeholder text in stock intelligence responses.
- IREN (Iris Energy, 300 shares @ $10.50 avg) added to DEMO_POSITIONS.
- AVAV (AeroVironment) and TSLA (Tesla) added to WATCHLIST.

## Changed:

- `backend/services/stock_intelligence.py`: now merges mock company, fundamentals, targets, and technical levels into the `/stock/{ticker}` intelligence response.
- `backend/services/state.py`: portfolio daily P/L is now dynamically computed from positions; catalyst calendar enriched with AMD, AVAV, SOFI events; news items expanded with IREN.
- `backend/main.py`: analyze endpoint recognizes AVAV and TSLA tickers.

## Data Rule:

- Mock data: portfolio positions, fundamentals, analyst targets, technical levels, earnings estimates, ratios, trade decision scenarios.
- Live/preserved: Yahoo RSS news, video search links, source health, backend-supported feed endpoints.

## Known limitations:

- Mock prices are calibrated to 2026-05-28 session values and do not update intraday (live IBKR or Yahoo chart endpoint needed for real-time prices).
- Tickers not in MOCK_STOCK_DB gracefully fall back to derived/placeholder values in the frontend.

### v0.3.5 - Mock-First Design Governance System
Date: 2026-05-28
Status: Governance locked before further UI implementation.

## Added:

- Design-system documentation folder at `docs/design-system/`.
- Mock storage folders for mobile, desktop, portfolio, stock workspace, navigation, alerts, and scanner mocks.
- Mandatory mock-first development workflow.
- Portfolio Snapshot redesign gate requiring approved mobile mock.

## Changed:

- UI implementation governance now requires every UI change to reference an approved mock, design-system rule, mobile-first principle, and changelog entry.
- Developers may not redesign freely without approved mock reference.

## Known limitations:

- Mock folders are governance-ready placeholders until Product Owner-reviewed mock assets are added and marked APPROVED.

### v0.3.4 - Mobile Correction Mock Pack
Date: 2026-05-28
Status: Mock specs created for Product Owner review; final UI not implemented.

## Added:

- Design-system read-first and governance docs under `docs/design-system/`.
- Mobile correction mock pack under `docs/design-system/mocks/mobile/`.
- Mock specs for Mobile Portfolio Snapshot, Mobile My Position Full Screen, Mobile Workspace Navigation, Mobile Alerts / Notifications, Stock Quote / Technical IA, and News / Videos Cards.

## Changed:

- Captured the proposed Stock Quote / Technical IA direction as a mock-only Product Owner review item.
- Documented bottom navigation limit of five pinned workspaces with overflow workspaces in top-right menu.
- Documented no-Open-button behavior for News and Videos cards.

## Known limitations:

- These are specs only; final UI implementation is intentionally deferred until Product Owner approval.
- Exact live data fields, thumbnail availability, and later workspace pin customization remain implementation-phase decisions.

### v0.3.3 - Trusted Senior Developer Mode
Date: 2026-05-28
Status: Governance update.

## Added:

- Trusted Senior Developer Mode for safe local validation and normal development command autonomy.

### v0.3.2 - Sprint 2C Stock Workspace Intelligence Refinement
Date: 2026-05-28
Status: Implemented and locally validated.

## Added:

- Locked stock workspace tabs: Quote, Technical, News, Company, Videos.
- Technical trade decision workflow with support/resistance levels, distance from current price, strength score, trade implication, entries, invalidation, take-profit zones, risk/reward notes, AI summary, confidence meter, and Intraday/Swing/Position modes.
- Company hub sections for About, Earnings, Financials, Key Ratios, and Targets.
- Placeholder/mock marking for fundamentals and analyst targets where live data is not connected.
- Media-first Videos tab with featured preview, thumbnails, source/creator, duration, and why-it-matters notes.
- Compact expandable stock news summaries.

## Changed:

- Removed extra stock tabs for Targets, Scenarios, and Actions; their research context now lives in Technical or Company.
- Moved Videos to the final stock tab.
- Release Center navigation now uses explicit `#tool=about` routing.
- Stock intelligence CSS now favors compact mobile-first grids and overflow-safe cards.

## Fixed:

- Release Center no longer reopens the persisted Academy workspace when launched from settings.

## Known limitations:

- Company fundamentals and analyst targets remain placeholder/mock where live provider data is unavailable.
- Technical levels are derived from current source fields and fallback calculations until a dedicated technical data source is connected.
- Browser console/hydration checks were covered by `next build` and route smoke checks; no interactive browser console was available in this environment.

### v0.3.1 - Sprint 2C Mobile Stabilization
Date: 2026-05-28
Status: Mobile-critical interaction stabilization implemented and route validation passed.

## Added:

- Mobile Notification Center fallback notifications for offline or empty portfolio data.
- Mobile-safe notification category labels and stacked card layout.

## Changed:

- Market Pulse and shared mobile rails now use pointer capture, nearest-slide snapping, and active-dot state stabilization.
- Notification Center and Quick Controls use a higher-priority, native-feeling bottom sheet on small mobile viewports.
- Scanner and Opportunity Board sort controls were compressed into compact chip rails.
- Mobile visual cards, bottom nav, and sheets reduce heavy blur/shadow layers on small screens.
- Home widget/card pointer targets and stacking context were tightened to prevent dead controls.

## Fixed:

- Home widgets not clickable.
- Market Pulse swipe broken.
- Notification Center invisible/broken on mobile.
- Notification cards wrapping poorly on mobile.
- Oversized scanner sorting controls.
- First-pass mobile stutter from avoidable hover, blur, and shadow cost.

## Known limitations:

- Release Center routing mismatch fixed in v0.3.2.
- Mobile performance received first-pass smoothing; real-device profiling remains recommended.
- Existing unrelated local edits in stock intelligence/settings files were not touched by this stabilization pass.

### v0.3.0 — Sprint 2C
Date: 2026-05-27
Status: Governance and memory foundation finalized; Sprint 2C execution ready.

## Added:

- AI memory engine role for this Markdown file.
- PM operational database role for the XLSX workbook.
- PM Operating Model for "Καλημέρα PIA".
- Agent Workflow Rules.
- Release Governance.
- Product Philosophy.
- Version History.
- Current Sprint Priorities.

## Changed:

- Consolidated governance into a compact operational source-of-truth.
- Normalized canonical workbook path to `docs/PIA_MASTER_BACKLOG_SOURCE_OF_TRUTH.xlsx`.
- Clarified that MD and XLSX must remain synchronized.

## Fixed:

- Restored canonical XLSX presence after the workbook existed as `PIA_MASTER_BACKLOG_SOURCE_OF_TRUTH.xlsx.xlsx`.
- Replaced mojibake PM greeting text with `Καλημέρα PIA`.

## Known limitations:

- `PIA_MASTER_BACKLOG_SOURCE_OF_TRUTH_MERGED.xlsx` was not found in the workspace; the available merged workbook candidate was validated and renamed to the canonical XLSX path.
- Release Center routing mismatch remains open.
- Market Pulse swipe remains broken.
- Home widgets are not clickable.
- Notification Center mobile failure remains open.
- Mobile performance lag remains open.

### v0.2.0
Date: 2026-05-27
Status: Sprint 2B integrated; Sprint 2C planning active.

Added:

- Master backlog source-of-truth Markdown and workbook.
- Sprint 2C UAT failure list and ownership.
- Locked stock workspace structure.
- Changelog governance and PM briefing model.

Changed:

- Markdown source of truth rewritten as compact operational memory.
- Sprint 2B stock workspace and mobile/Home UX direction merged into integration.

Fixed:

- Integration branch contains merged governance, stock workspace, and mobile/Home direction updates.

Known limitations:

- Release Center routing mismatch remains open.
- Market Pulse swipe remains broken.
- Home widgets are not clickable.
- Notification Center mobile failure remains open.
- Mobile performance lag remains open.
