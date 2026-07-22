---
slug: grok-via-hermes-worker-app
title: Worker App สำหรับ Grok ผ่าน Hermes
description: วิธีติดตั้ง อนุญาต และรักษาสถานะ Worker App ส่วนตัวให้ Online สำหรับสร้างสื่อด้วย Grok
icon: MonitorCog
section: user
order: 73
pages: ["/workers/connect"]
tags:
  - "grok"
  - "worker app"
  - "browser approval"
  - "private worker"
  - "windows"
  - "help"
  - "help/th"
aliases:
  - "hermes worker app"
  - "เชื่อม worker app"
  - "private grok worker"
---

# Worker App สำหรับ Grok ผ่าน Hermes

Worker App ใช้รันงาน Grok media ส่วนตัวบนคอมพิวเตอร์ของคุณ ใช้กับโหมด
**เครื่องของฉัน** แอปต้องเชื่อมกับ workspace ที่ถูกต้องและ Online ขณะรันงาน

## ติดตั้งและจับคู่

1. ดาวน์โหลด Windows installer ล่าสุดจากหน้านี้
2. ติดตั้งและเปิด **Smart AI Hub Worker App**
3. ในแอปกด **Connect** แอปจะเปิดหน้า browser approval พร้อม user code
   ที่มีอายุสั้น
4. ตรวจเครื่อง runtime บัญชี และ workspace ที่ browser แสดง
5. กด **Allow this Worker App**
6. กลับไปที่แอปและรอให้สถานะเป็น Connected/Online
7. ใน Smart AI Hub ไปที่ **Settings > Connections > Grok via Hermes**
   เลือก **เครื่องของฉัน** แล้วอนุญาต Grok ผ่าน xAI device authorization

Browser approval จะให้ worker identity ที่จำกัดสิทธิ์กับแอป ไม่ต้องคัดลอก
registration token, password, cookie หรือ credential ของ Grok

## ความพร้อมของ Runtime

- เปิด Worker App ไว้ตลอดการสร้างงาน
- ติดตั้ง Hermes runtime pack ที่มากับ Worker App release ปัจจุบัน
- อัปเดตเมื่อแอปแจ้ง runtime หรือ version ไม่รองรับ
- ระบบส่งงาน private ใหม่ให้ worker ที่ Online เท่านั้น
- การปิดแอป sign out หรือให้เครื่อง sleep อาจทำให้งานที่รันอยู่หยุด

Installer ที่ดาวน์โหลดจากหน้านี้เป็นเส้นทาง Windows ที่รองรับในปัจจุบัน
ถ้ายังไม่มี macOS package ห้ามนำ Windows runtime archive ไปใช้แทน

## ปัญหาที่พบบ่อย

- **ไม่มี connection code:** เริ่ม Connect จาก Worker App ใหม่
- **Code หมดอายุ:** เริ่ม Connect ใหม่เพื่อรับ browser approval URL ใหม่
- **Workspace ผิด:** เปิดลิงก์อีกครั้งจาก workspace ที่ต้องการเชื่อม
- **Denied:** ตรวจ user ที่ login และ workspace แล้วเริ่มใหม่
- **Connected แต่ Offline:** เปิดแอปไว้และตรวจ network/firewall
- **Hermes runtime หายหรือ version ไม่รองรับ:** อัปเดต Worker App/runtime pack
- **Grok ยังไม่เชื่อม:** การ pair worker กับการอนุญาต Grok เป็นคนละขั้นตอน
  ต้องทำ device authorization ที่ Settings ด้วย
- **งานค้างใน queue:** ตรวจ Worker App ที่เลือกเป็น Online และ connection
  รองรับ capability ของงาน

## คู่มือที่เกี่ยวข้อง

- [[grok-via-hermes-connections|การเชื่อมต่อ Grok ผ่าน Hermes]]
- [[grok-via-hermes-admin|การดูแล Grok ผ่าน Hermes]]
- [[grok-via-hermes-monitoring|การติดตาม Grok ผ่าน Hermes]]

