# PIA Project Status

## HERMES-062 Update

Status: READY FOR PO UAT
Date: 2026-06-29

- MarketDataEngine separation implemented for portfolio quote resolution.
- Single in-memory quote cache now carries instrument identity, bid/ask, previous close, market state, timestamp, provider, and quote age.
- Option quotes are keyed by `conid`; fallback to underlying stock price is rejected.
- Non-mock portfolio payloads now route through `ProviderManager -> MarketDataEngine -> PortfolioCalculator`.
- Successful live snapshot writes also persist a canonical price-free snapshot artifact.
- `/api/debug/portfolio-reconciliation` added for IBKR vs PIA PASS/FAIL comparison.
- `/api/debug/quote-cache` added for MarketDataEngine cache inspection.

Last updated: 2026-06-29 (HERMES-PORTFOLIO-PRODUCTION-062)
Branch: `feat/pia-v3-foundation-integration`

## Portfolio Engine — Production Status

| Item | Status | Sprint |
|---|---|---|
| Canonical pipeline (QuoteEngine + Calculator + ProviderManager) | **IMPLEMENTED — PENDING UAT** | ARTEMIS-061 |
| Multi-path calculation divergence (root cause) | **FIXED** | ARTEMIS-061 |
| Snapshot positions strip stale prices on load | **FIXED** | ARTEMIS-061 |
| Options LAST_KNOWN price cache on restart | **IMPLEMENTED** | ARTEMIS-061 |
| Portfolio Total deviation (~30K) | **FIXED** | ARTEMIS-060/061 |
| Frontend metric approximations (Excess Liq, Margins) | **FIXED** | ARTEMIS-060 |
| Options cost_basis 100× overstatement | **FIXED** | HERMES-057 |
| Day P&L (fields 82+83) | **FIXED** | HERMES-057 |
| [QUOTE_PROVIDER] log event | **ADDED** | ARTEMIS-061 |
| [PROVIDER_SWITCH] log event | **ADDED** | ARTEMIS-061 |
| [PORTFOLIO_CALCULATED] log event | **ADDED** | ARTEMIS-061 |
| [CANONICAL_DTO] log event | **ADDED** | ARTEMIS-061 |
| [SNAPSHOT_LOAD] log event | **ADDED** | ARTEMIS-061 |
| [QUOTE_UPDATE] log event | **ADDED** | ARTEMIS-060 |
| [PORTFOLIO_RECALCULATED] log event | **ADDED** | ARTEMIS-060 |
| IBKR Trade History Panel (Desktop) | **ADDED** | ARTEMIS-060 |
| Trade history pagination API | **ADDED** | ARTEMIS-060 |
| Currency toggle (Desktop + Mobile) | **COMPLETE** | ARTEMIS-058/059 |
| Option clean labels (Desktop + Mobile) | **COMPLETE** | ARTEMIS-058 |
| Settings Integrations cleanup | **COMPLETE** | ARTEMIS-058 |
| Portfolio header simplification | **COMPLETE** | ARTEMIS-059 |
| IBKR field mapping documentation | **CREATED** | ARTEMIS-060 |

### Post-Deploy Actions Required
1. **Force-refresh snapshot** after deploying HERMES-057 + ARTEMIS-060 fixes:
   `POST /api/portfolio/snapshot/refresh?force=true`
   Existing snapshot has pre-fix cost_basis values for options and stale `total_value`.



## AI Intelligence V2

| Item | Status |
|---|---|
| Backend Foundation | COMPLETE |
| HERMES-AI-005 (Shared Intelligence Context Layer) | COMPLETE / Accepted |
| HERMES-AI-006 (Cache, freshness, frontend contract lock) | COMPLETE / Accepted |
| ARTEMIS-AI-011 (V2 Compact + Expanded implementation) | IN PROGRESS |
| CR-AI-011 (Visual parity) | OPEN |
| Release Status | **Release Candidate — pending UAT** |

### Progress
- Backend: **98%**
- Frontend: **80%**
- Overall: **92–93%**

### Release blockers
1. **CR-AI-011 — Visual parity** (expanded V2 UX fixes + compact overflow; pixel-match approved design).
2. **Real endpoint wiring** (frontend consuming the locked backend contract end-to-end).
3. **Final UAT pass**.

### Notes
- Decisions DEC-AI-009 (Shared Intelligence Data Layer), DEC-AI-010 (AI Verdict Separation), DEC-AI-011 (Hero System Standardization) are LOCKED.
- Canonical trackers: `docs/PIA_MASTER_BACKLOG_SOURCE_OF_TRUTH.md` (+ `.xlsx`), `docs/architecture/AI_INTELLIGENCE_ARCHITECTURE.md`, `CHANGELOG.md`, `docs/UAT_TRACKING.md`, `docs/ROADMAP.md`, `docs/RELEASE_NOTES_DRAFT.md`.

## AI Intelligence V3 — Research / Provenance

Updated 2026-06-22 (ATHENA-GOV-022).

| Item | Status |
|---|---|
| HERMES-AI-V3-001 (Research backend gap analysis) | COMPLETED |
| HERMES-AI-V3-002 (Research Endpoint V1, thesis-only) | COMPLETED |
| HERMES-AI-V3-003 (Provenance + real-data upgrade) | COMPLETED |
| CR-AI-V3-UI-001 (Overview/Compact/Expanded corrections) | CLOSED (89bad3a) |
| ARTEMIS-AI-V3-RESEARCH-003 (Research V2 tab) | IMPLEMENTED — Design Lock INVALID |
| Backend Research contract | Ready for frontend consumption |

### V3 release blockers
1. **GOV-022-RESEARCH-MOCK-MISSING (P0)** — approved Research mock `research-approved.png` is missing; Research V2 Design Lock invalid until it (and a Research design spec) are committed.
2. Research V2 UAT screenshots (390px tab, Customize drawer, expanded Investment Thesis, provenance drawer) not yet captured.
3. Competitive Comparison + provider data gaps (peers, financials, TAM, guidance, ownership, fund sentiment, DCF) — placeholders/hidden until providers added.

Decisions DEC-AI-RESEARCH-001..007 LOCKED. Backend perf well within budget (p50 ≤12ms / p95 ≤18ms vs 500/1000ms).

## Portfolio / IBKR Source Recovery

| Item | Status |
|---|---|
| HERMES-IBKR-RECOVERY-052 (Live IBKR source lifecycle recovery) | COMPLETE / locally validated |
| HERMES-PROD-STABILIZATION-057 (Production stabilization sprint) | COMPLETE / PENDING UAT |
| ARTEMIS-RUNTIME-FORENSICS-063 (Debug instrumentation — pipeline-trace, snapshot-lifecycle, position reconciliation) | COMPLETE / PENDING UAT |
| CR-IBKR-LIVE-018 (Provider promotion — last-update mode locks out IBKR_LIVE) | **FIXED — 45/45 tests pass** |
| ARTEMIS-PORTFOLIO-RUNTIME-064 (Runtime state machine, idempotent promotion, cache invalidation, DTO versioning) | **IMPLEMENTED — 45/45 tests pass** |

### Notes (057)
- **Options cost_basis bug fixed**: `avgCost × qty` (was incorrectly `× multiplier` again, causing 100× overstatement).
- **Day P&L now populated**: IBKR fields 82+83 added to market data snapshot request; options get day change directly from IBKR even without previousClose.
- **No provider labels in table rows**: Desktop portfolio table no longer shows YH/IBKR/STALE per row.
- **Source trace enhanced**: `switchDurationMs` and `snapshotPositions` now in `/api/debug/source-trace`.
- **⚠️ Action required after deploy**: Force-refresh snapshot (`POST /api/portfolio/snapshot/refresh?force=true`) — existing snapshot has pre-fix cost_basis values for options.

### Notes (CR-IBKR-LIVE-018)
- **Root cause**: `resolve_portfolio_provider()` treated `mode == "last-update"` as "always use snapshot, never check gateway." There was NO automatic promotion path when the gateway came online.
- **Fix**: `last-update` branch now probes `get_gateway_heartbeat()` first. If `gateway_open = True`, promotes to `IbkrLivePortfolioProvider` and emits `[PROVIDER_PROMOTE]` log. If gateway is down, falls through to existing snapshot/mock logic.
- **Why quotes appeared "live"**: The `IbkrLivePortfolioProvider._refresh_loop` was already running (seeded at startup by `prime_ibkr_snapshot(respect_mode=False)`), but its `_CACHE_BUNDLE` was never consumed — `get_canonical_portfolio()` used `SnapshotPortfolioProvider` instead. The "live" quotes users saw were Yahoo Finance quotes via `market_data_engine.get_quotes()`.
- **Observability added**: `[HEARTBEAT_CACHED]` (DEBUG) and `[HEARTBEAT_FRESH]` (INFO) log events in `get_gateway_heartbeat()`.
- **Validation**: backend `py_compile` + 35/35 unittest pass including 7 new lifecycle regression tests.

### Notes (052)
- Runtime provider status now drives the current source contract, so settings, provider status, portfolio, dashboard, and mobile all agree on `IBKR_LIVE` when the gateway is authenticated.
- Snapshot and demo fallback still work automatically when live IBKR is unavailable; the compact settings card now shows only Current Source and Last Updated.
- Validation passed: backend `py_compile`, backend `unittest`, frontend `npm run build`, and live route smoke checks.

### Notes (070)
- Quote and trade-history failures are now isolated from source ownership. `IBKR_LIVE` remains active while quote refresh degrades and retries.
- `GET /api/portfolio/provider/status` now reports `LIVE_DEGRADED` when the portfolio is still live but quote freshness is impaired.
- `GET /api/debug/live-status` and `GET /api/debug/source-trace` now expose quote/trade health, retry counters, last success/failure, retry delay, and live degradation evidence for PO reconstruction without log access.
- Validation passed: backend `py_compile`; backend regression suite `backend.tests.test_provider_lifecycle` + `backend.tests.test_runtime_state`.
