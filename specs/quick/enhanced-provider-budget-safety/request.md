# Request

แก้ปัญหา Enhanced Video Prompt ที่ OpenRouter ตอบ HTTP 402 เพราะ request ไม่มี
output-token limit ทำให้ SDK ขอสูงสุด 65,536 tokens พร้อมปรับปรุง provider
routing, error sanitization และ regression protection ให้จบโดยไม่ใช้เครดิตจริง

## Assumptions

- ผู้ใช้อนุมัติแนวทาง bounded per-stage output tokens, provider route metadata,
  safe errors และ focused regression tests แล้ว
- ใช้ Agents SDK 0.22.x ที่ติดตั้งใน isolated skill runtime
- ไม่แก้ไฟล์ dirty ที่ไม่เกี่ยวข้องและไม่ deploy/restart production

## Non-goals

- ไม่เพิ่มเครดิต OpenRouter
- ไม่ retry provider จริง
- ไม่เปลี่ยน schema/database หรือ paid video submission
