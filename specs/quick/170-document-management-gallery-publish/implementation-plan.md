# Implementation Plan

## Objective

Wire Document Management media publishing to the existing Library Gallery
service and make the server contract admin-only, tenant-safe, durable-key based,
and idempotent.

## Affected files

- `apps/web/server/services/libraryService.ts`
- `apps/web/server/routers/library.ts`
- `apps/web/client/src/pages/DocumentManagement.tsx`
- `apps/web/client/src/components/library/DocumentPreviewPanel.tsx`
- `apps/web/client/src/locales/en/common.json`
- `apps/web/client/src/locales/th/common.json`
- Focused service/router/UI tests.

## Approach

1. Add Library router query/mutation wrappers around the existing publication
   service and create an actor with the current tenant.
2. Update publication eligibility and payload construction to require exact
   admin, image/video, non-private/non-deleted item, and a managed
   `metadata.source_key` (or safely parse an existing managed source URL).
   Populate Gallery keys so the public media route is canonical.
3. Pass an `onAddToGallery` callback and pending state to the preview panel. The
   panel renders the button only for an admin and media preview.
4. Invalidate/refetch the selected item's publication state after success and
   show localized success/error feedback, including the stable media URL where
   practical.
5. Add regression tests, run focused Vitest suites, targeted typecheck, and
   diff checks.

## Acceptance criteria

- Admin sees and can invoke the action for image and video items.
- Non-admins and non-media items cannot see or invoke the action.
- Server rejects non-admin, cross-tenant, private-vault, deleted, document,
  audio, and non-durable media requests.
- Repeating the action updates the linked Gallery item instead of duplicating.
- Gallery data carries managed keys and public playback uses the stable route,
  not signed/provider URLs.
- Existing public Gallery behavior and unrelated Document Management actions
  remain intact.
