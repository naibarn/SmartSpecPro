# Section 05: Visibility, Observability, and Rollout

## Scope

Own the user-facing progress, monitoring, and rollout surfaces for the Hermes expansion.

## Goals

- show plain-language progress and status
- make Hermes easier to understand for non-technical users
- keep operator detail visible in admin views
- allow the feature to roll out in independent slices

## Target files and modules

- `apps/web/client/src/pages/AdminMonitoring.tsx`
- `apps/web/client/src/pages/Teams.tsx`
- `apps/web/shared/featureFlags.ts`
- `apps/web/server/services/workerRegistryService.ts`

## Implementation notes

- use concise summaries for active persona, channel state, memory sync, and work mode
- keep technical detail available behind admin surfaces
- gate each capability independently when possible
- default memory sync and channel expansion off until revocation and reauthorization handling is complete
- preserve the base Hermes runtime even if one enhancement is disabled

## Tests

- progress summaries are human-readable
- feature gates can enable or disable each slice independently
- admin surfaces still show runtime and policy detail
