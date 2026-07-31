# Generalize the async stage-job path beyond `storyboard_shotgrid`

Date: 2026-07-31
Reporter: user — `verticalDramaEpisodes.runStage` returned **524** on the
"บทตอนย่อย" step; UI showed a hard failure with a ลองใหม่ button.

## Problem statement

`plan_episode_script` in real mode outlives Cloudflare's ~100s edge timeout.

Evidence:
- `curl -sI https://smartaihub.app` → `server: cloudflare`, `cf-ray: …-SIN`.
  524 is Cloudflare's own origin-read timeout, not ours: nginx is at 600s
  (`nginx/conf.d/dev-host.conf`) and Node at 620s (startup log). Cloudflare's
  ~100s limit is not configurable below Enterprise, so raising our timeouts
  cannot fix this.
- `vertical_drama_episode_runs` row **540** (`plan_episode_script`, `full`) =
  **succeeded**. The work completed; only the HTTP response was lost. The user
  sees a failure and is invited to re-run, which re-charges the LLM call.

This exact failure mode was already fixed once — for a different stage. Bug
#127 (`planning/vd-storyboard-runstage-async-job/plan.md`) moved
`storyboard_shotgrid`'s real run to a BullMQ job, and the router comment says
so verbatim: *"it would routinely outlive Cloudflare's ~100s edge-proxy read
timeout"*. But every piece of that path is hardcoded to the one stage:
`submitStoryboardShotgridStage`, `runStoryboardShotgridStageJob`, the router
gate, and the client's poll trigger.

## Design

Generalize the mechanism; do NOT duplicate the storyboard job body for a second
stage. `runStoryboardShotgridStageJob` is a deliberately dead-code-eliminated
copy of `runStage`'s tail, valid only because `storyboard_shotgrid` can never
reach the paid-provider branch. `plan_episode_script` has different downstream
behavior, so copying that shape again would be wrong twice over.

Instead the generic job calls the EXISTING `runStage`, which already handles
every stage correctly. The only thing it must not do is insert a SECOND run row
next to the `queued` placeholder the submit step already wrote.

| # | File | Change |
|---|---|---|
| S1 | `verticalDramaEpisodePipeline.ts` | `RunStageOptions.asyncRunId?: number`. `writeRun` UPDATEs that row instead of INSERTing when set — one change point covering all 10 call sites |
| S2 | `verticalDramaEpisodePipeline.ts` | `VERTICAL_DRAMA_ASYNC_STAGES = {storyboard_shotgrid, plan_episode_script}` |
| S3 | `verticalDramaEpisodePipeline.ts` | `submitEpisodeStageAsync(owner, stage, opts)` — `submitStoryboardShotgridStage` with `stage` parameterised; the old name stays as a thin wrapper so existing callers/tests are untouched |
| S4 | `verticalDramaEpisodePipeline.ts` | `runEpisodeStageJob(owner, runId, stage, opts)` — guarded claim (same rule as the storyboard job), then `runStage` with `asyncRunId`, with an outer catch that always leaves the row `failed` |
| S5 | `verticalDramaEpisodeStageJobs.ts` | job data gains `stage`; worker dispatches `storyboard_shotgrid` → existing job body (untouched), everything else → `runEpisodeStageJob`. Missing `stage` defaults to `storyboard_shotgrid` so jobs already in the queue at deploy time still run |
| S6 | `verticalDramaEpisodes.ts` | router gate becomes the SET, not the single stage |
| C1 | `VerticalDramaEpisodePage.tsx` | poll trigger gates on the same set, so a `queued` `plan_episode_script` polls instead of toasting "complete" |

The client's poll loop (`pollStoryboardShotgridRun`) is already stage-agnostic —
it polls `listEpisodeRuns` for a `runId`. Only its trigger condition and naming
are storyboard-specific.

## Risk assessment

- `runStoryboardShotgridStageJob` is NOT touched → storyboard behavior stays
  byte-identical, including its idempotency, stale self-heal, and
  `clearDownstreamOnSuccess`.
- `asyncRunId` is optional; every synchronous path keeps INSERTing exactly as
  before.
- The credit risk runs the RIGHT way here: the submit step's existing
  idempotency (reuse a `queued`/`running` row for the same episode+stage)
  now also protects `plan_episode_script` from the double-charge the 524 was
  inviting.
- `attempts: 1` on the queue is retained — a blind BullMQ redelivery would
  double-charge, and this stage has no per-chunk checkpoint.

## Verification

1. Unit: `writeRun` UPDATE-vs-INSERT branch; async-stage set membership;
   job dispatch by stage (incl. the missing-`stage` default).
2. `tsc` on apps/web; targeted vitest; fail-set diff vs baseline.
3. Live: run บทตอนย่อย and confirm it returns immediately as `queued`, then
   reaches `succeeded` via polling. REQUIRES a web restart.

## Progress

- [x] S1–S6 server
- [x] C1 client
- [x] tests

## Test fallout (expected, and what it cost)

Changing which stages run inline broke 6 router tests that encoded the OLD
contract, plus ~20 pipeline test doubles that did not know the new methods.
Both were updated:

- Mock factories/classes gained `VERTICAL_DRAMA_ASYNC_STAGES` and
  `submitEpisodeStageAsync`. `pipelineForMode` CONSTRUCTS
  `VerticalDramaEpisodePipeline` for real modes, so the class double needs it
  too — not only the singleton.
- Gate tests (`VD_EPISODE_BEYOND_PLAN`, Wave-4A tie-in) asserted
  `mockRunStage` was called purely as proof the gate let the run through. For a
  real run of an async stage that proof is now the async submit. Their dry_run
  siblings still assert `mockRunStage` — previews stay synchronous.

Verified by fail-set diff against a baseline worktree at `7aedac5bc`: **0 new
failures** attributable to this change.

Caveat on that measurement: the baseline worktree holds only COMMITTED code,
while the working tree also carries other sessions' uncommitted work. ~25
`assembleEpisodeVideo` / `getEpisodeDetail` failures show up as "new" purely
because another session's in-flight change left `queueRemotionRenderVideoJob`
off a `workerSchedulerService` mock. Confirmed by reading the error, not by
assuming.
