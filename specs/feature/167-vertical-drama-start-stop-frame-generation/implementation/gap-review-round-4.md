# Gap review round 4 — UI and user control

ตรวจ storyboard card, prompt editor, media picker, responsive layout และ
credit-spend affordances

- ยืนยันว่า control ของ Start เดิมยังใช้ชื่อ/test id/flow เดิม
- เพิ่ม slot Stop แบบ optional พร้อมสถานะไม่มีภาพ, stale, processing, failed
  และปุ่มเลือกภาพจาก authorized picker
- เพิ่มปุ่มแยก `สร้าง Stop Frame prompt` และ `สร้างภาพ` โดยปุ่มสร้างภาพแสดง
  ต่อเมื่อมี Stop prompt และมี credit confirmation; การเลือกภาพเดิมไม่เสียเครดิต
- เพิ่ม fallback workspace forwarding เพื่อไม่ให้ UI surface ใดเสีย callback

ผล: ผ่านรอบ UI contract; Stop ไม่ถูก auto-generate และไม่มีการบังคับให้ทุก
provider ใช้ Stop frame.
