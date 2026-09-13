# Worker Auto Pan/Zoom Choreography and Render Parity

## Goal

Replace continuous Auto Zoom/Pan oscillation with a deterministic camera
choreography that holds the frame for 5–10 seconds between slow moves. The same
camera plan must drive Worker Preview, direct FFmpeg Render, FFmpeg Dead-Air
Render, and Remotion Render. User-defined mark/keyframe points remain
authoritative and are approached slowly rather than overwritten by automatic
motion.

## Current gap audit

- `MediaVideoEditorPlayer` already has `productPins` with time, normalized
  position, pixel position, and optional scale. Preview interpolates multiple
  pins and has several hold phases.
- Direct FFmpeg rendering currently receives only mode, focus, and scale. It
  does not receive `productPins`, so the renderer cannot honor user marks.
- The latest FFmpeg Auto Zoom filter uses a versioned, piecewise camera plan;
  this is not the same as the Preview choreography and has no intentional
  rest phases.
- Remotion submission receives the Dead-Air selection and project/job data but
  does not materialize the Worker camera pins as canonical transform keyframes.
- The shared canonical NLE schema already supports `transform.keyframes`, but
  the Worker camera path does not populate or consume them end-to-end.
- Render results in the direct Worker panel are already displayed in the same
  component, but the panel is initialized collapsed and is not automatically
  expanded when a result arrives. Remotion queue completion needs an explicit
  completion signal if its result is reported outside the local FFmpeg path.

## Design

### 1. Versioned camera plan

Add a backward-compatible `CameraMotionPlan` contract in
`packages/shared/src/video-editor/cameraMotion.ts`, then add adapters for the
Worker legacy project shape and the canonical NLE shape. It contains:

- `version`: stable contract revision;
- `mode`: `auto`, `face_focus`, or `product_focus`;
- `durationMs` and source-timeline timebase;
- ordered (non-decreasing time) keyframes containing `timeMs`, normalized
  `x/y`, `scale`, and easing;
- authority/source metadata distinguishing generated beats from user marks;
- optional source mark id for traceability.

The plan is generated from the current video, selected mode, focus anchor,
manual scale, and saved user marks. It is persisted as an optional
`metadata.cameraMotionPlan` field in the Worker project and is carried as an
optional `cameraMotionPlan` field in direct-process, preprocessing-plan, and
Remotion submission payloads. The canonical NLE adapter materializes the same
points into the main video clip's `transform.keyframes`. Old projects load with
the generated default plan and are never rewritten destructively. Boundary
validators reject non-finite values, backwards time ordering, positions outside
`[0,1]`, scale outside the safe range, and excessive keyframe counts. Equal
times are allowed only for a collapsed cut boundary or an explicit user mark;
the user-authoritative keyframe wins when the renderer resolves a tie.

### 2. Deterministic automatic choreography

The generated default uses a roughly 36-second cycle:

1. hold the wide anchor for 9 seconds;
2. move for 5 seconds;
3. hold the target for 9 seconds;
4. move back or to the next target for 5 seconds;
5. hold the wide/settled anchor for 8 seconds.

Each cycle selects a deterministic pattern from the cycle index, not runtime
randomness. Patterns include zoom-only, horizontal/vertical pan, diagonal
zoom-plus-pan, and diagonal pull-back. Movement uses bounded safe anchors and
ease-in-out interpolation. Every stable phase is at least 5 seconds unless a
user mark forces a shorter interval because two marks are closer together.

### 3. User keyframe authority

User marks are sorted by source time and retained exactly. Automatic motion may
fill gaps before, between, and after marks, but may not replace a marked
position or scale. The plan approaches a mark slowly, arrives at its exact
time, and holds it for 5–10 seconds when the surrounding timeline permits. Automatic
anchors are clamped to a conservative 20%–80% safe area, while the renderer centers
the requested focal point in the crop before applying the zoom.
Multiple marks become sequential camera waypoints. Existing single-pin and
legacy localStorage data are imported into the plan as a user-authoritative
mark without requiring a migration.

### 4. One plan for all render paths

- Preview evaluates the same plan at the current source time.
- Normal FFmpeg Render evaluates it against the identity time map.
- Dead-Air Render builds a retained-time map from the source segments and
  remaps plan keyframes before rendering, so the camera does not restart at
  each retained segment or jump because a removed interval changed the clock.
- Remotion receives the same plan and materializes it into the canonical main
  video clip transform keyframes. Remotion interpolation uses the plan easing
  and preserves user-authoritative points.

The direct Worker request and the Remotion planning/submission payload carry
the optional plan. Missing plans retain the current static/manual behavior for
old callers; invalid plans fail closed with a clear validation error rather
than silently rendering a different camera path.

The retained-time map is deterministic: for a keyframe before a removed
range, output time is source time minus all removed duration before it; a
keyframe after a removed range is mapped to the same boundary-adjusted time. A
keyframe whose source time is inside a removed range is kept in the saved
source plan but is materialized at the first retained boundary after the cut,
so its target becomes active on the first frame where that source content can
still be shown. The renderer reports the count of such collapsed marks in the
optional render result diagnostics and never silently deletes the user's source
mark.

### 5. Render result panel behavior

When a direct FFmpeg or Dead-Air render returns a successful result, the result
state automatically sets the Render panel to expanded. Remotion submission
adds an explicit completion event/callback from the Worker job result path;
only a successful completed artifact (not merely queue acceptance) expands the
panel. Existing result cards and download/open/play actions are preserved; only
visibility and focus behavior change.

### 6. Scope and safety

- No database migration or new dependency.
- Optional project/payload fields preserve old projects and older callers.
- No user mark is deleted, moved, or silently replaced.
- Existing manual/off mode remains static.
- Dead-Air ranges remain source-authoritative and are applied before the
  camera-plan time map is evaluated.
- The release remains a cross-built, unsigned Windows installer unless a
  Windows signing environment is available.

## Verification plan

- Pure plan tests for default phase durations, pattern variety, safe bounds,
  and user-keyframe precedence.
- Time-map tests for identity and Dead-Air-retained timelines.
- TypeScript tests for plan serialization and request payloads.
- Rust tests for plan validation, FFmpeg expression generation, and a native
  FFmpeg smoke render with audio.
- Remotion contract tests proving canonical transform keyframes are populated
  and consumed.
- UI tests proving a successful render expands a collapsed panel and keeps the
  Download action visible.
- Worker production frontend build and the next Windows release package copied
  to both dashboard release locations, with matching SHA-256 checksums.
