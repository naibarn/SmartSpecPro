# Code Review: Section 06 - Team, Admin, and Workflow Integration

## Findings

No blocking integration regressions remain after the team-binding and admin-fleet pass.

## Auto-fixes applied during review

- Duplicate detection now keys external connectors by bound worker ID when present instead of only by `externalRef`.
- Team edit flows keep the historical reference string while allowing bind/unbind of registered workers.
- Auto-team pauses still emit the legacy "external connector" wording so the current workflow board rendering keeps working during rollout.

## Test coverage

- duplicate bound workers are rejected in team validation
- team router exposes bindable workers
- run-engine candidate resolution picks only bound external connectors
- Teams UI shows bound worker status when a binding exists

## Notes

- Workflow dispatch remains best-effort on pause; unresolved external connectors still work without a bound worker.
