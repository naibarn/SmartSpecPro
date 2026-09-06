# Enhanced Dialogue Speaker-Position Binding

## Problem

Enhanced video-prompt authoring can receive an empty dialogue list even when the
episode's active deep draft and storyboard contain canonical dialogue. When that
happens, the director truthfully treats the shot as silent. Separately, dialogue
must be bound to the observed Start Frame position of its speaker so a video model
cannot swap voices or mouth movement between visible characters.

## Design

1. Resolve the active episode breakdown before Enhanced dialogue resolution.
   When `verticalDramaSeriesDeepStoryDrafts` is enabled, pass the matching
   `deepDraftShot` to the existing canonical `resolveShotDialogueLines` chain.
2. Normalize both `sourceBeatIndexes` and `source_beat_indexes` from persisted
   storyboard shots and pass them when the speech-budget feature is enabled.
3. Resolve every canonical speaker label to one stable character key drawn only
   from the characters declared for the current shot. Reject missing or ambiguous
   speakers before invoking the Enhanced Agent.
4. After the vision stage observes the approved Start Frame, bind every dialogue
   line to the speaker's viewer-relative position. Reject a prompt when any
   speaker lacks an observed/verified position.
5. Render a `CHARACTER, POSITION, AND DIALOGUE LOCK` immediately after the
   observed Start Frame state. Each line contains stable speaker identity,
   viewer-relative position, exact dialogue, and silent-listener mouth rules.
   The timed motion section repeats these bindings for lip-sync execution.

## Failure behavior

- Empty canonical dialogue remains a genuinely silent shot.
- A non-empty dialogue list with an unresolved speaker or position fails closed;
  it is never downgraded to silence and the model is never allowed to guess.
- No database row is rewritten and no paid video generation is triggered by this
  implementation or its tests.

## Verification

- TypeScript tests cover snake/camel beat-index normalization and preservation of
  structured Thai dialogue.
- Python bridge tests cover adjacent character-position-dialogue rendering,
  correct left/right speakers, silent listeners, and fail-closed missing position.
- A deterministic local-data replay confirms episode 258 shot 1 resolves both
  canonical dialogue lines before any paid Enhanced job is invoked.
