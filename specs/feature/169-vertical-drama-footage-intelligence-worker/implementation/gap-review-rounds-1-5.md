# Gap review loop — Feature 169

ตรวจหลัง implementation 5 รอบ โดยแก้ทันทีทุก gap ที่พบ

## รอบ 1 — input safety และ memory

พบว่าการดาวน์โหลด footage ขนาดใหญ่แบบ `Vec` ทำให้ memory สูง จึงเพิ่ม streaming download ลง workspace พร้อม content-length/byte cap และ SHA-256 verification

## รอบ 2 — analysis truthfulness

พบว่า transcription runtime อาจไม่ติดตั้งใน managed WSL จึงใช้ direct pinned HyperFrames CLI, แยก required/preferred/disabled และคืน partial guide พร้อม warning แทนการเดา transcript

## รอบ 3 — dead air และ time map

พบว่า silence จาก guide ต้องไม่ตัดนอกช่วงที่ user อนุมัติ จึงตัดเฉพาะ approved segment, รักษา speech padding แบบ bounded และสร้าง source-to-prepared map

## รอบ 4 — capability และ recovery

พบว่า media worker อาจ claim Remotion งานโดยไม่มี Chromium contract จึงแยก capability hints และให้ B-roll render advertise เฉพาะเมื่อ Remotion contract พร้อม พร้อม typed failure mapping/checkpoint/event retry behavior

## รอบ 5 — composition output

พบว่า B-roll identity อย่างเดียวไม่พอให้ Remotion โหลด asset จึงเพิ่ม server-side URL-bearing Remotion input และ Worker delegate ไป executor เดิม; ถ้า input หาย/URL หรือ executor ไม่พร้อมต้อง fail closed ก่อนสร้างไฟล์ว่าง

ข้อจำกัดที่ยังต้องพิสูจน์บน deployment จริง: sidecar render, signed URL reachability จาก Worker runtime, publication/playback ผ่าน R2/proxy และ migration state ของ production database

## Continuation rounds 6–10

ตรวจซ้ำหลังเพิ่ม Web-side artifact URL resolution และ story-bound B-roll render:

1. Worker status — ยืนยัน completion path ใช้ `completed`; UI ไม่ค้างรอ `published` อีกต่อไป
2. Artifact playback — Worker เก็บ `storageRef` แบบ durable และ Web resolve เป็น protected URL ก่อน browser ใช้งาน
3. Render contract — B-roll route ยังคงผ่าน `remotion_render_video`/`GenericTemplate` เท่านั้น และ fail-closed เมื่อไม่มี payload/capability
4. Revision safety — render job ต้องตรงกับ story/shot-plan revision ที่ส่งตอน save ไม่เช่นนั้น reject และให้ render ใหม่
5. Regression — cargo Worker tests 34 ผ่าน, cargo check ผ่านก่อนหน้า, Web contract tests และ Vite build ผ่าน

ผลรอบต่อเนื่อง: ไม่พบ high-confidence gap ใน local Worker implementation เพิ่มเติม จุดที่ยังเป็น release evidence เท่านั้นคือ runtime doctor/claim/render จริง, HyperFrames model availability, storage upload/playback และ production deployment
