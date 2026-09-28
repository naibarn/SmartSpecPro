# Section 05 — Deployment and Production Verification

## Goal

ทำให้ deployment เป็น controlled state transition และไม่ประกาศว่างานปลอดภัยเพียงเพราะ `/healthz` ตอบ 200

## Runbook

1. ตรวจ bundle identity, migrations, env, Redis/BullMQ connectivity และ active story jobs
2. ตั้ง application เป็น `draining`; `/readyz` ไม่รับ traffic ใหม่สำหรับ submission
3. หยุด scheduler/queue intake ตามลำดับ และรอหรือบังคับ checkpoint ของงาน active
4. ปิด worker/HTTP queues แบบ graceful พร้อมบันทึก drain timeout
5. restart instance ด้วย bundle ที่ตรวจแล้ว
6. startup sweep reconcile orphaned delivery/domain records ก่อน `/readyz=200`
7. ทำ canary policy fixture, checkpoint resume fixture และ credit/idempotency check
8. เปิด traffic ทีละขั้นและเฝ้า alert window

## Gates

- local focused tests และ changed-path typecheck ผ่าน
- build/deploy identity ตรงกับ source ที่ทดสอบ
- `/healthz` ใช้ liveness เท่านั้น; `/readyz` สะท้อน dependency, startup reconcile และ drain
- มี browser proof ว่า UI แสดง state จริง
- มี staging fault injection หลัง checkpoint
- production proof ต้องมี logs/metrics/provider/credit evidence; ห้ามสรุปจาก unit tests อย่างเดียว

## Rollback

ถ้า canary ผิดปกติ ให้ drain instance, rollback bundle/rule version, startup reconcile และคง candidate/checkpoint/artifact เดิมไว้ ห้ามลบ record เพื่อทำให้ dashboard ดูสะอาด
