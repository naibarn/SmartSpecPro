# VD character look images — "ภาพเต็มตัว" is ignored, always half-body

Date: 2026-07-31
Reporter: user (Thai) — "เวลาเพิ่มลุคใหม่ แล้วระบุให้สร้างเป็นภาพแบบเต็มตัวแต่ระบบไม่สร้างให้
สร้างออกมาเป็นภาพครึ่งตัวตลอด เหมือนระบบมีอะไรไป block ป้องกันไว้ รวมถึงควรออกมาเป็นภาพแบบ
style sheet ได้หากระบุไป"

## Problem statement

A user types a framing brief (e.g. `ภาพเต็มตัว ชุดสูทสีดำ`) into the character panel's
"รายละเอียดเพิ่มเติม" field and generates a look image. The result is always a half-body
portrait. The same brief works on a character's FIRST portrait (candidate-batch path) —
audit log `audit-2026-07-31.jsonl` shows `"full-body cinematic vertical portrait of พี่ฟ้า…"`
reaching kie/gpt-image-2 — so the skill and the LLM are not the problem.

## Root causes (all verified by reading the live code path)

### RC1 — the look-image buttons never send `customInstruction`

`fireDirectCharacterImageGeneration` (`apps/web/client/src/components/verticalDramaSeries/
VerticalDramaCharacterStockPanel.tsx:2719`) sends only `seriesId` / `characterId` /
`selectedImageModelId` / transport ids. It is the handler for BOTH look paths:

- auto-fire right after "เพิ่มลุค" submits (`:2467`)
- the per-look chip's "สร้างภาพลุค" button (`:4740`)

The textarea in the UI is keyed by `customInstructionByCharacter[selectedCharacter.characterId]`
and is only read by `startCharacterPromptPreview` (`:3109`), i.e. the "สร้างภาพตัวละคร" button.
The "เพิ่มลุค" dialog (`:7503`) has no such field at all.

### RC2 — an inherited parent portrait is mislabelled as the character's OWN reference

`generateCharacterImage` (`apps/web/server/routers/verticalDramaCharacters.ts:3291`) resolves
`referencePortraitUrl` via `resolveReferencePortraitUrl`, which falls back to the PARENT /
twin-source character's portrait when the character has none of its own (`:426`). The router
then derives `hasOwnReferenceImage: Boolean(referencePortraitUrl)` (`:3356`) — true even when
the URL is the parent's.

`has_own_reference_image: true` triggers skill.md's strictest rule (`skill.md:700`):

> lock ALWAYS covers, completely and every time, never partially: face shape, skin tone,
> hairstyle, **outfit, clothing, accessories, and shoes**

and the custom-instruction section is explicitly subordinate to it (`skill.md:845`). For a
LOOK — whose entire purpose is a different outfit — this is backwards. `faceSourceReference`
(which deliberately does NOT lock clothing/hair) is already resolved for exactly this case and
is the correct channel.

`generateCharacterSheet` (`:3791`) has the identical bug.

### RC3 — `full_body_prompt` is generated then discarded

The skill authors five prompts every call; `full_body_prompt` is read at
`verticalDramaCharacterImageGeneration.ts:2657` and returned at `:2707`. Repo-wide search
finds **no production consumer** — only `apps/web/scripts/test-vd-character-sheet.ts`.
Rendering always uses `portraitPrompt` (`verticalDramaCharacters.ts:3372`).

Aggravator: nearly every worked example in skill.md ends `primary_portrait_prompt` with
`85mm f/1.8 portrait lens, shallow depth of field` — head-and-shoulders lens grammar that
few-shots the model back toward a half-body crop.

### RC4 — the reference is attached as a hard image-edit input

`referenceImageUrls: [referencePortraitUrl]` (`:3558`) makes kie switch to
`gpt-image-2-image-to-image`; the Hermes leg switches `operation` to `image.edit` with
`roleFor: () => "identity_lock"` (`:3446`). With a half-body reference, an edit call copies
the source crop unless the prompt states head-to-toe framing explicitly. RC2+RC3 guarantee it
never does.

### RC5 — style sheets exist but the instruction cannot reach them

14 sheet formats exist (`VerticalDramaCharacterStockPanel.tsx:1586`, incl. `pose_library`,
`body_proportion`, `costume_breakdown`). `generateCharacterSheet`'s input schema
(`verticalDramaCharacters.ts:3672`) has no `customInstruction`, so a style-sheet request typed
into the textarea is silently dropped.

## Changes

Skill-first rule (memory `feedback_skill_first_authoring`): TypeScript supplies FACTS and
plumbing only. All creative/framing prose stays authored by skill.md. The one new output field
is a skill-authored VERDICT that TS only routes on — it never computes it.

| # | File | Change |
|---|---|---|
| C1 | `VerticalDramaCharacterStockPanel.tsx` | `fireDirectCharacterImageGeneration(characterId, instructionOverride?)` sends `customInstruction`; look chip passes the look's own value; "เพิ่มลุค" dialog gains the field and seeds it for the auto-fire |
| C2 | `verticalDramaCharacters.ts` | new `resolveReferencePortraitSource` returning `{url, source}`; `hasOwnReferenceImage` true only for `explicit`/`own`, never `inherited`. Applied at both `generateCharacterImage` and `generateCharacterSheet` |
| C3 | `verticalDramaCharacterImageGeneration.ts` | optional skill output `primary_portrait_framing`; when it is `full_body`/`style_sheet` the returned `portraitPrompt` is the skill's matching prompt (region anchor applied identically). Selection lives in the SERVICE so preview and generate can never disagree |
| C4 | `skill.md` + `SKILL.md` (twins) | framing/crop carve-out from the reference lock; `primary_portrait_framing` contract + skeleton + worked example; a full-body example that does not end in 85mm portrait-lens grammar |
| C5 | `verticalDramaCharacters.ts` + panel | `generateCharacterSheet` accepts and threads `customInstruction` |

## Risk assessment

- C2 is the highest-impact change and alters prompt text for every variant/twin regeneration.
  It does NOT change behavior for a character regenerating its own approved portrait
  (`source === "own"` keeps the strict lock).
- C3 changes which string is rendered only when the skill emits the new optional field. Absent
  field ⇒ byte-identical to today.
- C4 must keep `skill.md` and `SKILL.md` identical (memory `project_vd_skill_dualcase_file_drift`);
  `output.schema.json` is `additionalProperties: true` at character level, so the added field
  needs no schema break.
- No DB/schema change. No new dependency.

## Verification

1. `verticalDramaCharacters.customInstruction.test.ts` — extend for the look path.
2. New test: inherited parent portrait ⇒ `hasOwnReferenceImage` false.
3. New test: `primary_portrait_framing: "full_body"` ⇒ `portraitPrompt === full_body_prompt`.
4. `verticalDramaCharacterVisualBible.skillContent.test.ts` still green (skeleton parse).
5. `tsc` on apps/web; targeted vitest runs.

## Progress

- [x] C1 client wiring
- [x] C2 reference-source fix
- [x] C3 framing-aware render prompt
- [x] C4 skill.md twins
- [x] C5 sheet custom instruction
- [x] tests
