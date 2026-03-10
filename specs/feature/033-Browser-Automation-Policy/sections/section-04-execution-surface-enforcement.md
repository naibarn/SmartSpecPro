# Section 04: Execution Surface Enforcement

## Overview

This section wires the policy engine into real execution surfaces. The immediate production target is Automation Copilot and the Playwright executor path. The raw browser tool remains blocked from tenant production usage until it can use the same shared contract, and the launch guard must make that invariant testable.

**Corresponds to**: Plan sections "Production rollout and execution surfaces" and "Execution-path integration details".

**Dependencies**: Sections 02 and 03.

**Blocks**: Data-handling enforcement, incident-safe rollout, and final release readiness.

---

## Tests

### Web / router tests

**Files**:
- `apps/web/server/routers/__tests__/automationCopilot.browser-policy.test.ts`
- `apps/web/server/__tests__/browserToolLaunchGuard.test.ts`

```typescript
// Test: automationCopilot path calls shared browser policy contract before live action dispatch
// Test: raw browser tool cannot be tenant-enabled without shared policy contract wiring
// Test: launch guard fails startup/config validation when raw browser path would bypass policy
```

### Python / executor tests

**Files**:
- `python-backend/tests/test_browser_policy_executor_integration.py`
- `python-backend/tests/test_self_healing_executor_policy_hooks.py`

```python
# Test: Playwright executor re-evaluates policy on navigation, redirect, popup, and frame transitions
# Test: executor blocks action dispatch when approval state is stale or revoked
# Test: file picker / download prompt / permission prompt fail closed without explicit policy allowance
```

---

## Implementation Details

### 1. Integrate policy enforcement into Automation Copilot

Add the shared policy call immediately before live browser actions execute, not just during planning or script generation. This closes the current gap between initial URL validation and the actual surface the executor reaches later.

### 2. Enforce launch guard for raw browser tool

The raw browser path must remain internal-only or tenant-disabled until it shares the same policy contract. Add a startup/config invariant and tests so flag drift or partial deploys cannot expose a bypass.

### 3. Re-evaluate live transitions

Execution-time enforcement must cover:

- top-level navigation
- redirect completion
- popup creation
- subframe navigation
- cross-origin frame interaction

Every transition that materially changes context should cause policy re-evaluation before a risky action continues.

### 4. Treat hidden prompts as sensitive surfaces

Download prompts, permission prompts, certificate warnings, and OS file pickers must fail closed unless an explicit rule and entitlement allow proceeding.

### 5. Keep polling compatibility

Approval and policy status changes should surface through existing polling flows quickly enough for the current frontend interval to show the right state without requiring new streaming infrastructure in v1.

---

## Verification Steps

1. Confirm Automation Copilot cannot dispatch a live action without a policy decision.
2. Confirm raw browser tool stays blocked from tenant production access.
3. Confirm navigation, popup, and frame transitions trigger re-evaluation in executor tests.
4. Confirm hidden browser/OS prompts fail closed.
5. Confirm polling status reflects pending approval, invalidation, and revocation states.

---

## As-Built Notes

### Actual files changed

- `apps/web/server/services/browserPolicyLaunchGuard.ts`
- `apps/web/server/routes/browserTool.ts`
- `apps/web/server/__tests__/browserToolLaunchGuard.test.ts`
- `apps/web/server/__tests__/browserToolDomainValidation.test.ts`

### Deviations from plan

- Only the raw-browser launch guard portion landed in this pass.
- Automation Copilot still lacks a live, action-by-action Node policy callback because the current execute request does not carry workflow entitlement identity and the Python executor does not yet invoke a Node-owned policy seam per dispatch.

### Tests added or updated

- `npm --prefix apps/web test -- server/__tests__/browserToolLaunchGuard.test.ts server/__tests__/browserToolDomainValidation.test.ts`

### Known follow-ups

- Wire the Automation Copilot execution path to the shared browser policy contract immediately before live action dispatch.
- Add Python executor hooks for navigation, popup, redirect, frame, and prompt re-evaluation.
