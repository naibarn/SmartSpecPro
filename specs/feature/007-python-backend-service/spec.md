# spec.md — 007-python-backend-service (Local/Tooling Backend Service)

Spec ID: **SSP-BE-007**  
Spec folder: `specs/feature/007-python-backend-service/`  
Code boundary: `python-backend/`  
Last updated: 2026-01-05

---

## 1) Purpose
`python-backend/` คือ backend service แบบ Python (FastAPI) ที่ออกแบบมาเพื่อ:
- ให้ **Desktop app (Spec 004)** เรียกใช้งานผ่าน HTTP (`/api/v1/...`) เช่น Skills, Auth generator helper
- ทำหน้าที่เป็น “tooling/service layer” สำหรับงาน local/dev หรือ orchestration บางส่วน

> จุดสำคัญ: ในสถานะปัจจุบันของ repo นี้ **SmartSpecWeb (Spec 003) ไม่ได้ใช้ `python-backend/` เป็น backend หลัก** (SmartSpecWeb มี Node server ของตัวเอง)

---

## 2) Current public endpoints (as implemented)
- `/api/v1/skills/*` — จัดการ skill ใน workspace
- `/api/v1/auth-generator/*` — helper สำหรับ generate auth scaffolding (อาจ spawn CLI ของ Spec 002)
- (อื่น ๆ ตาม router ที่ include ใน `python-backend/app/main.py`)

---

## 3) Relationships (ทำให้ไม่สับสน)
### 007 ↔ 004 (desktop-app)
- **ใช้งานจริง:** 004 เรียก 007 ผ่าน `VITE_API_URL` (default `http://localhost:8000`) เพื่อ features บางอย่าง (skills, auth-generator UI)

### 007 ↔ 002 (auth-generator template)
- 007 อาจ spawn CLI จาก `auth-generator/` เพื่อ generate output ให้ผู้ใช้ (แต่ต้องทำ interface ให้ตรงกัน)

### 007 ↔ 003 (SmartSpecWeb)
- **สถานะปัจจุบัน:** ไม่ใช่ backend หลักของ 003
- **optional integration:** หากต้องการใช้ 007 ใน web ให้เพิ่ม client integration จาก SmartSpecWeb server ไปที่ 007 (ชัดเจนว่าเป็น “ทางเลือก”)

### 007 ↔ 006 (docker deploy)
- 006 สามารถใช้รัน 007 พร้อม dependencies (เช่น Postgres/Redis) ใน dev/deploy ได้

---

## 4) Non-goals
- ไม่ถือว่า 007 เป็น “backend หลักของ SmartSpecWeb” โดยอัตโนมัติ
- ไม่ย้าย web API ของ SmartSpecWeb ไปไว้ใน 007 โดยไม่ได้ตัดสินใจสถาปัตย์ก่อน

---

## 5) Definition of Done
- 007 ระบุบทบาทชัดเจน: tooling/local backend สำหรับ desktop และ optional integration
- ความสัมพันธ์กับ 003/004/002/006 ระบุชัดใน spec และไม่ขัดกับโค้ด
