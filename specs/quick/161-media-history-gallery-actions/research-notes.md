# Research Notes

## Discovery

- SocratiCode MCP was unavailable in this session, so discovery used bounded
  `rg`, targeted file reads, existing tests, and git diff inspection.
- `apps/web/client/src/pages/MediaHistory.tsx` has `handleAddToGallery`,
  `gallery.importFromUrl`, and `gallery.create`. In gallery mode the action is
  currently only in the More menu and is gated by Admin + completed + result URL.
- `apps/web/client/src/pages/Gallery.tsx` has an Admin-only delete button in the
  card hover actions and the lightbox, plus a confirmation dialog.
- `apps/web/server/routers.ts` exposes `gallery.delete` through
  `adminProcedure`, but currently calls `deleteGalleryItem(id)` without passing
  tenant context.
- `apps/web/server/db.ts` has an unscoped `deleteGalleryItem` helper and
  `gallery_items.tenantId` is available in the Drizzle schema.
- Durable media projection in the current worktree prefers storage-backed URLs;
  provider URLs are not safe public-gallery persistence.

## Security and data boundary

- Keep exact Admin role gating in the client and existing `adminProcedure` on
  the server.
- Add tenant-aware deletion rather than allowing an Admin from one tenant to
  delete another tenant's row by guessed ID.
- Delete only the gallery database row. Do not delete R2/storage objects from
  this user-facing action.

## Verification targets

- Focused Media History/Gallery tests if available, otherwise add small helper
  tests around action eligibility and tenant delete conditions.
- `npm --workspace apps/web test -- ... --run` for changed focused suites.
- `git diff --check` and targeted TypeScript diagnostics/typecheck.
