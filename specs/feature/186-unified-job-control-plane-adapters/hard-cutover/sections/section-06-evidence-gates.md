# Section 06 — Inventory and Evidence Gates

## Objective

Prevent the repository from claiming hard cutover while direct producers or
missing runtime evidence remain.

## Files

- `apps/web/scripts/audit-feature-186-call-sites.ts`
- `specs/feature/186-unified-job-control-plane-adapters/rollout-manifest.yaml`
- focused audit/verification tests

## Requirements

- distinguish adapter-owned calls, approved compatibility calls, and unmigrated
  side-effecting producers
- record migrated wave and active flag from one manifest
- fail verification if a wave claims complete while direct calls remain
- keep Cloudflare production proof explicitly external/not established

## Done when

The audit is machine-readable, the manifest matches it, and focused tests plus
`git diff --check` pass. Typecheck remains skipped by explicit instruction.

## Current evidence

The current hard-cutover audit reports no unowned direct BullMQ/Celery
producer, scheduler, or application result-reader calls; 47 adapter-owned
Python submission sites; 3 explicit legacy transport calls inside the
compatibility adapter; and one centralized rollback-only legacy status
adapter serving 7 rollback-only legacy-reader usages. Waves 1–5 report the
selected canonical job types on PostgreSQL-backed
execution. This is a local implementation gate, not production cutover proof:
compatibility drain, domain projection/checkpoint, live provider recovery,
deployment, PITR/restore, and Cloudflare evidence remain external gates.
