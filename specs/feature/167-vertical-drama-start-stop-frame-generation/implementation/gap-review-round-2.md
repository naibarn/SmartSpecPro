# Gap review round 2 — durable persistence and stale-task safety

ตรวจ Redis job key, tenant ownership, row-lock merge, prompt/image task state,
credit admission และ late completion หลังผู้ใช้แก้ prompt

- พบ gap: task completion เดิมไม่มี role-specific prompt revision ทำให้ผลจาก
  prompt เก่าอาจถูกผูกหลัง prompt ล่าสุดถูกแก้
- แก้แล้ว: เพิ่ม `imagePromptHash`/`stopFramePromptHash`, คืน hash จาก image
  admission และส่งเข้า `persistStartFrameImageTask` เพื่อป้องกัน stale write
- แก้แล้วก่อนหน้านี้: Redis active pointer/idempotency แยก `start` กับ `stop`,
  และ task/error state แยกช่องกัน

ผล: ผ่านรอบ persistence; ยังไม่ทำ auto-backfill หรือ auto-generate Stop.
