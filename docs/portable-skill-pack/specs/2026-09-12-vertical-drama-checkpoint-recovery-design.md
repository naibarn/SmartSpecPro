# Vertical Drama Checkpoint Recovery Design

## Objective

Make interrupted Vertical Drama story jobs truthful and recoverable from the
existing checkpoint. Add an owner-scoped UI action that can repair or continue a
failed/stalled job without restarting the whole story or rewriting completed
episodes.

## Current failure and constraints

`vertical_drama_story_jobs` stores the domain record in Redis and dispatches the
work through BullMQ. A worker restart can make BullMQ mark a job stalled without
entering `runVerticalDramaStoryJob`'s catch/finally path. The record can therefore
remain `running` and the active pointer can remain held. The current series 58
incident has a checkpoint through episode 7 and a terminal BullMQ stall.

The recovery path must preserve tenant/user ownership, completed authored
content, checkpoint data, and credit safety. It must not perform production
recovery or paid generation automatically as part of this code change.

## Chosen approach

Extend the existing Redis/BullMQ job service with an explicit recovery operation
and a recoverable-job read model. The operation is idempotent and uses the same
domain job id/checkpoint while creating a new BullMQ delivery attempt. A failed
job is never silently treated as active, but remains discoverable for a bounded
recovery window.

The recovery mutation will:

1. authenticate and verify tenant, user, and owned series;
2. read the recoverable domain record and confirm it is a supported story kind;
3. return the existing active job when another request already owns recovery;
4. require a checkpoint for checkpoint resume; otherwise return a bounded,
   non-retryable reason;
5. preserve the checkpoint and enqueue the same domain job for the worker;
6. set a recovery marker/attempt count and expose the same job id for polling;
7. never deduct credits in the recovery endpoint itself; the existing worker
   admission/executor remains authoritative for remaining work.

BullMQ terminal-failure handling will write a failed domain record with the
latest known checkpoint and retain a recoverable pointer. Normal submit dedupe
will continue to block only queued/running jobs, so a user can explicitly
recover or intentionally start a new run after a terminal failure.

## UI contract

The deep-story panel will show a recoverable state after refresh or polling:

- status: failed/stalled, with a concise reason;
- checkpoint summary: completed episode count and remaining episode range;
- primary action: `ซ่อมและทำต่อจาก checkpoint` / `Repair and continue from checkpoint`;
- confirmation copy states that completed episodes are retained and only missing
  episodes are processed;
- pending state disables duplicate clicks and resumes polling the same domain job;
- no-checkpoint or non-retryable state explains that a new generation is required
  without automatically starting one.

The component will use existing design primitives, Thai/English copy conventions,
keyboard-accessible buttons, visible focus, and responsive wrapping at narrow
widths. The normal generate/extend flow remains unchanged.

## Failure handling and safety

- Worker-level stalled failures are classified separately from provider/content
  failures; both become truthful terminal state, but only checkpoint-bearing,
  explicitly requested recovery is offered.
- Recovery is bounded by a persisted attempt counter and a per-series guard so
  two browser tabs cannot enqueue duplicate paid work.
- All read and mutation paths are owner-scoped; a foreign tenant/user receives
  the same not-found behavior as existing status routes.
- Recovery does not delete Redis records, episode rows, authored dialogue, or
  media history.
- The UI never infers recoverability from `status` alone; the server returns the
  recovery decision and the episode/checkpoint summary.

## Testing and rollout

Add focused service tests for terminal stalled reconciliation, recoverable read,
idempotent recovery, checkpoint preservation, and queue failure. Add router tests
for ownership and precondition guards. Add UI tests for failed, recoverable,
pending, no-checkpoint, Thai/English copy, and duplicate-click behavior.

Run focused Vitest tests and the affected TypeScript check. Browser production
proof and execution of the current paid recovery remain separate operational
steps after deployment; this change itself must not enqueue series 58.

## Non-goals

- automatic production recovery during deploy;
- credit refunds or ledger redesign;
- changing story generation prompts or episode content contracts;
- replacing the Redis/BullMQ architecture with a new database migration;
- changing notification SSE transport beyond preserving truthful job status.
