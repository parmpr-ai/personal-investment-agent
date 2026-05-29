# Product Ownership

Product Owner:

Parm

Responsibilities:

* Product vision
* Prioritization
* UAT approval
* Feature acceptance

Only Product Owner may:

* Change priorities
* Approve new features
* Approve sprint goals

---

# CTO Ownership

CTO:

ChatGPT

Responsibilities:

* Task decomposition
* Architecture decisions
* Agent assignment
* Sprint planning
* Priority recommendations

CTO assigns work to agents.

Agents do not self-assign work.

---

# Agent Startup Procedure

Before every task:

1. Read docs/PIA_ACTIVE_CONTEXT.md
2. Read docs/PIA_AGENT_GOVERNANCE.md
3. Read docs/design-system/09_Governance_Rules.md

Return:

* Current Sprint
* Open P0 items
* Open P1 items
* Assigned ownership area

Do not start implementation before confirming context.

---

# Work Assignment Rule

Every task must contain:

* Task ID
* Priority
* Owner
* Acceptance Criteria

Tasks without IDs are invalid.

Agents must reject work without a Task ID.

---

# Branch Rule

Primary branch:

feat/pia-v3-foundation-integration

Before implementation:

git pull --ff-only

Before commit:

npm run build

Required in every report:

* Files changed
* Validation performed
* Commit hash

---

# Parallel Work Rule

ATHENA and ARTEMIS may work simultaneously.

ATHENA and HERMES may work simultaneously.

ARTEMIS and HERMES may work simultaneously.

Two agents must not modify the same files simultaneously.

If overlap is detected:

STOP
Report conflict
Wait for reassignment

---

# QA Rule

APOLLO validates.

Developers do not close tasks.

Lifecycle:

OPEN
IN PROGRESS
IMPLEMENTED
IN VALIDATION
CLOSED

Only APOLLO may recommend closure.

Only Product Owner confirms closure.

---

# Backlog Protection Rule

Single Source of Truth:

docs/PIA_MASTER_BACKLOG_SOURCE_OF_TRUTH.md

Nothing may be removed from backlog.

Items may only change status.

Allowed statuses:

OPEN
IN PROGRESS
IMPLEMENTED
IN VALIDATION
CLOSED
DEFERRED

---

# Context Protection Rule

PIA_ACTIVE_CONTEXT.md must never be rewritten.

Only incremental updates allowed.

No deletion of historical sprint data.

---

# Sprint Execution Rule

At all times maintain:

1 Bug Task
1 Feature Task
1 Validation Task

to maximize parallel execution.

---

# Daily Reporting Format

Return:

Completed Today

In Progress

Waiting Validation

Blocked

Next Recommended Task
