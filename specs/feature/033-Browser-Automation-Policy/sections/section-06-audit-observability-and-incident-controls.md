# Section 06: Audit, Observability, and Incident Controls

## Overview

This section makes policy decisions operationally trustworthy. It adds JSONL + DB audit output, tamper-evident integrity hooks, decision and rollout metrics, alerts, kill switches, domain/category emergency overrides, and approval revocation controls needed for production incident response.

**Corresponds to**: Plan sections "Evidence model and privacy boundary", "Observability and monitoring", and "Incident controls and kill switches".

**Dependencies**: Sections 02 through 05.

**Blocks**: Final rollout and release gates.

---

## Tests

### Web / audit and control tests

**Files**:
- `apps/web/server/__tests__/browserPolicyAuditLogger.test.ts`
- `apps/web/server/services/__tests__/browserPolicyMetrics.test.ts`
- `apps/web/server/services/__tests__/browserIncidentControls.test.ts`

```typescript
// Test: browser policy decisions write JSONL-compatible audit output and structured DB records
// Test: audit output excludes raw DOM and full screenshot blobs by default
// Test: tamper-evident integrity metadata is generated and verifiable
// Test: approval_context_changed, revocation, expiry, and rejection remain distinct in audit reason codes
// Test: global, tenant, and workflow kill switches disable execution immediately
// Test: emergency domain/category deny overrides supersede normal workflow allowances
```

### Python / integration tests

**Files**:
- `python-backend/tests/test_browser_policy_audit_contract.py`
- `python-backend/tests/test_browser_policy_node_client.py`
- `python-backend/tests/test_browser_policy_revocation.py`

```python
# Test: Python-side audit/event consumers can correlate policy decision, approval, and outcome records
# Test: executor observes revocation and kill-switch state before dispatch
# Test: cached browser approvals are revalidated before reuse so post-approval revocation fails closed
```

---

## Implementation Details

### 1. Write audit output to JSONL and DB

Preserve compatibility with the existing JSONL audit stream while also writing structured DB records for browser policy decisions. Both paths should represent the same event semantics so local ops tooling and longer-term analytics stay aligned.

### 2. Add tamper-evident integrity hooks

Use an append-only integrity mechanism such as chained hashes or signed batches so incident review can verify audit continuity without revealing secrets or full DOM content.

### 3. Emit decision and rollout metrics

Track at least:

- decision counts by tier
- allow/deny/approval rates
- invalidation and revocation rates
- latency and timeout classes
- rollout quality metrics such as precision/FPR/FNR

### 4. Implement incident controls

Support:

- global kill switch
- tenant kill switch
- workflow-level disable
- emergency domain/category deny override
- approval revocation

These controls must be visible to operators and fail closed when invoked.

### 5. Keep privacy boundaries intact

Hashes and digests may be logged; raw DOM, plaintext secrets, and full screenshots should not be retained by default.

---

## Verification Steps

1. Confirm a single policy event appears consistently in JSONL and DB outputs.
2. Confirm integrity metadata can be checked successfully in tests.
3. Confirm alerts/metrics distinguish latency failures, decision-write failures, invalidations, and bypass risk.
4. Confirm kill switches and deny overrides take effect before risky actions dispatch.
5. Confirm privacy tests prove raw DOM and full screenshots are absent by default.

## As-Built Notes

### Actual files changed

- `apps/web/server/services/browserPolicyAuditLogger.ts`
- `apps/web/server/services/browserPolicyMetrics.ts`
- `apps/web/server/services/browserIncidentControls.ts`
- `apps/web/server/__tests__/browserPolicyAuditLogger.test.ts`
- `apps/web/server/services/__tests__/browserPolicyMetrics.test.ts`
- `apps/web/server/services/__tests__/browserIncidentControls.test.ts`
- `python-backend/app/services/browser_policy_audit.py`
- `python-backend/app/services/browser_policy_node_client.py`
- `python-backend/app/services/browser_policy_incident_controls.py`
- `python-backend/tests/test_browser_policy_audit_contract.py`
- `python-backend/tests/test_browser_policy_node_client.py`
- `python-backend/tests/test_browser_policy_revocation.py`

### Deviations from plan

- Implemented deterministic audit-artifact, metrics-summary, and incident-control helpers first instead of wiring directly into live persistence and dispatch paths.
- JSONL compatibility and DB-record shapes are represented as shared artifacts, but no dedicated browser-policy decision table or live writer hook exists yet.

### Tests added or updated

- `npm --prefix apps/web test -- server/__tests__/browserPolicyAuditLogger.test.ts server/services/__tests__/browserPolicyMetrics.test.ts server/services/__tests__/browserIncidentControls.test.ts`
- `UV_CACHE_DIR=/tmp/uv-cache DEBUG=false uv run --project python-backend pytest python-backend/tests/test_browser_policy_node_client.py python-backend/tests/test_self_healing_executor_policy_hooks.py python-backend/tests/unit/automation/test_self_healing_executor.py python-backend/tests/test_browser_policy_audit_contract.py python-backend/tests/test_browser_policy_revocation.py python-backend/tests/test_browser_policy_approval_resume.py`

### Known follow-ups

- Persist browser-policy audit artifacts from the live decision path into JSONL and structured DB storage.
- Expose operator-visible approval-status and revocation telemetry from the live browser-policy runtime in addition to the now fail-closed approval revalidation.
