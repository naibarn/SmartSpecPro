---

aliases:
  - "admin-billing-phase2-runbook"
  - "คู่มือดูแล Billing Phase 2"
  - "คู่มือดูแล Billing Phase 2 help"
tags:
  - "help"
  - "help/th"
  - "help/admin"
  - "admin"
  - "admin-billing-phase2-runbook"
---
# คู่มือดูแล Billing Phase 2

## ขอบเขต

คู่มือนี้ครอบคลุม saved cards, auto-renew, retry scheduling, การ pause/resume dunning, manual fallback และการ revoke payment method

## จุดตรวจหลัก

- ตรวจ renewal mode และ rollout cohort ของ subscription
- ตรวจว่า default payment method ยัง active และใช้ auto-renew ได้
- ดู renewal attempt ล่าสุดและวัน retry ถัดไป
- ดู payment timeline, webhook events และ reconciliation history ของ invoice

## การปฏิบัติงานทั่วไป

- pause dunning เมื่อผลจาก provider ยังไม่ชัด
- force retry หลังจากตรวจ payment และ decline metadata แล้วเท่านั้น
- fallback เป็น manual collection เมื่อต้องหยุด off-session attempts ของรอบปัจจุบัน
- force disable auto-renew เมื่อผู้ใช้ถอน consent หรือ support ต้องการให้รอบถัดไปกลับไปใช้ manual invoice
- revoke payment method เมื่อมีวิธีชำระใหม่แล้ว หรือปิด auto-renew แล้ว

## การ rollback rollout

- เอา subscription ออกจาก allowed cohort ของ Phase 2
- force disable auto-renew ให้ subscription ที่ต้องหยุด retry ทันที
- ห้ามแก้ invoice ที่ชำระแล้ว หรือ ลบ saved payment methods ระหว่าง rollback

## Warning states

- `requires_new_card`: ลูกค้าต้องอัปเดตบัตรก่อนรอบถัดไป
- `manual_fallback_active`: invoice ยังเปิดอยู่ แต่จะไม่ retry off-session ต่อ
- `manual_review_required`: ต้องตรวจ provider/reconciliation data ก่อน retry

<!-- knowledge-graph:related:start -->
## หัวข้อที่เกี่ยวข้อง

- [[admin-advanced|การจัดการขั้นสูง]]
- [[getting-started|เริ่มต้นใช้งาน]]
- [[document-management|จัดการเอกสาร]]
- [[admin-agencies|จัดการเอเจนซี่]]
- [[admin-alert-rules|กฎแจ้งเตือนและการยกระดับ]]
- [[admin-approvals|การอนุมัติ]]
- [[admin-audit|บันทึกการตรวจสอบ]]
<!-- knowledge-graph:related:end -->
