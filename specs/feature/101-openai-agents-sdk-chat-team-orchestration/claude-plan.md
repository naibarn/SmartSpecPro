# Implementation Plan: Feature 101 OpenAI Agents SDK Chat And Team Orchestration

Date: 2026-04-20
Status: Reviewed and ready for implementation
Companion execution runbook: `implementation/execution-waves.md`

## 1. What We Are Building

This feature introduces OpenAI Agents SDK as the primary orchestration runtime for SmartSpecPro Chat, Team, Responses, shared skill runtime, and Media Studio prompt-skill execution, while keeping all product-critical controls inside the existing platform:

- Node remains the authority for tenant permissions, room/run state, model/provider routing, gateway billing, feature flags, and durable persistence.
- Python owns one isolated OpenAI Agents SDK adapter that converts platform DTOs into SDK agents/tools/handoffs/runs and converts SDK output back into platform DTOs.
- Chat, Team, Responses, shared skill runtime, and Media Studio prompt/custom-skill calls all use the same runtime contract where eligible.
- Team remains plan-driven: the SDK can execute, review, and repair individual steps, but it cannot silently replace the locked plan or advance steps by free-form prose.
- All SDK-driven LLM calls still go through the SmartSpecPro OpenAI-compatible gateway.
- Feature 101 includes Media Studio only for the skill/prompt execution path and explicitly excludes the actual media generation pipeline in round one.
- Legacy orchestration remains available only as a controlled run-level rollout/rollback path.

Active rollout scope in this feature includes Chat, Team, Responses, and shared skill runtime. These surfaces still roll out independently through separate flags, replay fixtures, and frozen runtime decisions. Media Studio prompt/custom-skill calls roll out inside the shared-skill surface rather than as a separate generation surface.

The goal is not "put an SDK import somewhere." The goal is to make Chat, Team, Responses, and shared skill execution more reliable, more inspectable, and easier to debug by using a real agent runtime behind a stable platform boundary.

## 2. Architectural Shape

### 2.1 High-Level Flow

The runtime flow should look like this:

1. Chat or Team asks Node to run a turn/step.
2. Node resolves tenant flags, room/run state, allowed skills/tools, model/provider/gateway route, budget, and permission envelope.
3. Node freezes the runtime choice on the run or turn.
4. Node sends a signed/bounded `AgentRuntimeRequest` to the Python adapter.
5. Python adapter constructs SDK agents/tools/handoffs/guardrails using only the envelope and manifests it received.
6. Python adapter constructs SDK model clients against the SmartSpecPro gateway.
7. SDK runs the agent workflow.
8. Python adapter normalizes result, stream events, interruptions, handoffs, trace spans, selected skill, and verdict data into platform DTOs.
9. Node persists visible messages, runtime trace rows, Team stage rows, review rows, checkpoints, and current run state.
10. UI/debug/admin consumers read existing endpoints plus richer runtime metadata.

### 2.2 Ownership Boundaries

Node owns:

- feature flag precedence
- runtime choice freezing
- model/provider/gateway policy
- tenant/user/room/run authorization
- allowed tool/skill envelopes
- connector grants
- budget ceilings and credit attribution
- Team plan lock and serial step advancement
- durable persistence
- UI-facing DTOs
- rollout and rollback

Python adapter owns:

- SDK imports
- SDK dependency version reporting
- SDK agent/tool/handoff/guardrail construction
- SDK run/stream invocation
- SDK event/result/interruption normalization
- SDK trace processor setup
- gateway-routed SDK model client creation

The SDK owns:

- agent loop mechanics
- tool invocation inside the allowed envelope
- handoff mechanics
- guardrail evaluation
- streamed SDK event production
- raw SDK run state

The SDK must not own:

- direct provider credentials
- final billing authority
- unbounded tool access
- plan advancement
- durable business truth
- tenant isolation decisions
- context retrieval, memory promotion, memory pruning, or direct memory writes

## 3. Implementation Phases

The work should be delivered in phases to keep blast radius small and to allow shadow validation before active rollout.

### Phase 1: Contracts, Flags, Import Boundary, and Schema

Purpose: create safe surfaces before any runtime is activated.

Deliverables:

- shared runtime DTO definitions
- tenant feature flags
- runtime selection helper
- schema migrations for runtime metadata, trace archive, and generic checkpoints
- import guard tests
- baseline redaction utilities
- no SDK active traffic yet

Primary files:

- `apps/web/shared/featureFlags.ts`
- `apps/web/shared/agentRuntime/types.ts`
- `apps/web/server/services/agentRuntime/runtimeSelection.ts`
- `apps/web/server/services/agentRuntime/redaction.ts`
- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/migrations/*`
- `apps/web/drizzle/__tests__/agentRuntimeSchema.test.ts`
- `apps/web/shared/__tests__/openAiAgentsRuntimeFeatureFlags.test.ts`
- `python-backend/tests/unit/test_openai_agents_import_boundary.py`

### Phase 2: Python SDK Adapter Behind Gateway

Purpose: introduce the SDK in one isolated Python boundary.

Deliverables:

- `openai_agents_adapter.py`
- Pydantic request/response DTOs
- gateway-only model client construction
- SDK version and adapter version reporting
- tool/handoff/guardrail normalization
- sensitive tracing disabled by default
- custom redacted trace event export
- stream/cancel/resume event normalization
- adapter contract tests

Primary files:

- `python-backend/app/services/openai_agents_adapter.py`
- `python-backend/app/services/openai_agents_contracts.py`
- `python-backend/app/services/openai_agents_trace.py`
- `python-backend/app/services/openai_agents_gateway_model.py`
- `python-backend/tests/unit/test_openai_agents_adapter.py`
- `python-backend/tests/unit/test_openai_agents_gateway_model.py`
- `python-backend/tests/unit/test_openai_agents_trace_redaction.py`
- `python-backend/tests/unit/test_openai_agents_stream_resume.py`

### Phase 3: Node Runtime Client and Persistence Projection

Purpose: connect Node to Python and persist normalized runtime outputs without changing caller-visible behavior yet.

Deliverables:

- Node `agentRuntimeClient`
- request builder from platform state
- Feature 099 context-pack handoff into runtime requests
- runtime trace persistence service
- checkpoint persistence service
- Team projection into existing Auto-Team tables
- old-run compatibility paths
- shadow-mode persistence only

Primary files:

- `apps/web/server/services/agentRuntime/client.ts`
- `apps/web/server/services/agentRuntime/requestBuilder.ts`
- `apps/web/server/services/agentRuntime/traceService.ts`
- `apps/web/server/services/agentRuntime/checkpointService.ts`
- `apps/web/server/services/agentRuntime/teamProjection.ts`
- `apps/web/server/services/__tests__/agentRuntimeClient.test.ts`
- `apps/web/server/services/__tests__/agentRuntimeTraceService.test.ts`
- `apps/web/server/services/__tests__/agentRuntimeCheckpointService.test.ts`
- `apps/web/server/services/__tests__/agentRuntimeTeamProjection.test.ts`

### Phase 4: Skill Capability Manifests

Purpose: make skill selection evidence-driven rather than prompt-hint-driven.

Deliverables:

- manifest schema
- manifest registry/loader
- validation tests for runnable skills
- selection explanation contract
- manifest ownership metadata
- manifest support for origin surfaces and entry points
- initial manifests for the skills most relevant to Chat, Team, Responses, and shared runtime automation
- initial manifests for Media Studio prompt enhancement and custom skill execution
- negative constraints and failure modes for media/research/writing/review skills

Primary files:

- `apps/web/shared/agentRuntime/skillManifest.ts`
- `apps/web/server/services/skillCapabilityManifestService.ts`
- skill metadata files or registry entries in the existing skill registry area
- `apps/web/server/services/__tests__/skillCapabilityManifestService.test.ts`
- `apps/web/shared/__tests__/skillCapabilityManifest.test.ts`

### Phase 5: Chat Shadow and Active Integration

Purpose: route Chat through the shared runtime contract while preserving existing Chat behavior until active flags are enabled.

Deliverables:

- Chat shadow runtime path
- Chat active runtime path
- generic checkpoint integration for Chat approval interruptions
- Chat trace/debug output
- replay fixtures comparing legacy and SDK choices
- rollback behavior for new Chat turns

Primary files:

- `apps/web/server/routers/chat.ts`
- `apps/web/server/services/chatService.ts`
- `apps/web/server/services/agentRuntime/chatRuntimeOrchestrator.ts`
- `apps/web/server/routers/__tests__/chatOpenAiAgentsRuntime.test.ts`
- `apps/web/server/routers/__tests__/chatOpenAiAgentsRuntimeShadow.test.ts`
- `apps/web/server/services/__tests__/chatOpenAiAgentsReplay.test.ts`

### Phase 6: Team Shadow and Active Integration

Purpose: make Team run every mandatory plan step through structured execution/review/repair while remaining auditable.

Deliverables:

- Team runtime request builder for plan steps
- plan-before-execution invariant enforcement
- step owner execution via SDK runtime
- reviewer verdict via SDK runtime
- repair loop persistence
- serial step gate enforcement
- Team trace projection to existing ledger tables
- Team incomplete terminal reason taxonomy
- attempt budget calculation that guarantees at least one attempt per mandatory step
- replay fixtures for known failing rooms and step-loop cases

Primary files:

- `apps/web/server/services/runEngine.ts`
- `apps/web/server/services/teamRunSkillExecutor.ts`
- `apps/web/server/services/agentRuntime/teamRuntimeOrchestrator.ts`
- `apps/web/server/services/agentRuntime/teamPlanRuntime.ts`
- `apps/web/server/services/agentRuntime/teamStepRuntime.ts`
- `apps/web/server/services/agentRuntime/teamReviewRuntime.ts`
- `apps/web/server/services/__tests__/teamOpenAiAgentsRuntime.test.ts`
- `apps/web/server/services/__tests__/teamOpenAiAgentsPlanGate.test.ts`
- `apps/web/server/services/__tests__/teamOpenAiAgentsStepProgression.test.ts`
- `apps/web/server/services/__tests__/teamOpenAiAgentsRepairLoop.test.ts`
- `apps/web/server/services/__tests__/teamOpenAiAgentsReplay.test.ts`

### Phase 7: Responses Shadow and Active Integration

Purpose: route Responses and structured-output entry points through the shared runtime contract while preserving caller-visible schema semantics until active flags are enabled.

Deliverables:

- Responses shadow runtime path
- Responses active runtime path
- schema-enforced final output validation
- generic checkpoint integration for non-work approval interruptions
- Responses replay fixtures comparing legacy and SDK output/validation
- rollback behavior for new Responses requests

Primary files:

- `apps/web/server/_core/responsesRoutes.ts`
- `apps/web/server/services/agentRuntime/responsesRuntimeOrchestrator.ts`
- `apps/web/server/routers/__tests__/responsesOpenAiAgentsRuntime.test.ts`
- `apps/web/server/routers/__tests__/responsesOpenAiAgentsRuntimeShadow.test.ts`
- `apps/web/server/services/__tests__/responsesOpenAiAgentsReplay.test.ts`

### Phase 8: Shared Skill Runtime Shadow and Active Integration

Purpose: move shared/internal skill execution onto the same runtime contract so dynamic skill selection, review, and schema enforcement use the same adapter boundary as Chat, Team, Responses, and Media Studio prompt/custom-skill execution.

Deliverables:

- shared skill runtime shadow path
- shared skill runtime active path
- schema-enforced typed output validation
- recursive runtime ceiling enforcement
- runtime traces for internal skill execution
- replay fixtures for common shared skill callers
- Media Studio `enhancePrompt` and `executeCustomSkill` integration through `surface = skill`
- explicit exclusion of `generateImageAsync`, `generateVideoAsync`, and `generateAudio` from Feature 101 active routing

Primary files:

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

### Phase 9: UI/Debug Consumption

Purpose: expose the richer runtime state through existing UI and runtime debug/observability surfaces without a broad UI rewrite.

Deliverables:

- Team ledger can show SDK runtime metadata
- Team plan panel can render persisted plan immediately
- Team step cards can link to owner result, reviewer verdict, repair attempts, and trace events
- Chat debug surface can show selected skill/model/gateway route where appropriate
- Responses and shared skill runtime traces can be inspected through existing debug/admin surfaces
- old legacy runs render safely without null references

Primary files:

- `apps/web/server/services/autoTeamLedgerService.ts`
- `apps/web/server/routers/teamRoom.ts`
- `apps/web/client/src/components/orchestrator/AutoTeamLedgerPanel.tsx`
- `apps/web/client/src/components/orchestrator/TeamRoomView.tsx`
- `apps/web/client/src/components/orchestrator/TeamPlanSidePanel.tsx` if already present, or the equivalent panel component
- UI tests or component tests matching existing patterns

### Phase 10: Rollout, Upgrade, and Release Gates

Purpose: make SDK upgrades and activation safe.

Deliverables:

- shadow comparison metrics
- replay fixture commands
- adapter compatibility suite
- Responses/shared-skill compatibility suite
- SDK upgrade checklist
- rollback validation tests
- operational dashboards/log markers
- release gate documentation
- numeric promotion thresholds
- operator recovery playbook
- implementation and manifest ownership matrix

Primary files:

- `specs/feature/101-openai-agents-sdk-chat-team-orchestration/rollout.md`
- `python-backend/requirements.txt`
- Python lock/dependency management files used by the repo
- CI/test config where needed
- test fixtures under existing test fixture directories

## 4. Runtime DTO Contract

Create shared DTOs in TypeScript and matching Pydantic models in Python. These do not need to be generated from one source in the first pass, but they must be contract-tested with fixtures.

### 4.1 TypeScript DTO Location

Create:

- `apps/web/shared/agentRuntime/types.ts`
- `apps/web/shared/agentRuntime/skillManifest.ts`
- `apps/web/shared/agentRuntime/reviewVerdict.ts`
- `apps/web/shared/agentRuntime/runtimeEvents.ts`

These shared types are used by Node services and UI DTO mapping. They should not import server-only modules.

### 4.2 Python DTO Location

Create:

- `python-backend/app/services/openai_agents_contracts.py`

This file should contain Pydantic models for the adapter boundary. The adapter should reject malformed input before invoking the SDK.

### 4.3 Key DTO Fields

`AgentRuntimeRequest` must include:

- `surface`
- `tenantId`
- `actorId`
- `roomId`
- `runId`
- `requestId`
- `idempotencyKey`
- `objective`
- `planDigest`
- `step`
- `attempt`
- `modelConfig`
- `executionEnvelope`
- `contextItems`
- `contextPackRef`
- `contextPackBudget`
- `contextPackExplanation`
- `skillManifests`
- `reviewPolicy`
- `retryPolicy`
- `completionPolicy`
- `traceContext`
- `originSurface`
- `entryPoint`
- `runtimeContractVersion`
- `traceSchemaVersion`
- `checkpointSchemaVersion`

`RuntimeModelConfig` must include:

- `modelId`
- `providerId`
- `gatewayBaseUrl`
- `gatewayRouteId`
- `credentialMode`
- `modelSettings`
- `selectionSource`

`AgentExecutionEnvelope` must include:

- `allowedTools`
- `allowedSkills`
- `connectorGrants`
- `budget`
- `approvalRequirements`
- `writeScopes`
- `dataScopes`
- `expiresAt`
- `signature`

`AgentRuntimeResponse` must include:

- `status`
- `selectedAgent`
- `selectedSkillSlug`
- `model`
- `provider`
- `gatewayRouteId`
- `finalOutput`
- `artifacts`
- `reviewVerdict`
- `events`
- `trace`
- `checkpoint`
- `terminalReason`
- `nextAction`
- `sdkVersion`
- `adapterVersion`
- accepted contract/schema versions
- step-link records when durable links already exist

`ReviewVerdict` must include:

- `status`: `pass`, `fail`, `needs_repair`, or `blocked`
- `reasonCodes`
- `summary`
- `requiredFixes`
- `evidenceGaps`
- `canRetry`
- `reviewerAgent`
- `reviewedStep`
- `confidence`

### 4.4 Contract Versions And Step Links

The shared runtime contract must version itself independently from the SDK package. At minimum, request/response/event/checkpoint payloads must carry:

- `runtimeContractVersion`
- `traceSchemaVersion`
- `checkpointSchemaVersion`

The Team and debug surfaces must also consume an explicit `AgentRuntimeStepLink` contract instead of inferring links from free-form text. Each step link must support:

- `linkType`
- `stepKey`
- `attemptId`
- `traceId`
- `checkpointId`
- `messageId`
- `anchorId`
- `label`
- `isPrimary`

## 5. Feature Flag and Runtime Selection Design

### 5.1 New Flags

Add to `TenantFeatureFlags`, `ALLOWED_FEATURE_FLAGS`, and `FEATURE_FLAG_DEFAULTS`:

- `openAiAgentsRuntimeEnabled`
- `openAiAgentsRuntimeChatShadow`
- `openAiAgentsRuntimeTeamShadow`
- `openAiAgentsRuntimeChatActive`
- `openAiAgentsRuntimeTeamActive`
- `openAiAgentsRuntimeResponsesShadow`
- `openAiAgentsRuntimeResponsesActive`
- `openAiAgentsRuntimeSkillShadow`
- `openAiAgentsRuntimeSkillActive`
- `openAiAgentsRuntimeForceRollback`

All default to `false`.

### 5.2 Selection Precedence

Runtime selection must use this order:

1. Force rollback flag.
2. Existing run-frozen runtime decision.
3. Room override, if room overrides exist or are added later.
4. Tenant flags.
5. Platform defaults.

### 5.3 Frozen Runtime Decision

Every SDK-eligible run/turn must store:

- selected runtime engine: `legacy` or `openai_agents`
- selected runtime mode: `legacy`, `shadow`, or `active`
- frozen timestamp
- flag snapshot
- selection reason

For Team, this belongs on `team_runs`. For Chat turns without a Team run, persist this in `agent_runtime_traces` and the message metadata where available.

### 5.4 No Mid-Run Switching

If a Team run starts as legacy, it remains legacy. If it starts as SDK active, it remains SDK active unless explicitly stopped and restarted. Force rollback affects new work and may block new SDK invocations, but it must not silently reinterpret already-written runtime state.

## 6. Persistence and Migration Plan

### 6.1 Extend `team_runs`

Add hot-query columns:

- `runtimeEngine`
- `runtimeMode`
- `runtimeSdkVersion`
- `runtimeAdapterVersion`
- `runtimeTraceId`
- `runtimeGatewayRouteId`
- `runtimeFrozenAt`
- `runtimeTerminalReason`
- `runtimeCurrentStepKey`
- `runtimeApprovalState`
- `runtimeStateJson`

`runtimeStateJson` is a versioned envelope. It should include:

- `schemaVersion`
- `runtimeContractVersion`
- `traceSchemaVersion`
- `checkpointSchemaVersion`
- `planDigest`
- `stepStatuses`
- `checkpointRefs`
- `selectionSource`
- `flagSnapshot`
- `lastEventSequence`

Migration behavior:

- nullable or default-safe fields only
- no historical backfill of invented runtime data
- old rows render as legacy

### 6.2 Add `agent_runtime_traces`

Purpose: canonical redacted runtime archive across Chat, Team, Responses, and shared skill runtime.

Fields should support:

- tenant id
- surface
- room id
- run id
- message id
- step key
- attempt id
- trace id
- event id
- sequence
- event name
- source component
- severity
- summary
- redacted metadata JSON
- SDK version
- adapter version
- model/provider/gateway route
- idempotency key
- created timestamp

Indexes must support:

- tenant + run + sequence
- tenant + trace id
- tenant + event name + created timestamp
- tenant + idempotency key uniqueness

### 6.3 Add `agent_runtime_checkpoints`

Purpose: generic Chat/Responses/shared-skill/non-work HITL pause/resume. Team work-backed checkpoints continue using Work OS tables.

Fields should support:

- tenant id
- surface
- room id
- run id
- message id
- step key
- attempt id
- checkpoint id
- checkpoint status
- approval state
- resume cursor
- snapshot JSON
- detail JSON
- idempotency key
- requested/approved/rejected/resumed timestamps
- actor ids

### 6.4 Reuse Team Tables

Team projections should write:

- `auto_team_execution_stages` for stage/step attempt state
- `auto_team_review_records` for reviewer verdict and repair instructions
- `auto_team_trace_events` for Team-facing step/event playback
- `auto_team_final_results` for final completion or terminal failure
- `team_room_messages.metadataJson` for visible chat-to-step/trace links

### 6.5 Retention

Default retention policy:

- redacted raw runtime traces: 90 days
- run summary metadata: at least 365 days or stricter tenant policy
- aggregate metrics can outlive raw traces if they contain no sensitive payload

## 7. Python Adapter Plan

### 7.1 Files

Create:

- `python-backend/app/services/openai_agents_adapter.py`
- `python-backend/app/services/openai_agents_contracts.py`
- `python-backend/app/services/openai_agents_gateway_model.py`
- `python-backend/app/services/openai_agents_trace.py`
- `python-backend/app/services/openai_agents_version.py`

### 7.2 Adapter Entry Points

The adapter should expose a small surface:

- `run(request: AgentRuntimeRequest) -> AgentRuntimeResponse`
- `run_streamed(request: AgentRuntimeRequest) -> AsyncIterator[AgentRuntimeEvent]`
- `resume(request: AgentRuntimeResumeRequest) -> AgentRuntimeResponse`
- `cancel(request: AgentRuntimeCancelRequest) -> AgentRuntimeResponse`
- `health() -> AgentRuntimeAdapterHealth`

### 7.3 Gateway Model Construction

The adapter must create SDK model clients using the gateway route passed from Node.

Rules:

- `base_url` must point to the SmartSpecPro gateway.
- API key/token must be the platform attribution token, not a provider key.
- direct provider base URLs are rejected for production runtime requests.
- model id must come from Node's resolved model config.
- adapter reports the model/provider/gateway metadata back in the response.

The existing `agency_swarm_adapter.py` demonstrates this pattern and should be used as a reference, not as the product/runtime implementation target.

### 7.4 Agents, Tools, Handoffs, and Guardrails

The adapter should create:

- a coordinator/triage agent for Chat when needed
- a bounded step owner agent for Team execution
- a bounded reviewer agent for Team review
- repair-capable variants only when the step retry rule allows repair
- tool wrappers only for envelope-allowed tools
- handoff definitions only for envelope-allowed target agents

Guardrail strategy:

- Node permission envelope is the first gate.
- Adapter DTO validation is the second gate.
- SDK input/output/tool guardrails add workflow-local checks.
- Tool guardrails must be used for custom function tools because top-level input/output guardrails do not cover every tool call inside manager/handoff workflows.

### 7.5 Tracing

Production adapter defaults:

- set SDK run config to exclude sensitive trace data
- avoid logging model/tool payloads
- disable SDK trace export to external OpenAI trace storage unless an explicit development-only setting enables it
- use a platform-owned custom trace processor/exporter that maps SDK spans into redacted SmartSpecPro trace events
- include SDK and adapter versions in every trace response

The adapter must never return raw secret-bearing SDK traces to Node.

### 7.6 Error Model

Adapter errors must be structured:

- `invalid_request`
- `permission_denied`
- `tool_denied`
- `gateway_unavailable`
- `sdk_runtime_error`
- `guardrail_blocked`
- `checkpoint_required`
- `resume_failed`
- `cancelled`

Each error includes:

- stable code
- human-readable summary
- retryability
- terminal recommendation
- redacted debug metadata

## 8. Node Runtime Client Plan

### 8.1 Files

Create:

- `apps/web/server/services/agentRuntime/client.ts`
- `apps/web/server/services/agentRuntime/requestBuilder.ts`
- `apps/web/server/services/agentRuntime/runtimeSelection.ts`
- `apps/web/server/services/agentRuntime/traceService.ts`
- `apps/web/server/services/agentRuntime/checkpointService.ts`
- `apps/web/server/services/agentRuntime/teamProjection.ts`
- `apps/web/server/services/agentRuntime/chatRuntimeOrchestrator.ts`
- `apps/web/server/services/agentRuntime/teamRuntimeOrchestrator.ts`

### 8.2 Internal Adapter Transport

Use the existing Node-to-Python internal service boundary rather than adding a public API route. The exact transport should match current Python backend call conventions in the repo, but the logical operations must be stable:

- `run`
- `runStreamed`
- `resume`
- `cancel`
- `health`

The transport request must include:

- platform request id
- tenant id
- surface
- runtime request payload
- signed execution envelope or envelope reference
- gateway attribution token in the same internal-auth style used by existing Python skill/agency execution

The transport response must include:

- normalized runtime response
- redacted runtime events
- adapter health/version metadata
- structured error envelope when failed

No frontend route should call the Python SDK adapter directly.

### 8.3 Client Responsibilities

The client:

- calls the Python adapter over the existing internal service boundary
- passes a signed execution envelope
- passes Node-resolved model/gateway config
- validates response DTO shape
- verifies the adapter-selected skill/tool/agent is still inside the original allowed envelope before executing or persisting any side effect
- persists traces and checkpoint updates
- returns normalized results to surface-specific runtime services

The client must not:

- import SDK code
- choose a provider independently from `llmRouter`
- silently fallback to legacy within an SDK active request
- persist raw SDK traces

### 8.4 Contract Fixtures

Create shared JSON fixtures for DTO compatibility:

- valid Chat runtime request
- valid Team step runtime request
- valid Team review runtime request
- malformed permission envelope
- gateway-denied model config
- SDK runtime response with pass verdict
- SDK runtime response with needs-repair verdict
- SDK runtime response with checkpoint interruption
- streamed event sequence with duplicate event delivery

Use the same fixture files in TypeScript and Python tests. This is the main guard against TypeScript/Pydantic DTO drift.

### 8.5 Request Builder Responsibilities

The request builder:

- resolves tenant, user/system actor, room, run, and message ids
- loads context packs from Feature 099 systems
- loads skill manifests
- creates evidence items with trust labels
- includes only allowed tool/skill ids
- signs or references an execution envelope
- includes model/gateway config from existing routing services
- includes runtime ceilings and retry policy

Evidence items must include:

- artifact id
- source type
- origin
- trust level
- sanitization level
- content reference
- token estimate
- context pack slot, when derived from Feature 099
- source ref and retrieval recipe metadata, when applicable

### 8.6 Context Engine And Memory Boundary

The Node runtime client consumes Feature 099 context packs. It must not create a parallel memory system.

Rules:

- Runtime requests for Chat, Team, Responses, and shared skill execution must call the shared context engine / context-pack builder before invoking the SDK runtime.
- The request builder passes context pack references, slot metadata, budget usage, trust/freshness annotations, source refs, and inclusion/exclusion explanations where safe.
- The Python adapter receives only normalized snippets, structured extracts, or content refs from the context pack. It does not query memory stores directly.
- The Python adapter does not write durable memory.
- Runtime results that should influence memory are returned to Node as candidate evidence/artifact refs.
- Node delegates rolling summary, promotion, pruning, dedupe, and tool-result clearing back to the Feature 099 context lifecycle.
- If context pack construction fails, SDK active execution fails closed or uses the existing legacy path only when runtime selection is legacy. SDK active mode must not silently build its own prompt/memory fallback.
- Runtime traces should include context pack id, budget profile, slot usage, retrieval recipe, source refs, and inclusion/exclusion explanations when safe after redaction.

### 8.7 Backpressure, Rate Limits, and Timeouts

SDK runtime calls add another internal dependency and can increase load. Node must enforce:

- per-tenant concurrent SDK runtime run limit
- per-room Team run concurrency limit
- per-user Chat runtime concurrency limit where Chat turns can start SDK work
- adapter request timeout by surface
- stream idle timeout
- retry policy for transport errors only when idempotency keys make retry safe
- no retry for denied tools, invalid envelopes, guardrail tripwires, or schema-invalid adapter responses

If limits are exceeded, return or persist a structured `runtime_backpressure` or `runtime_rate_limited` error. Do not fall back silently to legacy inside an SDK-active run.

### 8.8 Shadow Mode Side-Effect Rules

Shadow mode must not create duplicate external side effects.

For Chat, Team, Responses, and shared skill shadow runs:

- mutating tools are disabled unless a tool has an explicit dry-run implementation
- connector writes are disabled
- media-generation submissions are disabled unless a sandbox provider route is explicitly configured
- approval decisions are not consumed
- user-visible messages are not changed
- shadow output is persisted only as comparison trace data

If a shadow runtime would have chosen a mutating action, persist that as a shadow decision event with `sideEffectSuppressed=true`.

## 9. Skill Capability Manifest Plan

### 9.1 Manifest Source

Add a manifest schema in shared code and store manifest data close to existing skill registry definitions. If the current skill registry already has metadata records, extend them instead of creating an unrelated registry.

### 9.2 Required Fields

Each runtime-selectable skill must declare:

- slug and name
- purpose
- supported surfaces
- task types
- required/preferred context
- input/output schemas
- artifact types
- required evidence
- review checklist
- failure modes
- do-not-use rules
- required connectors
- write scope
- side-effect class
- data sensitivity
- execution mode
- read-only flag
- risk tier
- latency/token/tool budgets
- human approval requirement
- allowed model families
- completion signals
- selection and negative signals
- reviewer profile
- repair strategy
- repair-loop support

### 9.3 Initial Skill Coverage

Prioritize manifests for skills used by Chat/Team/Responses/shared runtime automation:

- planning/decomposition
- research
- writing/copy
- storyboard/script
- video prompt generation
- image/media prompt generation
- review/QA
- final handoff/publishing
- general article/writing skills that currently get selected incorrectly

### 9.4 Selection Explanation

Every selection response must be able to say:

- selected skill
- rejected close alternatives
- matching signals
- negative signals avoided
- missing context/evidence
- risk/approval outcome

## 10. Chat Integration Plan

### 10.1 Shadow Mode

When Chat shadow flag is enabled:

- legacy Chat path still produces user-visible output
- SDK runtime runs in parallel or immediately after with the same intent/context envelope
- SDK output is persisted only as shadow trace/comparison data
- no user-visible message changes

Comparison metrics:

- selected skill
- selected model/provider/gateway route
- completion status
- review/verdict if applicable
- latency
- error code

### 10.2 Active Mode

When Chat active flag is enabled:

- runtime client becomes the source of truth for eligible skill/orchestration turns
- Node still persists messages
- Chat still assembles context through the Feature 099 shared context engine before each SDK runtime call
- Chat memory mode controls still flow into the context pack builder, not into SDK adapter-specific memory
- Chat must pass the resolved active persona snapshot from the current conversation/context path when a persona is active
- approval interruptions write generic runtime checkpoints
- errors are surfaced as structured runtime errors instead of hidden fallback
- force rollback affects new Chat turns only

### 10.3 Compatibility

Existing Chat tests should continue passing. Active mode tests should assert new behavior only when flags are enabled.

## 11. Team Integration Plan

### 11.1 Plan Artifact First

On Team run start:

- freeze runtime selection
- create/persist a durable plan artifact
- persist plan summary in room messages and runtime state
- project plan steps into Team ledger data
- review the plan
- do not start owner execution until plan review passes

If plan review fails:

- persist the failed review verdict
- persist reason codes and required fixes
- stop or pause according to policy
- do not fallback to a fabricated plan

### 11.2 Step Execution

For each step:

- load locked step definition
- build runtime request for the owner persona/member assignment from the persisted plan
- build or load the Feature 099 context pack for this room/run/step
- include only step-relevant context-pack evidence and allowed skills/tools
- persist owner result as a step result
- persist selected skill/model/gateway metadata
- persist trace links plus owner member/persona identity to room message metadata

### 11.3 Step Review

For each owner result:

- build runtime request for the reviewer persona/member assignment from the persisted plan
- pass deliverable, evidence requirements, quality criteria, review checklist, and prior attempts
- require a structured `ReviewVerdict`
- persist review row and room/trace projection

Verdict handling:

- `pass`: advance if all persistence writes succeed
- `needs_repair`: persist repair instructions, create new attempt on the same step
- `blocked`: persist checkpoint/approval state and stop advancing
- `fail`: terminal or escalation according to retry policy

### 11.4 Repair Loop

Every repair attempt:

- references the verdict that caused it
- includes explicit required fixes
- increments attempt count
- stays on the same step
- emits new trace/stage/review rows
- cannot erase prior failed attempt evidence

### 11.5 Attempt Budget

Before execution, compute minimum required attempt budget:

- at least one owner attempt for every mandatory step
- at least one reviewer attempt for every mandatory step
- configured repair allowance per step

If configured global caps are lower than this minimum, the runtime must increase the effective cap or reject the run configuration before starting. It must not start and then stop early with `max_rounds_reached` before touching every mandatory step.

### 11.6 Completion

A Team run can be marked complete only when:

- all mandatory steps have owner output
- all mandatory steps have reviewer `pass`
- final result metadata is persisted
- terminal reason is `plan_completed`

If not complete, terminal reason must be explicit, such as:

- `plan_incomplete_cap_reached`
- `step_failed_retry_exhausted`
- `review_failed_retry_exhausted`
- `approval_required`
- `approval_rejected`
- `budget_exhausted`
- `timeout_step`
- `timeout_run`
- `tool_denied`
- `permission_mismatch`
- `gateway_unavailable`
- `runtime_error`
- `rollback_forced`

## 12. UI and Ledger Plan

The UI should consume richer persisted data, not infer state from prose.

### 12.1 Team Ledger

Enhance ledger endpoint/data mapping to expose:

- runtime engine/mode/version
- plan artifact id/digest
- step list
- current step
- owner result per step
- reviewer verdict per step
- repair attempts per step
- trace links
- terminal reason
- latest error

### 12.2 Plan Panel

The side panel must show plan steps as soon as the plan artifact is persisted, even before audited runtime traces catch up.

Each plan step should show:

- status
- owner
- reviewer
- deliverable
- evidence requirements
- review checklist
- latest owner result link
- latest review verdict link
- retry count
- trace link

If audited execution evidence has not arrived, show a clear "plan visible, execution evidence pending" state, not "no steps captured."

### 12.3 Legacy Compatibility

Old rooms/runs without runtime metadata should show:

- `legacy runtime`
- no step-level runtime links if unavailable
- safe empty states

No UI path may assume `runtimeStateJson.plan` exists without null checks.

## 13. Security Plan

### 13.1 Envelope Enforcement

Every adapter request must include a valid execution envelope. The adapter fails closed when:

- envelope missing
- signature invalid
- expired envelope
- requested tool not allowed
- requested skill not allowed
- connector grant missing
- write scope mismatch
- tenant/run mismatch

### 13.2 Handoff Scope

When a handoff occurs:

- target scope = source scope intersection target declared scope
- no handoff may add new tools/connectors/write scopes
- handoff reason is captured as redacted metadata

### 13.3 Untrusted Evidence

All external content is evidence, not instruction. The request builder must label trust level and sanitization level. The adapter prompt must preserve instruction precedence:

1. platform policy
2. signed execution envelope and locked step
3. tenant-authored input
4. normalized approved evidence
5. untrusted tool/retrieval content
6. model scratch state

### 13.4 Redaction

Redaction must cover:

- JWTs
- gateway bearer tokens
- provider API keys
- internal service tokens
- signed URLs
- cookies
- OAuth refresh tokens
- connector credentials
- large raw document fragments
- personal data outside approved scope

## 14. SDK Version and Upgrade Plan

### 14.1 Dependency Location

Add `openai-agents` in one Python dependency path. Do not add SDK dependencies to Node packages.

The dependency must be pinned exactly, not declared as an open-ended lower bound. The OpenAI Python client dependency should also be explicit and compatible with the pinned SDK.

The implementation should document:

- where the dependency is pinned
- how to update it
- which tests must run before promotion
- how to roll back the pin if contract tests fail
- whether a lock/constraints file must be regenerated for the deployment image

### 14.2 Adapter Compatibility

The adapter must have tests that fail loudly if SDK APIs used by the adapter change.

Compatibility suite includes:

- agent construction
- tool construction
- handoff construction
- guardrail construction
- run result normalization
- stream event normalization
- interruption/resume handling
- custom model client construction
- trace redaction/export
- mixed-deploy `current/current-1` contract compatibility
- unsupported future contract version failure

### 14.3 Upgrade Flow

For every SDK bump:

1. update one dependency entry/lock path
2. confirm or bump `runtimeContractVersion`, `traceSchemaVersion`, and `checkpointSchemaVersion` only when required
3. run Python adapter tests
4. run Node contract tests
5. run Chat/Team/Responses/shared-skill replay fixtures, including Media Studio prompt/custom-skill cases
6. compare trace shapes, verdicts, and step-link coverage
7. run mixed-deploy compatibility tests
8. run shadow mode
9. promote only after parity thresholds pass

### 14.4 Numeric Promotion Thresholds

Minimum thresholds for production promotion:

- skill-selection drift <= 5%
- Team review-verdict mismatch <= 2%
- mandatory Team step first-attempt coverage before cap-based stop = 100%
- schema-invalid outputs accepted as success = 0
- duplicate step advancement incidents = 0
- persisted step-link coverage for durable records >= 99%
- contract-validation failures in promoted cohorts = 0

## 15. Operator Recovery Playbook

Release documentation must include concrete recovery guidance for:

- adapter unavailable
- unsupported contract version
- missing step links
- failed Team plan review
- stuck Team step
- repeated schema-invalid output
- duplicate or missing streamed events
- missing/invalid manifest
- Media Studio prompt/custom-skill shared-runtime failure

Each scenario must include symptoms, the logs/traces to inspect, safe immediate action, recovery action, and escalation owner.

## 16. Implementation And Manifest Ownership Matrix

Minimum named owners:

- runtime contract and feature-flag owner
- Python adapter and gateway owner
- persistence/projection owner
- Team UI/ledger owner
- skill manifest schema/registry owner
- Media Studio prompt-skill manifest owner
- rollout/replay/runbook owner

Each active manifest must declare `ownerTeam`, `ownerCodeownersPath`, and a review cadence.

## 17. Testing Strategy

This plan is TDD-oriented. Tests should land before or alongside each section.

Test categories:

- feature flags and runtime selection
- schema and migration safety
- Python adapter DTO/gateway/import boundary
- Node runtime client contract
- trace/checkpoint persistence and idempotency
- skill manifest validation and selection explanation
- Chat shadow/active/rollback
- Team plan gate, step gate, review verdict, repair loop, completion
- UI legacy null-safety and plan-side-panel data mapping
- replay fixtures
- redaction/security
- SDK upgrade compatibility

The detailed test plan is in `claude-plan-tdd.md`.

## 18. Implementation Order

Recommended order:

1. Add feature flags and runtime selection helper.
2. Add shared DTOs and schema tests.
3. Add additive migrations for runtime metadata, traces, and checkpoints.
4. Add Python adapter DTOs and import guard.
5. Add gateway-only model client tests and implementation.
6. Add Python adapter run/stream/resume normalization tests and implementation.
7. Add Node runtime client and persistence services.
8. Add skill manifest schema and validation.
9. Add Chat shadow runtime.
10. Add Team plan/step/review runtime in shadow mode.
11. Add Chat active mode behind flag.
12. Add Team active mode behind flag.
13. Enhance ledger/UI data mapping.
14. Add replay fixtures and release gates.
15. Document rollout and SDK upgrade process.

This order keeps the system safe: nothing user-visible changes until contracts, persistence, adapter, and shadow validation exist.

## 19. Acceptance Mapping

The plan satisfies the synthesized spec as follows:

- SDK import isolation: Phase 2 plus import guard tests.
- Gateway billing preservation: adapter gateway model construction and tests.
- Shared multi-surface contract: Phase 1 DTOs and Phase 3 client.
- Skill manifest selection: Phase 4.
- Structured review/repair: Phase 6 Team review runtime and `ReviewVerdict`.
- Team completion reliability: Team serial gate, repair loop, and attempt budget.
- Trace/debug visibility: Phase 3 trace services and Phase 9 UI mapping.
- Media Studio prompt/custom-skill compatibility: Phase 8 shared skill runtime integration plus Media Studio caller coverage.
- Rollout safety: Phase 1 flags and Phase 10 gates.
- SDK upgrade safety: Phase 10 compatibility suite.
- Security: envelope, redaction, handoff scope, evidence trust labels.

## 20. Risks and Mitigations

Risk: SDK behavior changes in a minor version.
Mitigation: one adapter boundary, pinned dependency, contract tests, replay fixtures, shadow/canary before active promotion.

Risk: Runtime becomes another opaque agent loop.
Mitigation: Node owns plan progression, every event is persisted, every verdict is structured, no prose-only advancement.

Risk: Gateway bypass accidentally creates a second billing path.
Mitigation: adapter rejects direct provider endpoints for production runtime surfaces; tests assert gateway base URL and attribution token path.

Risk: Skill manifests are incomplete.
Mitigation: start with required fields, fail closed for active mode when required manifest data is missing, allow shadow diagnostics to identify gaps.

Risk: Team still stops before finishing all steps.
Mitigation: compute minimum attempt budget from plan and reject/adjust caps before execution; terminal reasons must distinguish incomplete caps.

Risk: Trace data leaks secrets.
Mitigation: sensitive SDK trace capture disabled, redaction service, trace allowlist fields, no raw tool/model payload persistence.

Risk: Feature flags switch runtime mid-run.
Mitigation: frozen runtime decision persisted at run start.

Risk: UI crashes on old runtime metadata.
Mitigation: legacy rendering contract and null-safe DTO mapping.

Risk: Media Studio prompt execution and real generation pipeline get coupled too early.
Mitigation: route only `enhancePrompt` and `executeCustomSkill` through Feature 101 in round one; keep `generateImageAsync`, `generateVideoAsync`, and `generateAudio` explicitly out of scope.

## 21. Definition of Done

Feature 101 is complete when:

- all new runtime flags exist and default disabled
- Python SDK adapter is the only product/runtime SDK import path
- SDK model execution goes through the SmartSpecPro gateway
- Chat, Team, Responses, and shared skill runtime can run shadow mode and persist comparison traces
- Media Studio prompt/custom-skill execution can run through the shared skill runtime without pulling in the real media generation pipeline
- Team active mode can execute every mandatory plan step with structured owner result, reviewer verdict, repair loop, and final completion/terminal reason
- plan artifacts render before execution evidence catches up
- explicit step links exist for plan, owner result, reviewer result, repair, checkpoint, and terminal records where those records are durable
- old legacy runs render safely
- replay fixtures and compatibility tests pass
- redaction and permission tests pass
- rollout and SDK upgrade docs exist
- operator recovery playbook and ownership matrix exist
