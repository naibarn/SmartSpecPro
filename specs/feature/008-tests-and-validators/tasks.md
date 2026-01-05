# tasks.md — 008-tests-and-validators

Last updated: 2026-01-05

## P0
- [ ] เพิ่ม README สั้น ๆ ใน `tests/` ว่าต้องรันจากไหนและต้องมีอะไรบ้าง
- [ ] แยก marker `unit` / `integration` เพื่อเลือกชุดที่รันได้เร็ว
- [ ] ทำให้ import path เสถียร (ลด sys.path insert)

## P1
- [ ] เพิ่ม test cases สำหรับ `test-validators/` (validate + autofix) แบบ table-driven
- [ ] เพิ่ม stress test สำหรับ `huge.md` (ต้องไม่ crash/timeout ง่าย)

## P2
- [ ] เพิ่ม coverage report และ baseline ใน CI
