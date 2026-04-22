# Self Review Round 10 - Persistence And Security Implementation Gates

## Scope

Promoted two optional implementation suggestions into explicit planning requirements:

- approved-plan JSON metadata vs dedicated migration decision
- `workOrchestratorSecurityPolicy` decomposition to avoid monolithic shared security edits

## Findings

### 1. Approved-plan persistence could become opaque

The prior plan allowed JSON metadata in Phase 1 and mentioned later normalization, but it did not define the exact gate for deciding when JSON stops being acceptable.

Auto-fix:

- Added a persistence decision gate to `spec.md`, `claude-spec.md`, `claude-plan.md`, `section-03`, `claude-plan-tdd.md`, `appendices/contracts-and-migration.md`, and `decision-log.md`.
- Added criteria for keeping JSON-only vs requiring dedicated migrations.
- Added minimum normalized records if migration is triggered.

### 2. Shared security policy could create merge conflicts

The prior plan named `workOrchestratorSecurityPolicy` as a shared component but did not split ownership for surface governance, drift, budget, redaction, compatibility, and team launch gates.

Auto-fix:

- Added a Security Policy Decomposition section to `claude-plan.md`.
- Added helper ownership to `section-06`.
- Added helper-boundary tests to `claude-plan-tdd.md`.
- Added decision-log entry requiring ownership agreement before parallel implementation.

## Scorecard

| Category | Result |
|---|---|
| Structural integrity | Pass |
| Completeness vs spec | Pass |
| Implementability | Pass |
| Internal consistency | Pass |
| Edge cases | Pass |

## Remaining Suggestions

- When `/deep-implement` starts, implement the persistence decision helper as a small pure service first so UI/runtime sections can depend on one answer.
- Keep reason-code enums in shared contracts if the same codes must appear in API responses and UI copy.
