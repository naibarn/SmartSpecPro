# Section 08: Responses Runtime Integration

## Purpose

Route Responses and structured-output request paths through the shared OpenAI Agents runtime so schema-required output, tool policy, approval pauses, and traceability use the same boundary as Chat and Team.

This section should preserve caller-facing Responses contracts while replacing fragmented orchestration under the hood.

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

- `apps/web/server/_core/responsesRoutes.ts`
- `apps/web/server/services/agentRuntime/responsesRuntimeOrchestrator.ts`
- `apps/web/server/services/__tests__/responsesOpenAiAgentsRuntime.test.ts`
- `apps/web/server/services/__tests__/responsesOpenAiAgentsRuntimeShadow.test.ts`
- `apps/web/server/services/__tests__/responsesOpenAiAgentsReplay.test.ts`

## Shadow And Active Modes

When Responses shadow mode is enabled:

- legacy Responses path remains the caller-visible source of truth
- SDK runtime executes with the same normalized request envelope
- schema validation, selected skill, model/provider/gateway route, tool usage, and final output diff are persisted as comparison traces
- shadow mode must not emit duplicate side effects

When Responses active mode is enabled:

- SDK runtime becomes the source of truth
- final output is accepted only after schema/policy verification succeeds
- structured runtime errors are returned without hidden legacy fallback

## Responses Contract Requirements

Responses runtime requests must preserve:

- caller objective or prompt intent
- required output schema or JSON-mode contract when present
- allowed tools and allowed skills
- approval requirements
- gateway model/provider resolution from Node
- Feature 099 context-pack input and trust labels

Responses runtime responses must expose:

- selected skill and selection explanation
- final output
- schema validation status
- tool calls and handoffs
- checkpoint metadata when paused
- terminal reason when failed or blocked
- trace id and version metadata

## Schema Enforcement Rules

- Schema-required responses may not silently degrade into free-form prose.
- Schema-invalid output must fail closed with structured runtime error metadata.
- If the caller requested a tool-free structured response, the runtime may not silently widen tool access.
- If a tool-enabled Responses request is blocked on approval, the pause must be persisted in `agent_runtime_checkpoints`.

## Replay And Rollback Rules

- Replay fixtures must compare legacy and SDK behavior for schema-valid, schema-invalid, approval-paused, and tool-enabled Responses requests.
- Force rollback must route new Responses work to legacy.
- A frozen Responses request must not switch runtime mid-flight after flags change.

## TDD Tests To Write First

Shadow tests:

- Test Responses shadow mode preserves caller-visible legacy output.
- Test shadow trace captures selected skill/model/gateway route and schema validation result.
- Test shadow mode suppresses side effects.

Active tests:

- Test Responses active mode returns SDK output when schema validation passes.
- Test Responses active mode returns structured runtime error when schema validation fails.
- Test Responses active mode still uses Node-resolved model/gateway config.
- Test Responses active mode uses Feature 099 context pack before runtime invocation.

Checkpoint tests:

- Test approval-required Responses request writes `agent_runtime_checkpoints`.
- Test resume references original checkpoint and creates linked attempt metadata.

Replay tests:

- Test Responses replay detects schema-validity drift.
- Test Responses replay detects selected skill or model/provider drift.
- Test old Responses records without runtime metadata still render safely in debug/admin consumption.

## Implementation Notes

- Keep Responses integration thin: reuse the generic runtime client rather than adding a surface-specific transport.
- Do not widen tool or skill permissions at this layer.
- Preserve existing structured caller APIs even when the runtime implementation changes.

## Acceptance Criteria

- Responses can run in shadow and active modes through the shared runtime.
- Schema-required Responses output is validated before it is treated as success.
- Approval pauses and resumes are durable and idempotent.
- Replay fixtures can detect drift in schema validity, selected skill, and model/provider route.
