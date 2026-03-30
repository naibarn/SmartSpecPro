# Section 04: Feature Flags Registration

## Section ID
`section-04-feature-flags`

## Dependencies
- **None** -- this section is in batch 1 and can be implemented independently.

## Blocks
- `section-02-orchestrator-agentic` (needs `agencyAgenticModeEnabled` flag)
- `section-08-react-integration` (needs `agencyReactExecutorEnabled` flag)
- `section-10-autonomous-executor` (needs `agencyAutonomousAgentEnabled` flag)
- `section-12-long-term-memory` (needs `agencyLongTermMemoryEnabled` flag)

## Overview

This section registers four new tenant-scoped feature flags that gate the three levels of agentic intelligence. It also creates a lightweight Python-side utility for checking these flags from the orchestrator and other Python services.

### Four Feature Flags

| Flag Key | Level | Default | Purpose |
|----------|-------|---------|---------|
| `agencyAgenticModeEnabled` | 1 | `true` | Gates agentic execution mode (reflection loop) |
| `agencyReactExecutorEnabled` | 2 | `false` | Gates ReAct executor path |
| `agencyAutonomousAgentEnabled` | 3 | `false` | Gates autonomous agent node type |
| `agencyLongTermMemoryEnabled` | 3 | `false` | Gates cross-run long-term memory |

Level 1 defaults to `true` because it is low-risk (just prompt augmentation + reflection loop). Levels 2 and 3 default to `false` because they introduce new execution engines with cost implications.

---

## Files to Modify

### 1. `apps/web/shared/featureFlags.ts`

This is the single source of truth for tenant feature flag definitions. Three changes are needed:

**A. Add to `TenantFeatureFlags` interface** -- append four new boolean properties after the last existing entry (`unifiedSkillExecution`):

```typescript
agencyAgenticModeEnabled: boolean;    // F30 -- Agency agentic execution mode (Level 1)
agencyReactExecutorEnabled: boolean;  // F31 -- Agency ReAct executor (Level 2)
agencyAutonomousAgentEnabled: boolean; // F32 -- Agency autonomous agent (Level 3)
agencyLongTermMemoryEnabled: boolean;  // F33 -- Agency long-term memory (Level 3)
```

**B. Add to `ALLOWED_FEATURE_FLAGS` set** -- append four entries at the end of the `Set<TenantFeatureFlagKey>` constructor:

```typescript
"agencyAgenticModeEnabled",
"agencyReactExecutorEnabled",
"agencyAutonomousAgentEnabled",
"agencyLongTermMemoryEnabled",
```

**C. Add to `FEATURE_FLAG_DEFAULTS` object** -- append four entries at the end:

```typescript
agencyAgenticModeEnabled: true,
agencyReactExecutorEnabled: false,
agencyAutonomousAgentEnabled: false,
agencyLongTermMemoryEnabled: false,
```

---

## Files to Create

### 2. `python-backend/app/services/agentic_feature_flags.py`

A Python utility module for checking agentic feature flags from the Python backend. The Python backend does not have direct access to the `TenantFeatureFlags` interface or the Node.js Redis keys. Two patterns exist in the codebase for Python-side flag checks:

1. **Redis direct read** (used by `automation_copilot.py`): Read `feature_flag:{flagName}:{tenantId}` from Redis.
2. **Environment variable** (used by `agency_orchestrator.py`): Read `AGENCY_ORCHESTRATOR_ENABLED` from `os.getenv()`.

For agentic flags, use **pattern 1 (Redis)** because these are tenant-scoped flags that must respect per-tenant overrides. The Redis key format matches the Node.js `getTenantFeatureFlag` function which writes to `feature-flag:{flagName}:{tenantId}`.

**Module responsibilities:**
- Expose an `async def check_agentic_flag(flag_name: str, tenant_id: str) -> bool` function.
- Accept one of the four known flag names as a string literal type.
- Read from Redis key `feature-flag:{flag_name}:{tenant_id}`. If not found, fall back to `feature-flag:{flag_name}` (global). If neither exists, use hardcoded defaults matching `FEATURE_FLAG_DEFAULTS`.
- Define a `AGENTIC_FLAG_DEFAULTS` dict with the four flags and their defaults.
- Validate that `flag_name` is one of the four known keys (raise `ValueError` otherwise).

**Key design notes:**
- The function is `async` because it reads from Redis.
- Redis connection should use the existing `get_redis()` helper from the Python backend.
- The function must NOT raise on Redis failure -- it should return the default value (fail-open for `agencyAgenticModeEnabled`, fail-closed for the others).

**Function signature:**

```python
async def check_agentic_flag(flag_name: str, tenant_id: str) -> bool:
    """Check if an agentic feature flag is enabled for the given tenant."""
```

**Constants to define:**

```python
AGENTIC_FLAGS = {
    "agencyAgenticModeEnabled",
    "agencyReactExecutorEnabled",
    "agencyAutonomousAgentEnabled",
    "agencyLongTermMemoryEnabled",
}

AGENTIC_FLAG_DEFAULTS: dict[str, bool] = {
    "agencyAgenticModeEnabled": True,
    "agencyReactExecutorEnabled": False,
    "agencyAutonomousAgentEnabled": False,
    "agencyLongTermMemoryEnabled": False,
}
```

### 3. `python-backend/tests/unit/test_agentic_feature_flags.py`

Unit tests for the Python flag checker.

---

## Tests (TDD)

### Test File: `python-backend/tests/unit/test_agentic_feature_flags.py`

Write tests FIRST, before implementing the module. All tests use `pytest` with `asyncio` auto mode. Mock Redis using `unittest.mock.AsyncMock` or `fakeredis.aioredis`.

```python
import pytest

# ── Flag defaults ─────────────────────────────────────────────────

def test_agentic_flag_defaults_has_four_entries():
    """AGENTIC_FLAG_DEFAULTS contains exactly 4 flags."""

def test_agentic_mode_default_is_true():
    """agencyAgenticModeEnabled defaults to True."""

def test_react_executor_default_is_false():
    """agencyReactExecutorEnabled defaults to False."""

def test_autonomous_agent_default_is_false():
    """agencyAutonomousAgentEnabled defaults to False."""

def test_long_term_memory_default_is_false():
    """agencyLongTermMemoryEnabled defaults to False."""

# ── Flag validation ──────────────────────────────────────────────

def test_unknown_flag_raises_value_error():
    """check_agentic_flag with unknown flag name raises ValueError."""

# ── Redis reads ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_reads_tenant_scoped_flag_from_redis():
    """When Redis has feature-flag:agencyAgenticModeEnabled:tenant123 = 'true', returns True."""

@pytest.mark.asyncio
async def test_reads_tenant_scoped_flag_false():
    """When Redis has feature-flag:agencyAgenticModeEnabled:tenant123 = 'false', returns False."""

@pytest.mark.asyncio
async def test_falls_back_to_global_flag():
    """When tenant key missing but global feature-flag:agencyReactExecutorEnabled = 'true', returns True."""

@pytest.mark.asyncio
async def test_falls_back_to_default_when_redis_empty():
    """When neither tenant nor global key exists, returns the hardcoded default."""

@pytest.mark.asyncio
async def test_returns_default_on_redis_failure():
    """When Redis raises an exception, returns the default value (no crash)."""

@pytest.mark.asyncio
async def test_fail_closed_for_react_on_redis_failure():
    """agencyReactExecutorEnabled returns False (its default) when Redis is down."""

@pytest.mark.asyncio
async def test_fail_open_for_agentic_mode_on_redis_failure():
    """agencyAgenticModeEnabled returns True (its default) when Redis is down."""
```

### Test File: `apps/web/shared/__tests__/featureFlags.test.ts` (or inline verification)

The TypeScript side should have at minimum these verifications (may be added to existing test files if they exist, or a new test):

```typescript
import { describe, test, expect } from "vitest";
import {
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
  type TenantFeatureFlags,
} from "../featureFlags";

describe("Agentic feature flags", () => {
  test("ALLOWED_FEATURE_FLAGS includes all 4 agentic flags", () => {
    expect(ALLOWED_FEATURE_FLAGS.has("agencyAgenticModeEnabled")).toBe(true);
    expect(ALLOWED_FEATURE_FLAGS.has("agencyReactExecutorEnabled")).toBe(true);
    expect(ALLOWED_FEATURE_FLAGS.has("agencyAutonomousAgentEnabled")).toBe(true);
    expect(ALLOWED_FEATURE_FLAGS.has("agencyLongTermMemoryEnabled")).toBe(true);
  });

  test("FEATURE_FLAG_DEFAULTS has correct defaults for agentic flags", () => {
    expect(FEATURE_FLAG_DEFAULTS.agencyAgenticModeEnabled).toBe(true);
    expect(FEATURE_FLAG_DEFAULTS.agencyReactExecutorEnabled).toBe(false);
    expect(FEATURE_FLAG_DEFAULTS.agencyAutonomousAgentEnabled).toBe(false);
    expect(FEATURE_FLAG_DEFAULTS.agencyLongTermMemoryEnabled).toBe(false);
  });

  test("TenantFeatureFlags interface accepts all 4 new flags", () => {
    // Type-level check: this compiles only if the interface has all 4 fields
    const flags: TenantFeatureFlags = {
      ...FEATURE_FLAG_DEFAULTS,
      agencyAgenticModeEnabled: true,
      agencyReactExecutorEnabled: false,
      agencyAutonomousAgentEnabled: false,
      agencyLongTermMemoryEnabled: false,
    };
    expect(flags).toBeDefined();
  });
});
```

---

## Integration Test Coverage

### Test File: `python-backend/tests/integration/test_agentic_integration.py` (partial -- flag-specific test)

This test verifies that the orchestrator respects the feature flag when deciding the execution path. It should be added to the integration test file referenced in the TDD plan:

```python
@pytest.mark.integration
@pytest.mark.asyncio
async def test_feature_flag_gates_agentic():
    """Disabled agencyAgenticModeEnabled flag falls back to single_shot mode."""
```

This test mocks `check_agentic_flag` to return `False` for `agencyAgenticModeEnabled`, then invokes the orchestrator with a node configured as `executionMode: "agentic"`. The orchestrator must fall back to the standard `single_shot` path. Implementation details are in section-02.

---

## Implementation Guidance

### Step 1: Write TypeScript tests
Create or extend `apps/web/shared/__tests__/featureFlags.test.ts` with the tests above. They will fail because the flags do not exist yet.

### Step 2: Add flags to `apps/web/shared/featureFlags.ts`
Add the four flags to all three locations (`TenantFeatureFlags` interface, `ALLOWED_FEATURE_FLAGS` set, `FEATURE_FLAG_DEFAULTS` object). Run `pnpm check` in `apps/web` to verify TypeScript compiles. Run the tests to verify they pass.

### Step 3: Write Python tests
Create `python-backend/tests/unit/test_agentic_feature_flags.py` with the tests above. They will fail because the module does not exist yet.

### Step 4: Create Python module
Create `python-backend/app/services/agentic_feature_flags.py` with `check_agentic_flag()`, `AGENTIC_FLAGS`, and `AGENTIC_FLAG_DEFAULTS`. Use `redis.asyncio` (or the project's existing async Redis helper) for reads. Run `pytest tests/unit/test_agentic_feature_flags.py` to verify.

### Redis key format alignment

The Node.js `featureFlags.ts` service writes tenant-scoped flags to:
```
feature-flag:{flagName}:{tenantId}
```

The Python reader must use the **same key format** (hyphen-separated `feature-flag`, not underscore `feature_flag`). Note that `automation_copilot.py` uses `feature_flag:` (underscore) -- this is an inconsistency in the existing codebase. The agentic flags module must use the hyphen format to match the Node.js writer.

### How downstream sections consume flags

- **section-02** (`agency_orchestrator.py`): Before entering the `_execute_agent_node_agentic()` path, call `await check_agentic_flag("agencyAgenticModeEnabled", ctx.tenant_id)`. If `False`, fall through to standard `single_shot` execution.
- **section-08** (`agency_orchestrator.py`): Before entering the ReAct path, call `await check_agentic_flag("agencyReactExecutorEnabled", ctx.tenant_id)`.
- **section-10** (`autonomous_executor.py`): Before processing an `autonomous_agent` node, check `agencyAutonomousAgentEnabled`.
- **section-12** (long-term memory service): Before reading/writing memories, check `agencyLongTermMemoryEnabled`.

### Backward compatibility

- All existing agencies are unaffected. The four flags are additive.
- `agencyAgenticModeEnabled` defaults to `true` so that Level 1 is available immediately after deployment without admin action.
- The other three default to `false` and require explicit opt-in per tenant.
- Tenants with existing `featureFlags` JSON in the database will get the defaults for the new keys via the `FEATURE_FLAG_DEFAULTS` spread pattern used in the admin UI.
