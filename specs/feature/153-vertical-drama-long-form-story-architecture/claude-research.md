# Deep-plan Research — Feature 153

## Research decision

- **Codebase research: required.** SmartSpecPro is an existing git repository
  with an implemented Vertical Drama pipeline. SocratiCode was checked for
  availability in the current runtime but no `codebase_*` MCP tools were
  exposed, so this research uses targeted `rg` and line-range reads as the
  documented fallback.
- **Web research: required for OpenAI Agents SDK only.** The spec mentions the
  SDK as an optional orchestration boundary. The story architecture remains
  provider-neutral for Seedance/Minimax and does not claim their current API or
  capability surface.
- **Testing research: required.** Existing tests are Vitest-based in
  `apps/web`, with focused shared-contract and service tests. TypeScript uses
  `apps/web`'s `typecheck`/`check` scripts; repository-wide typecheck may contain
  unrelated baseline errors and must be reported separately from feature proof.

## Codebase findings

### Feature 152 assurance boundary

Feature 152 already defines durable run/attempt contracts, immutable source
fingerprints, candidate versus active versions, bounded repair, impact closure,
status taxonomy, approval, worker fencing, credit/provider reconciliation
boundaries, and Feature 151 adapter compatibility. Feature 153 must add
long-form planning and closure inputs to that contract; it must not create a
second agent runtime or bypass the final gate.

Relevant paths:

- `specs/feature/152-vertical-drama-story-generation-assurance-orchestra/spec.md`
- `apps/web/server/services/verticalDramaStoryGenerationContracts.ts`
- `apps/web/server/services/verticalDramaStoryGenerationValidation.ts`
- `apps/web/server/services/verticalDramaStoryGenerationRepair.ts`
- `apps/web/server/services/verticalDramaStoryGenerationRuntime.ts`
- `apps/web/server/services/verticalDramaStoryJobs.ts`

### Existing story-control seam

`apps/web/shared/verticalDramaSeries/storyControl.ts` already defines thread
scopes/statuses, romance phases, advantage sides, evidence references, thread
plans, episode slots, and validation. The correct extension is arc/sub-arc/block
ownership, long-form reveal windows, cast/look/world obligations, and closure
state. Existing IDs and enum meanings should remain compatible.

`draftStoryDesign.ts` already builds/repairs long-form design and story-control
seeds and has advantage-beat handling. Feature 153 should add a hierarchical
blueprint and reverse-planned closure metadata rather than replace the current
story design contract.

### Existing quality ledgers

`qualityLedgers.ts` contains evidence, character activation, threat ladder,
consequence, thread, world-rule, causal-chain, trust, emotional residue, and
story-state contracts. `verticalDramaQualityLedgerReconcile.ts` contains pure
checks for orphan evidence, resistance, overdue payoff, character activation,
threat escalation/cost/antagonist activity, consequence follow-through, stalled
threads, and world-rule reuse/choice. Feature 153 should add mystery closure,
cast lifecycle, advantage timeline, and wardrobe cue checks to this seam.

### Existing memory infrastructure

`seriesMemoryState.ts` provides the pure `VdSeriesMemory`, episode memory,
relationship state, open-thread state, knowledge accumulation, and deterministic
`foldSeriesMemory`. `verticalDramaSeriesMemoryProjection.ts` writes a locked,
token-bounded projection into `vertical_drama_series.memory`, preserves user
edits, and uses deterministic fallback when LLM episode memory is malformed.

Drizzle already defines append-only `vertical_drama_memory_events` and rolling
`vertical_drama_memory_snapshots` with tenant/user/series scope, payload,
superseded event IDs, approval fields, and checksums. Feature 153 should use
these as the canonical event/snapshot store and add indexed tables only if
retrieval/checkpoint requirements prove JSON projection insufficient.

### Relationship graph gap

`contracts.ts` contains the legacy `VerticalDramaRelationship` edge shape and
`seriesMemoryState.ts` contains materialized `VdRelationshipState` for a pair,
but neither is a canonical, user-visible, time-aware graph. The implementation
must reconcile these compatibility types into one additive graph contract with
family groups/sides, in-law links, factions, disclosure/known-by state,
provenance/evidence, and graph-aware repair impact. Existing pair state should
remain a projection reader, not a competing source of truth.

### Existing character and visual seams

`vertical_drama_characters.data` already stores the full character payload,
including `identityLock`, `wardrobeRules`, and `currentState`. The character
table has nullable `parentCharacterId`, `variantLabel`, `variantType`, and
`sharesFaceWithCharacterId`; `variantType` supports `outfit` and `age_stage`.
`verticalDramaCharacterVariantPlanner.ts` and the character router already
plan/reconcile outfit and age-stage variants. This is enough foundation for a
story-cued look ledger, but the current variant plan is not itself an episode /
scene cue ledger. Feature 153 must add that missing admission and continuity
contract.

Existing `sceneContinuity.ts`, `frameContinuity.ts`, `seriesLookLock.ts`,
character identity maps, and visual-bible services already detect wardrobe and
identity drift. The new ledger should feed their structured facts and findings;
it must not create a separate identity lock.

### Existing duration and production seams

`durationProfiles.ts` currently defines 60-second profiles with nine logical
shots/frames, while `assembly.ts` and
`verticalDramaProductionEpisodeAssembly.ts` preserve the distinction between a
sub-episode and a grouped production episode. `targetEpisodeCount` in the
Vertical Drama router accepts up to 1000. Therefore 120 is a quality
recommendation and admission profile, not a technical hard maximum. A 90-second
profile requires an explicit product/configuration decision and must not
silently alter legacy 60-second output.

### Existing tests and verification

Focused test seams already exist for story control, draft design, quality
ledgers, memory folding/projection, episode-memory wiring, character variants,
production assembly, and episode pipeline memory. The new feature should add
pure fixtures first, then service/router/job integration tests, then UI/browser
proof only for changed surfaces. Use `git diff --check` and keep full typecheck
noise separate from feature-owned errors.

## OpenAI Agents SDK research

Official TypeScript documentation describes a small primitive set: agents,
tools, handoffs, guardrails, sessions, human-in-the-loop, and tracing. It
supports both manager-style orchestration (specialists as tools) and handoffs,
and also supports code-driven orchestration. The SDK's guardrails and tracing
are useful observability/validation aids, but they do not replace the server's
deterministic final gate, tenant/credit authority, or durable checkpoint model.

Recommended boundary for Feature 153:

1. Keep block ordering, retry limits, episode coverage, ledger reconciliation,
   database writes, credits, and activation in Node/application code.
2. Use an Agents SDK manager or bounded handoffs only for planner/author/critic/
   repair roles after Feature 151 contract/hash admission.
3. Treat SDK sessions/tracing as agent-run context and telemetry, not the
   canonical series memory. Persist canonical events/snapshots in the existing
   application-owned memory model.
4. Use output guardrails as an early rejection signal, while Node revalidates
   every structured output and controls side effects.

Sources:

- https://openai.github.io/openai-agents-js/
- https://openai.github.io/openai-agents-js/guides/multi-agent/
- https://openai.github.io/openai-agents-js/guides/guardrails/
- https://openai.github.io/openai-agents-js/guides/tracing/

## Research conclusions

The highest-value design is hierarchical planning plus deterministic ledgers
and memory retrieval, not simply increasing an agent loop's retry count. The
existing codebase already has most local contracts; the missing work is the
long-form hierarchy, cross-ledger closure decision, adaptive cast/look/world
admission, and durable block/arc checkpoints. Provider-specific media features
must remain capability tags resolved by the existing provider policy layer.
## Draft-pipeline alignment finding

The concrete path is `generateStoryBible` for season plan/breakdown followed by
`generateStoryBibleDeep` or `extendStoryDraftHorizon` for shot-level drafts.
`draftStoryDesign.ts` currently derives control threads from architecture and
character names; `verticalDramaStoryBible.ts` requests `episode_memory` but its
relationship output is still pair/status state; the assurance run contract has
architecture/story-control fingerprints but not a relationship revision and
reverse dependency fingerprint. Therefore Feature 153 must add the graph gate
at the draft boundary, propagate it through every deep/premium/revise/resume
path, and persist the dependency index before claiming targeted repair.

The router's `generateStoryBible` write currently spreads the existing bible and
adds expanded arc, refined characters, episode breakdown, and story-control
seed. It does not itself guarantee that `storyDesign` and `storyContract` were
created in this run, so strict readiness must validate/repair those fields as a
single source revision rather than trusting an older wizard payload.

The implementation plan must also define versioned call/time/credit/context
SLOs and a reproducible human benchmark protocol. These are required to judge
whether a 120-episode run is operationally finishable and narratively strong;
they cannot be inferred from schema or JSON validity.

## Completeness audit findings

The current implementation still has a fixed 60-second/9-shot fallback, while
the existing duration registry already supports `vertical_drama_10s_x9_shots`
(nine 10-second shots = 90 seconds), but the 90-second profile is not yet
plumbed as the strict long-form default or proven through dialogue coverage and
production assembly. The current
story-bible prompt also requests the whole target episode breakdown in one
response, so 120–1000 episode planning needs a staged plan job and interval
checkpoints before deep drafting.

The assurance runtime currently uses the source snapshot fingerprint for
architecture and story-control fields, and repair currently expands finding
paths with immediate neighbors. Feature 153 must add independent component
fingerprints and consume the graph dependency index for transitive repair.
Finally, relationship known-by metadata must be enforced as viewpoint-scoped
context redaction, not merely validated after generation.

The runtime audit adds one implementation constraint: strict long-form must
reuse the existing `contentBudget`/`dialogueQuality` helpers and story-job
lease/heartbeat/fence/checkpoint/resume seams. A new long-form loop must not
create a parallel worker or silently disable speech coverage, and admission
must bind pricing, spend ceiling, cancellation, and reconciliation policy.

For implementation handoff, pin the inherited Feature 151/152 contracts and
provider/safety/locale/vocabulary versions, use a typed retry matrix, and
perform a durable activation read-back. Horizon extension must create a new
candidate and re-plan terminal closure rather than append after the old finale.
