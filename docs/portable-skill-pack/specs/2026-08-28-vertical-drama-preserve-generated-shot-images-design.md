# Vertical Drama: Preserve Generated Shot Images When Character References Change

## Problem

When a user removes an extra character from a shot's selected character
references, `setShotCharacterReference` clears both the prompt and
`approvedMediaAssetId`. The generated image disappears from the shot even
though the user may still want to keep and reuse it.

## Approved behavior

- Update only the shot's character-reference selection.
- Preserve the existing `approvedMediaAssetId` and rendered image.
- Clear prompt/reference mappings that are no longer authoritative, so a new
  generation cannot accidentally reuse stale prompt metadata.
- Record a stale/mismatch reason and expose a clear UI notice that the current
  image is retained and a new image is optional.
- Replace the retained image only when the user explicitly starts generation.
- Never delete the durable media asset as a side effect of editing character
  references.

## Scope and data flow

The change is limited to the per-shot character-reference mutation and the
shot card presentation. The mutation remains a free JSONB patch, scoped to the
owned tenant/user/series/episode. The existing image-generation path continues
to replace the approved asset only after an explicit generation succeeds.

## Failure handling

If the character-reference update fails, the stored image and references remain
unchanged. If a later regeneration fails, the retained image remains available
and the failure is shown without deleting the prior asset.

## Verification

Add server and UI regressions for removing/replacing references with an
approved image, preserving unrelated shots, and showing the retained-image
stale state. Run focused tests, formatting/diff checks, and a local runtime
smoke check where available.
