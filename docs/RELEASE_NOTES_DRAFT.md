# PIA Release Notes — DRAFT

Status: DRAFT (not released). Pending CR-AI-011 + UAT pass. Updated 2026-06-22 (ATHENA-GOV-021).

## AI Intelligence V2

Highlights:
- New AI Verdict Engine (BUY / HOLD / SELL).
- Portfolio-aware recommendations (ADD / HOLD / TRIM / REDUCE / AVOID), separate from the AI verdict (DEC-AI-010).
- Shared Intelligence Context Layer — single data layer for AI Intelligence, Analyst Targets, Company, Financials, News, Videos (DEC-AI-009).
- Explainable AI reasoning (why-it-thinks, drivers, evidence).
- Scenario analysis.
- Driver scorecards.
- Evidence engine.
- Shared hero system — one premium neon-wireframe hero across compact + expanded (DEC-AI-011).
- Source freshness framework (per-metric + per-section provenance).
- Contract-locked frontend integration (HERMES-AI-006).

Status: Release Candidate — pending CR-AI-011 visual parity, real endpoint wiring, and final UAT.

## AI Intelligence V3 — Research / Provenance (in progress)

Highlights:
- Institutional Research tab (thesis-only) backed by `GET /api/intelligence/{symbol}/research`.
- Data provenance & trust layer — per-metric and per-section source/freshness/confidence; no dummy data (missing data shown as missing or hidden).
- Competitive Comparison renders only with real peer data (hidden otherwise).
- Configurable research: show/hide, reorder, text size S/M/L/XL, default expanded state, persisted.

Release impact:
- Backend Research contract is COMPLETE and within performance budget (p50 ≤12ms / p95 ≤18ms).
- **Not release-ready:** Research V2 frontend Design Lock is INVALID — the approved mock is missing (GOV-022-RESEARCH-MOCK-MISSING, P0). UAT screenshots not yet captured. Provider gaps (peers, financials, TAM, guidance, ownership, fund sentiment, DCF) remain placeholders.
