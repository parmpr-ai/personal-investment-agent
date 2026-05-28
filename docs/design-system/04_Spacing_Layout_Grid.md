# Spacing, Layout, Grid

## Layout Rules

- Mobile is the source of truth.
- Desktop adapts the approved mobile hierarchy into wider grids.
- Fixed-format controls must use stable dimensions.
- No horizontal overflow on mobile.
- No clipped cards.
- Bottom navigation and sheets must respect safe-area spacing.

## Density

PIA density should be compact premium, not cramped.

- Prefer 8-14 px internal spacing for compact cards.
- Prefer 16-24 px panel radius only where the existing system already uses it.
- Keep repeated cards under control in height.
- Keep scanner and notification cards vertically stackable.

## Grid Rules

- Mobile: single-column stacks, swipe rails, chip rails, and bottom sheets.
- Tablet: one to two columns only when content remains readable.
- Desktop: multi-column grids only for comparison workflows.

## Overflow Rules

- All long titles, ticker names, source names, and notification text must wrap or truncate intentionally.
- Tables may scroll horizontally only when approved by mock.
- Rails must scroll only on their own axis.
- Page-level horizontal overflow is a blocker.
