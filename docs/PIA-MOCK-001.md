PIA-MOCK-001 — VERIFIED MOCK GOVERNANCE

Rule
Once a UI mock is approved by the Product Owner (Parm),

it becomes a VERIFIED MOCK.

A verified mock is considered source-of-truth until explicitly replaced.

---

Storage
Store approved mocks in:

docs/mocks/

Structure:

docs/mocks/

- stock-intelligence/
- watchlists/
- portfolio/
- workspace/
- settings/

---

Naming Convention
Examples:

stock-intelligence-v1-approved.png
stock-intelligence-v2-approved.png

watchlists-v1-approved.png

portfolio-mobile-v3-approved.png

---

Before Any UI Sprint
PM must verify:

1. Is there an approved mock?
2. Which version is active?
3. Has the approved mock changed?

If an approved mock exists:

Development must target the mock.

Not personal interpretation.

Not "improved" versions.

Not alternative layouts.

---

UAT Rule
Every UI UAT compares:

Current UI

VS

Verified Mock

Not against memory.

Not against previous chat messages.

---

Sprint Rule
Before assigning any UI redesign task:

PM must attach:

- mock path
- mock version
- acceptance criteria

Example:

Reference Mock:
docs/mocks/stock-intelligence/stock-intelligence-v2-approved.png

Implement against this mock only.

---

Mock Change Rule
If Product Owner changes direction:

Create:

stock-intelligence-v3-approved.png

Old mock remains archived.

No approved mock may be overwritten.

History must remain available.
