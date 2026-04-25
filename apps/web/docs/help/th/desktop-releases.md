---
slug: desktop-releases
title: Desktop Releases
description: ดาวน์โหลด อัปโหลด เผยแพร่ และจัดการตัวติดตั้ง SmartSpecPro Desktop
icon: Download
section: features
order: 67
pages: ["/dashboard", "/admin/desktop-host", "/domain-admin/desktop-host"]
tags:
  - "desktop"
  - "desktop releases"
  - "installer"
  - "download"
  - "admin"
  - "publish"
  - "release notes"
  - "help"
  - "help/th"
  - "help/runtime"
  - "runtime"
  - "desktop-releases"
aliases:
  - "desktop-releases"
  - "Desktop Releases"
  - "Desktop Releases help"
---

# Desktop Releases

## ภาพรวม

Desktop Releases คือ flow สำหรับกระจายตัวติดตั้งของ SmartSpecPro Desktop Host

มี 2 พื้นผิวหลัก:

- **แผงดาวน์โหลดบน dashboard** สำหรับผู้ใช้ทั่วไปที่ต้องการตัวติดตั้งที่เผยแพร่ล่าสุด
- **พอร์ทัลจัดการ release สำหรับแอดมิน** สำหรับอัปโหลด เผยแพร่ ยกเลิกเผยแพร่ และลบไฟล์ตัวติดตั้ง

## สำหรับผู้ใช้ทั่วไป

ตัวติดตั้งที่เผยแพร่แล้วจะแสดงใน desktop release panel บน dashboard

สิ่งที่ทำได้จากหน้านี้:

- ดาวน์โหลดตัวติดตั้งล่าสุดสำหรับแพลตฟอร์มของคุณ
- ดูว่าแพลตฟอร์มใดมีไฟล์ให้แล้วบ้าง
- ดูเวอร์ชัน แพลตฟอร์ม รูปแบบไฟล์ ช่องทาง และขนาดไฟล์
- อ่าน release notes หากผู้ดูแลใส่มาให้

แผงนี้จะพยายามเลือกแพลตฟอร์มที่ตรงกับระบบปฏิบัติการปัจจุบันก่อน แล้วค่อย fallback ไปยังแพลตฟอร์มอื่นที่มีการเผยแพร่ไว้

## แพลตฟอร์มและรูปแบบที่รองรับ

แพลตฟอร์ม:

- Windows
- macOS
- Linux

รูปแบบตัวติดตั้งที่พบบ่อย:

- `exe`
- `msi`
- `dmg`
- `pkg`
- `deb`
- `rpm`
- `appimage`
- `zip`
- `tar_gz`

## Release channels

desktop release สามารถแบ่งตาม channel ได้:

| Channel | การใช้งานทั่วไป |
|---|---|
| `stable` | สำหรับ production โดยทั่วไป |
| `beta` | สำหรับทดสอบก่อนปล่อยจริงกับกลุ่มเล็ก |
| `nightly` | สำหรับรอบ iterate เร็วหรือทดสอบภายในทีมวิศวกรรม |

ถ้าองค์กรของคุณต้องการเฉพาะ build ที่พร้อมใช้งานจริง ให้ใช้ release `stable` ที่เผยแพร่ล่าสุด

## สำหรับแอดมินและ domain admin

การจัดการ desktop release อยู่ในหน้า tenant desktop governance

งานที่ผู้ดูแลทำได้ตามปกติ:

1. เปิดหน้า **Admin Desktop Host** หรือ **Domain Admin Desktop Host**
2. ไปที่ส่วน **Desktop Release Portal**
3. อัปโหลดไฟล์ตัวติดตั้ง
4. ใส่ version, platform, channel และ release notes ตามต้องการ
5. เลือกว่าจะเผยแพร่ทันทีหรือไม่
6. เผยแพร่ ยกเลิกเผยแพร่ รีเฟรช หรือลบ release ตามต้องการ

## ขั้นตอนการอัปโหลด

ตอนอัปโหลด release ให้เตรียม:

- ไฟล์ตัวติดตั้ง
- version
- platform
- channel
- installer format
- release notes แบบไม่บังคับ
- สถานะว่าจะเผยแพร่ทันทีหรือไม่

UI จะพยายามเดา installer format จากชื่อไฟล์ให้ก่อน แต่คุณยังแก้ได้ก่อนกดอัปโหลด

## Published กับ Hidden

release แต่ละตัวจะอยู่ได้ 2 สถานะหลัก:

- **Published**: ผู้ใช้ที่ล็อกอินอยู่มองเห็นใน release catalog
- **Hidden**: เก็บไฟล์ไว้ แต่ยังไม่เสนอเป็นตัวติดตั้งที่เผยแพร่แล้ว

ควรใช้ hidden เมื่อ:

- ต้องการตรวจ build ก่อน rollout กว้าง
- เตรียม beta หรือ nightly asset ไว้ล่วงหน้า
- preload ตัวติดตั้งก่อนถึงเวลาปล่อยจริง

## การลบ release

การลบจะเอา asset นั้นออกจาก catalog ถาวร ใช้เมื่อ:

- อัปโหลดไฟล์ผิด
- build ใช้งานไม่ได้และไม่ควรคงอยู่
- ต้องการ cleanup storage

ถ้าอาจต้องใช้ไฟล์นั้นอีกในอนาคต ให้ยกเลิกเผยแพร่แทนการลบ

## ความปลอดภัยและสิทธิ์การเข้าถึง

- การดู release catalog ต้องล็อกอินก่อน
- การอัปโหลด เผยแพร่ ยกเลิกเผยแพร่ และลบ ต้องใช้สิทธิ์ `admin`, `domain_admin` หรือ system-agent ที่ได้รับอนุญาต
- release ที่ยังไม่เผยแพร่จะเปิดให้เห็นเฉพาะแอดมินที่มีสิทธิ์เท่านั้น
- การดาวน์โหลดจะตั้งค่า attachment headers และ content-type protection เพื่อลดความกำกวมในการเปิดไฟล์

## แนวทางที่แนะนำ

- ใช้ semantic version ที่อ่านง่าย เช่น `1.4.0` หรือ `1.4.0-beta.2`
- ใส่ release notes แบบสั้นและชัดสำหรับทุก build ที่เผยแพร่
- เก็บ `stable` ไว้สำหรับ build ที่ผ่าน rollout checks แล้ว
- อัปโหลดรูปแบบตัวติดตั้งที่ตรงกับแต่ละแพลตฟอร์ม แทนการใช้ archive กลางเมื่อมี native installer อยู่แล้ว
- ถ้า asset มีปัญหา ให้ยกเลิกเผยแพร่ทันทีแล้วอัปโหลด build ที่แก้ไขแล้ว

## การแก้ปัญหาเบื้องต้น

### มองไม่เห็น desktop release เลย

- ล็อกอินก่อน เพราะ catalog ต้องใช้ session ที่ยืนยันตัวตนแล้ว
- ตรวจว่ามีอย่างน้อย 1 release ที่อยู่ในสถานะเผยแพร่

### เห็นแค่บางแพลตฟอร์ม

- แผงนี้จะแสดงเฉพาะ asset ที่เผยแพร่แล้ว
- ขอให้แอดมินอัปโหลดและเผยแพร่ build สำหรับแพลตฟอร์มที่ยังขาด

### อัปโหลดไม่สำเร็จ

- ตรวจขนาดไฟล์แล้วลองใหม่
- ตรวจว่าใส่ version, platform และไฟล์ครบแล้ว
- ตรวจว่าสิทธิ์ของคุณเป็น admin หรือ domain admin

### มี release ที่ไม่ควรเป็น public แล้ว

- ยกเลิกเผยแพร่ ถ้ายังต้องการเก็บ asset ไว้
- ลบ ถ้าต้องการเอาออกถาวร

## คู่มือที่เกี่ยวข้อง

- [Desktop Host](./desktop-host.md)
- [Desktop Host Managed Mode](./desktop-host-managed-mode.md)

<!-- knowledge-graph:related:start -->
## หัวข้อที่เกี่ยวข้อง

- [[desktop-host|Desktop Host]]
- [[getting-started|เริ่มต้นใช้งาน]]
- [[document-management|จัดการเอกสาร]]
- [[browser-session|Browser Session]]
- [[cli|CLI (Kilo)]]
- [[desktop-host-managed-mode|Desktop Host Managed Mode]]
- [[docker-sandbox|Docker Sandbox]]
<!-- knowledge-graph:related:end -->
