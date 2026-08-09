# Research Notes

## Current failure path

- `VerticalDramaEpisodePage.tsx` awaits
  `generateShotStartFramePrompt.mutateAsync` and returns from the handler on an
  HTTP error. `generateStartFrameImage` is called only afterward.
- The server mutation awaits LLM generation and the episode JSONB transaction
  inline, so Cloudflare can emit 524 while Node continues processing.
- Production evidence showed the prompt persisted after the browser received
  524, proving the timeout breaks orchestration rather than generation itself.

## Existing patterns

- `server/services/verticalDramaStoryJobs.ts` provides Redis job records,
  active pointers, BullMQ lifecycle, dynamic executor import, polling status,
  and startup/shutdown wiring.
- `server/services/verticalDramaEpisodeStageJobs.ts` is stage/run oriented and
  cannot independently represent several shot prompt jobs in one episode.
- The existing start-frame image mutation already admits asynchronous media
  tasks. Only prompt generation needs conversion.

## Impacted areas

- `server/services/verticalDramaShotPromptJobs.ts` (new job service)
- `server/routers/verticalDramaEpisodes.ts` (fast submit/status and exported
  prompt executor)
- `server/_core/index.ts` (worker lifecycle)
- `client/src/pages/VerticalDramaEpisodePage.tsx` (submit/poll/continue)
- focused service, router, client-flow, and wiring tests

## Boundary findings

- Submit and status must use `verticalDramaProcedure` and verify ownership.
- Dedupe scope must include shot number; episode-wide dedupe would incorrectly
  collapse a 9-shot batch.
- Automatic BullMQ retries could repeat paid LLM work, so the initial version
  should use one attempt and expose a user retry after a terminal failure.
- No schema change is needed because the business output is already persisted.
