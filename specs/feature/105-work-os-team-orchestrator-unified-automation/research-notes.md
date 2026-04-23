# Research Notes

## Scope of codebase research

This planning pass reviewed the current implementation across:

- `Work OS` request/case/run creation and launch flow
- `Team` room/run planning and orchestration
- `Chat` conversation and memory surfaces
- `Document Management` / library context-pack plumbing
- `Media Studio` and video editing surfaces
- `Skill Marketplace`, `Skill Studio`, and skill manifests
- `Agency Swarm`, hybrid `ADK`, and `Workflow` execution
- `Workpack` intake, compilation, replay, readiness, and learning

No web research was needed because the request is about the local codebase architecture.

## Current-state findings

### 1. Work OS already supports review-before-run

Relevant modules:

- `apps/web/server/routers/workOs.ts`
- `apps/web/server/services/workOsService.ts`
- `apps/web/server/services/workAutomationFabricService.ts`
- `apps/web/server/services/workAutomationPolicyService.ts`
- `apps/web/client/src/pages/WorkRequest.tsx`
- `apps/web/client/src/pages/MyRequests.tsx`

What already exists:

- `workOs.createRequest` accepts `linkedConversationIds`, `linkedWorkpackRunIds`, and `linkedRoleRoutineRunIds`.
- `workOsService.createWorkRequest()` persists the request and linked case.
- `WorkRequest.tsx` keeps creation and automation launch separate. The user must click `Start automation`.
- `workOs.createAutomationRun` creates a `workAutomationRun` and then starts kickoff.
- Kickoff creates an `auto_team` room and immediately starts `runEngine.startRun(... executionMode: "auto_team")`.

What is missing:

- The intake UI does not expose `linkedConversationIds`, so the request model supports chat linkage but the main request form does not.
- The launch policy is still narrow and content-production-shaped.
- The request review page does not show a compiled, explainable automation brief assembled from chat, memory, docs, and prior runs.

### 2. Team run planning exists, but it starts from too little context

Relevant modules:

- `apps/web/server/services/runEngine.ts`
- `apps/web/server/services/teamRunSkillExecutor.ts`
- `apps/web/client/src/components/orchestrator/TeamRoomView.tsx`
- `apps/web/client/src/components/orchestrator/AutoTeamLedgerPanel.tsx`

What already exists:

- `runEngine.startRun()` and `advanceRun()` support `auto_team`.
- Auto-team planning generates a plan artifact, reviews it, persists a snapshot, and posts the plan to the room.
- Autonomous rooms can auto-select exploration options and continue immediately.
- The team room UI already supports live room messages, plan visibility, and workflow state panels.

What is missing:

- The first plan is primarily derived from `room.goalPrompt`, work items, and team roster rather than a compiled intake brief that reflects the full product context.
- `resolveTeamOrchestratorRoute()` still routes with step heuristics, keyword checks, and late intent classification instead of a full capability-selection graph.
- The team room still exposes manual run controls because the system does not yet have enough confidence in preflight planning.

### 3. Capability plumbing already exists, but it is fragmented

Relevant modules:

- `apps/web/server/services/skillCapabilityManifestService.ts`
- `apps/web/server/services/skillStudioService.ts`
- `apps/web/server/services/contextPackBuilder.ts`
- `apps/web/server/services/agentRuntime/requestBuilder.ts`
- `apps/web/server/services/libraryContextPackService.ts`
- `apps/web/server/routers/workflow.ts`
- `apps/web/server/services/agencyHybridCompile.ts`
- `apps/web/server/routers/videoEditorProjects.ts`
- `apps/web/client/src/pages/MediaStudio.tsx`

What already exists:

- Skill capability manifests and manifest-based selection logic exist.
- Skill Studio can create and improve skills, and the maintenance pipeline exists.
- Library context packs can be resolved into runtime context.
- Workflow compile/execute routes exist and proxy to the Python LangGraph runtime.
- Agency hybrid compile supports `agency_swarm` plus `adk2`.
- Media Studio and the video editor already exist as runtime surfaces.

What is missing:

- There is no single orchestrator catalog that normalizes all of these surfaces into one planning model.
- `contextPackBuilder` only resolves library context packs; it does not assemble a governed pack from linked chat conversations, workpack replay/readiness, or request-specific evidence sources.
- `workAutomationPolicyService` currently recognizes surfaces like `skill`, `agency`, `browser`, `document_management`, `media_studio`, and `video_editor`, but not `workflow` or `skill_studio`.

### 4. Chat and memory systems are strong inputs, but they are not upstreamed into Work OS well enough

Relevant modules:

- `apps/web/client/src/pages/Chat.tsx`
- `apps/web/server/routers/chat.ts`
- `apps/web/server/routers/memory.ts`
- `apps/web/server/services/memoryService.ts`
- `apps/web/server/services/memoryArchiveService.ts`

What already exists:

- Conversations have project scope and message history.
- There is a memory system with long-memory modes, summaries, archive search, and scoped memory.
- Work OS request records can already link conversation ids.

What is missing:

- The standard chat UI does not provide a first-class `Send to Work OS` flow that compiles a work brief from the active conversation.
- The Team launch path does not deliberately retrieve conversation memory and summaries as part of preflight planning.

### 5. Workpack is a major reusable governance layer

Relevant modules:

- `apps/web/server/services/workpackIntakeService.ts`
- `apps/web/server/services/workpackCompilerService.ts`
- `apps/web/server/services/workpackLearningService.ts`
- `apps/web/server/routers/workpack.ts`

What already exists:

- Structured workpack intake and extracted fields
- Execution-plan compilation with runtime path preferences and idempotency policy
- Replay, readiness, promotion eligibility, connector validation, exception handling, and learning proposals
- Improvement handoff into `skillStudioService`

What is missing:

- Workpack governance is not yet the backbone of Team preflight planning.
- Repeated successful Team runs are not systematically transformed into reusable workpacks or skill upgrades.

### 6. Security primitives already exist but are not yet elevated into the orchestration spec

Relevant modules:

- `apps/web/server/_core/context.ts`
- `apps/web/server/services/contextPackBuilder.ts`
- `apps/web/server/services/agentRuntime/requestBuilder.ts`
- `apps/web/server/routes/workflowWorkerRuntime.ts`

What already exists:

- private-vault unlock state is already carried at request-context level
- runtime request building already strips obviously unsafe plan-context keys
- library context-pack resolution already fails closed when private-vault state is unavailable
- workflow worker-runtime routes already have dedicated authentication logic

What is missing:

- the new orchestration architecture does not yet codify these protections as mandatory launch/runtime rules
- privileged surfaces such as `workflow` and `skill_studio` need explicit governance rules before they become first-class planner targets
- the current kickoff path can fail when no team is resolved, but the new spec had not yet turned that into a formal fail-closed review state

### 7. Current Work OS contracts and preview ACLs constrain how fast new surfaces can ship

Relevant modules:

- `apps/web/server/services/workAutomationPolicyService.ts`
- `apps/web/server/services/workAutomationFabricService.ts`
- `apps/web/server/routers/workOs.ts`
- `apps/web/drizzle/schema.ts`

What already exists:

- Work OS persists automation step surfaces through a fixed `workAutomationSurface` enum that currently ends at `video_editor`
- router schemas and service unions match that same surface list
- `createAutomationRun` is requester/admin gated
- `resolveAutomationPlan` is currently domain-admin only

What is missing:

- there is no migration plan yet for introducing `workflow` and `skill_studio` into shared unions, router schemas, and persisted step records
- there is no requester-safe preview access policy for compiled brief / capability-plan review
- there is no explicit invalidation rule for previews that become stale after request edits
- team-resolution precedence is implicit in current kickoff code instead of exposed as a stable contract

## Synthesis

The repo already contains nearly every building block required for a strong automation product:

- reviewed work intake
- team-room execution
- chat and memory
- knowledge-vault context packs
- media generation
- video editing
- skill marketplace and skill maintenance
- agency swarm plus ADK
- workflow execution
- workpack replay and learning

The real gap is not "missing tools". The gap is the absence of a unified orchestration brain that:

1. compiles a reviewed work brief from upstream context,
2. builds a governed capability plan across all execution surfaces,
3. launches Team with a precomputed execution graph instead of a thin prompt,
4. learns from repeated runs by feeding successful paths into workpack and skill improvement systems.
