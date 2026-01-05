# spec.md — 005-api-generator (Code Generator CLI)

Spec ID: **SSP-GEN-005**  
Spec folder: `specs/feature/005-api-generator/`  
Code boundary: `api-generator/`  
Last updated: 2026-01-05

---

## 1) Purpose
`api-generator/` คือ **CLI tool** สำหรับ generate โค้ด/สเกลตัน API จาก spec/definition ที่กำหนด
- เป็น “generator” ไม่ใช่ runtime service
- มี tests ของตัวเองใน `api-generator/tests/**`

---

## 2) How it should be used (ชัดเจน)
### Primary (Web feature)
- **SmartSpecWeb server (Spec 003)** เป็นผู้เรียก `api-generator` (spawn CLI) เมื่อผู้ใช้กด generate ผ่านหน้าเว็บ
- ผลลัพธ์ที่ได้ถูกจัดเก็บ/ส่งออกตาม policy ของเว็บ (download/zip หรือเก็บใน storage)

### Optional (Tooling / Desktop / Workflows)
- `python-backend` (Spec 007) หรือ workflow scripts (Spec 001) อาจเรียก CLI นี้ได้สำหรับงาน local/dev
- แต่ไม่ควรทำให้ generator ผูกกับ UI ใด UI หนึ่ง

---

## 3) Relationships
- 005 ถูก “เรียกใช้” โดย:
  - **003 (recommended)** สำหรับ web-based generation
  - **007 (optional)** สำหรับ service-based generation
  - **001 (optional)** หากต้องการผูกเข้า workflow automation
- 005 ไม่ได้ถูกเรียกโดย 004 โดยตรงในแบบที่แนะนำ (ให้ผ่าน 003/007 จะชัดกว่า)

---

## 4) Non-goals
- ไม่ทำตัวเป็น web API server
- ไม่ผูก storage/DB ของแพลตฟอร์มไว้ในตัว generator

---

## 5) Definition of Done
- ระบุบทบาทและผู้เรียก (003 เป็นหลัก) ชัดเจน
- เอกสารไม่ทำให้เข้าใจว่า 005 เป็น backend service
