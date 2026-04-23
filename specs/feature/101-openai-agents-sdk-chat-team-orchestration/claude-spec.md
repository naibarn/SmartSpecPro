# Synthesized Spec: Feature 101 OpenAI Agents SDK Chat And Team Orchestration

Date: 2026-04-20
Source input: `specs/feature/101-openai-agents-sdk-chat-team-orchestration/spec.md`
Research: `claude-research.md`
Interview/assumptions: `claude-interview.md`

## 1. Objective

Introduce OpenAI Agents SDK as the primary orchestration runtime for Chat, Team, Responses, shared skill-runtime traffic, and Media Studio prompt-skill execution while preserving SmartSpecPro's existing product, billing, audit, permission, and rollout contracts.

Feature 101 activates the runtime for Chat, Team, Responses, and shared skill runtime, with independent shadow/active rollout control per surface. Media Studio joins only where it executes prompt/skill work through the shared `surface = skill` path.

The implementation must make Chat, Team, Responses, and shared skill execution better at:

- selecting the right skill or specialist agent from structured capability data
- producing clear pass/fail/repair/block review verdicts
- completing Team plans step by step instead of stopping early
- showing enough persisted evidence to audit what happened after the run
- upgrading the SDK safely without scattering SDK details across the app

## 2. Non-Negotiable Constraints

1. Only the Python backend may import the OpenAI Agents SDK for Chat, Team, Responses, or shared skill-runtime traffic.
2. A new dedicated adapter, `python-backend/app/services/openai_agents_adapter.py`, must be the only SDK adapter for product/runtime traffic.
3. The existing `agency_swarm_adapter.py` may remain as a temporary agency-only exception, but must not be expanded for Chat, Team, Responses, or shared skill runtime.
4. All production SDK-driven LLM calls must route through the existing SmartSpecPro OpenAI-compatible gateway.
5. The SDK runtime may not directly call provider APIs or use provider credentials for Chat/Team execution.
6. Node remains the authority for tenant policy, permissions, model/provider governance, billing attribution, room state, plan state, and durable persistence.
7. Team must persist a durable plan artifact before the first owner execution step starts.
8. Team may not advance to the next serial step until the current step has a persisted reviewer `pass` verdict.
9. The SDK runtime may not invent or silently replace the locked Team plan during execution.
10. Legacy orchestration may exist only as a rollout/rollback route, not as hidden per-step fallback inside the SDK runtime.
11. Runtime choice must be frozen at run start and stored durably.
12. SDK version, adapter version, trace id, model/provider/gateway metadata, selected skill, review verdicts, step ids, attempt ids, checkpoint ids, and terminal reasons must be traceable.
13. Stored traces, logs, room messages, and UI payloads may not contain raw secrets, auth headers, provider keys, signed URLs, or cross-tenant data.
14. SDK upgrades must pass adapter, replay, trace, verdict, permission, redaction, checkpoint, and rollback tests before promotion.
15. Media Studio support in Feature 101 is limited to `enhancePrompt` and `executeCustomSkill` style prompt/skill execution. The real media generation pipeline remains out of scope for round one.

## 3. Target Runtime Model

### 3.1 Boundary Split

Node/TypeScript responsibilities:

- feature flag resolution and precedence
- run-level runtime selection and freezing
- tenant/user/room/run permission envelope creation
- gateway model/provider resolution
- budget and credit attribution envelope creation
- Team plan locking and deterministic step advancement
- durable writes to Team/Chat messages, trace tables, stage tables, review tables, and checkpoint tables
- rollout/shadow/active/rollback policy
- UI-facing DTOs
- context-pack construction and memory lifecycle delegation through the Feature 099 context engine

Python adapter responsibilities:

- import OpenAI Agents SDK
- validate adapter request DTOs
- construct agents, tools, handoffs, guardrails, and SDK run config
- construct SDK model clients against the SmartSpecPro gateway
- execute SDK runs or streamed runs
- normalize SDK results, interruptions, stream events, handoffs, tool calls, and trace data into platform DTOs
- report SDK and adapter versions
- fail closed when permission envelope or gateway config is invalid

### 3.2 Context Engineering And Memory Boundary

Feature 101 consumes Feature 099. It does not replace Feature 099 and does not introduce a new memory system.

Required rules:

- The SDK runtime receives normalized context packs, context item references, and evidence items produced by the Feature 099 shared context engine.
- The SDK adapter may not read Chat memory, Team scoped memory, vector stores, or Work OS memory tables directly.
- The SDK adapter may not write durable memory directly.
- Post-run memory lifecycle decisions such as rolling summary, promotion to durable memory, pruning, deduplication, and tool-result clearing must be requested through the existing/shared context engine lifecycle from Feature 099.
- Chat memory mode controls must continue to flow through the shared context contract.
- Team must continue to receive project state, room state, durable memory, working summaries, and retrieval evidence through the same context contract.
- SDK trace/event output may create evidence or artifact references, but those references become memory only if the Feature 099 context engine promotes them under trust, scope, policy, and retention rules.
- Context pack ids, budget slots, selected source refs, inclusion/exclusion explanations, trust labels, freshness labels, and retrieval recipe metadata must be preserved in runtime traces where safe.

This means Feature 101 changes orchestration, not memory ownership.

### 3.3 Surface Contract

Create a shared runtime contract for Chat, Team, Responses, and shared skill runtime. Required DTOs include:

- `AgentRuntimeRequest`
- `AgentRuntimeResponse`
- `AgentRuntimeEvent`
- `AgentRuntimeTrace`
- `AgentRuntimeCheckpoint`
- `AgentCapabilityManifest`
- `AgentExecutionEnvelope`
- `ReviewVerdict`
- `StepExecutionRecord`
- `RuntimeModelConfig`

Feature 101 implementation sections, tests, rollout, and release gates must support active traffic for `chat`, `team`, `responses`, and shared `skill` surfaces.

Required request fields:

- surface: `chat` | `team` | `responses` | `skill`
- `originSurface` when `surface = skill`, including `media_studio`
- `entryPoint`, such as `chat_turn`, `team_step`, `responses_call`, `enhance_prompt`, or `execute_custom_skill`
- `runtimeContractVersion`
- `traceSchemaVersion`
- `checkpointSchemaVersion`
- tenant id
- actor id
- room id when available
- run id when available
- request id
- idempotency key
- objective/user intent
- current step id/key/attempt when available
- locked plan digest when available
- allowed tools
- allowed skills
- connector grants
- budget envelope
- approval requirements
- model/gateway config resolved by Node
- evidence/context items with trust labels
- trace correlation ids
- runtime policy including ceilings and retry rules

Required response fields:

- selected agent
- selected skill slug
- provider/model/gateway route metadata
- tool calls
- handoffs
- review verdict
- repair instructions
- evidence references
- generated artifacts
- trace id
- accepted contract/schema versions
- SDK version
- adapter version
- terminal reason, when terminal
- next action
- checkpoint/resume data, when paused
- stream/event sequence metadata
- explicit step-link records for durable plan, owner, review, repair, checkpoint, and terminal anchors when applicable

## 4. Chat Requirements

Chat must use the SDK runtime behind existing Chat routing surfaces without breaking current UI behavior.

Required behavior:

- classify intent using the shared runtime contract or shadow runtime when enabled
- select agents/skills from structured capability manifests
- preserve existing model-selection semantics through Node/gateway routing
- preserve existing conversation persona resolution, persona prompt segments, and persona-scoped memory through the Feature 099 context path
- emit an explainable selection record: why this skill, what evidence, what model/gateway route
- persist a user-visible message and a structured runtime trace
- support generic non-work checkpoints when human approval is required
- keep legacy behavior available through run-level rollout/rollback

Chat must not:

- hardcode SDK model names
- bypass `llmRouter`/gateway policy
- call the SDK directly from Node
- create a second Chat persona resolution path inside the SDK adapter
- hide SDK errors behind generic fallback inside an active SDK run

## 5. Responses Requirements

Responses must use the SDK runtime behind existing Responses/structured-output routing surfaces without breaking caller contracts.

Required behavior:

- preserve caller-required output schema or structured response contract
- preserve existing model-selection semantics through Node/gateway routing
- allow tool-enabled responses only inside the signed execution envelope
- persist a structured runtime trace and checkpoint metadata when paused or blocked
- fail with structured runtime errors when schema validation or policy validation fails

Responses must not:

- silently degrade schema-required output into free-form prose
- bypass `llmRouter`/gateway policy
- call the SDK directly from Node
- hide SDK errors behind generic fallback inside an active SDK run

## 6. Team Requirements

Team must use the SDK runtime to execute locked plan steps, not to freely re-plan the workflow during execution.

Required Team flow:

1. Start or resume Team run.
2. Freeze runtime mode on the run.
3. Load room objective plus resolved room member roster and persona/member data.
4. Create and persist a durable plan artifact before execution.
5. Review the plan and persist the plan review result.
6. If the plan review passes, mark the plan ready for execution.
7. Execute mandatory plan steps in declared serial order unless the plan explicitly defines a parallel group.
8. For each step:
   - select the correct skill/agent from capability manifests
   - execute owner work bound to the locked owner member/persona assignment
   - persist owner result and evidence refs
   - run reviewer bound to the locked reviewer member/persona assignment
   - persist structured review verdict
   - if verdict is `pass`, advance to the next step
   - if verdict is `needs_repair`, retry the same step with explicit repair instructions
   - if verdict is `blocked`, persist approval/checkpoint/dependency state and pause
   - if verdict is terminal failure, persist terminal reason and stop
9. Mark the run complete only when every mandatory plan step has passing evidence and final result metadata.

Required Team invariants:

- every plan step has owner, reviewer, deliverable, evidence requirements, quality criteria, review checklist, verification method, retry rule, step key, and stable member/persona ids for owner and reviewer
- owner and reviewer should be different when capable personas exist
- the SDK runtime may not advance steps by emitting only prose
- every step attempt gets a stable step id/key, attempt id, trace id, idempotency key, and event sequence
- every repair attempt references the review verdict that triggered it
- every stop before full completion must record an explicit non-success terminal reason
- global round/attempt caps must reserve enough budget to touch every mandatory step at least once
- owner/reviewer identities shown in Team UI/debug must match the locked plan assignments rather than inferred prose labels

## 7. Shared Skill Runtime Requirements

Shared skill runtime must use the same runtime contract for internal skill execution, selection, schema enforcement, and traceability.

Required behavior:

- use `surface = skill` for internal runtime requests
- preserve original caller envelope, approval policy, and side-effect class
- return typed output or structured failure to the caller
- record selected skill, rejected alternatives, and runtime trace metadata
- fail closed on schema-invalid or incomplete skill output before side effects
- bound recursive skill-to-skill execution with explicit runtime ceilings

Media Studio prompt execution must use this same shared-skill path when it calls prompt enhancement or custom skill execution. Actual media generation APIs and provider submission flows remain out of scope for Feature 101 round one.

## 8. Skill Capability Manifest Requirements

Every SDK-selectable skill must expose a machine-readable manifest.

Minimum manifest fields:

- skill slug
- manifest schema version
- name
- purpose
- supported surfaces
- supported origin surfaces
- supported entry points
- task types
- required and preferred context
- input schema
- output schema
- supported artifact types
- required evidence kinds
- review checklist
- failure modes
- do-not-use conditions
- required connectors
- write scope
- side-effect class
- data sensitivity
- execution mode
- read-only flag
- risk tier
- latency budget
- token budget
- tool budget
- human approval requirement
- allowed model families
- completion signals
- positive selection signals
- negative selection signals
- reviewer profile
- repair strategy
- supports repair loop
- owner team
- owner codeowners path
- owner review cadence

Selection must be explainable from these fields and persisted in trace/debug output.

## 7. Persistence Requirements

### 7.1 Existing Team Tables

Extend or reuse:

- `team_runs`
- `team_room_messages`
- `auto_team_execution_stages`
- `auto_team_review_records`
- `auto_team_final_results`
- `auto_team_trace_events`
- `auto_team_artifact_refs`
- `work_approvals`
- `work_automation_run_checkpoints`

`team_runs` must gain runtime metadata such as:

- runtime engine
- runtime mode
- SDK version
- adapter version
- trace id
- gateway route id
- frozen-at timestamp
- terminal reason
- current step key
- approval state
- versioned runtime state JSON

`team_room_messages.metadataJson` must carry an explicit step-link schema for plan summaries, plan steps, owner results, review results, repair results, checkpoints, and terminal results.

Minimum step-link fields:

- `linkType`
- `stepKey`
- `attemptId`
- `traceId`
- `checkpointId`
- `messageId`
- `anchorId`
- `label`
- `isPrimary`

### 7.2 New Generic Tables

Introduce:

- `agent_runtime_traces`
- `agent_runtime_checkpoints`

`agent_runtime_traces` is the generic redacted runtime archive for Chat, Team, Responses, and shared skill runtime. It must be append-only and deduplicate by stable event identity.

`agent_runtime_checkpoints` is for Chat, Responses, shared skill runtime, and other non-work pause/resume flows. Team work-backed approval/resume must use `work_approvals` and `work_automation_run_checkpoints` instead.

### 7.3 Migration Rules

- migrations must be additive
- no destructive changes in first rollout
- no invented backfill of historical SDK runtime metadata
- old runs render as `legacy runtime`
- UI degrades gracefully when step-level links are missing
- plan artifacts from chat-visible messages must remain renderable even before audited traces catch up

## 8. Observability and Debug Requirements

Every run must expose enough data to reconstruct:

- who acted
- which agent/skill acted
- what prompt/evidence category was used
- what tool or handoff happened
- what model/provider/gateway route was used
- what the reviewer decided
- why repair happened
- why the run stopped
- whether the stop was success or incomplete

Trace data must include:

- SDK version
- adapter version
- runtime engine/mode
- selected agent
- selected skill
- model/provider/gateway route
- handoff chain
- tool calls
- review verdicts
- step ids
- attempt ids
- checkpoint ids
- idempotency keys
- terminal reason
- contract/schema versions
- step-link identity so the Team panel can jump to the right evidence line without text matching

Production SDK tracing must disable sensitive input/output capture and use a redacted platform trace processor.

## 9. Security Requirements

The runtime is fail-closed and least privilege:

- every adapter request must include a signed/bounded execution envelope
- tools are deny-by-default
- only allowed tools and skills can run
- connector calls stay behind existing platform brokers
- handoff permissions are scope intersections, not unions
- mutating tools require declared side-effect class and approval policy
- missing/malformed envelopes fail the run

Prompt-injection controls:

- retrieved docs, MCP output, connector payloads, files, browser captures, and tool outputs are untrusted evidence unless promoted by platform policy
- untrusted content may contribute facts and citations, but may not redefine objectives or permissions
- Node normalization must scrub HTML/script/prompt-control text/signed URLs/oversized raw payloads before adapter input
- adapter receives normalized evidence snippets or references, not raw third-party payloads by default

Trace safety:

- never store raw JWTs, gateway tokens, provider keys, internal service tokens, signed URLs, cookie headers, OAuth refresh tokens, or connector credentials
- reject cross-tenant callbacks/events
- redact prompts/tool payloads/evidence refs according to policy

## 10. Rollout Requirements

Add disabled-by-default tenant flags:

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

Flag precedence:

1. force rollback
2. run-frozen runtime decision
3. room override, if implemented
4. tenant flags
5. platform defaults

Rollout phases:

1. Adapter introduction behind flags.
2. Chat shadow mode.
3. Team shadow mode.
4. Responses/shared skill shadow mode.
5. Controlled active cohort per surface.
6. Broader adoption after parity and safety gates.

Promotion thresholds must be numeric and enforced, including:

- skill-selection drift `<= 5%`
- Team review-verdict mismatch `<= 2%`
- schema-invalid accepted-as-success count `= 0`
- duplicate step advancement `= 0`
- mandatory Team step first-attempt coverage before cap-based stop `= 100%`
- step-link coverage for durable records `>= 99%`

Rollout documentation must also include an operator recovery playbook and an implementation/manifest ownership matrix covering adapter failures, unsupported contract versions, missing step links, failed plan review, repeated schema-invalid output, stuck step state, duplicate/missing events, missing manifests, and Media Studio prompt-path failures.

## 11. Versioning Requirements

- Pin `openai-agents` in one Python dependency path.
- Keep OpenAI Python dependency explicit.
- Do not spread SDK version assumptions into Node or UI.
- Every run records SDK and adapter versions.
- Request/response/event/checkpoint envelopes record `runtimeContractVersion`, `traceSchemaVersion`, and `checkpointSchemaVersion`.
- Node and Python must support `current/current-1` contract compatibility during rolling deploys or fail closed with a structured version error.
- SDK upgrades require:
  - adapter compatibility tests
  - replay fixtures
  - trace shape assertions
  - skill selection tests
  - verdict schema tests
  - rollback validation
  - permission envelope tests
  - redaction tests
  - streaming/resume idempotency tests
  - checkpoint compatibility tests

## 12. Acceptance Criteria

1. Chat, Team, Responses, and shared skill runtime can run through the SDK runtime in shadow mode without breaking caller-visible contracts.
2. Chat, Team, Responses, and shared skill runtime can be activated behind feature flags after parity gates pass.
3. SDK imports are isolated to the new adapter, with the temporary agency-only exception documented and guarded.
4. SDK model execution uses the existing gateway, not direct provider endpoints.
5. Runtime selection is frozen at run start.
6. Team plan artifacts persist before execution and are immediately renderable.
7. Team steps execute and review in plan order with durable pass/fail/repair/block verdicts.
8. Team completion requires every mandatory step to pass or records an explicit incomplete terminal reason.
9. Skill selection is driven by capability manifests and explained in trace output.
10. Runtime traces are redacted, append-only, idempotent, tenant-scoped, and queryable.
11. Approval/checkpoint behavior uses existing Work OS persistence when work-backed.
12. Historical legacy runs remain safe to render.
13. Rollback can restore legacy orchestration for new work without schema rollback.
14. SDK upgrades can be validated by contract tests and replay fixtures.

## 13. Test Requirements

Add or update tests for:

- Python adapter DTO validation
- Python adapter gateway-only model construction
- Python adapter SDK version reporting
- Python adapter streaming/cancel/resume normalization
- Python import guard
- TypeScript feature flag registration/defaults/precedence
- TypeScript runtime selection freezing
- TypeScript schema additions and migrations
- Chat runtime client contract
- Chat shadow/active/rollback routing
- Team plan-before-execution invariant
- Team serial step gate invariant
- Team review verdict and repair loop contract
- Team incomplete terminal reason contract
- generic trace/checkpoint idempotency
- redaction and no-secret trace persistence
- replay fixture parity for Chat, Team, Responses, and shared skill runtime
- old-run legacy rendering compatibility

## 14. Implementation Boundaries

Do not implement the feature as a UI rewrite. UI changes should consume richer persisted data from the existing ledger/runtime endpoints.

Do not implement the feature as a Python-only replacement. Node must continue to own policy, persistence, and deterministic Team progression.

Do not implement hidden fallback inside SDK steps. If the SDK path cannot continue, return a structured runtime error and let the run-level rollout/rollback policy decide what happens for future work.
