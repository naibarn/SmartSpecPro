# รวมศูนย์การเลือก LLM model ให้ทุก skill ในสาย Vertical Drama (จุดตั้งค่าเดียว)

## สถานะ: เสร็จสมบูรณ์ (2026-07-11)

ทั้ง 4 phase เสร็จและตรวจสอบอิสระแล้วทุกจุด (diff review + `pnpm check` +
tests โดยผู้ควบคุมเอง ไม่ใช่แค่รายงานของ agent):
- **Phase 1** — schema ยุบเหลือ `defaultModelId`, resolver กลาง
  `verticalDramaLlmModelPolicy.ts`, router 2 procedures — ตรวจสอบแล้ว
- **Phase 2** — wire 10 จุดที่มี seriesId อยู่แล้ว (7 ไฟล์) — ตรวจสอบแล้ว
  (typecheck 0 errors, 342/342 tests)
- **Phase 3** — thread seriesId เข้า 6 ฟังก์ชัน/resolver ที่ยังไม่มี
  (`verticalDramaCharacterVariantPlanner.ts`, `verticalDramaShotImageAction.ts`,
  `verticalDramaDialogueAudio.ts`, `verticalDramaPromptQc.ts`,
  `verticalDramaAdBanner.ts`'s `resolveAdBannerPromptModel`,
  `verticalDramaVideoMotionPromptGeneration.ts`'s `resolveShotVideoPromptModel`)
  — ตรวจสอบแล้ว (typecheck 0 errors, 137/137 tests เฉพาะจุด + full vertical-drama
  suite 173 ไฟล์/2933 tests: fail เฉพาะ 15 tests ที่เป็น pre-existing/ไม่เกี่ยวข้อง
  เดิมอยู่แล้วก่อนงานนี้ — native-audio-toggle copy mismatch,
  `deleteEpisodeMutation` mock gap, `criteriaVersionMarker` mismatch)
- **Phase 4** — UI ยุบเหลือ dropdown เดียว — ตรวจสอบแล้ว (16/16 tests)
- **Phase 5 (ข้อยกเว้นที่ตั้งใจ)** — `verticalDramaPresetSynthesis.ts` ไม่แตะ
  ตามที่ระบุไว้ (ทำงานก่อนมี series จริง ไม่มี seriesId ให้ผูก override)

## Context (บริบท)

เซสชันก่อนหน้าสร้างฟีเจอร์ "เลือกโมเดล LLM เอง" ไว้แล้ว แต่ขอบเขตแคบ — มีแค่ 2
ช่อง (`startFramePlanModelId`/`storyboardModelId`) ใช้กับแค่ 2 stage (start-frame
plan กับ storyboard) เท่านั้น ส่วนที่เหลือของ pipeline (แต่งบท, สรุปตัวละคร,
เขียน season arc, บทพูด, วิดีโอพรอมต์ ฯลฯ) ยังคงใช้ `resolveStoryBibleModel()`
(`verticalDramaStoryBible.ts:119-132`) ซึ่งเป็น auto-selector ตัวเดียวกับที่ทำให้
"generate start-frame render plan"/"generate storyboard" landing บนโมเดลถูกๆ
มาก่อนที่จะแก้ — คือ filter อ่อน (`supportsStructuredOutputs: true` เท่านั้น)
ไม่มีทางตั้งค่าเองได้เลย

ผู้ใช้ต้องการ: **จุดตั้งค่าเดียว** ต่อซีรีย์ (ไม่ใช่หลายช่องแยกตาม stage) ที่ครอบคลุม
LLM call ทุกจุดในการสร้างละคร (แต่งเรื่อง/บท, วิเคราะห์ตัวละคร, storyboard,
ฯลฯ) — default เป็นอัตโนมัติเหมือนเดิม แต่ถ้าตั้งค่าไว้ ทุก skill ที่เกี่ยวกับ
การสร้างละครต้องใช้โมเดลนั้นแทน เหตุผล: บางโมเดลเหมาะกับการแต่งเรื่อง/คิดบท
ตามภาษาของละคร (ไทย/จีน/อังกฤษ) ต่างกัน — ตั้งครั้งเดียวต่อซีรีย์ให้ผลตรงกันทุก
ขั้นตอน ไม่ต้องตั้งทีละจุด

**ยืนยันด้วยการ query จริง:** ยังไม่มี series ไหนตั้งค่า `llmModelPolicy` เดิมไว้
เลย (`SELECT count(*) ... WHERE "llmModelPolicy" IS NOT NULL` = 0) — ปลอดภัยที่
จะเปลี่ยนรูปแบบ schema จาก 2 ช่องเป็น 1 ช่องโดยไม่ต้อง migrate ข้อมูลเก่า

## Design

### หลักการ

โมเดล override ควร **override โมเดล auto ทุก tier เท่ากันหมด** — ไม่ว่า stage
นั้นปกติจะ auto-select ด้วย filter อ่อน (`resolveStoryBibleModel`) หรือ filter
เข้ม (`resolveQualityLargeContextModelId`) ก็ตาม เพราะเจตนาผู้ใช้คือ "ใช้โมเดลนี้
กับทุกอย่างที่เกี่ยวกับละครเรื่องนี้" ไม่ใช่ปรับทีละ tier

### 1. Schema —ยุบ 2 ช่องเหลือ 1 ช่อง
`shared/verticalDramaSeries/contracts.ts:234-237`:
```ts
export type VerticalDramaSeriesLlmModelPolicy = {
  defaultModelId?: string | null;
};
```
(ลบ `startFramePlanModelId`/`storyboardModelId` ทิ้งไปเลย — ไม่มีข้อมูลเก่าต้อง
migrate) คอลัมน์ `llmModelPolicy` jsonb เดิม (`drizzle/schema.ts:20399`) ใช้ต่อได้
เลย ไม่ต้องแก้ schema.ts/ไม่ต้อง migration ใหม่ (แค่เปลี่ยน shape ของ jsonb ฝั่ง
TypeScript)

### 2. Resolver กลางตัวเดียว
ไฟล์ใหม่ `server/services/verticalDramaLlmModelPolicy.ts`:
```ts
export async function resolveVerticalDramaSeriesModel(
  seriesId: number,
  autoFallback: () => Promise<string | null>,
): Promise<string> {
  try {
    const [row] = await db.select({ llmModelPolicy: verticalDramaSeries.llmModelPolicy })
      .from(verticalDramaSeries).where(eq(verticalDramaSeries.id, seriesId)).limit(1);
    const overrideId = (row?.llmModelPolicy as VerticalDramaSeriesLlmModelPolicy | null)?.defaultModelId;
    if (overrideId) {
      const rows = await loadEnabledLlmModelRows({ autoSelectionOnly: true });
      if (rows.some((r) => r.modelId === overrideId)) return overrideId;
      // override ถูกตั้งไว้แต่โมเดลถูกปิด/ลบไปแล้ว — ตกไป auto ตามปกติ
    }
  } catch {
    // best-effort เหมือน resolver อื่นทุกตัวในไฟล์นี้ — ไม่ throw
  }
  return (await autoFallback()) ?? (await resolveStoryBibleModel());
}
```
`resolveStartFramePlanModel`/`resolveStoryboardModel` (สร้างไว้แล้วใน
`verticalDramaImproveScript.ts`) เปลี่ยนมาเรียก helper ตัวนี้แทนการเช็ค
`llmModelPolicy` เอง (ลบ logic ซ้ำซ้อน) — 2 ฟังก์ชันนี้ยังคงชื่อเดิม ยัง
`export` ไว้เหมือนเดิม (ไม่ breaking change กับที่ wiring ไว้แล้ว) แค่ตัว body
เปลี่ยนไปเรียก resolver กลาง

### 3. ขยายไปทุก call site ที่ "มี seriesId อยู่แล้ว" (Phase B ส่วนใหญ่)
จากการสำรวจ ยืนยันตำแหน่งจริงแล้ว — 10 จุดนี้มี `seriesId` อยู่ใน params
อยู่แล้ว แค่เปลี่ยนจาก `resolveStoryBibleModel()`/`resolveQualityLargeContextModelId()`
เป็น `resolveVerticalDramaSeriesModel(params.seriesId, resolveStoryBibleModel /* หรือ resolveQualityLargeContextModelId ตาม tier เดิมของ stage นั้น */)`:
- `verticalDramaStoryBible.ts:1205` (`generateStoryBible`)
- `verticalDramaSeriesMemoryPlanning.ts:228`
- `verticalDramaVideoMotionPromptGeneration.ts:693,1914` (2 จุด — จุดที่ 3 คือ
  fallback resolver ภายใน ดู หัวข้อ 4)
- `verticalDramaEpisodeQualityReview.ts:946`
- `verticalDramaLedgerPlanner.ts:296`
- `verticalDramaScriptGeneration.ts:1038` (นี่คือจุด "แต่งบท" ที่ผู้ใช้พูดถึงตรงๆ
  — ปัจจุบันอยู่ tier อ่อน `resolveStoryBibleModel`)
- `verticalDramaDialogueAudio.ts` — มี seriesId ใน Zod input ของ router แต่ยังไม่
  อยู่ใน params ของ service function เอง (ดูหัวข้อ 4)
- `verticalDramaCharacterImageGeneration.ts:824` (`generateCharacterVisualPrompts`,
  ผ่าน alias `resolveCharacterVisualBibleModel`) — นี่คือจุด "สรุปตัวละคร/สร้าง
  ตัวละคร" ที่ผู้ใช้พูดถึงตรงๆ
- `verticalDramaStoryboardGeneration.ts`/`verticalDramaStartFrameGeneration.ts`
  — เปลี่ยนอัตโนมัติเพราะไปเรียก `resolveStartFramePlanModel`/
  `resolveStoryboardModel` ซึ่งแก้ที่ต้นทางในหัวข้อ 2 แล้ว (ไม่ต้องแก้ 2 ไฟล์นี้
  เพิ่ม)

### 4. Thread `seriesId` เข้าฟังก์ชันที่ยังไม่มี (งานเสริม เล็กแต่กระจาย)
ฟังก์ชัน/resolver ต่อไปนี้ยังไม่มี `seriesId` ใน params ของตัวเอง ทั้งที่ผู้เรียก
มีอยู่แล้วในสโคป — ต้อง thread เข้าไป (เพิ่ม field ใน params type + ส่งจาก
caller) ก่อนจะ wire เข้า resolver กลางได้:
- `verticalDramaCharacterVariantPlanner.ts`'s `generateCharacterVariantPlan`
  (`GenerateCharacterVariantPlanParams`) — caller `verticalDramaImproveScript.ts:1482`
  มี `seriesId` ในสโคปอยู่แล้ว
- `verticalDramaShotImageAction.ts`'s `generateShotImageAction`
  (`GenerateShotImageActionParams`) — caller (`verticalDramaEpisodes.ts:7918/8353/8768`)
  มี `seriesId` ในสโคป router อยู่แล้ว
- `verticalDramaDialogueAudio.ts`'s `generateEpisodeDialogueAudioPlan`
  (`GenerateEpisodeDialogueAudioPlanParams`)
- `verticalDramaPromptQc.ts`'s `ensurePromptWithinLimit`
  (`EnsurePromptWithinLimitParams`) — เรียกจากหลายจุดใน `verticalDramaEpisodes.ts`
- `verticalDramaAdBanner.ts`'s `resolveAdBannerPromptModel` — internal fallback
  resolver, caller `generateAdBannerPrompt` มี `seriesId` อยู่แล้ว
- `verticalDramaVideoMotionPromptGeneration.ts`'s `resolveShotVideoPromptModel`
  — internal fallback resolver, caller มี `seriesId` อยู่แล้ว

### 5. ข้อยกเว้นที่ตั้งใจ — ไม่แตะ
`verticalDramaPresetSynthesis.ts:514,983` (`synthesizeVerticalDramaPreset`/`...V2`)
— ทำงานตอน**ยังไม่มี series** (ขั้นตอนร่าง preset ก่อนสร้างซีรีย์จริง) ไม่มี
`seriesId` ให้ผูกกับ override ได้เลยโดยธรรมชาติ ปล่อยไว้บน auto ตามเดิม — ระบุ
เป็นข้อยกเว้นที่ตั้งใจ ไม่ใช่จุดตกหล่น

### 6. Router — เหลือ mutation เดียว ง่ายลง
`server/routers/verticalDramaSeries.ts`:
- `listQualityPlanningModels` (`:2761-2799`) — คงไว้เหมือนเดิมทุกอย่าง (แค่ list
  โมเดลที่ eligible ไม่เกี่ยวกับ field ไหน)
- `setSeriesLlmModelPolicy` (`:2813-2871`) — เปลี่ยน input จาก 2 field เป็น
  `{ seriesId: z.string().min(1), defaultModelId: z.string().min(1).nullable() }`
  (ตัดเดียว ไม่ต้องมี `.refine()` ใครมีใครไม่มีแล้ว เพราะเหลือ field เดียวเป็น
  required-but-nullable) validate `defaultModelId` (ถ้าไม่ null) กับ
  `selectQualityLargeContextEligibleModels` เหมือนเดิม เขียนทับ
  `llmModelPolicy` ทั้งก้อนได้เลย (ไม่ต้อง merge เพราะเหลือ field เดียว)

### 7. UI — เหลือ dropdown เดียว
`client/src/components/verticalDramaSeries/VerticalDramaSettingsTab.tsx`:
ยุบ 2 บล็อก `<Select>` (`:411-440`, `:442-469`) เหลือ 1 บล็อก ผูกกับ
`defaultModelId` เดียว, ยุบ 2 `useState`/`useEffect` เหลือ 1 คู่, ยุบ
`handleSave`'s payload เหลือส่ง `{ seriesId, defaultModelId }` เมื่อ dirty
label dropdown แนะนำ: "โมเดล LLM สำหรับสร้างเนื้อหาละคร (แต่งบท/ตัวละคร/storyboard)"
พร้อม helper text อธิบายว่าครอบคลุมทุกขั้นตอนของซีรีย์นี้

## Work package assignment (ตาม Rule 1b เหมือนเดิม)

- **Phase 1** (ssp-backend): ข้อ 1-2-6 — schema type ใหม่, resolver กลาง,
  ปรับ `resolveStartFramePlanModel`/`resolveStoryboardModel` ให้เรียก resolver
  กลาง, router 2 procedures ทำก่อน เพราะทุก phase หลังต้องพึ่งพา resolver กลาง
  นี้
- **Phase 2** (ssp-backend, รอ Phase 1 เสร็จ): ข้อ 3 — wire 10 จุดที่มี seriesId
  อยู่แล้ว เข้า resolver กลาง (ไฟล์ไม่ทับกับ Phase 1)
- **Phase 3** (ssp-backend, รอ Phase 1 เสร็จ, รันคู่กับ Phase 2 ได้ถ้าไฟล์ไม่ชน —
  เช็คก่อน): ข้อ 4 — thread `seriesId` เข้า 6 ฟังก์ชัน/resolver ที่ยังไม่มี แล้ว
  wire เข้า resolver กลาง
- **Phase 4** (ssp-frontend, รอ Phase 1 เสร็จ): ข้อ 7 — ยุบ UI เหลือ dropdown
  เดียว

ทุก phase ตรวจสอบเองก่อนส่งต่อ (diff review + `pnpm check` + tests) ตาม
วินัยเดิมทั้งเซสชัน

## Verification
- `pnpm check` + รัน test ของทุกไฟล์ที่แตะ หลังแต่ละ phase
- Manual: ตั้งค่า "โมเดล LLM สำหรับสร้างเนื้อหาละคร" เป็นโมเดลเฉพาะในซีรีย์ทดสอบ
  แล้วรัน "ปรับปรุงบทละคร" (ซึ่งเรียกทั้ง script generation + character variant
  planner ในขั้นตอนเดียว) และสร้าง storyboard — เช็ค audit log
  (`logs/audit/audit-*.jsonl`) ว่าทุก LLM call ของซีรีย์นี้ใช้โมเดลที่ตั้งไว้จริง
  ไม่ใช่โมเดล auto เดิม แล้วลบ override กลับเป็นอัตโนมัติ เช็คว่ากลับไปใช้ auto
  ตาม tier เดิมของแต่ละ stage ถูกต้อง

## Phase 6 (เพิ่มเติม 2026-07-11): ยกระดับ auto-tier ของทุกสเตจให้เท่ากับ improve-script

### ปัญหาที่พบจากการใช้งานจริง

ผู้ใช้สังเกตว่า "generate story bible"/"generate episode script" มักตกไปที่
`gpt-5.4-nano` (ราคาถูก) ในขณะที่ "Improve script usage"
(`drama-script-evaluate-improve` skill, ใช้ `resolveQualityLargeContextModelId`)
ตกไปที่ `gemini-3.1-flash-lite-preview` สม่ำเสมอ — สาเหตุคือทั้งสองฝั่งใช้
auto-selector คนละ tier กัน:
- `resolveStoryBibleModel()` — filter อ่อน (แค่ `supportsStructuredOutputs: true`)
  ใช้เป็น auto-fallback ของ 13 จุดเรียกใน 9 ไฟล์
- `resolveQualityLargeContextModelId()` — filter เข้ม (context ≥1M, ไม่ใช่ free,
  `supportsThinking: true`) ใช้อยู่แล้วใน 3 จุด (character-variant-planner,
  start-frame-plan, storyboard)

ผู้ใช้ยืนยันเจตนา: "ให้ใช้เกณฑ์และวิธีการเดียวกัน ระบบก็ควรเลือกไปตกที่ gemini
เช่นกัน" — ต้องการให้ทุกสเตจที่ auto-select (ไม่มี override) ใช้เกณฑ์คุณภาพ
เดียวกันหมด ไม่ใช่แค่บางสเตจ

### การเปลี่ยนแปลง

สลับ argument ตัวที่สองของ `resolveVerticalDramaSeriesModel(seriesId, autoFallback)`
จาก `resolveStoryBibleModel` เป็น `resolveQualityLargeContextModelId` ใน 13
จุดเรียกต่อไปนี้ (mechanical parameter swap, type-compatible อยู่แล้วเพราะ 3
จุดเดิมใช้ `resolveQualityLargeContextModelId` แบบเดียวกันนี้สำเร็จมาก่อน):

1. `verticalDramaStoryBible.ts:1206` (`generateStoryBible` — จุดที่ผู้ใช้รายงาน)
2. `verticalDramaScriptGeneration.ts:1039` (`generateEpisodeScript` — จุดที่
   เห็นใน screenshot ที่สอง)
3. `verticalDramaSeriesMemoryPlanning.ts:229`
4. `verticalDramaLedgerPlanner.ts:297`
5. `verticalDramaEpisodeQualityReview.ts:947`
6. `verticalDramaCharacterImageGeneration.ts:780` (`resolveCharacterVisualBibleModel`)
7. `verticalDramaDialogueAudio.ts:1291`
8. `verticalDramaShotImageAction.ts:281`
9. `verticalDramaPromptQc.ts:189` (`refineOnce`)
10. `verticalDramaAdBanner.ts:271` (`resolveAdBannerPromptModel` non-vision fallback)
11. `verticalDramaVideoMotionPromptGeneration.ts:694` (`generateVideoMotionPromptPack`)
12. `verticalDramaVideoMotionPromptGeneration.ts:855` (`resolveShotVideoPromptModel`
    non-vision fallback)
13. `verticalDramaVideoMotionPromptGeneration.ts:1933` (`generateVerticalDramaClipDialogue`)

**ไม่แตะ**: 3 จุดที่ใช้ `resolveQualityLargeContextModelId` อยู่แล้ว
(`verticalDramaCharacterVariantPlanner.ts`,
`resolveStartFramePlanModel`/`resolveStoryboardModel` ใน
`verticalDramaImproveScript.ts`) — ถูกต้องอยู่แล้ว ไม่ต้องเปลี่ยน

`resolveVerticalDramaSeriesModel`'s ตัว resolver กลางเองไม่ต้องแก้ — ยัง
fallback ไป `resolveStoryBibleModel()` เป็นชั้นสุดท้ายเหมือนเดิมถ้า
`resolveQualityLargeContextModelId()` คืน `null` (catalog ว่าง) — ยังคง
contract "never null" เดิมทุกประการ

ผลลัพธ์: เมื่อไม่มี override ตั้งไว้ (auto ปกติ) ทุกสเตจของสาย Vertical Drama
จะได้โมเดลคุณภาพเดียวกัน (ถูกที่สุดที่ผ่านเกณฑ์ context≥1M/ไม่ฟรี/thinking) —
ไม่ตกไปที่โมเดล nano ราคาถูกอีก สอดคล้องกับ "Improve script usage" ที่ทำงาน
ถูกต้องอยู่แล้ว

### Verification
- `pnpm check` + รัน test ของทุกไฟล์ที่แตะ (13 จุด, 9 ไฟล์ + test files คู่กัน)
- ยืนยันว่า cost/token ที่เพิ่มขึ้นเป็นที่ยอมรับได้ (เกณฑ์ยังเลือก "ถูกที่สุดที่ผ่าน
  เกณฑ์คุณภาพ" ไม่ใช่แพงที่สุด)

### สถานะ Phase 6: เสร็จสมบูรณ์ (2026-07-11) — ตรวจสอบอิสระแล้ว

ทั้ง 13 จุดสลับ argument ถูกต้อง (ตรวจ diff ทีละไฟล์เอง ไม่ใช่แค่เชื่อรายงาน
agent) + พบและแก้ **จุดที่ 14 ที่ตกหล่นจากการสำรวจเดิม**:
`verticalDramaEpisodeContinuation.ts`'s `generateNextEpisodesViaLlm`
("generate next episodes" — มี `seriesId` ในพารามิเตอร์อยู่แล้วตั้งแต่ Phase 1
แต่ไม่เคยถูก wire เข้าระบบ model-policy เลยไม่ว่า Phase ไหน) — แก้ให้ตรงตาม
pattern เดียวกันแล้ว (ผู้ควบคุมแก้เอง ไฟล์เดียว มีความเสี่ยงต่ำ, ไม่มี
circular-import กับ `verticalDramaImproveScript.ts`)

**Circular-import ที่พบจริง**: `verticalDramaStoryBible.ts` ต้องใช้ dynamic
`await import("./verticalDramaImproveScript")` แทน static import เพราะ
`verticalDramaImproveScript.ts` import กลับมาจากไฟล์นี้อยู่แล้ว — static
import ทำให้ test ที่ partial-mock ผ่าน `vi.importActual` ได้ mock ผิดตัว
(ยืนยันจากการรัน test จริง ไม่ใช่แค่ typecheck)

**บั๊กที่พบระหว่างตรวจสอบเอง (agent รายงานไม่ครบ)**:
`server/routers/__tests__/verticalDramaDialogueAudio.test.ts` โหลดไม่ได้เลย
(0 test collected) เพราะ mock ของ service module ใช้ `vi.importActual` ซึ่งไป
eager-evaluate import ใหม่ของ `verticalDramaImproveScript.ts` ที่เพิ่งเพิ่มใน
Phase 6 → ลากเข้า `enabledLlmModels.ts` → `llmProviders.ts` → ต้องการ
`adminProcedure` ที่ mock ของไฟล์นี้ไม่มี — แก้โดยเพิ่ม
`vi.mock("../../services/verticalDramaImproveScript", ...)` ตาม pattern
เดียวกับที่ไฟล์นี้ guard `verticalDramaStoryBible`/`verticalDramaLlmModelPolicy`
ไว้แล้ว

**ผลตรวจสอบสุดท้าย**: `pnpm check` 0 errors, full vertical-drama suite (173
ไฟล์/2933 tests) กลับมาตรงกับ baseline เดิมเป๊ะ — 2918 passed, 15 failed
(ทั้งหมดเป็น pre-existing/ไม่เกี่ยวข้องตามที่บันทึกไว้ใน Phase 3)
