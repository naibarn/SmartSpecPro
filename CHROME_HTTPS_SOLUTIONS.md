# 🔧 แก้ปัญหา Chrome บังคับ HTTPS อัตโนมัติ

**ปัญหา:** Chrome เวอร์ชันใหม่จะ redirect จาก `http://smartspec.local:3000` ไป `https://smartspec.local:3000` อัตโนมัติ

---

## ✅ Solution 1: ใช้ IP Address (แนะนำ - ง่ายที่สุด)

เปิด Browser แล้วไปที่:
```
http://192.168.1.118:3000
```

**ข้อดี:**
- ✅ ใช้ได้ทันที ไม่ต้องตั้งค่าอะไร
- ✅ Chrome ไม่บังคับ HTTPS สำหรับ IP address
- ✅ ไม่ต้องติดตั้ง certificate

**ข้อเสีย:**
- ⚠️ ต้องจำ IP (แต่สามารถ bookmark ได้)

---

## ✅ Solution 2: ใช้ .localhost Domain

Chrome อนุญาตให้ใช้ HTTP กับ `.localhost` domain

### ขั้นตอน:

#### 1. แก้ hosts file บน Client

**Windows:**
```
C:\Windows\System32\drivers\etc\hosts

เพิ่ม:
192.168.1.118  smartspec.localhost
```

**macOS/Linux:**
```bash
sudo nano /etc/hosts

เพิ่ม:
192.168.1.118  smartspec.localhost
```

#### 2. เพิ่ม domain ใน tenant database

```bash
# รันบน Server
docker exec smartspec-postgres psql -U smartspec -d smartspec -c "
UPDATE tenants
SET domains = domains::jsonb || '[\"smartspec.localhost\"]'::jsonb
WHERE slug = 'smartspec-pro';
"
```

#### 3. Restart Frontend

```bash
# บน Server
pkill -f "tsx.*server/_core"
./dev-local.sh web
```

#### 4. เปิด Browser

```
http://smartspec.localhost:3000
```

**Chrome จะไม่ redirect ไป HTTPS สำหรับ .localhost**

---

## ✅ Solution 3: สร้าง Self-Signed SSL Certificate

ถ้าต้องการใช้ HTTPS จริงๆ

### ขั้นตอน:

#### 1. สร้าง SSL Certificate
