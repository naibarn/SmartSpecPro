# Section 02: Channel Companion and Webhook Workflows

## Scope

Own the channel-facing Hermes experience for messaging and webhook-heavy work.

## Goals

- make channel presence understandable to users
- show what Hermes can do on connected channels
- preserve callback trust boundaries
- keep channel ownership upstream while SmartSpecPro owns audit and policy

## Target files and modules

- `apps/web/shared/workerDelegation.ts`
- `apps/web/server/services/workerDelegationService.ts`
- `apps/web/server/services/workerCallbackService.ts`
- `apps/web/client/src/pages/Teams.tsx`
- `apps/web/client/src/pages/AdminMonitoring.tsx`

## Implementation notes

- surface channel capability summaries as human-readable labels
- keep webhook actions routed through the existing worker callback flow
- ensure channel metadata is descriptive rather than authoritative
- avoid copying live channel tokens into SmartSpecPro canonical state
- add disconnect and reauthorization handling so stale capability metadata is cleared when access changes

## Tests

- channel metadata is shown for Hermes workers with channel capability
- callback publishing still uses the existing worker callback path
- unsupported channel capability data fails closed
- disconnected channels no longer appear as live capabilities
