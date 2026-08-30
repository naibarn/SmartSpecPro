# Admin Feedback Hub: identify unread tickets

## Goal

Make the unread total actionable so an admin can see exactly which tickets are
included in the count, and prevent the source tabs from hiding system tickets
because of an incorrect count.

## Design

- The unread summary keeps the total count but labels it as `ยังไม่ได้อ่าน N
รายการ`.
- The action becomes `ไปดูรายการ` and clears status, type, and source filters
  so the normal left queue shows read and unread tickets together.
- The initial source scope is `All`, because the unread total covers both user
  feedback and system/auto reports; the source tabs remain available for
  narrowing the queue afterward.
- The summary card stays compact: it shows the unread count, overdue count, a
  link to the queue, and a mark-all-read action. It does not repeat ticket rows
  inside the card.
- The left list loads 100 tickets at a time and exposes `โหลดรายการเพิ่มเติม`
  when a full page is returned, so the `All` tab can reach older topics without
  loading hundreds of rows in one request.
- The overdue alert stays compact and sends the admin to the left queue; it does
  not render a second ticket list in the center of the screen.
- Every unread ticket row in the normal left queue keeps the existing
  `ยังไม่ได้อ่าน` badge, ticket number/title, and created datetime, while read
  tickets remain in the same list without that badge.
- The feedback stats query returns `system_count` in both normal and schema
  compatibility fallback queries so `System / Auto` is truthful.

## Scope and safety

- No schema, migration, authorization, or ticket data changes.
- Reuse the existing per-admin `feedback.list` unread condition and existing
  tenant visibility rules.
- Preserve the current mark-read behavior when an admin opens a ticket.
- If the live database is unavailable, do not infer a specific missing ticket;
  verify the list/filter contract locally and report live-data verification as
  pending.

## Verification

- Run focused feedback router tests and frontend formatting checks.
- Run `git diff --check` and the production web build.
- Run the web typecheck and distinguish unrelated baseline failures.
- Browser replay is recorded separately if browser tooling is unavailable.
