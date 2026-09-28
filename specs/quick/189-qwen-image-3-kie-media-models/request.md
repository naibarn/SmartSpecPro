# Request

## Original request

เพิ่ม media model Qwen Image 3 จาก Kie.ai โดยแยกเป็น 2 ชุด และตรวจว่ามีภาพแนบหรือไม่:

- ชุด Pro: `qwen3/pro-text-to-image` / `qwen3/pro-image-to-image`
- ชุด Standard: `qwen3/text-to-image` / `qwen3/image-to-image`

ไม่มีภาพแนบให้ใช้ text-to-image; มีภาพแนบให้ใช้ image-to-image. ผู้ใช้สั่งให้ทำต่อจนจบและ migrate ให้เรียบร้อยโดยไม่ต้องยืนยันเพิ่มเติม

## Assumptions

- แสดงเป็น 2 catalog rows ไม่ใช่ 4 rows; แต่ละ row ใช้ T2I เป็น canonical ID และเก็บ I2I เป็น reference variant ตาม pattern GPT Image 2.5 ใน repo
- ใช้ `image_urls` ตาม Kie Qwen3 contract และจำกัด reference images สูงสุด 3 รายการ
- ใช้ราคา SmartAIHub เบื้องต้น 30 credits ที่ 1K และ 50 credits ที่ 2K ทั้ง Pro และ Standard; ไม่มี reference surcharge แยก
- ใช้ generic Kie provider routing/upload/polling ที่มีอยู่แล้ว ไม่ส่ง task จริงไป Kie.ai
- migrate ไปยัง PostgreSQL ที่ `DATABASE_URL` ใน `apps/web/.env` หลังตรวจ migration head และรัน focused verification

## Non-goals

- ไม่เปลี่ยน provider authentication, tenant authorization, credit ledger, polling หรือ callback behavior
- ไม่เพิ่ม UI mode selector แยกสำหรับ T2I/I2I
- ไม่ deploy หรือทำ live paid generation
