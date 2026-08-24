# Progress: Series-owned Draft and QC lifecycle

- [COMPLETED] evidence-and-design — traced the delete/recovery loop, Draft ledger ownership, composition admission, QC admission, and status recovery.
- [COMPLETED] schema-tombstone — added `seriesDeletedAt`, the active-Series uniqueness guard, and migration `0253`; applied successfully to the local `smartspec` database from `apps/web/.env`.
- [COMPLETED] lifecycle-enforcement — enforced Series ownership across composition, QC, selection, status, receipt, cache pointers, and delete paths; disabled automatic legacy migration on Series index load.
- [COMPLETED] data-retention — detached source packs before Series deletion and changed their FK to `ON DELETE SET NULL` so source assets/analyses survive.
- [COMPLETED] focused-tests — Draft composition/QC, deleteSeries, and delete-dialog regression suites pass.
- [COMPLETED] verification — server integrity suites pass (5 files / 45 tests), UI Wizard suites pass under jsdom (2 files / 70 tests), `git diff --check` is clean, and post-migration DB checks confirm no active unlinked/duplicate/orphan Series links; full typecheck remains baseline-noisy outside this change, and browser/production deployment proof is not run.

## Database action

- Target: local PostgreSQL `smartspec` at `localhost:5432`, loaded from `apps/web/.env`.
- Before migration: 41 Draft ledgers, 29 unlinked, 12 active linked, and 3 active ledgers duplicated `seriesId=52`.
- Safe audit action: archived the 2 older duplicate ledgers for Series 52; their rows, immutable versions, and QC identifiers were preserved. The latest row matched the Series planning session and remained active.
- After 0253/0254 cleanup: 41 ledgers, 5 active linked, 36 archived, 0 active unlinked, 0 active duplicate links, 0 orphan links, and 174 immutable versions retained; latest migration id 228 recorded at `1787575173477`.
- Production was not targeted.

## Discovery note

SocratiCode MCP tools were not callable in this session, so discovery used bounded `rg` and targeted `sed` reads after narrowing the known router/service paths. No broad repository rewrite or destructive command was used.

## Gap closure wave

- Added Series guards to Draft composition cancellation and Draft history/version loading.
- Added active-ledger filters for tombstoned/archived rows and Series-scoped QC snapshot recovery.
- Added deterministic cleanup migration `0254_vertical_drama_legacy_draft_cleanup`; local backup was written under `/tmp/smartspec-vd-draft-backup-Rmgl4v/` before applying it.
- Applied `0254` locally: 0 active unlinked ledgers, 0 visible legacy recovery shells, 5 active Series-linked ledgers, 36 archived ledgers; immutable history was preserved.
- Made 0253 self-healing for pre-existing duplicate active ledgers by retaining the newest row and archiving older rows before creating the unique index; a transaction rollback smoke check confirms the SQL parses and executes safely.
- Removed the final browser-session-only Draft workspace recovery path; `getDraftWorkspaceStatus` and the Wizard now require an active Series ID before loading Draft/QC state.
- Added route/QC regression coverage; server integrity suite passes 45 tests and UI Wizard suite passes 70 tests under jsdom.
