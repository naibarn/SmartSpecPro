# Section 08 — Verification, Rollout, and Runbook

## Goal

Prove cross-section completeness, document runtime requirements, and make the feature safe to enable without claiming unavailable GPU/model/browser proof.

## Files owned

- `specs/feature/179-worker-speaker-aware-vad-diarization-reframe/implementation/ui-browser-evidence.md`.
- `specs/feature/179-worker-speaker-aware-vad-diarization-reframe/implementation/review-round-*.md`.
- relevant Worker release/readiness documentation only if needed; do not alter unrelated release artifacts.

## Implementation tasks

1. Run focused Web/shared/server tests and Worker tests; run Rust `cargo test` if Rust changed. Never run full `npm run check`.
2. Run `git diff --check`, inspect changed-file list, and verify no unrelated dirty hunk was overwritten.
3. Validate section cross-consistency: exact schema names, job kinds, hashes, artifact statuses, renderer input, and UI labels.
4. Run the existing Worker browser smoke harness if dependencies/server permit. Capture canonical viewport evidence for loading, empty, unavailable, conflict, success, stale, and approval states.
5. Perform static smoke with adapter binaries absent; verify truthful preflight/blocked outcomes. If local RTX/GPU/model runtime exists, run a bounded fixture only and preserve output artifacts.
6. Document install/config requirements for Silero/FireRed/TEN/WebRTC/pyannote/MediaPipe and explicit policy configuration. No adapter is enabled by assumption.
7. Perform at least 10 audit rounds, each with a separate checklist: contracts, workflow ordering, adapters, subtitle/ASR/VAD, visual tracks, durable jobs, stale/idempotency, UI/UX, renderer parity, security/runtime. Fix every actionable gap before the next round.

## TDD/verification matrix

| Area | Required proof |
|---|---|
| contracts | focused Vitest + schema negative cases |
| adapter policy | TypeScript/Rust capability matrix |
| evidence | subtitle/VAD/diarization fixtures |
| visual fusion | stable hold/no oscillation/body-only tests |
| jobs | idempotency/stale/cancel/callback tests |
| renders | canonical map parity/compiler tests |
| UI | Worker/Web tests + browser evidence or explicit skip |
| safety | auth/path/allowlist/approval tests |

## Exit evidence

Implementation summary names actual changed files/tests, reports every skipped runtime gate, and does not call static or mocked checks production proof.

## UI/UX Contract

### Target User / JTBD
N/A; this section records verification evidence for the user-facing surfaces defined in sections 04 and 07.

### Existing Pattern Reference
Reuse the existing Worker browser smoke harness and production UI evidence format.

### Surface Inventory
Worker Media Studio, Worker workflow panel, Web production status, and render approval surfaces from section 07.

### Component Map
N/A; verification only.

### State Matrix
Verify loading, empty, unavailable, partial, conflict, success, stale, disabled, focus, and approval states.

### Responsive Matrix
Verify 390x844, 768x1024, 1440x900, plus 360x800, 1024x768, and 1280x800 for dense layouts.

### Accessibility Acceptance
Record keyboard, focus, labels, semantics, contrast, and reduced-motion results; skipped automation is explicitly marked skipped.

### Copy Contract
Verify Thai-first copy and English fallback for status/error/remediation states.

### Browser Evidence Required
Write `implementation/ui-browser-evidence.md` with command, date, viewport result, screenshot/trace path, skipped reason, and residual risk.
