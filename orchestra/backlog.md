# Backlog

- Clean up already-queued `advance_run` jobs for affected production runs after the fix is deployed. This is a DB mutation and should be done only with an explicit operator action/backup.
- Add an operational dashboard/alert for a single Marketplace Auto Review run accumulating unusually many queued `advance_run` outbox jobs.
