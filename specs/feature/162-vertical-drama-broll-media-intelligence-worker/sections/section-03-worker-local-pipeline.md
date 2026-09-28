# Section 03 — Native Worker local media pipeline

## Goal

Implement local root safety, media scanning/probing/planning/render/QC
orchestration, atomic checkpoints, and derived-only publication bridge in the
Tauri Worker. Never mutate or upload original source footage.

## Files

- Add focused Rust modules under `apps/worker-app/src-tauri/src/` for media
  root validation, local manifest/checkpoints, FFprobe/FFmpeg command planning,
  local job state, and publication bridge; register typed Tauri commands in the
  existing command module.
- Extend `apps/worker-app/src-tauri/src/control_plane.rs` for typed media job
  admission/progress/upload/finalize calls.
- Add Rust tests under `apps/worker-app/src-tauri/src/` or `tests/` following
  existing executor/settings tests.

## Required behavior

Canonicalize roots locally, reject symlinks/junctions/reparse escapes, hidden
system roots, unstable files, unsupported extensions, excessive depth/count/
size/disk, and source/derived recursive scanning. Generate bounded manifest and
settle fingerprints. Analyze silence/dead-air, black/frozen/blur/duplicate
frames, scenes, and subject candidates through deterministic command adapters.

Produce typed plans for trim/shot budget, subject-aware 9:16 reframe, still
push/pull/pan/parallax, and QC. The actual command runner must be allowlisted
and receive structured arguments, not arbitrary shell text. Output is staged
outside source, probed/QC'd, checksumed, and uploaded only after local pass.

Persist atomic checkpoints pinned to job/root/binding/policy/source/idempotency
and remote execution IDs. Resume only matching state; reconcile remote uploads;
quarantine partial output after crash, power loss, revoke, or mismatch. Use one
native coordinator per Worker identity and expose progress as safe projection.

## TDD requirements

Test path escape/source mutation, stable-file settling, bounded scan, plan
generation, shot-duration trimming, subject fallback policy, output QC,
checkpoint atomicity, recovery/quarantine, upload payload redaction, and
single-coordinator behavior. Use fixtures/temp directories; no real media or
GPU is required for unit tests.

## Acceptance

A local fixture can move through scan → plan → derived fixture → QC → typed
publication request with no source upload/path leak, and interruption tests
recover or quarantine deterministically.

## UI/UX Contract

### Target User / JTBD
N/A — native pipeline; expose safe progress and actionable recovery to UI.
### Surface Inventory
N/A — Tauri commands only.
### Component Map
N/A — native modules and typed bridge.
### State Matrix
Expose scanning, processing, QC, uploading, blocked, quarantined, recovered, and revoked states.
### Responsive Matrix
N/A — native operation has no responsive layout.
### Accessibility Acceptance
Progress/recovery text must be exposed as labeled status events to the shell.
### Copy Contract
Emit stable error codes and localized message keys; never emit raw paths remotely.
### Browser Evidence Required
N/A — Tauri/native evidence is required for this section.
