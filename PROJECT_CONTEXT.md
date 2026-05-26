\# PIA PROJECT CONTEXT — SOURCE OF TRUTH



\## Project



PIA = Personal Investment Agent



Institutional-grade investment dashboard inspired by:



\* Bloomberg

\* IBKR

\* Seeking Alpha

\* Trading intelligence terminals



Tech stack:



\* Frontend: Next.js App Router + Tailwind

\* Backend: FastAPI

\* Broker: IBKR Gateway

\* Mobile-first responsive UI



\---



\# CRITICAL RULES



DO NOT:



\* rewrite architecture

\* replace working systems

\* remove routes

\* simplify UI

\* break mobile layout

\* remove privacy mode

\* create fake/mock-only implementations

\* create duplicate widgets/pages



ALWAYS:



\* preserve existing architecture

\* extend current implementation

\* validate before commit

\* check route integrity

\* preserve responsive behavior



\---



\# CURRENTLY IMPLEMENTED



✅ manual holdings

✅ privacy cleanup

✅ hydration fixes

✅ integrations only inside settings

✅ health only inside settings

✅ setup route preserved

✅ mobile route preserved

✅ news backend endpoint exists

✅ dashboard shell exists

✅ IBKR portfolio integration exists



\---



\# CURRENT UX DIRECTION



Goal:

Premium institutional UX.



NOT:



\* generic admin panel

\* crypto toy dashboard

\* template UI



Design language:



\* clean

\* cinematic

\* dense information

\* premium cards

\* smooth animations

\* responsive

\* one-hand mobile UX



\---



\# CURRENT PRIORITY



\## P0 NEWS UX V2



Implement:



\* real article titles

\* exact article links

\* PIA DIGEST section

\* Bias instead of Sentiment

\* Confidence instead of Impact

\* Possible Move instead of Sell the News

\* human readable actions

\* demo badge ONLY for mock data



\---



\# P0 BUGS



\* mobile settings empty

\* mobile quick controls dead

\* mobile bell inactive

\* widgets not draggable

\* dashboard widgets non movable



\---



\# IMPORTANT



Before ANY commit:



\* run frontend build

\* verify backend endpoints

\* verify no route regressions

\* verify mobile still works



After changes:



\* provide changed files

\* provide exact commit hash

\* provide exact branch name

\* provide validation results



Never claim success without verification.

---

# PIA V3 WORKSPACE FOUNDATION

PIA is evolving from a fixed dashboard into a fully custom multi-workspace platform while preserving the current dashboard and widgets.

Approved primary workspace:

* Home

Approved workspaces:

* My Portfolio
* Watchlists
* Scanner
* Markets & Macro
* AI Infrastructure
* Earnings Week
* Swing Trades
* Crypto
* Trade Coach
* Academy

Workspace source of truth:

* `frontend/components/workspace/workspaceRegistry.ts`

Widget catalog source of truth:

* `frontend/components/workspace/widgetCatalog.ts`

Workspace architecture rules:

* everything is a widget
* current dashboard widgets must be reused, not rewritten
* mobile customization must use the same workspace/widget registry
* local layout storage is local-first and keyed by workspace ID
* TradingView is the planned shared chart widget
* AI Core uses workspace redirect mode through short workspace context text

V3 backlog:

* Analyst Targets Intelligence Widget required per stock
* Unified Intelligence Feed sources: Yahoo, Discord, SA, Reuters, PIA, X, IBKR
* Watchlists add/remove/sort/company logo/mini charts
* Sector & industry heatmap
* Trade Coach voice mode
* Academy workspace
* Cloud backup/restore
* Performance/storage efficiency requirements
* Stock targets required per stock



