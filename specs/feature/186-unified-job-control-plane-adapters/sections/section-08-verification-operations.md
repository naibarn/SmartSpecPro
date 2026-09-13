# Section 08 — Verification and Operations

## Goal

Prove cross-section behavior and leave an operationally safe migration path.

## Files

- Add/update `rollout-manifest.yaml`, `runbook.md`, and verification scripts under the Feature 186 directory.
- Add cross-section/failure-injection tests in web and Python test locations.
- Update section documentation with actual paths and test evidence after implementation.

## Requirements

Run focused tests, schema/type checks, `npm --workspace @smartspec/web run verify:feature-186`, migration dry-run, fake BullMQ/Celery/Queues/Workflows/Containers/Worker App contract tests, and static direct-call-site inventory. Document backup, expand migration, dry-run, batched backfill, quarantine, canary, producer ownership switch, drain, rollback, reconciler SLO, per-class admission/event-rate budgets, tenant-transfer preview/approval/resume/cancel evidence, Hyperdrive binding/origin/TLS, fresh-read/cache, pool-capacity, outage/no-ack, account/plan capability checks, and deployment evidence gates. Do not claim production Cloudflare proof from mocks or health checks.

## TDD acceptance

Verify duplicate delivery has no duplicate paid side effect, lost publish response converges, stale workers are fenced, Python and TypeScript contracts agree, migration is rerunnable, all direct producers are listed, and final spec-to-code review runs at least ten rounds with immediate fixes.
