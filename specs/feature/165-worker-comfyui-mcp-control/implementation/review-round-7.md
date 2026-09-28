# Implementation audit — round 7

วันที่: 2026-08-27

รอบนี้ตรวจเทียบ spec/plan กับ source ปัจจุบันและแก้ gap ที่พบจริง:

- เพิ่ม canonical `worker.jobs.summary` response fields: `projectionRevision`,
  `serverNow`, `active`, `waiting`, `recent`, `counts`, `nextCursor` และยังคง
  `items`/`serverTime` เพื่อ backward compatibility; เพิ่มการกรอง scope, job type,
  limit และ cursor แบบ bounded
- เพิ่มหน้า `ComfyUI Jobs` เป็น filtered view ของ global queue โดยไม่สร้าง
  scheduler หรือสถานะงานชุดที่สอง
- profile projection แสดง `workerId`; UI ดึง Worker ID จาก saved pairing และ
  native save/probe/execution ปฏิเสธ profile ที่เป็นของ Worker อื่น
- generic MCP execution บันทึก remote execution ID ผ่าน callback ทันทีหลัง submit
  เพื่อให้ ledger ใช้ recovery ได้แม้ process ล้มระหว่าง polling
- `uploadLibrary=false` ทำ local-only completion จริงและไม่ upload โดยอัตโนมัติ
- จำกัด MCP HTTP response, tool pages/count และ input schema size; ตรวจชื่อ tool
  ให้ปลอดภัย, ป้องกัน cursor loop/redirect และปิด server-owned fields จาก
  browser dispatch envelope
- เพิ่ม topbar status ของ active Comfy profile และเพิ่ม shared response schema

หลักฐานตรวจ:

- Worker `typecheck` และ `build` ผ่าน
- Rust full suite ผ่าน 188 lib tests, runtime manifest 10 tests และ worker executor
  21 tests (หลังเพิ่ม limit/cursor/redirect guards ชุด focused Comfy ผ่าน 19 tests)
- Web focused suite ผ่าน 44 tests
- section checker ผ่าน 9/9 และ UI contract checker ผ่าน 9/9
- full Web typecheck ยัง fail จาก baseline ที่อยู่นอกชุดนี้ เช่น schema ของ
  `gallery_items.tenantId`, vertical-drama draft ledger columns และ worker-series
  binding columns; ไม่พบ error ใหม่จากไฟล์ Comfy contract/route ในผลที่ตรวจ

ขอบเขตที่ยังต้องใช้ environment จริงเพื่อปิดหลักฐาน: browser E2E, ComfyUI MCP
server จริงทุก transport, Cloud credential, production queue/DB และ signed
installer release. Local tests ไม่อ้างแทนหลักฐานเหล่านี้.
