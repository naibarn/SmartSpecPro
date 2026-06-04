# Completeness Review Round 13

Date: 2026-05-31
Scope: per-frame/per-keyframe gateway-routed vision QA and exact-unit targeted repair for failed start frames, stop frames, storyboard cells, thumbnails, video clips, and audio-driven character drift.

## Result

The plan already required generated visual QA, product fidelity QA, character continuity QA, and smallest-unit repair. Round 13 makes the behavior explicit enough for implementation: each generated visual unit that can feed downstream video or publishing must pass a persisted vision QA envelope, and failures must repair only the exact affected unit.

## Findings Fixed

1. Frame-level vision QA needed a first-class contract.
   - Added `ShotFrameVisionQaEnvelope`.
   - It covers storyboard grid cells, storyboard frames, start frames, stop frames, video keyframes, thumbnails/covers, and final render samples.
   - It records product identity, selected variant, character identity, visual quality, prompt/story alignment, text artifact safety, continuity endpoint checks, gateway usage refs, and findings.

2. Targeted repair needed an exact media-unit contract.
   - Added `TargetedMediaUnitRepairPlan`.
   - It targets exactly one storyboard cell, start frame, stop frame, keyframe, video clip, audio segment, subtitle segment, or thumbnail.
   - It records preserve refs, invalidate refs, downstream recheck stages, attempt counts, credit estimate refs, and idempotency key.

3. Gateway-routed vision QA needed to be explicit.
   - Vision QA calls must run through the SmartSpecPro LLM gateway.
   - They consume `llm_visual_qa` credits and are tied to run/stage/shot/frame refs.

4. Native-audio or voice-driven character drift needed exact handling.
   - If native video audio or voice-driven generation changes face, mouth movement, or speaking identity, the repair is scoped to the affected shot/clip.
   - The system may switch that shot to product-only, hands-only, or separate-TTS strategy instead of regenerating unrelated media.

## Verdict

The requested behavior is now explicitly supported in the plan. A failed start frame, stop frame, storyboard cell, thumbnail, keyframe, or audio-driven character drift must trigger targeted repair for only the affected unit, preserve accepted artifacts, re-run vision QA, and block downstream stages until the repaired unit passes.
