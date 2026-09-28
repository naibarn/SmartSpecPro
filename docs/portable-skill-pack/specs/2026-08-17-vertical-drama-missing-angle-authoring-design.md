# Vertical Drama missing-angle authoring and per-shot sub-view selection

## Problem

The storyboard can report a missing location coverage angle, but the action
currently jumps from the warning to an AI prompt preview whose text is not
editable. The creator cannot clearly review or revise the command before
rendering a reusable location sub-view, and the relationship between that
sub-view and a later shot selection is not obvious.

## Approved design

Use the existing Location Visual Bible card as the single authoring surface.
Clicking a coverage gap opens a per-location review state containing the gap
reason, camera-role label, AI-generated prompt, and negative prompt. Both prompt
fields are editable. Prompt generation and image generation retain the existing
explicit credit confirmations.

The edited prompt is sent as `approvedPrompt` to the existing image-generation
mutation, preventing a second prompt-authoring call and duplicate prompt charge.
The rendered candidate remains local until the user explicitly approves it. The
approval links it with the coverage role and never changes the location's primary
reference image.

After approval, the location roster refreshes and the existing shot location
picker lists the new approved camera variant with thumbnail and label. Choosing
the variant persists the existing `locationVariantId`; the current server stale
invalidation remains authoritative when a shot's selected view changes.

## Boundaries

- No new database table or migration.
- Existing tenant/user/series ownership checks remain unchanged.
- Existing `cameraVariants`, `locationVariantId`, and stale-image contracts are
  reused rather than duplicated.
- Unauthenticated browser evidence is not claimed; focused component/router
  tests are mandatory.

## Verification

Regression coverage must prove editable prompt state, edited generation payload,
candidate approval as a non-primary coverage asset, refreshed variant display,
and per-shot selection. Run focused tests, targeted typecheck where practical,
and `git diff --check`.
