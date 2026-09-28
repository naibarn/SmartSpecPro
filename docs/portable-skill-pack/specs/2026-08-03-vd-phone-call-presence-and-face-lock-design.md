# Vertical Drama Phone-Call Presence and Face-Lock Design

Date: 2026-08-03
Status: Approved for implementation planning
Scope: Vertical Drama shot prompt + start-frame image + video-prompt continuity

## Problem

When a shot synopsis says that a character is heard through a mobile phone, the
current Vertical Drama pipeline can treat that speaker as physically present.
The speaker's portrait then enters the normal `requiredCharacterRefs` path, so
the image model may place that person in the room. The resulting start frame
also gives the video prompt path no explicit visual anchor for which face owns
the remote voice.

The user-visible requirement is stricter than merely hiding the remote body:
the remote speaker's face must remain clearly visible and identity-locked in
the shot, either on the mobile-phone screen or inside a floating call-screen
inset, so later video generation can bind the remote voice to the correct face.

## Goals

1. Distinguish physically visible characters from speakers who are heard but not
   physically present.
2. Prevent `voice_only` speakers from being rendered as bodies in the room.
3. Require one explicit visual representation for every `voice_only` speaker:
   `phone_screen` or `floating_call_screen`.
4. Attach the remote speaker's approved portrait through a separate call-screen
   reference channel and require a recognizable face match.
5. Carry the same call-screen identity facts into video-prompt generation so
   dialogue, voice, and the visible remote face remain associated.
6. Preserve dialogue lines, voice casting, subtitles, speech timing, and native
   audio behavior.
7. Support legacy shots whose synopsis clearly describes a phone call even when
   their persisted shot metadata predates the new presence fields.
8. Avoid database migrations and preserve unrelated media models/workflows.

## Non-goals

- Do not build a new compositor or post-processing renderer for phone UI.
- Do not infer presence from arbitrary prompt text in the generic storyboard
  reconcile path.
- Do not change dialogue ownership, TTS, subtitles, audio timing, or speaker
  casting.
- Do not implement the full cross-shot object ledger in this change; that is a
  separate Feature 140 workstream unless required by implementation evidence.
- Do not run paid provider generation as part of local verification.

## Approaches considered

### Prompt-only instruction

Add a negative prompt such as "do not show the caller in the room" and ask the
model to draw a phone screen. This is small, but it leaves the existing
character-reference attachment and required-character count unchanged. It
cannot reliably prevent body rendering or preserve the caller-face mapping.

### Structured presence plus a call-screen reference channel (selected)

Add presence-aware shot metadata, keep `voice_only` out of the physical
character list, and attach its portrait through a separate labeled reference
channel. The image and video prompt builders receive the same representation
and identity facts. This is the smallest change that addresses both the image
composition failure and the downstream voice/face association.

### Separate compositor-generated phone overlays

Render the room first and add a deterministic phone UI/face overlay later. This
would provide stronger layout control, but requires a new compositor contract,
asset lifecycle, and video-render integration. It is not necessary for the
current prompt-generation defect and has a substantially larger operational
surface.

## Data and contract design

### Presence

Use a lenient, optional presence value at authoring/reconciliation boundaries:

```ts
type VdShotPresence = "in_frame" | "voice_only" | "mentioned";
```

Unknown or absent values resolve to `in_frame` for legacy compatibility. Only
`in_frame` characters enter `requiredCharacterRefs`, speaker-order positioning,
required-character counting, and close-up widening.

`voice_only` characters retain their dialogue lines and voice metadata but are
excluded from physical scene composition. `mentioned` characters are excluded
from both physical composition and call-screen representation.

### Call-screen representation

For each `voice_only` speaker, persist an optional normalized representation:

```ts
type VdVoiceOnlyRepresentation = "phone_screen" | "floating_call_screen";
```

The resolver must always choose one for an active `voice_only` speaker. The
default is `phone_screen` when the authoritative synopsis mentions a mobile
phone, speakerphone, or receiving a call. `floating_call_screen` is allowed
when the shot's composition explicitly calls for a visual call overlay. The
choice is a visual fact, not a free-form prompt suggestion.

Per-frame metadata is additive and JSONB-compatible:

```ts
voiceOnlyCharacterRefs?: Array<{
  characterKey: string;
  representation: VdVoiceOnlyRepresentation;
  displayName?: string;
}>;
```

This field is distinct from `requiredCharacterRefs`; it is never counted as a
body in the room.

### Reference mapping

The image prompt must declare two separate mappings when both exist:

```text
REFERENCE MAPPING: Image 1 = ภาคิน; Image 2 = ไอริน.
CALL-SCREEN REFERENCE: Image 3 = คุณกฤต; representation = phone_screen.
```

The call-screen reference must state that Image 3's face shape, skin tone,
hairstyle, and distinguishing features are locked to คุณกฤต and that the face
is visible only inside the phone screen. The provider-facing negative prompt
must forbid a physical body, duplicate face, extra person, or remote speaker
standing in the room.

## Runtime flow

```text
authoritative synopsis + dialogue
        |
        v
presence resolver / per-shot authoring compatibility path
        |
        +--> in_frame refs --------> requiredCharacterRefs ------> room composition
        |
        +--> voice_only refs ------> voiceOnlyCharacterRefs -----> call-screen portrait
        |                                  |
        |                                  +--> image prompt + negative prompt
        |                                  +--> video prompt + vision reference
        |
        +--> mentioned refs --------> excluded from visual references
```

The batch storyboard path becomes presence-aware when the feature flag is
enabled. The per-shot `สร้าง prompt + ภาพ` path also accepts a legacy-compatible
authoring result: when the canonical synopsis explicitly describes a phone or
other device-mediated voice, the focused prompt-authoring call may return a
bounded `voiceOnlyCharacterRefs` subset. The server validates that every key is
a known dialogue speaker/roster character before persisting it. It must never
remove a character solely because an arbitrary prompt phrase contains a name.

For a legacy shot with the reported pattern, the focused path therefore can
produce:

```text
requiredCharacterRefs: [ภาคิน, ไอริน]
voiceOnlyCharacterRefs: [{ characterKey: คุณกฤต, representation: phone_screen }]
```

The dialogue line remains attributed to คุณกฤต.

## Image-prompt behavior

The image prompt skill receives the canonical shot synopsis, physical-character
manifest, call-screen manifest, and representation fact. It must:

- depict only the `in_frame` characters as bodies in the room;
- show the `voice_only` face clearly and recognizably on the phone screen or
  floating call-screen;
- preserve the remote character's identity from the attached portrait;
- make the representation visually readable enough for the later video model;
- keep the phone/call-screen physically plausible in the scene;
- avoid inventing a second location or a full-body remote participant.

The image negative prompt must include the equivalent of: no physical caller in
the room, no duplicate caller, no extra body, no face outside the phone/call
screen, and no unrelated person appearing from the remote call.

## Video-prompt behavior

The video prompt path receives the same `voiceOnlyCharacterRefs` and attaches
the remote portrait as a labeled call-screen reference when vision references
are enabled. Its prompt facts must explicitly identify:

- the remote speaker's name;
- the screen/inset location as read from the actual start frame;
- that the voice belongs to the face shown on that screen/inset;
- that the remote speaker has no physical body in the room;
- that only the named speaker's call-screen face may speak/lip-sync during that
  dialogue line.

The attached start frame remains the source of truth for actual screen position.
The prompt text supplies the semantic voice-to-face relationship and must not
override a visibly different position observed in the image.

## Compatibility and rollout

- No database migration is required; all new fields are optional JSONB data.
- Existing records without presence metadata resolve to legacy `in_frame`
  behavior until the focused authoring path produces an explicit call-screen
  result or the new presence flag is enabled for regenerated stage output.
- The new presence behavior is tenant-flagged during rollout because it removes
  characters from paid image references. If staged rollout observation is used,
  enable the non-subtractive call-screen context path before presence
  subtraction.
- Rollback is the flag-off path; no stored dialogue or media asset is deleted.
- Production deploy, restart, and paid generation smoke tests are outside this
  design approval and require separate explicit authorization.

## Failure handling

- If the model returns an unknown presence or representation, resolve to the
  safe legacy default (`in_frame`) and record a non-blocking diagnostic.
- If a `voice_only` key is not a known dialogue speaker/roster character, reject
  the classification rather than attaching an arbitrary portrait.
- If the voice-only portrait is unavailable, keep the dialogue but fail the
  paid render with a clear precondition message explaining that the caller face
  reference is required for this shot. Do not silently render an unidentified
  call face.
- If video reference enrichment fails, preserve the existing tolerant video
  prompt behavior and surface a diagnostic; the approved start frame still
  carries the call-screen face.

## Testing strategy

Focused tests must cover:

1. `voice_only` speakers remain in dialogue but are absent from
   `requiredCharacterRefs`.
2. `voice_only` speakers are excluded from speaker-order positioning,
   required-character count, and camera widening.
3. The reported Thai phone-call synopsis produces exactly two physical people
   plus one call-screen face, never a third body.
4. The image prompt contains the call-screen mapping, face identity lock, and
   physical-caller prohibition.
5. The render attachment manifest separates body references from call-screen
   references.
6. The video prompt carries the same speaker/face mapping and lip-sync rule.
7. Legacy/no-presence inputs preserve the existing flag-off contract.
8. Invalid or unknown model classifications fail safe without arbitrary
   portrait attachment.

Verification should use deterministic unit tests, the existing focused Vertical
Drama service/router suites, TypeScript checking for touched files, and
`git diff --check`. No paid provider call is required.

## Acceptance criteria

For the reported shot:

- ภาคิน and ไอริน are the only physical people in the room.
- คุณกฤต's face is clearly visible either on ภาคิน's phone screen or in a
  floating call-screen inset.
- คุณกฤต's face matches the approved portrait and is not rendered as a body in
  the room.
- คุณกฤต's dialogue remains intact and is still attributed to คุณกฤต.
- The generated video prompt binds คุณกฤต's voice/lip-sync to the displayed
  call-screen face.
- No unrelated characters, duplicate faces, or extra bodies are introduced.
