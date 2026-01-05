# plan.md

## Plan for WF-SCRIPTS-001

เป้าหมาย: ทำให้ “สเปค/มาตรฐาน” สอดคล้องกับของจริงใน `.smartspec/workflows/` ซึ่งมีทั้ง production workflows, chat/legacy workflows และ doc-only/requirements โดยไม่ทำให้ validator/index ไปทำลายของเดิม

---

## Phase 1: Clarify terminology & identity (Must)
**Deliverables**
- นิยาม `workflow_key` (ชื่อไฟล์) และ `workflow_slug` (frontmatter `workflow:`)
- นิยามรูปแบบคำสั่งใน chat ของแต่ละ platform โดยเฉพาะ **Kilo = `/{workflow_key}.md`**
- กติกาแนะนำสำหรับ Production: `workflow_slug == "/" + workflow_key`

---

## Phase 2: Classification model (Must)
**Deliverables**
- กำหนด workflow types:
  - Production (Strict)
  - Chat/Router (Lenient)
  - Doc-only/Requirements (Doc-only)
  - System artifacts (Ignore)
- กำหนด heuristic การจำแนกไฟล์ (frontmatter + filename pattern + suffix)

---

## Phase 3: Standards & templates (Should)
**Deliverables**
- Production workflow template (frontmatter + sections + Examples ที่ใช้ Kilo command)
- Minimal template สำหรับ Chat/Router workflow (เน้นใช้จริงใน chat)
- Guideline สำหรับ Doc-only เพื่อกันถูก index เป็น command โดยไม่ตั้งใจ

---

## Phase 4: Validation behavior (Must)
**Deliverables**
- ระบุ ruleset ต่อประเภท และกำหนดว่า:
  - Strict ใช้กับ Production เท่านั้น
  - Lenient/Doc-only ต้องไม่ทำ CI fail
- ระบุรายการไฟล์ที่ต้อง ignore เสมอ (เช่น `*:Zone.Identifier`)

---

## Phase 5: Index/reference generation (Should)
**Deliverables**
- ระบุรูปแบบและฟิลด์ของ `WORKFLOWS_INDEX.md`
- ระบุว่า Doc-only ต้องอยู่คนละ section จาก command list
- ระบุรูปแบบ `SCRIPTS_INDEX.md` สำหรับ `.smartspec/scripts/`

---

## Phase 6: Tests & maintenance (Optional but recommended)
**Deliverables**
- เพิ่ม fixtures เพื่อทดสอบการจำแนกประเภทและ validator ruleset
- เพิ่ม check ใน CI/pre-commit (ถ้ามี) ให้ consistent โดยไม่ทำให้ legacy/doc-only ล้ม

