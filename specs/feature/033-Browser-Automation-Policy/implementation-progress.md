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
  commit: pending
  test_command: `npm --prefix apps/web test -- server/services/__tests__/browserActionRateLimit.test.ts server/services/__tests__/browserDataHandlingPolicy.test.ts server/services/__tests__/browserIframeTrustPolicy.test.ts server/services/__tests__/browserPolicyEngine.test.ts` and `UV_CACHE_DIR=/tmp/uv-cache DEBUG=false uv run --project python-backend pytest python-backend/tests/test_browser_policy_transfer_controls.py python-backend/tests/test_browser_policy_iframe_controls.py`
  pass_fail: partial-pass
  notable_deviations: deterministic helper-layer trust and threshold controls landed first, but live executor wiring and Redis-backed counters remain blocked on the missing section-04 execution seam
  blocked_summary: `sec04-copilot-live-hook`, `sec04-python-transition-hooks`, `sec05-live-transfer-enforcement`, `sec05-redis-action-counters`
