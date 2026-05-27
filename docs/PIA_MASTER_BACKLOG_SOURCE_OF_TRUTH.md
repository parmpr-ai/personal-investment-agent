# PIA Master Backlog Source Of Truth

Status: Active AI memory engine
Last updated: 2026-05-27
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
- Current sprint: Sprint 2C planning and UAT failure remediation.
- Current status: governance/memory foundation consolidated.
- Current priorities:
  - Interaction stabilization on Home and mobile.
  - Mobile density refinement across cards, scanner rails, and intelligence surfaces.
  - Stock workspace expansion around Technical, Company, News, and Videos.
  - Notification Center refactor for mobile-safe visibility.
  - Performance smoothing for motion/render cost.

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

## Current Sprint Priorities

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
  - Fix quick controls.
  - Fix bell and Notification Center.
  - Fix widget clickability.
  - Fix swipe gestures.
  - Keep mobile settings useful and visible.
- P1 Stock Intelligence:
  - Analyst Targets widget per stock.
  - Stock targets required per stock.
  - Technical Snapshot expansion.
  - Company Research Hub refactor.
  - Videos Experience rework.
  - Intelligence card density refactor.
- P1 Workspaces:
  - Watchlists add/remove/sort/company logo/mini charts.
  - Sector and industry heatmap.
  - Opportunity Board compression.
  - Trade Coach voice mode.
  - Academy workspace.
- P2 Platform:
  - Cloud backup/restore.
  - Performance and storage efficiency.

## Open Critical Bugs

| Bug | Owner | Severity | Sprint | Note |
| --- | --- | --- | --- | --- |
| Release Center routing mismatch | HERMES | HIGH | 2C | Opens Academy incorrectly |
| Market Pulse swipe broken | ATHENA | HIGH | 2C | Swipe gestures failing |
| Home widgets not clickable | ATHENA | CRITICAL | 2C | Likely pointer-events/z-index issue |
| Notification Center mobile failure | ARTEMIS | CRITICAL | 2C | Broken wrapping and invisible mobile state |
| Performance lag | ATHENA + HERMES | HIGH | 2C | Mobile stutter from motion/render cost |

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
  - Release Center routing mismatch.
  - Market Pulse swipe broken.
  - Home widgets not clickable.
  - Notification Center mobile failure.
  - Mobile performance lag.

## Agent Task Queue

- HERMES:
  - Fix Release Center routing mismatch.
  - Refactor Company tab into research hub.
  - Help reduce mobile performance lag.
- ATHENA:
  - Fix Market Pulse swipe gestures.
  - Fix Home widget clickability.
  - Compress mobile scanner and intelligence card density.
  - Help reduce mobile performance lag.
- ARTEMIS:
  - Refactor Notification Center into a mobile-safe grouped sheet.
- Future:
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

## Release Governance

- Every approved sprint or merge must update CHANGELOG.
- No integration merge is considered complete until CHANGELOG is updated.
- Required release checks stay in UAT Memory.
- Integration commits must preserve product continuity, route integrity, and privacy mode.

## Version History

- v0.1.0: Initial PIA dashboard and setup continuity baseline.
- v0.2.0: Sprint 2B stock workspace, mobile/Home direction, and governance source of truth.
- v0.3.0: Sprint 2C governance/memory foundation, changelog rule, PM operating model, and XLSX database consolidation.

## Guardrails

- Do not rewrite architecture.
- Do not remove working routes or widgets.
- Do not remove privacy mode.
- Do not add duplicate widgets/pages.
- Do not commit `.next`, sqlite files, pycache, package-lock changes, or Office lock files unless explicitly required.
- Always validate route integrity and responsive behavior before release.

## CHANGELOG

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
