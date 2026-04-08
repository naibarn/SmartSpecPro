# Section 08 — Notifications, Tests, and Rollout

## Overview

This section finalizes billing-side notifications, automated coverage, feature-flag rollout, and production observability.

## Files to create or modify

| File | Action |
|---|---|
| `apps/web/server/services/billing/notificationService.ts` | Billing notification dedupe/history |
| `apps/web/server/jobs/notificationJobs.ts` | Hook in billing reminders where appropriate |
| `apps/web/server/...*.test.ts` | Router/service/job coverage |
| `apps/web/client/...*.test.tsx` | UI ownership and access tests |

## Implementation details

- Persist invoice notification dispatches with dedupe keys and suppression rules.
- Reuse existing notification infrastructure where possible, but keep invoice dedupe state relational.
- Add tests across services, routers, jobs, and document access.
- Roll out with Beam feature flags disabled by default until staging verification passes.

## Tests to write first

- Duplicate webhook and reconciliation events do not duplicate sends.
- Flag-off behavior blocks new Beam billing entrypoints cleanly.
- Download access and recovery UI tests pass with tenant/ownership boundaries.
