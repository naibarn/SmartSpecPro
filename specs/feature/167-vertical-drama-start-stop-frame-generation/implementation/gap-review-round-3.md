# Gap review round 3 — canonical media and video integration

ตรวจ asset URL resolution, picker ownership, provider metadata, motion-pack
mapping และการเลือก shot สุดท้ายของ clip

- พบ gap: เมื่อ Stop prompt เปลี่ยนหลัง motion pack ถูกสร้าง `endFrameAssetId`
  เดิมอาจค้างและถูกส่งไป provider ต่อ
- แก้แล้ว: row-locked prompt persistence ล้าง end-frame ของ clip ที่มี shot นี้
  เป็น ordered shot สุดท้าย; การเลือก Stop asset เขียน canonical asset ใหม่
- แก้แล้ว: motion sync ใช้ approved Stop asset เท่านั้น, ไม่ fallback ไป Start
  หรือ shot ก่อนหน้า, และคำนวณ `first_last_frame_bridge` เฉพาะเมื่อมีทั้งสองฝั่ง
- ตรวจซ้ำ: asset IDs ถูก resolve ผ่าน tenant/user boundary เดียวกับ Start

ผล: ผ่านรอบ canonical media; Start-only pack ยังคงส่งได้ด้วย mode เดิม.
