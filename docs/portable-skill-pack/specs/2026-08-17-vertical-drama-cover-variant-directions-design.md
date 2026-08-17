# Vertical Drama Cover Variant Directions

## Goal

Make the four episode-cover slots visibly different while remaining generic
enough to work for any series, episode, cast, location, genre, or story beat.
The existing reference-count strategy remains in place: slots 1, 2, and 3 use
one, two, and three scene references; slot 4 keeps the deterministic random
reference-count behavior.

## Design

Add a shared, slot-based prompt directive that is appended to the existing
narrative prompt:

- Slot 1: a character/emotion-led composition focused on the episode's primary
  relationship or dramatic moment.
- Slot 2: a wider environmental composition that establishes the setting and
  supporting context.
- Slot 3: an interaction/action-led composition showing the episode's central
  event or conflict.
- Slot 4: an alternate cinematic composition with a different camera angle,
  framing, or visual rhythm from the other slots.

The directives must not name specific characters, locations, actions, colors,
or genres. The model should infer those from the episode title, synopsis, plot
beats, and attached references. Each directive must explicitly ask for a
meaningfully different composition, while preserving character identity,
continuity, readable logos, and the vertical 9:16 cover format.

## Data flow

`generateEpisodeCover` passes the selected `coverSlotId` into
`buildEpisodeCoverGenerationSnapshot`, which passes it into
`buildEpisodeCoverPrompt`. The slot directive is persisted in the existing
state prompt for traceability; no database migration or new schema field is
needed.

## Failure handling

If a caller omits the slot, preserve slot 1 behavior. Existing legacy prompts
and existing stored covers are not rewritten. Users regenerate only the slot
they choose, so no automatic credit-spending retry is introduced.

## Verification

- Unit tests assert all four directives are generic, slot-specific, and present
  in generated snapshots.
- Existing reference-count and logo-reference tests remain unchanged.
- Run the focused shared/service tests, TypeScript/build checks appropriate to
  touched files, and `git diff --check`.

## Trade-off

Fixed generic composition roles are more predictable and provider-neutral than
fully random prompts, while still allowing each story to supply the actual
content. The trade-off is that each slot has a recognizable visual role rather
than unlimited randomness.
