# Orchestra Plan

## Task
(1) Deep-plan the newly added spec 132 §19 (Camera Angle Set Quality) as a
10th section, matching the established 9-section format exactly. (2) Then
deep-implement ALL of Feature 132 (10 sections, F132A-I) end-to-end against
the real codebase — write the actual code, tests, and skill changes per each
section's already-written Test-first plan and Implementation steps — fully
autonomous, no further confirmation, sub-agents in parallel wherever file
ownership is genuinely disjoint, sequential/worktree-merged wherever it
isn't. All sub-agents forced to Sonnet 5 per explicit user instruction.

## Classification
- scope: large→project-scale in raw size (10 feature-spec sections, ~100+
  files touched across the monorepo when summed), but routed as orchestra's
  `large` "deep-plan chain → deep-implement" path since it is one coherent
  feature (132), already fully deep-planned with TDD-oriented section files
  — not a multi-project decomposition.
- risk: **medium in raw surface area (new tRPC procedures, new schemas, new
  skills, DB-adjacent jsonb changes), but LOW in actual production impact**
  — every one of the 9 flags (F132A-H, now F132I) defaults OFF, so an
  incomplete or imperfect implementation cannot affect real tenants/users
  until a flag is explicitly enabled. No DB migrations anywhere (spec §13:
  jsonb-only). This flag-gated-dark-launch property is the primary safety
  net that makes full-autonomy execution responsible here.
- affected_domains: apps/web/server/services, apps/web/server/routers,
  apps/web/shared, apps/web/skills, apps/web/client/src/components
  (vertical drama series UI). No python-backend, no infra, no auth/RBAC.
- estimated_file_count: ~100+ across all 10 sections (see each section's own
  "Files to create"/"Files to change" list for the authoritative per-section
  count — not re-enumerated here).
- chosen_route: deep-plan (Section 10 only, the other 9 already exist) →
  deep-implement, section-by-section in the dependency order already
  established in claude-plan.md, TDD (tests written before implementation
  per each section's own Test-first plan), verified by `pnpm check`/targeted
  `pnpm test` after each wave.
- task_summary: finish planning §19, then implement all 10 sections of
  Feature 132 against the real codebase.
- bug_route: n/a
- parallel_default: true, WITH A CRITICAL CAVEAT — `verticalDramaStoryBible.ts`
  (the ~7000-line story-bible service file) is touched by 5 of the 10
  sections (02, 03, 04, 06, 07). True simultaneous multi-agent edits to one
  giant file risk conflicting diffs even at "different" line ranges (import
  blocks, shared type declarations, adjacent function insertions). Wave
  planning below groups work by FILE OWNERSHIP for this one file (one agent
  owns all `verticalDramaStoryBible.ts` edits for a given wave, sequenced
  across waves), while every OTHER file that a section touches alone is
  dispatched in genuine parallel. Sections that need worktree isolation are
  marked below.
- planned_agents: `deep-plan:section-writer` (1, for §19) then a mix of
  `ssp-backend`/`ssp-frontend`/general-purpose coding agents per wave (all
  forced `model: "sonnet"`, no exceptions)
- dispatch_preference: parallel within each wave up to the file-ownership
  constraint above; sequential across waves per the dependency order.

## Dependency-ordered wave plan (mirrors claude-plan.md's binding build order + new Section 10)

- **Wave 0**: Deep-plan Section 10 (Camera Angle Grid Quality) — 1 agent,
  independent of all implementation waves below (F132I has no dependency on
  F132A-H).
- **Wave 1**: Implement Section 01 (Shared Criteria Module + 9 Feature
  Flags — now includes F132I) — foundation, must land first, no shared-file
  conflicts with anything else.
- **Wave 2** (parallel, file-disjoint after Wave 1): Section 02's non-shared
  files (CreateSeriesWizard.tsx, createSeriesFieldLimits.ts,
  verticalDramaPresetSynthesis.ts, preset-synthesizer skill,
  VerticalDramaDeepStoryDraftsPanel.tsx premise preview) + Section 05 in
  full (dialogueQuality.ts, verticalDramaEpisodeQualityReview.ts,
  speechProfile.ts, verticalDramaVoiceDistinctness.ts, dialogueRegisterRules.ts,
  script-builder/dialogue-audio-planner skills, character wizard/stock-panel
  UI) — these two sections share NO files with each other.
- **Wave 3** (sequential, single file-owner): all `verticalDramaStoryBible.ts`
  edits needed by Sections 02 (userPremise threading), 03 (ledger storage,
  worldRuleSchema upgrade), and 04 (shotDraftSchema.contract, premium gates)
  — one agent, one pass, in that internal order, since all three land in
  the same file. Section 03's OTHER files (qualityLedgers.ts,
  verticalDramaQualityLedgerReconcile.ts, verticalDramaLedgerPlanner.ts,
  ledger-planner skill scaffold, memory.ts, verticalDramaSeriesMemory.ts,
  verticalDramaStoryJobs.ts, verticalDramaEpisodes.ts memory wiring,
  verticalDramaSeriesMemoryPlanning.ts) and Section 04's OTHER files
  (verticalDramaStoryboardGeneration.ts, verticalDramaScriptGeneration.ts,
  verticalDramaEpisodePipeline.ts, verticalDramaQualityReviewApply.ts) run
  IN PARALLEL with this wave (disjoint from the shared-file agent and from
  each other).
- **Wave 4** (sequential, single file-owner continues): Section 06's
  `verticalDramaStoryBible.ts` edits (16-kind finding array, scorecard v3,
  premium dimension alignment, severity table, `cast_visually_similar`
  `.todo` hook, `premise_drifted` detection) — same file-owner agent
  continues from Wave 3's state. Section 06's OTHER files
  (verticalDramaSeasonQcPasses.ts new, verticalDramaEpisodeQualityReview.ts
  scorecard v3, qualityPolicy.ts, verticalDramaCopy.ts) run in parallel.
  Section 08 (Character Personality & Persisted Visual Bible — depends on
  Section 05, no `verticalDramaStoryBible.ts` touch) runs fully in parallel
  in this same wave (characterProfile.ts, verticalDramaCharacterImageGeneration.ts,
  verticalDramaCharacterStock.ts, verticalDramaStartFrameGeneration.ts,
  characterIdentityMap.ts, character-visual-bible skill, ledger-planner
  skill extension).
- **Wave 5**: Section 09 (Character Image QC & Cast Contrast) — hard
  dependency on Section 08 landing first (Wave 4). No `verticalDramaStoryBible.ts`
  touch.
- **Wave 6** (sequential, single file-owner continues): Section 07's
  `verticalDramaStoryBible.ts` edit (`applySeasonCritique` revision-plan
  acceptance) — same file-owner chain, final edit to this file. Section 07's
  OTHER files (revisionPlan.ts new, verticalDramaRevisionPlan.ts new,
  verticalDramaQualityReviewApply.ts extension, verticalDramaEpisodePipeline.ts
  splice path, verticalDramaQualityLoop.ts reordering, client scope-label
  UI) run in parallel. Depends on Sections 03, 04, 06.
- **Wave 7**: Section 10 (Camera Angle Grid Quality, F132I) implementation,
  once Wave 0's plan exists — independent of everything else, can actually
  run in parallel with any earlier wave once planned, but sequenced last
  here for simplicity/context-budget reasons since it has zero dependency
  urgency.

## Wave-2 scope correction (discovered mid-execution, before Wave 2 dispatch)

Wave 1 (Section 01) is complete and verified (pnpm check clean, 2271 tests
green, 100% additive diff). Before dispatching Wave 2, re-checking each
section's "Files to change" list against each other surfaced that
**`verticalDramaStoryBible.ts` is not the only hot shared file** — two more
large, multi-section-touched files exist:
- `apps/web/server/routers/verticalDramaSeries.ts` — touched by Section 02
  (createSeriesInput/synthesizeGenrePresetInput/create/synthesizeGenrePreset/
  generateStoryBible call sites) AND Section 05 (`seedCharactersFromDraft`).
- `apps/web/server/routers/verticalDramaEpisodes.ts` — touched by Section 03
  (`summarizeEpisodeToMemory`), Section 04 (`updateEpisodeDraft`/
  `repairStageOutput` audit), and touched again later by Section 07.

Revised rule: all three hot files (`verticalDramaStoryBible.ts`,
`verticalDramaSeries.ts`, `verticalDramaEpisodes.ts`) get single-owner,
sequential-across-sections treatment, handled by ONE "shared big-file owner"
agent working through each section's requirements for that file in
dependency order. Every OTHER file a section touches (new files it creates,
skill.md files, client components, and existing services touched by only
ONE section — e.g. `verticalDramaPresetSynthesis.ts`, `dialogueQuality.ts`,
`verticalDramaEpisodeQualityReview.ts`, `verticalDramaScriptGeneration.ts`,
`verticalDramaStoryboardGeneration.ts`, `verticalDramaQualityReviewApply.ts`)
is dispatched in genuine parallel per-section, since those are confirmed
disjoint.

Revised Wave 2: Section 02's non-hot-file work + Section 05's non-hot-file
work, in parallel (2 agents) — each explicitly instructed to SKIP the 3 hot
files and note any deferred edit for the shared-file-owner pass.

Revised Wave 3: the shared-file-owner agent handles ALL deferred edits
across Sections 02, 03, 04, 05 to the 3 hot files, in one sequential pass,
reading each section's plan for its exact requirement — running in parallel
with Section 03's and Section 04's remaining non-hot-file work (2 more
agents). This wave now has 3 agents total (within the 4-concurrent cap).

## Quality gates
`pnpm check` (typecheck) after every wave; targeted `pnpm test` for each
wave's new/changed test files; full regression suite (`pnpm test`) after
Waves 3, 4, 6 (the `verticalDramaStoryBible.ts` sequential waves, highest
regression risk given the file's size and centrality). No security gate
expected (no auth/RBAC/encryption/CORS files touched) — will trigger one if
any wave unexpectedly touches those surfaces. No git commits unless the
user asks.
