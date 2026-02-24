# ✅ SmartSpecPro - Setup Checklist

## 📋 สิ่งที่เตรียมไว้แล้ว

### ไฟล์ Configuration
- ✅ `.env.local` - Environment variables สำหรับ local development
- ✅ `QUICKSTART.md` - คู่มือเริ่มต้นใช้งานด่วน
- ✅ `dev-local.sh` - Script สำหรับรัน local (มีอยู่แล้ว)
- ✅ `dev.sh` - Script สำหรับรัน Docker (มีอยู่แล้ว)
- ✅ File permissions แก้ไขเป็น `dev:dev` แล้ว

---

## 🔧 สิ่งที่ต้องติดตั้งก่อนใช้งาน

### 1. Docker & Docker Compose

**ตรวจสอบว่าติดตั้งแล้วหรือยัง:**
```bash
docker --version
docker compose version
```

**ถ้ายังไม่มี - ติดตั้ง Docker:**

#### Ubuntu/Debian:
```bash
# ติดตั้ง Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# เพิ่ม user เข้า docker group (ไม่ต้องใช้ sudo)
sudo usermod -aG docker $USER

# ออกจาระบบและเข้าใหม่ หรือรันคำสั่งนี้
newgrp docker

# ทดสอบ
docker --version
docker compose version
```

#### macOS:
```bash
# ติดตั้ง Docker Desktop
brew install --cask docker

# เปิด Docker Desktop application
open -a Docker
```

#### Windows (WSL2):
1. ติดตั้ง Docker Desktop for Windows
2. Enable WSL2 integration
3. ทดสอบใน WSL terminal: `docker --version`

---

### 2. Node.js & pnpm (สำหรับรัน Web/Frontend บน Host)

**ตรวจสอบ:**
```bash
node --version   # ต้องการ v20+
pnpm --version
```

**ติดตั้ง:**
```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# pnpm
npm install -g pnpm

# ตรวจสอบ
node --version
pnpm --version
```

---

### 3. Python 3.11 (สำหรับรัน Backend บน Host)

**ตรวจสอบ:**
```bash
python3 --version  # ต้องการ 3.11+
```

**ติดตั้ง:**
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y python3.11 python3.11-venv python3-pip

# Build tools
sudo apt install -y gcc g++ make build-essential libpq-dev

# ตรวจสอบ
python3.11 --version
```

---

## 🚀 วิธีใช้งาน (หลังติดตั้งครบ)

### Option A: dev-local.sh (แนะนำ - เร็ว, hot reload ดี)

```bash
cd /home/dev/projects/SmartSpecPro

# 1. เริ่ม Infrastructure (PostgreSQL + Redis ใน Docker)
./dev-local.sh start

# 2. เปิด Terminal ใหม่ 3 หน้าต่าง:

# Terminal 1: Web Frontend
./dev-local.sh web

# Terminal 2: Python Backend
./dev-local.sh backend

# Terminal 3: Celery Worker (optional)
./dev-local.sh celery
```

### Option B: dev.sh (ทุกอย่างใน Docker)

```bash
# เริ่มทุก service พร้อมกัน
./dev.sh start

# ดูสถานะ
./dev.sh status

# ดู logs
./dev.sh logs

# หยุด
./dev.sh stop
```

---

## 📍 Services URLs

เมื่อรันแล้ว เปิด browser ที่:

| Service | URL |
|---------|-----|
| **SmartSpec Web** | http://localhost:3000 |
| **Python Backend** | http://localhost:8000 |
| **API Docs** | http://localhost:8000/docs |
| **Control Plane** | http://localhost:7070 |
| **Flower (Celery)** | http://localhost:5555 |

---

## 🔑 เพิ่ม API Keys (Optional)

ถ้าต้องการใช้ LLM features:

```bash
# แก้ไขไฟล์
nano .env.local

# เพิ่ม API keys
OPENAI_API_KEY=sk-your-key-here
ANTHROPIC_API_KEY=sk-ant-your-key-here
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

---

## 🐛 Troubleshooting

### Port ถูกใช้งานอยู่
```bash
# หา process ที่ใช้ port
lsof -i :8000
lsof -i :3000

# Kill process
kill -9 <PID>
```

### Docker daemon not running
```bash
# Start Docker
sudo systemctl start docker

# Enable auto-start
sudo systemctl enable docker
```

### Permission denied
```bash
# เพิ่ม user เข้า docker group
sudo usermod -aG docker $USER
newgrp docker
```

---

## 📚 เอกสารเพิ่มเติม

- `QUICKSTART.md` - คู่มือเริ่มต้นใช้งานด่วน
- `README.md` - ข้อมูลโปรเจกต์
- `dev-local.sh help` - คำสั่งที่ใช้ได้ทั้งหมด

---

## ✨ Next Steps

1. ✅ ติดตั้ง Docker
2. ✅ ติดตั้ง Node.js & pnpm
3. ✅ ติดตั้ง Python 3.11
4. ✅ รัน `./dev-local.sh start`
5. ✅ เปิด http://localhost:3000

---

**Happy Coding! 🚀**
