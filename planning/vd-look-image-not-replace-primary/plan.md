# VD — look image must not replace the character's primary portrait + per-look re-render dialog

Date: 2026-07-31
Reported (TH): "สร้างภาพลุคใหม่ แล้วระบบไปแทนภาพตัวละคร primary หลักเดิม" +
"เพิ่มฟังก์ชั่นให้สร้างภาพใหม่แทนในลุคนั้น ๆ ได้ โดยพิมพ์บรรยายรายละเอียดภาพใหม่ และเลือกได้ว่าจะใช้ภาพ primary
หรือภาพเดิมของลุคนั้นเป็น reference"

## 1. Evidence (series 18, character 71 "ลลิน ศิริกุล", look 112 "ชุดลำลอง")

```
id  | characterId | role             | approved | mediaAssetId | createdAt                | source
275 | 112 (look)  | primary_portrait | t        | 1207         | 2026-07-31 12:09:40.715  | generated
277 | 71 (parent) | primary_portrait | t        | 1207         | 2026-07-31 12:15:15.784  | imported
```

The look's freshly generated image (media asset **1207**) was linked a second time onto the
**parent** row 5m35s later with `source: "imported"`. Because
`resolveCharacterCardPortraitAsset` picks the newest `approved` `primary_portrait`, the parent
card's main image became the look's image.

Same shape at 08:21 for character 70 (asset 272, `imported`).

Generation itself is innocent: `generateCharacterImage` →
`pollCharacterImageTask(…, variables.characterId, "primary_portrait")` links only onto the
variant row (`source: "generated"`, row 275). Nothing server-side writes to the parent.

## 2. Root cause

`VerticalDramaCharacterReferencePanel.tsx` — the **"ภาพตัวละครนี้" (characterGallery) tab**:

* `swapCharacterFamilyIds` deliberately widens the gallery to the whole look family
  (base character + all its variants) — the 2026-07-18 "identity-safe swap" rule.
* Every tile is captioned with the raw `asset.role` string, which renders as
  `primary_p…` for **every** tile — the user cannot tell the parent's image from a look's.
* A single click calls `onLinkMediaAssetId(asset.mediaAssetId)` with **no confirmation**, and
  the stock panel wires that to `linkMutation` with `role: "primary_portrait"`,
  `source: "imported"` against `selectedCharacter.characterId`.
* That tab **auto-opens by default** whenever the character has any asset.

So: parent card selected → default tab shows the look's brand-new image among the parent's own
images, unlabeled → one click replaces the parent's main portrait. Exactly rows 275/277.

## 3. Secondary defect found while tracing (blocks the requested feature)

`resolveReferencePortraitSource` (`verticalDramaCharacters.ts:455`) maps **any**
`referenceAssetLinkId` override to `source: "explicit"` → `referenceSourceIsOwnLikeness()` →
`hasOwnReferenceImage: true`. `getReferenceImageUrlByAssetLinkId` is deliberately scoped to
`(tenant,user,series)` and **not** `characterId`, so a look can legitimately pin its **parent's**
portrait — and today that borrowed portrait is announced to the skill as the look's own
established likeness. That flips on skill.md's strictest rule ("keep outfit, clothing,
accessories and shoes IDENTICAL to the reference") for the one flow whose entire purpose is a
DIFFERENT outfit. This is the exact failure `ReferencePortraitSource`'s own RC2 doc comment
describes for the *auto* path, left unfixed on the *explicit* path.

Without fixing this, the requested "ใช้ภาพ primary เป็น reference" option would produce a look
image wearing the parent's outfit.

## 4. Changes

### A. Server — explicit pick from another character row is `inherited`, not `explicit`

* `verticalDramaCharacterStock.ts`: add `getReferenceImageByAssetLinkId(owner, assetLinkId)`
  returning `{ url, characterId }`. `getReferenceImageUrlByAssetLinkId` delegates to it
  (signature preserved for existing callers/tests).
* `verticalDramaCharacters.ts` `resolveReferencePortraitSource`: when the pinned link's owning
  `characterId` differs from the render target, return `source: "inherited"` →
  `hasOwnReferenceImage: false`. Face lock is unaffected — it flows through the independent
  `resolveFaceSourceReferenceForCharacter` channel.

Behavior delta: a variant/twin pinning its parent's portrait no longer gets the outfit-lock
instruction. Pinning one's own image is byte-identical to today.

### B. Client — the gallery must say whose image each tile is, and confirm a replacement

`VerticalDramaCharacterReferencePanel.tsx`:

* Build an owner map from `manifestQuery.data.characters` (`name`, `variantLabel`,
  `parentCharacterId` are all already in the DTO).
* Caption each tile with the owner, not the role: `ภาพหลัก` / `ลุค: <label>`, and outline
  cross-row tiles.
* Clicking a tile owned by **another** row requires a 2-step inline confirm (the panel's
  existing convention) naming both sides before it links. Own-row tiles keep linking on one
  click.

### C. Client — per-look "สร้างภาพใหม่ของลุคนี้" dialog (the requested feature)

`VerticalDramaCharacterStockPanel.tsx`: the look chip's `ImagePlus` button opens a dialog
instead of firing blind:

* Textarea → `customInstruction` (max 500, matching the server's Zod cap), prefilled from
  `customInstructionByCharacter`.
* Reference choice (radio + thumbnails) → `referenceAssetLinkId`:
  - `auto` — omit the field (today's behavior)
  - `primary` — the parent character's card portrait `assetLinkId`
  - `look` — this look's own current portrait `assetLinkId` (hidden when it has none)
* Submit → existing `generateImageMutation` → existing `pollCharacterImageTask`, which links
  onto the **look's** id. No new server endpoint.

## 5. Follow-up request — per-shot look switching (added same session)

"เปลี่ยนลลินจากชุดทำงานเป็นชุดลำลอง เฉพาะช็อตนั้น ๆ ไม่ใช่ทุกช็อต".

Already possible, but only as a two-step check/uncheck in
`ShotCharacterReferencePickerDialog` — a multi-select list that models "who is in this shot",
not "which look is this character wearing here". `setShotCharacterReference` (per-shot,
patches `startFramePlan.frames[i].requiredCharacterRefs`) is unchanged and already correct.

Added in `VerticalDramaStoryboardPanel.tsx`: a shirt button on each character chip opening a
one-click look menu for that chip's family.

* `buildShotCharacterLookOptions(characterPortraits, chipKey)` — base + every variant of the
  chip's family, rooted at `parentCharacterId ?? characterId` so it works from a base chip or
  from a look chip. Empty when the character has no looks → affordance hidden.
* `swapShotCharacterRefKey(keys, fromKey, toKey)` — REPLACE in place, order-preserving,
  de-duplicating (never the same person twice in one frame).
* The chip label now prefers `variantLabel`, so a switched shot reads "ชุดลำลอง" instead of
  repeating the base name.

## 6. Follow-up bug — "กดแก้ไขภาพแล้วหายเงียบ ไม่สร้างรูปใหม่"

Not silent on the client — the render died **server-side, before any image was submitted**.
`journalctl -u smartspec-web` 2026-07-31 21:25:03 → 21:26:02 (+07):

```
[vd_planning_retry] ERROR: Character visual bible: attempt 1/2/3 failed schema validation (openai/gpt-5.6-luna)
[tRPC] ERROR: verticalDramaCharacters.generateCharacterImage:
  characters.0.character_design_dna: The response changed an already-approved canonical Character DNA identity.
```

`custom_instruction` was `"เปลี่ยนชุดเป็นชุดลำลอง ที่สามารถใส่นอนได้ เป็นภาพเต็มตัว"`. The audit payload shows
the model kept the identity but **paraphrased** its own approved prose while retyping the
camelCase `character_design_context` into snake_case output.

### Root cause

`canonicalDesignIdentityFingerprint` compares ~20 long prose fields with **exact JSON
equality** and hard-fails the whole render on any difference. No model reliably passes that.
The fingerprint had already been narrowed twice after the identical production 500
(2026-07-14 `costumeGrammar`; 2026-07-17 `designIntent` + `recallStack.silhouette`/`.color`).
Consequence: **any character whose visual bible has been persisted once is one paraphrase away
from never being renderable again** — which is why the look's FIRST image succeeded (no
approved DNA yet) and every re-render since failed.

### Fix — enforce the policy instead of detecting its violation

`pinApprovedCanonicalDesignDna` (new, exported, unit-tested) runs last in the
`generateCharacterVisualPrompts` preprocess, only when `approvedDesignDna` exists, and
overwrites exactly the fingerprinted members with the approved values. The guard then cannot
fire for a paraphrase, while everything the fingerprint deliberately excludes — costume
grammar, `designIntent`, silhouette/color, and all the prompt prose the user's instruction is
actually about — is left exactly as the skill authored it. `role_tier` is NOT pinned: a tier
change is a genuine identity-class change, already validated separately.

Corrections are audit-logged (`pin_approved_character_design_dna`) so real drift stays visible.

**Contract change:** the existing test "rejects identity drift when an approved Character DNA
is already canonical" now asserts the drift is NEUTRALIZED (approved hair wins, one attempt,
render proceeds) instead of throwing.

## 7. Verification

* Unit: owner-caption/confirm-gate helper in the reference panel; look re-render dialog input
  builder in the stock panel; `resolveReferencePortraitSource` cross-character mapping.
* `pnpm vitest run` on the touched suites + `tsc` on the touched files.
* Manual: series 18 → ลลิน → generate look image → parent card image unchanged; gallery tiles
  labeled; clicking a look tile asks for confirmation.

## 7. Status

- [x] A — server reference-source mapping
- [x] B — gallery owner labels + confirm gate
- [x] C — per-look re-render dialog
- [x] §5 — per-shot look switcher on the chip
- [x] Tests (24 new, all green); built + web service restarted
