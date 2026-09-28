# Deep-plan research — Feature 191

## Discovery method

The repository SocratiCode MCP index was unavailable in this session. Targeted
shell discovery was used instead, with line-range reads after symbol searches.
No external web research was required: the implementation boundary is local
camera planning, Worker App preview/render parity, and the existing Feature 186
job contract. Provider/model choices remain capability-gated by the spec.

## Findings

1. `packages/shared/src/video-editor/cameraMotion.ts` currently supports only
   `auto`, `face_focus`, and `product_focus`; it generates periodic fixed
   patterns and merges `productPins` as user keyframes. It has a 512-keyframe
   validator and a JSON fingerprint helper. This is the safest shared seam for
   the new Face + Activity plan because preview and Rust already consume a
   versioned plan-shaped object.
2. `apps/worker-app/src/screens/media-workspace/MediaVideoEditorPlayer.tsx`
   builds `cameraMotionPlan` around lines 871–905 and sends the same plan to
   `worker_app_process_media_interactive` around lines 2750–2780. Existing
   preview tracking samples a MediaPipe face detector on `timeupdate` at about
   850ms and holds the previous anchor when no face is detected. This is useful
   for Quick mode but cannot be the Full Scan evidence source.
3. The player already persists and renders `productPins`/Mark points. Mark
   points must remain a first-class source in the planner, with deterministic
   precedence over inferred activity at overlapping times.
4. `apps/worker-app/src-tauri/src/media_pipeline.rs` defines
   `CameraMotionPlan`, `MediaFocusKeyframe`, validation, FFmpeg expressions, and
   segment remapping. The Rust validator currently accepts the three legacy
   modes and the focus track is point-only. The plan version and mode are the
   correct compatibility boundary; unknown versions must fail closed.
5. `apps/worker-app/src-tauri/src/commands.rs` currently rejects non-manual
   local reframe requests before a validated AI focus track exists. This must
   change to accept a validated canonical plan/evidence reference and retain a
   truthful fallback when no capability is available; it must never fabricate a
   detector result.
6. `apps/worker-app/speaker-aware-runner/speaker_aware_runner.py` already has
   optional MediaPipe face/person adapters and explicit capability/model status
   reporting. It is an appropriate optional Full Scan adapter boundary, but no
   object detector model was found in the bundled assets. Object tracking must
   therefore be model/capability gated and may fall back to person/face/Mark
   evidence with a visible degraded state.
7. `apps/worker-app/package.json` depends on `@mediapipe/tasks-vision`; the
   package has no dedicated composition-analysis command or object model asset.
   The implementation must avoid adding a large model/dependency as an
   implicit requirement.
8. Existing Rust tests in `apps/worker-app/src-tauri/src/media_pipeline.rs`
   cover plan remapping and validation. Existing Worker tests live under
   `apps/worker-app/tests/media-workspace`; shared package test discovery must
   be checked before adding a runner-specific command.

## Consequence for implementation

Implement a versioned evidence/plan contract and deterministic planner first;
wire Quick to existing detector sampling; add Full Scan as a resumable,
capability-aware analysis path; preserve Mark semantics; and make the Rust
renderer consume only validated plans. Object detection is optional until a
validated model capability is present, while face/person/activity and Mark
paths remain usable.
