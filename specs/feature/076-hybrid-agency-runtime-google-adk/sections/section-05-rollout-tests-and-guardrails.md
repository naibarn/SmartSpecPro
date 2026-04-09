# Section 05: Rollout, Tests, and Guardrails

## Purpose

Ship the hybrid runtime safely with explicit feature flags, legacy golden coverage, and negative-path checks that protect both the agency system and the existing generic workflow runtime.

## Ownership

- rollout gating
- regression testing
- legacy golden suite
- security guardrails
- billing/artifact regression checks
- generic workflow protection checks

## Target files

- `apps/web/shared/featureFlags.ts`
- `apps/web/client/src/components/admin/tenantFeatureFlagGroups.ts`
- agency router/UI tests
- Python agency runtime tests
- `python-backend/tests/test_langgraph_runtime.py` and adjacent generic workflow regressions

## Implementation notes

1. Add feature flag `agencyHybridAdk` and default it to `false`.

2. Require the flag for:
   - ADK engine selection
   - hybrid compile preview
   - migration/upgrade actions
   - hybrid run execution

3. Add an operational kill switch that disables ADK compile/save/run paths even for flagged tenants during incident response.

4. Build a legacy agency golden suite covering:
   - compile signature
   - communication order
   - output shape
   - trace shape

5. Add negative tests for:
   - cross-engine edge without boundary
   - unsupported node/engine pair
   - ADK selection without feature flag
   - invalid human approval ownership across a boundary
   - retry/resume double-charge attempts
   - duplicate artifact publication callbacks

6. Add explicit generic workflow protection checks so this feature does not drift into the LangGraph workflow stack.

7. Add security guardrail tests for:
   - SSRF/egress policy enforcement on tool-backed hybrid flows
   - trace scrubbing of secrets and large tool outputs
   - signed-upload enforcement for publishable runtime artifacts

## TDD expectations

- Do not finish the feature on happy-path tests alone.
- At least one golden legacy fixture and one generic-workflow non-regression check should fail before implementation and pass after.

## Acceptance checks

- ADK is disabled by default.
- Legacy agencies still pass golden tests.
- Generic workflow compile/execute behavior remains unchanged.
- Hybrid agency failures are explained before runtime where possible.
- Billing remains idempotent and artifacts remain governed by SmartSpecPro-owned publication paths.

## Coordination notes

- The safest release order is internal-only compile path, then internal runtime, then design-partner opt-in.

## Implementation status

- Completed.
- Added `agencyHybridAdk` plus `agencyHybridAdkKillSwitch` on both runtimes, blocking checks for hybrid compile/save/run paths, compile/runtime trace guardrails, and targeted regression coverage for the touched web/python surfaces.
- Verification:
  - `npm --prefix apps/web test -- --run server/services/__tests__/agencyHybridCompile.test.ts server/services/__tests__/agencyBridge.test.ts server/services/__tests__/agencyTraces.test.ts server/routers/__tests__/agency.test.ts client/src/components/agency/__tests__/AgencyBuilder.test.tsx client/src/components/admin/tenantFeatureFlagGroups.test.ts shared/__tests__/agencyHybridFeatureFlag.test.ts`
  - `DEBUG=false uv run pytest --no-cov tests/unit/test_agency_hybrid_runtime.py tests/unit/test_agency_router.py tests/unit/test_agency_service.py`
  - `npm --prefix apps/web run typecheck`
