# Codebase research

## Discovery status

SocratiCode was not available in the current MCP tool set, so discovery used
targeted shell reads and existing runtime evidence. The repository is an
existing TypeScript/Drizzle/Vitest application.

## Relevant runtime path

- `verticalDramaSpecialEpisodes.ts` creates the special input and enqueues the
  `special_tie_in_prompt` BullMQ job.
- `verticalDramaInteractiveJobs.ts` owns Redis records, BullMQ enqueueing, active
  pointers, and terminal job state.
- `verticalDramaInteractiveJobExecutor.ts` dispatches the special job to
  `runSpecialTieInPromptJob`.
- `verticalDramaSpecialSkillAdapter.ts` loads the skill, resolves references,
  invokes `generateSpecialSkillOutput`, validates the exact 9-shot contract, and
  persists `startFramePlan`/`motionPromptPack`.
- `verticalDramaStoryBible.ts` exposes `executeJsonPlanningCallWithRetry` with
  existing `planningAttemptObserver` and physical provider-attempt callbacks.
- `llmRouter.ts` owns the provider request body, response body, status, timing,
  provider fallback, and existing 120-second headers / 600-second body timeout.

## Existing observability patterns

- `auditLogger.ts` writes buffered date-based JSONL, sanitizes prompt-like keys,
  and caps each entry at 32 KB. This must remain unchanged for existing callers.
- `vertical_drama_episode_repair_attempts` and
  `verticalDramaEpisodeRepairAttempts.ts` provide a useful pattern for durable
  forensic rows, hashes, bounded error text, parsed output, schema issues, and
  best-effort writes, but require an episode revision and therefore cannot model
  a standalone special tie-in job safely.
- `audit.ts` already exposes admin-only audit queries and is the natural place for
  bounded special-run lookup/detail procedures.
- Drizzle migrations are additive SQL files under `apps/web/drizzle`; schema
  declarations live in `apps/web/drizzle/schema.ts`.

## Incident evidence used by the plan

Episode 247 had `skillRun=running`, `outputVersion=0`, zero frames/clips, and a
live BullMQ active job. Audit entries showed HTTP 200 responses from OpenRouter
whose `finish_reason` was `length` or whose JSON/schema omitted required fields.
The worker therefore needed correlated raw request/response, retry-decision, and
terminal lifecycle evidence.

## Testing approach

Use Vitest through the existing `npm --workspace apps/web test -- ... --run`
command. Add unit tests for redaction/event payloads and mocked integration tests
for special lifecycle callbacks and admin ownership/limits. Run a focused
TypeScript/esbuild check and the existing special-flow regression tests after the
implementation. A full web `tsc --noEmit` may remain baseline-limited and must be
reported honestly if it times out or exposes unrelated errors.
