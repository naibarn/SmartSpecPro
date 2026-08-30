# Implementation plan — Feature 169 Worker

## Wave 1 — shared job/runtime contract

เพิ่ม shared job schemas/capabilities for `footage_probe_analyze`, `footage_prepare`, `footage_broll_render`; implement runtime manifest resolver and doctor evidence. Resolve platform Node + exact HyperFrames CLI path from manifest, pin checksums and reject missing/mismatched runtime before claim/charge

## Wave 2 — probe, analysis and transcript

เพิ่ม Worker executor dispatch and isolated workspace. Implement safe managed download/local-root resolution, checksum/Range resume, ffprobe normalization to `durationMs`, audio extraction, VAD/silence/black/freeze checks, bounded scene/keyframe artifacts and HyperFrames `transcribe --language/--model/--json`. Emit complete/partial/unavailable status and `vd-footage-guide-v1`; never send full video or mutate DNA

## Wave 3 — preparation

รับเฉพาะ approved segment plan, reject cuts overlapping speech ranges unless explicit override, trim/concat/crop/proxy/poster/waveform with FFmpeg, write bidirectional sourceTimeMap and derived artifact manifest, run decode/audio/duration/black/freeze/size QC, publish only after checksum/ownership reconciliation. Preview role cannot satisfy final render

## Wave 4 — B-roll composition

Implement `footage_broll_render` adapter into existing `remotion_render_video` GenericTemplate with one base video layer and timed AI B-roll layers. Map overlay/cutaway/replace, fit, base/broll audio policy, source in/out and storyBeatId. Reject stale revisions, overflow, missing assets and unavailable executor; no Server fallback

## Wave 5 — durability and proof

Persist checkpoint/outbox, emit authenticated ordered events with replay, handle lease/token refresh/cancel/retry/staged artifact reuse, enforce per-stage concurrency/backpressure/temp cleanup and privacy-safe logs. Add Rust tests, media fixtures, contract compatibility, render QC, doctor, restart and authenticated E2E evidence before rollout.
