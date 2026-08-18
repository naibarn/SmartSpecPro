# Feature 151: Unified Agent Output Assurance Orchestra

**Status:** SPEC READY FOR IMPLEMENTATION — foundation plan
**Version:** 1.0.0
**Created:** 2026-08-18
**Priority:** P0 — reusable correctness, credit protection, and safe Agent SDK adoption
**Owner:** SmartSpecPro Agent Runtime / Quality Platform
**Depends-on:** Feature 130 (OpenAI Agents SDK runtime), Feature 148 (unified agent/worker platform)
**Consumers:** Feature 150 (Vertical Drama Prompt Orchestra), image-prompt generation, custom skill execution, structured text/prompt generation, Marketplace production stages, future media and automation workflows

## 1. Executive decision

SmartSpecPro should expose one reusable **Agent Output Assurance Orchestra** for
any task that must satisfy a contract before its output is accepted. The
Orchestra is built on the existing Python OpenAI Agents adapter, but correctness
is owned by typed contracts, deterministic validators, evidence-aware verifiers,
bounded repair, and a final side-effect gate.

```text
Caller (Node / API / worker)
        |
        v
AgentTaskContract + EvidenceBundle + OutputContract
        |
        v
Output Assurance Orchestra
  normalize -> plan -> compose -> deterministic verify
            -> risk verifier -> targeted repair -> final gate
        |
        +--> VerifiedArtifact (accepted)
        +--> BlockedResult (action required)
        +--> FailedResult (retryable/system error)
```

Feature 150 remains the domain implementation for Vertical Drama. This feature
provides the shared runtime and assurance vocabulary so future image prompts,
video prompts, skills, and structured outputs do not each implement a separate
agent loop. Agency Swarm is not a target runtime: it is to be decommissioned
and removed after the migration gates in this specification pass.

## 2. Evidence from the current repository

The repository already contains a partially deployed/runtime-ready foundation:

| Evidence | Finding | Consequence |
| --- | --- | --- |
| `python-backend/app/services/openai_agents_adapter.py` | Dynamically imports `Agent`, `Runner`, `RunConfig`, `RunState`, Responses and Chat Completions models | Extend the existing adapter; do not add another bridge |
| `python-backend/app/api/internal_openai_agents_runtime.py` | Exposes authenticated `run`, `run-streamed`, `resume`, `cancel`, and `health` routes | Reuse the internal Node-to-Python boundary |
| `python-backend/app/services/openai_agents_skill_runtime.py` | Executes native skills with `Runner.run_sync`, shell boundaries, topology, and verification phases | Generalize the contract; do not bypass the security envelope |
| `apps/web/server/services/agentRuntime/*` | Has runtime selection, feature flags, request builder, backpressure, checkpoints, and response validation | Add assurance metadata and task kinds to existing contracts |
| `apps/web/shared/featureFlags.ts` | Chat/team/responses/skill Agents flags default to false | Roll out with shadow/active flags rather than changing all traffic |
| `apps/web/server/services/marketplaceAutoReviewService.ts` | Explicitly dispatches an active `openai_agents` media-production runtime | SDK upgrades affect a real production-capable path |
| `python-backend/app/services/agency_swarm_adapter.py` | Imports `agents` and `agency_swarm` directly | Legacy Agency must be isolated before a latest-SDK upgrade |
| `python-backend/.venv` | Currently contains `openai-agents 0.17.4`, `agency-swarm 1.8.0`, and `openai 2.38.0` | Installed environment is not the future target and does not prove production traffic |
| `python-backend/requirements.txt` | Direct Agents pin and Agency Swarm pin are resolver-incompatible | Add a dependency-resolution gate and split runtime profiles |

This means the correct statement is: **the SDK is not the default runtime for
all product surfaces, but it is already present and callable, and at least one
production-oriented path selects it explicitly.**

## 3. Goals

1. Provide one orchestration runtime for video prompt, image prompt, generic
   prompt, and native skill execution.
2. Require every caller to declare an input contract, evidence policy, output
   schema, validation policy, side-effect policy, and budget.
3. Keep deterministic platform checks independent from LLM-generated prose.
4. Support model-based and vision-based verification only when required by risk.
5. Repair narrowly and boundedly; never rewrite an accepted artifact silently.
6. Prevent credit-consuming or mutating side effects until the final gate passes.
7. Preserve tenant, user, asset, provider, credit, and audit authority in Node.
8. Let new task types be added through a contract adapter and Rule Pack instead
   of copying an orchestration loop.
9. Enable a safe upgrade path to the latest compatible Agents SDK, then the
   latest SDK release after legacy dependencies are isolated.
10. Replace Agency Swarm workflows with a first-class Agents SDK Orchestra that
    can discover and invoke registered skills from a user objective.
11. Produce reusable traces, QC events, regression fixtures, and policy proposals.

## 4. Non-goals

1. The Agents SDK is not the source of truth for business data or credits.
2. The Orchestra does not promise that a third-party model will render perfect
   physics or motion; it improves admission and verification evidence.
3. The Orchestra does not automatically mutate skills or policies from one bad
   output.
4. The Orchestra does not expose arbitrary shell, file, network, or MCP access.
5. The Orchestra does not force every simple LLM call through a multi-agent loop.
6. Agency Swarm is not a supported fallback or production target. Its removal
   is a required migration workstream with explicit data, workflow, and credit
   reconciliation gates.

## 5. Core contract model

### 5.1 `AgentTaskContract`

```ts
type AgentTaskContract = {
  schemaVersion: number;
  contractId: string;
  taskId: string;
  attemptId: string;
  parentAttemptId?: string;
  tenantId: string;
  userId: number;
  originSurface: string;
  taskKind:
    | "video_prompt"
    | "image_prompt"
    | "text_prompt"
    | "skill_execution"
    | "structured_generation"
    | "media_plan"
    | "custom";
  objective: string;
  sourceRevision: string;
  inputRefs: EvidenceRef[];
  evidencePolicy: EvidencePolicy;
  outputContract: OutputContract;
  constraints: ConstraintSet;
  validationPolicy: ValidationPolicy;
  sideEffectPolicy: SideEffectPolicy;
  budget: RuntimeBudget;
  providerPolicy: ProviderPolicy;
  rulePackIds: string[];
  idempotencyKey: string;
  policyHash: string;
  expiresAt: string;
};
```

The contract is immutable for one attempt. A repair creates a new attempt that
references the previous contract and output hashes.

Contracts are serialized as canonical UTF-8 JSON with sorted keys and explicit
schema/version metadata. Node computes the contract hash and owns the attempt
record; Python must echo the hash and reject mismatches. A changed objective,
evidence set, rule pack, provider policy, or side-effect scope always creates a
new attempt rather than mutating a running one.

```ts
type RuntimeBudget = {
  maxTurns: number;
  maxToolCalls: number;
  maxParallelAgents: number;
  maxPlanDepth: number;
  maxWallClockMs: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxRepairAttempts: number;
  maxEstimatedCost: number;
  onExhaustion: "block" | "await_user" | "retryable_failure";
};
```

The runtime must enforce every budget at the Node admission boundary and again
inside Python. Handoffs cannot increase turn, depth, tool, concurrency, time,
token, or cost budgets. Cyclic handoffs, recursive plan expansion, and budget
exhaustion produce stable findings instead of an unbounded agent loop.

### 5.2 Evidence bundle

```ts
type EvidenceRef = {
  refId: string;
  type: "image" | "video" | "audio" | "text" | "asset" | "database";
  canonicalId?: string;
  authorizedUrl?: string;
  checksum?: string;
  tenantId: string;
  purpose: "identity" | "composition" | "continuity" | "fact" | "style" | "input";
  freshness?: string;
};

type EvidencePolicy = {
  requiredPurposes: string[];
  requireVisionFor: string[];
  allowTextOnlyFallback: boolean;
  maxEvidenceItems: number;
  allowUntrustedText: boolean;
  minQualityScore?: number;
  onQualityFailure: "block" | "await_user";
};
```

The Orchestra receives authorized references, not arbitrary provider URLs or
unscoped storage paths. Untrusted evidence is data and must not become system
instructions. Before any credit-consuming operation, an evidence preflight must
also check readability, resolution, face/object visibility, duplicate/irrelevant
people, and reference completeness. If the image is ambiguous or too complex
to identify reliably, return `evidence_quality_insufficient` with a user-facing
instruction to replace/crop/annotate the image; never spend a provider credit
to discover that problem after generation.

### 5.3 Output contract

```ts
type OutputContract = {
  artifactKind: string;
  schemaRef?: string;
  requiredFields: string[];
  forbiddenFields?: string[];
  exactItems?: ExactOutputItem[];
  maxChars?: number;
  minChars?: number;
  allowWarnings: boolean;
  publishMode: "draft" | "verified" | "provider_ready";
};
```

Examples:

- `vertical_drama_video_prompt_v1`
- `image_prompt_with_references_v1`
- `skill_artifact_bundle_v1`
- `structured_storyboard_v1`
- `marketplace_review_stage_v1`

```ts
type SideEffectPolicy = {
  allowedEffects: Array<
    | "artifact_write"
    | "user_visible_write"
    | "provider_submit"
    | "credit_mutation"
    | "external_connector_write"
  >;
  requireUserApproval: boolean;
  approvalRef?: string;
  maxSpend?: number;
  allowRetryAfterPartialSuccess: boolean;
};
```

The policy is deny-by-default. `provider_ready` is not permission to publish or
charge by itself; the explicit side-effect policy, approval (when required),
and one-time authorization token must all match the contract hash.

### 5.4 Constraint set

```ts
type ConstraintSet = {
  identity: IdentityConstraint[];
  composition: CompositionConstraint[];
  dialogue: DialogueConstraint[];
  temporal: TemporalConstraint[];
  physics: PhysicsConstraint[];
  safety: SafetyConstraint[];
  continuity: ContinuityConstraint[];
  provider: ProviderConstraint[];
};
```

The generic contract allows domain-specific constraints without forcing all
tasks to understand Vertical Drama fields.

### 5.5 Universal skill orchestration contract

The Orchestra is the product entry point for complex work. A user objective is
not passed directly to an arbitrary skill. It is resolved through a signed skill
manifest, an execution plan, and the same assurance loop used by media prompts.

```ts
type SkillManifest = {
  skillId: string;
  version: string;
  manifestHash: string;
  signature: string;
  source: "builtin" | "tenant" | "marketplace";
  status: "active" | "quarantined" | "revoked";
  taskKinds: string[];
  triggerExamples: string[];
  inputSchema: string;
  outputContract: string;
  requiredEvidence: string[];
  requiredCapabilities: string[];
  allowedTools: string[];
  sideEffectClass: "read_only" | "draft" | "provider_ready" | "mutating";
  verification: { commands: string[]; rulePackIds: string[] };
  maxRepairAttempts: number;
  budgetClass: string;
  owner: string;
  compatibleContractVersions: string[];
};

type OrchestraExecutionPlan = {
  planId: string;
  objectiveHash: string;
  selectedSkills: Array<{ skillId: string; version: string; reason: string }>;
  steps: Array<{
    stepId: string;
    skillId: string;
    dependsOn: string[];
    inputRefs: string[];
    outputContract: string;
  }>;
  requiredApprovals: string[];
  maxTotalCost: number;
};
```

The planner may select only manifests registered for the tenant and task kind;
it cannot invent a skill, tool, provider, permission, or output field. Node must
verify the manifest signature/hash, active status, owner, contract compatibility,
and tenant scope before exposing it to the Manager Agent. Skill instructions,
retrieved documents, and user text are untrusted data and cannot override the
Orchestra system policy or tool allowlist. The plan is persisted before
execution and is immutable for the attempt. A changed plan creates a new
attempt and records the parent hash.

### 5.6 Agents SDK orchestration topology

Use the Python OpenAI Agents SDK as the execution engine while keeping Node as
the platform authority:

```text
User objective
  -> Node admission + skill catalog retrieval
  -> Manager Agent (plan only, structured OrchestraExecutionPlan)
  -> Runner
       -> specialist Agents / registered skills as tools or handoffs
       -> deterministic validators and evidence verifiers
       -> bounded repair agent (only targeted findings)
  -> Node final gate and artifact/credit decision
```

Mapping from the retired Agency model is explicit:

| Retired Agency concept | Agents Orchestra replacement |
| --- | --- |
| Agency agent | SDK `Agent` with a typed task contract |
| communication flow | Handoff or agents-as-tools edge in the persisted plan |
| Agency tool | Registered function tool or governed MCP tool |
| shared memory | Platform session/checkpoint plus scoped evidence refs |
| guardrails | SDK guardrails for interaction safety plus deterministic final gate |
| streaming | `Runner.run_streamed` through the existing internal route |
| cancel/resume | Node cancellation token and SDK `RunState` checkpoint |
| Agency output validator | Output contract, Rule Pack, and assurance verdict |

The Manager Agent cannot publish artifacts, reserve credits, or submit to a
provider. Those operations require a Node-authorized final-gate token created
after all required validators pass.

### 5.7 Supported task-kind and future-use-case registry

Every new use case is a new task adapter plus Rule Pack, not an ad-hoc prompt
instruction. Initial registry:

| Task kind | Required semantic checks |
| --- | --- |
| `video_prompt` | identity, cast count, speaker/lip-sync, action order, physics, props, camera, provider length |
| `image_prompt` | reference identity, exact object/person count, composition, exclusions, provider limits |
| `text_prompt` | required sections, language, citations/evidence, length, forbidden claims |
| `skill_execution` | manifest scope, tool permissions, artifact proof, verification commands, side effects |
| `structured_generation` | JSON/schema, required/forbidden fields, enum validity, provenance |
| `phone_call_scene` | visible speaker face, virtual phone screen, audio attribution, no off-screen speaker ambiguity |
| `cross_location_dialogue` | location continuity, explicit intercut sequence, visible face per speaker, audio ownership |
| `shout_across_scenes` | distance/line-of-sight semantics, visible speaker, no impossible simultaneous lip sync |
| `voiceover_or_narration` | narrator identity, intentional face visibility policy, no accidental character mouth movement |
| `prop_interaction` | prop ownership, contact/order, continuity, natural physics, no duplicate/merged props |

The registry is versioned and rejects an unregistered task kind. For complex
cases, multiple Rule Packs compose under one contract; conflicting hard rules
produce `ORCHESTRA_CONSTRAINT_CONFLICT` and require user correction instead of
letting the model choose silently.

### 5.8 Agency Swarm full decommission plan

The migration is a required workstream, not an optional fallback design.

#### Phase A — Inventory and freeze

1. Build a machine-readable census of Python imports, Node routers/services,
   workflow nodes, Tauri destinations, package manifests, environment flags,
   database tables, jobs, tests, docs, and API clients that mention Agency.
2. Mark all Agency-created workflows/runs with a stable
   `agency_deprecated`/`migration_required` state; do not silently reinterpret
   their graph or spend new credits.
3. Disable creation of new Agency Swarm runs and new Agency workflow versions.
4. Drain or explicitly cancel active runs with idempotent credit reconciliation.

The freeze must cover synchronous requests, queued jobs, scheduled jobs,
stream reconnects, provider webhooks/callbacks, retries, and desktop/Tauri
workers. A route that is not in the census is not considered safe to remove;
the inventory artifact must include owner, call path, data tables, feature flag,
queue name, and a proof command for every reference.

#### Phase B — Capability parity and data mapping

1. Map each Agency agent, communication edge, tool, memory field, approval,
   stream event, retry, cancellation, and output artifact to an Agents SDK
   manifest/plan or mark it explicitly unsupported.
2. Define import/export fixtures for agency definitions, workflow graphs, run
   state, audit events, artifacts, and user-visible links.
3. Keep historical Agency records read-only during the retention window; never
   delete them as part of a code deploy.
4. For unsupported graphs, show a migration-required result with a repair path;
   never auto-generate a different workflow without user approval.

Use an explicit migration state machine:

```text
active -> frozen -> exporting -> parity_review -> migrated
                                      |              |
                                      v              v
                                migration_required  read_only_archived
active -> cancelled -> credit_reconciled
```

Each transition is idempotent and records source/target version, actor,
timestamp, export checksum, mapping report, unresolved fields, provider-task
references, and credit reconciliation outcome. A migration failure must leave
the source record readable and must not partially publish an Agents plan.

#### Phase C — Route and runtime cutover

1. Route all new complex requests through the Agents Orchestra manager and
   registered skill catalog. No new request may call `agency_swarm_adapter.py`.
2. Migrate Agency API/UI actions to the neutral Orchestra workspace or a
   read-only historical view.
3. Replace Agency workflow execution nodes with typed plan steps and governed
   tools/handoffs; preserve audit IDs and idempotency keys.
4. Maintain a temporary migration worker only for exporting/reconciling old
   records. It must not be selectable as an execution engine or fallback.

#### Phase D — Remove package and code surface

1. Remove `agency-swarm` from active requirements/lock files and remove its
   adapter, imports, routes, tasks, tool wrappers, and runtime feature flags.
2. Remove Agency-only Tauri/runtime destinations and package materializers.
3. Remove Agency creation/execution APIs and UI after historical read-only
   access and redirects are verified.
4. Retain only versioned archival schemas/migrations required by retention;
   drop database tables only in a separately approved data-retention change.
5. Add CI forbidden-reference checks for active code/manifests and a test that
   no route can instantiate or invoke Agency Swarm.

The forbidden-reference check must distinguish historical documentation from
executable code. It must fail for Python imports, package manifests/lockfiles,
runtime flags, routers, queue workers, Tauri enums/materializers, dynamic
import strings, and deployment images. Historical specs are allowed only under
an explicitly archived path and must link to this superseding specification.

#### Phase E — Closeout

The decommission is complete only when usage telemetry is zero for the defined
retention window, all active workflows are migrated/cancelled, credits are
reconciled, historical links are safe, active dependency resolution contains
no Agency package, and the Agents Orchestra has passed parity and canary gates.

No automatic rollback to Agency is allowed after this gate. Rollback means
blocking the task, replaying a deterministic prior artifact, or reverting the
Agents Orchestra deployment while keeping Agency code unavailable.

### 5.9 Universal request lifecycle and user-visible states

The Orchestra must be callable as one product capability rather than as a
collection of hidden skill endpoints. The existing Node runtime boundary should
expose a versioned request/stream contract with these states:

```text
admitted -> planned -> running -> verifying -> repairing
                         |                    |
                         v                    v
                  awaiting_user         provider_ready
                         |                    |
                         +--> running        v
                                      committed | blocked | failed | cancelled | expired
```

Every state transition is persisted with `executionId`, `attemptId`, actor,
reason code, contract hash, output hash, and an idempotency key. Streaming is
progress only; a client reconnect must replay the durable event cursor and may
not create another run. `awaiting_user` is mandatory for ambiguous evidence,
missing required details, approval-required side effects, and exhausted repair
budgets. The final answer to the user must include the selected skill(s), the
result/artifact references, warnings, verification status, and the next action
when the result is blocked.

## 6. Assurance stages

### Stage 0 — Admission and normalization

Deterministically validate tenant/user scope, evidence authorization, provider
capabilities, task kind, schema version, budgets, idempotency, and allowed tools.
Reject malformed or contradictory contracts before an agent call.

### Stage 1 — Planner

Select the Rule Packs, required validators, model/vision capability, and safe
execution path. The planner may propose a plan but cannot override hard
constraints or side-effect policy. Capability selection is evaluated before
quality preference: if the contract requires image/audio/structured-output
support, only enabled, routable, healthy models with that capability are
eligible. Recommended-model ranking may choose among eligible candidates, but
it cannot downgrade to text-only or an unavailable provider. Any transient
rotation records the selected model, reason, health snapshot, and fallback
provenance in the attempt.

### Stage 2 — Composer

Use the requested skill or domain composer to produce a structured draft. The
Composer may generate wording, but all exact facts, identities, items, and
required fields come from the contract/evidence bundle.

### Stage 3 — Deterministic verifier

Run schema, exact-item, identity, count, reference, length, policy, and hash
checks without an LLM. This stage must be cheap and run before vision review.

### Stage 4 — Risk-based verifier

Call a vision/audio/temporal/physics verifier only when the contract or risk
classifier requires it. The verifier returns structured findings with confidence,
evidence references, and blocking status.

### Stage 5 — Targeted repair

Repair only named defect codes. The repair input includes the failing assertion,
the immutable contract, and the draft hash. Maximum automatic attempts are
configured per task kind and default to two.

### Stage 6 — Final gate and publication

Produce a `VerifiedArtifact` only when all critical assertions pass. The final
gate is deterministic, idempotent, and repeated by Node before any provider,
credit, publish, or mutating tool call.

## 7. Task adapters

### 7.1 Video prompt adapter

Feature 150 supplies:

- cast/identity anchors;
- dialogue speaker events;
- face visibility policy;
- explicit per-character descriptions with custom text taking precedence over
  ambiguous left/right or viewer-position cues; empty descriptions are omitted;
- camera/intercut/split-screen grammar;
- prop and physical continuity;
- provider prompt budget;
- post-render QC linkage.

Dialogue and action events must carry an explicit `speakerCharacterKey` and
visible-face policy. The verifier rejects a line whose speaker is inferred only
from screen position, and rejects simultaneous lip movement for silent
listeners unless the task contract explicitly declares an intentional overlap.

### 7.2 Image prompt adapter

The image adapter must support:

- one or multiple reference images;
- identity/face lock requirements;
- composition and camera constraints;
- custom character descriptions;
- exact object/product requirements;
- negative constraints;
- model capability and reference-count limits;
- output schema separating prompt, negative prompt, references, and warnings.

It must not silently substitute a text-only model when an image-grounded check
is required.

### 7.3 Generic text-prompt adapter

Supports prompts for story, storyboard, product, marketing, or automation tasks
with:

- required sections/fields;
- exact terms or facts;
- maximum provider length;
- forbidden unsupported claims;
- citation/evidence requirements;
- deterministic post-processing and schema validation.

### 7.4 Native skill adapter

Uses the existing native skill bundle contract, topology, shell boundary,
verification command, artifact paths, and allowed subagents. It adds:

- output contract validation;
- artifact checksum and workspace scope checks;
- completion proof separate from agent self-report;
- repair/resume state;
- side-effect admission before publish or mutation.

A skill that only returns prose can run in `draft` mode, but cannot produce a
`provider_ready` or `verified` artifact without a declared output contract.

### 7.5 Structured generation adapter

Supports Pydantic/JSON-schema outputs and validates:

- required keys and types;
- enum/domain values;
- cross-field invariants;
- source evidence references;
- no extra unapproved entities;
- deterministic canonical hash.

## 8. Rule Pack registry

Rule Packs are versioned, discoverable, and independently testable:

```ts
type AssuranceRulePack = {
  id: string;
  version: string;
  taskKinds: string[];
  requiredEvidence: string[];
  deterministicValidators: string[];
  modelValidators: string[];
  blockingCodes: string[];
  repairPolicy: "none" | "targeted" | "user_required";
  sideEffectRequirements: string[];
};
```

Initial shared packs:

- `output_schema_completeness`
- `exact_item_preservation`
- `tenant_evidence_authority`
- `provider_budget`
- `identity_anchor`
- `reference_image_grounding`
- `artifact_lineage`
- `skill_verification_proof`
- `media_credit_gate`
- `no_unapproved_entities`
- `evidence_quality_preflight`
- `prompt_injection_boundary`
- `provider_capability_match`
- `speaker_face_visibility`
- `motion_physics_consistency`
- `side_effect_authorization_token`
- `agency_reference_forbidden`

Domain packs such as `vertical_drama_phone_call` live in Feature 150 and compose
with the shared packs.

## 9. Generic result and defect taxonomy

```ts
type AssuranceRunResult = {
  status:
    | "planned"
    | "running"
    | "verifying"
    | "repairing"
    | "awaiting_user"
    | "verified"
    | "provider_ready"
    | "committed"
    | "warning"
    | "blocked"
    | "failed"
    | "cancelled"
    | "expired";
  artifact?: VerifiedArtifact;
  findings: AssuranceFinding[];
  attempts: AttemptSummary[];
  traceId: string;
  contractHash: string;
  outputHash?: string;
  nextAction?: UserAction;
};

type AssuranceFinding = {
  code: string;
  severity: "info" | "warning" | "critical";
  stage: string;
  path?: string;
  message: string;
  evidenceRefs: string[];
  repairable: boolean;
};
```

Required shared codes include:

- `contract_invalid`
- `contract_expired`
- `budget_exhausted`
- `handoff_cycle_detected`
- `skill_manifest_invalid`
- `skill_manifest_revoked`
- `prompt_injection_detected`
- `evidence_unauthorized`
- `evidence_missing`
- `evidence_quality_insufficient`
- `vision_capability_missing`
- `schema_missing_field`
- `exact_item_missing`
- `unapproved_entity`
- `identity_anchor_missing`
- `provider_budget_exceeded`
- `provider_capability_mismatch`
- `artifact_hash_mismatch`
- `verification_proof_missing`
- `side_effect_not_authorized`
- `side_effect_token_expired`
- `idempotency_conflict`
- `repair_budget_exhausted`
- `dependency_profile_unresolved`

## 10. Side-effect and credit policy

The Orchestra distinguishes three output modes:

1. `draft`: may return a warning draft; no provider submit or mutation.
2. `verified`: safe for user review/publication according to task policy.
3. `provider_ready`: may reach a provider only after Node revalidates the final
   artifact and reserves credits idempotently.

Agent tools must declare side-effect classes:

```text
read_only
artifact_write
user_visible_write
provider_submit
credit_mutation
external_connector_write
```

The SDK agent cannot escalate its own tool scope. A failed final gate must not
reserve or spend video/image credits.

Provider limits are resolved from a versioned capability profile before
composition:

```ts
type ProviderCapabilityProfile = {
  provider: string;
  model: string;
  maxPromptChars: number;
  maxInputTokens?: number;
  maxReferences: number;
  supportsVision: boolean;
  supportsAudio: boolean;
  supportsStructuredOutput: boolean;
  profileVersion: string;
};
```

The composer must target the selected profile (for example, Kie/Grok's 4,096
character video-prompt limit) and the deterministic verifier must count the
same normalized payload that will be submitted. The system must never silently
truncate, summarize, or drop references to fit a provider limit. If the draft
exceeds a hard limit, it must run a lossless targeted compression attempt or
return `provider_budget_exceeded` with an actionable user choice before credits
are reserved.

Before a paid or external action, Node issues a one-time authorization token:

```ts
type SideEffectAuthorization = {
  tokenId: string;
  tenantId: string;
  contractHash: string;
  outputHash: string;
  policyHash: string;
  allowedEffects: string[];
  providerTaskId?: string;
  expiresAt: string;
  nonce: string;
};
```

Provider, credit, publish, and connector executors must reject a missing,
expired, reused, or hash-mismatched token. Reservation and submission are
idempotent on the same `idempotencyKey`; refunds/reconciliation are recorded
when a provider accepts a task but the client disconnects.

## 11. Runtime/API integration

Extend the existing `AgentRuntimeRequest` and `AgentRuntimeResponse` contracts
with optional, versioned assurance fields:

```ts
assurance?: {
  executionId: string;
  attemptId: string;
  taskKind: string;
  contractRef: string;
  contractHash: string;
  rulePackIds: string[];
  outputContractRef: string;
  requiredMode: "draft" | "verified" | "provider_ready";
  maxRepairAttempts: number;
  runtimeBudget: RuntimeBudget;
  providerProfileRef?: string;
  selectedSkillRefs?: string[];
};
```

The internal route remains:

```text
Node AgentRuntimeClient
  -> /api/internal/openai-agents-runtime/run
  -> existing Python OpenAIAgentsAdapter
```

The frontend never calls Python directly. Node remains authoritative for:

- tenant/user authorization;
- media and library ACLs;
- credit reservation/deduction/refund;
- provider submission;
- artifact publication;
- task cancellation and reconciliation.

The route must support `run`, `run-streamed`, `resume`, `cancel`, and durable
event replay under the same execution id. Python returns a structured
`AssuranceRunResult`; prose-only or SDK self-reported completion is not a valid
success response. Node revalidates the contract/output hashes, status, findings,
and side-effect token before making any downstream call.

## 12. OpenAI Agents SDK dependency profiles

### 12.1 Current state

The repository has an installed `openai-agents 0.17.4` and `agency-swarm 1.8.0`.
The default feature flags for chat, team, responses, and shared skill runtime
are disabled, but Marketplace Auto Review explicitly selects the Agents runtime
for media-production stages. `agency_swarm_adapter.py` also imports Agents SDK
symbols directly.

Therefore a package upgrade must be treated as a runtime migration, not only a
requirements edit.

### 12.2 Target profiles

Create explicit dependency profiles:

```text
agents-orchestra profile:
  openai-agents==0.21.1
  openai>=3,<4
  HTTPX2-compatible transport stack

agency-migration profile (temporary, read-only export/reconciliation only):
  agency-swarm and its exact transitive SDK constraints
  isolated from the Orchestra process; never selectable for new execution
```

The main Python process must not claim both profiles are installed in one
resolver environment unless the resolver proves it. The existing direct pin
and Agency Swarm pin are incompatible and must be removed from the same
production lock set before enabling the new profile. The migration profile is
not a production fallback and has a removal deadline tied to the decommission
closeout gate.

### 12.3 Upgrade sequence

1. Add a CI dependency-resolution check for every profile.
2. Inventory all Python imports and runtime paths, including Marketplace and
   Agency migration/read-only routes.
3. Extract the Agency migration adapter into its own optional worker/container;
   prohibit it from accepting new execution requests.
4. Create the Orchestra profile with exact `openai-agents==0.21.1` and
   `openai>=3,<4`.
5. Migrate custom OpenAI clients, HTTP clients, transports, retry handling, and
   gateway adapters to HTTPX2-compatible interfaces.
6. Run adapter contract, streaming, resume, tracing, vision, and provider-mock
   tests against the profile.
7. Run Marketplace and native-skill canaries with credits disabled or mocked.
8. Enable shadow mode, compare legacy and Orchestra outputs, and record drift
   without duplicate paid provider calls.
9. Enable active mode per tenant/task kind; rollback is block/replay, never an
   Agency execution fallback.
10. Remove the Agency package, adapter, and old shared pin after migration
    usage reaches zero and historical retention checks pass.

The latest SDK release and its dependency changes must be rechecked at the
implementation date; the exact pin is not allowed to float in production.

## 13. Rollout by task kind

### Phase A — Runtime health and contract-only

- Keep all production side effects disabled.
- Validate contracts and rule packs without provider submission.
- Expose health with SDK version, dependency profile, and supported schemas.

### Phase B — Text and image prompt shadow

- Run Composer and validators beside the existing direct/composer path; do not
  execute Agency Swarm or duplicate a paid provider call.
- Compare required fields, length, evidence, and model/provider selection.
- No user-visible replacement until drift is understood.

### Phase C — Native skill shadow

- Execute only read-only or isolated verification phases.
- Compare artifact manifests and verification commands.
- Suppress mutations and connector writes.

### Phase D — Vertical Drama provider-ready gate

- Enable Feature 150 for selected tenants/shots.
- Block speaker, identity, cast, interaction, and reference failures.
- Submit only after final Node gate and credit reservation.

### Phase E — Active reusable runtime

- Enable image prompt and generic skill task kinds.
- Add post-output QC and policy proposals.
- Retire duplicated per-feature loops.

### Implementation waves and exit gates

1. **Contract foundation:** canonical schemas, hashes, budgets, capability
   profiles, manifest verification, event persistence, and Node/Python parity.
2. **Orchestra routing:** Manager Agent planning, catalog retrieval, tools/
   handoffs, cycle detection, durable resume, and structured final answers.
3. **Assurance:** deterministic validators, evidence-quality preflight, risk
   verifiers, targeted repair, one-time side-effect tokens, and credit gates.
4. **Domain adapters:** Feature 150 video prompts, image prompts, native skills,
   structured text, and the future-use-case Rule Packs.
5. **Agency decommission:** freeze/drain, export/parity, read-only historical
   access, route cutover, dependency removal, forbidden-reference CI, and
   retention closeout.

Each wave requires focused tests and an operator sign-off before the next wave;
the system must not enable paid provider-ready mode merely because the Composer
or Manager Agent works in isolation.

## 14. Testing and evaluation

### 14.1 Contract parity

- TypeScript/Python schema fixtures must hash identically.
- Unknown fields and version mismatches fail closed.
- Tenant/evidence references cannot cross scopes.

### 14.2 Task-kind fixtures

At minimum:

1. Vertical Drama proposal with multiple speakers.
2. Phone call with virtual screen.
3. Cross-location intercut.
4. Image prompt with two identity references.
5. Image prompt with an unrelated extra person.
6. Product image prompt with exact object count.
7. Generic prompt with required sections and max length.
8. Native skill with valid `scripts/verify.sh` proof.
9. Native skill with false completion but missing artifact.
10. Structured output with missing and extra fields.
11. Blurry/occluded reference image with an unrelated extra person.
12. Custom character description that must override left/right position cues.
13. Phone call with virtual screen and visible speaking face.
14. Cross-location intercut and shout-across-scenes dialogue.
15. Provider prompt at exactly, below, and above the Kie/Grok 4,096-character limit.
16. Prompt-injection text embedded in a skill, document, image metadata, or user
    evidence.

### 14.3 SDK compatibility

- Import boundary and runtime health tests.
- Dependency profile resolution tests.
- Agents SDK `Runner.run`, streamed run, resume, cancellation, tracing, and
  structured output tests.
- HTTPX2/OpenAI v3 transport tests.
- Agency migration-profile export/reconciliation tests until decommissioned;
  no new execution tests or production fallback tests.

### 14.4 Credit and side-effect tests

- Blocked output never calls provider submit.
- Retry does not double-reserve credits.
- Shadow mode suppresses mutation.
- Stale artifact hash is rejected by Node final gate.
- Cancellation and timeout reconcile reservations.

### 14.5 Adversarial, replay, and migration tests

- Property/fuzz tests cover canonical contract hashes, unknown fields, duplicate
  entities, cyclic handoffs, recursive plans, and budget exhaustion.
- Cross-tenant evidence, skill-manifest, tool, and artifact references fail
  closed.
- A disconnected client can replay the event cursor without creating a second
  attempt or provider task.
- Every paid-side-effect test proves that no provider/credit call occurs before
  a valid one-time authorization token.
- Migration fixtures cover queued jobs, webhooks, retries, active runs,
  cancelled runs, unsupported graphs, foreign keys, exports, and credit
  reconciliation; rerunning the migration produces no additional side effect.
- Load/fault tests cover max concurrency, Python outage, Redis loss, database
  retry, stale approval, provider timeout, and partial provider acceptance.
- Browser tests verify that ambiguous evidence presents a correction/upload
  action and does not silently continue to generation.

## 15. Observability and learning

Every run records:

- task kind, contract version/hash, output schema, Rule Pack versions;
- SDK, adapter, dependency profile, model, provider, and fallback provenance;
- deterministic and model-based findings;
- repair attempts and parent hashes;
- artifact, credit, provider-task, and user-feedback references;
- legacy-versus-Orchestra drift in shadow mode.

Feature 149 owns Vertical Drama learning records. A shared assurance event
projection should be added only once and referenced by domain ledgers; raw model
failures must never directly rewrite a skill.

The operational dashboard must expose, by tenant and task kind:

- admission-block rate and top reason codes;
- evidence-quality failure rate and user correction completion rate;
- first-pass verification rate, repair rate, repair success rate, and false-block
  rate from reviewed samples;
- provider-ready rate, paid-side-effect vetoes, duplicate/idempotency conflicts,
  credit leakage, and refund/reconciliation latency;
- agent turns, tool calls, handoff depth, wall-clock latency, token/cost budget,
  queue age, cancellation rate, and Python/Node contract mismatch rate;
- Agency invocation count, migration state counts, and forbidden-reference CI
  failures until decommission closeout.

Define alert thresholds and owners before canary. Traces must be redacted,
retained by policy, and correlated with `executionId`, `attemptId`, provider
task id, and credit ledger id without exposing secrets or raw private evidence.

## 16. Security and operational requirements

1. Separate service identity for the Orchestra profile and the temporary Agency
   migration worker; the latter has read-only/export permissions only.
2. No arbitrary model-selected tool or connector escalation.
3. Authorized media references only; no unrestricted storage URLs in prompts or
   traces.
4. Per-tenant concurrency/backpressure and bounded repair budgets.
5. Redacted traces for prompts, images, audio, secrets, and provider payloads.
6. Health endpoint must report dependency profile and SDK version, but not keys.
7. Rollback flag must be able to block or replay a prior verified artifact; it
   must not return a task kind to Agency execution.
8. New task kinds require a Rule Pack, output schema, fixtures, and owner.
9. Treat user text, retrieved documents, skill files, image metadata, and
   provider responses as untrusted content; only signed platform policy can
   grant tools, skills, connectors, or side effects.
10. Enforce per-tenant skill catalog scope, manifest revocation, allowlisted
    model/provider capabilities, and maximum handoff depth at every hop.
11. Define retention/deletion policy for prompts, evidence refs, traces, QC
    findings, migration exports, and provider payloads; honor legal holds and
    tenant deletion requests without deleting immutable credit/audit records.

## 17. Acceptance criteria

1. Video prompt, image prompt, text prompt, and native skill callers use the same
   runtime request/response boundary.
2. Each caller declares a contract and output schema; free-form output cannot be
   marked `provider_ready` without validation.
3. Deterministic verification runs before model-based verification and before
   any side effect.
4. A new use case can be added as an adapter plus Rule Pack without copying the
   Orchestra loop.
5. Every critical failure returns a stable code and actionable next action.
6. Shadow mode can compare legacy and Orchestra outputs without duplicate paid
   provider work.
7. The temporary Agency migration profile and Agents Orchestra dependency
   profiles resolve independently, and the migration profile is not selectable
   for new runs.
8. The Agents Orchestra profile can run `openai-agents==0.21.1` after the
   OpenAI v3/HTTPX2 migration tests pass.
9. Node final gate rejects stale, altered, unauthorized, or unverified output.
10. Feature 150 can enforce identity/face/speaker constraints without changing
    the generic runtime.
11. Image prompt generation can enforce reference-image and exact-object rules.
12. Native skill execution can prove verification and artifact completion.
13. All runs are traceable and linked to tenant-scoped QC/learning records.
14. Runtime budgets enforce max turns, tool calls, handoff depth, concurrency,
    wall-clock time, tokens, repairs, and estimated cost in both Node and Python.
15. Provider capability profiles prevent silent prompt truncation, dropped
    references, unsupported vision/audio use, and over-limit submissions.
16. Ambiguous or low-quality evidence blocks before credit reservation and
    presents a user correction path.
17. Skill manifests are signed/versioned/revocable, tenant-scoped, and cannot
    expand their own tools or side-effect permissions.
18. Durable state/event replay is idempotent across reconnect, retry, cancel,
    timeout, and provider callback races.
19. Adversarial, migration, load, fault-injection, and browser correction tests
    pass for the required task kinds.
20. Agency Swarm has no executable active reference, no new-run flag, no
    automatic fallback, and its migration state/credit reconciliation is proven
    for all retained records.

## 18. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Latest SDK breaks custom transport | Isolated profile, HTTPX2 migration tests, staged canary |
| Legacy Agency still receives traffic | Block new Agency runs, isolate a read-only migration worker, and alert on any invocation |
| Agent loop increases cost | Deterministic-first, risk-based verifiers, bounded repairs |
| Generic contract becomes too abstract | Task adapters and domain Rule Packs with golden fixtures |
| False positives block valid output | Hard/soft severity, user action, shadow measurement |
| Schema drift between Node/Python | Shared fixtures, canonical hashes, compatibility versions |
| New use case bypasses assurance | API rejects missing task kind/output contract/Rule Pack |
| Prompt injection changes agent behavior | Treat all non-policy content as data; signed manifests, tool allowlists, and injection fixtures |
| Reconnect/webhook race duplicates work | Durable event cursor, idempotency keys, one-time side-effect tokens, reconciliation job |
| Ambiguous reference wastes credits | Evidence-quality preflight and `awaiting_user` correction state before provider admission |
| Migration partially loses an Agency run | State machine, checksummed export, read-only source, foreign-key audit, rerunnable migration |
| Orchestra becomes an unbounded autonomous loop | Enforced turn/depth/tool/time/token/cost budgets and cycle detection in both runtimes |

## 19. Implementation file map

Extend existing seams first:

- `apps/web/shared/agentRuntime/types.ts`
- `apps/web/server/services/agentRuntime/requestBuilder.ts`
- `apps/web/server/services/agentRuntime/client.ts`
- `apps/web/server/services/agentRuntime/skillRuntimeOrchestrator.ts`
- `apps/web/server/services/agentRuntime/runtimeSelection.ts`
- `python-backend/app/services/openai_agents_contracts.py`
- `python-backend/app/services/openai_agents_adapter.py`
- `python-backend/app/services/openai_agents_trace.py`
- `python-backend/app/api/internal_openai_agents_runtime.py`

Add shared assurance modules only after the contract boundary is proven:

- `apps/web/server/services/agentAssurance/contract.ts`
- `apps/web/server/services/agentAssurance/validator.ts`
- `apps/web/server/services/agentAssurance/rulePackRegistry.ts`
- `apps/web/server/services/agentAssurance/finalGate.ts`
- `python-backend/app/services/agent_output_assurance.py`
- `python-backend/app/services/agent_output_verifiers.py`
- `python-backend/app/services/agent_output_rulepacks.py`
- `apps/web/server/services/agentRuntime/skillCatalog.ts`
- `apps/web/server/services/agentRuntime/orchestraPlanner.ts`
- `apps/web/server/services/agentRuntime/orchestraFinalGate.ts`
- `apps/web/server/services/agentRuntime/orchestraEventReplay.ts`
- `apps/web/server/services/agentRuntime/providerCapabilityProfiles.ts`
- `apps/web/server/services/agentRuntime/skillManifestVerifier.ts`
- `apps/web/server/services/agencyDecommissionService.ts`
- `apps/web/server/jobs/agencyDecommissionReconciliationJob.ts`
- `apps/web/shared/agentRuntime/orchestraSchemas.ts`
- `python-backend/app/services/openai_agents_orchestra.py`
- `python-backend/app/services/agent_runtime_budgets.py`
- `python-backend/app/services/agent_side_effect_tokens.py`
- `python-backend/app/services/agency_migration_export.py` (temporary and read-only)
- `scripts/ci/forbid-agency-swarm-active-references.*`

The implementation must also identify the authoritative Drizzle tables/migrations
for execution attempts, event cursors, side-effect tokens, migration state, and
credit reconciliation before adding new tables. A spec implementation may not
create a second source of truth beside the existing runtime/credit ledgers.

Do not create another `openai_agents_adapter.py` or another provider/credit
authority.

## 20. Definition of done

The foundation is complete when:

- current runtime usage is observable by task kind and dependency profile;
- the shared contract and result schema are versioned and parity-tested;
- video, image, text, and skill adapters have at least one golden fixture;
- deterministic final gating blocks unverified side effects;
- the temporary migration profile and latest SDK profile resolve independently
  and are health-checked without exposing Agency as an execution option;
- the 0.21.1 profile passes transport, runtime, and staging canaries;
- Feature 150 can consume the foundation without duplicating orchestration;
- a new Rule Pack can be added with tests and rollback metadata;
- no production credit path changes without explicit feature-flag rollout;
- user-visible ambiguous-evidence correction and durable event replay work in
  browser tests;
- budgets, provider profiles, authorization tokens, prompt-injection controls,
  and migration state transitions are enforced in focused tests;
- Agency Swarm has zero active invocations, no active dependency/import/route,
  all old workflow records are migrated/cancelled or read-only, and credit
  reconciliation plus historical-link checks are complete.

## 21. Source references

- OpenAI Agents SDK: https://openai.github.io/openai-agents-python/
- Agents/Runner: https://openai.github.io/openai-agents-python/agents/
- Orchestration: https://openai.github.io/openai-agents-python/multi_agent/
- Guardrails: https://openai.github.io/openai-agents-python/guardrails/
- Tracing: https://openai.github.io/openai-agents-python/tracing/
- SDK release notes: https://github.com/openai/openai-agents-python/blob/main/docs/release.md
- PyPI package metadata: https://pypi.org/project/openai-agents/
