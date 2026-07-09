# Vertical Drama — Standout Suite (Preview ตอนถัดไป + BGM Ducking + Color Grade) — Task #35

Owner approved 2026-07-09 ทั้ง 3 ข้อ พร้อมโจทย์เฉพาะ: (1) ตอนถัดไปยังไม่มีคลิปทำอย่างไร,
(2) กันปัญหาลิขสิทธิ์เพลงโดยเฉพาะ TikTok, (3) ผูก grade กับ visual identity เดิม —
"หา solution ที่เหมาะสมทำได้จริง ทำแบบรอบคอบ"

---

## 1) ตัวอย่างตอนต่อไปท้ายคลิป (Next-Episode Preview 5-8 วิ)

### คำตอบโจทย์ "ตอนถัดไปยังไม่ได้สร้างภาพ/วิดีโอ": บันไดวัสดุ 3 ขั้น — ไม่มีการจ่ายเงินอัตโนมัติ

| ขั้น | เงื่อนไข | วิธีทำ | ต้นทุน |
|---|---|---|---|
| **A. มีคลิปจริง ≥2** | ตอนถัดไป generate วิดีโอแล้วบางส่วน | ตัด 2-3 ช็อต ช็อตละ ~2-2.5 วิ จากคลิปจริง | 0 |
| **B. มีแค่ภาพ start frame** | ยังไม่มีวิดีโอ แต่มีภาพ | **Ken Burns montage** (ffmpeg zoompan: ซูม/แพนช้า ๆ บนภาพนิ่ง 2-3 ใบ + crossfade) — เทคนิคมาตรฐานวงการ teaser ดูตั้งใจ ไม่ดูขาด | 0 |
| **C. ไม่มีอะไรเลย** | ตอนถัดไปยังไม่เริ่ม | ไม่ใส่ส่วน preview — จบที่ end-card text (#34) ตามปกติ | 0 |

**ตอบข้อเสนอ owner "สร้างภาพก่อนแล้วเอามา gen video ตัวอย่าง":** วิเคราะห์แล้ว —
gen วิดีโอเพื่อ teaser อย่างเดียว = จ่ายค่าวิดีโอเต็ม (~150-600 เครดิต/คลิป) กับของที่ใช้ 2 วิ
ไม่คุ้ม แต่มีทางที่ฉลาดกว่า: ปุ่ม **"เตรียมตัวอย่างตอนถัดไป"** (explicit, ไม่อัตโนมัติ) จะ
generate **start frames ของตอนถัดไป** (ภาพ ~10-40 เครดิต/ใบ ×2-3) ซึ่งเป็น**ของที่ตอนนั้น
ต้องใช้อยู่แล้ว**ตอนผลิตจริง → เงินไม่สูญเปล่าแม้แต่บาทเดียว แล้ว preview ใช้ขั้น B ทันที
(ถ้าภายหลังมีคลิปจริง ระบบอัปเกรดเป็นขั้น A ให้เองในการ render ครั้งถัดไป)

### เลือกช็อตแบบ deterministic + กัน spoil

- ใช้ **hook zone: ช็อต 1-3** + tension กลางเรื่อง 1 ช็อต (4-6) — **ห้ามแตะช็อต 8-9**
  (โซนคลี่ปม/cliffhanger ของตอนถัดไป = spoil ตรง ๆ)
- ถ้ามี draft scorecard/premium metrics → เรียงตาม hook_strength; ไม่มีก็ตามลำดับช็อต
- เสียงคลิปตัวอย่าง: mute หรือ -18dB (กันหลุดบทพูด spoil) + ข้อความ "ตัวอย่างตอนต่อไป"
  (ASS chip มุมบน) + บรรทัด hook ของตอนถัดไป (จาก cliffhanger_line/logline ของ item)
- ตำแหน่ง: **ต่อท้าย end-card** — โครงคลิป: เนื้อเรื่อง → end-card tease → preview 5-8 วิ
- Engine: กลุ่ม concat ที่สอง (preview segment) + xfade เข้า; Ken Burns = zoompan per image
  (สุ่มทิศจาก index — ไม่ใช้ Math.random ใน args builder, ใช้ shotNumber-seeded)
- Batch season render: ใส่อัตโนมัติเมื่อขั้น A/B พร้อม, ข้ามเงียบ ๆ + รายงานใน response

---

## 2) BGM + Auto-Duck ใต้บทพูด + นโยบายลิขสิทธิ์

### สถาปัตยกรรมเสียง 3 ชั้น (บริบทรวม — เพิ่ม 2026-07-09 หลัง owner สั่ง #36)

1. **Native ambient+SFX ในเนื้อคลิป** (จากโมเดลวิดีโอ — #36 กำกับผ่าน prompt; สิทธิ์สะอาด
   โดยกำเนิด; ห้ามมีเสียงพูด/เพลงในชั้นนี้)
2. **เสียงพูด TTS** (W12) — ชั้นบนสุดเชิงความสำคัญ: duck ชั้น 1 ด้วย duckClipAudioDb
   (implement ในงานนี้) และ duck ชั้น 3
3. **BGM** (งานนี้) — โดน duck ใต้บทพูด; native clip audio (ชั้น 1) ลดฐานลงเมื่อ BGM เปิด
   เพื่อไม่ตีกัน (เช่น clip -6dB เมื่อมี BGM — จูนตอน implement)

### Ducking: ใช้ "volume envelope จากเวลาบทพูดที่รู้แน่นอน" ไม่ใช่ sidechain

เรามี `dialogueAudioTimeline` (เวลาเริ่ม-จบทุกบรรทัด absolute จาก #21-B) → สร้าง volume
expression ให้แทร็กเพลงแบบ deterministic:
- ฐานเพลง −10dB เทียบเสียงพูด → ช่วงบทพูด (±0.15 วิ padding) ลดลง −20dB → ramp
  ขึ้น-ลง linear 0.3 วิ
- ดีกว่า `sidechaincompress` เพราะ: ผล**เท่ากันทุกครั้ง** (testable เป็น args string),
  ไม่เดาจากระดับเสียง, ไม่มี pumping artifact — เหตุผลบันทึกใน code
- `duckClipAudioDb` ที่จองไว้ใน engine → implement จริงในงานนี้
- จบด้วย loudnorm รวม (มีแล้ว) — เป้า -14 LUFS (มาตรฐาน TikTok/Reels)

### ลิขสิทธิ์ (โจทย์ TikTok) — ป้องกันที่ "แหล่งเพลง + หลักฐาน" ไม่ใช่เทคโนโลยีตรวจจับ

ความจริงที่ต้องยอมรับ: เรา**ตรวจจับ**เพลงติดลิขสิทธิ์เองไม่ได้ (ไม่มี fingerprint DB) —
สิ่งที่ทำได้จริงและได้ผล:
1. **v1 รับเฉพาะเพลงที่ user อัปโหลดเอง** + บังคับติ๊กประกาศสิทธิ์ก่อนใช้ (3 ตัวเลือก:
   "เพลงของฉัน/จ้างทำ" · "ซื้อ license แล้ว" · "Royalty-free") — บันทึกหลักฐาน
   {fileHash, declaredLicense, userId, timestamp} ลง jsonb เป็น audit trail
2. **คำเตือนเฉพาะ TikTok ใน UI** (ภาษาคน): "TikTok ตรวจลิขสิทธิ์เพลงเข้มมาก —
   เพลง burn-in ที่ไม่มีสิทธิ์อาจโดนปิดเสียง/ลดการมองเห็น แนะนำ: ถ้าลง TikTok
   ให้พิจารณาใช้เพลงจากคลังเพลงของ TikTok ตอนโพสต์แทน แล้วปิด BGM ที่นี่"
   → toggle BGM ต่อ render จึงสำคัญ (เปิดเวอร์ชันมีเพลงไว้ลงแพลตฟอร์มอื่น)
3. **ไม่มีคลังเพลงกลางฝั่งเราใน v1** (การไป license คลังเพลงเชิงพาณิชย์ = โปรเจกต์กฎหมาย
   แยกต่างหาก — ตัดสินใจชัด ไม่แตะ)
4. **v2 เสนอเพิ่ม (ต้อง investigate ก่อน)**: ถ้า catalog มีโมเดล generate เพลง (audio gen
   มีท่ออยู่แล้ว) → "สร้างเพลงประกอบด้วย AI" = สิทธิ์สะอาดโดยกำเนิด จ่ายตามจริง —
   ทางออกลิขสิทธิ์ที่ยั่งยืนที่สุด
- Storage: `vertical_drama_series.bgmLibrary` jsonb (≤10 แทร็ก: url, ชื่อ, ประกาศสิทธิ์,
  hash) + per-render เลือกแทร็ก/ระดับเสียง/duck on-off; อัปโหลดผ่านท่อ asset เดิม

---

## 3) Color Grade ตามแนวเรื่อง (ผูก visual identity เดิม)

- ขยาย `visualIdentityJson` ของ genre presets (มีอยู่แล้วจาก R5) ด้วย `colorGrade`:
  `{ temperature (-100..100), tint, saturation (0.5..1.5), contrast (0.8..1.3),
  brightness (-0.1..0.1), vignette (0..0.3) }` — ค่าต่อ preset ตั้งจากบุคลิกแนวเรื่อง
  (mecha/cyber = เย็น+contrast สูง, โรแมนติก = อุ่น+soft ฯลฯ — seed ให้ 8 preset sci-fi
  ที่มี identity แล้ว + preset หลักอื่น)
- **Render-time grade** ใน final render graph: ffmpeg `eq` + `colortemperature` +
  `vignette` — **ลำดับชั้นสำคัญ**: grade เฉพาะ footage → แล้วค่อย overlay แบนเนอร์/ซับ/
  ลายน้ำ (แบรนด์สินค้า+ตัวหนังสือต้องสีตรง ไม่โดนย้อม)
- ทำตอน render ไม่ใช่ตอน generate = ฟรี, ย้อนกลับได้, ทั้งซีรีส์นิ่งแน่นอน
- Preset ผสม (preset mix): v1 ใช้ grade ของ preset หลักตัวเดียว (บันทึกชัด — การเฉลี่ย
  พารามิเตอร์สีให้ผลเพี้ยนคาดเดายาก), v2 ค่อยทำ blend + LUT .cube จริง
- UI: series-level toggle + intensity slider 0-100% (scale พารามิเตอร์เชิงเส้น) +
  per-render override; default = derive จาก preset หลักเมื่อเปิด

---

## ข้อเสนอเพิ่มที่พบระหว่างออกแบบ (owner เชิญให้เสนอ)

1. **Export ตัวอย่างตอนต่อไปเป็นคลิปเดี่ยว** (byproduct ของข้อ 1 — ได้ short โปรโมตฟรี
   ไว้โพสต์คั่นวัน) — effort S
2. **เป้า loudness ต่อแพลตฟอร์ม** (TikTok -14 / YouTube -14 / broadcast -23 LUFS) —
   loudnorm มีแล้ว แค่เปิดตัวเลือก — effort S
3. AI music gen (v2 ข้อ 2) — ปิดปัญหาลิขสิทธิ์ถาวร — รอ investigate catalog

## Flag + ลำดับ + ไฟล์

- Flag เดียว F131AC `verticalDramaSeriesStandoutSuite` (4 จุด + admin group, default false)
  — toggle รายฟีเจอร์อยู่ในตัวเลือก render/series
- **Serialize หลัง #34** (ชนไฟล์ engine/assembly/router/flags ชุดเดียวกัน):
  #32 จบ → commit+push+deploy → #34 → verify/deploy → **#35** → verify/deploy สุดท้าย
- ไฟล์หลัก: verticalDramaFinalRenderGraph.ts (+preview concat group, ducking envelope,
  grade chain), verticalDramaEpisodeVideoAssembly.ts, episodes router (resolve preview
  assets ladder + bgm + grade), series router (bgmLibrary/grade settings — หลัง #32),
  schema (bgmLibrary jsonb + visualIdentityJson extension — seed script), workspace UI,
  แยก schema ops ตาม DB protocol เดิม
