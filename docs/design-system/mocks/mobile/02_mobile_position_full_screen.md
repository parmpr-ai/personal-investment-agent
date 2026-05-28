# Mock 02 - Mobile My Position Full Screen

## Goal

Create a full-screen IBKR-style position workspace with chart, metrics, and technical decision layer.

## Target Screen

Opened from any holding row/card.

## Layout Mock

```text
┌────────────────────────────────────┐
│ ← NVDA     NVIDIA Corp        [⋯]  │
│ $1,024.33  +2.14%   Pos $34.2k     │
│ Qty 34  Avg $884.10  P/L +$4,768   │
├────────────────────────────────────┤
│  [ intraday/swing/position chips ] │
│  TradingView compact chart         │
│  with price marker + S/R bands      │
├────────────────────────────────────┤
│ Trade Decision Snapshot             │
│ Bias Constructive  Confidence 78    │
│ Entry $1,010-$1,024  Stop $982      │
│ TP1 $1,062  TP2 $1,094  R/R 2.3:1   │
├────────────────────────────────────┤
│ News catalyst  |  Alerts  |  Notes  │
└────────────────────────────────────┘
```

## Hierarchy

- Full-screen shell, not a modal card.
- Sticky compact symbol header.
- Quote/position metrics immediately below header.
- Chart occupies the main visual area, not a decorative card.
- Trade Decision Snapshot sits directly below chart.
- Bottom action rail: catalyst, alert, notes, risk check.

## Interaction

- Back returns to previous workspace and preserves scroll state.
- Timeframe chips update chart interval and technical snapshot.
- Tap Trade Decision Snapshot rows to expand detail.
- Swipe down is optional; explicit back is required.

## Technical Decision Layer

Must include:

- Bias
- Confidence
- Support/resistance
- Conservative/aggressive entry
- Invalidation/stop
- Take-profit zones
- Risk/reward
- AI interpretation summary

## Acceptance Criteria

- Header, quote metrics, chart, and trade decision summary are visible within first screen.
- Chart is prominent but not oversized.
- Technical layer answers: "Should I enter this trade?"
- No final UI implementation before PO approval.

## Non-Goals

- Do not add order placement.
- Do not require backend schema changes for the mock.
