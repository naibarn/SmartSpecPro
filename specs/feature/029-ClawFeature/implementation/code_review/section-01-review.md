# Section 01: Database Foundation - Code Review

## Critical Issues

### 1. MISSING FK constraints on new columns (HIGH)
- `conversations.tenantId` — no `.references()` to tenants(id) ON DELETE CASCADE
- `conversations.personaId` — no `.references()` to persona_templates(id) ON DELETE SET NULL
- `users.defaultPersonaId` — no `.references()` to persona_templates(id) ON DELETE SET NULL
- `tenants.defaultPersonaId` — no `.references()` to persona_templates(id) ON DELETE SET NULL

### 2. STT/TTS provider seed data not in migration (HIGH)
Providers were manually seeded but no reproducible migration/seed artifact exists.

### 3. conversations.tenantId backfill not in migration (HIGH)
Backfill was manually run but not included in the migration SQL.

### 4. telegramConnections → channel_connections data migration missing (HIGH)
Plan required INSERT INTO ... SELECT FROM migration. Not implemented.

### 5. Missing DESC ordering on priority index (MEDIUM)
channel_routing_rules index uses ASC on priority but plan requires DESC.

### 6. Missing DESC on webhook_trigger_logs.createdAt index (LOW-MEDIUM)

## Test Issues

### 7. No afterAll cleanup — connection leak (MEDIUM)
Missing pgClient.end() in afterAll.

### 8. Missing FK constraint validation tests (MEDIUM)
### 9. Missing ON DELETE CASCADE/SET NULL tests (MEDIUM)
### 10. Missing unique constraint tests (LOW)

## Verdict
Schema table definitions are correct. Four critical missing items need to be addressed:
FK constraints, seed SQL, backfill SQL, and telegram data migration.
