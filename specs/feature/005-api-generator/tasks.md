# tasks.md — 005-api-generator

Last updated: 2026-01-05

## P0 (ควรทำถ้าจะใช้งานจริง)
- [ ] เพิ่ม argument validation (spec path exists, output writable)
- [ ] เพิ่มโหมด `--dry-run` (แสดงไฟล์ที่จะสร้าง)
- [ ] เพิ่ม behavior `--force` / ป้องกัน overwrite โดย default
- [ ] ทำ error report ของ parser (บอก section/subsection ที่พัง)

## P1 (คุณภาพ/ความครอบคลุม)
- [ ] เพิ่ม unit tests สำหรับ constraints หลายรูปแบบ (required/unique/max/min/pattern/default/enum)
- [ ] เพิ่ม template tests ให้ validate output snapshot
- [ ] สร้าง “spec grammar” section ใน README แบบตัวอย่างครบ

## P2 (การเชื่อมกับ SmartSpec)
- [ ] เพิ่ม adapter workflow step: `run_api_generator(spec_md, output_dir)`
- [ ] ส่งผลลัพธ์เป็น JSON summary (created/updated/skipped/warnings)
