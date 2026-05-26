# PIA V3 Workspace System Specification

## Approved Navigation

Primary:

- Home

Workspaces:

- My Portfolio
- Watchlists
- Scanner
- Markets & Macro
- AI Infrastructure
- Earnings Week
- Swing Trades
- Crypto
- Trade Coach
- Academy

The locked workspace IDs live in `frontend/components/workspace/workspaceRegistry.ts`. New navigation should consume the registry instead of duplicating labels, icons, or default widget lists.

## Workspace List

Each workspace has:

- `id`
- `title`
- `description`
- `iconKey`
- `category`
- `defaultWidgetIds`
- `defaultAiContext`
- `mobilePriority`
- `status`

Active V3 foundation workspaces:

- Home
- My Portfolio
- Watchlists
- Scanner

Planned workspaces:

- Markets & Macro
- AI Infrastructure
- Earnings Week
- Swing Trades
- Crypto
- Trade Coach
- Academy

Planned means the workspace is registered and visible to architecture consumers, but the selector must render it disabled or coming soon until implementation lands.

## Widget Rules

The widget catalog lives in `frontend/components/workspace/widgetCatalog.ts`. Each widget has:

- `id`
- `title`
- `category`
- `description`
- `allowedSizes`
- `defaultSize`
- `supportedWorkspaces`
- `status`

Existing dashboard widgets must keep their current IDs:

- `portfolio-snapshot`
- `decision-brief`
- `positions`
- `risk-controls`
- `news-intelligence`
- `exposure-map`
- `trade-radar`

Do not rewrite current widgets for V3 foundation work. Reuse current dashboard widgets and add adapters only where needed.

## Everything Is A Widget

Every workspace surface should be assembled from cataloged widgets. Pages, mobile sections, chart modules, intelligence feeds, scanners, coach panels, and education blocks should all become widgets with explicit workspace support and size constraints.

## Mobile Customization Rule

Mobile must use the same workspace and widget source of truth. Mobile ordering can differ from desktop, but saved layout keys must include the workspace ID and must normalize removed or unknown widgets safely.

## Local-First Architecture Decision

Workspace layout state is local-first for V3 foundation. The storage key format is:

`pia.workspace.layout.v1.{workspaceId}`

Helpers must be hydration-safe and only touch `window.localStorage` in the browser. Future cloud backup/restore should sync from this local model instead of replacing it.

## TradingView Chart Decision

TradingView is the charting decision for V3 chart widgets. The `tradingview-chart` widget is registered as planned and should become the shared chart module for portfolio, watchlists, scanner, markets, swing trades, and crypto workspaces.

## AI Redirect Mode Decision

AI Core should be workspace-aware. The active workspace supplies a short context string through `workspaceAiContext.ts`. Until full multi-agent routing exists, AI redirect mode should pass the active workspace title and context as prompt prefix metadata.

## Backlog

- Analyst Targets Intelligence Widget required per stock.
- Unified Intelligence Feed sources: Yahoo, Discord, Seeking Alpha, Reuters, PIA, X, IBKR.
- Watchlists add/remove/sort/company logo/mini charts.
- Sector & industry heatmap.
- Trade Coach voice mode.
- Academy workspace.
- Cloud backup/restore.
- Performance/storage efficiency requirements.
- Stock targets required per stock.
