# Section 01 — Code Review Interview

## Review Triage

### AUTO-FIXED

1. **#2 (HIGH): scheduledMessages.ts missing recordStepAttempt** — Added `recordStepAttempt` import and call after credit deduction in `parseIntent`.
2. **#8 (LOW): Feature flag check not inside try/catch** — Moved `getTenantFeatureFlag` calls inside the try/catch block so `runPlanner` never throws even if Redis is unavailable.

### DELIBERATE DEVIATIONS (documented, not fixed)

3. **#1 (HIGH per reviewer): memoryService.ts not wired** — The memory service uses direct `fetch()` calls (not `executeWithFallback`), its function signature `processConversationMemory(conversationId, userId)` has no `tenantId`, and adding it would require changing the function signature and all callers. Low volume background process. Will document in section file.

4. **#3: scheduler.ts skill branch (line 161) not wired** — Correctly identified as model validation (storing model on conversation record), not LLM execution. Plan text was slightly misleading.

5. **#5: loadEnabledModelsWithPricing vs loadEnabledModelsWithCapabilities** — `resolveModelFromPlan` expects `ModelWithPricing[]` which extends `EnabledModelWithCapabilities` with pricing fields. The plan's instruction was incorrect — `loadEnabledModelsWithCapabilities` doesn't return pricing data needed by the resolver.

6. **#9: Bundled migration** — Drizzle generates all pending schema changes into one migration file. The `agency_run_artifacts` table was already defined in schema.ts from a previous section.

### LET GO (nitpicks)

7. **#4: recordStepAttempt signature** — `costUsd: string` matches the actual `CompleteStepAttemptInput` interface. The plan had a simplified pseudo-code that didn't match the real types.
8. **#6: channelGateway `as any`** — Existing pattern in the file, not introduced by this change.
9. **#7: scheduler tenantId unsafe cast** — `scheduledMessages` table lacks `tenantId` column; existing pattern.
10. **#10: console.error** — The project doesn't have a universal structured logger imported in service files. The `[taskPlannerMiddleware]` prefix provides searchability.
11. **#11: Test coverage** — All 10 planned scenarios are covered with 11 tests.
