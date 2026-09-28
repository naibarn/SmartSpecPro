# Feature 168 — Deep adversarial review (10 rounds)

วันที่ตรวจ: 2026-08-30

ตรวจ `spec.md`, section plans, TDD plan และเทียบกับ runtime/control-plane seams ใน repository หลังการแก้ไขทุกจุด ผล “ผ่าน” หมายถึงไม่พบ high-confidence gap ในระดับ specification; migration execution, browser run, Worker doctor และ live provider run ยังเป็น release evidence ที่ต้องทำตอน implementation

## Round 1 — user journey and scope

- ตรวจเส้นทาง Upload → analyze → prepare → story → review → 9 shots → B-roll → render
- ปิด gap เรื่อง prepared footage ต้องเสร็จก่อนสร้างเรื่อง และมี no-dialogue semantics ชัดเจน
- ผล: ผ่าน

## Round 2 — UI state and refresh

- ตรวจ preview/fullscreen, partial guide, error/retry, F5 และ history
- ปิด gap โดยกำหนดว่า ideas ที่ยังไม่ save ไม่ hydrate เป็น current draft; history ต้องเปิดโดย user เท่านั้น
- ผล: ผ่าน

## Round 3 — model selection

- ตรวจ LLM, image model และ video model รวมถึง recommended default
- ปิด gap ด้วย searchable/scrollable selectors ครบสามช่อง, catalog re-resolve, deterministic tie-break และ fail-closed เมื่อไม่มี compatible model
- ผล: ผ่าน

## Round 4 — selected-character and DNA grounding

- ตรวจกรณีเลือก พิมพ์ชนก/ภูมิ/ลุงชาญ แต่โมเดลดึง ธีร์/ภาคิน
- ปิด gap ด้วย canonical ID allowlist, Server-resolved display names, reject unknown IDs/names และห้ามแก้ DNA/Scene Visual State จาก inference
- ผล: ผ่าน

## Round 5 — shared contract and timeline

- ตรวจ guide, story review, nine-shot mapping และ placement fields
- ปิด gap ด้วย `special_tie_in_footage_v2`, `vd-footage-guide-v1`, `storyBeatId`, `baseWindow`, integer-millisecond wire timebase และ stale revision rejection
- ผล: ผ่าน

## Round 6 — Web/Worker ownership and event delivery

- ตรวจว่า Server ไม่ decode/transcode/render และ browser ไม่ถือ wait loop
- ปิด gap ด้วย Server DB/job ledger เป็น source of truth, existing authenticated event endpoint, lease/device proof, event ID/sequence/replay และ local outbox/retry
- ผล: ผ่าน

## Round 7 — HyperFrames runtime

- ตรวจจาก runtime pack และ CLI ที่มีจริง
- ปิด gap โดยระบุ runtime manifest, platform-specific bundled Node, exact `hyperframes/.../dist/cli.js`, checksum/doctor และห้าม production `npx`, PATH หรือ network install
- ผล: ผ่าน

## Round 8 — media correctness and render route

- ตรวจ dead-air, speech boundary, concat, source map, B-roll audio และ executor
- ปิด gap ด้วยห้ามตัดช่วงทับ speech โดยไม่มี approval, bidirectional time map, preview artifact แยกจาก final และกำหนด `footage_broll_render` ให้ใช้ `remotion_render_video`/`GenericTemplate` เท่านั้น
- ผล: ผ่าน

## Round 9 — billing, storage and security

- ตรวจ credit ledger, duplicate submit, retry, upload interruption, ownership และ deletion
- ปิด gap ด้วย operation names แยก, reservation expiry/refund, idempotency, resumable upload/finalize checksum, tenant scope และ derived-artifact cleanup
- ผล: ผ่าน

## Round 10 — test, rollout and contradiction scan

- ตรวจ acceptance, TDD, migration/rollback, browser evidence, runtime doctor และคำที่เปิดทาง fallback/ทางเลือกกำกวม
- ปิด gap ด้วย contract/event/upload/model/retention tests และตัด ambiguity ของ render executor แล้ว
- ผล: ผ่าน; ไม่พบ high-confidence gap ที่เหลือใน Web Spec

## Final disposition

- Web spec และ Worker spec ใช้ contract/timebase/job/event semantics เดียวกัน
- ส่วนที่ยังไม่ใช่ proof ของการใช้งานจริงถูกทำเป็น release gate อย่างชัดเจน ไม่ถูกนับว่าเสร็จจากเอกสาร
- ไม่มีการแก้ source code, migration หรือ production data ในรอบตรวจนี้
