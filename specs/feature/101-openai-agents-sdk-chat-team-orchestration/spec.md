# Feature 101: OpenAI Agents SDK Chat And Team Orchestration

Version: 1.1
Date: 2026-04-20
Status: Proposed
Depends-on: 083-agent-registry-and-organization-model, 088-agentops-tracing-evaluation-and-release-gates, 095-work-os-automation-fabric, 098-auto-team-real-execution-and-media-completion, 099-context-engineering-ready-chat-and-team, 100-team-orchestration-audit-trail-and-completion
Audience: Chat UX, Team UX, Orchestration, Python Backend, Skill Registry, Observability, QA, DevEx

---

## 1. Executive summary

SmartSpecPro needs a better orchestration runtime for Chat, Team, Responses, and shared skill execution.

The current behavior still looks like a collection of prompt chains, model selectors, and review loops spread across multiple services. That creates three recurring problems:

1. Skill selection is not consistently evidence-driven, so the wrong skill can be chosen or a good skill can be used at the wrong time.
2. Review output is not always structured enough to answer "pass or fail, why, and what changes next?" in a deterministic way.
3. Version changes in orchestration libraries risk changing behavior in Chat and Team even when the product intent has not changed.

This feature introduces **OpenAI Agents SDK** as the primary orchestration runtime for Chat, Team, Responses, and shared skill runtime, but only behind a single version-isolated adapter boundary in the Python backend.

The product outcome is:

- Chat, Team, Responses, and shared skill runtime use one shared agent runtime contract for planning, execution, review, handoff, schema enforcement, and tracing
- Media Studio prompt enhancement and custom-skill execution paths join the shared `surface = skill` runtime with `originSurface = media_studio`, so prompt work follows the same selection, trace, and review rules as the rest of the product
- skill selection becomes capability-driven instead of prompt-hint-driven
- every run exposes who acted, what tool or skill was used, which review gate fired, and why the step passed or failed
- all SDK-driven LLM traffic still goes through the existing SmartSpecPro gateway so credit deduction, provider policy, and model governance remain unchanged
- SDK version upgrades can happen frequently without forcing Chat/Team behavior changes
- the legacy orchestration path can remain as a rollback route during rollout and regression investigation

This feature does **not** replace the Team ledger or context engine. It uses the outputs from Features 099 and 100, and then replaces the runtime orchestration layer that decides how Chat, Team, Responses, shared skill runtime, and Media Studio prompt-skill execution actually execute work.

Active rollout scope for Feature 101 includes Chat, Team, Responses, and shared skill runtime. These surfaces still roll out independently through separate flags, frozen runtime decisions, and replay gates. Media Studio prompt/custom-skill execution is included only through the shared-skill surface.

---

## 2. Problem statement

The repository already has strong pieces:

- Chat has prompt assembly, retrieval, and model routing
- Team has plan snapshots, step cards, review states, and an audit trail
- Python backend already has agentic runtime experiments, adapters, and orchestration utilities
- Observability and release-gate groundwork already exists in the platform roadmap

What is still missing is a single agent runtime contract that can do all of the following:

1. choose the right agent or skill from structured capability data
2. keep the execution loop and review loop deterministic
3. expose trace data that explains why a step happened
4. preserve compatibility when the underlying SDK version changes
5. keep Chat, Team, Responses, and shared skill execution stable even when the runtime implementation is upgraded

Without that boundary:

- skill choice can drift between services
- review output can be verbose but not actionable
- Product surfaces and internal skill callers can become coupled to implementation details instead of a stable orchestration contract
- SDK upgrades can create hidden regressions because multiple surfaces read the same low-level runtime differently

---

## 3. Product goals

The new runtime must:

1. Use the OpenAI Agents SDK as the primary orchestration engine for Chat, Team, Responses, and shared skill runtime.
2. Keep the SDK isolated behind one Python adapter so version bumps do not leak into UI or Node service code.
3. Improve skill selection by feeding the runtime structured skill manifests, not free-form descriptions alone.
4. Make review outcomes explicit: pass, fail, needs repair, blocked, or terminal stop, with stable reason codes.
5. Guarantee that Chat, Team, Responses, and shared skill runtime can explain what happened through traces, evidence, checkpoints, and linked artifacts.
6. Preserve existing Chat and Team UX and existing persona behavior while replacing the orchestration layer underneath, and preserve Responses/skill caller contracts while moving them to the shared runtime boundary.
7. Allow SDK upgrades to be validated in shadow/canary mode before production promotion.
8. Keep legacy orchestration available as a rollback path during rollout, but not as a hidden per-step fallback inside the new runtime.

---

## 4. Non-goals

This feature does not aim to:

- rewrite all skills in the repository at once
- replace the Team ledger or UI audit trail from Feature 100
- replace the context-engine work from Feature 099
- rewrite every existing skill implementation in this release
- migrate unrelated product surfaces such as billing, notifications, or browser automation in this release
- move the full Media Studio media generation pipeline (`generateImageAsync`, `generateVideoAsync`, `generateAudio`, downstream render queues, or provider submission flows) into Feature 101 round one
- eliminate all manual review gates
- make SDK upgrades automatic without compatibility checks
- expose the SDK directly to front-end code

---

## 5. Locked product decisions

1. **Python backend is the only place that imports `openai-agents-python`.**
   - Chat and Team in Node/TypeScript must never import SDK classes directly.
   - All orchestration requests go through a stable platform boundary.

2. **There is exactly one adapter boundary for the SDK.**
   - One version-isolated module owns the SDK import, agent creation, handoffs, tracing hooks, and runner invocation.
   - If the SDK API changes, only this adapter and its contract tests should need updates.

3. **Chat, Team, Responses, and shared skill runtime share one runtime contract.**
   - The request/response schema is surface-aware but runtime-agnostic.
   - Product surfaces and internal runtime callers should not each invent their own orchestration dialect.
   - Surface-specific rollout flags may activate Chat, Team, Responses, and shared skill runtime separately, but the boundary contract stays shared.

4. **Skill selection must be capability-driven.**
   - Skills must publish structured metadata that the agent runtime can rank and compare.
   - Human-readable skill names are not enough.

5. **Review output must be structured.**
   - The runtime must emit stable verdicts and reason codes, not only free-form prose.

6. **Version upgrades must be test-gated.**
   - The accepted upgrade path is: lockfile bump -> adapter compatibility tests -> replay fixtures -> shadow/canary promotion.
   - A new SDK version may not change production behavior unless the contract suite still passes.

7. **Legacy orchestration remains as a rollout safety net only.**
   - The platform can route back to the older orchestrator during rollout or rollback.
   - The new runtime itself must not silently bounce between orchestration engines during one step.

8. **All SDK-driven LLM calls must still go through the existing SmartSpecPro gateway.**
   - The SDK runtime may not call provider APIs directly for production Chat, Team, Responses, or shared skill-runtime traffic.
   - Credit deduction, provider policy, model allowlists, tenant routing, and audit logging must remain on the current gateway path.
   - The adapter must use the platform's OpenAI-compatible gateway endpoint rather than bypassing it with direct provider credentials.

9. **Version metadata must be recorded on every runtime invocation.**
   - Every Chat, Team, Responses, and shared skill runtime trace must record SDK version, adapter version, model/provider metadata, and trace id.

10. **Plan visibility must precede execution.**
   - Team must persist a durable plan artifact before the first owner step starts execution.
   - The UI side panel and ledger must be able to render that plan from persisted data, not from transient in-memory state.

11. **Feature 101 must not create a second persona system.**
   - Chat conversation persona resolution and Team member/persona resolution remain Node-owned and Feature-099-owned concerns.
   - The SDK adapter receives a resolved persona/member snapshot; it may not re-resolve a different persona from storage or silently substitute a different owner/reviewer.
   - Persona-scoped memory, persona prompt segments, and roster identity continue to flow through the existing context-engine and room-member layers.

12. **Approval and resume must use durable checkpoints, not ad hoc pauses.**
   - Team approval checkpoints must reuse the existing work approval and automation checkpoint persistence where Team runs already have work-case backing.
   - Chat, Responses, or shared skill runtime may use a dedicated generic runtime checkpoint store when they are not backed by Work OS state, but no surface may rely on in-memory-only pause state.

13. **External content is evidence, not instruction.**
   - Retrieved documents, MCP output, tool output, connector responses, uploaded files, and browser captures are untrusted until normalized.
   - Untrusted content may inform evidence and review, but it may not override system policy, permission envelopes, or the locked plan step objective.

14. **Streaming, cancellation, and resume must be idempotent.**
   - Every runtime event, checkpoint, cancel request, and resume request must carry stable run, step, attempt, and idempotency identifiers.
   - Replayed or duplicated events must not create duplicate step advancement or duplicate trace records.

15. **The import-boundary rule applies immediately to all runtime surfaces, with one explicit transition exception.**
   - The new `openai_agents_adapter.py` is the only adapter allowed for Chat, Team, Responses, and shared skill-runtime traffic.
   - The existing `agency_swarm_adapter.py` remains a temporary agency-only exception during migration and may not be expanded to handle product/runtime traffic outside that legacy exception.

16. **Media Studio enters Feature 101 only through the skill/prompt execution path.**
   - `skills.enhancePrompt` and `skills.executeCustomSkill` must be able to route through `surface = skill` with `originSurface = media_studio`.
   - The actual media generation pipeline, including `generateImageAsync`, `generateVideoAsync`, `generateAudio`, queued rendering, provider submission, and artifact polling, stays outside Feature 101 round one.

---

## 6. Current codebase fit

| Existing area | Current truth | Gap this feature fills |
|---|---|---|
| `apps/web/server/services/runEngine.ts` | Team execution, step progression, review loops, and audit writes already exist | Move orchestration decisions into the SDK runtime while keeping the ledger output stable |
| `apps/web/server/routers/teamRoom.ts` | Team room reads and writes messages, plan snapshots, and active run state | Use runtime-produced artifacts instead of ad hoc step inference |
| `apps/web/server/services/chatService.ts` | Chat request flow already resolves models and executes turns | Route Chat turns through the SDK runtime contract |
| `apps/web/server/services/skillExecutor.ts` | Skill execution and tool routing already exist | Route shared skill runtime through the same agent boundary so internal skill execution, review, and retry behavior become explainable and policy-governed |
| `apps/web/server/services/callLLMStructured.ts` | Structured output calls already have their own execution path | Preserve JSON-mode behavior by routing schema-enforced structured calls through the new runtime boundary |
| `apps/web/server/_core/responsesRoutes.ts` | Responses-style request flow already exists | Move Responses execution onto the same runtime contract, gateway path, trace model, and checkpoint rules in Feature 101 |
| `apps/web/server/routers/skills.ts` | Prompt enhancement and custom skill execution already exist for Media Studio and other callers | Route eligible skill/prompt execution through the shared runtime contract while keeping credit routing and caller contracts stable |
| `apps/web/client/src/pages/MediaStudio.tsx` | Media Studio already separates prompt enhancement/custom skill execution from actual media generation | Adopt the shared runtime for prompt/skill execution only, while leaving real media generation out of scope for the first rollout |
| `apps/web/client/src/lib/mediaStudioSelection.ts` and `mediaStudioSkillMatching.ts` | Media Studio currently uses lightweight client-side compatibility/type sorting | Keep UI filtering lightweight, but move server-side runtime skill selection to manifest-driven policy for prompt/skill execution |
| `apps/web/server/services/llmRouter.ts` and `enabledLlmModels.ts` | Model resolution is centralized, but orchestration is still fragmented | Keep provider selection centralized while moving step orchestration to the SDK runtime |
| `apps/web/client/src/components/orchestrator/TeamRoomView.tsx` | Team UI already renders the ledger and timeline | Continue to consume structured runtime outputs without changing the UI contract |
| `apps/web/client/src/components/orchestrator/AutoTeamLedgerPanel.tsx` | Team debug panel already shows step detail and linked chat lines | Add richer runtime trace links and version metadata to the existing panel |
| `apps/web/drizzle/schema.ts` (`workApprovals`, `workAutomationRunCheckpoints`) | Team already has durable approval and resume checkpoint tables | Reuse these tables for Team HITL/pause-resume instead of inventing a second Team approval state machine |
| `python-backend/app/services/agency_swarm_adapter.py` | A version-isolated adapter pattern already exists on the Python side | Reuse the adapter-first idea for OpenAI Agents SDK instead of importing SDK code all over the codebase |
| `python-backend/app/services/react_executor.py` and `agentic_strategies.py` | Experimental agentic execution loops already exist | Retire or adapt them behind the new runtime contract once parity is proven |
| `python-backend/app/orchestrator/supervisor_integration.py` | There is already an orchestration bridge concept in Python | Use that integration style as the migration template for the new runtime |
| `python-backend/requirements.txt` | `openai` is already a dependency, but the Agents SDK is not yet isolated as a first-class runtime boundary | Add explicit SDK dependency management and version testing around a single adapter |
| `specs/feature/088-agentops-tracing-evaluation-and-release-gates/spec.md` | Trace, replay, and gate infrastructure is already on the roadmap | Use those gates to approve runtime rollout and SDK upgrades |
| `specs/feature/099-context-engineering-ready-chat-and-team/spec.md` | Shared context assembly is already on the roadmap | Feed the agent runtime with a structured context pack instead of free-form prompt concatenation |
| `specs/feature/100-team-orchestration-audit-trail-and-completion/spec.md` | Team audit trail and completion semantics are already defined | Keep that ledger, but drive it from a more capable orchestration layer |

---

## 7. Why OpenAI Agents SDK

The SDK is a good fit for Chat and Team because it already provides the primitives this product needs:

- agents
- tools
- handoffs
- guardrails
- human-in-the-loop behavior
- sessions
- tracing

Those primitives match the problems we are trying to solve:

- Chat needs a clean path from user intent to specialist work
- Team needs explicit step ownership, handoffs, and review loops
- both surfaces need traceable reasoning, not hidden orchestration
- version upgrades need to be centralized in one place

The SDK should therefore be used as the runtime engine, not as a convenience import scattered through business code.

---

## 8. Target architecture

### 8.1 Runtime boundary

Create a dedicated Python backend adapter, for example:

- `python-backend/app/services/openai_agents_adapter.py`

The SDK dependency should be managed as the Python `openai-agents` package, which is imported as `agents` from within the adapter.

This adapter is the only module allowed to import SDK classes directly.

During the migration window, `python-backend/app/services/agency_swarm_adapter.py` remains the only approved exception, but it is limited to legacy agency-only execution and must not be used for Chat, Team, Responses, or shared skill-runtime traffic.

It must own:

- agent creation
- tool registration
- handoff wiring
- guardrails
- session / context attachment
- runner invocation
- gateway-routed model client construction
- streaming event normalization
- trace metadata emission
- adapter version reporting

All other code must call the adapter through stable platform DTOs, such as:

- `AgentRuntimeRequest`
- `AgentRuntimeResponse`
- `AgentTraceEvent`
- `AgentCapabilityManifest`
- `ReviewVerdict`
- `StepExecutionRecord`

The adapter must construct SDK model clients against the existing SmartSpecPro OpenAI-compatible gateway endpoint.

That means:

- the effective `base_url` for model execution must point to the current gateway
- authentication must continue to use the same platform token / attribution path used for credit deduction today
- provider-specific API keys must stay behind the current gateway rather than being mounted into Chat or Team runtime code
- the adapter may not introduce a second production LLM billing path

The adapter boundary must be packaged so that SDK upgrades are isolated in one Python runtime module and one backend dependency lock path.

### 8.2 Surface contract

Chat, Team, Responses, and shared skill runtime share one runtime contract, but they can provide different inputs.

Common request fields should include:

- surface name (`chat`, `team`, `responses`, `skill`)
- `originSurface` when `surface = skill` and the caller came from another product surface such as `media_studio`
- `entryPoint` describing the caller contract, such as `chat_turn`, `team_step`, `responses_call`, `enhance_prompt`, or `execute_custom_skill`
- tenant / room / run identifiers
- stable request id and idempotency key
- `runtimeContractVersion`
- `traceSchemaVersion`
- `checkpointSchemaVersion`
- objective or user intent
- current plan or step context
- current step id / key / attempt id
- active conversation persona id and resolved persona snapshot when Chat is persona-bound
- resolved Team member roster snapshot when Team is roster-bound
- step owner/reviewer assignment with stable member ids and persona ids when execution is step-bound
- approval checkpoint id or resume cursor, when resuming
- structured context pack reference
- normalized context evidence items with provenance and trust labels
- candidate skill manifests
- allowed tool set
- completion policy
- review policy
- retry policy
- trace correlation ids
- SDK version constraints

Common response fields should include:

- selected agent name
- selected skill slug
- provider and model id
- gateway route id or resolved gateway model id
- acting member/persona identity actually used for the turn or step
- owner/reviewer member/persona identities when the response belongs to a Team plan step
- tool calls made
- handoffs executed
- review verdict
- repair instructions
- evidence references
- trace id
- accepted `runtimeContractVersion`
- accepted `traceSchemaVersion`
- accepted `checkpointSchemaVersion`
- adapter version
- terminal reason, if any
- next action
- step id / attempt id
- checkpoint or resume metadata, if the runtime paused
- event sequence metadata for streamed or replayed outputs
- step-link records for any plan, owner result, reviewer result, repair result, checkpoint, or terminal messages already persisted

### 8.2.1 Persona continuity and identity model

Feature 101 must preserve the existing persona model already used by Chat conversations and Team members. The new runtime may orchestrate work, but it may not become a second source of truth for persona identity.

Rules:

- Chat persona resolution remains upstream of the SDK adapter and must continue to use the existing conversation/default-persona resolution rules from the current product path.
- Team persona/member resolution remains upstream of the SDK adapter and must continue to use the room-member roster already persisted for Team.
- The shared runtime request must carry resolved identity snapshots, not only human-readable labels.
- The Python adapter may not query product persona tables to pick a different persona when the request already contains a resolved persona/member snapshot.
- Feature 099 context engineering remains responsible for persona prompt segments, persona-scoped memory, entity memory, and inclusion budgets.
- Runtime traces, step results, review records, and UI projections must preserve stable member/persona ids and user-facing labels so operators can audit who acted and who reviewed.

Minimum Chat identity payload:

- `activePersonaId` when present on the conversation
- persona display label / nickname when available
- persona prompt/context segment ref or resolved snapshot fields needed for replay/debug
- provenance indicating whether the persona came from conversation override, user default, tenant default, or platform default

Minimum Team identity payload:

- room member roster entries with `memberId`, `memberKind`, `memberRole`, `personaId`, display label, lead/orchestrator flag, and persona guidance summary/ref
- per-step `ownerMemberId`, `ownerPersonaId`, `reviewerMemberId`, and `reviewerPersonaId`
- stable linkage from owner/reviewer outputs back to the assigned step identities

Every context input sent to the adapter must be wrapped as a typed evidence item with, at minimum:

- `artifactId`
- `sourceType`
- `origin`
- `trustLevel`
- `sanitizationLevel`
- `contentRef`
- `tokenEstimate`

`trustLevel` must distinguish at least:

- `trusted_platform`
- `tenant_authored`
- `retrieved_untrusted`
- `tool_generated_untrusted`
- `connector_generated_untrusted`

Only normalized snippets, structured extracts, or approved references may be injected into the runtime prompt window.
Raw third-party payloads should stay behind references unless a read-only extraction tool is explicitly allowlisted.

### 8.3 Chat orchestration flow

Chat should use the SDK runtime to:

1. classify user intent
2. select the best agent or skill family from structured manifests
3. assemble the context pack, including the already-resolved conversation persona context when present
4. run the specialist agent or handoff chain
5. emit a trace and structured summary back to the UI

Chat should remain conversational, but it must now be able to explain:

- which persona was active for the turn and where that persona came from
- why a given skill was chosen
- what evidence was used
- which model/provider handled the turn
- that the turn was billed and governed through the existing gateway path
- what follow-up action is recommended

### 8.4 Team orchestration flow

Team should use the SDK runtime to:

1. load the plan and the current step state
2. load the locked owner/reviewer identity for the current step from the persisted room roster and plan artifact
3. choose the correct step skill based on capability data
4. run the step through the selected agent while preserving the assigned owner persona/member identity
5. hand off to reviewer or repair agents when needed while preserving the assigned reviewer persona/member identity
6. emit a structured verdict for the step
7. continue until the step passes or a terminal policy stop is reached
8. mark completion only when the plan is fully satisfied

Team should not rely on unstructured chat text to infer whether a step passed, failed, or needs repair.

Additional Team invariants:

- steps execute in the declared plan order unless the plan explicitly marks a parallel group
- the runtime may not invent a replacement plan implicitly during step execution
- the next serial step may not begin until the current step has a persisted reviewer verdict of `pass`
- every step execution must remain bound to the step owner, reviewer, evidence requirements, and retry rule declared by the locked plan artifact
- every step owner/reviewer assignment must resolve to an actual room member/persona snapshot that is preserved in results, reviews, and UI projections

### 8.4.1 Responses orchestration flow

Responses should use the SDK runtime to:

1. normalize the caller request into the shared runtime contract
2. preserve any required structured response schema or tool policy from the caller
3. assemble the context pack and allowed skill/tool envelope
4. run the selected agent/skill path through the gateway-routed SDK adapter
5. validate the final payload against the required response schema before it is treated as successful
6. persist runtime traces, checkpoint metadata, and terminal reason when blocked or failed

Responses invariants:

- schema-required responses may not silently degrade into free-form prose
- invalid final JSON/schema output must produce a structured runtime failure, not a hidden fallback answer
- Responses tool usage, if allowed, must remain inside the signed envelope and the same gateway/billing path
- non-work approval or resume behavior must use the generic runtime checkpoint model

### 8.4.2 Shared skill runtime flow

Shared skill runtime should use the SDK runtime to:

1. normalize internal skill execution requests into `surface = skill`
2. attach the current caller objective, expected output contract, and allowed tool/connector scope
3. select the most suitable skill implementation from capability manifests when selection is dynamic
4. execute the skill through the SDK adapter with trace, review, and checkpoint support
5. return typed output or a structured failure to the original caller

Shared skill runtime invariants:

- internal skill execution may not bypass the shared runtime contract or the gateway path
- mutating skills must keep approval, side-effect class, and connector scope from the original caller envelope
- schema-invalid or incomplete skill output must fail closed before side effects or persistence
- recursive skill-to-skill reentry must be bounded by explicit runtime ceilings and recorded in trace metadata

### 8.4.3 Media Studio prompt execution scope

Media Studio support belongs in Feature 101 only where Media Studio is acting as a prompt/skill caller.

In-scope entry points:

- `skills.enhancePrompt`
- `skills.executeCustomSkill`
- shared `surface = skill` requests carrying `originSurface = media_studio`

Required rules:

- Media Studio prompt or custom-skill requests must use the same runtime contract, manifest selection, gateway routing, traceability, and fail-closed schema behavior as other shared skill callers.
- The runtime request must preserve Media Studio caller metadata that materially affects the prompt path, such as `originSurface`, `entryPoint`, reference-asset refs, and `maxPromptLength` or equivalent prompt-shaping limits when those limits exist.
- Prompt/package outputs must remain compatible with Media Studio caller expectations so the UI can continue using the resulting prompt package without inferring missing fields from prose.

Explicit exclusions for Feature 101 round one:

- `media.generateImageAsync`
- `media.generateVideoAsync`
- `media.generateAudio`
- downstream render-job submission, polling, or provider pipeline orchestration
- media artifact lifecycle outside the prompt/skill execution path

### 8.5 Skill capability manifests

Every skill that can be selected by the agent runtime must expose a machine-readable capability manifest.

Minimum fields:

- `skillSlug`
- `skillName`
- `manifestSchemaVersion`
- `purpose`
- `surfaceSupport` (`chat`, `team`, `responses`, `skill`, or explicit multi-surface combinations)
- `supportedOriginSurfaces`
- `supportedEntryPoints`
- `taskTypes`
- `requiredContext`
- `preferredContext`
- `inputs`
- `outputs`
- `supportedArtifactTypes`
- `evidenceRequired`
- `reviewChecklist`
- `failureModes`
- `doNotUseWhen`
- `requiredConnectors`
- `writeScope`
- `sideEffectClass`
- `dataSensitivity`
- `executionMode`
- `isReadOnly`
- `riskTier`
- `latencyBudget`
- `tokenBudget`
- `defaultToolBudget`
- `humanApprovalRequired`
- `allowedModelFamilies`
- `completionSignals`
- `selectionSignals`
- `negativeSignals`
- `requiredEvidenceKinds`
- `reviewerProfile`
- `repairStrategy`
- `supportsRepairLoop`
- `ownerTeam`
- `ownerCodeownersPath`
- `ownerReviewCadence`

The runtime must prefer skills whose manifest matches the current objective, context, risk, and budget.

Manifest governance rules:

- every active-runtime-selectable skill must declare a human-owning team and code ownership path
- every manifest must explicitly say whether it is eligible for `originSurface = media_studio`
- skills whose primary job is real media generation submission may keep metadata for registry visibility, but they may not be promoted into Feature 101 active routing in round one

### 8.5.1 Implementation and manifest ownership matrix

Feature 101 must document and enforce a durable ownership split so contract changes and manifest drift do not become unowned.

Minimum ownership matrix:

| Area | Primary owner | Required reviewer | Minimum owned artifacts |
|---|---|---|---|
| Runtime contract, flags, version negotiation | Platform backend / orchestration | Python backend | shared DTOs, feature flags, version constants, compatibility tests |
| Python SDK adapter and gateway client | Python backend | Platform backend | adapter module, gateway model client, trace redaction, SDK version reporting |
| Persistence, projection, and step-link writing | Platform backend / orchestration | Team runtime owner | trace tables, checkpoint tables, Team projection services, message metadata |
| Team ledger and side-panel consumption | Web client / Team UX | Platform backend | panel DTOs, step-link navigation, legacy-safe rendering |
| Skill manifest schema and registry loader | Skill registry/platform | Runtime contract owner | manifest schema, loader, manifest validation, active/shadow readiness diagnostics |
| Planning/research/writing/review manifests | Domain owner for each skill family | Skill registry/platform | skill manifests, evidence rules, reviewer profile, retry rules |
| Media Studio prompt-skill manifests | Media Studio owner | Skill registry/platform | prompt-enhancement and custom-skill manifests eligible for `originSurface = media_studio` |
| Rollout gates, replay fixtures, and operator runbooks | QA / Observability / DevEx | Platform backend and Python backend | replay fixtures, promotion thresholds, rollout docs, recovery playbooks |

### 8.6 Review and repair contract

Every review should return a structured verdict, not only prose.

Minimum verdict fields:

- `status` = `pass` | `fail` | `needs_repair` | `blocked`
- `reasonCodes`
- `summary`
- `requiredFixes`
- `evidenceGaps`
- `canRetry`
- `reviewerAgent`
- `reviewedStep`
- `confidence`

Every repair attempt should inherit the prior verdict and state exactly which issue it is trying to fix.

### 8.7 Observability and debug contract

Every run must record:

- SDK version
- adapter version
- model and provider
- gateway route / gateway request metadata
- selected agent
- selected skill
- handoff chain
- tool usage
- review verdicts
- step ids
- attempt ids
- plan ids
- trace ids
- checkpoint ids
- idempotency keys
- terminal reason

This information must be available in the Team ledger and in backend logs so that a failed run can be reconstructed without guessing.

### 8.7.1 Step-link contract

The runtime must use one explicit step-link schema rather than asking the UI to guess which chat line belongs to which plan step.

Each persisted step link must include:

- `linkId`
- `linkType`
- `surface`
- `roomId`
- `runId`
- `stepKey`
- `attemptId` when available
- `traceId` when available
- `traceEventId` when available
- `checkpointId` when available
- `messageId` when the target is a chat/ledger message
- `executionStageId` when the target is a Team execution stage row
- `reviewRecordId` when the target is a Team review row
- `anchorId` for scroll/jump targeting inside the conversation surface
- `label`
- `isPrimary`
- `createdAt`

Allowed `linkType` values must include at least:

- `plan_summary`
- `plan_step`
- `owner_result`
- `review_result`
- `repair_result`
- `checkpoint`
- `terminal_result`
- `execution_trace`

Contract rules:

- every persisted plan step must have at least one `plan_step` link that points to its durable conversation anchor or plan-step anchor
- owner, reviewer, repair, checkpoint, and terminal messages must write their own explicit step links when they are persisted
- the right-side Team panel must navigate using these persisted links, not by text search or plan-header fallback
- the UI may scroll/focus once on click, but it must never keep forcing focus back to the same anchor after the operator starts scrolling manually
- when execution evidence is not yet persisted, the step card may show `pending` link status, but it may not pretend the plan summary link is the same thing as the step execution link

Only redacted gateway and runtime metadata may be stored in durable traces.
Raw authorization headers, JWTs, provider API keys, signed URLs, prompt attachments containing secrets, and connector credentials must never be written to trace stores, room messages, or UI payloads.

Streaming, cancellation, and resume contract:

- every emitted runtime event must include `surface`, `runId`, `stepId`, `attemptId`, `sequenceNumber`, and `idempotencyKey`
- append-only event persistence must deduplicate on the stable runtime event identity rather than trusting arrival order
- cancel requests must persist `cancelRequestedBy`, `cancelReason`, and `cancelRequestedAt`
- resume requests must reference the originating checkpoint and create a new attempt record linked back to the paused attempt
- step advancement must be idempotent: replayed `step_completed` or `review_passed` events may not advance the same step twice

### 8.8 Runtime rollout control contract

Rollout must be controlled through tenant-scoped feature flags that match the existing platform feature-flag model in `apps/web/shared/featureFlags.ts`.

The minimum new flags are:

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

Flag semantics:

- `openAiAgentsRuntimeEnabled`
  - master gate for loading the adapter path at all
- `openAiAgentsRuntimeChatShadow`
  - run the SDK runtime for Chat in shadow mode without changing user-visible output
- `openAiAgentsRuntimeTeamShadow`
  - run the SDK runtime for Team in shadow mode without changing Team step progression
- `openAiAgentsRuntimeChatActive`
  - Chat uses SDK runtime as the source of truth
- `openAiAgentsRuntimeTeamActive`
  - Team uses SDK runtime as the source of truth
- `openAiAgentsRuntimeResponsesShadow`
  - run the SDK runtime for Responses in shadow mode without changing the caller-visible response
- `openAiAgentsRuntimeResponsesActive`
  - Responses uses SDK runtime as the source of truth
- `openAiAgentsRuntimeSkillShadow`
  - run shared skill execution through the SDK runtime in shadow mode while preserving the current caller-visible result path
- `openAiAgentsRuntimeSkillActive`
  - shared skill execution uses SDK runtime as the source of truth
- `openAiAgentsRuntimeForceRollback`
  - highest-priority kill switch that routes new work back to the legacy runtime

Registration requirements:

- all new flags must be added to `TenantFeatureFlags`
- all new flags must be added to `ALLOWED_FEATURE_FLAGS`
- all new flags must be given explicit defaults in `FEATURE_FLAG_DEFAULTS`
- every new runtime flag introduced by this feature defaults to `false` until explicitly enabled
- `openAiAgentsRuntimeForceRollback` also defaults to `false`, but when enabled it overrides all lower-precedence runtime choices

Precedence order must be:

1. emergency rollback flag
2. run-level frozen runtime decision
3. room-level override, if one exists
4. tenant feature flags
5. platform defaults

Once a `team_run` or Chat execution starts, the runtime choice must be frozen on that run.
Mid-run flag changes may affect new runs only; they must not switch the orchestrator for an in-flight run.

### 8.9 Persistence and migration contract

The runtime must integrate with existing persistence instead of inventing an unrelated state model.

Required persistence rules:

- `team_runs`
  - extend with typed runtime summary columns for hot query fields and one strictly versioned runtime JSON envelope for detailed state
  - must store at least:
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
  - must also store a versioned `runtimeStateJson` envelope containing at least:
    - `schemaVersion`
    - `runtimeContractVersion`
    - `traceSchemaVersion`
    - `checkpointSchemaVersion`
    - `planDigest`
    - `stepStatuses`
    - `checkpointRefs`
    - `selectionSource`
- `team_room_messages.metadataJson`
  - must carry step-to-trace linkage for `plan_summary`, `step_result`, `work_update`, `review_result`, and `terminal_result` message types
  - must carry the persisted step-link schema, including `linkType`, `stepKey`, `attemptId`, `traceId`, `checkpointId`, `messageId`, and `anchorId` when those identifiers exist
- `auto_team_trace_events.redactedMetadataJson`
  - remains the Team-facing append-only step/event projection for UI and audit playback
  - must carry enough step-link identity to connect trace events to their matching plan step and message anchor without free-form inference
- `agency_run_traces`
  - must not be repurposed as the generic Chat/Team runtime store
  - it stays agency-specific
- new generalized runtime trace storage
  - introduce `agent_runtime_traces` as the canonical redacted runtime trace archive across Chat, Team, Responses, and shared skill-runtime surfaces
  - trace rows must be append-only and keyed so repeated delivery of the same runtime event is idempotent
- Team approval persistence
  - when a Team run reaches human approval, the system must persist the approval decision point in `work_approvals` when the room/run is backed by a work case or task
  - the Team runtime may not invent a parallel approval table for those cases
- Team pause/resume persistence
  - Team approval/resume snapshots must persist in `work_automation_run_checkpoints` when a Team run is backed by work automation
  - `resumeCursor`, `stepKey`, and checkpoint detail must be durable before the run is marked waiting or blocked
- generic non-work runtime checkpoints
  - introduce `agent_runtime_checkpoints` for Chat, Responses, shared skill runtime, or other non-work surfaces that need HITL pause/resume
  - this generic store must use the same run/step/attempt/checkpoint identity model as Team

Required migration behavior:

- migrations must be additive and fail-safe
- no destructive migration is allowed in the first rollout
- historical runs are not backfilled with invented runtime data
- old runs must render as `legacy runtime` in the UI when new runtime metadata does not exist
- Team and Chat UI must degrade gracefully when step-level runtime links are missing
- no migration may silently reinterpret legacy `team_runs` rows as SDK runtime rows
- the first rollout must preserve the ability to render draft-plan links even when audited runtime traces have not been persisted yet

Retention policy:

- redacted raw runtime traces: default 90 days
- run summary metadata needed for UI/audit: at least 365 days, or follow stricter tenant retention policy if configured
- derived aggregate metrics may outlive raw traces if they do not contain sensitive payloads

### 8.10 Security controls

The new runtime must be fail-closed and least-privilege by default.

Required security rules:

- Node remains the policy enforcement and permission brokerage layer.
- Python runtime receives a signed, bounded execution envelope and may not widen it.
- Tools are deny-by-default.
- Every request to the adapter must include:
  - tenant id
  - user id or system actor id
  - room/run id when applicable
  - allowed tools
  - allowed skills
  - connector access grants
  - budget envelope
  - approval requirements
- The adapter may only invoke tools listed in the execution envelope.
- Handoff permission must be the intersection of source-agent and target-agent scopes, never the union.
- Connector calls must still route through the existing platform gateways or brokers; the Python runtime may not fetch raw tenant secrets to call third-party APIs directly for Chat, Team, Responses, or shared skill execution.
- Mutating tools must declare their side-effect class and approval requirement before invocation.
- Any missing or invalid permission envelope must fail closed.

Prompt injection and untrusted input rules:

- retrieved search results, MCP output, connector payloads, file contents, browser captures, and tool output must be treated as untrusted evidence unless explicitly promoted by platform policy
- untrusted evidence may contribute facts, excerpts, and citations, but it may not redefine objectives, alter permissions, or override the locked plan step
- instruction precedence must always be:
  1. platform system policy
  2. signed execution envelope and locked plan step
  3. tenant-authored user or operator input
  4. normalized approved evidence context
  5. untrusted tool or retrieval output
  6. model-generated scratchpad or chain state
- lower-precedence content may not override higher-precedence policy even if it contains imperative text such as "ignore previous instructions"
- the Node-side normalization layer must scrub HTML, scripts, prompt-like control text, signed URLs, and oversized raw payloads before handing evidence to the adapter
- the adapter may only receive normalized evidence snippets or structured extracts unless a read-only parser tool is explicitly allowlisted for that content type

Trace and secret safety rules:

- No raw JWTs, gateway bearer tokens, provider API keys, internal service tokens, signed download URLs, cookie headers, or OAuth refresh tokens may be written to:
  - runtime trace tables
  - room messages
  - audit logs
  - Team ledger payloads
- Stored traces must use redacted metadata envelopes aligned with the existing `redactedMetadataJson` pattern.
- The system must scrub prompts, tool payloads, and evidence references for:
  - secrets
  - personal data beyond approved scopes
  - signed URLs
  - large document fragments not needed for debugging

Tenant isolation rules:

- Every adapter request must carry tenant identity explicitly.
- Every callback or streamed event must be validated against the same tenant and run identity.
- Cross-tenant trace lookup must fail closed.

### 8.11 Runtime guardrails and stop semantics

The runtime must expose deterministic ceilings and terminal reasons so runs cannot drift indefinitely.

Required ceilings:

- max handoffs per step
- max repair loops per step
- max same-skill retries per step
- per-step timeout
- per-run timeout
- per-step token budget
- per-run token budget
- per-step tool budget
- per-run tool budget

Plan-completion rule:

- global round caps may not be configured lower than the minimum guaranteed attempt budget derived from the plan
- the runtime must reserve enough attempt budget to try every mandatory step at least once
- if a run stops before all mandatory steps are attempted, the terminal reason must explicitly say that the plan did not complete

Step-state transition rule:

- every mandatory plan step must end each attempt in exactly one durable state:
  - `completed`
  - `needs_repair`
  - `awaiting_approval`
  - `failed_terminal`
- the runtime may not advance to the next serial step while the current step is still `in_progress`, `in_review`, or `awaiting_approval`
- every `needs_repair` transition must persist the reviewer verdict and explicit repair instructions before the next repair attempt starts
- every `awaiting_approval` transition must persist a checkpoint before the runtime acknowledges the blocked state to the UI

Required terminal reason taxonomy:

- `plan_completed`
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
- `plan_incomplete_cap_reached`

Required review outcome mapping:

- `pass`
  - step can advance
- `needs_repair`
  - same step must retry with explicit fix instructions
- `fail`
  - same step may not advance; terminal or escalation logic decides next action
- `blocked`
  - wait for approval, missing evidence, or external dependency

The UI must show these terminal reasons and review states verbatim or through stable localized labels.

### 8.12 Operational performance and visibility requirements

This feature must improve debuggability without making Chat or Team feel stalled or opaque.

Required visibility rules:

- a persisted Team plan artifact must exist before the first owner-step execution begins
- the Team side panel must be able to render that persisted plan artifact immediately after plan generation, even if audited runtime traces have not yet caught up
- every step must expose the latest persisted owner result, reviewer verdict, and current retry count without requiring inference from free-form prose

Required runtime budgets:

- shadow-mode Chat p95 time-to-first-visible-status may not regress by more than 15% against the legacy path
- shadow-mode Team p95 time from run start to persisted plan artifact may not regress by more than 20% against the current planning path
- adapter-to-durable-trace persistence lag for plan and step events should be <= 2 seconds at p95
- durable trace writing must add no more than 10% wall-clock overhead to the end-to-end step runtime at p95

These budgets are rollout gates, not aspirational notes.

---

## 9. Versioning and upgrade policy

This feature must support frequent SDK upgrades without destabilizing Chat, Team, Responses, or shared skill execution.

### 9.1 Dependency policy

- Pin the OpenAI Agents SDK in one backend dependency location only.
- Keep the OpenAI Python library dependency explicit as well, since the SDK depends on it.
- Do not spread SDK version assumptions across Node and Python service code.
- Do not create a second dependency path that allows direct provider execution outside the existing gateway for any runtime surface.

### 9.2 Contract version policy

The platform contract must be versioned independently from the SDK package version.

Required version identifiers:

- `runtimeContractVersion`
- `traceSchemaVersion`
- `checkpointSchemaVersion`
- `manifestSchemaVersion`

Versioning rules:

- request, response, streamed event, checkpoint, and persisted runtime-state envelopes must carry the relevant contract/schema versions
- these versions must be controlled from one shared contract source on the Node side and one mirrored adapter contract module on the Python side
- a contract/schema version change must be treated as a compatibility event even if the SDK package version did not change
- the UI may only rely on fields guaranteed by the declared contract/schema version

### 9.3 Mixed-deploy compatibility policy

Rolling deploys must tolerate temporary version skew between Node, Python, database migrations, and UI bundles.

Required compatibility window:

- Node and Python must support `current` and `current - 1` runtime contract versions during a rolling deploy window
- additive database migrations must land before any code path requires the new persisted fields
- the adapter `health` or capability endpoint must expose supported contract/schema versions so Node can fail closed on unsupported combinations
- if Node is newer than the adapter and the adapter does not support the requested contract version, the request must fail with a structured `unsupported_contract_version` error rather than partial execution
- if the adapter is newer than Node, it must continue honoring the previous contract version until the deploy window closes
- legacy or pre-upgrade UI bundles must continue rendering safe empty states when newer step-link or runtime metadata is absent

### 9.4 Compatibility policy

Every SDK upgrade must pass the following before production rollout:

1. adapter contract tests
2. golden replay fixtures for Chat, Team, Responses, and shared skill runtime
3. trace shape assertions
4. skill manifest selection tests
5. review-verdict schema tests
6. rollback validation
7. permission-envelope compatibility tests
8. redaction and retention tests
9. streaming and resume idempotency tests
10. approval-checkpoint compatibility tests
11. mixed-deploy `N/N-1` compatibility tests
12. contract version negotiation tests

### 9.5 Upgrade flow

The supported upgrade flow is:

1. bump SDK version in one place
2. bump or confirm runtime/trace/checkpoint/manifest contract versions only when needed
3. run adapter contract tests
4. run Chat/Team/Responses/shared-skill replay tests, including Media Studio prompt-skill fixtures
5. run mixed-deploy compatibility tests for `current/current-1`
6. compare trace outputs, step verdicts, and step-link coverage
7. ship to shadow mode
8. promote only after parity thresholds are met

### 9.6 Breakage containment

If the SDK API changes in a future release, the blast radius must stay inside the adapter.

That means:

- no UI refactor is required just to absorb SDK changes
- no plan schema migration is required just to absorb SDK changes
- no business logic rewrite is required just to absorb SDK changes

### 9.7 0.x library caution

Because the SDK is still in 0.x release space, minor updates may still be behaviorally significant.
Treat every upgrade as a compatibility event, not a routine package bump.

---

## 10. Rollout strategy

### Phase 0: Adapter introduction

- Create the new Python adapter.
- Keep the legacy orchestration path active.
- Add structured trace output for both paths.
- Register all new runtime feature flags in the tenant feature-flag allowlist with defaults disabled.

### Phase 1: Shadow mode in Chat

- Run the SDK runtime in shadow mode for Chat.
- Compare selected skills, review verdicts, and output quality against the current path.
- Do not change user-visible behavior yet.

### Phase 2: Shadow mode in Team

- Run the SDK runtime against Team plans and steps in shadow mode.
- Compare step selection, handoffs, and review outcomes.
- Ensure the Team ledger can consume the new structured outputs.
- Verify the plan artifact is visible in the right-side panel before the first execution step begins.

### Phase 3: Shadow mode in Responses and shared skill runtime

- Run the SDK runtime in shadow mode for Responses callers and internal shared skill execution.
- Compare schema validity, selected skill, model/provider route, checkpoint behavior, and caller-visible result parity.
- Ensure no hidden fallback or schema-degrading output is treated as success.

### Phase 4: Controlled activation

- Enable the SDK runtime for a small tenant, room, or caller cohort per surface.
- Keep rollback available through feature flags.
- Watch for trace drift, review mismatch, schema mismatch, or step completion regressions.

### Phase 5: Broader adoption

- Expand usage only after the shadow and canary metrics remain stable.
- Move more skills into the capability-manifest model over time.

### Promotion thresholds

No surface may move from shadow to active, or from a smaller active cohort to a broader one, unless all required thresholds are green for that surface.

Minimum numeric thresholds:

- Chat shadow p95 time-to-first-visible-status regression: `<= 15%`
- Team shadow p95 time from run start to persisted plan artifact regression: `<= 20%`
- adapter-to-durable-trace persistence lag: `<= 2 seconds` at p95
- durable trace-writing wall-clock overhead: `<= 10%` at p95
- skill-selection drift versus approved replay baseline: `<= 5%`
- Team review-verdict mismatch versus approved replay baseline: `<= 2%`
- mandatory Team step first-attempt coverage before any cap-based stop: `100%`
- schema-invalid outputs accepted as success: `0`
- duplicate step-advancement incidents: `0`
- missing non-success terminal reasons on stopped runs: `0`
- persisted step-link coverage for plan/owner/review/repair/terminal records that exist durably: `>= 99%`
- contract-validation failures inside the promoted cohort: `0`
- active-canary soak duration before broader promotion: at least `72 hours` and at least:
  - `200` Chat turns
  - `50` Team runs
  - `100` Responses calls
  - `100` shared-skill calls, with Media Studio prompt-skill calls counted in this bucket

### Operator recovery playbook

Rollout documentation and release gating must include an operator recovery playbook, not only test commands.

The playbook must cover at least:

- adapter unavailable or timeout
- unsupported contract version / mixed-deploy incompatibility
- persisted plan exists but step links are missing or stale
- repeated schema-invalid output on Responses or shared skill runtime
- Team plan review failed and requires planner repair
- Team step stuck `in_progress` or `in_review`
- duplicate or missing streamed events
- missing or invalid skill manifest
- Media Studio prompt-skill failure on `enhancePrompt` or `executeCustomSkill`

Each scenario must document:

- symptoms visible to operators or users
- the authoritative logs/queries/trace views to inspect
- the fail-safe immediate action
- the allowed recovery actions
- whether rollout flags, queue pause, replay, terminate, or manual approval/resume are appropriate
- escalation ownership

---

## 11. Risks and mitigations

| Risk | Why it matters | Mitigation |
|---|---|---|
| SDK version drift | A newer SDK release could change agent behavior | Keep one adapter boundary, one lockfile entry, and compatibility tests |
| Skill metadata is incomplete | The runtime may still choose the wrong skill | Require manifests with review criteria, failure modes, and negative constraints |
| Hidden regressions in product/runtime callers | The new runtime could change caller-visible behavior unexpectedly | Use shadow mode, replay fixtures, and parity checks before activation |
| Gateway bypass | Credits, policy, or audit could drift from the current system of record | Require all SDK model clients to target the existing gateway and add tests that reject direct provider endpoints |
| Permission expansion during handoff | An agent could gain more access after delegation than it started with | Enforce signed execution envelopes and permission intersection during handoff |
| Secret leakage in traces | Rich runtime traces can accidentally capture tokens, URLs, or PII | Redact by default, store only approved trace fields, and add automated scrub tests |
| Mid-run rollout drift | A feature flag change could switch runtime behavior during an active run | Freeze runtime selection at run start and apply flag changes only to new runs |
| Too much coupling to trace shape | UI or alerts may break when trace output changes | Version the trace schema separately from the SDK version |
| Review loops never converge | The runtime can still get stuck on low-quality steps | Require terminal stop reasons and evidence-based completion gates |
| Adapter spread | Developers may import SDK classes directly elsewhere | Add an import guard and code review rule that only the adapter may import SDK packages |
| Prompt injection through tools or retrieval | External content can try to overwrite plan intent or policy | Normalize evidence, enforce precedence rules, and treat external content as untrusted by default |
| Pause/resume drift | HITL or approval restarts can resume the wrong step or duplicate writes | Use durable checkpoints with run/step/attempt ids and idempotent resume handling |
| Duplicate streamed events | Replay or delivery retries can advance a step twice | Deduplicate append-only events on stable event identity and gate step advancement idempotently |
| Mixed-deploy contract skew | Node, Python, UI, and DB can be briefly out of sync during rolling deploys | Version the runtime/trace/checkpoint contracts separately and require `current/current-1` compatibility gates |
| Media Studio scope creep | Prompt execution and actual media generation can accidentally get coupled in the first rollout | Limit Feature 101 to Media Studio `enhancePrompt` and `executeCustomSkill` paths and keep generation pipelines explicitly out of scope |

---

## 12. Acceptance criteria

1. Chat, Team, Responses, and shared skill runtime can run through the new SDK runtime without breaking their existing caller-visible contracts.
2. For Chat, Team, Responses, and shared skill-runtime traffic, the only code that imports the OpenAI Agents SDK is the dedicated Python adapter; `agency_swarm_adapter.py` is allowed only as a temporary agency-only migration exception.
3. Every LLM request executed by the SDK still flows through the existing SmartSpecPro gateway and keeps current credit deduction semantics intact.
4. Every run stores SDK version, adapter version, model/provider, skill slug, gateway route metadata, trace id, and terminal reason.
5. Skill choice is explainable from the manifest data and is visible in debug output.
6. Review results are structured enough to answer pass/fail, why, and what to fix next.
7. Team runs continue until the entire plan is satisfied or a policy-based terminal stop is recorded.
8. A pinned SDK version bump can be validated and rolled back without touching Chat, Team, Responses, or shared skill caller code outside the adapter boundary.
9. Legacy orchestration can be restored through rollout flags without database schema changes.
10. Shadow-mode comparisons can show whether the SDK runtime improved skill selection, review clarity, and completion behavior.
11. Runtime selection is frozen at run start, and a mid-run feature-flag change cannot silently switch the orchestrator.
12. Stored traces, logs, and UI payloads never contain raw secrets, gateway auth tokens, signed URLs, or cross-tenant data.
13. Handoffs, tool calls, and connector usage cannot exceed the permission envelope issued at run start.
14. Historical runs without runtime metadata still render safely as legacy runs.
15. Team persists and renders a plan artifact before the first execution step starts, and the side panel can load that plan from durable data.
16. The runtime may not advance to the next serial plan step until the current step has a persisted reviewer `pass` verdict.
17. Untrusted tool, retrieval, connector, and file content cannot override platform policy, permission envelopes, or the locked plan step objective.
18. Approval-required Team runs persist approval state in existing work approval/checkpoint tables when work-backed, and Chat/Responses/shared-skill non-work surfaces use the generic runtime checkpoint store.
19. Streamed, replayed, cancelled, and resumed runtime events are idempotent and cannot duplicate step advancement.
20. The new runtime flags are registered in `TenantFeatureFlags`, `ALLOWED_FEATURE_FLAGS`, and `FEATURE_FLAG_DEFAULTS`, with safe disabled defaults.
21. Media Studio prompt enhancement and custom-skill execution can run through `surface = skill` with `originSurface = media_studio` while the real media generation pipeline remains outside Feature 101 round one.
22. Every durable Team plan step can expose separate links for plan summary, step anchor, owner result, reviewer verdict, repair attempts, checkpoint state, and terminal result without relying on text search.
23. Mixed-deploy windows between Node and Python support `current/current-1` contract compatibility or fail closed with a structured version error.
24. Rollout materials include a concrete operator recovery playbook and ownership matrix for contracts, manifests, UI, and adapter responsibilities.

---

## 13. Testing and validation plan

### 13.1 Adapter tests

- Verify the adapter can construct agents, tools, handoffs, and guardrails from platform DTOs.
- Verify a trace record is emitted for each run.
- Verify SDK version metadata is attached to the trace and response.
- Verify the adapter points model execution to the current SmartSpecPro gateway endpoint rather than a direct provider endpoint.
- Verify the transport path preserves the credit-attribution data required by the current gateway without storing raw auth material in traces or logs.
- Verify cancel and resume requests preserve run/step/attempt identity and create idempotent trace output.

### 13.2 Skill manifest tests

- Verify every runnable skill has the required manifest fields.
- Verify the planner rejects skills that fail negative constraints.
- Verify the runtime can rank two competing skills deterministically.
- Verify reviewer profile, repair strategy, required evidence kinds, and negative signals influence selection as expected.

### 13.3 Chat replay tests

- Replay existing Chat turns through the new runtime.
- Compare selected model/provider, selected skill, and response summary.
- Ensure regressions are visible in trace diffs.
- Verify Chat approval-required pauses persist in the generic runtime checkpoint store and resume deterministically.

### 13.4 Team replay tests

- Replay Team plans and step sequences through the new runtime.
- Verify every step returns a structured verdict.
- Verify review-failure paths produce required fix instructions and do not silently end early.
- Verify the runtime reserves enough attempt budget to touch every mandatory step before a cap-based terminal stop.
- Verify incomplete-plan stops emit `plan_incomplete_cap_reached` or another explicit non-success terminal reason.
- Verify the next serial step does not start before the current step has a persisted reviewer `pass` verdict.
- Verify Team plan artifacts are persisted before the first execution step and remain renderable even before audited trace catch-up.

### 13.5 Responses replay tests

- Replay representative Responses requests through the new runtime.
- Verify schema-required responses either validate successfully or fail with structured runtime errors.
- Verify tool-enabled Responses requests stay inside the signed envelope and gateway route.
- Verify approval-required or paused Responses requests persist generic runtime checkpoints and resume deterministically.

### 13.6 Shared skill runtime replay tests

- Replay representative internal skill execution requests through the new runtime.
- Verify selected skill, manifest explanation, and final typed output are persisted in runtime traces.
- Verify schema-invalid or incomplete skill output fails closed before downstream side effects.
- Verify recursive skill-to-skill execution respects runtime ceilings and records bounded trace metadata.
- Replay Media Studio `enhancePrompt` and `executeCustomSkill` paths through `surface = skill` with `originSurface = media_studio`.
- Verify Media Studio prompt/package outputs remain compatible with caller expectations without triggering actual media generation submissions.

### 13.7 Upgrade compatibility tests

- Run the adapter suite against the currently pinned SDK version.
- Run the same suite against the next candidate SDK version before promotion.
- Require trace and verdict parity before the version bump lands in production.
- Require gateway-path parity so an SDK bump cannot silently bypass the credit-deduction route.
- Require streaming and checkpoint compatibility so an SDK bump cannot break cancel/resume semantics.
- Require mixed-deploy `Node current / Python current-1` and `Node current-1 / Python current` compatibility tests.
- Require contract version negotiation tests for `runtimeContractVersion`, `traceSchemaVersion`, and `checkpointSchemaVersion`.

### 13.8 Import guard test

- Add a test that fails if any Node/TypeScript service imports the SDK directly.
- Add a test that fails if any non-adapter Python module imports the SDK package, with an explicit temporary allowlist entry for `agency_swarm_adapter.py` until its migration feature lands.

### 13.9 Rollout and migration tests

- Verify feature-flag precedence: rollback flag, run-frozen mode, room override, tenant flag, platform default.
- Verify a run started under the legacy path stays legacy even if SDK-active flags change later.
- Verify a run started under SDK path stays SDK even if rollback is toggled after start.
- Verify old runs with no runtime metadata still render in Chat and Team without null-reference failures.
- Verify the new runtime flags are present in `TenantFeatureFlags`, `ALLOWED_FEATURE_FLAGS`, and `FEATURE_FLAG_DEFAULTS` with disabled defaults.
- Verify Chat, Team, Responses, and shared skill runtime can each be rolled out independently through their own shadow/active flags.

### 13.10 Security tests

- Verify tool execution fails closed when the execution envelope is missing or malformed.
- Verify handoffs cannot widen tool scope, connector scope, or write scope.
- Verify trace persistence redacts secrets, signed URLs, tokens, and disallowed evidence payloads.
- Verify tenant mismatch on streamed events or callbacks hard-fails the run.
- Verify untrusted retrieved or tool-generated content cannot override the locked step objective or permission envelope.
- Verify prompt-like instructions embedded in files, HTML, MCP responses, or connector payloads are treated as evidence text, not control instructions.

### 13.11 Approval and checkpoint tests

- Verify Team approval-required states write `work_approvals` rows when the run is work-backed.
- Verify Team pause/resume states write `work_automation_run_checkpoints` rows with durable resume cursors before the UI shows blocked state.
- Verify Chat, Responses, and shared skill runtime approval-required states write generic `agent_runtime_checkpoints` rows and resume into a new linked attempt rather than mutating the paused attempt.

### 13.12 Performance and visibility gates

- Verify shadow-mode Chat p95 time-to-first-visible-status stays within the allowed regression budget.
- Verify Team p95 time from run start to persisted plan artifact stays within the allowed regression budget.
- Verify adapter-to-durable-trace persistence lag for plan and step events stays within the allowed p95 target.
- Verify trace persistence overhead stays within the allowed p95 wall-clock overhead budget.
- Verify step-link coverage for durable plan/owner/review/repair/terminal records meets the promotion threshold.
- Verify no schema-invalid output is counted as success in promoted cohorts.
- Verify Team cap-based stops never occur before every mandatory step has at least one recorded attempt.

---

## 14. Implementation boundaries

The new runtime should be introduced with the following boundaries:

- Chat and Team continue to own their own UI and ledger presentation, while Responses and shared skill runtime continue to own their existing caller contracts.
- The Python backend owns the SDK integration.
- The Node backend owns platform permissions, billing, and room state.
- The SDK runtime owns orchestration decisions, handoffs, and structured agent outputs.
- Trace and audit systems own the historical record.

This separation is what makes version updates safe.

---

## 15. Summary

Feature 101 is the runtime layer that makes Chat, Team, Responses, and shared skill execution behave like a real agent system instead of a chain of prompts.

It does that by:

- putting OpenAI Agents SDK behind one Python adapter
- feeding it structured skill manifests and shared context packs
- making review output structured and traceable
- recording version metadata so upgrades are observable
- preserving legacy behavior only as a controlled rollback path

If this feature is implemented correctly, we should get:

- better skill selection
- clearer review results
- more reliable step completion
- easier debugging
- safer SDK upgrades
- less coupling between product behavior and low-level orchestration internals
