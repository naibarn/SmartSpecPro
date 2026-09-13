# Section 01 — Contracts and Canonicalization

## Goal

Create the shared runtime-neutral contract used by TypeScript services, adapters, workers, and the Python bridge. `worker_jobs.id` remains the canonical ID and the contract must not expose transport IDs as identity.

## Files

- Add `apps/web/server/services/jobControlPlaneTypes.ts` for statuses, command errors, job definitions, lease context, progress/result/error, dispatch request/reference, schedule occurrence, and operator action types.
- Add `apps/web/server/services/jobCanonicalization.ts` for bounded normalization, trusted server-owned fields, deterministic canonical form, SHA-256 definition hash, and redaction helpers.
- Add `apps/web/server/services/__tests__/jobCanonicalization.test.ts`.
- `CANONICAL_JOB_COMMANDS` is the single exported command vocabulary; adapters and monitor actions must not invent a second command enum.

## Requirements

Use authenticated tenant/actor values, normalize object-key order/optional defaults/numeric and Unicode representation, and exclude idempotency key, generated IDs, timestamps, and transport references from the definition hash. Reject oversized/deep/untrusted payloads and return stable `IDEMPOTENCY_CONFLICT` semantics. Define the target statuses and legal command names in one export; preserve legacy aliases elsewhere.

## TDD acceptance

Test equal definitions, meaningful differences, tenant separation, null keys, malformed/deep payloads, secret redaction, stable error codes, and transport reference non-authority before implementation. No database or broker is required for this section.
