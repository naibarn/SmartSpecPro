# Decision Log

- 2026-08-27: Choose nullable `commentId` on existing feedback attachments; preserve legacy ticket-level rows.
- 2026-08-27: Read state is per admin and is marked when detail opens.
- 2026-08-27: Unread sorts ahead of read; overdue unread sorts first.
- 2026-08-27: Alert is generic, first at two hours and repeats every 30 minutes while overdue unread exists.
- 2026-08-27: Close is terminal for reply/upload; both admin and owner can close.
- 2026-08-27: Auto-close uses `updatedAt` older than five days and runs in a server-side recurring job.
- 2026-08-27: Standard quick-plan depth; scope is medium but bounded to feedback schema/router/job/UI and focused tests.
