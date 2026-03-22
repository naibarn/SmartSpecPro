---
name: Unified Skill Execution — Completeness Audit (2026-03-21)
description: Full completeness and correctness audit of the unified skill execution system (all 13 sections). Verdict: APPROVE_WITH_FIXES.
type: project
---

# Unified Skill Execution Pipeline — Completeness Audit

**Verdict: APPROVE_WITH_FIXES** — Core architecture is sound and all 13 plan sections are implemented. Several HIGH issues exist that must be fixed before the feature flag is enabled for any production tenant.

## Critical Gaps

### HIGH-1: `capabilitiesAllowed` filter is declared but never enforced
`UnifiedExecutionRequest.capabilitiesAllowed` exists in types.ts but `executeUnified` in `unifiedOrchestrator.ts` never reads it. A channel that sets this field (e.g., to restrict team rooms to `writing.*` only) gets no enforcement.

### HIGH-2: `retrieveForPrompt` receives `personaId` where `assistantId` is expected
`contextBuilder.ts:67` calls `retrieveForPrompt(tenantId, personaId, null, null, null, ...)`. The function signature is `retrieveForPrompt(tenantId, assistantId, runId, roomId, teamId, ...)`. Passing a persona UUID as `assistantId` produces wrong scoped memory results (retrieves memories scoped to a non-existent agent, not the persona's memory).

### HIGH-3: `section-08` wiring in `runEngine.ts` is absent — flag is only in `teamRunSkillExecutor.ts`
The plan (section-08) requires wiring in `runEngine.ts`. `runEngine.ts` imports `executeTeamRunSkillTurn` directly but has no reference to `unifiedSkillExecution` or `executeUnified`. The wiring is actually inside `teamRunSkillExecutor.ts` itself, which is technically correct but means `runEngine.ts` has no fallback audit logging for unified failures.

### HIGH-4: `as any` on `executionPolicy` in `textSkillExecutor.ts:50`
`policy` is cast `as any` before passing to `executeSkillLlmWithFallback`. Type mismatch between `Record<string, unknown>` (ExecutorInput) and `SkillExecutionPolicyResult` (what `executeSkillLlmWithFallback` requires) will suppress future type errors silently.

### HIGH-5: `teamRunSkillExecutor` error-handling logic is inverted
`teamRunSkillExecutor.ts:127-134`: when `handledByUnified` is true and an error is thrown, the catch block resets `handledByUnified = false` and falls through to legacy code. This means a committed unified execution that partially succeeded can have its side effects (credits logged, audit events emitted) and then silently retry via legacy. The `chat.ts` catch block correctly re-throws when `handledByUnified` is true; `teamRunSkillExecutor.ts` does not.

## Medium Issues

### MEDIUM-1: `orchestrator_error` error-detection in `teamRunSkillExecutor.ts` is fragile
Line 105 checks `result.route.reason === "orchestrator_error"`. The `makeErrorResult` function in `unifiedOrchestrator.ts` does set this for top-level catch, but `skill_resolution_failed` and `executor_not_found` errors also produce silent empty text results without triggering this check. These silently return empty content to the team room.

### MEDIUM-2: `buildChatContext` — knowledgebase truncation is asymmetric
`contextBuilder.ts` caps knowledgebase at 8,000 chars (KNOWLEDGEBASE_MAX_CHARS). The legacy `chat.ts` path caps at 8,000 chars for knowledgebase but the system prompt itself at 12,000 chars (`skillRow.systemPrompt.substring(0, 12000)`). The unified path has no system-prompt cap, so a very long `skill.systemPrompt` is passed uncapped to the LLM.

### MEDIUM-3: Dynamic params leak into audio/video prompts
`audioExecutor.ts` appends all dynamicParams as bullets inside `extractUserPrompt`. The `contextBuilder.buildUserMessage()` already does this for text skills. For media executors, `extractUserPrompt()` does NOT append dynamicParams — it only reads `dp.text` explicitly for audio. But the `extractUserPrompt` helper itself gets the full messages array which was built by `buildChatContext` / `buildTeamContext`, which already contain the formatted params. This is correct for team_room but chat currently does NOT call `buildChatContext` before media dispatch (it goes straight to executor). So media executors in chat mode receive a bare user message without the form-param bullet list.

### MEDIUM-4: `userToken` extracted from `dynamicParams` — no validation or error
All three media executors extract `dp.userToken as string` and pass an empty string `""` if missing. `mediaGenerationService.generateImage()` uses `userToken` for provider authentication. An empty string may silently succeed against some providers or return a misleading 401. No error or warning is emitted if `userToken` is absent.

### MEDIUM-5: `buildTeamContext` passes `tenantId` instead of extracting from `request`
`contextBuilder.ts:126` takes `tenantId` as a second parameter but the caller in `unifiedOrchestrator.ts:210` passes `request.tenantId` — which is correct. However the parameter is redundant with `request.tenantId` already inside the function's scope via `request`. This is not a bug but a design inconsistency that could lead to a divergence if the function is refactored.

### MEDIUM-6: `as any` cast on `recordStepAttempt` call (orchestrator line 399)
The entire argument is cast `as any`. If `recordStepAttempt`'s type signature changes, the call site silently compiles with wrong shape.

## Low Issues

### LOW-1: `extractUserPrompt` is duplicated in all three media executor files
Identical 14-line function appears verbatim in `imageExecutor.ts`, `videoExecutor.ts`, and `audioExecutor.ts`. Should be a shared utility in a `mediaExecutorHelpers.ts` or in `contextBuilder.ts`.

### LOW-2: `unified_route` audit event reused for both routing and errors
The outer `catch` block in `executeUnified` logs an event with `eventType: "unified_route"`. This makes it impossible to distinguish a routing event from an unrecoverable orchestrator crash in the audit log. A separate `"unified_error"` event type should be used for the catch block.

### LOW-3: `skill_factory.create` and `orchestration.swarm` capability families have no executor
Both `CapabilityFamily` values are declared in `CAPABILITY_FAMILIES` and `classifyCapability` can return `orchestration.swarm`, but no executor handles them. The registry falls back to `TextSkillExecutor` silently. If a swarm skill is requested with the flag on, it executes as a text skill with no log or error.

### LOW-4: `temperature` field missing from `ExecutorInput`
Plan section 3.2 says executors forward `temperature` to `executeSkillLlmWithFallback`. `ExecutorInput` has `temperature?: number` and `textSkillExecutor.ts` passes it. But `unifiedOrchestrator.ts:327-340` builds `ExecutorInput` without setting `temperature` — the field is never populated from anywhere in the orchestrator (no source in `UnifiedExecutionRequest` or skill policy extraction).

### LOW-5: `getSkillById` vs `getSkillByIdAsync` — synchronous fallback may return stale data
`unifiedOrchestrator.ts:128` falls back to `getSkillById(FALLBACK_SKILL_SLUG)` (synchronous, cache-only). If the cache is cold or the fallback skill was recently updated, an outdated definition is used silently.

**Why:** getSkillById reads from module-level cache with 60s TTL. Low risk in practice but `getSkillByIdAsync` should be used for consistency.
