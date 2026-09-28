# Research Notes

- `DocumentPreviewPanel` owns the selected media preview toolbar and is already
  rendered by `DocumentManagement.tsx`.
- `libraryService.ts` already has `getLibraryGalleryPublicationState` and
  `publishLibraryItemToGallery`, but they are not exposed by `routers/library.ts`
  or passed to the preview UI.
- The existing service currently allows an item owner to publish and builds a
  Gallery row primarily from `sourceUrl`; this must become exact-admin and
  managed-key/public-route aware.
- `library_items.metadata.source_key` is the durable storage key for uploaded
  media. Existing public Gallery delivery is `/api/gallery/media/:id/:variant`
  and supports published/tenant checks and video ranges.
- The repo has existing public Gallery route tests and DocumentPreviewPanel
  jsdom tests. SocratiCode MCP was unavailable, so bounded shell discovery was
  used as fallback.
