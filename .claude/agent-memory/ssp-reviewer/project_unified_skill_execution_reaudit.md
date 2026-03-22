---
name: Unified Skill Execution — Re-audit after fixes (commit 4c20e1e7)
description: Re-audit verdict and finding status after HIGH/MEDIUM fixes were applied to the unified orchestrator pipeline
type: project
---

## Re-audit: Unified Skill Execution Pipeline (post-fix, 2026-03-21)

Verdict: **APPROVE_WITH_FIXES**

### Previous HIGH findings — resolution status

| ID | Finding | Status |
|----|---------|--------|
| HIGH-1 | `capabilitiesAllowed` never enforced | **RESOLVED** — gate added at step 2 of `executeUnified` (lines 212–223), `capability_not_allowed` added to `ERROR_REASONS` set |
| HIGH-2 | `retrieveForPrompt` receives `personaId` where `assistantId` expected | **RESOLVED** — `contextBuilder.ts:68` passes `personaId` as `assistantId` param with inline comment |
| HIGH-3 | `teamRunSkillExecutor` catch block resets `handledByUnified = false` | **RESOLVED** — catch now re-throws if `handledByUnified === true`, preventing double-execution |
| HIGH-4 | `as any` cast on `executionPolicy` in textSkillExecutor | **PARTIALLY RESOLVED** — cast still present in `textSkillExecutor.ts:50` but `ExecutorInput.executionPolicy` now typed `Record<string, unknown>`, reducing risk. Root type mismatch with `SkillExecutionPolicyResult` remains. |
| HIGH-5 | `temperature` never populated in `executeUnified` | **RESOLVED** — `temperatureHint` read from `parsedEP.temperature` at line 418–419 and set on `executorInput.temperature` at line 434; forwarded through `textSkillExecutor` to `executeSkillLlmWithFallback` |

### Previous MEDIUM findings — resolution status

| ID | Finding | Status |
|----|---------|--------|
| MEDIUM-1 | Error reasons missing `skill_resolution_failed`/`executor_not_found` in team room detection | **RESOLVED** — `teamRunSkillExecutor.ts:105–112` checks all four terminal reasons |
| MEDIUM-2 | No system-prompt cap on unified path | **RESOLVED** — `SYSTEM_PROMPT_MAX_CHARS = 12_000` applied to both chat (line 285–288) and team_room (lines 299–303) paths |
| MEDIUM-3 | `capabilitiesAllowed` not enforced (duplicate of HIGH-1) | **RESOLVED** |

### Previous LOW findings — resolution status

| ID | Finding | Status |
|----|---------|--------|
| LOW-1 | `extractUserPrompt` duplicated in all 3 media executor files | **RESOLVED** — moved to `mediaExecutorHelpers.ts`, all three executors import from there |
| LOW-2 | `parsedEP` JSON-parsed twice | **PARTIALLY RESOLVED** — `tryParseJson` is now a shared helper called from both `classifyCapability` (line 81) and step 10 (line 414), but the two call sites cannot share the same parsed instance because `classifyCapability` is called before step 10 |
| LOW-3 | Swarm/skill_factory capability families have no executor (silent fallback to text) | **OPEN** — console.warn added for swarm path but `skill_factory.create` still silently falls through to text executor with no warning |

### NEW findings introduced by fixes

| Severity | File:Line | Issue |
|----------|-----------|-------|
| MEDIUM | `auditLogger.ts:103–105` | `"unified_error"` is NOT in the `AuditEventType` union — only `"unified_route"` and `"unified_credit"` were added. All `unified_error` and `unified_route`-as-any casts use `as any` to bypass the type. Fix: add `"unified_error"` to the `AuditEventType` union |
| LOW | `teamRunSkillExecutor.ts:51–57` | `parseNextSpeakerHint` is still duplicated in the legacy path — the fix deduplicated it across the three media executors but did not consolidate with `textSkillExecutor.ts:16` or remove the copy in `teamRunSkillExecutor.ts`. Two independent copies with slightly different replace logic (`.trimEnd()` vs `.trim()` + regex replacement pattern). |
| LOW | `unifiedOrchestrator.ts:81` / `414` | `tryParseJson` called twice on `skill.executionPolicy` for the same `skill` object — once in `classifyCapability` and once in step 10. Not a correctness bug but needless double-parse on every execution path. |
