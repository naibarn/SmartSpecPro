# Feature 126: Storyboard WebGPU Client Capture Acceleration

Version: 0.1.0
Date: 2026-06-28
Status: Proposed
Depends-on:
- Feature 125 Storyboard Preview-Match Browser Capture
- Existing Storyboard Review Live preview and preview-match composition payload
- Existing preview-match server capture job, verification, storage, billing, audit, and Media Library publish flow
- Browser support for WebGPU, WebCodecs, Canvas, MediaRecorder, and source media CORS policy
Audience: Storyboard Review, Preview-Match Capture, Media Library, Product, QA, Security, DevOps

---

## 1. Executive Summary

Add an optional experimental client-side acceleration path for Storyboard
Preview-Match Capture. When a user's Chrome browser supports WebGPU and the user
explicitly enables it, the Storyboard Review page may use client GPU resources to
accelerate preview/capture preparation or local draft capture work. The system
must fall back to the server preview-match capture path whenever capability,
quality, security, browser lifecycle, codec, upload, or verification conditions
are not satisfied.

This feature does not replace Feature 125. Feature 125 remains the trusted final
output path because it runs server-managed browser capture, FFmpeg processing,
verification, storage upload, billing reconciliation, and Media Library publish.
Feature 126 adds a progressive enhancement layer that can reduce server load or
improve interactive responsiveness on supported Chrome clients, but final
Library publishing remains gated by server verification.

Recommended product label:

- User option: **Use WebGPU acceleration**
- Thai copy: **ใช้ WebGPU ช่วยเร่งการ capture**
- Helper copy: **ทดลองใช้ GPU ของเบราว์เซอร์เมื่อรองรับ หากไม่พร้อมระบบจะกลับไปใช้ server capture**
- Internal mode id: `client_webgpu_acceleration`
- Default: disabled

---

## 2. Problem Statement

Feature 125 improves visual parity by recording the same browser composition
runtime shown in Live preview. However, server-side browser capture is still
resource intensive. Long videos, high quality, text-heavy overlays, and multiple
tenants can create queue wait, CPU encode pressure, and operational cost.

Modern Chrome clients may expose WebGPU and WebCodecs. These APIs can accelerate
some graphics and media steps on the user's device, but they are not uniformly
available and do not automatically solve MP4 finalization, audio mixing, upload,
or trusted verification.

The product needs a safe way to experiment with client GPU acceleration without
breaking preview parity or the trusted server publish workflow.

---

## 3. Goals

1. Add an explicit user-facing option to enable WebGPU acceleration when the
   browser supports it.
2. Detect client capabilities at runtime without blocking normal server capture.
3. Keep server preview-match capture as the default and reliable fallback.
4. Preserve Feature 125 quality, timing, subtitle, font, color, animation, and
   audio parity requirements.
5. Never publish client-generated output to Media Library without server-side
   verification.
6. Record capability, selected mode, fallback reason, and quality metrics in job
   metadata.
7. Allow future phased implementation from capability detection to partial GPU
   preprocessing to full experimental client draft capture.

---

## 4. Non Goals

This feature must not:

- replace server preview-match capture as the default final render path;
- claim WebGPU guarantees faster MP4 output on every client;
- depend on WebGPU for standard capture availability;
- bypass server auth, tenant isolation, credit, audit, storage, or Media Library
  publish rules;
- publish a client-generated MP4 without server verification;
- create a second independent visual renderer that can drift from Live preview
  without parity tests;
- require Safari, Firefox, or mobile browser support for the first release;
- move native audio mixing, SFX finalization, or MP4 normalization entirely to
  the browser in the first release.

---

## 5. Recommended Solution

Implement WebGPU as a progressive, opt-in acceleration mode layered on top of
the existing Feature 125 preview-match capture contract.

The first release should expose capability detection and a disabled-by-default
toggle. When enabled, the client records the requested acceleration intent and
performs only safe local work that cannot corrupt the trusted final output. If a
future client draft capture is produced, it is uploaded as an untrusted candidate
artifact and must be verified by the server before it can become a Library item.

### 5.1 Phased Capability Model

Use three internal capability tiers:

```ts
type StoryboardClientCaptureAccelerationTier =
  | "none"
  | "webgpu_available"
  | "webgpu_webcodecs_available"
  | "client_draft_capture_available";
```

Tier meaning:

- `none`: no WebGPU support or disabled by feature flag.
- `webgpu_available`: `navigator.gpu` is available; client can run small
  capability probes and GPU-backed canvas experiments.
- `webgpu_webcodecs_available`: WebGPU plus `VideoEncoder`, `VideoFrame`, and
  required codec support are available.
- `client_draft_capture_available`: browser, codec, CORS, lifecycle, and upload
  checks pass; client can attempt draft output for server verification.

### 5.2 User Choice

The Storyboard Review capture settings should show WebGPU only when tenant and
browser capability checks pass:

- unchecked by default;
- disabled with reason when unsupported;
- clearly labeled as experimental;
- separate from `standard` / `high` quality;
- never silently changes the trusted server capture path.

Suggested UI states:

| State | Behavior |
| --- | --- |
| Not supported | show disabled option or hide behind details with reason |
| Supported but off | normal capture uses server Feature 125 path |
| Supported and on | create request includes `clientAccelerationPreference: "webgpu"` |
| Runtime failure | show fallback reason and continue server capture if possible |
| Candidate uploaded | show "awaiting server verification" before Library publish |

---

## 6. Architecture

### 6.1 Client Capability Probe

Add a small client module that detects and reports:

- `navigator.gpu` availability;
- secure context requirement;
- browser family/version when available;
- WebCodecs availability;
- supported encode codecs, if detectable;
- canvas/video frame capability;
- whether required source video assets can be loaded with CORS-safe access;
- whether the tab is visible and capture lifecycle is stable.

The probe must be local-only by default. It sends only coarse capability flags to
the server, not GPU model, device identifiers, or fingerprint-heavy details.

### 6.2 Shared Contract Additions

Extend the Feature 125 create request and job projection with optional fields:

```ts
type StoryboardClientCaptureAccelerationPreference =
  | "none"
  | "webgpu";

type StoryboardClientCaptureAccelerationReport = {
  preference: StoryboardClientCaptureAccelerationPreference;
  tier: StoryboardClientCaptureAccelerationTier;
  browser: "chrome" | "edge" | "other" | "unknown";
  supported: boolean;
  fallbackReason?: string | null;
  webgpuAvailable: boolean;
  webcodecsAvailable: boolean;
  mediaRecorderAvailable: boolean;
  secureContext: boolean;
};
```

These fields are advisory. The server remains authoritative for output status,
verification, and publish.

### 6.3 Capture Flow

Initial implementation:

1. User opens Storyboard Review.
2. Client runs capability probe.
3. UI shows WebGPU option if tenant flag and browser capability allow it.
4. User enables the option.
5. Capture request includes acceleration preference and capability report.
6. Server creates the same Feature 125 capture job.
7. Server records the preference and may use it for diagnostics or future client
   draft upload routing.
8. If client draft capture is not enabled, server capture proceeds normally.

Future client draft implementation:

1. Client uses the same `PreviewMatchCompositionPayload` as Live preview.
2. Client attempts draft frame composition/capture using WebGPU/WebCodecs only
   when all capability gates pass.
3. Client uploads a candidate artifact to a verification endpoint.
4. Server validates identity, hashes, duration, resolution, fps, audio,
   subtitle timing, and visual parity.
5. Server either promotes the verified candidate to Library output or falls back
   to server capture.

### 6.4 Server Trust Boundary

Client acceleration is untrusted input. Server must verify:

- tenant/user/product/run/storyboard identity;
- idempotency key and active job ownership;
- payload hash and timeline hash;
- artifact duration, resolution, fps, codec, and audio stream;
- visual parity samples against the same preview-match reference;
- subtitle and overlay timing at sampled timestamps;
- storage scan/size/format limits;
- cancellation and stale attempt rules.

---

## 7. Feature Flags

Add fail-closed flags:

```text
STORYBOARD_CLIENT_WEBGPU_CAPTURE_ENABLED=false
STORYBOARD_CLIENT_WEBGPU_DRAFT_UPLOAD_ENABLED=false
STORYBOARD_CLIENT_WEBGPU_REQUIRE_SERVER_VERIFY=true
```

Tenant capability projection should expose:

```ts
{
  clientWebGpuCaptureAvailable: boolean;
  clientWebGpuDraftUploadAvailable: boolean;
  clientWebGpuRequireServerVerify: boolean;
  blockedReason?: string;
}
```

Rules:

- The option is hidden or disabled when the global flag is off.
- Draft upload remains disabled until server verification is complete.
- Server verification is required and must not be disabled in production.
- If Feature 125 server capture is unavailable, WebGPU must not become the only
  available final output path unless explicitly enabled for a test tenant.

---

## 8. Quality And Performance Expectations

WebGPU support should be measured, not assumed. The first implementation must
report:

- capability tier;
- selected preference;
- actual path used;
- fallback reason;
- client preparation time;
- server queue wait;
- server capture duration;
- encode duration;
- verification duration;
- final artifact size and bitrate;
- parity pass/fail.

Success criteria for promoting beyond experimental:

- no increase in failed final outputs compared with server capture;
- no increase in visual parity failures;
- WebGPU-enabled captures fall back cleanly when unsupported;
- draft client artifacts, when enabled, pass the same Feature 125 verification
  threshold before Library publish;
- user can understand whether the final MP4 came from server capture or a
  verified client candidate.

---

## 9. Security And Privacy

The capability report must avoid high-entropy GPU fingerprinting. Store coarse
booleans and browser category only unless a support-only diagnostic mode is
explicitly enabled.

Security requirements:

- never expose signed media URLs to untrusted third-party contexts;
- require same tenant/user/job ownership for draft uploads;
- reject artifact uploads that do not match expected hashes;
- enforce size, duration, codec, and content-type limits;
- quarantine failed or stale uploads;
- redact private URLs from evidence;
- keep audit events for opt-in, fallback, upload, verification, and promotion.

---

## 10. Failure Modes

| Failure | Handling |
| --- | --- |
| Browser has no `navigator.gpu` | Disable option; use server capture. |
| Browser is not secure context | Disable option; explain requirement. |
| WebCodecs unsupported | Allow probe-only tier; no draft capture. |
| Source video CORS prevents frame access | Fallback to server capture. |
| Tab hidden/throttled/suspended | Abort client draft; continue or retry server capture. |
| Client encoder fails | Fallback to server capture; record reason. |
| Upload interrupted | Keep server capture active if queued; allow retry. |
| Candidate fails verification | Do not publish; fallback to server capture. |
| Audio/subtitle drift detected | Reject candidate and preserve diagnostics. |
| User disables option mid-job | Existing server job continues; client draft attempt stops. |

---

## 11. Test Plan

Unit tests:

- capability probe maps browser APIs to expected tiers;
- disabled flags hide or disable WebGPU option;
- create request preserves optional acceleration preference;
- invalid acceleration preference is rejected;
- job projection includes preference, actual path, and fallback reason;
- fallback does not alter Feature 125 server capture behavior.

Integration tests:

- unsupported browser path creates normal server capture;
- supported Chrome path records preference but still uses server capture when
  draft upload flag is off;
- draft upload endpoint rejects wrong tenant/job/hash;
- draft upload endpoint rejects invalid format/duration/resolution;
- verified candidate cannot publish without parity pass.

Browser tests:

- Chrome supported-state UI;
- Chrome forced-unsupported fallback UI;
- option disabled when secure context is missing;
- no overlap with existing quality selector and capture CTA;
- capture status clearly distinguishes server capture, WebGPU preference, and
  fallback.

Manual QA fixtures:

- Thai overlay and subtitle text with upper vowels/tone marks;
- long source video with native audio;
- at least one transition and one text motion;
- high-quality capture request;
- inactive tab / tab hidden fallback;
- interrupted upload recovery.

---

## 12. Rollout Plan

### Phase 1: Spec And Capability Probe

- Add this spec.
- Add shared types for acceleration preference/report.
- Add client capability probe.
- Add hidden/disabled UI behind tenant/global flag.
- Store preference/report in job metadata only.

### Phase 2: Opt-In UI And Telemetry

- Show the WebGPU option to test tenants.
- Default the option off.
- Submit preference with capture create request.
- Record fallback reason and actual capture path.
- Verify no regression to Feature 125 capture.

### Phase 3: Partial Acceleration Experiments

- Evaluate GPU-backed canvas preprocessing or frame sampling.
- Keep final output server-generated.
- Compare performance against server-only capture.

### Phase 4: Client Draft Capture Candidate

- Add draft upload endpoint.
- Use WebCodecs/MediaRecorder only when browser capability is strong enough.
- Treat uploaded output as untrusted candidate.
- Promote only after server verification passes.

### Phase 5: Promotion Or Removal

- Promote to beta only if reliability and parity metrics are strong.
- Otherwise keep as diagnostics-only or remove the option without changing
  Feature 125 server capture.

---

## 13. Acceptance Criteria

- A new spec exists for WebGPU client capture acceleration and clearly depends
  on Feature 125.
- WebGPU is optional, experimental, disabled by default, and controlled by flags.
- Server preview-match capture remains the default and fallback.
- Capability detection does not collect high-entropy GPU identifiers.
- Client-generated artifacts, if later enabled, cannot publish without server
  verification.
- UI copy explains that WebGPU may help only when Chrome supports it.
- Tests cover unsupported browser fallback and supported-browser preference
  reporting.

---

## 14. Open Questions

1. Should the first implementation show the disabled WebGPU option to all users
   or only show it for test tenants?
2. Should draft upload use WebCodecs first, MediaRecorder first, or choose at
   runtime based on codec support?
3. What minimum Chrome version should qualify for `client_draft_capture_available`?
4. Should verified client candidates reserve fewer credits than server captures,
   or should billing remain identical until reliability is proven?
5. How should support expose acceleration diagnostics without increasing
   fingerprinting risk?
