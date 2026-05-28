# Components Library

## Core Components

PIA UI changes should reuse existing primitives before creating new patterns:

- `PiaCard`
- `PiaWidgetShell`
- `PiaBadge`
- `PiaButton`
- `PiaInput`
- `PiaMetric`
- `PiaTabs`
- Mobile bottom sheets
- Swipe rails
- Compact chip rails

## Component Rules

- Cards are for repeated items, widgets, sheets, and framed tools.
- Do not place cards inside cards unless the approved mock explicitly requires it.
- Buttons must have clear target size and not cause layout shift.
- Use icons for tool actions when a recognizable icon exists.
- Use segmented controls for small mode sets.
- Use chips for filters and compact sort controls.
- Use bottom sheets for mobile overlays.
- Use stacked cards for mobile notifications and alerts.

## Required States

Every interactive component must define:

- Default.
- Active/selected.
- Disabled.
- Loading where applicable.
- Empty state.
- Privacy mode state.
- Mobile overflow behavior.

## Forbidden Patterns

- Giant desktop table controls on mobile.
- Raw unstructured text blocks where cards, rows, chips, or badges are expected.
- Decorative cards that do not carry task value.
- Invisible overlays that block pointer events.
- Unbounded horizontal scrolling outside approved rails/tables.
