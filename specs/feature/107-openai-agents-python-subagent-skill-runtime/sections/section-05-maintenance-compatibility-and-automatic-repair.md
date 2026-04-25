# Section 05: Maintenance, Compatibility, and Automatic Repair

## Goal

Teach the maintenance pipeline to detect subagent drift, judge migration readiness, and repair non-breaking contract issues safely.

## Scope

This section covers:

- subagent-aware compatibility scoring
- maintenance drift detection
- safe automatic repair of non-breaking bundle issues
- migration ranking for legacy skills
- retry and re-verification behavior after maintenance

## Files to touch

- `apps/web/server/services/skillMaintenanceAnalyzer.ts`
- `apps/web/server/services/skillUpgradeApplier.ts`

## Implementation notes

- Add signals for missing manifests, stale routing, missing checkpoint policies, and scope widening.
- Keep the existing bundle compatibility scoring, but add topology completeness and manifest integrity as first-class factors.
- Treat manifest hash mismatches, signature failures, and policy drift as first-class maintenance signals.
- Repair only non-breaking contract drift automatically.
- Require approval when the topology change widens scope, changes path boundaries, or rewrites the execution contract.
- Re-run verification after any repair before the recommendation or run is marked healthy.
- Use the same routing and lineage metadata as the runtime so maintenance can distinguish a real failure from a no-change success.

## Acceptance criteria

- The analyzer can rank skills that need subagent upgrades.
- The applier can preserve or repair subagent topology without accidentally widening permissions.
- Maintenance can differentiate between a missing file, a broken topology, and a real migration opportunity.

## Test-first guidance

- Write analyzer and applier tests before extending the UI.
- Cover drift detection, safe repair, breaking-change escalation, and post-repair verification.
