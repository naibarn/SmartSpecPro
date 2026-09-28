---
slug: grok-via-hermes-admin
title: การดูแล Grok ผ่าน Hermes
description: วิธีเปิด platform และ tenant ตั้งค่าการเชื่อมต่อสามประเภท และดูแล server worker ให้พร้อม
icon: Settings
section: admin
order: 89
pages: ["/admin/settings", "/admin/tenants"]
tags:
  - "grok"
  - "hermes media worker"
  - "ผู้ดูแล"
  - "tenant rollout"
  - "บัญชีกลาง"
  - "help"
  - "help/th"
aliases:
  - "ตั้งค่า hermes media worker"
  - "ตั้งค่า grok"
  - "hermes f135"
---

# การดูแล Grok ผ่าน Hermes

Grok Media ต้องเปิดทั้ง platform gate และ tenant gate การเปิดเฉพาะ
**Hermes Media Worker (Grok, F135)** ใน tenant ยังไม่เพียงพอ หาก platform
worker หรือประเภท connection ที่ต้องการยังไม่พร้อม

ฟังก์ชันนี้เป็นคนละระบบกับ **Hermes Agent Gateway** และ flag
`hermesAgentRuntime` คู่มือ Agent Gateway อยู่ที่
[Hermes Workers](./hermes-workers.md)

## วิธีแนะนำสำหรับ Private Worker

1. ไปที่ **Admin > Settings > Infrastructure > Tasks**
2. ในการ์ด **เปิดใช้ Grok ผ่าน Hermes** เปิดสวิตช์หลัก ระบบจะตั้ง safe preset
   สำหรับ Worker App ส่วนตัว
3. ไปที่ **Admin > Tenants** แก้ไข tenant แล้วค้นหา
   **Hermes Media Worker (Grok, F135)**
4. เปิด flag แล้วกดบันทึก/Update tenant
5. ให้ผู้ใช้ติดตั้งและเชื่อม Worker App
6. ผู้ใช้เชื่อม Grok ที่ **Settings > Connections**

Safe preset จะยังไม่เปิดบัญชีกลางและบัญชีส่วนตัวบน server จนกว่า operator
จะตั้ง host worker ครบ

## เปิดโหมดบนเซิร์ฟเวอร์

เปิด advanced operator settings เมื่อ host worker ติดตั้ง จับคู่ และรายงาน
version ที่รองรับแล้วเท่านั้น

- **Shared pool enabled** เปิดบัญชีกลาง tenant
- **Server personal enabled** เปิด profile Grok ส่วนตัวบน host worker
- **Private worker enabled** เปิดการเชื่อม Worker App
- **Video generation enabled** เปิดวิดีโอเมื่อ connection นั้นประกาศ capability
- **Shared worker ID** คือ host worker หนึ่งตัวที่จับคู่ไว้สำหรับ server scopes

แต่ละ Grok profile บน server ใช้ Hermes home directory แยกกัน ห้ามนำ
directory ของผู้ใช้หนึ่งไปใช้กับผู้ใช้อื่นหรือบัญชีกลาง

## บัญชีกลางและบัญชีส่วนตัว

**บัญชีกลาง (`server_shared`)**

- ผู้ดูแลเป็นผู้เชื่อมและจัดการ
- สมาชิก tenant ที่ได้รับสิทธิ์ใช้ร่วมกัน
- quota และประวัติฝั่ง provider ใช้ร่วมกัน
- ใช้ queue และ concurrency limit ระดับ tenant

**บัญชีส่วนตัวบน server (`server_personal`)**

- ผู้ใช้แต่ละคนเชื่อมบัญชีของตนเอง
- งานรันบน host worker ที่ระบบดูแล
- credential profile และ default เป็นของผู้ใช้นั้น

**Worker App ส่วนตัว (`private_worker`)**

- ผู้ใช้เชื่อมบัญชีของตนเอง
- งานรันบน Worker App ของผู้ใช้ที่ Online
- ไม่ใช้ host worker กลางในการ execute

## Checklist ก่อนเปิดใช้งาน

1. Platform enablement เปิด
2. Tenant `hermesMediaWorker` เปิด
3. Scope ที่ต้องการเปิด
4. มี Shared worker ID สำหรับ server scopes
5. Heartbeat ล่าสุดและ worker เป็น Online
6. Version ผ่านค่าขั้นต่ำที่หน้า settings แสดง
7. Connection ประกาศ image/video capability ที่ต้องใช้
8. Queue, concurrency, submission window และ daily quota สอดคล้องกัน

## ปิดใช้งานอย่างปลอดภัย

ปิด tenant flag เมื่อต้องหยุดเฉพาะ tenant หรือปิด platform primary switch
เมื่อต้องหยุดรับงาน Hermes media ใหม่ทั้งระบบ ไม่ควรลบ connection records
หรือ credential directories เป็นขั้นตอน rollback แรก

ตรวจสุขภาพและการระบายงานที่
[การติดตาม Grok ผ่าน Hermes](./grok-via-hermes-monitoring.md)

## คู่มือที่เกี่ยวข้อง

- [[grok-via-hermes-connections|การเชื่อมต่อ Grok ผ่าน Hermes]]
- [[grok-via-hermes-worker-app|Worker App สำหรับ Grok ผ่าน Hermes]]
- [[grok-via-hermes-monitoring|การติดตาม Grok ผ่าน Hermes]]
- [[hermes-workers|Hermes Workers (Agent Gateway)]]

