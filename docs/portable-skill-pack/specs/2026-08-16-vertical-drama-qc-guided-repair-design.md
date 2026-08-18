# Vertical Drama Draft QC — Skill-first guided repair

## Objective

ทำให้การสร้าง Draft และ QC สำเร็จได้ด้วยขั้นตอนที่สั้นและไม่บังคับให้ผู้ใช้
คิดรายละเอียดเรื่องเพิ่มเอง โดยให้ Skill/LLM ขยาย premise สั้นให้เป็น story
package ที่ครบถ้วน รักษาแกนที่ผู้ใช้ระบุเป็นข้อผูกมัด และเมื่อ QC ต่ำกว่า
เกณฑ์ให้ระบบเสนอการซ่อมที่ทำได้จริงแทนการให้ผู้ใช้กด QC ซ้ำแบบเดาสุ่ม

## Product flow

1. ผู้ใช้กรอก premise สั้นหรือยาว แล้วกดสร้าง Draft เพียงครั้งเดียว
2. ระบบใช้ story-completion Skill เติม story context, story architecture,
   repeatable engine, escalation, character arc และ long-term destination โดย
   เก็บ premise เดิมเป็น immutable user-intent anchor; ไม่ถามข้อมูลเพิ่ม
3. เมื่อผู้ใช้กด `เริ่มตรวจ QC` ต้องมี confirmation dialog แสดงจำนวน calls,
   เครดิตสูงสุด และผลกระทบว่าเป็นการใช้เครดิตหนึ่งรอบ
4. QC ตรวจครั้งเดียวพร้อม bounded improvement rounds ตามค่าที่เลือก โดยไม่
   retry ไม่จำกัดและไม่ใช้ provider/model fallback
5. ถ้าผ่าน 9.0 และไม่มี critical failure ให้เลือก Draft ได้ทันที
6. ถ้าไม่ผ่าน ให้แสดงคะแนนรายเกณฑ์และ `แผนซ่อมอัตโนมัติ` ที่สรุปจากข้อที่
   คะแนนต่ำ/จุดวิกฤต/คำแนะนำของ Skill ผู้ใช้กดปุ่มเดียวเพื่อให้ AI ซ่อม Draft
   โดยมี confirmation แยกก่อนใช้เครดิตซ่อม
7. การซ่อมสร้าง immutable Draft version ใหม่และแสดงสรุป changed fields;
   ไม่ลบหรือเขียนทับ Draft เดิม จากนั้นผู้ใช้เป็นผู้ยืนยันว่าจะ QC ฉบับใหม่
   (มี confirmation อีกครั้ง) หรือยืนยันใช้ฉบับเดิม/ฉบับที่ดีที่สุดพร้อมคำเตือน
8. ถ้าแผนซ่อมไม่มี action ที่ปลอดภัย หรือซ่อมแล้วคะแนนไม่ดีขึ้น ระบบต้องไม่
   บังคับให้เสียเครดิตเพิ่มและเปิดทาง `ยืนยันใช้ Draft นี้แบบมีคำเตือน` เมื่อ
   ไม่มี critical failure และข้อมูลครบขั้นต่ำ

## State and data contract

เพิ่มแบบ additive และรองรับผลเก่า:

- `DraftQualityQcReport.repairPlan` optional; มี `available`, `summary`, และ
  รายการ action ที่อ้างอิง criterion id, reason, target paths, preserve paths,
  expected change และ `autoRunnable`
- `DraftQualityQcResultSnapshot` เก็บ `repairPlan` และ `repairAttempted`
- ประวัติทุก round ยังคงเก็บ scorecard และ immutable candidate fingerprint
- ผลเก่าที่ไม่มี repairPlan ให้ derive แผนแบบ deterministic จาก criteria,
  criticalFails และ recommendations ที่หน้าอ่านผล โดยไม่สร้างคะแนนใหม่
- ไม่มีการเชื่อคะแนนจาก client; server ตรวจ run, candidate version,
  fingerprint, immutable constraints และ owner ทุกครั้ง

## Skill-first repair contract

QC Skill เป็นผู้จัดลำดับสิ่งที่ควรแก้ แต่ server เป็นผู้คุมความปลอดภัย:

- score < 4/5 หรือ critical failure เป็น priority สูง
- ใช้คำแนะนำของ Skill เป็น instruction ที่แสดงให้ผู้ใช้เห็น
- repair call ต้อง return complete draft + changedFields ตาม schema เดิม
- server ใช้ additive merge: field ที่ LLM ละเว้น/null ไม่ลบข้อมูลเดิม
- immutable user premise, explicit names, storyContract, locale/market,
  episode count และ visual identity ห้ามเปลี่ยน
- `storyDesign` เป็น control plane ที่ QC ปรับได้เฉพาะ allowlist ของโครงสร้าง
  ที่จำเป็นต่อ long-form repair ได้แก่ `contractVersion`, `totalEpisodeCount`,
  `primaryEngine`,
  `secondaryEngines`, `pressureThreads`, `earlyPayoff`, `romanceProgression`,
  `advantageBeats`, `conflictGuardrails` และ `storyControlSeed`
- key อื่นที่เป็น passthrough ใน `storyDesign` ต้องคงเดิม; server ต้อง validate
  control plane หลัง merge กับ episode count และ approved Story Architecture
- ตรวจ completeness และ immutable constraints หลัง repair ก่อนบันทึก version
- repair หนึ่งครั้งต่อ QC result/fingerprint; หากไม่ดีขึ้นให้หยุดและเสนอ
  confirmation แบบมีคำเตือนแทนการ loop ต่อ

## Credit and concurrency safety

- ทุก mutation ที่อาจใช้เครดิตต้องมี explicit confirmation ที่ UI
- server deduplicate งานที่มี request fingerprint เดียวกัน และไม่เริ่มงานซ้ำ
  จาก double-click
- จำกัด QC ตาม max rounds ที่ผู้ใช้เลือก และจำกัด repair เป็นหนึ่ง targeted call
- provider/schema/queue error แสดงสาเหตุจริง ไม่ fabricate score และกู้ผล
  scorecard ที่สมบูรณ์จาก ledger ได้
- refresh ต้องคืนสถานะจาก job/ledger เดิม; ไม่เรียก LLM ใหม่อัตโนมัติ

## Acceptance criteria

- premise สั้นสร้าง Draft ที่มี story-control fields ครบขั้นต่ำโดยไม่ถามข้อมูลเพิ่ม
- กด QC แล้วเห็น confirmation ก่อนมีการจอง/ใช้เครดิต
- ผล QC แสดง score, evidence, จุดตก และ next action ที่กดได้ใน card เดียว
- repair สร้าง version ใหม่โดย Draft เดิมยังเลือกได้และข้อมูลไม่หาย
- หลัง repair ผู้ใช้เลือกได้ว่าจะ QC ใหม่หรือยืนยันผลเดิมแบบมีคำเตือน
- คะแนนต่ำกว่า 9 แต่ไม่มี critical failure ไม่ทำให้ workflow ตันถาวร
- malformed scorecard ยังคง fail closed และมีข้อความสาเหตุ/ขั้นตอนถัดไป
- test ครอบคลุม schema legacy, repair plan, double-submit, immutable merge,
  repair no-improvement และ confirmation gating

## Non-goals

- ไม่ลดมาตรฐาน critical validation
- ไม่สร้างคะแนนแทน LLM
- ไม่เพิ่ม provider fallback
- ไม่บังคับให้ผู้ใช้กรอกข้อมูลเชิงสร้างสรรค์เพิ่ม
