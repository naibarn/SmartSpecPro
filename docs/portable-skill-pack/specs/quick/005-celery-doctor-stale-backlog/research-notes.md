# Research notes

- `celeryMediaDoctorService.ts` currently counts every old pending row as stale.
- The media dispatcher uses a per-user limit of three and tracks claimed work
  with `celery_task_id`.
- Historical incident evidence showed three processing jobs plus old pending
  backlog; those pending jobs were dispatched normally and should not alert.
- `celeryMediaDoctorJob.ts` is the automatic feedback boundary.
- `systemAutoReportService.ts` already deduplicates tickets and caps affected
  users, but does not accept affected users/tasks supplied by a detector.
- `CeleryMediaDoctorCard.tsx` currently renders `activeCount/3`, which is
  misleading when pending backlog is larger than the concurrency limit.
