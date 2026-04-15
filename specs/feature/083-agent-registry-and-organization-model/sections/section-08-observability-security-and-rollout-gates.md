# Section 08 - Observability Security And Rollout Gates

## Objective

Finish the feature with auditability, security checks, metrics, and rollout gates that make the registry safe to operate in production.

## Scope

- Add audit events for registry creation, version publication, promotion review, freeze, rollback, and selection.
- Add structured logging for eligibility reasons and blocked transitions.
- Add metrics for registry resolution volume, rejection reasons, promotion frequency, and evidence-driven preference usage.
- Add final rollout gates and acceptance criteria for staged tenant adoption.

## Files Likely Changed

- `apps/web/server/services/agentRegistryService.ts`
- `apps/web/server/services/agentRegistryAuditService.ts` if audit handling is split out
- `apps/web/server/services/__tests__/agentRegistryService.test.ts`
- `apps/web/server/services/__tests__/securityChecklist.test.ts` or a new security-focused registry test
- `apps/web/server/routers/__tests__/agentRegistry.test.ts`

## Implementation Notes

1. Audit every state change and every resolution decision.
2. Keep logs explainable but redacted where necessary.
3. Treat ambiguous eligibility or missing policy as a security failure, not a best-effort fallback.
4. Ensure rollout gates are tenant-scoped and reversible.
5. Make the final acceptance path easy to validate in staging before expanding rollout.
6. Treat memory redaction and retention failures as security-relevant and fail closed when the write path cannot prove safety.

## TDD Stubs

- Test that selection writes audit data with identity, version, and reason information.
- Test that promotion and rollback events are auditable and reversible.
- Test that logs and metrics do not leak sensitive payload data.
- Test that ambiguous or missing policy data produces a security failure.
- Test that staged rollout gates can be enabled for a limited tenant cohort first.

## Completion Check

This section is done when the registry is safe enough to expose gradually without losing traceability or tenant isolation.
