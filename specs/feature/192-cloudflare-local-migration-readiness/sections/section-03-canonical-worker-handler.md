# Section 03 — Canonical Worker Handler

## Goal

Implement a local, injected Worker handler that consumes the Feature 186
envelope through the canonical PostgreSQL control-plane boundary without
requiring target-account bindings.

## Owned paths

- `apps/cloudflare/src/index.ts`, `contracts.ts`, `queueConsumer.ts`,
  `hyperdrive.ts`.
- New `apps/cloudflare/src/controlPlaneHandler.ts` and repository port if
  existing exports cannot be reused safely.
- `apps/web/server/services/cloudflareJobAdapters.ts`/origin gateway only for
  local publication compatibility.
- Cloudflare and web focused tests.

## Implementation

Define an injected repository port for authoritative job load, dispatch dedupe,
lease/fencing claim, event/settlement/projection evidence, and quarantine.
Validate contract version, canonical IDs, attempt, dedupe key, bounded routing,
tenant scope, and body size before claim. The handler must derive tenant,
actor, authorization, adapter, and billing scope from authenticated context or
the loaded job; message routing is advisory only.

Keep `/internal/jobs/publish` authenticated and activation-disabled by default.
Publication dedupe uses stable `outboxId`/`dedupeKey`; lost responses are
reconciled by the same key. Hyperdrive reads that influence status, lease,
fencing, outbox, settlement, and recovery use fresh/no-store semantics.
Transactions are short, use the Feature 186 lock/compare-and-swap policy,
retry SQLSTATE `40001`/`40P01` with the same command/event key, and contain no
network operation. Queue ack occurs only after canonical completion or durable
quarantine; PostgreSQL failure returns retry.

Keep distinct injected contract tests for Queues, Workflows, Containers, Cron,
Worker App, R2, and Vectorize. Vectorize fake tests cover tenant filters,
deterministic IDs, bounded metadata, read-before-delete, and checkpoint/rebuild
state. These are local contract evidence only.

## Tests

Test valid/invalid envelopes, auth failures, duplicate publish/delivery, stale
lease, cancellation/late delivery, lost ack, unsupported contract, body limits,
transaction retry, database outage, tenant/routing tampering, callback replay,
cross-tenant reference, redaction, settlement retry, and no external call in a
transaction.

## Acceptance

The origin outbox → authenticated Worker → native Queue seam → local handler
and PostgreSQL-pull harness converge on the same canonical job ID/attempt. No
Worker-owned ledger or target-account proof is introduced.

## Implemented

- Added the injected `CanonicalControlPlaneRepository` and
  `createCanonicalControlPlaneHandler` boundary.
- Added body, envelope, binding, publication-dedupe, terminal late-delivery,
  lease-fencing, fresh-read, bounded transaction, artifact, Vectorize, and
  recovery-harness tests.
- Queue control-plane/database outage errors now retry without poisoning the
  message; unsupported or invalid messages use durable quarantine.
