# Feature 130: Hybrid Flow OpenAI Agents SDK Runtime

Version: 0.1
Date: 2026-07-02
Status: Superseded — implementation governed by Feature 151
Depends-on: 088-agentops-tracing-evaluation-and-release-gates, 099-context-engineering-ready-chat-and-team, 100-team-orchestration-audit-trail-and-completion, 101-openai-agents-sdk-chat-team-orchestration, 105-work-os-team-orchestrator-unified-automation, 106-openai-agents-python-native-skill-system
Audience: Chat UX, Hybrid Orchestration, Agent Runtime, Python Backend, Skill Runtime, Agency Migration, Product, QA, Observability

> **Superseded decision (2026-08-18):** Feature 151 is now the governing
> specification for the Agents SDK Orchestra and Agency Swarm decommission.
> This document remains as the Hybrid Flow implementation history. Any line
> that describes Agency Swarm as a future fallback must be read as migration
> compatibility only and must not permit new Agency execution.

---

## 1. Executive Summary

Hybrid Flow currently behaves like a planning and approval preview, not a true execution runtime. Chat can detect a possible hybrid workflow, create a preview token, open an Agency route, start an execution, and advance stage status, but the runtime does not actually execute workflow, swarm, validation, or commit stages. It auto-marks stages through a Redis-backed state machine.

This feature upgrades Hybrid Flow into a production-grade runtime backed by the existing OpenAI Agents SDK adapter introduced by Feature 101. Hybrid Flow must become independent from legacy Agency workflow routing and must execute real stage work through the shared agent runtime contract.

The target outcome:

- Chat uses precise routing to decide when Hybrid Flow is appropriate.
- Direct skill commands such as `create image:` and `create video:` never route to Hybrid Flow.
- Hybrid Flow runs real workflow, swarm, validation, approval, and commit stages.
- OpenAI Agents SDK is the primary runtime boundary through `python-backend/app/services/openai_agents_adapter.py`.
- Agency Swarm is not a new-runtime fallback. Existing records may be exported
  or rendered read-only during migration, but all new work uses the Orchestra.
- Hybrid Flow exposes durable outputs, traceability, approval checkpoints, stage artifacts, cost metadata, and replay evidence.

---

## 2. Current State

### 2.1 What Works Today

Chat can:

- detect a possible hybrid workflow through intent routing
- show `HybridOrchestrationCard`
- create a preview token through `trpc.hybridOrchestration.createPreviewToken`
- navigate to `/agencies/:id/hybrid-preview`
- start a hybrid execution through `trpc.hybridOrchestration.startExecution`
- show stage status and allow approval/reject/advance/cancel actions

The server has:

- `apps/web/server/routers/hybridOrchestration.ts`
- `apps/web/server/services/hybridOrchestrationRuntime.ts`
- shared contracts in `apps/web/shared/orchestration/hybridOrchestration.ts`

### 2.2 What Does Not Work Yet

Hybrid Flow does not currently execute actual stage work. It does not:

- call OpenAI Agents SDK
- call the shared agent runtime client
- call a skill, workflow, team, media, or commit executor per stage
- persist stage outputs beyond status notes
- validate outputs with structured review gates
- run a true swarm or multi-agent critique/synthesis loop
- commit final artifacts through platform-owned executors

### 2.3 Agency Coupling

Current Hybrid Flow is coupled to Agency surfaces:

- `HybridOrchestrationCard` queries `trpc.agency.list`
- it selects the first published agency
- it creates a preview token with `agencyId`
- it navigates to `/agencies/:id/hybrid-preview`

This makes Hybrid Flow appear agency-owned even when the user starts from Chat. The target runtime must be independent from Agency workflow. Agency may use Hybrid Flow later as one surface, but Chat must not depend on Agency routes or published agencies to run Hybrid Flow.

### 2.4 Dependency Overlap

The repo already has:

- `python-backend/app/services/openai_agents_adapter.py`
- `python-backend/app/services/agency_swarm_adapter.py`
- `python-backend/requirements.txt` with `openai-agents==0.17.4`
- `python-backend/requirements.txt` with `agency-swarm==1.8.0`

Feature 101 explicitly defines OpenAI Agents SDK as the shared runtime boundary and treats `agency_swarm_adapter.py` as an agency-only temporary exception. This feature follows that decision.

---

## 3. Product Goals

1. Make Hybrid Flow useful for real complex work, not just status simulation.
2. Keep simple Chat commands fast and predictable.
3. Give users confidence by showing actual stage outputs, evidence, review results, and approval points.
4. Make Hybrid Flow independent from legacy Agency workflow.
5. Use OpenAI Agents SDK as the standard runtime path.
6. Preserve product controls: tenant policy, credits, model governance, permissions, audit, traces, checkpoints, and rollback.
7. Provide a clear migration path away from `agency-swarm`.

---

## 4. Non-Goals

- Agency UI/dependency removal is governed by Feature 151's decommission gate;
  this feature may retain only a read-only historical redirect during migration.
- Do not create new Agency Swarm runs or treat it as an automatic fallback.
- Do not let frontend code call Python or OpenAI Agents SDK directly.
- Do not bypass SmartSpecPro model gateway, billing, or provider governance.
- Do not route direct media generation commands into Hybrid Flow.
- Do not make Hybrid Flow the default for every multi-step-looking phrase without confidence gates.

---

## 5. Locked Product Decisions

1. OpenAI Agents SDK is the primary Hybrid runtime.
2. Python backend remains the only place that imports SDK packages.
3. Hybrid Flow must call the existing agent runtime adapter boundary, not import or instantiate SDK objects in Node.
4. Chat must not depend on Agency workflow to run Hybrid Flow.
5. `agency-swarm` is migration-only and read-only; it must not be selected for
   new Hybrid or skill execution.
6. Direct skill routing wins over Hybrid Flow.
7. Hybrid Flow requires structured stage outputs, not only prose.
8. Human approval must use durable checkpoints and must be resumable.
9. Commit stages must execute only through platform-owned executors with explicit side-effect permissions.
10. Every Hybrid execution must be traceable, replayable, and cancellable.

---

## 6. Target Architecture

### 6.1 High-Level Flow

```text
Chat
  -> skill detector
  -> complexity classifier
  -> hybrid planner
  -> hybrid runtime
  -> agent runtime client
  -> Python openai_agents_adapter.py
  -> OpenAI Agents SDK
  -> normalized stage result
  -> checkpoint / approval / commit executor
  -> Chat or Hybrid Workspace UI
```

### 6.2 Runtime Ownership

Node owns:

- auth
- tenant policy
- model and provider selection
- gateway attribution
- credit budget envelope
- allowed tools and skills
- side-effect permissions
- execution state
- audit and trace persistence
- human approval checkpoints

Python owns:

- OpenAI Agents SDK imports
- agent construction
- tool and handoff registration
- SDK runner invocation
- SDK trace normalization
- structured response normalization

### 6.3 New Hybrid Runtime Surface

Add a first-class runtime surface:

```ts
surface: "hybrid"
originSurface: "chat" | "agency" | "work_os" | "review_center"
entryPoint:
  | "hybrid_plan"
  | "hybrid_stage_workflow"
  | "hybrid_stage_swarm"
  | "hybrid_stage_validate"
  | "hybrid_stage_commit"
  | "hybrid_resume"
```

This should extend the shared agent runtime contract rather than creating a separate Hybrid-only dialect.

### 6.4 Alignment With Feature 101

Feature 130 must reuse the OpenAI Agents SDK runtime introduced by Feature 101. It must not add a second SDK bridge, a parallel Python service, or a Hybrid-only model gateway.

Implementation requirements:

- use `apps/web/server/services/agentRuntime/client.ts` as the Node runtime boundary
- extend `python-backend/app/services/openai_agents_adapter.py` for Hybrid stage execution
- keep all model/provider routing under SmartSpecPro gateway policy
- move `agency_swarm_adapter.py` behind a temporary read-only migration worker;
  do not expand `agency-swarm` into Chat, Team, shared skill runtime, or new
  Hybrid execution

If Feature 101 contract fields are insufficient, Feature 130 should version the shared runtime contract instead of adding an ad hoc Hybrid payload.

### 6.5 Existing File Ownership Map

The first implementation should touch the smallest set of known boundaries:

| Area | Current file | Required change |
|---|---|---|
| Chat Hybrid entry | `apps/web/client/src/components/chat/HybridOrchestrationCard.tsx` | remove hard dependency on `trpc.agency.list`; create neutral Hybrid preview token |
| Hybrid route | `apps/web/client/src/pages/HybridOrchestrationPreview.tsx` | support `/hybrid/preview` and `/hybrid/:executionId` without Agency id |
| Hybrid router | `apps/web/server/routers/hybridOrchestration.ts` | allow Chat-origin preview/start/resume/cancel without `agencyId` |
| Hybrid coordinator | `apps/web/server/services/hybridOrchestrationRuntime.ts` | replace simulated stage completion with real stage execution orchestration |
| Agent runtime client | `apps/web/server/services/agentRuntime/client.ts` | reuse `run`, `runStreamed`, `resume`, `cancel`, and `health` for Hybrid stages |
| Python SDK adapter | `python-backend/app/services/openai_agents_adapter.py` | add Hybrid surface, stage metadata, role graph, and structured result support |
| Agency migration worker | `python-backend/app/services/agency_migration_export.py` | export/reconcile old records only; never execute new work |
| Skill routing | `apps/web/shared/chatSkillRouting.ts` and Chat local routing tests | keep direct image/video/skill commands out of Hybrid |

Any implementation plan must call out additional files before editing them.

### 6.6 Implementation Ownership Matrix

Keep ownership explicit so Hybrid does not become an unowned cross-surface feature.

| Area | Primary owner | Notes |
|---|---|---|
| Chat routing and UX | Chat UX / web frontend | owns cards, empty states, private chat behavior, mobile reachability |
| Hybrid orchestration router | Platform backend | owns tRPC/API contracts, auth, tenant checks, preview/start/resume/cancel |
| Execution state and persistence | Platform backend / data | owns durable records, migrations, idempotency, legacy-read compatibility |
| OpenAI Agents SDK adapter | Python backend / agent runtime | owns SDK imports, role graph execution, contract validation, SDK health |
| Gateway, billing, and model policy | AI platform / billing | owns provider route, credit budgets, model defaults, usage attribution |
| Commit executors | Skill/media/workflow owners | own side-effect safety, executor-specific tests, artifact contracts |
| Observability and release gates | Platform / QA | owns replay fixtures, dashboards/log queries, rollout gate evidence |
| Agency compatibility | Agency migration owner | owns legacy route behavior and `agency-swarm` deprecation path |

No single implementation section should change all areas at once. The plan should sequence these owners so contract and persistence work land before UI promises real execution.

---

## 7. Routing Design

Hybrid Flow should be selected only when the request genuinely benefits from staged execution.

### 7.1 Direct Skill Routing Must Win

The following must not open Hybrid Flow:

- `create image: ...`
- `generate image: ...`
- `สร้างภาพ ...`
- `create video: ...`
- `generate video: ...`
- `สร้างวิดีโอ ...`
- single article writer requests
- translation requests
- direct prompt enhancement requests
- direct skill slash commands

These should route to skill/media preview or direct skill execution.

### 7.2 Hybrid Flow Positive Signals

Hybrid is appropriate when the request includes one or more of:

- multiple dependent stages
- multiple alternatives that need critique and synthesis
- explicit review or approval
- workflow plus final commit
- research plus generation
- multi-asset campaign creation
- "compare options then choose"
- "have a team/agents review"
- "validate before running"
- "create plan then execute"
- "run the final action after approval"

Thai examples:

- "สร้างภาพ 3 แนวทาง แล้ววิจารณ์เลือกอันดีที่สุดก่อนสร้างจริง"
- "วางแผนแคมเปญพร้อมตรวจคุณภาพและสร้าง asset"
- "ให้ทีมช่วยคิดหลายทางเลือก สรุป แล้วรออนุมัติก่อนรัน"

English examples:

- "Explore three campaign angles, critique them, then generate the final assets after approval."
- "Research, plan, validate, and create a final publish-ready package."

### 7.3 Hybrid Flow Negative Signals

Do not select Hybrid when:

- a single skill has high confidence
- the request is one output only
- no review/approval/research/compare/commit step is requested
- the user asks a question about tools or models
- the request can be answered in normal chat

### 7.4 Decision Model

Implement a deterministic-first decision ladder:

1. Slash command or exact direct command.
2. Direct skill/media regex and trigger detection.
3. Skill detector confidence.
4. Complexity classifier.
5. Hybrid planner confidence.
6. User confirmation if ambiguous.

Required decision output:

```ts
type ChatRoutingDecision = {
  route: "chat" | "skill" | "media_preview" | "hybrid" | "agency";
  confidence: number;
  reasonCodes: string[];
  selectedSkillId?: string | null;
  hybridPlan?: HybridOrchestrationPlan | null;
  requiresConfirmation: boolean;
};
```

### 7.5 Ambiguity Handling

If the system is not confident:

- do not auto-open Hybrid Flow
- ask a compact confirmation
- offer two actions:
  - "Run as direct skill"
  - "Open Hybrid Flow"

Telemetry must record which option the user chooses.

### 7.6 Prompt Enhance And Media Command Routing

Prompt enhancement and direct media creation are separate from Hybrid routing.

Rules:

- `enhance prompt`, `edit prompt`, `ปรับ prompt`, and equivalent UI buttons route to the prompt enhancement executor or skill.
- `create image:`, `generate image:`, `สร้างภาพ`, and image buttons route to image media preview or image skill.
- `create video:`, `generate video:`, `สร้างวิดีโอ`, and video buttons route to video media preview or video skill.
- Hybrid may be offered only when the user asks for multi-stage work around those outputs, such as alternatives, critique, approval, or final commit after review.

Examples:

| User request | Expected route |
|---|---|
| `enhance prompt: portrait lighting` | prompt enhancement, not Hybrid |
| `edit prompt ให้ดู cinematic` | prompt enhancement, not Hybrid |
| `create image: Thai fashion portrait` | image media preview or image skill, not Hybrid |
| `create video: product teaser 10 seconds` | video media preview or video skill, not Hybrid |
| `สร้าง prompt ภาพ 3 แบบ วิจารณ์ แล้วให้เลือกก่อนสร้างจริง` | Hybrid confirmation |
| `สร้างวิดีโอ 3 แนวทาง ให้ทีมวิจารณ์ แล้วรออนุมัติก่อน render` | Hybrid confirmation |

This keeps existing fast paths fast while preserving Hybrid for cooperative, staged work.

---

## 8. Product UX

### 8.1 Chat Entry

When Chat selects Hybrid:

- show a concise explanation
- show expected stages
- show why Hybrid is recommended
- show estimated cost/latency class where available
- show actions:
  - Start Hybrid Flow
  - Keep in Chat
  - Run Direct Skill if available

### 8.2 Hybrid Workspace

Replace Agency-only preview with a neutral Hybrid workspace route:

```text
/hybrid/:executionId
/hybrid/preview?hybridPreviewToken=...
```

Agency routes may redirect to this workspace with `originSurface=agency`, but Chat should not require an `agencyId`.

### 8.3 Stage UI Requirements

Each stage must show:

- stage owner: workflow, swarm, human, commit
- status
- started/completed timestamps
- input summary
- output summary
- artifacts
- review verdict
- trace id
- cost and token usage where available
- retry/repair actions where allowed

### 8.4 Approval UX

Human stages must provide:

- approve
- request changes
- reject
- edit instruction
- resume
- cancel

Approval decisions must persist as checkpoints, not only in client state.

### 8.5 Empty And Private Chat States

Hybrid UI affordances must not leak into chat modes where they are not enabled.

Requirements:

- empty public chat shows only enabled entry actions
- private chat respects private-mode feature flags and must not show Work OS or Hybrid prompts unless explicitly enabled
- if Work OS is hidden, the "restore Work OS" banner must remain hidden in private chat unless the user has a Work OS session to restore
- Hybrid confirmation cards must be conversation-scoped and must disappear when the source message is deleted or the feature flag is disabled
- mobile layout must keep confirmation actions reachable without pushing the message composer off-screen

These states should be covered by browser/UI tests because previous regressions appeared only in chat surface variants.

---

## 9. Runtime Semantics

### 9.1 Stage Types

Hybrid stages map to runtime behavior:

| Stage type | Owner | Runtime behavior |
|---|---|---|
| intake | workflow | normalize objective, constraints, output schema |
| explore | swarm | run multi-agent alternatives, critique, synthesis |
| validate | workflow or swarm | structured review verdict and repair plan |
| approval | human | durable pause and resume checkpoint |
| commit | workflow | execute approved side-effect through platform executor |

### 9.2 Workflow Stage

Workflow stages should use OpenAI Agents SDK when they require reasoning, planning, or validation. They may use deterministic platform logic for purely mechanical transitions.

Workflow stage output must include:

```ts
{
  summary: string;
  normalizedObjective: string;
  constraints: string[];
  outputSchema?: Record<string, unknown>;
  nextStageInputs: Record<string, unknown>;
  verdict?: ReviewVerdict;
}
```

### 9.3 Swarm Stage

Swarm stages must use OpenAI Agents SDK directly through the adapter. The first implementation should use a small fixed role set:

- explorer
- critic
- synthesizer
- validator

The adapter may model these as SDK agents with handoffs and tools. It must not require `agency-swarm`.

Swarm output must include:

```ts
{
  alternatives: Array<{
    title: string;
    rationale: string;
    tradeoffs: string[];
    riskNotes: string[];
  }>;
  critiques: string[];
  recommendation: string;
  confidence: number;
  nextStageInputs: Record<string, unknown>;
}
```

### 9.4 Validation Stage

Validation stages must produce structured verdicts:

```ts
type ReviewVerdict = {
  status: "pass" | "fail" | "repair_required" | "blocked";
  reasonCodes: string[];
  issues: Array<{
    severity: "low" | "medium" | "high" | "critical";
    message: string;
    suggestedFix?: string;
  }>;
  repairedOutput?: unknown;
};
```

### 9.5 Commit Stage

Commit stages must never be free-form LLM side effects. They must call platform-owned executors:

- skill execution
- media generation
- workflow execution
- workpack execution
- content publishing
- schedule creation
- library save

Commit stages require:

- explicit allowed executor
- side-effect class
- tenant policy approval
- credit check
- audit record
- idempotency key

### 9.6 Stage Executor Registry

Hybrid must use an explicit server-owned stage executor registry. The runtime may choose a stage path, but it must not dynamically invoke arbitrary tools, skills, connectors, or frontend-provided executor names.

Candidate contract:

```ts
type HybridStageExecutorDefinition = {
  id: string;
  stageType: "intake" | "explore" | "validate" | "approval" | "commit";
  owner: "workflow" | "swarm" | "human";
  runtime: "deterministic" | "openai_agents_sdk" | "platform_executor";
  allowedTools: string[];
  allowedSkills: string[];
  allowedCommitExecutors: string[];
  requiresApproval: boolean;
  sideEffectClass: "none" | "draft" | "write" | "publish" | "external_call";
};
```

Registry rules:

- Node validates the executor definition before each stage.
- Python receives only the allowed tools and role graph for the current stage.
- SDK handoffs cannot expand beyond the stage allowlist.
- Commit executors are never selected directly from model text.
- Executor ids are versioned so historical executions remain replayable.

### 9.7 Hybrid Runtime Request Fields

Every SDK-backed stage request must include enough metadata for tracing, resume, policy, and deterministic recovery:

```ts
type HybridRuntimeStageRequest = {
  runtimeContractVersion: string;
  hybridExecutionId: string;
  hybridStageId: string;
  tenantId: string;
  userId: string;
  originSurface: "chat" | "agency" | "work_os" | "review_center";
  entryPoint:
    | "hybrid_stage_workflow"
    | "hybrid_stage_swarm"
    | "hybrid_stage_validate"
    | "hybrid_stage_commit"
    | "hybrid_resume";
  stageType: "intake" | "explore" | "validate" | "commit";
  stageOwner: "workflow" | "swarm";
  objective: string;
  constraints: string[];
  upstreamStageOutputs: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  toolAllowlist: string[];
  skillAllowlist: string[];
  creditBudget: {
    maxCredits: number;
    maxModelTokens?: number;
    maxRuntimeMs?: number;
  };
  approvalCheckpointId?: string;
  idempotencyKey: string;
};
```

The request must be generated server-side. Client-provided values may influence objective text but must not directly set allowlists, model route, side-effect class, or executor id.

### 9.8 Stage Result Envelope

All stage results must normalize into one envelope before persistence:

```ts
type HybridStageResult = {
  status: "completed" | "needs_approval" | "repair_required" | "failed" | "cancelled";
  output: unknown;
  artifacts: Array<{
    type: "text" | "image" | "video" | "file" | "workpack" | "trace";
    ref: string;
    title?: string;
  }>;
  reviewVerdict?: ReviewVerdict;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    creditsCharged: number;
    runtimeMs: number;
  };
  trace: {
    runtimeTraceId: string;
    modelRoute: string;
    agentNames: string[];
    toolCalls: string[];
  };
  nextAction: "continue" | "await_approval" | "commit" | "stop" | "repair";
};
```

The UI and audit log should read from this normalized envelope, not from provider-specific SDK responses.

### 9.9 Agent Role Templates

The first SDK-backed swarm stage should use fixed role templates to keep behavior explainable:

| Role | Purpose | Tool scope | Required output |
|---|---|---|---|
| explorer | generate viable approaches | read-only tools unless explicitly allowed | alternatives with rationale |
| critic | find risks, missing constraints, and failure modes | read-only tools | critique list and severity |
| synthesizer | merge the best path into an execution-ready plan | no mutating tools | recommendation and plan |
| validator | check schema, policy, budget, and readiness | policy/read-only tools | `ReviewVerdict` |

Role prompts should be stored as versioned server-owned templates. Product copy may be localized, but role instructions and output schemas must remain deterministic enough for tests.

### 9.10 Execution State Machine

Hybrid execution must use an explicit state machine that can be persisted and resumed:

```text
draft_preview
  -> ready_to_start
  -> running_stage
  -> awaiting_approval
  -> repairing
  -> committing
  -> completed

Terminal alternatives:
  failed
  cancelled
  expired
```

Allowed transitions:

| From | To | Trigger |
|---|---|---|
| draft_preview | ready_to_start | preview token resolved and user starts |
| ready_to_start | running_stage | stage runner accepted execution |
| running_stage | awaiting_approval | stage result requests human checkpoint |
| awaiting_approval | running_stage | user approves or submits changes |
| running_stage | repairing | validation returns `repair_required` |
| repairing | running_stage | repair prompt accepted |
| running_stage | committing | final pre-commit validation passes |
| committing | completed | commit executor succeeds |
| any non-terminal | failed | unrecoverable runtime error |
| any non-terminal | cancelled | user or admin cancels |
| draft_preview | expired | preview token expires before start |

State transitions must be server-side and idempotent. The client may request an action, but it must not set the next state directly.

---

## 10. OpenAI Agents SDK Adapter Requirements

Extend `openai_agents_adapter.py` and related contracts to support Hybrid:

- `surface = hybrid`
- stage metadata
- role graph construction
- structured output schemas per stage
- handoff scope validation
- tool allowlist validation
- redacted tracing
- checkpoint metadata
- resume/cancel support
- gateway-only model routing

The adapter must expose health metadata:

- adapter version
- SDK version
- supported runtime contract versions
- supported trace schema versions
- supported checkpoint schema versions
- supported hybrid stage types

### 10.1 SDK Version Upgrade Policy

Before implementing the real Hybrid runtime, update `openai-agents` to the latest stable release available at implementation time and pin the exact version in `python-backend/requirements.txt`.

Current reference as of 2026-07-02:

- repository: `openai/openai-agents-python`
- package: `openai-agents`
- latest observed release: `v0.17.7` on 2026-06-24
- current project baseline observed during discovery: `openai-agents==0.17.4`

Upgrade rules:

- do not use an unpinned `openai-agents` dependency in production
- read release notes before bumping because SDK defaults may change between patch releases
- explicitly set model/provider/runtime config in SmartSpecPro instead of relying on SDK defaults
- run adapter contract tests before enabling Hybrid runtime
- run existing Chat/Team/skill runtime tests to confirm Feature 101 compatibility
- expose SDK version through runtime health metadata
- keep rollback instructions for reverting to the previous pinned version

This upgrade should be treated as a prerequisite gate for Feature 130, not as an unrelated dependency cleanup.

### 10.2 Runtime API Contract

Node should expose Hybrid operations through the existing tRPC/service layer while delegating SDK work through the agent runtime client:

| Operation | Purpose | Notes |
|---|---|---|
| `createPreviewToken` | create short-lived Hybrid preview | accepts Chat-origin payload without `agencyId` |
| `getPreview` | resolve preview token | must enforce tenant/user access |
| `startExecution` | create durable execution and first stage | returns execution id and first state |
| `getExecution` | read execution, stages, artifacts, approval state | supports polling or subscription |
| `resumeExecution` | resume from approval, repair, or retry | requires checkpoint/action id |
| `cancelExecution` | cancel future stages | keeps readable outputs |
| `retryStage` | retry failed retryable stage | uses same policy and idempotency rules |
| `getRuntimeHealth` | expose adapter/contract compatibility | admin or diagnostic only |

The Python adapter boundary should support:

| Operation | Purpose |
|---|---|
| `runHybridStage` | execute one SDK-backed stage |
| `resumeHybridStage` | resume SDK execution where SDK checkpointing is available |
| `cancelHybridStage` | cancel or mark an SDK run cancelled |
| `validateHybridContract` | verify schema, stage type, role graph, and tool scopes |
| `hybridHealth` | report SDK/runtime capability metadata |

Frontend code must call only the Node surface. It must never call Python adapter operations directly.

### 10.3 Contract Version And Mixed Deploy Policy

Hybrid must follow the Feature 101 contract-versioning model instead of coupling persisted data to the SDK package version.

Required version identifiers:

- `runtimeContractVersion`
- `hybridPlanSchemaVersion`
- `hybridStageResultSchemaVersion`
- `traceSchemaVersion`
- `checkpointSchemaVersion`
- `roleTemplateVersion`
- `executorRegistryVersion`

Compatibility rules:

- Node and Python must support `current` and `current - 1` runtime contract versions during rolling deploys.
- Additive database migrations must land before code requires new persisted fields.
- Python adapter health must expose supported contract and schema versions.
- Node must fail closed with `unsupported_contract_version` when the adapter cannot satisfy the requested version.
- UI may render only fields guaranteed by the declared schema version.
- Persisted executions must keep their original version metadata so old runs remain readable after upgrades.
- SDK package version changes and contract/schema version changes are separate events and require separate release notes.

Mixed deploy tests are required before canary because Chat-origin Hybrid spans UI, Node, Python, database, Redis/cache, billing, and model gateway boundaries.

---

## 11. Migration Away From Agency Coupling

### 11.1 Phase 1: Neutral Hybrid Runtime

- Add neutral Hybrid preview/execution routes.
- Keep existing Agency preview route as redirect or compatibility entry.
- Remove `agency.list` requirement from Chat Hybrid card.
- Create preview tokens without `agencyId` for Chat-origin Hybrid Flow.

### 11.2 Phase 2: Real Stage Execution

- Add Hybrid stage runner in Node.
- Map stage owner/type to agent runtime request.
- Persist stage outputs and traces.
- Keep current Redis state machine only for orchestration state, not as the only runtime behavior.

### 11.3 Phase 3: Swarm Stage Through OpenAI Agents SDK

- Implement SDK-based role graph in `openai_agents_adapter.py`.
- Support explorer/critic/synthesizer/validator role templates.
- Produce structured alternatives, critique, synthesis, and recommendation.

### 11.4 Phase 4: Commit Executors

- Wire commit stage to platform executors.
- Start with safe examples:
  - create image/video media prompt preview
  - execute a selected skill
  - save output to library
- Gate destructive or publish actions behind approval.

### 11.5 Phase 5: Agency Legacy Migration (superseded by Feature 151)

- Stop new Agency runs and mark existing runs `agency_deprecated` or
  `migration_required` with explicit credit reconciliation.
- Export and validate historical definitions, graphs, artifacts, and audit
  events through a read-only migration worker.
- Migrate active entry points to the neutral Agents Orchestra and map every
  unsupported graph explicitly; do not silently substitute a different plan.
- Remove `agency-swarm`, its adapter/routes/tasks, and Agency-only package
  destinations after the Feature 151 zero-usage and retention gates pass.

---

## 12. Data Model And Persistence

Hybrid execution state should move beyond Redis-only TTL state.

Required durable records:

- hybrid execution
- stage state
- stage output
- stage artifact refs
- approval checkpoint
- trace refs
- cost and usage summary
- routing decision
- commit executor result

Candidate tables may reuse or extend:

- `workApprovals`
- `workAutomationRunCheckpoints`
- existing agent runtime trace tables from Feature 101
- new `hybridExecutions`
- new `hybridExecutionStages`

Redis may remain as a fast cache, but it must not be the only source of truth for product-grade runs.

### 12.1 Migration Discipline

Durable Hybrid persistence must follow expand -> backfill/dual-read -> cutover -> contract.

Required migration posture:

- add tables/columns additively before runtime code depends on them
- dual-read old Redis preview/execution state and new durable records during compatibility window
- dual-write only where needed and only with idempotency keys
- never drop or rename legacy fields in the same release that introduces neutral Hybrid routes
- keep legacy Agency-origin executions readable even after Chat-origin Hybrid moves to neutral runtime
- add validation queries or smoke checks that count executions by status, stage state, and origin surface
- document rollback behavior for each migration phase

Backfill, if required, should be read-only for historical Redis-only preview tokens. Product-grade durable records should be created at execution start, not by trying to reconstruct every expired preview.

### 12.2 Minimum Durable Schema

If new tables are required, the minimum schema should cover:

```ts
type HybridExecutionRecord = {
  id: string;
  tenantId: string;
  userId: string;
  conversationId?: string | null;
  originSurface: "chat" | "agency" | "work_os" | "review_center";
  status: "draft_preview" | "ready_to_start" | "running_stage" | "awaiting_approval" | "repairing" | "committing" | "completed" | "failed" | "cancelled" | "expired";
  objective: string;
  routingDecision: ChatRoutingDecision;
  currentStageId?: string | null;
  totalCreditsUsed: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
};

type HybridExecutionStageRecord = {
  id: string;
  executionId: string;
  stageIndex: number;
  stageType: "intake" | "explore" | "validate" | "approval" | "commit";
  owner: "workflow" | "swarm" | "human";
  executorId: string;
  status: "queued" | "running" | "completed" | "awaiting_approval" | "repair_required" | "failed" | "cancelled" | "skipped";
  input: Record<string, unknown>;
  result?: HybridStageResult | null;
  errorCode?: string | null;
  idempotencyKey: string;
  startedAt?: string | null;
  completedAt?: string | null;
};
```

Implementation may map these fields onto existing tables, but the resulting persistence model must support equivalent reads, resume, audit, and migration.

### 12.3 Preview Token Policy

Preview tokens are not execution records.

Requirements:

- TTL no longer than 30 minutes
- token payload contains no secrets or provider credentials
- token resolves only for the original tenant/user scope unless explicitly shared
- starting a preview creates or links exactly one durable execution
- repeated start attempts return the existing execution or fail idempotently
- expired preview can be regenerated from the original chat message only if the user still has access

---

## 13. Billing And Cost Controls

Each stage must carry:

- estimated budget
- actual token usage
- credits used
- model/provider route
- executor cost if applicable

Hybrid Flow must support:

- preflight estimate
- per-stage ceiling
- total run ceiling
- fail-closed insufficient credit behavior
- partial-run cost reporting

Billing display requirements:

- show estimate before starting when possible
- show per-stage actual credits after each completed paid stage
- show no charge for failed preflight validation
- show whether commit executor has an additional non-LLM cost
- preserve historical cost summary even if model pricing changes later

### 13.1 Environment And Configuration Requirements

Feature flags and runtime config must fail closed.

Required configuration surfaces:

- tenant/environment flags listed in Section 16.1
- pinned `openai-agents` version in the Python dependency file
- explicit default model/runtime config for Hybrid stages
- per-stage budget defaults
- commit executor allowlist
- SDK adapter internal route/health config
- observability environment tags for local, staging, and production

Configuration rules:

- local/dev may enable SDK Hybrid only with explicit flags
- staging must run replay fixtures before enabling active canary
- production default is disabled until release gates pass
- missing budget or executor allowlist disables commit stages
- missing SDK health disables SDK-backed Hybrid but must not disable direct chat or direct skills

---

## 14. Security And Governance

Required controls:

- no frontend SDK calls
- no direct provider credentials in Hybrid runtime
- all LLM calls through SmartSpecPro gateway
- allowed tools and skills enforced by Node and Python
- mutating tools require approval
- handoff must not widen tool, connector, or write scopes
- trace redaction for sensitive content
- idempotency keys for commit actions
- tenant policy checks before every side effect

Security review gates:

- Hybrid cannot enable mutating commit executors until approval, idempotency, audit, and rollback tests pass.
- Connector/tool credentials must never be exposed to Python except through scoped server-mediated tool calls.
- Agent traces shown in UI must be redacted and must not include raw secrets, hidden prompts, or provider credentials.
- Cross-tenant execution ids, preview tokens, and trace ids must be rejected.
- Preview tokens must be short-lived and single-purpose; execution ids must require normal auth checks.

---

## 15. Observability

Every Hybrid run must expose:

- routing decision
- stage events
- runtime trace id
- model/provider route
- selected agents
- selected tools
- selected skills
- review verdicts
- checkpoint transitions
- commit action audit
- error reason codes

Telemetry must include:

- Hybrid offered
- Hybrid accepted
- user chose direct skill instead
- user chose keep in chat
- stage failure
- repair attempt
- approval decision
- final completion

Product metrics must include:

- Hybrid routing precision on labeled fixtures
- Hybrid acceptance rate after offer
- "keep in chat" rate after offer
- direct skill false-positive rate
- stage completion rate
- approval completion rate
- repair-required rate
- duplicate side-effect prevention count
- average credits per completed Hybrid run
- user-visible latency per stage
- final artifact acceptance or retry rate where measurable

Suggested initial quality gates:

- no regression for direct image/video/article skill routing
- at least 90% precision for Hybrid-positive fixture prompts before canary
- at least 95% precision for direct-skill-negative fixture prompts before canary
- every failed stage has a stable reason code and user-readable recovery state

Runtime SLO targets for canary:

- intake stage p95 under 20 seconds
- swarm stage p95 under 90 seconds for default budget
- validation stage p95 under 30 seconds
- approval resume p95 under 5 seconds after user action
- no duplicate commit side effect for retried idempotency keys

### 15.1 Replay And Evaluation Fixture Set

Hybrid rollout must include a replay fixture set that can run locally and in CI without creating external side effects.

Minimum fixture groups:

| Group | Purpose |
|---|---|
| direct media negative | proves image/video commands do not route to Hybrid |
| prompt enhancement negative | proves enhance/edit prompt remains direct |
| direct skill negative | proves single-skill requests stay out of Hybrid |
| Hybrid-positive Thai | proves Thai multi-stage prompts offer Hybrid |
| Hybrid-positive English | proves English multi-stage prompts offer Hybrid |
| ambiguous prompts | proves confirmation is shown instead of auto-start |
| SDK stage success | validates structured stage envelopes |
| SDK schema drift | validates repair or fail-closed behavior |
| approval resume | validates durable checkpoint replay |
| idempotent commit retry | validates duplicate side-effect prevention |
| legacy Agency compatibility | validates old links remain readable or redirect safely |

Each fixture should record:

- input prompt and locale
- expected route and reason codes
- expected feature flags
- expected stage plan shape where Hybrid is offered
- expected contract/schema versions
- expected side-effect class
- expected user-visible recovery state for failures

Quality evaluation must be based on these replay fixtures plus a small manually reviewed golden set for complex work. Automated metrics may gate routing and schema correctness; human review may gate output quality before broad rollout.

---

## 16. Rollout Plan

### 16.1 Flags

Add flags:

- `hybridFlow.enabled`
- `hybridFlow.chatEntryEnabled`
- `hybridFlow.openAiAgentsRuntimeEnabled`
- `hybridFlow.openAiAgentsRuntimeShadow`
- `hybridFlow.neutralWorkspaceEnabled`
- `hybridFlow.agencyLegacyFallbackEnabled`
- `hybridFlow.commitStageEnabled`

### 16.2 Shadow Mode

Shadow mode must:

- keep current visible behavior
- generate a candidate SDK stage result
- suppress side effects
- compare routing and stage outputs
- persist comparison metadata

### 16.3 Canary

Start with:

- internal tenants
- non-destructive flows
- no publish actions
- human approval required
- limited models
- low stage budget

### 16.4 Rollback

Rollback must:

- disable SDK Hybrid runtime
- keep direct skill routing intact
- fall back to existing chat/skill behavior
- preserve existing executions in readable state
- prevent partial commit retry unless idempotency is verified

### 16.5 Failure Modes And Recovery

The implementation must define user-visible and operator-visible behavior for:

| Failure mode | Required behavior |
|---|---|
| Python adapter unavailable | mark stage failed with retry option; keep chat usable |
| OpenAI Agents SDK contract unsupported | fail closed; show admin reason code; do not fall back to Agency automatically |
| Redis unavailable | continue from durable execution state or block new preview creation with clear error |
| database write failure | do not execute commit; preserve stage error where possible |
| credit budget exceeded | pause execution before next paid stage; allow user/admin to adjust or stop |
| approval timeout | keep execution readable; require explicit resume before commit |
| commit executor failure | record failed side effect with idempotency key and retry safety state |
| user cancels execution | stop future stages; do not cancel already committed side effects |
| legacy Agency route opened | redirect/wrap neutral runtime or show migration-safe read-only state |

Automatic fallback to legacy Agency execution is prohibited. An old Agency
link may open a read-only historical view or a migration-required result; a
failed Orchestra run must block, retry within its contract, or replay a prior
verified artifact.

### 16.6 Release Gates

Feature 130 cannot move from shadow to canary until these gates pass:

- SDK dependency is pinned and release notes are reviewed.
- adapter contract tests pass for current and current-1 versions.
- replay fixtures pass for routing, schema, approval, retry, cancel, and compatibility.
- no direct media or prompt-enhance routing regression.
- no Chat, Team, Responses, or shared skill runtime regression from the SDK upgrade.
- migration can create durable execution records without breaking existing Redis preview behavior.
- rollback can disable SDK Hybrid runtime while leaving existing executions readable.
- operator recovery playbook exists for adapter outage, unsupported contract, stuck approval, failed commit, and duplicate-event prevention.
- observability dashboard or log query exists for routing decisions, stage failures, approval pauses, cost, and SDK version.

Canary cannot include mutating publish or external connector writes until commit executor safety gates pass separately.

### 16.7 Operator Recovery Playbook Requirements

The release must document how an operator can:

- identify the SDK version and contract version used by a Hybrid execution
- find the runtime trace for a failed stage
- retry a retryable stage safely
- cancel a stuck execution
- resume or expire a stale approval checkpoint
- verify whether a commit side effect already ran
- disable Chat-origin Hybrid while preserving direct chat and skill routing
- disable commit stage execution without disabling read-only Hybrid planning
- migrate or read a legacy Agency-origin Hybrid run

The playbook should prefer existing admin/logging tools and avoid adding a new operational surface unless required.

---

## 17. Test Matrix

### 17.1 Routing Tests

Must pass:

- `create image: ...` -> media preview or image skill, not Hybrid
- `สร้างภาพ ...` -> media preview or image skill, not Hybrid
- `create video: ...` -> media preview or video skill, not Hybrid
- `สร้างวิดีโอ ...` -> media preview or video skill, not Hybrid
- `enhance prompt: ...` -> prompt enhancement executor or skill, not Hybrid
- `edit prompt ...` -> prompt enhancement executor or skill, not Hybrid
- `ปรับ prompt ...` -> prompt enhancement executor or skill, not Hybrid
- "qwen เหมาะกับงานสร้างภาพไหม" -> chat, not skill, not Hybrid
- "เขียนบทความ..." -> article skill, not Hybrid
- "สร้างภาพ 3 แนวทาง วิจารณ์ แล้วเลือกอันดีที่สุดก่อนรัน" -> Hybrid confirmation
- "วางแผนแคมเปญ ตรวจคุณภาพ และสร้าง final assets" -> Hybrid
- ambiguous multi-step requests -> confirmation, not automatic Hybrid

### 17.2 Runtime Contract Tests

- Node builds valid `surface=hybrid` runtime requests.
- Python adapter accepts and validates Hybrid stage requests.
- Unsupported contract versions fail closed.
- Node/Python current and current-1 versions remain compatible during rolling deploy tests.
- SDK package upgrade does not change runtime behavior when SmartSpecPro explicitly sets model/runtime config.
- Tool/handoff scope widening is rejected.
- Mutating tools without approval are rejected.

### 17.3 Stage Execution Tests

- intake stage returns normalized objective.
- swarm stage returns alternatives, critiques, recommendation.
- validate stage returns structured verdict.
- approval stage pauses and resumes.
- commit stage calls only allowed executor.
- cancel stops future stages.
- retry uses same idempotency policy.

### 17.4 Persistence Tests

- execution persists after reload.
- stage outputs persist.
- approval checkpoints persist.
- traces are linked.
- Redis loss does not destroy durable execution state.

### 17.5 UI Tests

- Chat card explains why Hybrid is recommended.
- Chat card offers direct-skill fallback if available.
- Hybrid workspace does not require Agency route.
- stage output appears after execution.
- approval actions update state.
- final result and artifacts are visible.
- private chat does not show disabled Work OS or Hybrid affordances.
- hidden Work OS restore banner stays hidden unless a restorable session exists.
- Hybrid confirmation actions remain reachable on mobile.

### 17.6 Quality Tests

Replay fixtures compare:

- direct chat vs Hybrid output quality
- skill direct vs Hybrid for multi-stage requests
- current simulated Hybrid vs SDK Hybrid
- old SDK pinned version vs upgraded SDK pinned version where practical
- Thai and English golden prompts reviewed by product/QA

Acceptance requires measurable improvements for complex tasks and no regression for direct tasks.

### 17.7 Compatibility Tests

- `/agencies/:id/hybrid-preview` remains readable for existing preview links.
- New Chat-origin Hybrid does not require a published Agency.
- Agency-origin Hybrid can use neutral runtime while preserving user-facing Agency context.
- Existing Redis preview tokens either resolve or fail with a migration-safe message.
- Disabling `hybridFlow.openAiAgentsRuntimeEnabled` does not break direct chat or skill execution.

### 17.8 Failure Recovery Tests

- adapter outage produces retryable failed stage.
- unsupported contract version fails closed.
- approval resume after reload continues from the same checkpoint.
- repeated commit request with same idempotency key does not duplicate side effects.
- cancel prevents future stages and leaves prior artifacts visible.
- budget exceeded pauses before the next billable stage.
- stuck stage can be diagnosed from trace id, execution id, stage id, SDK version, and contract version.
- rollback leaves old executions readable and blocks only new SDK-backed Hybrid runs.

---

## 18. Acceptance Criteria

The feature is product-grade when:

1. Chat-origin Hybrid Flow can start without a published Agency.
2. Hybrid stages run real OpenAI Agents SDK calls through `openai_agents_adapter.py`.
3. Swarm stages produce structured alternatives, critique, synthesis, and recommendation.
4. Human approval is a real durable checkpoint.
5. Commit stages execute allowed platform actions with side-effect controls.
6. Stage outputs, artifacts, traces, and costs are visible in UI.
7. Direct media and direct skill commands never route to Hybrid.
8. Routing decisions are test-covered with Thai and English fixtures.
9. Legacy Agency Hybrid routes either redirect to or wrap the neutral Hybrid runtime.
10. `agency-swarm` is not used for new Chat-origin Hybrid execution.
11. Shadow and canary rollout gates exist.
12. Rollback leaves users with readable execution state and no duplicate side effects.
13. Stage executor registry prevents arbitrary tool, skill, connector, or commit invocation.
14. Adapter, SDK, and runtime contract versions are visible in health metadata.
15. Product metrics prove routing accuracy and quality before broad rollout.
16. Failure recovery paths are test-covered for adapter outage, budget exceeded, cancel, retry, and idempotent commit.
17. Legacy Agency compatibility is explicit and cannot silently become the Chat-origin execution path.
18. Prompt enhance/edit routes remain direct and do not trigger Hybrid unless the user asks for staged review or approval.
19. Private chat and disabled Work OS states do not leak hidden Hybrid or Work OS UI.
20. Node/Python mixed-deploy compatibility supports current and current-1 contract versions or fails closed with structured errors.
21. SDK upgrades are gated by replay fixtures, contract tests, rollback validation, and explicit model/runtime configuration.
22. Operator recovery playbook exists before canary and covers the highest-risk failure modes.

---

## 19. Open Questions

1. Should Hybrid workspace live under `/hybrid` or Work OS routes?
2. Which durable table should own Hybrid execution state?
3. Which initial commit executor should ship first: skill execution, media generation, or library save?
4. Should Agency-origin Hybrid keep agency branding while using the neutral runtime?
5. What is the first measurable quality benchmark for "Hybrid improves output"?
6. Should ambiguous Hybrid routing ask inline or show a compact decision card?

---

## 20. Definition Of Done

Feature 130 is complete when:

1. Hybrid Flow is a real SDK-backed execution runtime, not a simulated stage status preview.
2. Chat-origin Hybrid can run without Agency, while legacy Agency-origin links remain readable.
3. SDK dependency is pinned, health-reported, replay-tested, and rollback-safe.
4. Durable execution state survives reloads, adapter outages, and Redis loss.
5. Direct chat, direct skills, image/video generation, and prompt enhancement keep their fast paths.
6. Human approval, repair, cancel, retry, and idempotent commit behavior are all test-covered.
7. Operators have dashboards/log queries and a recovery playbook before canary.
8. Release gates prove no regression to Chat, Team, Responses, or shared skill runtime.
9. `agency-swarm` is not used for new Chat-origin Hybrid execution and has a documented deprecation path.

---

## 21. Recommended First Slice

Build the smallest real product-grade slice:

1. Neutral Chat-origin Hybrid route without Agency dependency.
2. Routing fixtures that keep direct image/video out of Hybrid.
3. Durable Hybrid execution record.
4. One real SDK-backed swarm stage.
5. One human approval checkpoint.
6. One safe commit executor: execute a selected prompt/skill or create media preview.
7. Stage output UI with trace id and cost summary.

Concrete deliverables:

- pinned latest stable `openai-agents` upgrade with release-note review and rollback note
- neutral Hybrid preview/start route in `hybridOrchestration` router
- durable execution table or existing durable store mapping documented in migration notes
- SDK-backed `explore` stage through `agentRuntime/client.ts`
- current/current-1 runtime contract compatibility check between Node and Python
- versioned role templates for explorer, critic, synthesizer, and validator
- normalized `HybridStageResult` persistence
- Chat card copy and fallback actions for Thai and English
- replay fixture tests for direct image/video/article/prompt-enhance routing and Hybrid-positive multi-step routing
- failure tests for adapter outage, approval resume, cancel, and idempotent retry
- operator recovery notes for adapter outage, stuck approval, failed commit, and rollback

Do not include in the first slice:

- automatic publishing
- broad connector write access
- agency-swarm upgrade or new agency-swarm runtime usage
- fully autonomous commit without human approval

This proves the architecture without committing to a full Agency migration immediately.
