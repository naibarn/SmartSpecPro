# Section 01 — Routing and Polling

## Ownership

- `apps/web/server/routers/media.ts`
- `apps/web/server/routers/__tests__/media.db-first.contract.test.ts`
- `apps/web/client/src/pages/MediaHistory.tsx`
- focused scheduler helper/test under `apps/web/client/src/lib/`

## TDD

Add failing router dispatch and scheduler timing tests first. Preserve the tRPC
response envelope and all direct-task behavior.

## Acceptance

- MCP fetch never calls Python.
- Direct fetch still calls Python.
- Rerenders and concurrent ticks cannot bypass cooldown.
- 429 backoff is honored.

## Implemented

- Added `client/src/lib/mediaHistoryPolling.ts` with cooldown, single-flight,
  and rate-limit state.
- Wired Media History through stable refs and a boolean effect dependency so
  rerenders cannot restart the immediate tick.
- Added MCP-first dispatch to `media.fetchTaskResult`.
- Verification: 3 scheduler tests, 5 Media History module tests, and 5 focused
  router contract tests pass.

## UI/UX Contract

- Target job: Media History refreshes pending results without disrupting other
  media generation.
- Surface inventory: no visual changes; background polling only.
- State matrix: pending polls; processing polls; completed/failed/cancelled stop;
  hidden tab pauses; 404 backs off; 429 honors retry delay.
- Responsive/accessibility/copy: unchanged because no rendered UI changes.
- Browser evidence: inspect network/log cadence over two intervals; no screenshot
  comparison required.
