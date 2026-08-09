# Dual View frame-scoped video prompt design

## Problem

Dual View generation attaches a start frame and a reference frame, but the
video-prompt `frame_analysis` contract previously exposed one global list of
character positions. A character visible only in Image 2 could therefore be
reported as `not_visible` in Image 1 and still receive a global
`viewer-left/right` anchor. That anchor was structurally ambiguous even when
the prompt prose later mentioned an outside view.

## Approved behavior

- Prompt-facing references use the standard labels `Image 1` and `Image 2` only.
- Image 1 is the start frame; Image 2 is the reference frame.
- Each image owns an independent viewer-relative coordinate space.
- Each Dual View `frame_analysis.people[]` item carries `view_role`:
  `start_frame` or `barrier_reference`.
- Image 1 contains only characters configured for the start view; Image 2
  contains only characters configured for the reference view.
- Every spoken cue states the literal owning view label before the character
  name and that view's viewer-relative position.
- Single-view shots retain the existing contract and may omit `view_role`.

## Runtime enforcement

Generation labels both physical images, supplies the explicit character and
location mapping, and asks vision to analyze each assigned image separately.
The deterministic validator resolves each dialogue speaker to a configured
view, compares the position only inside that view, and requires the matching
view label near the spoken line. An unscoped or wrong-view result receives one
corrective retry. If it remains wrong, generation fails before persistence.
The quality judge receives the same Dual View mapping and both images.

An invalid unscoped analysis is never reused as an authoritative retry lock;
only positions carrying a valid view role can become a Dual View lock.

## Verification

- Regression: Irin in Image 1 and Krit in Image 2 with unscoped analysis must be
  retried and rejected if unchanged.
- Positive case: both scoped positions pass and persist as `viewRole`.
- Existing single-view position mismatch behavior remains unchanged.
- Real skill-file twins remain byte-identical and declare the new contract.
- Focused service, judge, router, shared-contract tests and TypeScript must pass.

## Operational notes

No database migration is required because `frameAnalysis` is optional JSON.
Previously generated prompts remain readable; users regenerate the affected
video prompt to receive view-scoped analysis and prose.
