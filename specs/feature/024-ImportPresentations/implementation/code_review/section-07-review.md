# Code Review: Section 07 — ImportPresentationDialog

## Critical / High

### [HIGH-1] Server limit is 30 MB, not 50 MB
`libraryService.ts` enforces `MAX_LIBRARY_UPLOAD_BYTES = 30 MB` server-side.
Client validates at 50 MB. Files 30–50 MB pass client validation, encode to base64,
then fail with an unhelpful error server-side.
**Fix**: Change `MAX_FILE_BYTES` to `31_457_280` (30 MB) in the component.

### [HIGH-2] `UploadFileResult` local type + `as any` cast
`uploadPptxFile.ts` invents a local `UploadFileResult` type that doesn't match
the actual tRPC return shape. The `as any` cast in the dialog conceals this.
**Fix**: Use a typed callback interface instead of `as any`.

### [HIGH-3] base64 encoding large files blocks main thread
FileReader.readAsDataURL on a 30 MB file produces ~40 MB base64, potentially
blocking the event loop and hitting Nginx/Express body size limits.
**Note**: Plan acknowledged this trade-off explicitly. Will document limitation.

### [HIGH-4] Plan deviation: tRPC hook vs raw useQuery
Plan specified `useQuery` from tanstack + vanilla tRPC client. Implementation uses
`trpc.getImportStatus.useQuery()` hook (same as ExportDialog pattern).
**Note**: Functionally equivalent; ExportDialog uses the same pattern. Will document.

## Medium

### [MEDIUM-1] `handleTryAgain` doesn't reset file/URL state
After Try Again, `selectedFile` and `slidesUrl` remain. Import is immediately enabled.

### [MEDIUM-2] `handleOpenDeck` silently fails if `deckLibraryItemId` is null
Button is visible but becomes a no-op.

### [MEDIUM-3] `expired` OAuth state shows "Connect Google Drive" (misleading)
Should show "Reconnect Google Drive" for expired state.

## Low

### [LOW-1] `key={i}` for fidelity warnings list — minor anti-pattern
### [LOW-2] Missing slideCount in result step — server doesn't return this field
### [LOW-3] Cancel doesn't reset `selectedFile` from file input ref
