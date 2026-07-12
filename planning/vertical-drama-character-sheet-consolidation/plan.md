# รวมปุ่ม Character Sheet เหลือปุ่มเดียว + เพิ่ม 12 รูปแบบ Character Design Bible

## Context (บริบท)

ในหน้า Characters tab ปัจจุบันมี 3 ปุ่มสร้างภาพตัวละครแยกกัน:
1. **"สร้างภาพตัวละคร"** (Sparkles icon) → `generateCharacterImage` — พอร์เทรตเดี่ยว (คงไว้แยกต่างหาก ไม่เกี่ยวกับงานนี้)
2. **"สร้างชีทตัวละคร"** (Grid3x3 icon) → `generateCharacterTurnaround` — ภาพ turnaround 3 มุมเท่านั้น
3. **"Character Sheet แบบเต็ม"** (Grid3x3 icon เดิม, testid `vd-generate-full-character-sheet`) → `generateCharacterSheet` — ภาพรวม (turnaround + expression grid + outfit panel + สถิติ) โดย **hardcode ต่อ string prompt ใน router โดยตรง** (`verticalDramaCharacters.ts:1796-1807`) — ละเมิดกฎ skill-first ของโปรเจกต์นี้ที่ตั้งไว้ตั้งแต่ต้นเซสชัน

ปุ่ม #2 กับ #3 ใช้คำว่า "character sheet" ซ้ำกันและไอคอนเดียวกัน ทำให้ผู้ใช้สับสน ต้องการรวมเป็นปุ่มเดียว + dropdown เลือกรูปแบบ (รวม "อัตโนมัติ" เป็นค่า default) และเพิ่มรูปแบบใหม่อีก 12 แบบ ("Character Design Bible" — Cover, Character Profile, Turnaround Sheet [=รูปแบบเดิม], Face Detail, Expression Sheet 12 ท่า, Hair Reference, Costume Breakdown, Material & Fabric, Color Palette, Pose Library, Scale & Body Proportion, AI Prompt Lock) ผู้ใช้ให้ master prompt ภาษาอังกฤษแบบละเอียดมาสำหรับทั้ง 12 แบบ

**กฎสถาปัตยกรรมเดิมของเซสชันนี้ (ต้องยึดเคร่งครัด)**: การสร้าง prompt/เนื้อหาสร้างสรรค์ทุกอย่างต้องทำผ่าน skill (`skills/vertical-drama-character-visual-bible/skill.md`) เท่านั้น ห้าม hardcode string prompt ในโค้ด TypeScript — โค้ดทำหน้าที่ส่ง fact/parse ข้อมูลเท่านั้น งานนี้จะแก้ปัญหาการละเมิดกฎเดิมที่มีอยู่แล้ว (ข้อ 3 ด้านบน) ไปพร้อมกันด้วย

**ยืนยันด้วยการอ่านโค้ดจริง (ทั้งจากผมเองและ Plan agent) ก่อนวางแผน**:
- `generateCharacterTurnaround`/`generateCharacterSheet` มีผู้เรียกใช้แค่จุดเดียว (`VerticalDramaCharacterStockPanel.tsx`) — ไม่มีจุดอื่นในระบบ ปลอดภัยที่จะรวม/ลบได้เต็มที่ ไม่ต้องทำ back-compat wrapper
- 5 field เดิมของ skill (`primary_portrait_prompt`, `turnaround_prompt`, `full_body_prompt`, `expression_sheet_prompt`, `outfit_sheet_prompt`) ถูกใช้เฉพาะใน `verticalDramaCharacterImageGeneration.ts` → 3 endpoint นี้เท่านั้น — เพิ่ม field ใหม่แบบ additive ได้โดยไม่กระทบที่อื่น
- **จุดเสี่ยงสำคัญที่ต้องระวัง**: `verticalDramaCharacterStock.ts`'s `CHARACTER_SHEET_ROLES = ["character_sheet_turnaround", "character_sheet_full"]` (บรรทัด 185) ถูกใช้เลือก "ภาพอ้างอิงใบหน้าที่ 2" ป้อนเข้า storyboard/shot generation (`getCharacterReferenceUrls`) — ถ้ารูปแบบใหม่ 12 แบบ (เช่น color palette, material swatch ที่ไม่มีใบหน้า) ถูก tag เข้า role เดิมนี้ จะทำให้ระบบเผลอเอาภาพสีตัวอย่างไปอ้างอิงใบหน้าในการสร้างฉาก — ต้องแยก role ใหม่ให้ 12 แบบนี้โดยเฉพาะ ไม่ปนกับ role เดิม
- มี regression test `verticalDramaCharacterVisualBible.skillContent.test.ts` ที่ parse "Output skeleton" JSON block ใน skill.md เอง แล้วยืนยันว่า field ต่างๆ ไม่ว่างเปล่า — ต้องอัปเดต test นี้คู่กับ skill.md เสมอ (บทเรียนเดิมของเซสชัน: field ที่ skill สอนแต่ตัวอย่างไม่เคยโชว์ มักจะออกมาว่างเปล่าจริงตอนใช้งาน)

## Design

### 1. Schema ของ skill (input/output) — เพิ่มแบบ additive เท่านั้น

`skills/vertical-drama-character-visual-bible/schemas/input.schema.json`: เพิ่ม `requested_sheet_type` (enum 14 ค่า: `auto`, `turnaround`, `full_combined`, `cover`, `character_profile`, `face_detail`, `expression_12`, `hair_reference`, `costume_breakdown`, `material_fabric`, `color_palette`, `pose_library`, `body_proportion`, `ai_prompt_lock`)

`skills/vertical-drama-character-visual-bible/schemas/output.schema.json`: เพิ่ม `sheet_prompt`/`sheet_type` เป็น **optional** (ไม่อยู่ใน `required`) — 5 field เดิมยังคง required เหมือนเดิมทุกประการ ไม่แตะ

### 2. skill.md — เพิ่ม section ใหม่ (ห้าม hardcode ที่โค้ดเด็ดขาด)

เพิ่ม section ใหม่หลัง "Required prompt fields" ก่อน "Preset visual identity": อธิบายว่าเมื่อ `requested_sheet_type` มาและไม่ใช่ `portrait`/`turnaround` ให้ authored field ใหม่ `sheet_prompt` (+ `sheet_type`) เพิ่มเติมจาก 5 field เดิม (ไม่ใช่แทนที่) — ระบุ identity-lock preamble ร่วมของทั้ง 12 แบบไว้ **ครั้งเดียว** (ไม่ทวนซ้ำ 12 รอบ ตาม convention เดิมของไฟล์นี้ที่เขียน section ร่วมแยกจากตัวอย่าง) แล้วตามด้วย subsection สั้นๆ ต่อรูปแบบ (11 subsection: cover, character_profile, face_detail, expression_12 [แทนที่แนวคิด expression_sheet_prompt เดิมด้วยเวอร์ชัน 12-ท่า 3×4 grid ที่ระบุชัดเจน], hair_reference, costume_breakdown, material_fabric, color_palette, pose_library, body_proportion, ai_prompt_lock) — `turnaround` ใช้ `turnaround_prompt` เดิมซ้ำ ไม่มี subsection ใหม่

เพิ่มคำสั่งสำหรับ `full_combined`: ให้ skill authored `sheet_prompt` เป็น layout เดียวกับที่ router เคย hardcode (portrait panel + turnaround row + expression grid + outfit panel + stats sidebar) แต่เป็นร้อยแก้วที่ authored จริง ไม่ใช่ string ต่อกัน — **นี่คือจุดที่แก้ปัญหาละเมิด skill-first เดิม**

เพิ่ม worked example อย่างน้อย 2-3 รูปแบบใหม่ (ตาม convention เดิมของไฟล์) เพื่อกัน field ว่างเปล่าตามบทเรียนเดิม

อัปเดต `verticalDramaCharacterVisualBible.skillContent.test.ts` ให้ครอบคลุม field ใหม่คู่กัน

### 3. Backend service (`verticalDramaCharacterImageGeneration.ts`)

- `characterVisualBibleCharacterSchema`: เพิ่ม `sheet_prompt`/`sheet_type` แบบ `.optional()`
- `GenerateCharacterVisualPromptsParams`: เพิ่ม `requestedSheetType?: string`
- `buildCharacterVisualPromptsUserPrompt`: ส่ง `requested_sheet_type` เข้า input payload เมื่อมี
- `GenerateCharacterVisualPromptsResult`/`generateCharacterVisualPrompts`: อ่าน `matched.sheet_prompt` ผ่านออกมา

### 4. Router (`verticalDramaCharacters.ts`) — รวมเหลือ endpoint เดียว

- ลบ `generateCharacterTurnaround` ทั้งหมด (ไม่มีผู้เรียกอื่น, ยืนยันแล้ว)
- แก้ `generateCharacterSheet` ให้รับ `sheetType` (enum 14 ค่ารวม `auto`) แทน `approvedPrompt`-only เดิม: `auto` → resolve เป็น `turnaround` (ดูเหตุผลข้อ 5), เรียก `generateCharacterVisualPrompts` พร้อม `requestedSheetType` ตามที่เลือก, เลือก prompt field ที่จะ render (`turnaroundPrompt` / `sheetPrompt` สำหรับ `full_combined` และ 12 แบบใหม่)
- ลบ hardcoded `sheetPrompt` array (บรรทัด 1796-1807) ทั้งหมด แทนด้วย `promptResult.sheetPrompt`
- Tag asset ที่บันทึกตาม sheetType: `turnaround`→`role: "character_sheet_turnaround"`, `full_combined`→`role: "character_sheet_full"` (2 ค่าเดิม ไม่แตะ `CHARACTER_SHEET_ROLES`) — **12 แบบใหม่ทั้งหมด → role ใหม่ `"character_design_bible"`** พร้อม `metadata: {sheetType: "<format-id>"}` เพื่อไม่ให้เข้า `CHARACTER_SHEET_ROLES` (กันภาพไม่มีใบหน้าเผลอไปเป็น identity reference ตามความเสี่ยงที่ระบุไว้ข้างบน)
- ไม่มี preview-step (พฤติกรรมตรงกับปุ่ม "Character Sheet แบบเต็ม" เดิมที่ generate ตรงไม่ผ่าน preview — เพื่อความเรียบง่าย ไม่ต้องขยาย `startCharacterPromptPreview`'s type union ให้รองรับ 14 แบบซึ่งจะซับซ้อนเกินความจำเป็น)
- อัปเดต comment ที่อ้างถึง `generateCharacterTurnaround` แยกเป็นของตัวเอง (มีหลายจุด)

### 5. Frontend (`VerticalDramaCharacterStockPanel.tsx`)

- รวม mutation 2 ตัว (`generateTurnaroundMutation`/`generateSheetMutation`) เหลือตัวเดียว ผูกกับ endpoint ที่รวมแล้ว
- เพิ่ม state `sheetType` (default `"auto"`) + `<Select>` (shadcn) แสดง 14 ตัวเลือก (Auto + turnaround + full_combined + 12 แบบใหม่) label ไทย/อังกฤษผ่าน `t(lang, th, en)` เดิม — แทนที่ปุ่ม 2 ปุ่มเดิม (บริเวณ detail panel) ด้วยปุ่มเดียว + select
- ปุ่มไอคอนเล็กบน roster card (Grid3x3, ปัจจุบันยิง `"turnaround"` ตรงๆ) **คงไว้เป็น shortcut** ยิง `sheetType: "auto"` (ไม่ทำ dropdown บนการ์ดเล็ก ไม่มีที่พอ) — ถ้าต้องการเลือกแบบเจาะจงให้เข้า detail panel
- ขยาย role literal union ที่มีอยู่ (บรรทัดที่พบ `"primary_portrait" | "character_sheet_turnaround" | "character_sheet_full"`) ให้รวม `"character_design_bible"`
- ขยาย thumbnail sizing check (`isTurnaroundAsset`-style, `object-contain` vs `object-cover`) ให้ครอบคลุม `"character_design_bible"` ด้วย (เป็นภาพ infographic หลายแผงเหมือนกัน ไม่ใช่ portrait crop เดี่ยว)
- ตรวจสอบ testid `vd-generate-full-character-sheet` ไม่มีการอ้างอิงใน test ใดๆ แล้ว (ยืนยันด้วย grep) — เปลี่ยน/ลบได้อย่างปลอดภัย

### 6. ความชัดเจนของ UI สำหรับตัวละครย่อย (variant/twin) — เพิ่มตามฟีดแบ็กผู้ใช้

**สถานะปัจจุบัน (ยืนยันจากโค้ดจริง)**: ตัวละคร 1 คนอาจมีหลาย "ลุค" (variant แบบ outfit/age_stage, `parentCharacterId` ชี้กลับไปตัวหลัก) หรือมีตัวละครอื่นที่ "ใช้หน้าร่วมกัน" (twin, `sharesFaceWithCharacterId`) — ทั้งสองแบบเป็น character row อิสระของตัวเอง มี `characterId` ของตัวเอง และ asset stock/reference gallery แยกจากตัวหลักอยู่แล้ว การคลิก variant chip บน roster card เรียก `setSelectedCharacterId(v.characterId)` แบบเดียวกับการคลิกการ์ดหลัก — หมายความว่า **กลไก "เลือกแล้วสร้าง character sheet ของตัวที่เลือก" (ตาม design ข้อ 4-5 ด้านบน) ใช้ได้กับทุก variant/twin อยู่แล้วโดยอัตโนมัติ ไม่ต้องแก้ backend เพิ่ม** — ปัญหาอยู่ที่ **UI ไม่บอกผู้ใช้ชัดเจนว่ากำลังดู/สร้างให้ตัวไหนอยู่**

**ช่องโหว่ที่พบจริง**: detail panel header (`VerticalDramaCharacterStockPanel.tsx:2313`, `<CardTitle>`) แสดงแค่ `selectedCharacter.name` — แต่ variant row มี `name` เป็นค่าเดียวกับตัวหลัก (เช่น "ฝาย" ทั้งตัวหลักและลุค "ชุดยูนิฟอร์ม" ต่างก็มี `name: "ฝาย"`) ตัวที่ต่างกันจริงคือ `variantLabel` ("ชุดยูนิฟอร์ม") ซึ่ง **ไม่ถูกแสดงใน header เลย** — ผลคือถ้าผู้ใช้คลิก variant chip แล้วเข้า detail panel จะเห็นหัวข้อ "ฝาย" เหมือนตอนดูตัวหลักทุกประการ แยกไม่ออกว่ากำลังทำงานกับลุคไหนอยู่ นี่คือรากของความสับสนที่ผู้ใช้พูดถึง ("ต้องแยกให้ชัดเจนว่าสร้าง character sheet ของ character ย่อยอันไหน")

**ทางแก้ (เพิ่มเข้า Phase C)**:
- **Header ของ detail panel**: เมื่อ `selectedCharacter.parentCharacterId` มีค่า (เป็น variant) — เปลี่ยนหัวข้อจาก `{name}` เฉยๆ เป็นรูปแบบ breadcrumb ชัดเจน เช่น `{parentName} › {variantLabel}` พร้อม badge สีแยกประเภท (`variantType === "outfit"` vs `"age_stage"` ใช้สีต่างกัน เช่น badge "ชุดหลัก" ปกติ vs "ช่วงอายุ" อีกสี) — ต้อง resolve `parentName` จาก `characters.find(c => c.characterId === selectedCharacter.parentCharacterId)?.name` (pattern เดียวกับที่ `shareFaceSourceName` resolve อยู่แล้วที่บรรทัด 296-297)
- เมื่อ `selectedCharacter.sharesFaceWithCharacterId` มีค่า (เป็น twin) — แสดง badge "ใช้ใบหน้าร่วมกับ {ชื่อตัวต้นทาง}" ใน header ด้วย (ตอนนี้ badge นี้โชว์แค่บน roster card เท่านั้น ไม่โชว์ใน detail panel — เพิ่มให้ตรงกัน ใช้ `shareFaceSourceName` resolve logic แบบเดียวกับที่มีอยู่แล้ว)
- **Select ตัวเลือก sheet type (ข้อ 5)**: ไม่ต้องแก้อะไรเพิ่ม เพราะผูกกับ `selectedCharacter.characterId` อยู่แล้วโดยธรรมชาติ — เมื่อ header บอกชัดแล้วว่ากำลังดู "ฝาย › ชุดยูนิฟอร์ม" อยู่ ปุ่ม generate + select ที่อยู่ใต้ header เดียวกันจะเข้าใจได้เองว่ากำลังสร้างให้ลุคนี้
- **Roster card**: คงโครงสร้างเดิม (variant chip ใต้การ์ดหลัก, twin badge) ตาม Char-Variants Phase E ที่มีอยู่แล้ว — ไม่ต้องออกแบบใหม่ เพราะจุดที่ผู้ใช้บอกว่าสับสนคือหลังคลิกเข้าไปแล้ว (detail panel) ไม่ใช่ตัว roster grid เอง

**หมายเหตุ**: ไฟล์นี้เพิ่งถูกแก้โดย agent อีกงานหนึ่ง (เพิ่มปุ่มลบ/ขยาย/ลากวางบน thumbnail) เสร็จก่อนหน้านี้ในเซสชัน — ต้อง `git status`/อ่านสถานะไฟล์ปัจจุบันก่อนเริ่ม ไม่ใช้เลขบรรทัดจากการสำรวจนี้แบบตายตัว (เลขบรรทัดขยับจากการแก้ไขนั้นแล้ว)

## Work package assignment (ตาม Rule 1b เหมือนเดิม)

- **Phase A** (ssp-backend): ข้อ 1-2 — schema + skill.md เนื้อหาทั้ง 12 แบบ + อัปเดต skillContent test — ทำก่อน เพราะทุก phase หลังพึ่งพา field ใหม่นี้
- **Phase B** (ssp-backend, รอ Phase A): ข้อ 3-4 — service + router รวม endpoint, ลบ hardcode, tag role ใหม่
- **Phase C** (ssp-frontend, รอ Phase B): ข้อ 5-6 — รวมปุ่ม + select ใน UI พร้อม breadcrumb/badge แยกความชัดเจน variant/twin ใน detail panel header

ทุก phase ตรวจสอบเองก่อนส่งต่อ (diff review + `pnpm check` + tests) ตามวินัยเดิมทั้งเซสชัน — **conductor ตรวจสอบเองอิสระทุก phase ก่อนปิดงาน ไม่เชื่อรายงาน agent เพียงอย่างเดียว**

## Verification

- `pnpm check` + รัน test ที่เกี่ยวข้องทุกไฟล์หลังแต่ละ phase (`verticalDramaCharacterVisualBible.skillContent.test.ts`, `verticalDramaCharacterImageGeneration.test.ts`, router/panel test ที่เกี่ยวข้อง)
- ตรวจสอบด้วยตาว่า `CHARACTER_SHEET_ROLES` ไม่ถูกขยายให้รวม `"character_design_bible"` โดยไม่ตั้งใจ (จุดเสี่ยงสูงสุดของงานนี้)
- Manual: สร้าง character sheet แต่ละ 3 กลุ่ม (turnaround, full_combined, อย่างน้อย 1 ใน 12 แบบใหม่) แล้วตรวจ audit log ว่า prompt ที่ส่งจริงมาจาก skill (ไม่มี string hardcode ปนอยู่) และตรวจว่า asset ที่บันทึกได้ role/metadata ถูกต้องตามที่ออกแบบ

## สถานะ: เสร็จสมบูรณ์ (2026-07-11) — ตรวจสอบอิสระครบทุก Phase

- **Phase A** (skill schema + skill.md 12 รูปแบบ + skillContent test) — ตรวจสอบแล้ว:
  `required` array เดิม 5 field ไม่ถูกแตะ, เพิ่ม 11 subsection + `full_combined`
  ครบ, worked example คุณภาพดี 3 ตัวอย่าง, 29/29 tests ผ่าน
- **Phase B** (router/service รวม endpoint + ลบ hardcode) — ตรวจสอบแล้ว:
  `generateCharacterTurnaround` ลบจริง (ไม่ใช่ stub), hardcoded `sheetPrompt`
  array หายไปจริง (แทนด้วย `promptResult.sheetPrompt` จาก skill), มี error
  throw แทน silent fallback เมื่อ skill ไม่คืน `sheet_prompt`,
  `CHARACTER_SHEET_ROLES` ไม่ถูกแตะ (ยืนยันค่าตรง), role/metadata tagging
  3 tier ถูกต้อง (`turnaround`/`full_combined` คงเดิม, 12 แบบใหม่ →
  `character_design_bible` แยกออกจาก role ที่ใช้อ้างอิงใบหน้า), typecheck
  เหลือ error เดียวตามคาด (Phase C dependency), 165/165 tests เฉพาะจุด,
  full vertical-drama sweep กลับมาตรง baseline เดิม (15 fail เดิมทั้งหมด)
- **Phase C** (UI รวมปุ่ม + select + variant/twin header) — ตรวจสอบแล้ว:
  array 14 ค่าตรงกับ router เป๊ะ, mutation รวมเป็นตัวเดียวอ่าน
  `assetRole`/`assetMetadata` จาก backend (ไม่ hardcode role ฝั่ง client),
  `linkAsset` รองรับ `metadata` field ยืนยันแล้ว, roster mini-icon ยิง
  `sheetType: "auto"` ตรง, แก้ bug เดิมที่ `character_sheet_full` เคยถูกตัด
  ขนาดผิดเป็น portrait crop ไปด้วย, detail panel header แสดง breadcrumb
  `{parent} › {variantLabel}` + badge สีแยก outfit/age_stage + badge twin
  ตามที่ผู้ใช้ขอเพิ่มเติม, typecheck 0 errors, 70/70 tests เฉพาะจุด, full
  sweep ตรง baseline เดิม (2968/2983 ผ่าน, 15 fail เดิม)

ผลลัพธ์สุดท้าย: ปุ่ม "สร้างชีทตัวละคร" + "Character Sheet แบบเต็ม" ที่เคยสับสน
รวมเหลือปุ่มเดียว + dropdown เลือกได้ 14 รูปแบบ (auto + 2 เดิม + 12 ใหม่)
ทุก prompt สร้างผ่าน skill 100% ไม่มี hardcode ในโค้ดเลย และ detail panel
บอกชัดเจนแล้วว่ากำลังทำงานกับตัวละครหลักหรือ variant/twin ตัวไหนอยู่
