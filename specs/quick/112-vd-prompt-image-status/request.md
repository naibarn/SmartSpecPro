# Request

## Original request

เมื่อกด `สร้าง prompt + ภาพ` ภาพแสดงผลไม่ครบ/ไม่ชัดเจนว่า generation จบจริง
หรือเป็นปัญหา UI ต้องแสดงสถานะให้ user ทราบว่า prompt สำเร็จแล้วหรือไม่,
image generation อยู่ขั้นไหน, ถ้าภาพไม่ผ่านเกิดจากอะไร และควรสร้างภาพใหม่,
สร้าง prompt ใหม่ หรือทำอย่างไรต่อ

## Approved direction

แก้เฉพาะ Vertical Drama storyboard ด้วยสถานะภาพที่แยก generation, prompt-ready,
provider failure, sync failure, browser loading และ browser error โดยไม่เปลี่ยน
prompt/provider payloads และไม่เพิ่ม migration

## Constraints and assumptions

- Preserve unrelated dirty worktree changes.
- Reuse the existing prompt job, image task polling, Media History, and
  render-only `reauthor = false` path.
- Persist terminal image failures, including failures before a provider task id
  exists, in the existing JSONB frame task state.
- No paid provider call or deployment is run during implementation.
