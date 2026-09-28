# Research Notes

## Discovery status

SocratiCode status failed because its MCP transport was closed. Discovery fell back to
targeted searches of the known Vertical Drama episode and storyboard files.

## Current flow

- `VerticalDramaStoryboardPanel.tsx` already makes the Start Frame image a drop target.
- `readDroppedImageInput` correctly distinguishes OS files from application URL drags,
  rejects non-images, and enforces a 15 MB client cap.
- `resolveDroppedImageInputToUrl` converts an OS file to a base64 `data:` URL.
- The panel invokes `onDropStartFrame(shotNumber, url)` without awaiting it, then clears
  its busy state immediately.
- `VerticalDramaEpisodePage.tsx::handleDropStartFrame` treats every string as a durable
  URL and calls `resolveMediaAssetForImport` directly. It does not invoke `trpc.ai.upload`.
- `setApprovedStartFrameAsset` already owns final replacement and query invalidation.
- `angleVariationUploadMutation` demonstrates the accepted `trpc.ai.upload` payload:
  `fileName`, `fileType`, and `fileBase64`.
- `VerticalDramaEpisodeWorkspace.tsx` is a prop pass-through boundary and must share the
  updated callback type.

## Existing patterns to preserve

- `readFileAsDataUrl` is the established client conversion helper.
- File-type and file-size copy already exists in the storyboard panel.
- Page-level code owns mutations because it has series/episode identifiers.
- Errors are localized through the page toast; the old frame is not cleared first.

## Dirty-worktree boundary

All three source files are already modified by other in-progress work. Implementation
must inspect targeted diffs before and after editing and avoid broad formatting or
mechanical rewrites.

## Security and data boundary

- The existing authenticated upload mutation and media-asset resolver remain the only
  write paths.
- Client validation is advisory; server upload validation remains authoritative.
- Remote URLs are not fetched client-side and are not re-uploaded.
- Inline `data:` URLs are non-durable and must be normalized into the upload branch.

## Test surface

Add a dedicated `VerticalDramaStoryboardPanel.startFrameDropUpload.test.tsx` suite for
the component contract. Add a small exported or colocated pure resolver on the page side
only if necessary to test upload-vs-URL preparation without mounting the full page.

