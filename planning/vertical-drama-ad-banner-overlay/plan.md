# Vertical Drama — Ad Banner Overlay System (Task #30)

Owner directive (2026-07-08): ในแท็บ "สินค้าผูกเรื่อง" เพิ่ม option ซ้อนภาพโฆษณาบนวิดีโอ —
แบนเนอร์ล่าง / แบนเนอร์แนวตั้ง / เต็มจอ; ระบบอ่านภาพ+รายละเอียดสินค้า → generate prompt
ตาม preset แนวทางโฆษณา 2026 จำนวน 10 แบบ; user เลือก media model + ขนาดตามที่ model
รองรับ; แก้ prompt ได้ก่อนสั่ง generate; แสดงชั่วคราวตามช่วงเวลาหรือทั้งคลิป;
1–5 banners ต่อ 1 วิดีโอ; composite ตอน render mp4; มาตรฐาน production grade

**สถานะ:** ออกแบบเสร็จ (grounded จาก Explore 2026-07-08) — รอ implement (#30-A) หลัง slot ว่าง

---

## 1) Positioning: Overlay Ads ≠ Story Tie-in

ระบบ tie-in เดิม = สินค้า "อยู่ในเนื้อเรื่อง" (ผ่าน dialogue/ฉาก พร้อม naturalness QC)
ระบบใหม่ = **ชั้นโฆษณา overlay เหนือวิดีโอ** (เหมือน L-band/lower-third/interstitial ของทีวี)
เป็น option แยก เปิดเสริมหรือใช้แทนกันได้ ไม่แตะเนื้อเรื่อง/บท/storyboard ใด ๆ

ผลเชิงสถาปัตยกรรมที่สำคัญที่สุด: **เส้นทาง prompt ของแบนเนอร์ต้องไม่ผ่าน guard ของ story**
- `sanitizeBrandMentionsInPrompt` + `VD_PRODUCT_LOCK_INSTRUCTION`
  (verticalDramaProductTieIn.ts:558,684) ถูกสร้างมากันภาพ "ในเรื่อง" ดูเป็นโปสเตอร์โฆษณา
  — แบนเนอร์คือโฆษณาโดยเจตนา จึง**ยกเว้น** guard ชุดนี้
- ที่**คงไว้**: `forbiddenClaims[]` (ตรวจ deterministic ใน prompt+copy),
  `regulatedCategory` → บังคับ `requireHumanApproval` ก่อนแบนเนอร์เข้า render,
  `disclosurePolicy` → มี option ป้าย "โฆษณา/ผู้สนับสนุน" (v1 = แนะนำใน prompt;
  ป้าย drawtext deterministic เป็นงาน #21)

## 2) Data model

ออกแบบ 2 ชั้น (สินค้าเป็นของ series → ดีไซน์แบนเนอร์ที่ series; การใช้เป็นของ "ต่อวิดีโอ" → เลือกที่ episode):

**ชั้นดีไซน์ (series):** ขยาย `vertical_drama_series.productTieIn` jsonb (merge-patch เดิม
ผ่าน updateSeries — VerticalDramaProductTieInTab.tsx:142) เพิ่ม:
```ts
adBanners?: Array<{            // แบนเนอร์สูงสุด 5 ดีไซน์ต่อซีรีส์
  id: string;
  stylePresetId: VdAdBannerStyleId;        // 1 ใน 10 เทรนด์
  placementId: "bottom_band" | "side_vertical" | "fullscreen";
  sideAlign?: "left" | "right";            // เฉพาะ side_vertical
  copy: { headline?: string; subtext?: string; priceText?: string; ctaText?: string };
  prompt: { generated?: string; negative?: string; final?: string; editedAt?: string };
  generation: { modelId?: string; aspectRatio?: string; size?: string };
  imageAsset?: { url: string; taskId?: string; width?: number; height?: number; generatedAt: string };
  defaultTiming: { mode: "entire" | "window"; startSec?: number; durationSec?: number };
  status: "draft" | "prompt_ready" | "generating" | "ready" | "failed";
  approval?: { required: boolean; approvedBy?: string; approvedAt?: string };
}>
```
**ชั้นการใช้ (episode):** คอลัมน์ใหม่ `vertical_drama_episodes.adBannerPlan` jsonb (nullable —
manual SQL + provenance file ตาม precedent voiceConfig; backup ตาม DB protocol):
```ts
{ enabled: boolean;
  selections: Array<{ bannerId: string;
    timing?: { mode: "entire" | "window"; startSec: number; durationSec: number }; // override default
  }> }   // validate ≤5 ต่อวิดีโอ, fullscreen ห้ามช่วงเวลาทับกันเอง
```
เหตุผลไม่สร้างตารางใหม่: ปริมาณข้อมูลเล็ก (≤5 objects), ชีวิตผูกกับ series/episode,
convention เดิมของ feature นี้คือ jsonb ทั้งหมด (productTieIn, assemblyManifest, breakdownVersions)

## 3) Placement presets (กล่องพิกัดบนเฟรม 1080×1920)

| id | กล่อง (x,y,w,h) | target aspect | default | หมายเหตุ |
|---|---|---|---|---|
| `bottom_band` | 0, 1400, 1080, 360 | 3:1 | ทั้งคลิป | เหนือ safe zone ล่าง 160px (UI แพลตฟอร์ม/subtitle) |
| `side_vertical` | 20 หรือ 760, 480, 300, 960 | ~1:3 | ทั้งคลิป | ชิดขอบซ้าย/ขวา กลางแนวตั้ง เว้น UI ขวาของ TikTok |
| `fullscreen` | 0, 0, 1080, 1920 | 9:16 | window 3s | interstitial/end-card, fade 0.3s, ทึบเต็ม |

**ขนาด gen จริงตาม media model:** media models เก็บ `aspectRatios[]`+`sizes[]`
(schema.ts:2431/2434; ตัวเลือกกรองตาม model แบบ MediaStudio.tsx:38744) ซึ่งไม่มี 3:1/1:3
→ มาตรฐาน production: gen ที่ aspect ใกล้สุดที่ model มี (band→16:9, side→9:16 หรือ 2:3,
fullscreen→9:16 ตรง) แล้ว **cover-fit + center-crop ลงกล่อง** ตอน composite; skill สั่ง
composition ให้ crop-safe (เช่น band: "wide horizontal banner, subject in left third,
critical content within center 60% height")

## 4) Style presets 10 เทรนด์ 2026 (`shared/verticalDramaSeries/adBannerPresets.ts`)

โครง: `{ id, nameTh, nameEn, essenceTh, promptTokens: { style[], composition[], texture[],
lighting[] }, negativeTokens[], fitCategories[], textInImageRisk: "low"|"med"|"high" }`
แนะนำอัตโนมัติ: match `productCategory` ของ tie-in กับ `fitCategories` (เรียง preset ที่เข้ากันขึ้นก่อน)

| id | ไทย | tokens หลัก (ย่อ) | fitCategories |
|---|---|---|---|
| `imperfect_by_design` | ไม่สมบูรณ์แบบที่ตั้งใจ | hand-drawn elements, scribble accents, brush stroke, film grain, paper texture, rough edges, human touch | coffee, fashion, handmade, organic_food, personal_brand |
| `reality_warp` | โลกจริงบิดเหนือจริง | photoreal base, floating objects, distorted perspective, liminal space, impossible physics, surreal lighting | perfume, luxury, fashion, tech, gaming |
| `tactile_sensory` | สัมผัสได้ | macro fabric texture, glass refraction, liquid splash, velvet, wood grain, puffy 3D typography | cosmetic, furniture, fashion, luxury |
| `bold_typography` | ตัวอักษรพระเอก | huge headline dominating frame, high contrast, editorial layout, variable font weight | sport, promotion, fashion, beverage |
| `retro_futurism` | อนาคตในมุมอดีต | chrome, neon glow, metallic, holographic, VHS artifacts, space age, Y2K | gaming, tech, automobile, music |
| `documentary_realism` | ความจริงใจขายได้ | natural light, authentic candid expression, lifestyle setting, minimal retouch | healthcare, food, travel, wellness, personal_brand |
| `multi_dimensional` | มิติและพื้นที่ | 3D objects, floating layers, deep depth of field, spatial composition, soft shadows | tech, product_launch, ui, packaging |
| `emotional_gradient` | Gradient สร้างอารมณ์ | mesh gradient, aurora gradient, soft glow, smooth color transition backdrop | app, startup, beauty, technology |
| `collage_mixed_media` | คอลลาจหลายวัสดุ | paper cut collage, tape, handwritten notes, vintage print, stickers, mixed media | editorial, fashion, music, lifestyle |
| `vertical_first` | มือถือก่อน | 9:16 native layout, big text hook, center composition, platform safe zones, thumb-stopping | tiktok, reels, shorts, mobile_ads |

## 5) Skill: `skills/vertical-drama-ad-banner-prompt/`

- โครงไฟล์ตาม convention (skill.md + SKILL.md + schemas/{input,output,ui}.schema.json)
  โหลดฝั่ง server ด้วย pattern `loadSkillSystemPrompt` (verticalDramaStoryboardGeneration.ts:74)
- **Input:** product (name, category, forbiddenClaims, copy จาก user), imageAnalysis
  (สี/บรรจุภัณฑ์/mood ที่ LLM vision อ่านจาก productImageUrl+capture images), stylePreset
  tokens, placement composition constraints, language=th
- **Output (JSON):** `{ imagePrompt, negativePrompt, textInImage: string[],
  compositionNotes, complianceNotes }`
- **Model resolution แบบ capability (ห้าม hardcode):**
  `selectBestLlmModel({ supportsVision: true, supportsStructuredOutputs: true })` เมื่อมีภาพสินค้า
  → fallback `resolveStoryBibleModel()` — copy shape จาก `resolveShotVideoPromptModel`
  (verticalDramaVideoMotionPromptGeneration.ts:766)
- **ความเสี่ยงตัวหนังสือไทยในภาพ gen:** จริงและต้องบอก user ตรง ๆ — mitigation:
  (1) skill จำกัด textInImage ให้สั้น ใส่ใน prompt แบบ quoted string,
  (2) `textInImageRisk` ของ preset แสดง warning ใน UI + แนะนำ model ที่เก่ง text
  (จาก configJson ของ model ถ้ามี metadata, ไม่ hardcode ชื่อ),
  (3) user แก้ prompt เองได้ก่อน gen + regen ได้,
  (4) v2: ชั้นตัวหนังสือ CSS แบบ hyperframes (precedent มีแล้ว 21 presets —
  shared/hyperframes/runtimeApiSchemas.ts:266) วางทับภาพ background ที่ gen — บันทึกเป็น backlog

## 6) UI (แท็บสินค้าผูกเรื่อง + จุดสั่ง render)

**Series tab (สตูดิโอแบนเนอร์):** section ใหม่ "แบนเนอร์โฆษณา (ซ้อนบนวิดีโอ)" ใต้ config tie-in เดิม
1. การ์ดแบนเนอร์ ≤5 ใบ: เลือก style preset (การ์ด 10 แบบ+คำอธิบายไทย เรียงตามความเข้ากับ
   productCategory) → เลือก placement (mockup 3 แบบ) → กรอก copy (headline/ราคา/CTA)
2. เลือก media model + aspect/size (กรองตาม model — pattern MediaStudio)
3. ปุ่ม "สร้าง Prompt" → skill สร้าง → แสดงใน **`InlineEditablePromptBox`**
   (reuse ตรง ๆ จาก VerticalDramaStoryboardPanel.tsx:5358 ตาม feedback reuse-existing-ui)
4. ปุ่ม "สร้างภาพแบนเนอร์" → mediaGenerationService (image) พร้อม
   `referenceImageUrls` = ภาพสินค้า (resolveProductReferenceImageUrls cap 3, trim ตาม
   maxReferenceImages) → poll → preview ภาพบน mock เฟรม 9:16 ตาม placement
5. regulated category → badge "ต้องอนุมัติก่อนใช้" + ปุ่มอนุมัติ

**Episode (ตอน assembly):** ใน dialog/section สั่งรวมคลิป เพิ่ม "แบนเนอร์ในวิดีโอนี้":
เลือกจากดีไซน์ ready ของซีรีส์ + ปรับ timing ต่อใบ (ทั้งคลิป/ช่วง วินาทีเริ่ม+ยาว) —
validate ≤5, fullscreen ไม่ทับกัน, เตือนถ้า fullscreen รวม >20% ของความยาวคลิป

## 7) Compositing (production-grade, บรรจบกับ #21)

ข้อเท็จจริง: ตัวรวม mp4 ปัจจุบันเป็น Node concat-only (`buildConcatFfmpegArgs` —
verticalDramaEpisodeVideoAssembly.ts:179) ส่วนกราฟ overlay/drawtext/amix สำเร็จรูปอยู่ฝั่ง
python `pipeline.py:467-514` ที่ VD จงใจไม่ใช้

**ตัดสินใจ: ขยาย Node ffmpeg graph (option A)** — เหตุผล: job model + durability
(assemblyManifest) มีอยู่แล้ว, ไม่ต้องสร้าง cross-language contract ใหม่, overlay/fade/amix
คือ filter string ที่ทดสอบเป็น unit ได้เหมือน buildConcatFfmpegArgs เดิม; python path เป็น
fallback ถ้ากราฟซับซ้อนเกิน

`buildFinalRenderFfmpegArgs` (แทน/ขยายของเดิม) รับเพิ่ม `banners: ResolvedBanner[]`:
```
inputs: concat list + banner PNG ต่อใบ (ดาวน์โหลด temp ก่อน spawn)
ต่อใบ:  [i:v] scale=w:h:force_original_aspect_ratio=increase, crop=w:h,
        format=rgba, fade=t=in:st=S:d=0.3:alpha=1, fade=t=out:st=E-0.3:d=0.3:alpha=1 [bN]
        [prev][bN] overlay=x:y:enable='between(t,S,E)' [vN]
z-order: วิดีโอ → band/side → subtitle (#21) → fullscreen
"entire" = S=0, E=ความยาวคลิป (จาก ffprobe รวมที่มีอยู่แล้วในขั้น concat)
```
งานเสียง (amix dialogueAudioTimeline) + subtitle burn เป็นของ #21 อยู่แล้ว —
**#30-B ถูกพับเข้า #21** เป็น filter-graph rework ครั้งเดียว ไม่ rework สองรอบ

## 8) Guardrails & QC (deterministic, v1)

- ≤5 banners/วิดีโอ; fullscreen ไม่ซ้อนช่วงเวลากันเอง; ทุก timing อยู่ในความยาวคลิป
- forbiddenClaims ตรวจใน prompt.final + copy ทุก field ก่อน gen และก่อน render (fail = block พร้อมเหตุผล)
- regulatedCategory + requireHumanApproval → แบนเนอร์ status ready แต่ไม่เข้า render จนกว่าอนุมัติ
- เตือน (ไม่ block): fullscreen รวม >20% ความยาว, band+side พร้อมกันตลอดคลิป (ads fatigue)
- credit: ภาพแบนเนอร์คิดผ่าน pipeline media เดิมตามปกติ

## 9) Feature flag + งานย่อย

Flag ใหม่ `verticalDramaSeriesAdBannerOverlay` (F131W) — 4 จุด register + group ใน
tenantFeatureFlagGroups + default false + เปิด 2 tenants หลัง deploy

**#30-A (อิสระ ทำได้ทันทีที่ slot ว่าง — ไม่แตะไฟล์ #29/#24):**
1. shared/verticalDramaSeries/adBannerPresets.ts (10 styles + 3 placements + types + validators) + tests
2. schema: adBannerPlan jsonb บน episodes (manual SQL + backup + provenance) — series ใช้ productTieIn เดิมไม่ต้อง migrate
3. skill folder vertical-drama-ad-banner-prompt + service generateAdBannerPrompt (vision-capable resolver) + endpoint (async ถ้าช้า — jobify pattern #28 พร้อมใช้)
4. endpoint generate ภาพ (ต่อ mediaGenerationService + refs + credits) + poll
5. UI สตูดิโอในแท็บ tie-in + per-episode selection + validators + copy ไทย
6. flag F131W + tests ครบชั้น (shared/service/router/component)

**#30-B (อยู่ใน #21):** ResolvedBanner → buildFinalRenderFfmpegArgs + ดาวน์โหลด PNG +
z-order กับ subtitle/audio + smoke จริง 1 คลิป

**ลำดับคิวใหม่:** #29,#24 (กำลังรัน) → **#30-A** (ไฟล์ไม่ชนใคร เริ่มได้ก่อน #22) →
#22 (รอ #29 ปล่อย storyBible) → #23 → #21(+#30-B) → #25 → #26 → #27

## 10) เก็บเป็น backlog (ตั้งใจตัด v1)

- ชั้นตัวหนังสือ CSS ทับภาพ gen (hyperframes-style) — แก้จุดอ่อนตัวหนังสือไทยถาวร
- ป้าย disclosure drawtext อัตโนมัติตาม disclosurePolicy (รอ drawtext ใน #21)
- animation แบนเนอร์ (slide-in/loop) — v1 มีแค่ fade
- A/B หลายดีไซน์ต่อ placement + สถิติ
- ราคา/โปรโมชันดึงอัตโนมัติจาก marketplace capture (ตอนนี้ user กรอก copy เอง — ไม่มี field ราคาใน tie-in)
