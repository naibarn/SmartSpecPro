# Domain Admin System - คู่มือการใช้งานและทดสอบ

## 🎯 ภาพรวมระบบ

ระบบ Domain Admin เป็น feature ใหม่ที่เพิ่มเข้ามาเพื่อให้ผู้ดูแลแต่ละ domain สามารถจัดการ users และปรับแต่ง theme ได้เอง โดยไม่ต้องเป็น super admin

## ✅ งานที่เสร็จสมบูรณ์

### 1. Database Schema
- ✅ เพิ่ม `domain_admin` role ใน roleEnum
- ✅ เพิ่มฟิลด์ `isDisabled` boolean ใน users table
- ✅ รัน migration สำเร็จแล้ว

### 2. Backend (API & Routes)
- ✅ สร้าง `domainAdminProcedure` middleware ใน `server/_core/trpc.ts`
- ✅ อัพเดท `users` router รองรับ domain admin:
  - `users.list` - filter by registeredDomain
  - `users.toggleUserStatus` - enable/disable users
  - `users.domainStats` - สถิติของ domain
- ✅ เพิ่ม endpoint `PUT /api/tenant/theme` สำหรับอัพเดท theme

### 3. Frontend (UI Components)
- ✅ สร้าง `DomainAdmin.tsx` - หน้าจัดการ users
- ✅ สร้าง `DomainThemeEditor.tsx` - หน้าแก้ไข theme
- ✅ อัพเดท `Dashboard.tsx` - เพิ่มเมนู Domain Admin
- ✅ เพิ่ม routes ใน `App.tsx`

## 🔑 สิทธิ์ของ Domain Admin

### สิทธิ์ที่มี:
1. ✅ **ดูรายชื่อ users** ในระบบเฉพาะ domain ของตัวเอง
2. ✅ **ดูจำนวนเครดิต** ของ users แต่ละคน
3. ✅ **Disable/Enable users** (เฉพาะ role "user" เท่านั้น)
4. ✅ **ดูสถิติ** ของ domain (Total users, Active, Disabled)
5. ✅ **แก้ไข theme** ของ domain (สี, ฟอนต์, layout, styles)
6. ✅ **Generate ภาพและวิดีโอ** ลง gallery (ผ่าน role check)

### สิทธิ์ที่ไม่มี:
- ❌ ไม่สามารถเพิ่ม/ลดเครดิตได้
- ❌ ไม่สามารถเปลี่ยน role ของ users ได้
- ❌ ไม่สามารถ disable domain admins หรือ admins อื่นได้
- ❌ ไม่สามารถเห็น users จาก domain อื่นได้
- ❌ ไม่สามารถจัดการ services, packages, LLM providers ได้

## 📋 วิธีทดสอบระบบ

### ขั้นตอนที่ 1: สร้าง Test Tenant

```sql
-- เชื่อมต่อ database
docker exec -it smartspec-postgres psql -U smartspec -d smartspec

-- สร้าง tenant ทดสอบ
INSERT INTO tenants (slug, name, "primaryDomain", domains, "isActive", "themeConfig", "seoConfig", settings, "ownerId")
VALUES (
  'test-domain',
  'Test Domain',
  'test.local',
  '["test.local", "www.test.local"]',
  true,
  '{"primaryColor": "#9333ea", "secondaryColor": "#ec4899"}',
  '{"defaultTitle": "Test Domain"}',
  '{}',
  1
);
```

### ขั้นตอนที่ 2: สร้าง Domain Admin User

**วิธีที่ 1: ผ่าน Admin UI (แนะนำ)**
1. Login ด้วย admin account (เช่น `admin@smartspec.pro`)
2. ไปที่เมนู Admin > Manage Users
3. คลิกเลือก user ที่ต้องการเปลี่ยนเป็น domain admin
4. คลิกปุ่ม **Edit** (ดินสอ) ข้าง Role
5. เลือก **Domain Admin**
6. คลิกปุ่ม **Edit** (ดินสอ) ข้าง Registered Domain
7. ใส่ domain (เช่น `test.local`)
8. Save

**วิธีที่ 2: ผ่าน SQL (สำหรับ advanced users)**
```sql
-- สร้าง user ใหม่หรืออัพเดท user ที่มีอยู่
INSERT INTO users ("openId", name, email, role, "registeredDomain", "currentTenantId", credits, plan, "isDisabled")
VALUES (
  'test-domain-admin-openid',
  'Domain Admin Test',
  'domainadmin@test.local',
  'domain_admin',
  'test.local',
  (SELECT id FROM tenants WHERE slug = 'test-domain'),
  1000,
  'pro',
  false
)
ON CONFLICT ("openId") DO UPDATE
SET role = 'domain_admin',
    "registeredDomain" = 'test.local';

-- หรืออัพเดท user ที่มีอยู่แล้ว
UPDATE users
SET role = 'domain_admin',
    "registeredDomain" = 'test.local'
WHERE email = 'your-email@example.com';
```

### ขั้นตอนที่ 3: สร้าง Test Users

```sql
-- สร้าง users ทดสอบใน domain เดียวกัน
INSERT INTO users ("openId", name, email, role, "registeredDomain", credits, plan, "isDisabled")
VALUES
  ('test-user-1', 'Test User 1', 'user1@test.local', 'user', 'test.local', 100, 'free', false),
  ('test-user-2', 'Test User 2', 'user2@test.local', 'user', 'test.local', 200, 'starter', false),
  ('test-user-3', 'Test User 3', 'user3@test.local', 'user', 'test.local', 300, 'pro', true),
  ('test-user-other', 'User Other Domain', 'user@other.com', 'user', 'other.local', 500, 'free', false);
```

### ขั้นตอนที่ 4: ทดสอบ Features

#### A. ทดสอบ Login และ Navigation
1. Login ด้วย domain admin account
2. ตรวจสอบว่าเห็นเมนู "Domain Admin" > "Manage Users" ใน Dashboard
3. คลิกเข้าไปหน้า Domain Admin

#### B. ทดสอบ User Management
1. **ตรวจสอบ Statistics:**
   - Total Users (ควรเห็นเฉพาะ users ใน test.local)
   - Active Users
   - Disabled Users
   - Domain name

2. **ทดสอบ Search:**
   - ค้นหาด้วยชื่อ user
   - ค้นหาด้วย email

3. **ทดสอบ Enable/Disable:**
   - คลิก "Disable" ที่ user ธรรมดา (ควรทำงาน)
   - ลอง disable user ที่เป็น admin หรือ domain_admin อื่น (ควรไม่ได้)
   - ลอง disable user จาก domain อื่น (ควรไม่เห็นใน list)

4. **ตรวจสอบ UI:**
   - Disabled users ควรมีพื้นหลังสีแดงอ่อน
   - มี badge "Disabled" แสดงบน username
   - ปุ่มเปลี่ยนจาก "Disable" เป็น "Enable"

#### C. ทดสอบ Theme Editor
1. คลิกปุ่ม "Edit Theme" ในหน้า Domain Admin
2. **ทดสอบการเปลี่ยนสี:**
   - เปลี่ยน Primary Color
   - เปลี่ยน Secondary Color
   - ดู preview แสดงผลถูกต้อง

3. **ทดสอบการเปลี่ยน Typography:**
   - เปลี่ยน Font Family
   - เปลี่ยน Heading Font

4. **ทดสอบการเปลี่ยน Styles:**
   - เปลี่ยน Layout (modern/classic/minimal/creative)
   - เปลี่ยน Button Style (rounded/square/pill)
   - เปลี่ยน Card Style (elevated/flat/outlined)
   - ดู preview อัพเดทตามการเปลี่ยนแปลง

5. **ทดสอบ Actions:**
   - คลิก "Preview" - ควรใช้ theme ชั่วคราว
   - คลิก "Reset" - กลับไปเป็นค่าเดิม
   - คลิก "Save Changes" - บันทึกและ reload หน้า
   - ตรวจสอบว่า theme ใหม่ถูกใช้งานทั้งระบบ

#### D. ทดสอบ Security
1. **ลอง login ด้วย user ธรรมดา:**
   - ไม่ควรเห็นเมนู Domain Admin
   - พยายามเข้า `/domain-admin` ควร redirect กลับ

2. **ลอง login ด้วย domain admin จาก domain อื่น:**
   - ควรเห็นเฉพาะ users ใน domain ของตัวเอง
   - ไม่สามารถ disable users จาก domain อื่นได้

3. **ลองแก้ไข theme ของ domain อื่น:**
   - ควรได้ error "You can only update your own domain's theme"

## 🐛 การ Debug

### ตรวจสอบ Database
```sql
-- ดู roles ทั้งหมด
SELECT enumlabel FROM pg_enum WHERE enumtypid = (
  SELECT oid FROM pg_type WHERE typname = 'role'
);

-- ดู users ที่เป็น domain_admin
SELECT id, name, email, role, "registeredDomain", "isDisabled"
FROM users
WHERE role = 'domain_admin';

-- ดู tenants ทั้งหมด
SELECT id, slug, name, "primaryDomain", domains, "isActive"
FROM tenants;

-- ดู users ในแต่ละ domain
SELECT
  u.id,
  u.name,
  u.email,
  u.role,
  u."registeredDomain",
  u."isDisabled",
  u.credits
FROM users u
ORDER BY u."registeredDomain", u.role;
```

### ตรวจสอบ API Endpoints
```bash
# Get current tenant
curl -X GET http://localhost:3000/api/tenant/current \
  -H "Cookie: session=YOUR_SESSION_COOKIE"

# Get domain stats
curl -X GET http://localhost:3000/api/trpc/users.domainStats \
  -H "Cookie: session=YOUR_SESSION_COOKIE"

# Update theme
curl -X PUT http://localhost:3000/api/tenant/theme \
  -H "Content-Type: application/json" \
  -H "Cookie: session=YOUR_SESSION_COOKIE" \
  -d '{
    "themeConfig": {
      "primaryColor": "#ff0000",
      "secondaryColor": "#00ff00"
    }
  }'
```

## 🎯 วิธีกำหนดสิทธิ์ Domain Admin (สำหรับ Admin)

### ผ่าน Admin UI:
1. **Login** ด้วย admin account
2. ไปที่ **Admin > Manage Users**
3. คลิกเลือก user ที่ต้องการจาก list ด้านซ้าย
4. **เปลี่ยน Role:**
   - คลิกปุ่ม Edit (✏️) ข้างคำว่า "Role"
   - เลือก "Domain Admin"
   - คลิก "Update Role"
5. **กำหนด Domain:**
   - คลิกปุ่ม Edit (✏️) ข้างคำว่า "Registered Domain"
   - ใส่ชื่อ domain (เช่น `smartspec.pro`)
   - คลิก "Update Domain"

### ผ่าน SQL:
```sql
-- อัพเดท user เป็น domain admin
UPDATE users
SET role = 'domain_admin',
    "registeredDomain" = 'your-domain.com'
WHERE email = 'user@example.com';
```

## 📁 ไฟล์ที่สร้าง/แก้ไข

### Backend Files:
- `drizzle/schema.ts` - เพิ่ม domain_admin role และ isDisabled field
- `drizzle/0002_add_domain_admin.sql` - migration file
- `server/_core/trpc.ts` - เพิ่ม domainAdminProcedure
- `server/routers/users.ts` - เพิ่ม endpoints สำหรับ domain admin
- `server/routers/tenant.ts` - เพิ่ม PUT /api/tenant/theme

### Frontend Files:
- `client/src/pages/DomainAdmin.tsx` - หน้าจัดการ users
- `client/src/pages/DomainThemeEditor.tsx` - หน้าแก้ไข theme
- `client/src/pages/Dashboard.tsx` - เพิ่มเมนู Domain Admin
- `client/src/pages/AdminUsers.tsx` - เพิ่ม UI แก้ไข Role และ Domain
- `client/src/App.tsx` - เพิ่ม routes

## 🚀 Next Steps

1. ✅ ทดสอบระบบตามขั้นตอนด้านบน
2. ✅ ปรับแต่ง UI/UX ตามความต้องการ
3. 🔜 เพิ่ม feature Gallery Management สำหรับ Domain Admin
4. 🔜 เพิ่ม feature SEO Configuration สำหรับ Domain Admin
5. 🔜 เพิ่ม Activity Logs สำหรับ Domain Admin actions

## 💡 Tips

- Domain Admin สามารถมีได้หลายคนต่อ domain
- การเปลี่ยน theme จะมีผลกับทุกคนที่เข้า domain นั้น
- User ที่ถูก disable จะยังเห็นข้อมูลได้ แต่อาจจะไม่สามารถใช้ feature บางอย่างได้
- ใช้ `registeredDomain` ในการ filter แทน tenant ID เพื่อความยืดหยุ่น
