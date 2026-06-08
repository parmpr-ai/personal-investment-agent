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



