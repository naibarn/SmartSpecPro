# Request

Restore the missing Admin workflow for adding completed media from Media
History gallery view to the public Gallery. Allow Admins to delete Gallery
items, including rows whose media links are broken, from the database.

## Repository-grounded assumptions

- The current branch already contains dirty, user-owned media artifact and
  gallery delivery changes; preserve them and edit only the requested seams.
- `MediaHistory.tsx` already owns the durable import/create flow.
- `Gallery.tsx` already owns public gallery rendering and an Admin delete flow.
- `gallery.delete` must remain Admin-only and should enforce tenant scope.

## Non-goals

- No automatic background URL health checker.
- No storage-object deletion or retention-policy redesign.
- No changes to unrelated homepage, media artifact, or deployment work.
