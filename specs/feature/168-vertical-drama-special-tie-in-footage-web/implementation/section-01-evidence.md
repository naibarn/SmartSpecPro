# Deep-implement evidence — Section 01

สถานะ: completed (local contract/service proof)

สิ่งที่ส่งมอบ:

- shared contract สำหรับ footage source, probe guide, transcript, prepare, placement และ B-roll render พร้อม strict validation
- protected procedures สำหรับ upload/analyze/prepare/status/idea history/story gate และ B-roll render admission
- Skill จริง `apps/web/skills/vertical-drama-marketplace-review-story-planner/` พร้อม input/output/ui schema และตัวอย่างภาษาไทยแบบเรื่องละครต่อเนื่อง
- Skill adapter บังคับ selected-character allowlist, dialogue/no-dialogue policy, footage guide และ conservative product claims
- model default จาก admin recommended catalog และ selector validation ฝั่ง server
- credit reservation/idempotency สำหรับ Skill และ Worker jobs; insert race คืน reservation
- tenant/user/Series binding checks และ artifact URL resolution ที่ไม่เปิดข้าม Series binding

หลักฐาน:

- `contracts.test.ts` และ `verticalDramaMarketplaceReviewSkillAdapter.test.ts`: 17 tests ผ่าน
- targeted TypeScript scan ไม่พบ error ในไฟล์ของ feature; full typecheck ยังมี baseline errors นอก scope ของ feature
- ไม่มี authenticated production/browser run ใน environment นี้ จึงยังไม่อ้างว่า migration/Worker pairing บน production สำเร็จแล้ว
- local `DATABASE_URL` read-only check ยืนยัน columns ของ `vertical_drama_episodes`, `vertical_drama_special_sequence_counters` และ tables `vertical_drama_marketplace_review_idea_runs`, `worker_jobs`, `worker_artifacts` มีอยู่จริง; production database ยังไม่ถูกอ้างว่า verified
