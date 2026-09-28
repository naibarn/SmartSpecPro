# Request

## Original request

ปรับ Presentation Builder ให้เก็บรูปภาพและวิดีโอที่สร้างเสร็จไว้บน R2 เช่นเดียวกับ Vertical Drama และ Auto Review พร้อมแก้ error `__dirname is not defined` และไม่สร้าง media ทุก slot พร้อมกันทั้งหมด

## Repository assumptions

- Presentation generation is server-owned in `aiPresentationService.ts` and `presentationArticleGenerator.ts`.
- Slide media can be returned immediately or tracked through `pendingMediaJobs`.
- Existing R2 ingestion helpers can be reused or generalized without adding a dependency.
- Unavailable/expired legacy provider URLs must render as text-only slot states.

## Non-goals

- No schema migration unless existing JSON contracts cannot represent the needed state.
- No changes to audio generation or unrelated import/export behavior.
- No broad cleanup of the dirty worktree.
