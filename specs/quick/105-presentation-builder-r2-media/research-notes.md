# Research Notes

- `apps/web/server/services/aiPresentationService.ts` currently uses `mediaGenerationService` directly for image/video submit and polling, returns provider URLs from `pollMediaTask`, and runs slide work through `mapWithConcurrency` with `MAX_IMAGE_CONCURRENCY = 5`.
- `resolvePendingMediaForDeck` also writes `task.resultUrl` directly into slide elements and does not pass completion through an R2 durability boundary.
- `apps/web/server/services/verticalDramaMediaAssetService.ts` already implements provider download, R2 upload, managed URL normalization, and R2-only admission. `marketplaceAutoReviewMediaAssetService.ts` provides a similar scoped wrapper.
- `apps/web/server/services/presentationArticleGenerator.ts` is server-only and uses filesystem APIs for skill/schema/debug paths. The client uses tRPC and should not import this service. The screenshot error is an unwrapped server error surfaced by the builder; the exact runtime stack is not available locally, so the fix must also normalize server-only path handling and error reporting at the presentation boundary.
- `apps/web/client/src/components/presentation/PresentationArticleGeneratorDialog.tsx` has the builder workflow and currently blocks slide JSON generation when image slots are missing. It needs truthful text-only state copy for failed/expired image assets without hiding the per-slot recovery action.
- Existing dirty worktree includes unrelated migration, model, Auto Review, and orchestra changes; implementation must remain path-scoped.
