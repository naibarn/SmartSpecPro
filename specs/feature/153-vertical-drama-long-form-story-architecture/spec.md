# Feature 153: Vertical Drama Long-form Story Architecture, Adaptive Cast & Memory Assurance

**Status:** SPEC + DEEP-PLAN + LOCAL PARITY AUDIT COMPLETE — compatibility slice verified; dedicated benchmark/production surfaces remain explicitly bounded
**Version:** 0.21.0
**Created:** 2026-08-21
**Priority:** P0 — make long-form stories continuous, expandable, visually expressive, and finishable
**Owner:** Vertical Drama / Story Quality / Series Memory / Media Continuity
**Depends-on:** Feature 131 (Vertical Drama series storyboard/video flow), Feature 132 (story and character quality engine), Feature 138 (scene continuity), Feature 139 (series look lock), Feature 140 (shot fact continuity), Feature 148 (unified agent/worker platform), Feature 149 (video-prompt learning/QC ledger), Feature 150 (Prompt Orchestra), Feature 151 (Unified Agent Output Assurance Orchestra), Feature 152 (Story Generation Assurance Orchestra)
**Continues:** Feature 152
**Related code:** `apps/web/shared/verticalDramaSeries/storyControl.ts`, `apps/web/shared/verticalDramaSeries/draftStoryDesign.ts`, `apps/web/shared/verticalDramaSeries/qualityLedgers.ts`, `apps/web/shared/verticalDramaSeries/seriesMemoryState.ts`, `apps/web/shared/verticalDramaSeries/contracts.ts`, `apps/web/shared/verticalDramaSeries/contentBudget.ts`, `apps/web/shared/verticalDramaSeries/dialogueQuality.ts`, `apps/web/shared/verticalDramaSeries/longFormContracts.ts`, `apps/web/server/services/verticalDramaStoryBible.ts`, `apps/web/server/services/verticalDramaStoryGenerationContracts.ts`, `apps/web/server/services/verticalDramaStoryGenerationValidation.ts`, `apps/web/server/services/verticalDramaStoryGenerationRepair.ts`, `apps/web/server/services/verticalDramaStoryGenerationRepository.ts`, `apps/web/server/services/verticalDramaStoryJobs.ts`, `apps/web/server/services/verticalDramaSeriesMemoryProjection.ts`, `apps/web/server/services/verticalDramaLongFormGraph.ts`, `apps/web/server/services/verticalDramaLongFormAdmission.ts`, `apps/web/server/services/verticalDramaLongFormPlanner.ts`, `apps/web/server/services/verticalDramaLongFormMemory.ts`, `apps/web/server/services/verticalDramaLongFormRuntime.ts`, `apps/web/server/services/verticalDramaQualityLedgerReconcile.ts`, `apps/web/server/services/verticalDramaCharacterVariantPlanner.ts`, `apps/web/server/services/verticalDramaProductionEpisodeAssembly.ts`, `apps/web/server/routers/verticalDramaSeries.ts`, `apps/web/client/src/components/verticalDramaSeries/VerticalDramaRelationshipGraphPanel.tsx`

> This is an additive continuation of Feature 152. It does not replace the
> assurance state machine, create a second Agents SDK runtime, or move story,
> tenant, credit, provider, or database authority into an LLM. The aim is to
> make a 100–150-episode story behave like one authored long-form series rather
> than a sequence of locally plausible episodes.

## 0. Changelog and locked product decisions

### 0.1 Initial specification

- Added hierarchical long-form planning from series blueprint to shot contract.
- Added reverse-planned central mystery, reveal, consequence, and finale closure.
- Added adaptive cast lifecycle with controlled late fictional guest characters.
- Added fantasy, sci-fi, cartoon/high-spectacle world rules and media capability
  contracts without coupling the story layer to a specific provider API.
- Added story-cued wardrobe/look continuity using the existing character visual
  bible and outfit-variant foundation.
- Added multi-level series memory and retrieval requirements on top of the
  existing event/snapshot/projection infrastructure.

### 0.2 Relationship graph and quality benchmark upgrade

- Added a canonical character relationship graph covering family hierarchy,
  marriage/in-law links, factions, friends, rivals, knowledge, disclosure,
  time ranges, evidence, and repair impact.
- Added a user-visible relationship-map diagnostic and graph-aware repair flow.
- Reframed the Chinese-drama goal as a measurable long-form quality benchmark,
  not an unprovable automatic equivalence claim.

### 0.3 Duration and episode-count decision

The recommended quality target is **120 sub-episodes × 90 seconds = 10,800
seconds = 180 minutes (approximately 3 hours)**. This is a recommendation for
the highest assurance profile, not a hard maximum.

| User request     | Mode                 | Product behavior                                                                                                                                                |
| ---------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–120 episodes   | `quality_120`        | Recommended; full long-form planning, arc gates, memory snapshots, finale closure, strictest thresholds                                                         |
| 121–150 episodes | `extended_long_form` | Supported; same contracts, more block checkpoints, higher estimated cost/time, explicit quality-confidence notice                                               |
| 151+ episodes    | `extended_long_form` | Technically supported when configured budget allows; no claim that quality is equivalent to the 120-episode profile; user may generate in child horizons/blocks |

The existing `targetEpisodeCount` accepts up to 1000 and must remain compatible.
Feature 153 must not replace that technical limit with 120 or reject a larger
user request. Instead, admission recommends `quality_120`, selects
`extended_long_form` above 120, exposes expected cost/time, and blocks only
when the configured budget, credit policy, or infrastructure safety limit is
insufficient.

The existing short-video duration/shot contract remains authoritative for
rendering. The long-form planning layer must derive its runtime from the
selected duration profile; it must not assume that every existing series is
already 90 seconds. A product profile may target 90 seconds while legacy
profiles remain 60 seconds. The current 9 logical shots and existing
`productionEpisodesManifest` grouping remain the production boundary.

### 0.4 Draft-pipeline alignment and implementation-readiness hardening

The implementation must follow the existing draft path instead of creating a
parallel authoring pipeline:

```text
create/update series
  -> generateStoryBible (season plan + refined characters + breakdown)
  -> draftStoryDesign/storyControl/storyArchitecture admission
  -> generateStoryBibleDeep or extendStoryDraftHorizon (bounded shot drafts)
  -> episode_memory + relationshipGraphDelta
  -> memory fold + ledger/quality repair
  -> block/arc/finale gate -> candidate approval -> activation
```

The following are mandatory contracts, not optional future enhancements:

- `generateStoryBible` must persist/repair architecture, story design, story
  control, and relationship graph as one source revision; it cannot produce a ready plan without a valid
  `relationshipGraphDraft`, graph fingerprint, unresolved-relationship list,
  and source/architecture fingerprint. A legacy-compatible plan may remain a
  candidate, but deep generation must fail closed until the graph is repaired
  or explicitly approved as a compatibility backfill.
- `generateStoryBibleDeep`, `extendStoryDraftHorizon`, premium revise,
  season-sweep repair, resume, and retry must receive the same graph
  revision/fingerprint and relationship retrieval pack as the story design,
  architecture, and memory packs. A graph change makes an in-flight run stale.
- Strict episode output must emit a typed `relationshipGraphDelta` with edge
  IDs, operations, evidence, validity interval, disclosure, and known-by
  state. The existing `relationship_changes` pair-state field remains a
  compatibility projection only; prose is never an authoritative relationship
  update.
- Accepted episode writes must create a reverse dependency index from each
  relationship edge to affected episodes, shots, dialogue, memory events,
  recaps, cliffhangers, cast/faction facts, and look/world facts. Graph repair
  uses this index to compute impact closure and never rewrites an entire season
  blindly.
- The quality profile must have a versioned cost/time/SLO envelope. Admission
  shows estimated calls, repair rounds, wall-clock range, credit reserve,
  checkpoint size, and an explicit partial/abort policy before paid work.

This alignment is required because the current code already has useful seams
(`storyDesign`, `storyControlSeed`, `storyContract`, active breakdown versions,
episode memory, and Feature 152 assurance), but those seams do not yet make the
relationship graph and long-form closure state authoritative end-to-end.

### 0.5 Completeness audit — duration, planning scale, secrecy, and activation

The second audit found four implementation-critical gaps that are now locked:

- the 90-second profile must be a registered, testable 9-shot duration profile
  with an exact runtime sum and production-manifest mapping; a recommendation
  alone is not enough;
- season-plan generation must be staged/chunked for 120–1000 episodes. A single
  story-bible response must not be expected to return an entire large
  `episodeBreakdown` within one token ceiling;
- relationship graph knowledge/disclosure must control context redaction, not
  merely be displayed as metadata. A character or critic must not receive a
  secret fact that is outside its allowed knowledge state;
- strict Feature 153 runs must never use the legacy direct active-bible write
  path. They must publish a candidate revision and pass approval/final-gate
  semantics before activation, even when the older assurance flag is disabled.

### 0.6 Completeness audit — operational defaults and end-to-end durability

The third audit found that the domain design was complete but several
implementation decisions were still implicit. The following defaults and
invariants are now part of the contract so deep-plan and implementation do not
invent incompatible behavior:

- quality review has a reproducible baseline: two independent calibrated
  reviewers, weighted agreement target `>= 0.60`, critical dimensions `>= 4/5`,
  non-critical dimensions `>= 3/5`, and weighted sample score `>= 3.6/5`;
- plan chunks have a bounded default of 10 episodes and a hard policy maximum
  of 20, zero overlap, explicit interval coverage, deterministic idempotency
  keys, and a maximum of two paid retries per chunk before reconciliation;
- the 90-second story profile must map to the existing
  `VerticalDramaDurationPlan` and assembly runtime/segment semantics;
- memory compaction is a checksum-verified cache operation and may not remove
  hard facts, evidence IDs, unresolved threads, graph revisions, disclosure
  state, look state, world-rule limits, costs, or retcon lineage;
- plan and block retries reserve credits at the bounded work-unit level,
  reconcile unknown provider outcomes before retrying, and never charge
  accepted work twice;
- anti-drift, cast-density, and benchmark policies must carry materialized
  baseline values in the immutable run contract;
- graph diagnostics use the same role/viewpoint redaction rules as generation;
- changing source revision, target horizon, duration profile, locale, genre
  profile, or approved graph revision invalidates affected plan chunks and
  dependent blocks instead of mixing revisions.

### 0.7 Completeness audit — runtime reuse, speech contract, and stuck-run safety

The fourth audit compared the spec with the current draft/runtime seams. The
codebase already has canonical content-budget/dialogue-quality helpers and
durable story-job lease, heartbeat, fence, cancellation, and resume fields.
Feature 153 must reuse those seams instead of defining parallel behavior. The
following are now mandatory:

- strict long-form admission enables and persists the canonical speech/content
  budget contract; it cannot silently fall back to the current optional
  `speechBudgetEnabled` path;
- every queued/running chunk has a lease, heartbeat, fence token, and watchdog
  recovery rule. An expired lease becomes resumable `partial` or
  `awaiting_reconciliation`, never an indefinitely active run;
- relationship edges define cardinality, inverse, time, and belief-state
  invariants (`unknown`, `suspected`, `believed`, `known`, `false`) so a
  character can misunderstand or be deceived without corrupting canonical
  truth;
- admission stores a pricing/model snapshot, reserved credits, hard spend
  ceiling, and over-budget behavior. Actual usage cannot silently exceed the
  approved ceiling;
- pause/cancel/resume behavior is explicit, including provider cancellation
  limits, checkpoint preservation, and release/reconciliation of unused
  reservations;
- pause is distinct from cancellation. It must use a durable control request
  (`pause` or `cancel`) or an additive equivalent; it cannot overload
  `cancellationRequestedAt` and make resume behavior ambiguous;
- Phase A storage must expose the same repository-level atomic write and
  reverse-dependency lookup contract as normalized tables. “JSON first” cannot
  become an unbounded implementation deferral.
- every resolved quality, speech, anti-drift, plan-chunk, execution, benchmark,
  and pricing policy has its own immutable fingerprint/version and stale-run
  invalidation rule;

### 0.8 Completeness audit — implementation handoff and finalization safety

The fifth audit checked whether the spec can be handed to multiple engineers
without hidden choices. The following are now required:

- the run contract pins the Feature 151 adapter contract and Feature 152
  assurance contract versions;
- relationship normalization stores a versioned vocabulary/alias catalog so
  Thai/English terms such as “น้องเมีย”, “sister-in-law”, and “wife's sister”
  resolve deterministically;
- retries use a typed error-class matrix. Deterministic validation failures do
  not retry forever, unknown provider outcomes reconcile before retry, and
  stale-fence recovery resumes from checkpoint rather than regenerating paid
  work;
- final activation performs a durable read-back of status, coverage,
  fingerprints, graph dependency index, memory checkpoint, and credit ledger;
- extending a completed or partially completed horizon re-plans terminal
  closure and affected arc boundaries before new episodes are admitted;
- plan-chunk concurrency, idempotency-key composition, and AC-to-section proof
  ownership are explicit and versioned.

### 0.9 Completeness audit — status vocabulary and traceability uniqueness

The final handoff audit closed two implementation-ambiguity gaps:

- `awaiting_reconciliation` is the single public/runtime status for an
  accepted candidate or run that needs durable reconciliation. The spec does
  not introduce a second ad-hoc reconciliation status; an internal
  reconciliation phase may be recorded as metadata or an event only.
- the acceptance traceability manifest assigns each AC exactly one primary
  section owner. Supporting sections may still provide evidence, but ownership
  is not duplicated or left implicit.

### 0.10 Completeness audit — retry policy materialization and status-plane mapping

The next implementation handoff audit closed two additional ambiguities:

- retry and SLO policies now have explicit version/fingerprint fields in the
  blueprint/run contract. The strict baseline is one schema-correction retry,
  two transient-provider retries, two paid plan-chunk retries, and at most
  three bounded repair rounds per work unit. Any override requires a new
  versioned policy fingerprint and is shown before paid admission;
- the existing transport job status and canonical story-generation run status
  are explicitly separate status planes. The transport wrapper remains
  `queued | running | succeeded | failed`; detailed candidate/run progress
  uses the existing Feature 152 story-generation status contract. Transport
  `succeeded` never means candidate activation succeeded by itself.

### 0.11 Completeness audit — nested retry semantics and benchmark reproducibility

The latest audit closed two remaining interpretation gaps:

- long-form orchestration retries, deterministic repair rounds, and provider
  continuation calls are separate budgets. The strict baseline applies to the
  outer work unit; inherited Feature 152 continuation/quality-loop ceilings
  remain versioned, are not silently reset, and all nested calls count toward
  the immutable SLO/cost estimate;
- the human benchmark now freezes rubric/calibration versions, deterministic
  deduplicated sampling, agreement statistic, confidence method, and the
  minimum sample rule. A sample that cannot meet the confidence rule cannot be
  labeled Chinese-drama-comparable.

### 0.12 Completeness audit — benchmark result contract and canonical sampling

The benchmark policy is now paired with a persisted result contract. Sampling
uses one canonical rounding rule, and confidence insufficiency is an explicit
non-release state rather than an undocumented reviewer judgment.

### 0.13 Completeness audit — benchmark finalization binding

The benchmark result is now a finalization dependency. Activation must read
back the exact benchmark result fingerprint, reviewer/adjudication artifacts,
confidence status, and label eligibility; a policy-valid story with a missing
or stale benchmark result cannot be reported as finalized.

### 0.14 Completeness audit — reviewer ingestion and typed activation reference

The final benchmark handoff now includes the missing ingestion boundary:

- reviewer submission and adjudication have explicit tenant-scoped API
  operations and immutable artifact contracts;
- the typed `longForm` run extension carries the benchmark finalization
  reference, optional during review but mandatory before activation;
- blind-session isolation, stale fingerprint rejection, and the requirement
  for two independent artifacts before adjudication are explicit.

### 0.15 Completeness audit — explainable relationship paths

The relationship map now requires an explainable path between any two selected
characters. Derived labels such as “น้องเมีย” must show the canonical edges
that prove them; the UI and repair flow may not display an unexplained inferred
relationship as if it were an authored direct edge.

### 0.16 Completeness audit — bounded multi-path and redaction safety

Relationship path queries now have explicit hop/path limits, a truncation
signal, a list of path candidates, and viewpoint/permission redaction. This
prevents a large family/faction graph from producing an unbounded query while
preserving enough provenance for user inspection and repair.

### 0.17 Implementation parity audit — compatibility graph and resumability

The additive implementation audit found and closed gaps that the document-only
plan could not prove:

- shared runtime Zod schemas now fence graph JSON and graph query filters;
- legacy structured `episode_memory.relationship_changes` is materialized as
  an explicitly `legacy_derived` compatibility graph with revision,
  fingerprint, evidence, redaction policy, and dependency fingerprint;
- authored or user-edited graph revisions are not overwritten by compatibility
  backfill, while malformed stored graphs fail closed before paid deep work;
- direct chunk helpers reject invalid inputs, memory packs no longer infer
  episode scope from array position, and resumed blocks are plan-fenced and
  retain accepted values;
- the graph diagnostic is mounted in the Bible tab and the existing deep-draft
  UI test fixtures cover the added assurance procedures.

This is an integration/compatibility slice. It does not by itself prove that
the legacy LLM draft emits a fully authored relationship delta, that all 120
episodes pass the Chinese-drama benchmark, or that a live provider/Agents SDK
run has completed; those remain explicit release proof gates.

### 0.18 Parity audit correction — strict graph delta and compatibility boundary

The previous implementation note correctly described a compatibility graph but
overstated Feature 153 parity. The strict episode contract now accepts and
validates `relationship_graph_deltas`, derives legacy `relationship_changes`
from those deltas when present, and projects their evidence/provenance into the
graph. New long-form deep/extend outputs fail closed when the typed delta array
is missing or invalid. Legacy episodes without the field remain readable through
the explicitly marked compatibility-backfill path.

The dedicated blueprint/plan-chunk/memory-pack/closure/benchmark tRPC operation
family, full candidate-edit workflow, human benchmark persistence, browser
proof, and live Agents SDK/provider proof are not represented as implemented by
the compatibility slice. Existing Feature 152 deep/extend routes remain the
current integration path until those independent persistence and approval
contracts are implemented and tested.

### 0.19 Local parity closure

The local parity audit is complete for the compatibility slice. The graph
materializer segments repeated canonical edge IDs into non-colliding temporal
intervals while retaining canonical provenance, and the relationship diagnostic
supports bounded episode/range, family/faction, status/disclosure, candidate
revision/diff, and pair-path inspection. Focused proof covers 12 files and 143
tests, section and UI-contract checks cover all 11 sections, and the filtered
workspace typecheck has zero Feature 153 diagnostics. These results do not
replace the explicitly deferred dedicated API, browser, provider, Agents SDK,
deployment, or human benchmark release gates above.

## 1. Executive decision

Feature 153 introduces a **hierarchical, memory-backed, skill-first story
orchestra**:

```text
Series Blueprint
  -> Macro Arcs
    -> Sub-arcs / Episode Blocks
      -> Episode Contracts
        -> Scene / Shot / Dialogue output
          -> deterministic ledgers + skill critics
            -> targeted repair + memory fold
              -> arc gate -> finale closure gate
```

The authoring model never receives an unbounded 120–500 episode transcript.
Each call receives a deterministic context pack containing immutable series
anchors, the current arc/block, adjacent episode obligations, relevant memory,
and the exact output contract. The server remains the source of truth for
identity, episode numbers, ledger transitions, repair scope, credits, and
activation.

OpenAI Agents SDK may be used only through Feature 151's existing adapter to
coordinate bounded author/reviewer/repair roles. A larger retry loop alone is
not considered a solution. Correctness comes from hierarchy, ledgers,
checkpoints, and final gates.

## 2. Current-codebase fit and identified gaps

### 2.1 Existing foundations to reuse

| Existing foundation                                                                           | Evidence in codebase                                                                                                                                    | Feature 153 use                                                                                                          |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Story threads, romance phases, advantage beats, evidence refs                                 | `shared/verticalDramaSeries/storyControl.ts`: `storyControlThreadSchema`, `romancePhasePlanSchema`, `advantageBeatPlanSchema`, `storyControlPlanSchema` | Extend with arc/block ownership and long-form schedules; do not duplicate thread or romance types                        |
| Evidence, character activation, threat, consequence, thread, world-rule, causal-chain ledgers | `shared/verticalDramaSeries/qualityLedgers.ts` and `server/services/verticalDramaQualityLedgerReconcile.ts`                                             | Add long-form fields/validators and use `reconcileLedgers` as the base reconciliation seam                               |
| Materialized series memory                                                                    | `seriesMemoryState.ts` and `verticalDramaSeriesMemoryProjection.ts`                                                                                     | Preserve `VdSeriesMemory`/`foldSeriesMemory`; add arc/state projections and retrieval packs additively                   |
| Append-only memory events and rolling snapshots                                               | `drizzle/schema.ts`: `vertical_drama_memory_events`, `vertical_drama_memory_snapshots`                                                                  | Persist arc checkpoints, truth changes, approved retcons, and compaction checksums                                       |
| Character identity and wardrobe rules                                                         | `contracts.ts`, character visual bible services, `vertical_drama_characters.data`                                                                       | Use `identityLock`, `wardrobeRules`, `currentState`, and visual-bible fingerprints as identity authority                 |
| Outfit and age-stage variants                                                                 | `verticalDramaCharacterVariantPlanner.ts`, `vertical_drama_characters.variantType`                                                                      | Use `variantType: "outfit"` for approved looks; do not treat a wardrobe change as a new person                           |
| Legacy relationship shape and materialized relationship state                                 | `contracts.ts` (`VerticalDramaRelationship`), `seriesMemoryState.ts` (`VdRelationshipState`)                                                            | Preserve as compatibility readers and project them into the new graph; do not keep a second unvalidated relationship map |
| Scene/shot wardrobe and visual continuity                                                     | `sceneContinuity.ts`, `frameContinuity.ts`, `seriesLookLock.ts`                                                                                         | Feed the look ledger into existing scene/shot QC rather than replacing it                                                |
| 9-shot episode and production grouping                                                        | `durationProfiles.ts`, `assembly.ts`, `verticalDramaProductionEpisodeAssembly.ts`                                                                       | Keep generation and export boundaries compatible                                                                         |
| Durable partial/resume/repair/fence/approval                                                  | Feature 152 contracts and services                                                                                                                      | Inherit all run/attempt/final-gate rules; add long-form checkpoints and closure states                                   |

### 2.2 Gaps this feature closes

1. The current story control is primarily a seed and episode-slot contract; it
   does not provide a durable hierarchy of macro arcs, sub-arcs, blocks, and
   finale dependencies for 100–500 episodes.
2. Existing episode memory is useful as a projection but does not yet provide
   authoritative arc snapshots, contradiction/retcon lineage, or a unified
   retrieval priority for truth, character knowledge, world rules, advantage,
   and looks.
3. Existing quality ledgers reconcile local evidence, threads, threats, and
   consequences, but a single finale gate does not yet prove that every
   central mystery has a valid evidence chain, earned reveal, consequence, and
   closure.
4. The roster supports characters and visual variants, but generation does not
   yet require a planned lifecycle for characters introduced mid-series or a
   contract for a late fictional guest character.
5. `wardrobeRules` and outfit variants exist, but there is no story-event
   admission rule that says when a new look is justified, what episode/scene
   first uses it, and how continuity state (wet, injured, dirty, formal, sleep,
   combat) persists.
6. The story layer has no provider-neutral capability contract for scenes that
   need future-world, magic, realistic combat, cartoon exaggeration, large VFX,
   or cinematic intimacy.
7. The current long-form extension path can technically process large target
   counts, but it needs quality-mode admission, block-level checkpoints, cast
   density controls, and explicit confidence/cost boundaries.
8. Feature 152 still has inherited partial boundaries: per-attempt artifact
   completeness, complete Agents SDK active-mode proof, full provider/credit
   reconciliation proof, signed manifest persistence, legacy quality-loop
   interception, and production migration/browser proof. Feature 153 may depend
   on these gates but must not silently mark them implemented.
9. The codebase has relationship types and relationship memory state, but no
   canonical graph that models family side, in-law links, affiliations, time
   validity, disclosure, evidence, or graph-aware repair. This allows a script
   to call a character a spouse, sibling, stranger, or enemy inconsistently
   across episodes.
10. The draft entrypoint persists `refinedCharacters` and a flat
    `episodeBreakdown`, while `draftStoryDesign.ts` derives control threads
    from architecture and character names only. It does not yet derive family
    groups, relation candidates, unresolved relation questions, or a graph
    fingerprint; this must be added before a plan is accepted.
11. The current `generateStoryBible` write preserves pre-existing
    `storyDesign`/`storyContract` fields but does not guarantee that the draft
    stage creates or repairs them before persistence. The new plan gate must
    make architecture, story design, story control, and relationship graph a
    single accepted source revision instead of relying on whichever fields a
    previous wizard/client payload happened to include.
12. `generateStoryBibleDeep` and `extendStoryDraftHorizon` already carry
    story-control, design, architecture, location, character, and memory
    context, but their strict JSON contract still represents relationships as
    pair/status snapshots. The long-form graph delta and reverse dependency
    index must be threaded through every standard, premium, revise, resume, and
    repair path.
13. The current 60-second fallback and optional speech-budget flag can produce
    different planning density from the recommended 90-second profile. The
    selected duration profile, content-budget policy, and SLO must be fixed in
    the immutable run contract and displayed to the user.
14. The current duration implementation is explicitly 60-second/9-shot by
    default. The shared registry can represent `vertical_drama_10s_x9_shots`
    (nine 10-second shots = 90 seconds), but the strict long-form path does not
    yet make it the quality-profile default or prove speech/production
    assembly mapping. The feature must not advertise 90 seconds until that
    plumbing and proof exist.
15. `generateStoryBible` currently asks for the entire requested
    `episodeBreakdown` in one response. This is a truncation risk for 120–1000
    episodes and is not solved by allowing deep drafting in later chunks. Plan
    creation needs a staged skeleton/arc/block strategy with resumable plan
    checkpoints before shot drafting.
16. The current assurance runtime initializes architecture and story-control
    fingerprints from the same source snapshot fingerprint. It does not yet
    prove independent fingerprints for architecture, story design, graph,
    duration, cast, and memory. The run contract must reject partial or stale
    fingerprint coverage.
17. The existing repair impact logic expands from finding paths and immediate
    neighbors. It does not yet consume the relationship reverse dependency
    index or prove transitive impact across dialogue, knowledge, recap, look,
    and world facts. The index must be an input to repair, not only an audit
    artifact.
18. The relationship graph records `knownByCharacterKeys`, but the retrieval
    contract does not explicitly require secret-fact redaction per viewpoint.
    Context packs must be viewpoint-scoped so a character cannot speak or act
    on information it has not learned.
19. Cast-density policy is described qualitatively but has no enforceable
    budget fields for active cast, new introductions, guest frequency, dialogue
    ownership, or visual-asset load. These limits must be versioned and checked
    at block and arc gates.
20. The spec names graph inspection and repair but does not define a complete
    graph-edit/review API or concurrency result. User edits need candidate
    revisions, impact preview, optimistic conflict handling, and explicit
    approve/reject semantics.
21. The benchmark protocol does not yet freeze baseline floors, reviewer
    calibration, weighted aggregation, or adjudication behavior.
22. The duration profile does not explicitly map every field to the existing
    `VerticalDramaDurationPlan` and assembly runtime/segment semantics.
23. Plan chunking has no concrete chunk-size, overlap, retry, or idempotency
    contract for large horizons.
24. Memory snapshots are called compact/checksummed but the lossless truth set
    and replay-verification rule are not explicit.
25. Credit/retry behavior does not explicitly prevent duplicate charges or
    retry an unknown provider outcome before reconciliation.
26. Anti-drift and cast policies can still be persisted without resolved
    thresholds; baseline values must be materialized before paid generation.
27. The graph UI does not explicitly apply viewpoint/permission redaction to
    secret edges and evidence.
28. Source, locale, genre, duration, horizon, and graph edits lack an explicit
    invalidation boundary for accepted plan chunks and dependent blocks.
29. Strict mode does not explicitly require the existing canonical
    `contentBudget`/`dialogueQuality` contract or prevent speech-budget flags
    from being omitted.
30. The existing job lease/heartbeat/fence/cancellation seams are not mapped to
    a Feature 153 watchdog and stuck-run recovery invariant.
31. Relationship normalization lacks explicit cardinality, inverse, and
    belief-state rules for spouse/family/deception/misunderstanding cases.
32. The SLO mentions credits but does not require a pricing snapshot, hard
    spend ceiling, or a deterministic over-budget action.
33. Cancellation, pause, resume, and unused-credit release/reconciliation are
    not defined as long-form work-unit semantics.
34. Phase A's JSON/event storage decision still needs a repository-level
    atomic/indexed contract and a deadline for escalating to normalized tables.
35. The current story run persistence distinguishes cancellation but not a
    durable pause request; the spec must prevent pause from becoming an
    ambiguous status/string convention.
36. Feature 151/152 compatibility is inherited narratively but not pinned to
    explicit contract/adapter versions in the Feature 153 run contract.
37. Relationship aliases are described semantically but the normalizer
    vocabulary/version is not persisted, so Thai/English synonym resolution
    could drift between retries.
38. Retry behavior lacks a typed error-class matrix and could accidentally
    retry deterministic failures or charge an unknown provider outcome twice.
39. Candidate activation has final-gate rules but no explicit durable read-back
    verification across status, coverage, fingerprints, graph/memory, and
    credits.
40. Extending the horizon after planning/generation does not explicitly state
    how terminal closure and affected arc boundaries are re-planned.
41. Plan-chunk concurrency and idempotency-key composition are not concrete
    enough for multiple workers/requests.
42. AC rows have proof descriptions but no mandatory owner-section traceability
    manifest, allowing an acceptance criterion to be missed during execution.

## 3. Goals

1. Produce a coherent 100–150-episode long-form story with an authored spine,
   not 100–150 disconnected episode prompts.
2. Recommend 120 × 90 seconds as the highest-quality profile while supporting
   larger episode requests without a hard 120-episode rejection.
3. Plan backward from the terminal episode so the opening premise, central
   mystery, major reversals, costs, and finale payoff remain causally connected.
4. Allow new recurring, arc, faction, and guest characters to enter when the
   story earns them, while preventing uncontrolled cast explosion and deus ex
   machina rescues.
5. Maintain a canonical relationship graph for family, marriage/in-law,
   faction, friendship, rivalry, knowledge, disclosure, and time validity, with
   a user-visible inspection and graph-aware repair flow.
6. Make every important open thread owned, scheduled, evidenced, and either
   resolved or explicitly approved as a sequel hook.
7. Preserve protagonist/antagonist advantage exchanges, costs, responses, and
   escalation across arcs.
8. Support fantasy, sci-fi, cartoon/high-spectacle, future, realistic-combat,
   and cinematic-romance modes through explicit world and media contracts.
9. Make wardrobe/look changes visible in the story plan and script before any
   visual variant is recommended or generated.
10. Give every generation block a resumable checkpoint and a compact, relevant
    memory pack without losing canonical truth.
11. Keep every change compatible with Feature 152's candidate, repair,
    approval, fencing, credit, tenancy, and final-gate rules.
12. Provide a measurable long-form quality benchmark targeting the relationship
    density, emotional rhythm, reveal discipline, escalation, visual variety,
    and closure expected from strong Chinese vertical drama, without asserting
    that deterministic checks alone equal human-authored drama.

## 4. Non-goals and quality claims

1. The product target is a **Chinese-drama-comparable long-form quality
   benchmark**: dense but understandable relationships, escalating reversals,
   emotionally earned turns, visually varied situations, strong episode hooks,
   and complete payoff. This is measured with deterministic gates plus a
   versioned human/sample rubric; it is not a claim that generated content is
   automatically equivalent to a professionally written Chinese drama.
2. This feature does not guarantee that every 500-episode story will have the
   same density or quality as a 120-episode story. Extended mode is a supported
   engineering capability with explicit cost and confidence disclosure.
3. This feature does not select or hard-code an API for Seedance, Minimax, or
   another future media model. Capability tags are provider-neutral and must be
   resolved through the existing provider/model policy layer at generation
   time.
4. This feature does not permit real-person likeness, celebrity licensing, or
   unsafe sexual content. “Guest star” means a fictional in-story character;
   reference-image changes cannot change canonical story identity.
5. This feature does not create an independent visual identity database,
   independent memory database, or independent agent runtime.
6. This feature does not let a late character erase established causality,
   solve the entire central conflict alone, or rewrite prior events without an
   explicit, world-rule-supported and approved retcon.

## 5. Canonical long-form model

### 5.1 Hierarchy

```ts
type LongFormSeriesBlueprint = {
  schemaVersion: 1;
  blueprintId: string;
  seriesId: number;
  recommendedMode: "quality_120" | "extended_long_form";
  requestedEpisodeCount: number;
  recommendedEpisodeCount: number;
  episodeDurationSeconds: number;
  locale: string;
  ageRating: string;
  safetyPolicyVersion: string;
  providerPolicyFingerprint: string;
  feature151AdapterContractVersion: string;
  feature152AssuranceContractVersion: string;
  terminalEpisodeNumber: number;
  premiseAnchor: string;
  centralMystery: CentralMysteryContract;
  macroArcs: MacroArcPlan[];
  finalClosure: FinaleClosureContract;
  castPolicy: CastExpansionPolicy;
  genreProfile: GenreProfile;
  worldRulebookVersion: string;
  storyControlVersion: string;
  relationshipGraphRevisionId: string;
  relationshipGraphFingerprint: string;
  relationshipGraphSchemaVersion: number;
  relationshipVocabularyVersion: string;
  relationshipAliasCatalogFingerprint: string;
  relationshipRedactionPolicyVersion: string;
  relationshipRedactionPolicyFingerprint: string;
  relationshipGraphReadiness: "ready" | "compatibility_backfill" | "needs_repair";
  relationshipDependencyIndexFingerprint: string;
  durationProfileId: string;
  speechBudgetPolicyVersion: string;
  speechBudgetPolicyFingerprint: string;
  castPolicyFingerprint: string;
  benchmarkPolicyFingerprint: string;
  benchmarkFinalizationReference?: LongFormBenchmarkFinalizationReference;
  antiDriftPolicyFingerprint: string;
  planChunkPolicyFingerprint: string;
  retryPolicyVersion: string;
  retryPolicyFingerprint: string;
  sloPolicyVersion: string;
  sloPolicyFingerprint: string;
  executionPolicyFingerprint: string;
  pricingSnapshotId: string;
  memoryPolicyFingerprint: string;
  planCoverageFingerprint: string;
  sourceFingerprint: string;
};

The Feature 152 run contract carries these long-form fields through a typed
`longForm` extension. Retry/SLO versions and fingerprints must not be hidden
inside an unvalidated generic constraints map; adapters may rename the fields
only while preserving the same schema, fingerprint, and stale-run semantics.

type MacroArcPlan = {
  arcId: string;
  ordinal: number;
  episodeWindow: { startEpisode: number; endEpisode: number };
  purpose: string;
  protagonistObjective: string;
  antagonistObjective: string;
  pressureThreads: string[];
  requiredReveals: string[];
  requiredCosts: string[];
  entryStateFingerprint: string;
  exitStateFingerprint: string;
  subArcs: SubArcPlan[];
  closurePolicy: "must_close" | "may_carry" | "sequel_hook_only";
};

type SubArcPlan = {
  subArcId: string;
  arcId: string;
  episodeWindow: { startEpisode: number; endEpisode: number };
  objective: string;
  threadIds: string[];
  characterLifecycleIds: string[];
  advantageBeats: string[];
  revealDependencies: string[];
  exitCondition: string;
  blocks: EpisodeBlockPlan[];
};

type EpisodeBlockPlan = {
  blockId: string;
  subArcId: string;
  episodeWindow: { startEpisode: number; endEpisode: number };
  plannedStateDelta: string;
  requiredEpisodeNumbers: number[];
  contextCheckpointId?: string;
  gateStatus: "planned" | "running" | "needs_repair" | "passed" | "blocked";
};
```

The duration registry is part of the immutable blueprint, not a UI-only
recommendation:

```ts
type LongFormDurationProfile = {
  profileId:
    | "vertical_drama_10s_x9_shots"
    | "vertical_drama_60s_9_shots"
    | string;
  episodeRuntimeSeconds: number;
  shotDurationsSeconds: number[];
  speechTargetSecondsByShot: number[];
  speechMinimumSecondsByShot: number[];
  productionManifestVersion: string;
  renderCompatibility: "native" | "derived" | "legacy";
};

type LongFormDurationAdapter = {
  profileId: string;
  contractVersion: 1;
  logicalShotCount: 9;
  shotDurationsSeconds: number[];
  renderSegmentDurationsSeconds: number[];
  logicalRuntimeSeconds: number;
  renderRuntimeSeconds: number;
  assemblyCompatibility: "native" | "derived" | "legacy";
};

type LongFormSpeechBudgetContract = {
  policyVersion: string;
  durationProfileId: string;
  episodeMinimumSpeechSeconds: number;
  episodeTargetSpeechSeconds: number;
  perShotMinimumSpeechSeconds: number[];
  perShotTargetSpeechSeconds: number[];
  contentBudgetRequired: true;
  source: "verticalDramaDialogueQuality";
};
```

For the recommended `vertical_drama_10s_x9_shots` profile, the vector is
exactly `[10, 10, 10, 10, 10, 10, 10, 10, 10]` and sums to 90 seconds. The
speech target/minimum vectors must match its length. The profile must be
consumed identically by story planning, deep drafting, dialogue coverage,
storyboard, and production assembly. Legacy 60-second series retain their
existing profile and are never silently migrated.

Strict long-form runs must resolve speech budgets through the existing
`contentBudget.ts`/`dialogueQuality.ts` helpers. The selected profile's shot
vector determines the per-shot budget vectors; the episode breakdown must carry
the canonical `contentBudget`, and deep/script/storyboard stages must use the
same policy version. The legacy optional speech-budget flag remains compatible
for old series but cannot disable this contract in strict mode.

Large-season planning is staged separately from shot authoring:

```text
source/premise -> deterministic horizon admission
  -> chunked season skeleton (arcs/sub-arcs/blocks/episode contracts)
  -> plan checkpoint + source fingerprint
  -> bounded block synopsis/details
  -> deep shot drafting and repair
```

Every plan chunk is idempotent and must cover a disjoint episode interval. A
120–1000 episode request must not depend on one model response containing the
whole episode breakdown. Missing plan intervals block deep generation, while
accepted earlier intervals remain resumable.

The plan checkpoint contract is explicit:

```ts
type LongFormPlanChunkPolicy = {
  policyVersion: string;
  defaultEpisodesPerChunk: 10;
  maxEpisodesPerChunk: 20;
  overlapEpisodes: 0;
  maxPlanChunksInFlight: 1;
  maxPaidRetriesPerChunk: 2;
  requireContiguousCoverage: true;
};

type LongFormPlanChunk = {
  planChunkId: string;
  blueprintId: string;
  chunkOrdinal: number;
  episodeWindow: { startEpisode: number; endEpisode: number };
  predecessorChunkId?: string;
  predecessorCoverageFingerprint?: string;
  coverageFingerprint: string;
  idempotencyKey: string;
  status: "planned" | "running" | "partial" | "passed" | "blocked";
};

type LongFormRetryPolicy = {
  policyVersion: string;
  policyFingerprint: string;
  schemaCorrectionMaxRetries: number;
  transientProviderMaxRetries: number;
  maxRepairRoundsPerWorkUnit: number;
  unknownProviderOutcome: "reconcile_before_retry";
  deterministicValidation: "no_auto_retry";
  staleFence: "resume_from_checkpoint";
  creditShortage: "await_reconciliation_or_user_action";
};

const STRICT_LONG_FORM_RETRY_DEFAULTS = {
  schemaCorrectionMaxRetries: 1,
  transientProviderMaxRetries: 2,
  maxPaidRetriesPerPlanChunk: 2,
  maxRepairRoundsPerWorkUnit: 3,
} as const;
```

The resolved policy, chunk size, predecessor fingerprint, retry count, and
coverage fingerprint are persisted before a paid call. A gap, overlap, stale
predecessor, or replay with a different idempotency key is a blocking finding.
The idempotency key is derived from tenant, series, blueprint revision, source
fingerprint, work-unit type, interval, and attempt class; request retries for
the same work unit must reuse it. Only transient/provider classes may consume
the configured retry budget. The strict defaults above are the materialized
baseline; missing, negative, or non-fingerprinted retry/SLO values block paid
admission. A policy override must be visible in the admission estimate and
must invalidate stale chunks/runs.

Retry accounting has three distinct levels:

1. **Provider retry:** a new paid provider attempt after a transport/provider
   failure; the strict baseline allows two transient-provider retries and
   unknown outcomes must reconcile before another attempt.
2. **Repair round:** one deterministic critic → targeted repair → revalidation
   cycle for a long-form work unit; the strict baseline allows at most three.
3. **Provider continuation:** additional bounded calls that continue an
   otherwise live Feature 152 generation stream. These are not retries and do
   not increase the retry allowance; they inherit the pinned Feature 152
   continuation/quality-loop policy, are included in `maxLlmCalls`, credits,
   wall-clock estimates, and cannot reset the outer repair budget.

The adapter must persist the inherited continuation policy/version in the
typed `longForm` contract and reject a run if the nested call budget cannot be
represented in the SLO estimate.

The exact field names may be adapted to existing shared contracts, but the
relationships are mandatory: every episode belongs to one block, every block
to one sub-arc, every sub-arc to one macro arc, and every arc has entry/exit
state and closure policy. IDs are stable across retries and child attempts.

When a user extends the horizon after a plan or block has been accepted, the
system keeps accepted content readable but creates a new candidate plan
revision. It must re-evaluate the terminal episode, finale reveal/consequence,
affected arc exit states, sequel-hook classifications, and any thread whose
payoff window was previously terminal before admitting new chunks. It may not
simply append episodes after the old finale contract.

### 5.2 Central mystery and reverse planning

The blueprint must declare, before episode generation:

- the question the audience is meant to keep asking;
- the canonical answer and who/what caused it;
- the minimum evidence chain from early plant to final reveal;
- red herrings and the evidence that eventually reframes them;
- the reveal window and the final consequence/cost;
- characters who know, suspect, misunderstand, or are prevented from knowing;
- allowed unresolved sequel hooks that are not required for this story's main
  closure.

Reverse planning starts at the terminal episode, allocates the final reveal,
consequence, emotional resolution, and epilogue capacity, then plans the
preceding reveal, confrontation, and evidence-recovery windows. A thread is
not accepted into a block unless it has an owner, purpose, evidence source,
expected payoff window, and resolution cost. A new thread must either have a
payoff within the declared series/arc horizon or be explicitly classified as a
sequel hook.

### 5.3 Episode contract

Each episode must retain Feature 152's structural contract and add:

```ts
type LongFormEpisodeContract = {
  episodeNumber: number;
  arcId: string;
  subArcId: string;
  blockId: string;
  objective: string;
  obstacle: string;
  choice: string;
  cost: string;
  stateDelta: string;
  requiredThreadActions: string[];
  requiredRelationshipEdgeIds: string[];
  requiredEvidenceRefs: string[];
  advantageBeatId?: string;
  characterIntroductions: string[];
  characterExits: string[];
  requiredLookCues: string[];
  worldRuleUses: string[];
  mediaCapabilityNeeds: string[];
  contentBudget: VerticalDramaEpisodeContentBudget;
  speechBudgetPolicyVersion: string;
  perShotSpeechBudgetRefs: string[];
  relationshipGraphRevisionId: string;
  relationshipGraphDependencyRefs: string[];
  closureOrHook: "resolved" | "advanced" | "reframed" | "new_question";
};
```

Every episode still requires a clear objective, obstacle, choice, cost, state
change, and hook. A cliffhanger is not a substitute for a state change.

Strict episode output must also include:

```ts
type RelationshipGraphDelta = {
  operation: "add" | "update_status" | "reveal" | "end" | "retcon";
  edgeId: string;
  fromCharacterKey: string;
  toCharacterKey: string;
  relationType: CharacterRelationshipEdge["relationType"];
  validFromEpisode: number;
  validToEpisode?: number;
  disclosure: CharacterRelationshipEdge["disclosure"];
  beliefState: CharacterRelationshipEdge["beliefState"];
  knownByCharacterKeys: string[];
  evidenceRefs: string[];
  affectedCharacterKeys: string[];
  supersedesRevisionId?: string;
};
```

`episode_memory.relationship_changes` may still be emitted for older readers,
but it must be derived from the accepted graph revision. In strict mode a
relationship change present only in prose or only in the legacy pair array is
invalid and cannot be folded as canonical truth.

### 5.4 Canonical character relationship graph

The series must maintain a versioned `CharacterRelationshipGraph` before deep
episode generation. It is the canonical source for who is related to whom and
how that relationship is valid at a point in the story. It is not merely a UI
diagram and it must be included in every relevant generation and repair context
pack.

```ts
type CharacterRelationshipGraph = {
  schemaVersion: 1;
  vocabularyVersion: string;
  aliasCatalogFingerprint: string;
  graphId: string;
  sourceFingerprint: string;
  nodes: Array<{
    characterKey: string;
    familyGroupIds: string[];
    factionIds: string[];
    status: "active" | "missing" | "presumed_dead" | "dead" | "retired";
  }>;
  edges: CharacterRelationshipEdge[];
  familyGroups: Array<{
    familyGroupId: string;
    label: string;
    side:
      | "maternal"
      | "paternal"
      | "spouse"
      | "adoptive"
      | "guardian"
      | "faction"
      | "unknown";
    memberCharacterKeys: string[];
  }>;
  derivedEdges: Array<{
    edgeId: string;
    derivedFromEdgeIds: string[];
    derivationRule: string;
  }>;
};

type CharacterRelationshipEdge = {
  edgeId: string;
  fromCharacterKey: string;
  toCharacterKey: string;
  relationType:
    | "parent"
    | "child"
    | "sibling"
    | "grandparent"
    | "grandchild"
    | "aunt_uncle"
    | "niece_nephew"
    | "cousin"
    | "relative"
    | "spouse"
    | "ex_spouse"
    | "fiance"
    | "in_law"
    | "friend"
    | "acquaintance"
    | "colleague"
    | "mentor"
    | "ally"
    | "rival"
    | "enemy"
    | "faction_member"
    | "guardian";
  directionality: "directed" | "symmetric";
  familyGroupId?: string;
  familySide?:
    | "maternal"
    | "paternal"
    | "spouse"
    | "adoptive"
    | "guardian"
    | "unknown";
  status:
    | "active"
    | "strained"
    | "broken"
    | "secret"
    | "suspected"
    | "ended"
    | "unknown";
  beliefState: "unknown" | "suspected" | "believed" | "known" | "false";
  validFromEpisode: number;
  validToEpisode?: number;
  disclosure: "private" | "known_to_some" | "public" | "misunderstood";
  knownByCharacterKeys: string[];
  evidenceRefs: EvidenceRef[];
  provenance:
    | "authored"
    | "derived"
    | "episode_fact"
    | "user_approved"
    | "retcon";
  confidence: "high" | "medium" | "low";
  contradictionPolicy: "block" | "repair" | "allow_as_misunderstanding";
};
```

The graph must express, at minimum:

- parent/child, siblings, grandparents, grandchildren, uncle/aunt, cousins,
  relatives, spouses, ex-spouses, fiancés, in-laws such as “wife's younger
  sister”, and family side/household/faction membership;
- friends, acquaintances, colleagues, mentors, allies, rivals, enemies,
  guardians, and faction relationships;
- whether a relationship is public, secret, suspected, misunderstood, or known
  only by selected characters;
- when the relationship becomes true, changes, ends, or is revealed;
- evidence and provenance for every edge, including user-authored decisions,
  episode facts, derived edges, and approved retcons.

Relationship terms must be normalized before they reach the script skill. For
example, “wife's younger sister”, “น้องเมีย”, and “sister-in-law” resolve to a
canonical `in_law` edge with the spouse/family-side provenance; they must not be
treated as unrelated acquaintances. Derived edges such as sibling-in-law may
be computed from explicit spouse and sibling edges, but they retain the source
edge IDs and cannot invent a blood relationship. The alias catalog and
normalization rules are versioned/fingerprinted and included in the source and
run contracts; a retry cannot silently resolve the same term differently.

Graph normalization and invariants are deterministic:

- every edge has a canonical key and stable revision; directed relations
  materialize their valid inverse (`parent`/`child`, `spouse`/`spouse`) while
  symmetric relations never create duplicate competing edges;
- self-edges are invalid; active spouse/fiancé cardinality, parentage age/order,
  and family-group membership are checked within each episode interval. More
  than one active spouse or parent role is allowed only under an explicit
  world-rule/genre contract and approved graph revision;
- spouse, fiancé, sibling, and in-law transitions are time-bounded and cannot
  silently coexist with contradictory active states; an in-law edge derived
  from a spouse's sibling retains provenance and source edge IDs;
- sibling edges are never inferred from name similarity, shared location, or
  dialogue alone; parentage cannot contain a cycle; family-side and faction
  membership must resolve to known groups;
- an episode may propose `add`, `update_status`, `reveal`, `end`, or `retcon`
  only through a typed delta. Each delta names `edgeId`, source/target,
  relation type, evidence refs, valid interval, disclosure, known-by state,
  affected characters, and superseded revision when applicable.

The accepted graph revision also stores a reverse dependency index:

```ts
type RelationshipDependencyIndex = {
  graphRevisionId: string;
  byEdgeId: Record<
    string,
    {
      episodeNumbers: number[];
      shotRefs: string[];
      dialogueRefs: string[];
      memoryEventIds: string[];
      recapRefs: string[];
      castFactionRefs: string[];
      lookWorldRefs: string[];
    }
  >;
  fingerprint: string;
};

type RelationshipGraphQuery = {
  graphRevisionId: string;
  episodeNumber?: number;
  episodeRange?: { startEpisode: number; endEpisode: number };
  familySide?: CharacterRelationshipEdge["familySide"];
  familyGroupId?: string;
  factionId?: string;
  relationTypes?: Array<CharacterRelationshipEdge["relationType"]>;
  statuses?: Array<CharacterRelationshipEdge["status"]>;
  disclosure?: Array<CharacterRelationshipEdge["disclosure"]>;
  arcId?: string;
  candidateGraphRevisionId?: string;
  includeCandidateActiveDiff?: boolean;
  cursor?: string;
  pageSize?: number;
  expectedRedactionPolicyFingerprint?: string;
};

type RelationshipGraphView = {
  graphRevisionId: string;
  episodeNumber: number | null;
  nodes: CharacterRelationshipGraph["nodes"];
  edges: CharacterRelationshipEdge[];
  familyGroups: CharacterRelationshipGraph["familyGroups"];
  nextCursor?: string;
  pageSize: number;
  truncated: boolean;
  redacted: boolean;
  redactedEdgeCount: number;
  redactedEvidenceCount: number;
  redactionPolicyVersion: string;
  redactionPolicyFingerprint: string;
  candidateActiveDiff?: {
    candidateGraphRevisionId: string;
    addedCount: number;
    changedCount: number;
    removedCount: number;
    affectedEpisodeNumbers: number[];
  };
  findingIds: string[];
};

type RelationshipPathQuery = {
  graphRevisionId: string;
  fromCharacterKey: string;
  toCharacterKey: string;
  episodeNumber: number;
  maxHops: 6;
  maxPaths: 3;
  viewpointCharacterKey?: string;
  expectedRedactionPolicyFingerprint?: string;
};

type RelationshipPathCandidate = {
  edgeIds: string[];
  relationLabels: string[];
  derivationRule?: string;
  familyGroupIds: string[];
  familySides: Array<CharacterRelationshipEdge["familySide"]>;
  evidenceRefs: EvidenceRef[];
  validAtEpisode: boolean;
  disclosure: CharacterRelationshipEdge["disclosure"] | "mixed";
};

type RelationshipPathExplanation = {
  graphRevisionId: string;
  fromCharacterKey: string;
  toCharacterKey: string;
  episodeNumber: number;
  pathKind:
    | "direct"
    | "derived"
    | "multiple_valid_paths"
    | "ambiguous"
    | "none";
  paths: RelationshipPathCandidate[];
  maxHops: number;
  maxPaths: number;
  truncated: boolean;
  redacted: boolean;
  redactionPolicyVersion: string;
  redactionPolicyFingerprint: string;
  findingIds: string[];
};
```

The index is written atomically with an accepted candidate episode. Repair
impact is the transitive closure of these references plus immediate recap,
cliffhanger, reveal, and knowledge neighbors. Missing index entries are a
blocking integrity finding, not permission to perform a whole-season rewrite.

For a selected character pair and episode, the service must accept a bounded
`RelationshipPathQuery` and return a `RelationshipPathExplanation`. A direct edge is shown only when its edge ID
is canonical and valid at that episode. A derived relation such as “น้องเมีย”
must expose the source path (for example spouse → sibling), derivation rule,
family side, and evidence. Multiple valid paths are returned as separate
bounded candidates; `truncated: true` is visible when the hop/path ceiling is
reached. An ambiguous or missing path is a finding and cannot be converted
into a new canonical edge by the UI or an LLM. Viewpoint and permission
redaction applies to every path and evidence reference; a redacted path may
report only a finding/count and never leak secret edge IDs. The resolved
redaction policy version and fingerprint are returned for audit/replay and are
part of the immutable blueprint/run contract; a policy change fences dependent
retrieval, path diagnostics, and repair attempts.

### 5.5 Graph validation and repair impact

The graph validator blocks or repairs:

- a character simultaneously being a parent, sibling, spouse, or stranger in
  the same episode window without a declared story explanation;
- a family edge crossing to an unknown character, unknown family group, or
  impossible timeline;
- a relation being publicly known in dialogue while the graph says secret or
  misunderstood, unless the episode contains the disclosure event;
- a presumed-dead/missing character being treated as active without a valid
  return, resurrection, clone, parallel, or memory-reconstruction rule;
- a marriage/fiancé/divorce/in-law change that has no evidence, state change,
  or consequence;
- a generated speaker claiming knowledge that is not allowed by the graph's
  disclosure and `knownByCharacterKeys` state.
- a character's `beliefState` being treated as canonical truth without evidence;
  misunderstanding, deception, and false beliefs remain viewpoint-scoped
  knowledge facts and cannot rewrite the relationship edge itself.

When a graph edge is wrong, repair impact closure must include the affected
characters, family/faction group, evidence refs, relationship/knowledge
memory, every episode that names or uses the edge, and immediate recap/
cliffhanger neighbors. The repair candidate must be revalidated against the
whole graph and all dependent ledgers before activation. The system must show
the user which episodes and dialogue/state fields will change; it must not
blindly regenerate the entire season.

### 5.6 User-visible relationship map

The UI must provide a graph/timeline view with:

- nodes for characters and family/faction groups;
- labeled, directional or symmetric edges with relation type and status;
- filters for family side, faction, relationship type, secrecy, arc, and
  episode range;
- an episode slider showing how the graph changes over time;
- evidence links to the source episode/shot/beat and provenance badge;
- suspicious/contradiction indicators and a candidate-versus-active diff;
- “repair affected content” action that opens the bounded Feature 152 repair
  flow with the computed impact set.

The graph is read-only by default. User edits create an approved source change
and a new blueprint/attempt; they never mutate active story truth silently.

Graph retrieval is bounded and server-authorized. `getCharacterRelationshipGraph`
must support episode/timeline, family-side/group, faction, relation-type,
status/disclosure, arc, cursor, and page-size filters. `pageSize` defaults to 100 and
is capped at 200; the response exposes `nextCursor`, `truncated`, redacted
counts, the redaction policy lineage, and an optional aggregate
candidate-versus-active diff. Secret edge/evidence IDs are never included in
redacted counts or diff fields.

## 6. Series memory and truth architecture

### 6.1 Memory layers

Feature 153 extends the existing `vertical_drama_memory_events`,
`vertical_drama_memory_snapshots`, and `vertical_drama_series.memory` model into
five logical layers:

1. **Immutable source memory:** approved premise, blueprint, story bible,
   canonical roster, world rules, source fingerprints, and user decisions.
2. **Append-only event memory:** episode facts, thread transitions,
   relationship/knowledge changes, character lifecycle changes, world-rule
   uses, advantage exchanges, look transitions, and approved retcons.
3. **Current truth projection:** the latest valid state for each character,
   relationship graph edge, thread, mystery evidence item, world rule, and
   look, including the disclosure/known-by state needed by dialogue.
4. **Arc/block snapshots:** compact checkpoints at block completion and arc
   gates, each with source/version/checksum and the last folded episode.
5. **Retrieval pack:** bounded context selected for a specific episode, repair,
   critic, or finale gate, with included IDs, freshness, source paths, and
   omitted optional content recorded.

The existing `VdSeriesMemory` and `foldSeriesMemory` remain compatible readers.
New fields are additive and legacy series continue to receive deterministic
fallback memory. No writer may silently replace an approved user edit or
mutate an old event in place.

### 6.2 Truth precedence

When two memories disagree, the resolver uses this order:

1. approved immutable source/bible decision;
2. approved retcon with explicit supersession;
3. latest deterministic episode fact that passed the final gate;
4. latest skill-authored projection with valid evidence;
5. unapproved candidate or low-confidence inference (context only, never
   canonical truth).

Contradictions become findings. They are not resolved by whichever model call
ran last. A retcon requires reason, affected episodes, superseded event IDs,
new evidence/world rule, approval policy, and a fresh impact-closure review.

### 6.3 Retrieval policy

Every context pack must include, in priority order:

- premise, terminal answer, forbidden contradictions, and user locks;
- current arc/sub-arc/block contract and entry state;
- active central-mystery evidence obligations and overdue payoffs;
- current protagonist/antagonist advantage and unresolved costs;
- relationship graph edges for required characters, including family side,
  disclosure, known-by state, and active episode validity;
- characters present/required in the target episode and their knowledge state;
- last episode recap plus adjacent episode obligations;
- only the world rules, look cues, and media capability tags used by the target;
- compact older facts selected by relevance and freshness.

The pack must report `includedMemoryIds`, `sourcePaths`,
`omittedOptionalPaths`, `retrievalPolicyVersion`,
`relationshipRedactionPolicyVersion`, `relationshipRedactionPolicyFingerprint`,
`estimatedTokens`, and a fingerprint. Required truth may not be dropped to fit
a model budget. If it cannot fit, the run stops with a typed context-budget
finding.

Retrieval is viewpoint-scoped. For a character-writing call, secret facts and
knowledge changes are included only when the target character is in
`knownByCharacterKeys` or the episode contract contains the disclosure event.
Critics may receive a redacted audit view with provenance, but generated
dialogue must never receive hidden facts merely because they exist in the
series snapshot. Knowledge leakage is a blocking continuity finding.

The Feature 152 run contract must carry independent, non-placeholder
fingerprints for `source`, `architecture`, `storyDesign`, `storyControl`,
`relationshipGraph`, `durationProfile`, `speechBudgetPolicy`, `castPolicy`,
`memoryPolicy`, `benchmarkPolicy`, `antiDriftPolicy`, `planChunkPolicy`,
`retryPolicy`, `sloPolicy`, `executionPolicy`, relationship-redaction policy,
pricing snapshot, and plan
coverage. A run is stale if any
required fingerprint changes. Reusing the same
source fingerprint in multiple fields is allowed only when the contract also
records that the component was intentionally identical and proves its schema
version; it must not be used as a shortcut for missing component snapshots.
The same run contract also carries `feature151AdapterContractVersion`,
`feature152AssuranceContractVersion`, `providerPolicyFingerprint`,
`safetyPolicyVersion`, `locale`, `relationshipVocabularyVersion`,
`relationshipRedactionPolicyVersion`, and
`relationshipRedactionPolicyFingerprint`; any incompatible inherited version
fails admission closed.

## 7. Mystery, thread, consequence, and advantage ledgers

### 7.1 Mystery closure ledger

Add a typed ledger (prefer an additive member of the existing quality-ledger
contract) with:

```ts
type MysteryClosureRow = {
  mysteryId: string;
  kind: "central" | "arc" | "character" | "world";
  question: string;
  canonicalAnswer: string;
  ownerCharacters: string[];
  plantRefs: EvidenceRef[];
  advanceRefs: EvidenceRef[];
  reframeRefs: EvidenceRef[];
  revealWindow: { startEpisode: number; endEpisode: number };
  payoffRefs: EvidenceRef[];
  consequenceRefs: EvidenceRef[];
  status:
    | "planned"
    | "planted"
    | "advancing"
    | "reframed"
    | "paid_off"
    | "sequel_hook"
    | "blocked";
  unresolvedReason?: string;
};
```

The finale gate blocks when a central mystery lacks a valid plant/evidence /
reveal/payoff/consequence chain. An arc or character mystery may be carried
only when its closure policy and next owner are explicit.

### 7.2 Thread and consequence rules

- Reuse `storyControlThreadSchema`, `VdOpenThread`, and the thread ledger.
- Every thread has one canonical ID, owner, class, opening episode, expected
  resolution window, cost, and final status.
- A thread cannot disappear from memory; resolution creates a resolved event.
- A new thread is rejected if it has no payoff/closure policy.
- A thread idle beyond a configurable threshold (default 8 episodes for an
  active arc, 12 for a season thread) becomes a blocking or approval finding.
- Every major action must create a consequence or explicitly state why no
  durable consequence is expected.

### 7.3 Advantage exchange

Reuse `advantageBeatPlanSchema` but add arc/block ownership and a state
transition. Every major confrontation records:

- who gained the advantage;
- what it cost them;
- what the opponent learned or lost;
- the opponent's response/countermeasure;
- what changed in the next episode or block.

An arc cannot pass with repeated protagonist wins or antagonist wins that have
no cost, response, or escalation. The system must expose an advantage timeline
to the critic and UI diagnostics.

### 7.4 Long-form engagement and anti-drift health

Add a versioned engagement-health policy across the full season, not only the
human sample:

- consecutive episodes may not reuse the same objective/obstacle/cliffhanger
  pattern without a state change or deliberate escalation reason;
- antagonist tactics, locations, dominant speakers, and reversal shapes receive
  repetition signals so a long season does not become template loops;
- every episode hook must either advance a tracked question, reframe evidence,
  change leverage, or create a bounded new thread with an owner and payoff;
- character screen-time and self-directed decision distribution are checked so
  supporting characters are not decorative and the protagonist is not absent
  from the causal spine;
- a low novelty or curiosity score creates a repair finding and cannot be
  hidden by valid JSON or a passing local episode gate.

The policy is configurable by genre, but its version and thresholds are frozen
in the run contract and evaluated across all accepted episodes.

The initial baseline must materialize at least these values before generation:
no identical objective/obstacle/cliffhanger signature within the previous
three episodes unless escalation is recorded; no more than two consecutive
episodes with the same dominant location or tactic without a state-changing
justification; and every core/recurring character must receive one meaningful
self-directed decision within its configured active window. Genre overrides
may relax or tighten these values only by creating a new versioned policy.

## 8. Adaptive cast and fictional late-entry guest characters

### 8.1 Cast tiers and lifecycle

The system must not cap a long-form series at five or six characters. It must
support a planned cast that expands and contracts:

| Tier           | Purpose                                                            | Typical lifecycle                                   |
| -------------- | ------------------------------------------------------------------ | --------------------------------------------------- |
| Core           | Protagonist, antagonist, primary relationship, central family      | Series-wide; state and knowledge are always tracked |
| Recurring      | Allies, rivals, family, mentors, institutional actors              | Reappears across multiple arcs                      |
| Arc            | Arc-specific conflict, witness, client, faction member             | Enters and exits within a declared window           |
| Faction/world  | Group representative, commander, creature, AI, supernatural entity | Supports world/power logic and can rotate           |
| Guest/surprise | Fictional late-entry character with material story effect          | Short window, strongly constrained, explainable     |

Every non-core character must have a lifecycle contract:

```ts
type CharacterLifecycleContract = {
  characterKey: string;
  tier: "core" | "recurring" | "arc" | "faction" | "guest";
  firstEpisode: number;
  lastPlannedEpisode?: number;
  narrativePurpose: string;
  entryEvidence: EvidenceRef[];
  exitOrPayoff: string;
  knowledgeBoundary: string[];
  relationshipEdges: string[];
  threadOwnership: string[];
  visualBibleRef: string;
  wardrobeLookRefs: string[];
  ageRating: string;
  mediaCapabilityNeeds: string[];
};
```

`CastExpansionPolicy` must be an executable versioned policy, not only a
qualitative recommendation:

```ts
type CastExpansionPolicy = {
  policyVersion: string;
  maxActiveCharactersPerEpisode: number;
  maxNewCharactersPerBlock: number;
  maxGuestCharactersPerArc: number;
  maxGuestCharactersInFinalTwoEpisodes: number;
  minMeaningfulActionsBeforeExit: number;
  maxDialogueOwnersPerEpisode: number;
  maxVisualAssetLoadPerBlock: number;
  overflowAction: "merge" | "exit" | "split_block" | "needs_approval";
};
```

The exact values are profile-configurable, but every value is frozen in the
run contract and checked at block/arc gates. A series cannot pass by adding
characters without measuring cognitive, dialogue, visual, and credit load.

The initial cast-density baseline is 8 active characters per episode, 2 new
characters per block, 1 guest per arc, 1 guest maximum across the final two
episodes, 6 dialogue owners per episode, and 12 visual-asset loads per block.
These are calibration defaults rather than a universal creative limit; any
genre override must be recorded in the run contract.

The cast-density policy must consider active characters per block, cognitive
load, dialogue ownership, visual asset cost, and whether a new character
replaces, graduates, exits, or supplements an existing role. It may recommend
an arc roster before generation; it must never silently invent a person in the
script and then bypass roster/visual/continuity validation. Every
`relationshipEdges` reference must resolve to the canonical relationship graph;
the character lifecycle is not allowed to carry a private competing relation.

### 8.2 Guest/surprise contract

“Guest star” is a fictional character, not a real celebrity. The permitted
types are:

1. **Seeded surprise:** a prior object, name, message, witness, or rumor plants
   the possibility before the reveal.
2. **Latent return:** a person presumed missing/dead returns only when there is
   no hard death proof, or an explicit fantasy/sci-fi rule supports clone,
   parallel identity, memory reconstruction, or equivalent.
3. **Controlled new arrival:** a new villain, childhood fiancé, relative,
   investigator, or faction representative appears late with a world/plot
   reason and bounded information.

For a guest introduced in the final two episodes:

- the lifecycle contract must exist before script generation;
- the entry must reframe or complete an existing thread, not create an
  unrelated replacement story;
- at least one prior evidence path or valid world-rule explanation is required;
- the guest may change the balance but cannot solve the entire central conflict
  without protagonist agency and an earned cost;
- the guest must have a material purpose, a visible effect, and a payoff/exit
  or explicitly approved sequel hook;
- the guest cannot contradict hard identity, death, timeline, or relationship
  facts without the retcon protocol;
- the finale gate checks the guest's first appearance, knowledge boundary,
  causal contribution, and post-appearance state.

No guest is permitted merely to manufacture a last-minute shock. A failed guest
contract is a targeted repair or a blocking finding, not a warning that can be
ignored.

### 8.3 Identity and reference-image boundary

The canonical `characterKey`, identity lock, age, role, and relationship facts
remain story truth. A user-provided reference image can influence visual
rendering only within the existing visual-bible and safety policy. It may not
rename, merge, age, resurrect, replace, or otherwise rewrite the narrative
character. A visual reference mismatch becomes a visual QC finding.

## 9. Genre, world rules, and media capability

### 9.1 Genre profile

Add a provider-neutral genre profile to the blueprint/bible:

```ts
type GenreProfile = {
  primary:
    | "realistic"
    | "romance"
    | "fantasy"
    | "sci_fi"
    | "cartoon"
    | "hybrid";
  spectacleLevel: "grounded" | "heightened" | "epic";
  realismMode: "photoreal" | "cinematic" | "stylized" | "animation_like";
  combatMode: "none" | "grounded" | "stylized" | "supernatural";
  intimacyPolicy: "emotional_only" | "cinematic_non_explicit";
  requiredWorldRuleIds: string[];
};
```

### 9.2 World and power rulebook

Fantasy, sci-fi, cartoon, future, and miracle-like scenes require explicit
rules before they are generated:

- source/origin of power or technology;
- capability and hard limitation;
- cost, cooldown, risk, or consequence;
- who can use it and what knowledge is required;
- escalation ceiling and what would count as a contradiction;
- visual signature and media constraints;
- how the rule affects ordinary life and character choices.

“Miracle” is a narrative event with a declared rule and cost, not a free
solution. Cartoon exaggeration may bend physics only inside the active style
contract. Realistic combat requires tactical cause/effect, physical cost, and
age/safety review. A new rule introduced late must be a seeded rule, a declared
reveal of an existing rule, or an approved retcon.

### 9.3 Media capability contract

Scene plans may request capability tags such as:

`future_world`, `fantasy_power`, `miracle_event`, `realistic_combat`,
`cartoon_exaggeration`, `large_scale_vfx`, `creature_or_entity`,
`romance_intimacy`, `environmental_transformation`.

The provider/model policy resolves each tag to an available capability,
fallback, or `unavailable`. The story generator must not claim that a future
model supports a capability until the provider registry and runtime contract
confirm it. If unavailable, the system offers a narrative-safe fallback or
blocks the scene; it does not silently downgrade a promised spectacle.

`romance_intimacy` is limited to adult, consent-aware, non-explicit cinematic
staging and must change relationship state or plot. Minor characters are never
eligible for sexualized or intimate content. Existing audience-age and safety
contracts remain authoritative.

## 10. Story-cued wardrobe and visual look continuity

### 10.1 Look admission principle

The story must contain a concrete cue before the system recommends or creates
a new recurring outfit/look. Valid cues include:

- formal event, gala, wedding, ceremony, interview, or performance;
- rural/home/working setting requiring a different practical outfit;
- travel, weather, season, location, occupation, faction, or time jump;
- sleep, recovery, hospital, bathing, training, combat, disguise, or injury;
- relationship/status transition represented by an intentional styling change.

“Make the character look different” without a narrative cue is not enough for
automatic look creation. The UI may let a user manually request a look, but it
must label that look as user-authored and preserve its scope/approval state.

### 10.2 Wardrobe look ledger

Add a `WardrobeLookLedger` as an additive, versioned story ledger. It must
reference existing character rows/variants rather than replace them:

```ts
type WardrobeLookLedgerRow = {
  lookId: string;
  characterKey: string;
  variantCharacterKey?: string;
  variantType: "base" | "outfit" | "age_stage";
  description: string;
  wardrobeRuleRefs: string[];
  storyCue: {
    type:
      | "event"
      | "location"
      | "weather"
      | "time"
      | "role"
      | "continuity"
      | "user_authored";
    episodeNumber: number;
    sceneOrShotRefs: string[];
    reason: string;
  };
  firstUseEpisode: number;
  lastUseEpisode?: number;
  continuityState: string[];
  requiredAccessories?: string[];
  approvedReferenceAssetIds?: string[];
  status: "planned" | "approved" | "active" | "retired" | "blocked";
  sourceFingerprint: string;
};
```

The ledger must enforce:

- no look without a story cue or explicit user-authored approval;
- the same look remains stable within a continuous scene/time window;
- location/time/weather/continuity transitions can change the look only when
  the script or state ledger records the transition;
- wet, dirty, torn, bloodied, injured, or repaired state persists until a
  cleanup/change event;
- outfit variants do not create a new identity or face reference;
- visual prompts receive `lookId`, wardrobe description, approved references,
  and continuity state as structured facts;
- a reference image may be used for visual fidelity but cannot override the
  story cue, identity lock, age, role, or safety rules.

Examples that must be expressible and testable: gala → formal evening look,
return to rural home → practical home/rural clothes, travel → travel outfit,
night/rest → sleepwear, training or battle → approved combat look, recovery →
wardrobe and injury continuity. The planner should not generate these looks
from prose inference alone; it should emit explicit cue rows in the ledger.

## 11. Skill-first generation and review pipeline

### 11.1 Required skills and responsibilities

| Stage             | Existing/new skill responsibility                                                   | Server authority                                               |
| ----------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Blueprint         | Existing story architecture/draft design skills plus new long-form planner contract | Validate hierarchy, IDs, windows, endpoint, budget             |
| Arc planning      | Existing story-control/quality-ledger planning plus reverse reveal planner          | Validate ownership, evidence, costs, cast/look/world schedules |
| Block authoring   | `vertical-drama-full-story-architect` and script producer                           | Emit episode contracts and structured drafts                   |
| Memory extraction | Existing episode-memory block with additive long-form fields                        | Validate facts and append events/projection                    |
| Critique          | `vertical-drama-season-dramaturgy-critic`, alignment reviewer, ledger reconciler    | Decide blocking findings and repair scope                      |
| Repair            | Existing Feature 152 bounded repair adapter                                         | Apply only allowlisted paths; create child attempt             |
| Visual prep       | Existing visual bible, character variants, scene/frame continuity skills            | Resolve approved look IDs and drift findings                   |
| Finale            | New closure critic contract plus deterministic closure validator                    | Only server final gate may pass/activate                       |

Skills may propose content, but cannot directly persist a character, look,
memory event, provider job, credit mutation, or active story version.

### 11.2 Blocked-loop sequence

```text
admit -> snapshot -> reverse-plan -> blueprint gate
  -> generate one block (5–10 episodes, configurable)
  -> checkpoint each episode
  -> deterministic structure/identity/ledger/look/world checks
  -> semantic alignment + dramaturgy review
  -> targeted repair and impact closure
  -> block gate + memory snapshot
  -> next block / arc gate
  -> finale closure gate -> candidate/approval/activation
```

The exact block size is policy-configurable. It must not exceed the context,
credit, timeout, or repair-impact budgets in the immutable Feature 152 run
contract. A failed block does not invalidate accepted prior blocks; a source
fingerprint change creates a new attempt.

### 11.3 Agents SDK boundary

If enabled, the adapter maps this feature's domain contract into Feature 151's
`AgentTaskContract`, preserving contract hash, evidence policy, output schema,
side-effect policy, provider policy, budgets, tracing, and event cursors. The
agent may coordinate:

- blueprint planner;
- block author;
- memory/ledger extractor;
- dramaturgy/alignment critic;
- bounded repair author.

The server still performs all deterministic validation, state transitions,
fencing, credits, persistence, and final-gate decisions. Streaming events are
progress only and replay must be idempotent.

## 12. Quality gates and acceptance thresholds

Thresholds below are policy-configurable but must be versioned in the run
contract. A high aggregate score cannot override a blocking invariant.

### 12.1 Blueprint/arc gates

- 100% requested episode numbers belong to exactly one block/arc.
- The terminal episode and recommended horizon are explicit.
- 100% of central mystery rows have plant, advance, reveal, payoff, and
  consequence windows before deep generation.
- Every thread has owner, evidence, payoff/closure policy, and cost.
- Every arc has protagonist objective, antagonist objective, pressure, cost,
  reversal, entry state, and exit state.
- Every planned new character/look/world rule has an introduction/use window.
- No unresolved blocking contradiction in source, roster, or world rulebook.

### 12.2 Episode/block gates

- 100% of requested episodes and required shots are present.
- Every episode has objective, obstacle, choice, cost, state delta, and hook.
- Every required character, location, thread action, evidence ref, world rule,
  and look cue is either realized or produces a blocking finding.
- No orphan thread, orphan character, unknown speaker, duplicate payoff, or
  impossible timeline transition.
- No thread exceeds its idle threshold without an explicit approved reason.
- Every advantage beat includes cost and opponent response.
- Every new character has valid entry evidence, purpose, knowledge boundary,
  visual bible, and exit/payoff/continuation state.
- Every new look has a story cue and valid continuity state.

### 12.3 Finale closure gate

The final gate blocks unless:

- the central mystery answer is stated consistently with all hard facts;
- all required plants have a valid evidence/payoff chain;
- the protagonist and antagonist causal actions lead to the ending;
- the protagonist has meaningful agency in the final resolution;
- major character arcs have a resolution, deliberate open state, or approved
  sequel hook;
- every required thread is `resolved` or an explicitly permitted sequel hook;
- the final advantage/cost state is consistent with the prior ledger;
- the relationship graph and all relationship-dependent dialogue/knowledge
  states are consistent through the terminal episode;
- guest characters introduced late have material payoff/exit and do not erase
  earlier causality;
- world/power rules, relationships, knowledge, identity, and wardrobe state
  are consistent through the terminal episode;
- no critical deterministic, alignment, safety, or provider capability finding
  remains;
- the candidate passes the same Feature 152 source, budget, credit,
  fingerprint, approval, and atomic activation rules.

The gate may report craft scores and human-review recommendations, but it must
not claim “Chinese-drama quality” as a deterministic fact.

### 12.4 Chinese-drama-comparable quality benchmark

The product quality target is measured as a benchmark with two layers:

1. **Deterministic floor:** relationship graph consistency, central-mystery
   closure, episode hooks/state changes, escalation, character agency,
   advantage/cost exchange, visual/look continuity, and no critical orphan or
   contradiction.
2. **Human/sample craft rubric:** reviewers sample early, middle, late, and
   finale blocks and score 1–5 for relationship complexity/readability,
   emotional escalation, reveal satisfaction, dialogue/character voice,
   antagonist pressure, episode-to-episode curiosity, visual variety, pacing,
   cultural plausibility, and ending payoff.

The release profile must define minimum floors and confidence intervals for the
sample. A series cannot be labeled “Chinese-drama-comparable” from JSON/schema
validity alone. If the sample fails a craft dimension, the system records a
quality finding and recommends targeted arc/block repair or human rewrite; it
does not hide the result behind a high aggregate score.

The benchmark protocol is operational and versioned:

- use fixed sampling windows: episodes 1–3, 10%, 25%, 50%, 75%, 90%, and the
  final two episodes, rounded deterministically for the requested horizon;
- use at least two independent reviewers for a release candidate and record
  per-dimension scores, inter-rater agreement, disagreement, and adjudication;
- define a per-dimension floor for critical dimensions (closure, continuity,
  curiosity, emotional escalation, and ending payoff); no aggregate score can
  compensate for a critical floor failure;
- every failed dimension produces a finding linked to arc/block/episode paths
  and must be repaired, accepted as a human override, or reported as a release
  blocker.

The initial benchmark policy is frozen in the run contract:

```ts
type HumanQualityBenchmarkPolicy = {
  policyVersion: string;
  rubricVersion: string;
  calibrationSetVersion: string;
  reviewerCount: 2;
  calibrationRequired: true;
  criticalFloor: 4;
  nonCriticalFloor: 3;
  weightedSampleFloor: 3.6;
  minimumAgreement: 0.6;
  agreementStatistic: "weighted_cohens_kappa";
  confidenceLevel: 0.95;
  confidenceMethod: "bootstrap_percentile";
  bootstrapResamples: 2000;
  bootstrapSeedSource: "result_id_and_policy_fingerprint";
  minimumDistinctSampleEpisodes: 8;
  disagreementAction: "adjudicate";
};

type HumanQualityBenchmarkResult = {
  resultId: string;
  policyVersion: string;
  policyFingerprint: string;
  rubricVersion: string;
  calibrationSetVersion: string;
  sampledEpisodeNumbers: number[];
  samplingFingerprint: string;
  reviewArtifactIds: [string, string];
  reviewerCount: 2;
  perDimensionScores: Record<
    string,
    {
      reviewerScores: [number, number];
      weightedMean: number;
      confidenceInterval95: [number, number];
      passed: boolean;
      findingIds: string[];
    }
  >;
  weightedSampleScore: number;
  agreementStatistic: "weighted_cohens_kappa";
  agreementScore: number;
  finalDimensionScores: Record<string, number>;
  bootstrapSeed: string;
  bootstrapResamples: 2000;
  adjudicationArtifactId?: string;
  adjudicationStatus: "not_required" | "required" | "completed";
  confidenceStatus: "sufficient" | "insufficient" | "failed";
  comparableQualityLabelEligible: boolean;
  generatedAt: string;
};

type LongFormBenchmarkFinalizationReference = {
  resultId: string;
  resultFingerprint: string;
  policyFingerprint: string;
  reviewArtifactIds: [string, string];
  adjudicationArtifactId?: string;
  confidenceStatus: "sufficient" | "insufficient" | "failed";
  comparableQualityLabelEligible: boolean;
};

type HumanQualityReviewArtifact = {
  reviewArtifactId: string;
  candidateRevisionId: string;
  reviewerSubjectRef: string;
  blindSessionId: string;
  rubricVersion: string;
  policyFingerprint: string;
  samplingFingerprint: string;
  sampledEpisodeNumbers: number[];
  dimensionScores: Record<string, number>;
  calibrationPassed: boolean;
  contentRevisionFingerprint: string;
  submittedAt: string;
};

type HumanQualityAdjudicationArtifact = {
  adjudicationArtifactId: string;
  sourceReviewArtifactIds: [string, string];
  adjudicatorSubjectRef: string;
  finalDimensionScores: Record<string, number>;
  decision: "pass" | "repair" | "release_blocked";
  createdAt: string;
};
```

Reviewers score independently and blind to the other reviewer's scores. The
The canonical sampling function is:

```text
sample(h) = sort(unique(clamp(1, h, round_half_up(p * h))
  for p in [1/h, 2/h, 3/h, .10, .25, .50, .75, .90,
            (h - 1)/h, 1]))
```

The first three terms represent episodes 1–3, the percentage terms represent
the fixed horizon windows, and the last two terms represent the finale. The
sampling windows are deduplicated and sorted before scoring. A long-form
release candidate must contain at least eight distinct sampled
episodes; if the requested horizon is shorter, all available episodes are
sampled but the result is marked confidence-insufficient and cannot receive
the comparable-quality label. The calibration set is versioned and includes
one passing, one borderline, and one failing reference. Weighted agreement
uses the declared statistic; if agreement or the 95% bootstrap confidence
rule is below the policy floor, the result has `confidenceStatus: "failed"` or
`"insufficient"`, `comparableQualityLabelEligible: false`, and the release is
blocked until a repeat sample passes.

Reviewer artifacts are immutable, tenant-scoped, and bound to the candidate
revision, content fingerprint, policy/rubric versions, and sampling
fingerprint. A reviewer sees only the assigned blind session and never the
other reviewer's scores. Adjudication is permitted only after both independent
artifacts exist and disagreement requires it. The adjudication artifact and
the final benchmark result are the only sources allowed to set
`comparableQualityLabelEligible`.

### 12.5 Cost, time, and quality SLO contract

`quality_120` and `extended_long_form` use separate, versioned policy records.
At admission, the UI and immutable run contract must record at least:

| Field                                | Required behavior                                                                                                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| max blocks in flight                 | bounded concurrency; default one active block per series                                                                                                             |
| estimated author/review/repair calls | calculated from episode count and mode                                                                                                                               |
| max repair rounds                    | materialize `maxRepairRoundsPerWorkUnit: 3` by default; stop with `needs_repair` instead of retrying forever                                                         |
| wall-clock range                     | shown before paid work and updated from actual telemetry                                                                                                             |
| credit reserve/ceiling               | reserve before generation; reconcile actual usage                                                                                                                    |
| retry/idempotency                    | reserve per plan chunk/block; reuse work-unit idempotency key; reconcile unknown provider outcomes before another paid attempt; accepted work is never charged twice |
| retry policy baseline                | one schema-correction retry, two transient-provider retries, and two paid plan-chunk retries; persist policy version/fingerprint before paid work                    |
| model/pricing snapshot               | persist model/provider, pricing revision, estimated tokens, reserved credits, and hard spend ceiling before paid work                                                |
| over-budget behavior                 | stop before exceeding the ceiling, preserve accepted checkpoints, and move to `awaiting_approval` or `needs_repair`; never silently downgrade quality or spend more  |
| lease/heartbeat/watchdog             | reuse Feature 152 story-job lease/fence/heartbeat; expired queued/running work becomes resumable partial/reconciliation state                                        |
| cancellation/pause                   | checkpoint before stopping when possible, request provider cancellation, release or reconcile unused reservation, and make resume scope explicit                     |
| checkpoint/context size              | compact deterministically; fail with a typed context-budget finding if required truth cannot fit                                                                     |
| partial policy                       | preserve accepted blocks and expose resumable scope; never mark incomplete output successful                                                                         |

Policy values may evolve, but a run cannot change them mid-flight. A 500-episode
request must use synthetic scheduling or child horizons to prove feasibility; it
must not imply 500 simultaneous live model calls.

### 12.6 Lossless memory compaction and revision invalidation

Snapshots are derived caches over append-only events. Compaction must preserve
hard facts, evidence/source IDs, unresolved and resolved thread IDs, mystery
closure rows, relationship graph revisions and disclosure states, advantage and
cost state, character lifecycle, look continuity, world-rule limits, provider
capability decisions, and retcon supersession lineage. It may replace prose
with structured recaps and references, but it may not summarize away an
unresolved obligation or downgrade canonical truth.

Before a compacted snapshot becomes retrievable, the service must replay the
retained event window and compare canonical fingerprints and required-ID sets
with the pre-compaction projection. Any mismatch leaves the snapshot
`needs_repair` and blocks dependent generation. Every snapshot stores
`compactionPolicyVersion`, `preCompactionFingerprint`,
`postCompactionFingerprint`, and a deterministic `requiredTruthIds` digest.

Any change to source revision, locale, genre profile, target horizon, duration
profile, cast/memory policy, or approved relationship-graph revision marks
dependent plan chunks and blocks stale. Accepted content remains readable, but
new work must start from a fresh candidate with a new predecessor and
component fingerprints; mixed-revision context is never allowed.

### 12.7 Runtime reliability and work-unit lifecycle

Feature 153 reuses the existing story-generation run/job repository, lease,
heartbeat, fence token, cancellation request, checkpoint, and resume fields.
It must not introduce a second long-form worker state machine. Each plan chunk
and block records a work-unit lifecycle:

```text
queued -> leased/running -> checkpointed -> validating
  -> passed | partial | needs_repair | awaiting_reconciliation
  -> awaiting_approval -> activated | cancelled | failed
```

There are two intentionally separate status planes, not two competing worker
state machines. The existing transport wrapper
(`VerticalDramaStoryJobStatus`) remains `queued | running | succeeded | failed`
and reports queue/worker delivery only. The canonical candidate/run status is
`StoryGenerationStatus` from Feature 152 and carries `validating`, `partial`,
`needs_repair`, `awaiting_reconciliation`, `awaiting_approval`, and
`cancelled` semantics. A transport `succeeded` result is only a worker
completion signal; activation succeeds only when the canonical run reaches
`succeeded` after final-gate validation and durable read-back. A transport
failure must preserve the canonical checkpoint/status and expose a resumable
or reconciliation outcome rather than flattening it to a generic failure.

The watchdog must identify expired leases and stale heartbeats, fence the old
worker, preserve the last accepted checkpoint, and make the work resumable or
reconciliation-required. A browser disconnect is transport-only and cannot
cancel the work. A user cancellation is durable and cannot be overwritten by a
late worker callback. Resume must reuse the candidate/source/component
fingerprints and create a new attempt when the previous attempt is terminal.
Pause and cancel are distinct durable control requests. Pause preserves the run
as resumable and prevents starting the next paid work unit; cancel moves it to
terminal cancellation after provider/credit reconciliation. Neither request
may be overwritten by a late worker update.

## 13. Data and API contract

### 13.1 Additive persistence strategy

Prefer additive versioned JSON contracts in existing `vertical_drama_series`
`bible`/`memory` fields for the first rollout when row-level querying is not
needed. Introduce normalized tables only for data that needs independent
checkpointing, indexing, approval, or high-volume retrieval.

The canonical graph revision and its fingerprint/dependency index are
mandatory. Phase A may store them in the existing versioned series JSON plus
append-only memory events/snapshots, but it must expose the same revision,
checksum, and indexed dependency contract. If the UI or repair workload needs
row-level lookup, `vertical_drama_relationship_graph_revisions` becomes a
required additive migration after schema preflight; it is not an indefinitely
optional design decision.

Candidate additional normalized tables, subject to migration review:

- `vertical_drama_long_form_blueprints` — immutable blueprint revisions and
  fingerprints;
- `vertical_drama_arc_plans` — arc/sub-arc/block plans and gate state;
- `vertical_drama_relationship_graph_revisions` — versioned graph snapshots,
  edge evidence, user-approved changes, and repair-impact lookup;
- `vertical_drama_mystery_closure_rows` — searchable closure evidence;
- `vertical_drama_character_lifecycles` — roster lifecycle and guest contracts;
- `vertical_drama_wardrobe_look_ledger` — cue, look, variant, and continuity;
- `vertical_drama_long_form_checkpoints` — block/arc/finale checkpoint state.

Every table must carry tenant, user/owner, series, source/contract revision,
created/updated timestamps, and an idempotency/fingerprint strategy. No table
may weaken existing tenant/user scoping. `vertical_drama_memory_events` and
`vertical_drama_memory_snapshots` remain the canonical event/snapshot home
unless a migration proves an indexed domain table is required.

Accepted episode persistence is one idempotent transaction or a recoverable
outbox protocol with the following order: validate candidate and source
fingerprints, append graph/memory events, update graph/current projections,
write dependency index, write checkpoint, then publish candidate status. A
worker crash between steps must leave a resumable `partial`/
`awaiting_reconciliation` state, never a falsely successful episode. Replays use an idempotency key and
must not duplicate events, credits, graph edges, or dependency references.

Activation is not complete at the write response. After publishing active
status, the service performs a tenant-scoped durable read-back and verifies
active revision, requested coverage, all component/policy fingerprints, graph
dependency-index fingerprint, memory checkpoint, finalization key, and credit
reconciliation, and the `LongFormBenchmarkFinalizationReference` including its
result fingerprint, reviewer/adjudication artifact IDs, confidence status, and
label eligibility. Any mismatch moves the candidate to
`awaiting_reconciliation` and suppresses a success result. An internal
reconciliation phase may explain which read-back component is being repaired,
but must not become a second public status.

The run repository must persist a typed control request separate from terminal
status, at minimum `none | pause | cancel`, with requester, timestamp, and
reconciliation outcome. If the existing cancellation-only column cannot carry
this distinction safely, add one approved additive migration during preflight;
do not encode pause as an undocumented status string.

### 13.2 API operations

Extend the existing Vertical Drama tRPC router/services rather than creating a
parallel router:

- `proposeLongFormBlueprint` — generate a candidate blueprint and report mode,
  episode/duration estimate, cast/look/world schedule, and unresolved gates;
- `approveLongFormBlueprint` — commit a candidate under Feature 152 approval
  and source-fingerprint rules;
- `generateLongFormPlanChunk` — generate/resume one disjoint season-skeleton
  interval before deep shot drafting;
- `getLongFormPlanProgress` — report covered intervals, missing plan ranges,
  chunk checkpoints, and truncation/recovery state;
- `generateLongFormBlock` — resume/idempotently generate one block;
- `getLongFormMemoryPack` — return redacted, scoped diagnostics for a target;
- `reviewLongFormClosure` — run closure analysis without activation;
- `createLongFormBenchmarkReview` — create a tenant-scoped blind review
  session from the immutable candidate revision and canonical sample;
- `submitLongFormBenchmarkReview` — validate and persist one immutable
  `HumanQualityReviewArtifact`; it must reject stale candidate/content/policy
  or sampling fingerprints and must not expose the other reviewer's scores;
- `adjudicateLongFormBenchmark` — create a
  `HumanQualityAdjudicationArtifact` only when both independent reviews exist
  and the policy requires adjudication;
- `getLongFormBenchmarkResult` — return the persisted result and redacted
  evidence needed for closure/approval;
- `getCharacterRelationshipGraph` — return a bounded, filtered,
  tenant/permission/viewpoint-redacted `RelationshipGraphView` for the selected
  episode/range, with optional candidate-versus-active diff;
- `getCharacterRelationshipPath` — execute the bounded
  `RelationshipPathQuery` and return the valid, evidence-linked
  `RelationshipPathExplanation` for a character pair at an episode, including
  truncation and tenant/permission/viewpoint redaction state;
- `repairLongFormFindings` — create a bounded child attempt;
- `previewRelationshipGraphEdit` — validate a user graph edit, show affected
  edges/episodes/fields, and reject stale candidates;
- `proposeRelationshipGraphEdit` — create an auditable candidate graph
  revision with optimistic source/revision checks;
- `approveRelationshipGraphEdit` — approve the graph candidate and trigger
  only the required impact-closure repair;
- `approveLongFormCandidate` — activate only after fresh final gate;
- `getLongFormProgress` — expose episode/block/arc coverage, missing work,
  unresolved threads, cast, looks, and cost state.
- `requestLongFormPause` / `requestLongFormCancellation` — persist a durable
  user request against the current run/work unit and expose checkpoint,
  provider-cancellation, and credit-reconciliation state;
- `resumeLongFormRun` — resume only from an accepted checkpoint under the same
  source/component fingerprints, creating a child attempt when required.

API responses must distinguish `succeeded`, `partial`, `needs_repair`,
`awaiting_approval`, `awaiting_reconciliation`, `failed`, and `cancelled` as
Feature 152 requires. A browser disconnect must not cancel or lose the run.

When the strict long-form flag is enabled, all plan/deep/extend/repair writes
must go through candidate revisions and Feature 152 final-gate/approval
semantics. The legacy `generateStoryBible` direct `vertical_drama_series.bible`
write remains a compatibility path for legacy mode only and cannot be used to
activate a Feature 153 candidate.

In strict mode, `generateStoryBible` delegates authoritative season-plan
creation to the resumable plan-chunk job and returns the candidate blueprint
plus plan progress. It must not treat a large inline `episodeBreakdown` as the
authoritative plan. Legacy mode may retain the old response shape, clearly
labeled as compatibility mode.

## 14. Rollout and compatibility

### 14.1 Flags and profiles

Introduce flags/configuration with safe defaults:

- `VERTICAL_DRAMA_LONG_FORM_ASSURANCE` — master flag;
- `VERTICAL_DRAMA_LONG_FORM_QUALITY_MODE` — `quality_120` or
  `extended_long_form`;
- `VERTICAL_DRAMA_LONG_FORM_ARC_GATES` — enable arc/block enforcement;
- `VERTICAL_DRAMA_LONG_FORM_ADAPTIVE_CAST` — enable lifecycle/guest contracts;
- `VERTICAL_DRAMA_LONG_FORM_LOOK_LEDGER` — enable story-cued look validation;
- `VERTICAL_DRAMA_LONG_FORM_CLOSURE_GATE` — enable finale blocking gate;
- `VERTICAL_DRAMA_LONG_FORM_AGENTS_ADAPTER` — opt-in only after Feature 151
  compatibility proof.

Legacy series without a blueprint remain readable and use compatibility mode.
They must be labeled as lower-confidence until a deterministic backfill creates
derived IDs and a user/system gate approves the blueprint. Enabling strict
closure must not reinterpret legacy text as authored evidence.

### 14.2 Migration/backfill

1. Preflight existing Drizzle ledger, constraints, and table lineage.
2. Add only approved additive columns/tables/indexes; follow the repository's
   manual migration convention for the character table lineage where needed.
3. Backfill blueprints from existing `storyControlSeed`, draft story design,
   episode breakdown, memory, and quality ledgers without inventing facts.
4. Mark derived IDs and confidence explicitly.
5. Verify tenant scoping, checksums, row counts, read/write compatibility, and
   rollback before enabling strict gates.
6. Run a shadow closure report on existing series; do not auto-rewrite active
   story content.

## 15. Failure modes and recovery

| Failure                                                               | Required behavior                                                                                                                                                 |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Block times out or worker dies                                        | Persist checkpoint; mark `partial`; resume without regenerating accepted episodes                                                                                 |
| Lease expires or heartbeat stops                                      | Fence the old worker, preserve the last accepted checkpoint, and move to resumable `partial` or `awaiting_reconciliation`; never leave an indefinitely active run |
| Memory event is malformed                                             | Reject only the malformed event, retain valid prior projection, create a finding, never silently erase truth                                                      |
| Contradiction between episodes                                        | Block affected impact closure; request repair or approved retcon                                                                                                  |
| Cast expands beyond policy                                            | Block blueprint/block until role is scoped, exited, merged, or approved                                                                                           |
| Guest appears without seed/reason                                     | Reject or repair guest; it cannot pass as a warning                                                                                                               |
| Presumed-dead return has hard death proof                             | Reject unless an explicit world rule and approved retcon explain it                                                                                               |
| New look lacks a story cue                                            | Do not auto-create variant; request script cue or mark user-authored approval                                                                                     |
| World/power rule has no cost/limit                                    | Block rule or downgrade scene to a declared safe capability                                                                                                       |
| Provider lacks requested media capability                             | Use declared fallback, wait for supported provider, or block; never silently promise unsupported output                                                           |
| Provider/credit outcome unknown                                       | Inherit Feature 152 reconciliation state; never issue an unverified duplicate paid call                                                                           |
| User edits memory or blueprint during run                             | Preserve edit; stale running attempt fails closed and must restart from the new source                                                                            |
| Extended mode budget exhausted                                        | Keep prior accepted blocks, mark remaining scope partial/failed, expose cost and resume path                                                                      |
| 90-second profile/assembly mismatch                                   | Block strict admission or fall back only with explicit legacy-profile disclosure; never render with mixed speech/runtime assumptions                              |
| Large plan response truncates or misses an interval                   | Keep accepted plan chunks, mark the missing interval partial, and resume the plan job; never start deep drafting with a gap                                       |
| Plan chunk overlaps or has a stale predecessor                        | Reject the chunk, preserve accepted neighbors, and regenerate only the candidate chunk with the expected predecessor fingerprint                                  |
| Fingerprint component is missing or copied as an unproven placeholder | Mark run stale/needs repair and require a fresh source snapshot                                                                                                   |
| Viewpoint receives a secret fact                                      | Block the candidate, record a knowledge-leakage finding, redact context, and repair affected dialogue/knowledge paths                                             |
| Cast-density policy overflows                                         | Apply configured merge/exit/split/approval action; never silently add a cast member                                                                               |
| Event/index/checkpoint write crashes mid-commit                       | Reconcile through idempotent replay/outbox and keep candidate partial until all durable references agree                                                          |
| Memory compaction loses a required truth ID                           | Reject the snapshot, retain the prior snapshot/events, and block dependent generation until replay verification passes                                            |
| Retry follows an unknown provider outcome                             | Reconcile provider/credit state first; reuse the same idempotency key and never issue an unverified duplicate paid call                                           |
| Deterministic schema/continuity finding                               | Do not auto-retry indefinitely; create a bounded repair finding and preserve the failed candidate                                                                 |
| Transient provider/transport failure                                  | Retry only within the versioned transient retry budget using the same work-unit idempotency key                                                                   |
| Source or policy revision changes during a run                        | Fence stale chunks/blocks, retain readable accepted content, and resume only from a fresh candidate revision                                                      |
| User pauses or cancels                                                | Persist the request, checkpoint/reconcile the work unit, release or reconcile unused credits, and reject late callbacks from publishing                           |
| Secret graph edge appears in diagnostics                              | Apply viewpoint/permission redaction, record a leakage finding, and do not expose the edge or evidence payload                                                    |
| Activation read-back mismatch                                         | Suppress success, mark the candidate `awaiting_reconciliation`, and reconcile status/coverage/fingerprints/graph/memory/credits before retry                      |
| Horizon extension after terminal planning                             | Create a new candidate, re-plan terminal closure and affected arc exits, and do not append after the old finale blindly                                           |

## 16. Implementation sections for deep-plan

The implementation plan must be sectionized and TDD-oriented. Each section owns
the smallest safe boundary and must list code paths, tests, migrations, and
proof limits.

### Section 01 — Long-form contracts and blueprint admission

Own `storyControl.ts`, `draftStoryDesign.ts`, Feature 152 contracts, new
long-form shared contracts, episode-count/mode/duration resolution, stable IDs,
and blueprint validation. Reuse existing duration and production contracts.

### Section 02 — Reverse planning, arcs, threads, and finale dependencies

Own architecture prompts/services, central-mystery closure rows, arc/sub-arc/
block plans, evidence windows, advantage schedules, and deterministic reverse
planning. Extend, do not replace, existing story-control and draft-quality
checks.

### Section 03 — Memory projection, snapshots, retrieval, and retcon safety

Own `seriesMemoryState.ts`, `verticalDramaSeriesMemoryProjection.ts`, memory
event/snapshot writers, arc/block checkpoints, retrieval packs, checksums,
user-edit precedence, and contradiction/retcon protocol.

### Section 04 — Adaptive cast and fictional guest lifecycle

Own character lifecycle contracts, roster admission, cast-density policy,
guest-entry validation, late-return constraints, character knowledge edges,
and integration with `verticalDramaCharacterVariantPlanner.ts` and character
router persistence.

### Section 05 — World rules, genre profile, and media capability bridge

Own fantasy/sci-fi/cartoon/high-spectacle contracts, power/technology costs,
capability tags, provider-policy resolution, fallbacks, safety/age checks, and
future-provider compatibility tests.

### Section 06 — Story-cued wardrobe/look ledger

Own the additive look ledger, cue extraction/validation, variant reconciliation,
look state transitions, visual prompt facts, and integration with scene/frame
continuity, series look lock, visual bible, and character asset references.

### Section 07 — Block generation, context packs, checkpoints, and resume

Own block orchestration in `verticalDramaStoryBible.ts`, router admission,
`verticalDramaStoryJobs.ts`, context budgeting, durable checkpointing, and
quality/extended mode cost policies. Preserve Feature 152 fencing and
idempotency.

### Section 08 — Ledger reconciliation, targeted repair, and finale gate

Own extensions to `verticalDramaQualityLedgerReconcile.ts`, mystery closure,
cast/look/world checks, impact closure, repair candidate validation, and final
closure decision. No direct JSONB bypass may remain in legacy quality-loop paths.

### Section 09 — Candidate activation, approval, and UI diagnostics

Own tRPC operations, status mapping, progress/recovery UI, arc/memory/cast/look
diagnostics, approval surfaces, redaction, and stale-run handling. Use the
existing assurance panel/status contracts.

### Section 10 — Schema/migration/observability/rollout

Own additive migration, tenant/index checks, metrics for block/arc/finale
failures, cost/time by quality mode, cast/look/closure findings, feature flags,
runbook, backfill, and rollback.

### Section 11 — Proof and gap closure

Own fixtures, deterministic replay, contract tests, focused integration tests,
browser evidence where UI is changed, and explicit separation of local proof
from provider, production, migration, and live deployment proof.

## 17. Acceptance matrix

| ID       | Acceptance criterion                                                                                                                                                                                                                          | Required proof                                                      | Status at spec time |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------- |
| AC153-01 | 120×90s quality recommendation is calculated and displayed                                                                                                                                                                                    | shared contract + router tests                                      | Planned             |
| AC153-02 | >120 requests remain supported in explicit extended mode                                                                                                                                                                                      | 121/150/500 deterministic admission fixtures                        | Planned             |
| AC153-03 | Existing target count up to 1000 remains compatible                                                                                                                                                                                           | input regression tests                                              | Planned             |
| AC153-04 | Every episode maps uniquely to block/sub-arc/arc                                                                                                                                                                                              | blueprint validator + 120-episode fixture                           | Planned             |
| AC153-05 | Reverse-planned central mystery has complete closure metadata                                                                                                                                                                                 | fixture from episode 1 plant to finale                              | Planned             |
| AC153-06 | New orphan/no-payoff threads are blocked                                                                                                                                                                                                      | negative contract tests                                             | Planned             |
| AC153-07 | Idle thread thresholds and consequence gaps are detected                                                                                                                                                                                      | ledger reconcile tests                                              | Planned             |
| AC153-08 | Protagonist/antagonist advantage exchanges carry cost and response                                                                                                                                                                            | schedule/reconcile tests                                            | Planned             |
| AC153-09 | Memory event/snapshot/projection/retrieval preserve canonical truth                                                                                                                                                                           | pure fold + DB/service tests                                        | Planned             |
| AC153-10 | Approved memory edits and retcons are never silently overwritten                                                                                                                                                                              | concurrency/approval tests                                          | Planned             |
| AC153-11 | Block/arc checkpoints resume idempotently                                                                                                                                                                                                     | job replay/fence tests                                              | Planned             |
| AC153-12 | Core/recurring/arc/faction/guest lifecycle contracts validate                                                                                                                                                                                 | shared contract tests                                               | Planned             |
| AC153-13 | Guest at episode 119/120 can surprise without breaking causality                                                                                                                                                                              | positive/negative fixtures                                          | Planned             |
| AC153-14 | Presumed-dead return requires valid uncertainty or world rule                                                                                                                                                                                 | negative hard-death fixture                                         | Planned             |
| AC153-15 | Cast density and visual/credit budgets prevent uncontrolled growth                                                                                                                                                                            | policy tests                                                        | Planned             |
| AC153-16 | Fantasy/sci-fi/cartoon rules require limits and costs                                                                                                                                                                                         | world-rule tests                                                    | Planned             |
| AC153-17 | Capability tags resolve provider-neutrally with safe fallback                                                                                                                                                                                 | provider-policy contract tests                                      | Planned             |
| AC153-18 | Unsupported media capability cannot silently pass                                                                                                                                                                                             | blocked/fallback tests                                              | Planned             |
| AC153-19 | Adult non-explicit intimacy obeys plot, consent, and age safety                                                                                                                                                                               | safety/contract tests                                               | Planned             |
| AC153-20 | New wardrobe/look requires story cue or explicit user-authored approval                                                                                                                                                                       | look-ledger tests                                                   | Planned             |
| AC153-21 | Gala/rural/travel/sleep/combat/continuity looks persist correctly                                                                                                                                                                             | transition fixture + visual prompt facts                            | Planned             |
| AC153-22 | Outfit variant never changes canonical identity                                                                                                                                                                                               | character variant regression tests                                  | Planned             |
| AC153-23 | No look/identity drift survives scene/frame QC                                                                                                                                                                                                | existing continuity integration tests                               | Planned             |
| AC153-24 | Every episode has objective/obstacle/choice/cost/state/hook                                                                                                                                                                                   | structural validator tests                                          | Planned             |
| AC153-25 | Targeted repair validates impact closure, not whole-season blind rewrite                                                                                                                                                                      | repair tests                                                        | Planned             |
| AC153-26 | Finale blocks on unresolved central mystery or critical thread                                                                                                                                                                                | closure gate fixtures                                               | Planned             |
| AC153-27 | Finale validates guest payoff/exit and late-cast causality                                                                                                                                                                                    | closure fixture                                                     | Planned             |
| AC153-28 | Candidate/active version and approval semantics inherit Feature 152                                                                                                                                                                           | integration tests                                                   | Planned             |
| AC153-29 | Feature 151 adapter is reused, with hash/budget/side-effect parity                                                                                                                                                                            | adapter contract tests                                              | Planned             |
| AC153-30 | Tenant/user scoping is preserved for all new persistence                                                                                                                                                                                      | query/authorization tests                                           | Planned             |
| AC153-31 | Legacy series receive derived IDs and confidence labels, not invented facts                                                                                                                                                                   | backfill fixture                                                    | Planned             |
| AC153-32 | Rollback leaves active legacy content unchanged                                                                                                                                                                                               | migration rehearsal                                                 | Planned             |
| AC153-33 | UI exposes block/arc/finale progress and actionable failure state                                                                                                                                                                             | jsdom/browser proof as applicable                                   | Planned             |
| AC153-34 | 120-episode deterministic replay is bounded in memory/cost metadata                                                                                                                                                                           | replay/performance test                                             | Planned             |
| AC153-35 | 500-episode technical stress fixture does not require 500 live LLM calls                                                                                                                                                                      | synthetic scheduler test                                            | Planned             |
| AC153-36 | Local proof is separated from live provider/production/deployment proof                                                                                                                                                                       | acceptance matrix/runbook                                           | Planned             |
| AC153-37 | Every character is represented in a canonical relationship graph                                                                                                                                                                              | graph contract + fixture                                            | Planned             |
| AC153-38 | Family, marriage, in-law, faction, friend, rival, and acquaintance edges normalize correctly                                                                                                                                                  | relationship normalization tests                                    | Planned             |
| AC153-39 | Graph edges carry time range, disclosure, known-by state, provenance, and evidence                                                                                                                                                            | graph schema/reconciliation tests                                   | Planned             |
| AC153-40 | Relationship contradictions block or become explicit misunderstandings                                                                                                                                                                        | negative graph fixtures                                             | Planned             |
| AC153-41 | Graph repair computes affected episodes, dialogue, memory, and neighbors                                                                                                                                                                      | repair impact integration test                                      | Planned             |
| AC153-42 | User can inspect graph/timeline/evidence and candidate-vs-active diff                                                                                                                                                                         | UI/jsdom/browser proof                                              | Planned             |
| AC153-43 | Relationship graph is included in generation and repair context packs                                                                                                                                                                         | context-pack tests                                                  | Planned             |
| AC153-44 | Chinese-drama-comparable target uses deterministic floor plus human/sample rubric                                                                                                                                                             | rubric fixture + review record                                      | Planned             |
| AC153-45 | Draft plan cannot pass deep-generation readiness without graph revision, readiness state, and fingerprints                                                                                                                                    | draft/router admission tests                                        | Planned             |
| AC153-46 | Strict episode output emits a validated relationshipGraphDelta and derives legacy pair state from it                                                                                                                                          | schema + episode-memory integration tests                           | Planned             |
| AC153-47 | Inverse/symmetric, cycle, family-side, timeline, and in-law normalization invariants hold                                                                                                                                                     | graph property/negative fixtures                                    | Planned             |
| AC153-48 | Relationship reverse dependency index is atomically written and yields exact repair impact closure                                                                                                                                            | accepted-write + repair integration test                            | Planned             |
| AC153-49 | Graph revision/checksum/dependency index persistence is tenant-scoped and stale-run safe                                                                                                                                                      | repository/migration/concurrency tests                              | Planned             |
| AC153-50 | Quality-mode admission exposes versioned call, repair, time, credit, and context SLOs                                                                                                                                                         | admission/router tests                                              | Planned             |
| AC153-51 | Benchmark uses fixed sampling, independent reviewers, critical floors, and adjudication                                                                                                                                                       | rubric protocol fixture                                             | Planned             |
| AC153-52 | Draft-to-deep-to-extend-to-repair paths all carry graph and closure contracts                                                                                                                                                                 | router/service wiring tests                                         | Planned             |
| AC153-53 | Relationship graph UI remains usable for 120–500 episodes with bounded filtered graph pages, partial/timeline loading, candidate-active aggregate diff, explainable direct/derived/multiple paths, truncation, and redaction                  | router/jsdom/browser/path-performance proof                         | Planned             |
| AC153-54 | Legacy relationshipMap/VdRelationshipState backfill derives IDs/confidence without inventing facts                                                                                                                                            | compatibility migration fixture                                     | Planned             |
| AC153-55 | Architecture, storyDesign, storyControlSeed, and relationship graph persist as one draft source revision                                                                                                                                      | draft persistence/fingerprint integration test                      | Planned             |
| AC153-56 | Registered 90-second profile has nine valid shot durations, matching speech bands, and production-assembly compatibility                                                                                                                      | duration registry + assembly integration test                       | Planned             |
| AC153-57 | 120–1000 episode plan generation is staged, resumable, interval-complete, and does not depend on one oversized LLM response                                                                                                                   | plan chunk/replay/truncation tests                                  | Planned             |
| AC153-58 | Strict Feature 153 runs cannot publish through the legacy direct active-bible write path                                                                                                                                                      | router activation/final-gate regression test                        | Planned             |
| AC153-59 | Run contract contains independent component fingerprints and rejects placeholder/stale coverage                                                                                                                                               | contract/runtime validation tests                                   | Planned             |
| AC153-60 | Viewpoint-scoped retrieval prevents secret/unknown facts from reaching character dialogue generation                                                                                                                                          | knowledge-redaction fixtures                                        | Planned             |
| AC153-61 | Versioned cast-density policy blocks active-cast, guest, introduction, dialogue, or visual-load overflow                                                                                                                                      | cast policy block/arc gate tests                                    | Planned             |
| AC153-62 | Graph edit preview/proposal/approval handles stale revisions and exposes exact impact before repair                                                                                                                                           | router/concurrency/UI tests                                         | Planned             |
| AC153-63 | Accepted episode persistence is idempotent and recoverable across event, projection, dependency-index, checkpoint, and status writes                                                                                                          | crash/replay/outbox integration tests                               | Planned             |
| AC153-64 | Full-season engagement health detects repeated episode patterns, low novelty, weak hooks, and uneven agency distribution                                                                                                                      | anti-drift ledger/replay tests                                      | Planned             |
| AC153-65 | Human quality benchmark persists a typed result with rubric/calibration versions, canonical sampled episodes, confidence intervals/status, reviewer/adjudication artifacts, weighted score, agreement statistic, and finalization eligibility | benchmark sampling/result/calibration/agreement/confidence fixtures | Planned             |
| AC153-66 | The registered 90-second profile maps exactly to the existing duration-plan and production-assembly contracts without logical/render runtime drift                                                                                            | duration adapter/assembly contract tests                            | Planned             |
| AC153-67 | Plan chunks enforce default/max size, zero overlap, predecessor coverage, bounded retries, and deterministic idempotency across 120–1000 episodes                                                                                             | plan policy/gap/overlap/replay tests                                | Planned             |
| AC153-68 | Memory compaction preserves required truth IDs and passes pre/post replay fingerprint verification before retrieval                                                                                                                           | compaction lossless/replay tests                                    | Planned             |
| AC153-69 | Plan/block retry reserves and reconciles credits idempotently, including unknown provider outcomes, without duplicate accepted-work charges                                                                                                   | credit/retry reconciliation tests                                   | Planned             |
| AC153-70 | Anti-drift and cast-density policies persist resolved baseline thresholds and reject paid admission when thresholds are missing                                                                                                               | policy materialization/admission tests                              | Planned             |
| AC153-71 | Relationship diagnostics redact secret edges/evidence according to user permission and viewpoint, pin the redaction policy version/fingerprint, and fence stale policy results to match generation redaction                                  | redacted graph router/UI fixtures and stale-policy tests            | Planned             |
| AC153-72 | Source, locale, genre, duration, horizon, policy, and graph revisions fence stale plan chunks and dependent blocks while preserving accepted content                                                                                          | revision-invalidation integration tests                             | Planned             |
| AC153-73 | Strict long-form runs propagate the canonical duration-to-speech/content-budget policy through draft, deep, script, and storyboard stages                                                                                                     | speech-budget propagation tests                                     | Planned             |
| AC153-74 | Feature 153 reuses lease, heartbeat, fence, watchdog, checkpoint, and resume semantics, maps transport-job status to the canonical run status, and never leaves an expired run indefinitely active                                            | lease-expiry/fence/resume/status-plane integration tests            | Planned             |
| AC153-75 | Relationship graph enforces self-edge, inverse, cardinality, parent-cycle, and belief-state-versus-canonical-truth invariants                                                                                                                 | graph property/negative fixtures                                    | Planned             |
| AC153-76 | Admission persists model/pricing snapshot and hard spend ceiling and stops before an unapproved over-budget call                                                                                                                              | budget-ceiling/admission tests                                      | Planned             |
| AC153-77 | Durable pause/cancel/resume preserves checkpoints, rejects late callbacks, and reconciles unused/unknown credits                                                                                                                              | lifecycle/cancellation/reconciliation tests                         | Planned             |
| AC153-78 | Phase A storage exposes atomic repository writes and reverse-dependency lookup with an escalation gate when JSON/event storage cannot meet the contract                                                                                       | repository contract/migration-preflight tests                       | Planned             |
| AC153-79 | Pause and cancel use a typed durable control request distinct from terminal status and cannot be overwritten by late workers                                                                                                                  | control-request/replay tests                                        | Planned             |
| AC153-80 | Every strict episode contract carries canonical content/speech-budget references and relationship deltas carry belief state separately from canonical relation truth                                                                          | episode-contract/graph-delta schema tests                           | Planned             |
| AC153-81 | All resolved speech/quality/anti-drift/plan-chunk/execution/benchmark/pricing policies are fingerprinted in the immutable run contract                                                                                                        | policy-fingerprint/stale-run tests                                  | Planned             |
| AC153-82 | Feature 151 adapter and Feature 152 assurance contract versions are pinned and incompatible inherited contracts fail closed                                                                                                                   | compatibility-contract tests                                        | Planned             |
| AC153-83 | Relationship vocabulary/alias catalog is versioned and Thai/English synonyms normalize deterministically across retry and repair                                                                                                              | alias-catalog/normalization tests                                   | Planned             |
| AC153-84 | Retry matrix distinguishes deterministic, transient, unknown-outcome, stale-fence, and credit errors from repair rounds and provider continuations with bounded/idempotent behavior                                                           | retry-matrix/reconciliation/continuation tests                      | Planned             |
| AC153-85 | Candidate activation performs durable read-back and suppresses success on coverage, fingerprint, graph, memory, benchmark-result, status, or credit mismatch                                                                                  | activation-readback/benchmark-binding integration tests             | Planned             |
| AC153-86 | Horizon extension creates a new candidate and re-plans terminal closure, affected arc exits, and payoff windows before adding episodes                                                                                                        | horizon-extension/replan tests                                      | Planned             |
| AC153-87 | Plan chunk concurrency is bounded and idempotency keys are deterministic across concurrent duplicate requests                                                                                                                                 | scheduler/concurrency tests                                         | Planned             |
| AC153-88 | Every acceptance criterion has an implementation-section owner and proof label before the feature can be reported complete                                                                                                                    | AC traceability manifest check                                      | Planned             |

Feature 152 acceptance criteria remain prerequisites. Feature 153 must not
report the overall feature complete while Feature 152's inherited partial
boundaries (provider/credit reconciliation, signed manifests, active Agents
mode, legacy interception, production migration, or browser proof) remain
unverified for the relevant rollout.

### 17.1 Acceptance traceability manifest

Each AC row has one primary implementation owner below. A section may add
supporting tests, but cannot close another section's AC without recording the
evidence label and owning path in the acceptance record.

| AC range                                               | Primary section owner | Required proof owner                                     |
| ------------------------------------------------------ | --------------------- | -------------------------------------------------------- |
| AC153-01–04, 45, 55–59, 66, 73, 81–82                  | Section 01            | shared/router/compatibility contract tests               |
| AC153-05–08                                            | Section 02            | reverse-planning and closure fixtures                    |
| AC153-09–11, 39, 41, 43, 46, 48–49, 54, 60, 63, 68, 75 | Section 03            | memory/graph projection and repository integration tests |
| AC153-12–15, 37–38, 47, 61, 80, 83                     | Section 04            | roster/graph/lifecycle normalization fixtures            |
| AC153-16–19                                            | Section 05            | world-rule and provider-capability contract tests        |
| AC153-20–23                                            | Section 06            | look-ledger and continuity integration tests             |
| AC153-24–25, 34–35, 50, 52, 67, 69, 74, 76–79, 84, 87  | Section 07            | job/router/retry/scheduler integration tests             |
| AC153-26–27, 40, 44, 51, 64–65, 70, 85–86              | Section 08            | ledger/repair/finale/read-back fixtures                  |
| AC153-28, 30, 33, 42, 53, 62, 71                       | Section 09            | tenant/router/jsdom/browser evidence                     |
| AC153-31–32, 36, 72                                    | Section 10            | migration/rollout/observability/runbook evidence         |
| AC153-29, 88                                           | Section 11            | acceptance matrix and local/external proof record        |

The implementation cannot report Feature 153 complete while an AC has no
primary owner, proof label, evidence path, or an inherited Feature 152
boundary marked as externally unverified.

## 18. Test strategy

### Pure/shared tests

- schema compatibility and canonical fingerprints;
- 120, 121, 150, 500, and 1000 episode horizon calculations;
- arc/block interval coverage, duplicate/gap detection;
- reverse reveal/evidence/payoff/consequence validation;
- thread idle/owner/payoff/closure rules;
- advantage exchange and escalation;
- memory fold, retrieval priority, contradiction and retcon precedence;
- guest lifecycle and presumed-dead rules;
- world/power capability/cost/limit rules;
- wardrobe cue/transition/no-cue rejection and variant identity;
- episode duration and production manifest compatibility.
- exact 90-second/9-shot registry validation, speech-band alignment, and
  legacy 60-second compatibility;
- strict duration-to-`contentBudget`/`dialogueQuality` propagation and flag-
  disabled strict-run rejection;
- staged 120/150/500/1000 episode plan chunks, interval coverage, checkpoint
  replay, and oversized-response/truncation recovery;
- viewpoint-scoped knowledge redaction and cast-density policy limits.

### Service/router/job tests

- candidate blueprint approval and stale-source rejection;
- block checkpoint/resume/idempotency/fencing;
- memory event/snapshot transactional writes;
- targeted repair and neighboring impact closure;
- final closure gate and approval activation;
- tenant/user authorization, credit reservation/reconciliation, and status
  mapping;
- legacy quality-loop and `applySeasonCritique` interception;
- Feature 151 adapter hash/budget/side-effect parity.
- strict-path rejection of legacy direct active-bible writes;
- graph edit preview/proposal/approval and stale-revision conflict handling;
- crash recovery/idempotency across memory events, graph projections,
  dependency index, checkpoints, and candidate status.
- lease/heartbeat/watchdog expiry, durable pause/cancel/resume, late callback
  rejection, pricing snapshot, hard spend ceiling, and unused-credit
  reconciliation;

### Fixture/replay tests

1. A 120-episode romance/mystery with early clue, red herrings, reversal,
   advantage exchange, new recurring cast, formal/rural/travel/sleep looks,
   and finale closure.
2. A fantasy or sci-fi 120-episode fixture with powers/technology, limits,
   costs, high-spectacle scenes, and a late controlled guest.
3. A 150-episode extended-mode fixture with block checkpoints and explicit
   quality-confidence metadata.
4. Negative fixture with an unresolved episode-1 mystery at the finale.
5. Negative fixture with an unseeded episode-120 villain or hard-dead return.
6. Negative fixture with arbitrary wardrobe changes not represented in the
   story.
7. Synthetic 500-episode scheduler/ledger replay without live LLM/provider
   calls, bounded by configured memory and runtime limits.
8. Large-plan fixture proving 120 and 500 episode skeletons are produced in
   resumable chunks rather than one oversized story-bible response.
9. Secret-knowledge fixture where a fact is known by the critic but not by the
   speaking character, proving the prompt context is redacted correctly.
10. Graph semantic fixture with self-edge, competing spouse/parent states,
    parentage cycle, and false-belief versus canonical-truth cases.
11. Stuck-run fixture where a lease expires after a worker crash and the
    watchdog resumes from the last accepted checkpoint without duplicate charge.

## 19. Observability and operator diagnostics

Record redacted, tenant-scoped metrics by `seriesId`, `runId`, `attemptId`,
`blueprintId`, `arcId`, and quality mode:

- episode/block/arc coverage and resume count;
- plan-chunk coverage, interval gaps, truncation/recovery count, and duration
  profile/runtime mismatch;
- unresolved thread/mystery/consequence counts;
- cast additions, exits, guest findings, active cast density, policy overflow,
  and dialogue/visual-load pressure;
- look cues, variant generations, wardrobe drift findings;
- graph revision/fingerprint mismatches, dependency-index coverage, graph-edit
  conflicts, and knowledge-leakage findings;
- world-rule/capability fallback and unsupported-scene counts;
- model/provider calls, estimated/actual credits, latency, and repair rounds;
- final closure pass/fail reason codes;
- stale worker/fence loss, reconciliation, and approval waits.

Logs must never include raw secrets, unrestricted user prompts, private
reference URLs, or unredacted sensitive character content. A diagnostic view
must link findings to evidence IDs and source paths without allowing a client
to mutate truth directly.

## 20. Risks and unresolved implementation decisions

1. Increasing episode count increases not only token/call cost but also review,
   memory, visual asset, and media-render cost. Admission must show the full
   cost envelope before paid work.
2. A 90-second quality profile requires a registered exact duration vector and
   production-assembly proof. The vector is new-profile configuration, not a
   silent migration of legacy 60-second output.
3. Normalized ledger tables improve querying but add migration risk. The deep
   plan must prove whether versioned JSON plus existing event/snapshot tables
   is sufficient before adding tables.
4. A late guest can be dramatically effective but is easy to misuse. The
   finale gate must remain stricter than the author prompt.
5. Future media providers may have different capability, safety, and duration
   contracts. Provider-neutral tags must remain an abstraction, not a promise.
6. Existing character-table migration lineage contains manual migration
   conventions. Schema changes there require a preflight and must not assume a
   clean drizzle journal.
7. Existing worktrees may contain unrelated dirty/deleted files. Implementation
   must preserve them and stage only owned paths.
8. A large season plan can fail before deep generation if it is requested as a
   single model response. Staged plan chunks and interval checkpoints are
   therefore a correctness requirement, not only a performance optimization.

## 21. Definition of done for Feature 153

Feature 153 is complete only when:

- all implementation sections have landed with focused tests;
- 120-episode quality-mode and >120 extended-mode paths are proven locally;
- central-mystery, thread, advantage, cast, world, memory, and wardrobe ledgers
  are part of the same candidate/final-gate decision;
- episode 119/120 guest scenarios and wardrobe transitions are covered;
- legacy compatibility/backfill and rollback are verified;
- Feature 152 inherited gates are either proven for this path or explicitly
  reported as rollout blockers;
- browser/provider/production/deployment proof is clearly labeled as performed
  or not performed;
- no claim of professional-equivalent drama quality is made without a human
  evaluation sample and a recorded rubric.
