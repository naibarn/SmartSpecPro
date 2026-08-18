# Research Notes

## Current flow

- `apps/web/server/_core/index.ts` auto-reports tRPC `INTERNAL_SERVER_ERROR` and `TIMEOUT` errors.
- `apps/web/server/services/systemAutoReportService.ts` fingerprints, deduplicates, stores system feedback tickets, and invokes `processTicket`.
- `apps/web/server/services/virtualAdmin/feedbackProcessor.ts` currently notifies tenant admins for every system ticket and maps keyword priority to high/normal/low.
- `apps/web/server/services/notificationService.ts` supports user notifications, action URLs, and deduplicating group keys.
- `/credits` is an existing user-facing credit purchase surface.
- `apps/web/server/services/creditService.ts` has atomic user deduction and source types such as `media_image`, `media_video`, `media_audio`, `chat`, and `skill`.
- `apps/web/shared/mediaModelTransport.ts` and `mcpConnectTypes.ts` expose provider-account transport concepts.

## Existing worktree considerations

- Target files already contain unrelated user changes. Patches must be additive and narrow.
- No SocratiCode MCP tool was available, so discovery used targeted `rg`, `sed`, and git diff inspection.

## Risks

- tRPC wrappers often preserve only a message, so the classifier needs structured context when available plus safe message/path fallback.
- Provider critical priority can be downgraded by existing keyword classification unless explicitly preserved.
- Media job failures have a separate helper that currently sends admin notifications before calling auto-report; credit failures must bypass that generic fan-out.
