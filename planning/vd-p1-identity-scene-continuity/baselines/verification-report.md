# Section 14 verification report

Measurement checkout: `/home/dev/projects/SmartSpecPro`

Measurement SHA at this run: `6086aeabc`

## Feature 138 P1b implementation update (2026-08-01)

Neighbor anchoring is now implemented behind the child canary
`verticalDramaSceneNeighborAnchors && verticalDramaSceneContinuity`.
Flag-off behavior remains the legacy path; flag-on generation runs scene lanes
in parallel and awaits each shot's completion before the next shot in that
scene. Prompt/render provenance and `vd_scene_neighbor_anchor_attached` audit
events are covered in the router tests.

Implementation commits:

- `7d5480713` scene-ordered batch planner
- `df9b7868e` prompt/render anchor wiring and provenance
- `f3accaa4e` parent + child canary gating
- `0d950a053` generated-asset id type narrowing
- `7a7794269` audit-event coverage and cap/trim reason normalization

Focused rerun from `apps/web`: **10 files, 225 tests passed**. The direct web
TypeScript check still exits non-zero on the repository's pre-existing
unrelated type errors; no Feature 138 P1b errors remain after the resolver
narrowing fix.

The current local Postgres container was checked read-only: `media_models` has
237 rows and `gpt-image-2-text-to-image` already reports
`maxReferenceImages=16`, `input_urls.maxItems=16`, and `maxPromptLength=20000`.
No live row mutation was performed in this pass.

Remaining operational gates are the internal paid-provider/browser smoke with
anchor coverage and p95 latency evidence, a fresh Section 14 Gate A/B rerun at
the new HEAD, and the explicitly deferrable `repairShotImage` anchor path
(P2). Production/remote database confirmation remains an operations task; the
local row check is not a production rollout proof.

The repository contains unrelated dirty worktree changes. Verification below
is scoped to the VD P1 paths and does not claim a clean repository-wide build.

## Current-worktree rerun (2026-08-01)

The current checkout was revalidated at HEAD `6086aeabc`; the worktree still
contains unrelated staged/unstaged changes, so this is evidence for the current
tree rather than a clean merge artifact.

- Focused Section 14 suite: `37 passed / 1 skipped` (the opt-in live test is
  skipped by default).
- Additional Feature 137/138/139 look, flag, scene, motion, router, and UI
  regression suites: `115 passed / 1 skipped` (the skipped test is the opt-in
  external-provider live test). This includes the read-only persisted scene
  anchor provenance badge when the scene-continuity flag is enabled.
- Recorded live-gate replay with the opt-in sample: `1 passed`; this does not
  call an external provider.
- Gate A: `5 failed / 263 passed`; the fail-set has `0` new identities versus
  `gate-a-failset-current.txt`.
- Gate B: `57 failed`; the fail-set has `0` new identities versus
  `gate-b-failset-after.txt`.
- Repository typecheck still exits 2 with unrelated errors; no new P1-specific
  error was found. Targeted VD P1 `git diff --check` is clean; a separate
  unrelated staged file still has pre-existing trailing whitespace.

## Remaining work by specification

- Feature 137: run the internal labeled P1 rollout rubric (at least 30
  start-frame/motion fixtures and manual-regen observation across at least 3
  episodes), then decide P1 GA. P2 video-safe frames/angle packs and P3 clip
  identity QC remain explicitly deferred.
- Feature 138: run the P1a internal same-scene rubric (at least 30 consecutive
  frame pairs from at least 3 episodes). P1b neighbor anchoring is a separate
  canary requiring latency, anchor coverage, and prompt/render asset-id
  evidence; P2 coverage packs and continuity QC remain deferred.
- Feature 139: run internal genre-quality labeling (at least 45 shot pairs,
  one 9-shot episode per genre) and verify no duplicate look fragments,
  identity regressions, stale writes, or cross-tenant access before GA.

## Completed automated evidence

All commands were run from `apps/web` so Vitest does not traverse the monorepo
`data/hermes` tree.

- Flag-off parity harness: `7 tests passed`.
  Fixtures were captured from `9eda150ce11fecdc673d8505095e76435219cc22` and
  record that SHA in `server/services/__fixtures__/vdP1FlagOff/manifest.json`.
- Joint scene/motion/look interaction suite: `7 tests passed`.
- Real-LLM evaluator offline suite: `8 tests passed`.
- Real-LLM live suite: skipped by default; it requires the exact opt-in env
  switch and an authorized recorded sample.
- Scene mutation router suite: `8 tests passed`.
- Scene lock UI suite: `3 tests passed`.
- Storyboard scene-continuity UI suite: `3 tests passed`.
- Workspace forwarding/fallback suite: `2 tests passed`.
- Existing prompt regression suites used by this work were also run in the
  earlier focused pass: `62 tests passed`.

Representative command:

```bash
cd apps/web
npx vitest run \
  server/routers/__tests__/verticalDramaEpisodes.sceneVisualStateMutations.test.ts \
  server/services/__tests__/verticalDramaP1FlagOffParity.test.ts \
  server/services/__tests__/verticalDramaP1BothFlagsOn.test.ts \
  server/services/__tests__/verticalDramaP1RealLlmGate.test.ts \
  server/services/__tests__/verticalDramaP1RealLlmGate.live.test.ts \
  client/src/components/verticalDramaSeries/__tests__/VerticalDramaSceneLockRow.test.tsx \
  client/src/components/verticalDramaSeries/__tests__/VerticalDramaStoryboardPanel.sceneContinuityUi.test.tsx \
  client/src/components/verticalDramaSeries/__tests__/VerticalDramaEpisodeWorkspace.sceneContinuity.test.tsx \
  --reporter=basic
```

## Baseline gates and typecheck

The final scoped rerun was completed from `apps/web`:

- Gate A: `5 failed / 263 passed`; `gate-a-final.txt` is set-identical to
  `gate-a-failset-current.txt`.
- Gate B: `57 failed`; `comm -13 gate-b-failset-after.txt
  gate-b-failset-final.txt` is empty. The previously drifting model-budget
  mocks were updated with `getStaticModelById`, so no new failure identity
  entered the canonical set.

The frozen baseline README records Gate A and Gate B at `9eda150ce...` (5 and
57 failure identities respectively). Counts can change as tests are added;
the fail-set comparison is the merge gate. A final re-run is still required if
the branch changes after this measurement.

The repository-wide TypeScript check exited 2 with 41 error lines. The
normalized changed-surface filter for the VD P1 files is empty; the remaining
errors are outside this scope. The before/after summaries are stored beside
this report as `typecheck-before.txt` and `typecheck-after.txt`.

## Manual/live evidence status

The browser smoke checklist and a paid real-LLM run are documented in the
runbook but were not executed in this local pass because this checkout has no
internal tenant credentials, provider authorization, or safe production restart
authority. The implementation therefore remains default-off and fail-closed;
the first internal rollout must attach those screenshots, request IDs, and
real-LLM evaluator report before GA.

## Explicit scope boundary

Feature 138 P1a (scene state, lock, mutation, and UI) and Feature 139 P1 are in
the code path. Feature 138 P1b neighbor anchoring, location coverage packs, and
continuity QC remain deferred as specified; enabling them requires a separate
canary and a new verification pass.
