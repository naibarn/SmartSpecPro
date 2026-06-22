# Agent Experience Rollback Drill

Rollback flag: `agentExperienceForceRollback`

## Detect

- Parse success below gate.
- Cross-tenant/access anomaly.
- Approval/billing/artifact integrity issue.
- Debug/private payload leak.

## Decide

- Release owner confirms rollback trigger.
- Security/backend owner must approve continued rollout after any safety event.

## Execute

1. Set `agentExperienceForceRollback=true`.
2. Confirm layer, preview, renderer bridge, debug inspector, widget, and page action behavior are disabled.
3. Keep legacy Chat, Agency Chat, and Team Room paths as defaults.

## Verify

- Flag precedence helper returns all behavior disabled.
- Legacy surfaces still render.
- Metrics confirm recovery.
