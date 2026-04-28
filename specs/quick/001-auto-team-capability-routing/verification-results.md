# Verification Results

Date: 2026-04-28

## In-Scope Result

The Work Request / Auto Team stabilization target is verified against the focused regression set.

Implemented in this pass:

- Documented the closeout plan and acceptance criteria for the Work Request to Auto Team flow.
- Fixed the active in-scope regression where `video_editor` plan steps could be routed back to storyboard-writing because storyboard text matched before the video capability route.
- `video_editor` and selected video editor capability now route to `video-storyboard-to-prompts`, allowing the existing video prompt, media generation, waiting, composition, and completion checks to continue.
- Added an automated dry-run regression that advances the storyboard-to-video pipeline through clip generation, final composition, media probing, final review, canonical evidence registration, and run completion without calling external providers.
- Hardened capability parsing so surface capability IDs with action suffixes, such as `video_editor:compose`, still route through the video pipeline instead of being misclassified as missing skills.
- Hardened media artifact registration so the run, room, team, execution mode, and initiating user must match before pipeline state can be updated.
- Reset media capacity wait counters after successful clip queue progress so later stages do not inherit stale retry debt.
- Hardened recovery so paused `awaiting_async_media_pipeline` runs with active pipeline state are explicitly advanced by the recovery sweep, covering lost timers or restart gaps.
- Added `npm --prefix apps/web run verify:auto-team-work-request`, a production-readiness preflight for runtime URLs, internal media job token, media providers/models, active async pipelines, and missing pipeline state blockers.
- Refactored the readiness preflight into testable functions and added automated regression coverage for missing token failures, sandbox DB downgrade, active pipeline warnings, and unrecoverable missing pipeline state failures.
- Added an in-process media pipeline advancement lock to prevent duplicate async media fan-out when timers/recovery sweeps overlap.
- Added a room tenant scope assertion before media artifacts can update an auto-team run pipeline.
- Added final-review repair behavior that can queue an extra clip, re-compose, and re-review before pausing a failed final media run.
- Grounded storyboard-to-video clip prompts with scene/shot hints extracted from storyboard prompts.
- Routed document-management plan steps into document/storyboard writing skills while recording RAG/vector expectations in the plan metadata.
- Centralized video duration, clip-count, and media budget estimation through `autoTeamBudgetService` to reduce planning/runtime budget drift.
- Hardened production readiness so missing public URL fails in production and disabled auto-team workers fail readiness.
- Added capability-gap draft evidence requirements so skill-creator fallback must produce private/pending-review draft evidence, contracts, safety limits, and test fixtures.
- Synced linked Work Request/Case state to completed when an Auto Team run finishes successfully, so My Requests reflects completion instead of leaving the request in progress.
- Added requester notification on Team run completion through the existing notification service, with a safe relative action URL to `/work/requests?requestId=...&runId=...&result=1`.
- Highlighted notification-linked results in My Requests and kept the final media link inside the execution trail.
- Expanded readiness preflight to verify Auto Team final-result storage, artifact evidence storage, notification table access, and production-safe public result URLs.
- Added regression coverage for the requester result notification route so `/work/requests?...&result=1` shows the result banner, highlights the request, and exposes the final media link.
- Extracted requester completion notification construction into a testable service and added regression coverage for the result action URL, metadata, dedup group key, and no-requester suppression.
- Expanded readiness preflight to report the active managed media storage provider and fail production readiness when only local storage is active.
- Loaded the app `.env` for the standalone readiness command so local/script verification sees the same DB, token, storage, and runtime configuration as the app.
- Applied the Auto Team execution records migration (`0155_auto_team_execution_records.sql`) to the active local database and set the canonical runtime public URL from the existing app URL.

## Commands Run

```bash
npm --prefix apps/web run check
```

Result: passed.

```bash
npm --prefix apps/web run verify:auto-team-work-request -- --json --allow-missing-db
```

Final result after loading app env, applying the Auto Team execution records migration, and setting the canonical runtime public URL: passed.

- Internal media job token: configured
- Public URL: configured
- Managed media storage: configured
- Database: connected
- Auto Team final result/artifact tables: accessible
- Media providers/models: available
- Async media recovery state: no active or missing pipeline blockers

```bash
npm --prefix apps/web test -- scripts/__tests__/verify-auto-team-work-request-readiness.test.ts client/src/pages/__tests__/WorkRequest.test.tsx client/src/pages/__tests__/MyRequests.test.tsx server/routers/__tests__/workOs.test.ts server/services/__tests__/workOsService.test.ts server/services/__tests__/runEngine.test.ts server/services/__tests__/runtimeDispatchPolicy.test.ts server/services/__tests__/teamRunSkillExecutorUnifiedWiring.test.ts server/services/__tests__/autoTeamMediaExecutionService.test.ts server/services/__tests__/autoTeamMediaCompletionService.test.ts server/services/__tests__/autoTeamRecoveryService.test.ts server/services/__tests__/managedMediaAccessService.test.ts server/services/__tests__/workOrchestratorPlanningService.test.ts
```

Initial result: failed in `teamRunSkillExecutorUnifiedWiring.test.ts` because `video_editor` storyboard steps resolved to `storyboard-writer`.

Final result after fix, dry-run coverage, readiness preflight coverage, and the 12-point hardening pass: passed.

- Test files: 14 passed
- Tests: 225 passed

```bash
npm --prefix apps/web test
```

Result: failed outside the focused Work Request / Auto Team scope and eventually hit Node heap out-of-memory.

Representative unrelated failures:

- broad Vitest OOM / worker exit during the full suite
- migration journal index expectations against a much newer journal
- feature-flag default expectation drift
- React test environment invalid hook call / `useSyncExternalStore` null failures
- endpoint tests returning `401` before older validation expectations
- missing or incomplete mocks for `db`, `adminProcedure`, `XMLHttpRequest`, and R2 settings
- unrelated shared enum and layout DSL expectation drift

No additional Work Request / Auto Team targeted regression remained after the routing fix.

## Safety Check

The in-scope verification still covers:

- user-bound managed media token checks
- idempotent launch and stale kickoff behavior
- budget and runtime dispatch policy paths
- media execution and completion polling
- full dry-run from storyboard image to queued video clip, final composition, final probe, final semantic review, canonical evidence, and run stop
- scope checks for media artifact registration against the linked run/team/room/user
- suffixed video editor capability routing, including `video_editor:compose`
- recovery sweep resumes active async media pipelines after pause/restart gaps
- recovery behavior for blocked media/pipeline states
- My Requests links to room, run, Work OS, and media evidence
- production readiness preflight reports environment/config blockers instead of leaving them as manual checklist items only
- readiness preflight regression tests verify the machine-checkable release gate stays strict for production blockers while still allowing explicit sandbox DB skips
- media pipeline duplicate-submission guard
- tenant mismatch rejection for media artifact registration
- final media review repair loop before terminal pause
- document/RAG/vector planning expectations and media pipeline repair metadata
- shared media budget estimator coverage through planning tests
- completion notification/action URL back to My Requests
- Work Request/Case state sync after successful Auto Team completion
- production-safe result URL validation and DB accessibility checks for final results, artifact refs, and requester notifications
- result notification UI regression coverage in My Requests
- managed media storage provider readiness check
- completion notification payload/action URL regression coverage

## Remaining Manual E2E

A real environment is still required before production release:

1. Database and tenant data seeded.
2. Team and automation room creation enabled.
3. Media provider credentials available.
4. Video composition/probe runtime available.
5. A real Work Request is started and followed through final evidence review.

This is an environment/provider validation step. The code-level control flow is now covered by automated dry-run regression, and the environment prerequisites are covered by `verify:auto-team-work-request`, so this is not an unresolved code blocker in the focused regression path.
