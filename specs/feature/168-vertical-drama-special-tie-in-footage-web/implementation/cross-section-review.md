# Cross-section review

การค้นหา SocratiCode MCP ใน session นี้ไม่มี tool transport ให้เรียกใช้ จึงใช้การไล่จาก spec/section, `rg`, symbol references และ targeted tests เป็น fallback ตาม repo instruction

- Feature 168 เป็น owner ของ UX, authorization boundary, story/character intent, billing reservation และ payload admission
- Feature 169 เป็น owner ของ local media processing, ffprobe/HyperFrames, FFmpeg, Remotion sidecar, QC และ artifact publication
- จุดเชื่อมเดียวคือ versioned `verticalDramaMedia` contracts และ `worker_jobs` event/artifact lifecycle
- เว็บไม่อ่านไฟล์ footage หรือ render video เอง; เว็บส่ง intent และแสดงสถานะ
- Worker ไม่เลือกตัวละคร/แต่ง story/ตัดสิน claim สินค้า; Worker ใช้ guide/approval ที่ server ส่งมา
- refresh ไม่สร้าง idea ใหม่ และ retry ใช้ idempotency/revision เดิมอย่างชัดเจน
