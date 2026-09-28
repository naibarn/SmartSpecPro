# Dead-Air Multi-Segment Render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent long Dead-Air re-renders from appearing stuck by replacing the native multi-segment per-file encode loop with one FFmpeg filter-graph render.

**Architecture:** Keep `run_interactive_media_render`'s existing one-segment fast path. For multiple retained segments, build one filter graph with bounded inputs, per-segment video/audio normalization, existing crop/camera filters, and a final concat node; store that graph in a temporary filter script and encode once to the requested output.

**Tech Stack:** Rust, Tauri native media pipeline, FFmpeg/FFprobe, Cargo unit tests, Vitest worker timeline tests.

**Spec:** `docs/portable-skill-pack/specs/2026-09-19-dead-air-multisegment-render-design.md`

## Global Constraints

- Preserve existing single-segment render behavior.
- Preserve audio, Dead-Air ordering, playback speed, crop, and camera-plan timing.
- Do not add dependencies or use retired workflow, Agency, OpenSandbox, or Docker systems.
- Do not run repository TypeScript typecheck commands.
- Preserve unrelated dirty-worktree changes and do not commit unless explicitly requested.

## Review Focus

- Multiple retained segments with audio must produce one concat graph and retain audio; test the graph and the existing FFmpeg smoke path in Task 1.
- Multiple retained segments without audio must use video-only concat and not map a missing audio label; test graph construction in Task 1.
- Camera-plan expressions must use accumulated retained output offset; test the generated graph's crop-filter offsets in Task 1.
- A single retained segment must stay on the old fast path; retain the existing smoke coverage while changing only the multi-segment branch.
- Empty or reversed segments must fail before command construction; retain the existing guard and add focused builder validation in Task 1.

### Task 1: One-pass native multi-segment render

**Files:**
- Modify: `apps/worker-app/src-tauri/src/media_pipeline.rs:3047-3307`
- Test: `apps/worker-app/src-tauri/src/media_pipeline.rs` module tests near the existing native render smoke tests

**Interfaces:**
- Consumes: validated `segments`, existing crop-filter builder, existing audio-speed filter, and optional camera plan.
- Produces: a private filter-graph builder used only by `run_interactive_media_render`.

- [x] **Step 1: Write the failing graph-construction test**

Add a unit test beside the existing native render tests that calls the new
private builder with two retained segments and asserts that the returned graph
contains both `[0:v:0]` and `[1:v:0]`, has `concat=n=2:v=1:a=1` for an audio
source, and includes the second segment's accumulated camera offset. Add a
video-only assertion using the same two segments that expects `concat=n=2:v=1:a=0`
and no audio labels.

- [x] **Step 2: Run the new test and verify it fails**

Run:

```bash
cargo test --manifest-path apps/worker-app/src-tauri/Cargo.toml multi_segment_filter_graph -- --nocapture
```

Expected: compilation/test failure because the new graph builder does not yet
exist.

- [x] **Step 3: Implement the minimal filter-graph builder**

Add a private helper that accepts the retained segment list, the per-segment
crop filters, the audio filter, and a `has_audio` flag. It must:

- reject an empty list, reversed ranges, and mismatched crop-filter count;
- create one video input chain per segment using `trim=duration=...` and
  `setpts=PTS-STARTPTS`;
- create one audio chain per segment using `atrim=duration=...`,
  `asetpts=PTS-STARTPTS`, and the existing audio filter when `has_audio` is true;
- append `concat=n=<count>:v=1:a=<0|1>` and return `[vout]` plus `[aout]` when
  audio is present.

- [x] **Step 4: Replace only the multi-segment per-file loop**

In `run_interactive_media_render`, retain the existing single-segment branch.
For the multi-segment branch, probe `has_audio`, build the existing crop filter
for each segment with the accumulated output offset, build one FFmpeg command
with bounded `-ss`/`-t` inputs, attach the generated `-filter_complex_script`, map the
final video and optional audio labels, and encode once. Remove the temporary
part-file/concat fallback from this branch. Preserve the existing error names
for unavailable or failed FFmpeg execution.

- [x] **Step 5: Run focused native tests**

Run:

```bash
cargo test --manifest-path apps/worker-app/src-tauri/Cargo.toml multi_segment_filter_graph -- --nocapture
cargo test --manifest-path apps/worker-app/src-tauri/Cargo.toml camera_plan_native_ffmpeg_smoke_keeps_audio_after_dead_air_concat -- --nocapture
```

Expected: both tests pass, including audio retention and non-zero output
duration for the multi-segment render.

### Task 2: Worker regression verification

**Files:**
- Modify: none
- Test: `apps/worker-app/tests/media-workspace/timeline.test.ts`, `apps/worker-app/tests/media-workspace/project.test.ts`

**Interfaces:**
- Consumes: the unchanged browser-side Dead-Air timeline contracts.
- Produces: focused evidence that the native change did not alter timeline
  range or project metadata behavior.

- [x] **Step 1: Run focused Worker tests**

Run:

```bash
node_modules/.bin/vitest --config apps/worker-app/vitest.config.ts run tests/media-workspace/timeline.test.ts tests/media-workspace/project.test.ts
```

Expected: all existing timeline/project tests pass.

- [x] **Step 2: Run formatting and owned-path checks**

Run:

```bash
cargo fmt --manifest-path apps/worker-app/src-tauri/Cargo.toml -- --check
git diff --check -- apps/worker-app/src-tauri/src/media_pipeline.rs docs/portable-skill-pack/specs/2026-09-19-dead-air-multisegment-render-design.md docs/superpowers/plans/2026-09-19-dead-air-rerender.md
```

Expected: formatting and whitespace checks pass. The crate-wide formatter
reported pre-existing formatting differences in `commands.rs` and
`diagnostics.rs`; the owned `media_pipeline.rs` file passed direct rustfmt and
the owned diff check passed. Report the unrelated crate-wide diagnostics
separately.
