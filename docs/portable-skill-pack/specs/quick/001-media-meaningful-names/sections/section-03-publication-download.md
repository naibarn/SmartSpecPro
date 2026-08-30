# Section 03: Publication and download integration

## Ownership

Own Gallery publication naming, Library title handoff where applicable, public download headers, and client URL behavior.

## Target files

- `apps/web/client/src/pages/MediaHistory.tsx`.
- `apps/web/client/src/pages/Gallery.tsx` and/or `apps/web/client/src/lib/galleryMedia.ts`.
- `apps/web/server/services/mediaLibraryService.ts`.
- `apps/web/server/routes/publicGalleryMedia.ts`.
- Focused Media History, Gallery, and public route tests.

## Behavior

Use the shared resolver when Add to Gallery creates a new item and when a media task is added to Library without an explicit title. Keep the full task prompt as description. For explicit downloads, request `download=1` and set a safe attachment filename derived from the Gallery title/media type, using Unicode plus an ASCII-safe fallback; for image/video playback without that flag, preserve existing public caching, range, and inline behavior. Existing titles are not rewritten.

## UI/UX Contract

- Target user/job: admins publishing generated image/video assets and public visitors downloading Gallery media.
- Surface inventory: Media History Add to Gallery action; public Gallery card download action; public media stream endpoint.
- State matrix: normal, importing/publishing, success, failure, playback, download.
- Responsive matrix: preserve existing controls and card layout at mobile/desktop; no new layout required.
- Accessibility: preserve existing button labels and keyboard behavior; download behavior must remain discoverable through the current Gallery action.
- Copy contract: no new user-facing copy is required; existing Thai/English action/toast strings remain localized.
- Browser evidence: verify a new item visually shows the meaningful title and confirm a download request receives the expected filename; browser/provider production proof is not assumed from unit tests.

## TDD and acceptance

- Add a Media History assertion for resolved title and original description.
- Add public route assertions for attachment filename, inline playback, range handling, and unpublished/tenant denial.
- Add Gallery URL assertion that download action uses the explicit download query.

## Risks

Do not set attachment disposition for normal `<video>` requests. Do not bypass existing admin or tenant/public authorization.
