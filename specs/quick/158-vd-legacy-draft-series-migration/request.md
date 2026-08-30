# Feature 158 — Migrate legacy Vertical Drama Drafts into Series-first

## Goal

Remove the split identity between the old Draft Inbox and the current
Series-first Planning workspace. Every recoverable legacy Draft must become
owned by a durable `SeriesID`, while its immutable Draft/QC history remains
available through explicit, lazy recovery.

## Requirements

1. Add a nullable compatibility `seriesId` link to the Draft ledger and persist
   it for all new composition jobs started from a planning Series.
2. Provide an authenticated, tenant/user-scoped, idempotent migration that:
   - reuses a matching Series when `draftSessionId`, active Draft ID, or an
     already-linked Source Pack gives high-confidence identity;
   - otherwise creates a free planning Series shell from metadata only;
   - attaches the matching staged Source Pack when safe;
   - stores only a metadata recovery pointer in `bible.planningState`.
3. Exclude linked Draft ledgers from the Draft Inbox and age-based cleanup.
4. Keep explicit recovery from the Series Planning tab; no Draft body/history
   is loaded with the Series list/detail projection.
5. Remove automatic age-based cleanup UX. Users may remove an unlinked Draft
   from the list individually; this archives the ledger and retains history.
6. Preserve tenant ownership, row locking, retry safety, and no provider/credit
   work during migration.

## Acceptance criteria

- Re-running migration creates no duplicate Series and changes no linked row.
- A migrated Draft no longer appears in the Draft Inbox.
- A migrated Series exposes a `Recover legacy Draft` action that opens the
  existing lazy recovery wizard by Series route.
- A Series-backed Draft cannot be archived through the legacy archive mutation.
- Focused tests, typecheck filtering, formatting, and diff checks pass.

## Explicit non-goals

- Do not delete immutable Draft versions, QC history, source assets, or Series.
- Do not infer identity from title similarity alone.
- Do not run a startup-wide blind backfill or auto-delete by age.
