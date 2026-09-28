# Deep-plan research — Feature 193

## Research decision

- **Codebase research:** required. This is an existing git monorepo with Web
  Video Editor, shared media contracts, Feature 186 job routing, and Worker App
  render code.
- **Web research:** limited to browser execution constraints because the spec
  names Web Workers and AudioWorklet. No new provider or vision dependency is
  selected by this research.
- **Testing:** Vitest is the existing Web test runner. Browser workflow tests
  use Playwright where a real browser is required. The repository instruction
  forbids running the workspace TypeScript typecheck unless explicitly asked;
  this implementation must use focused Vitest checks and browser tests where
  available instead.

SocratiCode was not available in this session, so discovery used targeted
`rg`, file reads, package scripts, and existing test locations. Broad edits must
still be preceded by focused impact inspection.

## Existing codebase findings

### Shared camera and composition contracts

- `packages/shared/src/video-editor/cameraMotion.ts` already provides the
  normalized `CameraMotionPlan`, `face_focus` / `face_activity` modes,
  keyframe evaluation, safe pan bounds, activity hysteresis, and plan
  fingerprints.
- `packages/shared/src/video-editor/compositionScan.ts` already defines the
  canonical job type `video.composition_scan`, contract version
  `feature-191.v1`, dedupe input, checkpoint shape, and promotion fencing.
- Feature 191 is the owner of the composition algorithm and explicitly keeps
  Quick mode provisional and Full Scan authoritative. Feature 193 should add
  Web routing/evidence and avoid a second planner.

### Web editor surfaces

- `VideoEditorPhase3.tsx` owns the Web editor orchestration. It currently gates
  queue actions and Smart Camera analysis through an optional `workerHandoff`
  boolean. This is too coarse for the browser-first requirement; local editing
  must remain available when that flag is false.
- `SmartCameraPanel.tsx` currently exposes legacy modes (`off`, `auto_face`,
  `auto_object`, `manual_keyframes`) and describes analysis as Worker work. It
  needs explicit Face Focus / Face + Activity labels, capability state, and
  optional Full Scan handoff while retaining legacy value compatibility.
- `SilenceDetectionDialog.tsx` is already the full-screen review surface with
  waveform, thresholds, region review, and timeline export. It currently calls
  `MediaJobClient.detectDeadAir`; the new local browser adapter should be
  introduced behind this dialog rather than creating another editor.
- `SilenceDetectionPanel.tsx` exposes a Worker queue action for
  `media.silence_detect`; that action should become a fallback/explicit Worker
  route, not the only way to use Quick Silence Cut.
- `VideoEditorRenderService.startRender` and `MediaJobClient` retain legacy
  render request names such as `render_mp4_h264`. Web export must converge on
  the Feature 186 canonical `video.render` envelope and preserve a compatibility
  shim during rollout.

### Server and job routing

- `packages/shared/src/video-editor/mediaExecutionContract.ts` has allowlisted
  operations including `media.silence_detect`, `media.reframe`, and
  `video.render`, but no `media.composition_scan` yet.
- `apps/web/server/services/editorMediaJobContract.ts` maps editor operations
  to Feature 186 job types and currently maps `media.reframe` to the generic
  `editor_media_analysis` job family.
- `apps/web/server/services/compositionScanJob.ts` and
  `apps/web/server/services/jobExecutorRegistry.ts` already register
  `video.composition_scan` as a PostgreSQL-pull job. The shared composition
  payload version (`feature-191.v1`) and the Feature 186 transport version
  (`feature-186-v1`) are separate and must be validated/mapped explicitly.
- `apps/web/server/services/editorExecutorPolicy.ts` and the editor router
  already distinguish analysis and render capabilities. The implementation
  should extend these policies instead of introducing a new job ledger.
- `apps/web/server/routers/editorMediaJobs.ts` currently rejects submission
  when the desktop Worker handoff is disabled. Feature 193 needs a server-owned
  hosted-worker/worker-pull policy for heavy work while preserving local browser
  behavior.

### Testing and commands

- Web tests run with `npm --workspace apps/web test` and Vitest. Existing focused
  tests cover `SilenceDetectionDialog`, `MediaJobClient`, shared camera-motion
  behavior, and editor service contracts.
- Playwright is installed for browser-level workflows, but an existing route
  fixture and a stable media fixture must be identified before adding an E2E
  test. Browser tests are required for play/seek/render parity claims when the
  fixture is available.
- Do not run `npm run typecheck` or the Web `check` script during this task
  unless the user explicitly requests it.

## External browser references

- MDN describes `AudioWorklet` as a separate-thread Web Audio processing path:
  https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet
- MDN documents `AudioWorkletProcessor` and its message-port boundary:
  https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor
- MDN documents the dedicated `Worker` execution context for background work:
  https://developer.mozilla.org/en-US/docs/Web/API/Worker

These references support the non-blocking browser execution boundary. They do
not choose a face-landmark model or authorize a new dependency. The concrete
browser vision runtime remains a capability-gated implementation decision.

## Key implementation risks

1. A browser preview can diverge from Worker render if it recomputes crops from
   live detections instead of evaluating the saved shared plan.
2. Five-point face evidence can be lost across serialization unless it is part
   of the versioned shared evidence/artifact contract.
3. Silence ranges can desynchronize overlays/camera timing if the editor stores
   only audio ranges instead of a source-to-edited-time map.
4. The current `workerHandoff` gate can accidentally disable browser features;
   routing must be capability-aware and operation-specific.
5. Contract-version mismatch can produce a permanently queued composition scan;
   transport and nested Feature 191 versions need an explicit compatibility
   allowlist.

## Reuse decision: Worker App vision runtime

The Worker App already ships `@mediapipe/tasks-vision` `^1.0.1`, the local
`blaze_face_full_range.tflite` model, and the matching WASM bundle under
`apps/worker-app/public/mediapipe/wasm`. Its player and `cameraTracking.ts`
contain the detector coordinate and continuity fixes that must not be
reimplemented with a second model. Feature 193 therefore reuses the same
package/model/runtime contract for the browser adapter. Pure normalization,
five-point projection, association, cut-map, and planner logic belongs in
`@smartspec/shared`; React/player code is not copied into Web. The Web asset
strategy is an explicit deployment gate: serve the same immutable assets from
the approved managed path or return a truthful degraded capability result; do
not silently fetch an untracked model.
