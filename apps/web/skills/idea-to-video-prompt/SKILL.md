---
name: idea-to-video-prompt
description: Transform a user's idea and optional person/product reference images into continuity-controlled AI video prompts with customer-journey expansion, optional character dialogue/lip-sync, up to 5 shots, and up to 3 sub-shots per shot. Use when the user needs production-ready prompts for an AI video generator from text and visual references.
category: video_prompt_generation
version: 1.0.0
icon: sparkles
tags:
  - shared-skill
  - imported
auto_trigger: false
trigger_patterns: []
enabled_by_default: false
credit_multiplier: 1
priority: 50
execution_mode: llm-only
strict_provider_pin: false
config:
  media_studio:
    auto_learning:
      enabled: false
      prompt_qa_after_auto_prompt: true
      image_qa_after_generation: true
      require_admin_approval: true
      min_prompt_score_to_pass: 85
      min_image_fidelity_score_to_pass: 80
      max_auto_patch_risk: medium
  orchestration:
    mode: local
    endpoint: null
    skillTargets: []
    parallel: false
    fallback: local
---
# Idea to Video Prompt

สร้าง prompt วิดีโอที่พร้อมนำไปใช้กับ AI video generator จากข้อความไอเดีย ภาพอ้างอิง และความยาวต่อช็อตที่ผู้ใช้เลือก โดยให้ผลลัพธ์มีความต่อเนื่องของคน สินค้า ฉาก แสง กล้อง และการกระทำ

## Contract and output priority

- อ่านและทำตาม `schemas/input.schema.json`, `schemas/ui.schema.json` และ `schemas/output.schema.json` เป็นสัญญาหลักของ skill
- รับไอเดียแบบข้อความและภาพอ้างอิงได้หลายภาพ จำนวนคนไม่ตายตัว ภาพอาจเป็นคน สินค้า ฉาก พร็อพ หรือสไตล์
- ความยาวต่อช็อตต้องเป็นหนึ่งใน `8, 10, 12, 15, 20, 24, 30` วินาที และทุกช็อตต้องใช้ความยาวเดียวกับที่ผู้ใช้เลือก (12 วินาทีใช้ได้กับ special tie-in adapter)
- ผลลัพธ์ต้องมี 1–5 ช็อตเท่านั้น แต่ละช็อตเป็น multi-shot ได้ไม่เกิน 3 sub-shot และเวลา sub-shot รวมกันต้องเท่ากับเวลาของช็อตนั้นพอดี
- มี `dialogue_mode` ให้เลือก `none` หรือ `character_dialogue`; ถ้าเป็น `none` ห้ามมีบทพูด เสียงบรรยาย เสียงพูดพื้นหลัง หรือการพูดของตัวละคร แต่ยังมี ambience, sound effect และดนตรีได้
- ถ้าเป็น `character_dialogue` ให้สร้างบทพูดจากตัวละครในภาพอ้างอิงเท่านั้น ใช้ผู้พูดจริง 1–3 คนต่อเรื่องตาม `speaker_count`/`speaker_reference_ids` และแยก turn ให้ชัดเจนในแต่ละช็อต
- ส่ง prompt หลักของแต่ละช็อตเป็นข้อความก้อนเดียวที่นำไปใช้ได้ทันที ไม่แยกเป็น positive prompt และ negative prompt; ให้ใส่ข้อจำกัดสำคัญไว้ใน prompt เดียว
- แสดง prompt รายช็อตให้ผู้ใช้เห็นชัดเจน ส่วนการวิเคราะห์ workflow ให้สั้นพอที่จะตรวจสอบที่มาและนำไปแก้ไขต่อได้

## Input handling

1. อ่าน `idea`, ความยาวต่อช็อต และภาพอ้างอิงทั้งหมดก่อนเริ่มเขียน prompt
2. จำแนกภาพอ้างอิงเป็นคน สินค้า ฉาก พร็อพ สไตล์ หรือไม่ทราบประเภท หากผู้ใช้กำหนดป้ายกำกับให้ใช้ป้ายกำกับนั้นเป็นหลัก
3. นับและติดตามตัวละครจากภาพจริงโดยใช้ reference id เดิมตลอดทุกช็อต ห้ามเพิ่มคนพื้นหลัง คนสะท้อนในกระจก คนซ้ำ หรือบุคคลนิรนามโดยไม่มีเหตุผลจากไอเดีย
4. ระบุสินค้าแต่ละชิ้นจากภาพ และยึดรูปทรง สี ฝา/หัวปั๊ม ตำแหน่งฉลาก โลโก้ และสัดส่วนตามภาพอ้างอิง ห้ามสร้างข้อความบนฉลากขึ้นใหม่ถ้าอ่านไม่ชัด
5. ถ้าภาพหรือข้อความมีข้อมูลไม่พอ ให้ใช้สมมติฐานที่ปลอดภัยและระบุไว้ใน `assumptions`; อย่าแต่งชื่อรุ่น ส่วนผสม ราคา ผลการรักษา หรือคำรับรองที่ไม่มีหลักฐาน
6. รักษาคำกริยาและอุปกรณ์ตามไอเดีย เช่น หากผู้ใช้ระบุ “ฝักบัว” ให้ใช้ shower valve/showerhead ตามบริบท ไม่เปลี่ยนเป็นก๊อกอ่างล้างหน้าโดยไม่จำเป็น
7. ถ้าเปิดบทพูด ให้เลือกเฉพาะภาพที่จำแนกเป็น `person` เป็นผู้พูด และให้ทุก `speaker_reference_id` ตรงกับภาพคนนั้นจริง ห้ามให้สินค้า ฉาก หรือคนที่ไม่มี reference เป็นผู้พูด
8. ถ้า `speaker_count=auto` ให้เลือกผู้พูดจากคนในภาพไม่เกิน 3 คน; ถ้าผู้ใช้ขอจำนวนมากกว่าจำนวนคนจริง ห้ามสร้างคนใหม่ ให้ลดเหลือผู้พูดที่มีอยู่พร้อมบันทึกสมมติฐาน หรือใช้ `needs_clarification` เมื่อไม่สามารถเล่าเรื่องได้

## Required workflow

ทำ workflow ต่อไปนี้ภายในงานเดียวกันตามลำดับ และใช้แต่ละขั้นเป็น gate ตรวจสอบก่อนเข้าสู่ขั้นถัดไป:

`Idea → Research → Concept → Script → Breakdown → Scene & Shot → Storyboard Draft → Visual Design → Reference Lock → Final Storyboard → Storyboard Approval → Prompt Engineering → AI Image Keyframe → AI Video → Post Production → Quality Control → Publish → Analytics → Optimize`

รายละเอียดการทำงาน:

### 1. Idea และ Research

- สรุปไอเดียเดิมเป็นแกนกลาง: ใครทำอะไรกับอะไร ที่ไหน เพื่อแก้ปัญหาอะไร และผู้ชมควรรู้สึกหรือทำอะไรหลังดู
- ประเมินว่าไอเดียสั้นเกินไปหรือไม่ หากสั้น ให้ขยายจาก customer journey ของสินค้าที่เห็นในภาพ: trigger/ปัญหา → ความต้องการ → การพิจารณา → วิธีใช้ → ผลลัพธ์ที่สังเกตได้ → ความรู้สึก/ความมั่นใจ → CTA
- งานวิจัยควรตอบว่าสินค้าใช้เพื่อประโยชน์ใด แก้ pain point ใด ใช้ในสถานการณ์ใด และเหตุใดผู้ชมจึงควรสนใจ โดยแยก `สิ่งที่เห็นจากภาพ`, `สิ่งที่ผู้ใช้บอก`, และ `สมมติฐาน`
- ถ้าต้องการข้อมูลเฉพาะยี่ห้อ รุ่น หรือ claim ที่อาจเปลี่ยนแปลง ให้ค้นจากแหล่งที่น่าเชื่อถือเมื่อมีเครื่องมือค้นเว็บและระบุระดับความมั่นใจ; หากค้นไม่ได้ให้ใช้คำบรรยายเชิงประสบการณ์ที่ไม่กล่าวอ้างเกินจริง เช่น “ช่วยให้รู้สึกสะอาดและสดชื่น” แทนผลลัพธ์ทางการแพทย์
- อย่าเปลี่ยนงานให้เป็นบทความวิจัยยาว งานวิจัยมีหน้าที่ทำให้การกระทำและประโยชน์ในวิดีโอสมเหตุสมผล

### 2. Concept, Script และ Breakdown

- สร้าง concept เดียวที่มี hook, target audience, core promise, tone และ CTA ที่สอดคล้องกับไอเดีย
- ถ้า `dialogue_mode=none` ให้ script ระบุชัดว่าไม่มีบทพูด ไม่มี voice-over และไม่มีเสียงพูดอื่น
- ถ้า `dialogue_mode=character_dialogue` ให้เขียนบทพูดที่สัมพันธ์กับ customer journey และภาพจริง ไม่เติมข้อความโฆษณาเกินสิ่งที่เรื่องรองรับ กำหนดผู้พูดและเวลาพูดในแต่ละ turn ก่อนนำไปแบ่งช็อต
- เมื่อ `dialogue_language=th` ให้เก็บบทพูดภาษาไทยตามตัวอักษรที่สร้างไว้แบบตรงตัวในทุกจุด ห้าม paraphrase, reorder, shorten, เติมคำ หรือสร้างประโยคใหม่ตอนเขียน prompt
- หนึ่งช่วงเวลาพูดต้องมีผู้พูดคนเดียว ห้ามพูดทับกัน ผู้พูดต้องเห็นใบหน้า/ปากพอให้ทำ lip-sync ได้ และตัวละครที่มองเห็นแต่ไม่ได้พูดต้องปิดปากและไม่มีเสียงพูด
- ห้ามสร้าง subtitle อัตโนมัติจากบทพูด เว้นแต่ผู้ใช้ระบุให้สร้างโดยตรง; on-screen text ที่เป็นข้อความสินค้า/CTA ต้องไม่ถูกทำให้ดูเหมือนคำพูดของตัวละคร
- เขียน script/voice-over/dialogue เฉพาะที่จำเป็นต่อการเล่าเรื่อง ความยาวต้องพอดีกับภาพและเวลาที่เลือก หลีกเลี่ยงบทพูดยาวจนแย่งเวลาการกระทำ
- แตกเนื้อหาเป็น visual beats ก่อนจัดช็อต โดยหนึ่ง sub-shot ควรมีการกระทำหลักเพียงหนึ่งชุดและมีจุดเริ่ม/จุดจบที่ชัดเจน
- ถ้าเนื้อหาเกินเวลาต่อช็อต ให้แบ่งตรงจุดเปลี่ยนของการกระทำหรืออารมณ์ ไม่ตัดกลางการเคลื่อนไหวที่ทำให้ช็อตถัดไปเริ่มต่อไม่ได้
- ใช้จำนวนช็อตน้อยที่สุดที่ยังเล่าเรื่องครบ หากเกิน 5 ช็อต ให้บีบอัดรายละเอียดรอง ใช้การเปลี่ยนภาพ/ข้อความบนจอ/เสียงที่ไม่ใช่เสียงพูดอย่างมีเหตุผล และเก็บแกนปัญหา–การใช้–ผลลัพธ์ไว้ก่อน

### 3. Scene & Shot, Storyboard Draft และ Visual Design

สำหรับทุกช็อตให้กำหนดอย่างน้อย: shot purpose, subject/ตำแหน่ง, shot size, camera angle, lens/look, camera movement, composition, blocking, environment, lighting, audio, dialogue/VO, transition และเวลาเริ่ม–จบของ sub-shot

- ใช้การเคลื่อนไหวของคนและฉากเป็นตัวขับหลัก เช่น หยิบ เดิน หันหน้า ลูบผม เปิดก๊อก เปลี่ยนน้ำหนักตัว หรือเลื่อนกล้องอย่างนุ่มนวล
- เมื่อมีสินค้า ให้สินค้าเป็น hero object ในเฟรมสำคัญ แต่ลดการหมุน พลิก ยืด บีบ หรือเคลื่อนที่เร็วของบรรจุภัณฑ์ เพราะทำให้ฉลาก โลโก้ และรูปทรงเพี้ยน
- ให้สินค้าเคลื่อนไหวเท่าที่จำเป็นต่อ customer journey เช่น มือหยิบขวด กดหัวปั๊ม เทหรือวางลง โดยตรึงรูปทรง ฉลาก สี ฝา และสัดส่วนให้คงเดิม
- ออกแบบแสงและมุมกล้องให้การเปิดเผยข้อมูลเกิดตามลำดับ: establishing/context → product/use → human experience → result/hero/CTA; อย่าเปลี่ยนแสงหรือทิศทางเงาโดยไม่มีเหตุผล
- ระบุเส้นทางการเคลื่อนไหวและทิศทางสายตา เช่น “มือขวาเข้าจากขวาของเฟรม ขวดอยู่กลางโต๊ะ ผู้หญิงหันไปทางซ้าย” เพื่อให้ช็อตต่อไปเริ่มได้ตรงจุด

### 4. Reference Lock และ Final Storyboard

- ในทุก prompt ให้ระบุ reference id ที่ใช้จริง แยก `person_reference_ids` และ `product_reference_ids`
- ล็อกใบหน้า รูปหน้า ทรงผม สีผิว ช่วงอายุโดยประมาณ รูปร่าง เสื้อผ้า และลักษณะเฉพาะของคนตามภาพอ้างอิง เว้นแต่ผู้ใช้ระบุให้เปลี่ยน
- ถ้ามีหลายคน ให้กำหนดบทบาท ตำแหน่งซ้าย/ขวา/หน้า/หลัง และไม่สลับตัวตนระหว่างช็อต
- ล็อกสินค้าตามภาพอ้างอิงเป็นพิเศษ: packshot, label, โลโก้, cap/pump, สี และ orientation; ถ้าอ่านฉลากไม่ชัดให้สั่งว่า “preserve the exact unreadable label design; do not invent text”
- วาง start frame, end frame และ mid-frame anchor เมื่อมีการเปลี่ยนการกระทำหรือจำเป็นต้องพยุง continuity; anchor อาจเป็นมือที่ถือสินค้า ตำแหน่งศีรษะ ระดับน้ำ หรือประตู/โต๊ะเดิม
- สร้าง final storyboard แล้วทำ approval gate ภายในก่อนเขียน prompt หากไม่ผ่านให้แก้หนึ่งรอบก่อนส่งออก

### 5. Prompt Engineering, AI Image Keyframe และ AI Video

แต่ละ prompt ต้องเป็น self-contained prompt และมีโครงสร้างนี้ภายในข้อความเดียว (จะใช้ภาษาไทย อังกฤษ หรือสองภาษา ตาม `prompt_language`):

1. shot number, exact duration, aspect ratio และเป้าหมายของช็อต
2. reference lock ที่อ้างถึงภาพแนบด้วย id/label
3. subject, environment, composition, shot size, camera angle, lens/look และ lighting
4. sub-shot timeline ที่เวลารวมพอดีกับช็อต และการกระทำ/กล้อง/การเปลี่ยนผ่านของแต่ละช่วง
5. dialogue, sound และ on-screen text ถ้ามี; โหมดนี้ไม่สร้าง voice-over แยกจากตัวละคร
6. continuity in/out และ keyframe anchors
7. product preservation และข้อห้ามที่สำคัญในประโยคเดียวกัน เช่น ห้ามเพิ่มคน ห้ามเปลี่ยนฉลาก ห้ามสร้างสินค้าใหม่ ห้ามให้มือ/นิ้วผิดรูป
8. ถ้ามีบทพูด ให้ใส่ `DIALOGUE MODE: CHARACTER DIALOGUE`, `SPEAKER: [reference id]`, `EXACT SPOKEN DIALOGUE: [ข้อความตรงตัว]`, เวลาเริ่ม–จบ, การออกเสียง/อารมณ์, ใบหน้าที่ต้องเห็น และระบุผู้ที่ต้องเงียบ; ห้ามมี narration, subtitles, extra dialogue, overlapping voices หรือ background speech
9. ถ้าไม่มีบทพูด ให้ใส่ `DIALOGUE MODE: NONE — no spoken words, no voice-over, no narration, no background voices`; อนุญาตเฉพาะ ambience, sound effect และดนตรีที่ระบุไว้
10. คุณภาพภาพและการเคลื่อนไหวที่ต้องการ: natural human motion, physically plausible contact, stable identity, temporal consistency, clean readable product hero frame และ lip-sync ที่ตรงจังหวะถ้ามีบทพูด

อย่าเขียน prompt แบบกำกวมว่า “ทำต่อจากช็อตก่อน” เพียงอย่างเดียว ให้ระบุสถานะเริ่มต้นที่ช็อตนั้นเห็นจริงด้วย เพราะแต่ละช็อตอาจถูกสร้างแยกกัน

### 6. Post Production, Quality Control, Publish, Analytics และ Optimize

- ระบุข้อเสนอแนะ post-production ที่จำเป็น เช่น ตัดต่อให้ action match, ปรับเสียง/ดนตรี, subtitle, logo/CTA และ export ที่ตรงกับแพลตฟอร์ม
- ตรวจ QC อย่างน้อย: จำนวนช็อต, ความยาว, จำนวน sub-shot, คนครบและไม่เพิ่มคน, identity/wardrobe, product label/shape, hand-object contact, action order, lighting, camera continuity, dialogue mode, speaker identity, exact dialogue text, turn timing, no-overlap, silent-character mouths และ CTA
- ตรวจ `timeline_validation` ของทุกช็อตให้ `starts_at_zero`, `is_contiguous`, `ends_at_shot_duration` และ `total_matches_duration` เป็นจริง และบันทึก `qc.checks` เป็นรายการที่มีชื่อ สถานะ และรายละเอียด
- ถ้าเป็น `character_dialogue` ให้ตรวจ `dialogue_validation` ของทุกช็อต: speaker id แก้ได้จริง, บทพูดตรงตัว, ทุก turn ไม่ทับกัน, ผู้พูดเห็นปาก, คนอื่นเงียบ/ปิดปาก, ไม่มี narration หรือเสียงพูดแถม และเวลาพูดพอดีกับความยาวประโยค
- ผลลัพธ์ต้องมี `quality_control.passed` เป็น `true` เฉพาะเมื่อผ่านทุก invariant; ถ้ายังมีข้อจำกัดจากภาพหรือ claim ให้ใช้ `assumptions`/`revision_notes` แทนการซ่อนปัญหา
- Publish/Analytics/Optimize ให้เป็นคำแนะนำสั้น ๆ ที่เชื่อมกับเป้าหมายของวิดีโอ เช่น hook retention, product visibility, completion rate, click/CTA และสิ่งที่จะทดสอบในรอบถัดไป ไม่ต้องสร้างข้อมูลผลลัพธ์ปลอม

## Continuity loop

ก่อนส่งผลลัพธ์ ให้ตรวจและแก้ prompt อย่างน้อยหนึ่งรอบตามลูปนี้:

`timeline → action order → subject identity → hand/object contact → product integrity → camera/light continuity → speaker identity → exact dialogue text → lip-sync timing/no-overlap → shot limits → final QC`

ตรวจเป็นคู่ด้วยว่า `continuity_out` ของช็อตก่อนหน้าตรงกับ `continuity_in` ของช็อตถัดไปทุกจุด โดยเฉพาะมือที่ถือสินค้า ตำแหน่งวางสินค้า ระดับฟอง สภาพผม ทิศทางตัวละคร และสถานะอุปกรณ์ ถ้าช็อตก่อนจบด้วยสินค้าที่อยู่ในมือ ช็อตถัดไปต้องเริ่มด้วยสินค้านั้นในมือเดิม หรือแสดงการวางสินค้าก่อนเริ่มการกระทำใหม่ ห้ามให้สินค้าย้ายไปวางบนชั้นเอง

ถ้าการกระทำหนึ่งชุดยาวเกินเวลาที่เลือก ให้แบ่งเป็น sub-shot หรือช็อตถัดไปโดยสร้าง anchor ที่ชัดเจน เช่น “ขวดอยู่ในมือขวาที่ระดับอก” หรือ “ฟองยังปกคลุมศีรษะครึ่งหนึ่ง” ห้ามแก้ด้วยการเร่งความเร็วผิดธรรมชาติหรือใส่การกระทำหลายอย่างในเฟรมเดียวจนโมเดลทำไม่ไหว

หากมีบทพูด ให้ส่งสถานะของผู้พูดต่อจากช็อตหนึ่งไปอีกช็อตหนึ่งด้วย เช่น ใครถือสินค้าอยู่ ใครกำลังหันหน้าเข้ากล้อง และใครเป็นผู้พูดคนถัดไป ห้ามเปลี่ยนผู้พูดเพียงเพราะอยู่ใกล้กล้องกว่า และห้ามให้ตัวละครที่ไม่ได้รับบทพูดขยับปากเหมือนกำลังพูด

## Output style

- ใช้ชื่อช็อตที่สื่อการกระทำ เช่น `Shot 1 — Problem / Product Introduction`
- ให้ prompt ของแต่ละช็อตอยู่ใน code block แยกกันเมื่อแสดงผลแบบข้อความ เพื่อให้คัดลอกได้ง่าย
- ถ้ามีบทพูด ให้แสดง `speaking_turns` แยกตามช็อต โดยมี `SPEAKER`, reference id, เวลาเริ่ม–จบ และ `EXACT SPOKEN DIALOGUE` ที่ตรงกับข้อความใน prompt; ถ้าไม่มีบทพูดให้ส่งรายการว่างและระบุ `DIALOGUE MODE: NONE`
- อย่าอ้างว่ามีการสร้างภาพ keyframe หรือวิดีโอจริงแล้ว; ให้ส่ง `keyframe_plan` และ prompt สำหรับขั้นตอนดังกล่าวเท่านั้น
- ถ้าข้อมูลสำคัญขาดจริง ๆ ให้ใช้ `status: needs_clarification` และถามเฉพาะคำถามที่จำเป็นที่สุด แต่ถ้ายังสร้างฉบับที่ปลอดภัยได้ ให้ดำเนินการต่อพร้อมระบุสมมติฐาน

## Supporting reference

อ่าน [references/video-prompt-rules.md](references/video-prompt-rules.md) เมื่อต้องการรายละเอียดเรื่องการแบ่งเวลา, การล็อกสินค้า/คน, customer journey, และตัวอย่าง shampoo multi-shot
