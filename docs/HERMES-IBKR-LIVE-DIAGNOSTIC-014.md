# HERMES-IBKR-LIVE-DIAGNOSTIC-014

Date: 2026-06-22
Owner: HERMES
Status: Diagnostic complete

## A. Root Cause

The current environment is not actually connected to the IBKR Client Portal Gateway.

Observed provider status on `http://127.0.0.1:8007/api/debug/live-status`:

* `gatewayConnected: false`
* `accountConnected: false`
* `marketDataSubscribed: false`
* `active_source: LAST_UPDATE`
* `fallback_active: true`
* `provider_class: SnapshotPortfolioProvider`
* `gateway_error: <urlopen error timed out>`

That means the UI is not receiving fresh IBKR live quotes. It is reading the last-update snapshot path, which explains why prices and portfolio values appear static.

## B. Impact

* Portfolio values do not visibly move in real time.
* Quote timestamps do not advance on repeated reads.
* The frontend can only show last-update data while the gateway remains unavailable.
* The problem is not in the browser render path alone. The backend is not delivering live market data in this session.

## C. Live Quote Trace

Every quote response now exposes:

* `symbol`
* `conid`
* `source`
* `quoteTimestamp`
* `serverTimestamp`
* `ageSeconds`

Current diagnostic result for `AMD`, `NVDA`, `TSM`, and `SOFI`:

* source stayed `LAST_UPDATE`
* `AMD` and `SOFI` retained the same quote timestamp across ten consecutive requests
* `NVDA` and `TSM` had no live quote payload available in the snapshot path

## D. Cache Layers

Active cache layers reported by the backend:

* `quoteCacheTtlSeconds: 12`
* `portfolioCacheTtlSeconds: 12`
* `dashboardCacheTtlSeconds: 8`
* `stockCacheTtlSeconds: 10`
* `providerStatusCacheTtlSeconds: 2`
* `contextCacheTtlSeconds: 10`
* `contextBatchCacheTtlSeconds: 10`
* `yahooFundamentalsCacheTtlSeconds: 12`
* `yahooNewsCacheTtlSeconds: 12`
* `providerCacheDb: backend/pia_provider_cache.sqlite3`

This trace shows the backend is not stuck in the browser proxy. The proxy is returning partial responses quickly once the debug endpoints were trimmed, and the stale values originate upstream.

## E. Provider Flow

`IBKR Gateway` -> `Quote Service` -> `Cache Layer` -> `Portfolio Service` -> `API` -> `Frontend`

Staleness enters at the gateway step in this session:

* the gateway heartbeat times out
* provider resolution falls back to `LAST_UPDATE`
* cached snapshot values are then surfaced through the API
* the frontend renders the cached data correctly, but it is not live

## F. Validation

### Fast endpoint checks

`GET /api/debug/live-status`

* returned `200`
* direct backend response time: ~203 ms
* browser proxy response time: ~222 ms

`GET /api/debug/live-quotes`

* returned `200`
* direct backend response time: ~181 ms
* browser proxy response time: ~232 ms

### Ten consecutive quote reads

Ten direct reads of `GET /api/debug/live-quotes` returned the same quote timestamps for the visible symbols:

* `AMD`: `2026-06-22T19:12:13.830457+00:00`
* `SOFI`: `2026-06-22T19:12:13.830457+00:00`

That confirms the backend is serving a stable snapshot, not fresh live pricing.

## G. Remaining Risk

Live pricing still depends on a healthy IBKR Client Portal Gateway session with market data access. Until that gateway is available again, live quotes will continue to fall back to last-update data.

## H. Continuation Pack

Next validation pass should focus on:

1. verifying gateway connectivity and authentication
2. confirming market data subscription state
3. checking that live quote trace entries switch from `LAST_UPDATE` to `LIVE`
4. re-running the ten-request quote test and confirming timestamps advance
5. checking portfolio recalculation after live quote refresh

