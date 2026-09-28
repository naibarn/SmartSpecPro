# Vertical Drama Character Reference and Casting Disclosure

## Goal

Reduce confusion in the Vertical Drama character workspace by grouping all
reference/casting controls behind one disclosure while preserving the existing
ability to change the character's primary portrait or generate a new 1–5 image
casting batch.

## Current context

`VerticalDramaCharacterStockPanel` already owns the relevant behavior:

- `setPrimaryPortrait` promotes one owned `primary_portrait` asset.
- `previewCharacterPrompt` and the existing candidate batch flow support the
  selectable 1–5 casting count.
- The detail area renders the identity-reference picker, candidate-count
  controls, model/generation actions, and saved candidate batches.
- The persistent right column renders the character reference asset list and
  the Library/History/grid-cutter importer.

The change is presentation/state-only. No new database column, router
procedure, provider contract, credit path, or migration is required.

## Approved behavior

Use one master “Character references / อ้างอิงตัวละคร” disclosure for the
selected character. It covers:

1. Existing reference assets and the Library/History/grid-cutter importer.
2. The identity-reference picker and “Set as primary / ตั้งเป็นภาพหลัก” action.
3. Existing casting controls, including the 1, 2, 3, 4, and 5 image count and
   the current preview/generate/select candidate flow.

The collapsed trigger remains visible so the user can recover the workflow:

- If the selected character has no owned `primary_portrait`, the disclosure is
  expanded by default on first selection.
- If the selected character already has a primary portrait, it is collapsed by
  default when that character is selected.
- An explicit user expand/collapse action wins for the current character while
  the panel remains mounted. Switching characters evaluates the new character
  against the same default rule.
- Read-only viewers can see the disclosure and its current state but cannot
  promote assets, generate images, import assets, or otherwise mutate data.
- Existing in-flight candidate batches and generated results are not cancelled
  merely because the disclosure is collapsed; collapsing only hides the
  controls/results until reopened.

The current primary portrait remains visible in the character roster/card. The
disclosure is the place for changing that choice or casting alternatives, not a
replacement for the roster identity signal.

## State and data flow

Add a master disclosure state keyed by character identity (or an equivalent
controlled state with an explicit selected-character reset). Its default is
derived from the same authoritative asset resolver used by the card:

`hasPrimaryPortrait(characterId) = resolveCharacterCardPortraitAsset(...)
returns an owned primary portrait`

Do not introduce a second primary-image resolver. The existing mutations and
payloads remain unchanged:

```text
select character
  -> resolve owned primary portrait
  -> default disclosure: open when absent, closed when present
  -> user opens disclosure
  -> choose an existing owned reference -> setPrimaryPortrait
     or choose 1–5 -> existing prompt preview/generation/candidate selection
```

The existing right-side panel collapse state should not leave the asset list
and casting controls in contradictory states. Replace or bridge it with the
master state so one visible disclosure action controls the complete group.
When closed, render only the compact trigger and keep the right-side column
from reserving the full reference-panel width.

## UI contract

- The trigger has a stable test id, for example
  `vd-character-reference-disclosure-toggle`, and exposes `aria-expanded`.
- The content has a stable test id, for example
  `vd-character-reference-disclosure-content`, and is not rendered visibly
  while collapsed.
- Thai is the primary copy in this product, with the existing English fallback.
- The trigger should communicate the current state without showing every
  reference/casting control by default. A compact summary may show the primary
  status/count, but must not duplicate the full asset list.
- Preserve current responsive behavior: the expanded content may use the
  existing two-column detail/sidebar layout; the collapsed state must work on
  mobile and desktop.
- Use the project's existing Button/Card/disclosure patterns and class tokens;
  do not add a dependency or introduce a separate visual system.

## Failure and edge cases

- If assets are still loading, use the existing loading/empty behavior and do
  not incorrectly claim that a primary portrait is absent.
- If the primary asset is deleted or becomes unavailable after selection, the
  next authoritative query result should make the disclosure open by default
  for that character unless the user has explicitly overridden the state in
  the current interaction.
- If a generation is pending, collapsing must preserve polling and allow the
  result to be reviewed after reopening.
- If a selected primary candidate is promoted, invalidate/refetch through the
  existing mutation success path so the roster and disclosure summary agree.
- Do not auto-promote a newly generated candidate; retain the existing explicit
  “use this as primary” action.

## Validation

Focused proof should cover:

1. A pure state/default helper: no primary => open; existing primary => closed.
2. The disclosure trigger's accessible state and content visibility, if a
   focused render test can be added without mounting the full page.
3. Existing pure tests for reference selection and candidate count remain green.
4. `git diff --check` and the focused Vertical Drama component test suite.

Out of scope for this change: authenticated browser verification, live provider
generation, credit charging, deployment, migration application, and broad
baseline TypeScript cleanup.

## Trade-offs

One master disclosure is intentionally preferred over two independent panels:
it adds one explicit interaction but gives the user one mental model for
“change this character's face.” Keeping the existing server/API contracts
minimizes regression and preserves the current 1–5 casting behavior, at the
cost of not simplifying the underlying large component in this pass.
