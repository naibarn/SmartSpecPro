# Section 05: Data Handling and Trust Controls

## Overview

This section turns the policy engine into a concrete exfiltration and trust-boundary control layer. It covers upload/download/extraction rules, per-workflow thresholds, clipboard restrictions, and the approved iframe trust model needed to keep deceptive or cross-site surfaces from inheriting trust accidentally.

**Corresponds to**: Plan sections "Data handling and exfiltration controls" and the trust-related parts of "Execution-path integration details".

**Dependencies**: Sections 02, 03, and 04.

**Blocks**: Audit/monitoring correctness and final rollout gating.

---

## Tests

### Web / service tests

**Files**:
- `apps/web/server/services/__tests__/browserDataHandlingPolicy.test.ts`
- `apps/web/server/services/__tests__/browserIframeTrustPolicy.test.ts`
- `apps/web/server/services/__tests__/browserActionRateLimit.test.ts`

```typescript
// Test: sensitive-context downloads deny by default unless entitlement explicitly allows file class and destination
// Test: uploads deny by default and require approval for external destinations
// Test: per-workflow thresholds enforce extraction limits, external-send limits, and origin-transition limits
// Test: clipboard transfer from restricted context to untrusted destination is denied
// Test: same-origin iframe inherits parent policy
// Test: same-site cross-origin iframe caps behavior at draft-class actions
// Test: cross-site iframe becomes read-only and emits `cross_site_iframe`
```

### Python / integration tests

**Files**:
- `python-backend/tests/test_browser_policy_transfer_controls.py`
- `python-backend/tests/test_browser_policy_iframe_controls.py`

```python
# Test: executor respects deny/approval decisions for download, upload, and transfer actions
# Test: iframe-origin transitions are classified consistently with Node-side trust rules
```

---

## Implementation Details

### 1. Enforce transfer controls in runtime policy

Downloads from sensitive pages should deny by default unless the workflow entitlement explicitly allows the file type and destination handling. Uploads should deny by default and require approval for external destinations. Extraction and copy flows should respect data sensitivity and per-workflow record limits.

### 2. Extend Redis-backed action controls

Build on the existing semaphore approach to enforce:

- non-read action thresholds
- extracted record thresholds
- external-send thresholds
- origin-transition thresholds

These limits belong in workflow entitlements so operators can tune them without code changes.

### 3. Treat clipboard and inter-page transfer as first-class actions

Do not let clipboard-like behavior cross policy boundaries invisibly. Transfers across origins, tabs, or workflows should be treated as explicit policy decisions.

### 4. Implement the three-tier iframe trust model

Apply the approved model:

- same-origin: inherit parent policy
- same-site cross-origin: constrained, draft-class maximum, commit requires approval
- cross-site: new untrusted context, read-only maximum by default

Sandboxed Tier 2 or Tier 3 iframes should use the strictest behavior.

### 5. Preserve trust-boundary reason codes

Cross-site or otherwise untrusted iframe interactions should emit dedicated reason codes so analytics and incident review can distinguish trust-boundary enforcement from generic denials. For the approved cross-site iframe case, use the explicit reason code `cross_site_iframe`.

---

## Verification Steps

1. Confirm uploads, downloads, extraction, and transfer flows follow the intended allow/approval/deny rules.
2. Confirm per-workflow rate and bulk thresholds trigger deterministic enforcement.
3. Confirm same-origin, same-site, and cross-site iframe cases behave according to the approved tier model.
4. Confirm cross-site trust-boundary denials are auditable through the explicit `cross_site_iframe` reason code.
5. Confirm clipboard and cross-page transfer attempts cannot bypass policy.

## As-Built Notes

### Actual files changed

- `apps/web/server/services/browserActionRateLimit.ts`
- `apps/web/server/services/browserDataHandlingPolicy.ts`
- `apps/web/server/services/browserPolicyEngine.ts`
- `apps/web/server/services/__tests__/browserActionRateLimit.test.ts`
- `apps/web/server/services/__tests__/browserDataHandlingPolicy.test.ts`
- `apps/web/server/services/__tests__/browserIframeTrustPolicy.test.ts`
- `python-backend/app/services/browser_policy_transfer_controls.py`
- `python-backend/tests/test_browser_policy_transfer_controls.py`
- `python-backend/tests/test_browser_policy_iframe_controls.py`

### Deviations from plan

- Implemented deterministic helper-layer rate and trust controls first instead of wiring directly into the live executor because the section-04 cross-stack action hook is still blocked.
- Threshold enforcement currently consumes caller-supplied counts; Redis-backed counters remain a follow-up once the live execution seam exists.

### Tests added or updated

- `npm --prefix apps/web test -- server/services/__tests__/browserActionRateLimit.test.ts server/services/__tests__/browserDataHandlingPolicy.test.ts server/services/__tests__/browserIframeTrustPolicy.test.ts server/services/__tests__/browserPolicyEngine.test.ts`
- `UV_CACHE_DIR=/tmp/uv-cache DEBUG=false uv run --project python-backend pytest python-backend/tests/test_browser_policy_transfer_controls.py python-backend/tests/test_browser_policy_iframe_controls.py`

### Known follow-ups

- Wire these controls into the live Automation Copilot and Python executor path once the shared per-action policy callback exists.
- Replace caller-supplied threshold counters with Redis-backed workflow/action counters.
