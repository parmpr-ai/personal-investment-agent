# HERMES-LIVE-REFRESH-FIX-025

Date: 2026-06-23
Priority: P0
Owner: HERMES
Status: Implemented and locally validated

## Outcome

Frontend live recovery no longer depends on F5. Desktop and mobile now share one HTTP/WebSocket configuration and one resilient dashboard lifecycle. Setup automatically observes external IBKR authentication while the Gateway is pending.

## Implementation

### Shared Runtime Configuration

`frontend/lib/runtime-config.ts` is the single source of truth:

- `API_BASE_URL`: `NEXT_PUBLIC_PIA_API` or the browser hostname on backend port `8007`
- `WS_BASE_URL`: `NEXT_PUBLIC_PIA_WS` or the browser hostname on backend port `8007`
- `NEXT_PUBLIC_PIA_BACKEND_PORT`: optional port override
- `fetchApi()`, `apiUrl()`, and `wsUrl()` shared helpers

All hard-coded runtime port `8000` references were removed from Desktop, Mobile, Setup, and `pia-api.ts`.

### Dashboard Recovery

`frontend/lib/use-live-dashboard.ts` now owns the full lifecycle for Desktop and Mobile:

1. Immediate dashboard HTTP fetch.
2. WebSocket connection to the shared `WS_BASE_URL`.
3. React state update for every `dashboard_update` frame, including Portfolio, Dashboard, and Watchlists data.
4. Automatic reconnect with bounded exponential backoff after socket close.
5. Ten-second HTTP polling fallback when disconnected or when no frame arrives for ten seconds.
6. Polling stops after a valid WebSocket frame.
7. Immediate refresh on browser focus/visibility return.
8. A stale dashboard response schedules a second fetch after 750 ms so stale-while-revalidate cannot remain pinned in React.

### Setup / TFA Recovery

Setup uses the shared API configuration. While Gateway is reachable but `ibkr_authenticated=false`, diagnostics poll every two seconds. Polling stops as soon as authenticated state is returned, the user leaves the step, or the component unmounts. Transient diagnostics failures retry while the step remains active.

### Diagnostic Contract

`GET /api/debug/ui-refresh-status` now reports:

- `frontendPollingSeconds=10`
- `setupAuthenticationPollingSeconds=2`
- `pollingFallback=true`
- `setupAuthenticationPolling=true`

## UAT Evidence

### WebSocket State Updates

Controlled dashboard frames changed total value from `50 -> 101 -> 202` without reload.

| Surface | WebSocket | HTTP requests | Final rendered value | Result |
| --- | --- | ---: | ---: | --- |
| Mobile | `ws://127.0.0.1:8007/ws` | 1 | $202.00 | PASS |
| Desktop | `ws://127.0.0.1:8007/ws` | 1 | $202.00 | PASS |

No port `8000` request was observed.

### Stale Cache + Polling Fallback

A silent WebSocket received no frames. The first HTTP response was deliberately 60 seconds stale.

| Request | Value | Trigger |
| ---: | ---: | --- |
| 1 | $100.00 | Initial fetch; stale response |
| 2 | $200.00 | 750 ms stale-response retry |
| 3 | $300.00 | Ten-second no-frame polling fallback |

The final `$300.00` value rendered without reload.

### WebSocket Reconnect

The first controlled socket closed abnormally. The hook created a second connection automatically (`connections=2`) using reconnect backoff.

### Setup / TFA

Setup diagnostics returned unauthenticated, then authenticated on the next poll:

- Requests: `2`
- Measured interval: `2248 ms`
- `IBKR authenticated` changed to `Ready`
- Pending guidance cleared without reload or remount

### Screenshots

- `frontend/uat-screenshots/hermes-live-refresh-fix-025/mobile-websocket-refresh.png`
- `frontend/uat-screenshots/hermes-live-refresh-fix-025/desktop-websocket-refresh.png`
- `frontend/uat-screenshots/hermes-live-refresh-fix-025/setup-tfa-auto-ready.png`

### Build

- `python -m py_compile backend/main.py`
- `npx tsc --noEmit`
- `npm run build` passed using isolated ignored `NEXT_DIST_DIR=build/live-refresh-025` because another shared-workspace lifecycle was modifying the default `.next` directory.
- Production routes generated: 12/12.

## Known Limitations

- The IBKR Gateway was unavailable during final 2026-06-23 UAT, so deterministic frontend contract frames were used for changing-value evidence. The provider had already been independently validated live in HERMES-IBKR-CONNECTIVITY-MISMATCH-017.
- LAN/mobile WebSockets require backend port `8007` to be bound to `0.0.0.0` and allowed through the local firewall.
- The shared workspace still requires one Next process at a time. `NEXT_DIST_DIR` is available for isolated build/UAT output when another lifecycle owns `.next`.

## Continuation Pack

When the Gateway is next authenticated:

1. Open `/mobile` and `/` for at least 30 seconds without reload.
2. Confirm `ws://<host>:8007/ws` receives frames and no 10-second polling requests occur while frames remain healthy.
3. Confirm `pricesLastRefresh`, portfolio total, and position prices advance in React.
4. Close the Gateway and confirm polling continues with `LAST_UPDATE` rather than a frozen screen.
5. Reauthenticate through TFA and confirm Setup changes to Ready within one two-second poll cycle.

No further implementation is required for the refresh lifecycle unless real-device UAT identifies a platform-specific socket or firewall restriction.
