# Feature 185 — New Project by Skill Framework for Storyboard Review

**สถานะ:** Proposed / implementation-ready
**วันที่:** 2026-09-11
**20-round completeness review:** Complete — all identified v1 gaps were closed in this document
**ขอบเขต:** Storyboard Review, skill-driven image/prompt generation, shared character library, Drama Series interoperability

## 0. Executive decision

เพิ่มทางเลือก `New Project by Skill Framework` ในหน้า `storyboard-review` โดยคง `New Blank Project` และพฤติกรรมเดิมทั้งหมดไว้เหมือนเดิม ทางเลือกใหม่เป็น full-screen wizard ที่สร้าง durable storyboard job จาก skill ที่ลงทะเบียนและ schema ของ skill แบบ dynamic

สถาปัตยกรรมที่เลือกใช้คือ:

1. `Storyboard Project` เป็นเจ้าของโปรเจกต์, Characters tab, draft และ active run; `Storyboard Orchestrator` เป็นเจ้าของการวางเรื่อง จำนวนช็อต สถานะ job และการ handoff ไปยัง Storyboard Review
2. `Skill Prompt Runner` เรียก skill ที่เลือกแบบ `prompt_only` ต่อช็อต และใช้ค่าจาก `generation_prompt` / `generation_request.prompt` ตาม canonical contract โดยไม่ประกอบ prompt ใหม่โดยอัตโนมัติ
3. `Image Generation Core` เป็นเจ้าของ model/provider execution, managed media asset และการตรวจ capability
4. `Video Prompt Builder` สร้าง prompt วิดีโอจากภาพที่สร้างเสร็จและบริบทช็อต แต่ v1 ยังไม่ submit งานสร้างวิดีโออัตโนมัติ
5. `Shared Character Library` เป็น canonical source สำหรับตัวละครที่ reusable ระหว่าง Skill Storyboard และ Drama Series โดยใช้ asset เดิม ไม่คัดลอก binary
6. `Drama Series` และ `Skill Storyboard` ใช้ shared character UI/controller ผ่าน owner adapter แต่ยังคง compatibility กับ router/table เดิมของ Drama Series

ห้ามใช้ synthetic Drama Series เพื่อเก็บตัวละคร Storyboard และห้ามทำ `seriesId` ในตาราง Drama เดิมเป็น nullable เพื่อรองรับฟีเจอร์นี้ เพราะจะทำให้ ownership, dependent checks, billing และข้อมูลเก่าปะปนกัน

## 1. Problem, goals, and non-goals

### 1.1 ปัญหา

ผู้ใช้ต้องกรอก storyboard เองทีละช็อต แม้จะมี character-generation skill ที่มี schema และ canonical prompt อยู่แล้ว อีกทั้งตัวละครที่สร้างได้ยังนำกลับมาใช้ข้ามโปรเจกต์หรือข้าม Drama Series ได้ยาก จึงเสี่ยงต่อความไม่ต่อเนื่องของใบหน้าและการสร้างซ้ำโดยไม่จำเป็น

### 1.2 เป้าหมาย v1

- เพิ่ม `New Project by Skill Framework` บน `storyboard-review` โดยไม่ทำลาย `New Blank Project`
- สร้าง storyboard จำนวน **2–12 ช็อต** (`totalShots`, default `9`) ช็อตละ **10 วินาที** (`shotDurationSec = 10`) รวมเวลา `totalShots * 10` วินาที
- รองรับ `mime`, `dialogue`, `hybrid` และเก็บบทพูดอย่าง durable ไม่ให้หายหลัง image approval หรือการแก้ไข media
- filter skill เฉพาะ category `character_prompt_generation` / label UI “สร้างพรอมต์ตัวละคร” และตรวจ capability ก่อนแสดงให้เลือก
- เริ่มต้นรองรับ `cute-child-image-generator` ผ่าน skill package v3 contract
- อ่าน `input.schema.json` และ `ui.schema.json` เพื่อสร้าง dynamic form; ไม่ hardcode ฟิลด์เฉพาะ skill ในหน้า wizard
- รับ reference image แบบ optional จำนวน 0–5 ภาพ ผ่าน managed media asset เท่านั้น
- เลือก image model และ video model จาก model registry; แสดง quality เฉพาะเมื่อ model config รองรับ และ validate ซ้ำฝั่ง server
- วางแผนช็อต, เรียก skill `prompt_only` ครบทุกช็อต, สร้างภาพประกอบครบทุกช็อต และสร้าง video prompt ครบทุกช็อต
- แสดงผลกลับเข้า existing Storyboard Review ด้วยจำนวน task ตามที่ผู้ใช้เลือก
- เพิ่ม Characters tab ที่มี parity กับ Character tab ของ Drama Series: create/edit/delete, looks, portraits, references, candidates, sheet/angle pack, DNA/role/casting และการใช้ซ้ำ
- ให้ publish/import ตัวละครข้าม Shared Library, Skill Storyboard และ Drama Series แบบ explicit snapshot พร้อม lineage และ conflict handling
- รองรับชื่ออัตโนมัติสำหรับตัวละครใหม่ แต่ผู้ใช้แก้ชื่อได้เสมอโดยไม่เปลี่ยน immutable `characterKey`

### 1.3 ไม่อยู่ใน v1

- การสร้างวิดีโอจริงอัตโนมัติหลังสร้างภาพ (v1 สร้าง video prompt และแสดงใน Review เท่านั้น)
- live two-way sync ที่เปลี่ยนข้อมูลอีก surface โดยอัตโนมัติ
- การส่ง reference รูปไป provider โดยตรงจาก local path หรือ private URL
- การบังคับให้ทุก shot ใช้ look เดียวกันโดยไม่มีตัวเลือกของผู้ใช้
- การปรับความยาวต่อช็อตแบบอิสระ (v1 คง 10 วินาทีทุกช็อต)
- การ backfill ตัวละครเก่าทั้งหมดเข้า library โดยอัตโนมัติ
- การลบหรือเปลี่ยน semantics ของ `New Blank Project` และ manual storyboard เดิม

## 2. Existing baseline and reuse boundaries

การ implement ต้องเริ่มจาก source ที่มีอยู่จริงต่อไปนี้ และต้องตรวจ source ปัจจุบันก่อนแก้ทุกครั้ง เพราะชื่อ/รูปแบบอาจเปลี่ยนได้:

| พื้นที่ | baseline | ข้อกำหนดการ reuse |
|---|---|---|
| Storyboard entry/review | `apps/web/client/src/pages/StoryboardReviewPage.tsx` | เพิ่ม entry ใหม่ใน New Project; คง manual create และ review route เดิม |
| Review persistence | `apps/web/server/routers/videoEditorProjects.ts` procedure `saveStoryboardReview` | ใช้สร้าง projection ที่ review เปิดได้; canonical job/shot records อยู่ใน tables ใหม่ |
| Dynamic form | `apps/web/client/src/components/media/DynamicSkillForm.tsx` | reuse schema renderer, dependency, images/imageUpload, model-search; เพิ่ม parent-field exclusion ที่ explicit |
| Upload/library picker | `ImageSourcePicker` และ managed asset resolver | ใช้ upload และ library/history selection; ห้ามบันทึก raw provider URL เป็น identity reference |
| Model selection | `ModelSelectorDialog.tsx`, `media.getModels`, model registry `configJson.inputFields` | quality/options ต้องอ่านจาก model capabilities และ validate server |
| Drama character UI | `VerticalDramaCharacterStockPanel.tsx` | ทำ shared controller/presentational component แล้วห่อด้วย owner adapters; ห้าม copy แล้ว drift |
| Drama tab host | `VerticalDramaSeriesDetailPage.tsx` | คง tab เดิมและเพิ่ม adapter สำหรับ import/export เท่านั้น |
| Drama character APIs | `verticalDramaCharactersRouter` | คง owner checks, asset linking, generation gates และ credit confirmation เดิม |
| Existing planner/review spec | Feature 122 และ Feature 131 | reuse contracts ที่ compatible; feature นี้เป็น skill-first image pipeline |
| Async job/billing patterns | Feature 161 | reuse durable status, idempotency, retry, selected-model passthrough และ settlement boundary |

ถ้า SocratiCode index พร้อม ให้ใช้ `codebase_status`, `codebase_search`, `codebase_impact` และ `codebase_flow` ก่อน broad exploration; หาก MCP ไม่พร้อม ให้ใช้ targeted `rg` และ bounded source reads แทน และบันทึก fallback ใน implementation handoff

## 3. Product invariants and decisions

1. `totalShots` เป็น integer ระหว่าง 2 ถึง 12 เท่านั้น ค่าเริ่มต้น 9; planner ต้องคืนจำนวนช็อตเท่ากับค่าที่ผู้ใช้ยืนยันเสมอ
2. `shotDurationSec` เป็น literal 10 ใน v1 และไม่รับค่าจาก client ที่ต่างจาก 10
3. `outputAspectRatio` เริ่มต้นและ v1 supported value คือ `9:16`; skill/model ที่ไม่รองรับต้อง fail closed พร้อมคำอธิบาย ไม่ fallback เงียบ
4. ค่า skill/version/schema/model ที่ยืนยันแล้วต้อง snapshot ลง job เพื่อให้ rerun ภายหลังไม่เปลี่ยนตาม registry ที่อัปเดต
5. `preview` และการเปิด wizard ห้ามเรียก provider แบบมีค่าใช้จ่าย
6. มี credit confirmation เดียวที่ job-level ก่อนเริ่ม paid image generation; ห้ามซ้อน generic child dialog กับ parent job dialog
7. retry ต้องเลือกเฉพาะ shot ที่ล้มเหลว และต้องมี confirmation ใหม่ถ้ามีค่าใช้จ่ายเพิ่ม; ห้าม rerun shot สำเร็จโดยอัตโนมัติ
8. reference ทุกตัวต้องเป็น `media_assets.id` ที่ user/tenant มีสิทธิ์เข้าถึงและ provider resolver อนุมัติแล้ว
9. การ import/export character เป็นการสร้าง snapshot และ relation ใหม่ ไม่ mutate source โดยเงียบ ๆ
10. `characterKey` เป็น stable identity; `name` เป็น display label ที่แก้ไขได้และมี history/alias สำหรับค้นหา
11. ถ้า skill ไม่ผ่าน schema/capability validation จะไม่แสดงใน selector แม้ metadata จะมีอยู่ใน filesystem
12. source of truth ของ run/shot/character library อยู่ใน tables ใหม่; `reviewData` เป็น read/projection compatibility layer

## 4. User flow

### 4.1 Entry point

ใน `StoryboardReviewPage` เพิ่ม action `New Project by Skill Framework` ในชุด New Project เดิม หรือเป็น secondary action ในเมนูเดียวกัน ผู้ใช้เลือกได้ระหว่าง:

- `New Blank Project`: ใช้ flow เดิมทุกประการ
- `New Project by Skill Framework`: เปิด wizard แบบ full-screen route/state แยกจาก manual flow

route ที่แนะนำคือ `/storyboard-review/new/skill-framework` และต้องประกาศ route ก่อน dynamic `/storyboard-review/:id`; เมื่อสร้าง project แล้วให้ redirect ไป project/review route ที่สามารถเปิด `?tab=characters` ได้ หาก implementation ใช้ overlay แทน route ต้องคง deep-link, refresh และ browser back semantics เทียบเท่ากัน

การกด browser back, close หรือ escape ใน wizard ต้องมี dirty-state confirmation ถ้ามีข้อมูลที่ยังไม่บันทึก หากยังไม่มี job ที่ยืนยันแล้ว การปิดจะลบเฉพาะ draft ที่สร้างไว้เพื่อ preview ตาม retention policy; ห้ามลบ media asset ที่ user เคย upload หรือ character library record

### 4.2 Full-screen wizard steps

1. **Story brief** — title, idea, story type, platform, language, product context
2. **Character skill** — skill ที่ compatible, dynamic skill fields, reference images, library characters/looks
3. **Models** — image model, conditional quality, video model และ capability warnings
4. **Review & cost confirmation** — สรุป settings, shot count, duration, model, refs, estimated credits, fingerprint
5. **Run progress** — job status, per-shot status, cancel, retry failed shots

ผู้ใช้ย้อนกลับได้ก่อน confirmation โดยค่าในแต่ละ step ต้อง persist เป็น draft ใน client/server draft record เพื่อไม่สูญหายจากการ refresh ที่รองรับ หาก draft หมดอายุให้แจ้งและไม่เริ่ม generation อัตโนมัติ

เมื่อสร้าง framework draft ให้สร้าง `storyboard_skill_projects` แบบยังไม่ยืนยันก่อน เพื่อให้ project มี identity สำหรับ draft, Characters tab และ active run โดยไม่ต้องรอให้ image generation เสร็จ

### 4.2.1 Storyboard project tabs

เมื่อ project ถูกสร้างแล้ว ให้แสดง sub-navigation/tabs อย่างน้อย:

- `Storyboard` — existing review/progress/shot results
- `Characters` — project-bound characters, shared library search, create/edit/look/import/export
- `Run details` — skill/schema/model snapshots, status, cost/audit และ retry history

การเปิด `Characters` ก่อน confirm/run ต้องทำได้และไม่เรียก provider; การเปลี่ยนตัวละครหลัง run เริ่มแล้วต้องสร้าง binding revision ใหม่และไม่เปลี่ยน shot input snapshot ที่กำลังทำงาน

### 4.3 Global storyboard inputs

| field | type/constraint | default/behavior |
|---|---|---|
| `title` | string, trim, max 160; optional in UI | ถ้าว่างสร้างจาก idea แบบ deterministic และแก้ได้ |
| `idea` | string, trim, min 1, max 10,000 | required |
| `storyType` | `mime \| dialogue \| hybrid` | required; default `mime` เพื่อเข้ากับ manual UI เดิม |
| `targetPlatform` | `facebook_reels \| youtube_shorts` | default `facebook_reels` |
| `totalShots` | integer 2–12 | default 9; selector แสดง `2..12` |
| `shotDurationSec` | literal integer 10 | read-only ใน v1; total = `totalShots * 10` |
| `outputAspectRatio` | `9:16` in v1 | default/read-only unless future capability unlocks others |
| `selectedSkillId` | registered compatible skill ID | required |
| `selectedSkillVersion` | immutable version string | populated from validated registry, not free text |
| `imageModelSelection` | `{modelId, options}` | required; options filtered by model config |
| `videoModelSelection` | `{modelId, options?}` | required for video prompt dialect; no video job in v1 |
| `language` | supported BCP-47-like code | default `th`; used for story/dialogue/video prompt metadata |
| `productContext` | optional string, max 5,000 | optional |
| `characterReferenceAssetIds` | array of managed asset IDs, 0–5 | optional; skill schema may also expose the same field |
| `libraryCharacterIds` | array of owned library character IDs | optional; explicit user selection |
| `libraryLookSelections` | `{characterId, lookId?}[]` | selected look or current primary look |
| `saveNewCharacterToLibrary` | boolean plus optional name | default true when user chooses “สร้างตัวละครใหม่”; no binary is generated by this toggle |
| `dynamicSkillInput` | JSON validated against selected skill schema | excludes parent-owned duplicate fields |
| `idempotencyKey` | opaque UUID/string | server generated if absent; client retries reuse it |

Client-side validation is for feedback only. Server repeats all validation, resolves ownership, validates selected skill/version and computes the confirmation fingerprint from normalized input.

### 4.4 Story type behavior

- `mime`: `dialogueLines` ต้องเป็น `[]`; planner อนุญาตเฉพาะ visual action, expression, gesture, title card หรือ on-screen text ที่ผู้ใช้ยืนยัน
- `dialogue`: ทุก shot ที่มีบทพูดต้องเก็บ `dialogueLines[]` พร้อม `speaker`, `text`, `language`, `timingHint?`; ห้ามสร้างเสียงอัตโนมัติในขั้นตอนนี้
- `hybrid`: shot แต่ละตัวระบุ `audioMode` เป็น `none`, `dialogue`, `ambience` หรือ `music`; บทพูดอยู่ใน structured field แยกจาก image/video prompt

ระบบต้องไม่ infer บทพูดจาก prompt ที่สร้างไปแล้วเพื่อเติมข้อมูลย้อนหลัง หากไม่มี dialogue ให้เป็น empty array อย่างชัดเจน

## 5. Dynamic skill-driven UI

### 5.1 Registry compatibility contract

Skill ที่แสดงใน selector ต้องผ่านเงื่อนไขทั้งหมด:

- category canonical คือ `character_prompt_generation` หรือ category ที่ registry map อย่างชัดเจนมายัง category นี้
- มี version ที่ resolve ได้และ snapshot ได้
- รองรับ `prompt_only`
- มี input schema และ UI schema ที่ parse/normalize สำเร็จ
- output contract ระบุ canonical prompt field `generation_prompt` และ direct model payload `generation_request` หรือมี adapter ที่กำหนดชัดเจน
- ประกาศ reference image support และ max references ที่ตรวจสอบได้
- aspect ratio `9:16` และ storyboard shot context รองรับ หรือมี adapter ที่ validated

กรณี `cute-child-image-generator` ใน repository ปัจจุบัน metadata root และ imported bundle มี ID/category/version ต่างกัน (`cute_child_image_generator`, package v3.0.0 กับ root metadata รุ่นเก่า) ต้องทำ canonical registry adapter/normalization ให้เหลือ identity เดียวก่อนเปิดใช้:

```text
canonical skill id: cute_child_image_generator
canonical version: 3.0.0
display/package alias: cute-child-image-generator
UI label: Cute Child Image Generator
category: character_prompt_generation
execution modes: prompt_only, generate_image
references: optional, max 5
canonical output: generation_prompt, generation_request
```

ห้ามแก้ด้วยการ hardcode เฉพาะหน้า UI หรือเลือก root metadata แบบเงียบ ๆ หาก schema อยู่ที่ `skills/<slug>/imported/schemas`; registry ต้องค้นหา/normalize bundle path อย่างเป็นทางการ และ schema validator ต้องรายงาน source/version ที่ใช้

Registry normalization ต้องมี alias mapping ที่ทดสอบได้ระหว่าง hyphenated slug (`cute-child-image-generator`), underscore skill ID (`cute_child_image_generator`) และ package metadata โดยห้ามใช้ display slug เป็น execution identity หากไม่ผ่าน canonical mapping

### 5.2 Schema loading

Server `getSkillSchema` ให้ความสำคัญกับ `ui.schema.json` จาก bundle ที่ผ่าน validation แล้ว และใช้ `input.schema.json` เป็น validation source เสมอ หากไม่มี UI schema ให้ generate basic UI จาก standard JSON Schema ได้ แต่ต้องแสดง warning ใน admin/test และไม่ bypass required/enum/type constraints

Response ต้องมี:

```ts
type SkillSchemaSnapshot = {
  skillId: string;
  skillVersion: string;
  schemaHash: string;
  inputSchema: JsonObject;
  uiSchema: JsonObject;
  fields: NormalizedSkillField[];
  parentOwnedFields: string[];
  capabilities: {
    executionModes: string[];
    referenceImages: { supported: boolean; max: number };
    outputAspectRatios: string[];
    canonicalPromptField: "generation_prompt";
    directModelPayloadField: "generation_request";
  };
};
```

`schemaHash` ถูก snapshot ใน job เพื่อป้องกัน schema เปลี่ยนกลางงาน

### 5.3 Parent-owned field binding

Dynamic form ใช้ `DynamicSkillForm` เดิม แต่ parent wizard เป็นเจ้าของฟิลด์ที่มี semantic ระดับ storyboard และ bind ลง skill input ก่อน run:

| parent field | skill field | rule |
|---|---|---|
| `idea` | `idea` | ใช้ story idea เป็น global context; shot-specific action ส่งผ่าน adapter |
| `characterReferenceAssetIds` | `character_reference_images` | แปลงเป็น `{asset_id}`; max 5 และไม่สร้าง URL เอง |
| `outputAspectRatio` | `aspect_ratio` | v1 ส่ง `9:16`; reject ถ้า skill schema ไม่รองรับ |
| selected library character/look | skill identity fields/reference assets | explicit resolved snapshot; ไม่เพิ่มจากภาพใน shot อัตโนมัติ |

Parent-owned fieldsต้องไม่ render ซ้ำใน `DynamicSkillForm` แต่ schema snapshot ยังต้องเก็บชื่อ/type เพื่อ validation และ mapping audit หาก skill ไม่มี field ที่ parent ต้องการ ให้ adapter ระบุว่า unsupported และ block ก่อน confirmation

Normalized renderer ต้องรองรับ field types ที่ `DynamicSkillForm` มีอยู่แล้ว เช่น text/textarea/number/select/checkbox, `images`/`imageUpload`, model-search และ dependency/conditional visibility โดย component type ต้องมาจาก allowlist ไม่ execute component name หรือ script จาก skill package

ฟิลด์อื่น เช่น `age`, `gender_style`, `child_count`, `identity_lock_mode`, `scene_mode`, `scene_detail`, `scene_complexity`, `style_mode`, `shot_type`, `expression`, outfit/hair/accessory/background mood, `custom_activity`, `custom_notes` ต้อง render จาก schema และใช้ label/placeholder จาก UI schema

### 5.4 Attachment UX

- ใช้ `ImageSourcePicker` สำหรับ device upload, Library และ History
- แสดง counter `0/5` ถึง `5/5`, thumbnail, remove, preview/lightbox และ error ต่อไฟล์
- จำกัดชนิดไฟล์/ขนาดตาม managed upload policy; ตรวจ MIME/content server-side
- upload เสร็จแล้วต้องได้ `media_assets.id` ก่อนนำไปเข้า draft
- รูปไม่ใส่ได้; ไม่แสดง validation error เมื่อเป็น 0
- ถ้าเลือก library character ที่มี reference assets ระบบต้องแสดงว่า asset ใดถูกใช้และให้ถอดออกได้ก่อน confirmation
- ถ้า selected image model รับ reference ได้น้อยกว่าจำนวนที่เลือก ให้ block พร้อมให้ผู้ใช้ลดจำนวน/เปลี่ยน model; ห้ามตัดรูปเงียบ ๆ

## 6. Model selection and quality

### 6.1 Image model

ใช้ `media.getModels({type: "image"})`/equivalent model registry response ที่ scope ตาม tenant/user/provider access แล้วแสดง model ที่รองรับ:

- image generation
- selected aspect ratio `9:16`
- reference image count ที่ต้องใช้
- quality options ถ้ามี

ตัวอย่าง GPT Image 2.5: quality selector อ่านจาก `configJson.inputFields` เช่น `low`, `medium`, `high`, `xhigh`, `max` และแสดงเฉพาะตัวเลือกที่ model row เปิดใช้งาน ผู้ใช้เลือก `xhigh` ได้ต่อเมื่อ model config ระบุจริง หากมี quality field ให้เลือกค่า default จาก model config; หากไม่มี quality field ให้ไม่ render selector และไม่ส่ง option ปลอม

### 6.2 Video model

ใช้ `media.getModels({type: "video"})` และเลือก model ที่มี prompt dialect/capability สำหรับแนวตั้ง `9:16` และ 10 วินาที หรือมี adapter ที่แปลง metadata ได้โดยไม่เปลี่ยน canonical image prompt

แม้ v1 ไม่ submit video generation, video model ต้อง snapshot เพื่อให้ video prompt reproducible และให้ review รู้ว่าถูกออกแบบสำหรับ target model ใด

### 6.3 Server validation

Server ต้อง:

- re-check model enabled, tenant access, provider configured และ model type
- validate option keys/value กับ allowlist จาก model config
- reject unknown quality, unsupported aspect ratio, invalid duration/reference count
- persist normalized selection ไม่ใช่ client label
- ไม่ fallback ไป model/provider อื่นโดยอัตโนมัติ

## 7. Story planner: variable 2–12 shots

### 7.1 Planner contract

```ts
type PlannedShot = {
  shotNumber: number; // 1..totalShots
  beat: string;
  purpose: string;
  visualAction: string;
  sceneDescription: string;
  continuity: {
    characterState: string;
    wardrobe: string;
    location: string;
    props: string[];
    previousShotLinks: string[];
  };
  audioMode: "none" | "dialogue" | "ambience" | "music";
  dialogueLines: DialogueLine[];
  durationSec: 10;
};
```

Planner input คือ normalized global brief + selected character snapshot/look + story type + language + N; planner output ต้อง validate ว่ามีช็อต `1..N` ครบ, ไม่มีเลขซ้ำ, duration เป็น 10 ทุกช็อต, `mime` ไม่มี dialogue และ dialogue speaker/text ไม่ว่าง

### 7.2 Narrative mapping

ใช้ pattern เป็น default ไม่ใช่การบังคับให้ทุก idea มีเนื้อหาเหมือนกัน; planner ปรับเนื้อหาให้สอดคล้อง idea แต่ต้องคงหน้าที่ของ beat และไม่เติม product claim/บทพูดที่ผู้ใช้ไม่ได้อนุญาต

| N | beats ตามลำดับ |
|---:|---|
| 2 | setup + problem → resolution/close |
| 3 | setup → conflict/problem → resolution |
| 4 | setup → problem → attempt/turn → payoff |
| 5 | setup → problem → reaction → solution → emotional close |
| 6 | setup → problem → reaction → detail → attempt/turn → solution/close |
| 7 | setup → problem → reaction → closer detail → attempt/discovery → solution → close |
| 8 | setup → problem → reaction → closer detail → attempt → turning point → solution/payoff → close |
| 9 | setup → problem → reaction → closer problem detail → attempt/discovery → turning point → solution in action → result/payoff → ending/emotional close/CTA |
| 10 | canonical 9 → aftermath |
| 11 | canonical 9 → aftermath → secondary payoff/consequence |
| 12 | canonical 9 → aftermath → secondary payoff/consequence → final CTA/loop close |

ถ้า story ไม่เหมาะกับ CTA ให้ beat สุดท้ายเป็น emotional close แต่ยังต้องมี slot และ metadata ชัดเจน

### 7.3 Execution ordering and concurrency

Planner ต้องทำงานครบก่อนเริ่ม image provider calls เพื่อให้ continuity context ครบทั้งเรื่อง การเรียก skill prompt และ image generation อนุญาต bounded concurrency ตาม worker/provider limit (ค่าเริ่มต้น `1` ต่อ run จนกว่าจะมี capacity config) แต่ต้อง:

- persist และแสดงผลตาม `shotNumber` เสมอ ไม่ขึ้นกับ completion order
- ไม่ใช้ผลของ shot ที่ยังไม่ persist เป็น implicit input ของ shot อื่น
- ไม่เกิน provider/model rate limit หรือ tenant concurrency quota
- ยกเลิก queued work ที่ยังไม่ dispatch เมื่อ user cancel และรักษาผลของ shot ที่เสร็จแล้ว
- ถ้า shot หนึ่งล้มเหลว ไม่หยุดหรือ rerun shot อื่นโดยอัตโนมัติ เว้นแต่ planner validation ล้มเหลวทั้ง run

### 7.4 Continuity rules

- shot 1 สร้าง canonical character description/state
- shot ถัดไปอ้างอิง character snapshot/look และ `previousShotLinks`
- library identity/reference assets ถูกใช้เฉพาะตามที่ user เลือก; ห้ามตีความภาพผลลัพธ์ของ shot ก่อนหน้าเป็นการแก้ character library โดยอัตโนมัติ
- การเปลี่ยน outfit/look ระหว่าง shot ต้องเป็น planned look change และระบุใน shot context
- หาก planner สร้างข้อมูลที่ขัดกับ locked character DNA ให้ validation warning/error ตามระดับ และ block เฉพาะกรณีที่ละเมิด safety/identity contract

## 8. Skill prompt and image pipeline

### 8.1 Per-shot sequence

สำหรับทุก shot ตามลำดับ:

1. สร้าง `skillInput` จาก global parent values, selected character/look snapshot และ shot context
2. validate `skillInput` ด้วย selected skill input schema
3. เรียก selected skill ด้วย `execution_mode: "prompt_only"`
4. ตรวจ response `success`, `result.generation_prompt`, `result.generation_request.prompt`
5. persist raw redacted response และ canonical fields ก่อนเริ่ม image provider call
6. handoff `generation_request` ให้ Image Generation Core พร้อม selected image model/options และ managed refs
7. persist returned managed `imageAssetId`, provider request ID และ QC/status
8. สร้าง video prompt จาก shot context + generated image asset + selected video model dialect
9. persist video prompt และ source metadata
10. หลังทุก shot พร้อม ให้สร้าง/อัปเดต Review projection ผ่าน existing review persistence boundary
11. ประกาศ run `succeeded` ต่อเมื่อ projection สำเร็จและอ่านกลับได้; หาก projection ล้มเหลวให้คง run เป็น `projection_pending` หรือ `partial_success` และ retry เฉพาะ projection ได้

ห้ามข้ามข้อ 2 หรือ 4, ห้ามส่ง prompt จาก client โดยไม่ผ่าน skill runner, และห้ามสร้างภาพจาก fallback prompt ที่ runner ประกอบเองเมื่อ skill ให้ response ไม่ครบ

### 8.2 Cute Child adapter

Adapter v3 ส่ง canonical request รูปแบบนี้ต่อ shot โดยเปลี่ยนเฉพาะ shot-specific input ที่ schema รองรับ:

```json
{
  "skill_id": "cute_child_image_generator",
  "skill_version": "3.0.0",
  "execution_mode": "prompt_only",
  "input": {
    "idea": "global story idea",
    "character_reference_images": [{"asset_id": "..."}],
    "identity_lock_mode": "strong",
    "scene_mode": "...",
    "scene_detail": "shot scene description",
    "custom_activity": "shot visual action",
    "custom_notes": "continuity, story type, dialogue/on-screen constraints",
    "style_mode": "...",
    "aspect_ratio": "9:16"
  }
}
```

`generation_prompt` และ `generation_request.prompt` เป็น canonical prompt ตาม guide ของ skill; persistence, preview และ downstream image execution ต้องใช้ค่าดังกล่าวตรง ๆ ไม่ split/rebuild/shorten โดยอัตโนมัติ หากมี intentional customization ในอนาคต ต้องเก็บ `promptSource`, `basePromptHash`, `customizationReason` และแสดงใน audit

### 8.3 Image request boundary

Image core รับ:

```ts
type ImageGenerationHandoff = {
  runId: string;
  shotId: string;
  modelId: string;
  modelOptions: Record<string, unknown>;
  prompt: string; // generation_request.prompt exactly
  aspectRatio: "9:16";
  referenceAssets: { mediaAssetId: string; role: "identity_reference" | "scene_reference" }[];
  idempotencyKey: string;
};
```

provider-facing URL resolution ต้องเกิดใน media core ด้วย owner-checked managed assets; ไม่เก็บ local path/private URL ใน job หรือ prompt payload ที่ user แก้ได้

`generation_request` ที่ skill คืนมาต้องถูก persist และส่งต่อเป็น canonical payload ทั้ง object โดยไม่ drop field, split prompt หรือประกอบ payload ใหม่เอง การเปลี่ยนเฉพาะ transport-bound values เช่น provider model ID, quality option หรือการ resolve `{asset_id}` เป็น provider input ต้องทำที่ Image Core adapter พร้อมเก็บ `originalGenerationRequest` และ `effectiveProviderRequest` แยกกัน; ค่า prompt ใน effective request ต้องเท่ากับ `generation_request.prompt` ทุกครั้ง

## 9. Video prompt builder

Video prompt builder ใช้:

- planned shot purpose/action/continuity
- story type และ structured dialogue lines
- generated `imageAssetId` เป็น visual reference
- selected video model capabilities/dialect
- 10 sec และ 9:16

ผลลัพธ์:

```ts
type VideoPromptResult = {
  prompt: string;
  modelId: string;
  imageReferenceAssetId: string;
  durationSec: 10;
  aspectRatio: "9:16";
  dialogueLines: DialogueLine[];
  source: "storyboard_skill_framework";
  builderVersion: string;
};
```

ถ้า image generation สำเร็จแต่ video prompt สร้างไม่ได้ ให้ shot เป็น `partial_success` พร้อม retry ได้เฉพาะ stage นี้เมื่อ deterministic retry เพียงพอ; ห้ามลบภาพสำเร็จหรือ rerun image โดยไม่ขอผู้ใช้

## 10. Shared Character Library

### 10.1 Canonical ownership model

สร้าง shared library ที่ tenant/user scoped แยกจาก `vertical_drama_characters` เดิม ดังนี้:

```text
character_library_characters
character_library_revisions
character_library_looks
character_library_assets
character_library_aliases (recommended)
character_library_bindings
storyboard_skill_projects
storyboard_skill_project_characters
```

ทุกตารางมี tenant/user ownership, created/updated timestamps, soft-delete/status ตาม convention ของ repo และ index สำหรับ owner + normalized name/key + binding target

`character_library_revisions` เป็น immutable snapshot ของ character + look references + skill input/DNA metadata ที่ใช้สำหรับ import, conflict diff และ reproducible run; update ทุกครั้งสร้าง revision ใหม่ใน transaction เดียวกับ current pointer ไม่ overwrite revision เดิม

อย่างน้อยต้องมี `id`, `characterId`, monotonic `revisionNumber`, `snapshotJson`, `sourceSurface?`, `createdBy`, `createdAt` และ unique `(characterId, revisionNumber)`; asset references ใน snapshot ต้องเป็น logical `mediaAssetId` พร้อม role ไม่ใช่ signed URL

### 10.2 Character record

`character_library_characters` ต้องมีอย่างน้อย:

- `id`
- `tenantId`, `userId`
- `characterKey` immutable และ unique ต่อ owner
- `name` mutable display name
- `status` (`active`, `archived`)
- `skillId`, `skillVersion`
- `skillInputSnapshot` ที่ redacted และมี managed asset IDs
- `identityDna`/face-lock metadata ตาม semantics ของ Drama panel
- role, region, speech/casting metadata ที่ shared contract รองรับ
- `currentRevision` และ revision timestamps
- auto-name source (`user`, `generated`, `fallback`) และ alias/name history

ไม่เก็บ provider response ที่มี secret และไม่ถือ raw image URL เป็น canonical identity

### 10.3 Looks

`character_library_looks` รองรับ parity กับ Drama Series:

- label/name และ editable description
- `variantType`: `outfit` หรือ `age_stage`
- `skillInputPatch` สำหรับ skill-driven regeneration
- reference media asset, primary portrait, approval/QC/status
- current revision, created/updated, archivedAt

look ใหม่ต้องไม่เปลี่ยน face identity ของ parent โดยอัตโนมัติ หากผู้ใช้ต้องการ character ใหม่ต้องกด create character แยก

### 10.4 Saving a new character from the framework flow

ใน Character step ผู้ใช้เลือกได้ว่า:

- `Use existing character` — bind library character/look snapshot
- `Create new reusable character` — สร้าง library character จาก skill ID/version + identity-relevant dynamic input ก่อน enqueue และให้แก้ชื่อ/รายละเอียดได้
- `Do not save` — ใช้ character context เฉพาะ run (ถ้า policy ของ skill อนุญาต)

ค่าเริ่มต้นของ `Create new reusable character` เป็นเปิดเมื่อเลือก skill character ใหม่ แต่ต้องแสดงผลใน confirmation อย่างชัดเจน การสร้าง record ไม่คิด credit; รูป shot ที่เกิดจาก run เป็น `candidate` หรือ `story_reference` เท่านั้น ไม่ถูกตั้งเป็น primary portrait/approved identity โดยอัตโนมัติ ผู้ใช้ต้องกด promote ใน Characters tab เอง

ถ้า user สร้าง character ผ่าน Characters tab โดยตรง ให้ใช้ generation action และ credit confirmation ของ CharacterStockController ตาม Drama semantics; ถ้าสร้างจาก wizard ให้ใช้ job confirmation เดียวและระบุว่า image generation ของ run ไม่ใช่ character portrait generation แยก

### 10.5 Assets and candidate semantics

`character_library_assets` link ไปยัง existing `media_assets` โดยไม่ duplicate bytes และต้องรองรับ role ที่ Drama ใช้ เช่น portrait, reference, candidate, sheet, angle pack, approved start/reference frame ตาม shared enum ที่ตกลงก่อน migration

ต้องคง behavior ต่อไปนี้:

- set primary portrait
- add/remove reference asset
- candidate batch, candidate status, select/promote candidate
- image lightbox/preview และ recovery ของ failed generation
- generate character image, sheet และ angle pack ผ่าน selected model
- QC/approval/status badge และ audit generation metadata

การ generate portrait, look, sheet หรือ angle pack จาก Characters tab ต้องเรียก skill adapter ของ character นั้นใน `prompt_only` mode แล้ว handoff canonical `generation_request` เข้า Image Core เช่นเดียวกับ storyboard run; ห้ามสร้าง character prompt hardcode ใน shared panel/controller และต้องใช้ credit confirmation ของ action เดิม

candidate ที่ยังไม่ promote ต้องไม่กลายเป็น identity reference โดยอัตโนมัติ

### 10.6 Full Drama Series parity

Characters tab ของ Skill Storyboard ต้องมี capability parity กับ `VerticalDramaCharacterStockPanel` ในส่วนที่เปิดใช้ได้:

- list/search/select character
- create character
- edit name, role และ profile/DNA fields
- delete/archive พร้อม dependent check
- add/edit/delete look และ variant
- link/unlink reference/portrait assets
- set primary portrait
- generate/regenerate portrait
- generate sheet และ angle pack
- candidate batch, select/promote, retry/recovery
- image preview/lightbox
- identity lock, continuity metadata และ QC/approval
- role/region/casting/speech profile/voice fieldsตาม feature flags
- reference picker จาก upload/library/history
- twin/merge/relation review ตาม shared capability ที่เปิดอยู่

feature flags เช่น `voiceChainEnabled`, `characterProfilesEnabled`, `videoSafeStartFramesEnabled` ต้องยังคุม capability เหมือน Drama เดิม ไม่เปิด generation หรือเสียงเพิ่มเพียงเพราะใช้ shared component

## 11. Shared UI/controller and owner adapters

ห้าม copy `VerticalDramaCharacterStockPanel` ทั้งไฟล์ไปแก้แยกกัน ให้แยกเป็น:

```text
CharacterStockController
CharacterStockPanel (presentational/shared)
DramaSeriesCharacterOwnerAdapter
SkillStoryboardCharacterOwnerAdapter
```

owner adapter แปลง contract ระหว่าง shared library กับ source เดิม:

- Drama adapter เรียก existing `verticalDramaCharacters` CRUD/generation APIs และคง series owner checks
- Storyboard adapter เรียก `characterLibrary` APIs และ project binding APIs
- shared panel ไม่รู้จัก `seriesId` หรือ `reviewId` โดยตรง; รับ owner context/capabilities/action callbacks
- state machine ของ loading, candidate polling, delete confirmation, merge/recovery ต้องอยู่ที่ controller/shared hook เพื่อไม่ให้ behavior drift

การ refactor ต้องใช้ `codebase_impact` เมื่อ tool พร้อม และต้อง regression-test Drama ทั้งชุดก่อนเปิด Storyboard tab

### 11.1 Auto naming

เมื่อสร้างตัวละครใหม่โดยไม่ระบุชื่อ server สร้างชื่อ deterministic เช่น `Child Character 01` หรือ localized equivalent โดยใช้ counter ที่ scope owner และ retry-safe; ถ้าชนกันเพิ่ม suffix ที่ deterministic

ผู้ใช้แก้ display `name` ได้ตลอด; `characterKey` ไม่เปลี่ยน ชื่อที่ snapshot ใน storyboard run/shot จะคงค่าตอนยืนยันงานเพื่อให้ประวัติ reproducible

## 12. Cross-surface exchange

ทุก action ต้อง explicit, แสดง source/target/จำนวน asset/lineage และ confirmation เมื่อมีการสร้าง record หลายรายการ:

| action | result | generation/credit |
|---|---|---|
| Drama → Library: Publish | สร้าง library snapshot + relation ไปยัง media assets เดิม | ไม่ generate ไม่คิด credit |
| Library → Storyboard: Use in project | เพิ่ม project binding พร้อม selected look/source revision | ไม่ generate ไม่คิด credit |
| Library → Drama: Import to Series | สร้าง series-local character ผ่าน existing owner-scoped CRUD และ link assets เดิม | ไม่ generate ไม่คิด credit |
| Drama → Storyboard | ผ่าน publish/use หรือ explicit adapter ที่สร้าง snapshot | ไม่ mutate source |
| Sync latest | ผู้ใช้สั่งเอง; สร้าง proposed changes/diff ก่อน apply | ไม่เงียบ ไม่ลบ local edits |

การใช้ character จาก library ที่สร้างด้วย skill คนละชนิดกับ selected skill ให้ทำได้เฉพาะเมื่อ target skill ประกาศรับ external reference images และ adapter map ได้อย่างปลอดภัย: ส่งเฉพาะ managed identity/reference assets ที่ user เลือก, แสดง compatibility warning และเก็บ source skill metadata; ห้ามแปลง DNA/ฟิลด์ของ skill เดิมเป็น target input แบบเดาเอง หาก map ไม่ได้ต้อง block พร้อมให้ใช้ skill เดิมหรือสร้าง character ใหม่

`exportSnapshot({ characterId, lookId? })` ต้องคืน signed/short-lived manifest ที่อ้างอิง logical asset IDs และ revision/skill metadata สำหรับการ import ในระบบเดียวกันหรือ export artifact ที่ได้รับอนุญาตเท่านั้น ไม่คืน secret/provider token และไม่ทำให้ผู้รับเข้าถึง asset ได้โดยไม่ผ่าน owner/share authorization

Import/export rules:

- เก็บ `sourceSurface`, `sourceCharacterId`, `sourceRevision`, `sourceAssetIds`, `importedAt`, `importedBy`
- conflict ที่ชื่อ/look/asset/DNA ต่างกันแสดง diff และให้เลือก keep target, apply source, หรือ duplicate look
- source ถูก archive/delete ภายหลัง target ยังอยู่; แสดง `source unavailable` banner และห้าม cascade delete target
- การ import ที่ชื่อซ้ำไม่ overwrite; ใช้ stable key ใหม่และ alias/search relation
- ไม่ส่ง asset binary ซ้ำและไม่สร้าง provider generation เพียงเพื่อ import

## 13. Data model and persistence

### 13.1 Storyboard framework tables

ชื่อจริงปรับตาม Drizzle convention ได้ แต่ต้องมี semantic เทียบเท่านี้:

`storyboard_skill_runs`

- `id`, `tenantId`, `userId`
- required `projectId`
- `reviewId` nullable until projection is created
- title, idea, storyType, targetPlatform, language, productContext
- totalShots (2–12), shotDurationSec (10), aspectRatio (`9:16`)
- selected skill ID/version/schemaHash and redacted normalized dynamic input snapshot
- image/video model IDs and normalized options snapshot
- reference asset IDs snapshot
- estimated/authorized/settled credit metadata, confirmation fingerprint
- status, idempotencyKey unique per owner, errorCode/errorMessage safe for UI
- created/updated/started/completed/cancelled timestamps

`storyboard_skill_shots`

- `id`, runId, shotNumber unique per run
- beat, purpose, visual action, scene description, continuity JSON
- audioMode, dialogueLines JSON, durationSec
- prompt stage status and attempts
- redacted skill input snapshot, raw response pointer/redacted response, canonical generation prompt hash/value
- generation request JSON, image model/options snapshot
- managed `imageAssetId`, provider request ID, image status/QC
- video prompt/result JSON, video model snapshot, builder version
- error/retry metadata, created/updated timestamps

`storyboard_skill_projects`

- `id`, `tenantId`, `userId`, title, status (`draft`, `active`, `archived`)
- nullable `reviewId`, nullable `activeRunId`, created/updated timestamps
- latest project-level character binding revision and archive metadata
- one active run at a time in v1; later runs retain prior run history and require explicit creation

`storyboard_skill_project_characters`

- required `projectId`, `libraryCharacterId`, selectedLookId nullable
- `nameSnapshot`, `sourceRevision`, role/order, binding status
- unique active binding `(projectId, libraryCharacterId, selectedLookId)` as appropriate
- optional `runId`/`shotScope` only for a run-local override; never mutate the project binding in place

`character_library_bindings`

- `id`, owner scope, `libraryCharacterId`, `surfaceType`, `surfaceEntityId`, `surfaceCharacterId`
- binding mode (`snapshot`), `sourceRevision`, `localSnapshot`, status (`active`, `source_unavailable`, `detached`)
- created/updated/imported metadata, conflict state and unique active source/target relation

### 13.2 Review projection

หลัง run มีข้อมูลพอสำหรับ Review ให้สร้าง/อัปเดต `media_studio_storyboard_reviews` ผ่าน existing save boundary โดย projection adapter ต้องสร้าง task shape ที่ `StoryboardReviewPage` ปัจจุบันอ่านได้ รวมถึง ordered video-task metadata, image asset/thumbnail references และ prompt fields; ห้ามให้ UI ใหม่ต้องอ่าน tables ใหม่โดยตรงใน v1

โดย `reviewData.skillFramework` ต้องมี:

- project ID, run ID/status, skill ID/version, schema hash
- global brief, story type, N, duration, platform, language
- model selections/options, reference asset IDs (metadata only)
- ordered tasks จำนวน N
- ต่อ task: shot ID/number/beat, image asset ID, canonical image prompt source/hash, video prompt source/hash, dialogue lines, `storyboardContext.extraParams`

Top-level run/shot tables เป็น source of truth; reviewData ต้องไม่เป็นที่เดียวที่เก็บข้อมูลสำคัญและต้อง rebuild projection ได้ idempotently

Existing manual reviews ที่ไม่มี `skillFramework` ต้องเปิดได้เหมือนเดิม

### 13.3 Migration and deletion

- migration เป็น additive และ backward compatible
- ไม่ backfill Drama characters ใน first release; มี explicit publish/import ภายหลัง
- foreign keys และ owner indexes ต้องตรวจด้วย migration test
- soft delete/archival ของ run ไม่ลบ media assets ที่ผู้ใช้สร้างเองโดยอัตโนมัติ
- ลบ character library ต้องตรวจ project bindings/imported snapshots; block หรือ archive ตาม policy และแสดงผลกระทบก่อนยืนยัน
- archive project ต้องหยุด draft ที่ยังไม่ยืนยัน, ขอ cancel สำหรับ run ที่กำลังทำงาน และเก็บ review/run/character snapshots แบบอ่านได้; ไม่ลบ media assets หรือ source library characters
- `createRunFromProject` สร้าง run ใหม่จาก project snapshot หลัง run เดิมจบ/ถูกยกเลิกเท่านั้น และต้องระบุการเปลี่ยน input/model ใน confirmation ใหม่

## 14. API/router/service contracts

ชื่อ router ปรับตาม repo convention ได้ แต่ behavior ต้องตรง contract นี้

### 14.1 `storyboardSkillFramework` router

```text
listCompatibleSkills()
getSkillSchema({ skillId, version? })
estimate({ normalizedDraft })
createDraft({ normalizedDraft, idempotencyKey })
createRunFromProject({ projectId, normalizedDraft, idempotencyKey })
confirmAndStart({ runId, confirmationFingerprint })
getRun({ runId })
getProject({ projectId })
updateDraft({ projectId, patch })
archiveProject({ projectId })
rebuildReviewProjection({ runId })
cancel({ runId })
retryShots({ runId, shotIds, confirmationFingerprint })
getProjectCharacters({ projectId })
bindProjectCharacter({ projectId, libraryCharacterId, lookId? })
unbindProjectCharacter({ projectId, libraryCharacterId })
```

`estimate`, schema read และ draft creation ห้าม provider generation; `confirmAndStart` เป็นจุดเดียวที่เปลี่ยนจาก awaiting confirmation ไป queued/paid execution

`confirmAndStart` ต้องตรวจ user/tenant ownership, run status, fingerprint, model access, skill snapshot, references, credits และ idempotency ก่อน enqueue; ถ้ากดซ้ำให้คืน run เดิม ไม่สร้าง charge/job ซ้ำ

`createDraft`/`createRunFromProject` ต้องคืน `{ projectId, runId, status: "awaiting_confirmation", normalizedSnapshot }`; การสร้าง project/run และ idempotency record ต้อง atomic เพื่อไม่ให้ refresh สร้าง project ซ้ำ

### 14.2 `characterLibrary` router

```text
list({ query, status, cursor })
get({ characterId })
create({ name?, skillId, skillVersion, skillInput })
update({ characterId, patch })
archive/delete({ characterId })
createLook({ characterId, ... })
updateLook({ lookId, patch })
archiveLook({ lookId })
linkAsset/unlinkAsset({ characterId, lookId?, mediaAssetId, role })
setPrimaryPortrait({ characterId, assetId })
generateCharacterImage/sheet/anglePack({ characterId, lookId?, modelId, ... })
listCandidates/selectCandidate({ characterId, ... })
exportSnapshot({ characterId, lookId? })
publishFromDrama({ seriesId, characterId, ... })
importToStoryboard({ projectId, libraryCharacterId, lookId? })
importToDrama({ seriesId, libraryCharacterId, lookId? })
previewSyncLatest({ bindingId })
applySyncLatest({ bindingId, resolution })
```

ทุก mutation ต้อง owner-scope ทั้ง source และ target; import/export response ต้องคืน lineage และ changed fields เพื่อให้ UI แสดงผลได้

### 14.3 Existing API compatibility

- existing `verticalDramaCharacters` procedures remain supported
- existing `saveStoryboardReview` remains compatible with manual reviewData
- new adapter อาจเรียก existing procedures/service ภายใน แต่ไม่ bypass credit, auth, asset resolver หรือ dependent checks
- API errors ต้องมี stable `code`, user-safe message, retryability และ correlation/run ID

## 15. Durable job state and recovery

### 15.1 Statuses

Run status:

```text
awaiting_confirmation
queued
planning
prompting
image_generating
video_prompting
projection_pending
partial_success
succeeded
failed
cancel_requested
cancelled
```

Shot status แยกอย่างน้อย `pending`, `prompting`, `image_generating`, `image_succeeded`, `video_prompting`, `succeeded`, `failed`, `cancelled`

Transitions ต้อง monotonic และ validate บน server; worker restart ต้อง resume จาก persisted shot state. Persist result ก่อนประกาศ success และห้ามมี sync fallback ที่ข้าม queue/charge boundary

### 15.2 Retry/cancel

- cancel ก่อน provider dispatch หยุดได้; หลัง provider dispatch ใช้ cancel_requested และไม่อ้างว่ายกเลิกสำเร็จจน provider/result boundary ยืนยัน
- retry shot ที่ failed/partial เท่านั้น; completed prompt/image/video prompt ไม่ถูกเขียนทับ
- retry ใช้ same input snapshot และ new attempt ID; เปลี่ยน model/skill ต้องเป็น new confirmation หรือ new run ตาม policy
- worker duplicate delivery ต้อง idempotent ด้วย `(runId, shotId, stage, attemptId)` และ provider idempotency key
- partial success เปิด review ได้พร้อม badge/repair action; failed run ต้องเก็บสาเหตุที่แก้ไขได้และไม่ทำให้ภาพสำเร็จหาย

## 16. Credits, provider access, and safety

### 16.1 Confirmation and billing

Cost estimate ต้องแยกอย่างน้อย image generation ต่อ N shots และ optional future video generation; แสดง model, quality, refs, N, retry policy, estimated range/unknown provider surcharge

มี confirmation เดียวก่อน paid image calls:

```text
draft → awaiting_confirmation → confirmAndStart → queued
```

charge/reservation ต้องผูกกับ run/shot/attempt และ settlement หลัง provider result ถูก persist; failed/cancelled policy ต้องสอดคล้องกับ billing service เดิม ไม่สร้าง ad-hoc credits ใน router

### 16.2 Access and fail-closed rules

- selected provider/model ต้อง configured และ accessible ก่อน confirm
- MCP/provider readiness เป็น action guard ไม่ใช่เหตุให้ซ่อนข้อมูล model ที่ user มีสิทธิ์เห็น
- ไม่ fallback engine/provider/model อย่างเงียบ ๆ
- provider rate limit/credit limit เป็น retryable หรือ blocked ที่ชัดเจนตาม error code

### 16.3 Child-safety and content handling

สำหรับ cute child skill ต้องคง safety text/constraints ของ v3 runtime และ reject/flag content ที่ขัด policy ก่อน provider call; UI ต้องไม่แสดง raw unsafe provider error แทนข้อความที่เหมาะสม

Reference assets และ character DNA เป็น user-owned creative data: tenant isolation, signed/authorized retrieval, audit access, deletion semantics และ retention ต้องเหมือน managed media baseline

## 17. Error and empty-state contract

| state/error | UI behavior | recovery |
|---|---|---|
| no compatible skill | empty state + admin/config hint | use New Blank or retry registry load |
| schema unavailable/invalid | skill disabled + reason | admin fixes bundle/registry |
| required dynamic field missing | inline field errors + focus first invalid | edit form |
| too many refs/model cap | blocking message with count/model cap | remove refs or change model |
| insufficient credits/access denied | no provider call; actionable message | change model/account/credits |
| skill prompt failure | affected shot failed, prior shots preserved | retry failed shot |
| image provider failure | no fake image; shot failed/partial | retry with same or explicitly changed model |
| video prompt failure | image preserved; video prompt retry | retry builder stage |
| review projection failure | run remains recoverable and review is not reported complete | retry/rebuild projection only |
| worker offline | queued/running status with stale-time warning | resume via worker/ops |
| refresh/browser close | resume from durable run | reopen run |
| source character unavailable | target remains, lineage warning | keep local or choose another source |
| import conflict | diff dialog, no mutation until choice | keep/apply/duplicate |

## 18. UI/UX implementation contract

### 18.1 Target user and JTBD

Target คือ creator ที่ต้องการทำ vertical short video จาก idea เดียวและรักษาตัวละครเดิมหลายโปรเจกต์
JTBD: “เมื่อมี idea และ character skill ฉันต้องสร้าง storyboard 2–12 ช็อตพร้อมภาพและ video prompt ที่ต่อเนื่องได้ โดยไม่ต้องประกอบ prompt เอง และนำตัวละครกลับมาใช้ซ้ำได้”

### 18.2 Visual direction

ใช้ visual language เดิมของ Storyboard Review: light workspace, blue/cyan primary action, card-based progress, readable Thai labels, clear status badges และ destructive action สีแดงตาม design system เดิม ไม่สร้าง modal เล็กซ้อนหลายชั้นสำหรับ primary flow

Full-screen wizard ต้องมี:

- header: back, title, draft status, close
- progress stepper ที่ keyboard accessible
- main form/content area ที่ scroll ได้อย่างชัดเจน
- sticky footer: back/next หรือ cancel/confirm ตาม state
- right summary rail บน desktop และ collapsible summary บน mobile
- progress screen แสดง N shot cards พร้อม stage/status/error/retry

### 18.3 Surface inventory

| surface | required states |
|---|---|
| New Project menu | manual/framework, keyboard focus, loading |
| Full-screen wizard | loading, empty, valid, invalid, dirty, schema warning |
| Skill selector | compatible list, no result, disabled reason, selected |
| Dynamic skill form | required/error/dependency/conditional/disabled |
| Reference picker | 0–5, upload progress, invalid file, remove, lightbox |
| Model selectors | loading/access denied/quality options/unsupported capability |
| Cost confirmation | estimate, fingerprint mismatch, insufficient credits |
| Run progress | queued/stale/per-shot/progress/partial/cancel/retry |
| Characters tab | empty/list/search/create/edit/look/candidates/assets/import/export/conflict |
| Storyboard Review | N tasks, image prompt/video prompt/dialogue metadata, partial retry |

### 18.4 Component map

- `StoryboardProjectTypeMenu` — preserves existing New Blank and adds framework entry
- `SkillStoryboardWizard` — shell/state machine
- `StoryboardBriefForm` — global fields and story type
- `CompatibleSkillPicker` — registry-filtered skills
- `DynamicSkillForm` — existing schema renderer with parent-owned field exclusion
- `StoryboardReferencePicker` — wraps managed `ImageSourcePicker`
- `StoryboardModelSelection` — wraps model selector and conditional quality
- `StoryboardCostConfirmation` — one job-level credit confirmation
- `StoryboardRunProgress` — durable run polling and per-shot actions
- shared `CharacterStockPanel` + `CharacterStockController`
- `DramaSeriesCharacterOwnerAdapter` / `SkillStoryboardCharacterOwnerAdapter`
- `CharacterImportExportDialog` / `CharacterSyncDiffDialog`

### 18.5 State matrix

| area | idle | loading | success | error | partial/recovery |
|---|---|---|---|---|---|
| schema | choose skill | skeleton | fields | disabled reason | reload |
| upload | drop/add | per-file progress | thumbnails | per-file error | remove/retry file |
| models | unselected | fetching | selected/options | inaccessible | change model |
| wizard | draft | saving | next enabled | inline errors | resume draft |
| run | awaiting confirmation | queued/running | shot result | stable error | retry failed only |
| characters | empty/list | action pending | saved | owner/conflict error | recovery/candidate retry |

### 18.6 Responsive matrix

ต้องทดสอบอย่างน้อย:

| viewport | requirement |
|---|---|
| mobile 390×844 | single-column, sticky footerไม่บัง form, summary collapsible, shot cardsไม่ overflow |
| tablet 768×1024 | two-column เมื่อเหมาะสม, dynamic fieldsอ่านง่าย, dialog fit viewport |
| desktop 1440×900 | full-screen shell, form + summary rail, N shot progress visible |
| small mobile 320×800 | labels/controlsไม่ถูกตัด, horizontal overflowไม่เกิด |
| laptop 1366×768 | footer/headerไม่ทับ content, scroll boundaryชัด |
| wide desktop 1920×1080 | content max-widthไม่ยืดจนอ่านยาก |

### 18.7 Accessibility

- semantic form labels และ error association ทุก field
- keyboard navigation ครบสำหรับ stepper, selector, upload/remove, tabs, dialogs และ retry
- focus trap/restore ใน full-screen dialogs and import conflict dialog
- status updates ใช้ `aria-live` แบบไม่ spam ต่อ shot
- color ไม่เป็นสัญญาณเดียว; status มี text/icon
- touch targets อย่างน้อยตาม design system, visible focus, contrast ผ่าน WCAG AA
- reduced-motion mode สำหรับ progress/polling animations
- screen reader อ่าน N, duration, current stage และ error/retry action ได้

### 18.8 Copy contract

ใช้ข้อความภาษาไทยเป็นหลักและเก็บศัพท์ technical ในวงเล็บเมื่อจำเป็น:

- `สร้างโปรเจกต์ด้วย Skill Framework`
- `ไอเดียเรื่อง`
- `จำนวนช็อต (2–12)`
- `10 วินาทีต่อช็อต`
- `รูปอ้างอิงตัวละคร (ไม่บังคับ, สูงสุด 5 รูป)`
- `คุณภาพภาพ` แสดงเฉพาะเมื่อ model รองรับ
- `ยืนยันและเริ่มสร้าง`
- `กำลังสร้างพรอมต์ / กำลังสร้างภาพ / กำลังเตรียมพรอมต์วิดีโอ`
- `สร้างใหม่เฉพาะช็อตที่ล้มเหลว`
- `นำเข้าตัวละครเป็นสำเนาแบบ snapshot` และ `ต้นฉบับจะไม่ถูกเปลี่ยน`

ห้ามใช้ copy ที่สื่อว่า “สร้างวิดีโอเสร็จแล้ว” เมื่อ v1 เพียงสร้าง video prompt

### 18.9 Browser evidence required

ก่อนถือว่า UI พร้อมต้องมี browser evidence ของ:

1. เปิดจาก Storyboard Review และ New Blank ยังทำงาน
2. สร้าง framework draft และ dynamic form จาก cute child schema
3. 0 และ 5 refs; upload/remove/lightbox
4. quality hidden เมื่อ unsupported และแสดง `xhigh` เมื่อ configured
5. เลือก 2, 9, 12 shots และเห็นจำนวน task/เวลาใน summary ถูกต้อง
6. mime/dialogue/hybrid validation
7. confirmation เดียว, run progress, partial failure/retry
8. Characters tab CRUD/look/candidate/asset and import/export conflict
9. mobile 390×844, tablet 768×1024, desktop 1440×900

## 19. Security, privacy, and tenancy

- ทุก query/mutation/run poll ตรวจ `tenantId` + `userId`/role + surface owner
- ห้ามเชื่อ `seriesId`, `reviewId`, `characterId`, `mediaAssetId` จาก client โดยไม่ resolve ownership
- skill input snapshot ต้อง redact secrets, provider tokens, signed URLs ที่หมดอายุได้
- managed media resolver ต้องตรวจสิทธิ์ก่อนออก provider URL
- asset ของ tenant A ห้ามถูกส่งเข้า job ของ tenant B แม้ ID จะถูกเดา
- import/export audit log ต้องระบุ actor, source, target, revisions และจำนวน assets
- child image requests ใช้ policy check เดียวกับ skill runtime; logging ต้องหลีกเลี่ยงข้อมูลส่วนบุคคลเกินจำเป็น
- rate limit schema, draft, run, retry และ import endpoints ตาม existing conventions

## 20. Observability and audit

ทุก run/shot log ต้องมี structured fields:

```text
runId, shotId, tenantId, userId, skillId, skillVersion, schemaHash,
imageModelId, videoModelId, stage, attemptId, providerRequestId,
status, latencyMs, creditReservationId, errorCode
```

ห้าม log full user idea, full child reference URL หรือ secret โดยไม่ redact policy รองรับ

Metrics อย่างน้อย:

- wizard start → confirmation conversion
- schema load/validation failure
- run success/partial/failure by stage
- per-shot latency and retry rate
- provider/model error rate
- credits estimated/reserved/settled/refunded
- character reuse/import/export and conflict rate

Audit events อย่างน้อย `run.created`, `run.confirmed`, `shot.prompted`, `shot.image_succeeded`, `shot.video_prompted`, `run.cancelled`, `shot.retried`, `character.created/updated/imported/exported/synced`

## 21. Feature flags, rollout, and migration gates

แนะนำ flags:

```text
storyboardSkillFrameworkEnabled=false
storyboardSkillFrameworkCuteChildEnabled=false
storyboardCharacterLibraryEnabled=false
storyboardCharacterInteropEnabled=false
```

rollout:

1. migration/schema/service behind flags; no visible UI
2. enable registry normalization and schema validation in non-production
3. enable wizard with estimate-only cohort
4. enable paid run for internal users; verify billing/idempotency
5. enable Characters tab and explicit interop
6. gradual tenant rollout with metrics and rollback switch

เปิด flag ไม่ควรทำให้ manual review หรือ Drama tab หาย หาก registry/worker/media core ไม่พร้อม ให้ framework action disabled พร้อมเหตุผล แต่ `New Blank Project` ต้องยังใช้งานได้

Deployment gate ต้องแยกหลักฐาน: migration applied, web build, worker release/runtime compatibility, authenticated browser smoke, provider credentials/access, billing smoke และ production health. `/healthz` เพียงอย่างเดียวไม่ใช่หลักฐานว่า feature deploy แล้ว

## 22. Test plan

### 22.1 Unit/schema tests

- global schema accepts N=2,9,12 and rejects 1,13,decimal/negative/string
- shotDuration accepts 10 only; total duration calculation
- mime/dialogue/hybrid normalized contracts
- deterministic auto-name collision/retry
- skill root/imported bundle ID/version normalization and schemaHash
- project draft exists independently of run/review and Characters tab is available before confirmation
- parent-owned field exclusion/mapping and dynamic dependencies
- canonical prompt equality: stored prompt equals `generation_prompt` and `generation_request.prompt`
- ref count 0..5, asset ownership, model reference cap
- conditional quality options and unknown-option rejection
- narrative planner returns exact N and valid beat/audio/dialogue invariants
- video prompt builder preserves dialogue and image asset reference
- full `generation_request` preservation, projection-pending recovery and idempotent Review projection
- library revision, alias, binding, conflict diff and no-source-mutation behavior
- immutable revision numbering, project binding uniqueness and run-local override isolation

### 22.2 API/service tests

- list filters only compatible character prompt skills
- invalid skill/version/schema/capability is blocked
- preview/estimate never calls paid provider
- createDraft/confirm fingerprint and idempotency
- create/update project draft and project-to-run/review lifecycle
- run/shot monotonic transitions, persist-before-success, worker resume
- retry only failed stages and no duplicate settlement
- tenant/user/series/review/media ownership on every procedure
- model access, quality, aspect ratio, duration and reference validation
- projection into existing review with 2–12 tasks and legacy review compatibility
- Review projection emits the existing task shape and can be rebuilt without duplicate tasks
- character CRUD/look/assets/candidates/sheet/angle pack parity through adapters
- Drama → Library → Storyboard and Library → Drama snapshot imports
- export manifest authorization and no direct asset access from a leaked manifest
- conflict/source deletion behavior and audit records

### 22.3 Component/browser tests

- New Project menu leaves New Blank unchanged
- wizard full-screen keyboard/escape/dirty state
- schema-driven fields render from fixture, not skill-specific JSX
- upload 0–5, remove, invalid file, lightbox
- model quality conditional visibility
- shot selector 2/9/12 and summary math
- all three story types and dialogue persistence after image approval
- confirmation one time; progress polling and partial retry
- Characters tab full parity smoke and import conflict flow
- Characters tab works before any run and new wizard character is saved as candidate, not auto-approved portrait
- responsive/accessibility viewports in §18.6

### 22.4 Provider/credit boundary tests

ใช้ mocked provider/media core ใน CI; ห้ามใช้ real paid provider หรือ real credit ใน unit/integration test. Authenticated staging smoke ต้อง explicit environment, bounded model, known test tenant และ cleanup policy

## 23. Acceptance criteria

1. หน้า Storyboard Review มี New Project แบบ Skill Framework และ New Blank เดิมไม่เปลี่ยน
2. wizard เป็น full-screen และอ่าน field จาก selected skill schemas
3. selector แสดงเฉพาะ character-prompt-compatible skill และ cute child v3 resolve เป็น ID/version เดียวถูกต้อง
4. user ใส่ idea, story type, platform, language, product context ได้
5. user เลือก 2–12 shots; default 9; ทุก shot 10 sec; total duration ถูกต้อง
6. user แนบ reference 0–5 ภาพได้ และทุกภาพเป็น managed asset ที่มี ownership
7. user เลือก image/video model; quality แสดงเฉพาะ model ที่รองรับ และ invalid option ถูก reject ฝั่ง server
8. preview/estimate ไม่มี paid provider call และมี credit confirmation เดียวก่อน run
9. run วางแผนจำนวน shot ตรงกับ N และรองรับ mime/dialogue/hybrid โดย dialogue ไม่หาย
10. ทุก shot เรียก skill `prompt_only` และใช้ `generation_prompt`/`generation_request.prompt` canonical โดยไม่ rebuild อัตโนมัติ
11. ทุก shot ได้ image prompt, generated managed image (เมื่อ provider สำเร็จ) และ video prompt
12. existing Storyboard Review แสดง N tasks พร้อม shot/image/video prompt/dialogue metadata และเปิด partial success ได้; projection failure กู้คืนได้โดยไม่สร้าง task ซ้ำ
13. worker restart, duplicate delivery, cancel และ retry failed shots ไม่ทำให้ผลสำเร็จหายหรือ charge ซ้ำ
14. project มี `Storyboard`, `Characters`, `Run details` tabs; Characters tab เปิดใช้ได้ก่อน run และมี full Drama parity ตาม §10.6 ผ่าน shared component/controller
15. ชื่อตัวละคร auto-generate ได้เมื่อว่าง, user edit ได้, `characterKey` และ lineage ไม่เปลี่ยน
16. ตัวละครจาก Drama publish/import มาใช้ใน Storyboard ได้ และ reverse import เข้า Drama ได้โดยไม่ generate/ไม่ mutate source
17. conflict/source deletion แสดงชัดและไม่ลบ target เงียบ ๆ
18. ทุก route มี tenant/user/asset/provider ownership checks
19. responsive/accessibility/browser evidence ครบตาม §18.6 และ New Blank/Drama regression ผ่าน
20. migration, feature flags, observability, rollback และ deployment gates documented และ verified ตาม environment ที่ใช้งานจริง

## 24. Implementation waves

### Wave 0 — contracts and registry normalization

- lock types/Zod schemas, status machine, canonical skill adapter, schema path normalization, model capability response
- add fixtures for cute child v3 and invalid bundle
- no visible paid flow

### Wave 1 — persistence and orchestrator skeleton

- additive migrations for run/shot/library/binding tables
- draft/estimate/confirmation/idempotency APIs
- queue worker and status persistence without provider calls

### Wave 2 — wizard and dynamic form

- entry menu, full-screen wizard, schema-driven UI, attachments, model/quality, cost confirmation
- mobile/tablet/desktop accessibility pass

### Wave 3 — planner, skill runner, image and video prompt stages

- exact-N planner, per-shot prompt-only, image core handoff, video prompt builder, projection to review
- mocked provider integration and partial retry

### Wave 4 — shared Characters tab

- extract shared controller/panel and preserve Drama adapter
- library CRUD, looks, assets, candidates, sheet/angle, names, flags

### Wave 5 — interop, hardening, rollout

- explicit publish/import/sync diff, audit, security review, billing/access tests
- browser evidence, migration/deployment gates, gradual flags

## 25. Definition of done and residual gates

ฟีเจอร์ถือว่า implementation complete เมื่อ acceptance criteria ผ่าน, migration และ feature flags ถูกตรวจใน environment เป้าหมาย, browser evidence ครบ และไม่มี regression ต่อ New Blank/Drama

สิ่งที่ต้องระบุเป็น external gate ใน handoff หากยังทำไม่ได้ใน local:

- provider credentials/model availability และ real media response
- credit reservation/settlement smoke
- authenticated multi-tenant browser smoke
- worker deployment/restart proof
- production migration/deployment/rollback proof

ห้ามรายงานว่า “สร้างวิดีโอครบ” จากการมีเพียง image/video prompts; v1 รายงานตาม stage ที่ทำสำเร็จจริง

## 26. Twenty-round completeness review

ตรวจทวนเอกสารนี้เป็น 20 รอบ โดยแต่ละรอบตรวจทั้ง requirement, source boundary, data/API/UI/security และ acceptance coverage รอบที่พบ gap ให้แก้ใน spec ก่อนปิดรอบถัดไป:

| รอบ | focus | result / gap closure |
|---:|---|---|
| 1 | scope เดิมกับ scope ใหม่ | **FIXED** — เปลี่ยนข้อกำหนดจาก 9 คงที่เป็น 2–12, default 9 |
| 2 | source baseline | **FIXED** — เพิ่ม path/boundary ของ Storyboard, DynamicSkillForm, Drama panel, routers และ specs เดิม |
| 3 | entry/backward compatibility | **FIXED** — ระบุ New Blank/manual review ต้องไม่เปลี่ยนและมี regression gate |
| 4 | global inputs | **FIXED** — เพิ่ม title, platform, language, product context, aspect ratio, model selections, defaults และ server constraints |
| 5 | dynamic schema UI | **FIXED** — เพิ่ม input/ui schema snapshot, parent-owned field exclusion, fallback warning และ validation |
| 6 | cute child identity/version | **FIXED** — ปิด gap root metadata vs imported v3 ด้วย canonical adapter/normalization และ schemaHash |
| 7 | shot planner | **FIXED** — เพิ่ม exact-N contract และ mapping ครบทุก N 2–12 |
| 8 | story type | **FIXED** — เพิ่ม mime/dialogue/hybrid, structured dialogue และ no-inference rule |
| 9 | canonical skill prompt | **FIXED** — บังคับใช้ canonical prompt fields ตรง ๆ, preserve `generation_request` ทั้ง object และเก็บ audit เมื่อ customize ในอนาคต |
| 10 | references/assets | **FIXED** — จำกัด 0–5, managed asset ownership, model-cap fail-closed และไม่ตัดเงียบ |
| 11 | image/video model | **FIXED** — quality conditional จาก config, server allowlist, video model snapshot/dialect |
| 12 | actual pipeline boundary | **FIXED** — แยก prompt-only → image generation → video prompt → Review projection และระบุ v1 ไม่ generate video |
| 13 | durable jobs | **FIXED** — เพิ่ม run/shot status รวม `projection_pending`, monotonic transitions, resume, cancel, retry, idempotency และ projection recovery |
| 14 | credits | **FIXED** — เพิ่ม estimate, fingerprint, one confirmation, settlement และ retry charge boundary |
| 15 | Characters parity | **FIXED** — ระบุ CRUD/look/asset/candidate/sheet/angle/DNA/casting/voice/merge/QC ครบตาม flags |
| 16 | data architecture | **FIXED** — เลือก shared library แยกจาก Drama tables พร้อม project parent, immutable revision, field/index/asset rules |
| 17 | interop semantics | **FIXED** — explicit snapshot lineage, export manifest, conflict diff, source deletion และ no silent mutation |
| 18 | security/privacy | **FIXED** — เพิ่ม tenant/user/media/provider/child-safety checks และ redaction |
| 19 | UI quality | **FIXED** — เพิ่ม target JTBD, reuse map, surface/state/component, copy, a11y และ 390/768/1440 evidence |
| 20 | delivery/test/acceptance | **FIXED** — เพิ่ม migration/flags/rollout, unit/API/browser/provider boundaries, acceptance และ residual gates |

### 26.1 Final gap audit outcome

หลังรอบที่ 20 และ corrective consistency pass ไม่พบ gap ระดับที่ขัด acceptance criteria หรือทำให้ implementation ตัดสินใจไม่ได้ใน v1 ทุก v1 decision ถูกล็อกไว้ในเอกสารแล้ว ได้แก่ N=2–12, 10 sec/shot, 9:16, prompt-only skill call, canonical prompt, one confirmation, project-first Characters tab, immutable shared-library snapshot interop และ video prompt-only output

สิ่งที่เหลือเป็น revisit trigger ไม่ใช่ v1 blocker:

- เปิด variable shot duration เมื่อ planner, model capability และ billing contract รองรับร่วมกัน
- เพิ่ม automatic video generation เมื่อผู้ใช้ opt-in และมี credit confirmation boundary แยกชัด
- เพิ่ม live sync เมื่อมี conflict UX และ revision/merge semantics ที่ผ่านการทดสอบ
- เพิ่ม character skills อื่นเมื่อ registry adapter/schema/output contract ผ่าน validation เดียวกัน
