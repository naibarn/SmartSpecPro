# Implementation Plan

## Objective

Make start-frame prompt generation resilient to HTTP/Cloudflare timeouts and
guarantee that prompt success can continue into image admission without
duplicate paid prompt work.

## Current-codebase fit

Reuse the established Redis/BullMQ Vertical Drama job conventions. Keep all
creative prompt logic and locked episode persistence in the current router
module, exposed through a worker-only executor, to minimize semantic drift.

## Implementation approach

1. Add a focused shot-prompt job service with typed queued/running/succeeded/
   failed records, TTL storage, per-shot active pointers, idempotency pointers,
   bounded errors, enqueue recovery, worker execution, and lifecycle exports.
2. Extract the slow body of `generateShotStartFramePrompt` into an exported
   executor. Replace the public mutation with fast ownership validation and
   enqueue. Add tenant-scoped status/active queries.
3. Wire queue startup and graceful shutdown into `_core/index.ts`.
4. Add a client helper that submits then polls to terminal state. Use it for
   prompt+image, AI edit, and repair flows; only prompt+image continues into
   the existing image mutation.
5. Add focused regressions and run scoped tests plus workspace typecheck.

## Risks and mitigations

- Duplicate charges: active-shot and idempotency dedupe, one worker attempt.
- Stale pointers: validate the referenced job and heal stale pointers.
- Cross-tenant disclosure: status/active reads require exact owner and shot
  identity.
- Process restart: BullMQ retains queued work; Redis stores readable status.
- UI false success: mutation callbacks no longer mark repair complete at submit;
  terminal poll result owns success/failure.

## Acceptance criteria

- Prompt submit returns before any LLM call completes.
- A request can run longer than Cloudflare's HTTP timeout without a 524 on the
  submit/status calls.
- A successful prompt job automatically submits exactly one image task in the
  prompt+image flow.
- Failed prompt jobs never submit an image task.
- Nine different shots can queue independently; retries for the same active
  shot join one job.
- Existing prompt/cast rules and episode persistence tests still pass.

## Rollout

No deployment is part of implementation. After focused verification, request
explicit confirmation before production deployment/restart, then smoke-test
submit, status polling, and media-history creation.
