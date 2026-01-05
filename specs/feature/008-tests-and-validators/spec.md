# spec.md — 008-tests-and-validators (QA Harness + Markdown Fixtures)

Spec ID: **SSP-TESTS-008**  
Spec folder: `specs/feature/008-tests-and-validators/`  
Code boundary (current): `tests/`, `test-validators/`  
Last updated: 2026-01-05

---

## 1) Purpose
โฟลเดอร์ `tests/` และ `test-validators/` ทำหน้าที่เป็น “คุณภาพและความถูกต้อง” สำหรับระบบ SmartSpec/Autopilot โดยเฉพาะ:
- Unit tests สำหรับโมดูลใน `.smartspec/ss_autopilot/*`
- Integration tests ที่จำลอง workflow end-to-end ในระดับ agent/orchestrator
- ชุดไฟล์ markdown fixtures (`test-validators/*.md`) เพื่อทดสอบการ validate/autofix spec/plan/tests format

---

## 2) Current Capabilities (Reverse engineered)
### 2.1 Unit tests (ss_autopilot)
โฟลเดอร์: `tests/ss_autopilot/`
ครอบคลุมโมดูลเช่น:
- caching / logging / error handling
- input validator / schema validator
- rate limiter / performance profiler
- agent wrapper

หมายเหตุ: tests ใช้การ `sys.path.insert(..., '.smartspec')` เพื่อ import `ss_autopilot.*`

### 2.2 Integration tests (workflow simulation)
โฟลเดอร์: `tests/integration/`
- `test_workflow_integration.py` จำลอง flow:
  - intent parsing → workflow catalog → checkpoint save/load → parallel execution
- ใช้ helper `unwrap_result()` เพื่อรองรับ decorator ที่คืนค่าแบบ `{"success": True, "result": ...}`

### 2.3 Validator Fixtures
โฟลเดอร์: `test-validators/`
มีไฟล์ตัวอย่าง เช่น:
- `sample-spec-from-prompt.md` / `sample-spec-from-prompt-fixed.md`
- `sample-plan.md`, `sample-tests.md`, `sample-tech-spec.md`
- `test-autofix.md`, `huge.md`

จุดประสงค์: เป็น input สำหรับตรวจการ validate รูปแบบ markdown และตรวจ autofix behavior

---

## 3) Non-goals
- ไม่ใช่ e2e tests ของ UI (desktop/web)
- ไม่ใช่ performance benchmark เต็มรูปแบบ (เป็น unit/integration ระดับ logic)

---

## 4) How to run (โดยรวม)
- รันจาก root:
  - `pytest -q`
- ถ้า test ต้องการ dependency เพิ่ม (เช่น redis/db) ควรระบุใน docs (ยังไม่ enforce ใน spec นี้)

---

## 5) Acceptance Criteria
- เอกสารนี้บอกได้ว่า tests ครอบคลุมอะไร, อิงโมดูลไหน, และ fixtures ใช้เพื่ออะไร
- ระบุ path dependency `.smartspec/ss_autopilot` ชัดเจน (เพราะ tests import จากที่นั่น)
- แยก unit vs integration vs fixtures ให้ชัด

---

## 6) Key Files
- `tests/conftest.py` — shared fixtures
- `tests/ss_autopilot/*` — unit tests
- `tests/integration/test_workflow_integration.py` — integration flow
- `test-validators/*.md` — markdown fixtures
