---
slug: cli
title: CLI (Kilo)
description: ตัวจัดการไฟล์บนเดสก์ท็อปพร้อม Git
icon: Terminal
section: advanced
order: 72
pages: ["/kilo"]
tags:
  - "cli"
  - "kilo"
  - "file-browser"
  - "git"
  - "editor"
  - "desktop"
  - "help"
  - "help/th"
  - "help/runtime"
  - "runtime"
aliases:
  - "cli"
  - "CLI (Kilo)"
  - "CLI (Kilo) help"
---

# CLI (Kilo)

## ภาพรวม

Kilo เป็นตัวจัดการไฟล์บนเดสก์ท็อปพร้อม Git ในตัว เรียกดูไฟล์โปรเจกต์ อ่านและแก้ไขเนื้อหา ค้นหาข้ามไดเรกทอรี และตรวจสอบสถานะ Git branch — ทั้งหมดภายใน SmartAIHub

> **เดสก์ท็อปเท่านั้น** — ต้องใช้แอป Tauri desktop

## เริ่มต้นใช้งาน

1. ไปที่ **CLI** จากเมนูด้านข้าง
2. ตั้ง **root path** — ไดเรกทอรีหลักสำหรับเรียกดูไฟล์ จะถูกบันทึกใน local storage สำหรับเซสชันถัดไป
3. โครงสร้างไฟล์จะโหลดอัตโนมัติจากไดเรกทอรีที่เลือก

## การเรียกดูไฟล์

- **Tree view** ด้านซ้ายแสดงโครงสร้างไดเรกทอรี
- กดไฟล์เพื่อเปิดในตัวแก้ไขด้านขวา
- ไฟล์จะแสดงสี syntax highlight ตามนามสกุล
- ใช้ **แถบค้นหา** เพื่อหาไฟล์ตามชื่อข้ามไดเรกทอรี

## การแก้ไขไฟล์

- เปิดไฟล์ข้อความใดก็ได้โดยกดในโครงสร้างไฟล์
- แก้ไขในแผงตัวแก้ไข
- กด **Save** หรือ `Ctrl+S` เพื่อบันทึกกลับไปที่ดิสก์
- การเปลี่ยนแปลงที่ยังไม่บันทึกจะแสดงจุดบนแท็บไฟล์

## การเชื่อมต่อ Git

- แถบสถานะแสดง **Git branch** ปัจจุบัน
- ไฟล์ที่ถูกแก้ไขจะถูกเน้นในโครงสร้างไฟล์
- ดูข้อมูลสถานะ Git เบื้องต้นโดยไม่ต้องออกจากตัวจัดการไฟล์

## เคล็ดลับ

- ตั้ง root path เป็นไดเรกทอรีโปรเจกต์เพื่อเข้าถึงไฟล์ทั้งหมดได้รวดเร็ว
- ใช้ฟีเจอร์ค้นหาเพื่อหาไฟล์ config หรือโมดูลเฉพาะอย่างรวดเร็ว
- ตัวแก้ไขรองรับคีย์ลัดทั่วไป (copy, paste, undo, find)

<!-- knowledge-graph:related:start -->
## หัวข้อที่เกี่ยวข้อง

- [[desktop-host|Desktop Host]]
- [[getting-started|เริ่มต้นใช้งาน]]
- [[document-management|จัดการเอกสาร]]
- [[browser-session|Browser Session]]
- [[desktop-host-managed-mode|Desktop Host Managed Mode]]
- [[desktop-releases|Desktop Releases]]
- [[docker-sandbox|Docker Sandbox]]
<!-- knowledge-graph:related:end -->
