# Section 03 — Capability Discovery and Resolution

## Source coverage

Feature 196 sections 17–44, 62–111, 117–123, 242–247, 255–260 and 273–280.

## Deliverable

Reuse the existing capability catalog and provider registries to resolve availability, entitlement, cost, quality, data locality, topology, Runner snapshot and user-owned tool policy. Claims are not authorization.

## Files

- Modify: `apps/web/server/services/orchestratorCapabilityCatalogService.ts` and related resolver/registry modules
- Test: capability filtering/ranking/ACL tests

## TDD steps

Test retired-surface exclusion, tenant ACL, stale snapshot, cost/quality/topology ranking, tool binding modes and external-tool dual roles; implement; rerun.

## Completion gate

All resolved capabilities are attenuated by policy and can be handed to Planner without direct provider access.

