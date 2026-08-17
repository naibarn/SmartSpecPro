# Research notes

- `VerticalDramaShell.tsx` queries `listDraftJobs` only on `/drama-series`, caches
  metadata for 15 seconds, and polls every 2 seconds only for active jobs.
- `listVerticalDramaDraftLedgers` projects metadata and limits visible rows to
  50; full JSON is loaded only through owner-scoped `getDraftJob` after selection.
- `verticalDramaDraftLedgers` is independent from series rows and has owner,
  status, `updatedAt`, and `archivedAt` fields. No migration is needed.
- Existing `archiveDraftJob` marks a row archived instead of deleting immutable
  versions. The bulk path should preserve that recoverability model.
- Eligible terminal/pre-series states: `ready_for_qc`, `passed`, `failed`, and
  `cancelled`. Exclude active, `applied`, and `archived` statuses explicitly.
- The owner/status/updated index supports a bounded summary/update predicate.
- Existing UI primitives include AlertDialog, RadioGroup, Button, and Sonner
  toast. Astryx CLI discovery was attempted but the local CLI module is missing;
  use the repository's existing dialog vocabulary without introducing styling
  dependencies.
- The worktree is heavily dirty, including the three target implementation
  files. Edits and verification must stay hunk/path scoped.
