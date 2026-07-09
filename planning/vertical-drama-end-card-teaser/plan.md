# Vertical Drama — Text Overlay Suite (ยกระดับจาก End-Card Teaser) — Task #34 v2

Owner directives (2026-07-09):
1. ข้อความท้ายตอนกระตุ้นติดตาม (ปมค้าง/hook) — optional
2. ข้อความเล่าเรื่องกลางตอน: ป้ายเวลา/สถานที่ ("ย้อนเวลาไปปี 1980", "เมื่อสองวันก่อนหน้า")
   + ข้อความ narrator กระตุ้น ("นางเอกของเรา เจอกับพระเอกครั้งแรก จะเกิดอะไรขึ้น") — optional
3. "ช่วยหา Solution อื่น ๆ ที่ทำให้ละครสั้นโดดเด่นขึ้น" → รวม text-based ทั้งหมดเข้า suite นี้

## สถาปัตยกรรมรวม: หนึ่งช่อง หลายชนิดการ์ด

ทุกชนิดคือ "ASS event + style เฉพาะ" บนช่องซับไตเติลเดิมของ #21 (ไฟล์ ASS เดียว
หลาย style ได้โดยธรรมชาติ) + ตัวแปลงเวลา shot→absolute ที่มีแล้ว (#21-B) — ชิ้นใหม่จริง
คือ data model + UI + การ derive ข้อความ ไม่มี infra ใหม่

**คอลัมน์เดียว** `vertical_drama_episodes.textOverlayPlan` jsonb (nullable; manual SQL +
provenance + backup; แทนที่ endCardTeaser เดิมในแผน v1 — ยังไม่ได้ implement จึงไม่มี migration ซ้อน):
```ts
{
  endCard?: { enabled, text?, source: "auto"|"manual", durationSec (2-5, default 3),
              showFollowLine (default true), styleVariant: "center_card"|"lower_band" };
  openerRecap?: { enabled, text?, source, durationSec (3-5) };        // "ความเดิมตอนที่แล้ว"
  titleBumper?: { enabled, text? };                                    // ชื่อเรื่อง+ตอน 1.2s เปิดคลิป
  episodeIndicator?: { enabled, position: "top_right"|"top_left" };    // "EP 3/10" จาง ๆ ตลอดคลิป
  characterIntroCards?: { enabled };                                   // ป้ายชื่อตัวละครครั้งแรกที่โผล่
  cards?: Array<{ id, kind: "time_setting"|"narrative_hook"|"custom",
                  anchor: { shotNumber, offsetSec? }, text, durationSec (1.5-5),
                  styleVariant, enabled }>;                             // การ์ดกลางตอน
}
```

## แหล่งข้อความอัตโนมัติ (deterministic ก่อน, LLM เป็น backlog)

| ชนิด | ที่มาอัตโนมัติ | หมายเหตุ |
|---|---|---|
| endCard | manual > cliffhanger_line (active item) > hook_opened ที่ยัง unresolved > fallback | ตาม v1 เดิม |
| openerRecap | memory `episode_summary` ของตอนก่อนหน้า (มีในระบบแล้ว) → clamp 2 บรรทัด | ตอนที่ 1 ไม่มี recap |
| titleBumper | ชื่อซีรีส์ + "EP N: ชื่อตอน" | จาก series/episode rows |
| episodeIndicator | "EP N/รวม" จาก targetEpisodeCount | text จาง opacity ต่ำ |
| characterIntroCards | ช็อตแรกที่ตัวละครโผล่: จาก frame.requiredCharacterRefs (มี per-shot อยู่แล้ว) → ป้าย lower-third ชื่อ+บทบาท 2.5s | pattern ซีรีส์สตรีมมิ่ง — ดูโปรทันที |
| cards: time_setting / narrative_hook | **สร้างตอน generate บท/ร่าง**: ขยาย output schema ของ script-builder + deep-draft ด้วย optional `text_card_suggestions[]` ต่อช็อต (LLM รู้เรื่องดีที่สุดตอนนั้น — ไม่มี call เพิ่ม) + user เพิ่ม/แก้เองได้เสมอ | grandfather: บทเก่าไม่มี suggestions = list ว่าง |

## Styles (ASS ใหม่ ~6 ตัว บนไฟล์เดียว)

VdEndCardTeaser (ใหญ่ 1.6x กลางจอ/แถบล่าง, fade 0.4s) · VdOpenerRecap (บนจอ, มีหัว
"ความเดิม…") · VdTitleBumper (ใหญ่กลางจอ 1.2s fade) · VdEpIndicator (เล็ก มุมจอ,
opacity ~55%) · VdCharacterIntro (lower-third ซ้าย ชื่อหนา+บทบาทบาง) · VdTimeSetting
(สไตล์ cinema — เหลือง/ขาว serif-ish กลางจอบน, letter-spacing) · VdNarrativeHook
(ใหญ่ เอียงเล็กน้อย มี accent) — ทุกตัว fade in/out, ตำแหน่ง 1080x1920 ปลอด safe zones

## กติกากันชนกันเอง (deterministic validation → warning ไม่ block)

- การ์ดกลางตอนซ้อนเวลากับซับบทพูดได้ (คนละโซนจอ) แต่ >2 การ์ดพร้อมกัน = เตือน
- fullscreen banner ทับช่วง endCard/opener = เตือน (z-order banner ชนะ)
- opener+titleBumper ซ้อนต้นคลิป → จัดคิวต่อกันอัตโนมัติ (bumper ก่อน แล้ว recap)

## UI

- Workspace render options section: กลุ่ม "ข้อความบนวิดีโอ" — toggles รายชนิด +
  ตัวแก้ endCard/opener (auto-fill + ป้ายที่มา + คืนค่าอัตโนมัติ) + list editor การ์ด
  กลางตอน (เพิ่ม/แก้/ลบ: เลือกช็อต, ชนิด, ข้อความ, ระยะเวลา — pre-populate จาก
  suggestions ของบทถ้ามี) + preview ข้อความจำลอง
- Batch season render: toggle รวม "ใส่ข้อความตามแผนของแต่ละตอน"
- Mutation `updateEpisodeTextOverlayPlan` + validation ครบ

## ลายน้ำ (Watermark — owner เพิ่ม 2026-07-09)

**ระดับซีรีส์** (branding ผูกกับเรื่อง ไม่ใช่รายตอน) — คอลัมน์ใหม่
`vertical_drama_series.watermark` jsonb (nullable; manual SQL + provenance + backup):
```ts
{ enabled: boolean;
  type: "text" | "image";
  text?: string;                                  // เช่น "@ชื่อช่อง" / ชื่อซีรีส์
  imageUrl?: string;                              // โลโก้ PNG โปร่ง — ใช้ท่ออัปโหลด asset เดิม
  position: "top_left"|"top_right"|"bottom_left"|"bottom_right";  // default top_right
  opacity: number;                                // 0.2–0.8, default 0.45
  scalePct: number;                               // ความกว้าง % ของเฟรม 5–20, default 10
  marginPx: number;                               // default 32, เคารพ safe zones
}
```
- **Render**: type text → ASS style `VdWatermark` (event ยาวตลอดคลิป, opacity ต่ำ —
  pattern เดียวกับ episodeIndicator); type image → overlay input ใหม่แยกจาก banners
  ใน buildFinalRenderFfmpegArgs (scale ตาม scalePct + format=rgba + colorchannelmixer
  ปรับ alpha + overlay ตลอดคลิป) — **z-order บนสุดเหนือทุกชั้นรวม fullscreen banner**
  (branding ต้องรอดเสมอ)
- ตัวเลือกตอน render: toggle "ใส่ลายน้ำ" (default เปิดเมื่อซีรีส์ config ไว้) + batch ตาม
- UI ตั้งค่า: section เล็กในหน้าซีรีส์ (แท็บตั้งค่า/ภาพรวม — investigate ตำแหน่งที่เข้ากับ
  โครงหน้า) + preview ตำแหน่งบน mock เฟรม
- episodeIndicator กับ watermark มุมเดียวกัน → auto-เลี่ยงคนละมุม (validation)

## Flag + ลำดับ

F131AB `verticalDramaSeriesTextOverlaySuite` (4 จุด + admin group, default false →
เปิด 2 tenants หลัง deploy) — flag เดียวคุมทั้ง suite **รวม watermark**, toggle รายชนิดอยู่ในแผนต่อตอน/ซีรีส์

**BLOCKED โดย #32** (featureFlags.ts + schema.ts) → #32 จบ: dispatch 1 agent
(engine ASS styles + resolver anchors + service derive + router + UI + tests ครบ) →
verify → deploy รวม → spec addendum (หลัง #33)

## Solution เสริมนอกเหนือ text (เสนอ owner — ยังไม่อยู่ใน #34)

| ไอเดีย | ใช้ของที่มี | Effort | ต้นทุนรัน | Impact |
|---|---|---|---|---|
| **ตัวอย่างตอนต่อไปท้ายคลิป** (next-episode preview 5-8s: ตัด 2-3 ช็อตเด็ดของตอนถัดไปที่ gen แล้ว ต่อท้าย endCard) | คลิปตอนถัดไป + concat engine เดิม | M | ~0 (reuse คลิปที่มีแล้ว) | สูงมาก — retention กลไกเดียวกับซีรีส์ดัง |
| **BGM + auto-duck ใต้เสียงพูด** (เพลงประกอบ user อัปโหลด/คลังกลาง; duckClipAudioDb มีช่องรออยู่แล้วใน engine) | amix + sidechain/volume automation | M | 0 | สูง — production value ต่างชั้น |
| **Color grade ตามแนวเรื่อง** (LUT/eq per genre preset — ผูก presetVisualIdentity ที่มีอยู่) | ffmpeg eq/curves ใน graph เดิม | M | 0 | กลาง-สูง — โทนภาพนิ่งทั้งซีรีส์ |
| Karaoke word subtitle เป็น default สำหรับซีนดราม่าหนัก | preset karaoke_word ที่ ship แล้ว | S (แค่ default/แนะนำ) | 0 | กลาง |
