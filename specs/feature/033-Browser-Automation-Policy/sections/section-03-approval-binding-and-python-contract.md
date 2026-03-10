# Section 03: Approval Binding and Python Contract

## Overview

This section upgrades the existing approval system for browser-specific use without forking it. It defines the exact payload fields, persistence contract, invalidation logic, and audit semantics that must be shared by Node request orchestration and Python execution/resume flows.

**Corresponds to**: Plan section "Approval reuse and contextual binding".

**Dependencies**: Sections 01 and 02.

**Blocks**: Live execution enforcement, polling status integration, audit linkage, and rollout of commit-class actions.

---

## Tests

### Web / router-service tests

**Files**:
- `apps/web/server/routers/__tests__/browserPolicyApprovals.test.ts`
- `apps/web/server/services/__tests__/browserApprovalPayload.test.ts`

```typescript
// Test: browser approval payload includes action_digest, payload_preview_hash,
// Test: dom_fingerprint, optional screenshot_hash, target_origin, TTL, and reason codes

// Test: approval TTL defaults to 300 seconds and validates 60-900 second bounds

// Test: approval invalidation emits approval_context_changed when context-bound checks fail

// Test: repeated retries do not create duplicate approval requests for the same logical action
```

### Python / approval and executor tests

**Files**:
- `python-backend/tests/test_browser_policy_approval.py`
- `python-backend/tests/test_browser_policy_approval_resume.py`

```python
# Test: ApprovalRequest model persists action_digest, dom_fingerprint, and screenshot_hash
# Test: executor re-checks context_hash before dispatch
# Test: origin change, digest change, or DOM drift >20 percent invalidates approval
# Test: revocation observed before resume fails closed
```

---

## Implementation Details

### 1. Extend approval payloads explicitly

Browser approvals must include:

- normalized action description
- target origin
- execution identifier
- policy reason codes
- `action_digest`
- `payload_preview_hash`
- `dom_fingerprint`
- optional `screenshot_hash`
- TTL metadata

### 2. Preserve the explicit model migration contract

The `ApprovalRequest` persistence layer requires browser-specific fields for:

- `action_digest`
- `dom_fingerprint`
- `screenshot_hash`

`payload_preview_hash` must remain part of the browser approval payload contract so preview rendering and verification semantics remain stable across Node and Python. It should be treated as a stable computed contract field that participates in cross-stack approval consistency, not as optional display-only metadata.

### 3. Make invalidation rules normative

Approval must be invalidated when:

- top-level navigation changes context
- subframe navigation changes context
- popup creation changes context
- redirect-driven origin change occurs
- `context_hash` no longer matches at dispatch time
- `action_digest` changes
- `dom_fingerprint` drift exceeds `20%`

Invalidation must require a fresh approval rather than allowing optimistic replay.

### 4. Standardize audit reason codes

Context-bound invalidation should emit `approval_context_changed`. Revocation, expiry, rejection, and other terminal states must remain distinguishable in audit and analytics pipelines.

### 5. Make approvals idempotent and revocable

Use correlation keys or equivalent semantics so retries do not create duplicate approvals. Add revocation handling so pending or recently granted approvals can be canceled and observed by polling clients and executors before resume.

---

## Verification Steps

1. Confirm approval payloads carry the full browser-specific contract.
2. Confirm model migrations expose the required browser fields on `ApprovalRequest`.
3. Confirm dispatch-time context-hash re-check invalidates stale approvals.
4. Confirm DOM drift `>20%` invalidates approvals consistently.
5. Confirm audit output distinguishes `approval_context_changed` from revocation, expiry, and rejection.

---

## As-Built Notes

### Actual files changed

- `apps/web/shared/browserPolicy.ts`
- `apps/web/server/services/browserApprovalPayload.ts`
- `apps/web/server/services/__tests__/browserApprovalPayload.test.ts`
- `apps/web/server/routers/__tests__/browserPolicyApprovals.test.ts`
- `python-backend/app/models/approval.py`
- `python-backend/app/services/approval_db_service.py`
- `python-backend/app/services/browser_policy_contract.py`
- `python-backend/tests/test_browser_policy_approval.py`
- `python-backend/tests/test_browser_policy_approval_resume.py`

### Deviations from plan

- Added browser approval correlation and revocation primitives to the persistence contract, but did not yet wire them through the FastAPI approval endpoints or live executor resume flow.

### Tests added or updated

- `npm --prefix apps/web test -- server/services/__tests__/browserApprovalPayload.test.ts server/routers/__tests__/browserPolicyApprovals.test.ts`
- `UV_CACHE_DIR=/tmp/uv-cache DEBUG=false uv run --project python-backend pytest python-backend/tests/test_browser_policy_approval.py python-backend/tests/test_browser_policy_approval_resume.py`

### Known follow-ups

- The approval DB model and helpers are updated, but the HTTP approval endpoints still need browser-specific request/response plumbing and revocation exposure.
