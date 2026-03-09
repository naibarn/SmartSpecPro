# Section 01 Code Review Interview

## Auto-fixes Applied

### 1. Tests now use real resolveApiUrl (was HIGH)
- Exported `resolveApiUrl` and `ApiStyle` from llmRoutes.ts
- Tests import and call the actual function instead of a replica
- Added JWT_SECRET env stub for import chain

### 2. Case-insensitive provider lookup in seed script (was MEDIUM)
- Changed `.find(p => p.providerName === "opencode-zen")` to use `lower()` helper

### 3. Redis feature flag seeding added to seed script (was MEDIUM)
- Added Step 3 to seed script: sets `feature-flag:responsesApi` to `"false"` if not already set

### 4. Unrelated files unstaged (was LOW)
- Removed `skills/deep-plan-codex/` deletions from staged diff

## Let Go (No Action)

### 5. Pricing/settings tests are trivial assertions
- These are spec-constant smoke tests, not integration tests
- Integration-level DB tests would require a test database setup that doesn't exist yet
- Acceptable for section 01; real integration tests will be in later sections

### 6. Seed script doesn't close connection pool
- `process.exit(0)` is standard pattern in all other seed scripts in the project

### 7. Feature flag test isolation
- Works correctly in practice with Vitest's module caching behavior
