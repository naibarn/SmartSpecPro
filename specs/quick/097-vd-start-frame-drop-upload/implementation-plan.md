# Implementation Plan

## Objective

Make the existing Vertical Drama Start Frame drop target correctly upload local image
files and replace the selected shot's Start Frame while preserving URL drops.

## Current-codebase fit

The UI already detects OS files, renders a busy overlay, and calls a page-owned drop
callback. The missing link is an explicit source contract and an upload step before
`resolveMediaAssetForImport`. The fix extends those existing boundaries rather than
introducing a new service.

## Affected files

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaEpisodeWorkspace.tsx`
- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx`
- new focused tests under
  `apps/web/client/src/components/verticalDramaSeries/__tests__/`

## Approach

1. Define/export a discriminated Start Frame drop input type at the storyboard contract
   boundary.
2. Convert an OS file into an upload input retaining filename, MIME type, and base64.
   Convert durable URL drops into URL inputs. Normalize inline data URLs into upload
   inputs using an inferred MIME type and generated filename.
3. Await the page callback, keep the overlay active for the complete operation, and guard
   against a second drop for the same shot.
4. Add drag-enter/leave state and a token-compatible ring/background highlight.
5. Propagate the Promise-returning callback contract through the workspace.
6. In the episode page, upload only upload-kind inputs, then run both branches through the
   existing resolve-and-link finalization.
7. Preserve current localized errors and rethrow only if the component contract needs to
   observe rejection; always clear component busy state in `finally`.

## Risks and mitigation

- Existing dirty changes overlap all source files: edit only targeted hunks and inspect
  scoped diffs.
- Drag events become unsafe after an async boundary in some browsers: extract the input
  synchronously before awaiting file reads or callbacks.
- Duplicate drops could race: check/set per-shot busy state before starting.
- A data URL may have no valid image MIME: reject it rather than inventing a non-image
  upload.
- Veo/start-frame generation flows are unrelated and must remain untouched.

## Acceptance criteria

1. Dropping a PNG/JPEG/WebP from harddisk uploads it and replaces the target shot image.
2. The original filename and MIME reach `trpc.ai.upload`.
3. Library/Media History URL drops do not call upload.
4. Busy and drag-over affordances are accurate and accessible.
5. A failure preserves the old frame and permits a later retry.
6. Unsupported, oversized, empty, and duplicate drops are safely handled.
7. Focused tests and TypeScript validation for touched files pass.

## Rollout

No migration or provider smoke is needed. Do not deploy in this task. Run a local browser
smoke only if the existing app can be started without activating unrelated dirty work.

