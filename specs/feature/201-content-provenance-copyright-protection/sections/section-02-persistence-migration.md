# Section 02 — Persistence and migration

Extend `apps/web/drizzle/schema.ts` with tenant-scoped Feature-201 tables for
protection assets, watermark results, fingerprints, provenance manifests,
publications, verification runs/matches, cases/evidence/events, rights-holder
profiles/claims/documents/component rights, creation certificates, evidence
anchors, and external review links. Use bounded JSON metadata and storage keys;
never add secret/codeword columns. Add indexes for tenant/status/source,
idempotency, and lookup by final hash. Add one numbered Drizzle migration in
`apps/web/drizzle/migrations/` and update generated journal metadata using the
repo's existing migration workflow.

Tests first: a focused schema contract test checks exports, required fields,
tenant indexes, and unique idempotency constraints. Do not run destructive DB
commands against a non-test database.

Done when schema imports, migration validation, and focused contract tests pass.

## UI/UX Contract

### Target User / JTBD

N/A: this section is storage-only; it enables later creator and reviewer views.

### Surface Inventory

N/A: no browser surface is changed here.

### Component Map

N/A: no UI component is owned by this section.

### State Matrix

N/A: service/API sections map persistence states to UI states later.

### Responsive Matrix

N/A: no layout is changed here.

### Accessibility Acceptance

N/A: no interactive surface is changed here.

### Copy Contract

N/A: user-facing copy is owned by sections 07–09.

### Browser Evidence Required

N/A: schema/migration tests are the evidence for this section.

## Implementation Record

- Added the 18 tenant-scoped Feature-201 tables to `apps/web/drizzle/schema.ts`.
- Added `apps/web/drizzle/0332_feature_201_content_protection.sql` and journal entry `0332_feature_201_content_protection` at index 318. The repository stores numbered migrations directly under `apps/web/drizzle/`, so the implementation follows that authoritative path rather than the original placeholder subdirectory.
- Added `apps/web/drizzle/contentProtectionSchema.test.ts`. It verifies table exports, primary asset ownership/hash/timestamp columns, tenant/idempotency/status/hash indexes, and the absence of raw watermark codewords.
- Verification: `npm --workspace @smartspec/web test -- drizzle/contentProtectionSchema.test.ts --reporter=dot` passed (3 tests).
- Verification: journal JSON and touched SQL/TS files passed `git diff --check`.
- Limitation: `drizzle-kit check` cannot run cleanly because the existing repository metadata has a pre-existing snapshot collision (`meta/0146_snapshot.json` and `meta/0147_snapshot.json` both point at the same parent). No database migration command was run.
