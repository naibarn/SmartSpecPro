# Vertical Drama — Deep Story Draft: Resilient, Resumable, Long-Running Generation

Date: 2026-07-14
Owner request (TH): เวลาสั่ง "อัปเดตเนื้อเรื่องละเอียดทุกตอนย่อย (9 ช็อต + บทพูด)"
ระบบมักขึ้น "ใช้เวลานานเกินไป". ต้องการ: async ไม่ timeout ง่าย, วิ่งได้ยาวเป็นชั่วโมง,
ถ้าหยุดกลางทางต้องทำต่อจากจุดเดิมได้ และสุดท้ายต้องจบครบทุกตอน.

## Problem statement

The `deep_generate` (and sibling `extend`) story job already runs async
(task #28: submit → jobId → poll, BullMQ dispatch + Redis job record). But it
cannot reliably finish a large/long run:

1. **No incremental persistence.** `generateStoryBibleDeep` drafts chunk-by-chunk
   (5 episodes/call) but accumulates all results in memory and the DB write
   happens **once at the end** (`verticalDramaSeries.ts` `runGenerateStoryBibleDeepJob`,
   the `appendBreakdownVersion` + `db.update(...)` at ~line 1379). Credits are
   **deducted per chunk** (`verticalDramaStoryBible.ts` ~line 3481). So a mid-run
   process kill (deploy `systemctl restart` — this project's normal deploy step,
   crash, or OOM) loses every completed chunk while the credits are already
   spent. BullMQ redelivers the job, but the executor re-reads a bible with no
   deep drafts and **restarts from episode 1**, re-charging. A series that can't
   finish inside one process lifetime never completes.

2. **Client stops polling at 30 min.** `STORY_JOB_POLL_MAX_ATTEMPTS = 720`
   × 2.5s (`VerticalDramaDeepStoryDraftsPanel.tsx`). After that it shows the
   error toast `storyJobTimeoutError` ("ใช้เวลานานเกินไป ลองตรวจสอบภายหลัง")
   even though the server job is still running — reads as a failure.

3. **Redis TTL = 2h.** Job record and per-series active-pointer both TTL at 2h
   (`verticalDramaStoryJobs.ts` `JOB_RECORD_TTL_SECONDS` / `ACTIVE_POINTER_TTL_SECONDS`).
   A run legitimately exceeding 2h (or spanning several restarts) loses its
   pointer/record → polling and resume break.

## Design decision (approved scope: A+B+C+D, skip-drafted resume in keep mode)

Checkpoint medium = **Redis job record**, not the bible. Rationale: the bible's
`breakdownVersions[]` is append-only (spec §7.7.3 hard rule 4) — persisting each
chunk via `appendBreakdownVersion` would spam one version per chunk, and mutating
the active version in place violates the invariant. The Redis job record already
survives BullMQ **same-job redelivery** on a worker restart (the #1 scenario),
and heartbeat TTL (item B) keeps it alive for hours. The single final
`appendBreakdownVersion` write stays unchanged.

### A. Incremental checkpoint + resume-skip  (core)

- **`verticalDramaStoryJobs.ts`**: add optional `checkpoint` to
  `VerticalDramaStoryJobRecord` and a serialized `updateStoryJobCheckpoint(jobId, patch)`
  writer (through the existing `enqueueWrite` per-job serialization). Thread a
  `persistCheckpoint(partial)` fn from `runVerticalDramaStoryJob` into the
  executor signature (alongside `onProgress`), and pass the **existing** record's
  checkpoint into the executor on (re)start so a redelivered job resumes.
  - `checkpoint` shape: `{ draftedItems: DeepDraftedEpisodeItem[]; completedEpisodeNumbers: number[]; chunkSizesDone: number[]; updatedAt: string }`.
- **`verticalDramaStoryBible.ts` `generateStoryBibleDeep`**: accept
  `resumeDraftedItems?: DeepDraftedEpisodeItem[]` + `alreadyDraftedEpisodeNumbers?: number[]`
  and a new `onChunkComplete?(chunkDraftedItems)` callback. Skip any episode
  whose number is in `alreadyDraftedEpisodeNumbers` (**do not build a prompt, do
  not call the LLM, do not deduct credits** for it). Seed the in-memory
  `draftedItems` with `resumeDraftedItems`. After each chunk's drafts are
  finalized (post-reconcile), fire `onChunkComplete(chunkDrafted)`. Final result
  still returns the full `draftedItems` (resumed + new).
- **`verticalDramaSeries.ts` executor (`runGenerateStoryBibleDeepJob` + `runExtendStoryDraftHorizonJob`)**:
  - Compute `alreadyDrafted` = episodes whose active-breakdown item already has a
    valid 9-shot `shotDrafts`, **only in keep mode** (`mode` "standard"/keep).
    In "rewrite" mode, do not skip (user asked for a full redraft).
  - Union with `checkpoint.completedEpisodeNumbers` from the resumed record.
  - Pass `resumeDraftedItems` = `checkpoint.draftedItems`.
  - Wire `onChunkComplete` → `persistCheckpoint({ append chunk to draftedItems,
    add episode numbers, add chunk size, creditsUsed so far })`.
  - Final bible write is unchanged (merges the full set, one `appendBreakdownVersion`).

### B. Heartbeat TTL (long runs)

- **`verticalDramaStoryJobs.ts`**: on every progress/checkpoint/status write,
  refresh the **active-pointer** TTL (currently only set at enqueue) via
  `redis.expire(pointerKey, ACTIVE_POINTER_TTL_SECONDS)` (or re-`set`), so an
  actively-progressing job never expires mid-run. Raise the base
  `JOB_RECORD_TTL_SECONDS`/`ACTIVE_POINTER_TTL_SECONDS` floor from 2h → 6h.
  Heartbeat + floor together = a job that keeps making progress stays alive for
  as long as it runs.

### C. BullMQ auto-retry

- **`verticalDramaStoryJobs.ts` `defaultEnqueueBullmqJob`**: add
  `attempts: 3, backoff: { type: "exponential", delay: 10_000 }`. Change
  `removeOnFail` so a failed job that still has attempts left is retried (keep a
  bounded retention). Because the executor now resumes from checkpoint, a retry
  is cheap and does not re-charge completed episodes.

### D. Frontend UX — "still running", not "failed"

- **`VerticalDramaDeepStoryDraftsPanel.tsx`**: for `deep_generate`/`extend`,
  raise the poll budget (match `improve_script`'s 4320 × 2.5s = 3h) and/or on
  `onTimeout` show a **non-error** info state ("งานยังทำงานอยู่เบื้องหลัง
  ระบบจะแจ้งเตือนเมื่อเสร็จ — เปิดหน้านี้ค้างไว้หรือกลับมาดูภายหลังได้") instead of
  the red `storyJobTimeoutError` toast. The refresh-safe resume effect
  (`getActiveStoryJob` → `pollStoryJob`) already re-attaches on reload, and the
  terminal notification already fires, so closing the page is safe.
- Add copy keys in `verticalDramaCopy.ts` (TH/EN).

## Affected files

- `apps/web/server/services/verticalDramaStoryJobs.ts` — checkpoint field + writer, executor signature, heartbeat TTL, BullMQ attempts/backoff.
- `apps/web/server/services/verticalDramaStoryBible.ts` — `generateStoryBibleDeep` resume/skip + `onChunkComplete`.
- `apps/web/server/routers/verticalDramaSeries.ts` — both executors: compute already-drafted, resume, wire checkpoint.
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaDeepStoryDraftsPanel.tsx` — poll budget + non-error timeout state.
- `apps/web/client/src/components/verticalDramaSeries/verticalDramaCopy.ts` — new copy keys.
- Tests: `verticalDramaStoryJobs.test.ts`, `verticalDramaSeries.deepStoryDrafts.test.ts`, panel tests.

## Risk assessment

- **Credit double-charge (HIGH → mitigated):** skip-drafted + checkpoint means a
  resumed run never re-drafts/re-charges completed episodes. Must verify the skip
  path deducts nothing for skipped episodes.
- **Append-only bible invariant (respected):** no change to `appendBreakdownVersion`
  cadence — still one final version write per run.
- **Redis payload size:** checkpoint carries a partial season's shot drafts, same
  magnitude as the existing job `result`; bounded by TTL. Acceptable (consistent
  with current design).
- **Backward compat:** all new params optional; a job record without `checkpoint`
  behaves exactly as today (fresh run). No schema/DB migration.
- **rewrite mode:** must NOT skip — verify keep-vs-rewrite gate.

## Verification steps

1. `pnpm check` (types) for `apps/web`.
2. Unit: checkpoint writer serialization; resume seeds draftedItems + skips episodes (no LLM/credit); heartbeat refreshes pointer TTL; BullMQ opts.
3. Integration: `runGenerateStoryBibleDeepJob` with a checkpoint present drafts only remaining episodes; final bible has all episodes.
4. Simulate mid-run kill in a test (executor throws after chunk 1) → checkpoint holds chunk 1 → re-run same jobId → only chunk 2+ drafted.
5. Frontend: timeout path shows info (not error); resume effect re-attaches.
6. Manual: run on series #16 (screenshot), restart web mid-run, confirm it resumes and finishes all episodes without re-charging.

## Non-goals

- No DB schema/migration.
- No change to video/image/render/audio pipelines.
- No change to `improve_script` job (already has a 3h client budget).
- No change to `appendBreakdownVersion` append-only semantics.
