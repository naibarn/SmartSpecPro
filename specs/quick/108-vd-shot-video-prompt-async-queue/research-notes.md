# Research Notes

## Current runtime path

- `apps/web/server/routers/verticalDramaEpisodes.ts` owns the current
  `generateShotVideoPrompt` mutation and performs the full LLM + persistence
  path inline.
- `apps/web/server/services/verticalDramaVideoMotionPromptGeneration.ts`
  exports the single-shot generator and judged best-of-2 wrappers. The wrapper
  can run candidate A/B plus judge and repair, explaining the long request
  duration.
- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx` currently treats
  the mutation as synchronous and keeps only an in-memory per-shot Set. The
  plain generate path and AI-adjust path both use this mutation.

## Reusable patterns

- `apps/web/server/services/verticalDramaEpisodeStageJobs.ts` provides BullMQ
  initialization, worker lifecycle, fail-fast enqueue behavior, and stale-run
  handling.
- `apps/web/server/services/verticalDramaStoryJobs.ts` and
  `verticalDramaDraftQualityQcJobs.ts` provide Redis job-record and active
  pointer patterns.
- Existing Vertical Drama page code already polls long-running work with
  TanStack Query and resumes durable pending tasks after reload.
- `apps/web/server/_core/index.ts` is the startup/shutdown boundary for queue
  registration and already configures long Node timeouts, which is not enough
  to overcome Cloudflare's edge read timeout.

## Known failure evidence

- Production logs showed repeated vision schema failures where boolean fields
  were returned as strings, causing fallback/retry work.
- Episode 137 persisted successful shot prompts even when the browser saw
  HTML 524, proving that response transport and business completion can diverge.

## Discovery limitation

SocratiCode MCP tools were not available in this session. Targeted `rg`,
line-range reads, existing tests, service files, and runtime logs were used
instead. No broad formatter or repository-wide cleanup is authorized.
