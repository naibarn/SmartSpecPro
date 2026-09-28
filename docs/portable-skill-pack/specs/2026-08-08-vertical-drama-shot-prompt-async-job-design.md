# Vertical Drama Shot Prompt Background Job Design

## Problem

`generateShotStartFramePrompt` currently keeps the HTTP request open while the
LLM generates and persists a prompt. Cloudflare can return 524 before that work
finishes. The server may still save the prompt, but the browser stops the
`prompt -> image` flow and never submits the image task.

## Approved outcome

Turn shot start-frame prompt generation into a durable background job. The
submit mutation returns immediately, the browser polls a tenant-scoped status
query, and a successful prompt result continues into the existing asynchronous
image-generation mutation.

## Architecture

- Add a Redis-backed shot-prompt job record and a BullMQ worker, following the
  existing Vertical Drama story-job lifecycle.
- Keep the existing prompt generation and transactional episode JSONB update as
  one exported executor. Only the transport changes; prompt/cast rules remain
  authoritative and unchanged.
- Key active work by tenant, user, series, episode, and shot. Repeated submits
  for the same active shot join the existing job.
- Accept a client idempotency key so retries caused by network failures cannot
  create another paid prompt operation.
- Store terminal result/error in the Redis job record with a bounded TTL. The
  generated prompt itself remains durable in the episode record.
- Run at bounded queue concurrency and use one BullMQ attempt. Blind retries
  are unsafe because the LLM/credit operation has no external exactly-once
  checkpoint.

## Data flow

1. Client submits the prompt request with an idempotency key.
2. Server performs fast ownership validation and creates or joins a queued job.
3. Worker marks the job running, invokes the existing prompt executor, then
   records the terminal result or a sanitized error.
4. Client polls until success/failure. On success it uses the returned prompt
   for the existing image-task admission. On failure it stops before image
   admission and displays a retryable error.
5. Page refresh or repeated clicks can recover the active job through the same
   shot identity and status query.

## Security and isolation

All submit and status operations require the existing Vertical Drama
procedure. Status and active-job lookup verify tenant/user/series/episode/shot
ownership before returning data. Redis keys use opaque hashes/IDs and error
messages are bounded before persistence or UI display.

## Failure handling

- Queue dispatch failure moves the record to `failed` immediately.
- Missing/expired jobs return a clear not-found state and can be resubmitted.
- Worker failure clears the active pointer only if it still points to that job.
- Client polling has a long bounded deadline and does not resubmit while a job
  is active.
- Server restart is handled by BullMQ; terminal result remains readable from
  Redis for the configured TTL.

## Trade-offs

Polling adds small Redis/API traffic but avoids a new WebSocket/SSE operational
surface. Redis orchestration avoids a schema migration in an already active
JSONB workflow; the durable business result still lives in the database.

## Verification

- Unit-test enqueue, per-shot dedupe, idempotency, status transitions,
  ownership, queue failures, and stale pointers.
- Preserve existing executor prompt/persistence tests.
- Test all three client consumers and prove image admission occurs only after a
  terminal successful prompt job.
- Verify startup/shutdown queue wiring and run focused typechecking.
