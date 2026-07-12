# Custom-instruction field for "สร้างภาพตัวละคร" (character portrait generation)

## Context

ทุกครั้งที่กด "สร้างภาพตัวละคร" ระบบส่ง fact ชุดเดิม (ชื่อ/บทบาท/คำบรรยาย/preset/reference-lock) เข้า `generateCharacterVisualPrompts` เหมือนเดิมทุกครั้ง ไม่มีสัญญาณที่แตกต่างกันให้ LLM ใช้แปรผัน ผลคือภาพที่ได้แทบไม่ต่างกันข้ามรอบ — ทางเดียวที่ผู้ใช้แก้ได้ตอนนี้คือแก้ prompt ดิบด้วยมือใน `MediaPromptPreview` ซึ่งต้องรู้ prompt-engineering และเลี่ยงการใช้ความฉลาดของ LLM ไปเลย ผู้ใช้ขอให้เพิ่มช่องกรอกข้อความเสริม (เช่น "หน้าตรง", "ภาพครึ่งตัว", "ภาพเต็มตัว") ที่ส่งเข้า skill เป็น fact ใหม่ ให้ LLM เอาไปแต่งพรอมต์เอง — **ต้องยึดหลัก skill-first**: กฎ/วิธีใช้ข้อความนี้ต้องอยู่ใน `skill.md` เท่านั้น โค้ด TS ทำหน้าที่แค่ส่ง fact ดิบ ห้าม hardcode prompt text ในโค้ดเด็ดขาด (ผู้ใช้ย้ำหลักนี้ซ้ำหลายรอบในเซสชันนี้ — ดู `feedback_skill_first_authoring` memory)

**ยืนยันจากการสำรวจโค้ดจริง + ตรวจ `MediaPromptPreview.tsx` แล้ว**:
- ปุ่ม "สร้างภาพตัวละคร" (2 จุด: roster-card icon button และปุ่มใน detail panel, `VerticalDramaCharacterStockPanel.tsx`) เรียก `startCharacterPromptPreview` → `previewCharacterPromptMutation.mutate({ seriesId, characterId })` (แค่ 2 field วันนี้) → router `previewCharacterPrompt` → service `generateCharacterVisualPrompts` → skill `vertical-drama-character-visual-bible`
- ผลลัพธ์เข้า `MediaPromptPreview` ซึ่ง**มี free-edit textarea ของตัวเองอยู่แล้ว** (`isEditing`/`editedPrompt` state, ยืนยันจากโค้ดจริงว่า `onConfirm(isEditing ? editedPrompt : prompt, ...)`) — ตอนกด confirm prompt เป็น final text แล้ว ผู้ใช้แก้เองได้อยู่แล้วที่ตรงนี้ → **field ใหม่จึงต้องไปที่ `previewCharacterPrompt` เท่านั้น** (จุดที่ LLM ร่าง prompt ครั้งแรก) ไม่ต้องส่งซ้ำตอน confirm/generate
- Precedent ที่ชัดเจนให้ทำตามเป๊ะ: `hasOwnReferenceImage?: boolean` ใน `GenerateCharacterVisualPromptsParams` (`verticalDramaCharacterImageGeneration.ts` — doc comment อธิบายชัดว่าเป็น "raw fact เท่านั้น ไม่ใช่ authored instruction text — skill's own section เป็นผู้แต่งวิธีใช้ fact นี้แต่ผู้เดียว") — field ใหม่ทำตาม pattern นี้ทุกจุด (interface doc comment, `inputPayload` spread แบบ omit-when-absent, skill.md section แยกต่างหากพร้อม guardrail ว่าห้าม override identity-lock/role-tier/child-safety)
- `generateCharacterSheet` (ปุ่มคนละอันคือ "สร้างชีทตัวละคร") เรียก service เดียวกันแต่เป็นคนละ flow ที่ผู้ใช้ไม่ได้ขอ — **ไม่แตะ**
- Field นี้เป็น ephemeral UI state ต่อการ generate เท่านั้น ไม่ persist ลง DB (ไม่เหมือน `customDescription` ของ `createCharacterVariant` ที่ถูกเก็บถาวร)

## Field contract (fixed — ทั้ง backend/frontend ใช้ชื่อนี้ตรงกัน)

- Wire/skill payload key: `custom_instruction` (string)
- Service interface: `customInstruction?: string`
- Router Zod (ทั้ง `previewCharacterPrompt` และ `generateCharacterImage`): `customInstruction: z.string().trim().max(500).optional()`
- Frontend state: `customInstructionByCharacter: Record<string, string>` (keyed ต่อ characterId เหมือน `referenceOverrideByCharacter` ที่มีอยู่แล้ว — กันปุ่มจาก roster-card กับ detail-panel ชนกัน)
- Cap 500 ตัวอักษร (เทียบกับ `customDescription` ของ variant ที่ cap 2000 เพราะเป็นคำบรรยายยาว — อันนี้เป็นแค่ hint สั้นๆ ระดับวลี)

## Files touched

1. **`skills/vertical-drama-character-visual-bible/schemas/input.schema.json`** — เพิ่ม `custom_instruction: {type: "string", description: "..."}` คู่กับ `has_own_reference_image`/`requested_sheet_type` ที่มีอยู่แล้ว

2. **`skills/vertical-drama-character-visual-bible/skill.md`** — section ใหม่ `## Custom instruction — WHEN custom_instruction is provided` (โครงเดียวกับ "## Own reference image locking — MANDATORY when `has_own_reference_image` is true"):
   - อธิบายว่าเป็น raw hint เรื่อง framing/pose/crop/mood ของรอบนี้เท่านั้น (เช่น หน้าตรง/ครึ่งตัว/เต็มตัว/มุมกล้อง) ไม่ใช่คำสั่งที่แก้ identity/wardrobe-lock/role-tier/safety ได้
   - สั่งให้ผสมเข้า `primary_portrait_prompt` และ prompt field อื่นที่เกี่ยวข้องจริง (เช่น hint "เต็มตัว" ควรมีผลกับ `full_body_prompt` ด้วย) อย่างเป็นธรรมชาติ ห้าม append ข้อความดิบ
   - guardrail ชัดเจน: มาตรการ identity-lock/reference-lock/role-tier/child-safety **ชนะเสมอ** ถ้าขัดกัน
   - ให้ LLM มี latitude ตีความ/แปรผันคำเดิมได้ต่างกันไปในแต่ละรอบ (นี่คือหัวใจของ fix — แก้ปัญหา "กดซ้ำได้ภาพเดิม")
   - ไม่มี `custom_instruction` = พฤติกรรมเดิมทุกประการ
   - เพิ่ม worked example สั้นๆ 1 อัน (ให้ skillContent test ยึดอ้างอิงได้)

3. **`server/services/verticalDramaCharacterImageGeneration.ts`**:
   - เพิ่ม `customInstruction?: string` ใน `GenerateCharacterVisualPromptsParams` พร้อม doc comment ตาม pattern ของ `hasOwnReferenceImage` เป๊ะ (raw fact, ไม่ persist, skill เป็นผู้แต่งวิธีใช้แต่ผู้เดียว)
   - ใน `buildCharacterVisualPromptsUserPrompt`'s `inputPayload`: เพิ่ม `...(params.customInstruction ? { custom_instruction: params.customInstruction } : {})` ต่อจาก `has_own_reference_image` spread

4. **`server/routers/verticalDramaCharacters.ts`**:
   - `previewCharacterPrompt`: เพิ่ม `customInstruction` เข้า Zod input + thread เข้า `generateCharacterVisualPrompts({...})` call — **จุดหลักที่ field นี้ทำงานจริง**
   - `generateCharacterImage`: เพิ่ม `customInstruction` เข้า Zod input + thread เข้า internal `generateCharacterVisualPrompts({...})` call (เฉพาะ fallback path ที่ไม่มี `approvedPrompt` — path ปกติจาก UI วันนี้ไม่ผ่านจุดนี้ แต่เก็บไว้ให้ future caller ที่ข้าม preview ใช้ได้)
   - ไม่แตะ `generateCharacterSheet`

5. **`client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx`**:
   - state ใหม่ `customInstructionByCharacter: Record<string, string>` (ใกล้ `referenceOverrideByCharacter`)
   - exported pure builder `buildPreviewCharacterPromptInput({seriesId, characterId, customInstruction})` (trim + omit เมื่อว่าง, mirror `buildCreateCharacterVariantInput`) — ทำให้ test ได้โดยไม่ต้อง render component
   - `startCharacterPromptPreview`: อ่านค่าจาก state, ส่งผ่าน builder เข้า `previewCharacterPromptMutation`
   - UI: detail panel ใช้ `<Textarea>` (มีที่พอ, ใกล้ปุ่มสร้างภาพ ~line 3584), roster-card ใช้ `<Input>` บรรทัดเดียวแบบกะทัดรัด (การ์ดแคบ) — ทั้งคู่ bind กับ state เดียวกันคีย์ด้วย characterId

6. **`client/src/components/verticalDramaSeries/verticalDramaWorkspaceCopy.ts`** — เพิ่ม key คู่ (en/th) `characterCustomInstructionLabel`/`characterCustomInstructionPlaceholder` ตาม pattern ที่มีอยู่แล้ว

## Test coverage
- skillContent test: assert section ใหม่มีอยู่, subordinate ต่อกฎ identity-lock/role-tier/safety, อนุญาต latitude (ไม่ใช่ append ตรงตัว)
- service test: `custom_instruction` เข้า payload เมื่อมีค่า, หายไปเมื่อไม่มี/ว่าง
- router test (ไฟล์ใหม่): `previewCharacterPrompt`/`generateCharacterImage` thread field ถูกต้องทั้ง 2 มูเทชัน
- frontend: unit test ของ `buildPreviewCharacterPromptInput` (trim, omit-when-blank)

## Delegation (Rule 1b)
Field contract fิกซ์แล้วในแผนนี้ → **รัน `ssp-backend` (ไฟล์ 1-4 + tests 1-3) และ `ssp-frontend` (ไฟล์ 5-6 + test 4) ขนานกันได้เลย** ไม่ต้องรอกัน เพราะชื่อ field/shape ตกลงกันแล้วในแผนนี้ conductor ตรวจอิสระทุก phase ก่อนปิด (diff review + `pnpm check` + tests) ตามวินัยเดิมทั้งเซสชัน

## Verification
- `pnpm check` + test ที่เกี่ยวข้องหลังทุก phase
- Manual: กด "สร้างภาพตัวละคร" พร้อมกรอก "ภาพเต็มตัว" ในช่องใหม่ → ดู preview prompt ต้องสะท้อน framing เต็มตัวจริง; กดซ้ำโดยเปลี่ยนข้อความเป็น "หน้าตรง ระยะใกล้" → prompt ต้องต่างจากรอบแรกชัดเจน; ไม่กรอกอะไรเลย → พฤติกรรมต้องเหมือนเดิมทุกประการ (byte-identical เทียบกับก่อนมี field นี้)
