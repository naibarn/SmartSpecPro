# Spec 286 R1.7 G0.1 Implementer Pack

Status:

```text
DESIGN_COMPLETE
ARCHITECTURE_FROZEN_CANDIDATE
CONTRACT_NORMALIZED
G0.1_SOURCE_RECONCILED
PHYSICAL_MAPPING_PARTIALLY_CONFIRMED
NO_NEW_DDL_AUTHORIZED
RUNTIME_NOT_YET_CERTIFIED
```

Source basis:

```text
repository: naibarn/SmartSpecPro
branch: main
commit: 4f4e35fadd388a8950cf801cb45c64de46c645c9
audit date: 2026-10-05
```

## Read first

1. `implementation/g0-source-reconciliation.md`
2. `implementation/physical-mapping-g0.md`
3. `implementation/source-inventory.md`
4. `implementation/action-route-mapping.md`
5. `tests/traceability-matrix.md`
6. `spec.md`
7. `contracts/*`
8. `implementation/work-packages-slo.md`

`audit/93-pass-history.md` is non-normative historical rationale.

## G0.1 controlling decision

Spec 286 is **not greenfield**.

Reuse:

```text
video_projects
video_project_revisions
qaLedger
VideoProjectDocument
Brand Kit
Motion Template Registry
motionCandidates
videoProjectQualityLoop
videoProjectRepairApplier
Video Studio timeline/editor
worker_jobs
Remotion render package/executor
Library/R2
Video Editor revision system
```

Do not create a replacement for any of these.

## Mandatory local pre-implementation rule

GitHub code search was not indexed during G0.1. Before introducing any new persistent schema/API,
Codex/Orchestra MUST run local source search in the exact implementation checkout.

Absence from the G0 audited video surface is **not** proof of repository-wide absence.

## No-DDL rule

G0.1 does not authorize a new Spec 286 transactional table.

Logical contracts should first resolve to:

```text
REUSE_EXISTING
EXTEND_EXISTING
DERIVED_PROJECTION
ARTIFACT_ONLY
ADAPTER_REQUIRED
```

A new table requires a new evidence-backed owner review.

## Next implementation sequence

```text
WP0.4 fresh current-main baseline/golden capture
→ WP1.1 normalized schemas/types as adapters
→ WP1.2 production-state projection
→ WP1.3 action/event/error adapters
→ WP1.4 manifest/receipt assembler
→ WP3.1 rendered visual evidence/contact sheets
→ WP3.2 deterministic QC expansion
→ WP4 creative director/critic
→ WP5 targeted repair + partial rerender
```

Do not start with a database migration.
