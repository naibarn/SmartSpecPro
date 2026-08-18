# Request

## Original request

เพิ่มหน้าปกสำรองให้ตอนมีหน้าปก 4 แบบ แสดงเป็น slot เรียงกัน แต่ละ slot มีปุ่มสร้างแยกกัน ผู้ใช้กดสร้าง slot ใดก็ได้ ระบบสุ่มชุดภาพอ้างอิงให้แตกต่างกัน เช่น 1, 2, 3 ภาพ และให้การสร้างตัวอย่างซีรีย์สุ่มใช้หน้าปกคนละแบบเมื่อมีหลายแบบ หรือสุ่มวนแบบที่มีเมื่อจำนวนปกน้อยกว่า นอกจากนี้ตรวจสอบและแก้ปัญหาที่สร้างตัวอย่างซีรีย์ไม่ได้

## Confirmed behavior

- Four independent cover slots are visible on the episode page.
- Each slot can be generated/retried independently and does not replace another slot.
- Server-selected cover references vary by slot/generation attempt.
- Preview slots persist the cover variant they use; they prefer unused ready covers and reuse a ready cover when fewer covers exist.
- Existing single-cover episodes remain usable.
- The observed preview failure is a worker-side 404 for protected `/api/storage/files/media-jobs/assets/...` URLs.

## Scope

- Shared cover JSONB compatibility helpers and variant selection.
- Episode cover generation/status/upload router contracts.
- Preview cover assignment and preview-state persistence.
- Remotion worker-facing broker URL resolution for preview assets.
- Cover-slot UI and focused tests.

## Non-goals

- Generating all four covers in one click.
- Reworking the media provider catalog or Remotion renderer itself.
- Deleting or migrating existing cover data destructively.
- Changing preview shot selection semantics.
