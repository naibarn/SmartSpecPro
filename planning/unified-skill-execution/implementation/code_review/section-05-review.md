# Section 05 — Text Skill Executor: Review Report

**Date:** 2026-03-21
**Diff:** `planning/unified-skill-execution/implementation/code_review/section-05-diff.md`
**Spec:** `planning/unified-skill-execution/sections/section-05-text-skill-executor.md`

---

## Review Report

### Verdict: APPROVE_WITH_FIXES

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `textSkillExecutor.ts:50` | `policy as any` cast discards type safety on `executionPolicy`. `ExecutorInput.executionPolicy` is typed as `Record<string, unknown>`, but `executeSkillLlmWithFallback` requires `SkillExecutionPolicyResult`. The cast silently allows a structurally incompatible object to pass — if a caller constructs `ExecutorInput` with a thin stub (e.g., `{ modelId: "x", allowFreeModels: false }` missing `modelSource`), `buildCandidateList` will read `policy.modelId` safely but `policy.allowFreeModels` is the only field actually used at runtime; however the `as any` permanently suppresses future type errors as `SkillExecutionPolicyResult` evolves. | Change `ExecutorInput.executionPolicy` in `types.ts` from `Record<string, unknown>` to `SkillExecutionPolicyResult` (import it from `skillExecutionPolicy.ts`). Remove the `as any` cast entirely. |
| HIGH | `textSkillExecutor.ts:22` | `content.replace(match[0], "").trimEnd()` only trims trailing whitespace. If the `[NEXT: ...]` tag appears in the middle of the content (e.g., `"intro [NEXT: agent] body text"`), the result is `"intro  body text"` with a mid-string double-space and no trimming of leading whitespace before the tag. There is no test for a mid-content tag placement. | Use `content.replace(match[0], "").trim()` or a targeted replace that collapses adjacent whitespace around the removed tag. Add a test: `parseNextSpeakerHint("intro [NEXT: agent] body")` should produce `cleaned: "intro body"`. |
| MEDIUM | `textSkillExecutor.ts:48–53` | `maxTokens` and `temperature` fields defined on `SkillLlmRequest` are not forwarded. If a skill's execution policy or planner sets these (both are optional on `SkillLlmRequest`), they are silently dropped. The `ExecutorInput` interface does not carry them either, so there is no path to set them through the unified executor. | Add `maxTokens?: number` and `temperature?: number` to `ExecutorInput`, then forward them in the `executeSkillLlmWithFallback` call. |
| MEDIUM | `textSkillExecutor.ts:16` | `parseNextSpeakerHint` is now duplicated: an identical private function already exists in `teamRunSkillExecutor.ts:48`. The spec explicitly notes this duplication and calls for the function to be "duplicated or extracted." Leaving two implementations with identical regex increases the risk of them diverging when the hint format changes (e.g., adding a turn-count parameter). | Extract `parseNextSpeakerHint` to a shared utility file (e.g., `apps/web/server/services/executors/speakerHintParser.ts`) and import it in both `textSkillExecutor.ts` and `teamRunSkillExecutor.ts`. The function is already `export`-ed from `textSkillExecutor.ts`, but `teamRunSkillExecutor.ts` does not import it — both remain independent. |
| MEDIUM | `textSkillExecutor.ts:57–64` | In the failure path, `inputTokens` and `outputTokens` default to `0` when `llmResult.inputTokens` / `outputTokens` are undefined. This is correct for a hard pre-request failure, but if the LLM returned a partial response before failing (partial tokens billed), returning `0` will cause credit reconciliation to under-report usage. The success path handles this identically with the same `?? 0` pattern. | No behavior change needed now, but add a comment: `// Note: partial token reporting on failure is not supported by SkillLlmResult — tokens may be 0 even if partial billing occurred.` This surfaces the gap for the credit service. |
| LOW | `textSkillExecutor.ts:32–37` | `canHandle()` performs an explicit two-branch OR check, while `capabilities` (the `readonly CapabilityFamily[]`) already encodes the same set. The two are logically redundant and can drift: if a future capability is added to `HANDLED_CAPABILITIES` but `canHandle()` is not updated, the executor will be registered as supporting it but will silently return `false` from `canHandle()`. | Implement `canHandle` as `return (this.capabilities as readonly string[]).includes(route.capability)` to guarantee they stay in sync. |
| LOW | `textSkillExecutor.ts:84–88` | Self-registration at module level means the `TextSkillExecutor` instance is a singleton created at import time. Tests correctly mock `registerExecutor` to suppress side effects, but if the module is imported before the mock is set up (e.g., in a non-Vitest context or with a different import order), the singleton registers itself globally and is never garbage-collected. | No change required; the test-file mock pattern (`vi.mock` hoisting) prevents this in tests. Document the import-order dependency in a comment above the self-registration block. |
| LOW | Test:262 | `result.content` is asserted to be `undefined` on failure. `ExecutorResult.content` is `content?: string` (optional), so this assertion is correct. However, it does not assert that `result.inputTokens` and `result.outputTokens` are `0` (the default fill-in). The failure path code explicitly sets them to `llmResult.inputTokens ?? 0`, so this is testable behavior that is currently uncovered. | Add `expect(result.inputTokens).toBe(0); expect(result.outputTokens).toBe(0);` to the failure gracefully test. |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| `CapabilityExecutor` interface fully implemented (`id`, `capabilities`, `canHandle`, `execute`) | PASS | All four members present and correctly typed. |
| `canHandle` returns `true` for both `"writing.article"` and `"writing.review"` | PASS | Verified against `HANDLED_CAPABILITIES` and the explicit OR check. |
| `execute` returns `ExecutorResult` (not throws) on LLM failure | PASS | `success: false` path returns correctly; no `throw`. |
| `dynamicModelOverride` takes priority over `executionPolicy.modelId` | PASS | Spread merge is correct: `{ ...policy, modelId: input.dynamicModelOverride }`. |
| `enableThinking`, `extraBodyParams`, `stream` forwarded to `executeSkillLlmWithFallback` | PASS | All three forwarded. |
| `nextSpeakerHint` stripped from content before returning | PASS | `parseNextSpeakerHint` called on raw content; `cleaned` used as `content`. |
| Self-registration via `registerExecutor` at module level | PASS | Pattern matches spec §Self-Registration exactly. |
| Test file mocks `executorRegistry` to prevent side effects | PASS | `vi.mock("../executors/executorRegistry", ...)` is the correct guard. |
| All 14 TDD test cases from spec are present | PASS | Every case in the spec's TDD block has a corresponding test. |
| `parseNextSpeakerHint` exported for independent testing | PASS | `export function` — tested directly in `describe("parseNextSpeakerHint")`. |
| `executionPolicy` type passed to `executeSkillLlmWithFallback` is structurally sound | FAIL | `as any` cast on line 50 suppresses the `Record<string, unknown>` vs `SkillExecutionPolicyResult` mismatch. |
| `maxTokens` / `temperature` forwarded | FAIL | These `SkillLlmRequest` fields are not on `ExecutorInput` and are not forwarded. |

---

### Summary

The core implementation is clean, compact, and correctly follows the spec's execution flow: model override merge, LLM delegation, failure short-circuit, and next-speaker hint stripping all work as specified. The self-registration pattern is correct and the test suite is complete against the plan's TDD requirements.

Two fixes are required before merge. The `as any` cast on `executionPolicy` (line 50) is a type safety hole that will suppress future errors as `SkillExecutionPolicyResult` evolves — the root cause is that `ExecutorInput.executionPolicy` is typed too broadly as `Record<string, unknown>` in `types.ts` and should be narrowed to the actual type. The `maxTokens` and `temperature` fields from `SkillLlmRequest` are not reachable through `ExecutorInput`, silently dropping any per-skill token/temperature tuning that callers may rely on. Both are straightforward to fix without changing the execution logic.
