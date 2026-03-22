The executors directory does not exist yet (this is a new feature), and section-01 has not been written yet. I have all the context I need from the planning documents. Let me produce the section content.

# Section 02: Executor Registry

## Overview

This section implements the hybrid executor registry that manages capability-based executor lookup. The registry holds static base executors registered at module initialization and supports dynamic extension via `registerExecutor()`. It is the central lookup mechanism used by the Unified Orchestrator (section-06) to find the correct executor for a given capability family.

**File to create:** `apps/web/server/services/executors/executorRegistry.ts`
**Test file to create:** `apps/web/server/services/__tests__/executorRegistry.test.ts`
**Estimated size:** ~80 lines (registry), ~120 lines (tests)

## Dependencies

- **section-01-types-and-contract** (must be completed first): Provides `CapabilityFamily`, `CapabilityExecutor`, `RouteDecision` types from `apps/web/server/services/executors/types.ts`.
- No other sections are required. Sections 05, 11, and 12 will register their executors with this registry but do not need to exist yet.

## Blocked By This Section

- **section-06-unified-orchestrator**: Uses `getExecutor()` to find the handler for a classified capability.
- **section-11-image-executor**: Registers `ImageGenerationExecutor` with this registry.
- **section-12-video-audio-executors**: Registers `VideoGenerationExecutor` and `AudioGenerationExecutor`.
- **section-13-media-routing-integration**: Updates registry to include all media executors.

## Design

### Registry Behavior

1. **Internal storage:** A `Map<CapabilityFamily, CapabilityExecutor>` keyed by capability family. Each executor declares one or more capabilities; each capability maps to exactly one executor.

2. **Static base executors:** Registered synchronously at module load time. Initially the registry is empty -- executors self-register by calling `registerExecutor()` from their own module's top-level scope. The registry module itself does NOT import executor implementations to avoid circular dependencies.

3. **`registerExecutor(executor: CapabilityExecutor)`:** Iterates `executor.capabilities` and maps each to the executor. If a capability is already registered, the existing mapping is preserved (first-registered wins) unless `override: true` is passed.

4. **`getExecutor(capability: CapabilityFamily, route?: RouteDecision): CapabilityExecutor | null`:**
   - Looks up the capability in the map.
   - If found, calls `executor.canHandle(route)` to confirm suitability. If `canHandle` returns `false`, falls through to fallback.
   - If no direct match, falls back to the executor registered for `"writing.article"` (the `TextSkillExecutor`) as the universal default for text-like capabilities.
   - Returns `null` only if no executor exists at all (should not happen after initialization).

5. **`getAllExecutors(): CapabilityExecutor[]`:** Returns deduplicated list of all registered executors (useful for diagnostics/telemetry).

6. **`hasExecutor(capability: CapabilityFamily): boolean`:** Quick existence check without `canHandle` verification.

### Thread Safety

The registry is a module-level singleton. All static registrations happen synchronously during module load (Node.js single-threaded initialization), so there are no race conditions. Dynamic registrations after startup are additive and do not remove existing entries.

## Tests First

**File:** `apps/web/server/services/__tests__/executorRegistry.test.ts`

All tests use Vitest. Mock executors are created inline -- they do not depend on real executor implementations.

```
Test: registerExecutor adds executor to registry and it is retrievable by capability
  - Create a mock executor with id "mock-text", capabilities ["writing.article"], canHandle returns true.
  - Call registerExecutor(mockExecutor).
  - Call getExecutor("writing.article") and assert it returns the mock executor.

Test: getExecutor returns null for unregistered capability when no fallback exists
  - On a fresh (cleared) registry with no executors registered.
  - Call getExecutor("orchestration.swarm") and assert it returns null.

Test: getExecutor returns TextSkillExecutor as fallback for unknown text-like capabilities
  - Register a mock executor for "writing.article" (the default fallback target).
  - Call getExecutor("skill_factory.create") where no executor is registered for that capability.
  - Assert it returns the "writing.article" executor as fallback.

Test: static executors are available immediately after module load
  - Import the registry module.
  - Verify that calling getAllExecutors() returns an array (may be empty if no executor modules imported yet -- this test verifies the registry itself initializes without error).

Test: dynamic registration does not override static executors by default
  - Register executor A for "media.image".
  - Register executor B for "media.image" (without override flag).
  - Call getExecutor("media.image") and assert it returns executor A (first registered wins).

Test: dynamic registration with override replaces existing executor
  - Register executor A for "media.image".
  - Register executor B for "media.image" with override: true.
  - Call getExecutor("media.image") and assert it returns executor B.

Test: canHandle is called on candidate executors to confirm match
  - Register a mock executor for "writing.review" where canHandle returns false.
  - Register a fallback executor for "writing.article" where canHandle returns true.
  - Call getExecutor("writing.review", routeDecision) and assert it falls through to the "writing.article" fallback because the primary executor's canHandle returned false.

Test: multiple capabilities on one executor are all registered
  - Create a mock executor with capabilities ["writing.article", "writing.review"].
  - Call registerExecutor(mockExecutor).
  - Assert getExecutor("writing.article") returns the executor.
  - Assert getExecutor("writing.review") returns the same executor.

Test: getAllExecutors returns deduplicated list
  - Register executor A for ["writing.article", "writing.review"].
  - Register executor B for ["media.image"].
  - Call getAllExecutors() and assert length is 2 (not 3).

Test: hasExecutor returns true for registered capability
  - Register an executor for "media.video".
  - Assert hasExecutor("media.video") is true.
  - Assert hasExecutor("orchestration.swarm") is false.

Test: clearRegistry removes all executors (test utility only)
  - Register an executor.
  - Call clearRegistry().
  - Assert getAllExecutors() returns empty array.
```

### Test Setup Pattern

Each test should call `clearRegistry()` in a `beforeEach` to ensure test isolation. The `clearRegistry()` function is exported specifically for test use.

```typescript
// Pseudo-structure for test file
import { describe, it, expect, beforeEach } from "vitest";
import {
  registerExecutor,
  getExecutor,
  getAllExecutors,
  hasExecutor,
  clearRegistry,
} from "../executors/executorRegistry";
import type { CapabilityExecutor, RouteDecision } from "../executors/types";

function createMockExecutor(
  id: string,
  capabilities: CapabilityFamily[],
  canHandleResult = true
): CapabilityExecutor {
  return {
    id,
    capabilities,
    canHandle: () => canHandleResult,
    execute: async () => ({ /* minimal ExecutorResult stub */ }),
  };
}

beforeEach(() => {
  clearRegistry();
});
```

## Implementation Guidance

**File:** `apps/web/server/services/executors/executorRegistry.ts`

### Exports

```typescript
export function registerExecutor(
  executor: CapabilityExecutor,
  options?: { override?: boolean }
): void;

export function getExecutor(
  capability: CapabilityFamily,
  route?: RouteDecision
): CapabilityExecutor | null;

export function getAllExecutors(): CapabilityExecutor[];

export function hasExecutor(capability: CapabilityFamily): boolean;

export function clearRegistry(): void; // For tests only
```

### Internal State

- `const executorMap = new Map<CapabilityFamily, CapabilityExecutor>();` -- primary lookup.
- `const FALLBACK_CAPABILITY: CapabilityFamily = "writing.article";` -- constant for the default fallback target.

### `registerExecutor` Logic

- Iterate `executor.capabilities`.
- For each capability: if `executorMap.has(capability)` and `!options?.override`, skip (log a debug message). Otherwise, `executorMap.set(capability, executor)`.

### `getExecutor` Logic

1. `const executor = executorMap.get(capability);`
2. If `executor` exists and `(!route || executor.canHandle(route))`, return it.
3. If `executor` exists but `canHandle` returned false, or no executor found:
   - If `capability !== FALLBACK_CAPABILITY`, try `executorMap.get(FALLBACK_CAPABILITY)` as fallback.
   - If fallback exists and `(!route || fallback.canHandle(route))`, return fallback.
4. Return `null`.

### `getAllExecutors` Logic

- `return [...new Set(executorMap.values())];` -- deduplicate since one executor may be stored under multiple capability keys.

### Module Initialization

The registry module does NOT eagerly import any executor implementations. Executors register themselves when their modules are imported. The orchestrator module (section-06) will import the executor modules, triggering registration.

This avoids circular dependency issues: `executorRegistry.ts` depends only on `types.ts`, and each executor module depends on `executorRegistry.ts` + `types.ts`.

### Import Graph

```
types.ts  <── executorRegistry.ts
    ^              ^
    |              |
    ├── textSkillExecutor.ts ──> calls registerExecutor()
    ├── imageExecutor.ts ──> calls registerExecutor()
    ├── videoExecutor.ts ──> calls registerExecutor()
    └── audioExecutor.ts ──> calls registerExecutor()
```

## File Paths Summary

| File | Action |
|------|--------|
| `apps/web/server/services/executors/executorRegistry.ts` | Create |
| `apps/web/server/services/__tests__/executorRegistry.test.ts` | Create |

## Verification

```bash
cd /home/dev/projects/SmartSpecPro/apps/web && npx vitest run server/services/__tests__/executorRegistry.test.ts
```

All 11 tests listed above must pass. The registry must function correctly with mock executors before any real executor implementations (sections 05, 11, 12) are built.