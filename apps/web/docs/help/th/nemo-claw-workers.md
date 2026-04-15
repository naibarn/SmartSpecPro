---
slug: nemo-claw-workers
title: NemoClaw Workers
description: ใช้งาน secure sandbox worker pool แบบ admin-gated พร้อมนโยบาย network, filesystem และ process ที่ชัดเจน
icon: ShieldCheck
section: admin
order: 89
pages: ["/admin/monitoring", "/admin/tenants"]
tags: [nemoclaw, sandbox, worker pool, admin-gated, monitoring, tenants, security]
---

# NemoClaw Workers

ใช้คู่มือนี้เมื่อคุณต้องการ runtime ตระกูล Claw แบบ secure sandbox แทน worker ภายนอกแบบ personal

NemoClaw เป็น runtime family ที่เปิดแบบ admin-gated สำหรับการรันแบบแยกขอบเขต เหมาะกับงานที่ต้องการ sandbox posture ที่ควบคุมได้ ไม่ใช่ connector ที่ bind ใน Teams หรือ runtime ที่บริหารผ่าน desktop

## NemoClaw เหมาะกับอะไร

NemoClaw เหมาะกับ:

- งานที่ต้อง sandbox พร้อมข้อจำกัดของ network, filesystem และ process อย่างชัดเจน
- งานที่ operator ต้อง inspect posture ได้จาก monitoring โดยตรง
- งานที่ต้องแยกจาก OpenClaw, Hermes และ Desktop Host

NemoClaw ไม่ใช่เส้นทางหลักสำหรับ:

- external connector ที่ bind แบบ owner-bound ใน Teams
- workflow แบบ channel companion
- การเข้าถึงไฟล์ local หรือการรันผ่าน desktop-managed runtime

## สิ่งที่ runtime รายงาน

control plane คาดหวัง metadata เช่น:

- `openShellVersion`
- `sandboxName`
- `blueprintVersion`
- `inferenceProviderProfile`
- `networkPolicyProfile`
- `filesystemPolicyScope`
- `processRestrictionProfile`
- `resourceClass`

ถ้าฟิลด์เหล่านี้ขาดหายหรือไม่ถูกต้อง runtime ควร fail closed ก่อน dispatch

## ความจริงเรื่อง rollout

`nemoClawSecureWorkerPool` หมายความว่า tenant นี้อาจเปิด family นี้ได้เท่านั้น ไม่ได้แปลว่า sandbox profile ทุกแบบพร้อมใช้งาน production แล้ว

guardrail ปัจจุบันคือ:

- registration เปิดแบบ admin-gated
- dispatch เปิดแบบ admin-gated
- ควรดู runtime family และ compatibility posture ใน monitoring ก่อนส่งงาน

## ท่าทีด้านความปลอดภัย

- ควรกำหนด `networkPolicyProfile` ให้ชัด
- ควรตั้ง `filesystemPolicyScope` ให้แคบที่สุดเท่าที่ทำได้
- `processRestrictionProfile` ควรถูกใช้เป็น guardrail จริง ไม่ใช่แค่ label
- ใช้ `resourceClass` ที่เล็กที่สุดซึ่งยังทำงานเสร็จ

## เช็กลิสต์สำหรับ operator

ก่อนส่งงานให้ NemoClaw:

1. เปิด `nemoClawSecureWorkerPool`
2. ยืนยันว่า worker ลงทะเบียนมาพร้อม sandbox metadata ที่ถูกต้อง
3. ตรวจ monitoring ว่า compatibility และ runtime family labels ถูกต้อง
4. ยืนยันว่า job นั้นควรรันแบบ sandbox จริง ๆ

คู่มือที่เกี่ยวข้อง:

- [OpenClaw Workers](./openclaw-workers.md)
- [HiClaw Workers](./hi-claw-workers.md)
- [Desktop Host](./desktop-host.md)
