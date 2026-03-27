# Interview — AI Agency Creator Intelligence Upgrade

## Q1: Memory Reuse — ดึง memories จาก agencies เก่ามาช่วยออกแบบ?
**A: ดึง memories มาช่วย (Recommended)**

LLM จะดึง strategy_success/failure จาก agencies เก่าที่คล้ายกัน มาเป็น context ในการออกแบบ agency ใหม่ให้ดีขึ้น

## Q2: Suggestions — แสดง improvement suggestions อย่างไร?
**A: แสดงทันทีหลังสร้าง (Recommended)**

หลังสร้างเสร็จ แสดง 3-5 suggestions เช่น 'เพิ่ม QA node', 'เปิด computer use สำหรับ Designer' ให้ user กด Apply/Skip

## Q3: Templates — รองรับ agency templates?
**A: ใช่ เพิ่มด้วย**

เพิ่มปุ่ม 'Save as Template' หลังสร้าง agency ที่ได้คะแนนดี ให้คนอื่นใช้ได้

## สรุปแนวทาง

1. **LLM-Driven Design**: User ระบุแค่สิ่งที่ต้องการ → LLM คิดทุกอย่างเอง
2. **Memory-Informed**: ดึง learnings จาก agencies เก่าที่คล้ายกันมาช่วยออกแบบ
3. **Post-Creation Suggestions**: แสดง optional upgrades ทันทีหลังสร้างเสร็จ
4. **Template System**: Save as template สำหรับ agencies ที่ดี
5. **Self-Review Loop**: LLM ตรวจ spec ตัวเอง 2-3 รอบก่อน implement
6. **No Technical Interview**: ไม่ถาม user เรื่องเทคนิค — LLM ตัดสินใจทั้งหมด
