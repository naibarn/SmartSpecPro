# Section 04: Node Runtime Client And Projection Services

## Purpose

Build the Node-side bridge between Chat/Team services and the Python OpenAI Agents adapter. This section owns runtime request construction, internal transport, response validation, trace/checkpoint persistence, Team projection helpers, backpressure, and shadow side-effect suppression.

## Depends On

- `section-01-shared-contracts-flags`
- `section-02-persistence-migrations`
- `section-03-python-openai-agents-adapter`

## Blocks

- Chat integration
- Team integration
- Ledger/UI debug
- Rollout gates

## Files Owned By This Section

- `apps/web/server/services/agentRuntime/client.ts`
- `apps/web/server/services/agentRuntime/requestBuilder.ts`
- `apps/web/server/services/agentRuntime/traceService.ts`
- `apps/web/server/services/agentRuntime/checkpointService.ts`
- `apps/web/server/services/agentRuntime/teamProjection.ts`
- `apps/web/server/services/agentRuntime/backpressure.ts`
- `apps/web/server/services/agentRuntime/shadowPolicy.ts`
- `apps/web/server/services/__tests__/agentRuntimeClient.test.ts`
- `apps/web/server/services/__tests__/agentRuntimeRequestBuilder.test.ts`
- `apps/web/server/services/__tests__/agentRuntimeTraceService.test.ts`
- `apps/web/server/services/__tests__/agentRuntimeCheckpointService.test.ts`
- `apps/web/server/services/__tests__/agentRuntimeTeamProjection.test.ts`
- `apps/web/server/services/__tests__/agentRuntimeBackpressure.test.ts`
- Shared JSON fixtures under the repo's existing test fixture location or a new feature-scoped fixture directory.

## Internal Transport

Use the existing Node-to-Python internal service pattern in the repo. Do not create a frontend-accessible route to the adapter.

Logical operations:

- `run`
- `runStreamed`
- `resume`
- `cancel`
- `health`

`health` must expose adapter-supported contract/schema versions so Node can fail closed during mixed deploy windows.

Every request must include:

- platform request id
- tenant id
- surface
- runtime request payload
- signed execution envelope or envelope reference
- gateway attribution token using the same internal-auth style as existing Python skill/agency calls

Every response must be validated before persistence.

## Request Builder

The request builder creates `AgentRuntimeRequest` from platform state.

Responsibilities:

- resolve tenant/user/system actor
- resolve room/run/message ids
- resolve runtime selection snapshot
- resolve `originSurface` and `entryPoint` for `surface = skill`, including Media Studio prompt paths
- resolve active Chat persona snapshot and Team roster/member snapshots from existing product state
- resolve locked step owner/reviewer assignments from the persisted Team plan artifact
- attach `runtimeContractVersion`, `traceSchemaVersion`, and `checkpointSchemaVersion`
- resolve Node-owned model/provider/gateway route
- create or reference signed execution envelope
- call the Feature 099 shared context-pack builder and load context pack references
- normalize evidence items with trust labels
- request candidate skill manifests from the manifest service introduced in section 05 when available
- include allowed tools and allowed skills
- include budget, approval, retry, and completion policy
- include trace correlation ids

Evidence items must include:

- artifact id
- source type
- origin
- trust level
- sanitization level
- content reference
- token estimate
- context pack slot
- source ref
- retrieval recipe metadata when available

## Context Engine And Memory Boundary

The request builder is the bridge to Feature 099. It must not create a new memory system.

Rules:

- Build or load context packs through the shared context engine before invoking the Python adapter.
- Pass context pack refs, slot metadata, budget usage, trust/freshness annotations, source refs, and inclusion/exclusion explanations where safe.
- Pass resolved persona prompt/context segments and persona/member identity snapshots from the existing Chat/Team product layers; do not ask the Python adapter to re-resolve personas from storage.
- Never ask the Python adapter to query Chat memory, Team scoped memory, vector stores, or Work OS memory directly.
- Never allow the Python adapter to write durable memory directly.
- Return SDK outputs as candidate evidence/artifact refs.
- Delegate rolling summary, durable-memory promotion, pruning, dedupe, and tool-result clearing to the Feature 099 context lifecycle.
- If context pack construction fails in SDK active mode, fail closed with structured error unless the frozen runtime is legacy.

## Response Verification

Before persisting or executing side effects, Node must verify:

- response schema valid
- contract/schema versions compatible with the current Node runtime
- selected skill in allowed skill list
- selected tool in allowed tool list
- selected agent/handoff in allowed envelope
- tenant/run ids match request
- gateway/model metadata match the Node-resolved config or documented adapter normalization
- idempotency keys exist

If verification fails, persist a structured runtime error and do not fallback silently inside the SDK run.

## Trace Service

Trace service persists:

- generic `agent_runtime_traces`
- Team-facing `auto_team_trace_events` projection when surface is Team

Rules:

- redaction before persistence
- idempotent insert/update by stable event identity
- tenant/run/sequence uniqueness preserved
- no raw SDK trace payloads
- no secrets

## Checkpoint Service

Generic checkpoints:

- Chat/Responses/shared-skill non-work approval interruptions write `agent_runtime_checkpoints`
- resume references original checkpoint
- resume creates linked attempt metadata

Team work-backed checkpoints:

- use `work_approvals` and `work_automation_run_checkpoints` when work-backed
- do not create a parallel Team approval table

## Team Projection Service

Project runtime events into existing Team tables:

- `auto_team_execution_stages`
- `auto_team_review_records`
- `auto_team_final_results`
- `auto_team_trace_events`
- `team_room_messages.metadataJson`

Projection should be idempotent by run, step key, attempt id, and idempotency key.

Projection must also persist explicit step-link records into message metadata and Team-facing DTO inputs so the UI can link directly to plan-step, owner-result, reviewer-result, repair, checkpoint, and terminal anchors.

## Backpressure

Enforce:

- per-tenant concurrent SDK runtime limit
- per-room Team runtime limit
- per-user Chat runtime limit
- adapter request timeout
- stream idle timeout
- safe retry only for retryable transport failures with idempotency keys

Do not retry:

- denied tools
- invalid envelopes
- guardrail blocks
- schema-invalid adapter responses

## Shadow Side-Effect Suppression

In shadow mode:

- mutating tools disabled unless dry-run exists
- connector writes disabled
- media submissions disabled unless sandbox route configured
- approval decisions not consumed
- user-visible messages not changed
- suppressed side effect recorded as shadow trace event

## TDD Tests To Write First

Client tests:

- Test client sends required transport fields.
- Test client validates adapter response before persistence.
- Test frontend cannot call adapter directly.
- Test selected skill outside envelope is rejected.
- Test selected tool outside envelope is rejected.
- Test structured adapter error maps to platform runtime error.
- Test unsupported adapter contract version fails closed before persistence.

Context boundary tests:

- Test request builder calls shared context-pack builder.
- Test runtime request carries context pack ref and slot metadata.
- Test Chat runtime request carries `activePersonaId` and resolved persona snapshot when the conversation is persona-bound.
- Test Team runtime request carries room roster snapshots plus owner/reviewer step assignment ids from the locked plan.
- Test adapter payload does not contain direct memory-store credentials or query instructions.
- Test adapter payload does not require direct persona-table query instructions.
- Test SDK result is converted to candidate evidence refs, not direct memory writes.
- Test memory promotion/pruning lifecycle is delegated to context engine.
- Test context-pack failure does not trigger adapter-local memory fallback.
- Test Media Studio `surface = skill` request carries `originSurface = media_studio` and the correct `entryPoint`.

Fixture tests:

- Test shared fixtures parse in TypeScript.
- Test malformed envelope fixture rejected.
- Test pass verdict fixture persists correctly.
- Test needs-repair fixture persists correctly.
- Test checkpoint fixture persists correctly.
- Test duplicate stream fixture deduplicates.
- Test step-link fixture persists explicit link types instead of collapsing to plan-summary only.

Trace/checkpoint tests:

- Test trace metadata redacted.
- Test duplicate event not duplicated.
- Test Chat checkpoint writes generic checkpoint.
- Test Team work-backed checkpoint uses Work OS tables.

Backpressure tests:

- Test per-tenant limit.
- Test per-room Team limit.
- Test per-user Chat limit.
- Test retry only for safe transport failures.
- Test no retry for invalid request classes.

Shadow tests:

- Test mutating tool suppressed.
- Test connector write suppressed.
- Test media submit suppressed unless sandbox.
- Test shadow does not create user-visible message.

## Implementation Notes

- Keep the client generic. Surface-specific orchestration belongs in sections 06 through 09.
- All persistence must be idempotent.
- Prefer small services with clear tests over one large runtime service.
- Do not hardcode model ids.

Implemented shape:

- `apps/web/server/services/agentRuntime/client.ts` now owns the internal-only Node-to-Python runtime transport, health/version compatibility checks, structured adapter error mapping, and envelope-bound verification for selected skills, tools, and agents.
- `apps/web/server/services/agentRuntime/requestBuilder.ts` now bridges Feature 099 context packs into runtime requests, carries persona and Team roster snapshots, locks owner/reviewer assignments into the payload, sanitizes unsafe plan-context keys, and preserves Media Studio prompt execution metadata through `originSurface` and `entryPoint`.
- `apps/web/server/services/agentRuntime/traceService.ts` now redacts sensitive trace fields before persistence, deduplicates stable stream events, and projects Team-facing trace records only when the runtime surface is `team`.
- `apps/web/server/services/agentRuntime/checkpointService.ts` now routes Chat/Responses/shared runtime checkpoints to the generic checkpoint store while sending work-backed Team approvals through Work OS checkpoint persistence.
- `apps/web/server/services/agentRuntime/teamProjection.ts` now turns validated runtime responses into Team execution-stage, review-record, final-result, and message-metadata projections without collapsing explicit step links to plan-summary only.
- `apps/web/server/services/agentRuntime/backpressure.ts` now enforces per-tenant, per-Team-room, and per-Chat-user concurrency limits plus a strict retry policy that only allows idempotent transport retries.
- `apps/web/server/services/agentRuntime/shadowPolicy.ts` now centralizes shadow-mode side-effect suppression for mutating tools, connector writes, media submissions, approval consumption, and user-visible messages.
- Shared runtime contracts in `apps/web/shared/agentRuntime/types.ts` were aligned with the Python adapter output so Node validation accepts the same event, response, and checkpoint shapes emitted by section 03, including `eventName`, runtime `status`, artifacts, events, checkpoints, trace metadata, and strict tenant-envelope matching.

Test status:

- Implemented 46 targeted Vitest assertions covering transport validation, context-pack bridging, persona and Team assignment propagation, trace redaction, checkpoint routing, Team response projection, backpressure limits, retry policy, shadow suppression, and TypeScript fixture compatibility with the Python adapter contract.
- Verified with:
  - `npm test -- server/services/__tests__/agentRuntimeClient.test.ts server/services/__tests__/agentRuntimeRequestBuilder.test.ts server/services/__tests__/agentRuntimeTraceService.test.ts server/services/__tests__/agentRuntimeCheckpointService.test.ts server/services/__tests__/agentRuntimeTeamProjection.test.ts server/services/__tests__/agentRuntimeBackpressure.test.ts shared/__tests__/agentRuntimeTypes.test.ts`
- Full `npm run typecheck` for `apps/web` is currently blocked by many unrelated pre-existing TypeScript errors in already-dirty repo files outside this section's ownership, so the section gate for this round is the targeted runtime suite above.

## Acceptance Criteria

- Node can call the Python adapter safely.
- Runtime requests include gateway and permission envelope data.
- Runtime requests include contract/schema versions, persona/member identity snapshots, and origin-surface metadata where applicable.
- Surface responses are verified before side effects.
- Trace and checkpoint persistence exists.
- Shadow mode cannot create duplicate external side effects.
