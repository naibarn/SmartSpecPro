# 🌐 คู่มือเข้าถึง SmartSpecPro จากเครื่องอื่น

**อัพเดต:** 2026-01-27 20:50

---

## ✅ ข้อมูล Server

- **IP Address:** `192.168.1.118`
- **Port:** `3000`
- **Status:** ✅ Ready (bind ที่ 0.0.0.0)
- **Firewall:** ไม่มีการบล็อก port 3000

---

## 🎯 วิธีเข้าใช้งาน (เลือก 1 วิธี)

### ✅ วิธีที่ 1: ใช้ IP Address (แนะนำ - ใช้ได้ทันที)

**เปิด Browser บนเครื่องอื่น แล้วไปที่:**
```
http://192.168.1.118:3000
```

**ข้อดี:**
- ✅ ใช้งานได้ทันที ไม่ต้องตั้งค่าอะไร
- ✅ ไม่มีปัญหา HTTPS redirect
- ✅ ไม่ต้องแก้ hosts file

**ข้อเสีย:**
- ⚠️ ต้องจำ IP (แต่บันทึก bookmark ได้)
- ⚠️ ถ้า IP เปลี่ยนต้องแก้

---

### วิธีที่ 2: ใช้ Domain Name (smartspec.local)

#### ขั้นที่ 1: ตั้งค่า hosts file บนเครื่อง Client

**Windows:**
1. เปิด Notepad **as Administrator** (คลิกขวา → Run as administrator)
2. เปิดไฟล์: `C:\Windows\System32\drivers\etc\hosts`
3. เพิ่มบรรทัดนี้ที่ท้ายไฟล์:
   ```
   192.168.1.118  smartspec.local
   ```
4. Save (Ctrl+S) แล้วปิด

**macOS/Linux:**
```bash
sudo nano /etc/hosts

# เพิ่มบรรทัดนี้:
192.168.1.118  smartspec.local

# บันทึก: Ctrl+O, Enter, Ctrl+X
```

#### ขั้นที่ 2: แก้ปัญหา HTTPS Redirect

**ปัญหา:** Browser จะ redirect ไป `https://smartspec.local:3000` โดยอัตโนมัติ

**สาเหตุ:** Browser มี HSTS (HTTP Strict Transport Security) cache จำไว้ว่าเคยบังคับ HTTPS

---

### 🔧 แก้ไข HTTPS Redirect:

#### **Solution A: Clear HSTS Cache (Chrome/Edge) ← แนะนำ**

1. เปิด Chrome/Edge
2. ไปที่: `chrome://net-internals/#hsts`
3. ในช่อง **"Delete domain security policies"**
4. พิมพ์: `smartspec.local`
5. กด **Delete**
6. **ปิด browser ทั้งหมด** (Alt+F4 หรือ quit completely)
7. เปิด browser ใหม่
8. ไปที่: `http://smartspec.local:3000` (ต้องพิมพ์ `http://` ด้วย)

---

#### **Solution B: Clear HSTS Cache (Firefox)**

1. เปิด Firefox
2. ไปที่: `about:config`
3. กด **Accept the Risk and Continue**
4. ค้นหา: `security.cert_pinning.enforcement_level`
5. Double-click เปลี่ยนค่าเป็น: `0`
6. **Restart Firefox**
7. ไปที่: `http://smartspec.local:3000`

---

#### **Solution C: ใช้ Incognito/Private Mode**

**Chrome/Edge:**
```
Ctrl + Shift + N  (Windows/Linux)
Cmd + Shift + N   (Mac)
```

**Firefox:**
```
Ctrl + Shift + P  (Windows/Linux)
Cmd + Shift + P   (Mac)
```

จากนั้นไปที่: `http://smartspec.local:3000`

---

#### **Solution D: ใช้ Different Browser**

ถ้า Chrome ไม่ได้:
- ลอง Firefox
- ลอง Edge
- ลอง Brave

---

## 🔒 ถ้าต้องการใช้ HTTPS (Advanced)

### ⚠️ คำเตือน:
HTTPS ต้องมี SSL Certificate ซึ่งจะได้ "Not Secure" warning ใน browser เพราะเป็น self-signed certificate

### ขั้นตอนสร้าง Self-Signed Certificate:

```bash
# 1. สร้าง SSL certificate
cd /home/dev/projects/SmartSpecPro/SmartSpecWeb
mkdir -p ssl

# 2. Generate certificate
openssl req -x509 -newkey rsa:4096 -keyout ssl/key.pem -out ssl/cert.pem \
  -days 365 -nodes \
  -subj "/C=TH/ST=Bangkok/L=Bangkok/O=SmartSpec/CN=smartspec.local" \
  -addext "subjectAltName=DNS:smartspec.local,DNS:*.smartspec.local,IP:192.168.1.118"

# 3. แก้ไข server ให้ใช้ HTTPS
# (ต้องแก้ code ใน server/_core/index.ts)
```

---

## 🧪 ทดสอบการเข้าถึง

### จาก Server (Linux):
```bash
# Test IP
curl -I http://192.168.1.118:3000
# Expected: HTTP/1.1 200 OK

# Test localhost
curl -I http://localhost:3000
# Expected: HTTP/1.1 200 OK

# Test domain (ถ้าตั้งค่า /etc/hosts แล้ว)
curl -I http://smartspec.local:3000
# Expected: HTTP/1.1 200 OK
```

### จาก Client (Windows/Mac):

#### Test 1: Ping Server
```bash
ping 192.168.1.118
```
ควรได้ reply กลับมา

#### Test 2: Test Port
```bash
# Windows PowerShell:
Test-NetConnection -ComputerName 192.168.1.118 -Port 3000

# Mac/Linux:
nc -zv 192.168.1.118 3000
```

#### Test 3: เปิด Browser
```
http://192.168.1.118:3000
```

---

## ❓ Troubleshooting

### ปัญหา: "Cannot connect" หรือ "Timeout"

**สาเหตุที่เป็นไปได้:**

1. **Firewall บน Server** (แม้ตรวจสอบแล้วว่าไม่มี)
   ```bash
   # ตรวจสอบอีกครั้ง
   sudo ufw status
   sudo iptables -L -n | grep 3000
   ```

2. **Firewall บน Client** (Windows Firewall, Antivirus)
   - ปิด Windows Firewall ชั่วคราว
   - ปิด Antivirus ชั่วคราว

3. **Network Route**
   - ตรวจสอบว่า Client กับ Server อยู่ใน subnet เดียวกัน
   ```bash
   # บน Client
   ipconfig    (Windows)
   ifconfig    (Mac/Linux)
   ```

4. **Service ไม่ทำงาน**
   ```bash
   # บน Server
   netstat -tlnp | grep 3000
   # ควรเห็น: 0.0.0.0:3000
   ```

---

### ปัญหา: Browser Redirect ไป HTTPS ทุกครั้ง

**แก้ไข:**

1. **Clear HSTS อีกครั้ง** (ตามขั้นตอนด้านบน)
2. **Restart Browser ทั้งหมด** (ต้องปิดทุก window)
3. **พิมพ์ `http://` ใน address bar** (ถ้าพิมพ์แค่ `smartspec.local:3000` browser อาจบังคับ HTTPS)
4. **ลอง Incognito Mode**

---

### ปัญหา: หน้าจอขาวว่าง (Blank Screen)

**แก้ไข:**

1. **Hard Refresh:**
   ```
   Ctrl + Shift + R  (Windows/Linux)
   Cmd + Shift + R   (Mac)
   ```

2. **Clear Browser Cache:**
   - Chrome: Ctrl+Shift+Delete
   - เลือก "Cached images and files"
   - Clear data

3. **ดู Developer Console:**
   - กด F12
   - ดูแท็บ Console มี error อะไรบ้าง
   - ดูแท็บ Network มี request failed หรือไม่

4. **ทดสอบ Debug Page:**
   ```
   http://192.168.1.118:3000/debug.html
   ```

---

### ปัญหา: "Tenant not found"

**สาเหตุ:** Domain/IP ไม่อยู่ใน tenant configuration (แก้ไขไปแล้ว)

**ตรวจสอบ:**
```bash
# บน Server
docker exec smartspec-postgres psql -U smartspec -d smartspec -c \
  "SELECT domains FROM tenants WHERE slug = 'smartspec-pro';"

# ควรเห็น: ["smartspec.local", "localhost", "192.168.1.118"]
```

---

## 📋 Checklist การแก้ปัญหา

เมื่อเจอปัญหา ให้ทำตามลำดับ:

- [ ] 1. Ping ไปที่ 192.168.1.118 ได้หรือไม่?
- [ ] 2. Test port 3000 เปิดอยู่หรือไม่?
- [ ] 3. ใช้ IP address แทน domain ได้หรือไม่?
- [ ] 4. Clear HSTS cache แล้วหรือยัง?
- [ ] 5. Restart browser แล้วหรือยัง?
- [ ] 6. ลอง Incognito mode แล้วหรือยัง?
- [ ] 7. ลอง browser อื่นแล้วหรือยัง?
- [ ] 8. Hard refresh (Ctrl+Shift+R) แล้วหรือยัง?
- [ ] 9. ดู Console (F12) มี error หรือไม่?
- [ ] 10. ทดสอบ debug page แล้วหรือยัง?

---

## ✅ สรุป

**วิธีที่แนะนำสุด:**
```
http://192.168.1.118:3000
```

**ข้อมูล Login:**
```
Email:    admin@smartspec.pro
Password: Admin@123!
```

**ถ้ายังไม่ได้:**
1. Clear HSTS cache
2. Restart browser ทั้งหมด
3. ใช้ Incognito mode
4. ทดสอบ debug page

---

## 📞 ต้องการความช่วยเหลือเพิ่มเติม

ส่งข้อมูลเหล่านี้:
1. **ผลลัพธ์จาก:**
   ```bash
   curl -I http://192.168.1.118:3000
   ```

2. **Screenshot:**
   - Browser address bar (แสดง URL)
   - Browser Console (F12 → Console tab)
   - Browser Network tab (F12 → Network tab)

3. **Browser & OS:**
   - Browser: Chrome/Firefox/Edge?
   - Version: ?
   - OS: Windows 10/11? macOS? Linux?

---

**ระบบพร้อมรับการเข้าถึงจากภายนอกแล้ว!** 🚀
