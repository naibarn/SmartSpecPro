# โหมด Desktop Host แบบ Managed

SmartSpecPro Desktop Host คือพื้นผิว local execution แบบมี governance ของ SmartSpecPro

## ความหมายของระบบนี้

- Web ยังเป็น control plane
- Desktop ยังเป็น execution-rich surface
- local execution แบบ managed ยังต้องวิ่งผ่าน gateway-only LLM routing
- local roots ใช้แทนการค้นทั้งดิสก์แบบ raw path ใน managed mode
- run ของ Pi และ Agency Swarm ยังต้องอยู่ใต้ policy, audit, และ labeling ที่ตรงความจริง

## ป้ายกำกับการรันที่ตรงความจริง

- `Local` หมายถึง input ดิบไม่ออกจากเครื่อง
- `Hybrid` หมายถึงรันบน desktop แต่มีข้อมูลหรือ tool access ข้ามไปยังระบบที่ server จัดการ
- `Server` หมายถึงรันบน runtime ฝั่งเซิร์ฟเวอร์
- `External` หมายถึงรันบน external worker surface เช่น OpenClaw gateway

## Rollout gates

ห้ามเปิด managed rollout กว้าง หาก gate ที่จำเป็นยังไม่ครบ:

- device binding แบบ proof-of-possession
- signed package verification
- signed update verification
- managed local roots เป็น default discovery path
- Pi startup แบบ gateway-only
- Agency Swarm startup แบบ gateway-only
- offboarding cleanup readiness

## สิ่งที่หน้า Settings ควรแสดง

- รายการ enrolled desktop devices พร้อม health, last-seen, และ posture ของ proof-of-possession
- attestation/storage mode ที่ desktop รายงานกลับมา
- posture ของ rich-document parser แบบ isolated รวมถึง format ที่รองรับ, extractor backend, OCR provider, สถานะ extraction-only, และ bounded limits
- device ที่ถูก disable ต้องแสดงสถานะ disabled และต้องไม่ผ่าน managed execution gates หลัง policy refresh รอบถัดไป
- หน้า Settings สามารถมี action สำหรับ disable device แบบ governed เพื่อ trigger offboarding cleanup ตอนเครื่องติดต่อกลับมารอบถัดไป

## ข้อจำกัดปัจจุบัน

- device proof แบบ cryptographic ใช้งานได้แล้ว และ Desktop Host จะรายงานได้ว่า key ปัจจุบันเป็น software-backed, OS-protected, OS-attested, หรือ hardware-backed เมื่อ helper หรือ deployment hint รองรับ แต่ platform-attested key broker แบบครอบคลุมทุก platform ยังเป็น hardening slice ถัดไป
- rich-document parser รองรับ PDF, Office แบบ legacy/OpenXML, และไฟล์ภาพแบบ bounded แล้ว และสามารถใช้ `pdftotext`, `pdftoppm` หรือ `mutool`, `soffice`, และ `tesseract` แบบ opportunistic ได้เมื่อมีในเครื่อง แต่ยังไม่ใช่ OCR หรือ rendering pipeline เต็มรูปแบบสำหรับไฟล์ซับซ้อนมาก

## หมายเหตุด้าน compatibility

เส้นทาง localhost proxy แบบเดิมจาก Feature 004 ยังอยู่ในสถานะ compatibility-only ระหว่าง migration และไม่ใช่สัญญาระยะยาวของ Desktop Host แบบ managed
