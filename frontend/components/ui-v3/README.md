# PIA V3 UI Primitives

These primitives are the foundation for PIA V3 screens. The approved dark institutional mocks are the visual source of truth: premium dark surfaces, glass cards, rounded panels, compact readable density, and purple/blue neon accents.

## Usage

Import from the barrel file:

```tsx
import { PiaBadge, PiaMetric, PiaWidgetShell } from '@/components/ui-v3'
```

Compose widgets from the outside in:

```tsx
<PiaWidgetShell
  title="Portfolio Risk"
  subtitle="Live exposure model"
  statusBadge={<PiaBadge variant="ai">PIA AI</PiaBadge>}
>
  <PiaMetric
    label="Net Exposure"
    value="$284.2K"
    delta="+2.4%"
    trend="positive"
    sparklineValues={[12, 14, 13, 18, 21, 20]}
  />
</PiaWidgetShell>
```

## Components

- `PiaCard`: reusable card with icon, title, metric, visual, badge/actions, body, and footer slots.
- `PiaWidgetShell`: standard dashboard/widget frame with header slots, loading, error, empty, body, and footer states.
- `PiaMetric`: label/value/delta metric with positive, negative, and neutral trend styling.
- `PiaMiniSparkline`: dependency-free SVG sparkline for compact chart context.
- `PiaBadge`: signal and source badges, including Yahoo, Discord, SA, Reuters, PIA, X, and IBKR.
- `PiaButton`, `PiaInput`, `PiaTabs`, `PiaEmptyState`, `PiaStatusDot`: shared controls and status primitives.

## Design Rules

- Keep density compact but readable; use `density="compact" | "default" | "spacious"` instead of ad hoc padding.
- Do not use raw text dump widgets. Use title, metric, visual, badge/action, and footer slots deliberately.
- Default to mobile-safe layouts. Components should wrap rather than overflow.
- Use `privacySafe` for sensitive values when privacy mode may be active.
- Prefer PIA V3 CSS tokens from `globals.css` over one-off colors.
- Do not add dependencies for primitive visuals. `PiaMiniSparkline` is intentionally plain SVG.
- Preserve the existing dashboard until a dedicated V3 migration task.
