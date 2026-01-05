# tasks.md

## [WF-SCRIPTS-001] Tasks

### A) Terminology & Identity
- WF-SCRIPTS-001-TASK-001: กำหนดนิยาม `workflow_key` (filename sans `.md`) และ `workflow_slug` (frontmatter `workflow:`)
- WF-SCRIPTS-001-TASK-002: ระบุรูปแบบ chat command ต่อ platform โดยชัดเจน โดยเฉพาะ **Kilo = `/{workflow_key}.md`**
- WF-SCRIPTS-001-TASK-003: กำหนด guideline สำหรับ Production: `workflow_slug SHOULD == "/" + workflow_key`

### B) Classification
- WF-SCRIPTS-001-TASK-004: กำหนด workflow types: Production | Chat/Router | Doc-only | System artifacts
- WF-SCRIPTS-001-TASK-005: กำหนด heuristic การจำแนกไฟล์ (frontmatter, prefix เช่น `smartspec_`/`autopilot_`, suffix เช่น `_REQUIREMENTS.md`)
- WF-SCRIPTS-001-TASK-006: กำหนดรายการ ignore patterns (เช่น `*:Zone.Identifier`, `.DS_Store`, `Thumbs.db`, `~$*`)

### C) Standards & Templates
- WF-SCRIPTS-001-TASK-007: ระบุ Production template: frontmatter required + sections required + examples ที่ใช้ Kilo command
- WF-SCRIPTS-001-TASK-008: ระบุ Chat/Router minimum template (ไม่บังคับ frontmatter)
- WF-SCRIPTS-001-TASK-009: ระบุ Doc-only guideline (ต้องไม่ถูก index เป็น command)

### D) Validation Rules
- WF-SCRIPTS-001-TASK-010: ระบุ Strict ruleset สำหรับ Production (frontmatter + required sections + examples)
- WF-SCRIPTS-001-TASK-011: ระบุ Lenient ruleset สำหรับ Chat/Router (ไม่ fail repo)
- WF-SCRIPTS-001-TASK-012: ระบุ Doc-only ruleset (lint ขั้นต่ำ + warning ได้)
- WF-SCRIPTS-001-TASK-013: ระบุ Ignore ruleset สำหรับ artifacts

### E) Index & Reference
- WF-SCRIPTS-001-TASK-014: ระบุฟิลด์/รูปแบบของ `.smartspec/workflows/WORKFLOWS_INDEX.md`
- WF-SCRIPTS-001-TASK-015: ระบุว่าต้องแยก Doc-only ออกจาก command list ใน index
- WF-SCRIPTS-001-TASK-016: ระบุฟิลด์/รูปแบบของ `.smartspec/scripts/SCRIPTS_INDEX.md`

### F) Documentation
- WF-SCRIPTS-001-TASK-017: เขียนคู่มือสั้น “How to add a Production workflow” (รวม Kilo command และ slug rule)
- WF-SCRIPTS-001-TASK-018: เขียนคู่มือสั้น “How to add a Chat/Router workflow”
- WF-SCRIPTS-001-TASK-019: เขียนคู่มือสั้น “How to add a script” (รวม `--help`/`--dry-run`)

### G) Tests (แนะนำ)
- WF-SCRIPTS-001-TASK-020: เพิ่ม fixtures สำหรับ Production/Chat/Doc-only/System artifacts เพื่อทดสอบ classifier
- WF-SCRIPTS-001-TASK-021: เพิ่ม unit tests สำหรับ validator ruleset แยกตามประเภท
- WF-SCRIPTS-001-TASK-022: เพิ่ม test สำหรับ index generation ให้ deterministic (order/ignore patterns)

