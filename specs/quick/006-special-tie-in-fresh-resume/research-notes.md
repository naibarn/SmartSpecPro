# Research notes

## Existing flow

- `VerticalDramaSeriesDetailPage.tsx` owns `specialTieInDialogOpen` and renders `SpecialTieInEpisodeDialog`.
- `SpecialTieInEpisodeDialog.tsx` currently resets local state on close, but its `listMarketplaceReviewIdeas` query is enabled whenever the dialog opens.
- An effect hydrates the latest idea history whenever the dialog opens without `initialInput`; this is the source of stale work returning.
- `listMarketplaceReviewIdeaRuns()` orders history by `createdAt DESC`, so a newly generated idea run is already the latest resumable run.
- `VerticalDramaEpisodePage.tsx` passes `initialInput` while editing an existing special episode; this must remain authoritative.
- No SocratiCode MCP tools were available; discovery used targeted `rg` and numbered source reads.

## Existing pattern reference

- Reuse the existing shadcn/Radix `Dialog`, `DialogHeader`, `DialogDescription`, `DialogFooter`, and `Button` patterns already used in `VerticalDramaSeriesDetailPage.tsx`.
- Keep the chooser compact and centered; do not introduce a new dependency or a new design system.

## Boundary review

- No schema, router, auth, billing, provider, or migration change is required.
- The fresh/resume mode is a client-side admission boundary for history hydration; persisted history remains tenant/user/series scoped by the existing server query.
