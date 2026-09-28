# Media History Gallery Actions Design

Date: 2026-08-23
Status: Approved for implementation

## Goal

Restore an obvious Admin action for publishing completed media from Media
History gallery view to the public Gallery, and make Admin deletion usable from
the Gallery page so stale or broken gallery rows can be removed from the
database.

## Existing contracts

- `MediaHistory.tsx` already imports a result URL into durable storage and calls
  the admin-only `gallery.create` mutation, but the gallery-card action is only
  available in the More menu and requires a usable result URL.
- `Gallery.tsx` already has an admin-only delete mutation and confirmation flow,
  but the action is hover-only and broken media has no explicit recovery affordance.
- `gallery.delete` remains an `adminProcedure`; the server must enforce the
  current tenant scope before deleting a row.
- Gallery row deletion removes the database row only. Storage objects are not
  deleted because they may be shared or require a separate retention policy.

## Approved design

1. Add a visible, labeled Admin-only “Add to Gallery” action to each eligible
   completed item in Media History gallery mode. Keep the existing import flow,
   durable URL requirement, loading state, and localized toast messages.
2. Keep the existing More-menu action as a secondary access path where it is
   already present; the visible action is the primary path for gallery mode.
3. Make the Admin delete control in public Gallery accessible without relying
   only on hover, including when the preview is unavailable. Reuse the existing
   confirmation and refetch behavior.
4. Scope the backend delete operation to the caller's tenant. Preserve exact
   `user.role === "admin"` UI gating and `adminProcedure` server authorization.
5. Add focused regression coverage for action visibility/gating, delete
   mutation behavior, and tenant-scoped deletion. Run diff and focused tests;
   report browser/deployment proof separately if unavailable.

## Failure and safety behavior

- Completed tasks without a durable result remain ineligible for publishing;
  the UI must not promote an expiring provider URL into public Gallery.
- Import or create failures leave the source Media History task intact and show
  the existing error toast.
- Deletion requires confirmation and removes only the selected gallery row.
- A failed preview remains represented by a fallback card so an Admin can still
  select and delete the row.
- No automatic URL probing or bulk destructive cleanup is introduced in this
  change.

## Validation

- Media History gallery mode renders the Admin publish action only for eligible
  completed tasks and invokes the existing import/create flow.
- Non-admin users do not receive the publish or delete controls.
- Gallery deletion is tenant-scoped and refreshes the visible gallery.
- English and Thai labels remain available.
- Focused tests, changed-file checks, and `git diff --check` pass.
