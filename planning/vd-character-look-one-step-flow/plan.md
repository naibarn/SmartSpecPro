# VD character look (variant) — one-step "modal completes everything" flow

Date: 2026-07-17 · User report: creating a look via "เพิ่มลุคให้ <name>" works, but the
look's image can never be generated from an obvious place — the prominent generate
buttons always target the main portrait, so the flow feels broken.

## Investigation result (Explore agent, verified paths)

Almost everything already exists and is correct:

- `createCharacterVariant` (verticalDramaCharacters.ts:1860-1928) inserts a separate
  character row with `parentCharacterId`/`variantLabel`/`variantType`, stores the typed
  description as `data.description` (+ `data.wardrobeRules` for outfit) — which DOES
  flow into the visual-bible prompt via `extractCharacterDescription`.
- `resolveFaceSourceReferenceForCharacter` (verticalDramaCharacterImageGeneration.ts:
  1075-1115) already attaches the PARENT's primary portrait as face reference —
  hard lock for `outfit`, loose for `age_stage`; `null` if parent has no portrait.
- Deleting a look (row or just its image) already works (chip UI + `deleteCharacter`).
- Storyboard per-shot look switching already works end-to-end
  (`setShotCharacterReference` accepts variant keys; `ShotCharacterReferencePickerDialog`
  nests variants under the parent).

**The only real gap (G1/G6):** the modal only inserts the row. No generation fires;
the variant chip has no generate button; the roster card's generate buttons target the
parent. The user must know to select the chip, then use the detail-panel wizard.

## Change (frontend-only, VerticalDramaCharacterStockPanel.tsx)

1. **Auto-generate on modal submit.** In `createVariantMutation` onSuccess (~line
   2034-2043), after selecting the new variant, auto-fire the SAME direct image
   generation path the detail panel uses for `res.character.characterId`, when ALL of:
   - the user did NOT upload their own reference image (`referenceMediaAssetId` unset —
     an upload already becomes the look's portrait, nothing to generate);
   - the parent has a primary portrait (else warn toast: สร้างภาพหลักก่อน เพื่อใช้เป็น
     ภาพอ้างอิงใบหน้า);
   - an image model is selected in the panel (fail-closed server guard; reuse the exact
     same selected-model state the existing generate button passes — never invent a
     default, per model-selection policy). If missing → warn toast, row still created.
   Toast on fire: "เพิ่มลุคแล้ว กำลังสร้างภาพลุค..." and rely on the panel's existing
   task polling/refresh so the image lands on the chip.
2. **Modal transparency.** Small hint row in the modal: which image model will be used
   and that the main portrait is used as the face reference; if parent portrait or
   model is missing, show the warning inline (submit still allowed — it just skips
   auto-generate with the explanatory toast).
3. **Per-chip generate/regenerate button** on variant chips (~line 3801-4105): small
   icon button "สร้างภาพลุค" firing the same direct generation for that variant
   (retry path + discoverability). Same guards as (1).

No backend changes. No schema changes.

## Risk

- Credits: auto-generation charges like the manual flow the user would otherwise run;
  it fires only on explicit "เพิ่มลุค" submit with the guards above. Low.
- Reuses existing mutation + polling machinery; no new server surface.

## Verification

- Vitest: panel tests if present; otherwise typecheck-only for touched file (no new tsc
  errors) + live check on prod after build:deploy (frontend-only → no restart needed).

## Status

- [x] Investigated
- [x] Implemented (auto-generate on submit + modal hint + per-chip generate button)
- [x] Verified — no new `pnpm check` errors for the touched file; added
      `decideVariantAutoGenerateImage` unit coverage (6 cases) in
      `VerticalDramaCharacterStockPanel.characterCrud.test.ts`, all pass
      (26/26 in that file). No full-component render test exists for this
      panel (pre-existing convention: pure-function coverage only).
