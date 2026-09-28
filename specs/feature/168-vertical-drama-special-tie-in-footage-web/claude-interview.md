# Interview transcript — Feature 168

ไม่มีคำถามค้างจาก stakeholder เพราะ requirements ถูกยืนยันต่อเนื่องในบทสนทนาและระบุให้ทำต่อโดยไม่รอยืนยัน

## Q1 — รูปแบบผลลัพธ์

คำตอบ: ต้องเป็นเรื่องละครซีรีย์ที่มีเหตุการณ์ต่อเนื่อง ภาษามนุษย์อ่านเข้าใจง่าย มีการ Tie-in แบบเนียน ไม่ใช่ยืนรีวิวสินค้า และต้องแยก prose เรื่องกับบทพูด/การแสดงให้แก้ไขได้ก่อนแตกเป็น 9 ช็อต

## Q2 — footage จริงและ AI B-roll

คำตอบ: ให้ upload footage ก่อน, วิเคราะห์ด้วย ffprobe/Transcription, ตัด dead air/trim อย่างปลอดภัยใน Worker, ตรวจ prepared footage ก่อน จากนั้นวาง Tie-in แบบไม่มีบทพูดใหม่และกำหนดวินาทีเริ่ม AI B-roll เอง

## Q3 — continuity และตัวละคร

คำตอบ: ใช้เฉพาะตัวละครที่เลือก, ยึด DNA/ความสัมพันธ์, ถ้าต้องใช้ลุคหรือสถานที่ใหม่ให้เสนอ slot เพิ่มใน tab ตัวละคร/ฉากโดยไม่แก้ข้อมูลเดิมอัตโนมัติ

## Auto-Decisions

- ใช้ Zod/shared contract และรูปแบบ tRPC/บริการเดิมของ repository
- ใช้ Server DB เป็น authoritative job/credit state; Redis เป็น cache ได้เท่านั้น
- ใช้ Remotion `GenericTemplate` video layers เป็น executor ของ B-roll route ใน feature นี้
- ใช้ direct-to-managed-storage และ Worker-side media processing เพื่อไม่แบก CPU/RAM บน Server
