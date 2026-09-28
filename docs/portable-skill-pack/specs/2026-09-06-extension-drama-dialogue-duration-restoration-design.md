# Extension Drama Dialogue Duration Restoration

## Problem

The Chrome Extension Drama Series shot card still renders structured dialogue,
per-line seconds, and a per-shot total. The read-only episode API, however,
projects dialogue only from `dialogueAudioPlan` or `motionPromptPack` clips.
Enhanced-first shots may have neither even though the active deep draft contains
the creator-approved dialogue, causing the existing UI block to disappear.

## Design

- Resolve the active normal-episode breakdown and matching deep-draft shot in
  the extension read service. Special tie-in episodes remain isolated.
- Treat a populated deep-draft `dialogue_lines` array as canonical. Reuse an
  audio-plan duration only when its text exactly matches the canonical line;
  otherwise use the existing deterministic speech-duration estimator.
- Honor canonical `silence_intent` and never revive stale clip dialogue.
- Preserve the current Extension shot-card layout: each line shows speaker,
  text, and seconds, while the header shows the sum for the shot.
- Keep the path read-only. Do not persist derived durations or invoke AI/media
  generation.

## Verification

- Unit coverage for canonical fallback, matching planned duration, and explicit
  silence.
- Read-only replay against episode 258 shot 1 verifies two dialogue lines and a
  positive per-shot total.
- Extension typecheck/build verifies that the existing renderer still consumes
  the response contract.
