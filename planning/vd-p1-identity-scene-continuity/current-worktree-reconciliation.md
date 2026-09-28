# VD P1 current-worktree reconciliation

Date: 2026-08-01
Status: deep-plan refreshed; ready for user implementation review; code not started
Source specs: Features 137 v1.3.0, 138 v1.3.0, and 139 v1.1.0

This file is the current execution addendum for the historical deep-plan bundle.
The existing section files remain an audit trail and are not rewritten in place.

## Current codebase facts

- None of `verticalDramaMotionContracts`, `verticalDramaSceneContinuity`, or
  `verticalDramaSceneNeighborAnchors`, or `verticalDramaSeriesLookLock` is
  registered in the current feature-flag contract.
- No `motionProfile`, `sceneVisualStates`, `sceneAnchor`, `lookLockControl`, or
  `videoStartMediaAssetId` field exists in the current Vertical Drama contracts.
- The batch start-frame planner now carries newer facts such as location grounding,
  canonical shot summaries, speaker order, required-character framing, episode plan
  context, and same-shot carry-over. New lock blocks must compose with these fields
  instead of replacing or re-deriving them.
- The model registry/worktree includes provider capabilities beyond the original
  kie.ai `gpt-image-2` assumption. Prompt length and reference capacity must be
  resolved from the selected model, with provider-specific limits preserved.
- The focused baseline currently has one failure in
  `verticalDramaShotVideoPromptGeneration.test.ts`: the stale assertion expects two
  LLM executions while the current fallback path makes four. Recapture Gate A/B
  before using fail-set comparisons; do not attribute this baseline failure to P1.

## Approved delivery boundary

### P1 shared bundle

1. Foundation: current baseline capture, long-form flags, selected-model prompt
   budget helper, pure `motionProfile` and `sceneContinuity` modules.
2. Feature 139 look lock: central series slot, catalog/provenance, batch and per-shot
   injection, create/settings UI, conditional same-register skill clauses, and a
   source-aware resolver that prevents genre/manual data leaking through the legacy
   preset flag.
3. Feature 137 P1: per-shot/subshot motion profile, deterministic risk floor,
   face-observability fields, motion-contract/judge rules, persistence, and drafting
   guidance. Bulk pack receives prose guidance only.
4. Feature 138 P1a: scene-state authoring/storage/carry-over, compact lock injection,
   same-scene lighting clause, manual edit API, and minimal provenance UI.
5. Joint flag-off parity, focused tests, typecheck delta, and internal smoke evidence.

### Separate P1b canary

Feature 138 neighbor anchoring lands only after P1a is green. Scenes may execute in
parallel, but shots within one scene execute sequentially. It uses the dedicated
default-off `verticalDramaSceneNeighborAnchors` flag. Rollout evidence must
include latency, anchor source, capacity drops, and the fresh-episode path where no
frame has been approved yet. Regenerate-in-place anchoring is deferred unless it has
focused tests.

### Deferred

- Feature 137 video-safe start frames, angle packs, post-render observability, and
  post-video identity QC.
- Feature 138 location coverage packs and continuity QC.
- Any duplicate Feature 138 prop store. Feature 140 owns the future episode object
  ledger; Scene Visual State may render only a derived active-prop view.

## Required plan deviations

- Section 01's `basePlan` prerequisite is obsolete in the current checkout; the
  router already initializes `basePlan`. Replace it with baseline recapture only.
- Use the long-form flag names from the refreshed specs.
- Register `verticalDramaSceneNeighborAnchors` separately; a distinct canary cannot
  be controlled safely by documentation alone. It is active only when
  `verticalDramaSceneContinuity` is also enabled; a child-on/parent-off
  misconfiguration behaves fully off except for a bounded configuration warning.
- Do not add `motionProfile` to the bulk-pack schema.
- Activate every new Feature 137 skill section, including bulk/drafting guidance,
  with an explicit runner-supplied flag fact. The historical section-08
  image-presence-only bulk activation is superseded because it would change
  flag-off tenants.
- Do not implement language-dependent runner prose matching for `camera_motion` in
  P1; keep the judge dimension and treat a deterministic checker as P2.
- Resolve model budgets/caps from current selected-model metadata and update every UI
  counter that exposes the effective budget.
- Treat historical file:line anchors as hints; locate current symbols before edits.
- Replace direct `bible.presetVisualIdentity` readers with a shared source-aware
  resolver. The effective identity remains in the existing slot, while a
  non-governing inherited snapshot enables reversible preset/AI-mix/lineage restore;
  lineage also carries source/governance metadata but starts a fresh revision.
- Every JSONB mutation must lock and merge the fresh row or use an expected revision;
  never spread a stale `bible`/`startFramePlan` snapshot over concurrent edits.
- Scene planning uses membership-hash idempotency and fails before paid image render
  when a required P1a lock cannot be authored. Prompt/render anchor resolution uses
  one persisted asset id per attempt.
- UI sections must follow the repository's Astryx discovery/component/token rules
  and cover conflict, loading, disabled, empty, error, focus, and responsive states.
- P1 GA evidence must come from fixed offline/manual rubrics and emitted events; it
  cannot depend on the deferred P2 in-product QC runners.
- Freeze cross-feature precedence in composition tests: policy/identity/shot facts
  outrank style; Feature 139 supplies the broad register; Feature 138 owns concrete
  scene lighting/set facts; Feature 137 owns movement.
- Treat missing or malformed Feature 137 `motionProfile` as unavailable, never
  low-risk: keep the selected legacy prompt, persist an explicit status, emit an
  event, and do not extend the existing bounded retry budget.
- Do not inject a Feature 138 scene state after its membership hash becomes stale.
  For P1b, persist one anchor id before prompt authoring and revalidate that exact id
  before paid render; never substitute an asset after the prompt has been authored.
- Add a pure resolver truth table for the legacy preset flag plus all four P1 flags
  (`verticalDramaSeriesLookLock`, `verticalDramaMotionContracts`,
  `verticalDramaSceneContinuity`, `verticalDramaSceneNeighborAnchors`) and focused
  integration coverage for each single flag, the required neighbor dependency,
  all-flags-off parity, and all-flags-on precedence. Do not rely only on the
  historical two-flag matrix.
- Centralize Feature 139 raw positive/negative fragment application in the final
  image-prompt assembler. Authoring LLMs receive only a compact visual-register fact;
  every provider-bound image prompt resolves the current authorized look and applies
  normalized fragments exactly once, including old prompts rendered after a look
  change.

## Implementation gate

Do not start code implementation until this addendum and the three refreshed specs
receive user review. After approval, run the deep-implement setup against
`planning/vd-p1-identity-scene-continuity/sections/`, applying this addendum whenever
it conflicts with a historical section.

Current execution order is foundation → Feature 139 → Feature 137 → Feature 138
P1a → joint P1 verification → Feature 138 P1b canary. `sections/index.md` and the
binding override at the top of each affected section encode this order and supersede
the original numeric sequence.
