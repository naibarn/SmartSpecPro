# Section 04 - Approvals, Exceptions, Outcomes, And SLA State

## Goal

Make approvals, exceptions, outcomes, and SLA explicit work-state objects so business risk is visible on the work item itself.

## Scope

- Bind approvals to the exact work item that requested review.
- Thread Work OS identifiers through the existing approval request path so the approval record remains work-scoped even if the transport stays proxy-based.
- Create `work_exception` records when SLA risk, policy block, approval timeout, retry exhaustion, or owner unavailability occurs.
- Add explicit `work_outcome` records for completion.
- Persist SLA state explicitly instead of reconstructing it from logs.

## Implementation Notes

- Keep approval and exception transitions machine-readable.
- Ensure every state change is auditable with actor attribution.
- Preserve existing approval transport behavior where needed, but attach Work OS linkage so the proxy path cannot drift from the canonical work record.
- This section should only define the Work OS state model and service behavior, not the UI shell.

## Likely Files

- `apps/web/server/routers/approvals.ts`
- `apps/web/server/routers/monitoring.ts`
- `apps/web/server/services/workOsService.ts` or equivalent
- `apps/web/server/services/monitoringService.ts`
- `apps/web/server/routers/__tests__/approvals.test.ts`
- `apps/web/server/services/__tests__/workOsService.test.ts`

## Tests First

- Assert approval requests are bound to the exact work item that triggered them.
- Assert SLA risk, approval timeout, policy block, retry exhaustion, and owner-unavailable conditions create visible exceptions.
- Assert exception actions support reassignment, reroute, pause, and downgrade.
- Assert completion writes an explicit outcome record with business result fields.

## Acceptance Notes

- Users can inspect the business risk state directly from the work item.
- No state needs to be reconstructed from raw logs to understand what happened.

## Implemented Files

- `apps/web/server/routers/approvals.ts`
- `apps/web/server/routers/__tests__/approvals.test.ts`
- `apps/web/server/services/workOsService.ts`

## Deviation

- Approval transport still proxies to the Python backend, but now threads Work OS linkage through the server boundary and records a local approval projection when linkage is supplied.
