# Implementation plan

1. Schema: add nullable `vertical_drama_draft_ledgers.seriesId` with a
   recoverable `ON DELETE SET NULL` foreign key and owner/Series index.
2. Contracts: extend planning state with metadata-only `legacyRecovery`; keep
   all candidate bodies and history lazy.
3. Service: implement owner-scoped row-locked migration with deterministic
   matching, planning-shell creation, staged Source Pack attachment, and
   per-row failure isolation.
4. Runtime wiring: expose `migrateLegacyDraftJobs`; run it once before loading
   the index Draft list; pass `planningSeriesId` into new composition jobs.
5. UI: remove the age-cleanup banner/dialog; label manual removal as
   “remove from list (history retained)”; add recovery action to Planning tab.
6. Verification: unit-test metadata/matching contracts, focused UI/server
   tests, filtered typecheck, Prettier, and `git diff --check`.

## Rollback

The migration is additive. Disable the index mutation and UI entry point if
needed; keep the link column and Series recovery pointer. No destructive data
operation is part of this change.
