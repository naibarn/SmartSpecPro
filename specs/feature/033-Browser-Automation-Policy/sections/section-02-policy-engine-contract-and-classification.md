# Section 02: Policy Engine Contract and Classification

## Overview

This section defines the shared Node-owned policy engine that every production browser action must call before execution. It also fixes the decision enum, cross-stack policy envelope, deterministic classifiers, and fail-closed fallback behavior so later sections can integrate enforcement without reopening policy semantics.

**Corresponds to**: Plan sections "Target architecture" and "Shared policy evaluation flow".

**Dependencies**: Section 01.

**Blocks**: Approval binding, execution-surface enforcement, trust controls, audit, and rollout logic.

---

## Tests

### Web / unit tests

**Files**:
- `apps/web/server/services/__tests__/browserPolicyEngine.test.ts`
- `apps/web/server/services/__tests__/browserActionClassifier.test.ts`
- `apps/web/server/services/__tests__/browserPageSensitivityScorer.test.ts`

```typescript
// Test: browser policy engine returns only browser-policy decision enum values
// Test: action classifier maps actions to read, draft, commit, restricted deterministically
// Test: unknown context downgrades non-read actions to read-only, approval, or deny
// Test: low-confidence non-read actions fail closed according to configured thresholds
// Test: workflow capability missing returns deny with governance reason code
// Test: restricted data + sensitive transfer returns deny even when allowlist/domain checks pass
```

### Cross-stack contract tests

**Files**:
- `apps/web/server/__tests__/browserPolicyContract.test.ts`
- `python-backend/tests/test_browser_policy_contract.py`

```typescript
// Test: Node policy envelope serializes stable fields for Python consumers
```

```python
# Test: Python contract fixtures deserialize the same decision payload and reason-code set
```

---

## Implementation Details

### 1. Create the shared policy module

Add a Node service layer that:

- receives normalized action input
- loads tenant policy + workflow entitlement state
- classifies the action
- scores page sensitivity
- applies deterministic rules
- emits a browser-policy decision envelope

### 2. Use the dedicated browser decision enum

Do not reuse `policy_action`. This section must establish the v1 enum that supports:

- `allow`
- `allow_with_redaction`
- `require_approval`
- `deny`
- `escalate_for_review`

### 3. Define the shared Node/Python contract

The decision envelope should be versioned and stable across stacks. It should include:

- tenant/workflow/execution identifiers
- action classification
- page sensitivity
- decision enum
- reason codes
- confidence/risk values
- evidence digests
- approval linkage when applicable

### 4. Make fallback semantics explicit

Under uncertainty:

- unknown context becomes read-only by default
- low-confidence non-read actions require approval or deny
- restricted detections never degrade into permissive behavior

This behavior should be deterministic and visible in audit output.

### 5. Make entitlement and data checks first-class

Capability checks, allowed data classes, trust-boundary transfer checks, and per-workflow thresholds should be part of the core decision path, not a best-effort annotation layered on later.

---

## Verification Steps

1. Confirm the engine returns the dedicated decision enum only.
2. Confirm contract fixtures pass in both Node and Python.
3. Confirm fail-closed fallback behavior is exercised by tests for unknown and low-confidence cases.
4. Confirm missing capabilities and restricted transfers deny even when basic domain checks would allow execution.
5. Confirm reason codes are stable enough for UI, analytics, and incident review.

---

## As-Built Notes

### Actual files changed

- `apps/web/shared/browserPolicy.ts`
- `apps/web/server/services/browserActionClassifier.ts`
- `apps/web/server/services/browserPageSensitivityScorer.ts`
- `apps/web/server/services/browserDataHandlingPolicy.ts`
- `apps/web/server/services/browserPolicyEngine.ts`
- `apps/web/server/services/__tests__/browserActionClassifier.test.ts`
- `apps/web/server/services/__tests__/browserPageSensitivityScorer.test.ts`
- `apps/web/server/services/__tests__/browserPolicyEngine.test.ts`
- `apps/web/server/__tests__/browserPolicyContract.test.ts`
- `python-backend/app/services/browser_policy_contract.py`
- `python-backend/tests/test_browser_policy_contract.py`
- `specs/feature/033-Browser-Automation-Policy/fixtures/browser-policy-decision-envelope.json`

### Deviations from plan

- Implemented the transfer-control and iframe-trust decisions as pure policy helpers inside the Node engine first; executor-time hooks are deferred to a later section because the current Python runtime does not yet call back into a Node-owned action policy seam.

### Tests added or updated

- `npm --prefix apps/web test -- server/services/__tests__/browserActionClassifier.test.ts server/services/__tests__/browserPageSensitivityScorer.test.ts server/services/__tests__/browserPolicyEngine.test.ts server/__tests__/browserPolicyContract.test.ts`
- `UV_CACHE_DIR=/tmp/uv-cache DEBUG=false uv run --project python-backend pytest python-backend/tests/test_browser_policy_contract.py`

### Known follow-ups

- The decision envelope is implemented and tested, but it is not yet emitted by the live Automation Copilot executor path.
