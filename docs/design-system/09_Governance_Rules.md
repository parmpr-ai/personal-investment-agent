# PIA Design System Governance Rules

## Product Direction

- PIA is a premium mobile-first investment command platform.
- Mobile views must prioritize one-hand use, compact decision density, and no horizontal overflow.
- Desktop can remain a power workspace, but mobile acceptance drives layout decisions.
- Preserve privacy mode, existing routes, workspace registry direction, and widget reuse.

## Mock-First Rule

- For major visual corrections, create mock specs first.
- Do not implement final UI until Product Owner approves the mock pack.
- Mock specs must identify target screen, layout hierarchy, key states, interaction rules, data requirements, and acceptance criteria.

## Mobile Rules

- No giant stacked cards when a compact terminal layout can show more useful information.
- Bottom navigation may pin at most five workspaces.
- Overflow workspaces belong in a top-right menu or later configurable workspace manager.
- Alerts must remain visible and compact; no disappearing or hidden notification states.
- Cards with media or article titles should be directly tappable when the target is obvious.

## Stock Intelligence Rules

- Quote and Technical information must support trade decisions, not generic indicator display.
- Technical decision context must preserve entry, invalidation, take-profit, risk/reward, and confidence.
- Company owns About, Earnings, Financials, Ratios, and Targets.
- News and Videos must be compact, source-aware, and directly actionable without redundant Open buttons.

## Design Specification Enforcement (ATHENA-GOV-007)

### DESIGN-LOCK-002 — Approved image alone is insufficient
- An approved image (APPROVED_IMAGE) by itself is NOT a valid Design Lock.
- Implementation may not begin until BOTH exist: APPROVED_IMAGE **and** DESIGN_SPEC.md.
- Design Lock Package = Approved Mock + Design Spec (+ Design Lock Commit, per DEC-GOV-004). Missing any one invalidates the Design Lock.

### IMPLEMENTATION-001 — Block without spec
- If `docs/mocks/<feature>/APPROVED/DESIGN_SPEC.md` does not exist, implementation is BLOCKED.
- The agent must return `INSUFFICIENT DESIGN INFORMATION` and request Design Lock completion. No code may be written.

### IMPLEMENTATION-002 — No assumptions
- Agents may NOT assume, invent, or interpret any of: spacing, typography, animations, responsive behavior, state behavior, visual assets, interaction behavior.
- If a detail is not explicitly documented in DESIGN_SPEC.md, the agent must request clarification. Do not invent. Do not interpret.

### Mock Repository Standard
- Every `docs/mocks/<feature>/APPROVED/` must contain BOTH an APPROVED_IMAGE and a `DESIGN_SPEC.md`.
- Example: `docs/mocks/ai-intelligence/APPROVED/ai-intelligence-all-cases-compact-approved.png` + `DESIGN_SPEC.md`.
- Design Spec standard template: `docs/templates/DESIGN_SPEC_TEMPLATE.md`.

### CTO Rule
- The CTO must not issue implementation tasks without a completed Design Lock Package (Approved Mock + Design Spec).

Reason: AI Intelligence Compact V2 — an approved PNG was interpreted differently by implementation and wasted multiple UAT cycles, because the image lacked enough information to be objectively enforceable by implementation agents.
