# Feature 152: Vertical Drama Story Generation Assurance Orchestra

**Status:** IMPLEMENTED FOUNDATION — rollout remains flag-gated; production proof pending
**Version:** 1.0.8
**Created:** 2026-08-21
**Priority:** P0 — prevent incomplete story generation from appearing successful
**Owner:** Vertical Drama / Story Quality / Agent Runtime / Reliability
**Depends-on:** Feature 131 (Vertical Drama series storyboard/video flow), Feature 132 (story & character quality engine), Feature 148 (unified agent/worker platform), Feature 149 (video prompt learning/QC ledger), Feature 150 (Vertical Drama Prompt Orchestra), Feature 151 (Unified Agent Output Assurance Orchestra)
**Continues:** Feature 132
**Related:** `verticalDramaStoryBible.ts`, `verticalDramaSeries.ts`, `verticalDramaStoryJobs.ts`, `verticalDramaQualityLoop.ts`, `vertical-drama-full-story-architect`, `vertical-drama-draft-quality-controller`, `vertical-drama-season-dramaturgy-critic`

> This spec is an additive continuation of the existing Vertical Drama story
> quality work. It does not replace Feature 131, duplicate Feature 151's Agent
> SDK runtime, or move tenant, credit, persistence, or provider authority into
> an LLM agent.

## 0. Changelog

### [1.0.0] - 2026-08-21

- Added a durable assurance workflow for full-story and story-horizon generation.
- Defined a strict distinction between `succeeded`, `needs_repair`, `partial`,
  `failed`, and `cancelled`.
- Added source-draft snapshotting and a plan-to-draft alignment ledger.
- Added deterministic validation before semantic review and targeted repair.
- Defined bounded Standard and Premium generation policies.
- Defined optional reuse of the Feature 151 OpenAI Agents SDK runtime behind a
  feature flag; the first correctness fixes do not depend on an agent loop.

### [1.0.1] - 2026-08-21

- Added explicit parent-run/episode-step persistence and worker fencing.
- Added candidate-versus-active-version commit rules for partial work.
- Added credit reservation/reconciliation, source canonicalization, legacy
  compatibility, migration, rollback, and state-transition contracts.
- Expanded plan-stage coverage from `generateStoryBible` through deep generation,
  extension, and repair.

### [1.0.2] - 2026-08-21

- Added explicit rule packs, acceptance profiles, bounded context-pack budgets,
  and plan-candidate gating.
- Added repair-impact closure, provider/credit reconciliation state, and
  approval before activating repairs to an existing accepted story.

### [1.0.3] - 2026-08-21

- Added Feature 151 contract/hash/policy compatibility and domain-to-runtime
  waiting-state mappings.
- Added provider outcome ledger, cancellation reconciliation, finalization saga,
  event cursors, manifest verification, and source snapshot retention rules.

### [1.0.4] - 2026-08-21

- Added explicit HTTP/non-HTTP transport outcome mapping so partial or
  action-required runs cannot be presented as successful from status 200.

### [1.0.5] - 2026-08-21

- Added Feature 151 contract-hash verification tests and explicit plan-candidate
  persistence/accepted-plan version boundaries.

### [1.0.6] - 2026-08-21

- Bound validation reports to contract/output fingerprints and clarified the
  effective credit ceiling across run and side-effect policies.

### [1.0.7] - 2026-08-21

- Added Feature 132 quality-flag/criteria-version compatibility, legacy repair
  path interception, and explicit plan/quality persistence integration.

### [1.0.8] - 2026-08-21

- Completed the first implementation slice across all nine implementation
  sections: durable run contract/schema, checkpoint/recovery API, deterministic
  final gate, plan alignment, bounded repair planning, UI recovery panel,
  Feature 151 adapter, redacted telemetry, migration, and operator runbook.
- Added a pre-activation gate so assurance deep/extend jobs cannot write an
  incomplete candidate into the active breakdown.
- Added explicit missing-episode and string-beat validation, and changed the
  legacy job status to non-success when the durable final gate is partial or
  action-required.
- Recorded remaining external/runtime boundaries in
  `implementation/acceptance-matrix.md`; this version does not claim production
  migration, provider reconciliation, browser, or Agents SDK active-mode proof.

### [1.0.9] - 2026-08-21

- Corrected repair impact accounting so blocking findings target only the
  implicated admitted episodes instead of the entire generated output.
- Added deterministic neighboring-episode impact closure for bounded repair
  planning and an approval requirement when continuity impact leaves the
  admitted scope.
- Made durable fence compare-and-set loss fail closed before a stale worker can
  publish a terminal compatibility job result.

## 1. Executive decision

Vertical Drama full-story generation must become a **durable, deterministic-first,
skill-driven assurance workflow**. An LLM-generated story is not accepted merely
because it is valid JSON, contains nine shots, or completed one or more chunks.

The workflow must bind every generated episode to an immutable snapshot of the
approved story draft, validate structural and continuity invariants, review story
craft using the existing skills, repair only identified defects, and revalidate
before persisting an accepted version.

```text
Approved draft snapshot + source fingerprint
        |
        v
Per-episode generation/checkpoint
        |
        v
Deterministic contract gate
        |
        v
Plan-alignment + dramaturgy review
        |
        v
Targeted repair of failed episodes/beats only
        |
        v
Revalidate -> accepted version OR needs_repair
```

OpenAI Agents SDK may orchestrate bounded author, reviewer, and repair roles in
the later rollout, using Feature 151's existing runtime. It is not the first
fix and it is not the source of truth for completion, credits, tenancy, or
database writes.

## 2. Problem statement and current evidence

The current system can preserve useful partial work, but it exposes that partial
work as a successful generation result. The user then has to infer that the
story is incomplete and manually run generation again.

The local audit sample inspected on 2026-08-21 contained 30 deep-story audit
runs, six with `partial=true`, across at least five series. This is local evidence
only and must not be presented as a production rate. Retained audit records show:

- Series #25 generated 10/15 episodes before an OpenRouter credit/max-token
  failure and later required another run.
- Series #28 generated 5/10 episodes before an insufficient-credit failure and
  later required another run.
- Series #17, #18, and #25 have partial history followed by later completion.
- Series #24 has 0/50 deep drafts locally, but there is no retained evidence that
  a deep-generation job ever started; it is not classified as a stuck job by
  this spec.

Observed contract gaps:

1. The service intentionally returns `partial: true` after a later chunk fails.
2. The router persists the successful chunks and records the normal audit event
   with HTTP status 200.
3. The UI shows a success toast and only then displays a transient partial banner.
4. BullMQ retries worker crashes/stalls, but logical executor failures are
   swallowed and do not become queue retries.
5. Standard mode has a bounded corrective retry, but unresolved violations can
   remain warnings rather than blocking acceptance.
6. Premium revision and season-sweep work is partly best-effort and is not a
   durable per-episode repair state machine.
7. The current merge preserves planned fields, but does not prove that generated
   shot summaries and dialogue realize every planned key beat.
8. Story job records and active pointers are Redis-backed with a six-hour TTL;
   long-running work needs a durable source of truth independent of a browser
   polling window or Redis retention.

## 3. Goals

1. Never report `succeeded` when requested episodes are missing or a critical
   validation remains unresolved.
2. Resume from the last completed episode/checkpoint without regenerating or
   recharging accepted episodes.
3. Bind generated output to an exact source draft version and fingerprint.
4. Verify structural completeness, character/location identity, continuity,
   premise coverage, architecture constraints, and planned-beat coverage.
5. Use existing Vertical Drama skills as versioned contracts for authoring,
   review, and repair.
6. Repair only the smallest failing scope and run a fresh validation after every
   repair attempt.
7. Make credit limits and provider failures predictable before starting the next
   paid call.
8. Provide durable user-visible status and a Resume/Repair action.
9. Make every attempt, candidate, validator finding, repair, model, provider,
   cost, and final decision traceable by `runId` and `attemptId`.
10. Enable a controlled OpenAI Agents SDK rollout without duplicating the runtime
    established by Feature 151.

## 4. Non-goals

1. Rewriting the entire Vertical Drama story pipeline in Python.
2. Replacing deterministic validation with an autonomous agent.
3. Increasing retry counts without a cost, time, and completion budget.
4. Regenerating an entire season for a local episode or beat defect.
5. Automatically activating a repaired candidate without fresh validation.
6. Changing provider submission, media rendering, audio, or publishing flows.
7. Treating a larger context window as a substitute for ledgers and checkpoints.
8. Adding a second OpenAI Agents SDK adapter or bypassing Feature 151.
9. Treating a local database or local logs as production proof.

## 5. Current-codebase fit and locked decisions

### 5.1 Node remains the business authority

Node/TypeScript remains authoritative for:

- tenant and user authorization;
- source draft and story-bible persistence;
- job admission, idempotency, cancellation, and checkpoint records;
- credit estimation, reservation, deduction, and reconciliation;
- model/provider selection policy;
- final validation decision and append-only version activation;
- audit events and user-visible status.

The Agent SDK runtime can propose or repair content, but cannot directly mutate
the database, deduct credits, activate a story version, or submit a provider job.

### 5.2 Reuse Feature 151's assurance runtime

If agent orchestration is enabled, the caller must use Feature 151's existing
Node-to-Python contract, manager topology, budgets, tracing, and final-gate
token rules. No Vertical Drama-only SDK import boundary is allowed.

Feature 152 adds a story adapter and rule packs on top of Feature 151; it does
not create a parallel runtime.

### 5.3 Skill-first source of intent

The following skills are the initial source of authoring and review intent:

| Role | Skill | Responsibility |
|---|---|---|
| Author | `vertical-drama-full-story-architect` | Produce episode/shot drafts under the story contract |
| Pre-creation controller | `vertical-drama-draft-quality-controller` | Evaluate or revise premise/story-engine inputs |
| Dramaturgy reviewer | `vertical-drama-season-dramaturgy-critic` | Review structure, agency, stakes, tactics, dialogue, and action/exposition balance |
| Control planner | `vertical-drama-story-architecture-planner` and existing quality-ledger planner | Produce and preserve architecture, pressure-thread, and control context |
| New alignment reviewer | `vertical-drama-story-plan-alignment-reviewer` | Compare generated evidence with planned beats and immutable story controls |

Skills return typed JSON and bounded repair instructions. They must not claim
that an output passed when the deterministic server gate has not passed.
Before a skill is exposed to the author/reviewer, Node must verify the
Feature 151 manifest signature/hash, active status, tenant scope, task-kind
compatibility, contract-version compatibility, output schema, and declared
repair paths. The selected manifest IDs and checksums are stored in the run
contract; a changed manifest creates a new attempt.

The admission contract also snapshots the Feature 132 quality-flag set
(`verticalDramaQualityLedgers`, `verticalDramaSceneContracts`,
`verticalDramaContinuityContracts`, and related flags) and
`qualityCriteriaVersion`. A disabled Feature 132 capability must use its
compatibility validator and cannot be reported as strict coverage. Strict plan
alignment requires the corresponding ledgers/contracts to be enabled and
versioned in the same source snapshot.

### 5.4 Append-only versioning and immutable source snapshot

Each run captures:

- `sourceBreakdownVersionId` when the task consumes an accepted breakdown;
  plan-stage runs record `null` plus `sourceSnapshotKind: "story_plan"`;
- source snapshot kind and exact source JSON snapshot;
- canonical source fingerprint;
- story-architecture fingerprint;
- story-control seed/version;
- target episode range;
- character and location roster fingerprints;
- skill versions and rule-pack versions;
- provider/model policy;
- budget and idempotency key.

A changed source draft creates a new run or attempt. A running run must not
silently switch to a newer draft.

### 5.5 Scope across the complete story flow

This feature governs the full sequence, not only the final deep-draft call:

1. `generateStoryBible` creates or updates the story-control plan. It must finish
   schema validation, draft-quality review, and source snapshot creation before
   a deep-generation run can use that plan.
2. `generateStoryBibleDeep` generates the requested episode range against the
   immutable plan snapshot.
3. `extendStoryDraftHorizon` creates a child run against the exact accepted
   source version and only processes missing episodes.
4. `repair` creates a child attempt against a candidate and a validation report;
   it never changes the original source plan.

If the plan stage fails, no deep-generation run may silently fall back to an
older or partially written plan. The API must return a plan-stage failure with
an actionable retry or review state.

## 6. Canonical contracts

### 6.1 `StoryGenerationRunContract`

```ts
type StoryGenerationRunContract = {
  schemaVersion: 1;
  contractVersion: string;
  minReaderVersion: string;
  maxReaderVersion: string;
  contractId: string;
  runId: string;
  attemptId: string;
  parentAttemptId?: string;
  tenantId: string;
  userId: number;
  seriesId: number;
  originSurface: string;
  taskKind: "plan" | "deep_generate" | "extend" | "repair";
  objective: string;
  sourceRevision: string;
  sourceBreakdownVersionId: string | null;
  sourceSnapshotKind: "story_plan" | "story_bible" | "legacy_episode_breakdown";
  inputRefs: EvidenceRef[];
  evidencePolicy: EvidencePolicy;
  outputContract: OutputContract;
  constraints: ConstraintSet;
  sourceFingerprint: string;
  architectureFingerprint: string;
  storyControlFingerprint: string;
  targetEpisodeNumbers: number[];
  expectedShotsPerEpisode: number;
  characterRosterFingerprint: string;
  locationRosterFingerprint: string;
  qualityCriteriaVersion: string;
  qualityFeatureFlagSnapshot: Record<string, boolean>;
  skillVersions: Record<string, string>;
  rulePackIds: string[];
  validationPolicy: {
    requiredRulePackIds: string[];
    warningPolicy: "allow_explicit" | "block_all";
    requireFreshValidationAfterRepair: boolean;
  };
  sideEffectPolicy: {
    allowedEffects: Array<
      "artifact_write" | "user_visible_write" | "credit_mutation"
    >;
    requireUserApproval: boolean;
    approvalRef?: string;
    maxSpend: number;
    allowRetryAfterPartialSuccess: boolean;
  };
  mode: "standard" | "premium";
  budget: {
    maxTurns: number;
    maxToolCalls: number;
    maxParallelAgents: number;
    maxPlanDepth: number;
    maxEpisodes: number;
    maxLlmCalls: number;
    maxRepairRounds: number;
    maxImpactEpisodes: number;
    maxWallClockMs: number;
    maxContextTokens: number;
    maxOutputTokens: number;
    maxEstimatedCredits: number;
    onExhaustion: "block" | "await_user" | "retryable_failure";
  };
  providerPolicy: ProviderPolicy;
  idempotencyKey: string;
  policyHash: string;
  contractHash: string;
  expiresAt: string;
  createdAt: string;
};
```

The contract is immutable for one attempt. Repair creates a child attempt with
`parentAttemptId` and a new output fingerprint.

### 6.2 `StoryPlanAlignmentLedger`

```ts
type StoryPlanAlignmentLedger = {
  episodeNumber: number;
  plannedLogline: string;
  plannedKeyBeats: Array<{
    beatId: string;
    beatIdSource: "authored" | "derived";
    text: string;
    required: boolean;
    plannedEpisode: number;
    allowedEvidenceEpisodes?: number[];
  }>;
  coveredBeatIds: string[];
  evidenceShotNumbers: Record<string, number[]>;
  unresolvedBeatIds: string[];
  deferredBeatIds: string[];
  deferredBy: "source_plan" | "user_approval" | null;
  deferralApprovalRef?: string;
  contradictions: Array<{
    code: string;
    severity: "warning" | "critical";
    sourcePath: string;
    outputPath: string;
    message: string;
  }>;
  threadActions: Array<{
    threadId: string;
    action: "introduced" | "advanced" | "paid_off" | "deferred";
    evidenceShotNumbers: number[];
  }>;
  repairPaths: string[];
  alignmentStatus: "pass" | "warning" | "blocked";
};
```

Key beats must have stable IDs before they are used for strict alignment. Legacy
text-only beats remain readable but receive a lower-confidence alignment status
until the planner supplies stable IDs. A model cannot create a deferral: a
`deferredBeatId` is accepted only when the source plan declares the deferral or
the server stores a user approval reference.

Evidence is valid only in `plannedEpisode` unless the source plan explicitly
declares `allowedEvidenceEpisodes`. A beat realized in an undeclared episode is
reported as plan drift, not silently counted as coverage. Cross-episode beats
must therefore be authored as an explicit episode range before strict alignment
can pass.

### 6.3 `StoryValidationReport`

```ts
type StoryValidationReport = {
  reportVersion: 1;
  runId: string;
  attemptId: string;
  contractHash: string;
  sourceFingerprint: string;
  outputFingerprint: string;
  draftedEpisodeNumbers: number[];
  missingEpisodeNumbers: number[];
  findings: Array<{
    findingId: string;
    code: string;
    severity: "info" | "warning" | "critical";
    repairable: boolean;
    episodeNumber?: number;
    shotNumber?: number;
    paths: string[];
    evidence: string[];
  }>;
  alignment: StoryPlanAlignmentLedger[];
  scorecard?: Record<string, number>;
  status: "pass" | "warning" | "blocked";
  validatorVersion: string;
};
```

### 6.4 Canonicalization and legacy source compatibility

The source fingerprint is SHA-256 over canonical UTF-8 JSON with recursively
sorted object keys, stable array ordering where the contract declares an array
ordered, normalized `null`/missing handling, and volatile fields excluded by an
explicit allowlist. The canonicalizer version is part of the fingerprint input.

The snapshot must retain the exact source JSON needed to resume, not only its
hash. A hash mismatch, unknown canonicalizer version, or missing snapshot is a
stale-source failure and must fail closed.

The same retention rule applies to every input whose fingerprint participates in
the contract: architecture, story-control state, character roster, location
roster, tie-in/production constraints, and the selected skill/rule-pack
manifests. A fingerprint without the corresponding authorized snapshot or
manifest checksum is insufficient to resume or approve a run.

Legacy series may have only `episodeBreakdown` or text-only `keyBeats`. Admission
must create a deterministic compatibility snapshot and derived beat IDs in the
form `derived:<episodeNumber>:<ordinal>:<hash>`. Derived IDs are marked with
`beatIdSource: "derived"`; they may be used for structural alignment, but the
run report must expose reduced confidence until the plan is edited or backfilled
with authored stable IDs. Legacy data must never be silently treated as having
the same strict evidence quality as a versioned plan.

### 6.5 Rule Packs and acceptance profiles

Every run stores immutable rule-pack IDs, versions, thresholds, and the
acceptance profile used by the final gate. The initial deterministic-first set
is:

| Rule Pack | Authority | Blocking examples |
|---|---|---|
| `vd-story-structure-v1` | Node validator | Missing episode/shot, duplicate numbering, schema failure |
| `vd-story-identity-roster-v1` | Node validator | Unknown character, speaker, location, or canonical-ID mismatch |
| `vd-story-control-contract-v1` | Node validator | Story-control, architecture, endpoint, or production-contract violation |
| `vd-story-continuity-v1` | Node validator | Impossible state transition, duplicate payoff, or broken required thread |
| `vd-story-budget-v1` | Node validator | Hard content/speech/token/call/credit limit exceeded |
| `vd-story-plan-alignment-v1` | Alignment reviewer plus Node gate | Required beat unresolved, unsupported deferral, or critical contradiction |
| `vd-story-dramaturgy-v1` | Season dramaturgy critic | Only configured craft-floor failures; it cannot override deterministic facts |

Critical findings from any blocking pack prevent `succeeded`. Warnings may pass
only when the selected profile explicitly permits them and the report records
the waiver policy. Premium score floors must reuse the existing
`VD_PREMIUM_DRAFT_MIN_OVERALL`, `VD_PREMIUM_DRAFT_MIN_DIMENSION`,
`meetsPremiumDraftFloor`, and `meetsPremiumDraftContractFloor` contracts, with
the existing `formatProfile.judge.hookStrengthFloorDelta` override where
applicable. This feature must not introduce a second, silently different
scoring scale. A run is not accepted merely because an aggregate score is high
when a blocking invariant has failed.

### 6.6 Plan-stage candidate boundary

`generateStoryBible` must first persist a plan candidate and pass the same
schema, source-fingerprint, rule-pack, and plan-alignment admission gate before
`generateStoryBibleDeep` or `extendStoryDraftHorizon` can consume it. The
candidate plan is not the active plan until that gate commits it. An automatic
system gate may record `planApproval: "system_gate"`; this does not permit a
deep run to consume an older plan when the requested plan attempt failed.

### 6.7 Feature 151 adapter compatibility

When the Agents SDK flag is enabled, Node must derive the existing Feature 151
`AgentTaskContract` from this domain contract rather than inventing a second
runtime contract. The adapter mapping must include `inputRefs`, evidence policy,
typed output contract, constraints, validation policy, side-effect policy,
provider policy, rule-pack IDs, idempotency key, `policyHash`, and all runtime
budget limits. The registry task kind is
`vertical_drama_story_generation`; domain task kinds (`plan`, `deep_generate`,
`extend`, and `repair`) are an immutable task subtype in the adapter payload.

Node computes `contractHash` over canonical contract bytes with the hash field
omitted, and owns the attempt record. Python must echo the hash and reject
mismatches. A changed
objective, evidence reference, rule pack, provider policy, source revision,
budget, or side-effect scope creates a child attempt; it must never mutate a
running attempt.

The domain state maps to the shared runtime state as follows:

| Feature 152 | Feature 151 runtime meaning |
|---|---|
| `awaiting_approval` | `awaiting_user` with approval-required side effect |
| `awaiting_reconciliation` | `reconciliation_required` with `provider_result_unknown` reason code |
| `needs_repair` | `awaiting_user` with a bounded repair action; child attempts use `repairing` |
| `partial` | `awaiting_user` with a resumable checkpoint and no final-gate commit |

The adapter must persist actor, reason code, contract hash, output hash, and
transition idempotency key for every state change. SDK streaming is progress
only; reconnecting or replaying an event cursor must not create a new run,
attempt, provider call, or credit mutation.

## 7. Assurance workflow

### Stage 0 — Admission and snapshot

1. Load owner, tenant, series, active breakdown, architecture, rosters, and
   existing valid drafts.
2. Compute the immutable source and roster fingerprints.
3. Calculate missing episode numbers from valid nine-shot drafts, not only from
   a numeric horizon.
4. Estimate cost for the remaining work and reject admission when the current
   credit policy cannot fund the next safe unit.
5. Create or reuse an idempotent `runId`; duplicate requests attach to the
   existing active run rather than starting a second generation.

### Stage 1 — Control and context ledger

Build a compact per-episode context containing:

- source logline, key beats, content budget, and episode destination;
- story architecture and story-control seed;
- active/open pressure threads and prior recap;
- character and location canonical IDs;
- prior episode summaries and unresolved continuity obligations;
- tie-in and production constraints;
- the plan-alignment fields required for the output.

The context must be bounded. It must not blindly include an entire season when a
ledger/digest is sufficient.

```ts
type StoryGenerationContextPack = {
  schemaVersion: 1;
  sourcePaths: string[];
  evidenceIds: string[];
  requiredFacts: string[];
  estimatedInputTokens: number;
  omittedOptionalPaths: string[];
  truncationPolicyVersion: string;
  contextFingerprint: string;
};
```

The context builder must emit a versioned `StoryGenerationContextPack` containing
the included source paths, evidence IDs, token estimate, truncation decisions,
and context fingerprint. Hard constraints, required beats, roster IDs, active
threads, and the previous recap are non-truncatable. Optional prose and old
summaries may be compressed or omitted according to a deterministic priority
order. The implementation must preflight input and output budgets before every
paid call; if a required fact cannot fit, it must stop with a typed context
budget finding rather than silently dropping it or asking the model to infer it.

### Stage 2 — Draft generation

Generate one episode or a small bounded chunk at a time. Every successful unit
must checkpoint before the next paid call.

The author skill must output the structured story draft, not a free-form essay.
It must include exactly the requested episode numbers and exactly nine shots per
episode unless the contract explicitly specifies another count.

### Stage 3 — Deterministic validation

Run code validators before any semantic reviewer. Blocking checks include:

- requested episode coverage;
- exactly nine shots per episode;
- unique and correctly numbered episodes/shots;
- valid canonical character names/IDs and dialogue speakers;
- valid existing or declared locations;
- required fields and schema version;
- story-control and architecture invariants;
- content/speech budget limits;
- no impossible thread transition or duplicate payoff;
- no source fingerprint mismatch;
- no critical premise or endpoint contradiction.

A deterministic failure produces a finding and a targeted repair path. It must
not be hidden as a warning when the output cannot be safely accepted.

### Stage 4 — Semantic and plan-alignment review

Run `vertical-drama-story-plan-alignment-reviewer` over compact episode data and
the deterministic facts. It must produce `coveredBeatIds`, evidence shot numbers,
unresolved beats, contradictions, and repair paths.

Run `vertical-drama-season-dramaturgy-critic` only for the configured craft
dimensions. It must not override deterministic facts or invent a new premise,
character, subplot, or ending.

### Stage 5 — Targeted repair

Repair only the episodes and field paths named by the validation report. The
repair input must include the immutable source contract, failing assertion,
allowed paths, and preserved facts.

After each repair:

1. parse and schema-validate the candidate;
2. run deterministic validation again;
3. rerun alignment review for affected episodes;
4. compare non-targeted fields against the parent candidate;
5. reject regression or create another bounded child attempt.

The repair impact set starts with finding episodes and expands to the immediate
previous and next episodes when the finding changes a recap, cliffhanger, open
thread, character state, or payoff. Expansion repeats until the dependency
closure is stable or `maxImpactEpisodes` in the immutable budget is reached.
The final gate validates the requested scope plus this impact closure; it must
not silently repair the whole season or silently leave a newly affected neighbor
unchecked.

No repair may activate a candidate directly.

Feature 132's `applySeasonCritique` and quality-loop repairs must enter this
same candidate/attempt contract when they touch accepted story content. In
particular, a `cross_episode` or `structural` finding that F132 marks as
requiring user approval must become `awaiting_approval` here; it must not use a
legacy direct JSONB write or bypass the repair-impact closure.

### Stage 6 — Final gate and persistence

The final gate accepts only when:

- all requested episodes and the computed repair-impact closure are complete;
- no critical deterministic finding remains;
- all required beats are covered or explicitly approved as deferred;
- alignment has no unresolved required beat or contradiction;
- the output source fingerprint matches the run contract;
- budget and credit reconciliation succeed;
- the append-only version write is idempotent.

For an initial generation/extend run, the final gate may activate the complete
version when the immutable side-effect policy allows it. For a repair whose
parent is already the accepted active version, passing validation produces a
candidate and `awaiting_approval`; `approveStoryGenerationRepair` performs a
fresh source check and the same atomic final-gate transaction before activation.
This prevents a high-scoring repair from silently changing user-visible story
content.

Otherwise the run becomes `needs_repair`, `partial`, or `failed` according to
the failure taxonomy below. None of these states may emit a success toast or be
treated as a completed story.

## 8. Status and failure taxonomy

```ts
type StoryGenerationStatus =
  | "queued"
  | "running"
  | "validating"
  | "repairing"
  | "awaiting_reconciliation"
  | "awaiting_approval"
  | "succeeded"
  | "needs_repair"
  | "partial"
  | "failed"
  | "cancelled";
```

| Status | Meaning | User action |
|---|---|---|
| `succeeded` | Full requested scope passed the final gate | Review/use story |
| `needs_repair` | Output exists but named findings remain bounded-repairable | Resume repair |
| `partial` | Some units completed but requested scope is incomplete | Resume missing units |
| `awaiting_reconciliation` | Provider outcome or credit charge is unknown and must be reconciled | Wait for recovery/reconciliation |
| `awaiting_approval` | A repaired candidate passed technical gates but changes an existing accepted story | Review and approve candidate |
| `failed` | No safe candidate or non-retryable failure | Retry after correction |
| `cancelled` | User/system explicitly stopped the run | Resume or start new run |

Status classification is deterministic:

- `partial` means the requested scope is incomplete because one or more target
  episodes were not produced or a resumable provider/job interruption stopped
  the run. It is resumable from the checkpoint.
- `needs_repair` means the requested scope was produced, but one or more
  bounded validation/alignment findings still block acceptance. It is repairable
  from the candidate without regenerating unrelated episodes.
- `failed` means no usable candidate remains, the source is stale, the budget is
  exhausted, or the error is non-retryable and cannot be safely resumed.
- `awaiting_reconciliation` means a provider request may have been accepted or
  charged but its outcome is unknown. It is never retried as a new paid call
  until the provider and credit ledger are reconciled.
- `awaiting_approval` is used for a repair against an already accepted active
  story when the repaired candidate passes validation but must not silently
  replace user-visible content. It becomes `succeeded` only through an explicit
  server-side approval operation and final-gate transaction.

`partial` is a durable non-success state. The API response must include missing
episodes, last checkpoint, reason, estimated remaining cost, and a stable resume
operation. The UI must never display `deepStoryDraftsGeneratedSuccessText` for
this state.

### 8.1 State-transition and terminal rules

Allowed transitions are:

```text
queued -> running -> validating -> succeeded
                         |       -> needs_repair -> repairing -> validating
                         |       -> partial -> running (resume)
                         |       -> awaiting_reconciliation -> validating
                         |       -> awaiting_approval -> succeeded
                         |                              -> cancelled
                         |       -> failed
                         |       -> cancelled
```

Additional rules:

- Only the server-side final gate may transition to `succeeded`.
- `succeeded`, `failed`, and `cancelled` are terminal for an attempt. Resume or
  repair creates a child attempt and never mutates the terminal attempt.
- `partial` may resume only when its source fingerprint and checkpoint are valid.
- `needs_repair` may repair only findings marked `repairable` and only within
  their allowlisted paths.
- `awaiting_reconciliation` cannot issue a new provider call or debit until its
  reservation/charge outcome is resolved.
- A repair of an existing accepted active version ends at
  `awaiting_approval`, unless the immutable side-effect policy explicitly allows
  auto-activation. Initial user-requested generation may activate after the
  final gate when that policy permits it.
- Every transition uses an optimistic version or fencing token; an update with
  an old version must affect zero rows and be treated as a stale worker.
- A run may have at most one active attempt per tenant and series. A second
  request either deduplicates to it or returns a conflict with the active run ID.

## 9. Generation and repair policies

### 9.1 Standard mode

- Default unit: one episode or the smallest safe configured chunk.
- One author call per unit, with schema/transient retry handled by the existing
  wrapper.
- One targeted repair round for deterministic or alignment failures.
- A second repair requires explicit policy budget and must remain episode-scoped.
- No later unit may be marked complete beyond a missing episode gap.

### 9.2 Premium mode

- Preserve the current Premium compatibility baseline of three candidates per
  chunk and at most four targeted revise rounds unless an explicit tenant/model
  policy selects another value. The selected candidate count and revise limit
  must be copied into the immutable run budget; the implementation must never
  silently change cost or quality behavior while enabling this feature.
- Judge candidates using the existing dramaturgy skill and deterministic score
  floors.
- Parallel candidate calls are allowed only within the immutable
  `maxParallelAgents`/provider concurrency budget; every candidate reserves its
  own unit before launch, and a rejected or abandoned candidate is reconciled
  before the chunk proceeds.
- Revise only the selected failing dimensions.
- Maximum repair rounds are configured per run and per unit, with a hard global
  cap on calls, credits, and wall-clock time.
- The season continuity sweep is a review stage, not proof of completion; any
  affected episode must re-enter validation before final persistence.

### 9.3 Cost and provider failures

- Preflight and reserve the next unit's estimated credits before starting it.
- Reconcile actual provider cost after every successful call.
- If the next unit cannot be funded, stop with `needs_repair`/`partial` and do
  not begin a doomed request.
- Insufficient-credit errors are not blindly retried.
- Transient network, timeout, rate-limit, and upstream failures may retry under
  classified backoff, but every attempt is checkpoint-aware and idempotent.
- Provider errors must preserve the exact failed episode range and provider
  response classification in the run ledger.
- Provider fallback is allowed only when the ordered fallback policy was stored
  in the contract before admission. A fallback changes provider/model metadata
  and cost accounting, but never changes the source, validation, repair, or
  side-effect policy silently.
- If a timeout or transport failure leaves provider charge/outcome unknown, set
  `awaiting_reconciliation` and stop new paid calls for that run. Recovery must
  reconcile provider status and the credit transaction before choosing retry,
  refund, or final failure.

## 10. Durable run and checkpoint persistence

Redis may remain a fast progress cache, but it must not be the only source of
truth for a multi-hour story run. Implement a durable run ledger using the
repository's existing Drizzle/Postgres conventions.

### 10.1 Parent run, episode steps, and artifacts

Use a series-level parent record plus episode-scoped child records. The parent
run is required because the existing Feature 131 episode-run table cannot
represent plan-stage work, a multi-episode target range, or a series-level final
gate without changing its meaning.

This parent run table is an intentional exception to Feature 132's
"no new tables" quality-ledger decision: Feature 132 ledgers and scorecards
remain in their existing JSONB/artifact locations, while Feature 152 adds only
the durable execution/recovery ledger needed for multi-hour generation.

- `vertical_drama_story_generation_runs` (new parent) owns tenant/user/series,
  source snapshot, target range, status, budgets, lease/fencing, and final-gate
  state.
- Existing `vertical_drama_episode_runs` is extended additively with nullable
  `storyGenerationRunId` and reused as child steps for `generate`, `validate`,
  `review`, and `repair` per episode. Existing non-Feature-152 rows remain
  valid and keep their current semantics.
- Existing `vertical_drama_run_artifacts` stores immutable candidate drafts,
  validation reports, alignment ledgers, and repair outputs. Partial candidates
  are artifacts, not active story versions.

For `taskKind: "plan"`, the artifact kind is `plan_candidate`. The parent stores
the candidate artifact ID and, after the plan gate, the accepted plan-version ID.
Deep generation and extension contracts must reference that accepted plan
version/fingerprint; they may not read a plan candidate directly or infer
acceptance from an artifact status alone.

The parent has a database ID plus a public opaque `runKey` used by API, queue,
and Feature 151 correlation. Required parent fields are the contract fields,
status/stage, `checkpointVersion`, `leaseToken`, `leaseExpiresAt`,
`workerGeneration`, `activeAttemptId`, `finalArtifactId`, `activeVersionId`,
credit totals/reservation state, `cancellationRequestedAt`,
`sourcePlanCandidateArtifactId`, `acceptedPlanVersionId`, `finalizationKey`,
`eventCursor`, error classification, and timestamps.

The parent table must have tenant/series/status indexes and a database-enforced
active-run rule equivalent to (using the repository's actual quoted column
names):

```sql
UNIQUE ("tenantId", "seriesId") WHERE status IN
('queued', 'running', 'validating', 'repairing', 'needs_repair', 'partial',
 'awaiting_reconciliation', 'awaiting_approval')
```

The migration must add a tenant/series/status index to the parent, a
tenant/series/run lookup index to episode steps, a tenant-scoped unique
constraint for `runKey`, and a tenant-scoped unique constraint for the request
`idempotencyKey`. A Redis active pointer alone is not an acceptable uniqueness
or recovery mechanism.

### 10.2 Candidate versus active version commit protocol

The current partial behavior appends a breakdown version after earlier chunks
complete. Feature 152 changes this boundary:

1. A completed episode is checkpointed as an immutable candidate artifact and
   marked `unit_validated`; it is not appended to the active `bible` version.
2. The candidate may be displayed as a read-only incomplete preview, clearly
   labelled with its run status, but it cannot drive downstream production,
   provider submission, or canonical memory activation.
3. Only the final gate may transactionally append and activate one complete
   breakdown version, link its source fingerprint and validation report, and
   mark the parent run `succeeded`.
4. If the transaction fails, the candidate remains inspectable and the run is
   retryable; the active version remains unchanged.
5. Resume reads candidate artifacts/checkpoints and the original source snapshot,
   not a partially activated active version.

The final commit transaction must lock or compare-and-set the series row, verify
that the active source version still matches the run contract, insert the new
append-only breakdown version, link the final validation artifact, and transition
the parent run atomically. If the source or active version changed, the
transaction rolls back and the run becomes `failed` with `stale_source`, never a
silent overwrite.

Existing accepted episodes from an earlier active version remain readable. New
episodes from an incomplete run must not be mixed into that active version.

Because credit reconciliation and story-version activation may use separate
storage transactions, finalization uses a durable outbox/saga record keyed by a
`finalizationKey`. The gate first requires every unit to be reconciled, then
commits the version, parent status, and outbox record with one database
transaction; an outbox dispatcher then emits the idempotent activation event. A
crash before activation retries the same key; a crash after activation records
the already-committed result. No path may report `succeeded` from an outbox
enqueue alone.

Each paid episode/unit step also records `providerRequestId` or provider task
ID when available, provider/model, request idempotency key, provider outcome
(`pending`, `accepted`, `rejected`, `unknown`, or `reconciled`), and the credit
reservation/transaction IDs. Provider callbacks or reconciliation responses are
deduplicated by provider ID plus the unit idempotency key; a callback cannot
complete a stale attempt or activate a story version.

### 10.3 Lease, fencing, and queue recovery

Each active attempt has a `leaseToken`, `leaseExpiresAt`, `checkpointVersion`,
and `workerGeneration`. Every progress, checkpoint, artifact, and terminal write
must include the current fencing token in its conditional update. A worker that
loses its lease must stop before making another provider or credit call.
If a lease is lost after a remote provider request was issued, the late response
is treated as an unknown provider outcome and reconciled by unit idempotency key;
it is never written as a fresh candidate by the stale worker.

Queue delivery and durable state are reconciled as follows:

- enqueue is idempotent on `(tenantId, runId, attemptId)`;
- a worker claims a lease before execution and renews it during each bounded
  unit;
- a stalled lease can be reclaimed only after expiry, producing a new worker
  generation;
- a queue retry never creates a second parent run or recharges a committed unit;
- a durable terminal state suppresses late queue completion notifications;
- a periodic reconciler finds queued/running records without a live queue job and
  either re-enqueues them or marks them recoverable according to policy.

Cancellation is cooperative and durable: `cancelStoryGeneration` first records
`cancellationRequestedAt` and prevents any new reservation/provider call. If an
in-flight provider request has an unknown outcome, the run enters
`awaiting_reconciliation`; it becomes `cancelled` only after the provider and
credit ledger are reconciled. A late worker response is reconciled by unit key
and cannot turn the cancelled run into `succeeded`.

Queue and logical retry semantics are separate:

- worker crash/stall may be redelivered against the same checkpoint and fencing
  contract;
- transient network, timeout, rate-limit, and upstream 5xx errors may retry the
  current uncommitted unit within its attempt budget;
- schema/contract failures use the bounded corrective path, then become a stored
  validation finding rather than an invisible queue success;
- insufficient credits, authentication, invalid request, stale source, and
  policy failures do not blind-retry; they transition to an actionable terminal
  or resumable state;
- notifications and feedback tickets are emitted only after the durable state
  transition, so a retry cannot create duplicate user-visible failure records.

The durable record must retain at least:

- run/attempt IDs and parent attempt;
- tenant/user/series IDs;
- source and roster fingerprints;
- status, stage, progress, and timestamps;
- target, completed, missing, and blocked episode numbers;
- checkpoint and checkpoint version;
- validation report and alignment ledger references;
- credits estimated/reserved/used/reconciled;
- provider/model and skill/rule-pack versions;
- error classification and trace IDs;
- final accepted breakdown version, when any;
- cancellation and resume metadata.

Retention must be longer than the Redis six-hour cache, with a default minimum
of 30 days for run state, findings, and candidate lineage unless a stricter
tenant policy applies. Redis expiration must never erase the only user-visible
run outcome. Artifact payload retention may be tiered, but hashes, status,
source fingerprint, errors, and recovery lineage must survive the artifact TTL.
Source/context snapshots and skill/rule-pack manifest checksums must be retained
until the run is terminal and no longer resumable, plus the configured retention
period; an active or resumable run may not be purged merely because its payload
TTL elapsed.

Checkpoint writes must be monotonic and compare-and-set protected. A stale
worker may not overwrite a newer checkpoint or activate a candidate based on an
older source fingerprint.

### 10.4 Credit reservation and reconciliation

`hasEnoughCredits` is only an admission check; it is not a reservation. Reuse the
existing `createCreditReservation`, `drawFromReservation`,
`commitCreditReservation`, and `refundReservation` primitives, but harden their
story-generation integration. The current implementation stores the live
reservation in Redis with a ten-minute TTL and does not by itself provide a
durable run ledger, so Feature 152 must not treat the Redis reservation key as
the only billing truth.

Before each paid unit, the run must acquire an atomic reservation through the
credit service. The reservation must include:

- run/attempt/unit identifiers;
- estimated input/output tokens and provider/model;
- maximum request tokens and fallback policy;
- reserved credits, actual credits, and released remainder;
- an expiration and terminal reconciliation state.

The implementation must pass a deterministic idempotency key such as
`vd-story:${runKey}:${attemptId}:${unitKey}` into the underlying credit
transaction, persist the reservation ID and transaction ID in the durable run
record before the provider call, and include `tenantId`, `runKey`, and `unitKey`
in transaction metadata. The provider call is allowed only after the
reservation succeeds.

All existing story-generation paths that currently call `deductCredits` after a
provider response must migrate to this unit reservation/reconciliation path;
the assurance feature must not leave a parallel non-idempotent billing path for
standard, premium, extend, or repair calls.

The durable billing authority is the existing credit transaction record and its
unique `idempotencyKey`; the Redis reservation is only a live allocation/cache.
If the current reservation helper cannot accept the story unit key, extend the
helper contract before integrating this feature rather than composing a second
best-effort idempotency layer in the story service.

Actual usage is drawn and reconciled exactly once using the same unit key. If
Redis is lost after the upfront deduction, a recovery job must locate the
credit transaction and durable reservation record before retrying or refunding;
it must never create a second reservation by guessing that the first one failed.
The ten-minute reservation TTL must be renewed or bounded to one unit whose
worst-case execution fits the TTL. On provider rejection, timeout, cancellation,
or worker loss, the reservation is either released or reconciled according to
the provider's known charge semantics; the system must not assume that a failed
HTTP request is free. A run cannot continue to the next unit when the
reservation is missing, expired, or unreconciled.

If actual usage reaches the immutable run or side-effect spend ceiling, the
current unit is reconciled and the run stops before starting another paid unit;
it may not borrow budget from a later episode or silently raise the ceiling.
The effective ceiling is the lower of `budget.maxEstimatedCredits` and
`sideEffectPolicy.maxSpend`, and the selected value is recorded in the run
summary and credit ledger.

## 11. API and UI contract

### 11.1 API operations

Extend the existing story-job surface additively with operations equivalent to:

- `getStoryGenerationRun(runId)`;
- `resumeStoryGeneration(runId)`;
- `repairStoryGeneration(runId, findingIds?)`;
- `approveStoryGenerationRepair(runId, attemptId)`;
- `rejectStoryGenerationRepair(runId, attemptId, reason)`;
- `cancelStoryGeneration(runId)`;
- `getStoryGenerationValidation(runId)`.

Existing generate/extend mutations remain compatible but return the durable
`runId` and current status. A duplicate request returns the existing run with a
dedupe indicator.

### 11.2 UI states

The Deep Story Drafts panel must distinguish:

- Planning/plan validation;
- Generating;
- Validating;
- Repairing episode N;
- Waiting for provider/credit reconciliation;
- Complete;
- Incomplete — resume available;
- Needs repair — findings available;
- Awaiting approval — repaired candidate ready for review;
- Rejected — prior accepted story retained;
- Failed — retry blocked or action required;
- Cancelled.

The UI must show requested/completed/missing counts, last successful episode,
repair round, estimated remaining credits, and a stable error summary. A partial
run must persist across reloads and must not rely on a transient React state.

### 11.3 API response and authorization contract

```ts
type StoryGenerationStage =
  | "admission"
  | "planning"
  | "generating"
  | "validating"
  | "reviewing"
  | "repairing"
  | "reconciling"
  | "awaiting_approval"
  | "finalizing"
  | "completed";
```

Every generate/extend/resume/repair response must include a stable shape:

```ts
type StoryGenerationRunSummary = {
  runId: string;
  attemptId: string;
  status: StoryGenerationStatus;
  stage: StoryGenerationStage;
  requestedEpisodeNumbers: number[];
  completedEpisodeNumbers: number[];
  missingEpisodeNumbers: number[];
  blockedEpisodeNumbers: number[];
  sourceFingerprint: string;
  checkpointVersion: number;
  validationReportId?: string;
  resumable: boolean;
  repairable: boolean;
  approvalRequired: boolean;
  impactEpisodeNumbers: number[];
  reconciliationRequired: boolean;
  approvalReason?: string;
  eventCursor: string;
  estimatedRemainingCredits?: number;
  lastErrorCode?: string;
  transportOutcome: "completed" | "accepted_pending" | "action_required" | "rejected";
};
```

Resume and repair procedures must re-check tenant ownership, series ownership,
source fingerprint, status eligibility, and the caller's permission at execution
time. A client-supplied episode list, finding list, or run status is advisory;
the server derives the allowed scope from the stored contract and report.

`approveStoryGenerationRepair` is available only for an `awaiting_approval`
candidate. The server rechecks the active source version, candidate/report
fingerprints, repair-impact closure, tenant authorization, and current fencing
token, then commits activation transactionally. Rejecting or cancelling the
candidate leaves the prior active story unchanged.

`rejectStoryGenerationRepair` records the actor and reason, transitions the
candidate attempt to `cancelled`, and never deletes the candidate evidence or
changes the prior active story. Clients reconnect using `eventCursor`; the
server replays durable events after that cursor and treats an already-applied
approval, rejection, resume, or cancellation as an idempotent response.

At an HTTP boundary, `200` is reserved for a successful read or a run whose
status is exactly `succeeded`; `202` represents accepted work or a resumable
non-success (`queued`, `running`, `validating`, `repairing`, `partial`,
`needs_repair`, `awaiting_reconciliation`, or `awaiting_approval`). Contract or
authorization rejection uses the existing typed `4xx` error mapping. The
transport must also emit `transportOutcome`, and the UI may show a success toast
only when both `status === "succeeded"` and `transportOutcome === "completed"`.
For tRPC or another non-HTTP transport, the same four logical outcomes are
mandatory even if framework error codes differ.

The mapping is deterministic: `succeeded` -> `completed`; queued or actively
running states -> `accepted_pending`; `partial`, `needs_repair`, and either
awaiting state -> `action_required`; `failed` or `cancelled` -> `rejected`.

The read endpoint must distinguish canonical active story content from a
candidate preview. Candidate content is never returned through an existing
production-ready story endpoint without an explicit preview mode.

## 12. Optional OpenAI Agents SDK integration

The initial correctness release must work with the existing Node planning calls
and deterministic validators. The Agents SDK is introduced only after the
durable state and gates are proven.

When enabled through a tenant/task feature flag:

```text
Node admission + StoryGenerationRunContract
        |
        v
Feature 151 AgentTaskContract
        |
        v
Manager: story author / reviewer / repair tools
        |
        v
Typed candidate + trace + findings
        |
        v
Node deterministic final gate
        |
        v
Append-only story version or needs_repair
```

Rules:

1. Use the manager-style orchestration from Feature 151.
2. Agent tools are read-only or candidate-producing by default.
3. Persistence, credit mutation, and activation require Node-owned final-gate
   authorization.
4. Use tool guardrails on every custom candidate/repair tool, and also perform
   Node checks before and after each handoff. Agent-level input/output
   guardrails alone are insufficient for every delegated tool call or handoff.
5. SDK structured output must be parsed into the same candidate schemas; it is
   not a substitute for Node deterministic validation.
6. SDK tracing must correlate to `runId`, `attemptId`, `seriesId`, and tenant,
   with sensitive story/provider payloads disabled or replaced by hashes and
   bounded metadata.
7. Agent turn/tool/repair/token/cost limits cannot be increased by a handoff.
8. Human approval for a repaired story is the Node API/final-gate operation,
   not an SDK approval event alone.
9. If the Agent SDK runtime is unavailable, the run fails safely or uses the
   explicitly configured non-agent fallback; it must not silently downgrade the
   final gate.

## 13. Security and tenancy

1. Every run, checkpoint, finding, candidate, and repair must carry tenant and
   user scope.
2. Source draft, character, location, and memory context must be tenant-scoped
   before prompt assembly.
3. A repair may read only the source snapshot and evidence authorized for its
   parent attempt.
4. Prompt content, story text, and provider payloads must be redacted according
   to existing audit/logging policy; log hashes and bounded metadata instead.
5. A stale or cross-tenant fingerprint must fail closed.
6. No agent may receive arbitrary database, filesystem, shell, or provider tools.
7. User-authored premise, draft text, and provider responses are untrusted data;
   they cannot modify system/skill instructions, tool scope, or state transitions.
8. Durable run retention and deletion must follow existing tenant deletion and
   immutable audit policies.

## 14. Observability and audit

The run dashboard and audit records must expose, by tenant, series, mode, and
skill version:

- first-pass completion rate;
- partial/non-success rate;
- missing-episode distribution;
- deterministic finding rate by code;
- alignment pass rate and unresolved-beat rate;
- repair rate and repair success rate;
- average and p95 duration;
- estimated versus actual credits;
- provider/model failure rate;
- duplicate/dedupe/resume counts;
- agent turns/tool calls when Agent SDK mode is enabled;
- stale checkpoint and run-reconciliation count.

All events must reference the same `runId` and `attemptId`. A normal audit event
must not use status 200 to represent a partial or incomplete result.

Required event vocabulary:

| Event | Required meaning |
|---|---|
| `vertical_drama_story_run_created` | Contract admitted and source snapshot captured |
| `vertical_drama_story_unit_started` | One episode/chunk began after credit reservation |
| `vertical_drama_story_unit_checkpointed` | Candidate unit passed its configured unit gate |
| `vertical_drama_story_validation_failed` | Deterministic or semantic findings block acceptance |
| `vertical_drama_story_repair_started` | Child repair attempt began with allowlisted scope |
| `vertical_drama_story_repair_completed` | Repair candidate was revalidated |
| `vertical_drama_story_reconciliation_required` | Provider or credit outcome is unknown; new paid work is blocked |
| `vertical_drama_story_approval_required` | Repaired candidate passed validation but awaits explicit activation approval |
| `vertical_drama_story_approved` | Explicit repair approval passed the fresh final-gate transaction |
| `vertical_drama_story_partial` | Requested scope remains incomplete; never HTTP 200 success |
| `vertical_drama_story_succeeded` | Final gate and active-version transaction both committed |
| `vertical_drama_story_failed` | No safe continuation remains |
| `vertical_drama_story_resumed` | A valid checkpoint was resumed |

Each event records `runId`, `attemptId`, `tenantId`, `seriesId`, source
fingerprint, stage, episode scope, status before/after, provider/model, skill
versions, reservation ID, actual credits, trace ID, and a redacted error/finding
summary, actor, reason code, contract hash, output hash, and event cursor. Event
writes are best-effort only for user flow, but the durable run state transition,
event cursor, and credit reconciliation are not best-effort.

## 15. Testing and evaluation

### 15.1 Contract and validator tests

- Missing episode after a successful earlier chunk becomes `partial`, never
  `succeeded`.
- Nine-shot omission, duplicate episode, unknown character, unknown location,
  invalid speaker, and source fingerprint mismatch are blocking findings.
- Required beat coverage is measured by stable beat IDs and evidence shots.
- A repair that changes a non-targeted immutable field is rejected.
- A stale worker cannot regress a checkpoint or activate an old candidate.

### 15.2 Job and credit tests

- Worker crash resumes from the last checkpoint without double charging.
- Logical provider/schema failure records the right failed episode range.
- Insufficient credits stop before the next paid call.
- Redis loss after reservation does not create a second reservation or charge;
  recovery reconciles the durable credit transaction by its idempotency key.
- Duplicate enqueue returns the same active run.
- Redis loss does not erase the durable status.
- Cancellation and resume are idempotent.
- Cancellation during an in-flight provider request enters reconciliation and
  cannot become `cancelled` or `succeeded` until the provider/credit outcome is
  known.

### 15.3 Skill and agent tests

- Every skill output is schema-valid and contains no private reasoning.
- Reviewer output cannot override deterministic findings.
- Repair is limited to allowlisted paths and episode scope.
- Agent budget exhaustion becomes a stable blocked result.
- Cross-tenant evidence and tool access are rejected.
- Contract-hash mismatch, revoked manifest, unsupported reader version, and
  budget expansion through a handoff are rejected before candidate acceptance.
- A mixed or missing Feature 132 `criteriaVersion` in a story-generation
  consumer is rejected by the agreement/contract test before strict mode.
- Feature-flag-off behavior preserves the existing non-Agent call contract except
  for the new truthful status gate.

### 15.4 Golden fixtures and replay

Add fixtures for:

- complete 10-episode story;
- missing middle episode;
- malformed nine-shot response;
- wrong character spelling and speaker;
- unresolved pressure thread;
- key beat absent from all shots;
- valid phone/off-screen representation;
- insufficient credits after earlier completed units;
- provider timeout after checkpoint;
- repair introducing regression;
- stale source version and duplicate resume.

Replay must compare final status, missing episodes, findings, repair paths,
credit calls, and append-only version behavior—not only generated prose.

### 15.5 Persistence, migration, and concurrency tests

- The parent run schema has tenant/series indexes and rejects a second active
  run for the same tenant/series.
- A stale lease/fencing token cannot update progress, write an artifact, deduct
  credits, or activate a version.
- Two workers racing to finalize the same candidate result in exactly one active
  version and exactly one `succeeded` transition.
- A partial candidate is visible in the run/artifact view but absent from the
  active story version and downstream production queries.
- A failed migration preflight leaves existing Redis jobs, legacy bibles, and
  active story versions unchanged.
- Backfill is idempotent: running it twice creates no duplicate parent runs,
  beat IDs, artifacts, or credit records.
- Deleting a tenant or series removes run-owned artifacts according to the
  existing retention policy without deleting immutable billing/audit records.
- A property/fault test covers crash points before reservation, after provider
  response, after credit reconciliation, after checkpoint, and during final
  version activation.
- `awaiting_reconciliation` cannot issue a duplicate provider call or credit
  debit, and recovery resolves it by provider/credit idempotency key.
- A repair of an accepted story reaches `awaiting_approval` and cannot activate
  until the explicit approval transaction passes a fresh source check.
- Plan candidates cannot be consumed by deep generation before their plan gate
  commits them as the accepted source snapshot.
- A stale or revoked skill manifest cannot be used to resume an existing run.
- A finalization crash before or after the database commit is recovered by the
  same `finalizationKey` without a second active version.

## 16. Rollout plan

### 16.0 Migration preflight and rollback contract

Before any production schema write:

1. Inspect `information_schema`, the Drizzle migration ledger, and existing
   Feature 131 run-table constraints.
2. Confirm the parent run table, indexes, enum/check constraints, and any
   `vertical_drama_episode_runs` extension are absent or exactly compatible.
3. Confirm the active Redis pointer format and reconcile live jobs into durable
   records without marking unknown jobs successful.
4. Apply only the named migration, then verify columns, indexes, foreign keys,
   active-run uniqueness, and representative tenant-scoped queries.
5. Backfill only metadata that can be derived deterministically. Do not invent
   historical success, credit reservations, validation reports, or beat coverage.

The migration must be additive and reversible by disabling the feature flag and
stopping new assurance-run admission. It must not delete legacy
`episodeBreakdown`, `breakdownVersions`, Redis records, audit events, or active
story versions. A rollback must leave accepted canonical versions readable and
candidate artifacts inspectable. Dropping the new tables is not an automatic
rollback operation.

Required feature flags:

| Flag | Default | Purpose |
|---|---:|---|
| `verticalDramaStoryGenerationAssurance` | `false` | Durable status, snapshot, candidate gate, and resume/repair workflow |
| `verticalDramaStoryGenerationAgents` | `false` | Feature 151-backed Agent SDK shadow/active adapter |
| `verticalDramaStoryGenerationStrictAlignment` | `false` | Turn plan-alignment warnings into blocking findings after backfill readiness |

The assurance flag is a prerequisite for the Agents flag. Both must fail closed
when the parent tenant/series gate or runtime health check is unavailable.
Strict alignment also requires the Feature 132 ledger/scene/continuity flags and
the matching `qualityCriteriaVersion` to be enabled for the target tenant; if
they are disabled, the run remains compatibility-mode and cannot claim strict
alignment success.

### Phase 0 — Read-only telemetry

- Add run correlation, source fingerprints, and completion/missing metrics to the
  current pipeline.
- Build a production read-only report of partial runs by series and root cause.
- Do not change generation behavior or spend additional credits.

Exit: production inventory and baseline metrics are available.

### Phase 1 — Truthful completion contract

- Persist durable run state and checkpoints.
- Stop emitting success for partial/incomplete output.
- Add Resume/Repair status and API response fields.
- Add per-unit credit reservation/reconciliation and classified logical failure
  handling.
- Keep partial candidates out of the active breakdown version.

Exit: all incomplete test fixtures remain resumable and never become success.

### Phase 2 — Deterministic and alignment assurance

- Add rule packs and `StoryPlanAlignmentLedger`.
- Add author output validation and targeted repair.
- Update the full-story skill contract to match the actual bounded loop.

Exit: golden fixtures pass with no critical unresolved finding accepted.

### Phase 3 — Premium policy correction

- Make candidate/rejudge/revise/sweep counts explicit budgets.
- Require final revalidation after every premium repair or continuity sweep.
- Compare cost, duration, completion, and repair success against Phase 1.

Exit: premium does not silently retain a pre-repair candidate when a critical
finding remains.

### Phase 4 — Agents SDK shadow/A-B rollout

- Run the Feature 151-backed story adapter in shadow mode first.
- Compare candidate quality, alignment findings, cost, latency, and failure rate.
- Enable active mode for selected tenants or new series only.
- Roll back by disabling the task flag; preserve run history and accepted
  versions.

Exit: Agent mode is no worse than the deterministic baseline on completion,
critical-finding, cost, and resume metrics.

## 17. Implementation file map

The target ownership and file names are fixed below; implementation may add
small adjacent test/contract files without moving authority between layers:

### Node/TypeScript

- `apps/web/server/services/verticalDramaStoryBible.ts`
  - output contracts, deterministic validators, alignment ledger, bounded repair
    orchestration, and result status.
- `apps/web/server/services/verticalDramaStoryGenerationRun.ts` (new)
  - parent-run repository, state transitions, source canonicalization, lease
    fencing, candidate commit protocol, and credit reconciliation coordination.
- `apps/web/server/routers/verticalDramaSeries.ts`
  - run admission, source snapshot, API operations, final gate, and persistence.
- `apps/web/server/services/verticalDramaStoryJobs.ts`
  - durable-run integration, monotonic checkpointing, resume, cancellation, and
    classified queue behavior.
- `apps/web/server/services/verticalDramaQualityLoop.ts` and
  `apps/web/server/services/verticalDramaQualityCriteria.ts`
  - route accepted-story critique/repair through the same candidate, approval,
    criteria-version, and final-gate contract without duplicating validators.
- `apps/web/shared/verticalDramaSeries/` (targeted additions)
  - canonical contract and status types shared by server/client.
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaDeepStoryDraftsPanel.tsx`
  - truthful status, persistent incomplete state, Resume/Repair controls.

### Persistence and configuration

- `apps/web/drizzle/schema.ts`
  - parent story-generation run table, required indexes/constraints, and the
    parent reference or compatible extension for episode steps.
- `apps/web/drizzle/manual_vertical_drama_story_generation_assurance.sql`
  - additive production migration, only if the schema preflight confirms it is
    required; include the active-run uniqueness and tenant indexes.
- `apps/web/shared/featureFlags.ts`
  - the three Feature 152 flags and their fail-closed defaults.
- `apps/web/client/src/components/admin/tenantFeatureFlagGroups.ts`
  - admin visibility for the assurance and Agents SDK rollout flags.
- `docs/runbooks/vertical-drama-story-generation-assurance.md` (new)
  - migration preflight, stuck-run reconciliation, credit reconciliation,
    rollback, and production read-only investigation procedures.

### Skills

- `apps/web/skills/vertical-drama-full-story-architect/skill.md`
  - update contract/version and remove stale completion assumptions.
- `apps/web/skills/vertical-drama-story-plan-alignment-reviewer/` (new)
  - manifest, prompt, input/output schemas, examples, and tests.
- Existing quality-controller and dramaturgy skills remain versioned and are not
  silently merged into the author skill.

### Feature 151 runtime adapter

- Extend the existing Feature 151 task-kind registry and contract mapping for
  `vertical_drama_story_generation`.
- Reuse existing Node/Python adapter, tracing, budgets, and final-gate tokens.
- Do not add a new SDK import path in the story service.

### Tests and fixtures

- `apps/web/server/services/__tests__/verticalDramaStoryBible*.test.ts`
- `apps/web/server/routers/__tests__/verticalDramaSeries*.test.ts`
- `apps/web/server/services/__tests__/verticalDramaStoryJobs*.test.ts`
- shared contract/alignment fixtures;
- skill manifest/schema fixture tests;
- Agent SDK shadow/replay tests in the existing Feature 151 test surface.

## 18. Risks and trade-offs

| Risk | Mitigation |
|---|---|
| More validation increases latency | Deterministic checks first; review only compact digests; repair only failed units |
| More repair rounds increase credits | Hard per-run/per-unit budgets and preflight before every paid call |
| Durable ledger adds schema/ops work | Reuse existing job/audit conventions and keep Redis as cache, not truth |
| Stable beat IDs require migration for legacy plans | Support text-only legacy mode with lower confidence, then backfill IDs |
| Agents SDK output drifts from current Node behavior | Shadow/A-B rollout, shared contracts, and Node final gate |
| More explicit failure states expose old incomplete work | This is intentional; provide Resume/Repair and clear user messaging |
| A reviewer can over-correct creative intent | Immutable source snapshot, allowlisted repair paths, and regression checks |

## 19. Acceptance criteria

1. A run with any missing requested episode cannot reach `succeeded`.
2. A run with an unresolved critical structural, identity, continuity, or plan
   alignment finding cannot reach `succeeded`.
3. Partial output is persisted as a durable non-success state with missing
   episode numbers, reason, checkpoint, and Resume/Repair action.
4. Reloading the page preserves the exact run state without depending on a
   transient client banner or an unexpired Redis record.
5. Resuming a run does not regenerate or recharge completed accepted episodes.
6. Every accepted version records its source fingerprint and validation report.
7. Every repair records parent attempt, targeted paths, findings, output hash,
   and fresh validation result.
8. Standard and Premium modes enforce explicit maximum calls, repair rounds,
   wall-clock time, and estimated credits.
9. Insufficient-credit and non-retryable provider failures stop before a doomed
   next call and expose an actionable state.
10. Skill output is treated as a candidate; deterministic Node validation remains
    the authority for acceptance.
11. Feature 151's Agent SDK runtime is reused when enabled, with no direct
    frontend-to-Python or agent-to-database path.
12. Production dashboards can identify affected series, run, episode range,
    provider/model, error class, and final recovery outcome.
13. Feature-flag-off regression tests pass for existing valid story generation,
    while the truthful non-success status contract remains enforced.
14. The parent run and episode-step persistence has tenant scope, active-run
    uniqueness, lease/fencing, monotonic checkpoint, and idempotent finalization.
15. Partial and repair candidates never become active breakdown versions or
    downstream production inputs before the final gate commits.
16. Every paid unit has an atomic reservation and exactly-once reconciliation;
    failed requests are not assumed to be free.
17. `generateStoryBible`, `generateStoryBibleDeep`, `extendStoryDraftHorizon`,
    and repair share the same source snapshot and status contract; no stage can
    silently consume a stale or partially written plan.
18. Legacy plans receive deterministic compatibility snapshots and explicit
    derived-beat confidence; strict alignment mode is not enabled before the
    backfill/readiness gate passes.
19. Migration preflight, additive migration verification, backfill idempotency,
    and feature-flag rollback are covered by focused tests and runbooks.
20. Premium compatibility defaults (three candidates and up to four revise
    rounds) are preserved unless an explicit policy changes them and records the
    resulting budget.
21. User-authored story text cannot expand skill instructions, tool permissions,
    tenant scope, or run-state transitions.
22. Run status and recovery lineage survive Redis expiry for the configured
    retention period.
23. Each run records the rule-pack versions, thresholds, warning policy, and
    context-pack fingerprint used by its final gate; blocking findings cannot be
    waived by an aggregate score.
24. Repair validation includes the computed neighboring-episode impact closure
    and stops when the configured impact budget is reached with an actionable
    non-success state.
25. Provider/credit uncertainty enters `awaiting_reconciliation` and cannot
    trigger a blind retry or second debit.
26. A repair of an accepted active story requires explicit approval before
    activation unless the immutable side-effect policy explicitly allows auto-
    activation.
27. `generateStoryBible` persists a gated plan candidate; deep generation and
    extension cannot consume a failed, stale, or partially written plan.
28. Feature 151 adapter execution echoes and verifies the canonical
    `contractHash`, maps domain waiting states correctly, and cannot increase
    any runtime budget through a handoff.
29. Client reconnect/replay uses a durable event cursor and does not create a
    duplicate run, attempt, provider call, credit mutation, or finalization.
30. Active/resumable runs retain all fingerprinted source snapshots and signed
    skill/rule-pack manifests until terminal retention expiry.
31. Partial, repair, reconciliation, and approval-required responses expose a
    non-completed transport outcome and cannot trigger the existing success
    toast from HTTP status alone.
32. Feature 132 flag/criteria-version snapshots are stored per attempt, and
    legacy quality-loop or `applySeasonCritique` writes cannot bypass the
    candidate, approval, alignment, and final-gate contract.

## 20. Definition of done

- Phase 1 and Phase 2 acceptance criteria pass in focused tests.
- Existing story generation, extend, and review flows have no unauthorized
  cross-tenant or credit regressions.
- Local replay fixtures cover provider, schema, continuity, alignment, repair,
  resume, and stale-worker failures.
- Production read-only baseline is captured before enabling active Agent mode.
- Agent mode is disabled by default until shadow comparison passes.
- The final implementation diff is limited to the ownership map above and does
  not rewrite unrelated dirty worktree files.

## 21. Source references

- Feature 132: `specs/feature/132-vertical-drama-story-character-quality-engine/spec.md`
- Feature 150: `specs/feature/150-vertical-drama-prompt-orchestra-semantic-verification/spec.md`
- Feature 151: `specs/feature/151-unified-agent-output-assurance-orchestra/spec.md`
- OpenAI Agents SDK overview: https://openai.github.io/openai-agents-js/
- OpenAI Agents SDK guardrails: https://openai.github.io/openai-agents-js/guides/guardrails/
- OpenAI Agents SDK tracing: https://openai.github.io/openai-agents-js/guides/tracing/
- OpenAI Agents SDK orchestration: https://openai.github.io/openai-agents-js/guides/agents/
