# CanvasEditor v2 Rollback Drill Runbook

## Purpose
Practice rollback for CanvasEditor v2 rollout before tenant ramp progression.

## Roles
| Role | Owner | Responsibilities |
|---|---|---|
| Detect | `@backend-oncall` | Detect threshold breach, open incident, capture triggering metrics |
| Decide | `@release-lead` | Declare rollback decision and scope (global vs export-write only) |
| Execute | `@sre-oncall` | Apply flag rollback, verify propagation, monitor stabilization |
| Verify | `@frontend-oncall` | Verify editor fallback behavior and user-facing recovery paths |

## Drill Preconditions
- Latest `release-gate-checklist.md` completed through dashboard readiness.
- On-call routing tested for conflict/export/degradation alerts.
- Backup metadata for `presentation_decks`, `presentation_slides`, `presentation_asset_links` captured.

## Trigger Conditions
- Conflict rate sustained above `5%` for 15 minutes.
- Export failure rate above `4%` for 10 minutes.
- Degradation warning rate above `25%` for 15 minutes.
- Queue latency p95 above `120s` for 10 minutes.

## Execution Steps
1. Detect
- Record timestamp, stage, tenant scope, and breached threshold.
- Save metric snapshots and active alert IDs.

2. Decide
- Choose rollback scope:
- `global_editor_disable`: set `PRESENTATION_EDITOR_ENABLED=false`.
- `export_write_disable`: set `PRESENTATION_EXPORTS_ENABLED=false`.
- Record decision owner and rationale.

3. Execute
- Apply selected flag change.
- Confirm new requests follow fallback behavior.
- Keep incident channel open until metrics stabilize.

4. Verify
- Validate deck readability and route continuity.
- Validate save/export behavior matches rollback scope.
- Confirm alert recovery and no new tenant-isolation errors.

## Verification Checklist
- [ ] Flags updated and propagated.
- [ ] `presentation_export_failed` trend recovers or flattens.
- [ ] `presentation.conflict.total` no longer breaching threshold.
- [ ] Document Management fallback route accessible.
- [ ] Incident timeline and owner handoff logged.

## Drill Evidence
- Drill date: `________________`
- Stage at drill time: `________________`
- Detect owner + proof link: `________________`
- Decide owner + decision log link: `________________`
- Execute owner + command log link: `________________`
- Verify owner + smoke-check evidence: `________________`
- Follow-up actions: `________________`
