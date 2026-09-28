# Enhanced offscreen speaker readiness design

## Decision

Enhanced prompt generation must not be blocked solely because a dialogue
speaker is mentioned in the shot script but is not part of the approved visual
cast. A speaker that resolves to the selected cast keeps its canonical identity
and position. An unresolved, non-ambiguous speaker is preserved as an
off-screen/narrative dialogue entry with `viewer-offscreen` metadata; it is not
added to image references or the physical scene cast.

Ambiguous speaker identities remain blocked because silently choosing between
two selected people can bind lip-sync to the wrong face. Other admission gates
(approved Start Frame, provider/model capability, tenant scope, credits, and
runtime readiness) are unchanged.

## Runtime behavior

The Node boundary emits the authored speaker key/name and marks it off-screen
when it is absent from the selected frame candidates. The Python bridge accepts
that bounded state, renders the line as audio/narrative-only, and explicitly
forbids adding the speaker to the visible scene. It does not require a position
or invent a physical cast slot.

## Verification

- TypeScript service tests cover resolved, ambiguous, and missing/off-screen
  speaker resolution.
- Python bridge tests cover an off-screen line and preserve the existing
  ambiguous/position-bound behavior for visible dialogue.
- Focused Vitest/Python suites and `git diff --check` are the completion gates;
  no provider call, credit spend, deployment, or authenticated browser proof
  is performed in this change.
