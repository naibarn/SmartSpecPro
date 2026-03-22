<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: cd apps/web && pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-auth-service-browser-hardening
section-02-startup-cleanup-and-trpc-verify
section-03-phase1-tests
section-04-db-schema-and-migration
section-05-api-key-service
section-06-api-key-trpc-router
section-07-frontend-api-key-panel
section-08-phase2-tests
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Phase |
|---------|------------|--------|-------|
| section-01-auth-service-browser-hardening | - | 02, 03 | Phase 1 |
| section-02-startup-cleanup-and-trpc-verify | 01 | 03 | Phase 1 |
| section-03-phase1-tests | 01, 02 | - | Phase 1 |
| section-04-db-schema-and-migration | - | 05, 06 | Phase 2 |
| section-05-api-key-service | 04 | 06, 07 | Phase 2 |
| section-06-api-key-trpc-router | 05 | 07 | Phase 2 |
| section-07-frontend-api-key-panel | 06 | 08 | Phase 2 |
| section-08-phase2-tests | 05, 06, 07 | - | Phase 2 |

## Execution Order

Batch 1: section-01, section-04 (parallel — no dependencies, different phases)
Batch 2: section-02, section-05 (parallel — depend on different batch-1 sections)
Batch 3: section-03, section-06 (parallel — different dependency chains)
Batch 4: section-07 (depends on section-06)
Batch 5: section-08 (depends on 05, 06, 07)

## Section Summaries

### section-01-auth-service-browser-hardening
Modify `authService.ts` to remove localStorage fallback in browser context. Change `getAuthToken`, `setAuthToken`, `getAuthTokenSync`, `isTokenExpired`, `verifyToken`, `setupAuthInterceptor`, and `logout` to use cookie-only auth for browser while preserving Tauri secure store path.

### section-02-startup-cleanup-and-trpc-verify
Add startup cleanup function to remove legacy localStorage keys. Verify tRPC client has `credentials: 'include'`. Wire cleanup into App.tsx startup.

### section-03-phase1-tests
Write Vitest tests for all Phase 1 changes: authService browser vs Tauri paths, startup cleanup, interceptor behavior.

### section-04-db-schema-and-migration
Add `userLlmApiKeys` table to drizzle/schema.ts with AES-256-GCM encrypted key column, userId FK, provider unique constraint. Run migration.

### section-05-api-key-service
Create `userApiKeyService.ts` with setUserApiKey, getUserApiKeys, deleteUserApiKey, decryptUserApiKey functions using crypto.ts encryption.

### section-06-api-key-trpc-router
Create `userApiKeys.ts` tRPC router with setKey, listKeys, deleteKey procedures. Register in main router. Add rate limiting.

### section-07-frontend-api-key-panel
Create new UserLlmKeysPanel.tsx component using tRPC mutations/queries for LLM key management. Remove sessionStorage API key functions from authService.ts. Wire into Settings page API tab.

### section-08-phase2-tests
Write Vitest tests for Phase 2: service layer (encrypt/decrypt), tRPC router (auth, validation, responses), frontend panel (renders, saves, deletes).
