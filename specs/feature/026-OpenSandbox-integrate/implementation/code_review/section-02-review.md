# Section 02 Code Review

## HIGH Severity

### 1. `sandbox_jobs.userId` FK has no ON DELETE strategy -- will block user deletion
- `userId` FK uses default `ON DELETE no action`
- Will block user deletion if sandbox jobs exist

### 2. `datetime.utcnow` deprecated in Python 3.12+
- All models use `default=datetime.utcnow` (deprecated since Python 3.12)
- Also produces naive datetime vs timezone-aware DB default

## MEDIUM Severity

### 3. Unrelated `scheduledMessages.dynamicParams` column in diff
- Not part of section-02 plan, leaked from dirty working tree

### 4. Missing `SandboxNetworkAction` Python enum class
- 5 Drizzle enums but only 4 Python enums
- `network_default_action` columns use raw String(8)

### 5. No `updatedAt` auto-update trigger
- `updatedAt` only sets on INSERT via `defaultNow()`
- No trigger or hook for UPDATE

### 6. `SandboxJob.to_dict()` appends "Z" to isoformat that already has timezone
- Produces malformed `2026-02-26T10:00:00+00:00Z`

## LOW Severity

### 7. `SandboxProfile.to_dict()` omits `entrypointTemplate`, timestamps
### 8. `TenantSandboxPolicy.to_dict()` omits `egressRulesJson`, `allowedImagesJson`, timestamps
### 9. Tests do not verify idempotent seed behavior (needs DB)
### 10. `sandbox_jobs.id` varchar(36) has no UUID auto-generation default
### 11. `bigint` mode "number" on `sizeBytes` may lose precision above 2^53

## Positive Observations
- Enum consistency correct across Drizzle and Python
- Column naming conventions followed correctly
- All 8 indexes present including partial unique on idempotencyKey
- FK cascade rules correct on artifacts and tenant policies
- Seed data matches spec
- Test coverage comprehensive
