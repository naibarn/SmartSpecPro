# SmartSpec Pro - Installation Guide

**Version:** 1.0.0  
**Date:** December 29, 2025

---

## 🚀 Quick Installation

เราได้เตรียมสคริปต์อัตโนมัติสำหรับติดตั้ง environment ทั้งหมดในครั้งเดียว!

### macOS / Linux

```bash
# 1. เข้าไปที่โฟลเดอร์โปรเจค
cd /path/to/smartspecpro

# 2. รันสคริปต์ติดตั้ง
chmod +x setup.sh
./setup.sh

# 3. Reload shell profile
source ~/.zshrc  # หรือ source ~/.bashrc

# 4. รันแอป
pnpm tauri dev
```

### Windows

```powershell
# 1. เปิด PowerShell as Administrator
# Right-click PowerShell → "Run as Administrator"

# 2. เข้าไปที่โฟลเดอร์โปรเจค
cd C:\path\to\smartspecpro

# 3. รันสคริปต์ติดตั้ง
.\setup.ps1

# 4. ปิดและเปิด PowerShell ใหม่

# 5. รันแอป
pnpm tauri dev
```

---

## 📋 สิ่งที่สคริปต์จะติดตั้ง

### macOS / Linux
1. **Homebrew** (macOS) หรือ **apt-get/yum/dnf** (Linux)
2. **Node.js 22+**
3. **pnpm**
4. **Rust** (via rustup)
5. **Python 3.11+**
6. **System Dependencies:**
   - webkit2gtk (macOS)
   - libwebkit2gtk-4.0-dev, build-essential, etc. (Linux)
7. **Project Dependencies** (pnpm install)
8. **File Descriptor Limit** (4096)

### Windows
1. **Chocolatey** (Package Manager)
2. **Node.js 22+**
3. **pnpm**
4. **Rust** (via rustup)
5. **Python 3.11+**
6. **Visual Studio Build Tools 2022**
7. **WebView2 Runtime**
8. **Project Dependencies** (pnpm install)

---

## 🔍 ตรวจสอบการติดตั้ง

หลังจากรันสคริปต์เสร็จ ตรวจสอบว่าติดตั้งครบหรือไม่:

```bash
# ตรวจสอบ Node.js
node --version
# ควรเป็น v22.x.x หรือสูงกว่า

# ตรวจสอบ pnpm
pnpm --version
# ควรเป็น 8.x.x หรือสูงกว่า

# ตรวจสอบ Rust
rustc --version
# ควรเป็น 1.70.x หรือสูงกว่า

# ตรวจสอบ Python
python3 --version  # macOS/Linux
python --version   # Windows
# ควรเป็น 3.11.x หรือสูงกว่า

# ตรวจสอบ File Descriptor Limit (macOS/Linux)
ulimit -n
# ควรเป็น 4096 หรือสูงกว่า
```

---

## 🎮 การใช้งาน

### Development Mode

```bash
# รัน dev mode (hot reload)
pnpm tauri dev
```

### Production Build

```bash
# Build สำหรับ production
pnpm tauri build

# ไฟล์ที่ได้:
# macOS: src-tauri/target/release/bundle/dmg/SmartSpec Pro.dmg
# Linux: src-tauri/target/release/bundle/deb/smartspecpro_0.1.0_amd64.deb
# Windows: src-tauri\target\release\bundle\msi\SmartSpec Pro_0.1.0_x64_en-US.msi
```

---

## 🐛 Troubleshooting

### ปัญหา: สคริปต์รันไม่ได้ (macOS/Linux)

**สาเหตุ:** ไม่มีสิทธิ์ execute

**แก้ไข:**
```bash
chmod +x setup.sh
./setup.sh
```

### ปัญหา: "Execution of scripts is disabled" (Windows)

**สาเหตุ:** PowerShell Execution Policy

**แก้ไข:**
```powershell
# รันใน PowerShell as Administrator
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# จากนั้นรันสคริปต์อีกครั้ง
.\setup.ps1
```

### ปัญหา: Node.js version ต่ำกว่า 22

**แก้ไข:**
```bash
# macOS
brew upgrade node

# Linux
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Windows
choco upgrade nodejs -y
```

### ปัญหา: Rust not found หลังติดตั้ง

**แก้ไข:**
```bash
# macOS/Linux
source $HOME/.cargo/env

# Windows
# ปิดและเปิด PowerShell ใหม่
```

### ปัญหา: pnpm install ล้มเหลว

**แก้ไข:**
```bash
# ลบ node_modules และ lock file
rm -rf node_modules pnpm-lock.yaml

# ติดตั้งใหม่
pnpm install
```

### ปัญหา: Build error "too many open files" (macOS/Linux)

**สาเหตุ:** File descriptor limit ต่ำเกินไป

**แก้ไข:**
```bash
# เพิ่ม limit
ulimit -n 4096

# หรือเพิ่มใน shell profile
echo "ulimit -n 4096" >> ~/.zshrc
source ~/.zshrc
```

### ปัญหา: WebView2 error (Windows)

**แก้ไข:**
```powershell
# ติดตั้ง WebView2 Runtime
choco install webview2-runtime -y

# หรือดาวน์โหลดจาก
# https://developer.microsoft.com/en-us/microsoft-edge/webview2/
```

### ปัญหา: Visual Studio Build Tools error (Windows)

**แก้ไข:**
```powershell
# ติดตั้ง Build Tools
choco install visualstudio2022buildtools -y
choco install visualstudio2022-workload-vctools -y

# Restart computer
```

---

## 📦 Manual Installation (ถ้าสคริปต์ไม่ทำงาน)

### macOS

```bash
# 1. Install Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Install dependencies
brew install node@22
brew install rust
brew install python@3.11
brew install webkit2gtk

# 3. Install pnpm
npm install -g pnpm

# 4. Install project dependencies
cd /path/to/smartspecpro
pnpm install

# 5. Set file descriptor limit
echo "ulimit -n 4096" >> ~/.zshrc
source ~/.zshrc
```

### Linux (Ubuntu/Debian)

```bash
# 1. Update package manager
sudo apt-get update

# 2. Install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Install pnpm
npm install -g pnpm

# 4. Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source $HOME/.cargo/env

# 5. Install Python 3.11
sudo apt-get install -y python3.11 python3-pip

# 6. Install system dependencies
sudo apt-get install -y \
    libwebkit2gtk-4.0-dev \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev

# 7. Install project dependencies
cd /path/to/smartspecpro
pnpm install

# 8. Set file descriptor limit
echo "ulimit -n 4096" >> ~/.bashrc
source ~/.bashrc
```

### Windows

```powershell
# 1. Install Chocolatey (in PowerShell as Administrator)
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# 2. Install dependencies
choco install nodejs --version=22.0.0 -y
choco install python311 -y
choco install visualstudio2022buildtools -y
choco install visualstudio2022-workload-vctools -y
choco install webview2-runtime -y

# 3. Install Rust
# Download from: https://rustup.rs/
# Run: rustup-init.exe

# 4. Install pnpm
npm install -g pnpm

# 5. Restart PowerShell

# 6. Install project dependencies
cd C:\path\to\smartspecpro
pnpm install
```

---

## ⚙️ Configuration

### Environment Variables (Optional)

สร้างไฟล์ `.env` ในโฟลเดอร์โปรเจค:

```bash
# OpenAI API Key (for Natural Language feature)
OPENAI_API_KEY=your_api_key_here

# Database Path (default: ./smartspecpro.db)
DATABASE_PATH=./smartspecpro.db

# Python Path (default: python3)
PYTHON_PATH=python3

# Kilo Code CLI Path (default: kilo)
KILO_PATH=kilo
```

---

## 🎯 Next Steps

หลังจากติดตั้งเสร็จแล้ว:

1. **อ่านคู่มือการใช้งาน:**
   - `README.md` - ภาพรวมโปรเจค
   - `QUICKSTART.md` - เริ่มต้นใช้งาน 5 นาที
   - `FINAL_SUMMARY.md` - สรุปโปรเจคฉบับสมบูรณ์

2. **รันแอป:**
   ```bash
   pnpm tauri dev
   ```

3. **ทดสอบ features:**
   - Workflow execution
   - Natural language input
   - Workflow management
   - Config editor
   - Templates
   - Export/Import

4. **Build production:**
   ```bash
   pnpm tauri build
   ```

---

## 📞 ความช่วยเหลือ

### ปัญหาที่พบบ่อย
- ดูที่ [Troubleshooting](#-troubleshooting) ด้านบน
- อ่าน [QUICKSTART.md](./QUICKSTART.md)
- อ่าน [README.md](./README.md)

### System Requirements

**Minimum:**
- OS: macOS 10.15+, Ubuntu 20.04+, Windows 10+
- RAM: 4 GB
- Disk: 2 GB free space
- Internet: Required for installation

**Recommended:**
- OS: macOS 12+, Ubuntu 22.04+, Windows 11
- RAM: 8 GB
- Disk: 5 GB free space
- Internet: Required for installation

---

## 📝 Notes

### macOS
- Xcode Command Line Tools จะถูกติดตั้งอัตโนมัติโดย Homebrew
- File descriptor limit จะถูกเพิ่มใน `~/.zshrc` หรือ `~/.bashrc`

### Linux
- ต้องมี `sudo` privileges
- รองรับ Ubuntu/Debian, CentOS/RHEL, Fedora
- File descriptor limit จะถูกเพิ่มใน `~/.bashrc`

### Windows
- ต้องรัน PowerShell as Administrator
- Visual Studio Build Tools ใช้เวลาติดตั้งนาน (~10-15 นาที)
- อาจต้อง restart computer หลังติดตั้ง

---

**Happy Coding! 🚀**
