# Marketplace Auto Review — Two-Character Conversation Review

สถานะ: **IMPLEMENTED & VERIFIED** (2026-07-29) — P0-P5 ทั้งหมด + UI/UX audit, 307/307 tests ผ่าน
วันที่: 2026-07-29

## UI/UX completeness audit (รอบ 3)

ตรวจด้วย 3 reviewer agent คู่ขนาน (UX flow, accessibility WCAG 2.1 AA, responsive/touch)
เจอ 24 gap ที่ตรวจสอบจริงจากโค้ด แก้ครบ 23 รายการ เหลือ 1 รายการที่ไม่แก้เพราะไม่มีข้อมูลจริง
รองรับ (B1: duration caveat เจาะจงต่อโมเดล — component ไม่มี per-model duration data
ให้ใช้ จึงคงข้อความทั่วไปไว้ ไม่สร้างข้อมูลปลอมขึ้นมา)

**สิ่งที่สำคัญที่สุดที่พบ:** QC warnings (`assessStagedPlanAdherence`) ที่เพิ่งผูกไว้ในรอบ gap-audit
ก่อนหน้า **เขียนไปผิดที่** — `upsertStage`'s `statusDetail` ไปลง `marketplaceAutoReviewStages`
table แต่หน้าจอ staged UI จริง (`getStagedAutoReviewCheckpointState`) ไม่เคยอ่านตารางนั้นเลย
อ่านแค่ `checkpoints: projectStagedCheckpoints(reviewCheckpoints)` เท่านั้น — แก้โดยเพิ่ม
`adherenceWarnings?: string[]` เป็น field ใหม่บน `HumanApprovalCheckpointV1Schema` ตรง ๆ
แล้ว render จริงในพาแนล (เคสนี้คือ taught-not-wired ซ้อน 2 ชั้น — เรียกฟังก์ชันแล้ว แต่เขียนผลลง sink ที่ไม่มีใครอ่าน)

**High:** ชื่อตัวละครไม่เตือนว่าจะกลายเป็น "Person N" ในบทพูดถ้าไม่ตั้งชื่อ,
QC warnings ไม่แสดงในหน้าจอเลย (ดูด้านบน), picker dialog บนมือถือจอเตี้ยปุ่มยืนยันหลุดจอ,
checkbox เลือกตัวละคร touch target เล็กเกินไปและกดได้แค่จุดเดียว

**Critical/High (a11y):** ปุ่มลบ 🗑️ ไม่มี aria-label, contrast fail 3 จุด (2.56:1, 3.86:1),
disabled row ใช้ opacity ทับ text ที่ contrast ต่ำอยู่แล้วซ้ำ

ทดสอบเพิ่ม 60 tests ใหม่ (client 247 + server เพิ่ม 1) รวมทุกอย่าง **307/307 ผ่าน**

## Gap-audit pass (หลังส่งมอบครั้งแรก)

ตรวจซ้ำทุก Wave พบ 1 gap จริง (taught-not-wired) และแก้แล้ว:
- **`assessStagedPlanAdherence`** (QC ฝั่ง staged, §3.3) ถูกสร้างไว้ตั้งแต่ Wave 1 แต่**ไม่เคยถูกเรียกใช้ที่ไหนเลย** — ตรวจด้วย `grep` ยืนยันว่าไม่มี call site ใด ๆ นอกไฟล์ตัวเอง แก้โดย wire เข้า 3 จุดใน `marketplaceAutoReviewStagedPipelineService.ts`: `initializeStagedMarketplaceAutoReviewRun`, `redraftStagedMarketplaceAutoReviewRun`, และจุด re-block ใน `advanceStagedMarketplaceAutoReviewRun` — ทุกจุด merge `warnings` เข้า `concept_story` stage's `statusDetail.reasonCodes` (fail-open ตามเดิม ไม่ block run) เพิ่ม 6 tests ตรงให้ฟังก์ชันนี้ (เดิม 0% coverage)

ตรวจแล้วไม่ใช่ gap (เป็นการตัดสินใจที่ถูกต้องอยู่แล้ว หรือแยกขอบเขตชัดเจน):
- EN storytelling beats (STORYTELLING_BEATS_EN) ครบทั้ง 8 โครงสร้างแล้วตั้งแต่ Wave 1 ไม่ใช่ fallback ธรรมดา
- Redraft มี 2 เส้นทาง (legacy dispatcher deterministic vs staged-router LLM-based) — ทั้งคู่ผูก cast แล้ว และ path LLM ไหลกลับผ่าน advance-loop re-block เดียวกัน จึงได้ QC warning ครบโดยไม่ต้องแก้ที่ router
- `productChildRelated: false` hardcode ใน guardian-presence directive — เป็น pre-existing legacy limitation ที่มี comment บอกไว้ชัดเจนว่า "out of scope" คนละ domain กับบทสนทนา (minor-safety, มี spec แยกอยู่แล้ว) ไม่แตะ
- Picker UI ต่อ `verticalDramaSeries.list` + `useTenantFeatureFlag` จริง ไม่ใช่โค้ดลอย — ตรวจ grep ยืนยัน end-to-end
- `shotDurationSeconds` field name ตรงกันทุกชั้น (UI → referenceAnchors → router schema → pipeline read) — ตรวจแล้ว
Pipeline ที่เกี่ยวข้อง: **STAGED** (`staged_two_skill_v2`) เท่านั้น — legacy/sequential ไม่แตะ

---

## 1. Problem statement

ผู้ใช้อัปโหลดภาพตัวละคร 2 คน (ผู้หญิง + ผู้ชาย) เข้า Marketplace Auto Review
โดยคาดหวังว่าจะได้รีวิวสินค้าแบบ **สองคนคุยกัน** ทั้งในภาพและวิดีโอ
แต่ระบบปัจจุบันให้ผลเป็น "คนเดียวพูดคนเดียว" เสมอ

เพิ่มเติมจากผู้ใช้: ต้องการให้เลือกตัวละครจาก **Vertical Drama series** ที่มีอยู่แล้ว
มา 2 ตัว ให้คุยกันโดย**ใช้ชื่อจริงของตัวละครในเรื่องนั้น**

ข้อบังคับที่ต้องคงไว้: **โครงสร้างการเล่าเรื่อง** (`storytellingStructure`)
และ **โทน** (`reviewTone`) ที่ผู้ใช้เลือก ต้องยังถูกบังคับและสอดคล้องกับบทสนทนา

---

## 2. Root cause — ยืนยันจากโค้ดแล้ว (ไม่ใช่การเดา)

### 2.1 ระบบไม่มีแนวคิด "จำนวนตัวละคร" เลย
ทุกจุดเช็คแค่ boolean `length > 0`:
- `marketplaceAutoReviewStoryArcPlanner.ts:453` — `const hasCharacter = characterItems.length > 0`
- `marketplaceAutoReviewStagedPipelineService.ts:1261` — `if (characterItems.length > 0)`
- `marketplaceAutoReviewStagedCheckpointRouterService.ts:1276` — `.find(role === "character")` = ตัวแรกตัวเดียว

ไม่มีโค้ดใดในระบบที่ branch ระหว่าง 1 vs 2+ ตัวละคร

### 2.2 `dialogue` เป็น string เดียว — โครงสร้างข้อมูลรองรับได้แค่คนพูดคนเดียว
`marketplaceAutoReviewStoryArcPlanner.ts:16-23`
```ts
export type StagedStoryArcShot = {
  shotId: number; title: string; storySummary: string;
  visualSummary: string;
  dialogue: string;        // :21  ← หนึ่ง string ไม่มี speaker
  durationSeconds: 10;     // :22  ← literal type
};
```
Zod ของ LLM path: `dialogue: z.string()` (`:690`)
Persisted schema: `stagedContracts.ts:97` — `dialogue: z.string()`
**บทสนทนาสองคนแสดงออกไม่ได้เลยในระดับ data model** — นี่คือ blocker หลัก

### 2.3 Prompt ภาพอ้างถึงตัวละครแค่ตัวเดียว
`marketplaceAutoReviewStagedPipelineService.ts:1261-1269` — เมื่อมีตัวละคร ระบบ append
directive ที่ระบุ **แท็กเดียว** `@Image${productCount + 1}` (เอกพจน์) เหมือนกันทั้ง 9 ช็อต
→ ภาพตัวละครคนที่ 2 **ถูกแนบไปเป็น reference แต่ไม่เคยถูกอ้างถึงใน prompt เลย**

### 2.4 Dead code: multi-character ที่เขียนไว้แล้วไม่เคยทำงาน
`marketplaceAutoReviewStagedPipelineService.ts:1090` เรียก
`compileStagedImagePrompt({ plan, shot })` — **ไม่ส่ง `customManifest`**
ทำให้ `marketplaceAutoReviewStoryArcPlanner.ts:445` ได้ `activeItems = []`,
`hasCharacter = false` เสมอ และโค้ด multi-tag ที่มีอยู่แล้วที่ `:460-462`
(`characterItems.map((_, i) => '@Image${productCount + i + 1}')`) เป็น dead code

### 2.5 Metadata ต่อตัวละครถูกทิ้ง
`StagedCheckpointReviewPanel.tsx:611-613` เก็บได้แค่ `label` = ชื่อไฟล์
Wire contract (`marketplaceCapture.ts:1899-1905`) มีแค่ `{index, url, role, label, active}`
`marketplaceAutoReviewStagedPipelineService.ts:1230` แปลงเป็น `string[]` ของ URL
→ **ไม่มี ชื่อ / เพศ / บทบาท ที่ไหนเลย** ตัวละครเป็น blob นิรนาม
(path ที่ใช้ skill map `label` ไปเป็น `angleLabel` — field ผิดความหมายสำหรับคน)

### 2.6 Story planner ไม่รู้จักตัวละครเลย
`marketplaceAutoReviewStagedPipelineService.ts:817-827` เรียก `buildStagedStoryArcPlan`
โดย**ไม่ส่ง manifest / ไม่ส่งข้อมูลตัวละครใด ๆ**
LLM system prompt (`marketplaceAutoReviewStoryArcPlanner.ts:660-682`) มีแค่
productName, description, structure, tone — **zero character input**

### 2.7 Video prompt ไม่มี audio block เลย
`buildStagedVideoPrompt` (`marketplaceAutoReviewStoryArcPlanner.ts:517-568`)
วาง dialogue เป็น raw text (`:547`) โดยไม่มี "ใครพูด" / ไม่มี voice descriptor /
ไม่มีคำสั่ง lip-sync → Veo เดาเอาเองแบบสุ่ม
(หมายเหตุ: `VOICE CONSISTENCY LOCK` ที่บังคับ "narrator เดียว" อยู่ที่ **legacy path
เท่านั้น** `marketplaceAutoReviewService.ts:5905` — staged ไม่เคยใช้ จึงไม่ขวางทางเรา)

### 2.8 🔴 BUG อิสระ: duration 10 วินาที ไม่ตรงกับความสามารถของโมเดล
`marketplaceAutoReviewStagedPipelineService.ts:1567` ส่ง `duration: 10` ตายตัว
แต่โมเดล default `veo3/generate-veo-3-video-lite`
(`marketplaceAutoReviewStagedPipelineService.ts:62`) รองรับ
`supportsDurations: [8]` (`mediaGenerationService.ts:586`) — Veo 3.1 **ทุกตัว** เป็น `[8]`

Legacy path มี `resolveMarketplaceAutoReviewSequentialShotVideoDuration`
(`marketplaceAutoReviewService.ts:29160`) ที่ snap duration ให้เข้ากับโมเดล
— **staged path ไม่เคยเรียก**

ผลคือ prompt เขียน beat structure สำหรับ 10 วินาที (`0-3s / 3-7s / 7-10s`,
`marketplaceAutoReviewStoryArcPlanner.ts:529-531`) แต่คลิปที่ได้จริงคือ 8 วินาที
→ บทพูดถูกตัด / จังหวะกล้องไม่ตรง

**ประเด็นที่ต้องให้ผู้ใช้ตัดสินใจ:** "shot ละ 10 วินาที" กับ Veo 3.1 Lite **เป็นไปไม่ได้**
โมเดลที่รองรับ 10s: seedance / kling ตระกูล (`mediaGenerationService.ts:835-928`,
`supportsDurations: [5, 10, ...]`)

### 2.9 ช่องโหว่รองที่พบระหว่างทาง (บันทึกไว้ ไม่แก้ในแผนนี้)
- `marketplaceAutoReviewStagedCheckpointRouterService.ts:1283-1285` เรียก
  `buildStagedGuardianPresenceDirective` ด้วย `productChildRelated: false` ตายตัว
  ทำให้ `guardianReferenceIndex` ที่คำนวณที่ `:1275-1277` ถูกทิ้งเสมอ (`:1151`)
- `STORYTELLING_BEATS_TH` ถูกใช้เฉพาะเมื่อ `summaryLanguage !== "en"`
  (`marketplaceAutoReviewStoryArcPlanner.ts:357-360`) → **run ภาษาอังกฤษเสียโครงสร้าง
  ที่ผู้ใช้เลือกไปเงียบ ๆ**
- `source: "bounded_story_arc_fallback"` hardcode แม้ใน LLM path (`:747`)
  → telemetry แยกไม่ออกว่า plan มาจาก LLM หรือ fallback
- staged path **ไม่มี QC ตรวจ tone/structure** เลย (legacy มี `tone_preset_adhered` /
  `structure_beats_present` บังคับใน `productReviewSequentialStoryboardSkillRunner.ts:201-202`)

---

## 3. Design

### 3.1 แนวคิดกลาง: `cast` + `conversationMode`

เพิ่ม concept ระดับ run เดียวที่ทุกชั้นอ่านได้:

```ts
type StagedCastMember = {
  castId: string;            // "cast-1" | "cast-2"
  name: string;              // ชื่อที่ใช้พูดในบท ("ไอริณ") — VD ให้ชื่อจริง
  source: "uploaded" | "vd_character";
  vdCharacterId?: string;    // เมื่อ source = vd_character
  vdSeriesId?: string;
  role: "host" | "guest";    // host = คนเปิดเรื่อง/ถาม, guest = คนตอบ/รีวิว
  descriptor?: string;       // จาก resolveEffectiveCharacterFacts (VD) หรือผู้ใช้พิมพ์
  ageRange?: string | null;
  imageIndex: number;        // ตำแหน่งใน referenceImageUrls → @ImageN
};

type StagedConversationMode = "solo" | "two_person_conversation";
```

`conversationMode` **derive จากจำนวน cast** ไม่ให้ผู้ใช้ตั้งเอง (ลด state ที่ขัดแย้งกัน):
- `cast.length >= 2` → `two_person_conversation` (ใช้ 2 ตัวแรก, cap ที่ 2)
- `cast.length === 1` → `solo` (พฤติกรรมเดิมทุกประการ)
- `cast.length === 0` → เส้นทางเดิม product-only ไม่แตะ

**สัญญา byte-identical:** เมื่อ `conversationMode === "solo"` prompt ที่ compile ออกมา
ต้องเหมือนเดิมทุก byte — มี regression test บังคับ

### 3.2 Dialogue turns (additive, ไม่ทำลายของเดิม)

```ts
type StagedDialogueTurn = { castId: string; speakerName: string; line: string };

type StagedStoryArcShot = {
  ...เดิม,
  dialogue: string;                    // คงไว้ — flattened rendering
  dialogueTurns?: StagedDialogueTurn[]; // ใหม่
  castInShot?: string[];               // castId ที่อยู่ในเฟรมนี้
};
```

`dialogue` ยังเป็น source of truth เดิมสำหรับ hash / TTS join / UI edit
โดย render จาก turns เป็น `"ไอริณ: ...\nกันต์: ..."`
→ consumer เดิมทุกตัว (`stagedContracts.ts:97`, TTS join ที่
`marketplaceAutoReviewStagedPipelineService.ts:2341`, legacy bridge `:290/:301`)
ทำงานต่อได้โดยไม่ต้องแก้

`StagedShotStateV1Schema` เป็น `.passthrough()` (`stagedContracts.ts:91-103`)
→ เพิ่ม field ได้แบบ non-breaking

### 3.3 บังคับโครงสร้าง + โทน ให้สอดคล้องกับบทสนทนา

ปัญหา: first pass ปัจจุบัน**ไม่ใช้ LLM เลย** (`marketplaceAutoReviewStagedPipelineService.ts:818-828`
เรียก `buildStagedStoryArcPlan` แบบ deterministic เสมอ) และ template ไทย
(`buildShotDialogueTH:185-276`) เป็นบทเดี่ยวล้วน

แนวทาง (skill-first ตาม `feedback_skill_first_authoring`):
1. **เมื่อ `conversationMode === "two_person_conversation"` ให้ใช้ LLM planner เป็น primary**
   (`generateStagedStoryArcPlanWithLLM`) — deterministic เป็น fallback เท่านั้น
   เพราะบทสนทนา 2 คนที่ยังคง beat structure ต้องใช้วิจารณญาณ ไม่ใช่ template
2. Prompt ของ planner ได้รับพร้อมกันในคำสั่งเดียว: **cast roster + structure beats + tone**
   พร้อมกฎว่าแต่ละ beat ต้องยังครบ และผลัดกันพูดตามบทบาท host/guest
3. **เพิ่ม QC ฝั่ง staged** ที่ขาดอยู่ — reason code ใหม่:
   `staged_tone_not_adhered`, `staged_structure_beat_missing`,
   `staged_conversation_turns_missing` (fail-open → warning ไม่ฆ่า run
   ตาม pattern เดิมใน `marketplace-storyboard-vision-resilience`)
4. แก้ช่องโหว่ EN: ให้ `STORYTELLING_BEATS` ใช้ได้ทั้งสองภาษา

### 3.4 ภาพ (image prompt)

- ส่ง `customManifest` เข้า `compileStagedImagePrompt`
  (`marketplaceAutoReviewStagedPipelineService.ts:1090`) — ปลดล็อค dead code ที่ `:460-462`
- เพิ่ม **cast roster block** ใน prompt:
  ```
  นักแสดงในคลิปนี้:
  @Image2 = ไอริณ (host) — <descriptor>
  @Image3 = กันต์ (guest) — <descriptor>
  ```
- เพิ่ม **two-person staging rule** เมื่อ conversation mode:
  ทั้งสองคนอยู่ในเฟรมเดียวกัน หันเข้าหากัน เห็นหน้าทั้งคู่ ระยะ medium/two-shot,
  คนที่พูดในช็อตนั้นเด่นกว่า, ห้ามสลับใบหน้าระหว่าง @Image2 / @Image3
- ใช้ `castInShot` ของแต่ละช็อตกำหนดว่าใครอยู่ในเฟรม
  (ยกเว้นช็อตที่สินค้าเป็น product-critical → กฎเดิมชนะ)
- แก้ fallback patch ที่ `:1259-1272` ให้ enumerate **ทุก** character tag ไม่ใช่ตัวเดียว

### 3.5 วิดีโอ (video prompt + audio)

`buildStagedVideoPrompt` (`marketplaceAutoReviewStoryArcPlanner.ts:517-568`) เพิ่ม:
- **Dialogue block พร้อม speaker attribution** — ระบุว่าใครพูดประโยคไหน ตามลำดับ
- **Lip-sync directive** — คนที่พูดต้องขยับปากตรงกับบท, อีกคนแสดง reaction/ฟัง
- **Two-voice descriptor** (deterministic TS ไม่เรียก LLM — ตาม pattern
  `buildMarketplaceAutoReviewVoiceProfileDescriptor` ที่ `marketplaceAutoReviewService.ts:5874`):
  เสียงต่างกันชัดเจน 2 เสียง คงที่ทุกคลิป ผูกกับ castId
- **ไม่นำ VOICE CONSISTENCY LOCK ของ legacy มาใช้** — มันบังคับ narrator เดียว
  จะขัดกับ conversation mode โดยตรง (staged ไม่เคยมี lock นี้อยู่แล้ว)
- Beat structure (`:529-531`) ต้อง template ตาม duration จริง ไม่ hardcode 10

### 3.6 Duration — แก้ให้เป็นความจริง

- `StagedStoryArcShot.durationSeconds: 10` (literal) → `number`
- `validateNineShotContract` (`stagedContracts.ts:204-212`) เลิกบังคับ `=== 10`
  → รับช่วงที่ยอมรับได้ (เช่น 5–15) แทน
- `marketplaceAutoReviewStagedPipelineService.ts:1567` `duration: 10` →
  `shot.durationSeconds` ที่ผ่าน `resolveMarketplaceAutoReviewSequentialShotVideoDuration`
  (`marketplaceAutoReviewService.ts:29160`) เพื่อ snap เข้าโมเดล + ตั้ง warning
  `staged_video_duration_fitted_to_model`
- ข้อความ prompt / LLM system prompt (`:662`, `:666`) template ตาม duration จริง
- timeline math (`:295-299`) ใช้ผลรวมจริงแทน `shotId*10`

### 3.7 เลือกตัวละครจาก Vertical Drama series

**Precedent มีอยู่แล้ว:** `verticalDramaExtensionReadService.ts` เป็น read service
ที่ Marketplace REST router ใช้อยู่แล้ว (`server/routes/marketplaceCapture.ts:936-978`)
โดย**ไม่ต้องผ่าน feature flag `verticalDramaSeries`** — ใช้เป็น template

เพิ่ม tRPC procedure เดียวบน **marketplaceCapture router** (ไม่ใช่ VD router
เพราะ tenant ที่ใช้ Marketplace อย่างเดียวจะโดน FORBIDDEN จาก flag):

```
marketplaceCapture.listDramaCharactersForPicker  (protectedProcedure, query)
INPUT : { seriesId: string }
OUTPUT: { seriesId, seriesTitle, characters: [{
           characterId, characterKey, name, role, narrativeRole, roleTier,
           occupation, description, ageRange,
           portraitUrl, portraitAssetId, hasPortrait,
           looks: [{ characterId, variantLabel, variantType, portraitAssetId }],
         }] }
```

Building block ที่ **เรียกใช้ ไม่เขียนใหม่**:
- `resolveSeriesCharacterPortraits` (`server/routers/verticalDramaEpisodes.ts:1628`) —
  name + portrait + look linkage ในรอบเดียว
- `getPrimaryPortraitAssetId` (`server/services/verticalDramaCharacterStock.ts:1199`)
- `resolveEffectiveCharacterFacts` + `extractCharacterDescription`
  (`server/routers/verticalDramaCharacters.ts:860` / `:802`)

Scoping: ทุก query ต้องกรอง `(tenantId, userId, seriesId)` และ **404 ไม่ใช่ 403**
เมื่อไม่พบ — mirror `loadOwnedSeries` (`verticalDramaCharacters.ts:185`)
⚠️ ห้ามลอก predicate ของ `resolveSeriesCharacterPortraits:1657-1663` แบบ standalone
เพราะมันกรองแค่ tenant+series (ปลอดภัยเพราะ caller เช็ค ownership มาก่อนแล้ว)

**เก็บ `portraitAssetId` ไม่ใช่ URL** — `mediaAssets.originalUrl` มักเป็น path
สัมพัทธ์ (`/uploads/...`) ถ้าส่งดิบไปหา provider จะ 404
ต้อง resolve ตอน generate ผ่าน `getPrimaryPortraitUrl` + `resolveReferenceUrl`
(`mediaGenerationService.ts:1158`)

**UI reuse ตาม `feedback_reuse_existing_ui_patterns`:**
- `buildShotCharacterReferencePickerGroups`
  (`VerticalDramaStoryboardPanel.tsx:786-852`) — pure + มี unit test อยู่แล้ว
  จัดกลุ่ม "ลุค" ที่ DB เก็บเป็น row แบน ๆ (ถ้าไม่ใช้จะเห็น "ไอริณ" ซ้ำ 4 ครั้ง)
- `VerticalDramaReferenceFrameDialog` (presentational multi-select) — จำกัดเลือก 2

### 3.8 UI ฝั่ง Marketplace

ใน `StagedCheckpointReviewPanel.tsx` ส่วน CHARACTER ASSETS (`:1079-1137`):
- เพิ่มปุ่ม "เลือกจาก Drama Series" ข้าง dropzone เดิม
- แต่ละการ์ดตัวละคร: ช่องกรอก **ชื่อ** + dropdown **บทบาท** (host/guest)
  (VD จะเติมชื่อให้อัตโนมัติและ read-only)
- แสดง badge โหมดที่ derive ได้: `👥 โหมดสนทนา 2 คน` / `🎤 พูดคนเดียว`
  ให้ผู้ใช้เห็นทันทีว่าระบบตีความอย่างไร ก่อนกด approve story gate

---

## 4. Affected files

### Contracts / schema (ต้องมาก่อน)
| File | การเปลี่ยนแปลง |
|---|---|
| `apps/web/shared/marketplaceAutoReview/stagedContracts.ts:91-103` | `StagedShotStateV1Schema` + `dialogueTurns`, `castInShot` |
| `apps/web/shared/marketplaceAutoReview/stagedContracts.ts:204-212` | `validateNineShotContract` เลิกบังคับ duration = 10 |
| `apps/web/shared/marketplaceAutoReview/stagedContracts.ts:25-45` | reason code ใหม่ |
| `apps/web/server/routers/marketplaceCapture.ts:1899-1905` | manifest entry + `characterName`, `characterRole`, `vdCharacterId`, `portraitAssetId` |

### Planner
| File | การเปลี่ยนแปลง |
|---|---|
| `marketplaceAutoReviewStoryArcPlanner.ts:16-41` | `StagedStoryArcShot` / `StagedStoryArcPlan` + cast, turns, duration เป็น number |
| `:335-437` | deterministic builder รับ cast + สร้าง 2-speaker turns |
| `:439-515` | `buildStagedImagePrompt` count-aware + cast roster + two-shot staging |
| `:517-568` | `buildStagedVideoPrompt` + dialogue attribution + lip-sync + two-voice |
| `:620-760` | LLM planner รับ cast, Zod + `speaker`, เป็น primary ใน conversation mode |
| `:76-176` | beat/tone table ใช้ได้ทั้ง TH/EN |
| `:747` | `source` สะท้อนความจริง (llm vs fallback) |

### Pipeline
| File | การเปลี่ยนแปลง |
|---|---|
| `marketplaceAutoReviewStagedPipelineService.ts:817-827` | ส่ง cast เข้า planner |
| `:1090` | ส่ง `customManifest` เข้า `compileStagedImagePrompt` |
| `:1259-1272` | enumerate ทุก character tag |
| `:1567` | duration จริง + snap เข้าโมเดล |
| `:295-299` | timeline math |
| `:2341` | TTS: แยกตาม speaker |
| `:870-884`, `:944-951` | persist fields ใหม่ |

### Checkpoint router
| File | การเปลี่ยนแปลง |
|---|---|
| `...StagedCheckpointRouterService.ts:2631-2687` | persist field ใหม่ (ตอนนี้ strip ทิ้งเงียบ ๆ) |
| `:1213-1235`, `:1276`, `:1290-1330` | ส่ง cast roster + ทุก character เข้า skill |
| `:1714-1791` | redraft ส่ง cast ด้วย |
| `+ ใหม่` | `listDramaCharactersForPicker` |

### Skills (skill-first)
| File | การเปลี่ยนแปลง |
|---|---|
| `apps/web/skills/marketplace-auto-review-story-arc/SKILL.md` | กฎบทสนทนา 2 คน + คงโครงสร้าง/โทน |
| `apps/web/skills/marketplace-auto-review-shot-video-director/SKILL.md` | กฎ lip-sync + two-voice |
| `apps/web/skills/product-review-sequential-storyboard/skill.md:285-294, 348-374` | variant สองตัวละคร |
| ทุกไฟล์ | แก้ทั้ง `skill.md` และ `SKILL.md` ให้ byte-identical (ดู `project_vd_skill_dualcase_file_drift`) |

### UI
`StagedCheckpointReviewPanel.tsx:596-625, 1079-1137` ·
`StagedCheckpointReviewSurface.tsx:455-462` · component picker ใหม่

---

## 5. Risk assessment

| ความเสี่ยง | ระดับ | การลด |
|---|---|---|
| Regression กับ run ตัวละครเดียว/ไม่มีตัวละคร | **สูง** | สัญญา byte-identical + golden-prompt test เมื่อ `conversationMode === "solo"` |
| Duration เปลี่ยน → คลิปเดิมยาวไม่เท่าเดิม | กลาง | snap เข้าโมเดล + warning; ค่าที่ได้จริงวันนี้คือ 8s อยู่แล้ว (แผนนี้แค่ทำให้ prompt ตรงความจริง) |
| ใบหน้าสลับกันระหว่าง @Image2/@Image3 | **สูง** | identity lock ต่อ tag + QC reason code + ยืม convention จาก `characterIdentityMap.ts:147-232` |
| VD picker รั่วข้ามผู้เช่า | **สูง** | scope `(tenantId, userId, seriesId)` ทุก query, 404 ไม่ใช่ 403, มี test |
| Portrait URL 404 ที่ provider | กลาง | เก็บ `portraitAssetId` แล้ว resolve ตอน generate |
| LLM planner ล้ม → ไม่มีแผน | กลาง | deterministic fallback เดิมยังอยู่, fail-open |
| Prompt ยาวเกิน cap ของโมเดล | กลาง | cast roster เพิ่มความยาว — วัด `prompt.length` จริงกับ fixture 9 ช็อต (ดู `project_feature136_baseline_vs_length_budget`); gpt-image-2 cap = `configJson.maxPromptLength` |
| Optimizer ตัด lock ทิ้ง | กลาง | relock หลัง optimizer ทุกครั้ง (ดู `project_marketplace_optimizer_strips_locks`) |

**ไม่มี DB migration** — ทุกอย่างอยู่ใน jsonb `.passthrough()` ที่มีอยู่แล้ว

---

## 6. Phases

| Phase | ขอบเขต | ส่งมอบ |
|---|---|---|
| **P0** | แก้ duration ให้ตรงความจริง (§2.8) | คลิปกับ prompt พูดตรงกัน — เป็น bug fix อิสระ ปล่อยได้ก่อน |
| **P1** | Cast + conversationMode + dialogueTurns (contracts + planner + persist) | data model รองรับ 2 คน, solo ยัง byte-identical |
| **P2** | Image path — cast roster, two-shot staging, ทุก @ImageN | ภาพออกมาสองคนคุยกัน |
| **P3** | Video + audio — attribution, lip-sync, two-voice, TTS แยก speaker | วิดีโอมีบทสนทนาจริง |
| **P4** | VD character picker (procedure + UI) | เลือก 2 ตัวละครจากซีรีส์ ใช้ชื่อจริง |
| **P5** | QC tone/structure ฝั่ง staged + แก้ EN beats gap | โครงสร้าง/โทน ถูกตรวจจริง ไม่ใช่แค่สั่ง |

---

## 7. Verification steps

1. `cd apps/web && pnpm test` — ชุดที่เกี่ยวข้องต้องเขียวเทียบกับ baseline
   (baseline มีสีแดงค้างอยู่ — เทียบด้วย fail-set identity ไม่ใช่ตัวเลข
   ดู `project_vd_video_prompt_suites_red_baseline`)
2. **Golden-prompt test**: run ตัวละคร 0 คน และ 1 คน → prompt ต้อง byte-identical กับ baseline
3. **Test บน prompt ที่ถูก submit จริง** ไม่ใช่ intermediate (บังคับตาม
   `project_marketplace_motion_direction`)
4. วัด `prompt.length` จริงด้วย fixture 9 ช็อต เทียบ `maxPromptLength` ของโมเดล
5. `pnpm check` — typecheck (มี pre-existing red ~987 รายการ เทียบ delta)
6. Router test ที่ import router จริงต้องใช้
   `vi.hoisted(() => { process.env.JWT_SECRET = ... })`
7. Manual run บน smartaihub.app: 2 ตัวละคร → ตรวจภาพช็อต 1-9 ว่ามีสองคน,
   ตรวจวิดีโอว่าผลัดกันพูด, ตรวจว่า beat structure ยังครบ
8. Test isolation: `verticalDramaCharacters` ของ tenant อื่น → 404

---

## 8. Decisions — อนุมัติแล้ว 2026-07-29

1. **Duration** → ให้ผู้ใช้เลือกเองใน advanced overrides + snap เข้า `supportsDurations`
   ของโมเดลที่เลือก พร้อม warning `staged_video_duration_fitted_to_model` เมื่อถูกปรับ
   (ได้ 10s จริงเมื่อเลือกโมเดลที่รองรับ, ไม่พังกับ Veo 3.1 ที่ได้ 8s)
2. **โหมดสนทนา** → derive จากจำนวนตัวละครอัตโนมัติ (ไม่มี dropdown)
   + แสดง badge ให้ผู้ใช้เห็นการตีความก่อน approve story gate
3. **ลำดับ** → ทำ P0-P5 รวดเดียว

## 9. Execution waves (ไฟล์ไม่ทับกันในแต่ละ wave)

**Model policy สำหรับ sub-agent ทุกตัวในแผนนี้: Sonnet 5 (`model: "sonnet"`)** —
ทุก `ssp-*` implementation agent (frontend/backend/database) ที่ dispatch ในแผนนี้
ต้องระบุ `model: "sonnet"` ตอนเรียก Agent tool โดยชัดเจน ไม่ปล่อย inherit
(Sonnet 5 คือ default coder ตาม `project_model_routing` อยู่แล้ว — ข้อนี้แค่ pin ให้ชัดสำหรับแผนนี้
ไม่ใช้ Opus ระหว่าง implementation waves แม้งานจะซับซ้อน)

| Wave | Agent | Model | ไฟล์ที่แก้ (exclusive) |
|---|---|---|---|
| 1 | ssp-backend (contracts+planner) | sonnet | `shared/marketplaceAutoReview/stagedContracts.ts`, `server/services/marketplaceAutoReviewStoryArcPlanner.ts` |
| 1 | ssp-backend (VD read service) | sonnet | `server/services/verticalDramaExtensionReadService.ts` |
| 1 | ssp-backend (skills) | sonnet | `apps/web/skills/**/skill.md` + `SKILL.md` |
| 2 | ssp-backend (pipeline) | sonnet | `server/services/marketplaceAutoReviewStagedPipelineService.ts` |
| 2 | ssp-backend (router) | sonnet | `server/services/marketplaceAutoReviewStagedCheckpointRouterService.ts`, `server/routers/marketplaceCapture.ts` |
| 3 | ssp-frontend (UI) | sonnet | `client/src/components/marketplaceCapture/*`, picker component ใหม่ |
| 4 | ssp-test-qa (tests + typecheck + verify) | sonnet | `__tests__/*` |
