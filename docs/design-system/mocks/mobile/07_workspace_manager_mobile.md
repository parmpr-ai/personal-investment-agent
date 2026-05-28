# Mock 07 - Workspace Manager Mobile

## Goal

Make the top-left hamburger open a compact Workspace Manager sheet where users control mobile bottom navigation, desktop sidebar visibility, workspace order, and local custom workspaces.

## Target Screen

Global mobile shell, opened from the top-left hamburger.

## Layout

```text
Workspace Manager

System
[Settings] [About]

Pinned Bottom Navigation     5/5
[=] Home                 [x]
[=] My Portfolio         [x]
[=] Watchlists           [x]
[=] Scanner              [x]
[=] Markets & Macro      [x]

All Workspaces
[=] Home                 [open] [pin] [desktop]
[=] My Portfolio         [open] [pin] [desktop]
[=] Watchlists           [open] [pin] [desktop]
[=] Scanner              [open] [pin] [desktop]
[=] Markets & Macro      [open] [pin] [desktop]
[=] AI Infrastructure    [open] [pin] [desktop]
...

Custom Workspaces
[name input] [icon] [color]
[template select]
[Add workspace]

Manage
[Reset to defaults]
```

## Interaction Rules

- Pinned Bottom Navigation supports drag reorder and unpin.
- Mobile pinned workspaces are limited to five.
- Pin action is disabled and a compact warning is shown when five are already pinned.
- All Workspaces supports drag reorder for the shared workspace list.
- All Workspaces supports direct open so overflow workspaces are reachable without changing pins.
- Settings and About / Release Center are available from the sheet system shortcuts.
- Desktop visibility is controlled from the same sheet via the desktop toggle.
- Custom workspace creation requires a name, icon, accent color, and template.
- Custom workspaces can be renamed and deleted.
- Reset restores registry order, default mobile pins, default desktop sidebar visibility, and clears custom workspaces.

## Acceptance Criteria

- The sheet is one-hand friendly and does not introduce horizontal overflow.
- Bottom nav updates from localStorage-backed state.
- Desktop sidebar uses the same workspace configuration where possible.
- Settings remains reachable from mobile settings/quick controls and is not pinned by default.
- Unknown workspace IDs fall back gracefully to Home/workspace shell context.
