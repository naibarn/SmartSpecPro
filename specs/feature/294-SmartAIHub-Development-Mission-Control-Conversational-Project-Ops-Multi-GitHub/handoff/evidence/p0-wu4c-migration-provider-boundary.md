# P0-WU-4C migration evidence provider boundary

- Canonical integration: PR #186, SHA `3fa0d4846f15c9bbbd73f7e82080a27ed1121e60`.
- Internal runtime aggregation now consumes the normalized `MigrationEvidenceSource` interface. The configured default remains `drizzle.__drizzle_migrations`; another provider such as D1 can supply the same evidence contract without changing the aggregator or introducing a second registry.
- Verification: `pnpm --dir apps/web exec vitest run server/services/internalRuntimeEvidence.test.ts server/services/drizzleMigrationEvidence.test.ts` — 2 files, 6 passed. The injected alternate source is invoked and its normalized evidence is preserved.
- Drizzle source evidence includes environment/database identity, expected/applied migration heads, pending items, latest applied execution, and timestamp. Its ledger does not record failed attempts; `failedMigration` remains null with `failureTracking=not_recorded_by_drizzle_ledger`. No parallel failure registry was added.
- External migration provider discovery was not performed. The runtime source is internal PostgreSQL evidence only; production verification remains not verified.
