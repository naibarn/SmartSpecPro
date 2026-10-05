# Public token changelog

## 1.0.0 — 2026-10-05

- Added scoped `--public-layout-wide: 82.5rem` to the SmartAIHub public Home theme.
- The bounded page sections now explicitly use `margin-inline: auto`. Astryx `Section` applies `max-width` but does not center its outer element; omitting auto margins caused wide-desktop content to remain left-aligned.
- Existing brand accent continues to resolve from the SmartAIHub primary token; no global color token or reset was changed.
