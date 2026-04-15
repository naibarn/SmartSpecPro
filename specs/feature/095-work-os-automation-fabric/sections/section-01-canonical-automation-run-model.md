# Section 01 - Canonical Automation Run Model

## Goal

Create the canonical automation-run model that anchors every automation case to Work OS and makes the run lifecycle explicit enough to support manual assist, semi-auto, and fully auto execution.

## What this section must deliver

- A persisted automation-run envelope tied to Work OS case identity.
- Ordered step records with input references, output references, retry count, status, risk tier, and surface attribution.
- Explicit checkpoint records with resume cursor, approval state, and edit snapshot references.
- Mode-change events recorded in the run history.
- Timeline projection hooks so Work OS can show automation evidence alongside existing work evidence.

## Files likely to change

- Work OS storage/schema layer
- Work OS service layer
- Work OS timeline projection logic
- Work OS router contracts and tests
- New schema/service tests for the automation-run model

## Implementation notes

- Reuse Work OS as the parent identity; do not create a parallel job ledger.
- Keep the run model additive to the current Work OS substrate.
- Treat step and checkpoint records as queryable state, not as one opaque JSON blob.
- Make the model tenant-scoped from the start.

## Expected behavior

- A case can report its current mode, current step, checkpoint state, and final disposition.
- The same run can contain sequential, retried, and resumed steps without losing history.
- Mode transitions are visible as distinct audit events.

## Test expectations

- Schema tests for the new run, step, checkpoint, and mode-change records.
- Service tests for creating runs, recording step progress, and projecting timeline entries.
- Tenant isolation tests for all reads and writes.

## Risks to watch

- Collapsing run history into one mutable payload.
- Losing the linkage between run records and Work OS case identity.
- Making the model too generic to query efficiently.

## Implementation Result

This section was implemented with an additive Work OS automation fabric:

- The `work_cases` row now carries denormalized automation snapshot fields for current mode, current step, checkpoint, and final disposition.
- New canonical tables were added for `work_automation_runs`, `work_automation_run_steps`, `work_automation_run_checkpoints`, and `work_automation_run_events`.
- `workAutomationFabricService.ts` now owns run creation, step progress, checkpoint recording, mode changes, projection reads, and timeline evidence assembly.
- `workOsService.ts` now projects automation state alongside the existing Work OS case timeline.
- `workOsRouter` exposes automation-run contracts for create, update, checkpoint, mode-change, and read operations.
- Migration `0150_work_os_automation_fabric.sql` and its journal entry were added so the schema is deployable, not only type-safe.
- Schema, router, service, and migration tests were added to keep the model tenant-scoped and queryable.
