# Vertical Drama Spoken Caller Virtual Screens

## Problem

Vertical Drama currently preserves explicit `screenCallerCharacterRefs`, but a
spoken caller can still be described too loosely in start-frame and video
prompts. Video models may then place the caller in the physical scene, merge
remote voices, or omit the caller's face. The product requirement is stricter:
when an explicitly assigned caller has dialogue in a shot, the caller must be
shown only inside a dedicated vertical virtual phone screen for the entire
shot. Multiple spoken callers must use separate virtual screens.

## Design

Add a pure shared policy helper that receives the authoritative physical scene
references, explicit screen-caller references, and the shot's ordered dialogue
speaker keys. It returns the normalized physical references, all screen callers,
the spoken screen callers in speaking order, and one virtual-screen directive
per spoken caller. Explicit role assignments remain authoritative; synopsis
text never reclassifies a character. A caller with no dialogue remains an
ordinary screen caller under the existing compatibility behavior.

The start-frame contract will use the policy result to keep spoken callers out
of the physical reference manifest and to require a visible vertical phone
screen with the caller's face. The video-motion contract will receive the same
derived result and require each spoken caller to remain in a separate vertical
screen throughout the clip, with the speaking order preserved. The prompts
will explicitly prohibit a physical-room caller duplicate and prohibit merging
multiple caller faces into one screen.

The policy is additive and JSON-compatible. No database migration is needed:
the existing caller arrays and dialogue data are sufficient, and the derived
directive is recomputed whenever a start frame or video prompt is regenerated.

## Failure handling

If a dialogue speaker cannot be matched to an explicitly configured caller,
the policy will not infer caller status from prose and will preserve existing
physical-scene behavior. If a configured caller has no portrait, existing
fail-closed portrait validation remains responsible for rejecting the frame
generation rather than silently substituting an unrelated image.

## Acceptance criteria

1. One spoken caller produces one dedicated vertical virtual-screen directive.
2. Multiple spoken callers produce separate directives in first speaking order.
3. Spoken callers are absent from physical-scene references and explicitly
   prohibited from appearing in the room.
4. The start-frame and video-motion prompts contain equivalent caller rules.
5. Caller names mentioned only in synopsis do not become callers.
6. Existing no-caller and silent-caller behavior remains compatible.
7. Focused shared, start-frame, and video-prompt tests pass.
