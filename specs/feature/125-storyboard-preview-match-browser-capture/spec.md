# Feature 125: Storyboard Preview-Match Browser Capture

Version: 0.1.0
Date: 2026-06-27
Status: Proposed
Depends-on:
- Feature 119 HyperFrames Marketplace Auto Review Render Adapter
- Feature 120 HyperFrames Creative Systems Overlay, Subtitle, Audio, And SFX Presets
- Feature 124 Smart AI Hub Worker App
- Existing Presentation export dynamic browser capture path
- Existing Storyboard Review, HyperFrames final composite state, Media Library, worker jobs, storage, tenant access, credit, audit, and QA systems
Audience: Storyboard Review, Marketplace Auto Review, Presentation Export, Render Workers, Media Library, Product, QA, Security, DevOps

---

## 1. Executive Summary

Add a second Storyboard Review final composite action named **Capture Final Composite**.

The existing **Render Final Composite** action remains available as the
HyperFrames/worker render path. The new **Capture Final Composite** action uses a
Presentation-style realtime browser capture path: it plays the same final
composite surface that the user sees in Live preview, records the visual output
at the target resolution, then runs FFmpeg post-processing for trimming,
concatenation, audio mixing, metadata, upload, and server verification.

Primary goal: the captured MP4 must visually match Storyboard Review Live preview
for overlays, CSS animation, transitions, subtitle timing, safe areas, fonts,
and video playback. Render speed and preview parity are prioritized over
frame-by-frame deterministic rendering.

Recommended product label:

- Button label: **Capture Final Composite**
- Thai copy: **Capture ตาม Preview**
- Help/status copy: "บันทึกวิดีโอจาก preview runtime เพื่อให้ animation และ subtitle ตรงกับที่เห็น"
- Internal render engine id: `preview_match_browser_capture`

This feature does not remove HyperFrames rendering. HyperFrames remains the
deterministic/archival/compatibility path. Preview-match browser capture becomes
the preferred user-facing path when a user wants fast output that looks the same
as the Live preview.

---

## 2. Problem Statement

Storyboard Review users can preview a final composite where text, subtitles,
animations, transitions, and source videos look correct. However, the existing
worker HyperFrames final render can diverge from that preview:

- CSS/GSAP animation can disappear or resolve differently.
- Subtitle cues can appear all at once instead of following their timestamps.
- Per-shot timing and split-render/concat behavior can drift from the live
  preview surface.
- Long videos can take 30 minutes or more to render even on machines with GPU,
  because the current render strategy may seek/capture frames rather than
  record a continuously playing preview.

Presentation export already has a faster dynamic path that records a browser page
while it plays, then uses FFmpeg for output assembly. That model better matches
the user's mental model: "capture what I am seeing in preview."

The system needs an explicit, testable render option that reuses that
Presentation-style behavior for Storyboard Review final composites.

---

## 3. Goals

### 3.1 Primary Goals

1. Add a Storyboard Review button next to the existing final render action:
   **Capture Final Composite**.
2. Use the same resolved preview composition surface for Live preview and
   browser capture.
3. Support quality presets:
   - `standard`: fast social-video quality, CRF 23 target, 30fps default.
   - `high`: higher bitrate/sharper text, CRF 18 target, 30fps default.
4. Default MVP execution to server-managed browser capture because the current
   Presentation export path already runs without GPU and is operationally
   controllable.
5. Keep the client/browser capture option as an experimental future path for
   local preview/download only until upload, codec, tab lifecycle, and security
   constraints are solved.
6. Preserve existing server verification, Media Library save, audit, storage,
   credit, and tenant isolation.
7. Provide parity evidence before completed status: screenshot/frame comparison
   against the preview composition, subtitle timing checks, output probe, and
   duration/fps validation.

### 3.2 Secondary Goals

1. Reuse as much of the existing Presentation dynamic capture pipeline as
   possible.
2. Make the capture engine reusable by Smart AI Hub Worker App later, so render
   load can move off the web/server host without changing the Storyboard Review
   contract.
3. Surface clear status copy distinguishing:
   - HyperFrames render
   - Preview-match browser capture
   - client experimental capture
4. Store capture metadata with output artifacts so support can diagnose whether
   an MP4 came from realtime capture or deterministic HyperFrames render.

### 3.3 Non Goals

This feature must not:

- remove or rename the existing HyperFrames render action;
- use browser MediaRecorder output as trusted final Library output without
  server verification;
- depend on GPU for the MVP;
- capture the visible Storyboard Review UI, toolbar, buttons, player controls,
  or browser chrome;
- rely on arbitrary tenant-authored HTML;
- expose signed URLs or raw composition HTML in normal user-facing UI;
- bypass credit, audit, storage, or Media Library workflows.

---

## 4. Recommended Solution

### 4.1 Chosen MVP: Server-Side Preview-Match Browser Capture

Server-managed capture is the best MVP path.

Rationale:

- It is closest to the existing Presentation dynamic export implementation.
- It can run without GPU.
- It keeps storage/upload/server verification trusted.
- It works when the user's browser tab is closed after submission.
- It avoids relying on inconsistent client codecs and MediaRecorder behavior.
- It lets the server apply fixed viewport, fps, quality, font, asset preload,
  timeout, and QA policy.

The server should create a capture job, resolve/stage assets, open an internal
render-only composition URL in Playwright/Chromium, wait for readiness, record
the playing composition at the requested resolution, then use FFmpeg to trim,
encode, mix audio, probe, upload, and verify.

### 4.1.1 Execution Decision

MVP capture must run in a **dedicated server worker**, not inside the Express web
request path.

Preferred implementation order:

1. Reuse or extend the existing Python Presentation export worker if its queue,
   Playwright, FFmpeg, storage, progress, and timeout model can accept
   Storyboard final composite jobs without coupling to presentation deck tables.
2. If that creates too much cross-domain coupling, create a small dedicated
   `storyboard_capture` worker process with the same operational shape:
   Playwright/Chromium, FFmpeg/FFprobe, storage client, progress events, retries,
   and cleanup.
3. Do not run long captures in `apps/web` Express/tRPC request handlers. The web
   server may validate, persist, enqueue, sign manifests, and project status only.

Rationale:

- capture duration is tied to source video length and may run for many minutes;
- worker queue isolation prevents web request starvation;
- browser/FFmpeg crashes are easier to contain outside the web process;
- concurrency can be capped independently from normal API traffic;
- the same worker contract can later move to Smart AI Hub Worker App.

Operational queue name suggestion:

```text
storyboard_capture
```

Worker task name suggestion:

```text
storyboard_capture.render_preview_match_final_composite
```

### 4.2 Deferred Option: Client-Assisted Capture

Client-side capture is useful later, but should not be the default final output
path in MVP.

Potential benefits:

- Reduces server CPU/render load.
- Feels fast for short outputs.
- Could support instant local draft downloads.

Blocking risks:

- Browser codec availability differs by OS/browser.
- Long captures are fragile if the tab sleeps, the laptop throttles, the user
  switches apps, or the browser kills background work.
- Captured blobs must still upload and be server-verified before Library save.
- CORS/signed asset access must be carefully scoped.
- Audio capture from mixed media elements is inconsistent across browsers.
- User machines may produce inconsistent text antialiasing and frame pacing.

Client capture can be introduced later behind an explicit experimental flag:
`STORYBOARD_CLIENT_CAPTURE_EXPERIMENT_ENABLED`. It should produce draft/local
outputs first, then graduate to server-verified upload after parity and security
tests pass.

### 4.3 Future Option: Worker App Preview-Match Capture

After the server path proves quality and parity, Smart AI Hub Worker App can run
the same capture engine locally:

- the server still queues, signs manifests, verifies, stores, audits, and
  publishes;
- the Worker App downloads staged assets and composition HTML;
- the worker runs the browser capture engine instead of HyperFrames frame render;
- the worker uploads MP4 plus capture manifest;
- the server verifies before completed status.

This is the preferred long-term load-reduction path because it preserves the
trusted worker contract while avoiding slow frame-by-frame render behavior.

---

## 5. User Experience

### 5.1 Storyboard Review Controls

In the Final Composite panel, show two adjacent primary actions when a final
source video set is valid:

1. **Render Final Composite**
   - Existing HyperFrames worker render path.
   - Copy: "ใช้ HyperFrames render path เดิม เหมาะกับงาน deterministic หรือ archival"

2. **Capture Final Composite**
   - New preview-match browser capture path.
   - Copy: "บันทึกจาก preview runtime เพื่อให้ animation และ subtitle เหมือนที่เห็น"

Quality selector:

- `standard` default
- `high`

Optional compact copy:

- Standard: "เร็วกว่า เหมาะกับ social video"
- High: "คมกว่า เหมาะกับตัวอักษรเยอะหรือเก็บงาน final"

### 5.2 Status States

Capture jobs need distinct status copy:

- `queued_capture`: "รอเริ่ม Capture ตาม Preview"
- `preparing_capture`: "กำลังเตรียม preview runtime และไฟล์วิดีโอ"
- `capturing_preview`: "กำลังเล่น preview และบันทึกวิดีโอ"
- `mixing_audio`: "กำลังรวมเสียงและตรวจเวลา subtitle"
- `verifying_capture`: "กำลังตรวจคุณภาพและความตรงกับ preview"
- `completed`: existing completed state with capture metadata
- `failed_capture_runtime`: browser/runtime failed
- `failed_capture_parity`: captured output does not match required preview checks
- `failed_audio_mix`: audio assembly failed

The UI must not show raw worker/runtime ids as the main user message.

---

## 6. Architecture

### 6.1 Server Contract

Add a new render engine branch under the final composite contract:

```ts
type StoryboardFinalCompositeRenderEngine =
  | "hyperframes_worker"
  | "preview_match_browser_capture";

type StoryboardPreviewMatchCaptureQuality = "standard" | "high";
```

The capture request includes:

- product id
- run id
- storyboard review id when available
- final composite config hash
- preview composition hash
- timeline hash
- quality
- output width/height/fps
- source video manifest
- subtitle/audio event map
- requested by user id

### 6.1.2 API Surface

Add capture as a sibling API to the existing final composite render flow.

Suggested tRPC procedures:

```ts
marketplaceCapture.createPreviewMatchFinalCompositeCapture({
  productId: string;
  runId: string;
  storyboardReviewId?: string | null;
  quality: "standard" | "high";
  expectedPreviewCompositionHash: string;
  expectedTimelineHash: string;
  finalCompositeConfigHash: string;
})

marketplaceCapture.getPreviewMatchCaptureJob({
  captureJobId: string;
  productId: string;
  runId: string;
})

marketplaceCapture.cancelPreviewMatchCaptureJob({
  captureJobId: string;
  productId: string;
  runId: string;
})
```

Suggested internal route:

```text
GET /internal/storyboard-final-capture/:captureJobId
```

Suggested worker task payload:

```ts
type PreviewMatchCaptureWorkerInput = {
  captureJobId: string;
  tenantId: string;
  userId: number;
  productId: string;
  runId: string;
  storyboardReviewId: string | null;
  quality: "standard" | "high";
  payload: PreviewMatchCompositionPayload;
  assetManifest: {
    sourceVideos: Array<{
      shotId: string;
      storageRef: string;
      downloadUrl: string;
      mediaStartSec: number;
      durationSec: number;
      checksumSha256?: string | null;
    }>;
    audioRefs: Array<Record<string, unknown>>;
    fontRefs: Array<Record<string, unknown>>;
  };
  outputRequirements: {
    format: "mp4";
    width: 1080;
    height: 1920;
    fps: 30;
    publishToLibrary: boolean;
    requireServerVerification: true;
  };
};
```

API rules:

- create endpoint returns projection immediately after enqueue;
- get endpoint returns the same output/status shape style as HyperFrames final
  composite projection;
- cancel endpoint is idempotent and marks active attempts stale;
- all endpoints enforce tenant/user/product/run/storyboard identity.

### 6.1.3 Billing, Quota, And Rate Limits

Capture jobs must reserve credits before queueing and reconcile after server
verification.

Initial billing recommendation:

| Quality | Credit multiplier | Reason |
| --- | --- | --- |
| `standard` | 0.75x existing HyperFrames final composite estimate | Faster realtime capture with lower compute target. |
| `high` | 1.0x existing HyperFrames final composite estimate | Higher quality and possible lower-loss capture path. |

Rules:

- Minimum charge duration follows existing final composite policy.
- Credits are reserved on enqueue, captured only after verified publish, and
  released/refunded on cancellation before active capture.
- Runtime, parity, or verification failure should release or refund according to
  existing worker render failure policy.
- Per-user and per-tenant queue throttles must prevent repeated long captures
  from starving the worker.
- Duplicate-submit reuse should not reserve credits twice.
- Operator config may tune multipliers after production cost data is available.

### 6.1.1 Job Persistence And Projection

The capture path needs durable job state. MVP may use the existing worker job
control plane or a narrow capture job table, but the chosen implementation must
provide the same behavioral contract:

- idempotency key includes tenant id, user id, product id, run id, storyboard
  review id, final composite config hash, preview composition hash, timeline
  hash, quality preset, and a short duplicate-submit window;
- status persists across refresh;
- cancellation marks the current attempt stale and prevents stale uploads from
  completing the job;
- retries are bounded and distinguish transient browser/runtime failures from
  permanent validation/parity failures;
- outputRefs and artifactRefs project through the same Storyboard Review final
  composite status surface used by Media Library save/download flows;
- completed projection includes `renderEngine: "preview_match_browser_capture"`;
- failed projection exposes user-safe copy and support diagnostics without raw
  signed URLs, local paths, or composition HTML.

Recommended status mapping:

| Durable status | User-facing status | Notes |
| --- | --- | --- |
| `queued` | `queued_capture` | Waiting for capture worker. |
| `running:prepare` | `preparing_capture` | Assets, fonts, route token, workspace. |
| `running:capture` | `capturing_preview` | Browser playback and visual capture. |
| `running:audio` | `mixing_audio` | FFmpeg trim/mix/encode. |
| `running:verify` | `verifying_capture` | Probe and parity checks. |
| `completed` | `completed` | Verified, publishable output. |
| `failed:runtime` | `failed_capture_runtime` | Browser, Playwright, FFmpeg, timeout. |
| `failed:parity` | `failed_capture_parity` | Output does not match preview gates. |
| `failed:audio` | `failed_audio_mix` | Audio extraction/mix/probe failed. |
| `cancelled` | `cancelled` | User/operator cancelled current attempt. |

Retry policy:

- runtime startup, navigation, transient download, and FFmpeg process failures:
  retry up to 2 attempts;
- schema validation, missing source video, hash mismatch, public route access,
  parity failure, and unsafe output: do not auto-retry until user changes input
  or operator requeues with override.

Minimum persistence fields:

```ts
type PreviewMatchCaptureJobRecord = {
  id: string;
  tenantId: string;
  userId: number;
  productId: string;
  runId: string;
  storyboardReviewId: string | null;
  quality: "standard" | "high";
  status: string;
  statusReason?: string | null;
  progressPercent: number;
  attempt: number;
  idempotencyKey: string;
  previewCompositionHash: string;
  timelineHash: string;
  finalCompositeConfigHash: string;
  reservedCreditRef?: string | null;
  outputArtifactRef?: string | null;
  verificationReportRef?: string | null;
  createdAt: string;
  updatedAt: string;
};
```

MVP may map this record onto existing `worker_jobs` plus artifact/event tables,
or create a dedicated capture table if server-worker/Celery integration cannot
cleanly use `worker_jobs`. The external API and UI projection must not depend on
which persistence backing is chosen.

### 6.2 Capture Composition Surface

The capture surface must be a render-only route, not the visible Storyboard
Review UI. It should load only:

- staged source videos
- resolved overlay/subtitle/audio variables
- deterministic timeline state
- fonts
- CSS/animation runtime
- readiness and capture control hooks

It must not include:

- Storyboard Review controls
- player controls
- buttons
- debug panels
- signed URL text
- raw prompt text
- private metadata

Recommended route shape:

```text
/internal/storyboard-final-capture/:jobId
```

The route must require an internal signed token with job id, tenant id, user id,
composition hash, and short TTL.

### 6.2.1 Shared Preview Renderer Contract

Preview and capture must not be two independent renderers.

Introduce a shared resolved payload:

```ts
type PreviewMatchCompositionPayload = {
  schemaVersion: "storyboard_preview_match_v1";
  renderEngine: "preview_match_browser_capture";
  tenantId: string;
  productId: string;
  runId: string;
  storyboardReviewId: string | null;
  finalCompositeConfigHash: string;
  previewCompositionHash: string;
  timelineHash: string;
  output: {
    width: number;
    height: number;
    fps: number;
    durationSec: number;
  };
  shots: Array<{
    id: string;
    index: number;
    startSec: number;
    durationSec: number;
    mediaStartSec: number;
    sourceVideoRef: string;
    overlayLines: string[];
    subtitleCues: Array<{ startSec: number; endSec: number; text: string }>;
    overlayPreset: string;
    animationPreset: string;
    transition: string;
    textMotionPreset: string;
  }>;
  audioEvents: Array<Record<string, unknown>>;
  fontFamily: string;
  safeZonePercent: number;
};
```

Rules:

- Storyboard Review Live preview and capture route must consume the same
  `PreviewMatchCompositionPayload` or a byte-equivalent projection of it.
- `subtitleCues` must remain structured arrays through every queue/worker
  boundary; joined `subtitleText` is only display metadata.
- Preview hash must be computed from the payload fields that affect rendered
  pixels, subtitle timing, and source media timing.
- If user edits render-facing fields after preview hash generation, capture must
  be blocked or must regenerate the resolved payload before queueing.
- A fixture test must prove the preview payload sent to capture matches the Live
  preview payload for the same Storyboard Review state.

### 6.3 Capture Runtime

The runtime exposes:

```ts
window.__storyboardCaptureReady = true;
window.__storyboardCaptureState = {
  status: "ready" | "degraded" | "error";
  compositionHash: string;
  timelineHash: string;
  durationSec: number;
  fps: number;
};
```

The runtime must play the same timeline semantics as Live preview:

- video elements continue playing while overlays animate;
- subtitles appear only when `currentTime` is inside cue start/end;
- shot transitions use the same resolved preset ids;
- motion text classes are driven by the same timing model as preview;
- reduced-motion browser settings must not disable final capture animation.

### 6.3.1 Capture Mechanism And Quality Decision

MVP should start with Playwright browser video recording only if it passes text
sharpness and subtitle readability gates.

Mechanism candidates:

| Mechanism | Pros | Risks | MVP role |
| --- | --- | --- | --- |
| Playwright `record_video_dir` | Already proven in Presentation export; simple; realtime playback semantics | WebM intermediate compression can soften text; limited encoder controls | First implementation candidate |
| Chrome screencast/CDP frames piped to FFmpeg | Better control over frame quality and final encoder; can reduce double compression | More implementation complexity; frame pacing must be validated | Preferred high-quality upgrade if WebM artifacts are visible |
| Page screenshots at fps into FFmpeg | Deterministic frames and encoder control | Can become slow like frame render; may lose realtime video playback behavior | Fallback for static/short diagnostics only |
| Client MediaRecorder | Offloads server | Inconsistent codecs, tab throttling, upload trust, audio issues | Experimental only |

Quality gate:

- If Playwright WebM intermediate output causes visible Thai subtitle/text
  softness in `high`, implementation must switch `high` to Chrome
  screencast/CDP frames piped to FFmpeg or another lower-loss browser capture
  method before `high` is released.
- `standard` may use WebM intermediate if sampled-frame quality passes the
  social-output threshold.
- Capture mechanism and encoder settings must be stored in artifact metadata.

Initial visual parity threshold:

- SSIM >= 0.96 for sampled full frames after masking expected browser/video
  codec noise regions;
- pixel-diff ratio <= 3% for sampled frames after a small blur/noise tolerance;
- subtitle active/inactive state must match exactly at sampled cue timestamps;
- failures at text/subtitle regions are blocking even if full-frame SSIM passes.

These thresholds are initial rollout gates. They may be tuned after fixture
evidence, but any relaxation must be documented in the rollout evidence.

### 6.4 Encoding And Audio

Do not rely on browser-recorded audio as the only audio source.

The capture engine records visual output. FFmpeg assembles final audio using:

- preserved native source clip audio according to `mediaStartSec` and shot
  duration;
- approved voiceover/audio events;
- music bed and SFX assets from the existing final composite audio event map;
- loudness/clip protection policy from Feature 120.

Audio assembly contract:

- Native source audio is extracted per shot using `sourceVideoRef`,
  `mediaStartSec`, and `durationSec`.
- Shot audio segments are concatenated on the same timeline as visual capture.
- If a source video has no audio and preserve-native-audio is enabled, insert
  silence for that shot and record a warning.
- Voiceover, music bed, and SFX are mixed according to `audioEvents` after native
  shot audio is assembled.
- Audio events outside the final duration are rejected or clipped with an
  explicit warning according to existing Feature 120 policy.
- Final audio drift after muxing must be <= 250ms or <= 0.5%, whichever is
  larger.
- If preserve-native-audio is enabled and every source clip has missing audio,
  the job must either fail with `failed_audio_mix` or complete with a visible
  warning only when the user explicitly allowed silent output.

Quality presets:

| Preset | Visual capture | Encode target | Intended use |
| --- | --- | --- | --- |
| `standard` | 1080x1920, 30fps | CRF 23, fast/medium preset | normal social output |
| `high` | 1080x1920, 30fps | CRF 18, medium/slow preset | text-heavy or final delivery |

Future optional resolution presets may add 720x1280 draft and 2160x3840 high,
but MVP should keep resolution stable to reduce QA surface.

High-quality text requirements:

- Text and subtitle edges must remain readable at normal mobile playback size.
- `high` must not show obvious double-compression artifacts around Thai glyphs,
  black subtitle boxes, or high-contrast overlay cards.
- A sampled-frame quality report must include bitrate, capture mechanism,
  encoder preset, CRF or bitrate target, and at least one subtitle-edge visual
  comparison.

---

## 7. Data Flow

```text
Storyboard Review
  -> user clicks Capture Final Composite
  -> server validates final composite state and source MP4 assignments
  -> server persists a capture job with engine=preview_match_browser_capture
  -> server stages or signs source assets
  -> capture worker opens internal render-only preview route
  -> browser plays the preview timeline and records visual output
  -> FFmpeg trims/encodes and mixes audio
  -> output probe validates duration, fps, resolution, audio, container
  -> parity checks compare preview reference frames against captured frames
  -> artifacts upload to storage
  -> Media Library output is published only after verification passes
  -> Storyboard Review projection shows completed output
```

---

## 8. Testing And Acceptance Criteria

### 8.1 Contract Tests

- Capture input schema accepts only `standard` and `high`.
- Capture input rejects missing source videos.
- Capture input requires composition hash and timeline hash.
- Capture input preserves subtitle cue arrays, not only joined subtitle text.
- Capture projection labels are distinct from HyperFrames render statuses.
- Duplicate capture submissions within the guard window reuse or point to the
  same active job.
- Cancellation prevents stale attempt uploads from becoming completed output.
- Credit reservation is created once for duplicate-submit reused jobs.
- API rejects product/run/storyboard identity mismatch.

### 8.2 Runtime Tests

- Render-only route excludes toolbar/player/control UI.
- Capture route waits for source video and font readiness.
- Subtitle cue timing hides inactive cues by default.
- Multiple subtitle cues never render simultaneously unless their cue windows
  intentionally overlap.
- CSS animation and text motion are active in capture mode.
- Reduced-motion browser settings do not disable capture animation.
- Live preview and capture route use the same
  `PreviewMatchCompositionPayload` for the fixture state.

### 8.3 Integration Tests

Fixture video must include:

- Thai subtitles with at least 8 cue windows.
- per-shot overlay preset changes.
- at least one text motion preset.
- at least one transition.
- preserved native source audio.

Acceptance:

- Standard capture completes faster than HyperFrames worker render for the same
  fixture on the same host.
- A 4-minute capture completes within 1.5x source duration plus encode overhead
  on the production capture worker profile.
- Captured output duration drift is <= 250ms or <= 0.5%, whichever is larger.
- Captured resolution is exactly 1080x1920 for MVP.
- Captured fps is within expected ffprobe tolerance.
- Audio stream exists when preserve-native-audio or audio events are enabled.
- Subtitle visual timing matches cue windows in sampled frames.
- Preview reference frames and captured frames pass visual threshold for key
  timestamps such as 0s, first subtitle cue, mid-shot, transition, and final
  frame.
- `high` quality passes Thai subtitle/text sharpness checks without visible
  double-compression artifacts.
- Visual parity report includes SSIM, pixel-diff ratio, sampled timestamps,
  subtitle cue state, and text-region pass/fail.

### 8.5 Evidence Artifacts

Every rollout fixture must produce:

- input `PreviewMatchCompositionPayload` JSON with private URLs redacted;
- capture job projection JSON;
- ffprobe output JSON;
- sampled preview reference frames;
- sampled captured frames at the same timestamps;
- visual parity report;
- audio drift report;
- final MP4 output ref;
- sanitized capture worker log.

Evidence should be stored under a feature-specific fixture/evidence path, for
example:

```text
specs/feature/125-storyboard-preview-match-browser-capture/implementation/evidence/
```

### 8.6 Sampling Plan

Every parity fixture must sample deterministic timestamps from the shared
timeline:

- `0.0s` first frame after readiness;
- first subtitle cue midpoint;
- first subtitle cue inactive gap immediately after cue end;
- first shot mid-point;
- first transition midpoint;
- one late-shot subtitle cue midpoint;
- final shot midpoint;
- final frame at `durationSec - 0.2s`.

If the source video has fewer cues or transitions, the fixture must record which
sample class was not applicable. Text/subtitle samples must include a cropped
text-region comparison in addition to full-frame comparison.

The parity report must store:

- sample timestamp;
- expected active shot id;
- expected active subtitle cue ids;
- preview frame hash;
- capture frame hash;
- full-frame SSIM;
- full-frame pixel-diff ratio;
- text-region pass/fail;
- notes for expected codec noise or source-video motion variance.

### 8.4 Manual QA Checklist

- Compare Live preview and Capture output side by side.
- Confirm no Storyboard Review UI controls appear in final MP4.
- Confirm Thai text is not clipped and remains inside safe area.
- Confirm subtitles do not all appear at once.
- Confirm source video motion continues while overlays animate.
- Confirm standard/high produce expected visual quality differences.

---

## 9. Security And Safety

- Internal capture route must be blocked from public access and require short
  lived signed tokens.
- Composition HTML must use staged/tenant-scoped media refs.
- Raw signed URLs must not appear in UI, logs, or normal output metadata.
- User text must be escaped before becoming HTML.
- Capture jobs must be scoped by tenant/user/product/run/storyboard identity.
- Uploaded output must not be trusted until server verification passes.
- Client capture must remain experimental until upload attestation and artifact
  verification are designed.
- Capture logs must redact local paths, signed URLs, and private metadata.
- Internal route tokens must be single-job scoped and expire quickly enough that
  a captured route URL cannot be reused after the job completes or fails.
- Capture workers must clean local workspaces after success, failure, timeout,
  or cancellation.
- Capture artifacts from failed attempts must be quarantined or deleted unless
  explicit operator support mode is enabled.

### 9.1 Redaction And Retention

Redaction rules:

- replace signed URLs with stable redacted tokens such as
  `redacted://source-video/<shotId>`;
- remove bearer tokens, cookies, route tokens, local filesystem paths, worker
  usernames, and raw storage keys from logs and evidence;
- redact raw composition HTML unless support mode explicitly allows it;
- keep product/run/storyboard ids because they are needed for support, but do not
  include private media URLs in normal user-visible metadata.

Retention rules:

- successful final MP4 and verification metadata follow Media Library retention;
- preview reference frames and captured sampled frames are support artifacts and
  should use shorter retention unless linked to a rollout fixture;
- failed attempt intermediates should be deleted after cleanup unless support
  quarantine is enabled;
- local worker temporary files must be removed after success, failure,
  cancellation, and timeout.

### 9.2 Permissions

User permissions:

- only users allowed to render/save final composite for the product/run may start
  capture;
- only the requesting user, tenant admins, or authorized operators may cancel or
  inspect detailed capture status;
- Media Library publish uses the same permissions as existing HyperFrames final
  composite save.

Operator permissions:

- detailed logs, parity reports, and support artifacts require operator/support
  scope;
- operator replay must create a new attempt and must not mutate prior evidence;
- support mode that retains raw composition HTML or intermediate files must be
  explicitly enabled, audited, and time-limited.

---

## 10. Data Ownership And Migration

### 10.1 Preferred Data Ownership

The product-facing state belongs to Storyboard Review final composite state. The
execution state belongs to the worker/capture job layer.

Use these boundaries:

- `reviewData.hyperframesFinalComposite` keeps user-facing final composite
  choices and latest render/capture refs.
- Capture job persistence keeps attempt status, progress, worker details,
  billing reservation, output refs, and verification refs.
- Media Library metadata keeps durable output provenance after verification.
- Evidence artifacts keep rollout/support diagnostics and must not become the
  normal product state source.

### 10.2 Persistence Choice

Preferred MVP:

1. Use existing `worker_jobs` / worker event / artifact tables when the capture
   worker can integrate with the same claim/progress/output contract.
2. Use a dedicated capture table only if the server-worker queue backend cannot
   cleanly map to `worker_jobs`.

If a dedicated table is required, it must include:

- tenant id, user id, product id, run id, storyboard review id;
- status, status reason, progress, attempt, idempotency key;
- quality, hashes, billing reservation ref;
- output artifact ref, verification report ref;
- created/updated timestamps;
- cancellation/stale attempt marker.

Migration rules:

- additive only;
- no backfill required for existing HyperFrames jobs;
- projection readers tolerate missing capture fields;
- rollback leaves table/metadata readable but disables new writes.

---

## 11. Operational Limits

MVP operational defaults:

- queue: `storyboard_capture`;
- concurrency: 1-2 captures per worker host until memory and browser stability
  metrics justify more;
- soft timeout: max of 12 minutes or 2x requested duration plus 5 minutes;
- hard timeout: soft timeout plus 2 minutes;
- max duration: reuse Feature 120 final composite max duration;
- cleanup: always remove temporary browser profiles, WebM/raw frame files,
  intermediate audio files, and unsigned local manifests;
- observability: progress events for prepare, capture, audio, verify, upload,
  completed, failed, cancelled;
- metrics: queue wait, capture wall time, encode time, verification time, output
  bytes, bitrate, duration drift, parity pass/fail, runtime failure code.

The web UI should show queue wait and active capture states separately so users
understand whether the job is waiting for a worker or actively recording.

---

## 12. Feature Flags, Rollback, And Compatibility

### 12.1 Feature Flags

MVP must be guarded by fail-closed flags:

```text
STORYBOARD_PREVIEW_MATCH_CAPTURE_ENABLED
STORYBOARD_PREVIEW_MATCH_CAPTURE_WORKER_ENABLED
STORYBOARD_PREVIEW_MATCH_CAPTURE_HIGH_QUALITY_ENABLED
STORYBOARD_CLIENT_CAPTURE_EXPERIMENT_ENABLED
```

Tenant/operator capability projection should expose:

```ts
{
  previewMatchCaptureAvailable: boolean;
  previewMatchCaptureHighQualityAvailable: boolean;
  previewMatchCaptureWorkerReady: boolean;
  clientCaptureExperimentAvailable: boolean;
  blockedReason?: string;
}
```

Rules:

- If capture is disabled, hide or disable **Capture Final Composite** with
  user-safe copy.
- If the worker is unavailable, show queue/waiting/runtime guidance rather than
  falling back to HyperFrames silently.
- If high quality is disabled or has not passed text-sharpness gates, expose
  `standard` only.
- Client capture remains hidden unless the explicit experiment flag is enabled.

### 12.2 Rollback

Rollback must be safe and reversible:

- disable `STORYBOARD_PREVIEW_MATCH_CAPTURE_ENABLED`;
- keep existing HyperFrames **Render Final Composite** available;
- preserve existing completed capture artifacts in Media Library and history;
- block new capture jobs while allowing active jobs to finish or be cancelled
  according to operator policy;
- keep projection readers tolerant of old capture metadata after rollback;
- do not delete capture output artifacts automatically unless retention policy
  says they are failed/stale temporary files.

### 12.3 Backward Compatibility

- Existing `reviewData.hyperframesFinalComposite` state remains valid.
- Existing HyperFrames render job ids and output refs remain readable.
- Capture metadata is additive and must not make old Storyboard Review projects
  fail to load.
- If a project lacks the new preview-match payload, the UI may generate it from
  existing final composite config or block capture with actionable copy.

---

## 13. Implementation Touchpoints

Expected implementation areas:

- `apps/web/client/src/pages/StoryboardReviewPage.tsx`
  - add CTA, quality selector, stale-payload state, status copy, polling.
- `apps/web/shared/hyperframes/runtimeApiSchemas.ts` or a new shared module
  - add preview-match capture input/projection schemas.
- `apps/web/server/services/hyperframesRuntimeApiService.ts`
  - validate final composite state and enqueue capture.
- `apps/web/server/services/hyperframesCompositionService.ts`
  - expose or share the preview-match resolved payload/render-only composition.
- `apps/web/server/services/workerSchedulerService.ts`
  - enqueue durable capture jobs if using worker job control plane.
- `apps/web/server/routes/*`
  - add internal render-only capture route.
- `python-backend/app/tasks/presentation_render.py` or new capture worker module
  - implement dedicated browser capture task.
- `apps/web/server/services/hyperframesRenderService.ts`
  - project capture job/output status alongside HyperFrames render output.
- `apps/web/server/services/hyperframesLibraryFinalizeService.ts`
  - include capture metadata and verification report.
- `apps/worker-app/*`
  - future support only; do not block server MVP.

Suggested new shared modules:

- `apps/web/shared/storyboardPreviewMatchCapture.ts`
  - engine ids, quality enum, payload schema, projection schema.
- `apps/web/server/services/storyboardPreviewMatchCaptureService.ts`
  - validate, enqueue, project, cancel, billing integration.
- `apps/web/server/services/storyboardPreviewMatchPayloadService.ts`
  - build payload from Storyboard Review final composite state.
- `python-backend/app/tasks/storyboard_capture.py`
  - if implemented as a dedicated Python worker module.

Implementation must avoid creating a second independent preview renderer. Shared
payload generation should be isolated in a testable helper before UI or worker
code calls it.

---

## 14. Failure Modes

Capture jobs must produce actionable failure reasons:

| Failure | Handling |
| --- | --- |
| Missing source MP4 | Block before queueing. |
| Stale preview hash | Regenerate payload or block queueing. |
| Internal route token expired | Retry if still within job attempt budget. |
| Browser cannot load media | Retry transiently; fail permanently on asset 404/403. |
| Font loading timeout | Retry once; then fail or degrade only if allowed by operator policy. |
| Browser capture timeout | Retry transiently; expose runtime failure if repeated. |
| WebM/text artifacts in high | Block high-quality release or switch high to lower-loss capture. |
| Audio missing unexpectedly | Fail or warn according to silent-output policy. |
| Parity gate fails | Do not publish; expose support-safe diagnostics. |
| Upload succeeds after cancellation | Reject stale attempt and quarantine/delete artifact. |

---

## 15. Rollout Plan

### Phase 1: Spec And Fixture

- Add this spec.
- Add a fixture definition for one known problematic Storyboard Review final
  composite with Thai subtitle cues and overlay animations.

### Phase 2: Server Capture MVP

- Add capture engine enum and request schema.
- Add feature flags and capability projection.
- Add shared preview-match payload helper and tests.
- Add durable job persistence/projection.
- Add API procedures for create/get/cancel.
- Add credit reservation and duplicate-submit reconciliation.
- Add internal render-only capture route.
- Add capture worker/service reusing Presentation dynamic capture patterns.
- Add UI button next to existing Render Final Composite.
- Add standard/high selector.
- Add focused tests and ffprobe verification.

### Phase 3: Parity Gate

- Add reference-frame capture from preview runtime.
- Add sampled-frame visual comparison against final MP4.
- Add deterministic sampling plan and text-region comparisons.
- Block completed status on severe parity failures.
- Show operator diagnostics without exposing private URLs.

### Phase 4: Worker App Migration

- Add `preview_match_browser_capture` as a worker job capability.
- Let Smart AI Hub Worker App run the same capture engine.
- Keep server verification and Library publish unchanged.

### Phase 5: Client Experimental Capture

- Add local-only draft capture behind explicit flag.
- Upload to server for verification before Library publish.
- Promote only after codec, CORS, lifecycle, long-duration, and quality tests
  are stable.

---

## 16. Open Questions

Resolved decisions:

- MVP does not run in the Express request path.
- MVP uses a dedicated server worker first.
- Client capture is experimental and cannot publish final Library output without
  server verification.

Remaining open questions:

1. Should the dedicated server worker extend the Python Presentation export
   worker or be a new `storyboard_capture` worker module?
2. Should high quality keep 1080x1920 CRF 18, or offer 2160x3840 after MVP?
3. Should preview reference frames be captured at submit time, at worker start,
   or both?
4. Should HyperFrames render remain the default button, or should Capture Final
   Composite become the recommended primary action after parity tests pass?
5. After production evidence, should the initial 0.75x/1.0x credit multipliers
   be adjusted?
6. After fixture evidence, should the initial SSIM/pixel-diff thresholds be
   adjusted for browser capture variance?

---

## 17. Success Metrics

- Median capture wall time for a 4-minute vertical video is less than 1.5x
  source duration plus encoding overhead on the production host.
- Capture output matches Live preview for sampled overlay/subtitle states.
- Subtitle-all-at-once defects are eliminated for capture jobs.
- User retry rate after final composite output decreases.
- Worker/server render failures include actionable diagnostics.
- No public route exposes internal capture HTML or signed media URLs.
- No capture support artifact exposes signed URLs, route tokens, cookies, bearer
  tokens, or local filesystem paths outside support-only storage.
