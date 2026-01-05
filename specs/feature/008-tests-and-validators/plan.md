# plan.md — 008-tests-and-validators

Last updated: 2026-01-05

## Goal
ให้ test suite เป็น “สัญญาคุณภาพ” ของ autopilot/workflow engine และลด regression

## Plan
1) **Stabilize test imports**
   - ลด reliance ต่อ sys.path hack: ทำให้ `.smartspec` เป็น installable package หรือใช้ editable install

2) **Improve fixtures**
   - จัดหมวด fixtures (spec/plan/tasks/tests) และเพิ่ม README อธิบายแต่ละไฟล์

3) **Coverage for failure modes**
   - เพิ่ม tests สำหรับ invalid markdown, partial fix, huge file handling
   - เพิ่ม tests สำหรับ cancellation/resume ใน integration

4) **CI**
   - เพิ่ม job ที่รัน pytest และรายงาน coverage
