---
slug: workflows
title: เวิร์กโฟลว์และระบบอัตโนมัติ
description: สร้างและเรียกใช้เวิร์กโฟลว์งานอัตโนมัติ
icon: GitBranch
section: advanced
order: 72
pages: ["/workflows", "/workflows/editor", "/workflows/gallery"]
tags: [workflows, automation, pipeline, editor, triggers, actions, schedule]
---

# เวิร์กโฟลว์และระบบอัตโนมัติ

## Workflow คืออะไร?

Workflow คือกระบวนการทำงานอัตโนมัติหลายขั้นตอนที่เชื่อม Trigger, Action และ Condition เข้าด้วยกันเป็น Pipeline ที่สามารถทำซ้ำได้ แทนที่จะทำลำดับขั้นตอนเดิมด้วยตนเองทุกครั้ง คุณกำหนดไว้ครั้งเดียวแล้วเรียกใช้ตามต้องการหรือตามกำหนดเวลา

Workflow เหมาะที่สุดสำหรับงานที่คุณทำซ้ำๆ เช่น สร้างรายงาน ประมวลผลเนื้อหาผ่านขั้นตอน AI หลายขั้น หรือเชื่อมต่อกับระบบภายนอก

## การสร้าง Workflow

1. ไปที่ **Workflows** ในแถบด้านข้าง
2. คลิก **New Workflow** หรือเลือก Template จาก Gallery
3. ตัวแก้ไขภาพจะเปิดขึ้นพร้อม Canvas ว่างเปล่า
4. ลาก Node จาก Palette ทางซ้ายไปวางบน Canvas
5. เชื่อม Node โดยลาก Edge ระหว่าง Port ขาออกและขาเข้า
6. ตั้งค่าแต่ละ Node โดยคลิกและกรอกข้อมูลในแผงการตั้งค่า
7. คลิก **Save** เพื่อบันทึก Workflow

## ประเภท Node

| Node | คำอธิบาย |
|---|---|
| **Trigger** | เริ่มต้น Workflow — ปุ่ม Manual, กำหนดเวลา, Webhook หรือ Event |
| **Action** | ดำเนินงาน — เรียก LLM, รัน Skill, สร้างสื่อ หรือเรียก API |
| **Condition** | แยกเส้นทางตามกฎ (if/else) |
| **Output** | จัดรูปแบบและส่งมอบผลลัพธ์สุดท้าย |

## Trigger

- **Manual** — รันจากหน้า Workflows โดยคลิก **Run**
- **Scheduled** — รันอัตโนมัติตามเวลาที่กำหนด (รายวัน รายสัปดาห์ หรือ Cron expression)
- **Webhook** — ถูกกระตุ้นโดย HTTP POST จากระบบภายนอก
- **Event-based** — ทำงานตอบสนองต่อ Event ในแอป (เช่น ได้รับข้อความใหม่)

## Action

- **LLM Call** — ส่ง Prompt ไปยัง AI Model และรับผลลัพธ์กลับ
- **Skill Execution** — รัน Skill เฉพาะพร้อม Input ที่กำหนด
- **Media Generation** — สร้างภาพหรือวิดีโอในขั้นตอน Pipeline
- **API Call** — ทำ HTTP Request ไปยังบริการภายนอก
- **Transform** — จัดรูปแบบหรือประมวลผลข้อมูลระหว่างขั้นตอน (JSON, ข้อความ, ดึงข้อมูล)

บาง tenant อาจเห็นความสามารถด้าน worker-runtime orchestration เพิ่มเข้ามา แต่ฟีเจอร์เหล่านี้เป็น runtime-family specific และ rollout-gated:

- งานแบบ OpenClaw gateway ไม่เหมือนงาน media/local file บน desktop
- งาน Desktop + ZeroClaw ถูกออกแบบมาสำหรับ local files, GPU และ machine-hosted execution
- runtime แบบ secure pool และ collaborative cluster จะยังคงเป็น admin-gated จนกว่าจะเปิดใช้งานโดยชัดเจน

## Condition

เพิ่ม Node **Condition** เพื่อแยกเส้นทาง Workflow ตามตรรกะ:

- เปรียบเทียบค่ากับเกณฑ์หรือคีย์เวิร์ด
- ตรวจสอบว่าขั้นตอนก่อนหน้าสำเร็จหรือล้มเหลว
- กำหนดเส้นทางไปยัง Action ต่างกันตามประเภทเนื้อหา

แต่ละ Condition มี Port ขาออก **true** และ **false** เชื่อมแต่ละ Port ไปยัง Action ถัดไปที่เหมาะสม

## Gallery

Workflow Gallery มี Template สำเร็จรูปสำหรับกรณีใช้งานทั่วไป:

- **Daily Briefing** — สรุปข่าวหรืออัปเดตทุกเช้า
- **Content Pipeline** — ร่าง ตรวจสอบ และจัดรูปแบบเนื้อหาตามลำดับ
- **Research to Report** — ค้นคว้าหัวข้อและสร้างเอกสารที่จัดรูปแบบแล้ว
- **Webhook Responder** — ประมวลผลข้อมูลขาเข้าและส่งคืนผลลัพธ์แบบมีโครงสร้าง

เรียกดู Gallery ได้ที่ **Workflows → Gallery** แล้วคลิก **Use Template** เพื่อเริ่มจาก Design ที่มีอยู่

## การรัน Workflow

- คลิก **Run** บน Workflow ที่บันทึกไว้เพื่อรันทันที
- สำหรับ Workflow ที่กำหนดเวลาไว้ เวลารันครั้งถัดไปจะแสดงบนการ์ด Workflow
- ระหว่างรัน ตัวบ่งชี้ความคืบหน้าจะแสดง Node ที่กำลังดำเนินการ
- ผลลัพธ์จะแสดงในแผง **Run History** ทางขวาของหน้ารายละเอียด Workflow
- คลิกการรันที่ผ่านมาเพื่อดู Output ทั้งหมดและข้อผิดพลาด

ถ้า Workflow มีการส่งงานออกไปยัง worker runtime ให้แยก milestone เหล่านี้ออกจากกัน:

- control plane รับ dispatch แล้ว
- worker ทำ execution เสร็จแล้ว
- artifact ถูกอัปโหลดและ publish แล้ว
- indexing เสร็จจนค้นหาเจอได้

บางกรณี workflow อาจสำเร็จใน milestone แรก แต่ล้มเหลวใน milestone หลังจากนั้นได้

## เคล็ดลับ

- **เริ่มจากสิ่งง่าย** — สร้าง Workflow สอง Node ก่อนเพื่อตรวจสอบว่า Trigger และ Action ทำงานได้ แล้วค่อยเพิ่มความซับซ้อน
- **ทดสอบทีละขั้น** — ใช้ปุ่ม **Test Node** ในแผงตั้งค่า Node เพื่อรัน Node เดียวในโหมด Isolation
- **ใช้ Template** — Gallery ครอบคลุมรูปแบบทั่วไปส่วนใหญ่ แก้ไข Template แทนการสร้างจากศูนย์
- **ตรวจสอบประวัติการรัน** — หาก Workflow ล้มเหลว ประวัติการรันจะแสดงว่า Node ไหนล้มเหลวและเพราะอะไร
- **ตั้งชื่อให้มีความหมาย** — ตั้งชื่อ Node ให้สื่อความหมายเพื่อให้เข้าใจ Workflow ได้ง่ายเมื่อกลับมาดูทีหลัง
