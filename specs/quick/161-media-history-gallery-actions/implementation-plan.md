# Implementation Plan

## Objective

Restore a discoverable Admin publish action in Media History gallery view and
make public Gallery Admin deletion reliable for broken rows, with tenant-safe
server enforcement and focused regression proof.

## Affected files

- `apps/web/client/src/pages/MediaHistory.tsx`
- `apps/web/client/src/pages/Gallery.tsx`
- `apps/web/server/routers.ts`
- `apps/web/server/db.ts`
- Focused tests under the corresponding client/server test directories.

## Approach

1. Reuse `handleAddToGallery` and its existing `importFromUrl` then `create`
   sequence. Add a labeled button to the gallery card action row, visible only
   to exact Admin users and only for completed tasks with a durable result URL.
2. Preserve the existing More-menu action and list/detail actions to avoid
   regressing other Media History layouts.
3. Update Gallery card actions so Admin deletion remains available even when a
   preview falls back to “Preview unavailable”; add accessible labeling and
   avoid hover-only discoverability.
4. Change the database delete helper/router contract to accept an optional
   tenant scope and build a combined `id` + tenant condition. The router passes
   the current tenant from `ctx`; no tenant-wide bypass is added.
5. Invalidate/refetch affected queries after deletion and retain confirmation,
   loading, and error behavior.

## Risks and mitigations

- Existing dirty changes overlap the target files: inspect and patch only local
  hunks; never reset or broad-stage.
- Artifact-backed tasks may have no `resultUrl`: keep them ineligible rather
  than exposing expiring provider URLs.
- Gallery deletion is destructive to the database row: retain confirmation and
  do not delete storage objects.
- Public Gallery is user-facing: preserve fallback rendering and add focused
  accessibility checks where practical.

## Acceptance criteria

- Admin sees and can use Add to Gallery directly from Media History gallery
  cards for eligible completed media.
- Non-admin users cannot see or invoke that control.
- Admin can delete a visible or broken Gallery item after confirmation.
- Delete cannot target a row outside the current tenant.
- Existing Admin Gallery and public Gallery flows continue to refresh after
  deletion.
- Focused tests and diff checks pass; unrun browser/deployment checks are called
  out explicitly.
