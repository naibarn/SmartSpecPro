# Section 01: Library Gallery Contract

## Ownership

Own `libraryService.ts` and `routers/library.ts` only.

## Work

- Expose publication state and publish mutation through the Library router.
- Enforce exact admin role, tenant-scoped non-deleted item lookup, media-only
  eligibility, and managed storage key requirements.
- Populate Gallery `fileKey`/`thumbnailKey`; keep the existing link idempotency.
- Return `galleryItemId` and stable `/api/gallery/media/:id/file` URL.

## Tests

Cover admin success, non-admin rejection, tenant mismatch, private/deleted,
image/video acceptance, document/audio/missing-key rejection, and repeat update.
