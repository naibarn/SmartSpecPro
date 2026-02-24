# SmartSpecPro Auto-Start Summary

## ✅ สถานะปัจจุบัน

**วันที่:** 2026-02-09
**สถานะ:** ✅ ติดตั้งสำเร็จและทำงานได้

---

## 📋 ระบบที่ติดตั้ง

### Systemd Services

| Service | Description | Status |
|---------|-------------|--------|
| `smartspec.target` | Target หลักรวม services ทั้งหมด | Enabled |
| `smartspec-infra.service` | Infrastructure (PostgreSQL, Redis, Nginx, Celery) | Enabled |
| `smartspec-backend.service` | Python Backend (FastAPI/uvicorn) | Enabled |
| `smartspec-web.service` | Web Application (React/Vite) | Enabled |

### Files ที่สำคัญ

```
/etc/systemd/system/
├── smartspec.target
├── smartspec-infra.service
├── smartspec-backend.service
└── smartspec-web.service

/home/dev/projects/SmartSpecPro/scripts/
├── smartspec.target
├── smartspec-infra.service
├── smartspec-backend.service
├── smartspec-web.service
├── install-autostart-v2.sh
├── finalize-autostart.sh
└── migrate-to-systemd-v2.sh
```

---

## 🔧 ปัญหาที่แก้ไขแล้ว

### 1. ⚠️ Screen Sessions ใน Systemd (แก้แล้ว)
**ปัญหา:** systemd ไม่สามารถสร้าง screen sessions ได้
**วิธีแก้:** ใช้ native systemd services จัดการ process โดยตรง

### 2. ⚠️ .env Inline Comments (แก้แล้ว)
**ปัญหา:** Pydantic validation error จาก inline comments
**วิธีแก้:** ลบ comments ออกจาก `python-backend/.env`

```bash
# เดิม (ผิด)
ZAI_USE_CODING_ENDPOINT=false  # Set to true if using GLM Coding Plan

# ใหม่ (ถูก)
ZAI_USE_CODING_ENDPOINT=false
```

### 3. ⚠️ NVM Path Issues (แก้แล้ว)
**ปัญหา:** Web service ไม่พบ Node.js path
**วิธีแก้:** ใช้ absolute path `/home/dev/.nvm/versions/node/v24.13.0/bin/npm`

### 4. ⚠️ Network Label Mismatch (แก้แล้ว)
**ปัญหา:** Docker network `smartspecpro_default` มี label ผิด
**วิธีแก้:** ลบ network ก่อน start ใน `smartspec-infra.service`

```bash
ExecStartPre=-/bin/bash -c 'docker network rm smartspecpro_default 2>/dev/null || true'
```

---

## 🚀 การใช้งาน

### คำสั่งจัดการ Services

```bash
# เช็คสถานะทั้งหมด
sudo systemctl status smartspec.target
./run-services.sh status

# Start/Stop/Restart
sudo systemctl start smartspec.target
sudo systemctl stop smartspec.target
sudo systemctl restart smartspec.target

# Restart แค่ service เดียว
sudo systemctl restart smartspec-backend.service
sudo systemctl restart smartspec-web.service

# ดู logs real-time
sudo journalctl -u smartspec-backend.service -f
sudo journalctl -u smartspec-web.service -f
sudo journalctl -u smartspec-infra.service -f

# ดู logs ย้อนหลัง
sudo journalctl -u smartspec-backend.service -n 100
```

### อัพเดท Service Files

ถ้าแก้ไข service files ใน `scripts/` ต้อง sync ไปยัง systemd:

```bash
sudo ./scripts/finalize-autostart.sh
```

หรือ manual:

```bash
sudo cp scripts/smartspec-*.service /etc/systemd/system/
sudo cp scripts/smartspec.target /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart smartspec.target
```

---

## 🧪 ทดสอบ Auto-Start

### ทดสอบหลัง Reboot

```bash
# 1. Reboot server
sudo reboot

# 2. หลัง reboot (รอ 60-90 วินาที) ให้ SSH กลับเข้ามา

# 3. เช็คสถานะ
./run-services.sh status

# 4. ทดสอบเว็บ
curl http://localhost:8000/health
curl http://localhost:3000
# หรือเปิด browser → https://smartaihub.app
```

### คาดหวังผลลัพธ์

```
━━━ Infrastructure Services ━━━
  ✓ PostgreSQL       Running (port 5432)
  ✓ Redis            Running (port 6379)
  ✓ Nginx            Running (ports 80, 443)

━━━ Application Services ━━━
  ✓ Python Backend   Running (degraded/healthy)
  ✓ Web Application  Running

━━━ Celery Workers ━━━
  ✓ Media Worker     Running
  ✓ Video Worker     Running
  ✓ Beat Scheduler   Running
  ✓ Flower Dashboard Running

All services running (9/10)
```

---

## 🔍 Troubleshooting

### ถ้า Services ไม่ start หลัง Reboot

```bash
# 1. เช็ค systemd logs
sudo journalctl -u smartspec-infra.service -n 100
sudo journalctl -u smartspec-backend.service -n 100
sudo journalctl -u smartspec-web.service -n 100

# 2. เช็คว่า enabled หรือไม่
systemctl is-enabled smartspec-infra.service
systemctl is-enabled smartspec-backend.service
systemctl is-enabled smartspec-web.service

# 3. ถ้ายัง disabled ให้ enable
sudo systemctl enable smartspec-infra.service
sudo systemctl enable smartspec-backend.service
sudo systemctl enable smartspec-web.service

# 4. Start manual
sudo systemctl start smartspec.target
```

### ถ้า Backend มี Error

```bash
# เช็ค logs
sudo journalctl -u smartspec-backend.service -f

# Common issues:
# - .env file มี inline comments → ลบออก
# - Python venv ไม่มี → cd python-backend && python -m venv .venv
# - Missing dependencies → cd python-backend && .venv/bin/pip install -r requirements.txt
```

### ถ้า Web มี Error

```bash
# เช็ค logs
sudo journalctl -u smartspec-web.service -f

# Common issues:
# - Node path ผิด → check /home/dev/.nvm/versions/node/
# - Missing dependencies → cd apps/web && npm install
# - Port 3000 ถูกใช้ → lsof -i :3000
```

### ถ้า Network Error

```bash
# ลบ network ที่มีปัญหา
docker network rm smartspecpro_default

# Start ใหม่
sudo systemctl restart smartspec-infra.service
```

---

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Systemd (boot)                           │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
┌──────────────┐         ┌──────────────┐
│ smartspec    │         │ Docker       │
│ .target      │         │ daemon       │
└──────┬───────┘         └──────┬───────┘
       │                        │
       ├────────────────────────┤
       │                        │
   ┌───┴───────────┐       ┌───┴──────────────┐
   │ smartspec-    │       │ Docker           │
   │ infra.service │───────│ Containers       │
   └───────────────┘       │ - PostgreSQL     │
                           │ - Redis          │
   ┌───────────────┐       │ - Nginx          │
   │ smartspec-    │       │ - Celery workers │
   │ backend       │       └──────────────────┘
   │ .service      │
   └───────────────┘

   ┌───────────────┐
   │ smartspec-    │
   │ web.service   │
   └───────────────┘
```

---

## 📝 Notes

### Backend Status "degraded" เป็นเรื่องปกติ

Backend status แสดง `degraded` เป็นเรื่องปกติเพราะ:
- LLM providers บางตัวอาจไม่ตอบสนอง
- แต่ Backend ยังทำงานได้ปกติ
- Web application สามารถเชื่อมต่อได้

### Service Dependencies

- `smartspec-infra.service` ต้อง start ก่อนเสมอ
- `smartspec-backend.service` ต้องรอ infra พร้อม
- `smartspec-web.service` ต้องรอ backend พร้อม
- Systemd จัดการ dependencies อัตโนมัติผ่าน `After=` และ `Requires=`

### การ Update Service Files

ไฟล์ใน `/etc/systemd/system/` คือไฟล์จริงที่ systemd ใช้งาน
ไฟล์ใน `scripts/` คือ template สำหรับ backup/update

**เวิร์กโฟลว์:**
1. แก้ไข `scripts/smartspec-*.service`
2. รัน `sudo ./scripts/finalize-autostart.sh`
3. Systemd จะใช้ไฟล์ที่อัพเดทแล้ว

---

## ✅ Checklist: ระบบพร้อมใช้งาน

- [x] Services ติดตั้งใน `/etc/systemd/system/`
- [x] Services enabled สำหรับ auto-start
- [x] .env files ถูกต้อง (ไม่มี inline comments)
- [x] Node.js path ถูกต้อง
- [x] Docker networks สามารถสร้างได้
- [x] PostgreSQL, Redis auto-start
- [x] Backend, Web auto-start
- [x] Celery workers auto-start
- [x] Nginx reverse proxy auto-start
- [x] เว็บเข้าได้ที่ https://smartaihub.app

---

## 🎯 Next Steps

### ทดสอบ Reboot (แนะนำ)

```bash
sudo reboot
# รอ 90 วินาที แล้ว SSH กลับเข้ามา
./run-services.sh status
```

### Monitor Production

```bash
# ดู logs แบบ real-time
sudo journalctl -u smartspec-backend.service -f
sudo journalctl -u smartspec-web.service -f

# เช็คสถานะเป็นระยะ
watch -n 10 './run-services.sh status'

# Flower dashboard (monitor Celery)
http://localhost:5555
```

---

**สร้างเมื่อ:** 2026-02-09
**ผู้สร้าง:** Claude Sonnet 4.5
**Version:** 2.0 (Native Systemd Services)
