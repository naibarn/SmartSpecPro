The dependent sections haven't been written yet. That's fine -- I have enough from the plan and spec to write section 07. Now let me produce the section content.

# Section 07 — Wire Chat Router to Unified Orchestrator

## Overview

This section modifies `apps/web/server/routers/chat.ts` to check the `unifiedSkillExecution` feature flag and delegate LLM skill execution to the unified orchestrator when enabled. The existing inline code remains as the fallback path when the flag is `false` or when the orchestrator throws an unrecoverable error.

**Depends on:**
- section-03-feature-flag (`unifiedSkillExecution` flag in `apps/web/shared/featureFlags.ts`)
- section-06-unified-orchestrator (`executeUnified()` from `apps/web/server/services/unifiedOrchestrator.ts`)

**Blocks:**
- section-10-parity-tests (needs both chat and team-room wired before parity testing)

---

## File to Modify

**`apps/web/server/routers/chat.ts`** (existing file, ~1830+ lines)

### Location of Change

The modification targets the `executeSkill` mutation, specifically the LLM skill execution block that begins at approximately line 1491 with the `if (isLLMSkill)` guard. The unified orchestrator delegation is inserted at the **top** of this block, before any existing logic.

---

## Implementation Guidance

### 1. Add Import for Orchestrator and Feature Flags

At the top of `chat.ts` (near the other service imports around lines 50-55), add lazy imports that will be used inside the mutation handler:

```typescript
// These are imported dynamically inside the handler to match existing patterns in the file
// (chat.ts already uses dynamic imports for getTenantFeatureFlags, deductCreditsForModel, etc.)
```

The imports for `executeUnified` and `getTenantFeatureFlags` should be dynamic (using `await import(...)`) to match the existing pattern used throughout chat.ts (see lines 728, 1492-1494 for examples of this pattern).

### 2. Unified Path Insertion Point

Inside the `executeSkill` mutation, within the `if (isLLMSkill)` block (line ~1491), add a feature flag check **before** the existing inline code. The structure is:

```
if (isLLMSkill) {
  // --- NEW: Unified orchestrator path ---
  // 1. Resolve tenant ID
  // 2. Load feature flags (dynamic import of getTenantFeatureFlags)
  // 3. If unifiedSkillExecution is true:
  //    a. Build UnifiedExecutionRequest from chat context
  //    b. Call executeUnified()
  //    c. Map UnifiedExecutionResult to chat.ts return shape
  //    d. On orchestrator error: log "unified_fallback" audit event, fall through
  // --- END NEW ---

  // ... existing inline code (unchanged, serves as fallback) ...
}
```

### 3. Building the UnifiedExecutionRequest

The request object maps chat.ts local variables to the unified contract (defined in section-01):

| UnifiedExecutionRequest field | Source in chat.ts |
|-------------------------------|-------------------|
| `channel` | `"chat"` (literal) |
| `userId` | `ctx.user.id` |
| `tenantId` | `ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "")` |
| `userMessage` | `input.prompt \|\| ""` |
| `attachments` | Built from `input.referenceImageUrls` and `mergedExtraParams.reference_images` |
| `dynamicParams` | `mergedExtraParams` (already computed earlier in the mutation) |
| `conversationContext.conversationId` | `input.conversationId` |
| `conversationContext.conversationModel` | Loaded from `getConversationById()` if `input.conversationId` is set |
| `conversationContext.activePersonaId` | From conversation row if it has an `activePersonaId` field, otherwise `null` |
| `conversationContext.publicUrl` | `ctx.publicUrl` |
| `routeHint.selectedSkillId` | `input.skillId` |
| `routeHint.route` | `"skill"` |
| `routeHint.reason` | `"chat_execute_skill"` |
| `creditMode` | `"deduct"` (default for chat) |

### 4. Mapping the Result Back

The orchestrator returns `UnifiedExecutionResult`. Chat.ts must map it to the existing return shape:

```typescript
// Pseudocode — do not copy verbatim
{
  success: true,
  skillId: input.skillId,
  type: "text" as const,
  message: result.result.type === "text" ? result.result.content : undefined,
  creditsUsed: result.creditsDeducted ?? 0,
  resultUrl: undefined,
  resultUrls: undefined,
  error: undefined,
}
```

For `media_job` results from the orchestrator, the chat router should handle them according to the existing media dispatch pattern (this is relevant for section-13 media routing integration -- for now, text results are the primary concern).

### 5. Persistence Hook Registration

Chat.ts should NOT call `createMessage()` directly when the unified path succeeds. Instead, the orchestrator invokes the persistence hook. However, during the feature-flag rollout phase, the simplest approach is:

- The orchestrator returns the result **without** persisting.
- Chat.ts persists the message itself after receiving the result (same as existing code).

This avoids needing hook registration in the initial wiring. The persistence hook pattern (section-06) can be wired in a follow-up once the orchestrator is stable.

### 6. Fallback on Orchestrator Error

If `executeUnified()` throws (not an LLM failure -- those are handled internally), the chat router must:

1. Log the error with `auditLogger` (event type `"unified_fallback"`, include `traceId`, `skillId`, error message)
2. Log to console via `debugError("Chat", ...)`
3. **Fall through** to the existing inline code below (do NOT re-throw)

This is achieved by wrapping the unified path in a try/catch and using a boolean flag like `let handledByUnified = false;` to skip the existing code when the unified path succeeds.

### 7. Conversation Model Loading

The existing code loads the conversation model at line ~1584. This same data is needed for `conversationContext.conversationModel`. To avoid duplicate DB queries, load it once before the unified check and reuse it:

```
// Load conversation model early (used by both unified and legacy paths)
let conversationModel: string | null | undefined;
if (input.conversationId) {
  const conversation = await getConversationById(input.conversationId, ctx.user.id);
  conversationModel = conversation?.model;
  // Also extract activePersonaId if available
}
```

---

## Tests

**File:** `apps/web/server/services/__tests__/unifiedOrchestrator.test.ts` (additional section for flag wiring tests)

These tests verify the chat router's behavior with and without the feature flag. They mock the orchestrator and feature flag service to test the wiring logic in isolation.

### Test Cases

```
# --- Feature Flag Integration (Chat Router) ---

# Test: flag=false — chat.ts uses existing inline code (orchestrator NOT called)
# Setup: mock getTenantFeatureFlags to return { unifiedSkillExecution: false }
# Setup: mock executeUnified (should NOT be called)
# Action: call executeSkill mutation with a text skill
# Assert: executeUnified was NOT called
# Assert: executeSkillLlmWithFallback WAS called (existing path)
# Assert: result has expected shape with success/message

# Test: flag=true — chat.ts delegates to orchestrator
# Setup: mock getTenantFeatureFlags to return { unifiedSkillExecution: true }
# Setup: mock executeUnified to return a text result
# Action: call executeSkill mutation with a text skill
# Assert: executeUnified was called with correct UnifiedExecutionRequest shape
# Assert: request.channel === "chat"
# Assert: request.creditMode === "deduct"
# Assert: request.routeHint.selectedSkillId === input.skillId
# Assert: result mapped correctly (success: true, message from orchestrator)

# Test: flag=true, orchestrator throws — falls back to existing path
# Setup: mock getTenantFeatureFlags to return { unifiedSkillExecution: true }
# Setup: mock executeUnified to throw Error("orchestrator failure")
# Action: call executeSkill mutation with a text skill
# Assert: executeSkillLlmWithFallback WAS called (fallback path)
# Assert: auditLogger was called with "unified_fallback" event
# Assert: result still succeeds (from fallback path)

# Test: flag=true — conversationContext populated correctly
# Setup: mock getTenantFeatureFlags to return { unifiedSkillExecution: true }
# Setup: mock getConversationById to return { model: "gpt-4o", activePersonaId: "p1" }
# Setup: mock executeUnified
# Action: call executeSkill with conversationId
# Assert: executeUnified called with conversationContext.conversationModel === "gpt-4o"
# Assert: executeUnified called with conversationContext.activePersonaId === "p1"

# Test: flag=true — reference images passed as attachments
# Setup: mock getTenantFeatureFlags to return { unifiedSkillExecution: true }
# Setup: mock executeUnified
# Action: call executeSkill with referenceImageUrls: ["/uploads/img1.png"]
# Assert: executeUnified called with attachments containing the image URLs

# Test: flag=true — dynamicParams forwarded to orchestrator
# Setup: mock getTenantFeatureFlags to return { unifiedSkillExecution: true }
# Setup: mock executeUnified
# Action: call executeSkill with extraParams: { style: "cinematic", request: "write about AI" }
# Assert: executeUnified called with dynamicParams matching mergedExtraParams
```

### Test File Structure

Since these tests verify chat router wiring rather than orchestrator internals, they can live in a dedicated file:

**File:** `apps/web/server/routers/__tests__/chatUnifiedWiring.test.ts`

The test file should:
- Mock `../services/tenantFeatureFlagService` (return configurable flags)
- Mock `../services/unifiedOrchestrator` (the `executeUnified` function)
- Mock `../services/skillModelFallback` (the `executeSkillLlmWithFallback` for fallback verification)
- Mock `../services/creditService` (deductCreditsForModel)
- Mock `../services/chatService` (createMessage, getConversationById)
- Mock `../services/auditLogger` (verify fallback audit events)
- Use `vi.mock()` for all mocks
- Create a minimal tRPC caller context with `ctx.user`, `ctx.tenantId`, `ctx.publicUrl`

---

## Structural Pattern

The recommended code structure inside the `if (isLLMSkill)` block:

```
let handledByUnified = false;

// Load conversation context early (shared between paths)
let conversationModel = ...;
let activePersonaId = ...;

try {
  const { getTenantFeatureFlags } = await import("../services/tenantFeatureFlagService");
  const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
  const flags = await getTenantFeatureFlags(tenantId);

  if (flags.unifiedSkillExecution) {
    const { executeUnified } = await import("../services/unifiedOrchestrator");

    const request: UnifiedExecutionRequest = { ... };
    const result = await executeUnified(request);

    // Map result to chat return shape
    handledByUnified = true;

    // Persist message (chat owns persistence)
    if (input.conversationId && result.result.type === "text") {
      await createMessage({ ... }).catch(err => console.error(...));
    }

    return {
      success: true,
      skillId: input.skillId,
      type: "text" as const,
      message: result.result.type === "text" ? result.result.content : undefined,
      creditsUsed: result.creditsDeducted ?? 0,
      ...
    };
  }
} catch (err) {
  // Only catch orchestrator-level errors, not flag-loading errors
  if (!handledByUnified) {
    debugError("Chat", "[executeSkill] Unified orchestrator failed, falling back:", err);
    auditLogger.log({
      eventType: "unified_fallback",
      channel: "chat",
      skillId: input.skillId,
      error: String(err),
      userId: ctx.user.id,
    });
  } else {
    throw err; // Re-throw if we already committed to unified path
  }
}

// --- Existing inline code (unchanged, runs when flag=false or orchestrator failed) ---
```

### Important: Do NOT Modify Existing Code

The existing LLM skill execution code (lines ~1492-1821) must remain completely unchanged. The unified path is purely additive -- it wraps around the existing code with a conditional guard. This ensures:

1. Zero risk when `unifiedSkillExecution = false` (default)
2. Clean fallback when orchestrator fails
3. Easy removal of the flag check once the unified path is validated

---

## Estimated Change Size

- ~50-60 lines added to `chat.ts` (flag check, request building, result mapping, fallback handling)
- ~150-200 lines for test file `chatUnifiedWiring.test.ts`
- No existing lines modified or deleted

---

## Dependencies on Other Sections

| Dependency | What This Section Needs | Section |
|------------|------------------------|---------|
| `UnifiedExecutionRequest` type | Import type for request building | section-01 |
| `UnifiedExecutionResult` type | Import type for result mapping | section-01 |
| `unifiedSkillExecution` flag | Must exist in `TenantFeatureFlags` | section-03 |
| `executeUnified()` function | The orchestrator entry point to call | section-06 |

---

## Verification

```bash
# Run the new wiring tests
cd /home/dev/projects/SmartSpecPro/apps/web && npx vitest run server/routers/__tests__/chatUnifiedWiring.test.ts

# Run existing chat tests to verify no regressions
cd /home/dev/projects/SmartSpecPro/apps/web && npx vitest run server/routers/__tests__/chat

# Type check
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check
```