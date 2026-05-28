# Iconography

## Icon Source

Use the existing app icon library where possible. In the frontend, prefer `lucide-react` icons for common actions and controls.

## Icon Rules

- Icons must support recognition, not decorate.
- Use icons in tool buttons for actions such as search, settings, close, refresh, visibility, navigation, alerts, and layout.
- Use icon plus text when the command may be ambiguous.
- Use tooltips or accessible labels for icon-only actions.
- Do not create manual SVG icons when an existing approved icon exists.

## Status Icons

- Risk/guardrail: shield, alert, warning.
- Scanner/opportunity: sparkles, target, trend.
- Portfolio: wallet, briefcase, chart.
- Settings/integrations: settings, database, globe.
- Privacy: eye/eye-off.

## Accessibility

Icon-only buttons must have `aria-label`.
Icons must not be the only signal for risk status; color, text, or badge tone must also communicate state.
