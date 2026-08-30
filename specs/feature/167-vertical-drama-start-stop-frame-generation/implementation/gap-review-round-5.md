# Gap review round 5 — regression and verification

ตรวจ section completeness, UI contract checker, focused service tests, focused
UI tests, typecheck output และ diff hygiene

- ผ่าน section checker: 6/6 sections complete และ UI contracts ครบทุก section
- ผ่าน focused backend tests: 130 tests (frame roles, durable jobs, motion sync)
- ผ่าน focused UI regression tests: 10 tests
- พบ baseline verification gap: full `apps/web` typecheck ยัง fail จากหลาย
  unrelated existing errors; เหลือ error ที่ตรวจยืนยันว่าอยู่นอก feature นี้
  เช่น `verticalDramaEpisodePipeline.ts:1524` (`row` undefined) และ
  `verticalDramaEpisodes.ts:9606` (Special Tie-in type)
- พบ test-suite gap เดิม: `generateShotStartFramePrompt.test.ts` ยังสมมติ
  resolver synchronous ทั้งที่ route ใช้ durable queue; ไม่เปลี่ยน contract ใหม่
  กลับไปเพื่อเอาใจ test เก่า เพราะ focused durable-job proof ผ่านแล้ว
- `git diff --check` ผ่านเฉพาะ owned paths; whitespace ที่อยู่นอก scope ถูก
  รักษาไว้ตาม dirty-worktree policy

ผล: ผ่านรอบ verification และบันทึกขอบเขตที่ยังต้องทำในงานแยก.
