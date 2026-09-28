# Section 04 — Hyperdrive and Cloudflare Adapters
+## UI/UX Contract

### Target User / JTBD

- N/A — runtime adapters and Hyperdrive boundary only; section-06 presents readiness.

### Existing Pattern Reference

- N/A — no Admin component is changed in this section.

### Surface Inventory

- N/A — no browser route or visual surface is implemented here.

### Component Map

- N/A — Worker runtime modules and adapter tests only.

### State Matrix

- N/A — adapter states are verified by contract tests and consumed by section-06.

### Responsive Matrix

- N/A — no browser layout is changed.

### Accessibility Acceptance

- N/A — no user-facing markup is introduced.

### Copy Contract

- N/A — adapter error codes are presented by section-06.

### Browser Evidence Required

- N/A — browser evidence is owned by section-06 and final integration.

## Scope

Create the Cloudflare Worker package and implement the Hyperdrive-only
PostgreSQL boundary plus Queues, Workflows, Containers, Worker App, Cron, and
authenticated callback adapters. These adapters transport/execute work; they
do not own canonical state.

## Ownership paths

- apps/cloudflare/package.json and apps/cloudflare/wrangler.jsonc:
  Worker package scripts and environment-specific binding declarations.
- apps/cloudflare/src/env.ts:
  typed bindings and startup environment validation.
- apps/cloudflare/src/db/hyperdrive.ts:
  only Cloudflare database client factory.
- apps/cloudflare/src/adapters/queues.ts:
  at-least-once queue transport and thin consumer wrapper.
- apps/cloudflare/src/adapters/workflows.ts:
  deterministic durable steps and replay handling.
- apps/cloudflare/src/adapters/containers.ts:
  capability/resource/restart boundary.
- apps/cloudflare/src/adapters/workerApp.ts:
  registered Worker App dispatch.
- apps/cloudflare/src/adapters/cron.ts:
  scheduler-only occurrence creation.
- apps/cloudflare/src/callbacks/providerCallback.ts:
  signature/replay/reference/tenant validation.
- apps/cloudflare/src/adapters/__tests__/:
  adapter contract and failure-injection tests.

## Binding and database rules

Use separate staging and production wrangler environments. The production
Hyperdrive binding must resolve only to the new Production PostgreSQL instance.
No Cloudflare code imports apps/web/server/db.ts, Dev DATABASE_URL, BullMQ,
Celery, Redis, or provider SDKs that bypass the ports.

hyperdrive.ts creates a client per request/Workflow step, enforces pool and
timeout budgets, exposes guarded transaction helpers, classifies unavailable
database failures, and validates expected target identity without logging
credentials or connection strings. Prepared-statement behavior is explicit and
tested. A required durable write must precede Queue/Workflow acknowledgement.

## Adapter contracts

Queues receives canonical job_id, contract version, attempt/dispatch metadata,
and bounded routing metadata. It loads the job through Hyperdrive, claims a
fenced lease, calls the executor, reports through Feature 186, and acknowledges
only after durable completion/reporting. Queue retries/DLQ are transport policy;
they never increment business attempt.

Workflows use deterministic names including canonical job, attempt, and logical
step. Paid/irreversible side effects run in idempotent steps with a persisted
completion/settlement marker before acknowledgement. Replay resumes the same
step result.

Containers and Worker App are capability-routed for CPU, memory, filesystem,
and long-running workloads. Images are pinned by digest and retained for
rollback. Lifecycle/restart/timeout signals report to lease fencing.

Cron treats provider triggers as UTC and computes application schedule
timezone/version/missed-occurrence policy before creating a deterministic
schedule job intent. It never executes domain work inline.

Provider callbacks verify signature/credential, replay protection, stored
operation/reference, tenant, and contract version. They request reconciliation
and cannot mutate canonical terminal/progress state without a fenced lease.

## TDD stubs

- Production Hyperdrive target identity cannot equal Dev and cannot be missing.
- Client/pool/transaction/timeout/prepared-statement behavior is covered.
- Hyperdrive outage prevents durable Queue/Workflow acknowledgement.
- Queue duplicate/lost-ack/DLQ behavior converges on one canonical dispatch.
- Workflow replay/pause/resume preserves deterministic step and settlement key.
- Container/Worker App capability, digest, restart, heartbeat, timeout, and
  artifact-reference behavior is fenced.
- Cron UTC/timezone/DST/missed-occurrence/dedupe behavior is deterministic.
- Callback signature, replay, reference, tenant, and lease checks fail closed.

## Acceptance

Cloudflare has one target-only DB boundary through Hyperdrive, all adapters
consume the shared Feature 186 contract, and provider retries/replays cannot
create duplicate business attempts or paid side effects.
