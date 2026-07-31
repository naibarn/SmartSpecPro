# VD character tab — separate model for text-to-image vs image-to-image

Date: 2026-07-31
Reporter: user (Thai) — "ควรแยก model สำหรับสร้างภาพใหม่ กับแก้ไขภาพเดิม ให้เลือก model
ได้แตกต่างกัน ตอนนี้มีหัวข้อเดียว ... gpt image 2 (text to image) ทำได้ดี แต่แทบไม่สามารถ
edit ภาพได้ ... จะใช้ nano banana pro หรือ seedream 5 pro คุณภาพจะดีกว่า"

## Problem statement

The character tab has ONE image-model picker, but a character render is two
genuinely different provider jobs:

- **No reference attached** → text-to-image. kie's `gpt-image-2-text-to-image` is
  strong here (audit log confirms clean first portraits from it).
- **Reference attached** → image-to-image / `image.edit`. The SAME model is weak
  at this, and it is what every look, every twin, and every regeneration runs
  (`referenceImageUrls` flips kie to `gpt-image-2-image-to-image`, and the Hermes
  leg to `operation: "image.edit"`). Seedream 5 Pro / Nano Banana Pro hold
  identity much better on that path.

With one picker, whichever model the user chooses is wrong for half their
generations, and nothing in the UI tells them why.

## Design

The client cannot decide this on its own: whether a reference is attached is
resolved server-side across three tiers, including the parent-portrait fallback
(`resolveReferencePortraitSource`, added in
`planning/vd-character-full-body-framing/plan.md`). Reproducing that lookup in
the panel would drift from the server the first time the tiers change.

So: the client sends BOTH picks; the server chooses.

| # | File | Change |
|---|---|---|
| S1 | `verticalDramaCharacters.ts` | `pickCharacterRenderModelId({hasReferenceImage, selectedImageModelId, selectedEditImageModelId})` — exported pure function, edit model wins only when a reference is genuinely attached AND an edit model was supplied |
| S2 | `verticalDramaCharacters.ts` | `selectedEditImageModelId` added (optional) to `generateCharacterImage` and `generateCharacterSheet`; both resolve through `pickCharacterRenderModelId` before pricing/credits/transport |
| C1 | panel | second state + `smartspec_vd_character_edit_image_model` storage key |
| C2 | panel | `modelDialogTarget: "create" \| "edit" \| null` — ONE `ModelSelectorDialog` serves both slots so they cannot drift |
| C3 | panel | second picker button, sent on `generateCharacterImage` (direct + confirm) and both `generateCharacterSheet` call sites |
| C4 | panel | `imageModelUsesMcp` / `imageModelUsesHermes` become the UNION of both models; MCP picker's `providerKey` falls through to the edit model |

Deliberately NOT changed: the portrait-candidate batch. A candidate batch is a
character's FIRST portrait and never carries a reference, so it is always
text-to-image and correctly uses `selectedImageModelId` alone.

## Risk assessment

- Optional field. An empty edit slot means `pickCharacterRenderModelId` returns
  `selectedImageModelId`, i.e. byte-identical to the single-picker behavior. No
  migration, no DB change, no new dependency.
- Existing users keep their remembered text-to-image model (separate storage
  key); the edit slot starts empty.
- Transport union is deliberately over-inclusive: if either model needs an MCP /
  Hermes connection, the panel asks for one. Under-asking would produce a failed
  generation, so the union is the fail-closed direction. Sending an unused
  connection id is harmless — `resolveVdCharacterMcpTransportMetadata` returns
  early when the RESOLVED model is not MCP-transport.
- Credits/pricing follow the resolved model, so an edit model with a different
  credit cost is priced correctly with no extra wiring.

## Verification

1. `pickCharacterRenderModelId` unit tests (all four combinations).
2. Router tests: reference present ⇒ edit model resolved; reference absent ⇒
   text-to-image model; edit model absent ⇒ unchanged.
3. `tsc` on apps/web; targeted vitest runs; fail-set diff vs baseline.

## Progress

- [x] S1 + S2 server
- [x] C1–C4 client
- [x] tests
