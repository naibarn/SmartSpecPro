# Vertical Drama Start Frame Drop Upload Design

## Problem

The Vertical Drama storyboard already accepts drag-and-drop on a shot's Start Frame.
Library and Media History URL drops can use the existing resolve-and-link path, but a
harddisk file is currently converted to a `data:` URL and passed to that URL path without
first being uploaded. The callback also returns before the asynchronous resolve-and-link
operation completes, so the busy overlay disappears too early.

## Decision

Represent the dropped source explicitly as either a local file payload or an existing URL.
Keep file reading in the storyboard panel, perform the authenticated upload and persistence
workflow in `VerticalDramaEpisodePage`, and await the complete callback from the panel.

This preserves the page as the owner of mutations and series/episode identifiers while
allowing the panel to own browser drag/drop behavior and progress presentation.

## Data Flow

### Local harddisk file

1. The Start Frame target reads the first dropped file.
2. Existing guards reject non-image files and files larger than 15 MB.
3. The panel reads the file as a base64 data URL and passes its original name, MIME type,
   and base64 content to the page callback.
4. The page uploads it through the existing authenticated `trpc.ai.upload` endpoint.
5. The returned durable URL is resolved through `resolveMediaAssetForImport`.
6. The resulting asset is linked through `setApprovedStartFrameAsset`, replacing the
   shot's current Start Frame.
7. Existing query invalidation refreshes the displayed image.

### Existing application URL

Library, Media History, and other internal URL drops skip upload and continue directly
through `resolveMediaAssetForImport` and `setApprovedStartFrameAsset`.

An inline `data:` URL is not durable and must use the upload branch with an inferred image
MIME type and generated filename. It must never be sent to `resolveMediaAssetForImport` as
if it were a normal remote URL.

## UI Contract

- Dragging a supported image over a Start Frame shows a visible drop highlight.
- Dropping starts an overlay spinner that remains until upload, asset resolution, and
  Start Frame persistence all finish.
- The same shot ignores further drops while its operation is in flight.
- Successful completion replaces the image immediately through the existing mutation
  invalidation and success toast.
- Failure keeps the previous Start Frame and shows the existing localized error toast.
- Clicking the image to open the lightbox remains unchanged.

## Component Contract

Change `onDropStartFrame` from a URL-only fire-and-forget callback to an awaited callback
that accepts a discriminated input:

- `{ kind: "url", url }`
- `{ kind: "upload", fileName, fileType, fileBase64 }`

The callback returns `Promise<void>`. This prevents the storyboard panel from needing
upload mutations or series/episode context and ensures its busy state covers the complete
workflow.

## Failure and Safety Handling

- Preserve the current 15 MB client limit and server-side upload validation.
- Reject missing/unsupported MIME types before reading or uploading.
- Process only the first dropped file, consistent with replacing one Start Frame.
- Do not clear or optimistically replace the current frame before persistence succeeds.
- Always clear drag-over and busy state in `finally` blocks.
- Do not upload existing durable URLs again.

## Tests

Add focused regression coverage for:

1. A harddisk image drop produces an upload payload with filename, MIME type, and base64.
2. A URL drop bypasses upload.
3. The panel awaits the callback and keeps the shot busy until it settles.
4. Duplicate drops for the same busy shot are ignored.
5. Unsupported and oversized files remain rejected.
6. Upload success continues through resolve and `setApprovedStartFrameAsset`.
7. Upload or persistence failure leaves the previous Start Frame intact and clears busy
   state.

## Scope and Rollout

The change is limited to the Vertical Drama storyboard component, its workspace prop
pass-through, the episode page, and focused client tests. It requires no database
migration, API schema change, dependency, or paid media generation. Verification should
use targeted Vitest coverage and the web TypeScript check; a browser drag/drop smoke is
recommended when a safe local session is available.
