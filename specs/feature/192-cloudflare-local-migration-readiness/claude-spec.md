# Synthesized Specification — Feature 192

## Objective

Close repository-local gaps that prevent a truthful handoff for the Feature 186
Cloudflare-only job control plane. The output is `LOCAL_CONTRACT_READY`, not a
Cloudflare deployment or production cutover. The implementation must preserve
the canonical `worker_jobs.id`, PostgreSQL lifecycle truth, fencing, outbox,
settlement, idempotency, and tenant scope defined by Feature 186.

## Scope and exclusions

The implementation may change local source, tests, manifests, migration
verification, CI/dry-run checks, and runbooks. It must not provision or access a
Cloudflare account, deploy Wrangler, activate traffic, copy secrets, mutate
`.env`, run production backfills, or claim target-account/production evidence.

Cloudflare Queues, Workflows, Containers, Cron, Worker App, R2, Vectorize, and
Hyperdrive are represented by injected local contracts and independent fakes.
Google OAuth and Google Drive remain authenticated product integrations. Google
Cloud Tasks, Cloud Run, OIDC task routes, Google runtime publishers, and
provider-specific Google task handlers are retired/fail-closed runtime paths.

## Required local outcomes

1. Wave 0 produces a complete producer/consumer/status/scheduler/callback/
   poller/projection inventory with owner, classification, rollback, active
   producer, late-delivery rule, and evidence path.
2. Wave 1 proves hard-cutover startup cannot initialize retired transports or
   run untracked business timers. Google Drive cleanup can remain a product
   side effect only after its schedule uses canonical intent.
3. Wave 2 provides an injected canonical Worker handler backed by the existing
   control-plane boundary. It validates envelopes, authenticates origin
   publication, enforces dedupe/body limits, uses fresh Hyperdrive reads,
   claims with fencing, and never acknowledges without durable canonical state.
4. Wave 3 classifies every process-local scheduler and routes business work to
   canonical job intent. Provider-full work remains queued; asynchronous
   provider polling releases leases and uses durable operation identity.
5. Wave 4 closes or explicitly quarantines all remaining compatibility entries;
   one side-effecting producer is active per job type and late delivery cannot
   create work or duplicate paid effects.
6. Wave 5 reconciles Drizzle journal/schema/migrations using the official
   authority, verifies additive constraints and status compatibility, and
   provides dry-run/resume/quarantine checks without database mutation.
7. Wave 6 fixes the ESM/CommonJS test harness boundary, runs reproducible
   Python parity tests when dependencies exist, and adds failure injection for
   duplicate/lost/ambiguous/retry/replay paths.
8. Wave 7 emits a truthful local evidence handoff with numeric budgets, source
   inventory, test/build/schema identities, deployment dry-run output, and
   explicit external blockers.

## Safety invariants

- No second generic jobs table or independent status/retry/lease ledger.
- No client or transport message can select tenant, actor, billing scope,
  adapter, queue, account, or binding.
- No transaction spans external network calls, provider execution, queue
  publication, callback verification, or artifact transfer.
- A database outage, stale lease, duplicate message, callback replay, lost
  publish response, or unsupported contract is handled fail-closed and leaves
  bounded evidence.
- Local tests cannot set `targetAccountProof` or `productionProof` true.
- Local rollback cannot re-enable a retired Google runtime.
- Secrets, tokens, URLs with signatures, account IDs, and database URLs are not
  committed or emitted in logs/manifests/fixtures.

## Test and evidence contract

Use focused Vitest tests for web and Cloudflare code and pytest tests for Python.
Run package checks/builds where safe, but do not run the repository-wide
TypeScript typecheck because the project instruction identifies memory risk.
Missing Python/database prerequisites must be explicit failures, not silently
converted into readiness. The final manifest must keep activation disabled and
list target-account Hyperdrive, binding, deployment rollback, provider
recovery, Vectorize, and PITR gates as external.
