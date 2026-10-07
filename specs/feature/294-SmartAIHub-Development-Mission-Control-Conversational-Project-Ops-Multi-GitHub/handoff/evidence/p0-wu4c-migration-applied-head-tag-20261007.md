# P0-WU-4C applied migration head revision evidence

- Integrated canonical ref: `refs/heads/main`
- Integrated merge SHA: `3369b76ef4aaa252c56121c6abf2b8108bae9969`
- Source implementation commit: `95046301f3c082808e59511d39fc8c6bd49249a5`
- PR: #211
- Verification: `pnpm --dir apps/web exec vitest run server/services/drizzleMigrationEvidence.test.ts server/services/internalRuntimeEvidence.test.ts` — 2 files, 7 tests passed after integration.
- RED evidence: observed applied head and latest execution exposed only migration hash/time; canonical Drizzle journal tags were omitted.
- GREEN evidence: an applied hash matching journal entry `0001_first` now resolves and emits that tag in both fields; unknown hashes preserve null tags.
- Failure boundary: `drizzle.__drizzle_migrations` stores successful applications only; failed attempts remain `UNKNOWN` / `NOT_TRACKED`. No durable authorized failed-migration result source was found or invented.
- Overall P0 remains PARTIAL; this does not prove live database or deployment state.
