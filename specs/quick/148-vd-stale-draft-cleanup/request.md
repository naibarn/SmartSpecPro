# Request

Add a Draft Job Inbox cleanup prompt on `/drama-series`. When owner-scoped,
inactive pre-series Draft jobs have not changed for more than 5, 7, or 10 days,
show a dialog with counts and let the user archive the selected age bucket.

## Constraints

- Never affect active `queued`, `composing`, or `qc_running` jobs.
- Never affect `applied` jobs or created series records.
- Use server-owned `updatedAt` and recheck eligibility during mutation.
- Archive recoverably; do not hard-delete ledger versions or storage snapshots.
- Preserve metadata-only list loading and the current 50-row display limit.
- Thai and English copy, keyboard-accessible dialog, no new dependency/schema.

## Non-goals

- Automatic cleanup without confirmation.
- Cleanup of created series, episodes, media, or archived Draft storage.
- A retention scheduler or administrative policy system.
