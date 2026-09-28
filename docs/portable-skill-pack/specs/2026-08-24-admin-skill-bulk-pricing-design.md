# Admin Skills Bulk Pricing Editor

สถานะ: Approved for implementation by user on 2026-08-24

## เป้าหมาย

ให้ Admin เห็นและแก้ `tenantCreditCost` กับ `skillOwnerCreditCost` จากรายการ Skills หลักได้โดยไม่ต้องเปิด modal ทีละรายการ แม้มีรายการหลักร้อยรายการ

## Design

- ตารางเพิ่ม selection checkbox ต่อแถวและ checkbox ที่หัวตารางสำหรับเลือกทุกรายการที่แสดงตาม filter ปัจจุบัน
- ช่องเครดิตในแต่ละแถวเป็น inline numeric input; ค่าแก้ไขจะค้างเป็น draft จนกดบันทึก
- แถบ bulk editor ใช้กำหนดค่าซ้ำให้รายการที่เลือก ช่องว่างหมายถึงไม่แก้ field นั้น
- ปุ่มบันทึกส่งเฉพาะแถว/field ที่เปลี่ยนผ่าน `skills.bulkUpdatePricing` ครั้งเดียว จำกัดไม่เกิน 500 skills และใช้ `adminProcedure`
- Backend ตรวจ integer/non-negative/max และอัปเดตใน transaction เดียวด้วย SQL CASE เพื่อรองรับค่าต่างกันต่อแถวโดยไม่ยิง mutation ทีละรายการ
- เมื่อสำเร็จ invalidate รายการ, ล้าง draft/selection และแสดงจำนวนที่แก้; เมื่อผิดพลาดคง draft ไว้ให้ retry
- รายการที่หายไประหว่างแก้ไขจะไม่ทำให้รายการอื่น rollback แต่ response ต้องรายงานจำนวนที่แก้จริง

## Safety and UX

- ค่าเดิมไม่ถูกเขียนซ้ำถ้าไม่มีการเปลี่ยนแปลง
- ไม่อนุญาต payload ว่างหรือเกิน 500 รายการ
- ใช้ focus ring/label/aria-label กับ checkbox และ input; ตารางยัง scroll แนวนอนได้บนจอแคบ
- Modal แก้ไขราย skill เดิมยังคงทำงานต่อได้

## Verification

- Router tests: admin authorization, input validation, per-row values, transaction update result
- UI tests: select all, bulk apply, dirty inline values, save mutation payload, error keeps drafts
- Run `git diff --check` และ focused Vitest suites
