# Mock 04 - Mobile Alerts / Notifications

## Goal

Make alerts visible, compact, stacked, and reliable. No disappearing alerts.

## Target Screen

Mobile notification center opened from bell.

## Layout Mock

```text
┌────────────────────────────────────┐
│ Alerts                       Done  │
│ Risk 2  News 4  System 1           │
├────────────────────────────────────┤
│ RISK  Now                          │
│ NVDA stop distance widened         │
│ Stop $982 is 4.1% below price      │
├────────────────────────────────────┤
│ NEWS  12m                          │
│ MSFT catalyst: AI capex reaction   │
│ Possible move: watch open          │
├────────────────────────────────────┤
│ SYSTEM Today                       │
│ Yahoo data degraded                │
│ Quotes using fallback where needed │
└────────────────────────────────────┘
```

## Hierarchy

- Sheet header with count chips.
- Alerts grouped by category through compact labels.
- Each alert is a stacked row, not a wide card.
- Severity is shown with left rail color and category chip.

## Interaction

- Tap alert opens relevant workspace or stock.
- Swipe left can dismiss later; not required in first implementation.
- Done closes sheet.
- Empty state shows three compact placeholder rows: risk, scanner, system.

## States

- Risk: red/amber.
- News: blue.
- System/source: neutral/amber.
- Privacy: symbols may remain visible unless user setting later masks symbols; amounts must mask.

## Acceptance Criteria

- Alerts are visible on 390px width.
- Alert text wraps cleanly.
- No hidden or disappearing notification content.
- Bell tap always opens a sheet with either real alerts or compact fallback items.

## Non-Goals

- No push notification transport changes.
- No backend notification schema changes for mock approval.
