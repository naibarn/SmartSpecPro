# Section 06: Chat Runtime Integration

## Purpose

Wire Chat to the shared OpenAI Agents runtime contract in shadow and active modes while preserving legacy behavior until flags enable the new runtime.

## Depends On

- `section-01-shared-contracts-flags`
- `section-02-persistence-migrations`
- `section-03-python-openai-agents-adapter`
- `section-04-node-runtime-client`
- `section-05-skill-capability-manifests`

## Blocks

- Rollout and replay gates

## Files Owned By This Section

- `apps/web/server/routers/chat.ts`
- `apps/web/server/services/chatService.ts`
- `apps/web/server/services/agentRuntime/chatRuntimeOrchestrator.ts`
- `apps/web/server/routers/__tests__/chatOpenAiAgentsRuntime.test.ts`
- `apps/web/server/routers/__tests__/chatOpenAiAgentsRuntimeShadow.test.ts`
- `apps/web/server/services/__tests__/chatOpenAiAgentsReplay.test.ts`
- Chat replay fixtures

Do not modify Team run progression in this section.

## Chat Shadow Mode

When master flag and Chat shadow flag are enabled:

- legacy Chat path remains user-visible source of truth
- SDK runtime receives equivalent objective/context envelope
- SDK runtime output is persisted as shadow trace/comparison data only
- mutating side effects are suppressed by section 04 shadow policy
- no user-visible messages change

Persist comparison fields:

- selected skill
- selected agent
- selected model/provider/gateway route
- runtime status
- verdict if applicable
- latency
- error code if failed
- side effect suppression decisions

## Chat Active Mode

When master flag and Chat active flag are enabled:

- SDK runtime becomes source of truth for eligible Chat skill/orchestration turns
- Node still persists Chat messages
- Node still uses existing model/gateway route resolution
- Node must preserve the existing active conversation persona and pass a resolved persona snapshot from the current Chat/context-engine path when one exists
- approval interruptions write generic runtime checkpoints
- runtime errors are structured and visible
- no hidden fallback inside the SDK-active turn

Force rollback:

- applies to new Chat turns
- does not rewrite already persisted SDK trace data
- returns Chat to legacy runtime for new work

## Eligibility

Not every Chat request must be SDK-driven on day one.

The orchestrator should classify eligibility using:

- feature flags
- surface support in manifests
- allowed skill/tool envelope
- user/tenant permissions
- request type
- side-effect risk

Ineligible requests use legacy behavior and may optionally record a diagnostic trace when shadow is enabled.

## Chat Persona Continuity

Feature 101 must preserve the current Chat persona behavior that already exists outside the new SDK runtime.

Rules:

- When a conversation has `activePersonaId`, the runtime request must carry that id and the resolved persona snapshot used to build prompt/context segments.
- Persona prompt segments, tone, restrictions, nickname, and persona-scoped memory must continue to come from the existing Chat/context-engine path rather than an adapter-local persona system.
- The SDK adapter may not silently choose a different persona for an active Chat turn.
- Chat trace/debug output must be able to show which persona was active for the turn and the provenance of that persona selection.
- Conversations without personas must remain null-safe and continue to work without synthetic placeholder personas.

## Checkpoints

For approval-required Chat interruptions:

- write `agent_runtime_checkpoints`
- persist resume cursor
- link checkpoint to message/run context when available
- resume into a new linked attempt

## TDD Tests To Write First

Shadow tests:

- Test Chat shadow path runs SDK runtime but visible output remains legacy.
- Test shadow trace includes selected skill/model/gateway route.
- Test shadow suppresses mutating side effects.
- Test shadow failure does not fail the visible legacy Chat turn.

Active tests:

- Test Chat active uses SDK output for eligible turn.
- Test Chat active persists user-visible message from SDK response.
- Test Chat active uses Node-resolved model/gateway config.
- Test Chat active assembles context through the Feature 099 shared context engine before SDK runtime call.
- Test Chat memory mode controls are passed to context-pack builder and are not reimplemented in the SDK adapter.
- Test Chat active request carries `activePersonaId` and resolved persona snapshot when the conversation has a persona.
- Test Chat active trace/debug metadata exposes the acting persona without leaking raw prompt internals.
- Test Chat active does not allow the adapter to substitute a different persona than the one resolved by Node.
- Test direct hardcoded model id is not introduced.
- Test structured runtime error is surfaced without hidden legacy fallback.
- Test force rollback routes new turn to legacy.

Checkpoint tests:

- Test approval interruption writes generic checkpoint.
- Test resume references original checkpoint.
- Test checkpoint metadata is linked to Chat message where available.

Replay tests:

- Test representative Chat fixture preserves expected selected model/provider class.
- Test skill-selection drift appears in trace comparison.
- Test old Chat records without runtime metadata render safely.

## Implementation Notes

- Keep existing Chat behavior default.
- Prefer small adapter around current `executeSkill`/orchestration path.
- Do not remove current fallback logic for legacy mode.
- Do not allow active SDK runtime to silently call legacy on a failed SDK step.
- Do not hardcode `openai/gpt-4.1-mini` or any future model id. Use existing model routing.
- Do not recreate persona resolution logic inside the SDK adapter.

## Acceptance Criteria

- Chat shadow mode records SDK comparison without user-visible changes.
- Chat active mode can use SDK runtime behind flags.
- Chat active mode preserves current conversation persona behavior and traceability.
- Chat approval interruptions have generic checkpoints.
- Rollback affects new Chat turns.
- Existing Chat tests continue to pass when flags disabled.
