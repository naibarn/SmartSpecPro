# Research findings

## Research decision

- Codebase research: required because this is an existing git repository.
- Web research: skipped; the task is an internal BullMQ/Redis/TRPC/Drizzle refactor and the authoritative behavior is in this repository.
- Testing research: use the existing Vitest suites in `apps/web/server/**/__tests__`, React/jsdom suites in `apps/web/client/src/**/__tests__`, focused workspace commands, and `git diff --check`.

## Codebase findings

### Existing async patterns

- `apps/web/server/services/verticalDramaStoryJobs.ts` already provides BullMQ submission, Redis status, active-series pointers, checkpoint/resume, and worker lifecycle for long story mutations.
- `verticalDramaDraftCompositionJobs.ts`, `verticalDramaDraftQualityQcJobs.ts`, `verticalDramaShotPromptJobs.ts`, `verticalDramaShotVideoPromptJobs.ts`, and `verticalDramaEpisodeStageJobs.ts` already separate browser submission from worker execution.
- `_core/index.ts` owns queue startup/shutdown, so new queues must be wired there and tested.
- The UI already has refresh-safe planning workspace state and polling for several existing job types.

### Remaining synchronous boundaries

The audit identified direct LLM waits in browser-facing mutations:

- `apps/web/server/routers/verticalDramaSeries.ts`: prompt expansion preview, story bible generation, legacy preset synthesis, lineage carry-over and special-edition synthesis.
- `apps/web/server/services/verticalDramaSourceIngestionService.ts`: source analysis changes a queued row and immediately performs vision analysis inline.
- `apps/web/server/routers/verticalDramaLocations.ts`: location detection runs the LLM before returning.
- `apps/web/server/routers/verticalDramaCharacters.ts`: character variant and duplicate analysis run the LLM before returning.
- `apps/web/server/routers/verticalDramaEpisodes.ts`: reference-frame prompt generation runs the LLM before returning.

### Durable data available for reuse

- `vertical_drama_prompt_expansion_runs` stores prompt expansion status/result.
- `vertical_drama_source_analyses` stores queued/running/succeeded/failed analysis state and suggestion/error fields.
- Draft/session and story job records already carry series/session ownership and model context.
- Billing uses stable skill/run metadata; every new executor must pass the selected model and canonical skill slug through the same settlement path.

### Client boundaries

- `VerticalDramaPromptExpansionDialog.tsx` currently awaits preview mutation.
- `VerticalDramaDeepStoryDraftsPanel.tsx` already polls story jobs and can extend the same state machine to the story plan kind.
- Source, location, character, and reference prompt panels need submit/status behavior instead of awaiting long mutations.

### Repository constraint

SocratiCode was not available in this runtime, so discovery used targeted `rg`, symbol-adjacent file reads, existing queue implementations, and focused tests. This is a planning limitation, not a production behavior claim.

## Research conclusion

The lowest-risk path is to reuse the proven queue primitives, add one typed interactive analysis queue for the remaining small domain jobs, persist every result before success, and add a regression guard that public routers cannot call the expensive LLM service functions directly. Increasing HTTP timeout alone is insufficient.
