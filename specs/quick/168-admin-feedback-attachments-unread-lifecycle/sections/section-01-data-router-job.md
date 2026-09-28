# Section 01 — Data, Router, and Auto-Close

## Ownership

Own the schema/migration, `feedback.ts`, and feedback auto-close job/startup
registration. Do not modify page layout files.

## Requirements

- Add nullable `commentId` and read receipts with tenant-safe indexes.
- Return nested resolved attachments and filter internal media for users.
- Implement unread list/summaries, mark-read, close, and closed guards.
- Link only authorized image attachment IDs in the add-comment transaction.
- Add idempotent five-day auto-close scheduler.

## TDD / acceptance

Write failing router/schema/job tests first, then implement. Verify old ticket
attachments remain visible, cross-tenant IDs fail, internal media is not returned
to users, closed APIs reject, and repeated auto-close changes no extra rows.
