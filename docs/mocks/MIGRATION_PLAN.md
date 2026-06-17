# Mock Repository Consolidation — Migration Plan (ATHENA-GOV-005)

Status: Plan of record. Phase 1 (folder scaffold) executed; Phases 2+ (moves) deferred pending approval.
Policy: DEC-GOV-004 (Approved Mock Preservation), PIA-GOV-005 (Mock Lifecycle & Source of Truth).
Target structure: `docs/mocks/<feature>/{APPROVED,WORKING,UAT}/` — single source of truth.

## Folder semantics (PIA-GOV-005)
- **APPROVED/** — only approved, design-locked artifacts. The single implementation source of truth.
- **WORKING/** — drafts, experiments, iterations, proposals. Never an implementation reference.
- **UAT/** — validation screenshots, comparisons, bug reproductions, recovery captures.

Implementation may only reference files under `APPROVED/`. If no approved artifact exists → implementation is blocked.

## Scaffolded features (Phase 1 — done)
`ai-intelligence`, `analyst-targets`, `stock-intelligence`, `watchlists`, `portfolio`, `position-summary`, `settings`
— each with `APPROVED/`, `WORKING/`, `UAT/` (`.gitkeep` placeholders). No files moved.

## ⛔ Critical compliance finding
**AI Intelligence V2 — Approved Mock: MISSING.** The locked V2 design has no approved PNG archived.
`docs/mocks/AI Intelligence/mock v1.png` is a DRAFT (not the approved V2) and must NOT be renamed/promoted.
The V2 Design Lock Package is INVALID until an approved mock is committed under `ai-intelligence/APPROVED/`
(only Design Spec `…/stock-workspace/ai-intelligence-widget-v2.md` and Design Lock commit `3bb14df` exist).

## Categorization → target (Phase 2 move map; no renames for AI)

### ai-intelligence
- APPROVED: **MISSING** (PO must supply/commit).
- WORKING: `AI Intelligence/mock v1.png` → `ai-intelligence/WORKING/mock v1.png` (relocate only, NO rename); spec `…/ai-intelligence-widget-v1.md`.
- APPROVED (spec): `…/ai-intelligence-widget-v2.md` (LOCKED spec).
- UAT: `bug033-*` (+baseline), `cr-ai-010-*`, `recovery-*`, `cr-si-026-*`, `cr-si-027-*`.

### analyst-targets
- APPROVED: `approved designed and locked .png`, `Approved_mobile_mock_analyst_target.jpg`, `analyst-targets-v3-desktop.png`.
- UAT: `cr-at-025-*`.

### stock-intelligence
- APPROVED: `stock-intelligence-v1-approved.png`.
- UAT: `cr-si-header-001a-*` (+`.webm`), `si-header-001-*`.

### watchlists
- APPROVED: `watchlists-mobile-v1-approved.md`.
- WORKING: `14e944…png` (UUID draft).
- UAT: `wl-*-2x2-after.png`, `cr-wl-002/003/004-*`, root `uat-wl-*`.

### portfolio
- APPROVED: **MISSING** (cards v2 shipped without an archived approved mock).
- UAT: `cr-pc-005/006/007-*`, `uat-task3-*portfolio*`, `uat-task3-pf-*`.

### position-summary
- APPROVED: `Approved_mobile_compact.jpg`, `Approved_mobile_customize.jpg`, `position-summurry-expanded-approved.png`, `DESIGN_LOCK.md`.
- UAT: `bug-mob-001-verification.png` (confirm ownership).

### settings
- APPROVED: **MISSING**.

### OBSOLETE (archive `_archive/` or delete on PO sign-off — not migrated)
- `probe-41f0e37-*`, `probe-57af474-*`, `probe-f97887b-*`, `probe-branch_head-*` (ErrorBoundary/debug probes).
- `cr-ai-010-debug-*` (debug states).

## Migration execution order (Phase 2+)
1. (DONE) Create `<feature>/{APPROVED,WORKING,UAT}/` + `.gitkeep`.
2. `git mv` APPROVED assets first (history-preserving).
3. `git mv` root UAT files into matching `<feature>/UAT/`.
4. ai-intelligence: relocate `AI Intelligence/mock v1.png` → `ai-intelligence/WORKING/` (NO rename); remove empty space-named folder; keep `APPROVED/` empty (MISSING).
5. Consolidate `docs/design-system/mocks/` specs into feature folders or cross-link.
6. `_archive/` the probe/debug files.
7. One commit per phase, separate from any code.

## Reference update plan (after moves)
| Reference | Update |
|---|---|
| `CHANGELOG.md` v0.3.22 mock paths | new `APPROVED/`/`WORKING/` paths |
| `PIA_ACTIVE_CONTEXT.md` traceability triples | new AI / analyst-targets paths |
| `MASTER_BACKLOG.md` GOV-004-REMEDIATION asset list | new paths; close when compliant |
| `position-summary/DESIGN_LOCK.md` | internal path refs |
| `docs/mocks/README.md` | document the `<feature>/{APPROVED,WORKING,UAT}` convention |
| App code | none expected (mocks not imported) — grep-verify before executing |

## Constraints
- No renames of the AI Intelligence mock.
- No moves/deletions performed in Phase 1.
- Single target location `docs/mocks/<feature>/`.
