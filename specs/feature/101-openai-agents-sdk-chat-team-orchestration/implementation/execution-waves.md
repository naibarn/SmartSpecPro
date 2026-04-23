# Feature 101 Execution Waves

Date: 2026-04-20
Status: Ready to execute
Planning source:
- `spec.md`
- `claude-plan.md`
- `claude-plan-tdd.md`
- `sections/index.md`
- `sections/section-01-shared-contracts-flags.md` through `sections/section-11-rollout-replay-release-gates.md`

## Purpose

This runbook turns the 11 approved Feature 101 sections into a practical implementation order that can be executed without re-interpreting the spec on every step.

The target outcome is not partial SDK adoption. The target outcome is a stable, debuggable, replay-safe orchestration runtime for:

- Chat
- Team
- Responses
- shared skill runtime

All four surfaces must use the same runtime contract, the same gateway policy, and the same traceability model, while still rolling out independently through feature flags. Media Studio prompt/custom-skill execution joins through the shared skill surface only; the real media generation pipeline stays outside Feature 101 round one.

## Non-Negotiable Guardrails

These rules apply to every wave:

1. Node must not import the OpenAI Agents SDK directly.
2. Production runtime traffic must go through the existing SmartSpecPro gateway for billing and attribution.
3. Feature 099 context engineering remains the authority for context pack construction, promotion, pruning, and memory lifecycle.
4. Team plan lock from Feature 100 remains authoritative. The SDK may execute and review steps, but it may not silently replace plan structure.
5. No silent fallback to legacy prose behavior is allowed for active SDK surfaces.
6. Schema-invalid adapter output must fail closed.
7. Shadow mode must suppress side effects while still producing comparison traces.
8. Rollout must remain per-surface:
   - Chat shadow and active
   - Team shadow and active
   - Responses shadow and active
   - shared skill runtime shadow and active
9. Existing historical rows with no SDK metadata must keep rendering safely.
10. Every wave must end with replay-safe, diff-friendly artifacts or tests before the next wave starts.

## Recommended Delivery Shape

Use five execution waves instead of trying to implement all 11 sections in a flat stream.

### Wave 1: Platform Foundation

Sections:
- `section-01-shared-contracts-flags`
- `section-02-persistence-migrations`
- `section-03-python-openai-agents-adapter`
- `section-05-skill-capability-manifests`

Why first:
- These sections define the boundary, persistence shape, adapter, and skill metadata. Every later surface depends on them.

Primary code targets:
- `apps/web/shared/featureFlags.ts`
- `apps/web/shared/agentRuntime/types.ts`
- `apps/web/shared/agentRuntime/skillManifest.ts`
- `apps/web/server/services/agentRuntime/runtimeSelection.ts`
- `apps/web/server/services/agentRuntime/redaction.ts`
- `apps/web/server/services/skillCapabilityManifestService.ts`
- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/migrations/*`
- `python-backend/app/services/openai_agents_adapter.py`
- `python-backend/app/services/openai_agents_contracts.py`
- `python-backend/app/services/openai_agents_trace.py`
- `python-backend/app/services/openai_agents_gateway_model.py`

Tests to write first:
- `apps/web/shared/__tests__/openAiAgentsRuntimeFeatureFlags.test.ts`
- `apps/web/drizzle/__tests__/agentRuntimeSchema.test.ts`
- `apps/web/shared/__tests__/skillCapabilityManifest.test.ts`
- `apps/web/server/services/__tests__/skillCapabilityManifestService.test.ts`
- `python-backend/tests/unit/test_openai_agents_import_boundary.py`
- `python-backend/tests/unit/test_openai_agents_adapter.py`
- `python-backend/tests/unit/test_openai_agents_gateway_model.py`
- `python-backend/tests/unit/test_openai_agents_trace_redaction.py`
- `python-backend/tests/unit/test_openai_agents_stream_resume.py`

Exit criteria:
- All ten runtime flags exist and default to `false`.
- Shared TypeScript and Python DTO fixtures validate on both sides.
- Adapter can only construct gateway-backed model clients.
- Trace redaction and version reporting exist.
- Initial skill manifests cover the high-priority runtime-selectable skills.
- Contract versions and step-link DTOs are defined centrally.
- Media Studio prompt/custom-skill manifests include ownership metadata and explicit origin/entry-point support.
- Persistence schema is additive and historical rows still render as legacy.

Wave risks:
- Letting gateway exceptions leak into the adapter.
- Adding schema columns without safe null handling for old rows.
- Building skill manifests too late, which would force surface integrations to guess selection logic.

### Wave 2: Shared Runtime Bridge

Sections:
- `section-04-node-runtime-client`

Why second:
- After the contract, storage, and Python adapter exist, Node needs a single bridge that every surface can reuse.

Primary code targets:
- `apps/web/server/services/agentRuntime/client.ts`
- `apps/web/server/services/agentRuntime/requestBuilder.ts`
- `apps/web/server/services/agentRuntime/traceService.ts`
- `apps/web/server/services/agentRuntime/checkpointService.ts`
- `apps/web/server/services/agentRuntime/teamProjection.ts`

Tests to write first:
- `apps/web/server/services/__tests__/agentRuntimeClient.test.ts`
- `apps/web/server/services/__tests__/agentRuntimeTraceService.test.ts`
- `apps/web/server/services/__tests__/agentRuntimeCheckpointService.test.ts`
- `apps/web/server/services/__tests__/agentRuntimeTeamProjection.test.ts`

Exit criteria:
- Node can build normalized runtime requests from platform state.
- Feature 099 context pack builder is invoked before runtime execution.
- Adapter responses are validated before persistence.
- Trace and checkpoint services persist redacted, idempotent records.
- Backpressure, retry, and shadow side-effect suppression rules are enforced centrally.
- Version negotiation and mixed-deploy fail-closed behavior are enforced centrally.
- Team projection can persist explicit step links instead of only plan-summary linkage.

Wave risks:
- Allowing each surface to build its own custom request shape.
- Letting adapter output bypass validation and flow directly into persistence.
- Coupling checkpoint logic to Team-only behavior instead of a generic bridge plus Team projection.

### Wave 3: Surface Integrations

Sections:
- `section-06-chat-runtime-integration`
- `section-07-team-runtime-integration`
- `section-08-responses-runtime-integration`
- `section-09-shared-skill-runtime-integration`

Why third:
- Once the shared bridge is stable, each surface can plug into it without rebuilding orchestration logic.

Recommended order inside the wave:
1. Chat
2. Responses
3. shared skill runtime
4. Team

Reasoning:
- Chat and Responses validate the generic runtime path with lower orchestration complexity.
- shared skill runtime hardens typed output and recursion controls before Team depends on similar guarantees.
- Team is the highest-risk surface because it must enforce plan lock, owner/reviewer loops, repair logic, and completion gates.

#### 3A. Chat

Primary code targets:
- `apps/web/server/routers/chat.ts`
- `apps/web/server/services/chatService.ts`
- `apps/web/server/services/agentRuntime/chatRuntimeOrchestrator.ts`

Tests to write first:
- `apps/web/server/routers/__tests__/chatOpenAiAgentsRuntime.test.ts`
- `apps/web/server/routers/__tests__/chatOpenAiAgentsRuntimeShadow.test.ts`
- `apps/web/server/services/__tests__/chatOpenAiAgentsReplay.test.ts`

Exit criteria:
- Chat shadow writes comparison traces without changing visible output.
- Chat active mode persists SDK output as source of truth.
- Chat approvals use generic runtime checkpoints.
- Force rollback affects only new Chat turns.

#### 3B. Responses

Primary code targets:
- `apps/web/server/_core/responsesRoutes.ts`
- `apps/web/server/services/agentRuntime/responsesRuntimeOrchestrator.ts`

Tests to write first:
- `apps/web/server/_core/__tests__/responsesOpenAiAgentsRuntime.test.ts`
- `apps/web/server/_core/__tests__/responsesOpenAiAgentsRuntimeShadow.test.ts`
- `apps/web/server/services/__tests__/responsesOpenAiAgentsReplay.test.ts`

Exit criteria:
- Responses shadow emits comparison traces with schema-validation status.
- Active mode preserves caller-visible schema contracts.
- No prose fallback is used when structured output validation fails.

#### 3C. Shared skill runtime

Primary code targets:
- `apps/web/server/services/skillExecutor.ts`
- `apps/web/server/services/callLLMStructured.ts`
- `apps/web/server/services/agentRuntime/skillRuntimeOrchestrator.ts`
- `apps/web/server/routers/skills.ts`
- `apps/web/client/src/pages/MediaStudio.tsx`
- `apps/web/client/src/lib/mediaStudioSelection.ts`
- `apps/web/client/src/lib/mediaStudioSkillMatching.ts`

Tests to write first:
- `apps/web/server/services/__tests__/skillRuntimeOpenAiAgents.test.ts`
- `apps/web/server/services/__tests__/callLLMStructuredOpenAiAgents.test.ts`
- `apps/web/server/services/__tests__/skillRuntimeOpenAiAgentsReplay.test.ts`

Exit criteria:
- Internal/shared skill execution can run through `surface = skill`.
- Typed output contracts are preserved.
- Recursion and nested runtime calls are bounded.
- Shadow mode is side-effect safe and replayable.
- Media Studio `enhancePrompt` and `executeCustomSkill` can route through the shared runtime with `originSurface = media_studio`.
- Real media generation APIs remain outside Feature 101 active routing.

#### 3D. Team

Primary code targets:
- `apps/web/server/services/runEngine.ts`
- `apps/web/server/routers/teamRun.ts`
- `apps/web/server/routers/teamRoom.ts`
- `apps/web/server/services/agentRuntime/teamRuntimeOrchestrator.ts`

Tests to write first:
- `apps/web/server/routers/__tests__/teamRunOpenAiAgentsRuntime.test.ts`
- `apps/web/server/routers/__tests__/teamRunOpenAiAgentsShadow.test.ts`
- `apps/web/server/services/__tests__/teamRunPlanLock.test.ts`
- `apps/web/server/services/__tests__/teamRunRepairLoop.test.ts`
- `apps/web/server/services/__tests__/teamRunCompletionGate.test.ts`
- `apps/web/server/services/__tests__/teamRunOpenAiAgentsReplay.test.ts`

Exit criteria:
- Team persists reviewed plan artifact before first owner execution.
- Each step records owner output, reviewer verdict, repair attempts, and terminal reason.
- Team cannot skip unfinished steps because of round pressure.
- Completion requires all plan steps to pass their gates.
- No hidden fallback review or hidden fallback completion is allowed.

Wave risks:
- Surfacing Chat or Responses first but not locking Team plan semantics before touching Team execution.
- Reintroducing legacy fallback behavior inside active paths.
- Letting Team hit max rounds before visiting every required step.

### Wave 4: Ledger, UI, and Debug Surfaces

Sections:
- `section-10-ledger-ui-debug`

Why fourth:
- UI should be built on real persisted runtime data, not guessed placeholders.

Primary code targets:
- `apps/web/client/src/components/orchestrator/TeamRoomView.tsx`
- `apps/web/client/src/components/orchestrator/RoomWorkflowPanel.tsx`
- `apps/web/client/src/pages/Teams.tsx`
- related Team ledger/debug DTO producers on the server side
- Responses/shared-skill admin/debug views that consume runtime metadata

Tests to write first:
- `apps/web/client/src/components/orchestrator/__tests__/TeamRoomView.test.tsx`
- `apps/web/client/src/components/orchestrator/__tests__/RoomWorkflowPanel.runtimeState.test.tsx`
- any missing server DTO tests for runtime metadata rendering

Exit criteria:
- Persisted plan appears before execution catches up.
- Step cards show owner, reviewer, latest result, review notes, evidence requirements, retry rule, and terminal reason.
- Linked chat lines and linked execution lines point to the matching persisted records instead of only the plan header.
- Scroll, focus, and jump behavior remain usable.
- Historical runs without runtime metadata still render safe empty states.
- Each step exposes independent plan-step, owner-result, reviewer-result, repair, checkpoint, and terminal links when those records exist.

Wave risks:
- Building UI on draft-only data that does not exist in the durable ledger.
- Creating focus loops that trap the user on the plan card.
- Showing step headers without real linked execution evidence.

### Wave 5: Replay, Rollout, Upgrade, and Release Gates

Sections:
- `section-11-rollout-replay-release-gates`

Why last:
- Release gates only become meaningful after all surfaces and debug views produce stable runtime artifacts.

Primary code targets:
- replay fixtures under the relevant server and Python test areas
- rollout and comparison utilities
- upgrade validation docs or scripts
- compatibility suites for Chat, Team, Responses, and shared skill runtime

Tests to write first:
- replay parity suites for all four surfaces
- flag precedence suites for all four surfaces
- rollback validation suites for all four surfaces
- SDK upgrade fixture comparison suites

Exit criteria:
- Each surface has replay fixtures for success, failure, checkpoint, and schema drift where applicable.
- Per-surface shadow and active rollout can be enabled independently.
- Force rollback restores legacy behavior for new executions only.
- SDK upgrades require fixture comparison before release.
- Release checklist exists for gateway, tracing, replay, rollback, and performance regression checks.
- Numeric promotion thresholds are documented and testable.
- Mixed-deploy `current/current-1` compatibility is part of the release gate.
- Operator recovery playbook exists for the highest-risk failure modes.

Wave risks:
- Treating rollout as a final toggle instead of a gated validation system.
- Missing fixtures for Responses and shared skill runtime.
- Not recording enough version metadata to debug SDK drift later.

## Implementation And Manifest Ownership Matrix

The implementation run should keep these owners explicit from the start:

| Area | Primary owner | Notes |
|---|---|---|
| Runtime contracts, flags, version negotiation | Platform backend / orchestration | Own shared DTOs, compatibility helpers, and mixed-deploy rules |
| Python adapter and gateway client | Python backend | Own SDK integration, trace redaction, and gateway-only execution |
| Persistence, trace projection, step links | Platform backend / orchestration | Own DB writes, idempotency, Team projection, and message metadata |
| Team ledger and side panel | Web client / Team UX | Own step-link navigation, legacy rendering, and operator usability |
| Skill manifest schema and loader | Skill registry / platform | Own manifest validation and active/shadow readiness diagnostics |
| Media Studio prompt-skill manifests | Media Studio owner | Own `originSurface = media_studio` manifest coverage for prompt/custom-skill paths |
| Replay fixtures, rollout docs, recovery playbook | QA / Observability / DevEx | Own thresholds, runbooks, and promotion evidence |

## Critical Path

The critical path is:

1. shared contracts and flags
2. additive persistence
3. Python adapter
4. Node runtime bridge
5. Team integration
6. ledger and debug projection
7. replay and rollout gates

Chat, Responses, and shared skill runtime can move earlier within Wave 3, but Team still governs whether the full orchestration promise of Feature 101 is achieved.

## Suggested Commit Boundaries

Use one commit per section, not one commit per wave.

Recommended commit order:

1. `section-01-shared-contracts-flags`
2. `section-02-persistence-migrations`
3. `section-03-python-openai-agents-adapter`
4. `section-05-skill-capability-manifests`
5. `section-04-node-runtime-client`
6. `section-06-chat-runtime-integration`
7. `section-08-responses-runtime-integration`
8. `section-09-shared-skill-runtime-integration`
9. `section-07-team-runtime-integration`
10. `section-10-ledger-ui-debug`
11. `section-11-rollout-replay-release-gates`

This keeps the hardest integration, Team, after the shared runtime has already been exercised on simpler surfaces.

## Definition of "Ready to Start Coding"

Execution can begin immediately if these conditions hold:

- Feature 101 docs remain the source of truth.
- Work stays inside files owned by each section unless a dependency requires a minimal bridge change.
- Tests are written before or alongside code for each section.
- No direct provider access path is introduced.
- No hidden legacy fallback is added to satisfy tests.

## Recommended First Section To Implement

Start with `section-01-shared-contracts-flags`.

Why:
- It is the root dependency for every other section.
- It gives a stable DTO and flag vocabulary to both TypeScript and Python.
- It creates an early test harness that will catch scope drift before heavier integration work starts.

Immediately after section 01, open parallel work on:

- `section-02-persistence-migrations`
- `section-03-python-openai-agents-adapter`
- `section-05-skill-capability-manifests`

Then merge back into `section-04-node-runtime-client`.

## Done Means More Than "SDK Imports Work"

Feature 101 is only truly complete when all of the following are true at the same time:

- Chat works through the new runtime.
- Team executes every required step and review loop through the locked plan.
- Responses preserves structured contracts through the same runtime.
- shared skill execution preserves typed contracts through the same runtime.
- UI and debug surfaces can explain what happened.
- replay and rollout gates can detect SDK drift before production rollout.
