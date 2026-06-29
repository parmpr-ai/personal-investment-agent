# Personal Investment Agent — Changelog

## v0.3.53 - Portfolio Engine Architectural Refactor (ARTEMIS-PORTFOLIO-ENGINE-REFACTOR-061)

Date: 2026-06-26
Status: PENDING UAT
Owner: ARTEMIS

### Architecture — New Canonical Portfolio Pipeline

This release replaces the multi-path portfolio calculation with a single deterministic pipeline:

**Provider Manager → Quote Engine → Portfolio Calculator → Canonical Portfolio DTO → All consumers**

#### New Files

* **`backend/services/quote_engine.py`** — `QuoteEngine` singleton with priority-ordered market data:
  - P1: IBKR Live (prices embedded in normalized positions)
  - P2: Yahoo Finance (live/delayed quotes for STK/ETF/CRYPTO)
  - P3: Last Known (server-session cache, survives brief outages)
  - P4: NO_DATA (options with no IBKR + cold start)
  - `prime_cache()`: pre-populates last-known from snapshot positions so options have a price after restart
  - Structured logs: `[QUOTE_PROVIDER]`, `[PROVIDER_SWITCH]`

* **`backend/services/portfolio_calculator.py`** — `calculate()`: single pure function
  - Input: raw positions (no prices) + QuoteEngine quotes + optional IBKR summary
  - Computes: `market_value = qty × last × multiplier` per position (options: multiplier=100)
  - Cost basis: `avg_cost × qty` (avgCost from IBKR is already per-contract — no extra multiplier)
  - Portfolio total: IBKR NLV when live (authoritative), `Σ(MV) + cash` when offline
  - Account fields (buying_power, excess_liquidity, margins): passed from IBKR summary when live; `None` when offline
  - Structured log: `[PORTFOLIO_CALCULATED]`

* **`backend/services/provider_manager.py`** — `get_canonical_portfolio()`: orchestrator
  - Calls `resolve_portfolio_provider()` for deterministic source detection
  - IBKR_LIVE: loads bundle via `_load_bundle()`, extracts positions + IBKR summary
  - LAST_UPDATE: loads snapshot, strips stale computed fields, seeds QuoteEngine cache
  - Falls through to MOCK when no positions available
  - Structured logs: `[SNAPSHOT_LOAD]`, `[PROVIDER_SWITCH]`, `[CANONICAL_DTO]`

#### `backend/main.py` — Wiring

* `get_portfolio_payload()` now calls `get_canonical_portfolio(resolution=resolution)` for all IBKR and Snapshot paths
* `_normalize_portfolio_after_price_overlay()` is **bypassed** — PortfolioCalculator replaces its logic with a single deterministic path
* Error recovery path also uses `get_canonical_portfolio()` (no longer calls `_normalize_portfolio_after_price_overlay` on snapshot)
* MOCK path is **unchanged** — continues through existing `MockPortfolioProvider.get_portfolio()`

#### Why

The PO UAT after ARTEMIS-060 confirmed values still differ from IBKR. Root cause: three separate functions computed portfolio totals with slightly different formulas:
1. `_normalize_live_summary()` — used IBKR NLV (correct)
2. `IbkrLivePortfolioProvider.get_portfolio()` — re-summed positions (wrong)
3. `_normalize_portfolio_after_price_overlay()` — re-summed again with cash (wrong)

This refactor eliminates paths 2 and 3. The PortfolioCalculator is the **only** place that computes portfolio values.

---

## v0.3.52 - Portfolio Engine Stabilization (ARTEMIS-PORTFOLIO-ENGINE-STABILIZATION-060)

Date: 2026-06-25
Status: READY FOR UAT
Owner: ARTEMIS (temporarily owns frontend + backend for this epic)

### Backend — Portfolio Total Deviation Fix (P0)

* **ROOT CAUSE FIXED: ~30K Portfolio Total deviation** — `_normalize_live_summary` was computing `total_value = cash + sum(position.market_value)`. This excluded non-position assets: money market funds, accrued interest, pending settlements, bond coupons. IBKR's `netliquidation` field (the canonical NLV) is now preferred as primary. Computed sum is fallback only.
* **`_normalize_portfolio_after_price_overlay` updated** — For `IBKR_LIVE` mode: preserves IBKR-reported NLV from summary (exact, includes all assets). For `LAST_UPDATE`/snapshot mode: recomputes from live-priced positions (snapshot NLV is stale after Yahoo price overlay).
* **Margin/liquidity fields explicitly propagated** — `excess_liquidity`, `maint_margin_req`, `init_margin_req`, `available_funds`, `gross_position_value` are now explicitly included in both `payload.update()` and `summary.update()` in the overlay function, preventing them from being silently dropped.

### Backend — Observability

* **`[QUOTE_UPDATE]`** log event emitted after Yahoo Finance price fallback is applied. Fields: `source=YAHOO_FALLBACK`, `updated_positions`, `prices_live`, `positions_source`, `refresh`.
* **`[PORTFOLIO_RECALCULATED]`** log event emitted at the end of `_normalize_portfolio_after_price_overlay`. Fields: `source`, `total_value`, `net_liq`, `positions`, `daily_pnl`, `prices_live`.

### Backend — Trade History Pagination

* `/api/portfolio/live/trades` now supports `?limit=N&offset=M&symbol=SYM&side=BUY|SELL` query parameters. Results are sorted newest-first. Response includes `total`, `has_more`, pagination metadata.

### Frontend — Metric Accuracy Fix

* **Desktop `ibkrMetrics`** — Replaced hardcoded approximations with actual backend fields:
  - `Excess Liq.`: now uses `p.excess_liquidity` (was `buying_power × 0.85`)
  - `Maint. Mgn`: now uses `p.maint_margin_req` (was `total × 0.22`)
  - `Init. Mgn`: now uses `p.init_margin_req` (was `total × 0.15`)
  - `Realized P/L`: now uses `p.realized_pnl` (was hardcoded `$0.00`)
  - Shows `—` when field is not available (e.g. snapshot with no margin data).
* **Mobile `fullMetrics`** — Same fix for `excessLiq`, `maintMgn`, `initMgn`: use `portfolio.excess_liquidity`, `portfolio.maint_margin_req`, `portfolio.init_margin_req` with computed fallback for backward compat.

### Frontend — IBKR Trade History Panel

* New `IBKRTradesPanel` component in `PortfolioPage` (full-width panel below Exposure Map and Portfolio Scanner).
* Fetches from `/api/portfolio/live/trades` with pagination and symbol/side filters.
* Displays: date, symbol, side (green BUY / red SELL), quantity, price, commission. 25 trades per page. Pagination controls shown when total > 25.
* CSS: `.ibkr-trades-panel`, `.ibkr-trades-table`, `.ibkr-trades-filters`, `.ibkr-trades-pagination` added to `globals.css`.

### Documentation

* Created `docs/IBKR_FIELD_MAPPING.md` — canonical mapping of IBKR API fields to PIA fields for portfolio summary, positions, and market data. Documents the 30K deviation root cause and options cost_basis root cause.

---

## v0.3.51 - Portfolio Production Polish (ARTEMIS-PORTFOLIO-PRODUCTION-POLISH-059)

Date: 2026-06-25
Status: READY FOR UAT
Owner: ARTEMIS

### Portfolio Header Simplification

* **Timestamps removed** from both Desktop and Mobile portfolio headers. No `Last updated at…`, no `Next refresh in…`, no `Snapshot as of…` text anywhere in the header.
* **Source badge replaced** with subtle dot indicator: `● IBKR` / `● Snapshot` / `● Demo`. Implemented via `dotSourceLabel()` function (canonical in `pia-api.ts`). CSS class `.pf-source-dot` (10px, muted, no background).
* **Header label** changed from `Portfolio · NLV` to `Portfolio` (Desktop), `Portfolio` (Mobile). Clean and minimal.

### Currency Toggle — Segmented Control

* Single `cur-chip` cycling button replaced with `$ | €` segmented control (`.cur-seg` + `.cur-seg-btn`). Active state highlighted blue (`#7dc4ff`). Present on both Desktop (`PortfolioSnapshot`) and Mobile (`PortfolioHeader`). Identical design on both surfaces.

### CSS Added

* `.pf-source-dot`, `.cur-seg`, `.cur-seg-btn`, `.cur-seg-btn.active`, `.snapshot-source-row`, `.mtt-sym-label`, `.mtt-sym-option`, `.row-symbol b` overflow guards.

---

## v0.3.50 - ARTEMIS Portfolio UX Pass (ARTEMIS-PORTFOLIO-UX-058)

Date: 2026-06-25
Status: READY FOR UAT
Owner: ARTEMIS

### Mobile — Currency Toggle in Portfolio Header (MobileExperience.tsx)

* **Currency toggle added to `PortfolioHeader`** — `useCurrency(fxRate)` hook now wired into the portfolio header (previously only in the PortfolioInsights swipe rail). A `cur-chip` button appears inline with the source badge and toggles between `$ USD` / `€ EUR`. Persists via `localStorage` (`pia.currency`).
* **Hero NLV and summary metrics converted** — `PortfolioHeader` now uses `fmt()` for: hero Net Liquidation Value, Day P&L, Unrealized P&L, Realized P&L, and all `fullMetrics` monetary fields (Market Value, Excess Liq, SMA, Buying Power, Maintenance Margin, Initial Margin, Cash). Theta/Vega currency symbol also follows the selected currency.
* Individual position rows remain in trading currency (ARTEMIS constraint: no position-level FX conversion).

### Option Presentation — Clean Labels (Desktop + Mobile)

* **Desktop table ticker column** — `PositionsTable.renderCell('ticker')` now shows `AAPL 200C JAN25` format for options instead of raw IBKR contract string (e.g. `SPY   250117C00500000`). `resolveAssetClass()` detects options; `formatOptionSymbol()` builds the label from `underlying`, `strike`, `call_put`, and `expiry`.
* **Mobile position card header** — `PositionCard` card header `<strong>` now shows the clean option label for options, matching Mobile table rows (which were already correct via `renderTickerCell`).
* `CompanyLogo` in desktop ticker now uses `underlying` as the logo symbol for options.

### Settings — Integrations Tab Simplified

* **Integrations tab** now shows only `PortfolioDataSourceCard`: Portfolio Source (Mock / Last Update / Live IBKR), Current Source, Last Updated. Full integration detail (health, connectors, data preview) removed from the Integrations tab.
* **System → Advanced Diagnostics** — new collapsible section in the System tab exposes the full `IntegrationCenter` (connector health, Yahoo, Seeking Alpha, RSS, FRED, Telegram, Discord, OpenAI). Hidden by default; revealed by "Show" button.

### No Backend Changes

ARTEMIS owns presentation only. No backend files, no calculation logic, no API contracts modified.

---

## v0.3.49 - HERMES Production Stabilization Sprint (HERMES-PROD-STABILIZATION-057)

Date: 2026-06-25
Status: READY FOR UAT
Owner: HERMES

### Backend (portfolio_providers.py)

* **BUGFIX: Options cost_basis double-multiplication eliminated** — `_normalize_live_positions()` was computing `cost_basis = avgCost × qty × multiplier`. IBKR's `avgCost` is already per-contract (i.e. `avgPrice × multiplier`), so multiplying by `multiplier` again caused a 100× overstatement of cost basis for every option position, making unrealized P&L appear deeply negative. Fixed to `avgCost × qty`.
* **Day P&L now populated for options** — Added IBKR market data fields `82` (Change %) and `83` (Change) to `_QUOTE_FIELDS`. `_overlay_live_quotes()` now passes IBKR-reported day change as `official_day_change` / `official_day_change_pct` to `_derive_day_metrics()`. Day P&L is now computed even when `previousClose` is absent (common for options).
* **`/api/debug/source-trace` enhanced** — Now returns `snapshotPositions` (array of symbol/qty/market_value per position), `lastSwitchDurationMs` (how long the source resolution took), and structured per-event `switchDurationMs`.
* **`resolve_portfolio_provider()` timing** — Source resolution is now timed end-to-end; `switchDurationMs` is included in `[SOURCE_SWITCH]` log events and the source trace state.

### Frontend (Dashboard.tsx)

* **Removed per-row provider labels** — The `YH` / `IBKR` / `STALE` source badges displayed on each "Last Price" cell in the portfolio table have been removed. Provider source information now appears exclusively in Settings → Integrations. `resolvePositionPriceSource` import removed.

### Canonical Field Mapping (both surfaces)

Both Desktop and Mobile consume the same canonical position fields from the backend:

| Canonical field | IBKR positions endpoint | IBKR market data |
|---|---|---|
| `last` | `mktPrice` / `lastPrice` | field `31` |
| `day_change` | — (derived) | field `83` |
| `day_change_pct` | — (derived) | field `82` |
| `previousClose` | `closePrice` | field `86` |
| `day_pnl` | derived: `day_change × qty × multiplier` | — |
| `day_pnl_pct` | derived: `day_pnl / prev_mkt_value × 100` | — |
| `market_value` | `mktValue` | recalc: `last × qty × multiplier` |
| `cost_basis` | `avgCost × qty` | — |
| `unrealized` | `unrealPnl` → recalc: `mv − cost_basis` | — |
| `unrealized_pct` | derived: `unrealized / cost_basis × 100` | — |
| `avg_price` | `avgPrice` | — |
| `avg_cost` | `avgCost` (per-contract) | — |
| `qty` | `position` | — |
| `multiplier` | `multiplier` (100 for options) | — |

### Summary Account Fields (IBKR → Canonical)

| IBKR `ledger` / `summary` field | Canonical | REST API |
|---|---|---|
| `netliquidation.amount` | `net_liquidation` = `total_value` | `portfolio.total_value` |
| `totalcashvalue.amount` | `cash` | `portfolio.cash` |
| `buyingpower.amount` | `buying_power` | `portfolio.buying_power` |
| `availablefunds.amount` | `available_funds` | — |
| `maintmarginreq.amount` | `maint_margin_req` | — |
| `grosspositionvalue.amount` | `gross_position_value` | — |
| `excessliquidity.amount` | `excess_liquidity` | — |
| `sum(position.day_pnl)` | `daily_pnl` | `portfolio.daily_pnl` |
| `sum(position.unrealized)` | `unrealized` | `portfolio.unrealized` |

## v0.3.48 - End-to-End Portfolio Source Recovery (HERMES-END-TO-END-PORTFOLIO-RECOVERY-056)

Date: 2026-06-24
Status: READY FOR UAT
Owner: HERMES + Senior Dev closure

### Backend (portfolio_providers.py / main.py)

* **Source lifecycle engine** — `resolve_portfolio_provider()` enforces locked priority: IBKR LIVE → Snapshot → Demo. No manual intervention, no restart required.
* **Snapshot write guard** — `_persist_live_snapshot()` validates every candidate before writing. Rejects bundles with zero portfolio value, zero positions, missing account ID, or non-finite numeric fields. Last known good snapshot is never overwritten by an invalid refresh.
* **Live provider source honesty** — `IbkrLivePortfolioProvider.get_portfolio()` now returns `source` and `mode` from `_load_bundle()` instead of hardcoding `IBKR_LIVE`. If the live fetch fails mid-request and falls back to snapshot, the frontend sees `LAST_UPDATE` not a false `IBKR_LIVE`.
* **Live provider snapshot fallback** — `_load_bundle()` recovers from a live fetch error using the last saved snapshot. Only returns `NO_DATA` if no snapshot exists.
* **`get_snapshot_state()`** added to `SnapshotPortfolioProvider` (was missing, caused `AttributeError` when the gateway went offline).
* **Lifecycle logs** — structured log tags emitted on every state transition: `[LIFECYCLE]`, `[SOURCE_SWITCH]`, `[SNAPSHOT_SAVE]`, `[SNAPSHOT_REFRESH]`, `[SNAPSHOT_REJECTED]`, `[MOBILE_SOURCE]`, `[DASHBOARD_SOURCE]`.
* **`/api/debug/source-trace`** endpoint — exposes `currentSource`, `previousSource`, `lastSwitchReason`, `snapshotTimestamp`, `snapshotPortfolioValue`, `snapshotPositionCount`, `gatewayConnected`, `authenticated`, recent event log.
* **Removed duplicate `_normalize_mode`** — second definition at line 3257 was dead code overriding the canonical first definition.

### Frontend (use-live-dashboard.ts / Dashboard.tsx / MobileExperience.tsx)

* `useLiveDashboard` now accepts `surface: 'desktop' | 'mobile'` and passes `?surface=` to `/api/dashboard`. Both surfaces call the **same** backend endpoint via the same-origin Next.js proxy — no direct cross-origin calls from the mobile client.
* `commitDashboard` validates that the response contains `portfolio.positions` array before updating state. A partial or error response does **not** reset a valid previous state.
* Desktop uses `useLiveDashboard('desktop')`, mobile uses `useLiveDashboard('mobile')` — both log `[DASHBOARD_SOURCE]` / `[MOBILE_SOURCE]` on source change.
* `next.config.js` merged to single export to prevent cache collision between concurrent mobile/desktop dev servers.

### Tests (backend/tests/test_snapshot_lifecycle.py)

8 new unit tests covering: valid snapshot persist → failed refresh does not overwrite → periodic refresh replaces after interval → snapshot recovery → zero-value reject → production resolver priority chain → live bundle snapshot fallback → no-data when no snapshot.

### Validation

* `python -m pytest tests/test_snapshot_lifecycle.py -v` — 8/8 PASS
* `python -c "import services.portfolio_providers"` — import clean
* `npx tsc --noEmit` — 0 errors

## v0.3.47 - IBKR Source Lifecycle Recovery (HERMES-IBKR-RECOVERY-052)

Date: 2026-06-24
Status: READY FOR UAT
Owner: HERMES

### Backend

* `get_provider_status()` now resolves from the live runtime source path so an authenticated IBKR Gateway reports `IBKR_LIVE` instead of a stale persisted mode.
* The gateway heartbeat now falls back to the accounts probe when auth/status is inconclusive, which prevents false disconnected states on the provider route.
* Provider status, `/portfolio`, `/dashboard`, settings, and mobile now read the same source-of-truth contract and automatic snapshot/demo fallback remains intact.

### Frontend

* Settings now shows a compact `Portfolio Source` card with `Current Source` and `Last Updated`, matching the portfolio source contract.
* Desktop settings now receives the portfolio source seed from the dashboard so the source badge stays in sync.

### Validation

* `python -m py_compile backend/main.py backend/services/portfolio_providers.py`
* `python -m unittest discover -s tests -p 'test_*.py'`
* `npm run build`
* Live endpoint checks confirmed `provider/status`, `/portfolio`, and `/dashboard` all report `IBKR_LIVE` in this workspace.

## v0.3.46 - Price Provider Fallback UX (ARTEMIS-PRICE-PROVIDER-FALLBACK-UX-045)

Date: 2026-06-24
Status: READY FOR UAT
Owner: ARTEMIS

### Frontend

* Portfolio header badge is now variant-aware: `IBKR LIVE` → green (`ibkr`), `HYBRID LIVE` → amber (`warning`) with subtitle "Last IBKR positions + live Yahoo quotes", `LAST UPDATE` → blue (`info`), `MANUAL + LIVE QUOTES` → yellow (`yahoo`).
* `resolvePortfolioBadge()` added to `pia-api.ts` — auto-infers HYBRID LIVE when `fallback_active + pricesLive`, handles all new mode strings (`HYBRID_LAST_POSITIONS_LIVE_QUOTES`, `MANUAL_HOLDINGS_LIVE_QUOTES`, `DISCONNECTED`).
* `resolvePositionPriceSource()` added — maps `priceSource`/`quote_source`/`price_source` fields to `ibkr | yahoo | stale | null`.
* Dual timestamp row added to the portfolio header: **Positions:** Xm ago / **Prices:** Xm ago (shown only when `positionsLastRefresh` or `pricesLastRefresh` present).
* Amber stale-prices banner added: "⚠ Prices may be stale — last updated Xm ago" shown when `pricesLive === false` in non-mock mode; no full-screen block.
* Per-position source markers in the Last column: tiny `YH` / `IBKR` / `STALE` chips rendered only when `priceSource` is explicitly set, so no visual clutter when data is absent.
* `MobileStatusDock` shows portfolio mode badge inline in the dock header; IBKR row shows `degraded` in hybrid mode; stale prices strip appears below dock rows when `pricesLive === false`.
* Mobile portfolio header and positions-count badges use `resolvePortfolioBadge()` with correct variants; new `badge--hybrid` CSS class added (amber, distinct from live green).
* Settings `PortfolioDataSourceCard` no longer shows "Gateway Not Connected" (fatal red) when `pricesLive` is true — shows "Fallback Live Pricing Active" or "IBKR Gateway Offline" (warn amber) instead.
* Settings card now shows a Positions / Prices source split row: e.g. "Positions: Last IBKR Snapshot / Prices: Yahoo Live" in non-mock modes.

### Validation

* `npm run build` PASS — compiled in 11.2s, 12/12 static pages.

---

## v0.3.45 - Documentation Sync (ATHENA-DOCS-SYNC-049)

Date: 2026-06-24
Status: Documentation only — no code
Owner: ATHENA

### Thread UAT Outcomes (recorded from ATHENA-DOCS-SYNC-049)

| Task | Status | Notes |
|---|---|---|
| HERMES-LIVE-REFRESH-FIX-025 | IMPLEMENTED | Shared API_BASE_URL/WS_BASE_URL, WebSocket reconnect, 10s polling fallback, focus/visibility refresh, TFA polling. Commit: 3c4a4b6 |
| ARTEMIS-SETTINGS-DATASOURCE-UX-018 | IMPLEMENTED | Portfolio Data Source card, Mock/Last Update/Live IBKR selector, auto gateway validation, live status indicators |
| ARTEMIS-PIA-IBKR-APP-SWITCH-027 | IMPLEMENTED | pageshow listener, TFA polling, auto dashboard refresh on IBKR app return |
| HERMES-IBKR-MARKETDATA-STATUS-028 | IMPLEMENTED | Fixed IBKR C5.10 prefix parse error; restored field mapping 85/86; `pricesLive` restored |
| HERMES-LIVE-POSITION-METRICS-MAPPING-036 | **FAIL PO UAT** | Portfolio calculations still incorrect |
| ARTEMIS-AI-RESEARCH-TAB-IMPLEMENTATION-038 | **PARTIAL** | Research V3 visible; backend gaps, `[object Object]` rendering bug, excessive card nesting, missing analyst distributions |
| HERMES-RESEARCH-DATA-AND-LIVE-CONTRACT-040 | READY FOR UAT | Explicit missing states, metricStates, missingMetrics, safer null-risk handling. Commit: 9d20e03 |
| HERMES-MOBILE-LIVE-REFRESH-BLINK-041 | **FAIL PO UAT** | Flashing reduced; portfolio calculations still wrong; quotes not propagating correctly. Commits: b684469, dfd7335 |
| HERMES-PRICE-PROVIDER-FALLBACK-044 | **PARTIAL** | Yahoo fallback, hybrid mode, manual holdings live pricing implemented. Snapshot persistence behavior not matching requirements. Commits: a27ba55, 3374c7d |
| HERMES-IBKR-SNAPSHOT-LIFECYCLE-048 | **FAIL PO UAT** | Snapshot lifecycle not behaving exactly as required. Commit: 8a9d43b0 |
| ARTEMIS-PRICE-PROVIDER-FALLBACK-UX-045 | READY FOR UAT | Badge variants, timestamps, stale banner, source markers, settings split |

### Open P0 Items (no new features until these pass UAT)

1. **HERMES-PORTFOLIO-CALCULATION-046** — Portfolio Total, Day P/L, Day P/L %, Unrealized P/L calculations incorrect
2. **HERMES-LIVE-QUOTES-037** — Live quote propagation audit
3. **HERMES-LIVE-REFRESH-039** — Full dashboard refresh architecture
4. **ARTEMIS-PORTFOLIO-TABLE-COLUMNS-047** — Columns, ordering, sorting, desktop parity
5. Research data coverage audit (open, no task ID yet)
6. Research mobile layout optimization (open, no task ID yet)
7. Compact AI widget vignette regression (open, no task ID yet)

---

## v0.3.41 - IBKR Snapshot Lifecycle Persistence and No-Data State (HERMES-IBKR-SNAPSHOT-LIFECYCLE-048)

Date: 2026-06-24
Status: Implemented and locally validated; Product Owner live-Gateway UAT pending.

### Backend

* Live IBKR snapshot persistence now keeps the last valid portfolio bundle durable, records refresh-state metadata, and refuses to overwrite good data with empty or failed live refreshes.
* Startup warm-up can seed the live snapshot cache without changing the selected mode, and `/api/debug/portfolio-snapshot` exposes snapshot age, refresh attempt, and refresh status fields.
* `GET /api/price-providers/status` now includes snapshot and fallback quote health, while the portfolio stack returns an explicit `NO_DATA` state when neither live nor snapshot data exists.

### Validation

* `python -m py_compile backend/main.py backend/services/portfolio_providers.py backend/tests/test_snapshot_lifecycle.py` passed.
* `python -m unittest discover -s tests -p 'test_*.py'` passed with 24 tests.
* Backend regression tests confirm valid snapshots persist, failed refreshes do not overwrite the cache, startup seeding works, and snapshot fallback remains available when live fetches fail.

## v0.3.39 - Live Price Provider Fallback (HERMES-PRICE-PROVIDER-FALLBACK-044)

Date: 2026-06-23
Status: Implemented and locally validated; live-gateway UAT pending in this workspace.

### Backend

* When IBKR is disconnected, portfolio positions now keep the latest saved IBKR snapshot while Yahoo Finance fallback quotes continue to refresh prices, day P/L, unrealized, and total value.
* Portfolio payloads now distinguish `IBKR_LIVE`, `IBKR_LAST_UPDATE`, `HYBRID_LAST_POSITIONS_LIVE_QUOTES`, and `MANUAL_HOLDINGS_LIVE_QUOTES` so the UI can tell live IBKR from hybrid fallback pricing.
* The fallback provider exposes `GET /api/price-providers/status` and the portfolio/debug contracts now report `portfolioMode`, `positionsSource`, `priceSource`, and fallback provenance fields.

### Validation

* `python -m py_compile backend/main.py backend/services/portfolio_providers.py backend/services/price_providers.py backend/services/manual_holdings.py backend/tests/test_price_provider_fallback.py` passed.
* `python -m unittest discover -s tests -p 'test_*.py'` passed with 19 tests.
* `npm run build` passed in `frontend/`.
* Local backend tests confirm live IBKR stays live, snapshot mode falls back to Yahoo prices, and manual holdings use the live price provider helper.

## v0.3.38 - Research Data and Live Contract Hardening (HERMES-RESEARCH-DATA-AND-LIVE-CONTRACT-040)

Date: 2026-06-23
Status: Implemented and locally validated; live-gateway UAT pending in this workspace.

### Backend

* `/api/intelligence/{symbol}/research` now returns explicit missing sections, explicit provenance, and section-level confidence instead of empty objects or omitted fields.
* Live portfolio positions now expose `metricStates` and `missingMetrics` so blank portfolio values are explicit contract data.
* Null-safe portfolio risk handling no longer crashes live routes when risk is unavailable.
* Stock hero contracts continue to prefer the live portfolio quote cache when live data is active.

### Validation

* `python -m py_compile` passed for `backend/main.py`, `backend/services/*.py`, and `backend/tests/*.py`.
* `python -m unittest discover -s tests -p 'test_*.py'` passed with 12 tests.
* Fresh backend validation showed `/api/intelligence/AMD/research` and `/api/intelligence/NBIS/research` returning full payloads with explicit missing states.
* Fresh backend validation showed live portfolio routes returning explicit metric state metadata instead of crashing on null risk values.

## v0.3.37 - Live Position Metrics Mapping (HERMES-LIVE-POSITION-METRICS-MAPPING-036)

Date: 2026-06-23
Status: Implemented and locally validated; live-Gateway UAT pending in this workspace.

### Backend

* Day change, day P&L, and day P&L% now derive from validated quote fields with documented fallback formulas.
* Live and snapshot position payloads suppress fake placeholder metrics and expose score provenance fields for risk, momentum, and news.
* Risk and momentum use cached AI Intelligence metrics when available; otherwise they return null and mark provenance as missing.
* Stock hero and AI context routes now prefer the live portfolio quote cache when live data is active.

### Validation

* Backend regression tests now cover stock, option, crypto, mixed portfolio, and missing-previous-close cases.
* `python -m py_compile` passed for `backend/main.py`, `backend/services/*.py`, and `backend/tests/*.py`.
* `python -m unittest discover -s tests -p 'test_*.py'` passed with 9 tests.
* Local endpoint checks in this workspace still reflected the last-update fallback path because the long-lived Gateway-connected process was unavailable here.

## v0.3.36 - Live Frontend Refresh Recovery (HERMES-LIVE-REFRESH-FIX-025)

Date: 2026-06-23
Status: Implemented and locally validated.

### Frontend

* Added shared `API_BASE_URL` and `WS_BASE_URL` runtime configuration targeting the active backend port.
* Desktop and Mobile now share a reconnecting dashboard WebSocket with a ten-second polling fallback and focus refresh.
* Stale dashboard responses automatically trigger a follow-up fetch after cache refresh.
* Setup polls pending Gateway authentication every two seconds and transitions to Ready without reload.
* Removed hard-coded runtime port `8000` references from Desktop, Mobile, Setup, and the shared API client.

### UAT

* Mobile and Desktop rendered a second WebSocket value without reload.
* Silent-socket UAT proved stale retry plus ten-second polling fallback.
* Closed-socket UAT proved automatic reconnect.
* Setup pending-to-authenticated UAT completed in 2248 ms without remount.

## v0.3.35 - Frontend Refresh Lifecycle Diagnostic (HERMES-FRONTEND-REFRESH-DIAGNOSTIC-024)

Date: 2026-06-22
Status: Diagnostic complete; implementation continuation proposed.

### Diagnostics

* Added `/api/debug/ui-refresh-status` and a matching frontend proxy with provider, portfolio, dashboard-cache, and delivery-cadence timestamps.
* Portfolio, dashboard, provider-status, live portfolio, and Setup diagnostic responses now expose/log response, quote, and portfolio timestamps.
* Identified hard-coded port `8000` frontend transports while the active backend/proxy uses `8007`, with no polling fallback.
* Confirmed dashboard stale-while-revalidate returns stale data on the first expired-cache request and refreshes correctly in the background.
* Confirmed Setup has a one-shot authentication check and cannot react to external TFA approval until retry/navigation/reload.
* Captured duplicate Next dev servers and mismatched `.next` chunks preventing hydration during UAT.

## v0.3.34 - IBKR Connectivity Mismatch Hotfix (HERMES-IBKR-CONNECTIVITY-MISMATCH-017)

Date: 2026-06-22
Status: Implemented and locally validated against an authenticated Gateway.

### Backend

* Fixed false Gateway-offline detection by using IPv4 loopback for the backend transport when the configured host is `localhost`.
* Added environment-aware Gateway configuration, explicit no-proxy transport, startup configuration logging, and per-request timing logs.
* Added `/api/debug/ibkr-connectivity` and aligned legacy setup diagnostics with the live provider transport.
* Confirmed provider resolution returns `IBKR_LIVE`; live quote timestamps and AMD values changed across four 12-second refresh intervals.

### Root cause

* Python's `localhost` request path took about 2.2 seconds on this dual-stack Windows host, exceeding the provider's 2.0-second heartbeat timeout. The same authenticated request via `127.0.0.1` completed in about 0.17 seconds.

## v0.3.32 - IBKR Live Diagnostic Trace (HERMES-IBKR-LIVE-DIAGNOSTIC-014)

Date: 2026-06-22
Status: Implemented and locally validated.

### Diagnostics

* Added `/api/debug/live-status` and `/api/debug/live-quotes` for end-to-end live quote inspection.
* Added live quote trace capture inside the IBKR portfolio provider so each quote snapshot is tagged with source, timestamps, and age.
* Exposed cache-layer inventory for quote, portfolio, dashboard, provider status, context, fundamentals, and news routes.
* Reduced the debug route path so browser-facing diagnostics return partial 200 responses quickly instead of recreating provider stalls.

### Root cause

* Current environment is not actually connected to IBKR Client Portal Gateway. The provider status resolves to `LAST_UPDATE` with `gateway_error=<urlopen error timed out>`.
* The UI is therefore seeing last-update snapshot data, not fresh live-market quotes.
* Live quote timestamps remain unchanged across repeated requests because the backend is serving the cached snapshot path.

## v0.3.31 - Backend Timeout Hotfix (HERMES-BACKEND-TIMEOUT-HOTFIX-013)

Date: 2026-06-22
Status: Implemented and locally validated.

### Backend

* Added hard route budgets and cache-first fallbacks for stock, dashboard, AI context, and provider status flows.
* Route responses now carry `sourceStatus` metadata with `status`, `latencyMs`, `fallbackUsed`, and `error`.
* Stock and dashboard now return partial 200 responses instead of waiting for upstream provider stalls.
* AI context frontend contract now returns a partial response within the proxy budget when the backend is still loading.

### Frontend

* Reduced frontend API proxy timeouts so user-facing routes fail fast into partial responses instead of 12s+ stalls.
* Proxy handlers now return partial 200 responses on timeout for stock, dashboard, and AI context routes.

## v0.3.29 - AI Intelligence V3 Research Documentation (ATHENA-GOV-022)

Date: 2026-06-22
Status: Documentation/governance only — no code.

### Backend Research contract (HERMES) — COMPLETE

* **HERMES-AI-V3-001** Research Backend Gap Analysis: coverage matrix for all 9 Research sections, data-source mapping, proposed `GET /api/intelligence/{symbol}/research` contract, provider gaps, thesis-only constraint.
* **HERMES-AI-V3-002** Research Endpoint V1: `backend/services/ai_research.py` + endpoint; thesis-only (no Buy/Hold/Sell, no portfolio action); explicit null/status placeholders. Perf p50 9.93ms / p95 11.86ms.
* **HERMES-AI-V3-003** Provenance & Real Data Upgrade: schema V3.0, `ResearchMetric` provenance wrapper + section-level provenance, `competitiveComparison` returns `shouldRender:false` when no peer provider (no dummy peers), auditable null placeholders for missing financials/TAM/guidance/ownership/fund-sentiment/DCF. Perf p50 12.12ms / p95 17.29ms (well under 500/1000ms).

### Frontend (ARTEMIS)

* **CR-AI-V3-UI-001** CLOSED (89bad3a): Overview/Compact/Expanded hero corrections — removed BULL/BEAR/EVEN case badge, hero sizing/alignment, risk-label shortening, Section Header Standard V1, 390/360 breakpoints.
* **ARTEMIS-AI-V3-RESEARCH-003** Research V2 tab IMPLEMENTED (8657868 + proxy b056bc1) — but **Design Lock INVALID**: the approved mock is missing.

### Decisions LOCKED

* DEC-AI-RESEARCH-001..007 (thesis-only; ownership split; no dummy data; real-peer-only comparison; approved-mock source of truth; accordion arrow direction; locked customization).

### Blockers

* **GOV-022-RESEARCH-MOCK-MISSING (P0):** `docs/mocks/ai-intelligence/APPROVED/research-approved.png` is absent (typo `research-aproved.png` and pre-approved drafts no longer present). DEC-AI-RESEARCH-005 reference is broken; Research V2 Design Lock invalid until the approved image + a Research design spec are committed.

## v0.3.28 - AI Intelligence V2 Governance Refresh (ATHENA-GOV-021)

Date: 2026-06-22
Status: Documentation/governance only — no code. AI Intelligence V2 is a Release Candidate pending UAT.

### Locked decisions

* **DEC-AI-009 — Shared Intelligence Data Layer:** AI Intelligence consumes data exclusively via the Shared Intelligence Context Layer; widgets may not access providers directly. Consumers: AI Intelligence, Analyst Targets, Company, Financials, News, Videos.
* **DEC-AI-010 — AI Verdict Separation:** AI Verdict (BUY/HOLD/SELL) is independent from Portfolio Recommendation (ADD/HOLD/TRIM/REDUCE/AVOID). Compact = verdict only; Expanded may show portfolio recommendation.
* **DEC-AI-011 — Hero System Standardization:** shared neon-wireframe/lattice hero assets across all states; solid-fill/mascot/cartoon/emoji rejected; compact + expanded use identical hero.

### Delivery / status

* HERMES-AI-005 (Shared Intelligence Context Layer) and HERMES-AI-006 (cache, freshness, frontend contract lock, example payloads, validation, lightweight contract mode) — COMPLETE/Accepted. Perf: warm 6ms compact / 9ms expanded; cold 1.9–2.8s.
* ARTEMIS-AI-011 V2 (Compact + Expanded) — IN PROGRESS. CR-AI-011 visual parity — OPEN (release blocker).
* Backlog added: HERMES-AI-007 (Parallel Context Hydration, P2), CR-HERMES-006-01 (Contract Versioning, P3).

### New trackers

* `docs/PROJECT_STATUS.md`, `docs/ROADMAP.md`, `docs/RELEASE_NOTES_DRAFT.md`. Progress: backend 98% / frontend 80% / overall 92–93%. Release blockers: CR-AI-011, real endpoint wiring, final UAT.

## v0.3.27 - AI Intelligence Compact V3 Redesign

Date: 2026-06-22
Status: Implemented (ARTEMIS). UAT PASS decision pending (NVDA BUY / NBIS HOLD / AAPL HOLD screenshots captured).
Tasks: ARTEMIS-AI-COMPACT-REDESIGN-001, CR-AI-COMPACT-REDESIGN-002, CR-AI-COMPACT-REDESIGN-003.
Commits: 1b7d426, 3887882.

### Added — Compact V3 redesign

* `AiIntelligenceCompactV3` premium compact widget (1b7d426): **3 rows × 4 cards**, **2.2 visible cards per row** (horizontal-scroll rail); **no Last Updated**, **no score badge**, **no dots/arrows** (per locked design principles).

### Added — Card customization (CR-AI-COMPACT-REDESIGN-002)

* Three-dot **Customize AI Cards** sheet in the compact widget header: show/hide cards, drag reorder, persisted preferences. Backed by a card source pool.

### Added — Semantic tone engine (CR-AI-COMPACT-REDESIGN-003)

* Semantic card coloring: a card's tone drives its border colour, icon glow, and mini-chart stroke. Level **High = red**, **Low = green**. A **BUY** widget may contain red cards (tone reflects each metric, not the overall verdict).

### Design Lock

* Compact V3 design principles locked (DEC-AI-CV3): no Last Updated; no score badge; no dots/arrows; 3 rows; 4 cards per row; 2.2 visible cards per row; card customization; semantic card coloring.

### UAT

* Screenshots: `frontend/uat-screenshots/cr-ai-compact-v3-cr002/` — NVDA / NBIS / AAPL × {widget, customize} × {390, 430}. Pending Product Owner PASS decision.

## v0.3.26 - Explainable AI Intelligence Engine V1

Date: 2026-06-17
Status: Implemented and locally validated.
Task: HERMES-AI-002
Owner: HERMES

### Added

* **Explainable scoring engine:** `backend/services/ai_intelligence_engine.py` builds an actionable verdict from source coverage, normalized inputs, macro/news context, and portfolio exposure.
* **Score endpoint:** `GET /api/intelligence/{symbol}/score` with optional `strategy` and `debug=true`.
* **Verdict contract:** stock verdict, portfolio recommendation, final verdict, expected return, conviction, thesis strength, risk, confidence, visual state, top reason, scenarios, drivers, risks, bull/bear cases, score breakdown, evaluated factors, and confidence notes.
* **Portfolio-aware logic:** concentration penalties can downgrade a strong stock thesis to HOLD/TRIM without changing the stock-level verdict.
* **Debug mode:** raw factor scores, weights, normalization details, missing sources, coverage calculation, and cache status.
* **In-memory score cache:** key includes symbol, strategy, and portfolio mode; cached responses return immediately.
* **Deterministic fixtures:** bull, balanced, bear, and portfolio-aware STRONG BUY -> HOLD cases.

### Notes

* Missing Seeking Alpha, Discord Advisor, and X Sentiment sources reduce confidence only; they do not block a verdict.
* Normal score responses do not expose source timestamps or "Live"/"Updated" labels.
* `npm run build` PASS - 9/9 pages, TypeScript types valid.

## v0.3.25 - AI Intelligence UI Foundation

Date: 2026-06-17
Status: Implemented.
Task: ARTEMIS-AI-001
Owner: ARTEMIS
Commit: 3433330

### Added

* **Compact mode (default):** verdict chip (Bullish/Bearish/Balanced/Trim) + Expected Return + Conviction + Risk stats + Top Reason sentence + "Full Analysis ›" expand button. No Live badge, no Updated timestamp, no source labels.
* **Expanded mode (8 sections):** AI Verdict, Why AI Thinks This, Bull Case, Bear Case, Scenario Outlook, Score Breakdown, Factors Evaluated, Confidence Notes.
* **Four visual states:** Bull (green), Bear (red), Balanced (orange, TrendingDown + Scale + TrendingUp icons), Trim (amber, composite ≥ 55 AND risk ≥ 80).
* **`deriveVerdictState()`** — trim if composite ≥ 55 AND risk ≥ 80; bull if composite ≥ 65; bear if composite < 40; else balanced.
* **`extractTopReason()`** — first sentence of AI summary, or top metric badge as fallback.
* **`BalancedArrows`**, **`VerdictChip`**, **`AiCompactView`** components added.
* **Settings integration cards** — Discord Signals (status: not_connected) and X Sentiment (status: planned) added to INTEGRATION_DEFS.
* **`integrationNavTone()`** — handles `planned` → `warn`, `not_connected` → `bad`.
* **CSS** — compact/expanded section styles, verdict chip color variants, balanced-icons layout.

### Removed

* `sai-live` "Live Analysis" badge from AI Intelligence widget header.
* `Clock` "Updated" span from hero meta (compact and expanded).

### Build

* `npm run build` PASS — 9/9 pages, TypeScript types valid.

## v0.3.24 - AI Intelligence Architecture & Documentation Consolidation

Date: 2026-06-17
Status: Documentation only — no code/implementation in this entry.
Task: ATHENA-AI-001
Owner: ATHENA

### Added

* `docs/architecture/AI_INTELLIGENCE_ARCHITECTURE.md` — canonical architecture document covering all 9 AI Intelligence subsystems: AI Intelligence V2, AI Engine, Portfolio Fit Engine, Position Intelligence, Opportunity Radar, Analyst Verdict Engine, News Intelligence, Investor Bot, and Auto Investor.

### Captured decisions

* Verdict-first architecture: composite dial → bars → KPI cards → Bottom Sheet.
* Bull / Balanced / Bearish composite state machine (≥65 / 40–64 / <40).
* No Live/Updated badges on metric values — source label only.
* Confidence engine: coverage-based (metric, source, freshness, history); no static fallback.
* Thesis Strength: composite consistency delta model.
* Portfolio Fit Engine: concentration + correlation + diversification + opportunity score.
* Position Intelligence: thesis memory, what changed, thesis health state machine, exit conditions, position verdict.
* Opportunity Radar: ranked opportunities, risk alerts, diversification ideas, portfolio action queue.
* Analyst Verdict Engine roadmap: consensus verdict, conviction score, analyst alignment with AI Engine.
* News Intelligence roadmap: PIA Digest, Bias, Confidence, Possible Move, Demo badge policy.
* Investor Bot roadmap: intent router, portfolio context injection, privacy-mode masking.
* Auto Investor roadmap: rules engine, limit-order-only gateway, dry-run default, guardrails.

### Updated

* `CHANGELOG.md` — this entry.
* `docs/PIA_MASTER_BACKLOG_SOURCE_OF_TRUTH.md` — ATHENA-AI-001 task and AI roadmap items added.
* `docs/UAT_TRACKING.md` — ATHENA-AI-001 documentation-only entry added.

### Roadmap tasks registered

| Task ID | Title | Status |
|---|---|---|
| ATHENA-AI-002 | AI Engine — full scoring pipeline | ROADMAP |
| ATHENA-AI-003 | Metric score persistence layer | ROADMAP |
| ATHENA-AI-004 | Portfolio Fit Engine | ROADMAP |
| ATHENA-AI-005 | Position Intelligence | ROADMAP |
| ATHENA-AI-006 | Opportunity Radar | ROADMAP |
| ATHENA-AI-007 | Analyst Verdict Engine | ROADMAP |
| ATHENA-AI-008 | News Intelligence V2 | ROADMAP |
| ATHENA-AI-009 | Investor Bot | ROADMAP |
| ATHENA-AI-010 | Auto Investor | ROADMAP |

## v0.3.23 - IBKR Client Portal Settings Correction

Date: 2026-06-16
Status: Implemented.

### Changed

* Replaced legacy TWS/IB Gateway socket settings with Client Portal Gateway integration UI.
* Added Portfolio Data Source selector for Mock, Demo Samples, and Live IBKR.
* Added provider status display, fallback visibility, Test Connection action, and portfolio source badge.

## v0.3.22 - Governance: Approved Mock Preservation & Design Lock Traceability (PIA-GOV-004)

Date: 2026-06-11
Status: LOCKED. Governance/documentation only — no code.

### Locked

* **DEC-GOV-004 — Approved Mock Preservation & Design Lock Traceability.** Every Design Lock must archive the approved mock under `docs/mocks/<feature>/APPROVED_<feature>_v<version>.png` and **commit it before implementation starts**. Record the approved-mock path in the backlog item, UAT ticket, and Design Lock notes.
* **Process (locked):** Requirement → UX Mockup → Design Review → Design Lock → **SAVE approved mock → COMMIT approved mock** → Implementation → UAT.
* **UAT requirement:** every UAT report must contain `Approved Mock: <repo path>`, `Design Lock Commit: <id>`, `Implementation Commit: <id>`.
* **Non-compliance:** any implementation started without an archived approved mock is a governance violation and is **blocked** until the mock is committed.

### Compliance audit (existing approved mocks are NON-COMPLIANT with the naming convention)

* `docs/mocks/AI Intelligence/mock v1.png` → should be `docs/mocks/ai-intelligence/APPROVED_ai_intelligence_v2.png` (folder has a space; file labeled v1 but locked design is V2 — version to confirm).
* `docs/mocks/analyst-targets/Approved_mobile_mock_analyst_target.jpg` → `APPROVED_analyst_targets_v3.png`.
* `docs/mocks/stock-intelligence/stock-intelligence-v1-approved.png` → `APPROVED_stock_intelligence_v1.png`.
* `docs/mocks/watchlists/watchlists-mobile-v1-approved.md` (markdown, not PNG).
* Structural note: mocks live in two places (`docs/mocks/` and `docs/design-system/mocks/`); policy mandates `docs/mocks/<feature>/`.

### Remediation

* **GOV-004-REMEDIATION (OPEN, ATHENA):** rename existing approved mocks to the convention, consolidate the two mock locations, resolve the AI version ambiguity, and backfill traceability triples. Renames deferred pending PO confirmation of versions (avoid mislabeling locked assets).

### Traceability backfill (existing locks)

* AI Intelligence V2 — Approved Mock: `docs/mocks/AI Intelligence/mock v1.png` (rename pending) · Design Lock Commit: `3bb14df` · Implementation Commit: `b7d591e` (CR-AI-010 recovery).
* Analyst Targets — Approved Mock: `docs/mocks/analyst-targets/Approved_mobile_mock_analyst_target.jpg` (+ `analyst-targets-v3-desktop.png`); historical drift is the motivating incident for this policy.

## v0.3.21 - AI Intelligence V2 Design Lock

Date: 2026-06-10
Status: Design Lock approved by Product Owner (10/10). Documentation only — no code/implementation in this entry. Implementation tracked as CR-AI-010 (READY FOR IMPLEMENTATION, HERMES).

### Approved (LOCKED) — AI Intelligence V2 supersedes V1 (V1 deprecated)

* **DEC-AI-001 — KPI Cards:** replace KPI rings with KPI cards (Value, Trend Delta, Label, Status, Chevron); full-card tap target; no ring gauges, no flat tiles. Score family (Momentum/Trend/Sentiment, 0–100) is visually distinct from the Directional family (Institutional Flow, Price vs Fair Value).
* **DEC-AI-002 — Single Bottom Sheet Explainability:** tap a KPI opens one scrollable bottom sheet — Why It Matters → Score Breakdown → Historical Evolution → Disclaimer. No nested drilldowns, no multiple screens, no modal chains.
* **DEC-AI-003 — No Widget Collapse:** missing data never collapses the widget; render the structure and show missing values as `--`; the "Data gathering in progress" full-section replacement is forbidden.

### Approved architecture

* KPI Card architecture, Explainability architecture, Bottom Sheet architecture, No-Collapse policy.
* Spec (locked): `docs/design-system/mocks/stock-workspace/ai-intelligence-widget-v2.md`. All future AI Intelligence work must follow V2.

## v0.3.20 - Portfolio Density + Analyst Targets V3 + UAT Fix Pack

Date: 2026-06-09
Status: Implemented and locally validated (`npm run build` PASS; `/`, `/mobile`, `/setup` 200). Pending Product Owner real-device UAT.
Commit range: 02dfcdf … e5736e9 (through requested anchor 72499e9).

### Added — Analyst Targets V3 (HERMES)

* V3 layout: Options tab removed (tabs: Overview, Chart, News, Financials, Analysis); chart now lives only in the Chart tab; fixed/sticky stock header.
* Overview Analyst Targets: Bull / Base / Bear (percentage + target price), target range with current + consensus markers, consensus + analyst count, and analyst distribution bars.
* Tapping the Overview Analyst Targets card navigates to Analysis → Analyst Targets; analyst history rendered as mobile cards (no tables).
* Commits: 2b9d1de, 5602655, ecbe06d, ac0ca6f (current data source only; no Finnhub/FMP this sprint).

### Added — Portfolio Density Sprint (ATHENA)

* Portfolio/Watchlist cards v2, card customization framework, grid + filters, 2x2 compact IBKR style, live price emphasis (dynamic color + tick pop), visual system v2 (larger logo, price hierarchy, 2x2 density), logo ring, portfolio view selector, mobile density pass + persistence validation.
* Commits: 23bce57, 54bf30e, b7c646f, 6038934, edca406, 5e8daca, 72499e9, e5736e9.

### Watchlist UAT findings

* Carried forward (still OPEN): PIA-WL-008..014 — column switches, Open Chart destination, Add-to-list, AI Coach, add-instrument UX, table sorting, watchlist columns.

### Open items discovered during latest UAT / visual audit (2026-06-09)

* PIA-UX-060 — card logo still under-weighted as a visual anchor.
* PIA-BUG-032 — empty workspace preview widgets read as broken-premium.
* PIA-CSS-001 — duplicated/overriding `.stock-intel-header` CSS; consolidate before the V3 fixed header.
* PIA-UX-061 — Cards view discoverability (view mode behind the overflow menu).

### Governance

* Design Lock process locked (DEC-DESIGN-LOCK): a DESIGN LOCKED feature freezes layout/IA; implementation must match the locked spec; deviations require re-approval.
* Next.js cache governance locked (DEC-NEXT-CACHE): on `PageNotFoundError` during page-data collection, clear `.next` then rebuild; never delete `.next` while a server holds it; avoid concurrent `.next` access in the shared tree.

## v0.3.19 - Analyst Targets V2

Date: 2026-06-08
Status: Implemented and locally validated.

### Added

* Analyst Targets Overview card now opens the Analysis tab on tap/click.
* Analysis tab now includes a dedicated Analyst Targets section with consensus target, bull target, bear target, recommendation summary, analyst count, and analyst history empty state.
* Yahoo recommendation payload now preserves raw Strong Buy / Buy / Hold / Sell detail where available while keeping existing aggregate overview counts.

### Enhanced

* Upside/downside is now the primary visual element on the Overview card.
* Dollar difference from current price to consensus target is shown directly below the percentage.
* Positive target deltas use green treatment; negative deltas use red treatment; neutral/unavailable values stay muted.

### Known limitations

* Yahoo fallback provides consensus and recommendation summary, but not reliable firm-by-firm previous/new analyst target history. The UI shows "Analyst history not available" when provider history is absent.

### Validation

* `npm run build` passed.
* `/`, `/mobile`, and `/setup` route smoke checks returned 200.
* UAT tickers checked: NVDA, AMD, MSFT, SOFI.

## v0.3.18 - Portfolio Mobile Card V2

Date: 2026-05-30
Status: Implemented and validated.

### Added

* Enhanced Portfolio mobile cards with institutional-style position details.
* Added Shares display.
* Added Market Value display.
* Added Last Price display.
* Added Avg Cost display.
* Added Today P&L ($ and %).
* Added Unrealized P&L ($ and %).
* Added fallback calculations for unrealized percentage when not supplied by the backend.

### Enhanced

* Preserved Momentum indicator.
* Preserved Risk indicator.
* Preserved Sparkline visualization.
* Preserved Stock Intelligence launch on card tap.
* Added optional News Intelligence, Macro Sensitivity, and AI indicator chips when data is available.

### Fixed / Improved

* Improved mobile portfolio information density without changing interaction patterns.
* Improved visibility of position performance metrics on smaller screens.
* Preserved privacy mode masking behavior.

### Validation

* Mobile portfolio cards render correctly.
* Stock Intelligence navigation preserved.
* Privacy mode preserved.
* No Desktop Experience changes.
* No Workspace System changes.
* No Workspace Architecture changes.


## v0.3.17 - Watchlists IBKR UX Upgrade
Date: 2026-05-29
Status: Implemented and locally validated.

### Added
- LocalStorage-backed custom watchlist model at `pia.watchlists.v1` with list id, name, tickers, view mode, visible columns, and order metadata.
- Default watchlists: Favorites, Tech, Fintech, and Swing with seeded symbols across NVDA, NBIS, META, AVGO, TSM, IONQ, QBTS, INOD, SOFI, ZETA, PLTR, NKE, AMD, and IREN.
- Mobile IBKR-style Watchlists workspace with horizontal custom tabs, Add Instrument flow, table/list toggle, dense INSTRMNT/LAST/CHNG/CHG%/VLM table, list cards, bottom sheet settings, and Edit Instruments screen.
- Desktop Watchlists workspace with shared persistence, custom list selector/tabs, create/rename/delete list, add/remove ticker, table/card toggle, column controls, and Stock Intelligence launch from watchlist rows/cards.

### Fixed / Preserved
- Removed nested button structure from watchlist cards.
- Preserved Portfolio, mobile shell, hamburger/workspace manager, bottom nav, privacy mode, and Stock Intelligence shell behavior.

### Validation
- `npm.cmd run build` passed.
- `next start` smoke checks returned 200 for `/` and `/mobile`.

## v5.6 — Integration + Product Hardening

### Added
- Renamed product to **Personal Investment Agent (PIA)**.
- Added **About / Version Center** with in-app changelog, roadmap, known issues, and QA checklist endpoints.
- Added **Integration Center** with all source configurations in one place.
- Added **Settings persistence** via SQLite (`backend/pia_settings.sqlite3`).
- Added **IBKR configuration card** with host, port, client id, enabled state, documentation, and health check.
- Added **Yahoo Finance connector** for best-effort RSS news and fundamentals health checks.
- Added **Seeking Alpha connector** with RSS support and optional authenticated subscriber-session parsing scaffold. It stores no password; authenticated mode uses a user-provided active session cookie/header and may break if the site/session changes.
- Added **RSS adapter** with configurable feed list and health checks.
- Added **FRED/Macro, Telegram, Advisor Intel, and AI Lite configuration scaffolds**.
- Added **Source Health Monitor** endpoint and dashboard widget.
- Added **TradingView chart embed** inside the Stock Intelligence Drawer.
- Added frontend health/test buttons that show whether each source received data.

### Fixed / Hardened
- Version metadata now reports v5.6.
- Product governance is available in-app instead of only `CHANGELOG.md`.
- Integration settings are no longer only hidden in `.env`; `.env` remains developer fallback.

### Known limitations
- Discord cloud connector and Advisor Intel parsing are deferred to v5.7+.
- AI API reasoning layer remains deferred for cost control.
- Yahoo public endpoints are best-effort and should have fallback providers later.
- Seeking Alpha authenticated parsing depends on user subscription/session validity and website changes.
- Persistent drag/drop resize grid is scaffolding only; full resize grid remains V5.7.

## v5.5 — Intelligence Workbench
- Live IBKR structure.
- Portfolio Snapshot.
- Positions tabs.
- Exposure Map.
- Risk Doctor.
- Opportunity Board.
- Rules-based Trade Engine.
- Stock Intelligence Drawer.
- Tax/Transactions shell.
- Thesis Vault shell.

## v5.3 — Black UI / Tax / Live Prep
- Black UI.
- Tax Center shell.
- Market strip.
- Portfolio scanner shell.
- Frontend TypeScript and environment setup fixes.

## v5.6 Internal UAT Fix Pack
- Fixed Trade Engine response schema: added `entry` and `reason` alongside existing `entry_zone`.
- Fixed Greek tax estimate to use net taxable stock/options gain after loss offset; UCITS ETFs excluded.
- Added basic drag-and-drop dashboard widget reorder with localStorage persistence.
- Added UAT report with simulation pass results.
## v0.3.54 - Portfolio Production Stabilization (HERMES-PORTFOLIO-PRODUCTION-062)

Date: 2026-06-29
Status: READY FOR PO UAT
Owner: HERMES

### Backend - Market Data Engine

* Added `backend/services/market_data_engine.py` as the portfolio market-data facade.
* Reworked `backend/services/quote_engine.py` into a single in-memory quote cache with instrument identity, bid/ask, previous close, market state, timestamp, provider, and quote-age metadata.
* Enforced option quote identity by `conid`; options no longer fall back to the underlying stock symbol.
* Routed canonical portfolio construction through `ProviderManager -> MarketDataEngine -> PortfolioCalculator`.

### Backend - Diagnostics

* Added `/api/debug/portfolio-reconciliation` for IBKR vs PIA PASS/FAIL comparison across total value, market value, cash, buying power, liquidity, margins, P/L, realized, and Greeks.
* Added `/api/debug/quote-cache` for MarketDataEngine cache inspection.
* Added runtime log coverage for `[MARKET_SESSION]`, `[QUOTE_REFRESH]`, `[QUOTE_CACHE]`, `[DTO_CREATED]`, and `[RECONCILIATION]`.

### Snapshot Lifecycle

* Successful live snapshot writes now also persist a canonical price-free snapshot artifact with positions, contracts, average-cost fields, metadata, and timestamp.
* Existing legacy snapshot files remain readable for backward-compatible recovery.

### Validation

* `python -m py_compile backend/main.py backend/services/portfolio_providers.py backend/services/quote_engine.py backend/services/market_data_engine.py backend/services/provider_manager.py backend/services/portfolio_calculator.py` - PASS
* `PYTHONPATH=backend python -m unittest discover -s backend/tests -p "test_*.py"` - PASS, 28 tests
* `NEXT_DIST_DIR=.next-hermes062 npm run build` - PASS
