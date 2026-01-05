# spec.md — 003-smartspec-website (SmartSpecWeb)

Spec ID: **SSP-WEB-003**  
Spec folder: `specs/feature/003-smartspec-website/`  
Code boundary: **`SmartSpecWeb/` (ทั้งหมดของเว็บแอป)**  
Last updated: 2026-01-05

---

## 1) Purpose
**SmartSpecWeb** คือเว็บแอปหลักของแพลตฟอร์ม (Website + Web App) ที่รวมทั้ง:
- **Client (React/Vite)** สำหรับหน้าใช้งานและหน้าแอดมิน
- **Web Server (Node/Express)** สำหรับเสิร์ฟเว็บ + API (tRPC) + OAuth routes
- **Shared code** (types/const) ใช้ร่วม client/server
- **DB schema & migrations** (Drizzle)

> หมายเหตุ: ใน code ปัจจุบัน SmartSpecWeb เป็น **full‑stack Node** (ไม่ใช่ “frontend-only”).

---

## 2) Code locations
- Root: `SmartSpecWeb/`
- Client: `SmartSpecWeb/client/`
- Server runtime entry: `SmartSpecWeb/server/_core/index.ts` (รันด้วย `pnpm dev`)
- Server routers (tRPC): `SmartSpecWeb/server/routers.ts`
- Shared: `SmartSpecWeb/shared/`
- DB (Drizzle): `SmartSpecWeb/drizzle/`

Scripts ที่เกี่ยวข้อง (จาก `SmartSpecWeb/package.json`):
- `pnpm dev` → `tsx watch server/_core/index.ts`
- `pnpm build` → `vite build` + `esbuild server/_core/index.ts ... -> dist`
- `pnpm start` → `node dist/index.js`

---

## 3) Public interface (runtime)
- Web server default port: `PORT` (default 3000; มี logic หา port ว่าง)
- API: tRPC ที่ `"/api/trpc"` (mount ใน `server/_core/index.ts`)
- OAuth callback routes ภายใต้ `"/api/oauth/*"` (register ใน `server/_core/index.ts`)

---

## 4) Relationships to other specs (ทำให้ไม่สับสน)
**003 เป็นเว็บแอปแบบ self-contained** และมี server ของตัวเอง

### 003 ↔ 007 (python-backend-service)
- **สถานะปัจจุบัน:** SmartSpecWeb **ไม่ได้เรียกใช้** `python-backend/` ในเส้นทางหลัก (ใช้ tRPC + node server ของตัวเอง)
- **อนาคต (optional):** ถ้าต้องการให้ web เรียก python backend ให้ทำเป็น “integration” เพิ่มเติม (เช่น REST client จาก node ไป python)

### 003 ↔ 005 (api-generator)
- **แนวทางที่แนะนำ:** ให้ **server ของ 003** เป็นตัวเรียก `api-generator/` (spawn CLI) เพื่อทำ “generate code ผ่านหน้าเว็บ”
- 005 ยังคงเป็น CLI standalone และไม่ผูกกับ UI โดยตรง

### 003 ↔ 006 (docker deploy)
- 006 เป็นวิธี run/deploy สำหรับ SmartSpecWeb (รวม DB/Redis/อื่น ๆ ตามต้องการ)

### 003 ↔ 002 (auth-generator template)
- 002 เป็น “generator/template สำหรับลูกค้า” ไม่ใช่ runtime auth ของ 003
- ถ้าจะเปิด feature generate auth scaffolding ผ่านเว็บ ให้ server ของ 003 เป็นคนเรียก CLI ของ 002 (หรือเรียกผ่าน 007 หากเลือกแนวนั้น)

### 003 ↔ 004 (desktop-app)
- 003 เป็น web app; 004 เป็น desktop app คนละแพลตฟอร์ม
- ทั้งสองอาจแชร์ “แนวคิด/โปรโตคอล” แต่ไม่ควรแชร์ runtime dependency ตรง ๆ

---

## 5) Non-goals
- ไม่ทำให้ `python-backend/` เป็น dependency หลักของ SmartSpecWeb ในสภาพปัจจุบัน
- ไม่ย้าย business logic ออกจาก SmartSpecWeb server ไปที่ที่อื่นโดยไม่จำเป็น

---

## 6) Definition of Done
- โค้ดของเว็บทั้งหมดอยู่ใน `SmartSpecWeb/`
- เส้นทาง API หลักของเว็บคือ `tRPC (/api/trpc)`
- เอกสารความสัมพันธ์ (ข้อ 4) ชัดเจน และสอดคล้องกับโค้ดใน repo
