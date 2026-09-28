# Section 03 — Checkpoint, Stall, and Restart Resilience

## Goal

ทำให้ story job ที่หยุดจาก worker crash, BullMQ stall, Redis/domain mismatch หรือ deploy restart กลับมาทำต่อจาก checkpoint เดิมอย่างปลอดภัย

## Changes

1. เพิ่ม heartbeat age/sequence ให้แยกจาก TTL และบันทึก delivery identity
2. ให้ watchdog/startup sweep reconcile BullMQ, Redis story record, active pointer และ durable assurance run
3. รักษา same-jobId resume; ห้ามสร้าง logical job ใหม่แบบเงียบ ๆ
4. เพิ่ม fence/idempotency checks ใน result, checkpoint และ credit boundaries
5. จัดการ pointer race, TTL expiry, retry limit, no checkpoint และ operator-review terminal state
6. เพิ่ม drain state: reject new work, reach checkpoint, close queues, reconcile ก่อน ready

## Invariants

- stale delivery เขียนทับ current delivery ไม่ได้
- resume เฉพาะงานที่ยังไม่เสร็จ
- completed episode และเครดิตไม่เกิดซ้ำ
- job ที่ไม่มี checkpoint ไม่ถูกหลอกว่า resume ได้

## Proof

Queue/service tests, kill-after-checkpoint staging simulation, startup/restart logs และ `/readyz` transition evidence
