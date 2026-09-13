# Section 02 — Candidate-Aware Recovery and Billing Safety

## Goal

รักษา candidate ที่เกิดก่อน failure และให้ผู้ใช้ตัดสินใจได้ โดยไม่ให้ระบบส่ง candidate ที่ยังไม่ผ่านไปสร้าง media หรือคิดเครดิตซ้ำ

## Changes

1. บังคับ bounded repair attempts และ no-progress stop ในทุก storyboard safety repair path
2. เก็บ original/repaired/exhausted candidate พร้อม attempt, detector version และ findings แบบ bounded
3. ใช้ stable error codes แยก policy, uncertainty, provider และ schema failures
4. เพิ่ม explicit accepted-candidate gate ก่อน media handoff
5. ผูก credit reservation/commit กับ accepted artifact และ idempotency key เดียวต่อ logical work
6. ทำ owner-scoped review/repair API และ duplicate-submit guard

## Invariants

- candidate ที่ rejected ไม่ถูกลบ
- automatic repair ไม่มี infinite loop
- high-risk/uncertain candidate ไม่ถูกส่ง provider
- failure/retry ไม่ double charge

## Proof

Service/router tests และ read-only artifact replay; staging fault injection ต้องยืนยันว่าไม่มี provider request และ credit commit สำหรับ rejected candidate
