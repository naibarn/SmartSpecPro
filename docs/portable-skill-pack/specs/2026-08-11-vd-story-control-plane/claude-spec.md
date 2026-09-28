# Synthesized Specification: Vertical Drama Story Control Plane

## Problem

ระบบมี thread IDs, episode memory และ continuity gate บางส่วนแล้ว แต่ยังสามารถเกิด “ปมที่มีภาพหรือเหตุการณ์สำคัญแล้วไม่ถูกเฉลย”, thread ที่เปิดและปิดจับคู่กันไม่ได้, open thread ที่เป็นข้อความลอย, ตัวละคร/บทบาทสับสน และจังหวะพระเอกนางเอกหรือการพลิกความได้เปรียบไม่สม่ำเสมอได้ การแก้ด้วยการเพิ่มรายการปมและบังคับให้ปิดทุกปมเสี่ยงทำให้ model พะวง checklist จนแกนเรื่องเสีย

## Desired outcome

สร้างแผนพัฒนา Story Control Plane ที่ทำงานร่วมกับ skill เดิมอย่างเป็นจริง โดย:

1. วางแกนเรื่องและ arc ก่อนเขียน episode
2. จำกัด context ที่ส่งให้แต่ละ skill call ให้สั้นและเกี่ยวข้อง
3. คุม durable thread ด้วย stable identity, scope, payoff window และ evidence
4. ไม่ auto-close หรือ rewrite legacy content
5. ทำให้ romance, emotional contrast และ hero/villain advantage เป็นจังหวะระดับ episode/arc ที่ skill พิจารณาคุณภาพได้ ไม่ใช่สูตรแข็งระดับ shot
6. ตรวจ structural drift ด้วย deterministic validator และตรวจความหมายด้วย skill review
7. แสดงสถานะและเหตุผลใน UI ให้ผู้สร้างตรวจสอบได้
8. วางจำนวนตอนและ runtime จาก duration profile/shot plan จริง โดยไม่ยึดค่า 60 หรือ 90 วินาทีเป็นสูตรกลาง

## Non-goals

- ไม่สร้างเครื่องยนต์ที่เขียนเนื้อเรื่องแทน full-story architect หรือ script-builder
- ไม่ใช้ TypeScript ตัดสินว่าฉากโรแมนติก “ดี” หรือเฉลย “น่าพอใจ”
- ไม่บังคับให้ทุกตอนเปิดและปิดปมระยะยาว
- ไม่ migrate ด้วยการเดาหรือปิดปมจากข้อมูลเก่า
- ไม่ rewrite episode ที่เผยแพร่หรือ episode ที่ผู้ใช้ยืนยันแล้ว

## Constraints

- ใช้โครงสร้างและ test conventions ของ `apps/web`
- ต้องคง backward compatibility ระหว่าง legacy memory กับ structured control plan
- ต้องไม่เพิ่ม prompt size จนทำให้ model สับสนหรือคุณภาพลดลง
- ต้องมี feature flag และ audit-only rollout
- ต้องแยก logical story shots ออกจาก provider clips/frames และคำนวณ runtime จาก duration vector ที่ตรวจสอบกับ capability ของ provider
- งานนี้เป็นแผนก่อน implementation; ยังไม่แก้ source code production ในรอบนี้

## Functional requirements

### Control plan

มีแผนกลางแบบ versioned ซึ่งประกอบด้วย premise/genre guardrails, canon cast matrix, arc ledger, episode slots, romance phase plan, advantage curve และ policy/budget ของ durable threads โดย plan เป็นผู้กำหนด “อะไรควรเกิดเมื่อไร” แต่ไม่กำหนดบทสนทนาและช็อตละเอียดทั้งหมด

Episode slot ต้องอ้าง duration profile ที่ใช้จริงหรือสถานะ `duration_pending` และมี duration vector ของ 9 logical shots เมื่อพร้อม โดย `episodeRuntimeSeconds` เป็นค่าที่ derive จาก vector และ assembly mapping เท่านั้น ไม่ใช่ source of truth ที่ผู้ใช้กรอกแยกต่างหาก

### Thread scopes

- `moment_hook`: hook หรือคำถามสั้นที่ต้องจ่ายในตอนเดียวหรือทำหน้าที่ retention; ไม่สะสมเป็น season debt
- `episode_thread`: ปัญหาของตอนที่ควรจบในตอนนั้นหรือช่วงสั้นถัดไป
- `arc_thread`: ปมที่มีเจ้าของ ตัวละครที่เกี่ยวข้อง เหตุผลทางแกนเรื่อง และ payoff window หลายตอน
- `season_thread`: ปมแกนใหญ่ที่ผูกกับ finale หรือ explicit sequel hook

ทุก durable thread ต้องมี `threadId`, `scope`, `ownerCharacters`, `plantEpisode`, `payoffWindow`, `expectedEvidence`, `resolutionCost` และสถานะที่ชัดเจน หากไม่สามารถวาง payoff ได้ต้องไม่เปิดเป็น durable thread

### Episode slot

แต่ละ episode ที่ยังไม่เขียนจะได้รับ slot แบบ bounded ประกอบด้วย episode purpose, active thread actions, allowed new-thread budget, romance beat, advantage beat, required characters, canon facts และ forbidden contradictions เฉพาะที่เกี่ยวข้อง ไม่ส่ง ledger ทั้งซีซันเข้า authoring prompt

### Post-draft reconciliation

หลัง skill เขียน episode ต้องมี semantic review และ deterministic reconciliation แยกกัน ระบบรับเฉพาะ action ที่อ้าง ID และหลักฐานใน episode หากพิสูจน์การปิดไม่ได้ให้ `needs_repair` หรือ `deferred` ไม่ mark resolved จากชื่อหรือข้อความสรุปอย่างเดียว

### Legacy safety

ข้อมูลเก่าต้อง audit แยกเป็น `legacy_unknown`, `carry`, `resolve`, `parked` หรือ `sequel_hook` พร้อมเหตุผลและ source episode ห้ามเปลี่ยนบทเก่าเพียงเพื่อทำให้ validator ผ่าน ซีรีย์ที่ถึงตอน 25 ให้ใช้ future-horizon mode สำหรับตอนถัดไป

### UI

หน้าซีรีย์ tab ที่แสดง memory/state ต้องแสดง thread ID, scope, สถานะ, เปิดตอน, อายุ, payoff window, ตอนที่มี evidence, วันที่/รอบที่ resolved, overdue/unknown และความสัมพันธ์กับตัวละครที่รับผิดชอบ ใช้ UI เดิมเป็นฐาน ไม่สร้างรายการปมแยกอีกชุด

## Quality requirements

- Core premise adherence ต้องผ่าน semantic review
- ไม่มี canonical character mismatch หรือ role reassignment ที่ไม่ได้รับอนุญาต
- ไม่มี durable thread ที่หายเงียบ
- ไม่มี resolution ที่ไม่มี registered opening หรือ evidence
- active durable thread และการเปิดปมใหม่อยู่ใน budget ที่วางไว้
- romance phase ต้องไม่วนซ้ำ/หายยาวโดยไม่มีเหตุผลของ arc
- ฝ่ายที่ได้เปรียบติดต่อกันต้องมี cost, antagonist response หรือเหตุผลจากแผน
- episode ยังคงมี reversal, emotion variety, pacing และ retention quality ตาม skill เดิม
- จำนวน shot เป็น 9 ตาม storyboard contract แต่ duration ต่อ shot อาจเป็น 8, 10, 15, 20, 25 หรือ 30 วินาทีตาม provider/profile ที่ผ่านการตรวจ; การรองรับค่าอื่นในอนาคตต้องเพิ่มผ่าน catalog/profile ไม่แก้สูตร story planner แบบเฉพาะกิจ

## Acceptance boundary for the plan

แผน implementation ต้องแยกชัดเจนว่า field/validator ใดเป็น deterministic, judgment ใดเป็น skill, phase ใดทำกับข้อมูลใหม่, phase ใด audit legacy, วิธีทดสอบความสามารถของ skill ก่อนเปิดใช้จริง และวิธีพิสูจน์ว่า prompt/context ที่เพิ่มไม่ทำให้เนื้อเรื่องหลุดแกน
