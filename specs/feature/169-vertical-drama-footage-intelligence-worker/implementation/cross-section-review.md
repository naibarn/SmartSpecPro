# Cross-section review

การค้นหา SocratiCode MCP ใน session นี้ไม่มี tool transport ให้เรียกใช้ จึงใช้การไล่จาก spec/section, `rg`, symbol references และ targeted cargo tests เป็น fallback ตาม repo instruction

Contract boundary ที่ตรวจร่วมกับ Feature 168:

- source fingerprint และ binding revision ต้องอยู่ในทุก downstream job
- prepare ต้องรับ silence ranges จาก immutable guide และส่ง prepared revision/map กลับ
- B-roll placement ใช้ prepared milliseconds, storyBeatId และ approved source manifest
- server compile URLs หลัง authorization; worker ใช้เฉพาะ payload ที่ผ่าน strict Remotion contract
- credit reservation เกิดก่อน queue และผลล้มเหลวคืน/settle ผ่าน worker job lifecycle
- guide/transcript ที่ไม่พร้อมต้องแสดง warning ไม่แต่งข้อมูลเติม
