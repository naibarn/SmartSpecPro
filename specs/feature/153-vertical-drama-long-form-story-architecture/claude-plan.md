# Feature 153 Implementation Plan

## 1. Implementation strategy

Implement this as an additive vertical slice on top of Feature 152. The first
release should prove the contracts and deterministic replay with existing JSON
storage and memory events/snapshots. The relationship graph revision,
fingerprint, readiness state, and reverse dependency index are mandatory even
in this phase; JSON/event/snapshot storage is acceptable only when it exposes
the same atomic and indexed contract. Add normalized domain tables where
checkpointing, approval, indexing, or retrieval proves that JSON projection is
insufficient. This limits migration risk without leaving graph persistence as
an indefinite decision.

The implementation order is:

```text
shared contracts -> blueprint admission -> reverse planning/ledgers
  -> memory/retrieval/checkpoints -> cast/world/look contracts
  -> block generation/resume -> closure/repair/final gate
  -> router/UI/observability -> migration/backfill/proof
```

Node/TypeScript remains authoritative. Skills and optional Agents SDK roles
return typed proposals only. All proposals pass schema, source fingerprint,
tenant, budget, ledger, and Feature 152 final-gate checks before persistence.

## 2. Codebase ownership map

| Area | Existing owner | Planned additive work |
|---|---|---|
| Shared contracts | `apps/web/shared/verticalDramaSeries/storyControl.ts`, `draftStoryDesign.ts`, `qualityLedgers.ts`, `seriesMemoryState.ts`, `contracts.ts` | Long-form blueprint, mystery closure, lifecycle, capability, look, retrieval, and mode contracts |
| Story architecture | `apps/web/server/services/verticalDramaStoryBible.ts` | Reverse-plan and block context integration; preserve existing skill calls |
| Memory | `apps/web/server/services/verticalDramaSeriesMemoryProjection.ts` | Event kinds, arc/block snapshots, retrieval pack, retcon approval |
| Quality | `apps/web/server/services/verticalDramaQualityLedgerReconcile.ts` | Cross-ledger closure checks and new finding codes |
| Generation runtime | `verticalDramaStoryGenerationContracts.ts`, `verticalDramaStoryGenerationValidation.ts`, `verticalDramaStoryGenerationRepair.ts`, `verticalDramaStoryGenerationRuntime.ts`, `verticalDramaStoryJobs.ts` | Add hierarchy/checkpoint/closure references; preserve fencing and candidate rules |
| Cast/visual | `verticalDramaCharacterVariantPlanner.ts`, `verticalDramaCharacters.ts`, character visual-bible/continuity services | Lifecycle admission and cue-driven look reconciliation |
| Relationship graph | `contracts.ts` (`VerticalDramaRelationship`), `seriesMemoryState.ts` (`VdRelationshipState`), character/cast services | Canonical family/faction/social graph, disclosure/knowledge timeline, user map, and graph-aware repair |
| Router/UI | `apps/web/server/routers/verticalDramaSeries.ts` and existing assurance panel/status surfaces | Blueprint, block, relationship graph/path diagnostics, memory diagnostics, closure review, and approval operations |
| Duration/export | `durationProfiles.ts`, `assembly.ts`, `verticalDramaProductionEpisodeAssembly.ts` | Explicit 90s quality profile/config; preserve legacy 60s and grouping |
| Persistence | `apps/web/drizzle/schema.ts` and manual/Drizzle migrations | First prefer existing series JSON + memory tables; add checkpoint/ledger tables only after preflight |

## 3. Contract and versioning decisions

Add a `longForm` versioned member to the Feature 152 source snapshot and run
contract. It must contain `blueprintId`, `blueprintFingerprint`, `mode`,
`requestedEpisodeCount`, `recommendedEpisodeCount`, `episodeDurationSeconds`,
`arc/block scope`, `memory snapshot refs`, `cast/world/look fingerprints`,
`relationshipGraphFingerprint`, relationship-redaction policy
version/fingerprint, `retryPolicyFingerprint`, `sloPolicyFingerprint`,
optional benchmark finalization reference, and
`closure policy version`. The benchmark reference becomes required before
candidate activation. These fields must be a
typed `longForm` extension, not unvalidated values hidden in a generic
constraints map. A repair is always a child attempt.

Stable IDs must be deterministic and source-scoped: blueprint, arc, sub-arc,
block, episode contract, mystery, lifecycle, look, world rule, and evidence
IDs. Legacy text-only beats receive derived IDs and reduced confidence exactly
as Feature 152 specifies; they must not be treated as authored truth.

Contract validators must distinguish malformed, missing, stale, unsupported,
unresolved, and user-approved states. Warning policy is selected in the
immutable run contract and cannot be changed by an agent.

The draft-stage contract must add `relationshipGraphRevisionId`,
`relationshipGraphFingerprint`, `relationshipGraphReadiness`,
`relationshipDependencyIndexFingerprint`, and unresolved relation questions.
The `generateStoryBible` persistence seam must also ensure architecture,
`storyDesign`, `storyControlSeed`, and graph are one source revision; retaining
an optional client-provided field is not sufficient for strict readiness.
Episode contracts must carry required edge IDs and dependency refs. Strict
episode output uses typed add/update/reveal/end/retcon graph deltas; the legacy
`relationship_changes` pair state is derived after graph acceptance.

## 4. Runtime flow

The implementation must wire the existing draft path end-to-end:

```text
create/update -> generateStoryBible -> draftStoryDesign/storyControl/storyArchitecture
  -> relationship graph readiness/fingerprint gate
  -> generateStoryBibleDeep or extendStoryDraftHorizon
  -> typed relationshipGraphDelta + legacy memory projection
  -> dependency index -> repair/closure/finale gate -> approval
```

No deep, extend, premium revise, resume, or repair path may bypass the graph
revision or use a stale graph fingerprint.

### Admission

Load the owner/tenant/series and accepted source, resolve target count and
duration profile, recommend quality or extended mode, estimate cost/time, and
create an immutable blueprint candidate. Reject only when source, budget,
credits, or policy cannot safely admit the requested scope.

Admission also persists a versioned SLO envelope: bounded block concurrency,
estimated author/review/repair calls, maximum repair rounds, wall-clock range,
credit reserve/ceiling, checkpoint/context budget, and partial/abort behavior.
The values are immutable for a run and visible before paid work.

The 90-second profile is a registered 9-shot vector with exact sum, speech
bands, and production-manifest compatibility. Season-plan generation is staged
into interval-complete, resumable skeleton chunks before shot authoring; a
single large story-bible response is not an accepted path for 120–1000
episodes. Strict Feature 153 runs publish candidate revisions only and use
viewpoint-scoped retrieval to prevent secret knowledge leakage.

The duration adapter must map to the existing `VerticalDramaDurationPlan` and
assembly logical/render segment fields, with a test proving that a legacy
60-second plan cannot be mixed into a strict 90-second run. Plan chunks default
to 10 episodes, max 20, zero overlap, contiguous coverage, deterministic
idempotency keys, and at most two paid retries after provider/credit
reconciliation.

Strict mode also resolves the existing `contentBudget.ts` and
`dialogueQuality.ts` helpers into the episode/per-shot speech contract. The
legacy optional speech flag remains compatible only for old series.

The blueprint pins Feature 151/152 contract versions, provider/safety policy,
locale, relationship vocabulary fingerprint, and relationship-redaction policy
version/fingerprint. The retry matrix distinguishes
deterministic, transient, unknown-outcome, stale-fence, and credit failures;
only the allowed classes consume retry budget. The strict baseline is one
schema-correction retry, two transient-provider retries, two paid plan-chunk
retries, and at most three outer repair rounds per work unit; provider
continuation calls inherit Feature 152's pinned ceiling and count against
SLO/credits without increasing retry allowance. Any override gets a new
retry/SLO policy fingerprint before admission.

### Planning

Generate the blueprint and reverse-planned arc/sub-arc/block schedule through
the existing skill system. Node validates interval coverage, central mystery
closure dependencies, thread ownership, advantage schedule, cast lifecycle,
world rules, look cues, and provider-neutral capability tags. Persist a
candidate; require approval/activation rules from Feature 152.

Expose plan-chunk generation/progress separately from shot-block generation so
large horizons never depend on one `generateStoryBible` response.

The blueprint also emits an engagement-health schedule and anti-drift policy
for hook/reversal/tactic/location repetition, curiosity, and character agency.
These are evaluated over the full accepted horizon, not only per episode.

Resolved baseline thresholds are persisted before paid generation: no repeated
objective/obstacle/cliffhanger signature within three episodes without
escalation, no more than two consecutive same-location/tactic episodes without
state change, and a meaningful self-directed decision for each active
core/recurring character within its configured window. Cast-density defaults
are also materialized in the run contract.

### Block authoring

Generate one bounded block, normally 5–10 episodes. Each episode receives a
bounded context pack with immutable anchors, current arc/block state, targeted
memory, adjacent obligations, required characters/looks/world rules,
relationship edges with disclosure/known-by state, and the episode contract.
Checkpoint after every accepted episode and before the next paid call.

Apply executable cast-density limits at block admission and gate: active cast,
new introductions, guest frequency, dialogue owners, meaningful actions, and
visual-asset load are all versioned policy fields.

### Review and repair

Run deterministic structure/identity/timeline/ledger/look/world checks first,
then alignment and dramaturgy skills. Repair only finding paths plus computed
neighbor impact closure. Revalidate the candidate and retain accepted prior
blocks. No direct active JSONB write is allowed.

### Gates

Pass a block gate, write memory snapshot, then pass an arc gate before the next
arc. The final gate requires full requested coverage, central mystery closure,
thread/consequence closure, advantage consistency, relationship-graph
consistency, cast/guest payoff, world rules, look continuity, safety,
source/credit/provider reconciliation, and Feature 152 activation semantics.

## 5. Memory implementation

Extend the existing `VdSeriesMemory` projection without breaking its current
reader. Episode memory remains the minimal compatible unit. Add event payload
schemas for arc state, block checkpoint, mystery evidence, character lifecycle,
world rule use, advantage beat, look transition, and approved retcon.

Use `vertical_drama_memory_events` as append-only history and
`vertical_drama_memory_snapshots` for compact, checksummed arc/block packs.
Writes must be transactionally scoped by tenant/user/series, use row locking or
equivalent optimistic concurrency, and preserve `userEdited`. Retrieval must
return IDs, source paths, omitted paths, token estimate, policy version, and
fingerprint. A malformed optional episode block degrades to deterministic recap
but cannot erase canonical state.

Compaction is verified as a lossless cache operation. Replay must preserve
required truth IDs, evidence, graph/disclosure state, unresolved threads,
costs, look/world limits, and retcon lineage; pre/post fingerprints are stored
and a mismatch blocks retrieval. Source, locale, genre, duration, horizon,
policy, or graph changes fence dependent chunks and blocks.

Reuse Feature 152's story-job lease, heartbeat, fence, cancellation request,
checkpoint, and resume repository. Add the Feature 153 watchdog rule that
fences expired workers and turns stale work into resumable partial or
reconciliation state. Persist a model/pricing snapshot and hard spend ceiling;
stop before unapproved over-budget calls.

## 6. Cast, world, and look implementation

Add pure relationship-graph and lifecycle validators first. The graph must
normalize family, marriage, in-law, faction, friend, acquaintance, rival, and
knowledge/disclosure edges with episode validity, provenance, and evidence.
Derived edges retain their source edge IDs and cannot invent blood relations.
An edge contradiction expands repair impact to affected characters, family or
faction groups, every episode/dialogue/state field that uses it, memory, and
recap/cliffhanger neighbors. The user-visible graph links each edge to evidence
and opens bounded repair against the candidate/active diff. Graph retrieval
returns bounded filtered pages and an aggregate candidate/active diff; pair
inspection also returns bounded, explainable direct/derived/multiple relationship paths
for the selected episode with truncation and viewpoint/permission redaction;
ambiguous paths are findings, never silently normalized edges.

Lifecycle admission should reference existing
`characterKey` and visual-bible rows. New characters are persisted through the
existing character router/service, not by the script agent. Guest validation
requires seed/evidence or valid uncertainty/world rule, bounded knowledge,
protagonist agency, and payoff/exit/sequel-hook state.

The world rule validator checks origin, capability, limit, cost, user scope,
visual signature, and escalation. Capability tags are passed to provider/model
policy and may return supported, fallback, unavailable, or blocked.

The look ledger references `variantType: "outfit"` where an asset variant is
needed. It requires an episode/scene cue, preserves identity, and carries
continuity state. Existing scene/frame QC remains the final visual evidence
consumer.

## 7. Agents SDK integration decision

Do not introduce an SDK dependency as the first implementation slice. First
make the domain contracts and deterministic block loop work with the existing
skill executor and Feature 151 adapter. When the flag is enabled, use the
already-established adapter to expose bounded planner/author/critic/repair
roles. Use SDK guardrails/tracing as supplemental checks/telemetry only; never
as the final-gate or canonical-memory authority.

Credits are reserved per plan chunk/block work unit. Retries reuse the same
idempotency key; unknown provider outcomes are reconciled before another paid
attempt, and accepted work is never charged twice.

## 8. Database and migration plan

Phase A uses existing `vertical_drama_series.bible`/`memory`, memory events,
and snapshots for versioned payloads plus the existing assurance/run records.
Before Phase B normalized tables, preflight Drizzle metadata, constraints,
tenant indexes, and manual character-table migration lineage. Graph revision
and dependency-index persistence is mandatory; Phase A may use existing JSON
plus event/snapshot storage only if it provides atomic revision/checksum and
lookup semantics. If row-level lookup is required, add the normalized
blueprint/arc/checkpoint/look/lifecycle/relationship-graph-revision tables with
immutable source revision, tenant/user/series scope, status, checksum, and
idempotency keys.

Backfill must derive only from existing story control, draft design, episode
breakdown, memory, and ledgers. Mark all derived IDs and confidence. Shadow
closure reports are read-only until approved.

## 9. UI/UX contract

### User/job

The series creator needs to know whether a long story is complete, what block or
arc is pending, why a mystery/cast/look is blocked, what it will cost, and which
safe Resume/Repair/Approve action is available.

### Surfaces

- Series generation setup: target count, duration, recommended quality/extended
  mode, estimated time/credits, and quality disclaimer.
- Long-form progress: episode/block/arc coverage, checkpoint, current status,
  unresolved findings, cast/look/world counts, and resume action.
- Closure review: central mystery chain, open threads, advantage timeline, late
  guest explanation, wardrobe cues, and final gate result.
- Candidate approval: source/fingerprint diff, impact closure, cost, and approve
  or reject action.

Graph and memory diagnostics apply tenant, permission, and viewpoint redaction
before returning secret edges, evidence, or known-by facts. A redacted finding
may expose that a repair is needed without exposing the hidden payload.

The router contract includes `getCharacterRelationshipGraph` as the canonical
read operation for the user map. It accepts episode or episode-range,
family-side/group, faction, relation-type, status, disclosure, arc, cursor,
page-size, and optional candidate-graph revision filters. The server clamps
page size to the contract maximum, returns `nextCursor`/`truncated`, redacted
edge/evidence counts, policy lineage, and an aggregate candidate-versus-active
diff without returning secret IDs. Partial/timeline UI loading must use this
bounded operation; it must not fetch the entire 500-episode graph into the
browser. Pair-path inspection remains a separate bounded operation layered on
the same policy fingerprint.

The graph validator also enforces self-edge, inverse/cardinality, parent-cycle,
and belief-state-versus-canonical-truth invariants. Pause/cancel/resume APIs
preserve checkpoints, reject late callbacks, and reconcile unused or unknown
credits.

Persist pause versus cancel as a typed control request separate from terminal
status; if the existing cancellation-only field cannot represent this safely,
use one approved additive migration rather than an undocumented status string.

Activation performs durable read-back before success. Horizon extension creates
a new candidate and re-plans terminal closure/arc exits. Every AC row has a
primary section owner and proof label in the traceability manifest.

The closure/review response persists the typed human benchmark result,
including sampled episode IDs, per-dimension 95% intervals, agreement,
adjudication artifacts, confidence status, result fingerprint, and
comparable-label eligibility; final activation reads this same reference back,
and the UI must not infer eligibility from the aggregate score alone.

Reviewer submission and adjudication use tenant-scoped blind sessions and
immutable artifacts. A candidate cannot activate until the exact benchmark
result/finalization reference is attached to the typed `longForm` extension.

### State matrix

| State | Required behavior |
|---|---|
| Loading/running | Show current block and non-blocking progress; disable duplicate start |
| Partial | Show missing episodes/checkpoint/reason/cost; Resume is primary action |
| Needs repair | Show finding severity, affected scope, Repair action; never success toast |
| Awaiting approval | Show candidate vs active version and explicit Approve/Reject |
| Blocked | Show exact missing evidence/owner/cue/rule and edit/retry path |
| Succeeded | Show coverage and closure evidence; allow review/export |
| Empty legacy | Explain lower-confidence compatibility/backfill option |

### Responsive/accessibility/copy

Use existing product tokens/components and Thai/English localization. Tables
must collapse to cards on narrow screens. Keyboard focus, semantic headings,
labels, contrast, screen-reader status, and reduced-motion behavior are
required. Browser proof is required for changed surfaces; if not run, record it
as unperformed rather than infer success from unit tests.

## 10. Testing and proof order

1. Shared contract/normalizer/ledger fixtures.
2. Relationship graph normalization, timeline/disclosure/knowledge, user-map
   diff, bounded graph retrieval filters/cursors/page-size, redacted counts,
   candidate-active aggregate diff, and graph repair-impact tests.
3. Memory fold, snapshot, retrieval, concurrency, and retcon tests.
4. Blueprint/arc/block and duration/mode router tests.
5. Cast/guest/world/look validators and existing variant/continuity integration.
6. Story job checkpoint/fence/repair/final-gate integration.
7. Tenant/auth/credits/provider reconciliation tests.
8. UI jsdom and browser evidence.
9. Human/sample quality rubric at early/middle/late/finale checkpoints with
   versioned calibration, deterministic deduplicated sampling, agreement, and
   confidence-interval fixtures.
10. Synthetic 500-episode scheduler performance test; no live LLM dependency.
11. Focused typecheck and `git diff --check`; report baseline-wide typecheck
   noise separately.

## 11. Rollout gates

Enable in this order: contracts shadow mode -> blueprint candidate -> block
checkpoints -> cast/look/world validation -> arc gates -> finale gate -> Agents
adapter. Strict legacy backfill and production migration must be separately
verified. Any inherited Feature 152 external boundary remains a rollout
blocker for a claim of complete production readiness.

## 12. Implementation deliverables

- Shared long-form contracts and validators.
- Blueprint/reverse planning and context-pack services.
- Memory event/snapshot/retrieval/checkpoint integration.
- Mystery/advantage/cast/world/look ledger extensions.
- Bounded block generation/resume and final closure gate.
- Router/status/UI diagnostics and approval flow.
- Migration/backfill/runbook/metrics.
- Focused test fixtures and an acceptance matrix with local vs external proof.
