# PIA Master Backlog Source Of Truth

Status: Active source of truth
Owner: PIA engineering governance
Last updated: 2026-05-27
Target branch: feat/pia-v3-foundation-integration

## Dashboard

PIA is a premium, institutional-grade personal investment dashboard inspired by Bloomberg, IBKR, Seeking Alpha, and trading intelligence terminals.

The approved product direction is a mobile-first, dark premium, high-density decision platform. The dashboard must feel like an executive command surface, not a generic admin panel or crypto template.

Current source-of-truth routes:

| Route | Purpose | Validation Expectation |
| --- | --- | --- |
| `/` | Home dashboard and desktop workspace shell | Must load with no route regression |
| `/mobile` | Mobile-first command experience | Must be polished, compact, readable, and free of horizontal overflow |
| `/setup` | Setup/onboarding flow | Must remain preserved |

Current dashboard priorities:

| Priority | Area | Requirement |
| --- | --- | --- |
| P0 | Home dashboard | Preserve working widgets while improving premium visual identity |
| P0 | Mobile Home | Mobile must not feel like squeezed desktop |
| P0 | Privacy mode | Amount hiding must remain intact |
| P0 | Workspace selector | Home and workspaces must be clear and intentional |
| P1 | Status dock | Move important source status toward a bottom-left dock concept |

## Backlog

| ID | Priority | Area | Item | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| PIA-BL-001 | P0 | News UX V2 | Real article titles | Planned | News cards must show real titles when backend provides them |
| PIA-BL-002 | P0 | News UX V2 | Exact article links | Planned | Preserve source URLs and make links discoverable |
| PIA-BL-003 | P0 | News UX V2 | PIA Digest section | Planned | Digest should summarize decision relevance |
| PIA-BL-004 | P0 | News UX V2 | Rename Sentiment to Bias | Planned | Use decision-friendly language |
| PIA-BL-005 | P0 | News UX V2 | Rename Impact to Confidence | Planned | Prefer confidence framing |
| PIA-BL-006 | P0 | News UX V2 | Rename Sell the News to Possible Move | Planned | Avoid meme-like terminology |
| PIA-BL-007 | P0 | News UX V2 | Human-readable actions | Planned | Actions must be useful and readable |
| PIA-BL-008 | P0 | News UX V2 | Demo badge only for mock data | Planned | Do not badge real data as demo |
| PIA-BL-009 | P0 | Mobile Settings | Fix empty mobile settings | In progress | Mobile settings must expose useful controls |
| PIA-BL-010 | P0 | Mobile Controls | Fix mobile quick controls | In progress | Privacy and rescan controls must work |
| PIA-BL-011 | P0 | Mobile Notifications | Fix mobile bell behavior | In progress | Bell must open a useful notification center |
| PIA-BL-012 | P0 | Workspace Layout | Draggable dashboard widgets | In progress | Preserve local-first layout behavior |
| PIA-BL-013 | P0 | Workspace Layout | Movable mobile sections | In progress | Use same workspace/widget registry principles |
| PIA-BL-014 | P1 | Stock Intelligence | Analyst Targets widget per stock | Planned | Required per-stock intelligence feature |
| PIA-BL-015 | P1 | Intelligence Feed | Unified feed sources | Planned | Yahoo, Discord, Seeking Alpha, Reuters, PIA, X, IBKR |
| PIA-BL-016 | P1 | Watchlists | Add/remove/sort/company logo/mini charts | Planned | Watchlists become first-class workspace |
| PIA-BL-017 | P1 | Markets | Sector and industry heatmap | Planned | Required macro/market overview widget |
| PIA-BL-018 | P1 | Trade Coach | Voice mode | Planned | Later release capability |
| PIA-BL-019 | P1 | Academy | Academy workspace | Planned | Approved workspace |
| PIA-BL-020 | P2 | Backup | Cloud backup/restore | Planned | Future persistence layer |
| PIA-BL-021 | P2 | Platform | Performance and storage efficiency | Planned | Must remain measurable |
| PIA-BL-022 | P1 | Stock Intelligence | Stock targets per stock | Planned | Required for every stock detail view |
| PIA-BL-023 | P0 | Routing | Release Center opens Academy incorrectly | Planned | Owner: HERMES; Severity: HIGH; Sprint: 2C |
| PIA-BL-024 | P0 | Mobile Home | Market Pulse swipe gestures failing | Planned | Owner: ATHENA; Severity: HIGH; Sprint: 2C |
| PIA-BL-025 | P0 | Home Dashboard | Home widgets not clickable | Planned | Owner: ATHENA; Severity: CRITICAL; likely pointer-events/z-index issue; Sprint: 2C |
| PIA-BL-026 | P0 | Performance | Mobile stutter and smoothness degradation | Planned | Owner: ATHENA + HERMES; Severity: HIGH; motion/render cost issue; Sprint: 2C |
| PIA-BL-027 | P0 | Notifications | Notification Center responsive failure | Planned | Owner: ARTEMIS; Severity: CRITICAL; broken wrapping/mobile invisible state; Sprint: 2C |
| PIA-BL-028 | P1 | Technical Snapshot | Expand technical snapshot | Planned | Support/resistance levels, AI interpretation, trade scenarios, confidence meter, multi-timeframe modes |
| PIA-BL-029 | P1 | Company Research | Refactor Company tab into research hub | Planned | Merge Earnings, Financials, Ratios, and Targets inside Company tab |
| PIA-BL-030 | P1 | Videos | Rework videos experience | Planned | YouTube-style previews, featured media, thumbnail hierarchy |
| PIA-BL-031 | P1 | Scanner | Opportunity Board compression | Planned | Compact filter chips, remove oversized sort controls, mobile-first scanner rail |
| PIA-BL-032 | P0 | Notifications | Notification Center refactor | Planned | Mobile-safe sheet, grouped notifications, premium stacked cards, category identities |
| PIA-BL-033 | P1 | Intelligence Cards | Intelligence card density refactor | Planned | Compact mobile intelligence cards and expandable density system |

## Roadmap

| Phase | Theme | Scope | Exit Criteria |
| --- | --- | --- | --- |
| Sprint 2B | Mobile-first mock compliance | Home dashboard, mobile Home, app shell, workspace visibility, visual density, status dock | User can immediately see progress toward approved dark premium mocks |
| Sprint 2C | UAT failure remediation and density pass | Routing mismatch, broken swipe gestures, widget clickability, mobile performance, notification responsiveness | Critical UAT failures are fixed and mobile interactions are stable |
| V3 Foundation | Workspace platform | Preserve current dashboard while moving to configurable workspaces | Workspace registry and widget catalog remain source of truth |
| V3 Intelligence | Stock intelligence expansion | Analyst targets, unified intelligence feed, source badges, per-stock targets | Each stock detail has actionable intelligence |
| V3 Portfolio Ops | Watchlists and scanner depth | Watchlist operations, scanner workflows, market heatmaps | Workspaces feel operational, not static |
| V4 Platform | Persistence and backup | Cloud backup, restore, storage efficiency | Local-first remains reliable with optional sync |

## Architecture Decisions

| ID | Decision | Rationale | Status |
| --- | --- | --- | --- |
| ADR-001 | Preserve existing architecture | Avoid route and feature regressions | Approved |
| ADR-002 | Everything is a widget | Supports configurable workspace platform | Approved |
| ADR-003 | Reuse current dashboard widgets | Prevent duplicate widgets/pages | Approved |
| ADR-004 | Mobile customization uses workspace/widget registry | Keeps mobile and desktop aligned | Approved |
| ADR-005 | Local layout storage is local-first and keyed by workspace ID | Keeps customization fast and resilient | Approved |
| ADR-006 | TradingView is planned shared chart widget | Avoid fragmented chart implementations | Approved |
| ADR-007 | AI Core uses workspace redirect mode through short workspace context text | Keeps AI behavior scoped to workspace intent | Approved |
| ADR-008 | Integrations and health live inside settings, with status surfacing allowed in shell | Prevents noisy top-right system clutter | Approved |
| ADR-009 | No backend/API contract changes for visual compliance sprints | Keeps design work isolated | Approved |
| ADR-010 | Final stock intelligence tab order is Quote, Technical, News, Company, Videos | Locks the stock workspace navigation model for Sprint 2C implementation | Approved |
| ADR-011 | Company tab absorbs Earnings, Financials, Ratios, and Targets | Reduces tab sprawl while preserving research depth | Approved |
| ADR-012 | Technical tab becomes the home for support/resistance, AI interpretation, scenarios, confidence, and timeframe modes | Keeps actionable trading context in one workspace | Approved |
| ADR-013 | Videos tab requires media-first previews and thumbnail hierarchy | Prevents video intelligence from reading as raw text lists | Approved |
| ADR-014 | Notification Center must be a mobile-safe sheet with grouped premium cards | Fixes responsive failure and establishes notification category identity | Approved |

## UAT Log

| ID | Scenario | Expected Result | Status |
| --- | --- | --- | --- |
| UAT-001 | Build frontend | `npm run build` passes | Required before commit |
| UAT-002 | Load `/` | Home route returns 200 | Required before commit |
| UAT-003 | Load `/mobile` | Mobile route returns 200 | Required before commit |
| UAT-004 | Load `/setup` | Setup route returns 200 | Required before commit |
| UAT-005 | Privacy toggle | Amount visibility toggles and persists | Required before commit |
| UAT-006 | Mobile overflow | Mobile loads without horizontal overflow | Required before commit |
| UAT-007 | Workspace selector | Active Home/workspace state is visually clear | Required before release |
| UAT-008 | Widget reorder | Dashboard widget order can be changed and reset | Required before release |
| UAT-009 | Mobile controls | Quick controls open and perform useful actions | Required before release |
| UAT-010 | Notification center | Bell opens relevant alerts/empty state | Required before release |
| UAT-011 | Release Center routing mismatch | Release Center must not open Academy incorrectly | Failed; Owner: HERMES; Severity: HIGH; Sprint: 2C |
| UAT-012 | Market Pulse swipe | Swipe gestures must work on mobile Market Pulse | Failed; Owner: ATHENA; Severity: HIGH; Sprint: 2C |
| UAT-013 | Home widget clickability | Home widgets must be clickable and not blocked by pointer-events/z-index | Failed; Owner: ATHENA; Severity: CRITICAL; Sprint: 2C |
| UAT-014 | Mobile performance smoothness | Mobile interactions must not stutter from excessive motion/render cost | Failed; Owner: ATHENA + HERMES; Severity: HIGH; Sprint: 2C |
| UAT-015 | Notification Center responsiveness | Notification Center must wrap correctly and remain visible on mobile | Failed; Owner: ARTEMIS; Severity: CRITICAL; Sprint: 2C |

## Approved Mocks

Approved mocks are the source of truth for visual direction.

Mock compliance principles:

| Area | Approved Direction |
| --- | --- |
| Visual identity | Premium dark, glass, neon accents, cinematic depth |
| Dashboard density | Compact, information-rich, readable cards |
| Mobile Home | Polished one-hand command experience, not squeezed desktop |
| Workspace selector | Obvious active workspace and intentional navigation |
| Status | Important system status should move toward bottom-left dock or compact mobile status surface |
| Cards/widgets | Dense hierarchy, clear badges, no raw text blocks where structured UI is expected |

Locked UX decisions:

| Area | Decision |
| --- | --- |
| Stock tab order | Quote, Technical, News, Company, Videos |
| Technical Snapshot | Expand with support/resistance, AI interpretation, trade scenarios, confidence meter, and multi-timeframe modes |
| Company Research | Merge Earnings, Financials, Ratios, and Targets inside Company tab |
| Videos | Rework around YouTube-style previews, featured media, and thumbnail hierarchy |
| Opportunity Board | Compress filters and sort controls into a mobile-first scanner rail |
| Notification Center | Refactor into mobile-safe grouped premium stacked cards |
| Intelligence Cards | Reduce oversized horizontal cards and support expandable density |

## Agent Tasks

| Agent | Task | Branch | Commit Requirement | Status |
| --- | --- | --- | --- | --- |
| ATHENA | Sprint 2B mobile-first Home mock compliance | feat/v3-mobile-home-mock-athena | `feat: improve mobile-first home mock compliance` | Completed |
| ATHENA | Add master backlog source of truth artifacts | feat/pia-v3-foundation-integration | `docs: add PIA master backlog source of truth` | In progress |
| ATHENA + HERMES | Finalize Sprint 2B UX direction and governance updates | feat/pia-v3-foundation-integration | `feat: finalize sprint 2B UX direction and governance updates` | In progress |
| HERMES | Fix Release Center routing mismatch | feat/pia-v3-foundation-integration | TBD | Planned Sprint 2C |
| ATHENA | Fix Market Pulse swipe gestures | feat/pia-v3-foundation-integration | TBD | Planned Sprint 2C |
| ATHENA | Fix Home widget clickability | feat/pia-v3-foundation-integration | TBD | Planned Sprint 2C |
| ATHENA + HERMES | Reduce mobile performance lag | feat/pia-v3-foundation-integration | TBD | Planned Sprint 2C |
| ARTEMIS | Refactor Notification Center responsiveness | feat/pia-v3-foundation-integration | TBD | Planned Sprint 2C |
| Future agent | News UX V2 implementation | TBD | TBD | Planned |
| Future agent | Analyst Targets widget | TBD | TBD | Planned |
| Future agent | Unified Intelligence Feed | TBD | TBD | Planned |

## Governance Rules

Do not:

- Rewrite architecture.
- Replace working systems.
- Remove routes.
- Simplify the UI into a generic admin panel.
- Break mobile layout.
- Remove privacy mode.
- Create fake-only implementations.
- Create duplicate widgets or pages.
- Commit `.next`, sqlite files, pycache, or package-lock changes unless explicitly required.

Always:

- Preserve existing architecture.
- Extend current implementation.
- Validate before commit.
- Check route integrity.
- Preserve responsive behavior.
- Report changed files, commit hash, branch, validation, and known limitations.
