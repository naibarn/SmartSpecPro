# Research Notes

## Codebase Areas Reviewed

- Work Request UI: `apps/web/client/src/pages/WorkRequest.tsx`, `MyRequests.tsx`
- Work OS router/service: `apps/web/server/routers/workOs.ts`, `workOsService.ts`
- Team room/run lifecycle: `roomService`, `teamService`, `runEngine.ts`
- Runtime policy and budget: `workOrchestratorSecurityPolicy.ts`, `autoTeamBudgetService.ts`, `runEngine.ts`
- Capability routing: `teamRunSkillExecutor.ts`, `orchestratorCapabilityCatalogService.ts`, `skillRegistry.ts`
- Media/video flow: `autoTeamMediaExecutionService.ts`, `autoTeamMediaCompletionService.ts`, `mediaJobs.ts`
- Recovery/safety: `autoTeamRecoveryService.ts`, `autoTeamSafetyService.ts`, `managedMediaAccessService.ts`
- Schema/migrations: `schema.ts`, `0165_work_request_idempotency.sql`, `0166_work_automation_active_run_guard.sql`
- Tests: WorkRequest, MyRequests, workOs router/service, runEngine, runtimeDispatchPolicy, teamRunSkillExecutor, media completion/execution, managed media access, recovery.

## Findings Already Addressed In Code

- Work Request flow was too complex; UI has been simplified toward a type-review-start model.
- Work creation needed idempotency to avoid duplicate requests on retry.
- Team assignment needed explicit validation and auto-team support.
- Existing automation pointers could look launched even when the Team room/run was missing.
- Stale kickoff detection needed a grace period and recovery path.
- Budget caps could block because reservations were too coarse or repeated.
- Runtime dispatch policies needed plan-step-level reservations and missing-policy diagnostics.
- Media/video tasks needed async wait/retry semantics instead of human-like approval pauses.
- Final media URLs needed user-bound managed access tokens.
- Admin token bypass for managed media was removed.
- Duplicate active automation runs needed a database guard and audit trail.

## Remaining Stabilization Risks

1. Full repository test suite may expose unrelated failures because the working tree is very large and dirty.
2. Some verification is still mocked unit/integration coverage, not browser E2E against real media providers.
3. The fully-auto privileged-surface override must remain narrow: explicit `requiresApproval` must always win.
4. Manual E2E with real video providers may still fail due to provider capacity, credentials, or environment configuration.
5. Large diff size increases review risk; final delivery must include clear grouped summary and test evidence.

## Security Boundary Checklist

- Tenant-scoped reads/writes only.
- User-bound media token subject match only.
- No public skill publish as automated fallback.
- Approval gates remain for explicit human approval and unsupported irreversible actions.
- Media URLs are validated before persistence/exposure.
- Retry/capacity loops have limits.
- Budget reservation is idempotent per step/attempt.
