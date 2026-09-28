# Section 02 — Preparation, B-roll render, runtime and recovery

## Ownership

Own trim/concat, 9:16 preparation, proxy/poster/waveform, source-time mapping, final B-roll composition, QC, upload/publication, resource policy and durable recovery.

## Required behavior

- execute only approved segment plans
- keep original media immutable and publish derived revisions only after QC
- validate prepared-time B-roll placement and source in/out
- mute AI B-roll by default and preserve base audio policy
- route `footage_broll_render` explicitly through the existing `remotion_render_video`/`GenericTemplate` video-layer executor; fail closed if its capability is unavailable
- checkpoint, heartbeat, cancel, ordered event delivery and reconcile after restart
- limit Whisper/FFmpeg concurrency and clean temporary files

## TDD and acceptance

Tests must prove middle-dead-air concat, exact placement, no overflow, failed-QC isolation, retry safety, checksum publication and Worker restart recovery. A release fixture must render a protected playable artifact from prepared footage plus AI B-roll.
