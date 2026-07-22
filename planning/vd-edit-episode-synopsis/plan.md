# VD — แก้ไขเรื่องย่อ (logline) รายตอนย่อยได้เอง

## Problem
ผู้ใช้แก้ "เรื่องย่อ" ของแต่ละตอนย่อยไม่ได้ — มีแต่ปุ่มแก้บทพูดรายช็อต
ต้องการ: กด Edit ที่ตอนย่อยใดก็ได้ → แก้ → บันทึก → เรื่องย่อใหม่ถูกใช้ทันที
ในหน้าแยกช็อต (storyboard_shotgrid) และ plan panel ของหน้าตอน

## Key facts (from codebase survey)
- ไม่มีตาราง sub-episode; เรื่องย่อคือ `logline` ใน `vertical_drama_series.bible` (jsonb)
  — `apps/web/drizzle/schema.ts:20471`
- **สองที่พร้อมกัน** ใน bible เดียวกัน:
  1. legacy `bible.episodeBreakdown[]` — อ่านโดย Overview card
     (`VerticalDramaSeriesDetailPage.tsx:2050-2058`) และ stage `plan_episode_script`
     (`verticalDramaEpisodePipeline.ts:1928-1934`, `:2006-2013`)
  2. versioned `bible.breakdownVersions[active].items[]` — อ่านโดย
     `storyboard_shotgrid` (แยก 9 ช็อต, `verticalDramaEpisodePipeline.ts:2382-2386`,
     `:2489-2494`), video prompt (`verticalDramaEpisodes.ts:13960-13975`),
     `getEpisodeDetail.episodePlan` (`:4654-4700`)
  → **ต้องเขียนทั้งสองที่** มิฉะนั้นอัปเดตไม่ครบ (ต้นแบบ: `confirmImproveScript`
    `verticalDramaSeries.ts:6694-6729`)
- สำเนา snapshot: `vertical_drama_episodes.script._draftSummary.logline`
  (เขียน `verticalDramaEpisodes.ts:7096-7099`, อ่านแบบ prefer ที่ `:7047-7059`)
  → ต้อง sync ด้วย ไม่งั้นตอนที่ materialize แล้วจะยังใช้ของเก่า
- Pattern ที่ mirror: `updateEpisodeDraftDialogue`
  (server `verticalDramaSeries.ts:6438-6537`, client
  `VerticalDramaDeepStoryDraftsPanel.tsx:1624-1927`)

## Scope
### Server — `apps/web/server/routers/verticalDramaSeries.ts`
New mutation `updateEpisodeDraftSynopsis` บน `verticalDramaDeepStoryDraftsProcedure`
- input: `{ seriesId, episodeNumber, logline: z.string().trim().min(1).max(1200), idempotencyKey? }`
- `requireTenantId` → `loadOwnedSeries` → หา item ใน active breakdown version;
  ถ้าไม่พบ → NOT_FOUND
- patch `logline` ใน (a) `breakdownVersions[active].items[]` (b) legacy
  `bible.episodeBreakdown[]` (ถ้ามี entry ของตอนนั้น)
- one `db.update(verticalDramaSeries).set({ bible, updatedAt }).where(seriesOwnershipWhere(...))`
- best-effort sync `vertical_drama_episodes.script._draftSummary.logline` ของตอนนั้น
  (ถ้ามีแถวและมี `_draftSummary`) — ไม่ล้ม transaction ถ้าไม่มี
- audit event แบบเดียวกับ `recordManualDialogueEditAuditEvent`
- no credit charge (manual edit, ไม่เรียก LLM)

### Client
- `VerticalDramaSeriesDetailPage.tsx:2050-2058` — ใส่ปุ่ม "แก้เรื่องย่อ" +
  inline textarea + บันทึก/ยกเลิก ต่อ 1 ตอนย่อย gated ด้วย `readOnly`/`isArchived`
- invalidate `verticalDramaSeries.get` **และ** `verticalDramaEpisodes.getEpisodeDetail`
- copy keys ใน `verticalDramaCopy.ts` (th + en)

## Risk
- LOW-MED. เขียน jsonb bible → ต้องไม่ทำ field อื่นหาย (patch แบบ immutable map,
  ไม่ rebuild object)
- append-only rule ของ breakdownVersions: mutation นี้เป็น in-place edit เหมือน
  `updateEpisodeDraftDialogue` ซึ่งมี exception documented ที่
  `verticalDramaStoryBible.ts:7486-7510`

## Verify
- unit test router: dual write ครบ, ownership, NOT_FOUND, ไม่ทำ shotDrafts หาย
- component test: ปุ่ม → textarea → save เรียก mutation ด้วย payload ถูก; readOnly ซ่อนปุ่ม
- `pnpm vitest run` เฉพาะไฟล์ที่แตะ + `tsc` เทียบ baseline

---

# Phase 2 — แก้ไข "เรื่องย่อของแต่ละช็อต" (shotDrafts[].summary)

## Facts
- ฟิลด์คือ `summary` ใน `shotDraftSchema` (`verticalDramaStoryBible.ts:363-390`,
  `summary: z.string().min(1)`) ภายใน
  `bible.breakdownVersions[active].items[].shotDrafts[]`
- ต้นแบบ 1:1 = `applyManualDialogueEdit` (`verticalDramaStoryBible.ts:7714-7788`)
  + stamp `manualDialogueEditStampSchema` (`:7586`) + reader
  `readItemManualDialogueEdit` (`:7617`)
- เขียนเฉพาะ active version (เหมือน `updateEpisodeDraftDialogue` เป๊ะ) —
  shot drafts ถูกอ่านจาก active version ทั้ง `plan_episode_script` และ
  `storyboard_shotgrid` ผ่าน `resolveEpisodeDraftHydration`
  (`verticalDramaEpisodePipeline.ts:1380-1394`) จึงไม่ต้อง dual write เหมือน logline
- `computeDraftCompleteness` คำนวณจาก dialogue เท่านั้น → แก้ summary ไม่กระทบ

## Contract (pinned)
- service: `applyManualShotSummaryEdit` + `readItemManualSummaryEdit` +
  `ManualShotSummaryEditNoDraftError` ใน `verticalDramaStoryBible.ts`
- stamp field บน item: `manualSummaryEdit` (โครงเดียวกับ `manualDialogueEdit`)
- tRPC: `verticalDramaSeries.updateEpisodeDraftShotSummary`
  input `{ seriesId, episodeNumber, shotNumber, summary: string trim 1..600, idempotencyKey? }`
  return `{ ok: true, episodeNumber, shotNumber, summary }`
- UI: ปุ่ม "แก้เรื่องย่อช็อต" ในหัวช็อตของ `VerticalDramaDeepStoryDraftsPanel`

## Phase 2 — REVISED (user request): แก้ summary + บทพูด พร้อมกันในฟอร์มเดียว
เหตุผล: เคสจริงมักผิดทั้งเรื่องย่อช็อตและบทพูดพร้อมกัน แยกสองฟอร์มใช้งานลำบาก

Contract (pinned v2) — แทนที่ v1 ด้านบน:
- tRPC `verticalDramaSeries.updateEpisodeDraftShot`
  input `{ seriesId, episodeNumber, shotNumber, summary?, lines?, idempotencyKey? }`
  (superRefine: ต้องมีอย่างน้อย 1 ใน summary/lines)
  return `{ ok, episodeNumber, shotNumber, summary?, speakabilityWarnings, silenceIntentRemoved }`
- server: apply `applyManualShotSummaryEdit` แล้วส่ง item ต่อเข้า
  `applyManualDialogueEdit` (ของเดิม ไม่ fork) → db.update ครั้งเดียว
- stamp แยกกัน 2 ตัว: `manualSummaryEdit` + `manualDialogueEdit`
- `updateEpisodeDraftDialogue` เดิมคงไว้ (มี caller อื่น) แต่ panel ไม่เรียกแล้ว
- UI: ขยาย `ManualDialogueEditShotForm` เป็นฟอร์มเดียว = textarea เรื่องย่อช็อต
  + แถวบทพูด + Save/Cancel ชุดเดียว, ใช้ state `editingShotNumber` เดิม
- ส่งเฉพาะ field ที่เปลี่ยนจริง; Save disabled ถ้าไม่มีอะไรเปลี่ยน
