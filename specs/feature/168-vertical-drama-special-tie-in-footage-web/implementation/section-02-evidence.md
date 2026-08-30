# Deep-implement evidence — Section 02

สถานะ: completed (UI and queue integration implemented)

สิ่งที่ส่งมอบใน `SpecialTieInEpisodeDialog.tsx`:

- upload จริงผ่าน init/presigned PUT/complete พร้อม fallback เดิม, จำกัดชนิด/ขนาด และ progress/error state
- image/video preview แตะเพื่อ fullscreen และ protected media handling
- model สร้างภาพ, model สร้างวิดีโอ และ LLM สร้างไอเดียเป็น searchable scrollable selectors
- character selection เป็นรายตัว ไม่ใช้ shared select-all state; ส่งเฉพาะ IDs ที่เลือกให้ Skill
- ไอเดีย 3 ใบเป็น continuous human-readable story แยก story/dialogue/action ให้แก้ไขได้ก่อนสร้าง 9 ช็อต
- no-dialogue mode บังคับ action/body-language แทนบทพูด
- refresh/F5 ไม่แสดง idea เป็น current state; idea เก่าถูกเก็บใน collapsed history และต้องกดขยาย
- footage-first flow: analyze → review guide/trim → Worker prepare → generate story ideas
- B-roll placement ส่ง millisecond timing และ prepared revision; server compile เป็น Remotion payload หลังตรวจ source/binding
- สถานะ Worker ที่ถือว่าเสร็จสมบูรณ์รองรับ `completed` ตาม enum จริงของ `worker_jobs` (และ `published` สำหรับ compatibility); reopen input เดิมคืน placement และ render job ได้

ข้อจำกัดที่ตั้งใจไว้:

- การสร้าง 9 ช็อตและ final B-roll render ไม่ทำอัตโนมัติจากการเปิด dialog
- ถ้า Worker/Remotion capability ไม่พร้อม งานถูก reject/fail-closed และไม่สร้าง artifact ว่าง
