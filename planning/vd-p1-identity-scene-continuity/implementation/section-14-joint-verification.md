# Section 14 implementation record

Completed the code-side closeout for Features 137/138 P1a/139:

P2 follow-up implementation (same checkout):

- Shared `vertical-drama-start-frame-video-safety-qa` vision contract now
  powers `runFrameContinuityQc` (F138) and `runStartFrameVideoSafetyQc`
  (F137); both are advisory/fail-open and persist findings in the existing
  `start_frame_image` QC stage.
- F137 dual-role video-safe anchors are wired through
  `generateVideoSafeStartFrame`, `setVideoStartFrameAsset`, plan carry-over,
  asset URL projection, and paid video-render preference ordering.
- F138 location coverage roles and planner `gapDescription` flow through the
  existing location prompt/render/picker contract with the approved primary
  plate attached as the consistency reference.
- F137 three-slot character angle packs are now generated through the existing
  portrait renderer, persisted with `angle_*` roles, and linked into the
  explicit generated/review state; stock lookup can select an approved angle
  when a future consumer supplies a facing, with primary fallback.

- `verticalDramaP1FlagOffParity.test.ts` captures five stable prompt/reference
  surfaces at merge-base `9eda150ce...` and proves omitted/explicit-false parity.
- `verticalDramaP1BothFlagsOn.test.ts` covers the joint scene/motion matrix,
  lock ordering, reference cap, and prompt budget.
- `verticalDramaP1RealLlmGate.ts` plus offline/live suites provide a frozen,
  pure evaluator. Live execution is opt-in and requires an authorized sample;
  no provider call is made by default.
- Router, scene-lock UI, storyboard UI, and workspace forwarding tests cover
  mutation guards, stale revisions, feature-off rendering, and fallback wiring.
- The selected-model budget call now has explicit `getStaticModelById` mocks in
  the legacy router suites, restoring the frozen Gate B fail-set.
- The existing scene mutation implementation also received a narrow row type
  assertion and locale narrowing so the touched VD surface has no type errors.

Evidence:

- Gate A: 5 failures / 263 passes; final fail-set is identical to
  `gate-a-failset-current.txt`.
- Gate B: 57 failures; `comm -13` against `gate-b-failset-after.txt` is empty.
- Focused Section 14 run: 37 passed, 1 opt-in live test skipped.
- Full typecheck remains non-green outside VD P1 (41 repository-wide errors);
  the changed-surface filter is empty.

Still external/manual: internal tenant browser smoke and one authorized
real-LLM sample. P1b neighbor anchoring is implemented behind the child canary;
its paid-provider latency and anchor-coverage evidence remain pending. P2
vision/provider smoke is also pending. Facing-aware angle selection and P3
clip identity QC are now implemented; only rollout evidence remains.

P2 UI/API closeout (2026-08-01): shot cards now expose continuity and
video-safety badges, explicit QC actions, and the optional video-start-frame
thumbnail/clear fallback. Location Visual Bible has role/gap controls and the
named `generateLocationCoverageImage` route, while existing asset listing
preserves coverage role metadata. The focused UI suites and character-stock
surface pass 444/444 (the original shared/router/coverage subset was 313/313).
The MCP
model-picker missing-connection path now fails closed with `BAD_REQUEST` rather
than silently routing through the gateway. No live provider/browser evidence
was added.

P3 clip identity-QC closeout (2026-08-01): the Python media queue now performs
bounded sequential ffmpeg sampling and R2 rehosting through a token-protected
internal endpoint. `runClipIdentityQc` performs one vision call per generated
or imported clip, persists `identityQc` plus the existing `video_clip` report,
and exposes a manual-only badge/recheck action. The stock consumer selects an
approved angle-pack asset when the motion contract declares an explicit facing,
with primary-portrait fallback. New focused evidence is **2 shared tests + 2
Python endpoint tests passed**; the Python suite exits non-zero only because
the repository enforces an 80% whole-suite coverage threshold. No live
provider/browser/calibration evidence was added.
