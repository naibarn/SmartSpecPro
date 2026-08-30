# Deep-implement evidence — Section 02

สถานะ: completed (Worker preparation/render admission lane)

สิ่งที่ส่งมอบ:

- approved multi-segment FFmpeg concat พร้อม validate path, segment count, duration และ 9:16 QC
- dead-air removal เฉพาะช่วงที่อยู่ใน approved segments และรักษา speech edge padding ที่ bounded ไม่เกิน 2 วินาที
- source-to-prepared time map ถูกเขียนใน artifact metadata เพื่อ trace กลับ footage ต้นฉบับ
- QC ก่อน publication, checksum/size/content-type proof และ vertical-drama media publication ผ่าน binding เดิม
- B-roll placement validation: bounds, source range, prepared revision และ approved asset manifest
- server compile B-roll เป็น strict `remotion_render_video`/`GenericTemplate` input พร้อม signed/proxy URLs ที่ตรวจ authorization แล้ว
- Worker `footage_broll_render` delegate ไปยัง Remotion sidecar ที่มีอยู่จริง; หากไม่มี `remotionInput` หรือ contract/capability ไม่พร้อมจะ fail-closed
- output ของ Remotion เก็บเป็น `storageRef` แบบ durable และ Web status resolver แปลงเป็น protected playback URL ก่อนส่งให้ browser; ไม่สร้าง public URL จาก Worker
- capability hints แยก media analysis/prepare ออกจาก Chromium/Remotion render เพื่อไม่ให้ worker ที่ไม่พร้อม claim งานผิดประเภท

หลักฐาน:

- `cargo check --manifest-path apps/worker-app/src-tauri/Cargo.toml` ผ่าน
- `cargo test --manifest-path apps/worker-app/src-tauri/Cargo.toml --lib worker_loop::tests:: -- --nocapture`: 34 ผ่าน
- ไม่มี live Worker claim/render หรือ protected playback run ใน environment นี้
