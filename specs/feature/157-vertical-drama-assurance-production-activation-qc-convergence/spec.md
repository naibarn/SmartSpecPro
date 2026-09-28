# Feature 157: Vertical Drama Assurance Production Activation & QC Convergence

**Status:** SPEC READY FOR REVIEW — implementation not started by this spec  
**Version:** 1.3.0  
**Created:** 2026-08-23  
**Priority:** P0 — production reliability, QC recoverability, and credit safety  
**Owner:** Vertical Drama / Agent Runtime / Quality / Media Production  
**Depends-on:** Feature 149 (video-prompt learning/QC ledger), Feature 150 (Prompt Orchestra), Feature 151 (Unified Agent Output Assurance Orchestra), Feature 152 (Story Generation Assurance Orchestra), Feature 153 (Long-form Story Architecture), Feature 154 (Documentary/Review/Genre Grounding), Feature 156 (Unified Series Profile and Story Source Pack), Feature 160 (Prompt Expansion and Visual Source Assets)  
**Continues:** Features 150–153  
**Related runtime:** `apps/web/server/services/agentRuntime/*`, `python-backend/app/services/openai_agents_*`, `verticalDramaDraftQualityQc`, `verticalDramaPromptQc`, `verticalDramaQc`, Vertical Drama story and episode assurance services

> This feature is an integration and production-activation feature. It does not
> create a second Agents SDK runtime, a second credit ledger, a second provider
> authority, or a parallel story/prompt pipeline. It connects the existing
> assurance foundation to the real Vertical Drama QC paths and closes the
> failure classes that currently make one series pass while another gets stuck.

## 0.1 Changelog

### 1.3.0 — deep-plan implementation freeze

- Locked implementation scope into dependency-ordered waves without changing
  the existing creator flow.
- Added additive logical API/result compatibility requirements and a complete
  UX action matrix for editing, QC, repair, retry, paid generation, and export.
- Added mandatory acceptance scenarios for the observed QC repair precondition
  failure, worker/runtime interruption, stale context, credit, provider, and
  all-profile paths.
- Added ownership boundaries, execution order, decision freeze, and explicit
  deep-plan constraints so implementation does not invent a second runtime,
  ledger, provider authority, or navigation flow.

### 1.2.0 — five-round production-gap closure

- Added end-to-end adapter admission and mapping to the deployed shared Agent
  runtime task kinds; direct bypass paths are forbidden.
- Added explicit legacy/shadow/active outage behavior and prompt-authority
  protection so Agent unavailability does not lock editing or silently pass a
  paid/publication gate.
- Added exact credit/provider-call accounting, shadow cost ownership,
  cancellation/reconciliation rules, and crash-point fault tests.
- Added hard production invariants, registry-derived browser coverage for all
  current profiles, additive migration sequencing, and Agent-boundary security
  controls.

### 1.1.0 — profile/media coverage and end-to-end prompt continuity

- Added explicit coverage for Documentary, Location Review, Restaurant Review,
  Product Review, Software/System Review, Hybrid Docu-Drama, News/Current
  Report, and fiction profiles.
- Added `ProductionContextSnapshot` propagation from profile/source pack through
  story architecture, full story, start-frame, reference/image prompt, video
  prompt, B-roll, assembly, and final QC.
- Added profile-specific source/evidence/claim/B-roll/rights/timeline checks,
  cross-profile fixtures, and a cross-stage contract matrix.
- Aligned semantic roles and evidence statuses with the current shared visual
  source contracts (`scene_anchor`, `reference`, `b_roll_still`,
  `b_roll_footage`; `illustrative`, `needs_verification`, `verified`, etc.).

## 0. Executive decision

SmartSpecPro should adopt one deterministic-first assurance boundary for all
Vertical Drama AI workflows, but activate it in stages:

```text
Existing Node domain authority
  profile / source pack / draft / story / prompt / episode / tenant / credit / provider data
            |
            v
Shared Production Context + Feature 151 Assurance Contract
  profile/version + source/evidence snapshot + visual canon + claim ledger
            |
            v
  admission -> agent proposal -> deterministic verification
            -> bounded repair -> final gate -> durable result
            |
            +--> Story architecture / full story
            +--> Start-frame / image / reference prompts
            +--> Video prompt / B-roll / assembly
            +--> Draft QC / repair / season QC
```

The OpenAI Agents SDK is used for bounded orchestration, specialist evaluation,
structured proposals, guardrails, and tracing. It is not the authority for
pass/fail, immutable fields, version activation, paid provider submission,
credits, or database writes. Those remain deterministic Node/Python service
boundaries with explicit contracts.

The production guarantee is defined as **100% safe terminal behavior**, not a
promise that an LLM will produce identical creative content every time:

- every admitted run reaches a durable terminal or actionable waiting state;
- no raw exception is the only user-visible outcome;
- no invalid candidate becomes the current version;
- a valid baseline is always recoverable or explicitly exposed as `needs_review`;
- no retry duplicates a credit charge or paid provider task;
- every accepted result has a contract, output, evidence, and verification hash.

`maxImprovementRounds = 0` is allowed only for an explicit evaluate-only mode.
It must not be the normal workaround for an unreliable repair loop.

The canonical continuity object across these stages is a versioned
`ProductionContextSnapshot`. It is derived from the selected Series Profile,
approved Story Source Pack, Visual Source Snapshot, story-control facts,
character/scene visual canon, claim/evidence ledger, and selected media bindings.
Every downstream artifact references the snapshot version and fingerprint. A
new profile, source, evidence, visual-canon, claim, or B-roll change invalidates
only the affected downstream artifacts and creates a bounded re-plan/re-QC
requirement; it must not silently mix old and new context.

## 1. Problem statement and current evidence

### 1.1 Current failure class

The current Draft QC path can produce a structurally valid JSON response that is
semantically unsafe. In particular, a revision may change an immutable
`storyContract`. `verticalDramaDraftQualityQc.ts` correctly rejects that
candidate, but `verticalDramaDraftQualityQcJobs.ts` currently projects the run
as `failed` even when a complete baseline scorecard can be recovered. The UI
then has to infer whether a failed run is repairable, which caused the observed
`Draft QC repair requires a completed, current QC result` conflict.

The current path also has separate behavior for each concern:

| Concern | Current boundary | Production risk |
| --- | --- | --- |
| Draft judge/revision | Node `executeJsonPlanningCallWithRetry` | Schema-valid output can violate domain invariants |
| Draft job status | Redis record plus draft-job projection | TTL/worker failure can leave ambiguous state |
| Recovery | QC ledger reconstruction | Recovered evidence is represented as failed result |
| Repair admission | Router/client checks plus source metadata | Status, version, and fingerprint can disagree |
| Prompt QC | Direct Node JSON call and truncation fallback | No shared final-gate/result contract |
| Agent runtime | Existing Python SDK bridge | Not yet the common boundary for Vertical Drama QC |
| Story assurance | Feature 152 foundation | Production activation and live proof remain flag-gated |

### 1.2 Profile and source coverage audit

Features 154, 156, and 160 already define the required product direction for
non-fiction and source-backed profiles. This feature must make those contracts
part of the same assurance chain rather than treating them as an upstream UI
feature that QC does not understand.

The supported profile families include:

| Profile ID | Profile family | Required QC beyond generic fiction checks |
| --- | --- | --- |
| `documentary` | Documentary | source/provenance scope, observation versus claim, interview/archive context, labelled reenactment, counterpoint/limitation |
| `location_review` | Location Review | place identity, exterior/interior/route coverage, access/limitation, map metadata versus visual proof |
| `restaurant_review` | Restaurant Review | venue identity, menu/price/time scope, dish/service coverage, subjective opinion versus factual claim, disclosure |
| `product_review` | Product Review | product identity, specification evidence, in-use demonstration, result, comparison/limitation, unsupported-claim block |
| `software_review` | Software/System Review | exact product/UI/version context, setup/workflow/result, platform/responsiveness, feature/plan evidence, stale-screen warning |
| `hybrid_docu_drama` | Hybrid Docu-Drama | direct evidence and dramatized/reenacted material remain separate and visibly labelled |
| `news_report` | News/Current Report | claim-level attribution, `asOf`/freshness, correction/retraction, archive/file-footage labels, stricter AI-illustration policy |
| `fiction_*` | Fiction profiles | story contract, character identity, continuity, world rules, scene/shot visual canon |

Media attached to a series is not automatically evidence. Each asset must carry
independent modality, origin, semantic role, evidence status, rights/disclosure,
and source revision. In particular, `scene_anchor`, `reference`, `start_frame`
usage, `b_roll_still`, and `b_roll_footage` are distinct bindings. A
video file must never become an image reference or start frame implicitly.

### 1.3 Ground-truth repository seams

The implementation must extend these existing seams:

- `apps/web/server/services/verticalDramaDraftQualityQc.ts` — current judge,
  revision, immutable checks, candidate history, and repair loop.
- `apps/web/server/services/verticalDramaDraftQualityQcJobs.ts` — current queue,
  heartbeat, cancellation, recovery, and result projection.
- `apps/web/server/services/verticalDramaDraftLedger.ts` — durable draft version
  and QC snapshot lineage.
- `apps/web/server/services/verticalDramaPromptQc.ts` — prompt refinement,
  schema tolerance, character/length checks, and credit handling.
- `apps/web/server/services/verticalDramaQc.ts` — deterministic stage checks and
  reachable repair actions.
- `apps/web/server/services/agentRuntime/client.ts` and
  `apps/web/server/services/agentRuntime/*` — existing Node/Python contract,
  tracing, backpressure, checkpoints, feature flags, and runtime selection.
- `python-backend/app/services/openai_agents_adapter.py`,
  `openai_agents_contracts.py`, `openai_agents_trace.py`, and
  `internal_openai_agents_runtime.py` — existing SDK runtime boundary.

No implementation may create a new `openai_agents_adapter`, direct browser-to-
Python path, parallel credit charge, or parallel provider task authority.

## 2. Goals

1. Make Draft QC and explicit Draft QC Repair production-safe and recoverable.
2. Adopt one versioned assurance request/result contract for Draft QC, Prompt QC,
   Full Story, and Season QC adapters.
3. Separate candidate generation from current-version activation.
4. Treat schema-invalid, semantically-invalid, stale, timed-out, and provider-
   uncertain outputs as typed findings or recoverable states rather than raw
   application errors.
5. Ensure every repair is bound to the exact source version, source fingerprint,
   immutable constraint version, and policy hash.
6. Make deterministic validation run before and after every model proposal.
7. Use Agents SDK only for bounded proposals/evaluation and keep side effects in
   guarded Node services.
8. Make credits, reservations, retries, and provider calls idempotent.
9. Make all run state and evidence replayable for support and regression tests.
10. Provide feature flags, shadow mode, canary rollout, kill switch, and rollback.
11. Provide a production acceptance suite based on real historical failure cases.
12. Make later Story, Video Prompt, and Season adapters reuse the same assurance
   boundary without migrating all workflows in one risky release.
13. Make Documentary, Location Review, Restaurant Review, Product Review,
   Software/System Review, Hybrid Docu-Drama, and News/Current Report use
   profile-specific evidence and media gates while sharing the same runtime
   contract.
14. Propagate one immutable production context through story creation, full
   story, start-frame/image/reference prompts, video prompts, B-roll, assembly,
   and final QC.

### 2.1 Scope lock and implementation waves

This feature is one production-hardening initiative, implemented in the
following dependency-ordered waves. Every wave must preserve the existing
wizard routes, six step IDs, draft save/edit/preview behavior, and legacy
request compatibility. A later wave may be flag-disabled, but it must not
create a second incompatible contract.

| Wave | Scope | Completion boundary |
| --- | --- | --- |
| 0. Evidence and contracts | map existing Feature 151/152 persistence, runtime task mappings, profile/source registry, current QC states, and billing owners | exact code/replay evidence and additive schema/API design approved by tests |
| 1. Draft QC reliability | durable attempt/result projection, `succeeded`/`recovered` semantics, repair admission, CAS, lease/reconciliation, typed UI errors | observed QC repair failure is fixed; baseline recovery and repair/retry are regression-tested |
| 2. Shared context and prompt/media adapters | `ProductionContextSnapshot`, start-frame/reference/image/video prompt/B-roll contracts, deterministic pre/post gates, fallback modes | every enabled prompt/media entry point has context lineage and cannot bypass provider readiness |
| 3. Story and season adapters | premise, architecture, full story, deep episode, season/continuity adapters using Feature 152/153 authorities | contract parity and cross-stage fingerprint tests pass; activation remains flag-controlled |
| 4. Production proof | migration rehearsal, worker restart/Redis expiry, authenticated browser matrix, provider/canary, dashboards, runbook, rollback | all hard production invariants and release gates in §12–§14 have recorded evidence |

Waves 1–3 are implementation scope; wave 4 is required release proof. The
implementation must not broaden the feature into a story-engine rewrite,
provider migration, new media storage system, or new navigation model. If a
shared boundary is missing, add the smallest additive seam and document why;
do not duplicate an existing authority.

#### Decisions frozen for deep-plan

- Node/domain services remain authoritative for state, candidate activation,
  credits, provider submission, storage, tenant ownership, and final gates.
- Python/OpenAI Agents SDK remains a bounded proposal/evaluation runtime behind
  the existing Agent Runtime bridge; no direct browser-to-Python path is added.
- `maxImprovementRounds = 0` is evaluate-only and explicitly selected; normal
  repair has a bounded policy-defined round count and never uses zero as an
  accidental reliability workaround.
- Agent outage never blocks editable draft work; only the unsafe transition
  boundary may return `retryable_failed`/`awaiting_action`.
- Existing prompt composers, provider model selection, media transport, and
  credit ledger remain the final authorities.
- Every mutation is idempotent and every paid/provider uncertainty is
  reconciled before retry or refund.

## 3. Non-goals

1. Do not rewrite the existing story architecture or production episode model.
2. Do not move tenant, user, asset, credit, provider, or DB authority into an
   LLM agent.
3. Do not promise perfect creative quality, identical wording, or zero provider
   failures.
4. Do not replace Feature 151's runtime or create another orchestration bridge.
5. Do not make every simple LLM call multi-agent; deterministic/simple calls may
   continue through their existing bounded helper when they satisfy the same
   output assurance contract.
6. Do not silently truncate a paid video prompt and call it verified.
7. Do not automatically learn or mutate active prompts/skills from one failure.
8. Do not regenerate media merely because a QC attempt failed when an existing
   durable artifact or valid candidate can be reused.

## 4. Normative architecture

### 4.1 One assurance envelope

Every workflow adapter must submit an immutable envelope derived from Feature
151. The exact field names may follow the existing shared contract, but the
following semantics are mandatory:

```ts
type VerticalDramaAssuranceRequest = {
  schemaVersion: number;
  executionId: string;
  attemptId: string;
  tenantId: string;
  userId: number;
  surface: "vertical_drama";
  taskKind:
    | "premise_expansion"
    | "story_architecture"
    | "full_story"
    | "draft_qc"
    | "draft_repair"
    | "start_frame_prompt"
    | "reference_image_prompt"
    | "video_prompt_qc"
    | "broll_assembly_qc"
    | "season_qc";
  sourceRef: {
    entityId: string;
    version: number;
    fingerprint: string;
  };
  contextSnapshotRef: {
    snapshotId: string;
    revision: number;
    fingerprint: string;
  };
  inputRefs: string[];
  compatibilityMode: "native" | "legacy_wrapped";
  requiredMode: "draft" | "verified" | "provider_ready";
  contractVersion: string;
  outputContractVersion: string;
  rulePackIds: string[];
  policyHash: string;
  modelPolicy: string;
  idempotencyKey: string;
  budget: {
    maxTurns: number;
    maxToolCalls: number;
    maxWallClockMs: number;
    maxOutputTokens: number;
    maxRepairAttempts: number;
    maxEstimatedCredits: number;
  };
  sideEffectPolicy: "none" | "candidate_only" | "provider_ready";
};
```

Node computes a canonical JSON hash for the envelope. Python must echo and
validate the hash. Changing source content, evidence, rule pack, model policy,
budget, or side-effect scope creates a new attempt; it must never mutate a
running attempt.

### 4.2 Candidate versus active version

The workflow must use this sequence:

```text
source snapshot
  -> candidate proposal
  -> structural parse
  -> deterministic domain validation
  -> semantic/evidence verification
  -> optional bounded repair candidate
  -> final gate
  -> activate one verified version
```

An LLM response is never written directly as the current draft, prompt pack,
story plan, or provider input. A candidate that fails any hard check is retained
only as redacted evidence with a rejection reason. The last valid candidate stays
available.

Every activation attempt records `expectedActiveVersion` and
`candidateVersion`. The final gate performs a compare-and-set against the
authoritative domain ledger. A lost compare-and-set becomes a stale/retryable
outcome and cannot overwrite a newer user edit or worker result.

### 4.3 Agent boundary

The preferred Agent SDK topology is a deterministic manager in code with bounded
specialist agents as tools or bounded sub-runs:

- `draft_qc_judge`: returns criterion findings and evidence references;
- `draft_qc_repair_planner`: returns an allowlisted patch proposal;
- `prompt_qc_verifier`: returns prompt-contract findings;
- `story_quality_reviewer`: returns advisory findings for Feature 152;
- `season_continuity_reviewer`: returns continuity findings for later rollout.

Agents must use structured output types. They may not call arbitrary DB, credit,
R2, shell, provider, or publication tools. If a tool is ever required, it must
be registered in the runtime manifest, have tenant/authorization checks, an
idempotency key, a tool guardrail, and a dry-run/approval policy.

The manager controls sequencing, parallelism, timeout, max turns, max repair
attempts, and final outcome. A free-form handoff chain must not be the only
control path for a production gate.

### 4.4 Adapter coverage and runtime compatibility

The task kinds in §4.1 are the Vertical Drama domain taxonomy. They must not
be passed as arbitrary strings to the shared runtime. Each adapter must map its
domain task to an existing `OrchestraTaskKind`/capability manifest and record
both values in the durable attempt:

| Vertical Drama task | Shared runtime capability | Output authority |
| --- | --- | --- |
| `premise_expansion`, `story_architecture`, `full_story`, `season_qc` | `structured_generation` or an explicitly registered story capability | Feature 152/153 story contract and deterministic gates |
| `draft_qc`, `draft_repair`, `video_prompt_qc`, `broll_assembly_qc` | `skill_execution` or the registered assurance skill | Node domain validator and final gate |
| `start_frame_prompt`, `reference_image_prompt` | `image_prompt` | existing start-frame/reference composer and image contract |

If a new shared task kind is required, Node and Python schemas, capability
manifests, contract version, fixtures, and compatibility range must be changed
together. A new client must not emit a kind that the deployed worker cannot
parse. During migration, the adapter uses `compatibilityMode:
"legacy_wrapped"`, records the mapping, and applies the same deterministic
post-validation; it must never silently downgrade a `provider_ready` or
publication gate to an advisory result.

Every production entry point must pass through one server-side adapter that
performs, in order: tenant/domain authorization, context snapshot admission,
source/active-version read, deterministic preflight, runtime selection, output
verification, and final-gate/CAS. The minimum call-path inventory is:

| Entry point | Required context and predecessor | Legacy behavior during rollout |
| --- | --- | --- |
| premise/architecture/full-story/resume/extension | profile + source/claim snapshot + story-control revision | wrap the existing story runtime; preserve existing draft/save/resume APIs |
| Draft QC/repair | exact draft ledger version + current QC result/fingerprint | preserve current QC button and expose typed recovery metadata |
| start-frame/reference/image prompt | shot contract + visual canon + explicit semantic role | keep existing prompt composer/provider selection; assurance is additive |
| video prompt/repair | approved start frame + reference manifest + motion/dialogue contract | keep current prompt preview and provider model choice |
| B-roll/assembly/final export | managed media + immutable segment/timeline manifest | keep source-slot and timeline editing available |
| post-generation/season QC | durable provider result + originating context/contract | preserve inspection and repair routes |

No direct router, queue job, browser call, or provider adapter may bypass this
inventory. A compatibility wrapper is acceptable; an unwrapped parallel path is
not. The implementation must add a call-path test that fails if any listed
entry point can reach a model, paid provider, activation, or export without an
admitted `contextSnapshotRef` and assurance envelope.

#### Runtime outage and fallback matrix

The adapter owns the fallback decision; the shared Agent runtime does not
silently decide product policy. The result must record `assuranceMode` as
`agent_active`, `agent_shadow`, `legacy_deterministic`, or `recovered_result`
and include the runtime error/selection code when fallback occurred.

| Runtime condition | Advisory/edit/preview action | Activation/paid/export action |
| --- | --- | --- |
| Agent active and manifest compatible | use structured proposal, then deterministic verify | allow only after the same final gate returns `verified`/`provider_ready` |
| Agent unavailable, timeout, or manifest missing | run the existing deterministic/JSON helper when its contract is supported; mark degraded but keep save/edit/preview available | allow only if the deterministic path independently completes every required gate; otherwise `retryable_failed` or `awaiting_action` at the boundary |
| Agent active call throws after admission | do not lose the existing baseline; bounded adapter fallback may run once with the same input hash | never resubmit a paid side effect; wait/retry from the same admitted attempt or reconcile |
| Deterministic validator unavailable or persistence cannot prove ownership | preserve editable source and expose an operator-safe error | `fatal_failed`; no activation/provider/export |
| Shadow mode | execute the legacy result exactly once and compare the shadow result without activation or extra charge | shadow is never evidence for provider readiness |

This matrix preserves the current workflow when the SDK is unavailable while
still preventing an unsafe result from crossing the paid or publication
boundary. Fallback must not call the model twice for one logical attempt unless
the attempt budget explicitly permits it and the credit ledger records both
calls.

#### Prompt-authority rule

The existing Vertical Drama skill instructions, prompt formatters, provider
capability resolvers, and domain contracts remain authoritative for final
prompt dialect and provider fields. The Agent may return a structured proposal,
finding, or allowlisted patch; it may not replace those composers with free-form
text or invent a URL, asset, source citation, model selection, evidence status,
claim, character identity, or timeline segment. This is required for start-frame,
reference/image, video prompt, and B-roll continuity and is also the rule for
story adapters that already have Feature 152 authorities.

## 5. Assurance state machine

### 5.1 Public states

The domain result must expose one of these states:

| State | Meaning | User action |
| --- | --- | --- |
| `queued` | Accepted and waiting for worker | Wait/cancel |
| `running` | Bounded work is executing | Wait/cancel |
| `awaiting_action` | Evidence, approval, or source update required | Fix/approve/retry |
| `succeeded` | Current candidate passed all hard gates | Continue workflow |
| `recovered` | Latest attempt failed, but an exact prior result was recovered | Inspect/repair/retry; never activate downstream automatically |
| `retryable_failed` | No accepted candidate, but infrastructure/model retry is safe | Retry |
| `fatal_failed` | No safe automatic retry; operator/developer action required | Inspect incident |
| `cancelled` | Explicitly cancelled and fenced | Start a new run |
| `stale` | Lease/worker expired and reconciled | Retry from source |
| `reconciliation_required` | A paid/provider outcome is uncertain and duplicate submission is unsafe | Wait for reconciliation |

Legacy `status: failed` records with `result.recoveredFromFailure = true` must be
read as `recovered` at the API boundary during migration. New records must not
encode a usable recovered result as ordinary failed state.

### 5.2 Valid transitions

```text
queued -> running
running -> succeeded | recovered | awaiting_action | retryable_failed
running -> fatal_failed | cancelled | stale | reconciliation_required
recovered -> queued          (new attempt, exact source)
awaiting_action -> queued    (new attempt after user/source change)
retryable_failed -> queued   (idempotent retry)
stale -> queued              (reconciled retry)
reconciliation_required -> queued (only after provider/credit reconciliation)
succeeded -> queued          (explicit repair against exact version)
```

No client may transition a run directly to `succeeded`. A worker must re-read
the record, verify its lease/fence, run the final gate, and perform a compare-
and-set activation before publishing success.

### 5.3 `succeeded` contract

An attempt is `succeeded` only when all are true:

1. The result matches the current source version and fingerprint.
2. The output schema and deterministic domain checks pass.
3. All hard QC criteria pass, or the task's explicitly documented advisory
   criteria are reported as warnings.
4. Immutable fields are unchanged.
5. The accepted candidate and report are durably linked in the ledger.
6. Credits/reservations are reconciled exactly once.
7. No pending required side effect or unresolved provider uncertainty exists.
8. For a paid/provider stage, final-gate readiness is explicitly
   `provider_ready`; for export/publish, it is `production_ready`.

The result must also carry an explicit acceptance disposition:

```ts
type AssuranceDisposition =
  | "verified"             // may activate or enter the next gated stage
  | "recovered_needs_repair" // valid evidence exists, but not a production pass
  | "blocked"
  | "retryable";
```

Only `status = succeeded` with `disposition = verified` may activate a current
version or satisfy a downstream paid-generation gate. `recovered` is a safe
recovery outcome, not a pass outcome; it exists so the user can repair or retry
without losing the exact valid baseline.

### 5.4 UX action/state contract

The API projection must make the next safe action explicit so the client does
not infer behavior from a generic HTTP status. These fields are additive to the
existing response shape:

```ts
type AssuranceUiProjection = {
  state: AssuranceState;
  disposition: AssuranceDisposition | null;
  readiness: "draft" | "verified" | "provider_ready" | "production_ready" | null;
  attemptId: string;
  sourceVersion: number | string;
  sourceFingerprint: string;
  currentVersion: number | string | null;
  progressPhase: string | null;
  nextAction: "edit" | "inspect" | "run_qc" | "repair" | "retry" | "reconcile" | "cancel" | "continue";
  canEdit: boolean;
  canSave: boolean;
  canInspect: boolean;
  canRepair: boolean;
  canRetry: boolean;
  canCancel: boolean;
  errorCode: string | null;
  userMessageKey: string | null;
};
```

The required action matrix is:

| State/result | Edit/save | Inspect | Repair | Retry | Paid/export | Client presentation |
| --- | --- | --- | --- | --- | --- | --- |
| `queued`/`running` | yes | yes | no | no | no | progress + cancel; never disable workspace |
| `succeeded`/`verified` | yes | yes | explicit versioned repair | optional new run | allowed only at required readiness | continue |
| `recovered`/`recovered_needs_repair` | yes | yes | yes when exact result is current | yes | no | baseline preserved + repair/retry |
| `awaiting_action` | yes | yes | only if finding says repair | yes after action | no | finding + concrete next action |
| `retryable_failed` | yes | yes | no unless result exists | yes | no | transient explanation + retry |
| `stale` | yes | yes | no against stale input | yes from fresh source | no | refresh/re-run, no spinner |
| `reconciliation_required` | yes | yes | no paid retry | no until reconciled | no | reconciliation pending |
| `fatal_failed`/`cancelled` | yes | yes | no against fenced attempt | new run | no | safe terminal message + new run |

The server remains authoritative for `canRepair` and `nextAction`; the client
may hide an action for presentation but may not enable a mutation that the
server has denied. A refresh must reproduce the same projection from durable
state, not from client memory or Redis-only progress.

## 6. Cross-workflow profile, source, and media assurance

### 6.1 Canonical `ProductionContextSnapshot`

The profile/source/media layer is an input contract to every downstream AI
operation, not only a create-wizard gate. The server must produce one bounded,
immutable snapshot after the profile and source pack are ready:

```ts
type ProductionContextSnapshot = {
  schemaVersion: number;
  snapshotId: string;
  revision: number;
  fingerprint: string;
  seriesId: number;
  profile: {
    profileId: string;
    profileVersion: number;
    contentKind: string;
    visualGroundingVersion: string;
    factPolicyVersion: string;
    bRollPolicyVersion: string;
  };
  sourcePackPolicy: "required" | "optional" | "not_applicable";
  sourcePack: {
    packId: number;
    version: number;
    fingerprint: string;
    readiness: "draft_ready" | "production_ready" | "needs_review";
    slotRefs: Array<{
      slotKey: string;
      assetIds: number[];
      segmentIds: string[];
      semanticRole: "scene_anchor" | "reference" | "b_roll_still" | "b_roll_footage";
      evidenceStatus:
        | "not_applicable"
        | "illustrative"
        | "needs_verification"
        | "partially_verified"
        | "verified"
        | "stale"
        | "contradictory"
        | "blocked";
      rightsStatus: string;
      disclosureStatus: string;
    }>;
  } | null;
  visualCanonVersion: string;
  visualCanonFingerprint: string;
  claimLedgerVersion?: string;
  claimLedgerFingerprint?: string;
  coveragePlanVersion?: string;
  coveragePlanFingerprint?: string;
};
```

The snapshot is passed into story architecture, premise expansion, full-story
generation, deep episode drafting, start-frame generation, reference/image
prompt generation, video prompt generation, B-roll binding, assembly, and every
QC/final-gate attempt. Agents may select only server-issued `profileId`,
`slotKey`, `assetId`, `segmentId`, `claimId`, and coverage IDs. They may not
invent media URLs, evidence status, timestamps, product/software facts, or
source citations.

For fiction profiles whose source policy is optional, `sourcePack` may be
`null` and `sourcePackPolicy` is `optional`; the snapshot still contains the
profile, visual canon, story controls, and an explicit empty-source decision.
For Documentary/Review/News/Hybrid profiles, `sourcePackPolicy` is `required`.
The source-pack gate may return `draft_ready` for authoring/preview, but only
`production_ready` can satisfy a paid-provider, assembly, export, or publish
gate; `needs_review` is always actionable and cannot satisfy either boundary.
The snapshot cannot enter a stage until the readiness level required by that
stage is proven. This prevents accidental blocking of legacy fiction while
still preventing unsupported non-fiction claims.

`snapshotId`, `revision`, and `fingerprint` are immutable identity fields. The
fingerprint is computed from canonicalized profile, source-pack (including an
explicit null), visual canon, claim ledger, coverage plan, and binding metadata;
it is not a hash of only the generated prompt.

If the snapshot fingerprint changes, dependent artifacts become `stale` and
cannot be silently reused. The invalidation graph is deterministic:

```text
profile/source/evidence change
  -> visual canon / claim / coverage snapshot
  -> story architecture and full story
  -> episode/shot semantic contracts
  -> start-frame/reference/image prompts
  -> video prompts and B-roll bindings
  -> generation/assembly/post-video QC
```

The system must invalidate the smallest affected scope, retain old versions for
audit/replay, and require a new assurance attempt for each affected stage.

### 6.2 Profile-specific source and B-roll QC

Before draft readiness, and again before production/assembly readiness, run the
following deterministic checks:

| Check family | Required behavior |
| --- | --- |
| Profile contract | Profile exists, version is active, visual/fact/B-roll policies resolve, and no fiction-only field is used for a non-fiction profile |
| Source-pack readiness | Required slots are fulfilled or have an explicit `not_applicable` reason; all slot/asset/segment IDs are tenant-owned and current |
| Evidence/provenance | Distinguish verified source, creator evidence, illustrative AI media, archive/file footage, and unknown; upload alone is not proof |
| Rights/disclosure | Missing rights, disclosure, or reenactment labels block the affected production path |
| Profile coverage | Required visual coverage is fulfilled for the selected profile: venue/place/product/software/subject-specific slots, not generic “has media” |
| Claims | Material facts, price/spec/version/date/location/current status, opinions, and observations remain separate; unsupported claims block or become `needs_verification` |
| B-roll semantics | Scene anchor, subject reference, still B-roll, and footage B-roll use separate bindings; no implicit conversion |
| Footage timeline | In/out are finite and within source duration; ordering, overlap, audio policy, safe zone, aspect ratio, crop, and total duration are valid |
| Durability | Managed storage object exists and is playable; provider URL alone is never canonical |
| Staleness | Source revision, segment revision, claim freshness, and visual snapshot match the admitted run |

The profile-specific minimums are:

- Documentary: subject/context, source or interview/archive evidence,
  observation, counterpoint/limitation, and reenactment disclosure.
- Location Review: exterior identity, interior/spatial detail, route/activity,
  access/limitation, and explicit separation of map metadata from visual proof.
- Restaurant Review: venue/sign, interior/service flow, menu/price scope,
  dish/detail, atmosphere, and opinion/fact separation.
- Product Review: product identity, material/control detail, in-use proof,
  result, comparison, limitation, and unsupported-claim protection.
- Software/System Review: exact UI/product/version context, setup, workflow,
  feature result, platform/responsive view, limitation/plan evidence, and
  stale-screen detection.
- Hybrid Docu-Drama: evidence/observation and dramatized/reenacted media have
  separate semantic roles, labels, prompts, and QC outcomes.
- News/Current Report: claim-level attribution, freshness/`asOf`, correction
  cascade, archive/file-footage label, and strict AI-illustration disclosure.

### 6.3 Prompt and story continuity chain

Each AI stage consumes a typed contract from the prior stage and emits a new
versioned artifact. Prose is not the integration contract.

| Stage | Input authority | Output | Mandatory QC before next stage |
| --- | --- | --- | --- |
| Premise/brief expansion | user premise + optional research/source pack | confirmed brief, assumptions, claims, coverage suggestions | research/source boundary, claim status, user confirmation, CAS |
| Story architecture | profile + source snapshot + story controls | arcs, beats, episode map, relationship/closure plan | profile engine, claim/evidence alignment, completeness, closure, immutable story contract |
| Full story/deep draft | architecture revision + memory/continuity + source snapshot | episode/scene/shot semantic contracts | episode coverage, continuity, dialogue/speaker, content budget, source/claim mapping |
| Start-frame image prompt | shot contract + scene anchor + visual canon + character DNA | structured start-frame prompt artifact | identity, scene anchor, composition, aspect, provider/image capability, negative constraints |
| Reference/image prompt | subject/reference role + source slot + visual canon | structured reference prompt and generated/reference asset lineage | subject identity, modality/role, evidence status, rights/disclosure, no scene-anchor overwrite |
| Video prompt | shot contract + approved start frame + references + motion/dialogue contract | structured video motion prompt | speaker/position, cast count, action, timing, continuity, provider limits, reference manifest |
| B-roll/assembly | approved source segments + shot timeline | immutable B-roll binding/assembly plan | storage, rights, exact trim, duration, audio, fit/crop, disclosure, stale snapshot |
| Post-generation QC | provider task + durable output + original contracts | evidence-backed QC report and repair proposal | output identity, source/claim alignment, clip/media integrity, final production gate |

Every prompt artifact must store `inputContextFingerprint`, `sourceRefs`,
`contractVersion`, `policyHash`, `model/provider`, `promptHash`, structured
fields, warnings, and final verification disposition. A later prompt stage may
add detail but may not silently change upstream canonical facts, character
identity, source evidence status, or selected semantic role.

### 6.4 Start frame, reference, and video prompt boundaries

The following distinctions are mandatory:

- A `start_frame` is the approved visual anchor for scene composition and
  continuity. Its prompt is derived from the shot/scene contract and selected
  `scene_anchor`; it is not a generic character portrait.
- A `reference` supports identity, product, dish, UI, material, or
  prop grounding. Its prompt may describe the subject but cannot replace a
  scene anchor unless the user explicitly promotes it through the existing
  start-frame lock flow.
- A `video_prompt` describes motion, dialogue, camera, timing, and interaction
  over an approved visual input. It must reference the exact start-frame and
  reference manifest versions and preserve their identity/position constraints.
- A `b_roll_still` or `b_roll_footage` is an editorial timeline binding. It is not evidence merely
  because it is visible, and it must not be fed into a video prompt as an
  identity reference without an explicit role decision.

If a generated image is illustrative, the prompt and downstream story must
retain `illustrative`; the model cannot upgrade it to verified evidence.
If a real footage segment is used, its exact segment revision and disclosure
label travel to the assembly and export gate.

### 6.5 Shared failure behavior

Profile/source/prompt failures use the same assurance states and dispositions:

- missing required source or coverage: `awaiting_action`;
- stale profile/source/claim/prompt context: `awaiting_action` with a replan
  target, never a silent retry against mixed context;
- invalid model proposal: reject candidate and preserve last valid artifact;
- unavailable media/storage/rights: `needs_review`/`awaiting_action`, never
  silent regeneration or duplicate credit charge;
- prompt provider-limit failure: bounded targeted compression or actionable
  provider/profile choice, never silent truncation as verified output;
- provider result uncertain: `reconciliation_required`, freeze duplicate work.

### 6.6 UX continuity and progressive enforcement

Production safety must be enforced at the boundary where risk is introduced,
not by blocking every editing action. The existing creator flow remains usable
while an assurance run is queued, running, degraded, or awaiting a source fix.

#### Existing UX that must remain stable

- Preserve the existing six wizard step IDs, route structure, draft workspace,
  local/session recovery, profile/source-pack pointer recovery, and existing
  fiction flow. Profile/source UI may become richer but must not require a new
  navigation model for legacy users.
- Preserve existing “preview/synthesize → edit → confirm” behavior. Preview
  generation is not production approval and may show warnings without blocking
  the creator from editing or cancelling.
- Preserve direct draft save, field editing, source-slot editing, prompt
  preview, history inspection, and navigation while QC or Agent work runs.
- Existing clients may omit the new assurance fields during migration. The
  server creates a compatibility envelope with a legacy policy version and
  returns the same stable result shape plus optional assurance metadata.
- A reconnect, page refresh, or browser close must restore the last durable state
  and next action; it must not start another run or leave an infinite spinner.

#### Progressive enforcement tiers

| User action | Required enforcement | Does not block |
| --- | --- | --- |
| Edit/save premise, story, source slot, prompt draft | schema/ownership only | editing, save, navigation, preview |
| Mark draft/source `draft_ready` | deterministic completeness/profile/source checks | further editing and non-paid preview |
| Activate full story/episode candidate | hard story/continuity/claim/source gates | viewing/revising the rejected candidate |
| Submit paid image/video/provider task | `provider_ready`, rights/disclosure, credit/idempotency, exact input fingerprint | editing and retry preparation |
| Export/publish/assemble final media | production readiness, media durability, B-roll timeline, claims, disclosure | inspecting and repairing the project |

Advisory findings (`info`/`warning`) must not block editing or normal draft
authoring. Blocking findings are limited to the unsafe transition itself and
must include a repair action, a retry action, or a clear `awaiting_action` path.
The server must not convert a missing Agent runtime into a blanket “system
unavailable” lock on the series workspace. For advisory stages it may use the
existing deterministic/JSON helper fallback; for paid or publication stages it
must fail closed only at that final boundary and preserve the draft/source for
later retry.

#### Liveness and interruption contract

- Every queued/running state exposes `startedAt`, `heartbeatAt`, `expiresAt`,
  `progressPhase`, and a user-safe next action.
- The client uses bounded polling/event replay and shows `stale` or
  `reconciliation_required` instead of spinning forever.
- Worker restart, tab close, network loss, and reconnect are resume/read-only
  events, not new admissions.
- When a new source/profile edit makes a run stale, the user can continue
  editing and start a new bounded attempt; the old attempt is fenced and its
  evidence remains inspectable.
- A failed optional quality pass never hides the last editable draft. A failed
  hard gate never deletes the candidate; it only prevents the unsafe downstream
  transition.

## 7. Phase 1 — Draft QC and Draft Repair production gate

### 7.1 Required behavior

1. Run deterministic completeness and contract checks before the first judge call.
2. Evaluate the baseline and persist its candidate version/fingerprint before
   any improvement attempt.
3. Use one bounded automatic improvement round in the standard profile. An
   evaluate-only profile may use zero; there must be no implicit zero workaround.
4. If a revision is schema-invalid or violates immutable/mutable contract rules,
   reject that candidate, persist the rejection finding, preserve the best valid
   candidate, and continue to a terminal `succeeded`, `recovered`, or
   `awaiting_action` state according to the baseline.
5. A failed post-baseline revision must never erase a completed baseline report.
6. Explicit repair must require the exact source version, fingerprint, report,
   tenant, draft session, contract version, and policy hash.
7. The repair response must be re-evaluated as a new candidate; applying a patch
   does not prove that QC passed.
8. `storyContract`, `storyContext`, and `visualNarrativeProfile` remain immutable
   unless a future versioned domain contract explicitly changes the allowlist.
9. `storyDesign` changes must be restricted to server-owned allowlisted paths.
10. A stale source must return `awaiting_action`/`retryable_failed` with a stable
    reason code, never a generic 409 that hides the recovery path.

### 7.2 Draft QC outcome mapping

| Condition | Outcome |
| --- | --- |
| Baseline valid, no repair needed | `succeeded` |
| Repair valid and re-evaluated | `succeeded` |
| Repair invalid, baseline valid and current | `recovered` |
| Baseline complete but hard QC still fails after bounded attempts | `awaiting_action` with `recovered_needs_repair` disposition |
| Provider/schema error before any complete baseline | `retryable_failed` |
| Baseline exists but source is stale | `awaiting_action` |
| Immutable contract conflict from user/source update | `awaiting_action` |
| Ledger/storage cannot prove candidate ownership | `fatal_failed` |

### 7.3 Repair UI/API contract

The repair button must be enabled only when the API returns a current accepted
or recovered result with all source metadata. The API must return a typed error
for:

- `qc_result_missing`;
- `qc_result_not_current`;
- `qc_source_version_mismatch`;
- `qc_source_fingerprint_mismatch`;
- `qc_contract_version_mismatch`;
- `qc_repair_already_running`.

The UI must render the action associated with each code. It must never tell the
user only that “repair failed” without whether they need to re-run QC, reload a
new draft, or wait for reconciliation.

## 8. Phase 2 — Prompt, visual source, and media QC adapters

After Phase 1 passes canary gates, adapt the existing start-frame, image,
reference, video-prompt, and B-roll paths to the same assurance contract. This
phase is intentionally one chain: a video prompt cannot be considered valid if
its approved start frame or reference manifest is stale or unverified.

### 8.1 Start-frame and reference/image prompt gates

1. Normalize `ProductionContextSnapshot`, shot semantic contract, scene visual
   state, character visual canon, source-slot role, and provider capability.
2. For a start frame, require an explicit scene anchor and preserve the current
   start-frame lock/approval semantics.
3. For a reference/image prompt, require an explicit `reference` role
   and prevent it from overwriting the scene anchor or character identity.
4. Run deterministic checks before the Agent proposal: profile grounding,
   modality/origin/evidence status, identity, composition, aspect ratio,
   required elements, negative constraints, rights/disclosure, and provider
   capability.
5. Let an Agent propose a structured prompt or targeted repair only; the server
   composes the final prompt from allowlisted context and validates the output.
6. Persist prompt/input/output hashes, source asset IDs, snapshot fingerprint,
   model/policy, warnings, and verification disposition before generation.
7. If the source is illustrative, retain `illustrative`; the prompt path
   cannot promote it to verified evidence.

### 8.2 Video prompt gate

1. Normalize prompt input, approved start-frame version, reference manifest,
   speaker identity, cast-position lock, dialogue, action, duration, motion
   profile, provider capability, and prompt length into a versioned
   `ShotPromptContract`.
2. Run deterministic checks before LLM refinement.
3. Let an Agent propose targeted compression or correction, not rewrite the
   entire shot unconstrained.
4. Re-run speaker, identity, position, cast count, action, dialogue, timing,
   continuity, reference-role, and provider-limit validators after repair.
5. Never silently hard-truncate a prompt and mark it verified. If safe lossless
   compression cannot fit, return `awaiting_action` with an actionable choice or
   use an approved alternate provider profile.
6. Reserve/draw/refund credits through the existing credit service exactly once.
7. Block paid video submission unless the final gate returns `provider_ready`.
8. Link prompt version, evidence, provider profile, task ID, output asset, and
   post-video QC to the Feature 149 lineage.

### 8.3 B-roll and assembly gate

1. Accept only approved source-slot assets and immutable footage segments.
2. Keep `scene_anchor`, `reference`, `b_roll_still`, and `b_roll_footage` in
   separate binding records and UI states.
3. Validate tenant ownership, managed storage readiness, rights/disclosure,
   segment revision, finite in/out points, ordering, total duration, audio
   policy, aspect/crop/fit, safe zones, and profile-specific coverage.
4. A stale source snapshot, missing object, changed rights status, or invalid
   segment blocks assembly with a repairable finding; do not regenerate or
   silently drop the footage.
5. Run final assembly/readiness QC before export and retain the exact binding
   manifest used by the render.

## 9. Phase 3/4 — Story and Season QC adapters

Feature 152 remains the story-generation assurance owner and Feature 153 remains
the long-form architecture owner. This feature activates their shared boundary
from profile/source admission through full production:

### 9.1 Story architecture and premise

- use the selected profile and `ProductionContextSnapshot` as immutable inputs;
- keep premise expansion/research evidence, user confirmation, claim status,
  and source citations separate from generated prose;
- validate profile engine, genre grounding, factual policy, visual coverage,
  closure/relationship plan, and story-control consistency before activation;
- persist architecture candidate and source/context fingerprint together.

### 9.2 Full story and deep episode draft

- pass the same snapshot into full-story, deep-draft, resume, extension, and
  repair jobs;
- require every episode/scene/shot to map to profile rules, source/claim
  coverage, character/continuity facts, and downstream visual intent;
- keep incomplete candidates out of active production projections;
- use deterministic relationship, continuity, content-budget, dialogue,
  duration, production-manifest, and source-alignment gates before semantic
  review;
- create shot contracts that are sufficient to derive start-frame, reference,
  video-prompt, and B-roll inputs without reinterpreting the story ad hoc.

### 9.3 Season/episode QC and repair

- use the same state/result vocabulary, candidate/active boundary, and exact
  version/fingerprint repair admission;
- route failed blocks to bounded repair or `awaiting_action`;
- invalidate only affected downstream episodes/shots when the source/profile or
  story contract changes;
- expose the same replayable trace and acceptance evidence;
- never treat a successful Agent run as proof that the story is production-ready
  without the domain final gate.

These adapters are not part of the Phase 1 production enablement switch, but
their contract compatibility and end-to-end fingerprint propagation must be
tested before the shared contract is declared stable.

## 10. Persistence, lineage, and idempotency

### 10.1 Source of truth

Redis may remain the queue/lease/progress cache, but it is not sufficient as the
only production record because the current Draft QC record has a one-hour TTL.
The authoritative attempt, transition, contract hash, candidate reference,
verification report, and recovery decision must be stored in the existing
durable domain ledger or a reviewed additive assurance table. The implementation
must first map Feature 151/152 persistence surfaces and reuse them; a new table
is allowed only when no existing durable owner can represent the relation.

The schema preflight must make an explicit choice before implementation:

1. If Feature 151/152 already has a durable execution/attempt/event owner, add
   Vertical Drama references to that owner.
2. If it does not, add the smallest additive owner with these logical records:
   `agent_assurance_runs` (one execution), `agent_assurance_attempts` (immutable
   attempts and hashes), and `agent_assurance_events` (ordered state changes).
   Domain draft/story/prompt ledgers remain the owners of candidate content; the
   assurance tables store lineage and decisions, not a second content copy.
3. Every table must have tenant scope, owner/entity indexes, unique
   `(tenant_id, surface, task_kind, source_fingerprint, idempotency_key)`, unique accepted-attempt fencing, and a
   retention policy for redacted evidence.

Redis expiry must not delete the durable attempt. A bounded reconciler must scan
queued/running attempts whose heartbeat is older than the lease, fence the old
worker, classify the run as `stale` or `retryable_failed`, and retain any exact
baseline already recorded. The reconciler must be safe to run repeatedly.

### 10.2 Required durable facts

Each attempt must retain or reference:

- tenant/user and domain entity IDs;
- execution ID, attempt ID, parent attempt ID;
- task kind and contract/output/rule-pack versions;
- source version and fingerprint;
- contract, policy, input, candidate, and final output hashes;
- model/provider selection;
- `assuranceMode`, shared-runtime task-kind mapping, runtime selection/error,
  and fallback provenance;
- budget, turns, calls, latency, token usage, and actual credits;
- state transitions with reason codes and event cursor;
- rejected candidate findings and immutable-path violations;
- accepted/recovered version reference;
- side-effect authorization and provider/credit reconciliation facts;
- redacted trace reference and retention class.

### 10.3 Idempotency rules

- Admission is idempotent on `(tenantId, surface, taskKind, sourceFingerprint,
  idempotencyKey)`; the same idempotency key may safely be reused by different
  task kinds only when their source and contract scopes are distinct.
- A retry of the same attempt cannot create a second accepted version.
- Credit reservation/draw/refund uses the existing ledger's idempotency rules.
- Paid provider submission requires a one-time authorization token bound to
  contract hash, output hash, provider profile, and task idempotency key.
- If provider acceptance is uncertain, freeze duplicate submission and enter
  `reconciliation_required`; never retry blindly.

### 10.4 Credit, retry, and paid-side-effect accounting

Credit correctness is a separate production invariant from QC correctness. The
implementation must designate one billing owner per adapter before enabling it:
the shared runtime may report usage, but it must not also deduct the user's
credit when the existing Vertical Drama service/credit ledger is the owner.
The adapter records `billingOwner`, `logicalAttemptId`, `providerCallId`,
`reservationId`, `estimatedCredits`, `actualCredits`, and reconciliation state
on every model/provider invocation.

| Operation | User credit behavior | Required accounting |
| --- | --- | --- |
| deterministic validation, hash, CAS, replay, already-within-limit path | zero | record a zero-cost check; never create a reservation |
| Agent/LLM proposal or repair | reserve an upper bound before the first call | draw actual usage once per provider call; refund unused reservation exactly once |
| same-call schema/transport retry | bounded by the adapter budget | new `providerCallId`, same logical attempt; bill actual usage if the provider ran |
| legacy fallback after Agent failure | only if the adapter budget has capacity | never assume the failed Agent call was free; reconcile both calls independently |
| shadow comparison | no tenant/user credit and no domain/provider side effect | use a platform shadow budget or a recorded fixture; if a live shadow call is used, its cost is explicitly platform-owned |
| paid image/video/provider submission | reserve/draw through the existing media credit owner | one authorization token and one provider idempotency key; no duplicate submission on retry |

The exact cost policy is:

1. Preflight and a successful no-op are free.
2. Every network call that reaches a model/provider receives a unique
   `providerCallId`; known usage is charged once even when the response is
   malformed, timed out, or rejected by schema. Unknown usage remains
   `pending_reconciliation` rather than being silently refunded or charged
   twice.
3. A retry key is derived from logical attempt, call purpose, retry ordinal,
   provider/model, and input hash. It is not derived only from the UI click or
   queue job ID.
4. A credit reservation is never reused by a different source fingerprint,
   task kind, provider task, or tenant. Refund and draw operations are
   idempotent and auditable.
5. Cancellation is cooperative before a paid side effect. After submission is
   accepted or may have been accepted, cancellation only fences local
   activation and enters `reconciliation_required`; it must not issue an
   automatic refund or resubmit until provider/ledger reconciliation proves
   the outcome.
6. A worker retry never replays a paid call merely because the queue delivery
   was redelivered. It first reads the durable call/authorization record and
   resumes reconciliation or returns the existing result.

The test suite must inject failures after reservation, after provider request,
after provider acceptance, after credit draw, and after final-gate persistence.
For each point it must prove exact-once ledger effects, no duplicate provider
task, and a user-visible state that still permits safe editing or recovery.

### 10.5 Logical API and compatibility contract

Deep-plan must map these logical operations onto the repository's existing
routers/services; it must not create duplicate endpoints merely to match these
names:

| Logical operation | Required input | Required behavior |
| --- | --- | --- |
| `admitOrGet` | tenant/domain owner, task kind, source/context fingerprint, idempotency key | return the existing attempt for a duplicate key or create exactly one durable attempt |
| `getProjection` | attempt/entity scope | return §5.4 projection from durable state; Redis is an optimization only |
| `cancel` | attempt ID + fence token | fence local work; after possible paid submission, reconcile instead of refunding blindly |
| `retry` | current source/context fingerprint + prior attempt reference | create a new bounded attempt without mutating the old attempt or duplicating paid work |
| `repair` | exact current result, source version/fingerprint, contract/policy hash, repair intent | reject stale/missing results with typed codes; re-evaluate the candidate before activation |
| `reconcile` | provider/credit correlation and authorization record | resolve uncertain side effects idempotently and expose the next safe action |

All mutations accept a caller idempotency key and return a stable request/trace
identifier. Existing clients may omit new fields and receive a legacy-wrapped
projection. New clients must tolerate unknown additive fields and must not
depend on raw error text. The server must preserve the current HTTP/tRPC
success/error envelope where possible, adding stable error codes and projection
metadata rather than replacing the client contract in one release.

The implementation must write contract tests for request parsing, tenant scope,
duplicate admission, stale repair, current recovery repair, cancellation,
reconciliation, and legacy projection before switching any active flag.

## 11. Error taxonomy and graceful handling

All errors crossing the API boundary must map to stable codes:

| Class | Examples | Result |
| --- | --- | --- |
| Input/contract | missing source, invalid schema, stale fingerprint | `awaiting_action` |
| Model behavior | malformed output, incomplete JSON, forbidden mutation | reject candidate; retry or recover |
| Provider/transient | timeout, rate limit, 5xx, circuit open | `retryable_failed` or recover |
| Budget | max turns/tokens/credits exceeded | `awaiting_action` or `retryable_failed` |
| Concurrency | lease lost, newer source version, duplicate run | stale/current conflict; no publish |
| Persistence | ledger write unavailable, checksum mismatch | `fatal_failed` and operator alert |
| Paid-side-effect uncertainty | provider response lost after submit | `reconciliation_required` |

The API may log the original exception for operators, but the browser receives a
stable user-safe code, current state, recovery availability, and next action.

## 12. Observability and operations

The following metrics are mandatory by `taskKind`, model policy, provider, tenant
class, and release:

- admission success/rejection;
- baseline completion rate;
- schema-invalid response rate;
- immutable/mutable contract violation rate;
- repair acceptance rate;
- recovery rate;
- `retryable_failed`, `awaiting_action`, and `fatal_failed` rates;
- time to terminal state and stale-run count;
- duplicate/idempotency conflict count;
- actual credits, reserved credits, refunded credits, and variance;
- provider-uncertain count and reconciliation age;
- final-gate block rate and downstream paid-generation prevention;
- Agent turn/tool/token/cost distributions.

Trace payloads must be redacted and tenant-scoped. Prompts, story text, media
URLs, tokens, and private evidence must not be emitted into unrestricted logs.
Every failed run must be replayable from a redacted fixture without charging or
calling a paid provider.

#### Production reliability objectives

The following are release invariants, not aspirational model-quality targets:

- 100% of admitted synthetic and canary runs reach a durable terminal or
  actionable waiting state within the configured lease/reconciliation window;
- 100% of activation, paid-provider, and export decisions have a final-gate
  record, context fingerprint, and CAS/authorization result;
- 0 invalid candidate activations, 0 duplicate user-credit deductions, and 0
  duplicate paid provider submissions in replay/crash/idempotency tests;
- 100% of browser-visible failures use a stable code and next action; no raw
  `TRPCClientError`, unbounded spinner, or dead repair button is accepted in
  the canary flow;
- runtime availability and provider latency are measured separately from these
  correctness invariants. A provider outage may produce `retryable_failed`,
  `awaiting_action`, or `reconciliation_required`, but may not corrupt state
  or block editing/saving.

Alerts must be attached to the invariants and not only to aggregate success
rate: any invalid activation, duplicate side effect, tenant-scope violation,
unknown-credit reconciliation older than the operator SLA, or run without a
terminal event is a release-blocking incident.

## 13. Testing and evaluation gates

### 13.1 Contract and unit tests

- canonical hash parity between Node and Python;
- all allowed/forbidden state transitions;
- stale source and lease fencing;
- candidate/active version compare-and-set;
- immutable path protection;
- allowlisted repair paths and disjoint preserve paths;
- structured output parsing and semantic validation;
- idempotent queue, reservation, refund, and provider authorization;
- redaction and tenant isolation.

### 13.2 Failure replay fixtures

Required fixtures include:

1. `storyContract` mutation during revision;
2. failed revision after a valid baseline;
3. malformed or truncated judge JSON;
4. valid JSON with missing criteria;
5. stale repair source version;
6. matching version with wrong fingerprint;
7. worker crash after baseline persistence;
8. Redis expiry with durable ledger present;
9. duplicate queue delivery;
10. cancellation during model call;
11. credit reservation draw/refund failure;
12. provider response lost after accepted task;
13. prompt over provider limit;
14. ambiguous character/reference evidence;
15. newer user edit racing with repair completion;
16. each non-fiction profile with missing required coverage;
17. restaurant/product/software review with a factual claim unsupported by the
    supplied source pack;
18. AI-generated illustrative media incorrectly proposed as verified evidence;
19. uploaded video bound as an image reference without explicit promotion;
20. exact B-roll segment with invalid trim, audio collision, overflow, stale
    storage, or missing rights/disclosure;
21. profile/source snapshot change between story, start-frame, reference, and
    video-prompt jobs;
22. start-frame/reference role conflict where a subject image tries to replace
    an approved scene anchor;
23. full story output that loses a required source/claim/coverage binding;
24. video prompt that changes the speaker, position, cast count, or action from
    the approved shot contract;
25. news/current-report claim with stale `asOf`, missing attribution, or a
    correction that must invalidate downstream artifacts.

### 13.3 Cross-profile and cross-stage contract matrix

The implementation must maintain a machine-readable matrix proving that each
profile traverses the same chain:

```text
profile/source pack
  -> ProductionContextSnapshot
  -> premise/architecture
  -> full story/deep draft
  -> shot semantic contract
  -> start frame + reference/image prompt
  -> video prompt
  -> B-roll/assembly
  -> post-generation QC/final gate
```

At minimum, the matrix covers Documentary, Location Review, Restaurant Review,
Product Review, Software/System Review, Hybrid Docu-Drama, News/Current Report,
and one fiction profile. Every row records required inputs, output fingerprint,
blocking gates, repair route, and focused test evidence. A profile that only
passes generic fiction tests is not production-ready.

### 13.4 Production gates

Before active production traffic:

- 100% focused contract/recovery/replay fixture pass;
- 0 raw API errors in authenticated browser flow for the canary suite;
- 0 invalid candidate activations;
- 0 duplicate credit/provider side effects in idempotency tests;
- 100% of synthetic runs reach a documented terminal/waiting state;
- shadow comparison shows no unexplained difference in accepted baseline
  candidates;
- operator can disable the Agent path and resume the deterministic fallback;
- staging worker restart and Redis expiry recovery are verified;
- browser, deployment, provider, and production checks are recorded separately
  from local test evidence.

No “100% production-ready” claim is allowed from unit tests alone. Live provider,
deployment, migration, browser, and canary evidence must be explicitly recorded.

### 13.5 Browser and registry coverage

The browser acceptance matrix is generated from the authoritative
`VD_SERIES_PROFILE_IDS`/profile registry, not from a hand-maintained subset.
The current release must exercise all thirteen profiles: six fiction profiles
(`drama_romance`, `horror_thriller`, `sci_fi_cyberpunk`, `action_epic`,
`fantasy_fairytale_xianxia`, `animation_cartoon`), plus `documentary`,
`news_report`, `location_review`, `restaurant_review`, `product_review`,
`software_review`, and `hybrid_docu_drama`.

For each profile, the authenticated browser suite must prove: create/save,
refresh/reconnect, source-slot or optional-source behavior, preview/edit while
QC is running, successful or actionable QC completion, repair/retry, and the
correct next-stage gate. Review/news profiles must additionally prove claim,
freshness, disclosure, and B-roll warnings in the UI. Fiction profiles must
prove that optional source requirements do not appear as an accidental hard
block. A registry change must fail CI until its profile policy, snapshot
fixture, cross-stage row, and browser flow are added.

The browser suite records separately whether the Agent runtime was active,
shadowed, legacy, or unavailable. A passing legacy fallback is valid evidence
of UX continuity, but it is not evidence that the Agent path is production
ready; both paths need their own canary proof before promotion.

### 13.6 Mandatory end-to-end acceptance scenarios

These scenarios are release-blocking and must be executable as deterministic
replay fixtures plus authenticated browser/API tests where applicable:

1. A Draft QC run persists a valid baseline, produces an immutable
   `storyContract` mutation, and ends as `recovered` with an exact current
   result. Pressing repair starts successfully; it must not return the observed
   `Draft QC repair requires a completed, current QC result` error.
2. Repair is attempted with no result, an old result, a wrong source
   fingerprint, and a different contract version. Each returns its specific
   typed code and a usable `run_qc`/`refresh`/`retry` action without changing
   the draft.
3. Agent active, shadow, legacy, manifest-missing, timeout, and runtime-error
   modes all preserve editing/save/preview. Only activation/provider/export
   gates may wait or fail closed.
4. Browser refresh, tab close, network loss, worker restart, Redis expiry, and
   duplicate queue delivery restore one durable projection without duplicate
   runs, duplicate credits, or an infinite spinner.
5. A new user edit or source/profile change fences the old attempt, preserves
   its evidence, invalidates only affected downstream artifacts, and allows a
   fresh run from the new fingerprint.
6. Failures injected before reservation, after model response, after provider
   acceptance, after credit draw, and after CAS produce exact-once ledger
   effects and a recoverable user action.
7. Every current profile passes the source-pack/claim/evidence/rights/B-roll
   policy appropriate to it; fiction profiles remain usable without an
   accidental required source pack.
8. The full chain preserves the same context fingerprint and selected semantic
   roles from premise through story, start frame, reference/image prompt,
   video prompt, B-roll, assembly, and final QC.
9. A provider-limit failure never silently marks a lossy truncation as
   `provider_ready`; the user receives a repairable choice or safe retry.
10. A provider result that may have been accepted enters reconciliation and
    cannot be blindly resubmitted or automatically refunded.

## 14. Rollout and rollback

### 14.0 Compatibility and migration sequence

Schema and contract changes must be additive and deployable in this order:

1. Add nullable/versioned durable fields and indexes; deploy readers that
   understand old and new records.
2. Deploy dual-write adapters and compatibility projection for legacy QC
   records. Old clients continue to receive the current fields; new metadata
   is optional until the flag is enabled.
3. Backfill only records whose tenant, owner, source version, and fingerprint
   can be proven from an existing ledger. Unknown or ambiguous records remain
   legacy/needs-review; no score, ownership, or recovered status is fabricated.
4. Enable shadow/canary flags, collect evidence, then make new fields required
   only at the specific activation/provider/export boundary that consumes them.
5. Keep the old read path and kill switch until all active leases and provider
   reconciliations from the old version are terminal.

Migrations must be online, bounded, resumable, and observable. They must not
hold a lock that prevents draft save, source editing, QC inspection, or
existing generation. Rollback must be possible at the application/flag level
without rolling back a destructive schema change.

### Phase 0 — safety baseline

- Keep current path available behind a kill switch.
- Add typed result/state compatibility and recovery projections.
- Fix the current `failed + recovered result` mismatch.
- Add historical failure fixtures before changing model orchestration.
- Add the profile/source/visual-context admission check for all supported
  profiles, including Documentary, Location Review, Restaurant Review, Product
  Review, Software/System Review, Hybrid Docu-Drama, News/Current Report, and a
  fiction profile.
- Run source-pack, evidence, rights/disclosure, coverage, and B-roll readiness
  checks in shadow mode; an attachment alone never counts as production
  readiness.
- Inventory legacy Redis/domain records read-only; project only states that can
  be proven from an exact ledger version and fingerprint. Never fabricate a
  score, mark an incomplete result as recovered, or backfill ownership blindly.

### Phase 1 — Draft QC shadow

- Run the new assurance envelope in shadow mode for selected internal series.
- Do not activate its candidate or charge additional credits.
- Compare state, scorecard, repair proposal, and cost to the current path.

### Phase 2 — Draft QC canary

- Enable for an explicit tenant/series allowlist.
- Start with one bounded automatic repair round.
- Monitor terminal reliability, recovery, contract violations, credits, and
  support-reported repair failures.

Suggested independent flags (names may follow the repository's existing flag
registry) are `verticalDramaAssuranceShadow`,
`verticalDramaDraftQcOrchestraActive`, `verticalDramaPromptQcOrchestraActive`,
and `verticalDramaAssuranceKillSwitch`. The kill switch must fail closed to the
safe deterministic/fallback path and must not clear accepted ledger data.

### Phase 3 — Prompt and media canary

- Enable only after Phase 1 meets all production gates.
- Enable start-frame, reference/image prompt, video prompt, and B-roll/assembly
  adapters as one fingerprinted chain; do not enable video prompt alone against
  unverified or stale visual inputs.
- Require `provider_ready` final gate before paid video submission.

### Phase 4 — Story/Season activation

- Activate Feature 152/153 adapters only after contract parity and replay proof.
- Expand by tenant/series cohorts with rollback at the task-kind flag level.

Rollback must disable the new adapter and preserve existing accepted versions.
It must not delete ledger evidence, silently revert user drafts, refund charges
without ledger evidence, or resubmit uncertain provider tasks.

## 15. Security and tenancy

- Require tenant identity before admission; never infer it from draft content.
- Scope every source, evidence, ledger, trace, and repair lookup by tenant/user
  and domain owner.
- Treat story text, prompt text, retrieved evidence, and provider responses as
  untrusted data, not Agent instructions.
- Enforce runtime manifest/tool permissions in Python and repeat side-effect
  authorization in Node.
- Never send provider URLs as proof of durable ownership; use managed asset IDs
  and authorized storage references.
- Redact secrets, JWTs, signed URLs, and private evidence from traces.
- Treat retrieved pages, uploaded documents, subtitles, OCR, transcripts, and
  media metadata as prompt-injection-capable untrusted content. Delimit them as
  evidence, pass only the minimum required fields to the Agent, and require
  server-owned structured IDs for every proposed citation/asset/claim.
- Validate every media reference through tenant-scoped storage resolution and
  capability checks before a vision/model call; Agents must not fetch arbitrary
  URLs, follow redirects, call internal addresses, or turn a user-provided URL
  into a durable asset reference.
- Enforce request size, media count, token, wall-clock, concurrency, and retry
  budgets per tenant/run so a malformed profile or hostile source pack cannot
  starve other users. Budget exhaustion is an actionable bounded outcome, not
  an infinite retry loop.

## 16. Implementation map

### Shared assurance integration

- `apps/web/shared/agentRuntime/types.ts`
- `apps/web/shared/verticalDramaSeries/draftQualityQc.ts`
- `apps/web/server/services/agentRuntime/requestBuilder.ts`
- `apps/web/server/services/agentRuntime/client.ts`
- `apps/web/server/services/agentRuntime/runtimeSelection.ts`
- `apps/web/server/services/agentRuntime/checkpointService.ts`
- `apps/web/server/services/agentRuntime/orchestraFinalGate.ts`
- `apps/web/server/services/agentRuntime/orchestraEventReplay.ts`
- `python-backend/app/services/openai_agents_contracts.py`
- `python-backend/app/services/openai_agents_adapter.py`
- `python-backend/app/services/openai_agents_trace.py`
- `python-backend/app/api/internal_openai_agents_runtime.py`

### Phase 1 domain work

- `apps/web/server/services/verticalDramaDraftQualityQc.ts`
- `apps/web/server/services/verticalDramaDraftQualityQcJobs.ts`
- `apps/web/server/services/verticalDramaDraftLedger.ts`
- `apps/web/server/routers/verticalDramaSeries.ts`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaDraftQualityQcPanel.tsx`
- `apps/web/client/src/components/verticalDramaSeries/CreateSeriesWizard.tsx`

### Profile, source, visual context, and media work

- `apps/web/shared/verticalDramaSeries/seriesProfile.ts`
- `apps/web/shared/verticalDramaSeries/formatProfiles.ts`
- `apps/web/shared/verticalDramaSeries/sourcePack.ts`
- `apps/web/shared/verticalDramaSeries/visualSource.ts`
- `apps/web/shared/verticalDramaSeries/visualGrounding.ts`
- `apps/web/shared/verticalDramaSeries/newsReport.ts`
- `apps/web/shared/verticalDramaSeries/qualityPolicy.ts`
- `apps/web/server/services/verticalDramaSourcePackService.ts`
- `apps/web/server/services/verticalDramaVisualSourceCore.ts`
- `apps/web/server/services/verticalDramaVisualSourceSnapshotService.ts`
- `apps/web/server/services/verticalDramaBrollService.ts`
- `apps/web/server/services/verticalDramaStartFrameGeneration.ts`
- `apps/web/server/services/verticalDramaPromptExpansionService.ts`
- `apps/web/server/services/verticalDramaVideoMotionPromptGeneration.ts`
- `apps/web/server/services/verticalDramaShotPromptJobs.ts`
- `apps/web/server/services/verticalDramaShotVideoPromptJobs.ts`

### Later adapters

- `apps/web/server/services/verticalDramaPromptQc.ts`
- `apps/web/server/services/verticalDramaVideoMotionPromptGeneration.ts`
- Feature 152 story assurance services
- Feature 153 long-form/season gate services
- Feature 149 prompt learning/QC ledger integration

The implementation must first run `codebase_impact` when SocratiCode becomes
available; in this audit SocratiCode transport was unavailable, so the current
spec is based on targeted shell/code inspection and existing feature contracts.

### 16.1 Ownership and execution order

| Boundary | Sole authority | Must not be duplicated by |
| --- | --- | --- |
| Assurance envelope, runtime selection, Agent trace/checkpoint | Feature 151 Agent Runtime/Orchestra services | Vertical Drama routers or Python ad hoc bridges |
| Profile/source/visual context and claim policy | shared Vertical Drama contracts and source/visual services | Agent output or client-provided facts |
| Draft/story/prompt candidate and active version | existing domain ledgers/services | Redis records, Agent runtime, or browser state |
| QC state, final gate, CAS, repair admission | Node Vertical Drama QC/domain services | UI inference or provider response |
| Credit reservation/draw/refund | existing credit ledger/service owner | Agent runtime or parallel adapter deductions |
| Paid provider submission and uncertain-result reconciliation | existing media/provider task owner | QC worker replay or Agent tools |
| Durable media and tenant ownership | managed storage/media services | provider URL or generated prompt |
| User projection and UX actions | existing tRPC/client components | raw exception text or local-only state |
| Release evidence and operational response | QA/operations runbook and dashboards | a passing unit test alone |

Implementation order must follow the ownership dependency: shared types and
error/state vocabulary → durable attempt/projection/reconciliation → Draft QC
repair → context snapshot/admission → prompt/media adapters → story/season
adapters → browser/provider/canary proof. Each step must keep the previous
flag-disabled path operational and must include focused tests before the next
step changes a shared boundary.

### 16.2 Deep-plan constraints and deliverables

The deep-plan output must include, for every section:

- exact files/symbols to inspect or change and the import/call-flow impact;
- request/result/error schemas and migration/backward-compatibility behavior;
- TDD test names covering happy path, failure path, retry, stale, recovery,
  tenant scope, credit/provider side effects, and UX projection;
- rollout flag, kill-switch, observability, and rollback behavior;
- explicit non-blocking UX behavior and browser evidence requirements;
- dependency order and a safe commit boundary.

The plan must identify which checks are deterministic, which are Agent
advisory/proposal work, and which are final hard gates. It must not leave
decisions such as billing ownership, source-pack policy, active-version CAS,
or retry semantics to the implementer. It must also identify any current code
that contradicts this spec before proposing a change.

## 17. Risk register

| Risk | Mitigation | Acceptance evidence |
| --- | --- | --- |
| Duplicate assurance runtime | Reuse Feature 151 bridge and contracts | import/route boundary tests |
| Agent output still violates domain rules | deterministic pre/post gates | mutation and invalid-patch fixtures |
| Recovery hides a bad baseline | exact ledger version/fingerprint and explicit warning | recovery replay tests |
| Redis-only record disappears | durable attempt/result lineage | expiry/restart test |
| New feature blocks valid creative work | hard vs advisory findings and `awaiting_action` | false-positive fixture set |
| Repair changes downstream assumptions | versioned source and stale downstream stages | activation/lineage tests |
| Credit/provider duplicate side effect | idempotency and one-time authorization | crash/retry simulation |
| SDK upgrade changes behavior | pin, trace, eval, canary, rollback | dependency and canary gate |
| Prompt injection through story/evidence | untrusted-data boundary and tool allowlist | injection fixtures |
| Scope expands into rewrite | phase flags and explicit non-goals | review checklist |

## 18. Definition of done

This feature is complete only when:

1. Draft QC and Draft Repair use the shared assurance state/result contract.
2. The current 409 precondition mismatch is covered by a regression test and
   cannot recur for a current recovered result.
3. Invalid revisions are rejected as candidates without losing a valid baseline.
4. `succeeded` means a current, verified, durably linked candidate; `recovered`
   is distinct and actionable.
5. Redis/worker restart, cancellation, duplicate delivery, and stale repair are
   recoverable without duplicate credit/provider effects.
6. Agent SDK execution is feature-flagged, bounded, traced, and kill-switchable.
7. Prompt QC has a documented adapter contract ready for Phase 2 and does not
   silently truncate or bypass provider readiness checks.
8. Story/Season adapters pass contract compatibility tests without being enabled
   by the Phase 1 flag.
9. All required local tests and replay fixtures pass.
10. Staging/browser/provider/deployment/canary evidence is recorded separately.
11. An operator runbook explains retry, recovery, reconciliation, rollback, and
    how to inspect the exact candidate/fingerprint that was accepted.
12. Every supported profile passes the cross-profile/cross-stage contract matrix,
    including source-pack readiness, claims/evidence, prompt lineage, B-roll,
    and final assembly gates.
13. Profile/source changes invalidate affected downstream artifacts and never
    mix old/new context fingerprints.
14. No unrelated dirty-worktree files are staged or modified by implementation.

## 19. Related specifications and source references

- Feature 149: `specs/feature/149-vertical-drama-video-prompt-learning-qc-ledger/spec.md`
- Feature 150: `specs/feature/150-vertical-drama-prompt-orchestra-semantic-verification/spec.md`
- Feature 151: `specs/feature/151-unified-agent-output-assurance-orchestra/spec.md`
- Feature 152: `specs/feature/152-vertical-drama-story-generation-assurance-orchestra/spec.md`
- Feature 153: `specs/feature/153-vertical-drama-long-form-story-architecture/spec.md`
- Feature 154: `specs/feature/154-vertical-drama-closure-documentary-genre-grounding/spec.md`
- Feature 156: `specs/feature/156-vertical-drama-unified-series-profile-story-assets/spec.md`
- Feature 160: `specs/feature/160-vertical-drama-prompt-expansion-and-visual-source-assets/spec.md`
- OpenAI Agents SDK Agents/Runner: https://openai.github.io/openai-agents-python/agents/
- OpenAI Agents SDK guardrails: https://openai.github.io/openai-agents-python/guardrails/
- OpenAI model versioning and evals: https://platform.openai.com/docs/api-reference/backward-compatibility?lang=ruby
