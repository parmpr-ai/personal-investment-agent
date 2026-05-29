# PIA Workspace & Widget Architecture — Final Specification

Task ID: PIA-ARCH-001-FINAL
Owner: ATHENA | Senior Platform Engineer
Priority: P1
Status: APPROVED · LOCKED · official implementation reference
Date: 2026-05-30
Branch: feat/pia-v3-foundation-integration
Merges: PIA-ARCH-001 (proposal) · PIA-ARCH-001-B (mock pack) · PIA-ARCH-001-C (final spec) · PIA-UX-030 (card interaction model)

> This is the single source of truth for Workspace & Widget implementation. It supersedes the
> earlier ARCH-001 drafts and builds on `docs/PIA_V3_WORKSPACE_SPEC.md` (navigation + frozen
> widget IDs). No implementation is authorized by this document. Work proceeds only under
> assigned, ID-bearing tasks through the governance lifecycle
> (OPEN → IN PROGRESS → IMPLEMENTED → IN VALIDATION → CLOSED). Visual changes follow the
> Mock-First Rule. Closed = Implemented + Mobile UAT validated (APOLLO + Product Owner).

---

## 1. Core Principle
- **Workspace = Container. Widget = Functionality.**
- Workspaces do **not** represent features; they hold widgets.
- Widgets provide functionality and are placeable in any container.

## 2. Design Principles
1. Defaults are **editable templates**, never constraints.
2. **No hard workspace restrictions** — any catalog widget can go in any workspace.
   `supportedWorkspaces` is demoted to a non-filtering hint (`recommendedWorkspaces`).
3. Widget placements are **addressable instances** (duplication, per-instance size + config/preset).
4. **One source of truth, two presentations** — desktop and mobile share instances; only order,
   pins, and mode differ.
5. **Local-first, cloud-ready** — single versioned envelope; future sync augments, never replaces.
6. **Content > Controls** — show information, hide actions until requested (cards).
7. **Safe by default, powerful on demand** — Workspace Modes gate complexity.
8. **Mock-first + UAT-gated.**

## 3. System Templates (Default Workspaces)
Templates are **starter packs** only. A template seeds an editable Workspace Instance on first use;
thereafter the instance is authoritative. Per-workspace and global Reset re-seed from the template.

Confirmed System Templates (8):

| Template | Workspace id | Note |
| --- | --- | --- |
| Home | `home` | Now a customizable, re-seedable template (was fixed primary shell) |
| Portfolio | `my-portfolio` | |
| Watchlists | `watchlists` | |
| Trade Coach | `trade-coach` | |
| Academy | `academy` | |
| Markets & Macro | `markets-macro` | |
| News Intelligence | `news-intelligence` | ⚠️ No workspace id exists today — "News Intelligence" is currently a *widget* only. Promoting to a System Template requires adding a new workspace id (implementation dependency, not doc-only). |
| Swing Trades | `swing-trades` | Renamed from "Swing Trading" |

Notes:
- **Crypto** is removed from the template set; it remains a workspace in `workspaceRegistry.ts`.
- **Widget Presets ≠ Workspace Templates.** They are distinct concepts: Workspace Templates seed
  whole containers; Widget Presets (§6.1) are reusable per-widget configurations.

## 4. Workspace Model
```
WorkspaceTemplate (code)        seeds → WorkspaceInstance (user-owned)
WorkspaceInstance {
  id                 // system id, or 'custom-<uuid>'
  origin: 'system' | 'custom'
  templateId?        // seeding template (for Reset + custom provenance)
  title, iconKey, accent?
  mode: 'standard' | 'advanced' | 'locked'
  widgets: WidgetInstance[]      // ordered = render order
  aiContextOverride?
  createdAt, updatedAt, schemaVersion
}
```

### 4.1 Workspace Modes (LOCKED)
- **Standard** (default) — beginner-friendly; add/remove/reorder; resize & duplication hidden.
- **Advanced** — full customization: duplication, resize, layout editing, per-instance config/presets.
- **Locked** — read-only, mobile-safe.

Custom workspaces are instances (`origin:'custom'`), **not** cloned definitions.

### 4.2 Reset semantics
- Per-workspace reset re-seeds `instances[id].widgets` from `templateId`.
- Global reset re-seeds all system workspaces and clears custom ones.

## 5. Widget Model
```
WidgetCatalogItem (code) {
  id, title, category, description
  allowedSizes, defaultSize, status: 'existing' | 'planned'
  recommendedWorkspaces        // HINT ONLY — never filters
  configSchema?                // per-instance config + preset options
  marketplace: { tier: 'official' | 'community' | 'premium' }
}
WidgetInstance { instanceId, widgetId, size, config? }
```
- Frozen widget IDs preserved (`PIA_V3_WORKSPACE_SPEC.md`).
- Membership check is **only** `isKnownWorkspaceWidgetId` — there is **no** workspace-membership filter.
- Accessors: `getRecommendedWidgets(workspaceId)`, `getAllAddableWidgets()`.

## 6. Widget Presets & Marketplace

### 6.1 Widget Presets (LOCKED)
Reusable named `config` values, surfaced at add-time and in Configure. Examples:
- **Watchlist Widget:** AI Stocks · Crypto Miners · Swing Candidates
- **Chart Widget:** NVDA · AMD · BTC

Presets are config of existing widgets — they create no new widget IDs. Selecting a preset sets the
instance `config`; the user may customize further. Presets are independent of Workspace Templates.

### 6.2 Add Widget Flow
Two tabs — **Recommended** (hint-driven) and **All** (full catalog) + search. Adding creates an
instance at `defaultSize`; duplicates allowed; planned widgets add as shells. **No hard restrictions.**

### 6.3 Widget Marketplace (Approved, forward-looking)
Discovery surface grouped by category and **tier**: **Official · Community · Premium** (UI reserved
now, gating later). Shares one add path with Add Widget. Entitlement/billing out of scope for first
implementation.

## 7. Desktop Model — Workspace Rail
- **Unlimited** workspaces, **unlimited scrolling**, **no 5-item limit**, sidebar-based.
- Does **not** use mobile pinned-navigation logic.
- Advanced Mode inline affordances: drag reorder, size selector (within `allowedSizes`), Configure,
  duplicate, remove.

## 8. Mobile Model — Pinned Bottom Navigation
- **Max 5** pinned workspaces (hard cap, inline warning), one-handed-first, fast switching.
- Single-column widget stack; up/down reorder + remove in Widget Edit Mode; no horizontal overflow;
  privacy masks without reflow.
- Overflow workspaces live in the Workspace System (§12).

## 9. Interaction Layers (Governing Model)
This is the governing resolution for all card/widget gestures. It **replaces** the earlier
options A/B/C. Two layers exist; the active layer is determined by the event target.

| Layer | Acts on | Targets | Actions |
| --- | --- | --- | --- |
| **Container Layer** | the **widget** / workspace layout | widget chrome, header, padding, empty area, edit mode | Reorder, Rename, Duplicate, Move, Configure, Pin, Delete *(the widget)* |
| **Content Layer** | the **data** | a position card, watchlist row, news item, chart body | Open, Open fullscreen, + data-specific actions *(on the item)* |

### 9.1 Gesture mapping
**Mobile**
- Long-press on **widget chrome/container** → **Widget Edit Mode**.
- Long-press on **content card inside widget** → **Content Context Menu**.
- Tap **content card** → Open content detail / Stock Intelligence.

**Desktop**
- Drag **widget chrome/container** → reorder workspace layout.
- Right-click **widget chrome/container** → widget (container) actions.
- Right-click **content card** → content actions.
- Click **content card** → open detail.
- Double-click **content card** → fullscreen (content layer).

### 9.2 Widgets with no obvious content layer (e.g., a single chart widget) — DECISION
- The **widget body is treated as the Content Layer.**
- Tap body → Open widget detail / expanded chart.
- Mobile long-press body → content/context menu **if available**.
- **Container actions must stay on widget chrome / header / edit mode — never the chart body.**

### 9.3 Disambiguation rule (implementation)
- Hit-testing decides the layer by **event target**.
- **Content elements must `stopPropagation`** so a long-press / right-click on a content card does
  **not** also trip the container (no double-fire).
- Whole-surface "open" applies at the **Content** layer; the container's surface gesture is reserved
  for select / edit.

### 9.4 What this preserves
Workspace = Container · Widget = Functionality · Content > Controls · no gesture ambiguity.

## 10. Widget Reordering (applies to ALL workspaces)
- **Desktop:** drag & drop (on the **Container Layer** — widget chrome/container).
- **Mobile:** long-press on widget chrome/container → **Widget Edit Mode**, then reorder
  (up/down or drag where available).
- Applies to every workspace, system and custom.
- The per-widget Container context menu (Rename/Duplicate/Move/Configure/Pin/Delete) is reached via
  the widget `⋯` affordance in Edit Mode (mobile) and right-click on chrome (desktop).

## 11. Card Interaction Model (PIA-UX-030, Approved) — Content Layer
**Content > Controls.** No permanent Intel/Delete/Edit/Settings buttons. All gestures below are
**Content Layer** per §9; container gestures are defined in §9–§10.

| Gesture | Desktop | Mobile |
| --- | --- | --- |
| Open | Click | Tap |
| Fullscreen | Double-click | (from opened detail) |
| Content context menu | Right-click | Long-press (~450ms) |

- Content context menu: Open · Open fullscreen · — · Rename · Duplicate · Move · Configure · Pin ·
  — · **Delete** (danger, separated, last).
- Whole content-card surface clickable; nested interactive elements `stopPropagation` (§9.3).
- **Delete always confirms** (Cancel default-focused; Esc/backdrop = Cancel); **Undo toast
  recommended** (≤5s).
- Density: removing the persistent action row yields **≥15% content gain** (measure at verification).
- Accessibility: card focusable (`role=button`, `tabindex=0`); Enter/Space opens; content context
  menu reachable without right-click (hover `⋯` / keyboard) so keyboard/touch users aren't locked out.

## 12. Workspace System (renamed from "Workspace Manager")
No longer a navigation editor — a **workspace system configuration area**. Future structure:
- **My Workspaces** — user instances (CRUD, order)
- **Templates** — System Templates / starter packs (§3)
- **Presets** — reusable widget configs (§6.1)
- **Desktop Experience** — rail visibility/order (§7)
- **Mobile Experience** — ≤5 pins, mobile order (§8)
- **Maintenance** — reset, migration, storage/perf

## 13. Mobile Portfolio Card V2 (Approved — enhance, don't redesign) — Content Layer
Position cards are **Content Layer** per §9; the containing Portfolio widget's reorder/edit is
**Container Layer**.

Keep current visual style + **Momentum** and **Risk Bar**. Add:
**Shares · Avg Cost · Last Price · Market Value · Today P&L $ · Today P&L % · Unrealized P&L $ ·
Unrealized P&L %.**

Interactions (Content Layer):
- **Tap → Stock Intelligence**
- **Long-press → Content Context Menu**
- **Swipe L/R → Next stock**

Privacy masking preserved; no horizontal overflow.

## 14. Storage Model
Single versioned key replaces all legacy keys:
```
pia.workspace.state.v2 → WorkspaceUserState {
  schemaVersion: 2
  instances: Record<WorkspaceId, WorkspaceInstance>
  order: WorkspaceId[]            // desktop rail (unlimited)
  pinnedMobile: WorkspaceId[]     // ≤ 5
  sidebarDesktop: WorkspaceId[]
  mobileOrder?: WorkspaceId[]
}
```
Subsumes legacy keys: `pia.workspace.layout.v1.{id}`, `pia.workspaces.custom`, `pia.workspaces.order`,
`pia.workspaces.pinnedMobile`, `pia.workspaces.sidebarDesktop`.

Rules: hydration-safe, browser-only, atomic/debounced whole-envelope writes. **Normalize on read:**
drop unknown widget ids (known-id check only — no membership filter), drop instances referencing
unknown workspaces, clamp `pinnedMobile` to 5, clamp `size` to `allowedSizes`, seed missing system
instances. Cloud-ready: the envelope is the unit a future sync layer reads/merges.

## 15. Migration Plan (zero loss, idempotent, read-time)
1. If `pia.workspace.state.v2` exists → done.
2. Seed system instances from the registry.
3. Import each `pia.workspace.layout.v1.{id}` array → `WidgetInstance[]` (defaultSize, fresh
   instanceId, no config). Preserves order.
4. Import `pia.workspaces.custom` → `origin:'custom'` instances; **re-seed widgets from template**
   (silently fixes PIA-BUG-027).
5. Import `order`, `pinnedMobile` (clamp ≤5), `sidebarDesktop`.
6. Write v2; **retain legacy keys read-only one release** (rollback); remove in a follow-up.
7. Any corrupt slice → per-slice fallback to defaults; never throws.

## 16. Open Bug — PIA-BUG-027 (P0, OPEN)
**Custom Workspace Widget Filtering.** `normalizeWorkspaceLayout` intersects saved widgets with
`supportedWorkspaces`; `custom-*` ids match no catalog widget → supported set empty → template
widgets filtered out. **Must remain in backlog.** Fixed structurally by §2.2 (hint demotion) +
§14 normalization + §15 migration.

## 17. Risks
| # | Risk | Severity | Mitigation |
| --- | --- | --- | --- |
| R1 | Any-widget-anywhere → data-foreign placements | Med | Widgets self-handle empty data; soft hint, never block; cross-placement QA |
| R2 | Migration data loss/corruption | High | Idempotent, retain legacy 1 release, per-slice fallback, fixture tests |
| R3 | Preset/config scope creep | Med | `configSchema?` opt-in; renderers incremental |
| R4 | Mobile/desktop divergence | Med | Shared instances; only order/pins/mode differ; mobile UAT gate |
| R5 | Duplicate-instance cost | Low/Med | instanceId keys; per-workspace cap; perf backlog |
| R6 | Frozen IDs must not change | High | 1:1 migration |
| R7 | Shared `workspace/*` edits | High | ATHENA owns; no concurrent edits |
| R8 | Mobile long-press overloaded (edit mode vs context menu) | — | **RESOLVED by §9 Interaction Layers (Container vs Content)** |
| R9 | `news-intelligence` template has no workspace id today | Med | Add workspace id when promoting to System Template (§3) |

## 18. Backlog Dependencies
PIA-BUG-027 (prerequisite) · PIA-UX-030 (card model) · Mobile Portfolio Card V2 · `news-intelligence`
workspace id (§3) · Watchlists CRUD (Watchlist presets) · TradingView chart (Chart presets) ·
Unified Intelligence Feed (per-instance config sources) · Cloud backup/restore (consumes v2 envelope) ·
Performance/storage efficiency · Mobile Contextual Top Bar.

## 19. Final Acceptance Criteria
1. Any catalog widget can be added to any workspace; nothing blocks on `supportedWorkspaces`/`recommendedWorkspaces`.
2. **PIA-BUG-027 resolved** — custom workspaces render their seeded widgets (regression test).
3. Duplicate instances per workspace, each with independent size/config.
4. Per-instance size/config/preset persist and survive normalization.
5. Defaults behave as editable templates; per-workspace + global Reset re-seed.
6. Presets apply named config and remain editable; presets are distinct from workspace templates.
7. Modes: Standard hides advanced; Advanced enables duplication/resize/layout; Locked read-only; mode persists.
8. Desktop rail: unlimited workspaces + scrolling + no pin cap.
9. Mobile: ≤5 pins with inline warning; one-handed reorder/remove; no horizontal overflow; privacy no-reflow.
10. Desktop and mobile share instances; only order/pins/mode differ.
11. Add Widget exposes Recommended + All; marketplace lists by category + tier; shared add path; planned widgets non-actionable.
12. Single `pia.workspace.state.v2`; legacy keys migrate zero-loss; idempotent; hydration-safe.
13. **Two-layer disambiguation:** a gesture on a content card never also triggers a container action (no double-fire); container actions live only on chrome/header/edit mode.
14. **Widget reordering** works on ALL workspaces — desktop drag & drop; mobile long-press → Widget Edit Mode.
15. Card model: whole content-surface open; double-click fullscreen (desktop); right-click/long-press content menu; **no permanent action buttons**; delete confirms; ≥15% content gain.
16. No-content-layer widgets (e.g., chart): body = content layer (tap opens detail/expanded; long-press = content menu if available); container actions stay on chrome.
17. Mobile Portfolio Card V2: keeps style + Momentum/Risk Bar; adds the 8 metrics; tap/long-press/swipe behaviors; privacy preserved.
18. The 8 System Templates exist as editable starter packs; Crypto retained as a non-template workspace.
19. No existing widget IDs change; reuse not rewrite.
20. Closed = Implemented + Mobile UAT validated (APOLLO + Product Owner).

**Non-goals (first implementation):** cloud sync, real entitlement/billing, community widget
authoring, removal of legacy storage keys, free-pixel desktop canvas, bulk card delete/multi-select.

---

End of specification. Every delivered change must trace to a numbered acceptance criterion above.
No implementation is authorized by this document; proceed only under an assigned, ID-bearing task
per PIA Agent Governance.
