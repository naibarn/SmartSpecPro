# Video prompt production rules

เอกสารนี้เป็นกฎเฉพาะงานสำหรับ skill `idea-to-video-prompt` ใช้เมื่อจำเป็นต้องวางเวลา แบ่ง visual beats ตรวจ reference lock หรือออกแบบ prompt ที่มีสินค้าและคนอยู่ร่วมกัน

## 1. หลักคิดเรื่องเวลา

ให้ถือช่วงเวลาเป็น `[start, end)` และให้ `end - start = duration` ของ sub-shot ทุกครั้ง เวลาของ sub-shot ทั้งหมดในช็อตเดียวต้องรวมกันเท่ากับ `shot_duration_seconds` พอดี

การแบ่งเวลาที่ใช้เป็นจุดตั้งต้นได้:

| ความยาวต่อช็อต | 1 sub-shot | 2 sub-shots | 3 sub-shots |
| ---: | --- | --- | --- |
| 8 วินาที | 8 | 3+5 หรือ 5+3 | 2+3+3 หรือ 3+3+2 |
| 10 วินาที | 10 | 4+6 หรือ 6+4 | 3+4+3 หรือ 4+3+3 |
| 12 วินาที | 12 | 5+7 หรือ 6+6 | 4+4+4 |
| 15 วินาที | 15 | 7+8 หรือ 8+7 | 5+5+5 |
| 20 วินาที | 20 | 9+11 หรือ 10+10 | 6+7+7 หรือ 7+7+6 |
| 24 วินาที | 24 | 11+13 หรือ 12+12 | 8+8+8 |
| 30 วินาที | 30 | 14+16 หรือ 15+15 | 10+10+10 |

ตารางนี้เป็นแนวทาง ไม่ใช่ข้อบังคับ หากมีการกระทำละเอียดให้เพิ่มเวลาแก่ sub-shot ที่เป็นการสัมผัสจริง เช่น การกดปั๊ม การเทของเหลว หรือการเปิดน้ำ และลดเวลาของ establishing shot แทน

กฎสำคัญ:

- หนึ่ง sub-shot มีการกระทำหลักหนึ่งชุด เช่น “หยิบขวดขึ้นมาและจัดให้อยู่ในระดับอก” ถือเป็นชุดเดียวได้ แต่ “หยิบ → กดปั๊ม → ถูผม → เปิดฝักบัว” ไม่ควรอยู่ใน sub-shot เดียว
- อย่าตัดกลางจังหวะที่มือกำลังสัมผัสวัตถุ เว้นแต่ตั้งใจใช้ match cut และระบุจุด anchor ให้ชัด
- หากการกระทำต่อเนื่องเกินหนึ่งช็อต ให้จบช็อตแรกในท่าค้างที่สร้างซ้ำได้ และเริ่มช็อตถัดไปด้วยท่าเดียวกัน
- ความยาวรวมของงานประมาณ `shot_count × shot_duration_seconds`; ไม่รวมการตัดต่อหรือเฟดที่อาจเติมภายหลัง
- ถ้าเนื้อหาเต็มจนเกิน 5 ช็อต ให้คงลำดับ `ปัญหา → สินค้า → วิธีใช้ → ผลลัพธ์ → CTA` และยุบรายละเอียดรองลงใน VO, on-screen text หรือ montage ที่ควบคุมได้

## 2. Customer journey จากภาพสินค้า

เมื่อไอเดียสั้น ให้ใช้ภาพเป็นหลักฐานตั้งต้นแล้วสร้าง journey อย่างระมัดระวัง:

1. **Trigger / Context** — ผู้ใช้กำลังเจอสถานการณ์อะไร เช่น ผมเปียก ผมดูแห้ง ห้องรก ผิวขาดความสบาย หรือกำลังเตรียมออกจากบ้าน
2. **Pain point / Need** — ปัญหาหรือความต้องการที่เห็นได้จากสถานการณ์ ห้ามสรุปโรคหรือผลรักษาจากภาพอย่างเดียว
3. **Consideration** — สินค้าถูกเลือก หยิบขึ้นมา มองฉลาก หรือวางในตำแหน่งที่น่าเชื่อถือ
4. **Use** — แสดงวิธีใช้ที่สอดคล้องกับรูปทรงและกลไกของสินค้า โดยให้มือและวัตถุสัมผัสกันอย่างสมจริง
5. **Observable experience** — สีหน้า เนื้อสัมผัส ฟอง ความสะอาด ความเป็นระเบียบ หรือความสะดวกที่เห็นได้ ไม่ใส่ผลลัพธ์เกินหลักฐาน
6. **Confidence / Benefit** — ผู้ใช้รู้สึกดีขึ้นหรือสถานการณ์ดีขึ้น พร้อมภาพสินค้าแบบ hero ที่นิ่งและชัด
7. **CTA** — คำกระตุ้นการกระทำที่สั้นและสอดคล้องกับแพลตฟอร์ม

เลือกเฉพาะ stage ที่จำเป็นต่อไอเดียและเวลาที่มี ไม่จำเป็นต้องทำครบเจ็ด stage ในวิดีโอสั้นทุกงาน

ตัวอย่าง journey ตามประเภทสินค้า:

| ประเภท | ปัญหา/trigger | วิธีใช้ | หลักฐานเชิงภาพที่ปลอดภัย |
| --- | --- | --- | --- |
| แชมพู/ดูแลเส้นผม | ผมเปียกหรือรู้สึกไม่สดชื่น | กดปั๊ม ถูฟอง ลูบเส้นผม ล้างออก | ฟอง น้ำ ผมเปียก สีหน้าสดชื่น ไม่กล่าวอ้างรักษา |
| สกินแคร์ | ผิวแห้งหรืออยากดูแลผิว | หยด/ทาอย่างเบามือ | เนื้อผลิตภัณฑ์และสีหน้าผ่อนคลาย ไม่รับรองผลทางการแพทย์ |
| ของใช้ในบ้าน | พื้นที่มีคราบหรือไม่เป็นระเบียบ | ฉีด/เช็ด/จัดวาง | พื้นที่สะอาดขึ้นจากการตัดต่อที่สมเหตุสมผล |
| อาหาร/เครื่องดื่ม | หิว เหนื่อย หรืออยากพัก | เปิด เสิร์ฟ ชิม | ไอน้ำ เนื้อสัมผัส รอยยิ้ม และบรรยากาศ |
| เสื้อผ้า/เครื่องประดับ | ต้องการความมั่นใจก่อนออกไป | สวม ทดลอง หมุนตัว | silhouette, material, movement และสีหน้ามั่นใจ |

ถ้าไม่ทราบหมวดสินค้า ให้ใช้คำว่า “product shown in the reference image” และอธิบายเฉพาะการใช้งานที่ผู้ใช้บอกหรือเห็นจากภาพ อย่าสร้างฟังก์ชันเฉพาะขึ้นมาเอง

## 3. Dialogue mode และผู้พูด

ก่อนเขียน script ให้ตัดสินจาก `dialogue_mode`:

| โหมด | สิ่งที่ต้องสร้าง | สิ่งที่ห้ามเกิด |
| --- | --- | --- |
| `none` | ภาพการแสดง, ambience, sound effects และดนตรีถ้าจำเป็น | คำพูด, voice-over, narration, background voices, การขยับปากเหมือนกำลังพูด |
| `character_dialogue` | บทพูดจากตัวละครที่มีภาพอ้างอิง พร้อม speaker id และ timing ราย turn | ผู้พูดนิรนาม, บทพูดแถม, การพูดซ้อน, การสลับตัวตน, การ paraphrase, subtitle อัตโนมัติ หรือการเติมคำระหว่างทำ prompt |

กฎเมื่อมี `character_dialogue`:

- จำนวนผู้พูดที่ resolve แล้วต้องเป็น 1, 2 หรือ 3 คนเท่านั้น ถ้ามีภาพคนมากกว่าสามคน ให้เลือกผู้พูดตามบทบาทและให้คนที่เหลือเป็นตัวละครเงียบ
- ทุก `speaker_reference_id` ต้องอ้างถึงภาพที่จำแนกเป็นคนจริง ห้ามให้ภาพสินค้า ฉาก หรือพร็อพเป็นผู้พูด
- สร้างบทพูดให้สัมพันธ์กับ action และ customer journey ของช็อตนั้น ไม่ใส่บทพูดเพื่อยัดข้อมูลจนตัวละครไม่มีเวลาทำสิ่งที่เห็นในภาพ
- ระบุทีละ turn เป็น `SPEAKER: person_01` และ `EXACT SPOKEN DIALOGUE: “...”` พร้อมช่วงเวลาเริ่ม–จบ ห้ามใช้คำว่า “พูดต่อ”, “พูดประมาณว่า” หรือคำสั่งที่เปิดให้โมเดลแต่งบทเพิ่ม
- เมื่อใช้ภาษาไทย ให้ข้อความใน `exact_dialogue` เป็นต้นฉบับเดียวที่ต้องคัดลอกซ้ำใน script, speaking turns และ prompt ห้ามแปลหรือเรียบเรียงใหม่ในขั้น Prompt Engineering
- ผู้พูดต้องเห็นใบหน้า/ปากในช่วงพูดพอให้ทำ lip-sync; ถ้าจำเป็นต้องถ่ายด้านหลัง ให้ย้ายบทพูดไปช่วงที่เห็นปาก ไม่สร้างเสียง off-camera แทน
- ห้ามผู้พูดสองคนพูดพร้อมกัน ให้เว้นจังหวะสั้น ๆ ระหว่าง turn และให้คนที่ไม่ได้พูดมอง ฟัง หรือทำ action โดยปิดปาก
- อย่าสร้าง subtitle จากบทพูดเอง เว้นแต่ผู้ใช้สั่งโดยตรง; ข้อความบนจอที่เป็นชื่อสินค้า/CTA ต้องแยกจาก dialogue และไม่ถูกอ่านออกเสียง
- ระบุเสียงที่อนุญาตแยกจากคำพูด เช่น เสียงปั๊ม เสียงน้ำ เสียงดนตรี แต่ต้องสั่งชัดว่าไม่มีคำพูดหรือเสียงพื้นหลังอื่น

รูปแบบ turn ที่ควรเก็บใน output:

```text
TURN 1 | 0.0–3.2s | SPEAKER: person_01 | EXACT SPOKEN DIALOGUE: “...” | natural, warm delivery
TURN 2 | 3.5–6.8s | SPEAKER: person_02 | EXACT SPOKEN DIALOGUE: “...” | listens after person_01 stops
SILENT CHARACTERS: person_03; mouths closed, no background speech
```

เมื่อมีผู้พูดหลายคน ให้แยก turn ตามช็อตและพยายามไม่เกินสาม turn ต่อช็อต ถ้าบทพูดยาวเกินเวลาหรือมีการโต้ตอบมาก ให้แบ่งเป็นช็อตเพิ่มภายในเพดาน 5 ช็อต หรือย่อสาระในขั้น Script ก่อนล็อกข้อความ ไม่ควรเร่งเสียงหรือซ้อนบทพูดเพื่อให้ยัดลงเวลา

รูปแบบการเลือกผู้พูด:

- **พูดคนเดียว** — ใช้ `person_01` เป็นผู้พูดหลัก; คนอื่นในเฟรมเป็นผู้ฟังและปิดปาก
- **พูดสองคน** — สลับ `person_01` และ `person_02` เป็นคนละ turn โดยมีจังหวะหยุดระหว่างประโยคและคงตำแหน่ง/eye-line ของทั้งคู่
- **พูดสามคน** — ใช้ `person_01`, `person_02`, `person_03` ตามลำดับที่บทต้องการ; อย่าให้ทั้งสามพูดพร้อมกัน และให้คนที่รอพูดปิดปาก

ถ้ามีภาพคน 4–5 คนแต่เลือกพูดเพียง 1–3 คน ให้ระบุ `SILENT CHARACTERS` ด้วย reference id ของคนที่เหลือในทุกช็อตที่มองเห็น ไม่ใช้คำว่า “คนอื่น ๆ” แบบกำกวม

## 4. Reference lock

สร้างบัญชี continuity แบบสั้นก่อนเขียน prompt:

```text
PERSON person_01: ผู้หญิงจากภาพอ้างอิง, wardrobe locked, ตำแหน่งเริ่มต้นด้านขวาของห้องน้ำ
PRODUCT product_01: ขวดแชมพูจากภาพอ้างอิง, pump top, label/shape/color locked, ไม่หมุนเร็ว
LOCATION location_01: ห้องน้ำจากภาพอ้างอิง, กระจกและฝักบัวคงตำแหน่งเดิม
```

ใน prompt แต่ละช็อตต้องบอกเฉพาะ reference ที่ใช้ในช็อตนั้นและต้องมีคำสั่งต่อไปนี้ตามความเหมาะสม:

- คน: preserve facial identity, face proportions, hair, apparent age, skin tone, body proportions, wardrobe และลักษณะเด่นของ reference เดิม
- หลายคน: กำหนด role และตำแหน่งที่มองเห็นได้ เช่น “person_01 on frame left, person_02 on frame right”; รักษาเสื้อผ้าและทิศทางการมองให้ต่อเนื่อง
- สินค้า: preserve exact package silhouette, colors, cap/pump, label layout, logo placement, material and proportions; product stays stable and readable
- ฉลากอ่านไม่ชัด: สั่งให้คงดีไซน์ที่อ่านไม่ชัดตามภาพเดิมและห้ามประดิษฐ์ข้อความใหม่
- ฉาก: คงทิศทางแสง เงา เส้นขอบฟ้า โต๊ะ ประตู กระจก และจุดอ้างอิงเชิงพื้นที่
- ถ้าต้องการเปลี่ยนเสื้อผ้า ฉาก หรือสินค้า ต้องประกาศการเปลี่ยนเป็น continuity event ไม่ใช่ปล่อยให้โมเดลเปลี่ยนเอง

ห้ามใช้ประโยค “same person” หรือ “same product” เพียงอย่างเดียว ให้ระบุว่า same as `person_01`/`product_01` พร้อมรายละเอียดที่ต้องคงเดิม

## 5. Product-safe motion

แบ่งการเคลื่อนไหวสินค้าเป็นสามระดับ:

1. **Static hero** — วางสินค้าให้นิ่ง กล้องเป็นฝ่ายเคลื่อนหรือ rack focus เข้าหาสินค้า เหมาะกับฉลากและ CTA
2. **Controlled handling** — คนหยิบ ถือ กดปั๊ม เปิดฝา หรือวางลง โดยรักษา orientation และลดการบังฉลาก
3. **Controlled use** — สินค้าทำหน้าที่ตามจริง เช่น ของเหลวไหลหรือฟองออกจากหัวปั๊ม แต่ต้องคงรูปทรงขวดและให้เนื้อสารเคลื่อนอย่างฟิสิกส์สมเหตุสมผล

หลีกเลี่ยง:

- product spinning, morphing, stretching, melting, duplicated bottles, floating cap, unreadable replacement label
- การซูมเร็วหรือ motion blur ทับฉลากในช่วงที่ต้องการให้คนอ่านสินค้า
- การให้สินค้าเดินทางข้ามมือโดยไม่แสดงจุดส่งต่อ

ถ้าต้องการภาพสินค้าเด่น ให้ใช้การจัดแสง, shallow depth of field, clean background, slow push-in หรือ focus pull แทนการหมุนบรรจุภัณฑ์

## 6. Camera and lighting continuity

ทุกช็อตควรมีแกนกล้องที่ต่อได้:

- กำหนด screen direction ของคนและมือ เช่น เข้าจาก frame right และเคลื่อนไปทาง frame left
- ใช้ eye-line, horizon, ระดับโต๊ะ และทิศทางเงาเป็น anchor เมื่อเปลี่ยน shot size
- เปลี่ยนมุมกล้องได้เมื่อมีเหตุผล เช่น wide เพื่อเห็นบริบท → medium เพื่อเห็นการใช้ → close-up เพื่อยืนยันประโยชน์/สินค้า
- การเปลี่ยนแสงควรเป็น motivated lighting เช่น จากไฟห้องน้ำเป็นแสงธรรมชาติหลังเปิดม่าน ไม่ใช่เปลี่ยนสีโดยไม่มีเหตุผล
- เลนส์และ depth of field ต้องไม่ทำให้มือ สินค้า และใบหน้าที่จำเป็นหลุดโฟกัสพร้อมกัน

## 7. Prompt composition

ใช้รูปแบบต่อไปนี้เป็นโครงร่างภายใน `prompt` แต่ปรับภาษาให้ตรงกับ input:

```text
SHOT [number] — [exact duration] seconds — [aspect ratio].
Goal: [purpose].
Reference lock: use [reference ids] ...
Scene and visual design: [environment, composition, shot size, angle, lens/look, lighting].
Timeline: [0–x s] ...; [x–y s] ...; [y–duration s] ...
Camera and blocking: [movement, positions, screen direction, contact points].
Audio and text: [character dialogue if enabled, sound, on-screen text].
If dialogue is enabled: DIALOGUE MODE: CHARACTER DIALOGUE. SPEAKER and EXACT SPOKEN DIALOGUE must match the locked speaking turns exactly; one speaker at a time, visible mouth, all other visible characters silent with mouths closed, no narration, subtitles or extra voices.
If dialogue is disabled: DIALOGUE MODE: NONE. No spoken words, voice-over, narration or background voices.
Continuity: start with [...]; end with [...]; anchor [...].
Product preservation: [...].
Generate natural physically plausible motion, stable identity, temporal consistency, correct hands and fingers, no extra people, no duplicate subjects, no invented label text, no product morphing.
```

ส่วน “Product preservation” ต้องอยู่ใน prompt เดียวกันเสมอเมื่อมีสินค้า แม้สินค้าอยู่เพียงช่วงสั้น ๆ

## 8. Shampoo example

สำหรับไอเดีย “ผู้หญิงหยิบขวดแชมพูขึ้นมา กดหัวปั๊มให้เนื้อแชมพู/ฟองลงเต็มฝ่ามือ ถูบนศีรษะจนเกิดฟอง แล้วเปิดฝักบัวล้างออก” และเลือก 10 วินาทีต่อช็อต ให้แตกเรื่องเป็นสามช็อตเพื่อไม่เร่งการเคลื่อนไหว:

| ช็อต | sub-shot timeline | จุดจบที่ใช้เป็น anchor |
| --- | --- | --- |
| 1. เลือกและจ่ายผลิตภัณฑ์ | 0–3 หยิบขวด, 3–6 จัดขวดให้ฉลากหันกล้อง, 6–10 กดหัวปั๊มให้แชมพูลงเต็มฝ่ามือ | ขวดอยู่มือขวาระดับอก ฝ่ามือซ้ายมีแชมพู และยังไม่เริ่มถู |
| 2. วางขวดและสร้างฟอง | 0–3 วางขวดกลับบนชั้นแล้วนำมือเข้าหากัน, 3–6 ถูฝ่ามือ, 6–10 ลูบและนวดลงบนเส้นผมให้ฟองเริ่มขยาย | ขวดอยู่บนชั้นเดิม มืออยู่บนศีรษะ ฟองคลุมศีรษะบางส่วน |
| 3. ล้างและปิดเรื่อง | 0–3 เอื้อมเปิดวาล์วฝักบัวให้น้ำไหลจาก showerhead, 3–8 น้ำชะฟองออก, 8–10 ผมเปียกและแชมพูเป็น hero ที่นิ่ง | ผมเปียก ผู้หญิงหันไปทางเดิม น้ำไหลจากฝักบัว สินค้าอยู่ตำแหน่งเดิมและฉลากไม่เปลี่ยน |

ถ้าเลือก 15–30 วินาที อาจรวมสองช่วงไว้ในช็อตเดียวได้ แต่ยังไม่เกิน 3 sub-shots และต้องลดการกระทำของสินค้าให้นิ่งที่สุดในช่วงที่กล้องเน้นฉลาก

สมมติฐานที่ต้องระบุเมื่อภาพไม่ได้บอกสถานที่หรือสภาพผม: ห้องน้ำสะอาดแบบทั่วไป, ผู้หญิงผมเปียกหรือพร้อมเริ่มสระ, ฝักบัวปิดอยู่ในเฟรมเริ่มต้น, ขวดวางบนชั้น และไม่มีบุคคลอื่นในฉาก

ตัวอย่างรูปแบบ prompt ของช็อตที่ 1 (เป็นตัวอย่างโครงสร้าง ไม่ใช่คำตอบตายตัว):

```text
SHOT 1 — 10 seconds — vertical 9:16. Goal: introduce the shampoo and show one clean, physically plausible pump action.
Reference lock: use person_01 for the same woman, preserving her facial identity, hairstyle, skin tone, apparent age and locked wardrobe. Use product_01 for the exact shampoo bottle; preserve its silhouette, pump top, colors, label layout and proportions. No extra people. Assume a clean generic bathroom, wet hair, shower initially off and the bottle initially on the shelf when those details are not visible in the references.
Scene: a bright, clean bathroom matching the reference environment. Medium shot at eye level, 50mm natural perspective, soft diffused bathroom light from frame left, stable exposure, shallow but sufficient depth of field so the face and bottle remain clear.
Timeline: 0–3s the woman reaches with her right hand and lifts the bottle from the shelf; 3–6s she holds it upright at chest height with the label facing camera and gently presses the pump with her left hand; 6–10s enough shampoo dispenses to cover the open left palm while the bottle remains steady.
Camera and blocking: slow controlled push-in only during the final pump action; the woman stays on frame right, the bottle stays near center, the right hand does not teleport, and contact between finger, pump and palm is visible.
Audio and text: soft bathroom ambience and a subtle pump sound; no dialogue; optional short Thai on-screen text: “เริ่มต้นการดูแลเส้นผม”.
Continuity: start with the bottle on the shelf and the woman's right hand relaxed; end with the bottle still upright in her right hand at chest height and creamy product visible in her left palm, ready for Shot 2.
Product preservation: keep the bottle mostly stable and front-facing, do not spin or morph it, do not replace or invent label text, do not duplicate the bottle, and keep all packaging edges consistent. Generate natural human motion, correct hands and fingers, physically plausible product flow, stable identity and temporal consistency.
```

Shot 2 ต้องเริ่มด้วย “ขวดอยู่มือขวาระดับอก ฝ่ามือซ้ายมีผลิตภัณฑ์” และ Shot 3 ต้องเริ่มด้วย “ฟองยังอยู่บนศีรษะบางส่วน ขวดอยู่บนชั้นเดิม และฝักบัวยังปิดอยู่” เพื่อให้แต่ละ prompt สร้างแยกกันได้โดยไม่สูญเสีย continuity

ถ้าเปิด `character_dialogue` สำหรับตัวอย่างนี้ ให้ผู้หญิงจาก `person_01` เป็นผู้พูดคนเดียวและใส่ประโยคสั้นที่สัมพันธ์กับช่วงนั้น เช่น ใน Shot 1 ให้พูดระหว่างจัดขวดให้ฉลากหันกล้อง แต่ต้องนับเวลาให้พอดีและคัดลอกประโยคเดียวกันทุกจุด ห้ามเติม voice-over หรือให้คนอื่นพูดแทรก
