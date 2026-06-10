# Mock — AI Intelligence Widget v1

Status: **DEPRECATED 2026-06-10 — superseded by ai-intelligence-widget-v2.md (DESIGN LOCKED).** Kept for history; do not implement from v1.
Owner: ATHENA · Source CR: BUG-DESIGN-001 (AI Intelligence Mock Compliance Audit)
Reference: `docs/mocks/stock-intelligence/stock-intelligence-v1-approved.png` (AI Intelligence section + bottom "AI INTELLIGENCE" insights strip)
Component today: `frontend/components/intelligence/StockAiIntelligenceWidget.tsx` (`.sai*`)

## Goal
Lock the exact layout of the AI Intelligence widget before implementation, resolving the audit CRs:
the bottom insights must be **circular ring gauges** (not flat tiles), with the **approved metric set**,
a section label, and graceful per-metric N/A handling.

## Target Screen
Stock Intelligence → **Overview** tab, AI Intelligence widget (`.sai`). Same widget on desktop modal/drawer and mobile sheet.

## Layout Mock (desktop / drawer)
```text
┌──────────────────────────────────────────────────────────────┐
│ AI INTELLIGENCE                                           ⓘ   │  kicker (uppercase) + info
│ ┌────────┐  Strong Momentum                       [ Bullish ] │  score ring + headline + sentiment chip
│ │  ◷ 78  │  Constructive trend, improving breadth and          │
│ │Bullish │  positive flow into resistance.                     │
│ └────────┘                                                     │
│ Momentum   ▇▇▇▇▇▇▇░░░  72/100                                  │
│ Trend      ▇▇▇▇▇▇░░░░  68/100                                  │  4 horizontal bars
│ Sentiment  ▇▇▇▇▇░░░░░  61/100                                  │
│ Risk       ▇▇▇░░░░░░░  38/100                                  │
│ ───────────────────────────────────────────────────────────  │
│ AI read combines momentum, trend, sentiment and risk into a    │  summary (≤3 lines, clamp)
│ single decision-support signal. Rules-based, not advice.       │
│ ── AI INTELLIGENCE · KEY SIGNALS ───────────────────────────  │  section label
│   ◷72%       ◷68%       ◷61%        ◷ ▲        ◷ +12%          │  5 RING GAUGES
│  Momentum    Trend      Sentiment   Inst.       Price vs        │
│   Score      Strength    Score      Flow        Fair Value      │
└──────────────────────────────────────────────────────────────┘
```

## Layout Mock (mobile, 390/430)
```text
┌────────────────────────────────┐
│ AI INTELLIGENCE             ⓘ  │
│ ┌────┐ Strong Momentum         │
│ │◷78 │ [ Bullish ]             │
│ └────┘                         │
│ Momentum   ▇▇▇▇▇▇▇░ 72         │
│ Trend      ▇▇▇▇▇▇░░ 68         │
│ Sentiment  ▇▇▇▇▇░░░ 61         │
│ Risk       ▇▇▇░░░░░ 38         │
│ AI read … (≤3 lines)           │
│ KEY SIGNALS                    │
│  ◷72%   ◷68%   ◷61%            │  rings wrap 3 + 2
│  Mom.    Trend  Sent.          │
│  ◷▲      ◷+12%                 │
│  Flow    P/FV                  │
└────────────────────────────────┘
```

## Hierarchy (top → bottom)
1. Kicker "AI INTELLIGENCE" + info icon
2. Score ring (dominant) + headline + sentiment chip
3. Four bars (Momentum / Trend / Sentiment / Risk)
4. Summary (≤3 lines)
5. "KEY SIGNALS" section label
6. Five ring gauges

## Components & data mapping (existing data only — no new backend fields)
| Element | Source field(s) | Render | Fallback |
|---|---|---|---|
| Score ring | `ai_score`/`opportunity`/`confidence`/`momentum_score` (0–100) | conic ring + number + sentiment word | `N/A`, empty ring |
| Headline | `ai_headline`/`momentum_state`/`why_moving` | h3, 1–2 lines | "Data gathering in progress" |
| Sentiment chip | derived (bull/bear/neutral) | chip, accent by sentiment | Neutral |
| Bar: Momentum | `momentum_score`/`momentum` | green bar `x/100` | `N/A`, 0 width |
| Bar: Trend | `trend_score` or derived from `trend` | blue bar | `N/A` |
| Bar: Sentiment | `sentiment_score`/`news_score` | violet bar | `N/A` |
| Bar: Risk | `risk` | red bar | `N/A` |
| Summary | `overview.summary`/`ai_view`/`why_moving` | ≤3-line clamp | placeholder |
| **Ring 1 Momentum Score** | `momentum_score` | green ring, `%` | muted "—" ring |
| **Ring 2 Trend Strength** | trend score | blue ring, `%` | muted "—" |
| **Ring 3 Sentiment Score** | `sentiment_score`/`news_score` | violet ring, `%` | muted "—" |
| **Ring 4 Institutional Flow** | `institutional_flow` | directional ring (▲ inflow=green / ▼ outflow=red / ▬ neutral=amber) | muted "—" |
| **Ring 5 Price vs Fair Value** | `price_vs_fair_value`/`targets.upside_downside` | signed `%`, green if ≥0 else red | muted "—" |

## Colors / typography / spacing
- Score ring: conic fill tinted by sentiment (green bullish / red bearish / blue neutral); number 24–28px bold, tabular.
- Bars: Momentum green, Trend blue, Sentiment violet, Risk red; label 10px uppercase muted; value tabular.
- Rings: 56–64px desktop / 48–52px mobile; ring % 12–13px bold; label 10px uppercase muted, 2-line wrap allowed.
- Kicker 10–11px uppercase, letter-spacing .08em, `#8ab4ff`.
- Single dark surface (lighter chrome, subtle separators per terminal-feel sprint). Rings row: 5 columns desktop; wrap 3+2 mobile. No horizontal overflow.

## States
- **Full data:** all rings populated.
- **Partial:** missing metrics render as muted "—" rings (slots preserved; layout never collapses).
- **All N/A (e.g., thin Yahoo payload):** rings muted with "—", summary shows placeholder; widget still reads as intentional, not broken.
- **Privacy:** numbers masked (`••`), rings shown as masked (no fill), labels intact.
- **Sentiment accent:** bullish/bearish/neutral changes score-ring tint + chip only.

## Interaction
- Tap/click the widget → navigate **Analysis › AI Analysis** (parallel to the Analyst Targets card → Analysis tap). `stopPropagation` on the info icon.
- Info ⓘ → tooltip: "Rules-based signal from existing metrics; not financial advice."
- Tap remains the only action on resting widget (no buttons), per Content > Controls.

## Acceptance Criteria
1. Bottom insights are **5 circular ring gauges**, labeled exactly: Momentum Score, Trend Strength, Sentiment Score, Institutional Flow, Price vs Fair Value.
2. Ring fill is proportional to value; Institutional Flow is directional; Price vs Fair Value is signed and color-coded.
3. Each ring degrades to a muted "—" independently; the row never collapses or shows a single "Data gathering" fallback in place of the rings.
4. Header score ring + headline + sentiment chip + the 4 bars retained (already PASS in audit).
5. "AI INTELLIGENCE · KEY SIGNALS" label present above the rings.
6. Privacy masks values without reflow; sentiment accent applies to score ring + chip only.
7. 390 / 430 px: no horizontal overflow; rings wrap 3+2; one-hand readable.
8. Tap navigates to Analysis › AI Analysis.

## Non-Goals
- No real AI/LLM model integration; no new backend fields. Uses existing payload; missing metrics degrade gracefully.
- No change to the four bars' metrics or the score-ring logic (already compliant).
- No data-layer work (mapping `institutional_flow` / `price_vs_fair_value` availability is a separate HERMES/backend decision).
```
```
