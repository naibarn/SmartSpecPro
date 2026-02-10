# SmartSpecPro Reboot & Auto-Start Guide

## 📋 คำตอบสั้น: หลัง Reboot จะเกิดอะไร?

**ไม่สมบูรณ์** - บาง services จะ start อัตโนมัติ แต่ Backend และ Web ต้อง start manual

---

## 🔍 รายละเอียด: สถานะหลัง Reboot

### ✅ Services ที่ Start อัตโนมัติ (มี restart policy)

| Service | Restart Policy | สถานะหลัง Reboot |
|---------|---------------|-----------------|
| PostgreSQL | `restart: unless-stopped` | ✓ Auto-start |
| Redis | `restart: unless-stopped` | ✓ Auto-start |
| Nginx | `--restart unless-stopped` | ✓ Auto-start (ถ้า container ยังอยู่) |
| Celery Media Worker | `restart: unless-stopped` | ✓ Auto-start |
| Celery Video Worker | `restart: unless-stopped` | ✓ Auto-start |
| Celery Beat | `restart: unless-stopped` | ✓ Auto-start |
| Flower Dashboard | `restart: unless-stopped` | ✓ Auto-start |

### ❌ Services ที่ไม่ Start อัตโนมัติ

| Service | ทำไม | ต้องทำอะไร |
|---------|------|-----------|
| Python Backend | ทำงานใน screen session | `./run-services.sh start` |
| Web Application | ทำงานใน screen session | `./run-services.sh start` |

---

## ⚠️ ปัญหาที่อาจเกิดขึ้น

### 1. Timing Issues (ปัญหาลำดับการ start)
- Media workers อาจ start ก่อน PostgreSQL/Redis พร้อม
- Docker `depends_on` ไม่รอ healthcheck
- **ผลกระทบ**: Media workers อาจล้มเหลวและ restart หลายรอบ

### 2. Network Dependencies
- Media workers ต้องการ `smartspec-network` (external: true)
- Docker ไม่ auto-create external networks
- **ผลกระทบ**: ถ้า network หาย containers จะไม่ start

### 3. Nginx Container
- สร้างด้วย `docker run` (ไม่ใช่ compose)
- Container ต้องยังอยู่ (ไม่ถูก `rm`)
- **ผลกระทบ**: ถ้า container ถูกลบ Nginx จะไม่ start

---

## 🚀 วิธีแก้: ติดตั้ง Auto-Start (แนะนำ)

### วิธีที่ 1: ใช้ systemd service (Production-Ready)

```bash
# 1. ติดตั้ง auto-start service
sudo ./scripts/install-autostart.sh install

# 2. ตรวจสอบสถานะ
sudo systemctl status smartspec.service

# 3. ดู logs
sudo journalctl -u smartspec.service -f
```

**ข้อดี:**
- ✅ Auto-start ทุกอย่างหลัง reboot (รวม Backend และ Web)
- ✅ จัดการ network dependencies
- ✅ Restart อัตโนมัติถ้า service ล้มเหลว
- ✅ มี logging ผ่าน journalctl
- ✅ Production-ready

**คำสั่งที่เกี่ยวข้อง:**
```bash
# เช็คสถานะ
sudo systemctl status smartspec.service

# Restart service
sudo systemctl restart smartspec.service

# Stop service
sudo systemctl stop smartspec.service

# Disable auto-start (ไม่ start หลัง reboot)
sudo systemctl disable smartspec.service

# Enable auto-start (start หลัง reboot)
sudo systemctl enable smartspec.service

# ดู logs แบบ real-time
sudo journalctl -u smartspec.service -f

# ดู logs 100 บรรทัดล่าสุด
sudo journalctl -u smartspec.service -n 100
```

### วิธีที่ 2: Manual Start หลัง Reboot

ถ้าไม่ต้องการ auto-start สามารถ start manual ได้:

```bash
# หลัง reboot login เข้า SSH แล้วรัน
./run-services.sh start

# เช็คสถานะ
./run-services.sh status
```

---

## 🧪 ทดสอบการ Reboot

### ทดสอบโดยไม่ต้อง reboot จริง

```bash
# วิธีที่ 1: ใช้ systemd test (ต้องติดตั้ง auto-start ก่อน)
sudo ./scripts/install-autostart.sh test-reboot

# วิธีที่ 2: Manual stop/start
./run-services.sh stop
sleep 5
./run-services.sh start
./run-services.sh status
```

### ทดสอบ reboot จริง (ระวัง!)

```bash
# 1. Stop services
./run-services.sh stop

# 2. Reboot server
sudo reboot

# 3. หลัง reboot login เข้ามา
ssh user@server

# 4. เช็คสถานะ
cd /home/dev/projects/SmartSpecPro

# ถ้าใช้ systemd auto-start
sudo systemctl status smartspec.service
./run-services.sh status

# ถ้าไม่ได้ใช้ auto-start
./run-services.sh start
```

---

## 📊 สถานะที่คาดหวังหลัง Reboot

### กรณีที่ 1: ติดตั้ง Auto-Start แล้ว

```
━━━ Infrastructure Services ━━━
  ✓ PostgreSQL       Running (port 5432)
  ✓ Redis            Running (port 6379)
  ✓ Nginx            Running (ports 80, 443) → https://smartaihub.app

━━━ Application Services ━━━
  ✓ Python Backend   Running (healthy/degraded) → http://localhost:8000
  ✓ Web Application  Running → http://localhost:3000

━━━ Celery Workers ━━━
  ✓ Media Worker     Running (health: healthy)
  ✓ Video Worker     Running
  ✓ Beat Scheduler   Running
  ✓ Flower Dashboard Running → http://localhost:5555

━━━ Service Summary ━━━
  All services running (9/10)
```

### กรณีที่ 2: ไม่ติดตั้ง Auto-Start

```
━━━ Infrastructure Services ━━━
  ✓ PostgreSQL       Running (port 5432)
  ✓ Redis            Running (port 6379)
  ⚠ Nginx            อาจ Running หรือ Not running

━━━ Application Services ━━━
  ✗ Python Backend   Not running
  ✗ Web Application  Not running

━━━ Celery Workers ━━━
  ✓ Media Worker     Running
  ✓ Video Worker     Running
  ✓ Beat Scheduler   Running
  ✓ Flower Dashboard Running

━━━ Service Summary ━━━
  Partial deployment (5/9)
```

**ต้องรัน:** `./run-services.sh start` เพื่อ start Backend และ Web

---

## 🛠️ การถอนการติดตั้ง Auto-Start

ถ้าต้องการถอน auto-start service:

```bash
# ถอน auto-start
sudo ./scripts/install-autostart.sh remove

# ตรวจสอบว่าถอนสำเร็จ
sudo systemctl status smartspec.service
# ควรแสดง "Unit smartspec.service could not be found"
```

---

## 📌 สรุป

| สถานการณ์ | ผลลัพธ์หลัง Reboot | คำแนะนำ |
|-----------|-------------------|---------|
| **Production Server** | ต้องการ 100% uptime | ✅ **ติดตั้ง auto-start** |
| **Development Local** | Manual start ได้ | ⚠️ Auto-start หรือ manual ก็ได้ |
| **Testing Environment** | Manual control ดีกว่า | ❌ ไม่ต้อง auto-start |

---

## ❓ FAQ

**Q: ถ้า reboot แล้วบาง service ไม่ start ต้องทำยังไง?**
```bash
# เช็ค logs
sudo journalctl -u smartspec.service -n 100

# Start manual
./run-services.sh start

# เช็คสถานะทีละ service
docker ps -a
screen -list
```

**Q: ถ้าต้องการ disable auto-start ชั่วคราว?**
```bash
# Disable (ไม่ start หลัง reboot ครั้งถัดไป)
sudo systemctl disable smartspec.service

# แต่ service ยังทำงานอยู่ ถ้าต้องการ stop
sudo systemctl stop smartspec.service
```

**Q: ถ้า systemd service มีปัญหา?**
```bash
# เช็ค errors
sudo journalctl -u smartspec.service -n 50

# ดู service configuration
sudo systemctl cat smartspec.service

# Reload configuration
sudo systemctl daemon-reload
sudo systemctl restart smartspec.service
```

**Q: Network `smartspec-network` หายไปหลัง reboot?**
```bash
# สร้าง network manual
docker network create smartspec-network
docker network create smartspecpro_default

# แล้ว restart services
./run-services.sh restart
```

---

## 🔗 Related Commands

```bash
# ดูสถานะทั้งหมด
./run-services.sh status

# Start services
./run-services.sh start

# Stop services
./run-services.sh stop

# Restart specific service
./run-services.sh restart backend
./run-services.sh restart web
./run-services.sh restart media

# เช็ค systemd auto-start
sudo systemctl is-enabled smartspec.service
sudo systemctl is-active smartspec.service
```
