# Decision Log

## D1 — Keep safety fail-closed, make matching context-aware

แก้ false positive ที่ detector และ input contract ไม่ใช่ลด severity หรือ bypass policy ทั้งก้อน คำที่เป็น dangerous marker ต้องมี boundary/context rule และ finding ต้องอธิบาย field, shot, matched excerpt แบบ redacted/length-bounded

เหตุผล: เคส `ประกาศพัก` พิสูจน์ว่า raw substring ไม่ใช่ evidence ของ intent แต่ genuine phrase เช่น `พบศพ` ต้องยัง block ได้

## D2 — Authored story context เป็น authority ของ policy intent

Provider-expanded prompt, handoff text, metadata และ duplicated descriptions ใช้เป็น supporting evidence ได้ แต่ไม่ควรสร้าง high-risk intent ใหม่โดยลำพังเมื่อ authored synopsis/dialogue/shot action ไม่รองรับ ต้องบันทึก source precedence และความไม่แน่นอนให้ตรวจสอบได้

## D3 — Preserve candidate and charge only accepted work

ทุก repair attempt ต้องเก็บ original candidate, repaired candidate, detector version, findings และ attempt number แบบ bounded artifact เมื่อหมด budget ให้หยุดและให้ผู้ใช้ review/edit เอง ห้าม auto-retry หรือ media generation ต่อจาก candidate ที่ยังไม่ผ่าน

## D4 — Harden existing checkpoint path; do not create a second job system

ใช้ Redis story record + BullMQ + durable assurance run + active pointer ที่มีอยู่แล้ว เพิ่ม reconciliation, fencing, heartbeat/age semantics และ state contract ในจุดเดิม ไม่สร้างตารางใหม่หรือ queue ใหม่ใน phase แรก

## D5 — No migration by default

เก็บ evidence ที่จำเป็นใน JSONB/Redis record และ structured logs/metrics ก่อน หากต้องการค้นย้อนหลังข้าม TTL หรือทำ audit/report จริง ค่อยเสนอ migration แยกพร้อม retention/PII review

## D6 — Recovery is explicit and owner-scoped

ระบบตรวจพบได้อัตโนมัติ แต่การใช้ provider/เครดิตเพื่อ resume หลัง failure ต้องผ่าน action ที่ owner มีสิทธิ์กด ยกเว้น redelivery ที่เป็น delivery เดิมและมี idempotency/fence ครบถ้วน

## D7 — Deployment must be a state transition

restart ต้องประกาศ drain, ไม่รับงานใหม่, รอหรือ checkpoint งานที่กำลังทำ, ปิด queue, แล้ว startup reconcile ก่อนพร้อมรับ traffic; `/healthz` เป็น liveness และ `/readyz` ต้องสะท้อน readiness/draining แยกกัน

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Detector ใหม่พลาดคำไทยรูปแบบอื่น | corpus/property tests, shadow telemetry, versioned detector |
| Evidence เปิดเผยเนื้อหาละเอียดเกินจำเป็น | redact/length cap, owner/admin scope, retention |
| Recovery ซ้ำหรือ double charge | same job id, idempotency key, fence token, credit ledger assertion |
| TTL หมดก่อนผู้ใช้กลับมา | durable checkpoint pointer หรือ explicit retention policy; alert ก่อน expiry |
| Deploy ยังฆ่างานกลางทาง | drain/readiness gate และ startup sweep |
| UI บอกว่า failed ทั้งที่กำลัง recover | canonical state machine + polling/realtime contract |

## Self-review rounds

1. ตรวจ scope กับเหตุการณ์ screenshot: ครอบคลุม safety false positive และ job stall แล้ว
2. ตรวจ data safety: ไม่มี bypass, deletion, provider call หรือ credit retry อัตโนมัติ
3. ตรวจ architecture: reuse existing safety/job/router/UI/health boundaries; ไม่มี duplicate queue/store
4. ตรวจ testability: ทุก phase มี unit/integration/browser/ops proof และ changed-path/full-worktree distinction
5. ตรวจ implementability: มี owner paths, state contracts, rollout gates และ rollback; ไม่พบ autofix ที่จำเป็น
6. ตรวจซ้ำรอบสุดท้าย: ไม่มี gap ใหม่ที่มีนัยสำคัญ (clean round 1)
7. ตรวจซ้ำรอบสุดท้าย: ไม่มี gap ใหม่ที่มีนัยสำคัญ (clean round 2)
