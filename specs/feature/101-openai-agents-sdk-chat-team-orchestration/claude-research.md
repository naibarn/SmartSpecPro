# Research: Feature 101 OpenAI Agents SDK Chat And Team Orchestration

Date: 2026-04-20
Planning directory: `specs/feature/101-openai-agents-sdk-chat-team-orchestration`

## Research Decision

Research decision (auto):

- Codebase: yes. The project is an existing git repository with mature Chat, Team, Python backend, schema, and test surfaces.
- Web topics: yes. The spec depends on current OpenAI Agents SDK behavior, including agents, tools, handoffs, guardrails, tracing, sessions, model providers, streaming, and resumable state.
- Testing: existing repo setup. TypeScript/Vitest contract tests are used for Node/router/schema/service boundaries. Python pytest tests cover backend adapters, agency runtime, safety, and service contracts.

## Official OpenAI Documentation Findings

Sources:

- OpenAI API docs, Agents SDK overview: https://platform.openai.com/docs/guides/agents-sdk/
- OpenAI Agents SDK Python docs, introduction: https://openai.github.io/openai-agents-python/
- OpenAI Agents SDK Python docs, models and providers: https://openai.github.io/openai-agents-python/models/
- OpenAI Agents SDK Python docs, running agents: https://openai.github.io/openai-agents-python/running_agents/
- OpenAI Agents SDK Python docs, results and state: https://openai.github.io/openai-agents-python/results/
- OpenAI Agents SDK Python docs, sessions: https://openai.github.io/openai-agents-python/sessions/
- OpenAI Agents SDK Python docs, tracing: https://openai.github.io/openai-agents-python/tracing/
- OpenAI Agents SDK Python docs, guardrails: https://openai.github.io/openai-agents-python/guardrails/
- OpenAI Agents SDK Python docs, handoffs: https://openai.github.io/openai-agents-python/handoffs/
- OpenAI Agents SDK Python docs, multi-agent orchestration: https://openai.github.io/openai-agents-python/multi_agent/

Findings:

- OpenAI positions the Agents SDK for applications that own orchestration, tool execution, approvals, and state. That matches SmartSpecPro's Chat and Team needs because our server already owns tenant permissions, billing, room state, tools, approval checkpoints, and audit history.
- The SDK primitives map cleanly to the product problem:
  - agents for specialist personas
  - tools for skill execution
  - handoffs and agents-as-tools for specialist delegation
  - guardrails for validation and safety checks
  - sessions and run state for multi-turn continuity
  - tracing for debugging tool calls, generations, handoffs, and guardrails
- The SDK supports OpenAI-compatible model clients. The docs show `AsyncOpenAI(api_key=..., base_url=...)` with `OpenAIChatCompletionsModel`, which supports the spec requirement to route model calls through the existing SmartSpecPro gateway instead of calling providers directly.
- The SDK supports both `RunResult` and `RunResultStreaming`. Streaming results include stream events, completion state, cancellation, and resumable state surfaces. This supports the requirement for idempotent streamed events, cancellation, and resume, but SmartSpecPro still needs its own persisted event identity and checkpoint model.
- Human-in-the-loop interruptions can be captured from run results and resumed by converting a run result to state. This supports approval workflows, but the durable source of truth should remain SmartSpecPro tables (`work_approvals`, `work_automation_run_checkpoints`, and generic runtime checkpoints) rather than SDK-only memory.
- SDK sessions can be backed by Redis or SQLAlchemy. This is useful for adapter internals, but for Chat and Team auditability, persisted platform run state must remain in SmartSpecPro's database. SDK sessions should not become the sole durable business state.
- Tracing is built in and covers runner calls, agent spans, LLM generations, function tools, guardrails, and handoffs. The docs also warn that generation/tool spans can include sensitive data unless sensitive-data capture is disabled. Therefore Feature 101 must set `trace_include_sensitive_data=False` for production runs and use a custom trace processor that emits redacted platform trace DTOs.
- Guardrails have workflow boundaries: input guardrails apply only to the first agent, output guardrails apply only to the final agent, and tool guardrails apply to custom function-tool calls. This means SmartSpecPro cannot rely on one top-level guardrail to protect every specialist/tool/handoff path. Security-critical checks must also live in Node permission envelopes and adapter-side tool wrappers.
- Handoff input schemas can validate model-generated metadata for the handoff call, but they do not choose a different destination by themselves and do not replace application state. SmartSpecPro should use handoff metadata for traceable reasons, priority, and summary, while keeping tenant/run/permission state in `RunContextWrapper.context` or the platform execution envelope.
- OpenAI's orchestration guidance distinguishes manager-style orchestration from handoffs. For Team's plan-driven serial steps, code-controlled orchestration plus structured outputs is more deterministic than allowing an unconstrained LLM to freely route the entire workflow. For Chat, a triage/handoff pattern can be used when the specialist should own the turn.

Design implications:

- Use the SDK as the runtime loop, not as an unbounded autonomous black box.
- Keep Node as the policy and persistence authority.
- Use code-controlled plan progression for Team and SDK agents/tools for step execution, review, and repair.
- Use SDK tracing, but export only redacted, versioned events to SmartSpecPro storage.
- Use OpenAI-compatible gateway clients in the adapter and test that direct provider endpoints are rejected.
- Treat SDK upgrades as compatibility events because the SDK API and behavior can evolve.

## Codebase Findings

### Team Control Surface

Primary files:

- `apps/web/server/routers/teamRun.ts`
- `apps/web/server/routers/teamRoom.ts`
- `apps/web/server/services/runEngine.ts`

Findings:

- `teamRun.ts` exposes the Team lifecycle API. Important procedures include `start`, `pause`, `resume`, `advance`, `stop`, and `get`. These procedures funnel lifecycle operations into `runEngine`, so the router can remain thin.
- `teamRoom.ts` owns room-level reads and writes. `sendMessage` can create or resume a Team run and invoke `runEngine.advanceRun(...)` when auto-response behavior is enabled. It also exposes Team ledger/debug data through `getAutoTeamLedger`.
- `runEngine.ts` is the current orchestration runtime. It already contains planner and reviewer schemas, structured LLM calls via `callLLMStructured`, and Auto-Team trace emission through `emitAutoTeamTraceEvent`.
- Existing planner schemas already require `stepKey`, `objective`, `deliverable`, owner/reviewer ids, verification method, retry rule, evidence requirements, quality criteria, and review checklist. Feature 101 should preserve this durable plan contract while replacing the ad hoc runtime decisions below it.

Implementation implications:

- Feature 101 should route through `runEngine` rather than bypassing it.
- `runEngine.startRun` should freeze the runtime decision and persist plan/runtime metadata.
- `runEngine.advanceRun` should call a new platform runtime client that invokes the Python OpenAI Agents adapter when enabled.
- Team plan progression must remain deterministic in Node: serial steps advance only after a persisted reviewer pass.

### Team Persistence, Audit, and Trace Tables

Primary file:

- `apps/web/drizzle/schema.ts`

Relevant existing tables:

- `team_room_messages`
- `team_runs`
- `team_work_items`
- `work_approvals`
- `work_automation_run_checkpoints`
- `auto_team_execution_stages`
- `auto_team_review_records`
- `auto_team_final_results`
- `auto_team_trace_events`
- `auto_team_artifact_refs`

Findings:

- `team_room_messages` already stores `runId`, `turnType`, `visibility`, `summaryContent`, `artifactRefsJson`, `memoryRefsJson`, `metadataJson`, and `tokenUsageJson`. This is the right place to link visible chat messages to plan steps, attempts, trace ids, and checkpoints.
- `team_runs` currently stores room/team/user, execution mode, objective, constraints, status, active assistant, stop policy, approval policy, budget snapshot, summary artifact, stop reason, and timestamps. It does not yet store frozen SDK runtime metadata, trace ids, or versioned runtime state.
- `auto_team_execution_stages` already stores durable step/stage rows with `planStepKey`, `stageType`, `status`, assigned persona, expected capability family, selected skill/provider, artifact refs, attempts, claim data, deadlines, errors, and idempotency keys.
- `auto_team_review_records` already stores reviewer persona, review type, score, threshold, pass/fail, reviewed artifacts, comments, repair instructions, and idempotency.
- `auto_team_trace_events` is an append-only durable trace projection with tenant/run sequence uniqueness and idempotency uniqueness.
- `work_approvals` and `work_automation_run_checkpoints` already provide work-backed approval and resume persistence.

Implementation implications:

- Do not invent a second Team ledger. Extend existing Team/Auto-Team tables and add only the generic runtime tables needed for cross-surface Chat/Responses/shared-skill traces and checkpoints.
- Add hot-query runtime columns and a versioned `runtimeStateJson` envelope to `team_runs`.
- Use `agent_runtime_traces` as a generic redacted archive for Chat and shared runtime events, while keeping `auto_team_trace_events` as the Team-facing projection.
- Use `agent_runtime_checkpoints` only for Chat, Responses, and shared-skill non-work surfaces. Team work-backed approvals should use existing work tables.

### Chat Orchestration and Model Routing

Primary files:

- `apps/web/server/routers/chat.ts`
- `apps/web/server/services/chatService.ts`
- `apps/web/server/services/llmRouter.ts`
- `apps/web/server/services/skillExecutionPolicy.ts`
- `apps/web/server/services/skillModelFallback.ts`
- `apps/web/server/services/callLLMStructured.ts`
- `apps/web/server/services/teamRunSkillExecutor.ts`

Findings:

- Chat's `executeSkill` path already handles intent analysis, policy checks, context assembly, unified orchestrator delegation, model/provider resolution, fallback execution, and message persistence.
- Chat uses shared routing concepts with Team, including `routeRoomIntent`, `resolveSkillExecutionPolicy`, `getProviderForModel`, and `executeSkillLlmWithFallback`.
- `teamRunSkillExecutor.ts` mirrors much of the Chat runtime stack. It calls `resolveSkillExecutionPolicy`, `executeSkillLlmWithFallback`, `executeUnified`, `routeRoomIntent`, and provider routing utilities.
- `callLLMStructured.ts` already centralizes structured-output execution using `llmRouter`.

Implementation implications:

- Introduce one shared Node-side `agentRuntimeClient` contract used by both Chat and Team.
- Keep `llmRouter` and skill execution policy as the gateway/model-governance source of truth.
- Avoid hardcoded model names in the SDK runtime. The adapter should receive resolved model/gateway route metadata from Node and construct SDK model clients against the gateway.
- Legacy fallback should be a run-level rollout decision, not a hidden per-step fallback inside the SDK path.

### Python Backend and Existing SDK Boundary Pattern

Primary files:

- `python-backend/app/services/agency_swarm_adapter.py`
- `python-backend/app/services/agency_service.py`
- `python-backend/app/orchestrator/agents/__init__.py`

Findings:

- `agency_swarm_adapter.py` already demonstrates the right isolation pattern. It imports `agents`, `OpenAIChatCompletionsModel`, `ModelSettings`, and `AsyncOpenAI` inside one Python adapter boundary.
- Its `_create_model(...)` method points `AsyncOpenAI` at `NODEJS_INTERNAL_URL/v1` and uses a user token for credit attribution. This directly supports Feature 101's gateway-preservation requirement.
- The existing adapter should remain a temporary agency-only exception. Chat and Team should use a new `openai_agents_adapter.py` so the boundary is explicit and testable.

Implementation implications:

- Create a new adapter rather than expanding `agency_swarm_adapter.py`.
- Reuse the gateway-routed model-client pattern.
- Add import guard tests that allow only `openai_agents_adapter.py` and the temporary agency exception to import `agents`.
- Keep SDK dependency pinning in one Python dependency path and one lock/update process.

### Feature Flags

Primary file:

- `apps/web/shared/featureFlags.ts`

Findings:

- `TenantFeatureFlags`, `ALLOWED_FEATURE_FLAGS`, and `FEATURE_FLAG_DEFAULTS` define the platform feature flag contract.
- Most existing feature flags default to `true`, but infrastructure-sensitive rollout gates can default to `false`.

Implementation implications:

- All OpenAI Agents runtime flags must be registered in all three places.
- New runtime flags should default to `false`.
- Runtime selection must be frozen on run start and persisted so mid-run flag changes do not alter behavior.

### Testing Conventions

Relevant test files:

- `apps/web/server/routers/__tests__/teamRun.test.ts`
- `apps/web/server/routers/__tests__/teamRoom.test.ts`
- `apps/web/server/routers/__tests__/chatUnifiedWiring.test.ts`
- `apps/web/server/services/__tests__/runEngine.test.ts`
- `apps/web/server/services/__tests__/teamRunSkillExecutorUnifiedWiring.test.ts`
- `apps/web/drizzle/__tests__/workAutomationSchema.test.ts`
- `apps/web/drizzle/__tests__/autoTeamExecutionSchema.test.ts`
- `apps/web/shared/__tests__/autoTeamExecution.test.ts`
- `apps/web/shared/__tests__/agencyHybridFeatureFlag.test.ts`
- `python-backend/tests/unit/test_agency_adapter.py`
- `python-backend/tests/unit/test_agency_service.py`
- `python-backend/tests/unit/test_pre_validation_contracts.py`

Findings:

- The Node test style is contract-heavy and mock-driven, especially around routers, schema, feature flags, and service boundaries.
- Schema tests verify exact table/column/index expectations.
- Python tests use pytest, monkeypatch/patch patterns, and adapter boundary tests.

Implementation implications:

- The TDD plan should start with boundary and contract tests:
  - feature flag registration and precedence
  - schema additions and migration safety
  - import guard
  - adapter DTO validation
  - gateway-only model construction
  - run-frozen runtime selection
  - Team plan-before-execution invariant
  - structured review verdict and repair loop contract
  - idempotent trace/checkpoint persistence

## Research Conclusions

1. The spec is architecturally sound: the OpenAI Agents SDK fits the application-owned orchestration, tool, state, approval, and tracing problem.
2. The repo already has the right seams. The implementation should avoid a rewrite and instead insert a shared runtime boundary behind `runEngine`, Chat skill execution, and a new Python adapter.
3. The most important correction is to keep the SDK controlled. For Team, Node should still own deterministic plan progression and completion gates; the SDK should execute/review steps and emit structured trace/verdict outputs.
4. Gateway routing is feasible and already proven by `agency_swarm_adapter.py`.
5. Security must be designed into the boundary: signed execution envelopes, deny-by-default tools, trace redaction, no direct provider keys, and prompt-injection-aware evidence normalization.
6. The plan should be split into independently implementable sections that keep the blast radius small:
   - dependency/import boundary and adapter contract
   - runtime DTOs and Node client
   - persistence/migrations
   - feature flags/runtime selection
   - skill capability manifests
   - Chat integration
   - Team integration
   - observability/debug UI integration
   - tests, replay fixtures, and rollout gates
