# Personal Investment Agent v5.6 — Internal UAT Report

## Test mode
- Run type: assistant internal UAT
- Data mode: simulation / demo where real credentials were unavailable
- Real external services not required for this pass
- IBKR live account validation: deferred to user environment
- Date: 2026-05-17

## Summary
- Total executed checks: 23
- Passed after fixes: 23
- Failed after fixes: 0
- Critical blockers: 0

## Fixes applied during UAT
1. Trade Engine API output now includes both `entry` and `entry_zone`, plus `reason`, so Trade Radar cards have explicit entry/stop/target fields.
2. Greek Tax Center now calculates tax on net taxable stock/options gains after loss offset and excludes UCITS ETFs from taxable result.
3. Dashboard widgets now support basic drag-and-drop reorder with localStorage persistence and reset layout control.

## UAT results

| ID | Area | Test | Result | Notes |
|---|---|---|---|---|
| UAT-001 | Backend | `/health` returns OK | PASS | App/version/settings DB visible |
| UAT-004 | Dashboard API | `/dashboard` has portfolio/macros/news/scanner/calendar/watchlist | PASS | Complete payload |
| UAT-009 | About | Changelog available | PASS | v5.3/v5.5/v5.6 visible |
| UAT-010 | About | QA checklist available | PASS | QA groups visible |
| UAT-011 | Integrations | Integration settings endpoint available | PASS | Settings JSON returned |
| UAT-048 | Settings | Settings save/reload persistence | PASS | SQLite persistence path passed |
| UAT-021 | Health | Source health monitor returns statuses | PASS | Simulated health returned |
| UAT-016 | Yahoo | Yahoo connector test responds | PASS | Simulated data received |
| UAT-018 | Seeking Alpha | Seeking Alpha connector test responds | PASS | Simulated RSS/session data received |
| UAT-022 | Portfolio | Portfolio KPIs exist | PASS | Total/cash/buying power/margin/positions |
| UAT-023 | Portfolio | Positions classification fields exist | PASS | STK present; options field structure available |
| UAT-025 | Exposure | Exposure map rows exist | PASS | Industry rows present |
| UAT-027 | Risk | Risk Doctor guardrails exist | PASS | Concentration/yield warnings returned |
| UAT-032 | Scanner | Rescan endpoint returns dashboard | PASS | Rescan complete |
| UAT-029 | Watchlist | Watchlist returns items | PASS | 4 demo opportunities |
| UAT-033 | Trade Engine | Entry/stop/targets/confidence/rationale | PASS | Fixed during UAT |
| UAT-036 | Stock Drawer | Stock profile endpoint returns news/fundamentals/forecast | PASS | Simulated fundamentals |
| UAT-041 | Thesis | Thesis save and stock profile visibility | PASS | Thesis stored and returned |
| UAT-044-047 | Tax | Import + Greek 15% + loss offset + UCITS exemption | PASS | Fixed during UAT; expected tax 180 on sample |
| UAT-COMPILE | Backend | Python compile all backend files | PASS | compileall passed |
| UAT-050 | Widgets | Drag/drop implementation present | PASS | HTML5 drag/drop reorder + localStorage |
| UAT-038 | Charts | TradingView embed exists | PASS | iframe widget present |
| UAT-008 | Navigation | Sidebar required sections visible | PASS | Dashboard/Portfolio/Opportunity/Trade/Risk/Tax/Integrations/About |

## Additional technical checks
- Frontend TypeScript check: PASS (`npx tsc --noEmit`)
- Backend uvicorn startup: PASS
- Backend `/health` via live server: PASS
- Backend `/dashboard` via live server: PASS
- Frontend dev server startup: PASS

## Known issues / deferred validation
1. `next build` in the sandbox compiles and type-checks but the container throws `EPIPE` during static page generation/build trace. `next dev` passed. This must be rechecked on Windows.
2. IBKR live account data cannot be validated in sandbox; validate with your Gateway.
3. Seeking Alpha authenticated session is scaffolded; true subscriber data must be validated with your session cookie/header.
4. Drag/drop is currently basic reorder, not full resize grid. Full grid resize remains V5.7 candidate.
5. Yahoo public connector is best-effort; should have fallback provider later.

## Release gate result
- Technical simulation UAT: PASS
- Ready for user UAT: YES
