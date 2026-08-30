# Usage guide

This cleanup flow is superseded by Feature 158. Open `/drama-series` and use
the per-row remove action only for an unlinked Draft. The action archives the
ledger and retains its immutable history; there is no age-based cleanup banner
or automatic cleanup in the current Series-first workflow.

The action archives terminal pre-series Draft jobs only. It does not stop active
jobs, delete immutable Draft versions, or alter any created series.

## API

- `verticalDramaSeries.listDraftJobs` returns only unlinked Draft metadata.
- `verticalDramaSeries.archiveDraftJob({ jobId })` removes one unlinked Draft
  from the list while retaining history.
