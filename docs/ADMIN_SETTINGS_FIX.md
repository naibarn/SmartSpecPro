# 🔧 แก้ไขปัญหา Admin Settings - Provider Config

## ❌ ปัญหาที่พบ

### 1. "Failed to fetch providers: Unauthorized"
เมื่อเปิดหน้า `/admin/settings` ขึ้น error "Unauthorized"

### 2. "Method Not Allowed"
เมื่อพยายามบันทึก provider config

---

## 🔍 สาเหตุ

### สาเหตุที่ 1: ไม่มี ENCRYPTION_MASTER_KEY
- Backend ต้องการ `ENCRYPTION_MASTER_KEY` เพื่อ encrypt/decrypt API keys
- ถ้าไม่มี key นี้ encryption service จะทำงานไม่ได้

### สาเหตุที่ 2: ไม่มี Admin User
- Admin Settings ต้องการ user ที่มี `is_admin=True`
- ถ้าไม่มี admin user จะไม่สามารถเข้าถึงได้

### สาเหตุที่ 3: ไม่ได้ Login หรือ Token หมดอายุ
- ต้อง login ก่อนเข้า Admin Settings
- Token อาจหมดอายุ (default: 30 minutes)

---

## ✅ วิธีแก้ไข

### ขั้นที่ 1: เพิ่ม ENCRYPTION_MASTER_KEY ✅ (แก้ไขแล้ว)

แก้ไข `python-backend/.env`:
```bash
# Security (REQUIRED)
SECRET_KEY=dev-secret-key-$(date +%s)-$(openssl rand -hex 16)
ENCRYPTION_MASTER_KEY=dev-encryption-key-change-in-prod-32chars-minimum
```

**หมายเหตุ:** ENCRYPTION_MASTER_KEY ต้องมีอย่างน้อย 32 ตัวอักษร

### ขั้นที่ 2: สร้าง Admin User

รัน script:
```bash
cd /home/naibarn/projects/SmartSpecPro/python-backend

# ใช้ email และ password default
python create_admin_user.py

# หรือระบุ email และ password เอง
python create_admin_user.py myemail@example.com mypassword123
```

**Default credentials:**
- Email: `admin@smartspec.pro`
- Password: `admin123`

### ขั้นที่ 3: Restart Backend

```bash
cd python-backend

# Stop backend (Ctrl+C)
# Then restart
python -m uvicorn app.main:app --reload --port 8000
```

### ขั้นที่ 4: Login ใหม่

1. เปิด Desktop App: http://localhost:1420
2. กด Logout (ถ้าเคย login)
3. Login ด้วย:
   - Email: `admin@smartspec.pro`
   - Password: `admin123`
4. ไปที่ `/admin/settings`

---

## 🧪 ทดสอบว่าแก้ไขสำเร็จ

### 1. ทดสอบ Backend Health
```bash
curl http://localhost:8000/health
```

**ผลลัพธ์:**
```json
{"status": "healthy"}
```

### 2. ทดสอบ Login
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@smartspec.pro",
    "password": "admin123"
  }'
```

**ผลลัพธ์:**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "user": {
    "id": "...",
    "email": "admin@smartspec.pro",
    "is_admin": true
  }
}
```

### 3. ทดสอบ Provider Config API
```bash
# เก็บ token จาก login
TOKEN="eyJ..."

curl -X GET http://localhost:8000/api/v1/admin/provider-configs/ \
  -H "Authorization: Bearer $TOKEN"
```

**ผลลัพธ์:**
```json
[
  {
    "id": "...",
    "provider_name": "openai",
    "display_name": "OpenAI",
    "has_api_key": false,
    "is_enabled": false,
    ...
  },
  ...
]
```

---

## 📋 Checklist

- [x] เพิ่ม `ENCRYPTION_MASTER_KEY` ใน `.env`
- [x] เพิ่ม `ENCRYPTION_MASTER_KEY` ใน `config.py`
- [x] สร้าง script `create_admin_user.py`
- [x] รัน `python create_admin_user.py` ✅ (User ID: 70ed4d9a-3e08-4bd3-803b-b9b0d9529672)
- [ ] Restart Backend
- [ ] Login ใหม่
- [ ] ทดสอบ Admin Settings

---

## 🔐 ข้อมูล Admin User

### Default Admin User (หลังรัน script)

```
Email: admin@smartspec.pro
Password: admin123
Is Admin: true
Credits Balance: 100,000,000 (100,000 USD worth)
```

⚠️ **คำแนะนำความปลอดภัย:**
1. เปลี่ยน password ทันทีหลัง login
2. ใช้ password ที่แข็งแรง (8+ ตัวอักษร, มีตัวพิมพ์ใหญ่-เล็ก, ตัวเลข, สัญลักษณ์)
3. สำหรับ production ให้เปลี่ยน `ENCRYPTION_MASTER_KEY` เป็น random string ยาว ๆ

---

## 🎯 การใช้งาน Admin Settings

### เข้าถึง Admin Settings

1. Login เป็น admin user
2. ไปที่ URL:
   - Desktop App: `http://localhost:1420/admin/settings`
   - หรือคลิกที่เมนู "⚙️ Provider Config" ใน sidebar (ถ้ามี)

### เพิ่ม Provider Config

1. เลือก provider template (เช่น "Kilo Code", "OpenAI", "Anthropic")
2. กรอกข้อมูล:
   - **Display Name**: ชื่อแสดง (เช่น "Kilo Code Production")
   - **API Key**: API key จาก provider
   - **Base URL**: URL endpoint (มี default อยู่แล้ว)
   - **Description**: คำอธิบาย (optional)
3. เช็ค "Enable this provider"
4. กด "Save"

### แก้ไข Provider Config

1. คลิก "Edit" ที่ provider ที่ต้องการ
2. แก้ไขข้อมูล
3. **หมายเหตุ:** ช่อง API Key จะว่างเปล่า (ไม่แสดง key เดิม)
   - ถ้าต้องการเปลี่ยน key: ใส่ key ใหม่
   - ถ้าไม่ต้องการเปลี่ยน: ปล่อยว่างไว้
4. กด "Save"

### ลบ Provider Config

1. คลิก "Delete" ที่ provider ที่ต้องการลบ
2. Confirm

---

## ❌ Troubleshooting

### ปัญหา: ยังขึ้น "Unauthorized" หลัง login

**วิธีแก้:**
1. Clear browser cache และ localStorage:
   ```javascript
   // ใน browser console
   localStorage.clear()
   location.reload()
   ```
2. Login ใหม่

### ปัญหา: "Failed to decrypt" error

**สาเหตุ:** `ENCRYPTION_MASTER_KEY` เปลี่ยนแปลงหลังจาก encrypt API keys

**วิธีแก้:**
1. ลบ provider configs ที่มีอยู่
2. ตั้งค่า `ENCRYPTION_MASTER_KEY` ใหม่
3. Restart backend
4. เพิ่ม provider configs ใหม่

### ปัญหา: "Method Not Allowed"

**วิธีแก้:**
1. ตรวจสอบว่า backend ทำงานอยู่
2. ตรวจสอบ URL ที่ frontend เรียก:
   ```
   POST /api/v1/admin/provider-configs/          (สร้างใหม่)
   PUT  /api/v1/admin/provider-configs/{name}    (แก้ไข)
   DELETE /api/v1/admin/provider-configs/{name}  (ลบ)
   ```
3. ตรวจสอบ CORS settings ใน backend

### ปัญหา: Backend error "KeyError: 'encryption'"

**วิธีแก้:**
1. ตรวจสอบว่า `app/core/encryption.py` มีอยู่
2. ตรวจสอบว่า `ENCRYPTION_MASTER_KEY` ตั้งค่าแล้ว
3. Restart backend

---

## 📚 เอกสารเพิ่มเติม

- `KILOCODE_PROVIDER_SETUP.md` - วิธี setup Kilo Code provider
- `KILO_LLM_SETUP.md` - วิธี setup LLM integration
- `python-backend/migrations/README_PROVIDER_CONFIG.md` - รายละเอียด provider config system

---

**Created:** 2026-01-09
**Status:** ✅ Ready to use
**Next Step:** รัน `python create_admin_user.py` และ restart backend
