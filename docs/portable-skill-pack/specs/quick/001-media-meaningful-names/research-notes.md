# Research notes

## Current paths

- `apps/web/client/src/pages/MediaHistory.tsx`: `handleAddToGallery` imports the result and currently sends `task.prompt.slice(0, 100)` as the Gallery title.
- `apps/web/server/services/libraryService.ts`: Library publication uses `libraryItems.title`; existing Library rows therefore need a meaningful title before publication.
- `apps/web/server/db.ts`: Gallery search matches `galleryItems.title` and `galleryItems.description`.
- `apps/web/server/routes/publicGalleryMedia.ts`: public media streams from managed storage and supports byte ranges, but does not currently set a download filename.
- `apps/web/client/src/pages/Gallery.tsx`: downloads open the public file URL in a new tab after incrementing the counter.
- `apps/web/server/services/mediaGenerationService.ts`: extra parameters include a persisted app-only allowlist for Vertical Drama provenance. This is the established place to retain source naming metadata while filtering unknown internal keys.
- `apps/web/server/routers/verticalDramaEpisodes.ts`: generation callers already pass series/episode/shot/purpose tags.
- `apps/web/server/routers/verticalDramaSeries.ts` and `apps/web/shared/workerRuntime.ts`: assembly paths already know series title, episode number, group index, and a display label.
- `apps/web/server/services/verticalDramaEpisodeVideoAssembly.ts`: compiled output has a technical filename/storage convention that should remain an internal/rendering contract.

## Decisions supported by the code

1. A shared pure resolver is preferable to duplicating title logic in Media History and Gallery.
2. Gallery title/description are sufficient for search; no title search migration is required.
3. The public media route should add `Content-Disposition` only for an explicit download request, otherwise video playback could be treated as an attachment.
4. Physical managed storage keys and artifact types should remain opaque/stable. The meaningful filename is a user-facing download name.

## Risks

- Provider tasks may have inconsistent nesting/casing in `parameters` and `resultData`; the resolver needs bounded recursive lookup or normalized task metadata.
- Thai names and Unicode need safe header handling and a conservative ASCII fallback for `filename` compatibility.
- Existing tests mock task shapes incompletely; new tests should be state/metadata-driven and avoid changing unrelated baseline assumptions.
- The worktree contains many unrelated changes; only the design and implementation paths listed here may be staged later.
