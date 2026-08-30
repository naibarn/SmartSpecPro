# Optional Credit Panels Design

## Objective

ทำให้ panel “สรุปการใช้งานตามงาน” และ “OCR Usage Overview” เป็น disclosure แยกกัน เริ่มต้นยุบ และเปิด/ปิดได้อิสระ เพื่อให้ประวัติธุรกรรมเครดิตยังเป็นเนื้อหาหลักของหน้า

## Behavior

- แต่ละ panel มี state ของตัวเองและ default เป็น `false`
- title/header เป็นปุ่ม keyboard-accessible พร้อม `aria-expanded` และ `aria-controls`
- เปิด panel หนึ่งไม่เปลี่ยน state ของอีก panel
- เนื้อหาภายในไม่ render และ query ที่มีค่าใช้จ่ายจะ disabled ขณะ panel ยุบ
- context export action แสดงเฉพาะเมื่อ context panel เปิด
- ไม่มีการเปลี่ยน server/API/schema; เมื่อเปิดจะใช้ query contract เดิม

## Acceptance

1. เปิดหน้า Credits แล้ว panel ทั้งสองยุบ
2. กด title ของ panel ใด panel หนึ่งแล้วแสดงเฉพาะเนื้อหาของ panel นั้น
3. กดซ้ำแล้วซ่อนเนื้อหาและหยุด query ของ panel นั้น
4. ทั้งสอง panel ใช้งานแยกกันและไม่กระทบ transaction history filters/summary
5. Thai/English copy และ keyboard/accessibility state ถูกต้อง

## Verification

- production build
- focused helper/service regression tests remain green
- manual code review for independent state, conditional rendering, query enabled flags, and `aria-expanded`
