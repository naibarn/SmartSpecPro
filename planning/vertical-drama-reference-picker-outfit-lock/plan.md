# ตัวเลือกภาพอ้างอิง (reference picker) + แก้บั๊กไม่ล็อกชุดตอนมีภาพอ้างอิง

## Context (บริบท)

ผู้ใช้สังเกตว่าภาพ "10-POSE LIBRARY SHEET" ที่เพิ่งสร้าง (ตัวละคร "ฝ้าย" ซีรีย์ #6) หน้าตาไม่เหมือนภาพอ้างอิงเลย และสงสัยว่าระบบอ้างอิงภาพผิด ต้องการ 2 อย่าง: (1) ให้เห็นภาพอ้างอิงหลักในหน้าสร้างตัวละคร และเลือกได้เองถ้ามีหลายภาพ/หลาย character/หลายชุด (2) หลังจากนั้นชี้เพิ่มว่าจุดที่ขาดจริง ๆ คือ **การล็อกชุดเสื้อผ้า** ตอนสร้าง character sheet — ไม่ควรให้ AI คิดชุดใหม่เอง

**ตรวจสอบด้วยข้อมูลจริงก่อนสรุป (ไม่เดา)**:
- Query audit log + DB ของ transaction จริง (traceId `9ChpdY8lFwk0XN-g4GycO`, asset id 85, mediaAsset 91) พบว่า character 24 (ฝ้าย) มีภาพ `primary_portrait` แค่ใบเดียว (approved) — ระบบดึงภาพนั้นไปแนบถูกต้องแล้ว ไม่ใช่บั๊กเลือกภาพผิดในเคสนี้ (`getPrimaryPortraitUrl` ทำงานถูกตามที่ออกแบบ)
- แต่ตรวจโค้ดจริงพบ **บั๊กที่แท้จริงและเป็นการละเมิดกฎ skill-first อีกจุดหนึ่ง**: ทั้ง `generateCharacterImage` (บรรทัด 1352) และ `generateCharacterSheet` (บรรทัด 1667) ใน `server/routers/verticalDramaCharacters.ts` มีประโยคต่อท้าย prompt แบบ **hardcode ในโค้ด** (ไม่ผ่าน skill): `"Use the attached reference image as this character's exact identity — match face shape, skin tone, hairstyle, ... ; do not alter identity."` — ประโยคนี้ระบุ face shape/skin tone/hairstyle **แต่ไม่มีคำว่า outfit/clothing/accessories เลย** เป็นประโยคที่อยู่ท้ายสุดใกล้ภาพแนบมากที่สุด (โมเดลภาพมักให้น้ำหนักกับส่วนนี้สูง) จึงเป็นสาเหตุที่สมเหตุสมผลที่สุดของอาการชุดเพี้ยน
- ยืนยันเพิ่มว่า section "Face reference locking" ใน skill.md (ที่มีอยู่แล้ว) ใช้เฉพาะเคส variant/twin ข้าม character (`face_source_reference`) เท่านั้น — ตัวละคร "ฝ้าย" ไม่ใช่ variant/twin จึงไม่ได้รับการล็อกจาก section นั้นเลย จุดเดียวที่ล็อกตัวตนตอนมีภาพอ้างอิงของตัวเองคือประโยค hardcode ที่ขาด outfit นี้เท่านั้น
- (ค้นพบเพิ่มเติมจาก Plan agent ระหว่างออกแบบ reference picker) จุดที่ดึงภาพอ้างอิงจริงตอน render (`getPrimaryPortraitUrl(characterId)`) **ไม่เคยใช้ผลจาก `resolveFaceSourceReferenceForCharacter` เลย** — แปลว่า variant/twin ตัวใหม่ที่ยังไม่มีภาพของตัวเอง จะไม่มีภาพแนบอ้างอิงเลยตอน render ครั้งแรก (มีแค่ข้อความ prompt บอกว่า "เหมือนตัวละคร X" แต่ไม่มีภาพแนบจริง) — เป็นช่องว่างเดิมที่มีอยู่แล้ว ไม่ใช่สิ่งที่งานนี้สร้างขึ้น แต่ reference picker ที่จะสร้างนี้ทำให้ผู้ใช้ "แก้เอง" ได้เป็นครั้งแรก (เลือกภาพของตัวหลัก/twin source มาแนบ) โดยไม่ต้องแตะพฤติกรรม default เดิม

## Design

### ส่วน A: Reference picker (แสดง + เลือกภาพอ้างอิงได้)

**Backend**
1. `server/services/verticalDramaCharacterStock.ts` — เพิ่ม error reason `"asset_wrong_role"` และ method ใหม่ `getReferenceImageUrlByAssetLinkId(owner, assetLinkId)`: scope แค่ `(tenantId, userId, seriesId)` **ไม่ scope ด้วย characterId** (ตั้งใจ — เพื่อให้ variant/twin เลือกภาพของตัวหลัก/twin source ได้) ใช้ `loadOwnedRow` เดิม, throw `asset_not_found` ถ้าไม่เจอ/ไม่มี media, throw `asset_wrong_role` ถ้า `role !== "primary_portrait"` (กันไม่ให้ asset ที่ไม่มีใบหน้า เช่น color_palette หลุดมาเป็น reference ได้)
2. `server/routers/verticalDramaCharacters.ts` — เพิ่ม `referenceAssetLinkId: z.string().min(1).optional()` ใน input ของทั้ง `generateCharacterImage` และ `generateCharacterSheet` เมื่อมีค่า ใช้ `getReferenceImageUrlByAssetLinkId` แทน `getPrimaryPortraitUrl` เดิม (ผ่าน `mapStockError` เดิมที่มีอยู่แล้ว รองรับ reason ใหม่โดยอัตโนมัติผ่าน default branch) เมื่อไม่มีค่า พฤติกรรมเดิมทุกประการ (auto-resolve เหมือนเดิม)

**Frontend** (`client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx`)
3. State ใหม่ `referenceOverrideByCharacter: Record<characterId, assetLinkId>` (in-memory, ไม่ persist, เก็บแยกต่อตัวละคร ไม่ reset เวลาเปลี่ยนตัวละคร — ตาม pattern เดิมของไฟล์นี้)
4. Helper บริสุทธิ์ 2 ตัวใหม่ (unit-test ได้, วางใกล้ `resolveCharacterCardPortraitAsset`):
   - `buildReferenceCandidates(assets, character, charactersById)` — รวมภาพ `primary_portrait` ของตัวละครเอง **ทั้งหมด** (ไม่ dedupe เหลือ 1) บวกกับภาพของตัวหลัก/twin-source ถ้าเป็น variant/twin (label "จาก {ชื่อ}")
   - `resolveDefaultReferenceAssetLinkId(assets, characterId)` — mirror ลำดับเดียวกับ `getPrimaryPortraitUrl` ฝั่ง server (approved ก่อน, ใหม่สุดรองลงมา) ให้ default selection ตรงกับพฤติกรรม auto เดิมเป๊ะ
5. UI: แถบ thumbnail เล็กแนวนอนเหนือปุ่ม generate (ก่อน `{!readOnly && (...)}` แต่ render ให้เห็นเสมอแม้ readOnly — เพื่อความโปร่งใส แค่คลิกเลือกไม่ได้ตอน readOnly) มี ring แสดงตัวที่เลือกอยู่ กด thumbnail อื่นเพื่อ override
6. ส่ง `referenceAssetLinkId` เข้า `generateImageMutation`/`generateSheetMutation` เมื่อมีการเลือกไว้ในตัวละครนั้น

### ส่วน B: แก้บั๊กไม่ล็อกชุด (skill-first fix)

**หลักการ**: ย้ายประโยคล็อกตัวตนที่ hardcode อยู่ในโค้ด router ไปให้ skill เป็นคนเขียนแทน (ตามกฎ skill-first เดิมของเซสชัน) และให้ระบุ outfit/accessories/shoes ชัดเจนด้วย — โค้ดมีหน้าที่บอก "fact" ว่ามีภาพอ้างอิงติดอยู่หรือไม่เท่านั้น ไม่ใช่แต่งประโยคเอง

1. **เปลี่ยนลำดับการทำงาน** ใน `generateCharacterImage`/`generateCharacterSheet`: ต้อง resolve `referencePortraitUrl` (auto หรือ override จากส่วน A) **ก่อน** เรียก `generateCharacterVisualPrompts` (สลับจากลำดับเดิมที่ทำทีหลัง)
2. `server/services/verticalDramaCharacterImageGeneration.ts` — เพิ่ม `hasOwnReferenceImage?: boolean` ใน `GenerateCharacterVisualPromptsParams`, ส่งเข้า skill เป็น `has_own_reference_image: true/false` ใน `buildCharacterVisualPromptsUserPrompt`'s payload
3. `skills/vertical-drama-character-visual-bible/skill.md` — เพิ่ม instruction: เมื่อ `has_own_reference_image` เป็น true ทุก prompt field ที่ authored ต้องระบุชัดว่าภาพที่แนบมาคือตัวตนจริง **รวม outfit/clothing/accessories/shoes ด้วยเสมอ** (ไม่ใช่แค่ face/skin/hair) เขียนเป็นร้อยแก้วธรรมชาติ (ตาม convention เดิมของไฟล์ ไม่ใช่ copy ประโยคซ้ำ) เพิ่ม worked example อย่างน้อย 1 ตัวอย่าง
4. `server/routers/verticalDramaCharacters.ts` — **ลบ** ประโยค hardcode "Use the attached reference image..." ทั้ง 2 จุด (บรรทัด 1352, 1667) ใช้ `promptResult.portraitPrompt`/`promptResult.sheetPrompt`/`promptResult.turnaroundPrompt` ตรงๆ เป็น render prompt (skill เขียนล็อกไว้ให้แล้วเมื่อจำเป็น)
5. อัปเดต `verticalDramaCharacterVisualBible.skillContent.test.ts` + test อื่นที่เคย assert ข้อความ hardcode เดิม (grep หา "Use the attached reference image" ใน test files)

## Work package assignment

- **Phase D1** (ssp-backend): ส่วน A ข้อ 1-2 — schema + router สำหรับ reference picker (ทำก่อน เพราะ B ต้องใช้ referencePortraitUrl ที่ resolve แล้วจากตรงนี้)
- **Phase D2** (ssp-backend, รอ D1): ส่วน B ทั้งหมด — ย้าย hardcode ไปที่ skill + ลบประโยคเดิม + สลับลำดับ resolve reference ก่อนเรียก skill (แก้ทับซ้อนไฟล์เดียวกับ D1 จึงต้องรอ ไม่รันคู่)
- **Phase D3** (ssp-frontend, รอ D1+D2): ส่วน A ข้อ 3-6 — UI reference picker

ทุก phase ตรวจสอบเองก่อนปิดงาน (diff review + `pnpm check` + tests) — conductor ตรวจอิสระทุก phase ไม่เชื่อรายงาน agent อย่างเดียว ตามวินัยเดิมทั้งเซสชัน

## Verification

- `pnpm check` + test ที่เกี่ยวข้องหลังแต่ละ phase
- Manual (ตามที่ Plan agent ระบุไว้): ตัวละครมีภาพเดียว → เลือกอัตโนมัติเหมือนเดิม, ตัวละครมีหลายภาพ → เลือก override ได้จริงและ audit log ยืนยัน URL ตรงกับที่เลือก, variant ที่ยังไม่มีภาพเอง → เห็นภาพของตัวหลักให้เลือกได้ (แก้ช่องว่างเดิม), ทดสอบส่ง assetLinkId ข้าม tenant/role ผิดต้องถูกปฏิเสธ
- สร้าง character sheet ใหม่ 1 ใบหลังแก้ส่วน B แล้วตรวจ prompt จริงที่ส่งให้โมเดลภาพ (audit log) ว่ามีคำสั่งล็อก outfit ชัดเจน ไม่ใช่แค่ face/skin/hair เหมือนเดิม

## สถานะ: เสร็จสมบูรณ์ (2026-07-11) — ตรวจสอบอิสระครบทุก Phase

- **Phase D1** (backend foundation) — ตรวจสอบแล้ว: `getReferenceImageUrlByAssetLinkId`
  scope ถูกต้อง (tenant/user/series เท่านั้น ไม่จำกัด characterId ตามที่ตั้งใจ),
  role check ปฏิเสธ asset ที่ไม่ใช่ primary_portrait ก่อนเช็คอย่างอื่นเสมอ,
  `resolveReferencePortraitUrl` helper ใช้ร่วมกัน 2 endpoint ถูกต้อง, hardcoded
  suffix เดิมไม่ถูกแตะตามที่สั่ง (เก็บไว้ให้ D2 แก้), typecheck 0 errors, 97/97 tests
- **Phase D2** (แก้บั๊กล็อกชุด) — ตรวจสอบแล้ว: ลำดับโค้ดสลับถูกต้อง (resolve
  reference ก่อนเรียก skill), `hasOwnReferenceImage`/`has_own_reference_image`
  ไหลผ่านครบทุกจุด, ประโยค hardcode เดิม 2 จุดถูกลบจริง ไม่มี hardcode ทดแทน,
  เนื้อหา skill.md คุณภาพสูง (มี "Bad example" อ้างอิงบั๊กจริงที่วินิจฉัยไว้,
  worked example ล็อก outfit/accessories/shoes ครบทั้ง 5 field, จัดการ
  กรณีซ้อนกับ face_source_reference ถูกต้อง), เพิ่ม `has_own_reference_image`
  เข้า input.schema.json เองให้ครบ (agent ทิ้งไว้เป็น doc gap เล็กน้อย),
  typecheck 0 errors, 185/185 tests
- **Phase D3** (UI reference picker) — ตรวจสอบแล้ว: helper 2 ตัวตรงตาม design,
  UI วางตำแหน่งถูกต้อง (เหนือปุ่ม generate, แสดงเสมอแม้ readOnly เพื่อความ
  โปร่งใส), wiring เข้า mutation ทั้ง 2 จุดถูกต้อง (ส่ง referenceAssetLinkId
  เฉพาะเมื่อมีการ override เท่านั้น), typecheck 0 errors, 38/38 tests

**ผลตรวจสอบสุดท้ายรวม**: `pnpm check` 0 errors, full vertical-drama regression
sweep (176 ไฟล์/3009 tests) ตรงกับ baseline เดิมเป๊ะ — 2994 ผ่าน, 15 fail
(ทั้งหมดเป็นปัญหาเดิมที่ไม่เกี่ยวข้อง ไม่มี regression ใหม่จากงานนี้เลย)

ผลลัพธ์: ผู้ใช้เห็นภาพอ้างอิงตัวตนที่จะใช้ก่อนกดสร้าง เลือกภาพอื่นได้ถ้ามีหลายภาพ
หรือเป็น variant/twin ที่อยากอ้างอิงข้ามตัวละคร และบั๊กที่แท้จริง (ไม่ล็อกชุด
ตอนมีภาพอ้างอิง) ถูกแก้ที่ต้นตอผ่าน skill ตามกฎ skill-first ของโปรเจกต์
