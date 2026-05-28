# Mock 05 - Stock Quote / Technical IA

## Goal

Change the IA direction so Technical becomes Quote. Quote information sits above the chart in a compact div, while Trade Decision Snapshot is preserved.

## Proposed Tab IA

1. Quote
2. News
3. Company
4. Videos

Quote owns:

- Quote strip
- Chart
- Technical decision layer
- Trade Decision Snapshot

## Layout Mock

```text
┌────────────────────────────────────┐
│ ← NVDA                         [⋯] │
│ $1,024.33 +2.14% Vol 48M RVOL 1.3x │
│ Bid/Ask 1024.10/1024.60  Spread 5c │
│ S1 1008  S2 982  R1 1062  R2 1094  │
├────────────────────────────────────┤
│ TradingView chart                  │
├────────────────────────────────────┤
│ Trade Decision Snapshot             │
│ Bias Constructive | Confidence 78  │
│ Entry 1010-1024 | Invalid 982      │
│ TP 1062 / 1094 | R/R 2.3:1         │
│ AI: Wait for pullback or breakout  │
└────────────────────────────────────┘
```

## Rationale

- User intent is usually quote first, decision second.
- Separate Technical tab creates extra navigation friction.
- Quote should feel like an entry cockpit, not a basic price card.

## Interaction

- Timeframe chips remain inside Quote above or inside chart area.
- Tap S/R row expands support/resistance detail.
- Tap Trade Decision Snapshot expands full decision notes.

## Acceptance Criteria

- Quote info appears above chart in compact terminal div.
- Trade Decision Snapshot remains visible below chart.
- No generic indicator-only layout.
- Product Owner must approve tab IA before final UI implementation.

## Non-Goals

- Do not remove Company ownership of fundamentals.
- Do not implement final tab change yet.
