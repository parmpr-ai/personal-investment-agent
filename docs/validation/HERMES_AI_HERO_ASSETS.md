# HERMES-AI-007 AI Hero Asset Export Pack

Status: PASS

Source folder: `docs/mocks/ai-intelligence/APPROVED`

Sources:
- `buy-bull-compact.webp`
- `HOLD.png`
- `sell-bear-expanded.png`

## Output File Tree

```
frontend/public/assets/ai-heroes/
  buy/
    mobile-compact.webp
    mobile-expanded.webp
    desktop.webp
  hold/
    mobile-compact.webp
    mobile-expanded.webp
    desktop.webp
  sell/
    mobile-compact.webp
    mobile-expanded.webp
    desktop.webp
```

## Validation Matrix

| File | Dimensions | Size | Transparency | Export |
|---|---:|---:|---|---|
| frontend/public/assets/ai-heroes/buy/mobile-compact.webp | 512x512 | 100.6 KB | PASS | PASS |
| frontend/public/assets/ai-heroes/buy/mobile-expanded.webp | 1280x720 | 265.2 KB | PASS | PASS |
| frontend/public/assets/ai-heroes/buy/desktop.webp | 1920x1080 | 475.5 KB | PASS | PASS |
| frontend/public/assets/ai-heroes/hold/mobile-compact.webp | 512x512 | 68.5 KB | PASS | PASS |
| frontend/public/assets/ai-heroes/hold/mobile-expanded.webp | 1280x720 | 291.6 KB | PASS | PASS |
| frontend/public/assets/ai-heroes/hold/desktop.webp | 1920x1080 | 559.4 KB | PASS | PASS |
| frontend/public/assets/ai-heroes/sell/mobile-compact.webp | 512x512 | 54.8 KB | PASS | PASS |
| frontend/public/assets/ai-heroes/sell/mobile-expanded.webp | 1280x720 | 247.7 KB | PASS | PASS |
| frontend/public/assets/ai-heroes/sell/desktop.webp | 1920x1080 | 485.7 KB | PASS | PASS |

## Checks

- Mobile compact target under 150 KB: PASS
- Transparent background present in every exported WebP: PASS
- Full artwork visible with centered placement: PASS
- No text, borders, UI, labels, badges, logos, or backgrounds added to production assets: PASS
- Contact sheet: `docs/validation/HERMES_AI_HERO_ASSETS_CONTACT_SHEET.png`

## Notes

Only resize, transparent-canvas crop, center alignment, and WebP optimization were applied. Approved design-lock source artwork was not regenerated, redrawn, recolored, or redesigned.
