# Web Video Editor Worker Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make Web Video Editor and Worker App agree on face/activity camera plans, silence-cut provenance, and final render behavior.

**Architecture:** Build one pure Web handoff helper and use it in every canonical render envelope. Extend the canonical NLE clip contract with an optional camera plan, then make the Worker Rust renderer validate and apply that plan with the existing native crop/remap helpers while preserving the already-rippled Web timeline as the source of truth for silence cuts.

**Tech Stack:** TypeScript/Vitest, shared `@smartspec/shared` contracts, Rust/Tauri Worker App, FFmpeg filter graph.

**Spec:** `docs/portable-skill-pack/specs/2026-09-17-web-video-editor-worker-parity-design.md`

## Global Constraints

- Preserve unrelated dirty-worktree changes and keep edits focused.
- Do not add dependencies or database migrations.
- Do not run workspace TypeScript typecheck because the repository has a RAM constraint.
- Reject stale or invalid camera plans before render.
- Do not apply `silenceCutMap` a second time to a timeline already ripple-cut by Web.

### Task 1: Define and test the shared Web render handoff

**Files:**
- Create: `apps/web/client/src/components/videoeditor/workerRenderHandoff.ts`
- Create: `apps/web/client/src/components/videoeditor/__tests__/workerRenderHandoff.test.ts`
- Modify: `apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx`
- Modify: `apps/web/client/src/components/videoeditor/workerEditorProject.ts`

**Interfaces:**
- `buildWorkerRenderOptions(project: VideoEditorProject): { cameraMotionPlans: Record<string, CameraMotionPlan>; silenceCutMap?: SilenceCutMap; handoffVersion: string }`
- `buildWorkerRenderOptions` rejects a clip whose persisted plan is stale and excludes clips without a plan.

- [ ] Write a failing test for a project containing one approved face/activity plan and one silence map; assert the helper returns both exact values and a stable handoff version.
- [ ] Write a failing test that stale plans throw `CAMERA_PLAN_STALE_REANALYSIS_REQUIRED:<clipId>`.
- [ ] Run the focused Vitest file and confirm it fails because the helper is not implemented.
- [ ] Implement the pure helper with shared camera-plan validation and no mutation of the project.
- [ ] Replace duplicated option construction in queue/final render with this helper and add `options` to the final `video.render` envelope.
- [ ] Preserve the handoff in canonical project migration metadata for inspection without making it the only execution source.
- [ ] Run the focused Web tests and confirm they pass.

### Task 2: Fix speed-aware browser evidence timing

**Files:**
- Modify: `apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx`
- Modify: `apps/web/client/src/services/browserVideoAnalysis.ts` only if the test identifies a service contract issue.
- Modify: `apps/web/client/src/components/videoeditor/__tests__/workerRenderHandoff.test.ts` or create a focused browser-analysis regression test.

**Interfaces:**
- Quick camera plan duration equals `trimRange.endMs - trimRange.startMs`, matching the clip-relative evidence timestamps.

- [ ] Add a regression test for a non-zero trim and speed 2 clip; assert the plan duration equals the source analysis window and the first/last evidence times remain within it.
- [ ] Run the test and confirm the current timeline-duration implementation fails.
- [ ] Change only the duration passed to `createCameraMotionPlan`.
- [ ] Run the browser-analysis and Smart Camera focused tests.

### Task 3: Extend the canonical clip contract and Worker render inputs

**Files:**
- Modify: `packages/shared/src/video-editor/nleProject.ts`
- Modify: `apps/web/client/src/components/videoeditor/workerEditorProject.ts`
- Modify: `apps/worker-app/src-tauri/src/worker_loop.rs`
- Modify: `apps/worker-app/src-tauri/src/media_pipeline.rs`
- Create or modify: focused Rust tests in `apps/worker-app/src-tauri/src/media_pipeline.rs` test module.

**Interfaces:**
- `CanonicalNleClip.cameraMotionPlan?: CameraMotionPlan`.
- `run_editor_nle_render(project, options, asset_paths, output, tools)` validates the optional plan and consumes per-clip plans.

- [ ] Add a failing Rust test showing a valid canonical clip plan is accepted and an invalid plan is rejected before render.
- [ ] Add a failing Rust test for source-time remapping of a plan when the canonical clip starts at non-zero `sourceInMs`.
- [ ] Run the focused Rust tests and confirm failure.
- [ ] Add the optional typed field and map approved plans directly onto canonical video clips.
- [ ] Pass job `options` into `run_editor_nle_render`.
- [ ] Reuse `validate_camera_motion_plan`, `remap_camera_motion_plan_for_segments`, and `build_interactive_crop_filter` in the canonical renderer.
- [ ] Apply per-clip playback rate to video and audio filter timing; preserve existing center/canvas behavior when no plan exists.
- [ ] Include a compact render provenance object in QC metadata: plan count, silence-map fingerprint, and source/edited duration values.
- [ ] Run focused Rust tests and the existing media pipeline tests.

### Task 4: Align silence-range normalization and protect against double cuts

**Files:**
- Modify: `apps/worker-app/src/screens/media-workspace/mediaWorkspaceTimeline.ts`
- Modify: `apps/worker-app/tests/media-workspace/mediaWorkspaceTimeline.test.ts`
- Modify: `apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx` only if final render stale gating needs the shared helper.

**Interfaces:**
- Worker playback keeps manual-only ranges when analysis is not ready, but normalization uses the shared overlap semantics.

- [ ] Add a test proving ranges separated by 50 ms are not silently merged by the shared cut-map normalizer.
- [ ] Run the focused Worker timeline test and confirm the current local `+50` merge behavior fails the new expectation.
- [ ] Import/use shared `normalizeSilenceRanges` and retain the local `SilenceRange` adapter.
- [ ] Add a regression assertion that final render rejects stale camera plans rather than rendering a plan against a changed silence map.
- [ ] Run focused Worker timeline and Web handoff tests.

### Task 5: Fresh verification and evidence report

**Files:**
- No source changes unless a verification failure identifies a directly related defect.

- [ ] Run all touched-path Vitest suites.
- [ ] Run focused Rust media pipeline tests with Cargo.
- [ ] Run focused Python compatibility render tests only if the shared envelope changes require them.
- [ ] Inspect the diff and confirm unrelated worktree changes were preserved.
- [ ] Record that browser/real Worker render proof is still required if those environments are unavailable.
