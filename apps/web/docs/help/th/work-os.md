---
slug: work-os
title: คู่มือ Work OS
description: เริ่มงานที่ต้องติดตาม เก็บเป็นเคส และนำงานเก่ามาไว้ที่เดียว
icon: ClipboardList
section: features
order: 11
pages: ["/chat", "/work/request", "/admin/work-os", "/admin/monitoring"]
tags:
  - "work os"
  - "intake"
  - "request"
  - "case"
  - "task"
  - "queue"
  - "chat"
  - "webhook"
  - "api"
  - "legacy"
  - "import"
  - "triage"
  - "help"
  - "help/th"
  - "help/automation"
  - "automation"
  - "work-os"
aliases:
  - "work-os"
  - "คู่มือ Work OS"
  - "คู่มือ Work OS help"
---

# คู่มือ Work OS

## Work OS คืออะไร

Work OS คือที่ที่คำขอทางธุรกิจกลายเป็นงานที่ติดตามได้จริง

ระบบจะเก็บเรื่องราวของงานไว้เป็นเรื่องเดียว เช่น:

- งานมาจากไหน
- ใครเป็นคนรับผิดชอบ
- งานกำลังรออะไรอยู่
- ต้องรออนุมัติหรือไม่
- ติดปัญหาหรือใกล้ครบกำหนดหรือเปล่า
- ผลลัพธ์สุดท้ายเป็นอย่างไร

## งานเข้าระบบได้อย่างไร

งานสามารถเข้ามาได้จาก trigger หลายแบบ:

| Trigger | ใช้เมื่อไร |
|---|---|
| Chat | มีคนอธิบายงานด้วยภาษาธรรมดา และต้องการให้กลายเป็นงานที่ติดตามได้ |
| Webhook | ระบบอื่นส่งคำขอเข้ามาใน SmartAIHub |
| API | ผลิตภัณฑ์ อินทิเกรชัน หรือเครื่องมือภายในสร้างงานโดยตรง |
| ฟอร์ม | มีคนกรอกคำขอที่มีโครงสร้าง |
| Document flow | ไฟล์ SOP หรือเอกสารรับงานเป็นจุดเริ่มต้นของงาน |
| Schedule trigger | งานตามเวลาที่สร้างงานอัตโนมัติ |

## เริ่มจาก Chat อย่างไร

1. เปิด Chat
2. ใช้การ์ด **เริ่มงานที่ติดตามได้** เมื่อต้องการให้บทสนทนานี้กลายเป็นงานจริง
3. เปิดหน้า Work Request จากการ์ดนั้นเมื่อคุณต้องการเริ่มงานเอง
4. ใส่รายละเอียดงาน เช่น หัวข้อ ต้นทาง ความเร่งด่วน และผู้รับผิดชอบเริ่มต้น
5. ระบบจะสร้าง request ก่อน แล้วจึงแปลงเป็น case ที่ติดตามได้ใน Work OS

## ถ้าจะเอางานเก่ามาเข้าระบบ

ถ้าทีมของคุณมีงานอยู่ในเครื่องมือเดิมหรือ task เดิมอยู่แล้ว คุณสามารถแนบงานนั้นเข้ากับ Work OS case ได้

วิธีนี้ช่วยเก็บประวัติเดิมกับการติดตามใหม่ไว้ที่เดียวกัน ไม่ต้องแยกเรื่องออกเป็นหลายหน้าจอ

## งานเป็นของใคร

Work OS สามารถมอบหมายงานให้:

- คน
- ทีม
- คิวงาน
- role
- หรือแบบผสม

เมื่อมีการเปลี่ยนเจ้าของงาน ระบบจะเก็บไว้ให้ดูย้อนหลังได้ว่าใครเคยรับงานนี้มาก่อนและเปลี่ยนเพราะอะไร

## Automation ช่วยตอนไหน

ระบบอัตโนมัติจะเข้ามาช่วยเมื่อ:

- งานมีความมั่นใจต่ำและควรไป triage
- อนุมัติใช้เวลานานเกินไป
- มี policy บล็อกการทำงาน
- SLA ใกล้ครบหรือเกินกำหนด
- ต้องเชื่อม task เดิมเข้ากับงานที่มีอยู่แล้ว

## ควรดูต่อที่ไหน

- เปิด **Work Request** เพื่อสร้างงานใหม่ในฐานะผู้ใช้ทั่วไป
- เปิด **Work OS Console** เพื่อดู inbox, timeline, approvals, exceptions และ outcomes
- เปิด **Admin Monitoring** ถ้าต้องการภาพรวมของระบบก่อน
- กลับไปที่ **Chat** เมื่อต้องอธิบายขั้นตอนถัดไปด้วยภาษาธรรมดา

## Permalink และตัวกรอง

คุณสามารถแชร์มุมมองของ Work OS ที่ต้องการด้วย URL แบบ bookmarkable ได้:

- `/admin/work-os` เปิดคอนโซลหลัก
- `/admin/work-os?caseId=case-123` เปิดเคสเดียวโดยตรง
- `/admin/work-os?caseId=case-123&timelineSource=role_routine` โฟกัสที่ evidence ของ role routine
- `/admin/work-os?caseId=case-123&timelineSource=team_run` โฟกัสที่ evidence ของ team run
- `/admin/work-os?caseId=case-123&timelineSource=workpack_record` โฟกัสที่ workpack evidence
- `/admin/work-os?caseId=case-123&timelineSource=work_os` แสดง event stream หลักของ Work OS

ใช้ `caseId` เพื่อให้อยู่ที่เคสเดิม และใช้ `timelineSource` เพื่อกรอง timeline ให้เหลือ evidence slice เดียว
วิธีนี้ช่วยให้แชร์ คัดลอก และกลับมาดูมุมมองเดิมได้ง่ายขึ้น

## คำอธิบายสั้น ๆ

- `caseId` ใช้เปิดเคสเดิม
- `timelineSource` ใช้กรอง timeline ให้เหลือ evidence slice เดียว
- `work_os` คือ main case stream
- `role_routine`, `team_run`, และ `workpack_record` คือ evidence slice แบบเฉพาะแหล่งที่มา

<!-- knowledge-graph:related:start -->
## หัวข้อที่เกี่ยวข้อง

- [[workflows|เวิร์กโฟลว์และระบบอัตโนมัติ]]
- [[getting-started|เริ่มต้นใช้งาน]]
- [[document-management|จัดการเอกสาร]]
- [[automation|ระบบอัตโนมัติ]]
- [[factory|SaaS Factory]]
- [[webhooks|Webhooks และการเชื่อมต่อ]]
- [[workflow-editor|ตัวสร้างเวิร์กโฟลว์]]
<!-- knowledge-graph:related:end -->
