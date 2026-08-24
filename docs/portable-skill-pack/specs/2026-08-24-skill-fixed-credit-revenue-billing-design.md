# Skill Fixed-Credit Revenue Billing Design

## Objective

กำหนดราคาการ run skill แบบเครดิตตายตัวต่อหนึ่ง run และกระจายเครดิตที่ user จ่ายให้เจ้าของ Tenant กับเจ้าของ Skill ทันทีเมื่อ run สำเร็จ โดยใช้ ledger ที่ idempotent และ reverse ได้เมื่อ operation ถูก refund.

## Approved contract

- ทุก skill มี `tenantCreditCost` และ `skillOwnerCreditCost` เป็นจำนวนเต็มไม่ติดลบ
- ค่าเริ่มต้นของ skill ใหม่และ skill ที่ sync จาก folder คือ `tenantCreditCost=2`, `skillOwnerCreditCost=0`
- เครดิตที่ user จ่ายต่อ run คือผลรวมของสองค่า
- `tenants.ownerId` เป็น tenant revenue owner; `skills.createdBy` เป็น skill revenue owner
- ระบบไม่เดา owner ที่หายไปเอง; run ที่ไม่มี settlement owner ที่ resolve ได้ต้อง fail closed ก่อน charge
- หลัง run สำเร็จ: หัก user หนึ่งรายการ และเพิ่มเครดิตให้ recipient ตาม split ใน settlement เดียวกัน
- ถ้า recipient เดียวกัน ให้รวมยอดเป็นรายการเพิ่มเดียว
- ทุก entry ใช้ run-scoped idempotency key; retry ไม่หักหรือเพิ่มซ้ำ
- refund ต้องตรวจว่า auto-refund ของ run นั้นถูกทำแล้วหรือยัง แล้ว reverse user charge และ revenue credits ครั้งเดียว
- revenue reversal อนุญาตให้ยอด recipient ติดลบได้ เพื่อรักษาความถูกต้องของ double-entry settlement
- user credit history แสดง user charge เป็นรายการ run skill เดียว โดยรายละเอียด split อยู่ใน metadata ไม่สร้างรายการหักแยก

## Scope

1. DB columns/defaults and migration.
2. Folder/database registry synchronization and admin skill CRUD.
3. Central settlement/refund service and integration with skill execution paths without double charging.
4. Admin skill pricing display/edit.
5. User credit history metadata and focused tests.

## Non-goals

- ไม่ลบหรือรวม skill ที่มีอยู่
- ไม่เปลี่ยนสิทธิ์ RBAC ของ admin
- ไม่ยกเลิก model pricing สำหรับ non-skill operations
- ไม่ deploy หรือแก้ข้อมูล production ในงานนี้

## Acceptance criteria

- ทุก row ใน skill registry มีค่า fixed-credit ที่ใช้ได้และหน้า admin แสดงตรงกับ DB
- default ใหม่เป็น 2/0 และ admin แก้เฉพาะ skill ได้ทันที
- success settlement หัก user รวมครั้งเดียวและเพิ่ม recipient ตาม split แบบ atomic/idempotent
- auto-refund ไม่ทำให้เกิด revenue ค้างหรือคืนซ้ำ
- credit history ของ user แสดงรายการ run skill ที่มียอดหักรวมและชื่อ skillชัดเจน
- focused tests ผ่าน และมีหลักฐานตรวจ 5 รอบแยกเป็น registry, config, success, refund, UI/history
