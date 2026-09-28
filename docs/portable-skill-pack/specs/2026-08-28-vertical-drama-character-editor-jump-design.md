# Vertical Drama Character Editor Jump Action

## Goal

ช่วยให้ user เปิดส่วน `สร้างหรือแก้ไขภาพตัวละคร` ของตัวละครที่ต้องการได้ทันทีจากการ์ดตัวละคร โดยไม่ต้องเลือกการ์ดแล้วเลื่อนหาส่วนแก้ไขเอง

## Design

- เพิ่มปุ่มข้อความ `ไปยัง สร้างและแก้ไขตัวละคร` ในการ์ดตัวละครแต่ละใบ บริเวณ action ของการ์ด
- เมื่อกดปุ่ม ให้เลือกตัวละครนั้นด้วย `setSelectedCharacterId`, ตั้งค่า disclosure ของตัวละครนั้นเป็น expanded และเลื่อนไปยัง section เป้าหมายที่มี id คงที่ด้วย `scrollIntoView` แบบ smooth
- หยุด propagation ของ click จากปุ่ม เพื่อไม่ให้ action ซ้ำกับ click handler ของการ์ด
- ใช้ `aria-label` และ `data-testid` เพื่อรองรับ keyboard/screen reader และการทดสอบ
- ปุ่มไม่แสดงในโหมด read-only ซึ่งไม่สามารถแก้ไขภาพตัวละครได้

## Scope and safety

การเปลี่ยนแปลงอยู่ใน client component และชุดเทสต์เท่านั้น ไม่มีการเปลี่ยน API, database, billing หรือ provider flow การเลือกตัวละครและ disclosure ที่มีอยู่เดิมยังคงทำงานเหมือนเดิม เพิ่ม id คงที่ให้ section เป้าหมายและให้ปุ่มใช้ id เดียวกัน เพื่อไม่สร้าง duplicate navigation state

## Verification

- ทดสอบว่า click ปุ่มเลือก character id ที่ถูกต้อง
- ทดสอบว่าเปิด disclosure ของตัวละครนั้น
- ทดสอบว่าเรียก `scrollIntoView` ด้วย target section
- รันเทสต์ character panel ที่เกี่ยวข้องและ `git diff --check`
