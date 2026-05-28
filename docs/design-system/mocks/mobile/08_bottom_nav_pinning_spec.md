# Mock 08 - Bottom Nav Pinning Spec

## Goal

Make mobile bottom navigation user-configurable while preserving the five-button maximum and workspace registry routing.

## Defaults

Default pinned workspaces:

1. Home
2. My Portfolio
3. Watchlists
4. Scanner
5. Markets & Macro

## Persistence

- `pia.workspaces.pinnedMobile`
- `pia.workspaces.sidebarDesktop`
- `pia.workspaces.order`
- `pia.workspaces.custom`

## Rules

- Render only pinned mobile workspaces in the bottom nav.
- Pinning a sixth workspace is blocked with a compact warning.
- Home is part of the default set and can be reordered.
- Settings remains in menu/settings surfaces, not bottom nav by default.
- About / Release Center remains in menu surfaces, not bottom nav by default.
- Overflow and custom workspaces must be directly openable from Workspace Manager.
- Labels must truncate or hide on narrow screens rather than overflow.
- Custom workspaces extend the registry at runtime and use the same routing path.

## Desktop Parity

The desktop sidebar consumes the same ordered workspace list and visibility config. The manager is available from the sidebar so desktop users can show, hide, reorder, create, rename, delete, and reset workspaces.
