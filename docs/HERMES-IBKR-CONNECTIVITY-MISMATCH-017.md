# HERMES-IBKR-CONNECTIVITY-MISMATCH-017

Date: 2026-06-22  
Priority: P0  
Status: Implemented and locally validated against an authenticated Client Portal Gateway

## A. Root Cause

PIA configured the Gateway as `https://localhost:5000/v1/api` and used Python `urllib` with a 2.0-second heartbeat timeout. On this Windows host, `localhost` resolves to both unavailable IPv6 loopback `::1` and working IPv4 loopback `127.0.0.1`. The Python request path took about 2.2 seconds through `localhost`, so it crossed the heartbeat timeout and produced `<urlopen error timed out>`. The same Python request to `127.0.0.1` completed in about 0.17 seconds and returned authenticated/established/connected.

Comparison evidence:

| Probe | Result |
| --- | --- |
| Python HTTPS `localhost:5000` | Authenticated response in about 2201 ms; exceeds provider heartbeat budget |
| Python HTTPS `127.0.0.1:5000` | Authenticated response in about 171 ms |
| HTTP port 5000 | Empty response; Gateway is HTTPS-only |
| TLS verification | Disabled for the local Gateway self-signed certificate |
| Proxy | No proxy detected; backend now explicitly bypasses proxies for Gateway requests |

The browser/manual check and provider were reaching the same Gateway service through different effective hostname paths. Persisted provider state was not the cause.

## B. Impact

- Provider heartbeat falsely reported the authenticated Gateway as offline.
- `ibkr-live` resolved to `LAST_UPDATE`, so Portfolio and quote diagnostics served snapshots.
- Live market-data snapshots and portfolio recalculation were not visible to the frontend.

## C. Fix Implemented

- Gateway configuration now reads `IBKR_BASE_URL`, `IBKR_PORT`, `IBKR_SSL_VERIFY`/`SSL_VERIFY`, `IBKR_TIMEOUT`, and `IBKR_PREFER_IPV4`.
- User-facing configuration remains `localhost`; backend transport maps local `localhost` to `127.0.0.1` by default.
- Gateway requests bypass system proxies and preserve the local self-signed TLS behavior.
- Backend startup logs configured/effective URL, port, TLS verification, and timeout.
- Every Gateway request logs full URL, host, port, path, timeout, elapsed time, and outcome.
- Added `GET /api/debug/ibkr-connectivity` and a matching frontend proxy route. The response omits IBKR machine identifiers.
- Legacy setup diagnostics now use the same Gateway transport as the live provider.

## D. Verification

Authenticated connectivity response:

```json
{
  "configuredUrl": "https://localhost:5000/v1/api",
  "effectiveUrl": "https://127.0.0.1:5000/v1/api",
  "authStatusResult": {
    "authenticated": true,
    "established": true,
    "connected": true,
    "competing": false
  },
  "responseTimeMs": 147.4,
  "exception": null,
  "sslVerification": false,
  "timeoutSeconds": 2.0
}
```

Four live reads over 41 seconds:

| Read | Source | AMD | Quote timestamp |
| --- | --- | ---: | --- |
| 1 | IBKR_LIVE | 546.89 | 2026-06-22T19:56:55.030628+00:00 |
| 2 | IBKR_LIVE | 546.64 | 2026-06-22T19:57:08.823726+00:00 |
| 3 | IBKR_LIVE | 546.50 | 2026-06-22T19:57:22.741810+00:00 |
| 4 | IBKR_LIVE | 546.29 | 2026-06-22T19:57:34.883967+00:00 |

Provider resolution returned `active_source=IBKR_LIVE`, `is_live=true`, `gateway_status=connected`, and fresh `IBKR_MARKETDATA_SNAPSHOT` timestamps. Live summary returned `pricesLive=true`, refreshed portfolio values, and `daily_pnl=null` because no reliable daily P&L value was supplied.

Validation completed:

- `python -m py_compile backend/main.py backend/services/portfolio_providers.py`
- Direct backend connectivity, provider status, live quotes, live positions, and live summary checks
- Frontend proxy checks for connectivity, live status, and live quotes
- Frontend production build

## E. Remaining Risks

- The Gateway certificate is local/self-signed, so TLS identity verification remains disabled by default. Traffic stays on loopback.
- Market data can be real-time, delayed, or unavailable according to the IBKR account's subscriptions and exchange permissions.
- If a deployment intentionally binds the Gateway only to IPv6, set `IBKR_PREFER_IPV4=false` or supply an explicit `IBKR_BASE_URL`.
- Live state still depends on the Client Portal Gateway remaining open and authenticated.

## Continuation Pack

- Use `/api/debug/ibkr-connectivity` first for transport/authentication failures.
- Use `/api/debug/live-status` to verify provider resolution and freshness.
- Use `/api/debug/live-quotes` to verify market-data timestamps and values.
- Correlate failures with `uvicorn.error` request logs containing URL, timeout, elapsed time, and exception.
