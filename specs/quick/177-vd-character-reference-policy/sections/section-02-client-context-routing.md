# Section 02 — Client context routing

## Ownership

Own request construction and caller context in `VerticalDramaCharacterStockPanel.tsx`.

## Target files

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx`
- pure helper/component tests

## Requirements

- Main portrait regeneration sends `none` when user has not intentionally selected/attached a reference.
- A displayed current primary is not treated as explicit selection.
- Picker/attachment selection sends exact asset link id and is never removed by no-reference default.
- Look re-render sends `auto` when no special choice and exact ids for primary/look choices.
- Update preview-confirm, direct generation, and any auto-fire paths consistently.

## UI/UX Contract

- Target user/job: regenerate a character’s main image while choosing whether likeness should be anchored.
- Surface: character stock panel main portrait action, reference picker, per-look render dialog.
- State matrix: default main = no reference; explicit picker/attachment = selected reference; look default = auto; loading/error/success preserve selection semantics.
- Copy: retain existing Thai/English labels; if a label is needed, clearly state “สร้างภาพหลักใหม่โดยไม่ใช้ภาพเดิม” / “Regenerate main portrait without the old image as reference”.
- Accessibility: explicit selected-reference state must be visible to keyboard/screen-reader users; no hidden default selection.
- Browser evidence: verify request payload and resulting image history in a real browser after implementation.

## TDD

Test request builders and call arguments, especially distinction between absent explicit override and selected asset.

## Risks

There are multiple generation call paths. Search all `generateCharacterImage` callers and do not update only the visible main button.

## Implemented

- Main prompt-confirm payload carries `referencePolicy: "none"` by default.
- Look builder/direct generation explicitly carries `referencePolicy: "auto"`.
- The picker no longer marks the current primary as selected unless the user clicked it explicitly.
