# Mock — AI Intelligence Widget v2 (Design-Lock Candidate)

Status: **DESIGN LOCKED — APPROVED 2026-06-10 (Product Owner, 10/10)**. Official AI Intelligence design; supersedes v1. Implementation: CR-AI-010 (READY). Decisions: DEC-AI-001/002/003.
Owner: ATHENA · Refines: `ai-intelligence-widget-v1.md` · Source: BUG-DESIGN-001 / AI Intelligence V3
Reference: `docs/mocks/stock-intelligence/stock-intelligence-v1-approved.png`

## What changed from v1 (refinement summary)
- KPI insights move from **bare ring gauges → compact KPI cards** (dial + value + trend delta), bigger tap targets, higher density, clear drill-down affordance.
- KPI semantics split into **two consistent families**: 3 score dials (0–100) + 2 directional KPIs (Inst Flow, Price vs Fair Value).
- **Explainability upgraded**: Tap KPI → **single Bottom Sheet** with three stacked sections — *Why it matters · Score breakdown · Historical evolution* — plus disclaimer. The composite score is also tappable.

## Goal
Final, implementation-ready layout for the AI Intelligence widget: institutional-grade explainability and drill-down, kept mobile-first and one-hand friendly.

## Target Screen
Stock Intelligence → Overview (`.sai`), desktop drawer/modal + mobile sheet. Drill-down opens a Bottom Sheet (mobile) / side panel (desktop).

## Layout Mock (mobile 390/430)
```text
┌────────────────────────────────┐
│ AI INTELLIGENCE             ⓘ  │
│ ┌────┐ Strong Momentum         │
│ │◷78›│ [ Bullish ]             │   composite dial is TAPPABLE (› affordance)
│ └────┘ Constructive trend…     │
│ Momentum   ▇▇▇▇▇▇▇░ 72         │   4 read-only bars (quick glance)
│ Trend      ▇▇▇▇▇▇░░ 68         │
│ Sentiment  ▇▇▇▇▇░░░ 61         │
│ Risk       ▇▇▇░░░░░ 38         │
│ KEY SIGNALS                    │
│ ┌──────────┐ ┌──────────┐      │   KPI CARDS (full-card tap, ≥56px)
│ │◷72  ▲+4 ›│ │◷68  ▲+2 ›│      │   dial + value + Δ + chevron
│ │Momentum  │ │Trend     │      │
│ └──────────┘ └──────────┘      │
│ ┌──────────┐ ┌──────────┐      │
│ │◷61  ▼-3 ›│ │▲ Inflow ›│      │   Inst Flow = directional
│ │Sentiment │ │Inst Flow │      │
│ └──────────┘ └──────────┘      │
│ ┌──────────┐                   │
│ │+12%  ▲  ›│                   │   Price vs Fair Value = signed %
│ │Price/FV  │                   │
│ └──────────┘                   │
└────────────────────────────────┘
```

## Layout Mock (desktop): KPI cards in a single 5-column row under the bars; composite dial + headline + chip at top; bars between.

## KPI card spec (special focus)
- **Card** (not bare ring): left dial/value, right trend Δ (arrow + signed change vs prior reading), chevron `›` affordance bottom-right; metric label beneath.
- **Tap target:** entire card, **≥56px tall desktop / ≥64px mobile**; 2-up grid mobile, 5-up row desktop (no horizontal scroll).
- **Two families, consistent:**
  - Score dials (0–100): Momentum Score, Trend Strength, Sentiment Score — conic dial + `nn` + `/100` on tap-sheet.
  - Directional: Institutional Flow (▲ Inflow green / ▼ Outflow red / ▬ Neutral amber), Price vs Fair Value (signed %, green ≥0 / red <0).
- **Discoverability:** persistent `›` chevron + the whole row labeled "KEY SIGNALS · tap for detail" on first view (one-time hint).
- **N/A:** per-card muted "—" dial; card stays (grid never collapses).

## EXPLAINABILITY — decision
**Tap KPI → Bottom Sheet alone is NOT sufficient.** Adopt the deeper model, but as **one scrollable Bottom Sheet** (progressive disclosure, not nested screens — keeps one-hand mobile):

```text
Bottom Sheet: "Momentum Score"
┌────────────────────────────────┐
│ Momentum Score      72 / 100  ✕│
│ ◷ dial            [ Bullish ]  │
│ ── Why it matters ───────────  │  1–2 plain-language sentences
│ Momentum gauges the strength…  │
│ ── Score breakdown ──────────  │  sub-factor contributions (SA-style)
│ Price vs 50DMA      +18  ▇▇▇   │
│ RSI(14)             64   ▇▇    │
│ Volume trend        +9   ▇     │
│ ── Historical evolution ─────  │  sparkline + trend over time
│ ▁▂▄▅▇  30d  52→72  ▲          │
│ ──────────────────────────────│
│ Rules-based signal, not advice.│  disclaimer
└────────────────────────────────┘
```
- One sheet per KPI; sections stack: **Why it matters → Score breakdown → Historical evolution → disclaimer**.
- Composite score dial taps to the same sheet structure, breakdown = the four bar factors (Momentum/Trend/Sentiment/Risk) and their weights.
- Sections that lack data hide gracefully (no empty headers).

## Hierarchy
Kicker → composite dial + headline + chip → 4 bars (glance) → KEY SIGNALS KPI cards (scan + drill) → (drill) Bottom Sheet.

## States
Full · partial (per-card "—") · all-N/A (cards muted, widget still intentional) · privacy (mask values, dials masked) · sentiment accent (dial + chip only) · sheet open/closed.

## Acceptance Criteria
1. KPI insights render as **tappable cards** (dial/value + trend Δ + chevron + label), ≥56/64px, full-card tap.
2. Exactly 5 KPIs with correct labels; score family 0–100, directional family formatted appropriately.
3. Tap any KPI **or** the composite dial → Bottom Sheet with **Why it matters / Score breakdown / Historical evolution / disclaimer**.
4. Per-card and per-section graceful N/A; grid/sheet never collapses.
5. Mobile 390/430: 2-up KPI grid, no horizontal overflow, one-hand reachable; sheet is single-scroll.
6. Privacy masks values without reflow; sentiment accent on dial + chip only.
7. Drill-down affordance (chevron) present; first-view hint "tap for detail".

## Non-Goals
- Real AI/LLM; new backend fields. Uses existing payload; missing sub-factors/history degrade gracefully (mapping is a HERMES/backend decision).
- Multi-screen nested navigation for drill-down (rejected — one bottom sheet only).
```
