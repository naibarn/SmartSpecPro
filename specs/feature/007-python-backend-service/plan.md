# plan.md — 007-python-backend-service

Last updated: 2026-01-05

## Goal
ทำให้ backend “ใช้งานได้จริง” ในแกนหลัก (LLM + Auth + Credits + Orchestrator) และลดความคลุมเครือว่าอะไรเป็น placeholder

## Plan (แบ่งเป็นระยะ)
1) **Stabilize Runtime**
   - ตรวจ startup/shutdown: DB/Redis/LLM unified client
   - เพิ่ม /health รายละเอียดเชิงระบบ (db/redis/providers)

2) **Harden Auth & Permissions**
   - ทบทวน token model (access/refresh, blacklist, oauth)
   - ทำ admin guard ให้ครบใน endpoints สำคัญ

3) **LLM Gateway Quality**
   - ทำ unified model registry + fallback rules
   - สรุป cost/credits accounting ให้ชัดและ testable

4) **Orchestrator Productization**
   - กำหนด execution contract: state schema, checkpoint format, cancellation semantics
   - ทำ integration test ครอบคลุม (happy path + failure recovery)

5) **Workflows/Autopilot**
   - ถ้าจะพัฒนาต่อ: แทน placeholder ด้วย orchestration จริง หรือชี้ไปที่ `.smartspec` runner

## Risks / Decisions
- ซ้ำซ้อนกับ 003-smartspec-website: ต้องตัดสินใจว่า backend นี้เป็น “local/dev backend” หรือ “production backend”
- ถ้าจะให้ desktop ใช้จริง ต้องกำหนด base URL และ auth scheme ให้แน่นอน
