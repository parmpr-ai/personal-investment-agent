# PIA Project Status

Last updated: 2026-06-22 (ATHENA-GOV-021)
Branch: `feat/pia-v3-foundation-integration`

## AI Intelligence V2

| Item | Status |
|---|---|
| Backend Foundation | COMPLETE |
| HERMES-AI-005 (Shared Intelligence Context Layer) | COMPLETE / Accepted |
| HERMES-AI-006 (Cache, freshness, frontend contract lock) | COMPLETE / Accepted |
| ARTEMIS-AI-011 (V2 Compact + Expanded implementation) | IN PROGRESS |
| CR-AI-011 (Visual parity) | OPEN |
| Release Status | **Release Candidate — pending UAT** |

### Progress
- Backend: **98%**
- Frontend: **80%**
- Overall: **92–93%**

### Release blockers
1. **CR-AI-011 — Visual parity** (expanded V2 UX fixes + compact overflow; pixel-match approved design).
2. **Real endpoint wiring** (frontend consuming the locked backend contract end-to-end).
3. **Final UAT pass**.

### Notes
- Decisions DEC-AI-009 (Shared Intelligence Data Layer), DEC-AI-010 (AI Verdict Separation), DEC-AI-011 (Hero System Standardization) are LOCKED.
- Canonical trackers: `docs/PIA_MASTER_BACKLOG_SOURCE_OF_TRUTH.md` (+ `.xlsx`), `docs/architecture/AI_INTELLIGENCE_ARCHITECTURE.md`, `CHANGELOG.md`, `docs/UAT_TRACKING.md`, `docs/ROADMAP.md`, `docs/RELEASE_NOTES_DRAFT.md`.

## AI Intelligence V3 — Research / Provenance

Updated 2026-06-22 (ATHENA-GOV-022).

| Item | Status |
|---|---|
| HERMES-AI-V3-001 (Research backend gap analysis) | COMPLETED |
| HERMES-AI-V3-002 (Research Endpoint V1, thesis-only) | COMPLETED |
| HERMES-AI-V3-003 (Provenance + real-data upgrade) | COMPLETED |
| CR-AI-V3-UI-001 (Overview/Compact/Expanded corrections) | CLOSED (89bad3a) |
| ARTEMIS-AI-V3-RESEARCH-003 (Research V2 tab) | IMPLEMENTED — Design Lock INVALID |
| Backend Research contract | Ready for frontend consumption |

### V3 release blockers
1. **GOV-022-RESEARCH-MOCK-MISSING (P0)** — approved Research mock `research-approved.png` is missing; Research V2 Design Lock invalid until it (and a Research design spec) are committed.
2. Research V2 UAT screenshots (390px tab, Customize drawer, expanded Investment Thesis, provenance drawer) not yet captured.
3. Competitive Comparison + provider data gaps (peers, financials, TAM, guidance, ownership, fund sentiment, DCF) — placeholders/hidden until providers added.

Decisions DEC-AI-RESEARCH-001..007 LOCKED. Backend perf well within budget (p50 ≤12ms / p95 ≤18ms vs 500/1000ms).
