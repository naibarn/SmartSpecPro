---
slug: admin-tenants
title: จัดการ Tenant
description: การจัดการระบบ white-label multi-tenant
icon: Building2
section: admin
order: 86
pages: ["/admin/tenants"]
tags:
  - "admin"
  - "tenants"
  - "white-label"
  - "branding"
  - "domain"
  - "feature-flags"
  - "multi-tenant"
  - "help"
  - "help/th"
  - "help/admin"
  - "admin-tenants"
aliases:
  - "admin-tenants"
  - "จัดการ Tenant"
  - "จัดการ Tenant help"
---

# จัดการ Tenant

## ภาพรวม

การจัดการ Tenant ช่วยให้แอดมินระบบสร้าง กำหนดค่า และจัดการ white-label tenant แต่ละ tenant สามารถมีโดเมน แบรนด์ ชุดฟีเจอร์ และฐานผู้ใช้เป็นของตัวเอง

## การสร้าง tenant

1. กด **New Tenant**
2. กรอกรายละเอียด tenant:
   - **ชื่อ** — ชื่อแสดงขององค์กร tenant
   - **Slug** — ตัวระบุสำหรับ URL (สร้างอัตโนมัติจากชื่อ)
   - **โดเมน** — โดเมนกำหนดเองสำหรับเข้าถึง tenant (เช่น `app.clientname.com`)
3. กด **Create**

## การตั้งค่าแบรนด์

ปรับแต่งรูปลักษณ์ของ tenant:

- **โลโก้** — อัปโหลดโลโก้หลัก (แสดงใน header)
- **Favicon** — ไอคอนแท็บเบราว์เซอร์
- **สีหลัก** — สีเน้นสำหรับปุ่มและไฮไลท์
- **หน้า login** — ข้อความต้อนรับและพื้นหลังกำหนดเอง

อัปโหลดไฟล์โดยกดพื้นที่อัปโหลดหรือลากไฟล์

## Feature flags

เปิดหรือปิดฟีเจอร์แพลตฟอร์มต่อ tenant:

| Flag | คำอธิบาย |
|------|---------|
| Agency Swarm | เปิดใช้ marketplace เอเจนซี่ AI |
| Automation Copilot | เปิดใช้ browser automation |
| Channel Router | เปิดใช้ multi-channel routing |
| Webhook Triggers | เปิดใช้ webhook automation |

สวิตช์ toggle ควบคุมแต่ละฟีเจอร์ การเปลี่ยนแปลงมีผลทันที

## การตั้งค่าโดเมน

- **โดเมนหลัก** — URL หลักสำหรับเข้าถึง tenant
- **SSL** — จัดการอัตโนมัติผ่าน Nginx reverse proxy
- **DNS** — tenant ต้องชี้ CNAME ของโดเมนไปยังแพลตฟอร์ม

## การจัดการผู้ใช้

ดูจำนวนผู้ใช้ต่อ tenant กด **Manage Users** เพื่อไปยังหน้าจัดการผู้ใช้ของ tenant

## การลบ tenant

กด **Delete** เพื่อลบ tenant และข้อมูลทั้งหมดอย่างถาวร ต้องยืนยันก่อนและไม่สามารถยกเลิกได้

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
