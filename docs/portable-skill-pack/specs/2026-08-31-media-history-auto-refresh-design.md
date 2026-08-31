# Media History Auto-Refresh Design

## Goal

Show newly created media-history tasks while the Media History page remains open,
without requiring a browser refresh.

## Design

Configure the existing `media.listTasks` query in `MediaHistory.tsx` to revalidate
every 15 seconds. Keep `refetchIntervalInBackground` disabled so polling pauses
when the browser tab is hidden. Preserve the existing short stale-time,
placeholder-data, pagination, filters, and task-result fallback polling.

## Trade-offs and failure handling

Polling is simpler and uses the existing authenticated query path, but new rows
may take up to 15 seconds to appear and it adds one list request per visible open
page. Query failures retain the previous placeholder data and follow the existing
query error behavior.

## Verification

Add a focused module regression assertion for the interval constant and run the
Media History compile test plus a diff check. Browser verification is useful for
the deployed route but is not available in this change session.
