# Mock 03 - Mobile Workspace Navigation

## Goal

Limit bottom navigation to five pinned workspaces and make those pins configurable from the Workspace Manager sheet.

## Target Screen

Global mobile shell.

## Default Pinned Bottom Workspaces

1. Home
2. My Portfolio
3. Watchlists
4. Scanner
5. Markets & Macro

## Workspace Manager Entry

Top-left hamburger opens the Workspace Manager sheet.

The manager includes:

- Pinned Bottom Navigation reorder/unpin controls
- All Workspaces direct open, pin, and desktop visibility controls
- Custom Workspaces creation, rename, and delete
- Settings and About / Release Center shortcuts
- Shared reset to defaults

## Full Workspace Library

- Home
- My Portfolio
- Watchlists
- Scanner
- Markets & Macro
- AI Infrastructure
- Earnings Week
- Swing Trades
- Crypto
- Trade Coach
- Academy
- Settings / About from system tool surfaces

## Layout Mock

```text
[=] PIA                         [Search] [Eye] [Bell]
Active workspace content

Workspace Manager sheet:
Pinned Bottom Navigation     5/5
[=] Home                 [x]
[=] My Portfolio         [x]
[=] Watchlists           [x]
[=] Scanner              [x]
[=] Markets & Macro      [x]

Home | Portfolio | Watchlists | Scanner | Macro
```

## Interaction

- Bottom nav changes active workspace immediately.
- Hamburger opens a compact sheet.
- Pinning, unpinning, and reorder persist locally.
- Overflow and custom workspaces can be opened directly from the manager.
- Desktop visibility and shared order use the same workspace configuration.
- Settings and About remain reachable from the hamburger flow even when not pinned.
- Privacy mode does not hide navigation affordances.

## Acceptance Criteria

- Bottom nav never contains more than five workspaces.
- Overflow workspaces remain reachable from the manager/menu surfaces.
- Navigation consumes workspace registry labels/IDs during implementation.
- Mobile layout has no horizontal overflow or clipped labels.

## Non-Goals

- Do not duplicate workspace registry data in final implementation.
