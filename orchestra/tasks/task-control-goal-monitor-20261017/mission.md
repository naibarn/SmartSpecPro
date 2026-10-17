# Mission: SmartAIHub Task Control, Goal Progress & Agent Monitor

## Context

ผล Audit ล่าสุดที่ SHA `94cc9b8e87` (canonical เคลื่อนไป `054646a762`) พบว่าระบบมี execution/usage receipts อยู่แล้ว แต่ยังมี Gap ที่ Model Provenance, Usage Aggregation และ Task-facing Read Model

รายงานอ้างอิง:
`/tmp/task-model-audit-94cc9b8e87/AUDIT.md`

ตรวจว่าไฟล์และ SHA ยังเข้าถึงได้ หากไม่พบ ให้ใช้แหล่งข้อมูล Canonical ใน Repository ปัจจุบัน และบันทึกความแตกต่าง ห้ามสมมติว่า Audit ยังเป็นสถานะล่าสุด

Audit พบ:
- SPEC-277: Task Detail/Usage UI มีบางส่วน แต่ Model Identity และ Switch History ยังไม่ครบ
- SPEC-294: Shared Read Model มีอยู่ แต่ Project/SPEC rollup และ UI/Chat parity ยังไม่ครบ
- SPEC-088: Comparison ต้องมี evidence comparability
- SPEC-224: มี selection/usage receipts แต่ยังไม่มี Live Acceptance ครบ
- SPEC-186: มี canonical jobs/events และ reservation/settlement
- SPEC-269: มี budget/funding refs แต่ยังไม่ผ่าน end-to-end

62 Tests ที่ผ่านเป็นเพียง scoped validation ไม่ใช่ Live Acceptance

## Objective

ทำให้ SmartAIHub สามารถแสดงข้อมูลได้ครบว่า:

1. Goal สำเร็จจริงกี่เปอร์เซ็นต์
2. งานใด Verified แล้ว งานใดยังไม่เสร็จ
3. งานที่เหลือมีอะไร และสิ่งใดเป็น Blocker
4. Agent/Runner ใดกำลังทำอะไร อยู่ Stage ไหน
5. Requested/Resolved/Effective Model เป็นอะไร พร้อม Evidence
6. Usage/Credits/Quota มีข้อมูลจริงเท่าใดและเชื่อถือได้แค่ไหน
7. ระบบกำลัง Retry, Resume, Recover หรือรอ Human Authority
8. งานเดินหน้าเข้าใกล้ Goal หรือกำลังทำซ้ำโดยไม่เกิด Verified Progress

Architecture Principle:
Monitoring First, Non-Intrusive, Read-Only by Default

## Workstream A — SPEC Ownership & Amendment

1. ตรวจ SPEC_INDEX และ SPEC ล่าสุดจาก Repository จริง
2. ตรวจ ownership ของ SPEC-277, 294, 088, 224, 186, 269 และ SPEC ที่เกี่ยวข้องกับ Agent Monitoring, UI Governance และ Goal Tracking
3. ใช้ผล Audit ที่มีอยู่ ไม่เริ่ม Audit ทั้งหมดใหม่หากไม่มีการเปลี่ยนแปลงสำคัญ
4. แก้ SPEC-277 เพิ่ม Task-facing Model & Usage Evidence Projection และ Goal Progress UI
5. แก้ SPEC-294 เพิ่ม Projection Contract, Aggregation, Freshness, Consistency และ UI/Chat Parity ตาม ownership ที่ตรวจพบ
6. แก้ SPEC-088 เฉพาะ Evidence Comparability
7. ตรวจว่ามี SPEC รองรับ Agent Monitor Web UI และ Goal Completion Aggregation อยู่แล้วหรือไม่
8. หากมี ให้เพิ่ม requirement ใน SPEC เดิม; หากไม่มี ownership ที่เหมาะสมจึงสร้าง SPEC ใหม่ตามกติกา Repository
9. อัปเดต SPEC_INDEX, Requirement Ledger, Traceability และ Acceptance Criteria ตามกระบวนการจริง
10. ห้ามแก้สถานะเป็น Implemented/Verified โดยไม่มีหลักฐาน

## Workstream B — Goal Progress & Completion

ออกแบบ Goal Progress ที่รองรับ:

Goal → Milestone → Deliverable → Acceptance Criterion → Work Unit

ต้องเชื่อมข้อมูลกับ Task/Session/Run/Attempt ที่มีอยู่ โดยไม่สร้าง Task Authority ซ้ำ

แยกค่าต่อไปนี้:
- Execution Progress
- Work Completion
- Verified Goal Completion
- Remaining Scope
- Blocked Scope
- Unverified Scope

Verified Completion คำนวณจาก Acceptance Criteria ที่ผ่านตามน้ำหนักที่กำหนดไว้ใน Goal Baseline

ต้องรองรับ:
- Baseline Version และ Scope Changes
- Parallel Agent และ Shared Deliverables
- Retry/Replanning โดยไม่ Double Count
- Reopened Work และ Regression
- Evidence Coverage
- Remaining Work และ Dependency
- Next Autonomous Action
- Human-required Blockers

ห้ามใช้จำนวน PR, Commits, Tests หรือ Tokens เป็นเปอร์เซ็นต์ความสำเร็จโดยตรง

หากไม่มี Goal Baseline ให้แสดง `BASELINE_MISSING` หรือ `UNKNOWN` ห้ามสมมติเปอร์เซ็นต์

100% Verified Completion ต้องเกิดจาก Required Acceptance Criteria ทุกข้อผ่านตาม policy รวมถึง live acceptance เมื่อเป็น requirement

## Workstream C — Model & Usage Provenance

ใช้ Consumer Contract จากผล Audit โดยต้องแยก:

- UI Session Model
- Canonical Worker Requested Model
- Provider Effective Model
- External Helper Model

ทุก identity ต้องระบุ source, binding และ verification status

ห้ามใช้ compatibility-normalized requested model เป็นหลักฐานของ effective model

ห้ามแปลง missing usage เป็น measured zero

Usage Aggregation ต้อง:
- นับ consumption identity ครั้งเดียว
- Replay ไม่เพิ่มยอด
- Physical Retry ใหม่เพิ่ม usage ได้เมื่อมีหลักฐาน
- Parent/Helper overlap ที่พิสูจน์ไม่ได้ต้องแสดง uncertainty
- Cached Input Tokens ต้องไม่ถูกนับซ้ำ
- Correction เช่น 18,569 → 37,055 ต้องแสดง final 37,055 เพียงครั้งเดียวพร้อม history
- แยก Reservation Estimate, Measured Usage, Settled Cost/Credits และ Quota Observation
- แสดง coverage count, confidence และ unknown fields
- Task Detail, Project/SPEC และ Chat ต้อง reconcile ด้วย Projection Token เดียวกัน

แสดง Switch Timeline พร้อมเหตุผลและ Evidence โดยไม่เปลี่ยน Luna/Sol Routing Policy

## Workstream D — Runner-to-Web Observability

ตรวจเส้นทางจริง:

Runner / Agents / worker_jobs
→ Existing Events / Receipts
→ Canonical State / Projection
→ Authenticated Read API
→ Web Task Control / Agent Monitor

เริ่มจากข้อมูลที่มีอยู่ก่อน

ต้องแสดง:
- Task, Run, Attempt, Runner, Agent
- Stage / Status / Heartbeat
- Retry / Recovery / Resume
- Execution Evidence
- Last Updated / Freshness
- Source & Verification State

Runner disconnected ต้องไม่ถูกสรุปเป็น task failed โดยอัตโนมัติ

หาก evidence หายหรือหมดอายุให้แสดง STALE/UNKNOWN ตามความหมายจริง

UI/API ล่มต้องไม่กระทบ Job Execution

Projection/API ต้องรองรับ tenant isolation, permissions, secret redaction, pagination, replay และ deduplication

ไม่สร้าง scheduler, queue หรือ orchestrator ใหม่

## Workstream E — UI/UX

แยกความรับผิดชอบดังนี้:

Task Control:
- Goal Progress
- Verified Completion
- Remaining Work
- Task/Run Timeline
- Model & Usage Evidence
- Deliverable & Acceptance Evidence

Agent Monitor:
- Agent Fleet
- Agent Topology
- Agent / Runner Inspector
- Agent Activity
- Model & Resource Usage
- Recovery Monitor
- Attention Center

ทั้งสองหน้าจอใช้ Shared Read Model, Components และ Design System ร่วมกัน

รองรับ Desktop, Tablet, Mobile

บน Mobile ให้ใช้ hierarchical agent list เมื่อ Graph แสดงผลไม่เหมาะสม

Attention Center แสดงเฉพาะปัญหาที่ต้องการ Human Action จริง และต้องไม่เพิ่ม Approval Gate ใหม่

## Workstream F — Implementation

หลังแก้ SPEC และตรวจ Contract แล้ว ให้ implement เฉพาะ Minimum Viable Vertical Slice ที่ไม่แตะ Core Runtime

ลำดับความสำคัญ:

P0:
1. Goal Baseline + Verified Progress Projection
2. Runner/Job Status Read Model
3. Model Identity Provenance
4. Correct Usage Aggregation
5. Task Control Basic UI พร้อม Evidence/Freshness

P1:
6. Agent Monitor Fleet/Inspector
7. Execution & Recovery Timeline
8. Attention Center

P2:
9. Topology Graph
10. Advanced Usage Analytics, History และ Comparison

ใช้ Work Units ขนาดเล็ก ทำงานขนานเฉพาะส่วนที่ไม่มี dependency/conflicting files

หากพบความเสี่ยงที่ทำให้ SPEC-224 หยุดหรือเปลี่ยน execution authority ให้หยุดเฉพาะ Work Unit นั้น แล้วทำงานอื่นที่ไม่ถูก Block ต่อไป

## Verification

ทำ QA Review 10 มุม:
1. SPEC Ownership
2. Contract Compatibility
3. Baseline/Progress Correctness
4. Usage Deduplication
5. Model Provenance
6. Runner State Accuracy
7. Recovery & Replay
8. Tenant Security
9. UI/Chat Consistency
10. Live Integration & Non-interference

ตรวจด้วย Automated Tests และ Integration Tests ที่เหมาะสม

หากมี Authorized Runner จริง ให้ทดสอบ E2E Read Path โดยไม่รบกวน SPEC-224

หากไม่มี ให้ระบุ Live Acceptance เป็น UNVERIFIED และเก็บ Evidence/Blockers ไว้ ห้ามจำลองว่า Live ผ่านแล้ว

## Autonomy Rules

- ตัดสินใจตาม Existing Architecture และ Repository Policy
- อย่าหยุดถามเรื่องที่ตรวจสอบหรือตัดสินใจได้เอง
- Repair/Replan/Retest เมื่อพบปัญหาที่แก้เองได้
- เก็บ durable checkpoint เพื่อให้ Resume ได้
- ไม่ทำงานวนซ้ำโดยไม่มีความคืบหน้าและไม่มีหลักฐานใหม่
- ไม่เปลี่ยน Protected Runtime, Production Policy หรือข้าม Authorization
- ไม่เปลี่ยน SPEC-224 acceptance criteria เพื่อให้ผ่านง่ายขึ้น
- ไม่สร้างระบบใหม่ซ้ำกับสิ่งที่มีอยู่แล้ว

## Final Report

รายงาน:
1. SPEC ที่แก้/สร้าง พร้อมเหตุผล
2. Coverage Matrix ก่อนและหลัง
3. Implementation และ PR/Commit
4. Verified Goal Progress Coverage
5. Runner-to-Web Status Evidence
6. Model/Usage Provenance Validation
7. Automated Test Results
8. Live Acceptance Status
9. Remaining Work, Dependencies และ Blockers
10. Next Autonomous Work Units

ทุกสถานะต้องแยก:
SPECIFIED / IMPLEMENTED / TESTED / LIVE VERIFIED / BLOCKED / UNKNOWN

ห้ามสรุปว่าเสร็จสมบูรณ์เพียงเพราะ SPEC ถูกแก้หรือ PR ถูก Merge

ดำเนินงานต่อโดยอัตโนมัติตามขอบเขตและสิทธิ์ที่มี จนถึง Verified Completion หรือพบ External Authority Blocker ที่แก้เองไม่ได้