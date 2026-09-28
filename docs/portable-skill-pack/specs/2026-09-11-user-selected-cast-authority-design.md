# User-Selected Cast Authority for Vertical Drama Prompt Generation

## Problem

Vertical Drama currently allows storyboard character references to leak into
Start Frame, Legacy, and Enhanced prompt inputs even when a character is only
mentioned in the synopsis or beat context. In shot 9, มยุรี is mentioned as a
threat but is not physically present, has no dialogue, and is not selected by
the user. The storyboard still carries her as a required character, which
creates a four-character prompt against a three-person approved frame and can
fail Enhanced authoring.

## Decision

The user-selected visual cast is authoritative.

1. `startFramePlan.frames[shot].requiredCharacterRefs` and the persisted user
   look assignments define the physical characters allowed in the image and in
   the visible three-shot layout.
2. `screenCallerCharacterRefs` is the only additional identity source for a
   caller shown on a phone, tablet, or other in-scene display. A caller is
   contextual/on-screen media presence, not an additional physical body.
3. Storyboard `characterIds`, synopsis, episode beats, continuity notes, and
   narrative text are context only. A name found only there must never be
   promoted into the visual cast.
4. The same authority rule applies to Legacy and Enhanced prompt generation so
   the two paths cannot disagree about who is in the frame.

The system must not block merely because storyboard context contains extra
characters. Those references are ignored for visual-cast construction. Existing
guards for genuinely ambiguous dialogue speakers remain separate: this change
must prevent wrong-speaker assignment, not silently make an unrelated visible
character speak.

## Data flow

```text
user-selected frame cast
        + explicit screen caller refs
        -> visual cast contract
        -> Start Frame / Legacy / Enhanced prompt inputs

story synopsis, beats, continuity, storyboard mentions
        -> narrative context only
        -> never add a physical character
```

The visual cast contract should expose physical references and caller
references separately. Enhanced must pass physical references as the shot's
character identity set and pass callers with an explicit caller/media-presence
role. It must not use the storyboard character list as a fallback when the
approved frame already has a user-selected cast.

## Scope of implementation

- Add one shared resolver for the selected physical cast plus explicit callers.
- Use it in Start Frame prompt construction and both Legacy and Enhanced video
  prompt construction.
- Keep narrative fields available for action, stakes, and continuity, but add
  an explicit instruction that mentioned-only characters are not rendered.
- Preserve exact authored dialogue. Selected physical speakers keep their
  visible lip-sync binding; explicit callers are bound only as callers. A
  storyboard-only mention with no selected visual/caller reference is never
  bound to a visible character.
- Add regression tests for:
  - shot 9 style input where มยุรี appears only in synopsis/storyboard context;
  - three selected physical characters remaining the complete image cast;
  - an explicit caller being retained without creating a physical duplicate;
  - Legacy and Enhanced receiving the same resolved cast;
  - no preflight block caused solely by an extra narrative character.

## Existing data and credit safety

This change does not mutate existing episode JSON, regenerate images, invoke a
provider, or spend credits. Existing approved media remains untouched. After
the code change is verified, a later explicit user action may retry shot 9;
that retry will use the corrected cast resolution.

## Failure handling

- Extra narrative-only character references are ignored, not treated as a
  provider error.
- Missing/invalid user-selected frame identity remains an existing readiness
  concern and must use the current safe prerequisite messaging.
- Ambiguous dialogue identity remains a correctness error; it must not be
  guessed from synopsis order or from a character that was not selected.
- Provider failures continue to be surfaced without leaking provider response
  details.

## Verification

Run focused TypeScript tests for the shared resolver, Enhanced prompt builder,
Legacy prompt path, and Start Frame prompt path. Run the existing Python bridge
tests and `git diff --check`. Do not claim provider or production proof unless a
separate, explicitly approved paid retry succeeds.

## Trade-offs

This favors user intent and continuity over automatic storyboard inference. A
character that the story mentions but the user did not select will not appear
in generated imagery, even if a planner mistakenly lists that character as a
shot participant. The trade-off is intentional: a user can add the character
explicitly through the selected cast or caller control when the character is
meant to be visible.
