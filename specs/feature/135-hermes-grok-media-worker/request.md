# 135 - Hermes Grok Media Worker — Original Request

Date: 2026-07-16
Requested by: Product owner (Thai, translated + preserved intent)

## Original requirement (summary)

เพิ่มระบบ Hermes agents worker เพื่อเชื่อมกับ Grok account subscription
เพื่อสามารถสั่ง generate ภาพและวีดีโอได้ โดยมีเงื่อนไขหลักดังนี้:

1. **เป็น option เพิ่มเติมในการเลือก media model** — ผู้ใช้เลือกได้จากตัวเลือก
   model media ปกติที่มีอยู่ (รวมถึง MCP) แต่ตัวนี้ทำงานผ่าน Hermes agents
   worker แทน
2. **รองรับ 2 โหมดการติดตั้ง (deployment modes) ในงวดนี้ ทั้งคู่:**
   - **Shared Server Hermes Worker** — ติดตั้งที่ server หลัก เป็น worker
     กลางใช้ร่วมกันทุกคน ต้องมีการตรวจสอบ concurrent และ rate limit
     ป้องกัน server มีปัญหา
   - **Private Hermes Worker** — ติดตั้งฝั่ง Windows / Mac client ของ user
     ผูกกับบัญชีของ user เฉพาะคน โดยรวมเข้ากับระบบเดิมคือ
     **Smart AI Hub Worker App** (ปัจจุบันทำเฉพาะ render video —
     เพิ่มให้รองรับ Hermes ด้วย; Worker App เป็นแอพที่ build แยกออกไป)
3. รายละเอียดระบบ Hermes worker อ้างอิงจากเอกสาร
   "SmartSpecPro – Hermes Grok Media Worker Development Specification v1.1"
   ที่ผู้ใช้ให้มา โดยต้องปรับให้เข้ากับเงื่อนไขข้างต้นและ codebase ปัจจุบัน

## Constraints given

- สร้างเป็น spec ใหม่ต่อจาก spec เดิมใน `specs/feature` (ลำดับถัดไปคือ 135)
- ห้ามแก้ไขไฟล์ spec เก่า ๆ
- เอกสารต้นทาง (v1.1) เขียนแบบ standalone worker platform — spec นี้ต้อง
  map ลงบน infrastructure ที่มีอยู่จริง: worker fabric (`worker_jobs`,
  `workers`, heartbeat/claim/artifact endpoints), media model transport
  (`shared/mediaModelTransport.ts`), MCP connection pattern (feature 121),
  Smart AI Hub Worker App (feature 124), Hermes runtime lane (features
  081/093)

## Primary source document

The full external reference document ("SmartSpecPro – Hermes Grok Media
Worker Development Specification v1.1", 2026-07-16) was provided inline in
the request. Its content has been adapted — not copied verbatim — into
`spec.md` in this folder. Where the reference document conflicts with the
existing codebase (e.g. it proposes new `provider_connections` /
`media_generation_jobs` tables), `spec.md` supersedes it by mapping onto
existing SmartSpecPro entities.
