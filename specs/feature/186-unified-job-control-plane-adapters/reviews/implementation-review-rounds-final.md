# Feature 186 implementation review — final ten-round run

Date: 2026-09-13
Scope: implemented Feature 186 control-plane foundation compared with the
current `spec.md` and implementation plan. Each round was run sequentially;
confirmed defects were corrected before the next round.

## Round 01 — plan/spec and section completeness

- Checked the eight-section manifest and the actual implementation paths.
- Corrected plan/section paths for the canonical monitor, reconciler entry
  point, scripts, Python task wrapper, and compatibility monitor.
- Recorded the tenant-transfer boundary as a separate disabled rollout gate;
  no transfer endpoint is exposed without its handler/schema/authz wave.

## Round 02 — canonical identity and command vocabulary

- Verified `worker_jobs.id` is generated before publication and all adapters
  carry it as the only business identity.
- Added `CANONICAL_JOB_COMMANDS` so status/command vocabulary has one source.
- Verified transport references remain subordinate dispatch metadata.

## Round 03 — definition hash and idempotent create

- Verified deterministic key ordering, NFC normalization, numeric handling,
  bounded payloads, tenant-scoped idempotency, and conflict behavior.
- Focused canonicalization and create-race tests passed; no further code gap.

## Round 04 — lifecycle state machine and terminal fencing

- Verified guarded create, claim, start, retry, external wait, completion,
  failure, cancellation, expiry, and operator actions.
- Confirmed illegal terminal actions do not append misleading success events.

## Round 05 — lease context completeness

- Found reporter methods checked token/fencing but did not explicitly bind the
  supplied `attemptId` to the current attempt row.
- Added attempt ID and lease-generation checks to heartbeat, progress, start,
  complete, fail, assert-active, and the shared guarded update path.
- Added a regression test proving a wrong attempt ID cannot mutate the job.

## Round 06 — cancellation and outbox race

- Found unpublished outbox work had no durable cancellation marker and the
  legacy user cancel path could bypass canonical events for migrated rows.
- Added `cancelledAt`, additive migration 0306, publisher exclusion, scoped
  canonical user cancellation, and cancellation of unpublished intents in the
  same control-plane transaction.
- Published dispatch references remain retained; late delivery is fenced.

## Round 07 — executor/reporter adapter boundary

- Found the plan named executor/reporter ports but no concrete shared wrappers.
- Added `jobExecutor.ts` and `jobReporter.ts`; the executor reports unknown or
  retryable failures through the canonical reporter before rethrowing.
- Added a forwarding test proving every operation receives the full lease.

## Round 08 — scheduler, reconciler, and publication enablement

- Verified scheduler occurrence hashing/deduplication and bounded reconciler
  behavior.
- Confirmed startup does not invent an adapter: outbox publication remains
  disabled until a real adapter map/resolver is registered, and this is now an
  explicit runbook/section gate rather than an undocumented assumption.

## Round 09 — monitor, authorization, and Python parity

- Found timestamp-only admin pagination could skip/tie rows. Added an HMAC-
  signed `(createdAt,id)` cursor with tamper/format rejection while preserving
  the legacy `before` input. Production must set
  `FEATURE_186_MONITOR_CURSOR_SECRET` as a deployment secret.
- Python client now maps HTTP/domain failures to stable
  `JobControlPlaneError.code`; added the compatibility task import path.
- Verified internal token route, server-owned context, redaction, and scoped
  cancellation behavior.

## Round 10 — migration, tests, and rollout truth

- Added migration verifier coverage for outbox cancellation and rerunnable
  journal entry 0306.
- Passed 9 focused web test files / 40 tests, Python control-plane tests (3),
  Python compilation, section completeness (8/8), additive migration verifier,
  and `git diff --check`.
- Repository-wide TypeScript typecheck still reports unrelated pre-existing
  errors outside the changed control-plane paths; this is recorded as a
  baseline limitation, not hidden as Feature 186 proof.
- Direct transport audit remains 52 legacy call sites with no migrated wave;
  this is intentional under incremental rollout and remains a deployment gate.
- Cloudflare production/account proof and the tenant-transfer runtime wave are
  not claimed by local tests.

## Result

Ten review rounds completed. All concrete gaps found in the implemented
control-plane slice were corrected immediately. Remaining items are explicit
rollout/external gates: adapter registration and queue-family migration,
tenant-transfer handler/schema/authz implementation, production database
rehearsal, and Cloudflare deployment evidence.
