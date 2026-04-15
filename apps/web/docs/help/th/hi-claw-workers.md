---
slug: hi-claw-workers
title: HiClaw Workers
description: ใช้งาน collaborative cluster runtime แบบ admin-gated พร้อม governance ของ manager, credential และ artifact
icon: Layers3
section: admin
order: 90
pages: ["/admin/monitoring", "/admin/tenants"]
tags: [hiclaw, cluster, workers, admin-gated, monitoring, tenants, collaboration]
---

# HiClaw Workers

ใช้คู่มือนี้เมื่อคุณต้องการ runtime ตระกูล Claw แบบ collaborative cluster แทน worker ภายนอกแบบ personal

HiClaw เป็น runtime family ที่เปิดแบบ admin-gated สำหรับการรันแบบ coordinated cluster เหมาะกับงานที่ต้องใช้ posture ร่วมกัน มี governance ของ artifact ชัดเจน และต้องเห็น human oversight ได้

## HiClaw เหมาะกับอะไร

HiClaw เหมาะกับ:

- worker pool ที่ต้องทำงานแบบ managed cluster
- การจัดการ shared artifact แบบมี governance ชัดเจน
- งานที่ต้องมี manager endpoint และ cluster identity ที่ตรวจสอบได้
- workflow ที่ human oversight และ matrix visibility มีความสำคัญ

HiClaw ไม่ใช่เส้นทางหลักสำหรับ:

- external connector ที่ bind แบบ owner-bound ใน Teams
- workflow แบบ channel companion
- การเข้าถึงไฟล์ local หรือการรันผ่าน desktop-managed runtime

## สิ่งที่ runtime รายงาน

control plane คาดหวัง metadata เช่น:

- `managerEndpoint`
- `clusterId`
- `gatewayMode`
- `credentialHandlingMode`
- `sharedArtifactStoreProfile`
- `humanOversightMode`
- `workerPoolSummary`
- `matrixVisibilityMode`

ถ้าฟิลด์เหล่านี้ขาดหายหรือไม่ถูกต้อง runtime ควร fail closed ก่อน dispatch

## ความจริงเรื่อง rollout

`hiClawClusterRuntime` หมายความว่า tenant นี้อาจเปิด family นี้ได้เท่านั้น ไม่ได้แปลว่า cluster lane พร้อมสำหรับทุก workload แล้ว

guardrail ปัจจุบันคือ:

- registration เปิดแบบ admin-gated
- dispatch เปิดแบบ admin-gated
- ควรดู cluster posture, compatibility และ matrix visibility ใน monitoring ก่อนส่งงาน

## ท่าทีด้านความปลอดภัย

- ควรกำหนด `credentialHandlingMode` ให้ชัด
- ควรถือ `sharedArtifactStoreProfile` เป็น storage ที่อยู่ใต้ governance ไม่ใช่ที่ทิ้งข้อมูล
- จำกัด `matrixVisibilityMode` ให้เฉพาะกลุ่ม operator ที่จำเป็นจริง
- ใช้ `humanOversightMode` เพื่อทำให้ขอบเขตการอนุมัติเห็นชัด

## เช็กลิสต์สำหรับ operator

ก่อนส่งงานให้ HiClaw:

1. เปิด `hiClawClusterRuntime`
2. ยืนยันว่า worker ลงทะเบียนมาพร้อม cluster metadata ที่ถูกต้อง
3. ตรวจ monitoring ว่า manager endpoint, cluster ID และ shared artifact posture ถูกต้อง
4. ส่งเฉพาะงานที่ต้องใช้ collaborative cluster behavior จริง ๆ

คู่มือที่เกี่ยวข้อง:

- [OpenClaw Workers](./openclaw-workers.md)
- [NemoClaw Workers](./nemo-claw-workers.md)
- [Desktop Host](./desktop-host.md)
