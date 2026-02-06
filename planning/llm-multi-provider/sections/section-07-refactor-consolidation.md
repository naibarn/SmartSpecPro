# Section 07: Refactor Consolidation

## Overview

This section replaces the duplicated `getActiveLlmProvider()` pattern in three files (`skills.ts`, `translation.ts`, `scheduler.ts`) with calls to the shared `llmRouter.resolveProviders()`. It also removes two dead code files (`llm.ts` and `openaiCompatGateway.ts`).

Currently, provider resolution logic is duplicated in 4 places across the codebase. After this refactor, all provider resolution goes through `llmRouter`, ensuring consistent behavior (health checking, routing rules, multi-provider support) everywhere.

**Dependencies:** Section 04 (llmRouter) -- `resolveProviders()` must be implemented.
**Blocks:** Nothing (this can be done in parallel with other post-router work).

---

## Tests First

File: `apps/web/server/services/refactorConsolidation.test.ts` (or co-located in each router's test file)

### Files to Update
- **Test: `skills.ts` uses `llmRouter.resolveProviders()`** -- Mock `llmRouter`, call the skills handler, verify that `resolveProviders()` was called and no direct DB query for the provider exists.
- **Test: `translation.ts` uses `llmRouter.resolveProviders()`** -- Same pattern: mock llmRouter, verify it is called.
- **Test: `scheduler.ts` uses `llmRouter.resolveProviders()`** -- Same pattern.
- **Test: No direct DB query for provider in any of these files** -- Grep/verify that none of the three files import or call `getActiveLlmProvider()` or directly query `llm_providers`.

### Dead Code Removal
- **Test: `llm.ts` is deleted (import should fail)** -- Attempting to import from `apps/web/server/_core/llm.ts` should throw a module-not-found error.
- **Test: `openaiCompatGateway.ts` is deleted** -- Attempting to import from `apps/web/server/_core/openaiCompatGateway.ts` should throw a module-not-found error.

---

## Implementation Details

### Files to Modify

#### 1. `apps/web/server/routers/skills.ts`

**Current pattern:**
```typescript
const provider = await getActiveLlmProvider()
// uses provider.baseUrl, provider.apiKey to make LLM calls
```

**New pattern:**
```typescript
import { resolveProviders } from '../services/llmRouter'

const providers = await resolveProviders(modelId)
const provider = providers[0]  // use top-priority provider
// use provider.baseUrl, provider.apiKey
```

If the skills router needs the full fallback chain (not just the top provider), it can use `executeWithFallback()` instead. Determine this based on whether skills currently handle errors and retry. If they do a simple fire-and-forget call, `resolveProviders()[0]` is sufficient. If they need resilience, use `executeWithFallback()`.

#### 2. `apps/web/server/routers/translation.ts`

Same refactor as `skills.ts`. Replace the inline provider query with `resolveProviders(modelId)`.

#### 3. `apps/web/server/services/scheduler.ts`

Same refactor. The scheduler runs background LLM tasks. Replace provider resolution with `resolveProviders(modelId)`. If the scheduler should benefit from fallback resilience, use `executeWithFallback()`.

### Files to Delete

#### 4. `apps/web/server/_core/llm.ts`

This file contains `invokeLLM()` which throws errors and is never called. Delete the entire file.

Before deleting, verify:
- Search the codebase for any imports of this file.
- Confirm no references exist (the plan states it is dead code).

#### 5. `apps/web/server/_core/openaiCompatGateway.ts`

This file contains `registerOpenAICompatRoutes()` which is never registered in the Express app. Delete the entire file.

Before deleting, verify:
- Search the codebase for any imports of this file.
- Confirm no references exist.

### Verification Checklist

After completing the refactor:
1. Search the entire codebase for `getActiveLlmProvider` -- should return zero results (or only the definition if it still exists as a deprecated wrapper, though full removal is preferred).
2. Run the full test suite (`npx vitest run`) to confirm nothing breaks.
3. Verify `llm.ts` and `openaiCompatGateway.ts` no longer exist on disk.
4. Verify `skills.ts`, `translation.ts`, and `scheduler.ts` all import from `llmRouter`.
