---
slug: terminal
title: เทอร์มินัล
description: โปรแกรมจำลองเทอร์มินัลบนเดสก์ท็อปพร้อมหลายแท็บ
icon: Terminal
section: advanced
order: 71
pages: ["/terminal"]
tags:
  - "terminal"
  - "shell"
  - "command"
  - "desktop"
  - "tauri"
  - "pty"
  - "help"
  - "help/th"
  - "help/runtime"
  - "runtime"
aliases:
  - "terminal"
  - "เทอร์มินัล"
  - "เทอร์มินัล help"
---

# เทอร์มินัล

## ภาพรวม

หน้า Terminal มีโปรแกรมจำลองเทอร์มินัลเต็มรูปแบบพร้อมหลายแท็บ ภายในแอปเดสก์ท็อปโดยตรง รันคำสั่ง shell สคริปต์ และจัดการสภาพแวดล้อมการพัฒนาโดยไม่ต้องออกจาก SmartAIHub

> **เดสก์ท็อปเท่านั้น** — ฟีเจอร์นี้ต้องใช้แอป Tauri desktop ไม่สามารถใช้งานในเว็บเบราว์เซอร์

## การใช้งานเทอร์มินัล

1. ไปที่ **Terminal** จากเมนูด้านข้าง
2. เซสชันเทอร์มินัลเริ่มต้นจะเปิดอัตโนมัติ
3. พิมพ์คำสั่งแล้วกด **Enter** เพื่อรัน
4. ผลลัพธ์แสดงแบบเรียลไทม์รองรับสี ANSI เต็มรูปแบบ

## การจัดการแท็บ

- กดปุ่ม **+** เพื่อเปิดแท็บเทอร์มินัลใหม่
- แต่ละแท็บรัน shell session อิสระ (PTY)
- กดแท็บเพื่อสลับระหว่างเซสชัน
- ปิดแท็บโดยกด **X** บนหัวแท็บ

## คีย์ลัด

| คีย์ลัด | การทำงาน |
|---------|---------|
| `Ctrl+T` | เปิดแท็บใหม่ |
| `Ctrl+W` | ปิดแท็บปัจจุบัน |
| `Ctrl+Tab` | แท็บถัดไป |
| `Ctrl+C` | หยุดคำสั่งที่กำลังรัน |
| `Ctrl+L` | ล้างหน้าจอ |

## เคล็ดลับ

- ใช้หลายแท็บเพื่อรัน dev server ในแท็บหนึ่งและ test ในอีกแท็บ
- เทอร์มินัลใช้การตั้งค่า shell ของระบบ (bash, zsh ฯลฯ)
- เซสชันเทอร์มินัลคงอยู่ขณะแอปเปิด แต่จะถูกล้างเมื่อรีสตาร์ท

<!-- knowledge-graph:related:start -->
## หัวข้อที่เกี่ยวข้อง

- [[desktop-host|Desktop Host]]
- [[getting-started|เริ่มต้นใช้งาน]]
- [[document-management|จัดการเอกสาร]]
- [[browser-session|Browser Session]]
- [[cli|CLI (Kilo)]]
- [[desktop-host-managed-mode|Desktop Host Managed Mode]]
- [[desktop-releases|Desktop Releases]]
<!-- knowledge-graph:related:end -->
