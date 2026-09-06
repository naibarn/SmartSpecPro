# Request

## Original request

ปรับปรุงระบบแฝดให้ตัวละครเดิมมีความสัมพันธ์กันแบบแฝดอย่างชัดเจนใน Characters tab
และ DNA ใช้ใบหน้า/อายุร่วมกัน แต่ยังแยกเสื้อผ้า ทรงผม และนิสัยได้ ในหน้า episode
ให้เห็นแฝดเป็นคนละตัวและใช้ flow เดิม แต่ตอนสร้าง prompt/ภาพต้องโหลดข้อมูลตัวละคร
ล่าสุดแล้วสร้างให้ใบหน้าและวัยเหมือนกันจริง แก้ข้อมูลเดิมของภูมิ-ภาคิน และทำให้จบ
โดยไม่ต้องรอยืนยันระหว่างขั้นตอน

## Assumptions

- ใช้ `sharesFaceWithCharacterId` เป็น compatibility source of truth ไม่เพิ่มตารางใหม่
- ซิงก์ shared face/age fields เข้า visual-bible DNA ของทั้งคู่ พร้อม provenance
- ไม่สร้าง media อัตโนมัติและไม่ใช้เครดิตระหว่าง repair/validation
- character keys และ episode shot controls ต้องคงเดิม

## Explicit non-goals

- ไม่ merge ตัวละครให้เหลือแถวเดียว
- ไม่เปลี่ยนรูปแบบการเลือกตัวละครใน episode
- ไม่ backfill ตัวละครที่คลุมเครือเกินกว่าจะระบุเป็นคู่ได้
