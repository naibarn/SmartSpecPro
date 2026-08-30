# Feature 160 — Prompt-first source planning gap audit (2026-08-23)

## Scope

This audit closes the UX and contract gap where source slots were visible before
the creator had reviewed and approved the AI-expanded premise. The authoritative
sequence is now:

`creator premise -> AI preview dialog -> creator edits/approves -> approved slot plan -> upload/generate media -> draft/story flow`

## Five-pass review loop

### Pass 1 — UI discoverability and dialog truth

- The expansion action is rendered directly below the premise textarea even when
  the textarea is empty; it is disabled with an explanation until text exists.
- The dialog resets stale preview state when opened for a new prompt.
- The dialog continues to show the editable expanded premise, research sources,
  warnings, and visual slots before the user can apply anything.
- Applying returns to the existing wizard flow and makes the approved expanded
  premise the story spine.

### Pass 2 — Prompt approval gate and server enforcement

- Required source packs report `prompt_expansion_required` and remain blocked
  until an applied prompt-expansion run exists for the same owner and pack
  series/session.
- `saveSourceSlot` and `addSourceAsset` independently enforce the same gate, so
  a caller cannot bypass the locked UI by calling the API directly.
- The upload registration endpoint remains a storage registration primitive;
  attachment to a source pack is still blocked until prompt approval.

### Pass 3 — Slot derivation and semantic separation

- Approved prompt slots are the readiness source of truth after approval; generic
  profile defaults do not create hidden required work.
- Cafe/location review fallback planning derives distinct scene-anchor slots for
  storefront, surroundings, coffee counter, and seating, plus a reference slot
  for menu/drink detail.
- Object/software subjects remain references, while place/venue context remains
  scene-anchor material. B-roll remains a separate semantic role.
- A model response with an empty slot array falls back to deterministic derived
  slots; an approved preview cannot contain zero visual slots.
- Empty compatibility slots without attached media are pruned after approval;
  legacy slots with attached media are preserved.

### Pass 4 — Editing, stale plans, and recovery

- Editing the premise marks the current source plan stale and locks source media
  preparation until the new premise is expanded and approved.
- The source hub compares the current premise with the approved expanded premise
  on reload, preventing an old plan from silently being reused.
- Existing media is not deleted during slot reconciliation; only empty stale
  compatibility slots are soft-deleted.
- Canceling or abandoning a preview never applies its slots.

### Pass 5 — Downstream story/media readiness

- The source hub shows no upload, add-slot, prompt-generation, or image-generation
  controls before approval; it provides a clear action back to premise expansion.
- After approval, the existing source-media flow resumes with generated prompt,
  generated image, image/video upload, rights, and B-roll controls intact.
- Readiness and downstream draft gates remain blocked until the approved slots
  satisfy their descriptions/media requirements.
- Digest and B-roll projections use only the approved prompt slot set (plus
  explicit custom slots), so stale compatibility or prior-plan slots cannot
  silently influence full-story drafting or production assembly.
- R2/managed-media requirements remain enforced by the existing media-asset and
  source-asset contracts; this change does not introduce provider-URL playback.

## Verification

- `sourcePack.test.ts` and `verticalDramaPromptExpansionService.test.ts`: 15/15
  tests passed.
- `git diff --check`: passed.
- Full web typecheck: rerun after repair; unrelated baseline diagnostics may
  remain, but the touched prompt/source files must have no diagnostics.
- Browser route verification: not run in this local pass; requires an
  authenticated planning-series session and browser runtime.

## Residual boundary

Live web-search provider behavior, R2 availability, authenticated browser
rendering, database migration application, and production draft generation are
external/runtime gates and are not claimed as locally proven here.
