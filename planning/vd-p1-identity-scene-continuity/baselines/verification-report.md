# Section 14 verification report

Measurement checkout: `/home/dev/projects/SmartSpecPro`

Measurement SHA at this run: `6086aeabc`

## Feature 139 audit observability and documentation closeout (2026-08-01)

The remaining code-side Feature 139 observability gap is closed. The mutation,
series creation path, and provider-bound image paths now emit the named
`vd_series_look_lock_changed` / `vd_series_look_lock_applied` events. Metadata is
tenant/series/path scoped and never stores prompt fragments. Focused regression
coverage asserts update/conflict event semantics and the applied-event payload.

Feature 137/138/139 spec headers and the Section 14 boundary now distinguish
implemented code from pending internal rollout evidence. Feature 137 P3 is now
implemented behind a default-on flag with explicit tenant opt-out; only
external rollout/calibration evidence remains.

## Feature 137/138 P2 implementation update (2026-08-01)

The first P2 wave is now in the code path behind default-on flags (explicit
tenant opt-out remains supported):

- Feature 138 `runFrameContinuityQc` sends the current frame, same-scene
  neighbor, approved location plate, and Scene Visual State through one shared
  advisory vision skill; findings persist on `frames[].sceneContinuity` and in
  the existing `start_frame_image` QC report stage. Missing images/provider
  errors are fail-open and never block paid generation.
- Feature 137 adds the shared `runStartFrameVideoSafetyQc` path,
  `generateVideoSafeStartFrame`, `setVideoStartFrameAsset`, dual-role
  `videoStartMediaAssetId` resolution at video-render time, and plan/asset-map
  carry-over. The video-safe directive is user-triggered and does not replace
  the emotional `approvedMediaAssetId`.
- Feature 138 location coverage roles (`reverse_angle`, `side_angle`,
  `detail_corner`) and `gapDescription` now flow through preview/generation,
  attach the approved primary plate as the reference, and are preserved in
  task metadata for the picker.

Focused P2/P1 rerun: **12 files, 302 passed / 1 failed**. The sole failure is
the pre-existing location MCP model-picker assertion (`verticalDramaLocations.test.ts`);
the new coverage test passes. `git diff --check` is clean for the touched VD
surface. Full repository typecheck remains unsuitable as a gate in this dirty
checkout; the earlier baseline error set is unrelated.

## Feature 137 P3 implementation update (2026-08-01)

- Python `media`-queue task `extract_clip_qc_frames` samples four bounded
  positions sequentially (`ffmpeg`, 30-second per-frame timeout) and rehosts
  JPEGs to R2. The internal endpoint is token-protected and supports a bounded
  wait/poll contract.
- Node `runClipIdentityQc` resolves the approved/video-safe start frame plus
  facing-aware angle-pack references, runs one multimodal call through the new
  `vertical-drama-clip-identity-qa` skill, persists `clips[].identityQc`, and
  writes a `video_clip` QC report. Generated and manually imported clips use
  the same advisory path; no automatic regeneration is present.
- Sampling/provider/vision failures persist `samples_unavailable` and never
  block the clip. The storyboard card exposes a status badge, issue note, and
  manual re-check action. The default-on `verticalDramaClipIdentityQc` flag
  enables the completed path immediately unless a tenant explicitly opts out.
- New focused evidence: shared contract tests **2 passed**; Python endpoint
  tests **2 passed** (coverage threshold is a repository-wide baseline gate).

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
- `927fb082b`, `d6c0ed96a`, `65f8367ca`, `120af6601` merge-order, audit, and
  detail-flag contract tests

Focused rerun from `apps/web`: **10 files, 226 tests passed**. The direct web
TypeScript check still exits non-zero on the repository's pre-existing
unrelated type errors; no Feature 138 P1b errors remain after the resolver
narrowing fix.

The current local Postgres container was checked read-only: `media_models` has
237 rows and `gpt-image-2-text-to-image` already reports
`maxReferenceImages=16`, `input_urls.maxItems=16`, and `maxPromptLength=20000`.
No live row mutation was performed in this pass.

Remaining operational gates are the internal paid-provider/browser smoke with
anchor coverage and p95 latency evidence, and the explicitly deferrable
`repairShotImage` anchor path (P2). Production/remote database confirmation
remains an operations task; the local row check is not a production rollout
proof.

Fresh Section 14 gate rerun after the final P1b commits:

- Gate A: **5 failed / 263 passed**; fail-set is identical to
  `gate-a-failset-current.txt` (zero new identities).
- Gate B: **57 failed / 693 passed**; fail-set is byte-identical to
  `gate-b-failset-after.txt` (zero new or removed identities).

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

- Feature 137: run the internal labeled P1/P2/P3 rollout rubric (at least 30
  start-frame/motion/clip-QC fixtures and manual-regen observation across at
  least 3 episodes), then decide GA. Live provider/browser evidence and
  calibration remain operational gates; code-side P3 sampling/QC is complete.
- Feature 138: run the P1a/P2 internal same-scene rubric (at least 30
  consecutive frame pairs from at least 3 episodes). P1b neighbor anchoring
  and P2 QC/coverage are separate canaries requiring latency, anchor coverage,
  and prompt/render asset-id evidence.
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
authority. The implementation is now default-on with explicit tenant opt-out;
the first internal rollout must still attach those screenshots, request IDs,
and real-LLM evaluator report before GA.

## Explicit scope boundary

Feature 138 P1a/P1b and the first P2 continuity-QC/coverage wave, plus Feature
139 P1 and Feature 137 P1/P2/P3 identity/QC wiring, are in the code path. The
completed 137/138/139 flags are default-on; explicit tenant opt-out remains
available. Internal paid-provider/browser and labeled-calibration evidence is
still required before GA. No production/provider evidence was fabricated.

## P2 UI/API completion update (2026-08-01)

- Feature 137 shot cards now expose advisory continuity/video-safety badges,
  user-triggered QC actions, a separate video-start-frame thumbnail, and a
  clear action that restores approved-frame fallback. `setVideoStartFrameAsset`
  now accepts `null` for that clear operation.
- Feature 138 location coverage now has the named
  `generateLocationCoverageImage` API (parent + child flag gated), role/gap
  controls on the Location Visual Bible card, and a missing-angle CTA sourced
  from `coverageGaps`. Existing location asset listing now preserves role and
  metadata so the gallery can label coverage assets without a schema change.
- Focused UI forwarding/panel suites plus the character angle-pack surface:
  444/444 passed (the original shared/router/coverage set was 313/313, with
  131 character-stock/router tests added). During closeout, the MCP
  model-picker missing-connection path was made fail-closed (BAD_REQUEST)
  instead of silently falling back to gateway routing. No new changed-surface
  TypeScript errors were reported; repository-wide typecheck remains blocked
  by the existing unrelated baseline errors listed above.
