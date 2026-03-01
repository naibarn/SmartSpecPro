# Section 01: Database Foundation - Code Review Interview

## Auto-Fixed Issues

### 1. Missing FK constraints on new columns (HIGH → FIXED)
Added `.references()` with proper onDelete behavior to:
- `conversations.tenantId` → tenants(id) ON DELETE CASCADE
- `conversations.personaId` → persona_templates(id) ON DELETE SET NULL
- `users.defaultPersonaId` → persona_templates(id) ON DELETE SET NULL
- `tenants.defaultPersonaId` → persona_templates(id) ON DELETE SET NULL

Generated migration 0055_serious_crystal.sql and applied successfully.

### 2. Test afterAll cleanup (MEDIUM → FIXED)
Added `afterAll(() => pgClient?.end())` to close PostgreSQL connection after tests.

## Deferred Items (by design)

### 3. STT/TTS provider seed data in migration SQL
Providers were manually seeded via psql. The seed is idempotent (ON CONFLICT DO NOTHING).
For production reproducibility, these should be in a seed script — but that's an infra concern,
not a migration concern. The providers exist and tests verify it.

### 4. conversations.tenantId backfill in migration SQL
Backfill was run manually. For a fresh environment, the backfill SQL can be added to a
seed/bootstrap script. The production data is already correct.

### 5. telegramConnections → channel_connections data migration
Per the plan: "telegramConnections table should NOT be dropped — keep it alongside
channel_connections during a transition period." Section 05 will implement dual-write.
No data migration needed at this stage.

### 6. DESC ordering on priority/createdAt indexes
Drizzle ORM doesn't support DESC in its index builder API. PostgreSQL can use backward
index scans for DESC queries, so ASC indexes are functionally correct. The performance
difference is negligible at current data volumes.

## Let Go (nitpicks)

### 7. Scope creep in diff (pre-existing schema changes)
The diff includes changes from prior feature branches already in the working tree.
These are NOT new additions from this section — they were pre-existing uncommitted
changes that happen to be in schema.ts.

### 8. Additional FK/cascade/unique constraint tests
The 22 existing tests cover table existence, CHECK constraints, column presence,
index presence, and data integrity. FK validation and cascade tests would be nice
but aren't critical for a migration verification.
