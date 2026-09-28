# Feature 179 implementation state

Updated: 2026-09-06

All eight deep-implement sections are implemented in the current working tree.

| Section | State | Evidence |
|---|---|---|
| 01 Contracts and edit map | complete | shared Zod contracts, time-map/compiler tests |
| 02 Adapter policy and preflight | complete | explicit primary/enabled/fallback policy in Web/Rust; fail-closed runner probe |
| 03 Subtitle, VAD, diarization | complete | subtitle/VAD/diarization join helpers and provenance fields |
| 04 Visual tracks and active speaker | complete | face/person/body tracks, ambiguity conflicts, stable camera actions |
| 05 Durable scan/edit-plan jobs | complete | Web queue, Worker claim capability, local/remote artifact input, idempotency |
| 06 FFmpeg/Remotion render map | complete | canonical output time map and renderer parity tests |
| 07 Worker/Web UI | complete | Worker recipe/stage/adapter panel, validation/status, Web Series-scoped job/artifact status |
| 08 Verification/runbook | complete | 10 audit records, focused validation, runtime limitations documented |

The existing subtitle-first, dead-air/manual-edit, crop/aspect, Bin, and Library flows remain additive; Feature 179 does not silently replace them.

## Runtime boundary

The Worker does not generate synthetic speaker evidence. A real operator-configured executable must be supplied through `SMARTAIHUB_SPEAKER_AWARE_RUNNER`. It receives `--request`, `--input`, and `--output`, must emit JSON with `contractVersion: feature-179-v1` and the exact `sourceChecksum`, and is then uploaded as a durable Worker artifact. Missing or failing runner configuration blocks preflight/claim truthfully.

## Validation limitation

The repository-wide Web `npm run check` was intentionally not run because the user previously reported insufficient RAM. Focused Web tests, Worker TypeScript typecheck, Rust check/test, server import smoke, stage-invariant smoke, and `git diff --check` were used instead. Browser/RTX/real-model proof remains environment-dependent and is explicitly marked skipped below.
