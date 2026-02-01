# 🚀 SmartSpecPro - Quick Start Guide

**อัพเดต:** 2026-01-27 06:03

---

## ✅ ระบบพร้อมใช้งาน!

### 🌐 เข้าใช้งานได้ทันที:

```
URL:      https://192.168.1.118
Email:    admin@smartspec.pro
Password: Admin@123!
```

**หรือ** (ถ้าตั้งค่า hosts file แล้ว):
```
URL:      https://smartspec.local
```

---

## 📋 Services Status

| Service | Status | Port | Command |
|---------|--------|------|---------|
| **Nginx** | ✅ Running | 80, 443 | `sudo systemctl status nginx` |
| **Frontend** | ✅ Running | 3000 | `ps aux \| grep tsx` |
| **Backend** | ✅ Running | 8000 | `ps aux \| grep uvicorn` |
| **PostgreSQL** | ✅ Running | 5432 | `docker ps` |
| **Redis** | ✅ Running | 6379 | `docker ps` |

---

## 🎯 การใช้งาน

### 1. เข้าระบบ
- เปิด browser ไปที่ `https://192.168.1.118`
- Browser จะแสดง certificate warning → คลิก **"Advanced"** → **"Proceed"**
- Login ด้วย `admin@smartspec.pro` / `Admin@123!`

### 2. สร้าง Specification
- คลิกที่เมนู "Generate"
- เลือกประเภทเอกสาร
- กรอกข้อมูล
- กด "Generate"

### 3. จัดการ Gallery
- คลิกที่เมนู "Gallery"
- ดูเอกสารที่สร้างไว้ทั้งหมด
- Download, Edit, Delete

---

## 🔧 คำสั่งที่สำคัญ

### Start Services:
```bash
# Start Frontend
./dev-local.sh web

# Start Backend
./dev-local.sh backend

# Start All (in separate terminals)
./dev-local.sh backend &
./dev-local.sh web
```

### Stop Services:
```bash
# Stop Frontend
pkill -f "tsx.*server/_core"

# Stop Backend
pkill -f "uvicorn.*app.main"

# Stop Nginx
sudo systemctl stop nginx

# Stop All
pkill -f "tsx.*server/_core"
pkill -f "uvicorn.*app.main"
```

### Restart Services:
```bash
# Restart Nginx
sudo systemctl restart nginx

# Restart Frontend (stop then start)
pkill -f "tsx.*server/_core" && ./dev-local.sh web

# Restart Backend (stop then start)
pkill -f "uvicorn.*app.main" && ./dev-local.sh backend
```

### Check Logs:
```bash
# Nginx Logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Frontend Logs
# (shown in terminal where you ran ./dev-local.sh web)

# Backend Logs
# (shown in terminal where you ran ./dev-local.sh backend)

# Database Logs
docker logs -f smartspec-postgres

# Redis Logs
docker logs -f smartspec-redis
```

---

## 🐛 Troubleshooting

### ปัญหา: ไม่สามารถเข้าถึง HTTPS ได้

**ตรวจสอบ:**
```bash
# 1. Nginx ทำงานหรือไม่?
sudo systemctl status nginx

# 2. Port 443 เปิดหรือไม่?
sudo ss -tlnp | grep :443

# 3. Frontend ทำงานหรือไม่?
curl http://localhost:3000

# 4. Restart ทั้งหมด
sudo systemctl restart nginx
pkill -f "tsx.*server/_core" && ./dev-local.sh web
```

---

### ปัญหา: Frontend ไม่ขึ้น (502 Bad Gateway)

**สาเหตุ:** Frontend service ไม่ทำงาน

**แก้ไข:**
```bash
# Kill old process
pkill -f "tsx.*server/_core"

# Start fresh
./dev-local.sh web
```

---

### ปัญหา: API ไม่ทำงาน

**สาเหตุ:** Backend service ไม่ทำงาน

**แก้ไข:**
```bash
# Kill old process
pkill -f "uvicorn.*app.main"

# Start fresh
./dev-local.sh backend
```

---

### ปัญหา: Database connection failed

**สาเหตุ:** PostgreSQL ไม่ทำงาน

**แก้ไข:**
```bash
# Check Docker containers
docker ps -a

# Start PostgreSQL if stopped
docker start smartspec-postgres

# Check logs
docker logs smartspec-postgres
```

---

### ปัญหา: Certificate Warning ทุกครั้ง

**สาเหตุ:** ใช้ Self-Signed Certificate

**ไม่สามารถแก้ได้ (ปกติสำหรับ development)**

**ทางเลือก:**
1. Accept warning ทุกครั้ง
2. Import certificate เข้า browser
3. ใช้ Let's Encrypt (สำหรับ production)

---

## 📚 เอกสารเพิ่มเติม

| เอกสาร | เนื้อหา |
|--------|---------|
| [NGINX_SETUP_COMPLETE.md](NGINX_SETUP_COMPLETE.md) | รายละเอียด nginx configuration |
| [EXTERNAL_ACCESS_GUIDE.md](EXTERNAL_ACCESS_GUIDE.md) | การเข้าถึงจากเครื่องอื่น |
| [CHROME_HTTPS_SOLUTIONS.md](CHROME_HTTPS_SOLUTIONS.md) | แก้ปัญหา Chrome HTTPS redirect |
| [TENANT_SETUP_FIXED.md](TENANT_SETUP_FIXED.md) | รายละเอียด tenant configuration |
| [START_BACKEND.md](START_BACKEND.md) | การ setup backend |

---

## 🔐 ข้อมูลสำคัญ

### Admin Account:
```
Email:    admin@smartspec.pro
Password: Admin@123!
Credits:  100,000
Plan:     ENTERPRISE
```

### Database:
```
Host:     localhost
Port:     5432
Database: smartspec
User:     smartspec
Password: smartspec123
```

### Redis:
```
Host:     localhost
Port:     6379
```

---

## 🎉 ขั้นตอนถัดไป (Optional)

### 1. เปลี่ยน Admin Password
```bash
# หลัง login ครั้งแรก:
1. ไปที่ Profile Settings
2. เปลี่ยน password
3. Logout และ login ใหม่
```

### 2. เพิ่ม LLM API Keys
```bash
# แก้ไข python-backend/.env:
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
GOOGLE_API_KEY=your_key_here
```

### 3. Setup Domain Name (Production)
```bash
# 1. ซื้อ domain
# 2. Point DNS A Record → Your Public IP
# 3. Install Let's Encrypt:
sudo certbot --nginx -d yourdomain.com
```

### 4. Backup Database
```bash
# Export database
docker exec smartspec-postgres pg_dump -U smartspec smartspec > backup.sql

# Restore
docker exec -i smartspec-postgres psql -U smartspec smartspec < backup.sql
```

---

## 📞 ต้องการความช่วยเหลือ?

### ตรวจสอบระบบ:
```bash
# 1. Check all services
ps aux | grep -E "tsx|uvicorn|nginx"

# 2. Check ports
sudo ss -tlnp | grep -E ":80|:443|:3000|:8000|:5432|:6379"

# 3. Check Docker
docker ps -a

# 4. Test connectivity
curl -k https://localhost
curl http://localhost:8000/health
```

### ข้อมูลที่ควรให้:
1. Output จากคำสั่งด้านบน
2. Nginx error log: `sudo tail -100 /var/log/nginx/error.log`
3. Screenshot ของ error (ถ้ามี)
4. Browser Console (F12 → Console tab)

---

**ระบบพร้อมใช้งานเต็มรูปแบบแล้ว!** 🚀
