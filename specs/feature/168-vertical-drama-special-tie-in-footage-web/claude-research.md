# Research findings — Feature 168

## Codebase

- `SpecialTieInEpisodeDialog.tsx` เป็น surface หลัก
- `marketplaceReviewIdeas/contracts.ts`, `specialTieInContracts.ts` และ `workerRuntime.ts` เป็น shared contract seams
- `verticalDramaMarketplaceReviewSkillAdapter.ts`, `verticalDramaBrollService.ts` และ `verticalDramaEpisodeStageJobs.ts` เป็น service boundaries ที่ควร reuse
- Worker control plane มี authenticated `POST /api/worker-jobs/:jobId/events`, lease token, assignment attempt และ device proof
- `creditService.ts` มี DB-backed idempotency/reservation patterns
- `packages/remotion-render` รองรับ GenericTemplate video layers พร้อม trim/mute/volume
- Server มี HyperFrames transcription compatibility path แต่ Special Tie-in ใหม่ต้องไม่ fallback ไปประมวลผลหนักบน Server

## Testing

Web ใช้ Vitest/React tests (`npm --workspace apps/web test -- ...`) และ Playwright browser tests; shared Zod contracts และ router/service tests เป็นหลักฐานระดับ unit/integration ส่วน authenticated browser + live Worker run เป็น release evidence

## Constraints

SocratiCode transport unavailable; discovery ใช้ targeted repository search/source reads. Exact bundled HyperFrames/runtime manifest is the local authority. Existing dirty worktree is preserved; implementation must stage only owned files/hunks.
