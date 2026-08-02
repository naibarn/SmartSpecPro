# VD `runStage` — async job for long single-shot LLM stages (storyboard_shotgrid)

Date: 2026-07-24
Origin: Bug ticket #127 — "กดสร้างตอนย่อย และสร้างสตอรีบอร์ด 9 ช็อต ไม่ผ่าน"
(series 17 / episode 96, https://smartaihub.app/drama-series/17/episodes/96)

## Problem statement

`verticalDramaEpisodes.runStage` runs every pipeline stage **fully
synchronously inside one tRPC mutation** — the HTTP request doesn't resolve
until the whole stage (LLM call, persistence, side effects) is done. For most
stages that's fine. `storyboard_shotgrid` is not: `generateStoryboardShotgrid`
(`verticalDramaStoryboardGeneration.ts`) makes a single JSON-planning LLM call
with `maxTokens: 16000` (9 fully-detailed shots — camera, dialogue,
image_prompt, negative_prompt, per-character acting direction, plus a near-
duplicate `shots` array in `storyboard_handoff_json`), with one retry-on-
truncated-JSON built into `executeJsonPlanningCallWithRetry`. This routinely
runs long enough to outlive Cloudflare's edge proxy-read timeout (~100s
default, independent of and shorter than our own nginx/Node timeouts).

**Confirmed root cause chain (bug #127, verified against production DB/logs,
not just theory):**

1. Cloudflare's edge gives up around 100s of no response bytes and returns
   its own `524` HTML page to the browser, closing its connection to our
   origin (nginx).
2. nginx's `/trpc/` locations already allow 600s
   (`nginx/conf.d/dev-host.conf`, tuned in a prior incident, 2026-07-08) —
   but had never set `proxy_ignore_client_abort` (default `off`). So the
   instant nginx sees its "client" (Cloudflare) disconnect, it **also**
   drops the connection to the Node upstream, aborting the still-running
   request mid-flight.
3. `VerticalDramaEpisodePipeline.writeRun` only `INSERT`s a
   `vertical_drama_episode_runs` row **once, at the very end**, after the
   entire stage's `RunResult` is already computed
   (`verticalDramaEpisodePipeline.ts:1820-1845`). There is no "insert
   queued/running row first" step. An aborted request therefore leaves
   **zero trace** — confirmed for episode 96: `plan_episode_script`
   (00:50:55 UTC) has a `succeeded` row + a `-31` credit charge, but
   `storyboard_shotgrid` has **no row, no audit-log entry, no credit
   charge at all** — the work was destroyed, not just hidden from the
   client.
4. The frontend's own gateway-failure message
   (`apiResponseDiagnostics.ts`) says "the operation may still have
   completed; refresh before retrying" — that's **wrong** for this failure
   mode. Nothing survives; the user has to regenerate from scratch, and
   will likely hit the same ~100s wall again, which matches the ticket's
   "ไม่ผ่าน" (consistently fails, not a one-off).

**Immediate mitigation already applied (2026-07-24, separate from this
plan):** `nginx/conf.d/dev-host.conf` — added `proxy_ignore_client_abort on;`
to both `/trpc/` locations, reloaded live. This stops nginx from tearing down
the Node request when Cloudflare disconnects, so the stage can actually
finish and persist even though the user still sees a 524 in the browser on
the first attempt. **This is a stopgap, not a fix** — the user experience is
still "click → error" every time, and any stage whose generation legitimately
exceeds Cloudflare's timeout will always show a spurious failure.

## Why a real fix is still needed

`proxy_ignore_client_abort on` only prevents *data loss*. It does not:
- give the user any success feedback (they still see the 524 page)
- let the client resume/poll for the real result without a manual page
  refresh
- help once Cloudflare's own timeout is hit (unavoidable on the current
  plan) — the browser connection is severed regardless of what the origin
  does

The only complete fix is to stop making the browser hold one HTTP connection
open for the whole generation. This is not new territory for this codebase —
`verticalDramaStoryJobs.ts` already implements exactly this pattern (submit →
jobId → poll, BullMQ dispatch + Redis job record + checkpointing) for the
`deep_generate`/`extend`/`improve_script` season-level jobs
(see `planning/vertical-drama-deep-story-resilient-resume/plan.md`).
`storyboard_shotgrid` needs the same *shape* of fix, scaled down to a single
stage run instead of a whole-season chunked job.

## Design decision (needs confirmation before implementation)

Two viable shapes — recommend (A):

**(A) Reuse `vertical_drama_episode_runs` as the async status record**
(recommended — smaller, most natural fit, no new table). The table already
defaults `status` to `'queued'`, which nothing currently uses:
1. `runStage` inserts a `queued` row **immediately** (before calling the LLM)
   for stages flagged as "slow" (`storyboard_shotgrid` first; the same
   `runStageMutation` in `VerticalDramaEpisodePage.tsx` also drives
   `plan_episode_script` and `start_frame_render_plan`, which should be
   audited for the same risk once this lands), and returns
   `{ runId, status: "queued" }` right away instead of awaiting the stage.
2. The actual `generateStoryboardShotgrid` + persistence work moves into a
   background task (reuse the existing BullMQ/Redis job infra already wired
   for VD story jobs — `verticalDramaStoryJobs.ts`'s queue setup is the
   nearest precedent; do NOT block the HTTP response on it).
3. On completion, `writeRun`'s insert becomes an `UPDATE ... WHERE id =
   runId` (status → `succeeded`/`failed`, artifactIds/warnings/errors filled
   in) — same shape already used for every OTHER checkpoint update in this
   file (`verticalDramaEpisodePipeline.ts:3383` etc all `.update(...)`).
4. Client: `VerticalDramaEpisodePage.tsx`'s `runStageMutation` handler for
   `storyboard_shotgrid` switches from "await the mutation, use its result"
   to "get `runId` back immediately, poll the existing stage-runs list query
   (`listRuns`-equivalent, already returns `state`/`status` per stage —
   see router ~line 7590) until `succeeded`/`failed`, same polling idiom
   `VerticalDramaDeepStoryDraftsPanel.tsx` already uses for story jobs.

**(B) New generic `verticalDramaEpisodeStage` job kind inside
`verticalDramaStoryJobs.ts`** — reuses more existing plumbing (heartbeat TTL,
BullMQ retry/backoff already tuned) but that module is explicitly
season/bible-shaped (`VerticalDramaStoryJobKind` = `deep_generate | extend |
improve_script`, checkpoints keyed by drafted episode arrays) — forcing a
single-episode single-stage job through it is a worse impedance match than
(A) and risks coupling two things (season story jobs vs. per-episode stage
runs) that are currently cleanly separate.

Open question for implementation kickoff: confirm (A) vs (B), and confirm
which OTHER stages behind the shared `runStageMutation` should get the same
treatment now vs. later (this plan scopes to `storyboard_shotgrid` only,
since that's the reported bug).

## Affected files (scope: storyboard_shotgrid only)

- `apps/web/server/services/verticalDramaEpisodePipeline.ts` — `writeRun`
  (insert-early / update-late split), the `storyboard_shotgrid` branch
  (~line 3597) moves its LLM call off the request path.
- `apps/web/server/routers/verticalDramaEpisodes.ts` — `runStage` returns
  early for the async-eligible stage instead of awaiting
  `pipelineForMode(...).runStage(...)`.
- New or reused background dispatch (BullMQ job/worker) — exact module TBD
  per the design decision above.
- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx` — the
  `storyboard_shotgrid` `runStageMutation.mutate(...)` call site (~line
  5285-5320) switches to submit-then-poll.
- `apps/web/client/src/lib/apiResponseDiagnostics.ts` — the 524/gateway
  message text should stop asserting "the operation may still have
  completed" once we can no longer assume that (it becomes actually true
  again for storyboard_shotgrid post-fix, but stays false for any other
  stage still on the synchronous path — needs a per-stage-aware copy or a
  generic softer wording).
- Tests: `verticalDramaEpisodes.*.test.ts` (router), pipeline test suite
  for `storyboard_shotgrid`, panel-level test for the new poll flow.

## Risk assessment

- **Credit double-charge:** must confirm the async path still charges
  credits only once, on the background job's success — same invariant the
  current synchronous path already has (verified: no charge on the aborted
  attempt for episode 96).
- **Idempotency on re-click:** if a user clicks "create storyboard" again
  while a `queued`/`running` row already exists for that stage, must reuse/
  block on the existing run rather than starting a second background LLM
  call (`idempotencyKey` field already exists on the mutation input —
  extend its use to this check).
- **Orphaned `queued` rows:** a background job that crashes without ever
  reaching the update step needs a stale-row sweep/timeout, same class of
  problem `verticalDramaStoryJobs.ts`'s heartbeat TTL solves for story jobs
  — don't skip this or `storyboard_shotgrid` will appear stuck forever after
  a worker crash.
- **Scope creep:** other stages behind the same `runStageMutation`
  (`plan_episode_script`, `start_frame_render_plan`, etc.) may share this
  exact risk class but are NOT in scope for this plan — flag, don't fix,
  unless the user asks to widen scope.

## Verification steps

1. Reproduce: trigger `storyboard_shotgrid` for a test episode with a
   deliberately slow model/mock to exceed 100s, confirm the mutation returns
   quickly with a `runId` instead of hanging the HTTP connection.
2. Confirm DB shows a `queued` row immediately, then `succeeded` once the
   background job finishes, with the `storyboard` jsonb column populated —
   same shape as the manual query used to diagnose bug #127:
   `SELECT storyboard IS NOT NULL, jsonb_array_length(storyboard->'shots') FROM vertical_drama_episodes WHERE id = ...`
3. Confirm exactly one `credit_transactions` row for the run (no charge on
   `queued`, one charge on `succeeded`, none on `failed`).
4. Force a client disconnect (close the tab) mid-generation; confirm the
   background job still completes and the row still updates (this is the
   scenario that silently failed for bug #127).
5. `pnpm test` — router + pipeline + panel suites green, no regression in
   the other (still-synchronous) stages sharing `runStageMutation`.
