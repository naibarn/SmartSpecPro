# Research: Feature 130 Hybrid Flow OpenAI Agents SDK Runtime

Date: 2026-07-02

## Scope

This research supports the implementation plan for upgrading Hybrid Flow from a simulated Agency-coupled preview into a real OpenAI Agents SDK-backed execution runtime.

The source spec is `specs/feature/130-hybrid-flow-openai-agents-sdk-runtime/spec.md`.

## Codebase Findings

### Current Hybrid Entry And Runtime

Relevant files:

- `apps/web/client/src/components/chat/HybridOrchestrationCard.tsx`
- `apps/web/client/src/components/chat/__tests__/HybridOrchestrationCard.test.tsx`
- `apps/web/server/routers/hybridOrchestration.ts`
- `apps/web/server/services/hybridOrchestrationRuntime.ts`
- `apps/web/shared/orchestration/hybridOrchestration.ts`

Findings:

- The Chat card currently calls `trpc.agency.list` and disables Hybrid when no published Agency exists.
- The card creates a preview token with `agencyId` and navigates to `/agencies/:id/hybrid-preview`.
- The router requires `agencyId` in `createPreviewToken`.
- The runtime stores preview and execution records in Redis under `hybrid:preview:*` and `hybrid:execution:*`.
- `buildStartExecutionState` auto-marks non-human stages as completed and waits only at approval when required.
- The current runtime is therefore an orchestration-state preview, not real stage execution.

Planning implication:

- First implementation must remove the Chat-origin Agency dependency before wiring real execution.
- Existing `/agencies/:id/hybrid-preview` behavior must remain readable or redirect safely.
- Runtime work must replace auto-completion with a durable stage runner.

### OpenAI Agents SDK Runtime Boundary

Relevant files:

- `apps/web/server/services/agentRuntime/client.ts`
- `apps/web/shared/agentRuntime/types`
- `python-backend/app/services/openai_agents_adapter.py`
- `python-backend/app/services/openai_agents_contracts.py`
- `python-backend/app/services/openai_agents_gateway_model.py`
- `python-backend/app/services/openai_agents_trace.py`
- `python-backend/app/services/openai_agents_version.py`
- `python-backend/requirements.txt`
- `specs/feature/101-openai-agents-sdk-chat-team-orchestration/*`

Findings:

- Feature 101 already established the OpenAI Agents SDK as the shared runtime boundary.
- Node calls Python through `AgentRuntimeClient` operations: `run`, `runStreamed`, `resume`, `cancel`, and `health`.
- Health already exposes adapter version, SDK version, and supported contract/schema versions.
- The Python adapter imports SDK symbols only inside `openai_agents_adapter.py`.
- The adapter builds SDK model objects through SmartSpecPro gateway model configuration rather than direct provider credentials.
- The adapter already normalizes response, trace, cancel, resume, and SDK version metadata.

Planning implication:

- Feature 130 should extend the existing runtime contract instead of creating a separate Hybrid adapter.
- Hybrid-specific request metadata should be represented as a new surface/entry point and structured stage envelope.
- Node/Python current and current-1 compatibility must be preserved.

### Chat Routing And Direct Skill Guardrails

Relevant files:

- `apps/web/shared/chatSkillRouting.ts`
- `apps/web/client/src/components/chat/chatLocalRouting.ts`
- `apps/web/client/src/components/chat/chatLocalRouting.test.ts`
- `apps/web/client/src/components/chat/ChatView.tsx`
- `apps/web/server/routers/chat.ts`
- `apps/web/skills/image-creator/SKILL.md`
- `apps/web/skills/video-creator/SKILL.md`

Findings:

- Chat local routing already has tests for direct image generation commands and model-selection questions.
- ChatView resolves direct image/video media requests to `image-creator` or `video-creator` with `executionMode: "media-generate"` before normal intent routing.
- Prior regressions came from auto-detect skill behavior treating image/video creation as normal chat.
- Prompt enhancement must remain a direct executor/skill path unless the user asks for staged review, alternatives, approval, or commit.

Planning implication:

- Routing fixtures must be the first TDD gate.
- Hybrid must be offered only after direct media, prompt enhance, slash command, and direct skill checks fail or yield a multi-stage intent.

### Durable Persistence Patterns

Relevant files:

- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/schema.js`
- `workApprovals`
- `workAutomationRunCheckpoints`
- `workAutomationRunSteps`
- `autoTeamExecutionStages`
- `specs/feature/101-openai-agents-sdk-chat-team-orchestration/claude-research.md`

Findings:

- Work OS has durable approval and resume checkpoint tables.
- Auto-Team has durable ordered stage history, route decisions, trace events, artifact refs, retry and idempotency fields.
- Feature 101 recommends not inventing a second Team ledger and using generic runtime traces/checkpoints where cross-surface behavior matters.

Planning implication:

- Feature 130 may create `hybridExecutions` and `hybridExecutionStages`, but should reuse existing approval/checkpoint patterns where practical.
- Redis should become cache/preview compatibility only, not source of truth for started executions.
- Migrations must be additive and follow expand -> dual-read/backfill -> cutover -> contract.

### Existing Planning Conventions

Relevant references:

- `specs/feature/101-openai-agents-sdk-chat-team-orchestration/sections/*`
- `specs/feature/071-openclaw-external-runtime-integration/sections/section-08-rollout-migration-and-regression-matrix.md`
- `specs/feature/120-hyperframes-creative-systems-overlay-audio-presets/reviews/spec-to-plan-traceability-matrix.md`

Findings:

- Large features are split into section files with clear ownership, dependencies, TDD expectations, and acceptance checks.
- Release gates should include replay fixtures, rollback validation, version metadata, operator recovery, and compatibility windows.
- UI-affecting sections need state, responsive, accessibility, and browser evidence requirements.

## Web / Dependency Findings

OpenAI Agents Python:

- Repository: `openai/openai-agents-python`
- Package: `openai-agents`
- Latest observed release during spec preparation: `v0.17.7` on 2026-06-24
- Current project baseline observed during spec preparation: `openai-agents==0.17.4`

Planning implication:

- Implementation must re-check the latest stable release at the time of coding.
- Dependency must be exactly pinned.
- SDK default model/runtime behavior must not be relied on; SmartSpecPro must pass explicit model/runtime config.
- SDK upgrade should be gated by replay fixtures, adapter tests, rollback validation, and Feature 101 regression tests.

## Testing Context

Observed test patterns:

- Frontend/client tests use Vitest and React Testing Library style files such as `HybridOrchestrationCard.test.tsx` and `chatLocalRouting.test.ts`.
- Web server tests live under `apps/web/server/services/__tests__` and router/service tests commonly use focused Vitest commands.
- Python backend tests live under `python-backend/tests/unit`.
- Existing verification examples use focused commands such as:
  - `cd apps/web && npm test -- chatLocalRouting.test.ts`
  - `cd apps/web && npm test -- HybridOrchestrationCard.test.tsx`
  - `cd python-backend && pytest ...`

Plan sections should write tests before implementation and keep verification focused per changed domain.

## Key Risks

1. Reintroducing Agency dependency through Chat-origin Hybrid.
2. Creating a second SDK integration instead of extending Feature 101.
3. Routing direct media or prompt enhancement into Hybrid.
4. Treating LLM output as a commit executor.
5. Persisting only Redis state and losing started executions.
6. SDK upgrade changing defaults without SmartSpecPro explicit config.
7. Mixed Node/Python deploy producing unsupported contract versions.
8. UI promising real stage output before backend runtime exists.

