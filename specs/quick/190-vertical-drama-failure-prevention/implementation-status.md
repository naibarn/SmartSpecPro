# Implementation status

Updated 2026-09-12 (Asia/Bangkok).

## Completed

- Added versioned, bounded safety evidence with field paths, shot numbers, matched rule, excerpt, and confidence.
- Preserved fail-closed behavior for genuine high-risk story content while fixing the Thai `ประกาศพัก` false positive.
- Included bounded policy findings in the stage error contract without returning the preserved candidate payload to the client.
- Rendered policy evidence in both the normal failed-stage panel and the no-shot generation card.
- Persisted a running heartbeat timestamp and exposed it through the active-job API.
- Blocked new story-job submissions during graceful shutdown and made `/readyz` return `503` while draining.
- Added startup/periodic BullMQ failed-delivery reconciliation and made reconciliation idempotent against terminal records.
- Added focused backend and jsdom UI regression coverage.

## Verification

- Backend focused suite: 5 files, 118 passed, 7 skipped.
- UI focused jsdom suite: 2 files, 71 passed.
- `git diff --check`: passed.
- Full `pnpm run check`: remains red because of pre-existing diagnostics in unrelated dirty-worktree areas; changed-path results were not used as production proof.

## Operational gates

- Deploy and restart the updated web process before relying on `/readyz` drain behavior or queue reconciliation in production.
- Verify one real failed-story recovery through the authorized UI after deployment; no provider call, credit spend, queue deletion, or authored-content mutation was performed locally.
- Confirm production logs/metrics show heartbeat updates, policy evidence, and no duplicate terminal notification after restart.
