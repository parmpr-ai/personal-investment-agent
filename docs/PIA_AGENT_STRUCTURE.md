PIA AGENT STRUCTURE

### HERMES
Ownership:

- Stock Intelligence
- Manual Holdings
- Company Tab
- Financials Tab
- Video Tab
- Intelligence Frameworks

---

### ARTEMIS
Ownership:

- Watchlists
- Portfolio Display
- Portfolio Analytics
- Reorder Framework
- Portfolio UX

---

### ATHENA
Ownership:

- Workspace System
- Layout Engine
- Widget Infrastructure
- Settings
- Navigation
- Dashboard Structure
- Cross-workspace Architecture

Examples:

- Workspace reorder
- Widget placement
- Home workspace
- Workspace persistence
- Settings architecture

---

### APOLLO
Ownership:

- UAT
- Regression Testing
- Screenshot Validation
- Acceptance Testing

No feature ownership by default.

---

### FREE AGENT
Temporary overflow resource.

Used when:

- primary agent reaches token limits
- sprint capacity exceeded
- emergency hotfix required

Rules:

- never assign ownership permanently
- receives narrowly scoped tasks only
- cannot take shared architecture ownership
- cannot become source-of-truth owner

Free Agent may assist:

- bug fixes
- isolated components
- documentation
- validation

but ownership remains with the primary agent.

---

## OWNERSHIP HIERARCHY
Primary owner always wins.

Example:

Stock Intelligence
→ HERMES owner

Even if Free Agent implements a fix,
HERMES remains owner.

---

Workspace Architecture
→ ATHENA owner

Even if ARTEMIS touches a related UI,
ATHENA remains owner.

---

## TOKEN LIMIT HANDOFF RULE
When an agent reaches token limits:

1. Stop current sprint.
2. Produce continuation pack.
3. Identify owned files.
4. Identify active branch.
5. Identify unfinished tasks.
6. Assign continuation to:same owner if possible
7. Free Agent only if task is isolated

No handoff may cross ownership boundaries.

---

## PARALLEL SPRINT RULE
Preferred model:

HERMES
Stock Intelligence Track

ARTEMIS
Portfolio / Watchlists Track

ATHENA
Workspace / Settings Track

APOLLO
UAT Track

Free Agent
Overflow Support

This is the default PIA operating model.
