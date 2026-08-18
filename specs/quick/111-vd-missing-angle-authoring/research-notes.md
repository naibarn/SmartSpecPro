# Research notes

## Existing pattern scan

- `VerticalDramaLocationsBibleCard` in `VerticalDramaStoryboardPanel.tsx` is the
  canonical in-storyboard location authoring surface. It renders a gap button,
  calls `previewLocationPrompt`, shows the returned prompt as read-only text,
  then calls `generateLocationImage` and asks the user to approve the result.
- `VerticalDramaLocationStockPanel.tsx` is the series-level location manager and
  already supports standard/custom camera-view metadata and candidate galleries.
- `ShotLocationPickerDialog` in `VerticalDramaStoryboardPanel.tsx` is the
  canonical per-shot selector. It already lists approved variants and persists
  `locationVariantId` through `setShotLocationVariant`.

## Contract scan

- Shared frame contract: `startFramePlan.frames[].locationVariantId?: string`.
- Server resolver: `resolveLocationReferenceUrl` accepts a variant id and falls
  back to the primary establishing plate for legacy/reset states.
- Server mutation: `verticalDramaEpisodes.setShotLocationVariant` validates the
  selected variant belongs to the effective location and is approved.
- Stale behavior: changing a location variant clears approved/video assets and
  QC state and marks the frame stale with `location_variant_changed`.
- Location generation input already has `coverageRole`, `gapDescription`, and
  `cameraView`; no new persistence field is needed for this workflow.

## Gap found

The coverage-gap action immediately asks the AI for a prompt, but the resulting
prompt is rendered in a paragraph. There is no editable prompt/negative-prompt
state, no explicit “this will become a sub-view” review state, and no easy way
to revise a failed candidate without re-entering the flow. The underlying
approval and per-shot selection plumbing already exists.

## Security and boundary notes

- Keep prompt/image generation behind existing credit confirmation dialogs.
- Continue passing only location ids owned by the authenticated series scope.
- Reuse existing `resolveMediaAssetForImport` and `linkAsset` ownership checks.
- Variant selection remains server-validated; the browser projection is not an
  authorization boundary.
