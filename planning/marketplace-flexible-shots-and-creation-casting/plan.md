# Marketplace Auto Review — Flexible Shot Count + Creation-Time Drama Casting

สถานะ: **IMPLEMENTED & DEPLOYED** (2026-07-30) — W1-W3 ครบ, 355/355 tests ผ่าน, live บน smartaihub.app
บันทึกสำคัญจาก W1: พบบั๊กแฝง — `resolveMarketplaceAutoReviewReferenceAnchors` สร้างผลลัพธ์จาก field list ชัดแจ้ง ทำให้ `shotDurationSeconds` (และ `shotCount` ใหม่) ถูกตัดทิ้งเงียบ ๆ ก่อนถึง DB — แก้แล้ว (ถ้าไม่เจอ ฟีเจอร์ duration ที่ส่งไปก่อนหน้าจะไม่เคยทำงานจริงใน production)

## Gap-audit หลังส่งมอบ (2026-07-30 รอบ 2) — เจอ 2 gap จริง แก้+deploy แล้ว

- **G1 — solo named cast หายจาก LLM prompt:** LLM-first init ยิงเมื่อ cast ≥ 1 แต่ `castRosterBlock` และ userMessage ใส่ cast เฉพาะโหมด 2 คน → เลือกตัวละคร VD 1 ตัวแล้วบทยังเป็น narrator นิรนาม (ผิด requirement "1 ตัว = พูดเดี่ยวในนามตัวละครนั้น") แก้: เพิ่ม solo presenter block (ชื่อ/descriptor เป็น fact, การพูดเป็นวิจารณญาณโมเดล — skill-first) + ส่ง cast ใน userMessage เมื่อ ≥ 1
- **G2 — read projection ตัด field ตัวละครทิ้ง:** `getStagedAutoReviewCheckpointState` map manifest เหลือแค่ `{index,url,role,label,active}` ทั้งที่ persist ครบ → พาแนลเสีย VD read-only lock และ**การแก้ manifest ใด ๆ ในพาแนลจะ round-trip ค่าที่ถูกตัดกลับไปทับ** ทำลาย characterRole/vdCharacterId เงียบ ๆ (คลาสเดียวกับ taught-not-wired: เขียนครบแต่อ่านไม่ครบ) แก้: ส่ง 6 field ผ่าน projection ครบ
- ตรวจแล้วไม่ใช่ gap: hyperframes enqueue ส่ง characterCast+referenceAnchors ครบ; `initializeStaged...` อยู่ใน background init path (LLM call ไม่บล็อก request); persist layer เก็บ field ครบอยู่แล้ว
- ข้อจำกัดที่รับรู้ (ไม่แก้): กล่อง estimate หน้าสร้าง ("สร้างภาพ 9 งาน") มาจาก legacy hyperframes preview — ไม่รู้จัก staged shotCount ใหม่/auto จึงแสดง 9 เสมอ; เป็น cosmetic เพราะเครดิตจริงคิดต่อภาพที่สร้าง
กฎบังคับ: skill-first เสมอ (`project_marketplace_staged_skill_first`) — เนื้อหา/บท/จำนวน beat เป็นวิจารณญาณของ LLM, TS ส่ง facts + validate เท่านั้น

## คำสั่งผู้ใช้ (สรุป)

1. **เลือกตัวละครจาก Drama Series ได้ตั้งแต่หน้าสร้าง project** (`/marketplace/auto-review/new/:productId`) — ก่อนกด "สร้าง Auto Storyboard Review" ไม่ใช่แค่ในหน้ารีวิวหลังสร้าง run แล้ว และเนื้อหาที่สร้างต้องสอดคล้อง: 1 ตัว = บทพูดเดี่ยว, 2 ตัว = บทสนทนา 2 คน ทั้งตอนคิดเรื่องและตอนคิด prompt
2. **จำนวนช็อตยืดหยุ่น** — เลือกได้ 7–30 ช็อต + ค่า default "อัตโนมัติ" ให้ LLM เลือกจำนวนช็อตตามเนื้อหา โดยยึด "ความยาวต่อช็อต" เป็นเกณฑ์; ความยาวต่อช็อตขยาย cap เป็น 30 วินาที (เผื่อโมเดลวิดีโอรุ่นใหม่ 15/24/30s)
3. ทุกอย่างข้างต้นเป็น skill-first ห้าม TS ต่อเติมเนื้อหา

## ข้อเท็จจริงจากโค้ด (ตรวจแล้ว)

- ตัวละครตอนสร้าง project ไหลผ่าน `referenceAnchors.characterImageUploadKey`/`characterAnchor` — **ไม่เคยกลายเป็น `customReferenceManifest`** (manifest ถูกเขียนครั้งแรกโดย mutation ของหน้ารีวิวเท่านั้น ที่ `...StagedCheckpointRouterService.ts:2697`) → cast จึงว่างจนกว่าผู้ใช้จะไปเพิ่มในหน้ารีวิว = ช่องโหว่ที่ข้อ 1 ต้องปิด
- 9 ช็อต hardcode ที่: `stagedContracts.ts:150` (`.length(9)`), `:246-250` (`validateNineShotContract`), planner `:709,1027,1171,1186` (beats table 9 แถว + Zod LLM `.length(9)`), Panel `:883-884` (finalOrder === 9), workflow step counters "/9"
- `shotDurationSeconds` cap 20 (router `:885`), UI options 5/8/10/15
- `shotCount` เดิม: top-level 7–9 (legacy), hyperframes overrides `autoPlan.ts:96,219` 7–9
- **Legacy sequential pack ผูก 9 ช็อตแน่น** (skill `product-review-sequential-storyboard` = 9-shot pack + validate) — ขยาย legacy เป็น 30 คือคนละโปรเจกต์; ขอบเขตนี้ทำเฉพาะ **staged** และ server ต้อง clamp เป็น 9 พร้อม warning ถ้า run เป็น legacy
- Story arc รอบแรกยังเป็น deterministic (`buildStagedStoryArcPlan`); LLM ใช้เฉพาะ redraft — ขัด skill-first เมื่อมี cast (บทสนทนาเป็น creative) → เมื่อ cast ≥ 1 หรือ shotCount=auto ให้ `generateStagedStoryArcPlanWithLLM` เป็น primary, deterministic เป็น bounded fallback

## งานแบ่ง 3 wave (ทำตามลำดับ ห้ามขนาน — ไฟล์ทับกัน)

### W1 — backend: variable shots + duration 30 (ssp-backend, sonnet)
- `stagedContracts.ts`: `.length(9)` → `.min(1).max(30)`; `validateNineShotContract` → รับ `expectedCount` (คง export ชื่อเดิมเป็น wrapper กันไฟล์อื่นพัง), duration ยอมรับ 4–30
- Router: `referenceAnchors.shotCount: z.union([z.literal("auto"), z.number().int().min(7).max(30)]).optional()` (absent = 9 เดิม = byte-compatible), `shotDurationSeconds` max 20→30
- Planner: `buildStagedStoryArcPlan` รับ `shotCount` — beats N≠9 ให้ **วน/ยืดตาราง beats อย่าง deterministic** (fallback facts เท่านั้น ไม่แต่งเนื้อหาใหม่); LLM path: Zod `.length(9)` → `.min(N).max(N)` เมื่อระบุ, `auto` = `.min(7).max(30)` + system prompt บอกเกณฑ์ "จำนวนช็อต = เนื้อหา ÷ ความยาวต่อช็อต (LLM ตัดสิน)"
- LLM-first story: `planAndMetadataFromRun`/init เรียก LLM planner ก่อนเมื่อ (cast ≥ 1) หรือ shotCount = auto; ล้มเหลว → deterministic + reason code `staged_story_skill_fallback` (additive)
- Pipeline/checkpoint router: จุดที่นับ/วน 9 ให้ใช้ `plan.shots.length`
- Legacy guard: ถ้า architecture ไม่ใช่ staged → clamp 9 + warning
- Skills: `marketplace-auto-review-story-arc` สอน variable count + auto-count-by-duration (แก้ทั้ง twins byte-identical)
- Tests: N=7/9/12/30, auto path, duration 24/30 snap, legacy clamp

### W2 — backend: creation-time casting (ssp-backend, sonnet — หลัง W1 merge)
- `startAutoReview` (+ hyperframes twin ถ้ามี field เทียบเท่า): input ใหม่ `characterCast?: Array<{characterName, characterRole: host|guest, vdCharacterId?, vdSeriesId?, portraitAssetId?, url}>` (max 2, `.strict()` ระวังตาม `project_marketplace_motion_direction`)
- Server seed `customReferenceManifest` ตอนสร้าง run จาก `characterCast` + uploaded characterAnchor (role="character" + fields ครบตามที่ `deriveStagedCastFromManifest` อ่าน) → ทุกอย่าง downstream (conversation mode/prompts) ทำงานเองทันทีตั้งแต่ plan แรก
- portraitAssetId → resolve URL ตอน seed (pattern `getPrimaryPortraitUrl`/`resolveReferenceUrl` — ดู plan two-character §3.7)
- Tests: 0/1/2 ตัว → manifest + conversationMode ถูกต้องตั้งแต่ init

### W3 — frontend (ssp-frontend, sonnet — หลัง W2)
- หน้าสร้าง project (`MarketplaceCaptureProductDetail.tsx` ส่วน Character/Presenter): ปุ่ม "🎬 เลือกจาก Drama Series" **reuse `MarketplaceDramaCharacterPickerDialog` เดิม** (จำกัด 2, flag-gated เหมือนหน้ารีวิว) → state `characterCast` → ส่งเข้า mutation; badge "👥 สนทนา 2 คน / 🎤 เดี่ยว" ก่อนปุ่มสร้าง
- Advanced overrides: จำนวนช็อต → "อัตโนมัติ (แนะนำ)" + 7–30 (dropdown ช่วง สmart ไม่ใช่ 24 ตัวเลือกแบน เช่น auto/7/8/9/10/12/15/18/21/24/27/30); ความยาวต่อช็อต เพิ่ม 20/24/30 พร้อม caption เดิม (ระบบ snap ตามโมเดล)
- Panel: finalOrder validation + counters ใช้ `shots.length` แทน 9
- Tests + สุดท้าย: `npm run build:deploy` + restart (server เปลี่ยน)

## ความเสี่ยงหลัก

| เสี่ยง | กัน |
|---|---|
| run เก่า 9 ช็อตพังเพราะ schema เปลี่ยน | `.min(1).max(30)` ยอมรับ 9 เดิม; absent shotCount = 9 |
| legacy path รับ >9 ไม่ได้ | server clamp + warning; UI ส่งได้แต่ staged เท่านั้นที่ใช้จริง |
| LLM-first ทำ init ช้า/แพง | มี fallback ต่อชั้น + จำกัดเฉพาะ cast≥1 หรือ auto |
| beats fallback N≠9 กลายเป็น "แต่งเนื้อหา" | ยืดแบบ deterministic ล้วน (วนตาราง) + ระบุใน comment ว่าเป็น bounded fallback |
| skill twins drift | diff check ทุกครั้ง |
