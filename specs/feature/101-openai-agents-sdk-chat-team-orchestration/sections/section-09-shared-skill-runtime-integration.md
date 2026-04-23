# Section 09: Shared Skill Runtime Integration

## Purpose

Move shared/internal skill execution onto the same OpenAI Agents runtime contract so dynamic skill selection, typed outputs, review/repair handling, and traceability are consistent across product surfaces and internal orchestration callers.

This section is about the shared `surface = skill` execution path, including Media Studio prompt/custom-skill execution, not about rewriting every skill implementation in one pass or moving the full media generation pipeline into Feature 101.

## Depends On

- `section-01-shared-contracts-flags`
- `section-02-persistence-migrations`
- `section-03-python-openai-agents-adapter`
- `section-04-node-runtime-client`
- `section-05-skill-capability-manifests`

## Blocks

- `section-10-ledger-ui-debug`
- `section-11-rollout-replay-release-gates`

## Files Owned By This Section

- `apps/web/server/services/skillExecutor.ts`
- `apps/web/server/services/callLLMStructured.ts`
- `apps/web/server/services/agentRuntime/skillRuntimeOrchestrator.ts`
- `apps/web/server/routers/skills.ts`
- `apps/web/client/src/pages/MediaStudio.tsx`
- `apps/web/client/src/lib/mediaStudioSelection.ts`
- `apps/web/client/src/lib/mediaStudioSkillMatching.ts`
- `apps/web/server/services/__tests__/skillRuntimeOpenAiAgents.test.ts`
- `apps/web/server/services/__tests__/callLLMStructuredOpenAiAgents.test.ts`
- `apps/web/server/services/__tests__/skillRuntimeOpenAiAgentsReplay.test.ts`

## Shadow And Active Modes

When shared skill shadow mode is enabled:

- current internal caller result remains the source of truth
- SDK runtime executes the same normalized request in parallel
- selected skill, explanation, schema validity, and side-effect suppression are persisted as comparison traces
- Media Studio prompt/custom-skill calls may execute in shadow through `surface = skill`, but actual media generation submissions remain on the existing path

When shared skill active mode is enabled:

- SDK runtime becomes the source of truth for eligible shared skill calls
- typed output must validate before it is returned to the caller
- failures return structured runtime errors rather than hidden fallback answers
- Media Studio prompt/custom-skill entry points become eligible only when their manifests explicitly allow `originSurface = media_studio`

## Shared Skill Runtime Rules

Shared skill runtime requests must preserve:

- original caller objective
- origin surface and entry point, including `media_studio`, `enhance_prompt`, and `execute_custom_skill` when applicable
- expected output schema or typed result contract
- allowed tools, connectors, and write scopes
- approval requirements
- Feature 099 context pack and trust labels
- retry and completion ceilings

Shared skill runtime responses must expose:

- selected skill and rejected alternatives
- final typed output or structured failure
- schema validation result
- tool calls and handoffs
- checkpoint metadata when paused
- trace id and version metadata

## Media Studio Scope Boundary

Feature 101 support for Media Studio is limited to the skill/prompt execution path.

In scope:

- `trpc.skills.enhancePrompt`
- `trpc.skills.executeCustomSkill`
- Media Studio prompt packaging and typed prompt-skill output validation when these calls route through shared skill runtime

Out of scope for this section and Feature 101 round one:

- `trpc.media.generateImageAsync`
- `trpc.media.generateVideoAsync`
- `trpc.media.generateAudio`
- downstream provider submission, render queues, polling, and artifact delivery

The Media Studio page may keep its existing UI-side compatibility filtering, but server-side runtime selection for eligible prompt-skill calls must be manifest-driven once Feature 101 is active.

## Safety And Recursion Rules

- Shared skill runtime may not recursively re-enter itself without explicit ceiling checks.
- Recursive skill-to-skill execution must record parent/child trace linkage.
- Mutating skills must keep the side-effect class and approval policy from the original caller envelope.
- Schema-invalid or incomplete skill output must fail closed before downstream persistence or side effects.
- Missing or incomplete manifests must block active shared-skill runtime selection.

## Structured Output Rules

- `callLLMStructured.ts` callers must receive validated structured output or structured failure, never silently degraded prose.
- Internal callers that require exact output schemas must pass those schemas into the runtime request envelope.
- Shared skill runtime traces must persist enough metadata to explain which schema/version was enforced.

## TDD Tests To Write First

Shadow tests:

- Test shared skill shadow mode preserves current caller-visible output.
- Test shadow trace captures selected skill, explanation, and schema-validation result.
- Test shadow mode suppresses mutating side effects.
- Test Media Studio `enhancePrompt` shadow call routes through `surface = skill` with `originSurface = media_studio`.

Active tests:

- Test active shared skill runtime returns typed output when schema validation passes.
- Test active shared skill runtime fails closed on schema-invalid output.
- Test active shared skill runtime uses Node-resolved model/gateway config.
- Test active shared skill runtime uses Feature 099 context pack before runtime invocation.
- Test Media Studio `executeCustomSkill` active call routes through the shared runtime and preserves caller-visible prompt contract.
- Test Media Studio prompt path keeps `maxPromptLength` or equivalent caller limit semantics intact when applicable.
- Test Media Studio real media generation APIs remain outside Feature 101 active routing in round one.

Recursion and safety tests:

- Test recursive skill-to-skill execution stops at configured ceiling.
- Test parent/child trace linkage is persisted for nested skill execution.
- Test mutating skill without required approval is rejected.
- Test missing manifest blocks active skill runtime selection.

Replay tests:

- Test shared skill replay detects selected skill drift.
- Test shared skill replay detects schema-validity drift.
- Test `callLLMStructured` replay confirms no silent prose fallback when typed output is required.

## Implementation Notes

- Reuse the generic runtime client; do not create a separate SDK import path for internal skill callers.
- Preserve existing `skillExecutor.ts` and `callLLMStructured.ts` caller APIs where possible.
- Keep shared skill runtime traces queryable through generic runtime trace services.

## Acceptance Criteria

- Shared/internal skill execution can run in shadow and active modes through the shared runtime.
- Media Studio prompt enhancement and custom-skill execution can run through the shared runtime without pulling in the real media generation pipeline.
- Typed shared skill output is validated before it is treated as success.
- Recursive runtime behavior is bounded and traceable.
- Missing manifests and schema-invalid outputs fail closed in active mode.
- Media Studio prompt/custom-skill paths preserve caller contract fields such as origin surface and prompt-shaping limits.
