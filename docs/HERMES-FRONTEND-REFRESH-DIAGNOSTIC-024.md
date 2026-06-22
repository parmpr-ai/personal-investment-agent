# HERMES-FRONTEND-REFRESH-DIAGNOSTIC-024

Date: 2026-06-22  
Priority: P0  
Owner: HERMES  
Status: Diagnostic complete; implementation fix proposed, not applied in this task

## Executive Result

IBKR data acquisition is healthy. The stale UI is caused by the frontend delivery lifecycle, with an additional local dev-server integrity problem:

1. Frontend data paths are split between active backend port `8007` and hard-coded port `8000`.
2. Mobile and desktop have no polling fallback when the WebSocket is unavailable.
3. The dashboard cache uses stale-while-revalidate, so the first request after expiry intentionally returns the old payload and refreshes in the background. With no second request or working socket, React keeps the old payload indefinitely.
4. Setup checks authentication once when entering the step or pressing Retry. TFA approval is external and triggers no React dependency, so the authenticated state is not fetched until retry/navigation/reload.
5. During UAT, two Next dev servers were listening on port 3000 and served incompatible `.next` assets. JS/CSS chunks returned 404, preventing React hydration and all client-side refresh behavior.

No backend quote, portfolio calculation, or IBKR authentication failure was observed.

## 1. Refresh Flow Trace

```text
IBKR Client Portal Gateway
  -> IbkrLivePortfolioProvider refresh loop (12s)
  -> get_portfolio_payload()
  -> /dashboard cache (8s stale-while-revalidate) OR /ws push loop (1.5s)
  -> frontend transport
     mobile initial HTTP: /api/dashboard -> Next proxy -> 127.0.0.1:8007 [works once]
     mobile WebSocket: browser-host:8000/ws [zero frames]
     desktop HTTP: 127.0.0.1:8000/dashboard [no response]
     desktop WebSocket: 127.0.0.1:8000/ws [zero frames]
  -> React setDashboard()
     runs only for initial HTTP response or a WebSocket frame
```

The backend WebSocket on `8007` was probed independently and delivered three dashboard frames. The WebSocket on `8000` timed out during the opening handshake.

## 2. API Freshness Evidence

Relevant API responses now expose and log:

- `responseTimestamp`: when this HTTP response was served
- `quoteTimestamp`: quote snapshot represented by the response
- `portfolioTimestamp`: portfolio/summary snapshot represented by the response

Dashboard stale-while-revalidate proof:

| Read | Response timestamp | Quote timestamp | Portfolio value |
| --- | --- | --- | ---: |
| First expired-cache read | 20:26:31.262 | 20:23:57.178 | 94,610.51 |
| Second read after background refresh | 20:26:33.384 | 20:26:26.211 | 94,480.31 |

The first read returned stale data immediately and launched the refresh. The second read received the refreshed cache. This behavior is correct for a cache-first endpoint, but it requires a functioning subscriber or follow-up poll.

## 3. Frontend Runtime Evidence

### Mobile

After 18 seconds without reload:

- Dashboard HTTP responses: `1`
- Application WebSocket: `ws://127.0.0.1:8000/ws`
- WebSocket frames received: `0`
- Browser quote timestamp: `20:26:26.211`
- Live provider timestamp: `20:29:59.489`

After two reloads:

| Response | Portfolio value | Quote timestamp |
| --- | ---: | --- |
| Initial | 94,480.31 | 20:26:26.211 |
| Reload 1 | 94,555.38 | 20:29:42.510 |
| Reload 2 | 94,546.71 | 20:29:59.489 |

Reload creates the missing follow-up HTTP request, which is why F5 appears to fix live updates.

### Desktop Dashboard

Eight-second browser trace:

- Requested `http://127.0.0.1:8000/dashboard`, `/news-intelligence`, and `/source-health`
- Responses received: `0`
- WebSocket `ws://127.0.0.1:8000/ws` frames: `0`

The desktop bypasses the working Next proxy and active `8007` backend entirely.

### Setup / TFA

Ten-second browser trace on Setup step 3:

- Requests to `/setup/diagnostics`: `1`
- Responses: `0` because Setup targets port `8000`
- Automatic retries/polls: `0`

Source trace confirms the diagnostics effect depends only on `[step, diagnosticsRetry]`. External TFA approval changes neither value. Closing/reopening remounts the component and performs the missing request, explaining the reported behavior exactly.

### Next Dev Server Integrity

Before cleanup, port 3000 had two listeners from separate Next dev-server trees. `/mobile` returned HTML but its page JS and CSS chunks returned 404. The page did not hydrate, made no dashboard request, and created no application WebSocket. After stopping both trees, deleting the verified `frontend/.next` build cache, and starting one LAN-bound server, hydration worked and exposed the port-8000 transport failure above.

## 4. Cache Interaction

| Layer | TTL / cadence | Result |
| --- | ---: | --- |
| IBKR quote/provider bundle | 12s | Refreshing correctly |
| Dashboard route cache | 8s | Invalidates correctly; first expired request returns stale while background refresh runs |
| Provider status cache | 2s | Refreshing correctly |
| Backend WebSocket push | 1.5s | Working on port 8007 |
| Frontend polling | none | Missing fallback |

Cache invalidation is functioning. The contract failure is that the frontend consumes only the first stale response and never receives or requests the refreshed entry.

## 5. Root Cause Answers

### A. Why Portfolio Requires F5

Mobile performs one initial same-origin dashboard fetch and then relies on a WebSocket pointed at port 8000. The active backend is port 8007, and the port-8000 socket delivers no frames. There is no interval poll or reconnect fallback. If the initial dashboard response is stale, React keeps it until F5 issues another request.

### B. Why Dashboard Requires F5

Desktop hard-codes both HTTP and WebSocket to port 8000 instead of using the working Next proxy/backend configuration. Current browser traces received no HTTP responses and no WebSocket frames. State therefore cannot update after mount.

### C. Why Login Requires Reload After TFA

Setup hard-codes port 8000 and performs a one-shot diagnostics request. It does not poll while authentication is pending. TFA approval occurs outside React, so no effect dependency changes. Reload/remount performs the next check and reveals the already-authenticated Gateway.

### D. Recommended Fix

1. Create one shared frontend runtime configuration for HTTP and WebSocket URLs. Remove all hard-coded `8000` constants from Dashboard, MobileExperience, SetupWizard, and `pia-api.ts`.
2. Route browser HTTP through same-origin Next API proxies backed by `PIA_BACKEND_API`; configure the WebSocket explicitly with `NEXT_PUBLIC_PIA_WS`, defaulting to the active backend host/port.
3. Add WebSocket connection state, reconnect with bounded exponential backoff, and a 10-12 second HTTP polling fallback. Pause polling when hidden and refresh immediately on visibility/focus.
4. While Setup reports Gateway reachable but unauthenticated, poll diagnostics every 2 seconds. Stop on authenticated, step exit, or unmount. Add a same-origin Setup diagnostics proxy.
5. Preserve the 8-second stale-while-revalidate dashboard cache, but immediately re-fetch when response/quote age exceeds the cache TTL. Alternatively, add an explicit fresh-read contract for foreground live-mode requests.
6. Enforce one Next server and one backend port in development scripts. Kill stale process trees and rebuild `.next` before UAT when chunk mismatches occur.
7. Add automated lifecycle tests: quote changes without reload, socket failure falls back to polling, TFA pending transitions automatically, and stale cache is followed by a fresh state update.

## 6. Diagnostic Endpoint

`GET /api/debug/ui-refresh-status` returns:

- `portfolioLastUpdated`
- `dashboardLastUpdated`
- `providerLastUpdated`
- expected provider/WebSocket/cache intervals
- complete cache TTL inventory
- dashboard cache age/freshness/timestamps
- active source and live flags
- whether polling and Setup authentication polling exist

The matching frontend proxy also reports its configured backend and proxy response timestamp.

## 7. Continuation Pack

Implementation owner: HERMES until ARTEMIS is available.

Recommended implementation order:

1. `frontend/lib/pia-api.ts`: centralize HTTP/WS runtime configuration.
2. `frontend/components/mobile/MobileExperience.tsx`: replace port 8000 socket; add reconnect and poll fallback.
3. `frontend/components/Dashboard.tsx`: switch direct HTTP to same-origin proxy; use shared socket/reconnect/poll lifecycle.
4. `frontend/components/setup/SetupWizard.tsx`: same-origin diagnostics proxy and pending-auth polling.
5. `frontend/app/api/setup/diagnostics/route.ts`: add backend proxy.
6. Add Playwright tests covering no-F5 refresh and TFA transition.

Acceptance evidence for the implementation task must show one browser session receiving at least two changed portfolio values without reload and Setup transitioning from pending to authenticated without remount.
