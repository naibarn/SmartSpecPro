# 🚀 SmartSpecPro - Quick Start Guide

## วิธีรัน Development Environment

### Option 1: ใช้ dev-local.sh (แนะนำ - เร็ว, hot reload ดี)

**Infrastructure ใน Docker, Apps บน Host**

```bash
# 1. เริ่ม Infrastructure (PostgreSQL + Redis)
./dev-local.sh start

# 2. เปิด Terminal ใหม่ 3 หน้าต่าง:

# Terminal 1: รัน Web Frontend
./dev-local.sh web

# Terminal 2: รัน Python Backend
./dev-local.sh backend

# Terminal 3: รัน Celery Worker (optional)
./dev-local.sh celery
```

**ตรวจสอบสถานะ:**
```bash
./dev-local.sh status
```

**หยุดการทำงาน:**
```bash
# กด Ctrl+C ใน Terminal ที่รัน web/backend/celery
# หยุด Infrastructure
./dev-local.sh stop
```

---

### Option 2: ใช้ dev.sh (ทุกอย่างใน Docker)

```bash
# เริ่มทุกอย่างพร้อมกัน
./dev.sh start

# ดู logs
./dev.sh logs

# ดูสถานะ
./dev.sh status

# หยุด
./dev.sh stop
```

---

## 📍 Services URLs

| Service | URL |
|---------|-----|
| SmartSpec Web | http://localhost:3000 |
| Python Backend | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| API ReDoc | http://localhost:8000/redoc |
| Control Plane | http://localhost:7070 |
| Docker Status | http://localhost:3001 |
| Flower (Celery) | http://localhost:5555 |

---

## 🔧 Database Commands

```bash
# เปิด PostgreSQL shell
./dev-local.sh db shell

# รัน migrations
./dev-local.sh db migrate
```

---

## 🐛 Troubleshooting

### Port already in use
```bash
# หา process ที่ใช้ port
lsof -i :8000
lsof -i :3000

# Kill process
kill -9 <PID>
```

### Docker containers ค้างอยู่
```bash
docker ps -a
docker stop $(docker ps -aq)
docker rm $(docker ps -aq)
```

### ลบ volumes และเริ่มใหม่
```bash
./dev.sh clean
```

---

## 📝 Configuration Files

- `.env.local` - สำหรับ dev-local.sh (localhost)
- `.env.example` - Template
- `docker-compose.dev.yml` - Development compose
- `docker-compose.yml` - Production compose

---

## 🎯 Workflow แนะนำ

1. ใช้ `dev-local.sh` สำหรับ development ทั่วไป (เร็ว, hot reload ดี)
2. ใช้ `dev.sh` เมื่อต้องการทดสอบ Docker setup
3. ใช้ `./dev.sh build` เมื่อแก้ไข Dockerfile หรือ dependencies

---

## 🔑 เพิ่ม API Keys

แก้ไขไฟล์ `.env.local`:

```bash
nano .env.local

# หรือ
vim .env.local
```

เพิ่ม API keys:
```bash
OPENAI_API_KEY=sk-your-key-here
ANTHROPIC_API_KEY=sk-ant-your-key-here
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

---

## 📚 คำสั่งที่ใช้บ่อย

```bash
# dev-local.sh commands
./dev-local.sh help          # ดูวิธีใช้งาน
./dev-local.sh start         # เริ่ม infrastructure
./dev-local.sh stop          # หยุด infrastructure
./dev-local.sh status        # ตรวจสอบสถานะ
./dev-local.sh web           # รัน web frontend
./dev-local.sh backend       # รัน python backend
./dev-local.sh celery        # รัน celery worker
./dev-local.sh db shell      # เปิด PostgreSQL shell
./dev-local.sh db migrate    # รัน migrations
./dev-local.sh infra logs    # ดู infrastructure logs

# dev.sh commands
./dev.sh start               # เริ่มทุก service
./dev.sh stop                # หยุดทุก service
./dev.sh restart             # restart services
./dev.sh logs [service]      # ดู logs
./dev.sh build               # rebuild images
./dev.sh clean               # ลบ containers & volumes
```

---

**สร้างโดย:** Claude Code Assistant  
**วันที่:** 2026-01-26  
**เวอร์ชัน:** 1.0.0
