# Implementation Progress

## 2026-03-10

- section: section-01-policy-storage-and-entitlements
  commit: `5159b82`
  test_command: `npm --prefix apps/web test -- drizzle/__tests__/browserPolicySchema.test.ts server/__tests__/browserWorkflowEntitlement.test.ts` and `UV_CACHE_DIR=/tmp/uv-cache DEBUG=false uv run --project python-backend pytest python-backend/tests/test_browser_policy_config_contract.py`
  pass_fail: pass
  notable_deviations: shared browser-policy constants and entitlement schema were introduced early so both stacks can validate the same fixture and TTL bounds
  blocked_summary: none

- section: section-02-policy-engine-contract-and-classification
  commit: `67050ff`
  test_command: `npm --prefix apps/web test -- server/services/__tests__/browserActionClassifier.test.ts server/services/__tests__/browserPageSensitivityScorer.test.ts server/services/__tests__/browserPolicyEngine.test.ts server/__tests__/browserPolicyContract.test.ts` and `UV_CACHE_DIR=/tmp/uv-cache DEBUG=false uv run --project python-backend pytest python-backend/tests/test_browser_policy_contract.py`
  pass_fail: pass
  notable_deviations: execution-surface hooks are not yet wired; the classifier and policy engine landed first as pure services with contract fixtures
  blocked_summary: none

- section: section-03-approval-binding-and-python-contract
  commit: `0d758f2`
  test_command: `npm --prefix apps/web test -- server/services/__tests__/browserApprovalPayload.test.ts server/routers/__tests__/browserPolicyApprovals.test.ts` and `UV_CACHE_DIR=/tmp/uv-cache DEBUG=false uv run --project python-backend pytest python-backend/tests/test_browser_policy_approval.py python-backend/tests/test_browser_policy_approval_resume.py`
  pass_fail: pass
  notable_deviations: approval model and helper primitives landed without endpoint-level browser approval plumbing yet
  blocked_summary: none

- section: section-04-execution-surface-enforcement
  commit: `3604daa`
  test_command: `npm --prefix apps/web test -- server/__tests__/browserToolLaunchGuard.test.ts server/__tests__/browserToolDomainValidation.test.ts`
  pass_fail: partial-pass
  notable_deviations: only the raw-browser launch guard landed; Automation Copilot live-dispatch enforcement remains blocked on a cross-stack execution seam
  blocked_summary: `sec04-copilot-live-hook`, `sec04-python-transition-hooks`

- section: section-05-data-handling-and-trust-controls
  commit: `5614788`
  test_command: `npm --prefix apps/web test -- server/services/__tests__/browserActionRateLimit.test.ts server/services/__tests__/browserDataHandlingPolicy.test.ts server/services/__tests__/browserIframeTrustPolicy.test.ts server/services/__tests__/browserPolicyEngine.test.ts` and `UV_CACHE_DIR=/tmp/uv-cache DEBUG=false uv run --project python-backend pytest python-backend/tests/test_browser_policy_transfer_controls.py python-backend/tests/test_browser_policy_iframe_controls.py`
  pass_fail: partial-pass
  notable_deviations: deterministic helper-layer trust and threshold controls landed first, but live executor wiring and Redis-backed counters remain blocked on the missing section-04 execution seam
  blocked_summary: `sec04-copilot-live-hook`, `sec04-python-transition-hooks`, `sec05-live-transfer-enforcement`, `sec05-redis-action-counters`

- section: section-06-audit-observability-and-incident-controls
  commit: `ddbc701`
  test_command: `npm --prefix apps/web test -- server/__tests__/browserPolicyAuditLogger.test.ts server/services/__tests__/browserPolicyMetrics.test.ts server/services/__tests__/browserIncidentControls.test.ts` and `UV_CACHE_DIR=/tmp/uv-cache DEBUG=false uv run --project python-backend pytest python-backend/tests/test_browser_policy_audit_contract.py python-backend/tests/test_browser_policy_revocation.py`
  pass_fail: partial-pass
  notable_deviations: audit, metrics, and incident-control behavior landed as deterministic helper layers, but live JSONL/DB persistence and runtime wiring remain blocked on the missing decision path and storage DDL
  blocked_summary: `sec06-live-audit-persistence`, `sec06-live-incident-plumbing`

- section: section-07-rollout-migrations-and-release-gates
  commit: pending
  test_command: `npm --prefix apps/web test -- drizzle/browserPolicyMigrations.test.ts server/__tests__/browserPolicyRolloutGates.test.ts server/__tests__/browserPolicyReleaseReadiness.test.ts` and `UV_CACHE_DIR=/tmp/uv-cache DEBUG=false uv run --project python-backend pytest python-backend/tests/integration/test_browser_policy_rollout.py python-backend/tests/integration/test_browser_policy_rollback.py`
  pass_fail: partial-pass
  notable_deviations: executable rollout and rollback helpers landed first, but raw SQL partition DDL and deployment-time gate invocation remain follow-up operational work
  blocked_summary: `sec07-raw-sql-partition-migration`, `sec07-release-gate-integration`
