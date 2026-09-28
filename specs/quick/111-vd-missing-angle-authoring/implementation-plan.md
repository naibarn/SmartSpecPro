# Implementation plan

## Objective

Make a missing location-angle warning actionable and understandable from the
Storyboard: choose a gap, review/edit the generated prompt, confirm the paid
render, approve it as a location sub-view, and select that sub-view in any shot.

## Current-codebase fit

Most of the end-to-end plumbing is already implemented. The focused change is to
upgrade the existing `VerticalDramaLocationsBibleCard` state machine and its
copy/interaction surface, then add regression coverage for the new states. The
series-level `VerticalDramaLocationStockPanel` and backend variant resolver stay
compatible and should only be touched if tests expose a contract mismatch.

## Affected areas

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
  - editable prompt and negative-prompt state per location
  - explicit gap-review summary and sub-view copy
  - render/retry/edit/approve state transitions
  - preserve existing shot picker and variant thumbnail behavior
- `apps/web/client/src/components/verticalDramaSeries/__tests__/`
  - focused behavior tests for coverage-gap authoring and variant selection
- `apps/web/server/routers/__tests__/verticalDramaLocations.test.ts`
  - retain/extend approved-prompt no-double-generation coverage if needed
- Existing shared/router contracts remain the source of truth for per-shot
  `locationVariantId` persistence and ownership checks.

## Implementation approach

1. Normalize the coverage-gap click into one local authoring draft containing
   location key, gap text, coverage role, generated prompt, negative prompt,
   and review state.
2. Replace read-only preview text with labeled textareas. Keep the AI-generated
   text as the initial value, but let the user edit it before rendering.
3. Add actions: regenerate suggestion (existing preview confirmation), generate
   image from current edited prompt (existing image confirmation), revise prompt,
   and approve candidate as a coverage variant.
4. Ensure each render uses the latest edited prompt/negative prompt and the
   current gap metadata, while the candidate remains local until approval.
5. After approval, invalidate the location roster, clear the draft/candidate,
   and show the approved variant in the location row. The shot picker must show
   the new variant once the roster query refreshes.
6. Add tests for loading, edit persistence, generation payload, approval role,
   retry/revise behavior, and per-shot variant display/selection. Keep existing
   dirty-file changes out of the patch.

## Acceptance criteria

- Clicking a listed coverage gap opens an actionable review state with the gap
  description and prefilled editable prompt.
- User can edit prompt text before paid image generation.
- User confirmation is required before prompt generation and image generation.
- Edited prompt is sent as `approvedPrompt`; no second prompt-generation call is
  made for the same render.
- Generated candidate can be approved as a coverage variant without replacing
  the primary location image.
- Approved variant appears in the existing per-shot picker with thumbnail/label.
- Selecting a variant persists `locationVariantId` and existing stale safeguards
  remain intact.
- Failures leave the draft recoverable and expose a retry/revise action.
- Focused tests and `git diff --check` pass; repository-wide baseline failures are
  reported separately if present.

## Risks and mitigations

- Existing card has independent per-location state: key every draft by
  `locationKey` to avoid cross-location edits.
- Preview responses can arrive after a newer edit: only apply the response to
  the active location/generation request and keep user edits after response.
- Coverage variants must not become primary: preserve the existing role passed
  to `linkAsset` and do not call `setPrimaryAsset`.
- The page is dense on small screens: keep textareas full-width and action rows
  wrapping; no new fixed-width surface.

## Browser evidence

Authenticated browser evidence is required for final UI confidence, but may be
skipped if no authenticated browser/dev-server session is available. Focused
component tests remain mandatory.
