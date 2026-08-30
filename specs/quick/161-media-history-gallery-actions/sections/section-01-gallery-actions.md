# Section 01: Gallery Actions

## Ownership

Implement the requested UI and server/data-boundary changes. Keep all edits
limited to the Media History gallery action, public Gallery Admin delete
affordance, and tenant-scoped gallery deletion helpers/router.

## Target files

- `apps/web/client/src/pages/MediaHistory.tsx`
- `apps/web/client/src/pages/Gallery.tsx`
- `apps/web/server/routers.ts`
- `apps/web/server/db.ts`
- Focused tests for changed behavior.

## TDD expectations

- Preserve exact Admin gating and durable result URL eligibility.
- Verify deletion carries tenant scope and remains behind `adminProcedure`.
- Preserve confirmation, loading, error, fallback preview, and localization
  behavior.

## UI/UX Contract

- Target user/job: Admin curates public Gallery from generated media and removes
  stale/broken entries.
- Surfaces: Media History gallery cards; public Gallery cards/lightbox.
- States: eligible, ineligible, importing, import failed, preview unavailable,
  delete confirmation, deleting, delete failed, delete success.
- Responsive: actions must remain discoverable and operable on mobile without
  depending solely on hover.
- Accessibility: labeled buttons, disabled/pending state, confirmation before
  deletion, and no admin controls rendered for non-admins.
- Copy: use existing Thai/English media translation keys where available; avoid
  adding English-only visible text.
- Browser evidence: local authenticated Admin desktop/mobile check is desirable
  but deployment/production proof is outside this change unless available.

## Acceptance

- Admin can add a completed durable media task directly from gallery mode.
- Admin can delete a broken or valid Gallery row after confirmation.
- Tenant isolation and focused tests pass.

## Implementation record

- Added `canAddTaskToGallery` eligibility coverage and a visible gallery-card
  action in `MediaHistory.tsx`.
- Added an always-discoverable Admin delete action in `Gallery.tsx` while
  preserving the lightbox confirmation path.
- Added strict tenant normalization and `id + tenantId` deletion filtering in
  the server DB/router path.
- Added compile coverage for the Gallery module.
