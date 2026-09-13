# Section 05 — Headless Worker executor and artifacts

## Scope and dependencies

Consume only validated Section 01 envelopes admitted by Section 04. Reuse existing FFmpeg/Remotion sidecars and artifact protocol while keeping Tauri UI commands out of the execution contract.

## Tests first

- Add Rust tests for serde fixture parsing, operation/argv allowlist, resource/path sandbox, provider selection, lease renewal, cancellation and stale-attempt rejection.
- Add Web/service tests for output probe/QC, checksum/manifest mismatch, resumable upload, duplicate publication, diagnostic redaction and replay authorization.
- Add a separate real FFmpeg/Remotion smoke test when binaries/runtime are available; record a skip with reason otherwise.

## Implementation

Create `apps/worker-app/src-tauri/src/media_execution/` provider modules and wire the validated boundary from `worker_executor.rs`/`worker_loop.rs`. Construct argv from typed options only; compile overlays into vetted versioned artifacts and block when sandbox proof is unavailable. Download managed assets into an isolated working directory, renew heartbeat during every stage/upload, terminate the process tree on cancellation, and classify failures.

Build a completion manifest with job/attempt/lease, role, artifact ID, checksum, size, MIME, codec, dimensions/duration, raw measurements, provenance, verifier version and warnings. Upload through existing `/api/worker-jobs/:jobId/artifacts/*`; server verifies actual object metadata before publication. Reuse `workerArtifactService.ts` and monitor reconciliation. Redacted diagnostic bundles omit credentials, signed URLs and local paths. Replay creates a linked job with exact/equivalent labeling and bounded billing.

## Acceptance and evidence

Record Rust Cargo, provider, manifest and publication tests separately from real sidecar evidence. This closes AC-06, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13 and AC-15.

## Safety and rollback

No arbitrary shell/Python/filtergraph/remote code. If provider, disk, capability or sandbox checks fail, return a classified terminal failure and do not publish.

## Implementation status

Implemented server-side manifest verification/publication-key helper in `apps/web/server/services/editorArtifactVerification.ts` with focused tests, including role declaration and job/attempt/lease context checks. The Worker runtime now advertises and claims `editor_video_render`, refreshes claim-time signed URLs, stages managed assets in an isolated workspace, renders the canonical NLE through the allowlisted FFmpeg toolchain, probes/QCs the output, uploads `render.mp4`, and emits progress/completion or classified failure events. Advanced effect/transition parity, probe/proxy/analysis adapters, Rust Cargo proof and real sidecar proof remain gated.

## UI/UX Contract
### Target User / JTBD
Operator needs actionable, redacted diagnostics when a Worker job fails.
### Surface Inventory
Job stages, logs, output verification, retry/replay, and diagnostic download.
### Component Map
Rust emits structured events; server verifies; queue detail renders redacted data.
### State Matrix
Preparing, executing, uploading, verifying, completed, failed, canceled, expired.
### Responsive Matrix
Desktop exposes logs; tablet/mobile expose summary and downloadable diagnostics.
### Accessibility Acceptance
Progress/status announcements and keyboard navigation for diagnostics/actions.
### Copy Contract
User-safe Thai failure category plus trace ID; never expose secrets or paths.
### Browser Evidence Required
Browser detail assertions plus Rust fixture/manifest evidence; real sidecar separately recorded.
