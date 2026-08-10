# Vertical Drama temporal scene props

## Problem

Scene continuity state stores active props with an optional `fromShot`, but the
rendered continuity block previously emitted every prop for every shot. A prop
introduced in a later shot could therefore enter earlier image and video
prompts, even though the physical cast lock remained correct.

## Design

- A prop with `fromShot: N` is eligible only for shot `N` and later shots in the
  same scene.
- A prop without `fromShot` remains scene-global for backward compatibility.
- Newly authored scene locks filter at the typed-state renderer.
- Previously persisted rendered lock text is filtered again at prompt-consumer
  boundaries, so regeneration is safe without a database rewrite.
- The rule applies consistently to start-frame batch prompts, single-shot
  regeneration, and both video-prompt builders.

## Safety and migration

No schema or database migration is required. Existing generated images are not
silently modified; regenerating a prompt or image uses the corrected temporal
filter. Existing approved props remain available from their declared shot
onward, and unrelated global props are unchanged.

## Verification

Focused tests cover global, current, and future props; persisted lock text;
scene-lock resolution; start-frame prompt paths; and both video prompt paths.
