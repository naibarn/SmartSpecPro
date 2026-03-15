# Section 05: updateModelPriority tRPC Mutation

## Implementation Status: COMPLETE

## Overview

This section adds four capabilities to `apps/web/server/routers/multiProvider.ts`:

1. **`updateModelPriority` mutation** — admin sets priority 0-999, always sets `priorityLocked = true`. Uses TRPCError NOT_FOUND for missing mappings.
2. **`backfillModelPriorities` mutation** — iterates `model_provider_map` rows where `priorityLocked = false`, computes priority via `computeModelPriority()`, updates row by row. Idempotent.
3. **`bulkSetAdminModelCatalogEnabled` modifications** — pre-loads providers' `availableModels` JSON, builds `Map<providerModelId, SyncedModel>` for O(1) lookup, computes priority for new entries. Uses `Array.isArray()` guard for JSON safety.
4. **`upsertModelMapping` modifications** — priority is now optional (0-999). INSERT: computes priority when omitted, sets `priorityLocked`. UPDATE: conditionally sets priority via typed spread (no `Record<string, any>`).
5. **Interface updates** — added `priorityLocked: boolean` to `ModelMappingListRow` and `AdminModelCatalogRow`. Added to SELECT queries and `mergeAdminModelCatalogRows` (default `false` for unmapped).

### Dependencies

- **Section 01** (DB Migration): `supportsVision` and `priorityLocked` columns must exist on `model_provider_map`.
- **Section 02** (Priority Scoring Service): `computeModelPriority()` must be exported from `apps/web/server/services/intelligentModelSelector.ts`.

### Files Modified

- `apps/web/server/routers/multiProvider.ts`
- `apps/web/server/routers/multiProvider.test.ts`

### Tests: 24 passing (6 new, 18 existing)

### Code review deviations from plan
- Used TRPCError instead of plain Error for not-found (reviewer fix)
- Used typed spread instead of `Record<string, any>` for conditional priority set (reviewer fix)
- Added Array.isArray guard for availableModels JSON (reviewer fix)
- Boundary value tests (priority > 999, < 0) not added — tRPC mock doesn't run Zod validation

---

## Tests (Write First)

Add the following test blocks to `apps/web/server/routers/multiProvider.test.ts`. These tests extend the existing file which already mocks `db`, `trpc`, `providerHealth`, and `costTracker`.

### New mock: `computeModelPriority`

At the top of the test file, alongside the existing `vi.hoisted()` block, add a mock for the intelligent model selector:

```typescript
const { mockComputeModelPriority } = vi.hoisted(() => ({
  mockComputeModelPriority: vi.fn().mockReturnValue(42),
}));

vi.mock("../services/intelligentModelSelector", () => ({
  computeModelPriority: mockComputeModelPriority,
}));
```

### Test: `updateModelPriority`

```typescript
describe("multiProvider.updateModelPriority", () => {
  it("updates priority and sets priorityLocked=true", async () => {
    const returningMock = vi.fn().mockResolvedValue([{
      id: 1,
      modelId: "gpt-4o",
      priority: 25,
      priorityLocked: true,
    }]);
    const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
    const setMock = vi.fn().mockReturnValue({ where: whereMock });
    mockDbUpdate.mockReturnValue({ set: setMock });

    const fn = multiProviderRouter.updateModelPriority as Function;
    const result = await fn({
      ctx: { user: { role: "admin" } },
      input: { mappingId: 1, priority: 25 },
    });

    expect(result.success).toBe(true);
    expect(result.mapping.priority).toBe(25);
    expect(result.mapping.priorityLocked).toBe(true);
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 25, priorityLocked: true })
    );
  });

  it("rejects priority > 999", async () => {
    const fn = multiProviderRouter.updateModelPriority as Function;
    await expect(
      fn({
        ctx: { user: { role: "admin" } },
        input: { mappingId: 1, priority: 1000 },
      })
    ).rejects.toThrow();
  });

  it("rejects priority < 0", async () => {
    const fn = multiProviderRouter.updateModelPriority as Function;
    await expect(
      fn({
        ctx: { user: { role: "admin" } },
        input: { mappingId: 1, priority: -1 },
      })
    ).rejects.toThrow();
  });

  it("requires admin role", () => {
    expect(multiProviderRouter.updateModelPriority).toBeDefined();
  });

  it("returns updated mapping in response", async () => {
    const updatedRow = {
      id: 5,
      modelId: "claude-sonnet-4",
      priority: 0,
      priorityLocked: true,
    };
    const returningMock = vi.fn().mockResolvedValue([updatedRow]);
    const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
    const setMock = vi.fn().mockReturnValue({ where: whereMock });
    mockDbUpdate.mockReturnValue({ set: setMock });

    const fn = multiProviderRouter.updateModelPriority as Function;
    const result = await fn({
      ctx: { user: { role: "admin" } },
      input: { mappingId: 5, priority: 0 },
    });

    expect(result.mapping).toEqual(updatedRow);
  });
});
```

### Test: `backfillModelPriorities`

```typescript
describe("multiProvider.backfillModelPriorities", () => {
  it("computes priority for all unlocked rows", async () => {
    const unlockedRows = [
      { id: 1, modelId: "gpt-4o", priority: 0, priorityLocked: false,
        pricingInput: "2.5", pricingOutput: "10", isFree: false,
        contextLength: 128000, supportsFunctionTools: true,
        supportsStructuredOutputs: true, supportsWebSearch: false,
        supportsCodeExecution: false, supportsComputerUse: false,
        supportsBackground: false, supportsResponses: true,
        supportsVision: true },
      { id: 2, modelId: "kimi-k2.5", priority: 0, priorityLocked: false,
        pricingInput: "0", pricingOutput: "0", isFree: true,
        contextLength: 128000, supportsFunctionTools: false,
        supportsStructuredOutputs: false, supportsWebSearch: false,
        supportsCodeExecution: false, supportsComputerUse: false,
        supportsBackground: false, supportsResponses: false,
        supportsVision: false },
    ];
    const whereMock = vi.fn().mockResolvedValue(unlockedRows);
    const fromMock = vi.fn().mockReturnValue({ where: whereMock });
    mockDbSelect.mockReturnValue({ from: fromMock });

    const updateWhereMock = vi.fn().mockResolvedValue(undefined);
    const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
    mockDbUpdate.mockReturnValue({ set: updateSetMock });

    mockComputeModelPriority.mockReturnValue(35);

    const fn = multiProviderRouter.backfillModelPriorities as Function;
    const result = await fn({ ctx: { user: { role: "admin" } } });

    expect(result.success).toBe(true);
    expect(result.updatedCount).toBe(2);
    expect(mockComputeModelPriority).toHaveBeenCalledTimes(2);
  });

  it("skips rows with priorityLocked=true", async () => {
    const whereMock = vi.fn().mockResolvedValue([]);
    const fromMock = vi.fn().mockReturnValue({ where: whereMock });
    mockDbSelect.mockReturnValue({ from: fromMock });

    const fn = multiProviderRouter.backfillModelPriorities as Function;
    const result = await fn({ ctx: { user: { role: "admin" } } });

    expect(result.updatedCount).toBe(0);
    expect(mockComputeModelPriority).not.toHaveBeenCalled();
  });
});
```

### Test: `bulkSetAdminModelCatalogEnabled` -- priority assignment

```typescript
describe("bulkSetAdminModelCatalogEnabled — priority assignment", () => {
  it("assigns computed priority to new entries (not 0)", async () => {
    const providerRows = [{
      id: 1,
      availableModels: [{
        id: "openai/gpt-5.4",
        name: "GPT 5.4",
        contextLength: 400000,
        pricing: { input: 2.5, output: 10 },
        createdAt: Math.floor(Date.now() / 1000) - 7 * 86400,
      }],
    }];
    const providerWhereMock = vi.fn().mockResolvedValue(providerRows);
    const providerFromMock = vi.fn().mockReturnValue({ where: providerWhereMock });
    mockDbSelect.mockImplementationOnce(() => ({ from: providerFromMock }));

    mockComputeModelPriority.mockReturnValue(18);

    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const valuesMock = vi.fn().mockReturnValue({ onConflictDoUpdate });
    mockDbInsert.mockReturnValue({ values: valuesMock });

    const fn = multiProviderRouter.bulkSetAdminModelCatalogEnabled as Function;
    const result = await fn({
      ctx: { user: { role: "admin" } },
      input: {
        items: [{
          mappingId: null,
          modelId: "openai/gpt-5.4",
          providerId: 1,
          modelName: "GPT 5.4",
          providerModelId: "openai/gpt-5.4",
          pricingInput: 2.5,
          pricingOutput: 10,
          isFree: false,
          contextLength: 400000,
        }],
        isEnabled: true,
      },
    });

    expect(result.success).toBe(true);
    expect(mockComputeModelPriority).toHaveBeenCalled();
    const insertedValues = valuesMock.mock.calls[0][0];
    expect(insertedValues[0].priority).toBe(18);
  });

  it("does not overwrite priorityLocked=true entries", async () => {
    const updateWhereMock = vi.fn().mockResolvedValue(undefined);
    const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
    mockDbUpdate.mockReturnValue({ set: updateSetMock });

    const fn = multiProviderRouter.bulkSetAdminModelCatalogEnabled as Function;
    const result = await fn({
      ctx: { user: { role: "admin" } },
      input: {
        items: [{
          mappingId: 99,
          modelId: "gpt-4o",
          providerId: 1,
          modelName: "GPT-4o",
          providerModelId: "openai/gpt-4o",
          pricingInput: 2.5,
          pricingOutput: 10,
          isFree: false,
        }],
        isEnabled: true,
      },
    });

    expect(result.success).toBe(true);
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ isEnabled: true })
    );
    expect(updateSetMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ priority: expect.any(Number) })
    );
  });
});
```

---

## Implementation

### File: `apps/web/server/routers/multiProvider.ts`

#### 1. Add import for `computeModelPriority`

At the top of the file, after existing imports:

```typescript
import { computeModelPriority } from "../services/intelligentModelSelector";
```

#### 2. Add `updateModelPriority` mutation

Add this new mutation inside the `multiProviderRouter` definition, after the `deleteModelMapping` mutation:

```typescript
updateModelPriority: adminProcedure
  .input(
    z.object({
      mappingId: z.number().int(),
      priority: z.number().int().min(0).max(999),
    })
  )
  .mutation(async ({ input }) => {
    const result = await db
      .update(modelProviderMap)
      .set({
        priority: input.priority,
        priorityLocked: true,
      })
      .where(eq(modelProviderMap.id, input.mappingId))
      .returning({
        id: modelProviderMap.id,
        modelId: modelProviderMap.modelId,
        priority: modelProviderMap.priority,
        priorityLocked: modelProviderMap.priorityLocked,
      });

    if (!result[0]) {
      throw new Error(`Mapping ${input.mappingId} not found`);
    }

    return { success: true as const, mapping: result[0] };
  }),
```

Key points:
- Zod validates `priority` as integer 0--999. Values outside this range are rejected before the handler runs.
- Always sets `priorityLocked = true` -- any admin-explicit priority is locked against auto-reassignment.
- Returns the updated row so the UI can confirm the change without a separate query.

#### 3. Add `backfillModelPriorities` mutation

Add after `updateModelPriority`:

```typescript
backfillModelPriorities: adminProcedure.mutation(async () => {
  // Select all unlocked rows
  const unlockedRows = await db
    .select()
    .from(modelProviderMap)
    .where(eq(modelProviderMap.priorityLocked, false));

  let updatedCount = 0;

  for (const row of unlockedRows) {
    const priority = computeModelPriority({
      pricingInput: row.pricingInput ? Number(row.pricingInput) : null,
      pricingOutput: row.pricingOutput ? Number(row.pricingOutput) : null,
      isFree: row.isFree,
      contextLength: row.contextLength,
      createdAt: undefined, // Not available on model_provider_map rows directly
      supportsFunctionTools: row.supportsFunctionTools ?? false,
      supportsStructuredOutputs: row.supportsStructuredOutputs ?? false,
      supportsWebSearch: row.supportsWebSearch ?? false,
      supportsCodeExecution: row.supportsCodeExecution ?? false,
      supportsComputerUse: row.supportsComputerUse ?? false,
      supportsBackground: row.supportsBackground ?? false,
      supportsResponses: row.supportsResponses ?? false,
      supportsVision: row.supportsVision ?? false,
    });

    await db
      .update(modelProviderMap)
      .set({ priority })
      .where(eq(modelProviderMap.id, row.id));

    updatedCount++;
  }

  return { success: true as const, updatedCount };
}),
```

Key points:
- Queries only `priorityLocked = false` rows, so admin-locked priorities are never touched.
- `createdAt` is not stored on `model_provider_map` -- the scorer uses the "unknown" default (15 recency points). For more accurate scoring, the `bulkSetAdminModelCatalogEnabled` path passes `createdAt` from the provider's `availableModels` JSON.
- Idempotent: safe to re-run any number of times.

#### 4. Modify `bulkSetAdminModelCatalogEnabled`

The current implementation inserts new rows with `priority: item.priority ?? 0`. The modification pre-loads provider `availableModels` data and computes priority for new entries.

**Before the existing `unmappedItems` loop, add a provider pre-load step:**

```typescript
// Pre-load provider availableModels for priority computation
const relevantProviderIds = [...new Set(unmappedItems.map((item) => item.providerId))];
const providerAvailableModels = relevantProviderIds.length > 0
  ? await db
      .select({
        id: llmProviders.id,
        availableModels: llmProviders.availableModels,
      })
      .from(llmProviders)
      .where(inArray(llmProviders.id, relevantProviderIds))
  : [];

// Build Map<providerModelId, SyncedModel> for O(1) lookup
const syncedModelMap = new Map<string, {
  createdAt?: number;
  pricing?: { input: number; output: number };
  contextLength?: number;
}>();
for (const provider of providerAvailableModels) {
  for (const model of (provider.availableModels as any[]) ?? []) {
    syncedModelMap.set(model.id, {
      createdAt: model.createdAt,
      pricing: model.pricing,
      contextLength: model.contextLength,
    });
  }
}
```

**Modify the `.values()` mapping to compute priority:**

```typescript
.values(unmappedItems.map((item) => {
  const syncedModel = syncedModelMap.get(item.providerModelId);
  const computedPriority = item.priority ?? computeModelPriority({
    pricingInput: item.pricingInput,
    pricingOutput: item.pricingOutput,
    isFree: item.isFree,
    contextLength: item.contextLength ?? syncedModel?.contextLength ?? null,
    createdAt: syncedModel?.createdAt,
    supportsFunctionTools: false,
    supportsStructuredOutputs: false,
    supportsWebSearch: false,
    supportsCodeExecution: false,
    supportsComputerUse: false,
    supportsBackground: false,
    supportsResponses: false,
    supportsVision: false,
  });

  return {
    modelId: buildCanonicalModelId(item.modelId || item.providerModelId),
    providerId: item.providerId,
    modelName: item.modelName.slice(0, 128),
    providerModelId: item.providerModelId,
    pricingInput: String(item.pricingInput),
    pricingOutput: String(item.pricingOutput),
    isFree: item.isFree,
    contextLength: item.contextLength ?? null,
    isEnabled: true,
    priority: computedPriority,
    apiStyle: item.apiStyle ?? "chat-completions",
  };
}))
```

The `onConflictDoUpdate` set remains unchanged -- it only sets `isEnabled: true`, preserving the existing `priority` and `priorityLocked` values in the database row.

#### 5. Modify `upsertModelMapping`

**Change the Zod schema** for `upsertModelMapping` to make priority optional:

```typescript
priority: z.number().int().min(0).max(999).optional(),
```

**In the INSERT path** (when `!input.id`):

```typescript
const isExplicitPriority = input.priority !== undefined;
const computedPriority = isExplicitPriority
  ? input.priority
  : computeModelPriority({
      pricingInput: input.pricingInput,
      pricingOutput: input.pricingOutput,
      isFree: input.isFree,
      contextLength: input.contextLength,
      createdAt: undefined,
      supportsFunctionTools: false,
      supportsStructuredOutputs: false,
      supportsWebSearch: false,
      supportsCodeExecution: false,
      supportsComputerUse: false,
      supportsBackground: false,
      supportsResponses: false,
      supportsVision: false,
    });
```

Use `computedPriority` in `.values({...})` and set `priorityLocked: isExplicitPriority`.

**In the UPDATE path** (when `input.id` is provided): if priority is omitted, preserve existing DB value. If explicitly provided, set both `priority` and `priorityLocked = true`.

---

## Interface Updates

### `ModelMappingListRow` and `AdminModelCatalogRow`

Add `priorityLocked` to both interfaces:

```typescript
export interface ModelMappingListRow {
  // ... existing fields ...
  priority: number;
  priorityLocked: boolean; // ADD
}

export interface AdminModelCatalogRow {
  // ... existing fields ...
  priority: number;
  priorityLocked: boolean; // ADD
}
```

### SELECT queries

Add `priorityLocked: modelProviderMap.priorityLocked` to the `.select()` calls in `listModelMappings` and `listAdminModelCatalog` so the field is available to the frontend.

In `mergeAdminModelCatalogRows`, set `priorityLocked: false` as the default for unmapped provider catalog entries.

---

## Verification

After implementation:

1. Run `cd apps/web && pnpm test -- multiProvider.test` to confirm all new and existing tests pass.
2. Run `cd apps/web && pnpm check` to confirm TypeScript compiles cleanly.
3. Verify the `updateModelPriority` mutation rejects values outside 0--999 range.
4. Verify `backfillModelPriorities` only processes `priorityLocked = false` rows.
5. Verify `bulkSetAdminModelCatalogEnabled` assigns non-zero computed priority to newly inserted rows.
