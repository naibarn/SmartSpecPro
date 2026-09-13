# Research Notes

## Discovery result

SocratiCode MCP ไม่ได้เปิดให้เรียกใช้ใน session นี้ จึงใช้ targeted `rg` และอ่านเฉพาะช่วงไฟล์ที่เกี่ยวข้องตาม AGENTS.md แทน ไม่ได้ทำ broad rewrite หรือเปลี่ยนข้อมูล

## Current safety path

- `apps/web/server/services/verticalDramaStorySafety.ts`
  - เป็น deterministic story-level analyzer
  - มีการสร้าง bounded safety input และรวม findings เป็น `low/high`
  - มี marker สำหรับ graphic violence และ cross-field checks เรื่อง minor/coercion/distress
  - patch ปัจจุบันเปลี่ยน corpse detection จาก raw substring เป็น boundary-aware `CORPSE_MARKER_PATTERN` และเพิ่ม regression สำหรับ `ประกาศพัก` กับ `พบศพ`
- `apps/web/server/services/__tests__/verticalDramaStorySafety.test.ts`
  - มี focused regression ของ false positive และ genuine corpse phrase
- callsites ที่ต้อง audit ให้ใช้ source-of-truth เดียวกัน ได้แก่
  - `verticalDramaStoryboardGeneration.ts`
  - `verticalDramaStartFrameGeneration.ts`
  - `verticalDramaScriptGeneration.ts`
  - `verticalDramaStoryBible.ts`
  - `verticalDramaEpisodePipeline.ts`
  - `verticalDramaEpisodes.ts`
  - `verticalDramaVideoMotionPromptGeneration.ts`
  - `imagePromptSafetyService.ts`
  - `verticalDramaEpisodeRepair.ts`
  - `verticalDramaSpecialSkillAdapter.ts`
  - `verticalDramaShotImageAction.ts`

## Incident evidence

- episode 296 / series 58 มี failed run ที่ `storyboard_shotgrid`
- artifact เดิมเก็บ `safety_recovery.findings` ว่า shot 7 เป็น `graphic_violence`
- authored text ของ shot เป็นบริบทประกาศพักการตัดสิน ไม่ใช่ศพหรือความรุนแรง
- replay analyzer กับ candidate เดิมหลัง patch ให้ `findings: []`
- ดังนั้น guardrail ที่ถูกต้องคือแก้ detector และ evidence contract ไม่ใช่ปิด safety gate

## Current job/recovery path

- `apps/web/server/services/verticalDramaStoryJobs.ts`
  - Redis record เป็น source of truth ของ status/progress/result/error
  - active pointer แยกตาม tenant/series เพื่อ dedupe ข้าม kind
  - checkpoint เก็บ drafted items, completed episodes, credits used และ plan candidate
  - per-job write serialization ป้องกัน progress/checkpoint เขียนทับ terminal state
  - recovery budget/backoff, dispatch id และ BullMQ failed-delivery reconciliation มีอยู่แล้ว
  - recovery เป็น same-jobId checkpoint resume และมี owner-scoped router path
- `apps/web/server/routers/verticalDramaSeries.ts`
  - มี `getStoryJobStatus`, `getActiveStoryJob`, `getStoryJobRecovery`, `repairStoryJob`
  - recovery ตรวจ ownership และ precondition ก่อน enqueue
- `apps/web/server/jobs/workerStallWatchdogJob.ts` และ `workerStallWatchdogService.ts`
  - มี watchdog ทุก 5 นาทีสำหรับ worker jobs บางประเภทและ requeue/terminal escalation
  - ต้องตรวจให้ story BullMQ queue/domain Redis record อยู่ใน reconciliation coverage เดียวกัน ไม่ใช่พึ่ง TTL อย่างเดียว

## Current UI/ops path

- `VerticalDramaDeepStoryDraftsPanel.tsx` แสดง recovery banner, completed/remaining episodes, confirmation dialog และ CTA resume
- `verticalDramaCopy.ts` มี Thai/English recovery copy แล้ว
- `apps/web/server/_core/index.ts` มี `/healthz`, `/readyz`, startup checks และ graceful shutdown ที่ปิด story queue
- ช่องว่างที่ต้องเติมคือ policy finding ระดับ shot, state matrix ที่แยก policy block กับ infrastructure stall, shutdown drain signal, startup sweep และ metrics/alerts ที่บอก Redis-domain/BullMQ mismatch

## Existing related plans

- `specs/quick/179-storyboard-policy-recovery/` วาง candidate-aware safety projection, bounded repair และ preservation ของ exhausted candidate
- `specs/quick/001-vertical-drama-checkpoint-recovery/` วาง same-jobId checkpoint recovery, fencing, owner scope และ UI recovery CTA
- `docs/portable-skill-pack/specs/2026-09-12-vertical-drama-checkpoint-recovery-design.md` เป็น design note สำหรับ recovery จาก stalled job หลัง worker restart

## Verification baseline

- focused command ที่ผ่านแล้ว:

  ```bash
  JWT_SECRET=codex-local-test-secret-01234567890123456789 DATABASE_URL=postgresql://smartspec:smartspec123@localhost:5432/smartspec pnpm exec vitest run server/services/__tests__/verticalDramaStorySafety.test.ts server/services/__tests__/verticalDramaStoryboardGeneration.test.ts
  ```

- ผล: 2 files, 51 tests passed
- `pnpm check` ยังมี baseline errors จำนวนมากใน dirty worktree หลายส่วน; plan นี้ต้องรายงาน changed-path proof แยกจาก full-worktree proof
