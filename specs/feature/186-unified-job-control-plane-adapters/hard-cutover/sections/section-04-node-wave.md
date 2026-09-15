# Section 04 — Low-Risk Node Producer Wave

## Objective

Move selected Node producers behind the gateway and execute the first safe
short-job wave through the PostgreSQL outbox/direct adapter.

## Scope

Wave 1 covers webhook dispatch, API-webhook delivery, and memory embedding.
Waves 3–5 additionally cover capacity assessment, channel delivery,
automation, database backup, vertical-drama, and video-intelligence bindings.
Wave 5 also covers notification and memory-maintenance system schedules.
Paid provider and domain-projection work remains gated by its own settlement,
checkpoint, and recovery evidence.

## Requirements

- one canonical creation per producer operation
- legacy queue submission occurs only from the adapter publisher
- handler receives canonical correlation and preserves domain idempotency
- manifest records owner, flag, drain, rollback, and evidence

## Current evidence

Waves 1–5 are implemented locally behind
`FEATURE_186_HARD_CUTOVER=true`. They have focused duplicate/fencing tests and
run through PostgreSQL outbox/direct or PostgreSQL-pull execution without
requiring Redis on the migrated paths. The full retirement proof is not yet
complete: the manifest remains `implemented-local-not-production-complete`
until compatibility drain, domain projection/checkpoint, provider, deployment,
PITR/restore, and Cloudflare evidence gates pass.
