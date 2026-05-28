# Mock 01 - Mobile Portfolio Snapshot

## Goal

Create an IBKR-inspired compact portfolio terminal where one mobile screen shows useful portfolio state without scroll.

## Target Screen

Mobile Home / My Portfolio top snapshot.

## Layout Mock

```text
┌────────────────────────────────────┐
│ PIA        Live • IBKR     [eye] [≡]│
│ Net Liq  $128,420   Day +$842 +0.7%│
│ Cash $8.4k  Margin 12%  Risk 41/100│
├────────────────────────────────────┤
│ [P/L] [Alloc] [Risk] [Income]       │
├────────────────────────────────────┤
│ Top Movers                          │
│ NVDA +2.1%  $34.2k  Risk 47  ▲      │
│ MSFT -0.4%  $18.9k  Risk 28  ▬      │
│ AMD  +1.2%  $12.1k  Risk 52  ▲      │
├────────────────────────────────────┤
│ Exposure: Tech 42%  Cash 7%  ETF 18%│
└────────────────────────────────────┘
```

## Hierarchy

- Header row: product mark, connection state, privacy toggle, overflow menu.
- Primary value row: net liquidation value, day P/L, day percent.
- Control strip: cash, margin usage, risk score.
- Segmented mini-tabs: P/L, Allocation, Risk, Income.
- Compact list: top three movers or highest risk holdings.
- Footer exposure line: two to three dominant exposures.

## Interaction

- Tap a position row to open Mobile My Position Full Screen.
- Tap segmented mini-tab to swap the compact list body in place.
- Tap privacy toggle to mask values while preserving row widths.
- Pull-to-refresh can be supported later, but not required for this mock.

## States

- Live: source badge shows IBKR/Yahoo status.
- Degraded: compact amber source badge, no large warning card.
- Privacy: values become fixed-width masks.
- Empty: show compact setup callout under the primary value row, not a full-screen empty state.

## Acceptance Criteria

- A 390x844 viewport shows header, primary metrics, top movers, and exposure line without vertical scroll.
- No giant stacked cards.
- No horizontal overflow.
- Position rows remain tappable.
- Privacy mode does not reflow the terminal.

## Non-Goals

- Do not redesign desktop portfolio.
- Do not implement custom charting in this snapshot.
