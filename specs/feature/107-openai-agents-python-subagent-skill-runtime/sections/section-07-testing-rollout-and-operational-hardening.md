# Section 07: Testing, Rollout, and Operational Hardening

## Goal

Prove the feature works end-to-end, then roll it out without breaking single-agent skills or the current maintenance workflows.

## Scope

This section covers:

- backend and frontend test coverage
- end-to-end create → load → run → inspect → maintain flow coverage
- rollout sequencing and compatibility safety
- security hardening and regression prevention

## Files to touch

- `python-backend/tests/unit/test_openai_agents_skill_runtime.py`
- `python-backend/tests/unit/test_openai_agents_skill_supervisor.py`
- `python-backend/tests/unit/test_openai_agents_subagent_contracts.py`
- `python-backend/tests/integration/test_openai_agents_subagent_runtime_e2e.py`
- `python-backend/tests/security/test_openai_agents_subagent_security.py`
- `apps/web/server/services/__tests__/skillCompatibilityGate*.test.ts`
- `apps/web/server/services/__tests__/skillMaintenanceAnalyzer*.test.ts`
- `apps/web/server/services/__tests__/skillUpgradeApplier*.test.ts`
- `apps/web/client/src/pages/__tests__/AdminSkills*.test.tsx`
- `apps/web/client/src/pages/__tests__/AdminLegacyUpgradeRunDetail*.test.tsx`
- `apps/web/client/src/pages/__tests__/Dashboard*.test.tsx`

## Implementation notes

- Keep single-agent bundles working throughout the rollout.
- Enable validation and discovery before enabling generation of subagent-aware bundles.
- Enable runtime loading before making maintenance repairs automatic.
- Add integration coverage for the full lifecycle and for interrupted/resumed runs.
- Add security tests for path integrity, manifest mismatch rejection, manifest hash or signature verification, security-policy enforcement, and secret redaction in runtime state.
- Add migration tests that prove additive lineage/schema changes do not break existing single-agent checkpoints or resume paths.
- Keep the rollout backward compatible so old bundles continue to run with the existing runtime path.

## Acceptance criteria

- The create → load → run → inspect → maintain loop is covered by tests.
- Legacy single-agent bundles continue to work unchanged.
- Security and resume behavior are verified by tests before the feature is marked complete.

## Implementation notes

- Added integration coverage for interrupted and resumed native skill runs, including persisted lineage rehydration.
- Added security coverage for path spoofing, shell escape hatches, and secret redaction in persisted runtime state.
- Added bundle integrity validation for subagent-aware bundles by hashing `subagents.json` into `skill.lock.json` and rejecting drift.

## Test-first guidance

- Expand test coverage before broadening the rollout.
- Treat the integration tests as the final gate before the feature is considered production-ready.
