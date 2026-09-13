# Implementation Plan

## Objective

Make user-selected frame characters the single visual-cast authority for Start
Frame, Legacy, and Enhanced prompt generation. Prevent a character that exists
only in synopsis/storyboard context from entering the image/video cast, while
preserving explicit caller identities and authored dialogue.

## Current-codebase fit

Reuse the existing frame fields and cast-position helpers. Add a small shared
resolver in the existing Vertical Drama shared layer rather than introducing a
new database table or a second cast model. Thread the resolved physical/caller
refs through current prompt builders and preserve existing readiness, tenant,
and credit boundaries.

## Work packages

### 1. Shared visual-cast resolver

- Add a pure helper that accepts frame-selected physical refs, look assignments,
  explicit caller refs, and storyboard refs.
- When frame refs are non-empty, return only those physical refs plus explicit
  caller refs in separate arrays. Storyboard-only refs are marked/ignored as
  narrative context and never promoted.
- Keep deterministic order from the frame/caller arrays and deduplicate refs.
- Expose enough metadata for prompt builders to state physical cast and caller
  presence separately without changing persisted episode JSON.
- Add unit tests for the shot 9 case, caller inclusion, empty/legacy fallback,
  and stable ordering.

### 2. Start Frame integration

- Ensure Start Frame prompt and reference resolution prefer the frame's selected
  refs and look assignments whenever user selections exist.
- Remove any fallback that reconstructs the image cast from storyboard
  `characterIds` when an explicit frame cast is available.
- Preserve existing scene/location/object prompt data and current image-anchor
  persistence.
- Add a negative instruction that narrative-only names are not rendered, without
  turning the extra name into a blocking validation error.

### 3. Legacy and Enhanced integration

- Build the visual cast once from the shared resolver before constructing either
  prompt variant.
- Enhanced `shot.characterIds`, canonical character context, and observed-state
  instructions must use physical refs plus explicitly separated caller refs, not
  the raw storyboard character list.
- Keep the current selected-look speaker mapping and viewer-relative position
  lock for physical speakers. Caller identity must remain caller/media presence.
- Update Legacy identity-map and scene-character inputs to the same resolved
  cast and preserve its existing dialogue behavior.
- Ensure narrative context still contains synopsis/action stakes, but explicitly
  tells the authoring path not to render narrative-only characters.
- Do not add a new block for extra storyboard characters; only existing
  genuinely ambiguous speaker protections remain.

### 4. Focused regression verification

- Add/update shared resolver tests.
- Add Start Frame prompt tests asserting the selected three-person cast excludes
  a mention-only fourth character.
- Add Enhanced input tests asserting `characterIds` and identity context exclude
  the mention-only character while caller refs remain explicit.
- Add Legacy prompt tests asserting the same resolved cast.
- Run the existing Python bridge tests because the Enhanced payload contract is
  consumed by the bridge, but do not invoke the bridge against a live provider.

## Risks and mitigations

- **Old storyboard lists contain extras:** ignore them when frame refs exist and
  keep the story prose as context only.
- **Caller becomes a physical duplicate:** carry callers in a separate field and
  label them as media presence.
- **Wrong speaker assignment:** retain exact selected-look mapping and existing
  ambiguity guards; never resolve by synopsis order.
- **No frame selection in an older record:** preserve the existing fallback path
  only where no explicit user-selected frame cast exists, and add an explicit
  narrative-only exclusion instruction.
- **Dirty worktree overlap:** edit only the shared resolver, targeted prompt
  builders, and owned tests; do not reformat large router files.

## Acceptance criteria

- Shot 9-style input produces a three-person visual cast and excludes มยุรี from
  image/video character identity context.
- A caller is retained only when present in `screenCallerCharacterRefs` and is
  not counted as a physical body.
- Start Frame, Legacy, and Enhanced receive the same physical cast.
- Extra narrative/storyboard character refs do not block prompt generation.
- Existing selected speaker positions and exact dialogue remain unchanged.
- No provider request, credit deduction, data mutation, or media regeneration is
  performed by tests.

## Rollout

Local focused tests only. Existing approved media remains unchanged. A later,
separately approved UI action may retry shot 9 after the code is deployed; that
paid retry is not part of this implementation wave.
