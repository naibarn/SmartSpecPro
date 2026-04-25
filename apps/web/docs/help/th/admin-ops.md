---
slug: admin-ops
title: Ops Dashboard
description: ตรวจสอบระบบแบบเรียลไทม์และสถานะสุขภาพระบบ
icon: Activity
section: admin
order: 85
pages: ["/admin/ops"]
tags:
  - "admin"
  - "ops"
  - "monitoring"
  - "health"
  - "services"
  - "metrics"
  - "dashboard"
  - "help"
  - "help/th"
  - "help/admin"
  - "admin-ops"
aliases:
  - "admin-ops"
  - "Ops Dashboard"
  - "Ops Dashboard help"
---

# Ops Dashboard

## ภาพรวม

Ops Dashboard มอบการตรวจสอบระบบแบบเรียลไทม์สำหรับแอดมิน ดูสถานะระบบ บริการที่ทำงาน อัตราข้อผิดพลาด เวลาตอบสนอง ความลึกของคิว และสถานะ worker ได้ในหน้าเดียว

## สุขภาพระบบ

ส่วนบนแสดงสถานะสุขภาพระบบรวม:

- **สถานะบริการ** — ตัวบ่งชี้ เขียว/เหลือง/แดง ของแต่ละบริการ (web, backend, database, Redis, Celery)
- **Uptime** — ระยะเวลาที่แต่ละบริการทำงานโดยไม่รีสตาร์ท
- **อัตราข้อผิดพลาด** — เปอร์เซ็นต์ request ที่ error ในชั่วโมงที่ผ่านมา

## เมตริกสำคัญ

| เมตริก | คำอธิบาย |
|--------|---------|
| เวลาตอบสนอง | เวลาตอบสนอง API เฉลี่ย (P50, P95, P99) |
| Request throughput | จำนวน request ต่อวินาทีทุก endpoint |
| Queue depth | จำนวนงานที่รอใน BullMQ และ Celery queue |
| จำนวน worker | Celery worker ที่ทำงานอยู่และ task load |
| การเชื่อมต่อ DB | สถานะ connection pool PostgreSQL (active/idle) |
| หน่วยความจำ Redis | การใช้หน่วยความจำ Redis ปัจจุบัน |

## การตรวจสอบข้อผิดพลาด

- ข้อผิดพลาดล่าสุดแสดงพร้อมเวลา endpoint และข้อความ error
- กด error เพื่อดู stack trace และรายละเอียด request
- Error ถูกจัดกลุ่มตามประเภทเพื่อระบุปัญหาที่เกิดซ้ำ

## สถานะ Worker

ดูรายละเอียด Celery worker:

- **Task ที่กำลังทำ** — แต่ละ worker กำลังประมวลผลอะไร
- **เสร็จแล้ว** — task ที่เสร็จในชั่วโมงที่ผ่านมา
- **ล้มเหลว** — task ที่ error พร้อมสาเหตุ

## เคล็ดลับ

- ตรวจสอบ Ops Dashboard หลัง deploy เพื่อยืนยันความเสถียรของระบบ
- ติดตาม queue depth — หากเพิ่มขึ้นเรื่อยๆ อาจต้อง scale worker
- ใช้การจัดกลุ่ม error เพื่อจัดลำดับความสำคัญว่าจะแก้บัก

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
