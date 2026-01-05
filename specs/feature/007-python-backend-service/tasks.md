# tasks.md — 007-python-backend-service

Last updated: 2026-01-05

## P0 (ทำให้รัน/ดีบักได้ชัวร์)
- [ ] ตรวจ README ให้มีคำสั่ง run ที่ใช้งานได้จริง (uvicorn, env, db migrate)
- [ ] เพิ่ม healthcheck: db/redis/connectivity + provider readiness
- [ ] เพิ่ม logging correlation id (request id) เพื่อ trace

## P1 (LLM/credits)
- [ ] ทำ test สำหรับ credit deduction + insufficient balance
- [ ] ทำ streaming path ให้มี backpressure/timeout ที่เหมาะสม
- [ ] ทำ provider fallback ที่ deterministic

## P1 (Orchestrator)
- [ ] เพิ่ม integration tests สำหรับ execute → checkpoint → resume
- [ ] นิยาม state schema versioning (ป้องกัน breaking change)

## P2 (ลด placeholder)
- [ ] จัดสถานะ router ที่ not_implemented (workflows/autopilot) ว่าจะ implement หรือ deprecate
- [ ] รวมเอกสาร API surfaces ให้ชัดว่าใช้กับ desktop/web อันไหน
