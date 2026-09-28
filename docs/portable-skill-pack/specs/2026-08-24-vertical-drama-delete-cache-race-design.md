# Vertical Drama delete reappearance fix

## Problem

After a user deletes a Vertical Drama project from the persistent sidebar, the
project can briefly appear again when the shell navigates or remounts the list.
The server mutation is already authoritative and transactional. The client
starts query invalidation without awaiting it, then closes the dialog and
navigates immediately. The next list view can therefore render the previous
`verticalDramaSeries.list` cache while the refresh is still pending.

## Design

Keep deletion semantics unchanged. In the delete dialog success callback:

1. Await invalidation of every active `verticalDramaSeries.list` query variant.
2. Mark only the deleted series' `verticalDramaSeries.get({ seriesId })` query
   stale after the list refresh has completed.
3. Close the dialog and invoke the existing `onDeleted` navigation callback.

Awaiting the list invalidation is the authoritative synchronization barrier;
the shell's existing refetch for non-current rows remains harmless and keeps
the parent component resilient. Targeting `get` by `seriesId` avoids broad
invalidations and avoids treating unrelated detail caches as affected.

## Failure handling

If list invalidation fails, the success callback does not navigate. The user
remains on the current surface and the query error/retry behavior remains
available, rather than being sent to a list that may still show stale data.
The server deletion has already succeeded in this case, so the existing error
surface should be treated as a refresh failure, not a second delete attempt.

## Testing

Add a focused jsdom test for the delete dialog mutation callback. Hold the list
invalidation Promise unresolved and assert that `onDeleted` is not called;
resolve it and assert that the targeted detail invalidation and `onDeleted`
then run. Preserve the existing server `deleteSeries` tests unchanged.

## Scope and rollout

Only the delete dialog and its focused test change. No schema, server router,
tenant ownership, cascade, deployment, or production data changes are needed.
Verification is local and focused; authenticated browser proof is a separate
external check and must not be inferred from unit tests.
