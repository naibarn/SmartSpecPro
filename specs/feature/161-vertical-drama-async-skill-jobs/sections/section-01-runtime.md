# Section 01 — Typed interactive job runtime and lifecycle

## Ownership

Own the shared typed queue contract, worker lifecycle, Redis/durable status adapter, active pointers, and router-facing submit/status helpers. Do not implement domain-specific LLM prompts here.

## Files

- `apps/web/server/services/verticalDramaInteractiveJobs.ts` (new or existing equivalent)
- `apps/web/server/_core/index.ts`
- the smallest additive Drizzle migration/schema files if a durable job owner is required
- focused runtime tests under `apps/web/server/services/__tests__/`

## Contract

Define a closed job-kind union and a discriminated payload/result union. Each job is scoped to tenant, user, series, and optional draft session. Status reads must validate that scope. Submission returns `{ jobId, status: "queued", traceId }`; terminal status returns typed result or bounded error. Worker transitions must be monotonic and persist result before `succeeded`.

## Failure handling

Queue unavailable, invalid skill metadata, unauthorized ownership, and invalid model are explicit errors. They must not call the LLM or fallback to a synchronous path. Worker retries use the existing retry/stall policy and preserve the original trace/run metadata.

## Tests

Prove fast submission with a never-resolving provider boundary, lifecycle transitions, restart/resume, ownership, duplicate active pointer behavior, and no sync fallback.
