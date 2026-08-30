# Fresh gap review loop 11–20 — Feature 169

ตรวจซ้ำใหม่ 10 รอบหลัง deep-implement โดยเน้น Worker runtime, artifact durability,
memory, event contract, billing และ boundary ที่เว็บต้องเชื่อถือได้ ทุก gap ที่พบ
ถูกแก้ทันทีและตรวจซ้ำด้วย test/build ที่ทำได้ใน local environment

## รอบ 11 — worker contract coverage

- ตรวจ job kinds, payload schema, status enum, event map และ executor routing
- ไม่พบ gap หลัก: `footage_probe_analyze`, `footage_prepare` และ
  `footage_broll_render` มี typed payload, binding และ terminal state ครบ
- ผล: ผ่าน โดยยังแยก runtime/provider verification เป็น release gate

## รอบ 12 — Web/Worker status parity

- ตรวจ status ที่ Worker ส่งกับ shared media contract และ polling ของ dialog
- พบความเสี่ยงที่ client อาจรอ `published` ทั้งที่ ledger ใช้ `completed` หรือ
  terminal `expired`
- แก้ shared `mediaJobStatusValues` และ polling ให้รองรับ completed/expired
- ผล: ไม่ poll ค้างและไม่ตีความ expired เป็นงานที่ยังทำงานอยู่

## รอบ 13 — HyperFrames transcription boundary

- ตรวจ required/preferred/disabled policy, direct bundled CLI และ partial guide
- ไม่พบ gap ใหม่: Worker เรียก pinned runtime CLI, ไม่ใช้ `npx` ระหว่าง runtime,
  คืน warning ตาม policy และไม่เดา transcript เมื่อ unavailable
- ผล: guide ยังอธิบายภาพรวมได้โดยแยก transcript ที่พิสูจน์ไม่ได้ออกชัดเจน

## รอบ 14 — large-file ingest

- ตรวจ upload cap เว็บกับ `materialize_footage_source` และการเก็บไฟล์ชั่วคราว
- พบ cap ไม่เท่ากัน (2 GiB ที่เว็บ, 1,500 MiB ที่ Worker)
- แก้ Worker เป็น 2,000 MiB และคง streamed download พร้อม bounded byte check
- ผล: ไฟล์ที่ผ่าน admission ไม่ถูกปฏิเสธด้วย cap ที่ต่ำกว่าใน Worker

## รอบ 15 — ffprobe/dead-air output

- ตรวจ probe, silence ranges, transcript, guide และ approved segment time map
- ไม่พบ gap ใหม่: Worker ใช้ ffprobe/analysis เป็น guide, ตัด silence เฉพาะช่วง
  ที่ user อนุมัติ, รักษา speech padding แบบ bounded และคืน source time map
- ผล: AI idea มี guide คร่าว ๆ จาก footage จริงและไม่ตัดนอก approval

## รอบ 16 — artifact upload memory

- ตรวจ path upload ของ guide/prepared/render artifact และ retry behavior
- พบ whole-file read/clone ใน artifact uploader ซึ่งไม่เหมาะกับ footage ใหญ่
- แก้ให้ checksum/size เป็น chunked read และ HTTP body ใช้ Tokio `ReaderStream`
  เปิด file ใหม่ต่อ retry
- ผล: Worker ไม่แบกไฟล์ทั้งก้อนใน RAM ขณะ upload/retry

## รอบ 17 — Remotion capability boundary

- ตรวจ `footage_broll_render` ว่าใช้ existing Remotion executor และไม่ fallback
  ไป render บน web server
- ไม่พบ gap ใหม่: server compile layer manifest, Worker claim เฉพาะ capability
  ที่พร้อม และ fail closed เมื่อ contract/executor ไม่พร้อม
- ผล: งาน CPU/render หนักยังอยู่ Worker ตาม spec

## รอบ 18 — source/artifact integrity

- ตรวจ artifact type, checksum, job status, tenant/user, Series binding และ
  prepared revision ตอน resolve URL
- พบว่าการตรวจบางส่วนเกิดเฉพาะตอน render แต่ save B-roll ที่ไม่มี render job
  ยังต้องปลอดภัย
- แก้ให้ server ตรวจ prepared normalized artifact และ media sources ทุกครั้งที่
  save B-roll plan
- ผล: stale/cross-tenant/cross-Series artifact ใช้ต่อไม่ได้

## รอบ 19 — terminal billing recovery

- ตรวจ event `completed/failed/canceled/expired` และ reservation lifecycle
- พบ terminal post-processing failure อาจ mark failed โดยไม่คืน reservation
- แก้ registry recovery ให้ reconcile เป็น failed/refund เมื่อ publication หรือ
  credit settlement หลัง completion ล้มเหลว โดยไม่สร้าง reservation ใหม่
- ผล: billing มี recovery boundary ชัดเจนและ duplicate terminal event ยัง replay-safe

## รอบ 20 — event payload publication shape

- ตรวจ shape ที่ Worker ส่งจริง: feature payload อยู่ใต้ `lastEventPayload`
  หลัง server event mirror ขณะที่ UI และ server consumer บางจุดอ่าน top-level
- พบ gap ที่ทำให้ guide/prepared source ดูเหมือนหายหลัง job complete
- แก้ Web footage service ให้ promote fields ที่ปลอดภัยสำหรับ browser response
  และ validator อ่านทั้งสอง lane พร้อม require prepared `artifact-*` source
- ผล: analysis/prepare chain ต่อได้หลัง polling และไม่รับ client output ที่ไม่มี
  Worker artifact รองรับ

## หลักฐานหลังจบรอบ

- Worker `cargo check` ผ่าน
- Worker unit tests: 34 tests ผ่าน
- Web focused tests: 3 test files, 19 tests ผ่าน และ billing/registry 2 files,
  50 tests ผ่าน
- Vite production build ผ่าน
- `git diff --check` สำหรับ implementation ที่ตรวจผ่าน
- Full TypeScript check timeout ที่ 180 วินาทีโดยไม่มี diagnostic output จึงยัง
  ไม่อ้างว่า full typecheck ผ่าน

## Runtime gates ที่ยังต้องพิสูจน์จริง

ต้องทดสอบบน Worker ที่ลงทะเบียนจริง: claim capability/doctor, direct HyperFrames
transcription, ffprobe/ffmpeg กับไฟล์จริง, Remotion sidecar render, artifact upload
และ protected playback ผ่าน storage รวมถึง production migration/deploy
