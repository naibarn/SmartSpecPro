# Usage guide

Open `/drama-series`. After the metadata-only Draft Inbox loads, the application
offers cleanup when at least one eligible inactive Draft is older than five
days. Choose 5, 7, or 10 days and confirm “ลบออกจากรายการ” / “Remove from
inbox”. The displayed count includes all matching owner-scoped Draft jobs, not
only the first 50 visible rows.

The action archives terminal pre-series Draft jobs only. It does not stop active
jobs, delete immutable Draft versions, or alter any created series.

## API

- `verticalDramaSeries.listDraftJobs` returns `cleanup.counts` for keys 5, 7,
  and 10 in addition to the existing `jobs` array.
- `verticalDramaSeries.archiveStaleDraftJobs({ olderThanDays })` accepts only
  `5 | 7 | 10` and returns `{ ok: true, archivedCount }`.
