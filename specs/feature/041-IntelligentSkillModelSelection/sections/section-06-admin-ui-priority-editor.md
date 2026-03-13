# Section 06: Admin UI -- Priority Quick-Edit

## Implementation Status: COMPLETE

## Overview

Added inline priority editor to the admin Model Mappings panel. Key implementations:
1. `PriorityInlineEditor` component — number input (0-999), optimistic updates, Lock/Info icons with tooltips
2. `priorityLocked: boolean` added to `AdminModelMappingRow` and `AdminModelCatalogRow` frontend types
3. Priority ASC secondary sort in `filterAdminModelCatalogRows()`
4. Enter key support + integer validation (Math.round) from review fixes
5. Fixed stale closure bug in onSuccess — captured submitted value at call-site

**Depends on:** Section 05 (the `updateModelPriority` tRPC mutation must exist), Section 01 (the `priorityLocked` column must exist in `model_provider_map`).

### Tests: 8 passing (2 new sort tests, 6 existing with updated fixtures)

### Code review deviations from plan
- Fixed stale closure in onSuccess by moving callback to mutation.mutate() second arg
- Added Enter key handler for keyboard submit (reviewer fix)
- Added Math.round() for integer validation (reviewer fix)
- Component tests (8 stubs in plan) deferred — require JSDOM + tRPC mock provider setup

## Files to Modify

| File | Action |
|---|---|
| `apps/web/client/src/components/admin/MultiProviderAdmin.tsx` | Add inline priority input, lock/info icons, mutation hook |
| `apps/web/client/src/components/admin/multiProviderAdminModelMappings.ts` | Add `priorityLocked` to types, add priority as secondary sort in `filterAdminModelCatalogRows()` |
| `apps/web/client/src/components/admin/multiProviderAdminModelMappings.test.ts` | Add tests for secondary sort and new type field |

---

## Tests First

### Test file: `apps/web/client/src/components/admin/multiProviderAdminModelMappings.test.ts`

Add these tests to the existing file alongside the current tests:

```typescript
describe("filterAdminModelCatalogRows — priority secondary sort", () => {
  it("sorts by modelName first, then by priority ASC as tiebreaker", () => {
    const rows: AdminModelCatalogRow[] = [
      {
        mappingId: 1,
        isMapped: true,
        modelId: "gpt-4o",
        providerId: 10,
        providerName: "openai",
        providerDisplayName: "OpenAI",
        modelName: "GPT-4o",
        providerModelId: "gpt-4o",
        pricingInput: "2.5",
        pricingOutput: "10",
        isFree: false,
        contextLength: 128000,
        isEnabled: true,
        priority: 50,
        priorityLocked: false,
        apiStyle: "chat-completions",
      },
      {
        mappingId: 2,
        isMapped: true,
        modelId: "gpt-4o",
        providerId: 20,
        providerName: "openrouter",
        providerDisplayName: "OpenRouter",
        modelName: "GPT-4o",
        providerModelId: "openai/gpt-4o",
        pricingInput: "2.5",
        pricingOutput: "10",
        isFree: false,
        contextLength: 128000,
        isEnabled: true,
        priority: 10,
        priorityLocked: true,
        apiStyle: "chat-completions",
      },
    ];

    const result = filterAdminModelCatalogRows(rows, "", "all");
    // Same modelName "GPT-4o" — tiebreak by priority ASC
    expect(result[0]!.mappingId).toBe(2); // priority 10
    expect(result[1]!.mappingId).toBe(1); // priority 50
  });

  it("does not change order when modelNames differ (primary sort wins)", () => {
    const rows: AdminModelCatalogRow[] = [
      {
        mappingId: 1,
        isMapped: true,
        modelId: "zeta-model",
        providerId: 10,
        providerName: "provider-a",
        modelName: "Zeta",
        providerModelId: "zeta",
        pricingInput: "0",
        pricingOutput: "0",
        isFree: true,
        contextLength: 4096,
        isEnabled: true,
        priority: 1,
        priorityLocked: false,
        apiStyle: "chat-completions",
      },
      {
        mappingId: 2,
        isMapped: true,
        modelId: "alpha-model",
        providerId: 10,
        providerName: "provider-a",
        modelName: "Alpha",
        providerModelId: "alpha",
        pricingInput: "0",
        pricingOutput: "0",
        isFree: true,
        contextLength: 4096,
        isEnabled: true,
        priority: 99,
        priorityLocked: true,
        apiStyle: "chat-completions",
      },
    ];

    const result = filterAdminModelCatalogRows(rows, "", "all");
    expect(result[0]!.modelName).toBe("Alpha"); // name sort first
    expect(result[1]!.modelName).toBe("Zeta");
  });
});
```

### Component test stubs: `MultiProviderAdmin priority editor`

```typescript
describe("MultiProviderAdmin priority editor", () => {
  it("renders priority input for each model row");
  // Render a mapping row with priority=25.
  // Assert: an input[type=number] exists with value "25".

  it("shows lock icon when priorityLocked=true");
  // Render a mapping row with priorityLocked=true.
  // Assert: an element with data-testid="priority-locked-icon" is present.

  it("shows info icon when priorityLocked=false");
  // Render a mapping row with priorityLocked=false.
  // Assert: an element with data-testid="priority-auto-icon" is present.

  it("calls updateModelPriority on blur with new value");
  // Render with priority=25.
  // Change input to 42, then blur.
  // Assert: mutation was called with { mappingId, priority: 42 }.

  it("does not call mutation if value unchanged");
  // Render with priority=25.
  // Focus input, then blur without changing value.
  // Assert: mutation was NOT called.

  it("shows optimistic update immediately");
  // Render with priority=25.
  // Change to 42 and blur.
  // Before mutation resolves, assert input shows 42.

  it("reverts to old value on mutation error");
  // Configure mutation to reject.
  // Change value from 25 to 42 and blur.
  // After error, assert input reverts to 25.

  it("tooltip text correct for locked vs unlocked");
  // Render with priorityLocked=true.
  // Assert: tooltip text includes "Manually set".
  // Render with priorityLocked=false.
  // Assert: tooltip text includes "Auto-assigned".
});
```

---

## Implementation Details

### Step 1: Extend types in `multiProviderAdminModelMappings.ts`

Add `priorityLocked: boolean` to both `AdminModelMappingRow` and `AdminModelCatalogRow` interfaces (after the existing `priority: number` field).

### Step 2: Add priority as secondary sort in `filterAdminModelCatalogRows()`

Modify the `.sort()` callback. Currently the sort chain is: `modelName` -> `providerDisplayName` -> `providerModelId`. Insert a priority sort step between `modelName` and `providerDisplayName`:

```typescript
export function filterAdminModelCatalogRows(
  rows: AdminModelCatalogRow[] | undefined,
  searchQuery: string,
  providerFilter: string,
): AdminModelCatalogRow[] {
  return (rows ?? [])
    .filter((row) => matchesModelMappingFilters(row, searchQuery, providerFilter))
    .sort((left, right) => {
      const nameCompare = left.modelName.localeCompare(right.modelName);
      if (nameCompare !== 0) {
        return nameCompare;
      }

      // NEW: priority ASC as secondary sort (lower = higher priority)
      const priorityCompare = left.priority - right.priority;
      if (priorityCompare !== 0) {
        return priorityCompare;
      }

      const providerCompare = (left.providerDisplayName ?? left.providerName).localeCompare(
        right.providerDisplayName ?? right.providerName,
      );
      if (providerCompare !== 0) {
        return providerCompare;
      }

      return left.providerModelId.localeCompare(right.providerModelId);
    });
}
```

### Step 3: Update existing test fixtures

In the existing test file `multiProviderAdminModelMappings.test.ts`, add `priorityLocked: false` to every fixture row. This is required because the type now includes it.

### Step 4: Backend -- Ensure `priorityLocked` is returned by listing queries

The `listModelMappings` query in `apps/web/server/routers/multiProvider.ts` must include `priorityLocked` in its SELECT. Add:

```typescript
priorityLocked: modelProviderMap.priorityLocked,
```

Similarly, `listAdminModelCatalog` must include `priorityLocked`. For unmapped catalog rows, set `priorityLocked: false` (default).

### Step 5: Add `PriorityInlineEditor` sub-component to `MultiProviderAdmin.tsx`

Add imports:

```typescript
import { Lock, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/tooltip";
```

Create internal component:

```typescript
function PriorityInlineEditor({
  mappingId,
  priority,
  priorityLocked,
  onMutationSuccess,
}: {
  mappingId: number;
  priority: number;
  priorityLocked: boolean;
  onMutationSuccess: () => void;
}) {
  const [localValue, setLocalValue] = useState(String(priority));
  const [lastSaved, setLastSaved] = useState(priority);

  // Sync from props when external data changes
  useEffect(() => {
    setLocalValue(String(priority));
    setLastSaved(priority);
  }, [priority]);

  const mutation = trpc.multiProvider.updateModelPriority.useMutation({
    onSuccess: () => {
      onMutationSuccess();
      setLastSaved(Number(localValue));
    },
    onError: () => {
      // Revert optimistic update
      setLocalValue(String(lastSaved));
      toast.error("Failed to update priority");
    },
  });

  const handleBlur = () => {
    const numValue = Number(localValue);
    if (isNaN(numValue) || numValue < 0 || numValue > 999) {
      setLocalValue(String(lastSaved));
      return;
    }
    if (numValue === lastSaved) {
      return; // No change — do not call mutation
    }
    mutation.mutate({ mappingId, priority: numValue });
  };

  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs text-muted-foreground">Priority:</span>
      <input
        type="number"
        min={0}
        max={999}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        className="w-14 rounded border border-input bg-transparent px-1 py-0.5 text-xs text-center"
        aria-label="Priority"
      />
      <Tooltip>
        <TooltipTrigger asChild>
          {priorityLocked ? (
            <Lock size={14} className="text-muted-foreground" data-testid="priority-locked-icon" />
          ) : (
            <Info size={14} className="text-muted-foreground" data-testid="priority-auto-icon" />
          )}
        </TooltipTrigger>
        <TooltipContent>
          {priorityLocked
            ? "Manually set. Re-import won't change this."
            : "Auto-assigned."}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}
```

### Step 6: Replace static priority text with `PriorityInlineEditor`

In two locations where priority is displayed as static text, replace with:

```tsx
{mapping.mappingId != null && (
  <PriorityInlineEditor
    mappingId={mapping.mappingId}
    priority={mapping.priority}
    priorityLocked={mapping.priorityLocked ?? false}
    onMutationSuccess={invalidateMappingQueries}
  />
)}
{mapping.mappingId == null && (
  <span className="text-xs text-muted-foreground">Priority: {mapping.priority}</span>
)}
```

For unmapped catalog rows (where `mappingId` is null), keep the static text since there is no DB row to update.

### Step 7: Cache invalidation hook

The `PriorityInlineEditor` receives `onMutationSuccess` which should trigger cache invalidation. Use or extend the existing `invalidateMappingQueries`:

```typescript
const utils = trpc.useUtils();

const invalidateMappingQueries = async () => {
  await Promise.all([
    utils.multiProvider.listModelMappings.invalidate(),
    utils.multiProvider.listAdminModelCatalog.invalidate(),
  ]);
};
```

---

## Available UI Primitives

- `Tooltip`, `TooltipContent`, `TooltipTrigger` from `@/components/ui/tooltip` (Radix-based, already used elsewhere)
- `Lock`, `Info` icons from `lucide-react` (already a project dependency)
- `toast` from `sonner` (already imported in the file)
- tRPC mutation shape (from Section 05): `multiProvider.updateModelPriority` accepts `{ mappingId: number, priority: number }` and returns `{ success: true, mapping: <updated row> }`. It sets `priorityLocked = true` on the database row.

---

## Verification Checklist

- [ ] `AdminModelMappingRow` and `AdminModelCatalogRow` include `priorityLocked: boolean`
- [ ] `filterAdminModelCatalogRows()` sorts by priority ASC as secondary sort after modelName
- [ ] Existing tests in `multiProviderAdminModelMappings.test.ts` updated with `priorityLocked` field in fixtures
- [ ] New sort tests pass
- [ ] `listModelMappings` and `listAdminModelCatalog` return `priorityLocked` from the server
- [ ] `PriorityInlineEditor` renders number input with current priority value
- [ ] Lock icon shown when `priorityLocked=true`, Info icon when `false`
- [ ] Tooltip text: "Manually set. Re-import won't change this." vs "Auto-assigned."
- [ ] On blur with changed value: calls `updateModelPriority` mutation
- [ ] On blur with unchanged value: no mutation call
- [ ] On mutation error: reverts to previous value and shows error toast
- [ ] Cache invalidation fires on successful mutation
- [ ] `pnpm check` passes (TypeScript compiles)
- [ ] `pnpm test` passes (no regressions in existing tests)
