# Fresh gap review loop 11–20 — Feature 168

ตรวจซ้ำใหม่ 10 รอบหลัง deep-implement โดยตรวจทั้ง contract, UI, API, persisted
state และการเชื่อมกับ Worker ทุก gap ที่พบถูกแก้ทันทีใน implementation ที่อยู่
ใน working tree เดียวกัน

## รอบ 11 — spec-to-code matrix

- ตรวจหัวข้อใน `spec.md`, route ของ `verticalDramaEpisodes`, shared contracts,
  dialog และ Skill adapter เทียบกับ implementation จริง
- ไม่พบ requirement หลักที่มีเฉพาะในเอกสารโดยไม่มีจุดเชื่อมต่อจริง
- ผล: ผ่าน โดยคง production browser/provider/migration เป็น release gates ที่ต้อง
  พิสูจน์แยกต่างหาก

## รอบ 12 — UI selection interaction

- ตรวจ card ตัวละครว่า click/keyboard/checkbox ไม่ทำให้เลือกทั้งหมดโดยไม่ตั้งใจ
- พบ gap: card มี visual selected state แต่ interaction หลักยังพึ่ง checkbox/label
  ทำให้การแตะพื้นที่ card ไม่สม่ำเสมอ
- แก้: เพิ่ม `role=checkbox`, `aria-checked`, keyboard Enter/Space และ toggle เฉพาะ
  card target ใน `SpecialTieInEpisodeDialog.tsx`; click checkbox/label ไม่ bubble ซ้ำ
- ผล: เลือกได้ทีละตัวและยังรองรับ keyboard/accessibility

## รอบ 13 — story/character grounding

- ตรวจ input ที่ส่งเข้า Skill, selected character allowlist, excluded names,
  dialogue/no-dialogue และ output validation
- ไม่พบ gap ใหม่: server สร้าง input จากตัวละครที่เลือกเท่านั้น, ตรวจชื่อผู้พูด,
  look/scene slot และบังคับ story แบบ prose หลายย่อหน้า
- ผล: ไอเดียต้องเป็นเรื่องละคร ไม่ใช่รายการข้อดีสินค้า และ no-dialogue ต้องไม่มี
  บทพูด

## รอบ 14 — upload size parity

- เทียบ web upload cap กับ Worker materialization cap
- พบ mismatch: เว็บรับ 2 GiB แต่ Worker เดิม cap 1,500 MiB ทำให้ไฟล์ที่ upload ผ่าน
  ถูก Worker ปฏิเสธภายหลัง
- แก้ `worker_loop.rs` ให้ cap เป็น 2,000 MiB พร้อมคง streaming download ลง private
  workspace ไม่อ่านทั้งไฟล์เข้า memory
- ผล: cap สอดคล้องกันระหว่างเว็บและ Worker

## รอบ 15 — analysis/prepare approval integrity

- ตรวจ save-time ว่า guide จาก client ตรงกับ source, analysis output และ revision
  ของ prepare หรือไม่
- พบ gap: เดิม save ตรวจเพียง owner/status และ client guide อาจไม่ตรงกับ Worker
  output หรือ prepare คนละ analysis revision
- แก้ `verticalDramaSpecialTieInFootageService.ts` ให้ validate Worker guide,
  source fingerprint/revision, job input และ prepared source ก่อน create/update
- ผล: stale/cross-source footage ถูก reject ก่อน persist

## รอบ 16 — B-roll authorization and revision

- ตรวจ asset manifest, prepared artifact, tenant/user/Series binding, checksum,
  placement bounds และ render job revision
- พบ gap: แผน B-roll อาจถูกบันทึกโดยไม่มี render job แต่ยังต้องตรวจ source จริง
  และ artifact ต้องเป็น prepared video ที่ publish แล้ว
- แก้ `assertOwnedSpecialTieInBroll` และเรียกจาก special episode create/update;
  ตรวจ owner, binding, checksum, duration, source range และ prepared revision
- ผล: แผนที่อ้าง media/artifact ปลอมหรือข้าม Series ไม่ผ่าน

## รอบ 17 — Worker memory boundary

- ตรวจ artifact upload ของ Worker ว่าอ่านไฟล์ใหญ่เข้า RAM หรือ clone bytes ต่อ retry
  หรือไม่
- พบ gap: upload เดิมใช้ whole-file `read` และ retry อาจ clone buffer
- แก้ `worker_loop.rs` ให้คำนวณ checksum/size แบบ chunked และส่ง upload ด้วย
  `ReaderStream`; เปิด Tokio fs/io dependency ที่จำเป็น
- ผล: งานหนักยังอยู่ Worker และ retry ไม่เพิ่ม whole-file memory pressure

## รอบ 18 — save without render job

- ตรวจเส้นทาง save episode เมื่อผู้ใช้เตรียม B-roll แต่ยังไม่ render
- พบ gap: render job เป็น optional ตาม UX แต่ source validation ต้องไม่ optional
- แก้ให้ create/update ตรวจ B-roll manifest และ protected URL ทุก source แม้ไม่มี
  `renderJobId`; render job ถ้ามีจะถูกตรวจ ownership/revision เพิ่มเติม
- ผล: planning state ปลอดภัย และยังไม่บังคับ render ก่อนผู้ใช้ตรวจเนื้อหาเสร็จ

## รอบ 19 — credit settlement recovery

- ตรวจ reservation ตอน enqueue, terminal event, artifact publication, failure,
  cancel/expired และ duplicate event
- พบ gap: ถ้า `job.completed` ถูกบันทึกแล้ว publish หรือ settle เครดิตล้มเหลว
  งานถูก mark failed ได้ แต่ reservation อาจค้าง
- แก้ `workerRegistryService.ts` ให้ terminal post-processing failure เรียก
  failed reconciliation/refund แบบ idempotent recovery
- ผล: เส้นทาง failure ไม่ปล่อย reservation ค้างเงียบ ๆ; credit ledger ยังใช้
  reservation เดิมและแยก source ของ Worker ได้

## รอบ 20 — Worker event output shape

- ตรวจ payload จริงจาก Worker กับ shape ที่ UI และ save-time validator อ่าน
- พบ gap: Worker ส่ง `guide`, `preparedSource`, `qc` และ `publication` ใต้
  `outputJson.lastEventPayload` แต่ UI/validator บางจุดอ่าน top-level เท่านั้น
  ทำให้สถานะ complete แล้วแต่ไม่เห็นข้อมูลสำหรับสร้างต่อ
- แก้ `verticalDramaSpecialTieInFootageService.ts` ให้ normalize fields จาก
  `lastEventPayload` ก่อนส่ง browser และให้ server validator อ่านได้ทั้ง
  canonical top-level กับ event payload พร้อมตรวจ prepared artifact
- ผล: guide/prepared source ถูกใช้ต่อได้หลัง polling และ save ไม่รับ output ว่าง

## หลักฐานหลังจบรอบ

- Web focused tests: 3 test files, 19 tests ผ่าน
- Worker billing/registry tests: 2 test files, 50 tests ผ่าน
- Worker unit tests: 34 tests ผ่าน
- `cargo check --manifest-path apps/worker-app/src-tauri/Cargo.toml` ผ่าน
- `npm --workspace apps/web exec vite build` ผ่าน
- `git diff --check` สำหรับไฟล์ที่อยู่ในขอบเขตผ่าน
- TypeScript full check ถูกยุติโดย timeout 180 วินาทีโดยไม่มี diagnostic output;
  จึงไม่อ้างว่า full typecheck ผ่าน

## Release gates ที่ยังไม่อ้างแทนด้วย local proof

ยังต้องทำใน environment จริง: authenticated browser click-through, Worker claim/
runtime doctor, HyperFrames transcription บนเครื่องปลายทาง, signed URL/R2
playback, provider/LLM availability, production migration execution และ deploy
