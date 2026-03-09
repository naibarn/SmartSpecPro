# Decision Log

- Planning depth: `standard`
- Reason:
  - งานเป็น hardening + enhancement ต่อจาก feature ที่มีอยู่แล้ว
  - มีผลกระทบ cross-layer แต่ยังไม่ถึงขั้นต้อง promote ไป `deep-plan`
  - ต้องการ section แยกพอให้ implement/test ได้ทีละ wave

- Delivery mode: `auto_by_default`
- Reason:
  - product intent ชัดเจนจาก review findings
  - ไม่มี unresolved decision ที่จำเป็นต้องหยุดถามก่อนวางแผน

- Planning package strategy:
  - สร้าง package ใหม่ `002-presentation-media-motion-hardening`
  - ไม่แก้ไฟล์ plan เดิมของ `001-...` เพื่อรักษา history ว่าอันแรกเป็น v1 baseline และอันนี้เป็น hardening/v1.1 follow-up
