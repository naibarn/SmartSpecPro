# D3.90 Focused Test Design

| Requirement | Test | RED evidence | GREEN evidence expected | Not proven |
|---|---|---|---|---|
| The current shared database is not mutated | Compare DB identity, migration count, schema/table fingerprint and selected row counts before/after; do all writes on a new database | Baseline snapshot captured before tests | Exact baseline values unchanged | Concurrent external changes cannot be attributed to this run without server audit logs |
| Backup can be read for restore | `pg_dump -Fc`; `pg_restore --list`; restore schema-only to a new DB | Existing data never used as a test target | Restore command exits 0 and schema inventory matches | Full data restore certification |
| DB-backed Spec 224 services work with current schema | Focused Spec 224 PostgreSQL Vitest files, selected by the concrete contract | Current schema may lack/rename expected fields | Exact tests pass on isolated schema clone, runtime role is non-superuser | Full regression, historical migration upgrade, production |
| Provider/harness contracts fail closed when unsupported | Existing dispatcher and Runner contract tests plus new focused cases only if a real gap is found | Unsupported adapter is rejected before dispatch | Supported adapters map consistently end-to-end; unsupported ones reject without job side effect | External provider authentication and paid execution |
| Protected operation respects Remote Trust | Existing admission-negative tests; no fabricated positive grant | Remote Trust config absent in checkpoint | Denial remains fail-closed | Positive protected execution requires configured trust root and owner grant |

TypeScript typecheck remains `SKIPPED_POLICY`. No full regression or live/paid provider execution.
