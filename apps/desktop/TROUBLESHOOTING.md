# SmartSpec Pro - Troubleshooting Guide

## ปัญหา: โปรแกรมรันแล้วหลุดออกทันที (Windows)

### สาเหตุที่เป็นไปได้

1. **ไม่มี Python** - SmartSpec Pro ต้องการ Python 3.11+
2. **ไม่มี Kilo Code CLI** - ต้องติดตั้งและอยู่ใน PATH
3. **Missing dependencies** - WebView2, Visual C++ Runtime
4. **Path configuration** - ไม่พบ workflows directory

---

## 🔍 วิธีตรวจสอบ Error

### วิธีที่ 1: รันผ่าน Command Line

```powershell
# เปิด PowerShell
cd "C:\Program Files\SmartSpec Pro"

# รันโปรแกรม
.\smartspecpro.exe

# Error จะแสดงใน console
```

### วิธีที่ 2: ดู Event Viewer

```powershell
# เปิด Event Viewer
eventvwr.msc

# ไปที่: Windows Logs → Application
# หา error จาก smartspecpro.exe
```

### วิธีที่ 3: ดู Log Files

```powershell
# Log files อยู่ที่:
%APPDATA%\com.smartspec.pro\logs\

# เปิด folder
explorer %APPDATA%\com.smartspec.pro\logs\
```

---

## ✅ วิธีแก้ไข

### 1. ติดตั้ง Python 3.11+

```powershell
# ตรวจสอบ Python
python --version

# ถ้าไม่มี ติดตั้งจาก:
# https://www.python.org/downloads/
```

### 2. ติดตั้ง Kilo Code CLI

```powershell
# ตรวจสอบ Kilo Code CLI
kilo --version

# ถ้าไม่มี ติดตั้งตามคู่มือ Kilo Code
```

### 3. ติดตั้ง WebView2 Runtime

```powershell
# Download และติดตั้ง:
# https://developer.microsoft.com/en-us/microsoft-edge/webview2/
```

### 4. ติดตั้ง Visual C++ Runtime

```powershell
# Download และติดตั้ง:
# https://aka.ms/vs/17/release/vc_redist.x64.exe
```

### 5. ตรวจสอบ Workflows Directory

SmartSpec Pro ต้องการ workflows จาก SmartSpec repo:

```powershell
# ตรวจสอบว่ามี folder นี้:
C:\path\to\SmartSpec\.spec\WORKFLOWS_INDEX.yaml

# ถ้าไม่มี clone SmartSpec repo:
git clone https://github.com/naibarn/SmartSpec
```

---

## 🐛 Debug Mode

### สร้าง Debug Build

```bash
# ใน WSL หรือ Linux
cd ~/SmartSpec/desktop-app
pnpm tauri build --debug

# ไฟล์จะอยู่ที่:
# src-tauri/target/debug/smartspecpro.exe
```

### รัน Debug Mode

```powershell
# Debug build จะแสดง console window
.\smartspecpro.exe

# จะเห็น error messages และ logs
```

---

## 📝 Common Errors

### Error: "Python not found"

**วิธีแก้:**
```powershell
# ติดตั้ง Python
choco install python311 -y

# หรือ download จาก python.org
```

### Error: "Kilo Code CLI not found"

**วิธีแก้:**
```powershell
# ติดตั้ง Kilo Code CLI
# ตามคู่มือของ Kilo Code
```

### Error: "Workflows not found"

**วิธีแก้:**
```powershell
# Clone SmartSpec repo
git clone https://github.com/naibarn/SmartSpec

# หรือตั้งค่า path ใน config
```

### Error: "WebView2 not found"

**วิธีแก้:**
```powershell
# ติดตั้ง WebView2 Runtime
# https://developer.microsoft.com/en-us/microsoft-edge/webview2/
```

---

## 🔧 Configuration

### Config File Location

```
Windows: %APPDATA%\com.smartspec.pro\config.json
macOS: ~/Library/Application Support/com.smartspec.pro/config.json
Linux: ~/.config/com.smartspec.pro/config.json
```

### Example Config

```json
{
  "python_path": "C:\\Python311\\python.exe",
  "kilo_cli_path": "C:\\path\\to\\kilo.exe",
  "workflows_path": "C:\\path\\to\\SmartSpec\\.spec",
  "log_level": "debug"
}
```

---

## 📞 ขอความช่วยเหลือ

ถ้ายังแก้ไม่ได้:

1. รัน debug build
2. Copy error messages
3. สร้าง issue บน GitHub: https://github.com/naibarn/SmartSpec/issues
4. แนบ:
   - Error messages
   - Log files
   - System info (Windows version, Python version, etc.)

---

## 🎯 Quick Fix Checklist

- [ ] Python 3.11+ ติดตั้งแล้ว
- [ ] Kilo Code CLI ติดตั้งแล้ว
- [ ] WebView2 Runtime ติดตั้งแล้ว
- [ ] Visual C++ Runtime ติดตั้งแล้ว
- [ ] SmartSpec repo clone แล้ว
- [ ] PATH ตั้งค่าถูกต้อง
- [ ] รันผ่าน command line เพื่อดู error
