# Section 14 verification report

Measurement checkout: `/home/dev/projects/SmartSpecPro`

Measurement SHA at this run: `4908bd6bf18e41f0617b2354b1576ead6fa54013`

The repository contains unrelated dirty worktree changes. Verification below
is scoped to the VD P1 paths and does not claim a clean repository-wide build.

## Current-worktree rerun (2026-08-01)

The current checkout was revalidated at HEAD `a330e7725`; the worktree still
contains unrelated staged/unstaged changes, so this is evidence for the current
tree rather than a clean merge artifact.

- Focused Section 14 suite: `37 passed / 1 skipped` (the opt-in live test is
  skipped by default).
- Additional Feature 137/138/139 look, flag, scene, motion, router, and UI
  regression suites: `77 passed`.
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
- Storyboard scene-continuity UI suite: `2 tests passed`.
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
