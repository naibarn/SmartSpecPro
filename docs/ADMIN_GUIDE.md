# 🛠️ SmartSpecPro System Administrator Guide

คู่มือฉบับนี้รวบรวมขั้นตอนและเครื่องมือสำหรับการดูแลจัดการระบบ **SmartSpecPro** ทั้งหมด ตั้งแต่การทดสอบในเครื่อง Local ไปจนถึงการบริหารจัดการในระดับ Production สำหรับผู้ดูแลระบบ (Admin)

---

## 📋 สารบัญ
1. [การเตรียมความพร้อม (Prerequisites)](#1-การเตรียมความพร้อม)
2. [การทดสอบระบบใน Local PC (Development)](#2-การทดสอบระบบใน-local-pc)
3. [การจัดการระบบ Full Stack (Management Scripts)](#3-การจัดการระบบ-full-stack)
4. [การ Deploy ขึ้น Production](#4-การ-deploy-ขึ้น-production)
5. [การสำรองข้อมูลและการกู้คืน (Backup & Recovery)](#5-การสำรองข้อมูลและการกู้คืน)
6. [การตรวจสอบสถานะและการแจ้งเตือน (Monitoring & Alerts)](#6-การตรวจสอบสถานะและการแจ้งเตือน)
7. [การแก้ไขปัญหาเบื้องต้น (Troubleshooting)](#7-การแก้ไขปัญหาเบื้องต้น)

---

## 1. การเตรียมความพร้อม
เพื่อให้สามารถรันระบบและสคริปต์จัดการได้ทั้งหมด เครื่อง Server หรือ Local PC ควรมีซอฟต์แวร์ดังนี้:
- **Docker & Docker Compose**: สำหรับรัน Backend, Database และ Services ต่างๆ
- **Node.js & pnpm**: สำหรับ Frontend และ Desktop App
- **Rust & Cargo**: สำหรับ Tauri (Desktop App Core)
- **Git CLI**: สำหรับการจัดการโค้ด

---

## 2. การทดสอบระบบใน Local PC
ก่อนการ Deploy ทุกครั้ง ควรทำการทดสอบความถูกต้องของโค้ดและ UI

### การรัน Unit & Integration Tests
```bash
# ทดสอบ Frontend (React Components)
cd desktop-app && pnpm vitest run

# ทดสอบ Backend (Rust Logic)
cd src-tauri && cargo test
```

### การรันแอปพลิเคชันในโหมดพัฒนา
```bash
cd desktop-app && pnpm tauri dev
```

---

## 3. การจัดการระบบ Full Stack
เราได้เตรียมชุดสคริปต์อัตโนมัติเพื่อให้ Admin จัดการทุกโมดูลได้ง่ายขึ้นในคำสั่งเดียว:

| คำสั่ง | คำอธิบาย |
| :--- | :--- |
| `./run-all.sh` | **เริ่ม** ระบบทั้งหมด (Docker Services + Desktop App) |
| `./stop-all.sh` | **หยุด** การทำงานของทุกโมดูลและคืนทรัพยากรเครื่อง |
| `./restart-all.sh` | **รีสตาร์ท** ระบบทั้งหมด (เหมาะสำหรับใช้หลังแก้คอนฟิก) |
| `./status-all.sh` | **ตรวจสอบสถานะ** สุขภาพของทุก Service และพอร์ตที่ใช้งาน |

---

## 4. การ Deploy ขึ้น Production
การ Deploy ในโหมด Production จะใช้การตั้งค่าที่เน้นความปลอดภัยและประสิทธิภาพสูงสุด

### ขั้นตอนการ Deploy
1. ตรวจสอบไฟล์ `.env` ให้แน่ใจว่ารหัสผ่านและ API Keys ถูกต้อง
2. รันสคริปต์ Deploy:
   ```bash
   ./deploy-prod.sh
   ```
   *สคริปต์จะทำการ Test -> Build Docker -> Build Desktop Release -> Start Services*

---

## 5. การสำรองข้อมูลและการกู้คืน
ข้อมูลเป็นสิ่งสำคัญที่สุด ระบบจึงมีกลไกการสำรองข้อมูลอัตโนมัติ

### การสำรองข้อมูล (Backup)
รันสคริปต์เพื่อสำรองข้อมูล PostgreSQL ทันที:
```bash
./backup-prod.sh
```
*ไฟล์จะถูกเก็บไว้ใน `./backups/` และจะเก็บไว้ย้อนหลัง 7 วัน*

### การทดสอบการกู้คืน (Restore Verification)
เพื่อให้มั่นใจว่าไฟล์สำรองใช้งานได้จริง ให้รัน:
```bash
./restore-test.sh
```

### การตั้งค่าอัตโนมัติ (Automation)
ติดตั้ง Cron Job เพื่อให้ระบบสำรองข้อมูลทุกวันและทดสอบกู้คืนทุกสัปดาห์:
```bash
./setup-cron.sh
```

---

## 6. การตรวจสอบสถานะและการแจ้งเตือน

### การดู Log ใน Production
Admin สามารถดู Log แยกตามบริการได้เพื่อวิเคราะห์ปัญหา:
```bash
# ดู Log ของ Backend แบบ Real-time
./logs-prod.sh backend -f

# ดู Log ของ Web Application 50 บรรทัดล่าสุด
./logs-prod.sh web --tail 50
```

### ระบบแจ้งเตือน (Alerting)
รันระบบเฝ้าระวังในพื้นหลังเพื่อส่งแจ้งเตือนเข้า Discord/Slack เมื่อระบบล่ม:
```bash
# ตั้งค่า ALERT_WEBHOOK_URL ใน .env ก่อน
./alert-monitor.sh daemon &
```

---

## 7. การแก้ไขปัญหาเบื้องต้น (Troubleshooting)

| ปัญหา | วิธีแก้ไข |
| :--- | :--- |
| **พอร์ตค้าง (Port already in use)** | รัน `./stop-all.sh` เพื่อเคลียร์พอร์ตที่ค้างอยู่ |
| **ฐานข้อมูลเชื่อมต่อไม่ได้** | ตรวจสอบสถานะด้วย `./status-all.sh` และดู Log ด้วย `./logs-prod.sh db` |
| **แอปพลิเคชันอืดหรือค้าง** | รัน `./restart-prod.sh all` เพื่อรีเฟรชบริการทั้งหมด |
| **Webhook ไม่แจ้งเตือน** | ตรวจสอบ URL ในสคริปต์ `alert-monitor.sh` และทดสอบด้วย `./alert-monitor.sh once` |

---
*จัดทำโดย: Manus AI Agent*
*อัปเดตล่าสุด: 14 มกราคม 2026*
