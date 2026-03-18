---
slug: admin-skills
title: จัดการ Skills
description: จัดการ AI Skills, แหล่งข้อมูล และตลาด
icon: Wand2
section: admin
order: 120
pages: ["/admin/skills", "/admin/skill-repositories"]
tags: [admin, skills, manage, repository, marketplace, enable, disable, upload]
---

# จัดการ Skills

## ภาพรวม

Skills คือ AI Workflow เฉพาะทางที่ขยายประสบการณ์ Chat เริ่มต้น Skill Management ให้ผู้ดูแลระบบดู Skill ที่ติดตั้งทั้งหมด ควบคุมว่า Skill ใดเปิดให้ผู้ใช้ใช้งาน กำหนดค่าคุณสมบัติ และเพิ่ม Skill จาก Repository ภายนอกหรือ Marketplace

## รายการ Skills

ตาราง Skills แสดงทุก Skill ที่ติดตั้งบนแพลตฟอร์มพร้อม:

- **ชื่อ** และไอคอน
- **หมวดหมู่** — prompt_enhancement, image_generation, video_generation, audio_generation, chat_assistant
- **สถานะ** — เปิดใช้งานหรือปิดใช้งาน
- **Priority** — กำหนดลำดับการตรวจจับเมื่อหลาย Skill อาจจับคู่ได้ (สูงกว่า = ตรวจสอบก่อน)
- **Credit Multiplier** — ต้นทุนการใช้งานเทียบกับคำขอมาตรฐาน
- **Auto-trigger** — Skill จะทำงานอัตโนมัติตามเนื้อหาข้อความหรือไม่
- **Last Synced** — เมื่อไฟล์ Skill ถูกอ่านจาก Disk ล่าสุด

## การเปิดและปิดใช้งาน Skills

- สลับ **Active** บนแถว Skill ใดก็ได้เพื่อเปิดหรือปิดใช้งานสำหรับผู้ใช้ทั้งหมดทันที
- Skill ที่ปิดใช้งานจะไม่ปรากฏในเมนู Slash-command ไม่สามารถตรวจจับอัตโนมัติ และไม่สามารถเรียกใช้ผ่าน API ได้
- การปิดใช้งาน Skill ไม่ได้ลบ — การเปิดใช้งานใหม่จะคืนสถานะได้ทันที
- ผู้ใช้แต่ละคนไม่สามารถแทนที่ Skill ที่ปิดใช้งานในระดับ Admin ได้

## รายละเอียด Skill

คลิกชื่อ Skill เพื่อเปิดแผงรายละเอียด:

- **Triggers** — วลีหรือรูปแบบที่ทำให้ Skill ตรวจจับอัตโนมัติ (อ่านจาก Frontmatter ของ `skill.md`)
- **ตัวอย่าง System Prompt** — เนื้อหาจริงของ `skill.md` ที่ส่งเป็น System Prompt
- **Input Schema** — ช่องที่กำหนดใน `schemas/input.schema.json` หรือ `schemas/ui.schema.json`
- **โหมดการรัน** — `llm-only` (ผลลัพธ์ข้อความ) หรือ `media-generate` (รัน Media Generation อัตโนมัติ)
- **แก้ไขการตั้งค่า** — เปลี่ยน Priority, Credit Multiplier หรือสถานะ Enabled-by-default โดยตรงจาก UI

## Repositories

Skill Repository คือไดเรกทอรีภายนอกหรือแหล่ง Git ที่แพลตฟอร์มซิงค์ Skill จาก

- **เพิ่ม Repository** — ระบุชื่อ Source Path และช่วงเวลาการซิงค์
- Repository จะตรวจสอบตามกำหนดการที่กำหนด Skill ใหม่หรืออัปเดตจะซิงค์อัตโนมัติ
- แต่ละรายการ Repository แสดงเวลาที่ซิงค์สำเร็จล่าสุดและจำนวน Skill ที่ดึงมา
- **ซิงค์ด้วยตนเอง** — เรียกการซิงค์ทันทีสำหรับ Repository เฉพาะ
- **ลบ Repository** — หยุดการซิงค์ในอนาคต Skill ที่ติดตั้งแล้วจาก Repository นั้นยังคงอยู่จนกว่าจะลบด้วยตนเอง

## พฤติกรรม Auto-sync

Skill ที่เก็บในโฟลเดอร์ `apps/web/skills/` ในเครื่องจะซิงค์เมื่อ Server เริ่มต้นและจากนั้นใน **รอบ Cache 60 วินาที** เมื่อคุณเพิ่มหรืออัปเดตไฟล์ Skill ใน Disk:

1. Skill Registry ตรวจจับการเปลี่ยนแปลงในรอบถัดไป (หรือทันทีหลัง Restart)
2. Skill ใหม่จะถูก Insert เข้าฐานข้อมูล Skill ที่อัปเดต (ตรวจจับด้วย Content Hash) จะอัปเดตอัตโนมัติ
3. โฟลเดอร์ Skill ที่ลบจะทำให้ Skill ถูกทำเครื่องหมายเป็น Inactive ไม่ได้ลบออกจากฐานข้อมูล

## โครงสร้างไฟล์ Skill

แต่ละ Skill อยู่ในโฟลเดอร์ของตัวเองใต้ `apps/web/skills/`:

```
skills/
  my-skill/
    skill.md                  # Frontmatter + เนื้อหา System Prompt
    schemas/
      input.schema.json       # JSON Schema มาตรฐานสำหรับ Input
      ui.schema.json          # ไม่บังคับ: Layout UI แบบกำหนดเองพร้อม Sections และป้ายภาษาไทย
    references/               # ไม่บังคับ: เอกสารบริบทเพิ่มเติม
```

ดูช่อง Frontmatter ของ `skill.md` ในคู่มือ [Skills](./skills.md) สำหรับเอกสารฉบับสมบูรณ์

## Marketplace

แท็บ **Marketplace** (เมื่อเปิดใช้งาน) แสดง Skill จากชุมชนที่พร้อมติดตั้ง:

- เรียกดูตามหมวดหมู่ คะแนน และจำนวนการติดตั้ง
- คลิก **Install** เพื่อดาวน์โหลดและเพิ่ม Skill ในแพลตฟอร์ม — จะปรากฏในรายการ Skill เป็นสถานะปิดใช้งานจนกว่าจะเปิดใช้งาน
- **Updates** — Skill จาก Marketplace ที่ติดตั้งแล้วจะแสดง Badge เมื่อมีเวอร์ชันใหม่
- ตรวจสอบ System Prompt และ Schema ของ Skill ก่อนเปิดใช้งานให้กับผู้ใช้
