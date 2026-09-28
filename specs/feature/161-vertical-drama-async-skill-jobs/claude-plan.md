# Implementation plan

## 1. Shared typed job runtime and persistence

Inspect the current Redis/BullMQ helpers and create a typed interactive-job runtime in `apps/web/server/services/verticalDramaInteractiveJobs.ts` (or extend the nearest existing queue abstraction if the repository already has an equivalent). Define a closed union of job kinds, tenant/user/series/session-scoped payloads, status/result/error contracts, active-job pointers, and queue configuration. The submit API must only validate and enqueue; the worker must own LLM execution and state transitions. Add initialization and graceful shutdown to `apps/web/server/_core/index.ts`.

Use existing durable tables wherever they are authoritative. Add the smallest Drizzle migration only where a job kind has no durable status/result owner; do not duplicate source-analysis or prompt-expansion tables. Every record must include model, skill slug, trace/run IDs, timestamps, progress, retryability, and serialized result/error with bounded sizes. Add ownership checks to status/result queries.

## 2. Story plan and prompt expansion

Extend `verticalDramaStoryJobs.ts` with a plan/bible job that moves the direct `generateStoryBible` call out of `verticalDramaSeries.generateStoryBible`. Preserve all preconditions and post-generation reconciliation in the worker transaction. Change prompt expansion preview to submit the existing real expansion service to a background job and persist the preview run result before reporting success. Keep apply as a DB-only operation. Update the deep-story panel and expansion dialog to poll terminal status and resume from the server.

## 3. Legacy preset and lineage routes

Make `synthesizeGenrePreset`, `proposeSeasonCarryOver`, and `proposeSpecialEditionBrief` submit typed jobs (or delegate to the canonical draft composition queue where the existing payload already fits). Remove direct LLM awaits from browser-facing routes. Persist transient wizard results in a refresh-safe job/result record tied to the planning series and user. Preserve the exact model chosen by the wizard and expose terminal errors with trace IDs.

## 4. Source, location, and character analysis

Move source vision analysis out of `requestSourceAnalysis`/`suggestSourceDescription` request execution; the API creates/updates the queued analysis row and the worker performs vision analysis and writes the suggestion. Convert location detection, character variant/twin detection, and duplicate analysis to typed jobs while leaving user-confirmed merge mutations synchronous. Update panels/dialogs to poll and load durable results after refresh.

## 5. Shot reference-frame prompt

Add reference-frame prompt as a typed shot-prompt job using the same model/skill/billing context as start-frame and video prompt jobs. The submit route must persist the request snapshot and return a job ID; the executor must save the generated prompt before success. Update the shot UI to use the existing prompt job polling pattern.

## 6. Billing, model identity, and security

Trace each new worker into the canonical skill billing/settlement helper. Require a non-empty canonical skill slug before LLM invocation. Use deterministic call keys for worker retry idempotency while allowing a deliberate new run to create a new charge. Ensure ledger projections display the canonical skill name and exact model. Add tenant/user/series/session checks on submit and status/result reads, and reject stale/unbound job pointers.

## 7. Client orchestration and completion repair

Replace long mutation awaits with submit/poll hooks. Add explicit queued/running/succeeded/failed states, duplicate-submit guards, refresh recovery, and a “still running in background” state when polling budget expires. Chain story plan to deep draft only after success. Add/extend server completion checks after full-story generation for missing episodes, shots, or dialogue and enqueue real repair jobs with normal billing; surface repair progress in the overview.

## 8. Verification and regression guard

Add focused server tests for submit latency, worker success/failure/retry/stall/restart, persistence, ownership, model passthrough, skill slug, billing idempotency, and completion repair. Add client/jsdom tests for polling and refresh states. Add a static test that the named public router mutations no longer import/call direct LLM service functions. Run focused Vitest suites, changed-file diagnostics, `npm --workspace apps/web run check` where feasible, and `git diff --check`. Keep provider/deployment/browser proof explicitly separate from local proof.

## Dependency order

Implement sections 1 and 6 first, then 2 and 3, then 4 and 5, then 7, and finish with section 8. Existing async queues can be tested and repaired in parallel with the shared contract but must not be replaced.

## Rollback and compatibility

Keep existing result schemas and route names where possible, changing mutations from result-returning to job-returning contracts only with client updates in the same change. Do not fallback to sync on queue failure. If a migration is required, deploy additive columns/tables first and keep immutable historical ledger records untouched.
