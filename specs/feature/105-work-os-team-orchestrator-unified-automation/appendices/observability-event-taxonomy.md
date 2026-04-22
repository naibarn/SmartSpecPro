# Appendix - Observability Event Taxonomy

## Purpose

Give Work OS, Team ledger, monitoring, and UI a shared vocabulary for diagnosing preflight planning, launch, runtime dispatch, and learning-loop behavior.

## Required correlation fields

Every Feature 105 event should include the fields that are available at that point:

- `tenantId`
- `actorUserId`
- `requestId`
- `caseId`
- `preflightBundleId`
- `preflightRevisionHash`
- `automationRunId`
- `teamId`
- `roomId`
- `teamRunId`
- `workItemId`
- `planStepId`
- `surface`
- `capabilityId`
- `correlationId`
- `idempotencyKey`

Requester-visible telemetry must never include raw secrets, connector credentials, private-vault internals, or admin-only permission diagnostics.

## Event envelope

Every event should use a consistent envelope:

- `eventName`
- `eventVersion`
- `occurredAt`
- `severity: debug | info | warning | error`
- `primaryReasonCode`
- `actorClass: requester | admin | domain_admin | service | worker`
- `redactionMode: requester_safe | admin_diagnostic | internal`
- correlation fields available at emit time
- event-family-specific payload

`primaryReasonCode` must use the same stable code family as the service that made the decision. UI and tests should assert reason codes, not freeform prose.

## Event names

### Intake and context

- `work_intake.source.linked`
- `work_intake.source.omitted`
- `work_intake.source.access_denied`
- `work_intake.brief.compiled`
- `work_intake.brief.redacted`

### Preflight

- `preflight.preview.generated`
- `preflight.preview.redacted`
- `preflight.preview.failed`
- `preflight.approved`
- `preflight.cancelled`
- `preflight.superseded`
- `preflight.stale_detected`
- `preflight.source_drift_detected`
- `preflight.persistence_decision_recorded`

### Launch

- `launch.requested`
- `launch.blocked_missing_team`
- `launch.blocked_stale_preview`
- `launch.blocked_source_drift`
- `launch.blocked_surface_authority`
- `launch.blocked_contract_compatibility`
- `launch.created`
- `launch.failed`

### Runtime

- `runtime.plan.loaded`
- `runtime.dispatch.requested`
- `runtime.dispatch.started`
- `runtime.dispatch.succeeded`
- `runtime.dispatch.failed`
- `runtime.dispatch.blocked_authority`
- `runtime.dispatch.blocked_contract`
- `runtime.dispatch.blocked_budget`
- `runtime.dispatch.dead_lettered`
- `runtime.budget.exceeded`
- `runtime.step.cancel_requested`
- `team.plan_actual_drift_detected`

### Learning

- `learning.proposal.generated`
- `learning.proposal.deduped`
- `learning.proposal.accepted`
- `learning.proposal.rejected`
- `learning.proposal.applied`
- `learning.proposal.expired`

### UI and rollout

- `ui.preflight_panel.rendered`
- `ui.preflight_panel.regenerate_clicked`
- `ui.preflight_panel.launch_clicked`
- `ui.preflight_panel.launch_disabled`
- `rollout.flag.evaluated`
- `rollout.gate.blocked`
- `rollout.gate.enabled`

## Minimum payload by event family

| Family | Minimum payload |
|---|---|
| Intake | source type, source id, inclusion state, trust, freshness, redaction state |
| Preflight | bundle id, state, revision hash, selected source count, preview view, redaction mode |
| Launch | bundle id, team resolution code, run id if created, primary block reason |
| Runtime | plan step id, selected surface, actual surface, budget state, dispatch outcome |
| Learning | proposal id, proposal type, confidence, evidence refs count, governance action |
| UI | panel state, enabled/disabled launch state, visible primary reason code, locale |
| Rollout | flag name, gate name, evaluated value, actor class, surface when relevant |

## Event ownership

- Section 01 owns intake/source events.
- Section 03 owns preflight and launch lifecycle events until Team kickoff is accepted.
- Section 04 owns runtime dispatch, dead-letter, cancellation, and plan-vs-actual events.
- Section 05 owns learning proposal events.
- Section 06 owns stable reason-code definitions and redaction requirements.
- Section 07 owns UI and rollout events plus display of requester-safe diagnostics.

## Redaction rules

- Requester-safe events expose stable reason codes and user-safe summaries only.
- Admin diagnostic events may include policy ids, feature flag names, and permission decision summaries.
- No event may include raw prompt context, connector credentials, private-vault secret text, or unredacted source excerpts.
- Events that include excerpts must reference redacted excerpt ids or hashes rather than storing source text inline.

## Required tests

- Every block path emits exactly one primary reason code.
- Requester-safe telemetry omits admin-only fields.
- Runtime plan-vs-actual drift events include planned and actual surface ids.
- Budget events include the exceeded cap name and current value.
- Learning proposal events include dedupe key and confidence.
- UI launch-disabled telemetry includes a requester-safe primary reason code and locale.
