# DESIGN_SPEC — <Feature / Widget Name> v<version>

> Design Specification standard (ATHENA-GOV-007 · DESIGN-LOCK-002).
> A Design Lock is valid only when **APPROVED_IMAGE + this DESIGN_SPEC.md + Design Lock Commit** all exist.
> Per **IMPLEMENTATION-002**: anything not explicitly documented here MUST NOT be assumed, invented, or
> interpreted by implementation agents — they must request clarification. If this file is missing,
> implementation is **BLOCKED** (IMPLEMENTATION-001) and the agent returns `INSUFFICIENT DESIGN INFORMATION`.

Status: <DRAFT | DESIGN LOCKED — date / approver>
Approved Image: `<docs/mocks/<feature>/APPROVED/<file>.png>`
Design Lock Commit: `<commit id>`
Implementation Commit: `<commit id>`

---

## 1. Overview
Purpose, target screen/surface, scope, and the single design intent in plain language.

## 2. Layout
Exact structure: sections, order, grid/columns, element placement, sizes, and containment. Reference the approved image regions explicitly.

## 3. Typography
Per text element: font size (px), weight, line-height, letter-spacing, transform, truncation rules, tabular-nums.

## 4. Spacing
Padding, margins, gaps between every element (px). Internal vs external spacing. No "approximate" values.

## 5. Colors
Every color by token/hex: surfaces, borders, text, accents, positive/negative/neutral, per-state tints.

## 6. Visual Assets
Icons (name + size), logos, dials/gauges, sparklines, images: source, dimensions, treatment.

## 7. Animation
Triggers, properties animated, durations (ms), easing, reduced-motion behavior, no-layout-shift constraints.

## 8. Responsive Behavior
Breakpoints and exact layout per width (e.g., 390 / 430 / desktop): column counts, wrapping, what hides/scrolls. No horizontal overflow rules.

## 9. Interaction Behavior
Tap/click, long-press, right-click, drag, swipe, hover; which targets are interactive; stopPropagation rules; navigation destinations.

## 10. State Definitions
Every state with its exact rendering: full / partial / empty / loading / error / privacy(masked) / sentiment variants. Define the missing-value token (e.g., `--`).

## 11. Acceptance Criteria
Objective, checkable pass conditions. Each maps to a section above.

## 12. Automatic Fail Conditions
Specific conditions that fail UAT regardless (e.g., horizontal overflow at 390px; widget collapses on missing data; undocumented element added; assumed value used).

## 13. Implementation Notes
Component/file targets, reuse, constraints, and anything an agent needs that is NOT visible in the image. Explicitly list "out of scope" and "do not change".
