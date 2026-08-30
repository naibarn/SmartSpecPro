# Gap review round 1 — semantic role correctness

ตรวจ `verticalDramaFrameRoles.ts`, skill contract, prompt executor และ router
เทียบกับตัวอย่าง Thanwa ที่ผู้ใช้ให้

- พบ gap: ขอ Stop prompt ได้แม้ไม่มี Start prompt ทำให้ continuity anchor ไม่ครบ
- แก้แล้ว: `executeShotStartFramePromptJob` ปฏิเสธ Stop เมื่อ frame ไม่มี
  `imagePrompt` ด้วย `PRECONDITION_FAILED`
- ตรวจซ้ำ: Stop ใช้ synopsis เป็นลำดับเหตุการณ์, ใช้ Start prompt เป็น context,
  และไม่เขียน Stop ลง `imagePrompt`

ผล: ผ่านรอบ semantic contract; legacy Start v1 ยังรองรับตาม compatibility rule.
