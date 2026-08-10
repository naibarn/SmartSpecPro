# Request

เพิ่มระบบ render จาก Sub-Episode เป็น Production Episode ด้วย Remotion โดยเลือกช่วงตอนย่อย, แบ่งจำนวนตอนต่อ EP ขั้นต่ำ 3, ใช้ compiled video หรือประกอบจาก shot ได้, ใส่เลข EP/ชื่อซีรีส์/ลายน้ำตาม Settings, สร้างผ่าน job_render เดิม และแสดงผลใน UI พร้อม play/fullscreen/download

## Approved decisions

- ใช้แนวทาง `remotion_render_video` เดิม + segmented GenericTemplate
- source modes: auto, compiled-only, shot-assembly-only
- auto ผสม compiled และ shot fallback ได้
- เลข EP คำนวณอัตโนมัติ
- ชื่อซีรีส์ดึงจากระบบและเปิด/ปิดได้
- ใช้ enabled watermark slots ทั้งหมดจาก Settings และเปิด/ปิดได้
- เลือกช่วงรวมและจำนวน Sub-Episode ต่อ EP แยกกัน; ขั้นต่ำ 3
- กลุ่มท้ายไม่ครบต้องให้ผู้ใช้เลือกสร้างสั้นหรือข้าม

## Constraints

- Preserve existing dirty/unrelated work.
- No destructive migration.
- Reuse existing `productionEpisodesManifest`, Remotion worker contract, and UI player patterns.
