# Section 01: Policy Storage and Entitlements

## Overview

This section establishes the persistent configuration foundation for Feature 033. It introduces tenant-scoped browser policy config and rule storage, a separate workflow entitlement store, and the lookup behavior that makes these records authoritative for runtime decisions. Nothing later in the feature should infer browser authority from global `system_settings` or from workflow policy tables that were designed for different semantics.

**Corresponds to**: Plan sections "Tenant-scoped configuration and rules" and the storage-related parts of "Data model and migration strategy".

**Dependencies**: None.

**Blocks**: Every later section relies on these tables and lookup semantics.

---

## Tests

### Web / Drizzle tests

**Files**:
- `apps/web/drizzle/__tests__/browserPolicySchema.test.ts`
- `apps/web/server/__tests__/browserWorkflowEntitlement.test.ts`

```typescript
// Test: browser policy schema exposes tenant_browser_policy_config, tenant_browser_policy_rules,
// Test: browser_workflow_entitlements with tenantId + workflowId uniqueness

// Test: workflow entitlement lookup returns enabled records and rejects disabled or expired records

// Test: approval TTL defaults to 300 seconds and rejects overrides below 60 or above 900

// Test: browser policy resolution does not read global system_settings when tenant/browser policy rows exist

// Test: workflow-level disable fails closed before any action capability is granted
```

### Python / integration tests

**Files**:
- `python-backend/tests/test_browser_policy_config_contract.py`

```python
# Test: Python-side browser policy consumers read entitlement/config payloads without schema drift
# Test: disabled or expired workflow entitlement is treated as non-executable input
```

---

## Implementation Details

### 1. Add dedicated browser policy tables

Create tenant-scoped tables for:

- `tenant_browser_policy_config`
- `tenant_browser_policy_rules`
- `browser_workflow_entitlements`

The first two tables define tenant-wide defaults, deny overrides, incident controls, rollout state, and evidence settings. `browser_workflow_entitlements` defines the minimum scope for a specific browser run: allowed capabilities, forbidden capabilities, allowed data classes, per-workflow thresholds, TTL overrides, expiry, enabled state, and review cadence.

### 2. Preserve separation from unrelated governance storage

Do not extend `workflow_policy_rules` and do not store browser policy authority in global `system_settings`. If any compatibility bridge is needed during rollout, it must be transitional, explicitly tested, and removable without changing the steady-state read path.

### 3. Lock v1 TTL and cadence defaults

Workflow entitlement config should default to:

- approval TTL: `300s`
- allowed TTL range: `60s` to `900s`
- review cadence default: `90 days`

These values were approved in the source spec and should not be left to implementation-time inference.

### 4. Make lookup behavior fail closed

Runtime lookup should fail closed when:

- tenant browser policy config is missing and no seeded default exists
- workflow entitlement is missing
- workflow entitlement is disabled
- workflow entitlement is expired
- required capability is absent

No caller should be able to continue by silently falling back to tenant-agnostic or global settings.

### 5. Seed defaults and inspection surface

Seed baseline config/rules/entitlements via migration or startup seeding so v1 does not depend on a new admin UI. Add a lightweight inspection surface for debugging and future operator tooling, but defer tenant CRUD UI.

---

## Verification Steps

1. Confirm schema definitions exist and serialize correctly in Drizzle.
2. Confirm entitlement lookup rejects disabled or expired workflows before execution starts.
3. Confirm test fixtures can create per-tenant config/rule/entitlement records without cross-tenant bleed.
4. Confirm TTL defaults and bounds are enforced by validation logic.
5. Confirm no browser policy read path depends on global `system_settings`.

---

## As-Built Notes

### Actual files changed

- `apps/web/drizzle/schema.ts`
- `apps/web/shared/browserPolicy.ts`
- `apps/web/server/services/browserPolicyStore.ts`
- `apps/web/drizzle/__tests__/browserPolicySchema.test.ts`
- `apps/web/server/__tests__/browserWorkflowEntitlement.test.ts`
- `python-backend/app/services/browser_policy_contract.py`
- `python-backend/tests/test_browser_policy_config_contract.py`
- `specs/feature/033-Browser-Automation-Policy/fixtures/browser-policy-entitlement.json`

### Deviations from plan

- Added a shared browser-policy contract module early so entitlement validation and future cross-stack fixtures use the same constants for TTL bounds and defaults.
- Implemented seed-config support in the lookup layer to support fail-closed semantics without introducing a tenant CRUD UI in this pass.

### Tests added or updated

- `npm --prefix apps/web test -- drizzle/__tests__/browserPolicySchema.test.ts server/__tests__/browserWorkflowEntitlement.test.ts`
- `UV_CACHE_DIR=/tmp/uv-cache DEBUG=false uv run --project python-backend pytest python-backend/tests/test_browser_policy_config_contract.py`

### Known follow-ups

- No raw SQL migration has been added yet for these tables; the Drizzle schema and lookup logic are in place first.
