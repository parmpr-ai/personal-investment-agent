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

## Roadmap

| Phase | Theme | Scope | Exit Criteria |
| --- | --- | --- | --- |
| Sprint 2B | Mobile-first mock compliance | Home dashboard, mobile Home, app shell, workspace visibility, visual density, status dock | User can immediately see progress toward approved dark premium mocks |
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

## Agent Tasks

| Agent | Task | Branch | Commit Requirement | Status |
| --- | --- | --- | --- | --- |
| ATHENA | Sprint 2B mobile-first Home mock compliance | feat/v3-mobile-home-mock-athena | `feat: improve mobile-first home mock compliance` | Completed |
| ATHENA | Add master backlog source of truth artifacts | feat/pia-v3-foundation-integration | `docs: add PIA master backlog source of truth` | In progress |
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
