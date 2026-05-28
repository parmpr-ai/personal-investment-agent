# Motion and Interactions

## Motion Principles

Motion should make PIA feel native and responsive, not ornamental.

- Prefer short transitions.
- Avoid continuous decorative animation.
- Avoid expensive blur/shadow layers on mobile.
- Respect smooth scrolling and native momentum.
- Do not animate layout in ways that shift controls under the user's finger.

## Mobile Interaction Rules

- Swipe rails must use predictable snap behavior.
- Bottom sheets must open visibly above navigation.
- Overlays must not block unrelated controls when closed.
- Controls must be thumb-friendly.
- Touch targets must remain stable.

## Performance Rules

- Reduce heavy backdrop blur on small viewports.
- Avoid large layered shadows on repeated mobile cards.
- Avoid hover-only interaction requirements.
- Test route rendering after interaction changes.

## Validation Expectations

For interaction changes, validate:

- Build passes.
- Relevant routes return 200.
- No known horizontal overflow.
- No dead controls.
- Privacy mode behavior remains intact.
