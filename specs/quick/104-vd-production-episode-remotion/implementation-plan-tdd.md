# TDD Plan

## Red tests first

1. Shared range helper rejects a per-EP count below 3, partitions contiguous ranges, numbers EPs, and represents a short remainder.
2. Remotion template builder produces compiled and shot segment templates with the expected title, EP indicator, and watermark layers.
3. Source resolver chooses compiled first in auto mode, falls back per Sub-Episode, and fails explicit modes with missing-number details.
4. Router/service orchestration persists pending groups and enqueues a Remotion job with a stable target; duplicate active submissions are idempotent.
5. Completion reconciliation updates only the target group to completed/failed and retains other groups.
6. Panel helper tests cover form disable/validation, range summary, remainder confirmation, and durable card actions.

## Test strategy

- Pure helpers: Vitest, no DB or worker.
- Remotion builder: Vitest against parsed `RemotionTemplateConfigSchema` and layer assertions; no Chromium render.
- Server orchestration: injected queue/db fakes matching existing service DI patterns.
- UI: existing React/Vitest conventions; assert accessible labels and action links.
- Verification: focused test command from `apps/web`, target-file TypeScript diagnostics, `git diff --check`, then browser evidence if dev server/Playwright is available.
