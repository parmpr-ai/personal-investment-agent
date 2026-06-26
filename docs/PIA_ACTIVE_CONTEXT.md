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

* Live IBKR position metrics mapping and score provenance cleanup
* Research data and live contract hardening for AMD/NBIS and portfolio contracts
* Mobile live refresh blink stabilization so live polling updates values in place without full-screen remounts
* Live quote propagation alignment so hero, AI context, and position table follow the same live dashboard seed
* Live position metric recalculation so day P/L, day %, and unrealized stay derived from live quote inputs with provenance
* Live price provider fallback so portfolios keep updating with Yahoo Finance quotes when IBKR is disconnected while preserving the latest IBKR positions snapshot
* IBKR source lifecycle recovery so settings, provider status, portfolio, dashboard, and mobile all read the same Live IBKR / Snapshot / Demo contract
* Sparkline visual-system CR: Home/index cards keep Yahoo Finance-style sparkline; stock cards keep movement sparkline but use green above baseline and red below baseline instead of one flat color



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



### Sparkline Visual System

Task ID: CR-UI-SPARKLINE-001

Status: OPEN / TO DO

Owner: ARTEMIS

Area: Home Market Cards / Market Index Cards / Individual Stock Cards

Issue: #3

Decision:

* Home and market index cards must keep the Yahoo Finance-style sparkline direction because the Product Owner likes that visual treatment.
* Individual stock cards must keep the movement sparkline because it communicates how the stock moved.
* Stock sparklines must not use one flat color for the whole line.
* Stock sparklines must render green when the series is above the baseline/reference level and red when below it.
* Baseline/reference level should be clear enough to explain the color split without adding visual clutter.
* No locked layouts should change; this is only a sparkline visual-treatment CR.

Acceptance criteria:

* Home/index card sparkline matches the clean Yahoo Finance-style mobile pattern.
* Stock card sparkline preserves movement shape and uses green-above/red-below baseline coloring.
* Works first on 390px mobile and remains readable on desktop.
* Uses available market series data; no placeholder chart data may be introduced.
* Before/after UAT screenshots must be attached before closing.

Documentation sync required:

* Add this CR to docs/PIA_MASTER_BACKLOG_SOURCE_OF_TRUTH.md.
* Add/sync the same CR to docs/PIA_MASTER_BACKLOG_SOURCE_OF_TRUTH.xlsx.

---

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
