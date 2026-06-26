# IBKR Field Mapping — PIA Portfolio Engine

**Owner:** ARTEMIS-060 (2026-06-25)
**Source:** IBKR Client Portal API — `/portfolio/{acct}/summary`, `/portfolio/{acct}/positions/0`, `/iserver/account/pnl/partitioned`

---

## Portfolio Summary Fields

| PIA Field | IBKR API Key | Source Endpoint | Notes |
|---|---|---|---|
| `total_value` / `net_liquidation` | `netliquidation` | `/portfolio/{acct}/summary` | **Canonical NLV** — includes cash, bonds, T-bills, accrued interest, pending settlements minus margin. PREFERRED over computed `cash + sum(position.market_value)`. |
| `cash` | `totalcashvalue` | `/portfolio/{acct}/summary` | All cash denominations combined in USD. Does NOT include money-market funds that appear under positions. |
| `buying_power` | `buyingpower` | `/portfolio/{acct}/summary` | Day-trade buying power (4× margin) or cash available (1×) depending on account type. |
| `excess_liquidity` | `excessliquidity` | `/portfolio/{acct}/summary` | Equity with Loan − Initial Margin. Used to determine if new positions can be opened. |
| `maint_margin_req` | `maintmarginreq` | `/portfolio/{acct}/summary` | Maintenance margin required to hold current positions. If equity drops below this, broker may liquidate. |
| `init_margin_req` | `initmarginreq` | `/portfolio/{acct}/summary` | Initial margin required to enter current positions. |
| `available_funds` | `availablefunds` | `/portfolio/{acct}/summary` | Excess Liquidity − Initial Margin Requirement. Amount available to open new positions. |
| `gross_position_value` | `grosspositionvalue` | `/portfolio/{acct}/summary` | Sum of absolute position market values (long + short). |
| `currency` | `netliquidation.currency` | `/portfolio/{acct}/summary` | Account base currency (typically USD). |

### Summary Field Format

IBKR returns summary fields as nested objects:

```json
{
  "netliquidation": { "amount": 132850.42, "currency": "USD" },
  "totalcashvalue": { "amount": 18240.00, "currency": "USD" },
  "buyingpower": { "amount": 45000.00, "currency": "USD" }
}
```

The `_amt(key)` helper in `portfolio_providers.py` extracts `.amount` from these objects.

---

## Position Fields

| PIA Field | IBKR Position Key | Notes |
|---|---|---|
| `symbol` | `ticker` | Underlying symbol (e.g. `AAPL`). For options: underlying only, NOT the contract string. |
| `conid` | `conid` | Contract ID — unique IBKR instrument identifier. |
| `qty` / `quantity` | `position` | Number of shares/contracts (can be negative for short). |
| `last` | Market data field 31 | Last price. IBKR market data fields are fetched separately via `/iserver/marketdata/snapshot`. |
| `market_value` | `mktValue` | Current market value = `last × qty × multiplier`. Already computed by IBKR. |
| `avg_price` | `avgCost` | **Per-contract cost** (for options: avgPrice × 100). NOT per-share for options — already includes multiplier. |
| `cost_basis` | Computed: `avgCost × qty` | For options: `avgCost × qty` (NOT × multiplier again — `avgCost` is already per-contract). |
| `unrealized` | `unrealizedPnl` | Live unrealized P&L. Also `position.market_value - position.cost_basis`. |
| `sec_type` / `asset_class` | `assetClass` | `STK`, `OPT`, `ETF`, `CRYPTO`, `FUT`, etc. |
| `underlying` | `ticker` | For options and futures, the underlying instrument symbol. |
| `strike` | `strike` | Option strike price (in USD). |
| `call_put` | `right` | `'C'` or `'P'`. |
| `expiry` / `last_trade_date` | `expiry` | ISO date string (YYYYMMDD from IBKR, normalized to ISO-8601). |
| `multiplier` | `multiplier` | Contract multiplier (100 for standard equity options). |

---

## Market Data Fields (IBKR iServer)

Real-time / delayed quotes fetched via `/iserver/marketdata/snapshot?conids=...&fields=...`

| PIA Field | IBKR Field Number | Description |
|---|---|---|
| `last` | 31 | Last trade price |
| `day_pnl_pct` | 82 | Change % today |
| `day_pnl` | 83 | Change in dollar today |
| `bid` | 84 | Best bid |
| `ask` | 85 | Best ask |
| `previous_close` | 86 | Prior day close |
| `volume` | 87 | Today's volume |
| `bid_size` | 88 | Bid size |

---

## Portfolio Total Deviation — Root Cause (HERMES-PROD-STABILIZATION-057 + ARTEMIS-060)

**Problem:** PIA was computing `total_value = cash + sum(position.market_value)`. This consistently underreported NLV by ~30K.

**Why:** IBKR's `netliquidation` includes assets not in the positions list:
- Money market funds (appear as cash equivalents, not positions)
- Bond accrued interest
- Pending settlement proceeds
- Dividend receivables
- Net margin/collateral adjustments

**Fix (ARTEMIS-060):** `_normalize_live_summary` now prefers `_amt("netliquidation")` as primary; falls back to computed sum only when IBKR doesn't report NLV. For LAST_UPDATE/snapshot mode, recomputed total (with Yahoo live prices) is correct because the snapshot NLV is stale.

---

## Options Cost Basis — Root Cause (HERMES-PROD-STABILIZATION-057)

**Problem:** `cost_basis = avgCost × qty × multiplier` → 100× overstatement.

**Why:** IBKR's `avgCost` for options is already the per-contract cost (avgPrice × 100). Multiplying by multiplier again gave `avgPrice × 100 × 100`.

**Fix:** `cost_basis = avgCost × qty` (multiplier already baked into `avgCost`).

---

## Day P&L Fields (HERMES-PROD-STABILIZATION-057)

| Source | IBKR Field | PIA Field |
|---|---|---|
| IBKR market data snapshot | Field 82 (change%) | `day_pnl_pct` |
| IBKR market data snapshot | Field 83 (change$) | `day_pnl` |
| `/iserver/account/pnl/partitioned` | `dpl` (daily P&L) | Fallback for portfolio-level Day P&L |

Day P&L on desktop and mobile both now read from `portfolio.daily_pnl` (backend-computed from position-level `day_pnl` fields).
