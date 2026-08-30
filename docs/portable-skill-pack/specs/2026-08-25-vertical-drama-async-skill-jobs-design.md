# Vertical Drama Async Skill Jobs and Timeout Resilience

วันที่: 2026-08-25  
สถานะ: Approved design; implementation pending

## เป้าหมาย

ปรับเส้นทางสร้าง Vertical Drama ทั้งหมดที่เรียก LLM หรือ skill ให้ทำงานผ่าน background job ที่ติดตามและกู้คืนได้ เพื่อลด timeout จาก HTTP/proxy และป้องกันผลลัพธ์หรือรายการเครดิตตกหล่น โดยยังเรียก LLM จริงตาม model ที่ผู้ใช้เลือก ไม่ใช้ mock และไม่ใช้ fallback แบบ sync

## ปัญหาที่ต้องแก้

เส้นทาง browser-facing บางจุดยัง `await` งาน LLM ภายใน request เดิม ทำให้ request timeout ทั้งที่ provider อาจกำลังทำงานอยู่ หรือทำให้สถานะ/ผลลัพธ์/เครดิตไม่สอดคล้องกัน จุดสำคัญที่พบ ได้แก่:

- prompt expansion (`previewPromptExpansion`)
- story bible / story plan (`generateStoryBible`)
- legacy preset synthesis (`synthesizeGenrePreset`)
- season carry-over และ special-edition brief
- source description/vision analysis
- location detection
- character variant/twin detection
- character duplicate analysis
- shot reference-frame prompt

งานที่เป็น queue/worker อยู่แล้ว เช่น deep draft, draft composition, QC, episode stages และ provider media tasks ต้องตรวจ contract และปิดช่องทางที่สามารถเรียก service แบบ sync จาก public router ได้ แต่ไม่สร้าง queue ซ้ำโดยไม่จำเป็น

## หลักการที่ห้ามละเมิด

1. Public mutation ต้องทำเฉพาะ auth/ownership, input validation, model validation, affordability check และ enqueue แล้วคืน job ID อย่างรวดเร็ว
2. LLM ต้องถูกเรียกโดย worker/executor เท่านั้น และต้องเป็นการเรียกจริงผ่าน skill/OpenRouter ตาม model ที่ผู้ใช้เลือก
3. ห้าม fallback จาก async เป็น sync เมื่อ queue/provider มีปัญหา; ต้องรายงานสถานะ failed หรือ enqueue failure อย่างชัดเจน
4. เครดิตจริงต้องตัดและบันทึกใน worker ตามการเรียก LLM จริง ทุก run/retry ใหม่เป็น transaction ใหม่ตามนโยบายระบบ
5. ทุก transaction ต้องมี skill slug, ชื่อ skill, model, tenant, user, series/session, job/run/trace ID, จำนวนเครดิต และสถานะที่ตรวจสอบย้อนกลับได้
6. ผลลัพธ์ต้อง persist ก่อนประกาศ job สำเร็จ และต้องโหลดกลับได้หลัง refresh, worker restart หรือ browser disconnect
7. งานที่เป็น pure DB mutation หรือ user-confirmed destructive action ไม่ต้องถูกเปลี่ยนเป็น LLM job หากไม่มีเหตุผลด้าน timeout

## สถาปัตยกรรมที่เลือก

### Queue ที่นำกลับมาใช้

- ขยาย `verticalDramaStoryJobs` ด้วย job kind สำหรับ story plan/bible
- ใช้ `verticalDramaDraftCompositionJobs` เป็นทางหลักสำหรับ draft/preset composition
- ขยาย `verticalDramaShotPromptJobs` สำหรับ reference-frame prompt
- ใช้ queue เดิมสำหรับ deep draft, QC, episode stage และ prompt ที่มีอยู่แล้ว

### Interactive analysis jobs

เพิ่ม typed job layer สำหรับงาน LLM แบบ interactive ที่ยังไม่มี queue แยก โดยกำหนด job kind และ payload/result schema ชัดเจนสำหรับ:

- prompt expansion
- lineage planning
- source analysis
- location detection
- character variants
- duplicate analysis

ห้ามทำเป็น arbitrary generic job ที่รับ function หรือ payload ไร้ schema เพราะจะทำให้ ownership, billing, retry และ audit ตรวจสอบไม่ได้

### Job lifecycle

ทุก job ต้องรองรับ:

`queued -> running -> succeeded | failed | cancelled`

สถานะต้องมี progress, retryable flag, error code/message, model, skill slug, trace ID, timestamps และ result pointer/result payload ตามความเหมาะสม มี active-job pointer แบบ tenant/user/series/session scoped เพื่อให้ refresh แล้ว resume ได้ และป้องกันการ submit ซ้ำโดยไม่ตั้งใจ

สำหรับงานยาว เช่น story plan ให้ใช้ checkpoint/resume เมื่อ service รองรับ ไม่ถือว่า HTTP timeout เป็นงานล้มเหลว

## Billing และ audit contract

- enqueue ไม่คิดเครดิตเอง แต่ตรวจ affordability เท่านั้น
- worker เป็นผู้คิดเครดิตเมื่อเรียก LLM จริง
- ใช้ deterministic run/call key เพื่อป้องกัน double settlement จาก worker retry
- ถ้า provider call เกิดขึ้นแล้ว worker ล้มเหลว ต้องรักษา ledger ที่เกิดขึ้นไว้และแสดงรายการให้ครบ
- การกด run ใหม่หลังงานเดิมจบ/ล้มเหลวเป็น run ใหม่และคิดเครดิตใหม่ตามการใช้ LLM จริง
- หน้าคредитต้องแสดงชื่อ skill ที่ถูกต้อง ไม่ใช้ชื่อ route หรือชื่อ fallback และแสดง model ที่ถูกเลือกจริง
- ถ้า skill slug หาย ให้หยุดก่อนเรียก LLM และแสดง validation error ไม่สร้าง ledger ที่ระบุตัวตนไม่ครบ

## Client behavior

- ทุกปุ่ม LLM เปลี่ยนเป็น submit + status polling/query
- ระหว่าง queued/running ให้ disable การ submit ซ้ำและแสดง progress
- หาก polling หมดรอบ ให้แสดงว่ายังทำงานเบื้องหลัง ไม่แปลงเป็น LLM failure
- เมื่อ refresh ให้โหลด active job และผลลัพธ์จาก server ไม่พึ่งเฉพาะ local state
- terminal failure ต้องแสดงสาเหตุและ trace/job ID ที่ตรวจสอบได้
- chain story plan -> deep draft ต้อง enqueue ขั้นถัดไปเมื่อขั้นก่อนหน้าสำเร็จเท่านั้น
- source/image analysis ต้อง persist status/result เพื่อให้ story generation ใช้ข้อมูลภาพที่พร้อมแล้วอย่างถูกต้อง

## การตรวจความสมบูรณ์หลังสร้างเรื่อง

หลัง full-story generation ให้รัน completion check แบบ server-side ตรวจอย่างน้อย:

- จำนวนตอนและตอนย่อยตรงกับค่าที่ user ยืนยัน
- ทุกตอนมี synopsis และ story beats
- ทุกตอนมี shot/scene data ที่จำเป็น
- ทุก shot ที่ต้องมีบทพูดมี dialogue/voice line
- reference/b-roll description สอดคล้องกับ source image metadata เมื่อมีภาพแนบ

หากไม่ครบ ให้ enqueue repair job จริงและคิดเครดิตตาม LLM call; ห้ามคืนผลสำเร็จปลอม หรือบังคับให้ผู้ใช้กดซ้ำเองในกรณีข้อมูลไม่ครบตาม contract

## ลำดับการปรับปรุง

1. story plan/bible และ prompt expansion ซึ่งเป็นต้นเหตุ timeout โดยตรง
2. ตรวจและปิด legacy preset/lineage sync endpoint
3. source analysis และ image/vision pipeline
4. location/character analysis
5. reference-frame prompt
6. client refresh-safe polling และ chain orchestration
7. billing/ledger projection และ static guard ตรวจไม่ให้ public router เรียก LLM ตรง
8. completion check และ auto-repair ของ full story

## ความปลอดภัยและขอบเขตข้อมูล

ทุก submit/status/result ต้องตรวจ tenant, user, series และ draft session ownership ซ้ำที่ server ห้ามใช้ job ID อย่างเดียวเพื่ออ่านผล ห้ามนำ legacy/unbound record กลับมาเป็น active job และห้ามแก้ไข immutable draft/ledger version โดยตรง

## Acceptance criteria

1. Request submit ของทุก LLM flow ตอบกลับได้เร็วโดยไม่รอ provider ที่จำลองให้ค้างนาน
2. Worker เรียก service/skill จริงและ persist ผลสำเร็จ/ล้มเหลวอย่างถูกต้อง
3. Browser refresh และ worker restart สามารถ resume หรืออ่านผลเดิมได้
4. ไม่มี public router ที่เรียก LLM service โดยตรงใน flow ที่กำหนด
5. model ที่ user เลือกถูกส่งถึง worker/provider โดยไม่ถูกแทนด้วย model อื่น
6. ทุก LLM run มี ledger transaction ที่มี skill slug, ชื่อ skill, model และ trace/run ID ครบ
7. retry ไม่ทำให้เกิด double billing; run ใหม่เกิดรายการใหม่ตามจริง
8. chain plan/draft/QC/full story หยุดต่อเมื่อขั้นก่อนหน้าล้มเหลว และแสดง error จริง
9. full story ที่ขาดบทพูดหรือข้อมูลตอนถูกตรวจพบและ repair อัตโนมัติด้วย LLM จริง
10. focused tests, typecheck ที่เกี่ยวข้อง และ `git diff --check` ผ่าน; รายการที่ยังต้องพิสูจน์ด้วย deployment/provider/browser จริงต้องระบุชัดเจน

## Test strategy

- queue submit latency with a never-resolving mocked provider at the boundary only
- worker success/failure/retry/stall/restart/resume
- result persistence and active-job recovery after refresh
- tenant/user/series/session authorization
- model passthrough and skill slug validation
- ledger entry count, metadata, idempotency and retry billing
- router static/regression guard against direct LLM calls
- UI polling states and chain transitions
- completion detection and repair enqueue for missing dialogue/episodes
- focused Vitest/jsdom suites, changed-file diagnostics, and `git diff --check`

Tests may mock the provider boundary to prove timeout isolation, but production application paths must not use mock or fallback behavior.

## Non-goals

- ไม่เพิ่ม timeout ของ proxy เป็นวิธีหลัก
- ไม่เปลี่ยน pure DB operations ให้เป็น LLM job โดยไม่จำเป็น
- ไม่ลบ immutable ledger/version เพื่อซ่อนรายการเครดิตที่เกิดขึ้นแล้ว
- ไม่ claim ว่าทดสอบ OpenRouter หรือ production สำเร็จ หากยังไม่ได้รันด้วย credential/deployment จริง
