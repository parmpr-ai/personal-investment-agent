# PIA Master Backlog Source Of Truth

Status: Active AI memory engine
Last updated: 2026-06-23
Branch: `feat/pia-v3-foundation-integration`

This Markdown is the canonical readable operating memory for PIA. The Excel workbook is the PM operational database. Both must stay synchronized after every approved sprint, merge, or implementation.

## Product Philosophy

PIA is a premium, mobile-first investment command platform. It should feel institutional, compact, dark, glass/neon, and optimized for fast scanning across Home, mobile, portfolio intelligence, and stock workspaces.

- Not a generic admin panel.
- Not a crypto toy dashboard.
- Not a static report.
- Must preserve working routes, widgets, privacy mode, and responsive behavior.
- Must prioritize IBKR-inspired ergonomics: dense controls, immediate status, restrained visuals, low-friction navigation.

## AUTONOMOUS EXECUTION RULE (MANDATORY)

- Senior developers must execute autonomously.
- No repeated confirmations.
- No micro-questions.
- No stopping for obvious implementation choices.
- Read MD/XLSX first.
- Update backlog, UAT, and changelog after implementation.
- Commit and push when validation passes.

Developers may stop only for:
- destructive changes
- force push
- data deletion
- schema-breaking change
- conflicting product direction
- missing external credentials/API access

## Current Active State

- Active branch: `feat/pia-v3-foundation-integration`
- Stable checkpoint: Sprint 2B implementation branches merged into integration.
- Current sprint: Sprint 2C execution and UAT failure remediation.
- Current status: Hybrid mock intelligence data layer deployed for UI evaluation; design governance and mock-first workflow locked; mobile correction mock pack available for Product Owner review.
- Current status: IBKR live portfolio modes are synchronized across settings, provider status, portfolio endpoints, and mobile/desktop source badges. Mock, last-update, and live modes are persisted and validated; live snapshots persist locally under `backend/data/snapshots/ibkr/`, with history persisted under `backend/data/snapshots/ibkr/history/` and strict last-update/disconnected reporting when the gateway is offline.
- Current priorities:
  - Enforce mock-first design governance before any further UI implementation.
  - Interaction stabilization on Home and mobile.
  - Mobile density refinement across cards, scanner rails, and intelligence surfaces.
  - Stock workspace expansion around Technical, Company, News, Videos, and Analyst Targets. Analyst Targets V2 completed for HERMES scope.
  - Notification Center refactor for mobile-safe visibility.
  - Performance smoothing for motion/render cost.
- Mobile correction mock review for Portfolio Snapshot, Position Full Screen, Workspace Navigation, Alerts, Stock Quote/Technical IA, and News/Videos cards.
- IBKR live portfolio correctness and 3-mode portfolio selection resolved; validate Product Owner review of the new UAT screenshots at `frontend/uat-screenshots/pia-ibkr-live-007/`.
- HERMES-IBKR-UAT-009 hardens live status evaluation, duplicate detection, option normalization, and snapshot history. Offline validation confirms no mock leakage when live mode falls back to last-update.
- HERMES-PORTFOLIO-ASSETCLASS-001 extends the portfolio model with explicit `assetClass` normalization for stock, option, and crypto across mock, snapshot, live, and manual positions.
- HERMES-LIVE-POSITION-METRICS-MAPPING-036 removes fake day metric / score defaults from live stock surfaces, preserves AI-risk provenance, and aligns stock hero quote reads with the live portfolio quote cache.
- HERMES-RESEARCH-DATA-AND-LIVE-CONTRACT-040 restores explicit research section missing states, hardens live quote / metric contracts, and prevents null risk guards from crashing live portfolio routes.
- HERMES-MOBILE-LIVE-REFRESH-BLINK-041 stabilizes mobile live refresh by preserving dashboard and portfolio identity across polls, memoizing the portfolio view shell, and preventing mock fallback flashes during live updates. Build passed; PO UAT pending.
- HERMES-LIVE-QUOTES-037 ties the stock hero and AI context consumers to the live dashboard quote seed, so held symbols follow the same live quote source as the position table and debug live-quotes contract.

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
- IBKR live portfolio correctness:
  - Keep `mock`, `last-update`, and `ibkr-live` mode resolution aligned across settings, provider status, and portfolio endpoints.
  - Preserve local live snapshots and prevent mock rows from appearing in live or last-update modes.

## Active Backlog

- EPIC AI Intelligence — Compact V3 delivery milestone (2026-06-22): premium compact widget + card customization + semantic tone engine shipped. Design locked (DEC-AI-CV3).
  - ARTEMIS-AI-COMPACT-REDESIGN-001 — AiIntelligenceCompactV3 premium compact widget. IMPLEMENTED (ARTEMIS, 1b7d426): 3 rows × 4 cards, 2.2 visible cards per row; no Last Updated, no score badge, no dots/arrows.
  - CR-AI-COMPACT-REDESIGN-002 — Card customization (show/hide, drag reorder, three-dot Customize AI Cards sheet, persisted). IMPLEMENTED (ARTEMIS, 3887882).
  - CR-AI-COMPACT-REDESIGN-003 — Semantic tone engine (tone → border/glow/chart stroke; High=red, Low=green; BUY may contain red cards). IMPLEMENTED (ARTEMIS, 3887882).
  - CR-AI-COMPACT-V3-UAT — UAT PASS decision PENDING (APOLLO/PO): NVDA BUY / NBIS HOLD / AAPL HOLD widget+customize screenshots at 390/430 under frontend/uat-screenshots/cr-ai-compact-v3-cr002/.
- EPIC AI Intelligence V2 — Release Candidate (pending UAT) — 2026-06-22 (ATHENA-GOV-021). Backend 98% / Frontend 80% / Overall 92–93%. Blockers: CR-AI-011 visual parity, real endpoint wiring, final UAT.
  - HERMES-AI-005 Shared Intelligence Context Layer — COMPLETE/Accepted (HERMES): context aggregation, context endpoints, validation suite, coverage validation.
  - HERMES-AI-006 Cache + Freshness + Frontend Contract Lock — COMPLETE/Accepted (HERMES): cache policy, source freshness metadata, frontend contract lock, example payloads, contract validation, lightweight contract mode. Perf: warm 6ms compact / 9ms expanded; cold AAPL 2822 / NVDA 2446 / AMD 1919 / TSM 1924 / PLTR 1887 ms.
  - ARTEMIS-AI-011 AI Intelligence V2 full implementation (Compact + Expanded) — IN PROGRESS (ARTEMIS, commits 4982058/32a7814/8a1b579).
  - CR-AI-011 Visual parity (expanded V2 UX fixes + compact overflow) — OPEN (ARTEMIS, e67952f); release blocker.
  - HERMES-AI-007 Parallel Context Hydration — BACKLOG P2 (cold 1.9–2.8s → target <1.5s).
  - CR-HERMES-006-01 Contract Versioning (schemaVersion/contractVersion in frontendPayload) — BACKLOG P3.
  - Decisions: DEC-AI-009/010/011 LOCKED. Design tracker: AI_INTELLIGENCE_COMPACT_V2_DESIGN_SPEC.md (stub — see DESIGN-LOCK-002).
- EPIC AI Intelligence V3 — Research / Provenance — 2026-06-22 (ATHENA-GOV-022). Backend Research contract COMPLETE; frontend Research V2 implemented but Design Lock INVALID (approved mock missing).
  - HERMES-AI-V3-001 Research Backend Gap Analysis — COMPLETED (HERMES): coverage matrix (9 sections), data-source mapping, proposed contract, provider gaps, thesis-only constraint. Artifact: docs/HERMES-AI-V3-001_RESEARCH_BACKEND_GAP_ANALYSIS.md.
  - HERMES-AI-V3-002 Research Endpoint V1 — COMPLETED (HERMES): backend/services/ai_research.py + GET /api/intelligence/{symbol}/research; thesis-only; null/status placeholders. Perf p50 9.93ms / p95 11.86ms.
  - HERMES-AI-V3-003 Research Provenance & Real Data Upgrade — COMPLETED (HERMES): schema V3.0, ResearchMetric + section provenance, competitiveComparison shouldRender=false when no provider, auditable null placeholders. Perf p50 12.12ms / p95 17.29ms (< 500/1000ms requirement).
  - CR-AI-V3-UI-001 Overview/Compact/Expanded Hero corrections — CLOSED (ARTEMIS, 89bad3a): C1–C3, E1–E7, S1–S2 (removed case badge, hero sizing/alignment, risk label, Section Header Standard V1, 390/360 breakpoints).
  - ARTEMIS-AI-V3-RESEARCH-003 Research V2 final implementation — IMPLEMENTED (ARTEMIS, 8657868 + proxy b056bc1) but **Design Lock INVALID** — approved mock `research-approved.png` MISSING; blocked for UAT until asset committed.
  - EPIC-AI-RESEARCH-V2 (IN PROGRESS), EPIC-AI-PROVENANCE (backend complete, frontend pending), EPIC-AI-COMPETITIVE-COMPARISON (backlog — needs real peer provider).
  - Bugs: BUG-HERMES-AI-007-AMD-MATERIAL-NEWS (OPEN P2), BUG-AI-RESEARCH-COMPETITIVE-DATA-MISSING (KNOWN GAP), BUG-AI-RESEARCH-PROVIDER-GAPS (KNOWN GAP).
- **GOV-022-RESEARCH-MOCK-MISSING (P0, OPEN):** archive + commit the approved Research mock and add RESEARCH_DESIGN_SPEC.md to validate the Research V2 Design Lock (DEC-AI-RESEARCH-005 reference currently broken).
  - HERMES-IBKR-LIVE-007 - IBKR live portfolio correctness and 3-mode portfolio selection. IMPLEMENTED/VALIDATED (HERMES, feat/pia-v3-foundation-integration): provider modes `mock`, `last-update`, `ibkr-live`; live snapshot persistence to `backend/data/snapshots/ibkr/`; deduped live positions; desktop/mobile source badges updated; UAT screenshots captured under `frontend/uat-screenshots/pia-ibkr-live-007/`.
  - HERMES-IBKR-UAT-009 - IBKR live data correctness, source switching, option handling, snapshot history, and status reporting. IMPLEMENTED/LOCAL PASS (HERMES, feat/pia-v3-foundation-integration): strict LIVE / LAST_UPDATE / DISCONNECTED reporting, no silent mock fallback, option normalization, duplicate SOFI/options dedupe, `backend/data/snapshots/ibkr/history/` history log, `/api/portfolio/history`, and shared source fields across provider/status/portfolio routes. Live gateway validation remains pending because the local Client Portal Gateway is offline in this environment.
  - HERMES-LIVE-POSITION-METRICS-MAPPING-036 - live position metrics and provenance hardening. IMPLEMENTED/LOCAL PASS (HERMES, feat/pia-v3-foundation-integration): day change / day P&L / day P&L% now derive from validated quote fields, momentum and risk are sourced from cached AI intelligence when available and otherwise marked missing, news score stays null until real scoring exists, and stock hero / AI context prefer the live portfolio quote cache.
  - HERMES-RESEARCH-DATA-AND-LIVE-CONTRACT-040 - research data and live contract hardening. IMPLEMENTED/LOCAL PASS (HERMES, feat/pia-v3-foundation-integration): `/api/intelligence/{symbol}/research` returns explicit missing sections/provenance, live portfolio positions expose metricStates / missingMetrics for blank values, and null-safe risk handling prevents live route crashes.
- ATHENA-AI-001 AI Intelligence Architecture & Documentation Consolidation. IMPLEMENTED 2026-06-17 (ATHENA): Architecture document created at `docs/architecture/AI_INTELLIGENCE_ARCHITECTURE.md`. All 9 AI Intelligence subsystems captured: AI Intelligence V2, AI Engine, Portfolio Fit Engine, Position Intelligence, Opportunity Radar, Analyst Verdict Engine, News Intelligence, Investor Bot, Auto Investor. Changelog and UAT Tracking synchronized.
- EPIC-AI-INTELLIGENCE-ENGINE-001 Explainable Multi-Source Investment Intelligence Engine. IMPLEMENTED 2026-06-17 (HERMES): V1 backend scoring engine added for actionable stock verdict, portfolio-aware recommendation, expected return, conviction, thesis strength, risk, visual state, scenario probabilities, drivers/risks, score breakdown, factors evaluated, confidence notes, debug mode, and cache-backed `/api/intelligence/{symbol}/score`.
- ATHENA-AI-002 AI Engine — Full Scoring Pipeline. ROADMAP: Rules-based scoring for Momentum, Trend, Sentiment, Institutional, Fair Value, Risk metrics with sub-factor breakdowns. Requires metric score persistence layer (ATHENA-AI-003). Owner: ATHENA.
- ATHENA-AI-003 Metric Score Persistence Layer. ROADMAP: SQLite table for per-ticker metric score snapshots; enables Historical Evolution in Bottom Sheet and "What Changed" in Position Intelligence. Owner: ATHENA.
- ATHENA-AI-004 Portfolio Fit Engine. ROADMAP: Concentration + correlation + diversification benefit + opportunity score per candidate symbol vs live portfolio. Owner: ATHENA.
- ATHENA-AI-005 Position Intelligence. ROADMAP: Thesis memory (extend THESIS_STORE to SQLite with entry price/date), What Changed (metric delta vs entry), Thesis Health state machine, exit conditions, per-position verdict. Owner: ATHENA.
- ATHENA-AI-006 Opportunity Radar. ROADMAP: Ranked best opportunities, highest risks, diversification ideas, portfolio action queue. Foundation: scanner_items() and risk_doctor() exist. Owner: ATHENA.
- ATHENA-AI-007 Analyst Verdict Engine. ROADMAP: Consensus verdict, conviction score, target spread, analyst alignment with AI Engine signals. Foundation: Analyst Targets V3 implemented. Owner: ATHENA.
- ATHENA-AI-008 News Intelligence V2. ROADMAP: PIA Digest, Bias (not Sentiment), Confidence (not Impact), Possible Move, human-readable actions, Demo badge policy. Foundation: Yahoo RSS + news_intelligence endpoint implemented. Owner: ATHENA.
- ATHENA-AI-009 Investor Bot. ROADMAP: Conversational assistant for portfolio and market queries; intent router; context-injected (live portfolio + macro); privacy-mode masking; rule-based first, optional LLM layer. Owner: ATHENA.
- ATHENA-AI-010 Auto Investor. ROADMAP: Rules-based automated trade execution gateway via IBKR Client Portal Gateway; limit-order-only; dry-run default; guardrails (max order 5% portfolio, daily loss limit, auth required). Requires Investor Bot + Portfolio Fit Engine complete. Owner: ATHENA.
- IBKR-CR-002 - Replace legacy TWS Settings UI with Client Portal Gateway data source selector. IMPLEMENTED 2026-06-16 (HERMES): Settings -> Integrations -> IBKR now uses Client Portal Gateway copy, provider status from `/api/portfolio/provider/status`, Portfolio Data Source selector for Mock / Demo Samples / Live IBKR, fallback visibility, Test Client Portal Gateway action, and portfolio source badges.
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
- P1 Governance:
  - GOV-004-REMEDIATION (OPEN, ATHENA): normalize existing approved mocks to `APPROVED_<feature>_v<version>.png`; consolidate `docs/mocks` vs `docs/design-system/mocks`; resolve "AI Intelligence/mock v1.png" vs locked V2 version; backfill traceability triples. Non-compliant assets: AI Intelligence/mock v1.png; analyst-targets/Approved_mobile_mock_analyst_target.jpg; stock-intelligence/stock-intelligence-v1-approved.png; watchlists md. Created by PIA-GOV-004 (DEC-GOV-004 LOCKED).
- P0 Stock Intelligence:
  - CR-AI-010 AI Intelligence V2 Implementation. READY FOR IMPLEMENTATION (HERMES). Design LOCKED (PO-approved, 10/10): KPI cards, single bottom-sheet explainability, no-collapse policy, score vs directional KPI families (DEC-AI-001/002/003). V1 deprecated. Spec: docs/design-system/mocks/stock-workspace/ai-intelligence-widget-v2.md.
- P1 Stock Intelligence:
  - Analyst Targets V3 per stock (CR-AT-V3). IMPLEMENTED 2026-06-09 (HERMES): Options tab removed (tabs Overview/Chart/News/Financials/Analysis), chart only in Chart tab, fixed sticky header; Overview Bull/Base/Bear + target range (current + consensus markers) + consensus + analyst distribution; tap Overview card → Analysis > Analyst Targets; analyst history as mobile cards (no tables). Current data source only (no Finnhub/FMP). Commits 2b9d1de,5602655,ecbe06d,ac0ca6f through e5736e9.
  - Analyst Targets V2 per stock. DONE 2026-06-08: Overview card appears before News, emphasizes consensus upside/downside and dollar delta, taps into Analysis, and Analysis tab includes consensus/bull/bear targets, recommendation summary, analyst count, and analyst history empty state.
- P1 Portfolio Density Sprint (SPRINT-PORT-DENSITY). IMPLEMENTED 2026-06-09 (ATHENA): cards v2, card customization framework, grid + filters, 2x2 compact IBKR style, live price emphasis (dynamic color + tick pop), visual system v2 (larger logo / price hierarchy / 2x2 density), logo ring, portfolio view selector, mobile density pass + persistence validation. Commits 23bce57,54bf30e,b7c646f,6038934,edca406,5e8daca,72499e9,e5736e9.
- P1/P2 Open items from latest UAT + visual audit (2026-06-09):
  - PIA-UX-060 (Medium, ATHENA, OPEN): card logo still under-weighted as a visual anchor.
  - PIA-BUG-032 (Medium, ATHENA/Platform, OPEN): empty workspace preview widgets read as broken-premium.
  - PIA-CSS-001 (Medium, HERMES, OPEN): duplicated/overriding `.stock-intel-header` CSS; consolidate before V3 fixed header.
  - PIA-UX-061 (Low, PO decision, OPEN): Cards view discoverability — view mode buried in overflow menu.
  - Watchlist UAT carry-forward (OPEN): PIA-WL-008..014 (column switches, Open Chart target, Add-to-list, AI Coach, add-instrument UX, table sorting, columns).
  - Stock targets required per stock.
  - Technical Snapshot expansion. Sprint 2C HERMES implementation complete; live data integration remains.
  - Company Research Hub refactor. Sprint 2C HERMES implementation complete with placeholder-marked fundamentals.
  - Videos Experience rework. Sprint 2C HERMES implementation complete.
  - Intelligence card density refactor. Sprint 2C HERMES implementation complete for stock news cards.
  - Stock Quote / Technical IA mock created for PO review; final IA change not implemented yet.
- P0 Workspaces:
  - PIA-BUG-027 Custom workspaces lose widgets via `supportedWorkspaces` filtering. OPEN 2026-05-30. Owner ATHENA. Fix defined in PIA-ARCH-001-C final spec.
- P1 Workspaces:
  - Workspace Architecture Refactor (PIA-ARCH-001 / -B / -C). Final spec APPROVED 2026-05-30: docs/PIA_WORKSPACE_ARCHITECTURE_FINAL.md is the implementation source of truth.
  - Workspace Manager + custom workspaces. DONE 2026-05-28: mobile hamburger sheet and desktop sidebar manager share localStorage-backed workspace pins, visibility, order, and custom workspace definitions.
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
| PIA-BUG-027 Custom workspaces lose widgets | ATHENA | CRITICAL (P0) | Stabilization | OPEN 2026-05-30: `normalizeWorkspaceLayout` intersects saved widgets with `supportedWorkspaces`; custom `custom-*` ids match no catalog widget, so the supported set is empty and template-seeded widgets are filtered out. Fix per PIA-ARCH-001-C (demote `supportedWorkspaces` to a non-filtering hint). Spec: docs/PIA_WORKSPACE_ARCHITECTURE_FINAL.md |
| PIA-BUG-028 News Intelligence overflow | UNASSIGNED | HIGH (P1) | Stabilization | OPEN 2026-05-30: News Intelligence cards may overflow or clip text at desktop widths when action columns are dense. |
| PIA-UX-029 Stock Intelligence News Compact Redesign | UNASSIGNED | HIGH (P1) | Stabilization | OPEN 2026-05-30: Stock news cards need a tighter premium hierarchy and compact layout for mobile/desktop usage. |

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
- Latest HERMES-IBKR-LIVE-007 validation, 2026-06-22:
  - `python -m py_compile backend/services/portfolio_providers.py backend/services/ibkr_service.py backend/services/settings_store.py backend/services/manual_holdings.py backend/main.py` passed.
  - `npm run build` passed.
  - `/`, `/mobile`, and `/setup` returned 200.
  - `GET /api/portfolio/provider/status` resolved to `IBKR_LIVE` for live mode; `mock` and `last-update` persisted correctly after POST mode changes.
  - UAT screenshots captured under `frontend/uat-screenshots/pia-ibkr-live-007/` for `mock`, `last-update`, and `ibkr-live`.
- Latest HERMES-IBKR-UAT-009 validation, 2026-06-22:
  - `python -m py_compile backend/services/portfolio_providers.py backend/services/ibkr_service.py backend/services/settings_store.py backend/services/manual_holdings.py backend/main.py` passed.
  - `npm run build` passed in `frontend/`.
  - `/`, `/mobile`, and `/setup` returned 200 from the Next dev server.
  - `GET /api/portfolio/provider/status` returned `MOCK`, `LAST_UPDATE`, and `LAST_UPDATE` in the three tested modes without any mock leakage from live or snapshot paths.
  - `GET /api/portfolio/live/positions` returned deduped rows with option metadata; the SOFI option row exposed underlying, expiration, strike, call_put, multiplier, and contractDesc.
  - `GET /api/portfolio/history` returned the new history contract with an empty list because the local IBKR Gateway is offline and no fresh live refresh occurred in this environment.
  - Live gateway validation remains pending on a machine with an authenticated Client Portal Gateway.
- Latest HERMES-LIVE-POSITION-METRICS-MAPPING-036 validation, 2026-06-23:
  - `python -m py_compile backend/main.py backend/services/*.py backend/tests/*.py` passed.
  - `python -m unittest discover -s tests -p 'test_*.py'` passed with 9 tests.
  - Direct local endpoint checks showed `/api/portfolio/provider/status`, `/api/portfolio/live/positions`, and `/api/portfolio/live/summary` still falling back to `LAST_UPDATE` in this environment because the long-lived Gateway-connected process is unavailable here.
  - `stock` and AI-context code paths now read from the live portfolio quote cache when the live provider is active; placeholder momentum/risk/news scores are suppressed in code and covered by backend regression tests.
- Latest HERMES-IBKR-HOTFIX-010 validation, 2026-06-22:
  - `python -m py_compile backend/services/portfolio_providers.py backend/services/settings_store.py backend/main.py backend/services/manual_holdings.py backend/services/ibkr_service.py` passed.
  - Live provider cache TTL reduced to 12 seconds and invalidated on mode changes so `/dashboard` and `/api/portfolio/*` cannot keep serving a frozen live bundle after a mode switch.
  - Option classification now prefers contract text over raw `secType`, which fixes SOFI option rows rendering as stocks when IBKR reports mixed metadata.
  - Live payloads now expose `lastRefresh`, `nextRefresh`, and `isLiveUpdating`, and the API sends `Cache-Control: no-store` for portfolio routes to avoid browser caching stale mode/status responses.
  - UAT screenshots captured under `frontend/uat-screenshots/ibkr-hotfix-010/` for `provider-status.png`, `live-positions.png`, `mobile-home.png`, and `setup.png`.
  - Live gateway validation remains pending in this environment because the local Client Portal Gateway is offline.
- Latest Sprint v0.3.6 validation, 2026-05-28:
  - `npm run build` passed (frontend).
  - All 9 tickers (NVDA, AMD, SOFI, IREN, AVAV, GOOGL, TSLA, CRWV, NBIS) return complete intelligence structure from mock layer.
  - IREN position and AVAV/TSLA watchlist items process correctly through portfolio snapshot and opportunity engine.
  - Backend Python imports clean; no route regressions.
- Latest Watchlists v0.3.17 validation, 2026-05-29:
  - `npm.cmd run build` passed (frontend).
  - `next start` smoke checks returned 200 for `/` and `/mobile`.
  - Watchlists now share localStorage key `pia.watchlists.v1` across desktop and mobile.
  - Real-device mobile UAT remains required before marking Product Owner UAT complete.
- Latest APOLLO sprint validation, 2026-05-29:
  - PIA-P0-001 Settings Integrations Configuration Missing: Status remains IN VALIDATION. Reason: needs live backend verification for save, check connection, source-health.
  - PIA-UX-018 Mobile Contextual Top Bar: Status CLOSED. Validated by APOLLO. Commit: 49c7e05.
  - PIA-UX-019 Workspace Manager Escape Flow: Status CLOSED. Validated by APOLLO. Commit: b28dfa9.
  - PIA-BUG-024 Watchlist Mobile Scroll Lock: Status CLOSED. Implementation Commit: 3a8284d. QA: PIA-QA-006 PASS. Reason: APOLLO validated all acceptance criteria and recommended closure.
- Remaining failed UAT:
  - Mobile correction mock pack requires Product Owner review before final UI implementation.
  - Mobile performance lag requires deeper device profiling after first-pass render-cost reduction.
  - IBKR trade history still depends on Client Portal Gateway session availability; when the trade endpoint is unavailable, live trade fetch degrades to the saved snapshot or an empty list rather than mock data.

## Agent Task Queue

- HERMES:
  - DONE 2026-05-28: Create Stock Quote / Technical IA and News/Videos mobile correction mocks.
  - DONE 2026-05-28: Fix Release Center routing mismatch.
  - DONE 2026-05-28: Refactor Company tab into research hub.
  - DONE 2026-05-28: Refine Technical tab into trade-entry decision workflow.
  - DONE 2026-05-28: Move Videos last and rework as media-first research feed.
  - PARTIAL 2026-05-28: Help reduce mobile performance lag.
  - DONE 2026-06-22: HERMES-IBKR-LIVE-007 portfolio provider correctness, snapshot persistence, and 3-mode mobile/desktop source sync.
  - DONE 2026-06-22: HERMES-IBKR-UAT-009 live source resolution hardening, snapshot history, duplicate detection, and option normalization.
  - DONE 2026-06-22: HERMES-PORTFOLIO-ASSETCLASS-001 assetClass normalization and manual holdings schema expansion.
  - DONE 2026-06-22: HERMES-IBKR-HOTFIX-010 live refresh cadence, contract-first option classification, mode cache invalidation, and stale status hardening.
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
  - Analyst target history provider integration. Yahoo fallback covers consensus/recommendation summary; firm/date previous-target/new-target history requires Finnhub/FMP or another paid provider.
  - Unified Intelligence Feed: Yahoo, Discord, Seeking Alpha, Reuters, PIA, X, IBKR.

## Architecture Decisions

- Preserve existing architecture and routes.
- Everything is a widget.
- Reuse current dashboard widgets; do not create duplicate pages/widgets.
- Mobile customization uses the same workspace/widget registry direction.
- Workspace customization persists through shared keys: `pia.workspaces.custom`, `pia.workspaces.pinnedMobile`, `pia.workspaces.sidebarDesktop`, and `pia.workspaces.order`.
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
- DEC-DESIGN-LOCK (LOCKED): Design Lock process — a feature marked DESIGN LOCKED has its layout/IA frozen; implementation must match the locked spec; deviations require re-approval. Introduced with the Analyst Targets V3 design-locked spec.
- DEC-NEXT-CACHE (LOCKED): Next.js cache governance — on `PageNotFoundError` during page-data collection (`/_not-found`, `/_document`), clear `.next` then rebuild; never delete `.next` while a dev/prod server holds it (file lock); avoid concurrent `.next` access in the shared working tree. Recurring build contention during 2026-06 multi-agent sprints.
- DEC-AI-001 (LOCKED): AI Intelligence KPI Cards — replace KPI rings with KPI cards (Value, Trend Delta, Label, Status, Chevron); full-card tap target; no ring gauges, no flat tiles; Score family (Momentum/Trend/Sentiment, 0–100) visually distinct from Directional family (Institutional Flow, Price vs Fair Value). Reason: density, mobile usability, larger tap targets, explainability.
- DEC-AI-002 (LOCKED): AI Intelligence Single Bottom Sheet Explainability — tap KPI → one scrollable bottom sheet: Why It Matters → Score Breakdown → Historical Evolution → Disclaimer. No nested drilldowns / multiple screens / modal chains.
- DEC-AI-003 (LOCKED): AI Intelligence No Widget Collapse — missing data never collapses the widget; render structure and show missing values as `--`; "Data gathering in progress" full-section replacement forbidden; maintain layout stability.
- AI Intelligence V2 is the official approved design (PO-approved, 10/10); V1 deprecated. Spec: docs/design-system/mocks/stock-workspace/ai-intelligence-widget-v2.md. All future AI Intelligence work must follow V2.
- DEC-GOV-004 (LOCKED): Approved Mock Preservation & Design Lock Traceability — every Design Lock must archive the approved mock under `docs/mocks/<feature>/APPROVED_<feature>_v<version>.png` and COMMIT it before implementation starts; record the approved-mock path in the backlog item, UAT ticket, and Design Lock notes. Process: Requirement → UX Mockup → Design Review → Design Lock → SAVE approved mock → COMMIT approved mock → Implementation → UAT. UAT reports must include Approved Mock <path>, Design Lock Commit <id>, Implementation Commit <id>. Non-compliance: implementation started without an archived approved mock is a governance violation and is blocked until the mock is committed. Reason: Analyst Targets drifted because the approved mock was not preserved as a repo source of truth.
- DEC-PORTFOLIO-MODE-001 (LOCKED): Portfolio source selection is controlled by `data_source.mode` and may be `mock`, `last-update`, or `ibkr-live`. The IBKR integration setting (`ibkr.mode`) is transport-only and must not force portfolio source fallback. Reason: settings UI, provider status endpoint, and portfolio endpoints must report the same source.
- DEC-AI-CV3 (LOCKED): AI Intelligence Compact V3 design lock principles — (1) no Last Updated; (2) no score badge; (3) no dots/arrows; (4) 3 rows; (5) 4 cards per row; (6) 2.2 visible cards per row; (7) card customization (show/hide, reorder, persisted); (8) semantic card coloring (tone → border/glow/chart stroke). Approved Compact V3 redesign; commits 1b7d426, 3887882.
- DEC-AI-009 (LOCKED): Shared Intelligence Data Layer — AI Intelligence consumes data exclusively through the Shared Intelligence Context Layer; direct provider access from widgets is prohibited. Consumers: AI Intelligence, Analyst Targets, Company, Financials, News, Videos. Rationale: avoid duplicate fetch logic; consistency; centralized caching + validation.
- DEC-AI-010 (LOCKED): AI Verdict Separation — AI Verdict (BUY/HOLD/SELL) and Portfolio Recommendation (ADD/HOLD/TRIM/REDUCE/AVOID) are independent. Compact shows AI Verdict only; Expanded may display portfolio recommendation.
- DEC-AI-011 (LOCKED): Hero System Standardization — all AI Intelligence states use shared hero assets (Neon Wireframe SVG, lattice geometry, institutional/premium). Rejected: solid-fill, mascot, cartoon, emoji. Compact and Expanded must use identical hero assets.
- DEC-AI-RESEARCH-001 (LOCKED): Research tab is thesis-only — must not show Buy/Hold/Sell recommendation logic.
- DEC-AI-RESEARCH-002 (LOCKED): Ownership split — Overview owns verdict/action; Portfolio owns position action; Research owns thesis/deep analysis.
- DEC-AI-RESEARCH-003 (LOCKED): No dummy data — missing provider data shown as missing/partial or hidden.
- DEC-AI-RESEARCH-004 (LOCKED): Competitive Comparison only renders with real backend-supported peer data (no hardcoded/dummy/fallback peers; shouldRender=false otherwise).
- DEC-AI-RESEARCH-005 (LOCKED — ASSET MISSING): Research V2 approved mock is `docs/mocks/ai-intelligence/APPROVED/research-approved.png` (implementation source of truth). ⚠️ The referenced asset is currently MISSING from the repo; the reference is broken and the Design Lock Package is INVALID per DESIGN-LOCK-002 until the approved image is committed. Tracked by GOV-022-RESEARCH-MOCK-MISSING (P0).
- DEC-AI-RESEARCH-006 (LOCKED): Accordion arrows — collapsed = down, expanded = up (down encourages expansion).
- DEC-AI-RESEARCH-007 (LOCKED): Research customization — show/hide sections, drag reorder, text size S/M/L/XL, default expanded state, persist preferences.

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

## Task Completion Rule (MANDATORY)

A task is NOT complete until all of the following pass:
- Product Owner UAT passes.
- Real-device mobile validation passes for any gesture/mobile feature (touch swipe, sheets, keyboard focus, frozen-table scroll).
- Regression check passes (alerts visible, navigation intact, privacy masking works, no route breakage).

"Implemented" does not equal "validated". A green `npm run build` and a passing route check are necessary but not sufficient. Do not mark a UAT item complete in MD/XLSX until real-device behavior is confirmed by the Product Owner.

## Single Next Dev Server Rule (MANDATORY)

Repeated mobile styling failures (white background, serif fonts, raw unstyled HTML) have been traced to a stale/corrupted `frontend/.next` directory caused by more than one Next dev server compiling into it at once, or by a production `npm run build` overwriting `.next` while a dev server is live. The served HTML links a hashed CSS chunk (e.g. `/_next/static/css/app/layout.css`) that no longer exists, so the chunk returns 404 and the page renders unstyled. This is a runtime/pipeline failure, not a UI code bug.

Rules:
- Only one Next dev server may run for the frontend at a time.
- Before starting the frontend dev server, check port 3000 listeners.
- Kill stale frontend node/next/npm processes before restart.
- Delete `frontend/.next` after killing duplicate dev servers.
- Always start the mobile UAT server LAN-bound: `npm run dev -- -H 0.0.0.0`.
- Never run `npm run build` while a dev server is running against the same `frontend/.next` directory.
- If mobile shows raw HTML / white background / missing styles, first suspect stale or corrupted `.next`, not UI code. Confirm by fetching the linked `/_next/static/css/...layout.css` — a 404 or tiny body proves the chunk is missing.
- For real mobile UAT, use a single clean LAN server and hard-refresh / clear the mobile browser cache.

Quick recovery commands (PowerShell):

```
Get-NetTCPConnection -LocalPort 3000 -State Listen
Get-Process node | Stop-Process -Force
Remove-Item frontend\.next -Recurse -Force
cd frontend
npm run dev -- -H 0.0.0.0
```

Note: `Get-Process node | Stop-Process -Force` kills all Node processes on the machine — use it when no unrelated Node apps are running; otherwise kill only the PIDs whose command line references `personal-investment-agent\frontend`.

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
- v0.3.8: Portfolio terminal density refinement — frozen column, summary strip, column settings, Home/Portfolio IA separation.
- v0.3.9: Portfolio IBKR alignment — collapsible hero header with evolution chart, symbol-only rows, drag-reorder columns, colOrder localStorage.
- v0.3.10: Hotfix — restore mobile portfolio cards touch swipe (touch-action CSS bug + async isDragging state bug).
- v0.3.11: Portfolio header IBKR alignment, risk visual system, swipe global fix — NLV hero + Day P/L %, time-range chips, 12-metric grid, RiskBar, desktop snapshot time-range chips.
- v0.3.13: Regression fixes — portfolio search now always visible, Home rails finger swipe restored, privacy toggle accessible on Portfolio.
- v0.3.14: Mobile top bar cleanup (PIA only), global Yahoo-style stock search, global privacy eye, Home rail swipe unification (grid blowout fix), news source parity confirmed.
- v0.3.15: Runtime governance plus Workspace Manager — Single Next Dev Server Rule, mobile hamburger manager, pinned bottom nav customization, desktop parity, and custom local workspaces.
- v0.3.16: Global search universe expansion + Enter-to-open, and per-ticker mock news fallback so every symbol shows source-badged news (demo flag only when real provider returns nothing).

- v0.3.17: Watchlists IBKR UX upgrade with custom tabs, dense table/list modes, add/remove instruments, edit instruments, settings sheet, desktop parity, shared localStorage persistence, and Stock Intelligence launch from watchlist tickers.
- v0.3.19: Analyst Targets V2 with prominent upside/downside badge, consensus dollar delta, tap-to-Analysis behavior, Analysis detail section, recommendation summary, and explicit history unavailable state when provider data is absent.

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

### v0.3.36 - Live Frontend Refresh Recovery
Date: 2026-06-23
Status: Implemented and locally validated; Product Owner real-device UAT pending.
- Backlog: HERMES-LIVE-REFRESH-FIX-025 is IMPLEMENTED / LOCAL PASS.
- Architecture: DEC-UI-REFRESH-001 is IMPLEMENTED through shared `API_BASE_URL` / `WS_BASE_URL`, reconnecting WebSocket, ten-second fallback polling, and two-second pending-TFA polling.
- Desktop and Mobile consume one `useLiveDashboard` lifecycle; dashboard frames update Portfolio, Dashboard, and Watchlists state without F5.
- Stale dashboard responses trigger a 750 ms follow-up fetch after stale-while-revalidate; silent sockets trigger ten-second polling.
- Setup transitions from pending authentication to Ready automatically and stops polling after success.
- UAT: Mobile/Desktop rendered `$202.00` from a second socket frame; stale/polling sequence rendered `$100 -> $200 -> $300`; reconnect created a second socket; TFA poll transitioned in 2248 ms.
- Evidence: `frontend/uat-screenshots/hermes-live-refresh-fix-025/` and `docs/HERMES-LIVE-REFRESH-FIX-025.md`.
- Known limitation: Gateway was unavailable during final 2026-06-23 UAT, so changing-value UI evidence used controlled contract frames; live provider correctness was validated separately in task 017.

### v0.3.38 - Mobile Live Refresh Blink Stabilization
Date: 2026-06-23
Status: Implemented and build-validated; Product Owner mobile UAT pending.
- Backlog: HERMES-MOBILE-LIVE-REFRESH-BLINK-041 is IMPLEMENTED / BUILD PASS.
- Frontend: `useLiveDashboard` now stabilizes nested dashboard data across polls, mobile home sections are memoized, and portfolio live mode preserves the last non-empty live rows so mock fallback data does not flash during refresh.
- Diagnostics: dev-only mount / unmount logging added for `MobileExperience`, `MobilePortfolioTable`, and `PositionCards`, plus a loading-toggle trace after the first dashboard load.
- Validation: `npm run build` passed in `frontend/`.
- Known limitation: PO UAT evidence is still pending in this workspace.

### v0.3.39 - Live Quote Propagation Alignment
Date: 2026-06-23
Status: Implemented and backend/frontend validated locally; Product Owner UAT pending.
- Backlog: HERMES-LIVE-QUOTES-037 is IMPLEMENTED / LOCAL PASS.
- Backend: `/api/debug/live-quotes` now reports `source`, `quotesReceived`, `lastQuoteTimestamp`, and `symbols` in addition to the live quote trace. The live quote pipeline continues to source from the IBKR market-data snapshot cache.
- Frontend: stock hero consumers now prefer the live dashboard seed over the original selected-row snapshot for held positions, so the hero follows the same live quote source as the position table.
- Validation: backend live quote and stock payload inspection confirmed advancing timestamps and live quote fields; frontend build re-run after the hook precedence fix.
- Known limitation: PO UAT screenshots are still pending in this workspace.

### v0.3.37 - Live Position Metrics Mapping
Date: 2026-06-23
Status: Implemented and locally validated; live-Gateway UAT pending in this environment.
- Backlog: HERMES-LIVE-POSITION-METRICS-MAPPING-036 is IMPLEMENTED / LOCAL PASS.
- Backend: day change, day P&L, and day P&L% now derive from validated quote fields with fallback formulas; placeholder 55/70/50-style scores are no longer exposed as real live metrics.
- Intelligence: risk and momentum now read from cached AI intelligence when available and otherwise return null with provenance; news score remains null until proper scoring exists.
- Stock hero / AI context: live quote reads now prefer the portfolio quote cache so stock panels and portfolio surfaces stay aligned.
- Validation: backend `py_compile` and `unittest` passed; code paths for `/stock/{ticker}` and AI context now use the live quote cache path when the live provider is active.

### v0.3.35 - Frontend Refresh Lifecycle Diagnostic
Date: 2026-06-22
Status: Diagnostic complete; P0 implementation continuation OPEN.
- Backlog: HERMES-FRONTEND-REFRESH-DIAGNOSTIC-024 diagnostic is COMPLETE / LOCAL PASS; implementation follow-up remains P0 OPEN.
- Root cause: mobile fetches once through the `8007` Next proxy but subscribes to WebSocket port `8000`; desktop and Setup hard-code `8000`; no polling fallback exists.
- Cache finding: 8-second dashboard stale-while-revalidate works, but the first stale response remains in React because the frontend never performs the required follow-up request.
- TFA finding: Setup diagnostics run only on step entry/manual Retry; no pending-auth polling exists.
- Runtime finding: two Next dev servers served mismatched `.next` chunks, causing hydration failure and zero client API/socket activity.
- UAT evidence: mobile made one dashboard request in 18 seconds, received zero socket frames, and lagged the live provider by more than three minutes; F5 produced refreshed values/timestamps. Desktop received zero responses from three port-8000 requests. Setup made one request in ten seconds with no retry.
- Proposed architecture DEC-UI-REFRESH-001: one shared frontend HTTP/WS runtime config, WebSocket reconnect, 10-12 second polling fallback, and 2-second pending-TFA polling.
- Known limitation: live frontend values will continue to require navigation/reload until the continuation implementation is completed.

### v0.3.34 - IBKR Connectivity Mismatch Hotfix
Date: 2026-06-22
Status: Implemented and locally validated against an authenticated Client Portal Gateway.
- Backlog: HERMES-IBKR-CONNECTIVITY-MISMATCH-017 is IMPLEMENTED / LOCAL PASS.
- Root cause: Python's dual-stack `localhost` path took about 2.2 seconds and exceeded the 2.0-second heartbeat timeout; direct IPv4 loopback completed in about 0.17 seconds.
- Architecture decision DEC-IBKR-CONNECTIVITY-001: preserve the configured `localhost` URL for user-facing settings, but prefer `127.0.0.1` for the backend Gateway transport unless `IBKR_PREFER_IPV4=false`.
- UAT: `/api/debug/ibkr-connectivity` returned authenticated/established/connected; provider status returned `IBKR_LIVE`; AMD changed across four reads with advancing quote timestamps and live summary recalculation.
- Agent task HERMES-IBKR-CONNECTIVITY-MISMATCH-017: startup/request logging, connectivity endpoint, transport correction, frontend proxy, and legacy setup diagnostic alignment complete.
- Known limitations: Gateway availability still requires an authenticated local session; quote entitlement and latency depend on IBKR market-data permissions; local self-signed TLS verification remains disabled on loopback.

### v0.3.31 - IBKR Live Source Resolution Hardening
Date: 2026-06-22
Status: Implemented and locally validated.
- HERMES-IBKR-UAT-009 hardened the provider state machine for `mock`, `last-update`, `ibkr-live`, and `disconnected` resolution.
- Live refresh now persists snapshot history under `backend/data/snapshots/ibkr/history/` and records refreshed portfolio summary metadata.
- Duplicate detection now uses accountId + conid + assetClass + contractDesc + currency, and option rows expose underlying/expiration/strike/call_put/multiplier.
- Provider status, live endpoints, and `/portfolio` now share strict `is_live`, `is_stale`, `stale_reason`, `snapshot_available`, and `snapshot_timestamp` fields.
- Validation: `py_compile`, `npm run build`, `/`, `/mobile`, `/setup`, provider mode switching, dedupe checks, and history endpoint smoke tests passed locally. Live gateway validation remains pending because the local IBKR Client Portal Gateway is offline in this environment.

### v0.3.32 - Portfolio Asset Class Normalization
Date: 2026-06-22
Status: Implemented and locally validated.
- HERMES-PORTFOLIO-ASSETCLASS-001 adds explicit `assetClass` normalization across mock, snapshot, live, and manual holdings paths.
- Manual holdings now persist `assetClass`, `sec_type`, `underlying`, `expiry`, `strike`, `callPut`, `multiplier`, and `contractDesc`.
- Option text like `SOFI Jun 2027 22C` now normalizes to `assetClass=OPT`, `underlying=SOFI`, `expiry=2027-06`, `strike=22`, `callPut=C`.
- Crypto symbols such as `BTC`, `ETH`, and `XRP` normalize to `assetClass=CRYPTO`.
- Validation: backend compile plus API payload smoke checks confirmed `assetClass`, `expiry`, and option metadata are present on portfolio rows.

### v0.3.33 - IBKR Live Refresh + Classification Hotfix
Date: 2026-06-22
Status: Implemented and locally validated.
- HERMES-IBKR-HOTFIX-010 shortens the live provider cache window, invalidates cached live bundles on mode changes, and advertises `lastRefresh`, `nextRefresh`, and `isLiveUpdating` so the UI can see active refresh state.
- Contract-first classification now recognises option rows even when IBKR reports them with stock-like metadata, which prevents SOFI option rows from leaking into the Stocks view.
- Portfolio routes now emit no-store cache headers to stop stale browser responses from masking mode changes or live refreshes.
- Validation: backend compile passed; live-gateway-specific UAT remains pending because the local Client Portal Gateway is offline here.

### v0.3.29 - AI Intelligence V3 Research Documentation (ATHENA-GOV-022)
Date: 2026-06-22
Status: Documentation/governance only.
- Backend COMPLETE: HERMES-AI-V3-001 (gap analysis), HERMES-AI-V3-002 (Research Endpoint V1, thesis-only, p50 9.93/p95 11.86ms), HERMES-AI-V3-003 (provenance + real-data upgrade, schema V3.0, p50 12.12/p95 17.29ms).
- CR-AI-V3-UI-001 CLOSED (89bad3a). ARTEMIS-AI-V3-RESEARCH-003 IMPLEMENTED (8657868) but Design Lock INVALID (approved mock missing).
- Decisions LOCKED: DEC-AI-RESEARCH-001..007.
- Epics: EPIC-AI-RESEARCH-V2, EPIC-AI-PROVENANCE, EPIC-AI-COMPETITIVE-COMPARISON. Bugs: AMD material-news regression + 2 known provider gaps.
- P0 blocker GOV-022-RESEARCH-MOCK-MISSING: approved Research mock absent (research-approved.png; typo/draft variants no longer present) — see Design Asset Validation Report.

### v0.3.30 - IBKR Live Portfolio Modes + Snapshot Persistence
Date: 2026-06-22
Status: Implemented and locally validated.
- Portfolio mode persistence fixed for `mock`, `last-update`, and `ibkr-live`.
- Live IBKR provider now uses Client Portal Gateway, persists snapshots, and no longer falls back to mock when a real mode is selected.
- UAT screenshots captured under `frontend/uat-screenshots/pia-ibkr-live-007/`.

### v0.3.28 - AI Intelligence V2 Governance Refresh (ATHENA-GOV-021)
Date: 2026-06-22
Status: Documentation/governance only. Release Candidate pending UAT.
- Decisions LOCKED: DEC-AI-009 (Shared Intelligence Data Layer), DEC-AI-010 (AI Verdict Separation), DEC-AI-011 (Hero System Standardization).
- Backend HERMES-AI-005 + HERMES-AI-006 COMPLETE/Accepted (contract ready). ARTEMIS-AI-011 IN PROGRESS; CR-AI-011 OPEN (release blocker).
- Backlog added: HERMES-AI-007 (P2 Parallel Context Hydration), CR-HERMES-006-01 (P3 Contract Versioning).
- New trackers: docs/PROJECT_STATUS.md, docs/ROADMAP.md, docs/RELEASE_NOTES_DRAFT.md. Status: backend 98% / frontend 80% / overall 92–93%.

### v0.3.27 - AI Intelligence Compact V3 Redesign
Date: 2026-06-22
Status: Implemented (ARTEMIS); UAT PASS decision pending. Commits 1b7d426, 3887882.
- AiIntelligenceCompactV3 widget: 3 rows × 4 cards, 2.2 visible per row; no Last Updated, no score badge, no dots/arrows (ARTEMIS-AI-COMPACT-REDESIGN-001).
- Card customization: show/hide, reorder, three-dot Customize AI Cards sheet, persisted (CR-AI-COMPACT-REDESIGN-002).
- Semantic tone engine: tone → border/glow/chart stroke; High=red, Low=green; BUY may contain red cards (CR-AI-COMPACT-REDESIGN-003).
- Design lock DEC-AI-CV3. UAT screenshots: frontend/uat-screenshots/cr-ai-compact-v3-cr002/ (NVDA BUY / NBIS HOLD / AAPL HOLD).

### v0.3.26 - Explainable AI Intelligence Engine V1
Date: 2026-06-17
Status: Implemented and locally validated.
- HERMES-AI-002 implemented the V1 backend explainable intelligence engine and `/api/intelligence/{symbol}/score`.
- Added stock verdict vs portfolio recommendation distinction, final verdict, visual state, expected return, conviction, thesis strength, risk, scenario probabilities, drivers/risks, bull/bear cases, score breakdown, factors evaluated, confidence notes, debug scoring details, cache support, and deterministic fixtures.
- Missing Seeking Alpha, Discord Advisor, and X Sentiment reduce confidence only and do not block the verdict.
- Validation: backend `py_compile`, contract smoke, deterministic fixtures, `npx tsc --noEmit --pretty false`, and `npm run build` PASS.

### v0.3.22 - Governance: Approved Mock Preservation & Design Lock Traceability (PIA-GOV-004)
Date: 2026-06-11
Status: LOCKED; documentation only.
- DEC-GOV-004 LOCKED: archive approved mock under docs/mocks/<feature>/APPROVED_<feature>_v<version>.png and commit before implementation; record path in backlog/UAT/Design Lock; UAT triple (Approved Mock / Design Lock Commit / Implementation Commit); non-compliance blocks implementation.
- Compliance audit: existing approved mocks are non-compliant with the naming convention; GOV-004-REMEDIATION (OPEN) tracks normalization + traceability backfill.
- Traceability: AI Intelligence V2 (mock docs/mocks/AI Intelligence/mock v1.png, lock 3bb14df, impl b7d591e); Analyst Targets (mock docs/mocks/analyst-targets/Approved_mobile_mock_analyst_target.jpg).

### v0.3.21 - AI Intelligence V2 Design Lock
Date: 2026-06-10
Status: Design Lock approved by Product Owner (10/10); documentation only. Implementation = CR-AI-010 (READY).
- LOCKED: DEC-AI-001 (KPI Cards), DEC-AI-002 (Single Bottom Sheet Explainability), DEC-AI-003 (No Widget Collapse).
- AI Intelligence V2 supersedes V1 (V1 deprecated). Spec: docs/design-system/mocks/stock-workspace/ai-intelligence-widget-v2.md. All future AI work must follow V2.

### v0.3.20 - Portfolio Density + Analyst Targets V3 + UAT Fix Pack
Date: 2026-06-09
Status: Implemented and locally validated (build PASS; `/`, `/mobile`, `/setup` 200); pending Product Owner real-device UAT.
Commit range: 02dfcdf … e5736e9 (through requested anchor 72499e9).
- Analyst Targets V3 (HERMES): Options tab removed; chart only in Chart tab; fixed sticky header; Overview Bull/Base/Bear + range + consensus + distribution; tap → Analysis history cards. Commits 2b9d1de,5602655,ecbe06d,ac0ca6f.
- Portfolio Density Sprint (ATHENA): cards v2, customization framework, grid+filters, 2x2 compact IBKR, live price emphasis, visual system v2, logo ring, view selector, mobile density+persistence. Commits 23bce57,54bf30e,b7c646f,6038934,edca406,5e8daca,72499e9,e5736e9.
- New OPEN (visual audit): PIA-UX-060 (logo anchor), PIA-BUG-032 (empty preview widgets), PIA-CSS-001 (stock header CSS), PIA-UX-061 (cards view discoverability). Watchlist UAT PIA-WL-008..014 still open.
- Governance LOCKED: DEC-DESIGN-LOCK (Design Lock process), DEC-NEXT-CACHE (Next.js cache rule).

### v0.3.16 - Global Search + Mobile News Regression Fix
Date: 2026-05-28
Status: Implemented; pending Product Owner real-device UAT.

CR — Global stock search was not market-wide (Bug 1):
- Expanded the mobile search universe beyond portfolio/watchlist/9 mock tickers to include AAPL, MSFT, AMZN, META, SPY, QQQ, MELI, NFLX, PLTR, COIN, SMCI, MU, ARM (plus the existing v0.3.6 set). Known big-cap tickers now appear as real results instead of only an Analyze fallback.
- Added Enter-to-open: pressing Enter opens the first result, or the Analyze {TICKER} flow when there is no match. Unknown/arbitrary tickers still surface "Analyze {TICKER}" which opens Stock Intelligence gracefully via `/stock/{ticker}`.
- Universe still merges Portfolio > Watchlist > Mock with source badges; selecting opens the Stock Intelligence panel and closes search.

CR — Mobile news showed empty for most tickers (Bug 2):
- Root cause: `DemoNewsProvider` only had mock items for AMD/SOFI/NBIS/MELI. For any other symbol (NVDA, AVAV, GOOGL, TSLA, CRWV, IREN, AAPL, …) when live Yahoo was unreachable, `get_ticker_news_intelligence` fell through to "No structured headlines" — an empty News tab.
- Fix: added `generate_mock_news(ticker)` in `news_intelligence.py` — a deterministic per-ticker fallback producing 4 source-badged headlines (Yahoo / Seeking Alpha / Reuters / RSS) with bias/possible-move/confidence/action metadata. Wired as the final fallback in `get_ticker_news_intelligence`.
- `used_demo` correctness: real Yahoo headlines (live or `YahooNewsProvider`) set `is_demo=False`; only the demo provider or the new mock fallback set `is_demo=True`. Verified: AVAV/GOOGL/TSLA return real Yahoo items (is_demo False); unknown ticker returns mock (is_demo True). Mobile and desktop share the same `/stock/{ticker}` → `TickerNewsList` path with consistent source badges and no separate Open button.

CR — Mobile hamburger / workspace menu (Bug 3):
- Satisfied by the v0.3.15 Workspace Manager: top-left hamburger opens the Workspace Manager sheet (workspaces + Settings + About + pin customization). Default bottom nav = Home, My Portfolio, Watchlists, Scanner, Markets & Macro. No further work required in v0.3.16; verified it builds with the search/news changes.

Known limitations:
- Mock news headlines are generic per-ticker templates (not company-specific) when no live provider returns data.
- NOT complete until Product Owner real-device UAT confirms.

### v0.3.15 - Workspace Manager + Custom Workspaces
Date: 2026-05-28
Status: Implemented; pending Product Owner real-device UAT (per Task Completion Rule).

## Added:

- Mobile top-left hamburger opens a compact Workspace Manager sheet.
- Workspace Manager lists every workspace with direct open actions so overflow/custom workspaces remain reachable without first pinning them.
- Settings and About/Release Center are accessible from the mobile hamburger flow.
- Mobile bottom nav now renders only `pia.workspaces.pinnedMobile`, capped at five workspaces, with drag reorder and unpin controls.
- Full workspace library uses the central workspace registry, extended at runtime by `pia.workspaces.custom`.
- Custom workspace creation supports name, icon, accent color, and templates: Blank, Watchlist, Portfolio analysis, News feed, Macro dashboard, and Trade setup board.
- Custom workspaces can be renamed and deleted locally.
- Desktop sidebar now supports the same manager for show/hide, reorder, custom workspace CRUD, and reset to defaults.
- Shared persistence keys: `pia.workspaces.custom`, `pia.workspaces.pinnedMobile`, `pia.workspaces.sidebarDesktop`, `pia.workspaces.order`.
- Added mobile mock/spec docs: `07_workspace_manager_mobile.md` and `08_bottom_nav_pinning_spec.md`; updated `03_mobile_workspace_navigation.md`.

### v0.3.15 - Runtime Governance: Single Next Dev Server Rule
Date: 2026-05-28
Status: Documentation only.

## Added:

- "Single Next Dev Server Rule (MANDATORY)" section under governance.
- Documents the root cause of recurring mobile styling failures: duplicate Next dev servers (or a production `npm run build`) corrupting/overwriting `frontend/.next`, leaving the served HTML pointing at a hashed CSS chunk that 404s → unstyled raw HTML.
- Mandatory rules: one dev server only; check port 3000 first; kill stale node/next/npm before restart; delete `.next` after killing duplicates; LAN-bound `npm run dev -- -H 0.0.0.0`; never `npm run build` against a live dev server's `.next`; suspect stale `.next` (not UI code) when styles vanish; hard-refresh mobile cache for UAT.
- Quick recovery command block (PowerShell), with a safety note on the broad `Get-Process node | Stop-Process -Force`.

### v0.3.14 - Mobile Top Bar + Global Search + News + Home Swipe Unification
Date: 2026-05-28
Status: Implemented; pending Product Owner real-device UAT (per Task Completion Rule).

CR — Mobile top bar IA (Part A):
- Removed "Mitsos - PIA" sub-label, "Mobile Command"/"Private Command" h1, and the "{n}P" count artifact from the top area.
- Top bar now shows brand "PIA" on the left and an action cluster on the right: Search · Privacy Eye · Notification bell.

CR — Global stock search belongs in top bar (Part B):
- New `GlobalStockSearch` sheet opened from the top-bar magnifier. Auto-focused input (mobile keyboard opens), compact result cards.
- Universe = portfolio positions + watchlist + v0.3.6 mock tickers (NVDA, AMD, SOFI, IREN, AVAV, GOOGL, TSLA, CRWV, NBIS), deduped by symbol with source priority Portfolio > Watchlist > Mock.
- Each result shows symbol, name, price/change when available, and a source badge (Portfolio/Watchlist/Mock). Selecting opens the Stock Intelligence panel and closes search.
- Unknown/arbitrary ticker shows an "Analyze {TICKER}" row (PIA badge) that opens the same Stock Intelligence flow gracefully (backend `/stock/{ticker}` returns a safe structure). Not Ask PIA; no external browser.

CR — Privacy belongs in top bar (Part C):
- Privacy Eye moved to the top bar, left of the bell. Always visible globally on mobile. Toggles the existing `pia.hideAmounts` state/localStorage. All surfaces already consume `privacyHidden`, so Home, Portfolio, table, cards, NLV, P/L and IBKR metrics mask.

CR — Home initial rail used a grid-blowout path (Part E, root cause):
- Home renders rails inside `MobileReorderableSections` → `.mobile-dashboard-sections{display:grid}`. Grid items default to `min-width:auto`, so the swipe rail's wide content blew out the track instead of scrolling; `body{overflow-x:hidden}` then clipped it, making the rail look frozen. The 4th/markets workspace renders the same `MarketPulse`/`SwipeRail` under a plain block parent, so it scrolled — which is why only Home appeared broken.
- Fix: `.mobile-dashboard-sections{grid-template-columns:minmax(0,1fr)}` + `.mobile-section-slot{min-width:0}`. The rail is the same shared `SwipeRail` (native pan-x, no touch pointer-capture from v0.3.13) — now it scrolls on Home too. Applies to all Home rails (Market Pulse, Portfolio Insights, Scanner Setups, Watchlist Movers).

CR — Mobile news source parity (Part D):
- Verified: the mobile stock-workspace News tab already uses the same data path as desktop — `StockIntelligencePanel` → `/stock/{ticker}` → `get_ticker_news_intelligence` (live Yahoo RSS, demo fallback) → `TickerNewsList` with shared `sourceBadgeVariant` (Yahoo/SA/Reuters/RSS/PIA/X/Discord/IBKR). Cards are tap-to-open (no separate Open button). No mobile-only fake feed exists. Desktop behavior unchanged.

Portfolio controls cleanup (Part G):
- Removed the v0.3.13 in-Portfolio search and privacy buttons. Portfolio controls row now contains only Columns + Table/Cards.

Stock actions (Part F): verified still compact (icon chips, commit 47ea325).

Known limitations / remaining:
- Mobile Home does not have a dedicated news rail (Home sections are pulse/insights/alerts/brief/scanner/watchlist). Adding a Home news feed is a future enhancement, not a regression.
- XLSX workbook not updated this pass (MD is canonical readable source); flag if the workbook row is required.
- NOT complete until Product Owner real-device UAT confirms.

### v0.3.13 - Open UAT Regression Fixes
Date: 2026-05-28
Status: Implemented; pending Product Owner real-device UAT.

These items were reported complete in prior sprints but failed Product Owner UAT. Root causes found and the actual implementation fixed.

CR — Portfolio search visibility (Bug 1):
- Root cause: the search input lived inside the `{expanded && ...}` block of `PortfolioHeader`. When `pia.portfolioHeader.expanded` was saved as `false`, the search never rendered anywhere.
- Fix: removed the in-header search; added an always-visible magnifier icon button (`pf-icon-btn`) in the persistent portfolio controls row. Tapping it opens a compact, auto-focused search panel (mobile keyboard opens via `autoFocus`). X button or empty-close collapses it. Typing filters current positions; selecting a result opens the Stock Intelligence panel. This is instrument search, not Ask PIA.

CR — Home rails finger swipe (Bug 2):
- Root cause: `SwipeRail.handlePointerDown` called `setPointerCapture` for touch pointers. The browser's native `pan-x` scroll then fired `pointercancel`, and `handlePointerEnd` immediately called `scrollToSlide`, interrupting the native gesture mid-swipe.
- Fix: skip `setPointerCapture` when `pointerType === 'touch'`; in `handlePointerEnd`, return early on `pointercancel` so native scroll-snap finishes the gesture. All Home rails (Market Pulse, Portfolio Insights, Scanner Setups, Watchlist Movers) share this `SwipeRail` component, so they all benefit.

CR — Privacy masking accessibility (Bug 3):
- Root cause: the privacy toggle lived only inside `SearchCommand` (via Quick Controls), and `SearchCommand` is hidden when `active === 'portfolio'` — so the toggle was unreachable on the Portfolio workspace.
- Fix: added a dedicated privacy (Eye/EyeOff) icon button in the persistent portfolio controls row, wired to the existing `pia.hideAmounts` state/localStorage path. All portfolio surfaces already consume `privacyHidden`, so NLV, P/L, table values, card values and IBKR metrics mask correctly.

Known limitations:
- Search currently scopes to current portfolio positions; cross-universe ticker lookup is a later enhancement.

### v0.3.11 - Portfolio Header + Swipe + Risk Visual Alignment
Date: 2026-05-28
Status: Implemented and validated.

## Part A — Portfolio Header Redesign (mobile):

- `PortfolioHeader` fully redesigned to IBKR reference standard.
- **Hero row**: NLV + Day P/L value + Day P/L % (previously only showed a "today" chip with no %).
- **Secondary row**: Unrealized P/L + Realized P/L side-by-side below chart divider.
- **Portfolio evolution chart**: responds to selected timeframe (7 options).
- **Time-range chips**: 1D · 1W · 1M · 3M · YTD · 1Y · ALL — horizontal scroll rail. Selecting a chip regenerates the chart mock data with the correct depth and starting drawdown per period.
- **Compact portfolio instrument search**: below chart. Plain text search input, NOT the Ask PIA AI bar.
- **Full 12-metric expanded grid** (3×4): Market Value, Excess Liquidity, SMA, Theta, Vega, Buying Power, Maintenance Margin, Initial Margin, SPX Delta, Net Delta, Day Trades Left, Cash. Deterministic mocks from portfolio total where live data unavailable.
- Collapsed header: NLV + Day P/L + % + chevron — minimal height so positions dominate.

## Part D — Swipe smoothness (global):

- Already fixed in v0.3.10 (`touch-action: pan-x`). All SwipeRail-based rails — MarketPulse, WatchlistMovers, ScannerSetups, PositionCards — benefit from the same fix.

## Part E — Stock Card Risk Visual:

- Added `RiskBar` component matching MomentumBar structure exactly.
- 4 labeled levels: Low (green) / Medium (amber) / Elevated (orange) / High (red).
- Replaces `IntelligenceBadge` risk display in `PositionCards`. Risk signal now reads as a bar-with-label module, not a random badge.
- CSS: `.mobile-momentum em.risk-*` and `.risk-label-*` classes.

## Part F — Desktop Snapshot:

- `PortfolioSnapshot` in Dashboard.tsx updated: Day P/L % shown alongside value.
- Time-range chips (1D/1W/1M/3M/YTD/1Y/ALL) added below the KPI row — visual only for now.

## Known limitations:

- Time-range chart is deterministic mock — changes chart shape/depth but does not call a real historical endpoint.
- Realized P/L shows $0 (no trade history in demo mode).
- Desktop Kpis does not yet show Theta/Vega/SMA — these are in mobile only for now.

### v0.3.10 - Mobile Portfolio Cards Touch Swipe Hotfix
Date: 2026-05-28
Status: Fixed. Two bugs, one broken swipe.

## Root Cause:

**Bug 1 — CSS `touch-action` (primary blocker)**:
`globals.css` Sprint 2C `@media(max-width:560px)` block had:
`.mobile-swipe-rail { touch-action: pan-y pinch-zoom }`

`pan-y` means "the browser handles VERTICAL pan natively; horizontal pan goes to JavaScript." On a horizontal swipe rail, this is backwards. The browser never provided native horizontal scroll, and since the JS handler was also broken (Bug 2), nothing scrolled.

Fix: Changed to `touch-action: pan-x` — browser handles horizontal panning natively for elements ≤560px wide. Vertical touch passes through to the page. Native `scroll-snap-type: x mandatory` then handles snap-to-card automatically.

**Bug 2 — Async `isDragging` state (desktop/JS fallback)**:
`SwipeRail.handlePointerMove` checked `if (!isDragging) return` where `isDragging` was React state set via `setIsDragging(true)` in `handlePointerDown`. On mobile, `pointermove` fires in the same microtask frame before React processes the state update — so `isDragging` was always `false` when `handlePointerMove` ran, causing it to return immediately on every call.

Fix: Added `isDraggingRef = useRef(false)`. Set `isDraggingRef.current = true` synchronously in `handlePointerDown` (before the async `setIsDragging`). Both `handlePointerMove` and `handlePointerEnd` now check `isDraggingRef.current` (sync ref) rather than `isDragging` (async state). The `isDragging` state is still maintained for the CSS `is-dragging` class.

Also removed `event.preventDefault()` from `handlePointerMove` (was a no-op in passive listeners and not needed with `touch-action: pan-x` since the browser handles native scroll).

## No regressions:

- Table mode: unaffected
- Arrows: still work (scrollToSlide via button click)
- Progress dots: updated via `onScroll` (works with native scroll)
- Brand color hooks: preserved
- Bottom nav: preserved
- localStorage view preference: preserved

### v0.3.9 - Portfolio IBKR Alignment Bugfix
Date: 2026-05-28
Status: Implemented and validated.

## Fixed:

- **Collapsible Portfolio Header (Bug 1 + 3)**: Replaced flat summary strip with a proper IBKR-style collapsible header. Expanded: hero NLV value (clamp 24–34px), Day P/L chip, evolution chart, 4-metric row (Unrealized, Cash, Buy Power, Top Exposure). Collapsed: NLV + Day P/L chip + chevron only. Persist state in localStorage (`pia.portfolioHeader.expanded`). Positions dominate screen when header is collapsed.

- **Portfolio Evolution Graph (Bug 2)**: 30-point deterministic evolution chart inside the expanded header. Generated from current portfolio total (87% base → current over 30 days with sinusoidal variation). SVG line with green/red color based on direction. No empty chart — always renders.

- **Symbol-only Rows (Bug 4)**: Company name removed from terminal table frozen column. Now shows: color logo mark + bold symbol only. First column min-width reduced from 120px → 64px, giving more horizontal space to metrics. IBKR-style dense row.

- **Column Drag Reorder (Bug 5)**: `PortfolioColumnSheet` upgraded with pointer-based drag reorder. Each column row has a `GripVertical` drag handle (pointer capture via `setPointerCapture`). Live reorder via `data-ci` index lookup on pointer move. Order persisted in localStorage (`pia.portfolioColOrder.mobile`). Reset to defaults resets both visibility and order. Min 2 columns enforced.

- **Column Order in Table (Bug 5 cont.)**: `MobilePortfolioTable` now respects `colOrder` when rendering columns — `colOrder.map → COL_DEFS.find → filter visible`. Column order and visibility are fully decoupled and independently persisted.

- **Cards Gesture Swipe (Bug 6)**: Verified. `PositionCards` uses `SwipeRail` which has full pointer-capture horizontal swipe with `touch-action: pan-y pinch-zoom` at ≤560px and native scroll-snap. SwipeRail properly handles drag end → snap to nearest slide.

- **Frozen Table (Bug 7)**: Preserved. `.mtt-col-frozen` with opaque background + `border-collapse: separate; border-spacing: 0` verified in build.

## Known limitations:

- The evolution chart uses deterministic mock history (no live historical portfolio data). A real portfolio history endpoint would replace `generatePortfolioHistory`.
- ColOrder localStorage includes all 9 column keys including hidden extras — this is intentional so user's order preference is preserved across show/hide operations.

### v0.3.8 - Portfolio Terminal Density Refinement (Sprint 3A)
Date: 2026-05-28
Status: Implemented and validated.
CRs closed: CR-27, CR-28, CR-29, CR-30, CR-31, CR-32, CR-33, CR-34, CR-35, CR-36, CR-37, CR-38

## Closed CRs:

- CR-27: Ask PIA search bar removed from Portfolio. Shown only on Home, Scanner, Markets.
- CR-28: Connection Status dock removed from global shell. Moved into Settings top section.
- CR-29: Column settings sheet added beside Table/Cards toggle. Show/hide 9 columns (Price, Chg%, Unrlzd, Day P/L, Wt%, Risk, Avg Cost, Sector, Macro β). Reset to defaults. Persisted in localStorage (`pia.portfolioColumns.mobile`).
- CR-30: First column (Symbol) and header row are now frozen. Symbol stays visible during horizontal scroll. Column headers stay visible during vertical scroll. Implemented via `position: sticky; left: 0` on `.mtt-col-frozen` and `position: sticky; top: 0` on `thead th`. Uses `border-collapse: separate; border-spacing: 0` for cross-browser sticky column support.
- CR-31: Row height tightened to 7px padding (from 9-10px). Font size reduced to 12px (from 12.5px). Header font size 10px, padding 7px. Net result: ~30% more rows visible in the same height.
- CR-32: Large 3-cell footer metric blocks removed. Replaced with compact scrollable `PortfolioSummaryStrip` at the top of the portfolio workspace showing: NLV, Day P/L, Unrealized, Cash, Buying Power, Top Exposure %. Horizontally scrollable, 7px padding cells, 9px uppercase labels.
- CR-33: Portfolio workspace cleaned of non-operational elements. No search bar, no status dock, no home widgets.
- CR-34: Table/Cards toggle height reduced (padding 4px vs 5px, font 11px vs 12px). More premium proportions.
- CR-35: Swipe Cards view fully preserved with brand color accents and P/L row. No regressions.
- CR-36: `--pos-brand` and `--card-brand` CSS hooks maintained. Theme architecture untouched.
- CR-37: Table now supports 9 columns: Price, Chg%, Unrlzd (with % sub-line), Day P/L, Wt%, Risk, Avg Cost, Sector, Macro β. All sortable where applicable. Default: first 6 visible.
- CR-38: Home and Portfolio architecturally separate. Home = executive overview with market pulse, alerts, brief. Portfolio = clean operational terminal.

## Known limitations:

- Sticky column `position: sticky; left: 0` behavior depends on the `.mobile-terminal-wrap` being the correct overflow-x scroll ancestor. Verified with `border-collapse: separate`.
- Sector and Macro β columns show placeholder data until live fundamentals feed is connected.

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
