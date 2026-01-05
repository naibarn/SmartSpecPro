# spec.md — 002-auth-generator (Template/Scaffolding Generator)

Spec ID: **SSP-GEN-002**  
Spec folder: `specs/feature/002-auth-generator/`  
Code boundary: `auth-generator/`  
Last updated: 2026-01-05

---

## 1) Purpose
`auth-generator/` คือ **template/scaffolding generator** สำหรับ “ผู้ใช้/ลูกค้า” ที่ต้องการสร้าง SaaS ได้เร็วขึ้น
- generate โครงสร้าง auth (login/register/session/roles) และไฟล์ที่จำเป็นตาม spec input
- เป็น generator tool ไม่ใช่ runtime auth server ของแพลตฟอร์ม

---

## 2) How it is consumed
- ใช้ได้แบบ **local CLI** โดยผู้ใช้ (run ในเครื่อง)
- หรือเปิดให้ generate ผ่านระบบ โดยให้:
  - **SmartSpecWeb server (Spec 003)** spawn CLI นี้ (recommended สำหรับ web)
  - หรือ **python-backend (Spec 007)** spawn CLI นี้เป็น service helper (optional)

---

## 3) Relationships (ชัดเจน)
- 002 ถูก “เรียกใช้” (spawn) ได้โดย 003 หรือ 007
- 002 ไม่ควรถูก import เป็น library ใน runtime ของแอป (ถือเป็น external tool)

---

## 4) Non-goals
- ไม่ใช่ identity provider hosting
- ไม่เป็น backend auth หลักของ SmartSpecWeb

---

## 5) Definition of Done
- เอกสารระบุชัดว่าเป็น generator/template สำหรับ user
- ระบุ consumer ที่เหมาะสม (003 recommended, 007 optional)
