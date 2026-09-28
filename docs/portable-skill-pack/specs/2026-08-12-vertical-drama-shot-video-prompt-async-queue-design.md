# Vertical Drama Shot Video Prompt Async Queue Design

## Problem

`verticalDramaEpisodes.generateShotVideoPrompt` currently keeps the browser's
HTTP request open while it performs one or more vision LLM calls, quality-loop
candidate calls, judging, optional repair, and the final episode JSONB merge.
Cloudflare can return an HTML `524` before the server returns JSON even when the
prompt generation later succeeds and is persisted. The current page also tracks
only an in-memory pending set, so a user cannot reliably see that work was
accepted after a refresh and may click again, creating duplicate LLM work and
credit usage.

## Approved outcome

Convert the user-facing operation into an asynchronous, server-owned job:

- submit returns promptly with an acknowledged `queued` job;
- jobs for the same tenant/user/series/episode run one at a time in FIFO order;
- unrelated episodes may run in parallel under a bounded global concurrency;
- the page clearly distinguishes admission (`queued`) from completion
  (`succeeded`/`failed`);
- repeated submits join the existing active job instead of starting another LLM
  operation;
- refresh, navigation, and transient network errors do not lose the job state.

The existing prompt-generation executor, prompt/cast contracts, quality-loop
behavior, and atomic motion-pack persistence remain the business source of
truth. The first implementation changes transport and observability rather
than silently changing prompt quality or credit semantics.

## Chosen architecture

Use the existing BullMQ + Redis infrastructure and Vertical Drama queue
patterns. Add a dedicated queue, for example
`vertical_drama_shot_video_prompt_jobs`, with:

1. a Redis job record keyed by an opaque job ID;
2. an active-job pointer/dedupe index scoped by tenant, user, series, episode,
   and shot;
3. a per-episode FIFO sequence and lock;
4. a BullMQ worker with bounded concurrency for unrelated episodes;
5. tRPC submit, status, and active-list procedures protected by the existing
   Vertical Drama ownership procedure.

The per-episode sequence is assigned atomically at admission. The worker may
process different episode scopes concurrently, but it must not execute sequence
`n + 1` until sequence `n` reaches a terminal state. A Redis lock with a lease
and stale-lock recovery prevents two workers from running the same episode
simultaneously. If a worker receives a job whose scope is busy or whose earlier
sequence is not terminal, it releases/requeues it with bounded backoff instead
of running it out of order.

The active-pointer check, idempotency lookup, and sequence assignment must be
one atomic Redis transaction/Lua operation. This prevents two browser tabs from
both observing an empty pointer and both admitting work for the same shot.

This reuses the current Redis/BullMQ operational surface and avoids a new
database migration for queue metadata. The generated prompt remains durable in
`vertical_drama_episodes.motionPromptPack`; Redis stores queue state and a
bounded terminal result/error only.

## Submit contract

Keep the existing input shape and migrate all repository callers to the
acknowledgement semantics. The mutation's transport result intentionally changes
from the final prompt result to an admission result; the prompt executor is
internal and remains separately testable:

```ts
{
  jobId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  deduplicated: boolean;
  queuePosition: number | null;
  activeJobCount: number;
}
```

The input preserves the existing prompt options, including `shotNumber`,
`instruction`, `nativeAudioEnabled`, `attachShotImage`,
`additionalImageUrls`, `qualityLoop`, and `idempotencyKey`.

Admission performs fast validation only: ownership, episode/shot existence,
approved start-frame availability, model selection, and request-size limits.
It must not start the LLM call. A newly accepted job is written as `queued`
before BullMQ admission is reported to the client. If BullMQ enqueue fails, the
record is immediately terminal `failed` and the client is never told that a
worker is waiting behind it.

## Duplicate protection

Duplicate protection has two independent layers:

### Request idempotency

The client sends a UUID per intentional click. A retry of the same request
after a lost HTTP response resolves to the same job record. The idempotency
mapping is scoped to tenant/user and expires with the job record.

The server also computes a request fingerprint from the meaningful generation
inputs, excluding the idempotency key. Reusing an idempotency key with a
different fingerprint is rejected as a conflict rather than returning the
older job for a different request.

### Active-shot dedupe

Only one `queued`/`running` job may exist for a given
`tenant/user/series/episode/shot` scope. If the same shot is clicked again while
active with the same request fingerprint, the server returns the existing job
with `deduplicated: true`, without another credit-consuming executor call. If
the active job has a different fingerprint (for example, a new AI-adjust
instruction), the server returns a clear conflict telling the user to wait for
the current job; it must not silently discard the new instruction or run two
generations against the same shot.

After a job is terminal, a new intentional click may create a new job. The
dedupe pointer is cleared atomically only if it still points to the completing
job, so an older worker cannot clear a newer job's protection.

The UI also disables the same-shot action while active, but this is only a UX
guard; server-side dedupe remains authoritative across tabs, reloads, and
concurrent requests.

## Worker and execution lifecycle

The worker transitions each record as follows:

```text
submit -> queued -> running -> succeeded
                         \-> failed
```

- `queued`: accepted and waiting; no LLM call has started.
- `running`: the worker owns the per-episode lease and is executing the
  existing prompt executor.
- `succeeded`: the executor atomically persisted the motion prompt pack; the
  record contains bounded result metadata such as shot number, model, prompt
  quality mode, and completion time.
- `failed`: the job did not produce a confirmed terminal success; the record
  contains a sanitized, bounded, retryable error.

BullMQ attempts remain `1` for logical LLM failures. Blind automatic retries
are unsafe because a provider call may have consumed credits or the database
write may have completed before a worker/network failure. A user-initiated
retry creates a new idempotency key after the old job is terminal.

The executor must remain separate from the submit router so existing prompt,
split-shot, quality-loop, and persistence tests can exercise it directly. The
worker calls that executor and records the terminal state around it.

## Status and user experience

Add a status query for one job and an active-jobs query for the episode. The
active-jobs response includes per-shot status, queue position, submitted time,
started time when available, and a short failure message when terminal.

The page behavior is:

- immediately after a successful submit, show `ส่งเข้าคิวแล้ว — รอผลลัพธ์`
  rather than a generic spinner or success toast;
- show `queued` as “รอคิว”, `running` as “กำลังสร้าง”, `succeeded` as
  “สร้างสำเร็จ”, and `failed` as “สร้างไม่สำเร็จ”;
- disable only the active shot's generate/AI-adjust action; other shots remain
  submit-able;
- on a repeated click for an active shot, keep the same status and show that
  the job is already queued instead of adding another item;
- poll the server while any episode job is active, then invalidate
  `getEpisodeDetail` after terminal success so the persisted prompt is visible;
- on page reload, recover active jobs from the server and resume polling;
- do not start a dependent action from `onSuccess` merely because submission
  was acknowledged; dependent behavior must wait for `succeeded`.

Polling is preferred over a new WebSocket/SSE surface because the application
already uses TanStack Query polling for long-running Vertical Drama work. A
short interval while active and no polling while idle keeps the operational
cost bounded.

## Reducing the original failure mode

The queue removes the Cloudflare request-duration failure, but it does not by
itself reduce LLM work. The implementation also adds these focused hardening
changes:

- normalize provider/model JSON values that are boolean strings before the
  motion-contract Zod validation, with tests for accepted and rejected forms;
- preserve bounded retries and fallback behavior, but do not repeat the whole
  job automatically after a worker failure;
- record per-job phase/timing metadata (`queued`, preparation, candidate A/B,
  judge/repair, persist) for diagnosis without storing full prompts in logs;
- keep the existing quality-loop default unchanged initially, so this queue
  rollout does not silently reduce output quality or alter credit estimates;
- expose a future feature-flagged fast mode as a separate product decision if
  the measured queue time remains too high.

## Failure and recovery rules

- A submit network error does not trigger client resubmission automatically;
  the client first looks up the idempotency/job state.
- Missing or expired job records return a clear “สถานะหมดอายุ” result; the
  user may intentionally submit again.
- Queue admission failure marks the job failed immediately and leaves no active
  pointer.
- Worker exceptions mark the job failed and release only its own active pointer
  and episode lease.
- A stale running lease is recoverable after a bounded timeout. Recovery must
  not blindly re-run a credit-consuming LLM call; it marks the job failed with a
  retryable “worker interrupted; verify persisted prompt before retrying” error.
- A terminal job record has a bounded Redis TTL. The motion prompt itself is
  not TTL-bound because it is stored in the episode record.
- Status and active-list procedures always repeat tenant/user/series/episode
  ownership checks; Redis keys must not be accepted as authorization.

## Testing and acceptance criteria

### Server

- submit returns within the HTTP edge budget and never waits for the LLM;
- one intentional submit creates exactly one queued job;
- same idempotency key returns the same job;
- same active shot and same request fingerprint from a second tab returns the
  existing job;
- same active shot with a different instruction returns a conflict without
  losing the new request or launching a second executor;
- different shots in one episode receive increasing sequence numbers and run in
  order;
- different episodes can run concurrently up to the configured limit;
- a failed enqueue is terminal and never remains falsely queued;
- worker success persists the prompt and then reports `succeeded`;
- worker failure reports a sanitized error and clears only its own pointers;
- stale locks and restart recovery do not double-run a paid executor;
- ownership tests reject cross-tenant/user status access;
- existing direct executor tests remain green.

### Client

- acknowledged submit displays a durable “queued/waiting” state;
- same-shot button is disabled while queued/running, while other shots remain
  usable;
- active job state survives refetch and page reload;
- success refreshes the persisted prompt only after terminal success;
- failure exposes retry without silently resubmitting;
- repeated clicks and lost-response retries do not create duplicate jobs.

### Operational

- queue and worker initialize during web startup and shut down cleanly;
- startup logs expose queue readiness and configured concurrency;
- focused tests, changed-file typecheck, and `git diff --check` pass;
- browser evidence verifies at least two queued shots in one episode and a page
  reload during `queued`/`running`.

## Scope boundaries

This design does not change video rendering, start-frame generation, dialogue
audio, payment confirmation, or the motion-prompt content contract beyond the
minimal boolean normalization required to prevent avoidable schema retries.
It also does not add a new database table in the first rollout.
