# Section 01: Web Start-Frame Lineage

## Ownership

- `apps/web/server/routers/verticalDramaEpisodes.ts`
- directly affected router tests only

## Work

1. Add failing tests for single and split per-shot prompt persistence.
2. Add failing submission tests for missing and stale projected IDs.
3. Persist the approved ID in every replacement clip constructor.
4. At submission, resolve the primary shot's current approved ID and prefer it
   over `clip.startFrameAssetId`.
5. Preserve fallback behavior when no approved image exists.

## Acceptance

- Current approved frame always occupies reference slot 1.
- A one-reference model trims `previous_main`.
- Tenant/ownership resolution remains unchanged.
- Focused router tests and Web typecheck pass.

## Implementation Notes

- Per-shot single and speaker-switch prompt persistence now projects the
  current `approvedMediaAssetId` into `startFrameAssetId`.
- Speaker portraits remain ordered extra references and no longer replace the
  approved composite shot image.
- Paid render submission re-resolves the primary shot's current approved frame
  and overrides a missing or stale projected clip ID.
- Focused regressions: 7 passed. Web `tsc --noEmit`: passed.
- The broader dirty-worktree router suites retain unrelated pre-existing mock
  isolation failures; the affected regressions pass when selected directly.

## Risk

The router is heavily edited in the current worktree. Restrict changes to
targeted hunks and inspect the existing diff before patching.
