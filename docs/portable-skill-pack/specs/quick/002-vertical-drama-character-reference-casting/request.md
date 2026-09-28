# Request

เพิ่ม reference-guided casting ในหน้า Drama Series Characters โดยใช้ admin skill `character-candidate-prompt` เมื่อผู้ใช้มีภาพอ้างอิง ให้ user เลือกจำนวนภาพ 1–5, lock เสื้อผ้า, pose, camera framing และกรอกรายละเอียดเพิ่มเติมได้แบบ optional จากนั้นสร้าง candidate images แยกภาพและให้เลือกภาพหลักหรือ generate ใหม่ได้

## Constraints

- scope เฉพาะ character casting
- ไม่มีภาพอ้างอิงต้องใช้ flow เดิม
- ภาพอ้างอิงเป็น guideline ไม่ใช่การ clone บุคคล
- skill คืน plain text; ต้อง reuse existing candidate generation/polling/selection
- เก็บการเปลี่ยนแปลงแบบ minimal และ preserve dirty worktree

## Assumptions

- ส่ง reference assets ที่แนบไว้ทั้งหมด สูงสุด 6 รายการ
- ใช้ authoritative character facts จาก server สำหรับ gender, ethnicity, age และ role
- default: lock clothing false, pose auto_natural, camera half_body
- custom framing ไม่เปิดเป็น text field เพราะ option หลักต้องเลือกได้โดยไม่ต้องพิมพ์; free text ใช้เฉพาะ additional instructions

## Non-goals

- ไม่ปรับ Visual Bible generation ของ flow ที่ไม่มี reference
- ไม่เปลี่ยน look, sheet, storyboard, variant/twin หรือ downstream character rendering
- ไม่เพิ่ม migration; ใช้ JSON metadata ที่มีอยู่โดยเพิ่ม optional fields
