# Vertical Drama Storyboard — Completion Plan (ฉบับสมบูรณ์)

**Created:** 2026-07-05
**Status:** DRAFT — awaiting approval
**Scope:** ทำระบบสร้าง Storyboard ของซีรีย์แนวตั้งให้สมบูรณ์ระดับ product-grade ตาม requirement 4 ข้อของผู้ใช้
**Reference workflow:** https://github.com/naibarn/vertical-drama-video-flow (8-step pipeline: script → visual bible → char refs → 9-shot storyboard → start-frame prompts → render+approve → Veo 3.1 frame-bridging → assemble 60s vertical MP4)

---

## 1. Problem Statement

ระบบ Vertical Drama pipeline (15 stages) ทำงาน end-to-end ได้แล้ว แต่ผู้ใช้แก้หลายรอบยังไม่ "จบ" เพราะขาด 4 กลุ่มความสามารถ:

1. **ผู้ใช้เลือก model เองไม่ได้** — `selectedImageModelId` / `selectedVideoModelId` ถูกตั้งอัตโนมัติตอน generate stage ไม่มี UI ให้ผู้ใช้เลือกหรือเปลี่ยน; **ข้อตกลง (2026-07-05): เลือกระดับตอน (episode) เท่านั้น — ไม่ทำ override รายช็อต/รายคลิป เพื่อไม่ให้ UI ซับซ้อน**
2. **3x3 multi-angle เลือกได้ทีละ 1 เฟรม** — เลือกหลายเฟรมเก็บเป็นชุด reference ต่อช็อต + ลบทีละภาพ + crop ก่อนใช้ ยังทำไม่ได้ (ไม่มีที่เก็บ reference หลายภาพต่อช็อต)
3. **ไม่มีบทพูดไทย native ต่อคลิป** — dialogue มีใน `dialogueAudioPlan` แล้วแต่ไม่ถูก surface ใน UI ต่อคลิป และ video prompt ไม่ถูก format ตามชนิด model (veo native audio vs model ที่ต้องใช้ TTS แยก)
4. **Model catalog ไม่ครบ + ไม่มี capability metadata** — video model ที่ต้องรองรับคือ **veo 3.1 / veo 3.1 lite / grok imagine 1.5 / seedance** (หมายเหตุ: seedream เป็น model *ภาพ* ตระกูล ByteDance — video คือ **seedance**); grok imagine 1.5 และ seedance ยังไม่อยู่ใน catalog, ไม่มี flag บอกว่า model ไหนรับ start_frame / กี่ reference images / มี native audio
5. **การปูเรื่องและอารมณ์ยังไม่ถึงมาตรฐานซีรีย์แนวตั้ง** (จุดเน้นพิเศษ) — skill ปัจจุบันไม่บังคับ reversal/พลิกสถานการณ์ระหว่างตัวละคร, emotion ต่อช็อตแบนราบ, ไม่มีการกำกับน้ำเสียง-การแสดงต่อประโยค และไม่มี quality gate ตรวจความคมของเรื่องก่อนจ่ายเครดิตค่าภาพ/วิดีโอ → Phase 3B

## 2. What Already Exists (ห้ามสร้างซ้ำ — reuse เท่านั้น)

| ความสามารถ | ที่อยู่ | สถานะ |
|---|---|---|
| Pipeline 15 stages + repair/regenerate cascade + checkpoints | `server/services/verticalDramaEpisodePipeline.ts` | ✅ ใช้งานได้ (bug run-row freeze + downstream cascade แก้แล้ว 2026-07-05) |
| Generate ภาพรายช็อต + bulk "generate all" (async + poll) | router `generateStartFrameImage`, StoryboardPanel | ✅ |
| 3x3 multi-angle generate + client split + เลือก 1 เฟรม | `generateStartFrameAngleVariations` + `lib/imageGridSplitter.ts` | ✅ (ขาด multi-select/crop/ชุด reference) |
| แก้ prompt ภาพ/วิดีโอ ผ่าน repair dialog (สร้าง artifact version ใหม่, mark downstream stale) | `repairStageOutput` | ✅ |
| History/Library picker + drag-drop + เปลี่ยนภาพช็อต | `setApprovedStartFrameAsset`, `trpc.media.listTasks`, `trpc.library.search`, unified drag contract | ✅ |
| Grid detect/split/crop (client) | `client/src/lib/imageGridSplitter.ts` — `detectGrid`, `splitImage`, `cropImageToAspect`, `createSplitPreview` | ✅ reusable ทั้งไฟล์ |
| Grid detect ฝั่ง server (เส้นแบ่งไม่เท่ากัน) | `server/services/storyboardGridGeometry.ts` | ✅ |
| Grid cutter UI (tab ตัวละคร) — upload/history → split → drag tile ไปวาง | `VerticalDramaCharacterReferencePanel.tsx:266-897` | ✅ (ต้อง extract เป็น component กลาง) |
| Resolve + link + delete media asset (สองจังหวะ: `resolveMediaAssetForImport` → `linkAsset`) | `verticalDramaCharacters` router + `verticalDramaCharacterStock.ts` | ✅ pattern พร้อม copy |
| Model selector dialog + localStorage persistence | `ModelSelectorDialog`, `trpc.mediaModels.list` | ✅ |
| Prompt preview gate (โชว์ prompt ให้แก้ก่อนจ่ายเครดิต) | `previewCharacterPrompt` + `MediaPromptPreview` ใน CharacterStockPanel | ✅ pattern พร้อม copy |
| 8 vertical-drama LLM skills (script, shotgrid, start-frame plan, motion pack, dialogue-audio, visual bible, memory, tie-in) | `apps/web/skills/vertical-drama-*/` | ✅ ตรงกับ reference repo |
| Veo 3.1 Lite/Fast/Quality ใน catalog (start_frame + 9:16 + native audio + 3 refs) | `server/services/modelRegistry.ts` | ✅ |

## 3. Affected Files (หลัก)

- `apps/web/server/services/modelRegistry.ts` — capability metadata + model ใหม่
- `apps/web/shared/verticalDramaSeries/*` — types ของ frame/clip (เพิ่ม field)
- `apps/web/server/routers/verticalDramaEpisodes.ts` — mutations ใหม่ (set model, shot references, dialogue)
- `apps/web/server/services/verticalDramaEpisodePipeline.ts` — อ่าน per-shot/per-clip model, ส่ง references ตาม capability
- `apps/web/server/services/verticalDramaVideoMotionPromptGeneration.ts` + skill `vertical-drama-video-motion-prompt-pack` — dialogue-embedded, model-aware prompts
- `apps/web/drizzle/schema.ts` — ตารางใหม่ `verticalDramaShotReferences` (ADD TABLE เท่านั้น — Low risk)
- `apps/web/server/services/verticalDramaShotReferences.ts` — service ใหม่
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx` — model selector, reference strip, dialogue editor
- `apps/web/client/src/components/verticalDramaSeries/ShotGridCutter.tsx` — component ใหม่ (extract จาก ReferencePanel)
- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx` — wiring + ลบ/ต่อ ContactSheetPicker stub

---

## 4. Implementation Phases

### Phase 0 — Model Catalog + Capability Metadata (ฐานของทุกข้อ)

**0.1** เพิ่ม fields ใน `ModelDefinition` (modelRegistry.ts):
- `supportsStartFrame?: boolean` (ปัจจุบัน infer จาก configJson `FIRST_AND_LAST_FRAMES_2_VIDEO` — ทำให้ explicit)
- `maxReferenceImages?: number`
- `nativeAudioDialogue?: boolean` (veo 3.1 = true → ฝังบทพูดใน prompt ให้ขยับปากได้)
- `verticalDramaReady?: boolean` (มี 9:16 + video quality พอ)

**0.2** ปรับ entries เดิม: veo 3.1 lite / fast / quality → `supportsStartFrame: true, maxReferenceImages: 3, nativeAudioDialogue: true`; HappyHorse r2v → `maxReferenceImages: 9, nativeAudioDialogue: false`; Kling, Sora, Gemini Omni ตาม capability จริง

**0.3** เพิ่ม model ที่ user ระบุ (video: veo 3.1 / veo 3.1 lite / grok imagine 1.5 / **seedance**):
- veo 3.1 + veo 3.1 lite — มีใน catalog แล้ว (`veo-3-1`, `veo3/generate-veo-3-video-lite`) แค่เติม capability metadata
- `grok-imagine-1.5` (video) — ตรวจ endpoint จริงบน kie.ai/knplabai ก่อน (catalog ปัจจุบันมีแค่ `grok-video-3` ของ knplabai และ `grok-imagine` แบบภาพ); ถ้า provider มี → เพิ่ม entry video variant พร้อม configJson, ถ้าไม่มี → เพิ่มแบบ `isEnabled: false` + แจ้ง user ว่ารอ provider
- `seedance` (video, ByteDance — เช่น Seedance 1.x Pro) — ยังไม่มีใน catalog; ตรวจ kie.ai/fal.ai ว่ามี endpoint ไหน + capability (i2v/start frame, 9:16, duration); ถ้ามี → เพิ่ม entry + configJson + adapter mapping; ถ้าไม่มี → รายงานผู้ใช้ชัดเจน ไม่ใส่ model หลอก
- (ภาพ: ถ้าต้องการ seedream สำหรับ start-frame image ค่อยตรวจเพิ่มแยกต่างหาก — ไม่อยู่ในขอบเขต video model)
- **หลักการ:** UI ต้องแสดงเฉพาะ model ที่ generate ได้จริง — ห้าม list model ที่ยังยิงไม่ได้

**0.4** `trpc.mediaModels.list` รองรับ filter `verticalDramaReady` + ส่ง capability badges ให้ client

**Verify:** unit test capability lookup; `pnpm check`

### Phase 1 — Episode-Level Image Model / Video Model Selection (ต่อตอน — ไม่ย่อยรายช็อต)

> ฝั่งข้อมูลมีอยู่แล้ว: `startFramePlan.selectedImageModelId` และ `motionPromptPack.selectedVideoModelId` เป็นค่าระดับตอนอยู่แล้ว — ที่ขาดคือ UI ให้ผู้ใช้เลือก + mutation ให้เปลี่ยนได้ + ทุกจุด generate อ่านค่านี้จริง

**1.1** Mutation ใหม่ `setEpisodeModelSelection` ใน router: patch `selectedImageModelId` / `selectedVideoModelId` ระดับตอน (ผ่าน `updateEpisodeDraft` path เดิม, ฟรี — ไม่ trigger generation) + validate ว่า model id อยู่ใน catalog และ enabled

**1.2** Resolution order เวลา generate: episode selection → `DEFAULT_MODELS`
- `generateStartFrameImage` / `generateStartFrameAngleVariations` และ stage `render_or_import_video_clips` อ่านค่าระดับตอนนี้ (ตรวจว่าทุก call site อ่านจริง ไม่ hardcode)
- คำนวณเครดิตจาก model ที่เลือกจริง (แสดงราคาใน confirm dialog ก่อนจ่ายทุกครั้ง)

**1.3** UI (StoryboardPanel header — จุดเดียว): dropdown "Image model" + "Video model" ใช้ `ModelSelectorDialog` + capability badges (Start Frame / Native Audio / Max refs / ราคาต่อภาพ-ต่อคลิป); จำค่าล่าสุดต่อ series ใน localStorage เป็น default ของตอนใหม่
- **ไม่มี** ตัวเลือก model ใน shot card — เลือกครั้งเดียวใช้ทั้งตอน
- Video model ที่เลือกมีผลต่อ Phase 2 (จำนวน reference ที่รับได้) และ Phase 3 (โหมดบทพูด native/TTS)
- เปลี่ยน model กลางทาง: มีผลเฉพาะการ generate ครั้งถัดไป — ภาพ/คลิปที่ทำไปแล้วไม่ถูกแตะ (แจ้งใน UI ชัดเจน)

**Verify:** test script `apps/web/scripts/test-vd-model-selection.ts` (pattern เดียวกับ test-vd-*.ts เดิม); generate จริง 1 ช็อตหลังเปลี่ยน model ระดับตอน

### Phase 2 — Multi-Reference ต่อช็อต: 3x3 → เลือกหลายเฟรม → crop → ชุด reference + ลบได้

**2.1** DB: ตารางใหม่ `verticalDramaShotReferences` (ADD TABLE — Low risk, ทำตาม Database Safety Protocol: backup + `pnpm db:push` ทันที):
```
id, tenantId, userId, seriesId, episodeId, shotNumber,
mediaAssetId (FK media_assets), role ("start_frame"|"reference"),
source ("generated"|"grid_cut"|"history"|"library"|"upload"),
sortOrder, createdAt
```
- `approvedMediaAssetId` เดิมยังเป็น "start frame หลัก" — ตารางนี้เก็บ reference เพิ่มเติม (ไม่ break ของเดิม)

**2.2** Service + tRPC: `listShotReferences` / `linkShotReference` / `deleteShotReference` — copy pattern จาก `verticalDramaCharacterStock` (resolve → link, tenant-scoped, soft delete + confirm)

**2.3** Extract `ShotGridCutter` component จาก ReferencePanel lines 266-897:
- prop `onTilesSelected(tiles: SplitResult[])` — **multi-select** (เดิมเลือกได้ทีละ tile)
- เพิ่มขั้น crop ต่อ tile: toggle "crop 9:16" ใช้ `cropImageToAspect` ที่มีอยู่แล้ว (default ตัดเป็น 9:16 เพราะเฟรมใน 3x3 grid เป็น 9:16 อยู่แล้ว — crop เป็น optional refinement)
- ใช้ได้ทั้งกับ: ผลจากปุ่ม 3x3 ของช็อต, ภาพจาก history/library (ข้อ 2 ของ user), ภาพ upload

**2.4** Multi-angle picker ใน shot card อัปเกรด: จากเลือก 1 เฟรม → checkbox เลือกหลายเฟรม → ปุ่ม "ใช้เป็น start frame" (1 เฟรม) + "เพิ่มเป็น reference" (หลายเฟรม) → tiles ผ่าน `ai.upload` → `resolveMediaAssetForImport` → `linkShotReference`

**2.5** Reference strip ใน shot card: แถว thumbnail ใต้ภาพหลัก + ปุ่มลบต่อภาพ (confirm) + drop zone (unified drag contract — ลากจาก history/library/cutter มาวางได้) + badge เตือนเมื่อเกิน `maxReferenceImages` ของ video model ที่เลือก (veo = 3, happyhorse = 9)

**2.6** ส่ง references เข้า video generation ตาม capability: model รับ start_frame → `approvedMediaAssetId` เป็น first_frame + references เป็น reference_images (ไม่เกิน max); model รับเฉพาะ reference → ส่งทั้งชุด

**Verify:** grid-stability test เดิมต้องผ่าน; test script link/delete/ordering; ทดลองจริง: gen 3x3 → เลือก 3 เฟรม → ลบ 1 → gen video

### Phase 3 — Video Prompt + บทพูดไทย Native + Model-Aware Formatting

**3.1** Types: เพิ่มใน `motionPromptPack.clips[j]`: `dialogue?: { characterKey, lineTh, emotion, deliveryNote }[]` — sync มาจาก `dialogueAudioPlan` (มี `dialogue_line`, `audio_mode`, `tts_voice` อยู่แล้ว) ตอน generate motion pack

**3.2** อัปเดต skill `vertical-drama-video-motion-prompt-pack` (`skill.md` + schema):
- Output ต้องรวมบทพูดไทยต่อคลิป + อารมณ์เสียง + acting/movement direction คุณภาพซีรีย์แนวตั้งจีน (micro-expression, blocking, camera movement ต่อเนื่องจาก start frame)
- เพิ่ม `provider_request` variants ต่อ model family (veo31 / grok / seedance / generic)

**3.3** Model-aware prompt builder (service ใหม่ `verticalDramaVideoPromptFormatter.ts`):
- `nativeAudioDialogue: true` (veo 3.1 ทุก tier) → ฝังบทพูดไทยใน prompt ตาม syntax ที่ veo lip-sync ได้ (พูดจริง ขยับปากจริง) + `generate_audio: true`
- model ไม่มี native audio → prompt เน้น motion + ปากขยับตามบท, บทพูดไป path TTS (`dialogueAudioPlan.audio_mode: "separate_tts"` — มี ElevenLabs/Gemini TTS ใน catalog แล้ว)
- Unit test ต่อ model family

**3.4** UI ใน shot card: กล่องบทพูด (แสดง lineTh + ตัวละคร + อารมณ์) แก้ inline ได้ → บันทึกผ่าน `updateEpisodeDraft`; ปุ่มแก้ video prompt เดิมยังใช้ repair dialog สำหรับ regenerate ด้วย LLM

**Verify:** test formatter ทุก model; gen video จริง 1 คลิปด้วย veo 3.1 lite เช็คว่าพูดไทยตามบท

### Phase 3B — Narrative & Emotional Quality (จุดเน้นพิเศษของผู้ใช้ 2026-07-05)

> ตรวจ skill ปัจจุบันแล้วพบว่า "ปูเรื่องยังไม่พอ": script-builder มีแค่ hook/beats/cliffhanger — **ไม่มีข้อบังคับ reversal**, shotgrid มี `emotion` ต่อช็อตแต่ตัวอย่างให้ทุกช็อตเป็น "tension" เหมือนกันหมด, dialogue-planner ไม่มีการกำกับน้ำเสียงต่อประโยค

**3B.1** อัปเกรด skill `vertical-drama-script-builder` — บังคับ "ไวยากรณ์ซีรีย์แนวตั้ง":
- Hook แรงใน 3 วินาทีแรก
- **Reversal อย่างน้อย 2-3 ครั้งต่อตอน** — ทุก beat ต้องมี field `power_shift` (ใครได้เปรียบ/เสียเปรียบ, พลิกจาก beat ก่อนอย่างไร) และ marker `is_reversal`
- Emotional arc ต่อตัวละครต่อตอน (เริ่มที่อารมณ์ไหน จบที่อารมณ์ไหน จุดหัก อยู่ beat ไหน)
- Escalation curve: ความเข้มข้นต้องไล่ระดับ ไม่แบน + cliffhanger ที่ผูกกับ reversal สุดท้าย

**3B.2** อัปเกรด skill `vertical-drama-storyboard-shotgrid`:
- `emotion` ต่อช็อตต้อง**เฉพาะเจาะจงและหลากหลาย** (ห้ามซ้ำติดกันเกิน 2 ช็อต) + เพิ่ม `facial_expression`, `body_language`, `gaze_direction` ต่อตัวละครในช็อต
- ช็อตที่เป็น reversal ต้องใช้ภาษากล้องแรงขึ้น (push-in เร็ว, close-up สายตา, cut rhythm) — map จาก `is_reversal` ของ script

**3B.3** อัปเกรด skill `vertical-drama-shot-start-frame-render`:
- Image prompt ต้อง encode อารมณ์ของภาพ: expression ละเอียด (ตา คิ้ว มุมปาก), mood lighting, สี, composition ที่สื่อ power dynamic ของ beat นั้น (ใครอยู่สูง/ต่ำในเฟรม, ระยะห่างตัวละคร)

**3B.4** อัปเกรด skill `vertical-drama-dialogue-audio-planner` + motion prompt pack:
- ต่อประโยค: `delivery` (tone, pace, จุดหยุด/ถอนหายใจ, เสียงสั่น/เย็น/ประชด), `subtext` (พูดอย่างคิดอย่าง)
- **บทพูดต้องเป็นภาษาพูดไทยจริง** (spoken register, คำลงท้าย, ประโยคสั้น, ห้ามภาษาเขียน/ภาษาแปล) — ใส่เป็น hard rule ใน system prompt พร้อมตัวอย่าง ดี/ไม่ดี
- โหมด native (veo): delivery direction ถูกฝังใน video prompt; โหมด TTS: แปลงเป็น style instruction ของ TTS model (Gemini Flash TTS รองรับ style/language steering อยู่แล้ว)

**3B.5** เพิ่ม review gate ใหม่ (ฟรี/ถูก — LLM อย่างเดียว): skill `vertical-drama-episode-quality-review`
- รัน**ก่อน**ผู้ใช้จ่ายเครดิตค่าภาพ/วิดีโอ (หลัง script + shotgrid เสร็จ)
- ให้คะแนน: จำนวน/ความคมของ reversal, ความหลากหลายอารมณ์ต่อช็อต, ความเป็นธรรมชาติของบทพูด (อ่านออกเสียงแล้วเหมือนคนพูดไหม), pacing
- ชี้จุดแบน + เสนอแก้เป็นรายการ → ผู้ใช้กด "ปรับตามคำแนะนำ" ได้ (ต่อเข้า repair path เดิม) หรือข้ามได้
- แสดงผลใน UI เป็น scorecard สั้น ๆ ต่อ ตอน (ไม่บังคับผ่าน — ผู้ใช้ตัดสินใจเอง)

**Verify:** fixture ตอนตัวอย่าง 1 ตอน — เช็คว่า output มี reversal ≥2, emotion ไม่ซ้ำเกิน 2 ช็อตติด, บทพูดผ่านเกณฑ์ภาษาพูด; test เดิมของ skill ต้องผ่าน (schema เป็น superset)

### Phase 4 — UX Streamline + One-Click ต่อช็อต

**4.1** ปุ่มรวม "สร้าง prompt + ภาพ" ต่อช็อต: ใช้ prompt-preview gate pattern จาก CharacterStockPanel — LLM สร้าง/ปรับ prompt → โชว์ให้แก้ → ยืนยัน → gen ภาพ (ลด flow 2 จังหวะเหลือจังหวะเดียว แต่ยังแก้ได้ก่อนจ่ายเครดิต)

**4.2** แก้ inline prompt editor: กล่อง prompt ภาพ/วิดีโอแก้ตรงในการ์ดได้ (save = updateEpisodeDraft, ฟรี) แยกจากปุ่ม "ให้ AI ปรับ" (repair, มีค่าใช้จ่าย) — label ชัดเจนว่าอันไหนฟรี/เสียเครดิต

**4.3** ลบหรือ wire `ContactSheetPicker` stub ใน VerticalDramaEpisodePage.tsx:1121-1143 (ปัจจุบัน render ด้วย props ว่างเปล่า — dead UI) → **ลบออก** เพราะ multi-angle picker ใน StoryboardPanel ทำหน้าที่นี้แล้ว

**4.4** Copy ภาษาไทยทั้งหมดใน `verticalDramaWorkspaceCopy.ts` — ทุก state ใหม่ (เลือก model, reference strip, บทพูด, crop) มีข้อความไทยครบ

### Phase 5 — Product-Grade Review + Tests

**5.1** เทียบกับ reference 8-step workflow: ทุก step มี stage รองรับแล้ว — เพิ่มเฉพาะ QC ที่ขาด:
- Start-frame QC: ก่อน gen video เช็คทุกคลิปมี start frame + prompt + (ถ้ามีบท) dialogue → แสดง readiness checklist ต่อตอน ("พร้อม gen video: 7/8 คลิป")
- Continuity: frame-bridging ใช้ first/last frame ของคลิปติดกัน (veo `first_last_frame` mode รองรับแล้ว) — เช็คว่า pipeline ส่ง end frame ของคลิป n เป็น start ของ n+1 เมื่อผู้ใช้เปิดโหมด bridge

**5.2** Tests: unit (formatter, capability resolution, reference limits), test scripts `test-vd-shot-references.ts` / `test-vd-model-selection.ts`, regression ของ grid stability + repair/regenerate เดิม

**5.3** `pnpm check` + `pnpm test` + rebuild + `sudo systemctl restart smartspec-web.service` + ทดสอบจริงผ่าน https://smartaihub.app

---

## 4B. Hard Constraint — Generation Infrastructure (ยืนยันโดยผู้ใช้ 2026-07-05)

**การสร้างภาพและวิดีโอทุกจุดต้องใช้ระบบเดิมเท่านั้น:** `mediaGenerationService` → submit **async** (ได้ taskId ทันที ไม่ block รอทีละภาพ/คลิป) → client poll ผ่าน `media.getTask` → เครดิต reserve ก่อน submit + reconcile ตอนเสร็จ ตามกลไกที่ `generateStartFrameImage` / bulk generate ใช้อยู่แล้ว
- ห้ามสร้าง generation path ใหม่, ห้ามเรียก provider ตรง, ห้าม synchronous wait
- การ gen หลายช็อต/หลายคลิปต้อง submit พร้อมกันแล้วต่าง poll อิสระ (pattern เดียวกับ "generate all" ที่มีอยู่)

## 5. Risk Assessment

| ความเสี่ยง | ระดับ | การจัดการ |
|---|---|---|
| ตารางใหม่ `verticalDramaShotReferences` | Low (ADD TABLE) | backup ก่อน `pnpm db:push`, migrate ทันทีตาม protocol |
| เพิ่ม field ใน JSONB plans | Low | optional fields, ของเก่าอ่านได้ปกติ; ห้ามเปลี่ยน shape เดิม |
| แก้ skill `video-motion-prompt-pack` | Medium | เก็บ schema เดิมเป็น superset; test fixtures เดิมต้องผ่าน |
| seedance/grok 1.5 ไม่มีบน provider | Medium | ตรวจ endpoint จริงก่อน — ไม่ใส่ model ที่ยิงไม่ได้; แจ้งผู้ใช้ตรง ๆ |
| Regression repair/regenerate cascade | Medium | ห้ามแตะ logic cascade; test เดิมต้องเขียว |
| เครดิตคิดผิดเมื่อเปลี่ยน model ระดับตอน | Medium | คิดจาก model ที่ resolve จริง + แสดงราคาใน confirm ก่อนทุกครั้ง |

## 6. Execution Order & Agent Dispatch

ลำดับ: Phase 0 → 1 → 2 → 3 → 4 → 5 (Phase 2 กับ 3 ขนานกันได้หลัง Phase 0-1 เสร็จ)

| งาน | Agent |
|---|---|
| Phase 0 catalog + 1 backend | ssp-backend |
| Phase 2 DB + service | ssp-database → ssp-backend |
| Phase 2-4 UI | ssp-frontend / ssp-ui-builder |
| Phase 3 skill + formatter | ssp-backend (+ skill md edit) |
| Phase 5 tests | ssp-test-qa |
| Security pass (endpoint ใหม่: shot references, model selection) | ssp-security-trpc |

## 7. Progress Log

- [x] Phase 0 — model catalog + capabilities ✅ 2026-07-05 (capability fields ครบทุก video model; **grok-imagine-video-1-5-preview เพิ่มแล้ว ยิงได้จริงผ่าน kie.ai market**; **seedance 2.0 มีอยู่แล้วผ่าน WaveSpeed**; แก้บั๊ก alias "grok imagine" ชน model ภาพ)
- [x] Phase 1 — episode-level model selection ✅ 2026-07-05 (`setEpisodeModelSelection` mutation; generate ทุกจุดใช้ model ที่เลือก ทั้งราคาและการยิง; แก้บั๊ก LLM เขียนทับ model ที่ผู้ใช้เลือก; mediaModels.list มี filter verticalDramaReady + badges)
- [x] Phase 2 (DB+service) — ตาราง `vertical_drama_shot_references` migrate แล้ว (manual SQL fallback — drizzle snapshot chain เสียอยู่ก่อนแล้ว, flag งานแยก re-baseline), service link/list/delete/reorder + 13 tests ✅ 2026-07-05
- [x] Phase 2 (router+wiring) ✅ 2026-07-05 — tRPC listShotReferences/linkShotReference/deleteShotReference/reorderShotReferences + mutation ใหม่ `generateVideoClip` (async submit ผ่าน mediaGenerationService เหมือน generateStartFrameImage — ตัดสินใจสถาปัตยกรรม: การยิงวิดีโอจริงอยู่ที่ router mutation ไม่ใช่ใน stage stub, ตาม pattern ภาพเดิม); trim references ตาม maxReferenceImages เรียง sortOrder + รายงาน trimmedReferenceCount
- [x] Phase 3 ✅ 2026-07-05 — `verticalDramaVideoPromptFormatter.ts` (veo/WaveSpeed seedance 2.0 = ฝังบทพูดไทย + delivery, generateAudio true; grok/seedance ModelArk/generic = acting direction + ttsFallback) + `syncDialogueOntoMotionPromptClips` เติม dialogue เข้า clips จาก dialogueAudioPlan; quality review persist ผ่าน run artifacts (stage tag "episode_quality_review"); tests 207/207 เขียว, pnpm check สะอาด
- [x] Phase 3B (skills) — reversal grammar, emotion variety, micro-expression, delivery+subtext, กฎภาษาพูดไทย, skill+service `vertical-drama-episode-quality-review` ✅ 2026-07-05 (superset ทั้งหมด, verify.sh ผ่าน 6 skills, suite 168 tests เขียว)
- [x] Phase 3B (wiring) ✅ 2026-07-05 — `runEpisodeQualityReview` endpoint (persist ผ่าน run artifacts) + scorecard UI 5 มิติสี ตามเกณฑ์ + issues list พร้อมปุ่มคัดลอกคำแนะนำ
- [x] Phase 4 ✅ 2026-07-05 — model selectors 2 ตัวที่ header (badges+ราคา, localStorage ต่อ series), `ShotGridCutter` component กลาง (multi-select + crop 9:16, ReferencePanel refactor มาใช้ร่วม ลดโค้ดซ้ำ ~230 บรรทัด), reference strip ต่อช็อต (ลบ/ลาก-วาง/เตือนเกิน limit), dialogue box แก้ inline + badge "พูดในวิดีโอ/เสียงแยก TTS" จาก ttsFallback, one-click "สร้าง prompt + ภาพ", แก้ prompt inline ฟรีแยกจาก "ให้ AI ปรับ (มีค่าใช้จ่าย)", ปุ่ม gen วิดีโอต่อคลิป + แจ้ง trimmed references, ลบ ContactSheetPicker dead stub, แก้ TS errors ค้าง 2 ตัวใน CharacterStockPanel
- [x] Security review + fixes ✅ 2026-07-05 — audit เฉพาะ endpoint ใหม่: ไม่มี IDOR/secret leak/rate-limit gap; แก้ครบ 5 findings: T2 HIGH idempotencyKey กัน double-spend ทั้ง 4 paid procedures (client ส่ง crypto.randomUUID() ต่อคลิก), T1 ownership เข้า SQL WHERE, T3 credit pre-check 20 + deduct resilience, T4 parseId integer guard, T5 payload size cap 400k
- [x] Phase 5 ✅ 2026-07-05 — tests vertical drama 18 ไฟล์ 207+ tests เขียว (รวม security tests ใหม่ 60), `pnpm check` ทั้ง repo สะอาด, build production สำเร็จ, restart smartspec-web แล้ว: services active, localhost:3000 = 200, https://smartaihub.app = 200, หน้า episode = 200, journal ไม่มี error

**งานเพิ่มเติมหลัง deploy รอบแรก (2026-07-05):**
- [x] Bugfix: image model picker ว่าง — `deriveVerticalDramaCapabilities` ไม่เคยตั้ง `verticalDramaReady` ให้ model ภาพ → แก้ให้ model ภาพ ready เมื่อรองรับ 9:16 (+ tests)
- [x] Series memory ครบวงจร — memoryBundle ส่งเข้า script generation (`memory_state`), skill series-memory-planner ต่อเข้า stage สรุปความจำ (อนุมัติแล้ว append ครบ 8 ชนิด event แบบ idempotent), endpoint+UI `proposeRetcon`, empty state บอกเงื่อนไขการบันทึก (tests 254 เขียว)
- [x] UX generate ต่อช็อต — "สร้าง prompt + ภาพ" ไม่เปิด repair dialog แล้ว (auto-generate prompt → preview → gen), มี mode choice ภาพเดียว/3x3, เพิ่มปุ่ม "สร้าง prompt วิดีโอ (มีค่าใช้จ่าย)" พร้อมจัดการ prerequisite อัตโนมัติ
- [x] Deploy รอบสอง: build + restart แล้ว, tests 22 ไฟล์ 240 เขียว, typecheck สะอาด, domain/หน้า episode/series ตอบ 200

**รอบสาม (2026-07-05 ค่ำ):**
- [x] Bugfix "กดสร้างภาพแล้วเงียบ" — root cause: LLM output ถูกตัดที่ maxTokens 4000 (output ยาวขึ้นหลัง Phase 3B) → VD_SCHEMA_VALIDATION_FAILED; แก้: เพดาน 16000 + retry อัตโนมัติ 1 ครั้ง model เดิม (`executeJsonPlanningCallWithRetry` ใน verticalDramaStoryBible.ts) + compact JSON ครอบ start-frame/motion-pack/script; ยืนยันว่า stage fail ไม่เคย persist ทับ (แผนเปล่ามาจาก stub ของ setEpisodeModelSelection ซึ่ง UI ถือเป็น "ไม่มีแผน" แล้ว); toast ล้มเหลวมีปุ่ม "ลองอีกครั้ง" ครบ 7 จุด; ล้าง startFramePlan เสียของ ep1 แล้ว (backup ไว้)
- [x] ฟีเจอร์ลบ series — `verticalDramaSeries.deleteSeries` (ownership + พิมพ์ชื่อยืนยัน server-side, transaction + FK cascade ครบ 10 ตารางลูก, ไม่แตะ media_assets) + Danger Zone ใน tab ตั้งค่า + dialog พิมพ์ชื่อ; tests 6 ใหม่ผ่าน
- [x] Deploy รอบสาม: tests 24 ไฟล์ 261 เขียว, typecheck 0 error, build+restart, domain/episode ตอบ 200

**รอบสี่ (2026-07-05 ค่ำ):**
- [x] Multi-angle picker UI — tile ย่อเหลือ ~6.5rem grid 3 คอลัมน์ (เท่าภาพหลัก), lightbox เต็มจอไล่ดูทั้งชุด, ปุ่ม X ลบรายเฟรม (re-index selection), action bar sticky "ใช้เป็นภาพเริ่มต้น"/"เพิ่มเป็นภาพอ้างอิง (n)"
- [x] Bugfix ภาพตัวละครไม่ตรง description — root cause: `extractCharacterDescription` (verticalDramaCharacters.ts:186) ไม่เคยอ่าน `data.description` (field ที่เก็บอายุ/เพศ/ลักษณะ) → LLM แต่งตัวตนผู้ใหญ่เอง; แก้ที่ helper เดียวครอบทั้ง 4 เส้น (preview/portrait/turnaround/sheet) ให้ description ขึ้นต้น prompt; หลักฐานจาก audit log trace + DB; tests 11 ใหม่ + regression 287 เขียว
- [x] Deploy รอบสี่: typecheck 0, build+restart, domain/episode 200

## Phase 6 — Feedback รอบ 3 (2026-07-05 ดึก) — 6 ข้อ ต้องครบทุกข้อ

> ✅ Phase 6 เสร็จครบทั้ง 6 ข้อ 2026-07-06 — reviewer ตรวจ end-to-end แล้ว APPROVE (330 tests เขียว, typecheck 0, ไม่มี finding HIGH/MEDIUM); deploy + push แล้ว
- [x] **6.1 ผล 3x3 ไม่แสดงหลังสร้างเสร็จ** — ภาพ grid เสร็จ (อยู่ใน history) แต่ picker 9 เฟรมไม่โผล่ + ปุ่มค้าง "กำลังทำงาน/กำลังสร้าง"; ต้อง: แสดง 9 เฟรมทันทีที่เสร็จ, เลือก 1 เป็นภาพหลักได้, ลบรายเฟรมได้ (debug poll → state flow)
- [x] **6.2 เลือกความละเอียดต่อ model (dynamic)** — 1k/2k/4k ตามที่ model นั้นรองรับ (อ่านจาก configJson/sizes ที่มีในระบบแล้ว); UI dropdown แสดงเฉพาะตัวเลือกของ model ที่เลือก; ส่งผ่านเข้า generation request
- [x] **6.3 ภาพ 3x3 ห้ามมีตัวอักษร** — prompt 3x3 ปัจจุบันทำให้เกิด label (WIDE ESTABLISHING SHOT ฯลฯ) ในภาพ → ใช้เป็น start frame ของ veo ไม่ได้; แก้ prompt builder + negative prompt (no text/labels/captions/watermark)
- [x] **6.4 เตือน "ใช้ภาพอ้างอิงได้สูงสุด 0 ภาพ" ผิด** — capability resolve ได้ 0 ทั้งที่ควรใส่ได้ปกติ; หา root cause (model จาก DB ไม่มี metadata → default 0?) และแก้: limit 0 ที่ไม่ explicit = ไม่จำกัด/ค่า default สมเหตุผล ไม่บล็อกผู้ใช้
- [x] **6.5 ซ่อมภาพแบบ image-to-image** — ปุ่มแก้ไขภาพเดิม: แนบภาพหลักปัจจุบัน + คำสั่งแก้ (เปลี่ยนเสื้อผ้า/ฉากหลัง) → generate ใหม่ผ่าน model ที่รองรับ reference; แสดง preview เทียบก่อนยืนยันใช้แทน
- [x] **6.6 พรอมต์วิดีโอซ้ำกันทุกช็อต + ต้อง image-grounded** — (a) หา root cause ที่ motion pack สร้าง prompt เดียวกันทุกช็อต, (b) ออกแบบใหม่: สร้างพรอมต์วิดีโอรายช็อตโดย**แนบภาพหลักของช็อตให้ LLM วิเคราะห์** เน้น movement/อารมณ์/บรรยากาศ ไม่บรรยายลักษณะบุคคล (มีรูปแนบแล้ว), (c) ช็อตที่ยังไม่มีภาพ = ยังสร้างพรอมต์วิดีโอไม่ได้ (disable + อธิบาย), (d) ปุ่ม "สร้างพรอมต์วิดีโอ" รายช็อต กดซ้ำได้เมื่อเปลี่ยนภาพ, แก้ prompt ได้ แล้ว generate video รายช็อต

Execution: Wave A = client bugfix (6.1+investigate 6.4) ∥ backend (6.2/6.3/6.4/6.5) ∥ motion-prompt service+skill (6.6a,b) → Wave B = router wiring 6.6 + frontend (6.2 UI, 6.5 dialog, 6.6 ปุ่มรายช็อต) → Completeness review ทวนครบ 6 ข้อ → deploy

**หมายเหตุคงค้าง (นอกขอบเขตงานนี้):**
- Drizzle snapshot chain เสีย (ก่อนงานนี้) — flag เป็น task แยกแล้ว (re-baseline)
- Full-repo vitest มี failure เดิมที่ไม่เกี่ยว (agencyStream db mock / JWT_SECRET env ใน worker tests) — มีอยู่ก่อนงานนี้ ยืนยันแล้วว่าไม่มีไฟล์ vertical drama ใน failures
