# plan.md — 005-api-generator

Last updated: 2026-01-05

## Goal
ทำให้ `api-generator/` เป็นเครื่องมือที่ “เชื่อถือได้พอ” สำหรับสร้าง scaffold API จาก Markdown spec และนำไปใช้ใน workflow ของ SmartSpec ได้

## Plan (incremental)
1) **Stabilize CLI & I/O**
   - ตรวจ argument validation, path handling, overwrite behavior
   - เพิ่ม `--dry-run`, `--force`, `--verbose`

2) **Harden Spec Grammar**
   - เขียน README grammar ชัดเจน (หัวข้อ/รูปแบบ bullet ที่รองรับ)
   - เพิ่ม parser error messages ที่บอกจุดผิด (line/section)

3) **Improve Templates**
   - แยก base template สำหรับ CRUD patterns
   - เพิ่ม tests ให้ครอบคลุม entity/field/constraint variants

4) **Integration (optional)**
   - ผูกเข้ากับ `.smartspec/workflows` ในฐานะ “generator step” (เรียกผ่าน Node)
   - ส่ง output report (files created, warnings)

## Out of scope (ตอนนี้)
- Generator สำหรับ DB migration จริง
- Full auth/security scaffolding ระดับ production
