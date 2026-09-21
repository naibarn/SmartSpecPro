# Vertical Drama Warning-Only Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Vertical Drama episode generation warning-only for story policy findings, reduce risky story wording before the LLM call, preserve a safe fallback path, and emit file-based diagnostics without allowing diagnostic failures to fail generation.

**Architecture:** Keep the existing story safety detector as the source of findings, add a small pure rewrite/diagnostic layer next to it, and wire that layer into the script generation boundary. The script stage will attach warnings instead of throwing for policy findings; existing credit, schema, transport, and authentication errors remain hard failures. Media-facing story fields will use the same field-local rewrite helper so a warning does not become a later self-inflicted media gate.

**Tech Stack:** TypeScript, Vitest, existing vertical-drama server services, Node `fs/promises`, JSONL diagnostics.

**Spec:** `docs/portable-skill-pack/specs/2026-09-21-vertical-drama-warning-only-generation-design.md`

## Global Constraints

- Preserve unrelated dirty and staged worktree changes.
- Do not change retired Agency, legacy workflow, OpenSandbox, or `work/*` systems.
- Do not run `npm run typecheck` because repository instructions prohibit it unless explicitly requested.
- Do not log full prompts, provider responses, API keys, bearer tokens, or user secrets.
- Keep generic detector/assertion behavior unchanged outside the scoped Vertical Drama episode-generation path.
- A debug-file failure must never change generation success/failure.

## Review Focus

- High-risk authored source must alter the provider-facing prompt without changing unrelated prompt metadata; test in Task 1.
- High-risk LLM output must produce a successful script with warnings rather than the current `VdStorySafetyError`; test in Task 2.
- A detector finding in a nested story field must be rewritten field-locally and not rewrite safety instructions or metadata; test in Task 1.
- A read-only or unwritable debug path must not fail a successful generation; test in Task 3.
- Existing schema, credit, and provider failures must still be surfaced as failures; test in Task 2.

### Task 1: Add pure story rewrite and diagnostic contracts

**Files:**
- Modify: `apps/web/server/services/verticalDramaStorySafety.ts`
- Test: `apps/web/server/services/__tests__/verticalDramaStorySafety.test.ts`

**Interfaces:**
- Produce `buildVerticalDramaStorySafetyRewriteInstruction(input: unknown): string | null`.
- Produce `rewriteVerticalDramaStoryForSafeMedia(input: unknown): { value: unknown; changed: boolean; findings: ReturnType<typeof analyzeVerticalDramaStorySafety> }`.
- Produce a redacted diagnostic projection containing level, codes, field paths, text length, and stable text hash without full story content.

- [ ] **Step 1: Write the failing tests**

  Add tests proving that a high-risk story source returns a non-null provider-facing rewrite instruction, that rewrite changes only story-bearing text, and that safety metadata fields such as `policy_safety_contract` are not rewritten.

- [ ] **Step 2: Run the focused tests and verify the expected failure**

  Run `npm --workspace apps/web test -- server/services/__tests__/verticalDramaStorySafety.test.ts`.
  Expected result: the new exports are missing or the new assertions fail before implementation.

- [ ] **Step 3: Implement the smallest pure helpers**

  Add bounded, deterministic text replacements for the detector’s high-risk phrases and preserve all non-string values. Build the rewrite instruction from detector findings and keep the existing generic detector/assertion exports unchanged.

- [ ] **Step 4: Run the focused tests and verify they pass**

  Run the same focused command and confirm all existing safety tests plus the new tests pass.

### Task 2: Make script generation warning-only and add pre-LLM rewrite

**Files:**
- Modify: `apps/web/server/services/verticalDramaScriptGeneration.ts`
- Modify: `apps/web/server/services/verticalDramaEpisodePipeline.ts`
- Modify: `apps/web/server/services/verticalDramaStoryJobs.ts`
- Test: `apps/web/server/services/__tests__/verticalDramaScriptGeneration.repairContext.test.ts` or a new focused script-generation regression test beside the existing generator tests

**Interfaces:**
- Consume Task 1’s rewrite instruction and safe-media rewrite result.
- Preserve `generateEpisodeScript()`’s existing return shape and all non-policy exception classes.
- Add a serializable `policy_safety_warnings` diagnostic field to the generated script/pipeline artifact without replacing existing `warnings` contract fields.

- [ ] **Step 1: Write the failing regression tests**

  Add a generation test with a mocked successful JSON planning response containing a high-risk story field. Assert that `generateEpisodeScript()` resolves, returns the candidate, and exposes a policy warning; assert that the captured pre-LLM prompt contains the rewrite instruction when the source is high-risk. Add a second test proving a schema/credit failure still rejects.

- [ ] **Step 2: Run the focused tests and verify the expected failure**

  Run the new test file with `npm --workspace apps/web test -- <test-file>`.
  Expected result: the high-risk case currently rejects with `VD_STORY_POLICY_RISK` and the prompt lacks the new rewrite instruction.

- [ ] **Step 3: Implement the minimal generation change**

  Analyze the story source before constructing the prompt, append the rewrite instruction only when needed, analyze the validated output, and replace the policy throw with warning metadata plus a safe-media rewrite result. Keep `VdStorySafetyError` exported for compatibility with existing repair code, but stop constructing it for the normal script-generation path. Update pipeline/job user messaging so a policy finding is represented as a warning/success path rather than a failed-job message.

- [ ] **Step 4: Run the focused generator and pipeline tests**

  Run the new regression test plus the existing focused vertical-drama generator test set. Confirm high-risk policy findings no longer reach `mapScriptGenerationError()` while schema and credit failures still do.

### Task 3: Add non-blocking JSONL safety diagnostics

**Files:**
- Create: `apps/web/server/services/verticalDramaSafetyDebugLog.ts`
- Test: `apps/web/server/services/__tests__/verticalDramaSafetyDebugLog.test.ts`
- Modify: `apps/web/server/services/verticalDramaScriptGeneration.ts`

**Interfaces:**
- Produce `writeVerticalDramaSafetyDebugEvent(event: VerticalDramaSafetyDebugEvent): Promise<void>`.
- Read `VERTICAL_DRAMA_SAFETY_DEBUG_LOG_PATH`, otherwise use `logs/vertical-drama-safety-debug.jsonl` relative to the process working directory.
- Resolve successfully even when directory creation or append fails; report the failure through the existing server logger only.

- [ ] **Step 1: Write the failing logger tests**

  Test that a diagnostic event appends one JSON object per line with identifiers, stage, source/output levels, codes, paths, hashes, and lengths. Test that an injected append failure resolves without throwing and does not expose full story text or token-like values.

- [ ] **Step 2: Run the logger tests and verify the expected failure**

  Run `npm --workspace apps/web test -- server/services/__tests__/verticalDramaSafetyDebugLog.test.ts`.
  Expected result: the module/export is missing or the append/redaction assertions fail.

- [ ] **Step 3: Implement the logger and wire it best-effort**

  Use `mkdir(..., { recursive: true })` and `appendFile(..., { flag: "a" })`; serialize one JSON object followed by `\n`. Hash text with the existing Node crypto facility, truncate any diagnostic excerpt, and call the writer with `void ...catch(...)` from script generation so the generation promise is not coupled to filesystem health.

- [ ] **Step 4: Run logger and generator tests together**

  Run the logger test, the generator regression test, and the existing focused vertical-drama test list. Confirm no unhandled rejection is emitted when the debug writer fails.

### Task 4: Review downstream media gates and close the regression loop

**Files:**
- Modify only the smallest necessary Vertical Drama media-stage file if a policy-only throw still receives the script-stage warning.
- Test: the existing affected media/pipeline test file plus the new regression test from Task 2.

- [ ] **Step 1: Search the episode flow for remaining policy-only hard gates**

  Run `rg -n "isBlockingVerticalDramaStorySafety|assertVerticalDramaStorySafety|VD_STORY_POLICY_RISK" apps/web/server/services/verticalDrama*.ts` and trace only callers reachable from `plan_episode_script`.

- [ ] **Step 2: Add a failing test for any reachable policy-only gate**

  Reproduce the warning-bearing script entering the reachable stage and assert that a policy finding is retained as a warning rather than mapped to a failed run.

- [ ] **Step 3: Make the smallest scoped downstream change**

  Apply the Task 1 safe-media rewrite before the reachable media call or convert only that policy-only rejection to a warning. Leave provider refusal, schema, credit, and transport errors unchanged.

- [ ] **Step 4: Run the focused suite and static hygiene checks**

  Run the complete existing focused vertical-drama test list, `git diff --check`, and inspect `git diff --stat` plus owned hunks. Do not run the repository typecheck.

### Task 5: Final verification and handoff

- [ ] **Step 1: Run the focused proof set**

  Run all tests added or modified in Tasks 1–4 plus the previously passing 12-file/126-test vertical-drama focused set.

- [ ] **Step 2: Run the existing web build**

  Run `npm --workspace apps/web run build:unsafe` and record warnings separately from failures.

- [ ] **Step 3: Verify scope and worktree safety**

  Confirm only owned files are staged for any eventual commit; do not stage or reset unrelated dirty/staged files. Record current `HEAD`, upstream parity, test results, and the remaining external-provider proof boundary.
