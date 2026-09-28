# Admin Feedback Hub: reliable reply attachments

## Goal

Make an admin reply with image attachments complete reliably and give an
actionable error when upload or comment creation fails.

## Design

- Keep the existing two-step contract: upload images first, then attach the
  returned attachment IDs to `feedback.addComment`.
- Treat a partial HTTP-200 upload response with `errors` or fewer attachment IDs
  than selected files as a failed upload. Remove any partial attachments before
  allowing the reply flow to continue.
- Normalize string and object-shaped API errors, show the message inline below
  the reply controls, and also send one toast so a failure is never silent.
- Keep the selected files available after a failure so the admin can retry or
  remove the problematic file.
- Provide a clearly labeled image drop zone for reply attachments, with local
  thumbnails, per-file removal, and a full-screen preview before sending.
- After a successful reply, refresh the ticket detail and scroll the detail
  pane to the Comments section so the new text and images are immediately
  visible. Report separately if the reply was saved but the refresh failed.
- Keep the right-hand detail pane as the sole native vertical scroll region;
  the detail header and reply composer remain fixed while the content below
  them scrolls independently.
- Preserve the existing server-side ticket, tenant, user, file-type, size, and
  attachment ownership checks.

## Verification

- Run the focused feedback router tests, Prettier, `git diff --check`, and the
  production web build.
- Full workspace typecheck remains a separate baseline check; browser upload
  and production storage verification require an authenticated environment.
