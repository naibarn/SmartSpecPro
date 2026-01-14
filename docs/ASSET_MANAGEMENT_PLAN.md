# SmartSpecPro Asset Management - แผนการพัฒนา

**วันที่:** 14 มกราคม 2026  
**เวอร์ชัน:** 1.0  
**ผู้เขียน:** Manus AI

---

## 1. ภาพรวมและเป้าหมาย

ปัจจุบัน ระบบ SmartSpecPro สามารถสร้าง Media Assets (Image, Video, Audio) ผ่าน MCP Server และบันทึกไฟล์ลงในโฟลเดอร์ `assets/` ของโปรเจกต์ได้ แต่ยังขาดระบบการจัดการที่เป็นศูนย์กลาง ทำให้การค้นหา, ติดตามเวอร์ชัน, และนำ assets กลับมาใช้ใหม่ทำได้ยาก

**เป้าหมายหลัก** ของฟีเจอร์ Asset Management คือการสร้างระบบที่แข็งแกร่งสำหรับ:

- **Centralized Asset Registry:** สร้างฐานข้อมูลกลางสำหรับ assets ทั้งหมด
- **Versioning:** ติดตามการเปลี่ยนแปลงและเวอร์ชันของ assets
- **Metadata & Search:** จัดการ metadata และเปิดให้ค้นหา assets ได้ง่าย
- **Integration:** เชื่อมต่อกับ `spec.md` และ Desktop App อย่างสมบูรณ์

---

## 2. สถาปัตยกรรมที่นำเสนอ

เราจะสร้างระบบ Asset Management โดยมีองค์ประกอบหลัก 3 ส่วน:

1.  **Backend (FastAPI):**
    -   **Database Model:** สร้างตาราง `assets` ใหม่ในฐานข้อมูล
    -   **API Endpoints:** สร้าง CRUD APIs สำหรับจัดการ assets
2.  **MCP Server:**
    -   **New Tools:** เพิ่ม tools สำหรับการลงทะเบียนและค้นหา assets
3.  **Frontend (Desktop App):**
    -   **Asset Browser:** สร้าง UI สำหรับแสดง, ค้นหา, และจัดการ assets

### 2.1 Database Schema

เราจะสร้างตารางใหม่ชื่อ `assets` โดยมีโครงสร้างดังนี้:

| Column | Type | Description |
|---|---|---|
| `id` | `String(36)` | UUID v4 (Primary Key) |
| `project_id` | `String(36)` | ID ของโปรเจกต์ (FK to `projects`) |
| `spec_id` | `String(36)` | ID ของ spec ที่ asset เกี่ยวข้อง (FK to `specs`) |
| `filename` | `String(255)` | ชื่อไฟล์ (e.g., `hero-banner.png`) |
| `relative_path` | `Text` | ตำแหน่งไฟล์เทียบกับ root ของโปรเจกต์ (e.g., `specs/feature/004-desktop-app/assets/hero-banner.png`) |
| `asset_type` | `Enum('image', 'video', 'audio')` | ประเภทของ asset |
| `version` | `Integer` | หมายเลขเวอร์ชัน (เริ่มต้นที่ 1) |
| `is_latest` | `Boolean` | `True` ถ้าเป็นเวอร์ชันล่าสุด |
| `parent_asset_id` | `String(36)` | ID ของ asset เวอร์ชันก่อนหน้า (สำหรับ version tracking) |
| `generation_task_id` | `String(36)` | ID ของ task ที่สร้าง asset นี้ (FK to `generation_tasks`) |
| `metadata` | `JSON` | ข้อมูลเพิ่มเติม (prompt, model, size, duration, etc.) |
| `tags` | `JSON` | Tags สำหรับการค้นหา |
| `created_at` | `DateTime` | วันที่สร้าง |
| `updated_at` | `DateTime` | วันที่แก้ไขล่าสุด |

### 2.2 Backend API Endpoints

สร้าง API endpoints ใหม่ภายใต้ `/api/v1/assets`:

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/` | ลงทะเบียน asset ใหม่ |
| `GET` | `/` | ค้นหา assets (รองรับ query params) |
| `GET` | `/{asset_id}` | ดึงข้อมูล asset ตาม ID |
| `PUT` | `/{asset_id}` | อัปเดต metadata หรือ tags |
| `POST` | `/{asset_id}/version` | สร้าง asset เวอร์ชันใหม่ |
| `DELETE` | `/{asset_id}` | ลบ asset (soft delete) |

### 2.3 MCP Server Tools

ปรับปรุงและเพิ่ม MCP tools:

| Tool | Description | การเปลี่ยนแปลง |
|---|---|---|
| `save_asset_to_project` | บันทึกไฟล์และลงทะเบียนใน Asset Registry | **ปรับปรุง** |
| `find_assets` | ค้นหา assets จาก Asset Registry | **สร้างใหม่** |
| `get_asset_details` | ดึงข้อมูล asset ตาม ID | **สร้างใหม่** |

### 2.4 Frontend (Desktop App)

สร้างหน้า **Asset Browser** ใหม่ใน Desktop App:

- **Grid View:** แสดง assets ในรูปแบบ grid พร้อม thumbnail
- **Search & Filter:** ค้นหาด้วย keyword, filter ตามประเภท, tag, หรือ spec
- **Detail Panel:** แสดงข้อมูล asset, metadata, และ version history
- **Actions:** Copy path, download, หรือ insert asset ลงใน spec

---

## 3. ขั้นตอนการดำเนินงาน (Implementation Plan)

แบ่งการพัฒนาออกเป็น 4 ขั้นตอนหลัก:

### ขั้นตอนที่ 1: Backend Development (Database & API)

1.  **สร้าง Database Model:** Implement `Asset` model ใน `python-backend/app/models/asset.py`
2.  **Run Alembic Migration:** สร้าง migration script และอัปเดตฐานข้อมูล
3.  **สร้าง Pydantic Schemas:** สร้าง `AssetCreate`, `AssetUpdate`, `AssetRead` schemas
4.  **สร้าง CRUD Logic:** Implement logic สำหรับจัดการ assets ใน `python-backend/app/crud/crud_asset.py`
5.  **สร้าง API Endpoints:** สร้าง API endpoints ใน `python-backend/app/api/v1/assets.py`
6.  **เพิ่ม Unit Tests:** เขียน tests สำหรับ CRUD logic และ API endpoints

### ขั้นตอนที่ 2: MCP Server Integration

1.  **ปรับปรุง `save_asset_to_project`:** เพิ่ม logic การเรียก `POST /api/v1/assets` เพื่อลงทะเบียน asset หลังบันทึกไฟล์
2.  **สร้าง `find_assets`:** Implement tool สำหรับเรียก `GET /api/v1/assets`
3.  **สร้าง `get_asset_details`:** Implement tool สำหรับเรียก `GET /api/v1/assets/{asset_id}`
4.  **เพิ่ม Unit Tests:** เขียน tests สำหรับ MCP tools ใหม่

### ขั้นตอนที่ 3: Frontend Development (Asset Browser)

1.  **สร้าง UI Components:** สร้าง React components สำหรับ Asset Browser, Grid, Search Bar, Detail Panel
2.  **เชื่อมต่อ API:** สร้าง functions ใน `assetService.ts` เพื่อเรียก Backend APIs
3.  **จัดการ State:** ใช้ `useState` และ `useEffect` สำหรับจัดการ state ของ assets
4.  **Implement Actions:** สร้าง logic สำหรับ copy path, download, และ insert asset

### ขั้นตอนที่ 4: Integration & Testing

1.  **End-to-End Testing:** ทดสอบ flow ทั้งหมด: Generate → Save → Register → View in Asset Browser
2.  **Documentation:** อัปเดตเอกสาร `README.md` และ API documentation
3.  **Deployment:** Deploy การเปลี่ยนแปลงทั้งหมด

---

## 4. สิ่งที่ต้องพิจารณาเพิ่มเติม

- **Storage:** ปัจจุบันไฟล์ถูกเก็บใน local filesystem. ในอนาคตอาจพิจารณาใช้ Cloud Storage (S3, GCS) เพื่อรองรับ scalability และ collaboration
- **Asset-Spec Linking:** ควรมีกลไกที่ชัดเจนในการ link asset กับ `spec.md` เช่น การใช้ ID ที่ไม่ซ้ำกันใน spec
- **Performance:** สำหรับโปรเจกต์ที่มี assets จำนวนมาก การทำ pagination และ lazy loading ใน Asset Browser เป็นสิ่งจำเป็น
