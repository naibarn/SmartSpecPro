Now I have a comprehensive understanding of the codebase. Let me generate the section content.

# Section 7: Skill and Workflow Migration

## Overview

This section migrates the SmartSpecPro skill execution engine and workflow code/HTTP node executors to use the OpenSandbox execution plane. Skills currently execute untrusted Python code via `child_process.spawn()` on the Node.js side and workflow code nodes use `RestrictedPython` with `signal.alarm()` on the Python side. Both patterns run user-supplied or user-triggered code directly in the application process, which is a security risk in a multi-tenant environment.

After this migration:
- Skills with `sandbox-*` execution modes dispatch to the OpenSandbox sandbox job system
- Workflow code nodes execute in an isolated sandbox with full library access (pandas, numpy, etc.) instead of the restricted RestrictedPython environment
- Workflow HTTP nodes for external requests route through sandbox for egress control
- Legacy paths remain functional behind the `OPENSANDBOX_ENABLED` feature flag for rollback safety

### Dependencies

- **section-02-database-schema**: The `skills` table extensions (`sandboxProfileSlug`, `requiresNetwork`, `requiresBrowser`, `maxRuntimeSeconds`, `maxInputMb`) and the `sandbox_jobs` / `sandbox_profiles` tables must exist
- **section-03-python-sdk-client**: The `SandboxBackend` protocol, client, lifecycle, execution, and files modules in `python-backend/app/integrations/opensandbox/` must be implemented
- **section-04-python-services**: The sandbox dispatcher, profile service, artifact service, and Celery sandbox job worker must be operational
- **section-05-nodejs-router-services**: The Node.js dispatch service (`apps/web/server/services/sandbox/dispatchService.ts`) and cost estimator must be implemented

---

## Tests (Write First)

### 7.1 TypeScript Tests -- Skill Execution Mode Extension

**File**: `/home/dev/projects/SmartSpecPro/packages/skills/src/__tests__/types.test.ts`

Tests for the extended `SkillDefinition.executionMode` type:

```typescript
/**
 * Test: New execution modes accepted by SkillDefinition type
 * - 'sandbox-code', 'sandbox-command', 'sandbox-browser',
 *   'sandbox-file', 'sandbox-media' are valid executionMode values
 * - 'core-text' is accepted as the new canonical name for 'llm-only'
 */

/**
 * Test: Backward compatibility -- 'llm-only' still compiles as valid executionMode
 */

/**
 * Test: Backward compatibility -- 'media-generate' still compiles as valid executionMode
 */

/**
 * Test: Backward compatibility -- 'python' still compiles as valid executionMode
 */
```

### 7.2 TypeScript Tests -- Skill Executor Modification

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/skillExecutor.sandbox.test.ts`

Tests for the modified `executeSkill()` function:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("skillExecutor sandbox dispatch", () => {
  /**
   * Test: Skills with executionMode 'core-text' use existing LLM path
   * - Mock a skill with executionMode: 'core-text'
   * - Call executeSkill()
   * - Assert it returns a text result (same behavior as 'llm-only')
   * - Assert sandbox dispatchService is NOT called
   */

  /**
   * Test: Skills with executionMode 'sandbox-code' dispatch to sandbox
   * - Mock a skill with executionMode: 'sandbox-code'
   * - Mock the sandbox dispatchService.dispatch() to return a job ID
   * - Call executeSkill()
   * - Assert dispatchService.dispatch() was called with correct params
   *   (feature_type: 'skill', execution_mode: 'sandbox-code', skill slug, input data)
   * - Assert result contains jobId for polling
   */

  /**
   * Test: Skills with executionMode 'sandbox-command' dispatch to sandbox
   * - Same pattern as sandbox-code but with execution_mode: 'sandbox-command'
   */

  /**
   * Test: Skills with executionMode 'sandbox-browser' dispatch to sandbox
   * - Same pattern but with execution_mode: 'sandbox-browser'
   */

  /**
   * Test: Skills with executionMode 'sandbox-media' dispatch to sandbox
   * - Mock a skill with executionMode: 'sandbox-media'
   * - Verify it dispatches to sandbox path (not the legacy media generation path)
   */

  /**
   * Test: Skills with legacy 'llm-only' mode still route to LLM path
   * - Existing behavior must be preserved
   * - executionMode: 'llm-only' maps to same behavior as 'core-text'
   */

  /**
   * Test: Skills with legacy 'media-generate' mode route to sandbox when enabled
   * - When OPENSANDBOX_ENABLED=true, 'media-generate' behaves like 'sandbox-media'
   * - When OPENSANDBOX_ENABLED=false, 'media-generate' uses legacy media path
   */

  /**
   * Test: Skill input/output format unchanged for chat UI
   * - After sandbox dispatch, the response shape must still match SkillExecutionResult
   * - The chat UI polls for completion and gets the same result structure
   */

  /**
   * Test: Sandbox dispatch falls back to legacy when OPENSANDBOX_ENABLED=false
   * - Mock env OPENSANDBOX_ENABLED=false
   * - Skill with sandbox-code mode falls back to python subprocess execution
   */
});
```

### 7.3 Python Tests -- Workflow Code Node Migration

**File**: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_code_executor_sandbox.py`

Tests for the migrated `CodeExecutor`:

```python
"""Tests for CodeExecutor sandbox migration.

Markers: unit, sandbox
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

# Test: Code node executes in sandbox when OPENSANDBOX_ENABLED=true
# - Mock the sandbox client's execute_code() method
# - Provide code input and context
# - Assert sandbox.execute_code() called with the code string
# - Assert 'code-default' profile is used
# - Assert result contains 'result' and 'stdout' keys from sandbox response

# Test: Code node uses RestrictedPython when OPENSANDBOX_ENABLED=false
# - Mock OPENSANDBOX_ENABLED=False
# - Provide simple code: "result = 2 + 2"
# - Assert RestrictedPython exec path is used (not sandbox)
# - Assert result == 4

# Test: Sandbox uses code-default profile with code interpreter enabled
# - Mock the sandbox dispatch
# - Assert the profile_slug passed is 'code-default'
# - Assert execution_mode is 'code' (code interpreter)

# Test: Dependencies available in sandbox (pandas, numpy)
# - Mock sandbox execute_code() returning successful import result
# - Provide code that imports pandas and numpy
# - Assert no ImportError in sandbox response

# Test: Timeout handled by sandbox TTL instead of signal.alarm()
# - Mock a slow execution in sandbox
# - Assert timeout is passed to sandbox config, not signal.alarm()
# - Assert signal.alarm() is NOT called when sandbox enabled

# Test: Code execution failure returns error dict
# - Mock sandbox execute_code() returning non-zero exit code
# - Assert result is a ValueError or appropriate error

# Test: Fallback on sandbox failure when DISPATCH_MODE=optional
# - Mock sandbox client raising connection error
# - Assert fallback to RestrictedPython
# - Assert result still returned
```

### 7.4 Python Tests -- Workflow HTTP Node Migration

**File**: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_http_executor_sandbox.py`

Tests for the workflow HTTP node egress control:

```python
"""Tests for HTTPExecutor sandbox-based egress control.

Markers: unit, sandbox
"""
import pytest
from unittest.mock import AsyncMock, patch

# Test: External HTTP requests route through sandbox when enabled
# - Mock OPENSANDBOX_ENABLED=True
# - Provide an external URL (e.g., https://api.example.com/data)
# - Assert sandbox.run_command() is called with curl/wget command
# - Assert the sandbox profile is 'browser-default' with network allow

# Test: Egress allowlist enforced via tenant sandbox policy
# - Mock tenant policy with egress rules allowing only specific domains
# - Attempt request to blocked domain
# - Assert request is denied with egress policy violation error

# Test: Internal HTTP nodes (to trusted APIs) stay in core
# - Provide URL matching trusted API pattern (e.g., internal service URLs)
# - Assert sandbox is NOT used
# - Assert direct aiohttp request is made (existing HTTPExecutor behavior)

# Test: HTTP executor falls back to direct when sandbox disabled
# - Mock OPENSANDBOX_ENABLED=False
# - Provide external URL
# - Assert existing aiohttp-based execution is used
# - Assert security controls (blocked hosts, IP validation) still apply

# Test: Sandbox network policy set to 'allow' for HTTP nodes
# - Assert the sandbox config has networkDefaultAction='allow'
# - This is distinct from code-default profile which has networkDefaultAction='deny'
```

### 7.5 TypeScript Tests -- Skill Execution Mode Schema Validation

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/skillRegistry.sandbox.test.ts`

Tests for skill registry handling of new execution modes:

```typescript
import { describe, it, expect } from "vitest";

describe("skillRegistry sandbox execution modes", () => {
  /**
   * Test: Existing skills with executionMode 'llm-only' continue to work
   * - Load a mock DB skill with executionMode: 'llm-only'
   * - Convert via dbSkillToDefinition()
   * - Assert executionMode is preserved (or maps to 'core-text')
   */

  /**
   * Test: New skills with sandbox execution modes load correctly
   * - Load a mock DB skill with executionMode: 'sandbox-code'
   * - Convert via dbSkillToDefinition()
   * - Assert executionMode is 'sandbox-code'
   */

  /**
   * Test: Skill with sandboxProfileSlug loads profile reference
   * - Load a mock DB skill with sandboxProfileSlug: 'code-default'
   * - Assert the SkillDefinition carries the profile slug
   */
});
```

---

## Implementation Details

### 7.A -- Extend the SkillDefinition Type

**File**: `/home/dev/projects/SmartSpecPro/packages/skills/src/types.ts`

The current `executionMode` on `SkillDefinition` is typed as:

```typescript
executionMode?: "llm-only" | "media-generate" | "python";
```

Extend this union to include the new sandbox modes:

```typescript
executionMode?:
  | "llm-only"           // Legacy name, maps to core-text
  | "core-text"          // LLM-only text processing (canonical)
  | "media-generate"     // Legacy name, maps to sandbox-media when enabled
  | "python"             // Legacy subprocess execution
  | "sandbox-code"       // Python/Node code execution in sandbox
  | "sandbox-command"    // Shell command execution in sandbox
  | "sandbox-browser"    // Browser automation in sandbox
  | "sandbox-file"       // File processing in sandbox
  | "sandbox-media";     // Media generation in sandbox
```

Also add optional sandbox-related fields to `SkillDefinition`:

```typescript
/** Sandbox profile slug from sandbox_profiles table */
sandboxProfileSlug?: string;

/** Whether this skill requires network access in sandbox */
requiresNetwork?: boolean;

/** Whether this skill requires browser access in sandbox */
requiresBrowser?: boolean;

/** Max runtime in seconds for sandbox execution */
maxRuntimeSeconds?: number;

/** Max input size in MB for sandbox execution */
maxInputMb?: number;
```

### 7.B -- Update the Database Skills Table Mapping

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/skillRegistry.ts`

The `dbSkillToDefinition()` function (around line 69) converts database rows to `SkillDefinition` objects. Currently it reads `executionMode` at line 104:

```typescript
executionMode: (dbSkill.executionMode as any) || "llm-only",
```

Update this function to also map the new sandbox columns added in section-02. The function's input parameter type (the anonymous object starting around line 47) needs to accept the new nullable columns: `sandboxProfileSlug`, `requiresNetwork`, `requiresBrowser`, `maxRuntimeSeconds`, `maxInputMb`.

Map them into the returned `SkillDefinition`:

```typescript
sandboxProfileSlug: dbSkill.sandboxProfileSlug ?? undefined,
requiresNetwork: dbSkill.requiresNetwork ?? undefined,
requiresBrowser: dbSkill.requiresBrowser ?? undefined,
maxRuntimeSeconds: dbSkill.maxRuntimeSeconds ?? undefined,
maxInputMb: dbSkill.maxInputMb ?? undefined,
```

The `executionMode` cast should accommodate the new values. Since the DB column is `varchar(50)`, all string values pass through. The existing cast `(dbSkill.executionMode as any)` already handles unknown values, but the type should now include the sandbox modes for type safety.

### 7.C -- Modify the Skill Executor

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/skillExecutor.ts`

The `executeSkill()` function (line 105) currently routes by `executionMode`:

1. `"python"` -> `executePythonSkill()` (line 134)
2. `"llm-only"` or `"enhance-prompt"` -> returns text for LLM processing (line 140)
3. Falls through to media generation by `skill.type` (line 151)

Add a new routing branch BEFORE the existing routes (after rate limit check, before the `python` check) that handles sandbox execution modes:

```typescript
// Sandbox execution modes — dispatch to OpenSandbox when enabled
if (executionMode?.startsWith("sandbox-") || 
    (executionMode === "media-generate" && isSandboxEnabled())) {
  return await dispatchToSandbox(skill, params, userId);
}
```

The `dispatchToSandbox()` helper function should:
1. Import and call the dispatch service from `apps/web/server/services/sandbox/dispatchService.ts` (from section-05)
2. Map skill data to a sandbox job request: `{ featureType: "skill", executionMode, skillSlug: skill.id, inputs: params, profileSlug: skill.sandboxProfileSlug }`
3. Return a `SkillExecutionResult` with `type: "sandbox-job"` and the `jobId` for client polling
4. If sandbox dispatch fails and `DISPATCH_MODE=optional`, fall back to the legacy path

Add backward compatibility for `core-text`:

```typescript
// core-text is the canonical name for llm-only
if (executionMode === "core-text" || executionMode === "llm-only" || executionMode === "enhance-prompt") {
  // existing LLM text path
}
```

The `SkillExecutionResult` type may need a new variant. Currently defined with `type: "text" | "image" | "video" | "audio"`. Add `"sandbox-job"` as a valid type, with an optional `jobId` field for polling:

```typescript
interface SkillExecutionResult {
  success: boolean;
  skillId: string;
  type: "text" | "image" | "video" | "audio" | "sandbox-job";
  message?: string;
  error?: string;
  jobId?: string;  // For sandbox-job type, client polls this
}
```

The `isSandboxEnabled()` helper reads `process.env.OPENSANDBOX_ENABLED`:

```typescript
function isSandboxEnabled(): boolean {
  return process.env.OPENSANDBOX_ENABLED === "true";
}
```

### 7.D -- Migrate Workflow Code Node Executor

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/code_executor.py`

The current `CodeExecutor.execute()` method (line 28) uses `RestrictedPython` with `signal.alarm()` for timeout. The migration adds a sandbox execution path while keeping the RestrictedPython path as fallback.

Modify the `execute()` method to check `OPENSANDBOX_ENABLED` at the top:

```python
async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
    code = data.inputs.get("code", "").strip()
    input_data = data.inputs.get("input")
    timeout = int(data.inputs.get("timeout", 30))

    if not code:
        raise ValueError("Python code is required")

    # Route to sandbox when enabled
    if self._is_sandbox_enabled():
        return await self._execute_in_sandbox(code, input_data, timeout, context)

    # Legacy: RestrictedPython path (unchanged)
    return self._execute_restricted(code, input_data, timeout)
```

The `_execute_in_sandbox()` method:
1. Imports the sandbox dispatcher service from section-04
2. Creates a sandbox job request with profile `code-default`, execution mode `code`
3. Writes the user code as input to the sandbox via the code interpreter API
4. Passes `input_data` as a JSON file staged into the sandbox
5. Collects the result (the `result` variable and `stdout`)
6. Returns the same `{"result": ..., "stdout": ...}` dict format

The `_execute_restricted()` method contains the existing RestrictedPython logic (extracted from the current `execute()` body, lines 55-110).

The `_is_sandbox_enabled()` method reads from settings:

```python
def _is_sandbox_enabled(self) -> bool:
    """Check if sandbox execution is enabled."""
    from app.integrations.opensandbox.config import get_settings
    settings = get_settings()
    return settings.OPENSANDBOX_ENABLED
```

Key differences between sandbox and RestrictedPython execution:
- Sandbox allows full Python stdlib and pre-installed libraries (pandas, numpy, etc.)
- Sandbox timeout is managed by container TTL, not `signal.alarm()` (which is process-level and unreliable in async)
- Sandbox provides proper isolation; RestrictedPython relies on AST restrictions which have known bypasses
- Sandbox captures stdout/stderr separately; RestrictedPython uses `redirect_stdout`

### 7.E -- Migrate Workflow HTTP Node Executor

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/integration_executors/http_executor.py`

The current `HTTPExecutor` (line 15) makes external HTTP requests with security controls (blocked hosts/IPs, timeout, SSL verification). The migration routes external requests through the sandbox for egress control while keeping internal/trusted requests on the direct path.

Add a sandbox routing check at the top of `execute()`:

```python
async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
    url = data.inputs.get("url")
    # ... existing input parsing ...

    # Route external requests through sandbox for egress control
    if self._is_sandbox_enabled() and self._is_external_url(url):
        return await self._execute_via_sandbox(data, context, url, method, headers, body, query_params, timeout)

    # Legacy: direct aiohttp path (for internal URLs or when sandbox disabled)
    return await self._execute_direct(url, method, headers, body, query_params, timeout, allow_redirects)
```

The `_is_external_url()` method determines if a URL targets an external service (returns True) versus an internal/trusted API (returns False). Internal URLs match patterns like `localhost`, `127.0.0.1`, or known internal service hostnames. This reuses the existing `BLOCKED_HOSTS` logic but inverts it -- blocked hosts are internal and should NOT go through sandbox.

The `_execute_via_sandbox()` method:
1. Uses the `browser-default` sandbox profile (network allowed)
2. Constructs a `curl` command with the request parameters
3. Applies per-tenant egress rules from `tenant_sandbox_policies.egressRulesJson`
4. Executes via `sandbox.run_command()`
5. Parses the curl output into the same response format `{"status_code", "headers", "body", "url"}`

The `_execute_direct()` method contains the existing aiohttp execution logic (extracted from the current `execute()` body, lines 64-100).

### 7.F -- Skill Frontmatter Schema Updates

**File**: `/home/dev/projects/SmartSpecPro/packages/skills/src/types.ts`

The `SkillMetadata` interface (parsed from `skill.md` YAML frontmatter) needs new optional fields:

```typescript
export interface SkillMetadata {
  // ... existing fields ...
  
  /** Execution mode override (sandbox-code, sandbox-command, etc.) */
  execution_mode?: string;
  executionMode?: string;  // camelCase alias (already partially supported)
  
  /** Sandbox profile slug to use for this skill */
  sandbox_profile?: string;
  
  /** Whether skill needs network access in sandbox */
  requires_network?: boolean;
  
  /** Whether skill needs browser in sandbox */
  requires_browser?: boolean;
  
  /** Max runtime override in seconds */
  max_runtime_seconds?: number;
  
  /** Max input size override in MB */
  max_input_mb?: number;
}
```

The skill registry's `syncSkillFromDisk()` and `loadSkillsFromDatabase()` functions (in `/home/dev/projects/SmartSpecPro/apps/web/server/services/skillRegistry.ts`) already parse frontmatter metadata. The new fields need to be mapped during sync:

```typescript
// In the skill sync logic that writes to DB:
sandboxProfileSlug: metadata.sandbox_profile ?? null,
requiresNetwork: metadata.requires_network ?? null,
requiresBrowser: metadata.requires_browser ?? null,
maxRuntimeSeconds: metadata.max_runtime_seconds ?? null,
maxInputMb: metadata.max_input_mb ?? null,
```

### 7.G -- Backward Compatibility Mapping

To ensure zero disruption during rollout, the skill executor must maintain these backward compatibility mappings:

| Legacy Value | New Canonical Value | Behavior When Sandbox Enabled | Behavior When Sandbox Disabled |
|---|---|---|---|
| `llm-only` | `core-text` | LLM text path (unchanged) | LLM text path (unchanged) |
| `enhance-prompt` | `core-text` | LLM text path (unchanged) | LLM text path (unchanged) |
| `media-generate` | `sandbox-media` | Sandbox dispatch | Legacy media generation path |
| `python` | `python` (no change yet) | Legacy subprocess (not migrated in this section) | Legacy subprocess |

The `media-generate` -> `sandbox-media` migration is the most impactful because it changes how media skills dispatch. The feature flag `SANDBOX_REQUIRE_FOR_MEDIA` (from section-11) controls whether this mapping is enforced. When the flag is `false`, `media-generate` continues using the legacy path even if `OPENSANDBOX_ENABLED=true`.

### 7.H -- Error Handling and Fallback

When sandbox dispatch fails, the executor behavior depends on `OPENSANDBOX_DISPATCH_MODE`:

- **`optional`** (default during rollout): Log the sandbox error, fall back to legacy execution path. For `sandbox-code` skills, this means falling back to the `executePythonSkill()` subprocess path. For `sandbox-media`, falling back to the media generation service.

- **`required`** (production hardening): Return an error to the user. Do not fall back. The error message should be user-friendly via the status projection (section-05): "Secure execution environment temporarily unavailable. Please try again later."

All sandbox dispatch failures are logged to the JSONL audit log with event type `sandbox_dispatch_failed`, including the skill slug, execution mode, error details, and whether fallback was used.

---

## Files Modified (Summary)

| File | Change |
|---|---|
| `/home/dev/projects/SmartSpecPro/packages/skills/src/types.ts` | Extend `SkillDefinition.executionMode` union type, add sandbox fields to `SkillDefinition` and `SkillMetadata` |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/skillExecutor.ts` | Add sandbox dispatch routing branch, backward compatibility mapping, `isSandboxEnabled()` helper, `dispatchToSandbox()` function, extend `SkillExecutionResult` type |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/skillRegistry.ts` | Map new DB columns (`sandboxProfileSlug`, `requiresNetwork`, etc.) in `dbSkillToDefinition()`, update sync logic for new frontmatter fields |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/code_executor.py` | Add sandbox execution path, refactor RestrictedPython into `_execute_restricted()`, add `_execute_in_sandbox()` and `_is_sandbox_enabled()` |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/integration_executors/http_executor.py` | Add sandbox routing for external URLs, refactor direct aiohttp into `_execute_direct()`, add `_execute_via_sandbox()` and `_is_external_url()` |

## Files Created (Summary)

| File | Purpose |
|---|---|
| `/home/dev/projects/SmartSpecPro/packages/skills/src/__tests__/types.test.ts` | Type-level tests for extended execution modes |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/skillExecutor.sandbox.test.ts` | Skill executor sandbox dispatch tests |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/skillRegistry.sandbox.test.ts` | Skill registry sandbox mode mapping tests |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_code_executor_sandbox.py` | Code executor sandbox migration tests |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_http_executor_sandbox.py` | HTTP executor sandbox egress control tests |

---

## Implementation Checklist

1. Write all test files listed above (tests first, expect them to fail initially)
2. Extend the `SkillDefinition` type in `packages/skills/src/types.ts` (7.A)
3. Update `dbSkillToDefinition()` in `skillRegistry.ts` to map new columns (7.B)
4. Add sandbox dispatch routing to `skillExecutor.ts` (7.C)
5. Refactor `CodeExecutor` in `code_executor.py` with sandbox path (7.D)
6. Refactor `HTTPExecutor` in `http_executor.py` with sandbox routing (7.E)
7. Update `SkillMetadata` for new frontmatter fields (7.F)
8. Run TypeScript tests: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test`
9. Run Python tests: `cd /home/dev/projects/SmartSpecPro/python-backend && pytest -m sandbox`
10. Run TypeScript type check: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check`
11. Verify existing skill tests still pass (regression): `cd /home/dev/projects/SmartSpecPro/python-backend && pytest tests/integration/test_workflow_executors.py`