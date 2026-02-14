# Interview Transcript: Google Drive & Google Workspace Integration

**Date:** 2026-02-14
**Interviewer:** Claude (Deep-Plan)
**Interviewee:** Project Owner

---

## Q1: Scope — ต้องการให้ deep-plan ครอบทั้ง 5 Phases หรือเลือกเฉพาะ?

**คำตอบ:** ครบทั้ง 5 Phases

- Phase 1: Per-User Google OAuth in Settings
- Phase 2: Word/Excel Editing via Google Docs/Sheets
- Phase 3: MCP Server for Google Drive & Apps
- Phase 4: RAG Integration & Federated Search
- Phase 5: Incremental Sync & Webhooks + Unified Credit Billing

---

## Q2: Billing — ต้องการแก้ billing gaps เดิมที่มีอยู่ด้วยหรือไม่?

**คำตอบ:** แก้ทั้งหมดพร้อมกัน

ต้องการแก้ billing gaps ที่มีอยู่ทั้งหมด:
- Upload indexing (embedding API cost ที่ไม่คิดเครดิต)
- RAG semantic search queries (query embedding cost ที่ไม่คิดเครดิต)
- Markdown save re-indexing

พร้อมกับเพิ่ม billing ใหม่สำหรับ Google Drive operations ที่ระบุใน spec

---

## Q3: Vector Database — ใช้ตัวไหนสำหรับ Google Drive indexing?

**คำตอบ:** ใช้ตัวเดียวกับ Library แต่ต้องยืดหยุ่นรองรับไม่ว่าจะเปลี่ยนไปใช้ vector database ตัวไหน ตามที่ Admin จะ config ในข้อ Vector Database Setting ที่มีอยู่แล้ว

**สิ่งที่หมายถึง:**
- Google Drive vectors ใช้ vector DB เดียวกับ Library (ปัจจุบัน ChromaDB/pgvector)
- ระบบต้อง abstract ผ่าน vector store interface ที่มีอยู่
- รองรับ Admin เปลี่ยน vector DB ผ่าน Settings ได้ (เช่น สลับไป Cloudflare Vectorize)
- ไม่ hardcode vendor-specific code

---

## Q4: Google Cloud Project — สถานะปัจจุบัน

**คำตอบ:** ยังไม่มี

ต้องสร้าง Google Cloud Project ใหม่ รวมถึง:
- สร้าง OAuth 2.0 Client ID/Secret
- เปิด Drive API, Docs API, Sheets API, Slides API
- ตั้ง OAuth consent screen
- ตั้ง authorized redirect URIs

---

## Q5: Error Handling — เมื่อ token ถูก revoke หรือ API error

**คำตอบ:** แจ้ง user + ขอเชื่อมใหม่

**รายละเอียด:**
- แสดงสถานะ "การเชื่อมต่อหมดอายุ" ใน Settings
- แสดงปุ่ม "Reconnect" ให้ user เชื่อมใหม่
- ไม่ลบ virtual references หรือ vectors ที่มีอยู่
- หยุด sync/webhook ชั่วคราวจนกว่า user จะเชื่อมใหม่

---

## Q6: MCP Server Deployment

**คำตอบ:** รวมกับ Python backend

- เพิ่ม MCP tools เข้าไปใน FastAPI app ที่มีอยู่
- ไม่ต้องเพิ่ม process ใหม่
- ใช้ existing HTTP gateway ที่ /api/mcp/*

---

## Q7: Scale — จำนวน users และไฟล์ที่คาดหวัง

**คำตอบ:** 50-200 users, ~1,000 ไฟล์/คน

**สิ่งที่หมายถึง:**
- ต้อง optimize การ indexing ให้รองรับ batch processing
- Rate limiting สำหรับ Google API ต้องจัดการ (20,000 req/100s/project)
- Vector store ต้องรองรับ ~200,000 ไฟล์ total (200 users × 1,000 files)
- แต่ละไฟล์อาจมี 5-50 chunks → total ~1-10 million vectors

---

## Q8: Search UI — แสดงผล Federated Search

**คำตอบ:** ทั้งสองแบบ

- Default: ผสมรวม (merged) rank ตาม relevance พร้อม badge [Library] / [Google Drive]
- มี filter tabs: All | Library | Google Drive ให้ user กรองได้
- ต้องทำทั้ง merged view และ filtered view

---

## Q9: Edit Flow — Save back mechanism

**คำตอบ:** User กด Save back เอง

**รายละเอียด:**
- หลัง user เปิดไฟล์ใน Google Docs/Sheets แล้วกลับมา
- แสดง status bar บอกว่า "ไฟล์นี้ถูกเปิดใน Google Docs เมื่อ X นาทีที่แล้ว"
- ปุ่ม: [Save back to Library] | [Discard Google copy] | [Open again]
- ไม่ต้อง auto-poll สถานะไฟล์

---

## Q10: Admin Config — Google Client ID/Secret

**คำตอบ:** ผ่าน Admin Settings UI

- เหมือน SMTP/Stripe config ที่มีอยู่
- เก็บใน `system_settings` table (encrypted)
- Admin กรอก Client ID, Client Secret, Redirect URI ผ่าน Settings หน้า Admin
- ไม่ต้อง restart services

---

## Q11: Initial Sync UX

**คำตอบ:** Progress bar + ใช้งานได้ระหว่าง sync

**รายละเอียด:**
- แสดง progress bar ใน Settings page (เช่น "Syncing: 234/1,000 files")
- User ยังใช้งานระบบอื่นได้ระหว่าง sync
- ไฟล์ที่ sync เสร็จแล้วจะปรากฏใน search ได้ทันที
- Sync ทำงานเป็น background job

---

## Q12: ความต้องการพิเศษเพิ่มเติม

**คำตอบ:** ไม่มี ครบแล้ว

ข้อมูลทั้งหมดจาก spec + interview ครบถ้วนแล้ว
