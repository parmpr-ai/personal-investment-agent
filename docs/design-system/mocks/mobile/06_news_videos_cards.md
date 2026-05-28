# Mock 06 - News / Videos Cards

## Goal

Remove redundant Open buttons. Make title, card, or thumbnail directly tappable. Videos need a useful preview or clean source card.

## News Layout Mock

```text
┌────────────────────────────────────┐
│ Reuters       18m      Confidence H│
│ NVDA rises as AI server demand...  │
│ Bias: Bullish  Move: Momentum      │
│ Why it matters ▾                   │
└────────────────────────────────────┘
```

## Video Layout Mock

```text
┌──────────┬─────────────────────────┐
│ preview  │ CNBC / Bloomberg   8-12m│
│ thumb    │ NVDA market narrative   │
│          │ Why it matters: catalyst│
└──────────┴─────────────────────────┘
```

## Interaction

- News: tap title or card opens article.
- Videos: tap thumbnail or card opens source/search.
- Long summary stays collapsed behind "Why it matters".
- No separate Open button.

## Video Preview Rules

- If real thumbnail exists: show thumbnail.
- If no thumbnail exists: show clean source card with source name, play icon, duration estimate, and query/source type.
- Avoid fake photoreal thumbnails.
- Mark search-based cards clearly when they are source searches, not fetched videos.

## Acceptance Criteria

- No Open buttons in News or Videos.
- Cards remain compact on 390px width.
- Source, recency/duration, and why-it-matters context are visible.
- Entire card or obvious primary area is tappable.
- Demo/search/fallback state is honest.

## Non-Goals

- No YouTube API integration in mock phase.
- No final UI implementation before Product Owner approval.
