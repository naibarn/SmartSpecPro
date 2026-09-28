# Section 02: Upload, Persist, and Verification

## Ownership

- `VerticalDramaEpisodePage.tsx`
- page-side pure helper test only if needed

## Dependency

Section 01's discriminated callback contract must exist first.

## Work

Add/reuse an image upload mutation, upload only upload-kind inputs, resolve the durable
URL to a media asset, link it through `setApprovedStartFrameAsset`, and preserve the old
frame on all errors.

## TDD expectations

Prove local uploads call upload before resolve/link and durable URLs bypass upload. Cover
upload rejection and persistence rejection without optimistic frame removal.

## Boundary checks

- authenticated existing mutations only;
- no new endpoint, schema, storage provider, or dependency;
- remote URLs remain on the resolver path;
- inline data URLs never enter the remote URL path.

## Acceptance

Focused tests pass, TypeScript validation reports no new touched-file errors, and scoped
diff inspection proves unrelated dirty-worktree changes were preserved.

## Implementation Notes

- `VerticalDramaEpisodePage.tsx` uploads only `upload` inputs through the existing
  authenticated `ai.upload` mutation, then uses the existing media-asset resolver and
  `setApprovedStartFrameAsset` mutation in order.
- Durable URLs bypass upload; inline data URLs are converted to `upload` inputs in the
  panel and never enter the remote URL resolver directly.
- Pure upload-routing/workflow coverage is in `verticalDramaStartFrameDrop.test.ts`
  (6 tests), including operation order, upload failure, approval failure, and inline
  data-URL size calculation.
- Verification: 18 focused tests passed and `npm run check -- --pretty false`
  completed successfully.
- No commit was created because the target files already contain unrelated user changes
  and this task did not request staging or publishing.
