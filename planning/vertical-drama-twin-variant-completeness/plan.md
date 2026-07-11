# แฝด/Variant: auto-reference, manual CRUD, stable-ID reconcile, storyboard twin-awareness, per-shot picker

## Context (บริบท)

ต่อยอดจากรายงานสำรวจความครบถ้วนของระบบ twin/age-stage variant — ผู้ใช้ยืนยันให้ทำครบทุกข้อที่พบว่าเป็นช่องโหว่ รวม 6 workstream ใหญ่ในรอบเดียว (ยืนยันขอบเขตผ่าน AskUserQuestion แล้ว 3 จุด: delete-character บล็อกถ้ามี dependent, storyboard per-shot picker ทำเต็มรูปแบบ, stable-ID fix ครอบคลุมทั้งแฝดและ variant)

**ยืนยันข้อเท็จจริงจากการสำรวจโค้ดจริงก่อนวางแผน (3 agent วิจัยคู่ขนาน)**:
- Render call ปัจจุบัน (`resolveReferencePortraitUrl` ใน `verticalDramaCharacters.ts`) ไม่เคย fallback ไปใช้ `resolveFaceSourceReferenceForCharacter`'s cross-character URL เลย — ใช้แค่ `getPrimaryPortraitUrl(ตัวเอง)` เท่านั้น แฝด/variant ใหม่ที่ยังไม่มีภาพจึงไม่มี reference ติดไปโดย default
- `createCharacter`/`updateCharacter` ไม่มีทางตั้ง `parentCharacterId`/`variantLabel`/`variantType`/`sharesFaceWithCharacterId` เลย และไม่มี `deleteCharacter` มูเลย — ทุกอย่างมาจาก AI เท่านั้น
- `reconcileCharacterVariantPlan` จับคู่ด้วย string `===` ตรงตัว ไม่ normalize เลย — คำพูด AI เปลี่ยนเล็กน้อยระหว่างรอบ = สร้างซ้ำ
- Roster ที่ส่งให้ skill เห็น: **แฝด** ถูกส่งกลับไปแต่ไม่มี marker บอกว่าเป็นแฝดของใคร, **variant** ถูกกรองออกทั้งหมดตั้งแต่ต้น (ไม่เคยส่งกลับเข้าไปเลย)
- `characterKey` เป็น stable ID ที่มีอยู่แล้วและเสถียร (ระบบ index ด้วย `rowsByCharacterKey` อยู่แล้ว) — แค่ไม่มีช่องให้ AI "อ้างอิงกลับ" ตัวที่มีอยู่แล้วแทนการบรรยายซ้ำ
- Storyboard ไม่มีแนวคิด "แฝด" เลย มองเป็นตัวละครอิสระ 2 คนธรรมดา
- ไม่มีโครงสร้างรองรับ per-shot character reference override เลย (การสลับภาพปัจจุบันเป็น global สลับทั้งซีรีย์) — `required_character_refs: string[]` ต่อช็อตเป็น data shape ที่ถูกต้องอยู่แล้วสำหรับ override แค่ไม่มี mutation ให้แก้มัน และ `characterPortraits` ที่ส่งให้ client เป็น flat ไม่มีข้อมูล grouping ว่าใครเป็น variant ของใคร

## Design — 6 Workstream

### W1: Auto-attach cross-character reference เป็นค่า default
`resolveReferencePortraitUrl` (`verticalDramaCharacters.ts`): เพิ่ม tier ที่ 3 — เมื่อไม่มี `referenceAssetLinkId` override และ `getPrimaryPortraitUrl(ตัวเอง)` คืน `null`, fallback ไปเรียก `getPrimaryPortraitUrl(parentCharacterId ?? sharesFaceWithCharacterId)` ก่อนยอมแพ้ ต้องส่ง character row (หรือแค่ 2 field ที่จำเป็น) เข้าไปในฟังก์ชันเพิ่ม ใช้ที่ทั้ง `generateCharacterImage`/`generateCharacterSheet` เหมือนเดิม

### W2: Manual CRUD สำหรับแฝด/variant ผ่าน UI
**Backend** (`verticalDramaCharacters.ts`) — มูใหม่ 3 ตัว:
- `createCharacterVariant`: `{seriesId, parentCharacterId, variantLabel, variantType: "outfit"|"age_stage", customDescription?, referenceMediaAssetId?}` — สร้าง row ใหม่ `name` เดียวกับตัวหลัก, `characterKey` = `${parentKey}-${slugify(variantLabel)}` dedup (pattern เดียวกับ `reconcileCharacterVariantPlan`, duplicate local function ตาม convention เดิม), เขียน `data.description`/`data.wardrobeRules` (สำหรับ outfit) หรือ `data.age`-ish field (สำหรับ age_stage) ให้ตรงกับ shape ที่ AI-path เขียนอยู่แล้ว — **ไม่ lock หน้า 100% สำหรับ age_stage** (แค่บันทึกอายุเป้าหมายเป็น fact ให้ skill ใช้ตอน generate ทีหลัง ไม่ใช่ hardcode prompt) ถ้ามี `referenceMediaAssetId` เรียก `linkAsset` ต่อท้ายให้อัตโนมัติ (role `primary_portrait`)
- `createCharacterTwin`: `{seriesId, sharesFaceWithCharacterId, name, role?, customDescription?, referenceMediaAssetId?}` — สร้าง character row อิสระใหม่ `characterKey` = `${sourceKey}-twin` dedup, เขียน `data.description` จาก customDescription (ระบุชุด/ลักษณะที่ต่างกันชัดเจน) เชื่อม `linkAsset` เหมือนกัน
- `deleteCharacter`: `{seriesId, characterId}` — เช็คก่อนว่ามี row ใดชี้มาที่ตัวนี้ (`parentCharacterId` หรือ `sharesFaceWithCharacterId` ตรงกับ id นี้) ถ้ามี throw error ชัดเจน ("ต้องลบ variant/แฝดให้หมดก่อน") — ลบสำเร็จเมื่อไม่มี dependent เท่านั้น (ตามที่ยืนยัน) ลบ asset ที่ผูกอยู่ก่อนด้วยถ้า FK ไม่ cascade อัตโนมัติ (เช็ค `onDelete` จริงก่อนตัดสินใจ)
- `detectCharacterVariantsNow`: `{seriesId}` — เรียก `generateCharacterVariantPlan` + `reconcileCharacterVariantPlan` ตรงๆ (เหมือนที่ `runImproveScriptJob` ทำภายใน) คืนสรุปจำนวนที่สร้าง/อัปเดต — **ทำ endpoint นี้ในไฟล์เดียวกับข้างบน แต่รอ W4 (roster เปลี่ยน) เสร็จก่อน เพราะเรียกฟังก์ชันเดียวกัน**

**Frontend** (`VerticalDramaCharacterStockPanel.tsx`): ปุ่ม "เพิ่มลุค"/"เพิ่มแฝด" เปิด dialog ให้กรอกชื่อ/label + วางหรือเลือกภาพอ้างอิง (reuse `resolveMediaAssetForImport` flow เดียวกับที่ reference picker ใช้อยู่แล้ว) + text อธิบายชุด/อายุที่ต้องการ, ปุ่มลบบน variant chip/twin badge (เรียก `deleteCharacter`, แสดง error ชัดถ้าโดนบล็อก), ปุ่ม "ตรวจจับ variant/แฝดตอนนี้" แยกจากปุ่ม improve-script (เรียก `detectCharacterVariantsNow`)

### W3: Reconcile ใช้ stable ID (ครบทั้งแฝดและ variant)
- Roster building (`verticalDramaImproveScript.ts`'s roster-assembly ก่อนส่งเข้า `generateCharacterVariantPlan`): **เลิกกรอง `parentCharacterId != null` ออก** — ส่ง variant row กลับเข้าไปด้วย พร้อม field ใหม่ต่อ entry: `existing_parent_character_key`/`existing_variant_label` (สำหรับ variant), `existing_shares_face_with_character_key` (สำหรับแฝด)
- `skills/vertical-drama-character-variant-planner/schemas/input.schema.json` + `buildCharacterVariantPlannerUserPrompt`: เพิ่ม field ให้ roster entry ตามข้างบน
- `schemas/output.schema.json` + Zod schema ในไฟล์ service: เพิ่ม `existing_character_key` optional ใน `character_plans[].variants[]` และ `twin_detections[].new_characters[]`
- `skill.md`: เพิ่ม instruction — เมื่อ roster entry มี marker แสดงว่าเป็น variant/แฝดที่มีอยู่แล้ว และ AI เห็นว่าคือตัวเดียวกับที่กำลังจะเสนอ ให้ echo `existing_character_key` กลับแทนการบรรยายใหม่ เพิ่ม worked example สาธิต "รันรอบสองแล้วจำได้ว่าเคยเสนอไปแล้ว"
- `reconcileCharacterVariantPlan`: เช็ค `existing_character_key` ก่อนเสมอ (lookup ตรงผ่าน `rowsByCharacterKey` ที่มีอยู่แล้ว) ถ้ามีและ valid ถือว่า match ทันที ไม่ต้อง fallback ไป text-match เก่า — text-match เก่ายังคงไว้เป็น fallback เมื่อไม่มี field นี้ (backward compat)

### W4: ปุ่มตรวจจับแยก (รวมอยู่ใน W2's `detectCharacterVariantsNow` แล้ว — ไม่ต้องแยก workstream เพิ่ม)

### W5: Storyboard รู้จักคู่แฝด
- `verticalDramaStoryboardGeneration.ts` (จุดที่ประกอบ `variants[]` ต่อตัวละครฐานอยู่แล้ว): เพิ่มการรวบรวม twin-pair facts (characterKey คู่ที่ `sharesFaceWithCharacterId` ชี้หากัน) ส่งเป็น fact ใหม่เข้า skill
- `skills/vertical-drama-storyboard-shotgrid/schemas/input.schema.json` + skill.md "Character variant selection": เพิ่ม field รับ twin-pair facts + instruction — ถ้าช็อตมีทั้งคู่แฝดปรากฏพร้อมกัน ต้องเน้นย้ำในคำบรรยาย/prompt ของช็อตว่าสไตล์การแต่งตัวต้องต่างกันชัดเจน (สอดคล้องกับ hard-lock+distinct-styling ที่ character-visual-bible skill ทำไว้แล้วสำหรับภาพ portrait เดี่ยว)

### W6: Per-shot character/variant reference override ใน Storyboard
**Backend**:
- มูใหม่ (`verticalDramaEpisodes.ts`) แก้ `required_character_refs` ของช็อตใดช็อตหนึ่งโดยเฉพาะ (ต้องหาตำแหน่งจริงที่ shot data เก็บ field นี้ในฐานข้อมูลก่อนตัดสินใจ shape ของ patch)
- ขยาย `resolveSeriesCharacterPortraits`/`characterPortraits` ที่ส่งให้ client ให้พก `parentCharacterId`/`variantLabel`/`sharesFaceWithCharacterId` ไปด้วย (ข้อมูลนี้มีอยู่ฝั่ง server แล้วสำหรับ prompt-building แค่ไม่เคยไหลไปถึง client)

**Frontend** (`VerticalDramaStoryboardPanel.tsx`'s character chip แถวต่อช็อต): เพิ่ม picker ให้เลือกตัวละคร/variant อื่นแทนเฉพาะช็อตนี้ (แยกจาก global-swap เดิมที่มีอยู่แล้ว) ใช้ grouping metadata จาก backend ข้างบน

## Work package assignment (ตาม Rule 1b)

**Round 1 (ขนาน — ไฟล์ไม่ทับกัน)**:
- **Phase F1** (ssp-backend): W1 auto-attach fix
- **Phase F2** (ssp-backend): W3 reconcile stable-ID (skill+schemas+reconciliation+roster)
- **Phase F3** (ssp-backend): W5 storyboard twin-awareness
- **Phase F4** (ssp-backend): W6 backend (per-shot override mutation + expose grouping metadata)

**Round 2 (รอ F1+F2 เสร็จ เพราะไฟล์เดียวกัน + เรียกฟังก์ชันที่ F2 แก้)**:
- **Phase F5** (ssp-backend): W2 backend ทั้งหมด (createCharacterVariant/createCharacterTwin/deleteCharacter/detectCharacterVariantsNow) ใน `verticalDramaCharacters.ts`

**Round 3 (ขนาน — คนละไฟล์ frontend)**:
- **Phase F6** (ssp-frontend, รอ F5): W2 frontend (dialog สร้าง/ลบ + ปุ่มตรวจจับ) ใน `VerticalDramaCharacterStockPanel.tsx`
- **Phase F7** (ssp-frontend, รอ F3+F4): W6 frontend (per-shot picker) ใน `VerticalDramaStoryboardPanel.tsx`/`VerticalDramaEpisodePage.tsx`

ทุก phase ตรวจสอบเองก่อนปิดงาน (diff review + `pnpm check` + tests) — conductor ตรวจอิสระทุก phase ไม่เชื่อรายงาน agent อย่างเดียว ตามวินัยเดิมทั้งเซสชัน

## Verification
- `pnpm check` + test ที่เกี่ยวข้องหลังแต่ละ phase
- Manual: สร้างแฝดเองผ่าน UI พร้อมภาพ+คำอธิบายชุด แล้วเช็คว่า storyboard มองเป็นคนละตัวจริง, ลบตัวหลักที่มี variant ต้องถูกบล็อก, กดตรวจจับ variant/แฝดสองรอบติดกันบนซีรีย์เดิมต้องไม่สร้างซ้ำ (เดิมสร้างซ้ำ), เลือกภาพ character แยกรายช็อตใน storyboard แล้วช็อตอื่นต้องไม่ถูกกระทบ
