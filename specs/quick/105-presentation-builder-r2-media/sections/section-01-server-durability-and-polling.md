# Section 01: Server Durability and Polling

## Ownership

Own the presentation server service, AI presentation task polling, pending-job persistence, and backfill command. Do not change client components in this section.

## Target files

- `apps/web/server/services/presentationMediaAssetService.ts` (new)
- `apps/web/server/services/aiPresentationService.ts`
- `apps/web/server/routers/presentation.ts`
- `apps/web/server/services/__tests__/presentationMediaAssetService.test.ts` (new)
- focused AI presentation tests and `apps/web/scripts/backfill-presentation-media.ts` (new)

## TDD and acceptance

- Completed image/video task returns a `/api/storage/files/...` URL only after R2 upload.
- Managed URLs are idempotent and never downloaded again.
- R2-disabled or expired provider output is represented as a failed/unavailable result without persistence of the temporary URL.
- Media scheduling has one active image/video slot per batch.
- Pending resolution uses the same durability wrapper.

## Security and operational notes

Keep tenant/user/deck scope in the storage key and audit context. Reuse SSRF validation, byte limits, timeout, and temp cleanup. Backfill is dry-run by default.
