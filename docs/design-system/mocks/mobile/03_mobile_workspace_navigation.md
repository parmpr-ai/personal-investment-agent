# Mock 03 - Mobile Workspace Navigation

## Goal

Limit bottom navigation to five pinned workspaces. Put remaining workspaces inside a top-right menu. User configuration can come later.

## Target Screen

Global mobile shell.

## Pinned Bottom Workspaces

Default pinned set:

1. Home
2. Portfolio
3. Watchlists
4. Scanner
5. Coach

## Overflow Menu

Top-right menu includes:

- Markets & Macro
- AI Infrastructure
- Earnings Week
- Swing Trades
- Crypto
- Academy
- Settings
- Release Center

## Layout Mock

```text
┌────────────────────────────────────┐
│ PIA Mobile             [🔔] [☰]    │
│ Active workspace title             │
│ ...content...                       │
├────────────────────────────────────┤
│ Home | Port | Watch | Scan | Coach  │
└────────────────────────────────────┘

Top-right menu:
┌────────────────────┐
│ Workspaces          │
│ Markets & Macro     │
│ AI Infrastructure   │
│ Earnings Week       │
│ Swing Trades        │
│ Crypto              │
│ Academy             │
├────────────────────┤
│ Settings            │
│ Release Center      │
└────────────────────┘
```

## Interaction

- Bottom nav changes active workspace immediately.
- Top-right menu opens a compact sheet or popover.
- Selecting overflow workspace closes menu and updates active workspace.
- Later configuration allows changing pinned workspaces, but not in this mock.

## Acceptance Criteria

- Bottom nav never contains more than five workspaces.
- Overflow workspaces remain reachable in one tap from top-right menu.
- Navigation consumes workspace registry labels/IDs during implementation.
- Privacy mode does not hide navigation affordances.

## Non-Goals

- Do not implement pinned workspace customization yet.
- Do not duplicate workspace registry data in final implementation.
