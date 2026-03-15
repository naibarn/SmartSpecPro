# Section 10: User Controls and Deletion

## Overview

This section implements the user-facing controls for managing multimodal memory: deleting images from memory and pinning images to ensure they persist in retrieval. It adds two tRPC mutations to the existing memory router (`memory.ts`) and wires up a chat-command pathway that lets users request deletion via natural language (e.g., "ลบรูปนี้ออกจาก memory").

**Dependencies**: This section requires:
- Section 02 (media asset service) -- `mediaAssetService.ts` must exist with `deleteAsset()` and `fetchAsset()`
- Section 05 (visual state service) -- `visualStateService.ts` must exist with `removeAssetFromState()`
- Section 06 (retrieval and reference resolution) -- `multimodalRetrievalService.ts` must exist with `resolveVisualReferences()` for the chat command deletion flow (resolving which image "รูปนี้" or "this image" refers to)
- Section 09 (safety and feature flags) -- `MULTIMODAL_MEMORY_ENABLED` feature flag must be registered and gated

**Files to create or modify**:
- `apps/web/server/routers/memory.ts` -- Add `deleteImageFromMemory` and `pinImageToMemory` mutations
- `apps/web/server/services/visionMemoryService.ts` -- Implement `deleteFromMemory()` and `pinToMemory()` (service layer)
- `apps/web/server/services/__tests__/userControls.test.ts` -- Tests for this section

---

## Tests (Write First)

Create the test file at `apps/web/server/services/__tests__/userControls.test.ts`. All tests use Vitest with `vi.mock()` for database and service dependencies.

```typescript
// apps/web/server/services/__tests__/userControls.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for Section 10: User Controls and Deletion
 *
 * These tests cover the deleteFromMemory and pinToMemory flows,
 * including cascade cleanup, authorization, and chat-command routing.
 */

describe("deleteFromMemory", () => {
  // Test: removes multimodal_memory_items row, which cascades to vectors and links
  it("should delete memory item, vectors, and links for the given assetId");

  // Test: removes the asset from all visual state lists (recent, active, compared)
  it("should call removeAssetFromState for the target conversationId and assetId");

  // Test: rejects when userId or tenantId do not match the asset owner
  it("should throw FORBIDDEN when userId/tenantId mismatch");

  // Test: returns { success: true, deletedItemCount } on success
  it("should return success with deleted item count");

  // Test: is idempotent -- calling twice for same assetId does not throw
  it("should succeed silently if memory item already deleted");
});

describe("pinToMemory", () => {
  // Test: sets salience to 1.0 on the multimodal_memory_items row
  it("should set salience to 1.0 for the memory item matching assetId");

  // Test: increments access_count as a side effect
  it("should increment access_count when pinning");

  // Test: rejects when userId or tenantId mismatch
  it("should throw FORBIDDEN for unauthorized pin attempts");
});

describe("chat command deletion", () => {
  // Test: message containing "ลบรูปนี้ออกจาก memory" triggers reference resolution
  //       then calls deleteFromMemory with the resolved assetId
  it("should resolve the target image and call deleteFromMemory via chat command");
});
```

Additionally, add router-level tests alongside the existing memory router tests, or in a separate file at `apps/web/server/routers/__tests__/memoryImageControls.test.ts`:

```typescript
// apps/web/server/routers/__tests__/memoryImageControls.test.ts
import { describe, it, expect, vi } from "vitest";

describe("memory.deleteImageFromMemory mutation", () => {
  // Test: validates input schema (requires assetId: number)
  it("should reject when assetId is missing");

  // Test: calls visionMemoryService.deleteFromMemory with ctx.user
  it("should call deleteFromMemory with correct userId and tenantId");

  // Test: returns { success: true } on successful deletion
  it("should return success true");
});

describe("memory.pinImageToMemory mutation", () => {
  // Test: validates input schema (requires assetId: number)
  it("should reject when assetId is missing");

  // Test: calls visionMemoryService.pinToMemory
  it("should set salience to 1.0 via the service");
});
```

---

## Implementation Details

### 10.1 Service Layer: `deleteFromMemory()` in `visionMemoryService.ts`

Add or extend the `deleteFromMemory` function in `apps/web/server/services/visionMemoryService.ts`. This function performs the cascade cleanup when a user removes an image from memory.

**Function signature**:

```typescript
async function deleteFromMemory(
  assetId: number,
  userId: number,
  tenantId: string
): Promise<{ success: boolean; deletedItemCount: number }>
```

**Logic**:

1. **Authorization check**: Query `media_assets` by `assetId`. Verify `userId` and `tenantId` match the caller. If not, throw a `TRPCError` with code `FORBIDDEN`.

2. **Find memory items**: Query `multimodal_memory_items` where `mediaAssetId = assetId`. There may be zero or one row (one image produces one memory item).

3. **Delete memory items**: Delete from `multimodal_memory_items` where `mediaAssetId = assetId`. The cascade DELETE on the foreign key automatically removes:
   - `multimodal_memory_vectors` rows (FK `memoryItemId` with CASCADE)
   - `multimodal_memory_links` rows (FK `fromMemoryItemId` and `toMemoryItemId` with CASCADE)

4. **Remove from visual state**: Call `visualStateService.removeAssetFromState(conversationId, assetId)` to clear the asset from `recentAssetIds`, `activeAssetIds`, and `comparedAssetIds` lists. The `conversationId` comes from the `media_assets` row.

5. **Optionally mark the asset**: Instead of deleting the `media_assets` row (which would remove the attachment itself), update the asset status or add a flag. The image remains as a normal chat attachment -- only the memory indexing is removed. A reasonable approach: leave the `media_assets` row intact but set a `memoryDeleted` boolean or simply rely on the absence of `multimodal_memory_items` to indicate the image is no longer in memory.

6. **Return result**: `{ success: true, deletedItemCount }` where `deletedItemCount` is the number of memory item rows removed (0 or 1).

**Idempotency**: If the memory item was already deleted (e.g., user clicks "Remove" twice), the function should return `{ success: true, deletedItemCount: 0 }` rather than throwing an error.

### 10.2 Service Layer: `pinToMemory()` in `visionMemoryService.ts`

**Function signature**:

```typescript
async function pinToMemory(
  assetId: number,
  userId: number,
  tenantId: string
): Promise<{ success: boolean }>
```

**Logic**:

1. **Authorization check**: Same as `deleteFromMemory` -- verify asset ownership via `media_assets.userId` and `media_assets.tenantId`.

2. **Update salience**: Set `multimodal_memory_items.salience = 1.0` where `mediaAssetId = assetId`. This ensures the pinned image is always prioritized in retrieval (the retrieval ranking formula in section 06 includes salience as a weight factor).

3. **Increment access count**: Also increment `multimodal_memory_items.accessCount` and update `lastAccessedAt` to current timestamp. This is consistent with the salience/access tracking pattern used elsewhere in the memory system.

4. **Return**: `{ success: true }`.

### 10.3 tRPC Mutations in `memory.ts`

Add two new mutations to the existing `memoryRouter` in `apps/web/server/routers/memory.ts`.

**`deleteImageFromMemory` mutation**:

```typescript
deleteImageFromMemory: protectedProcedure
  .input(z.object({
    assetId: z.number(),
  }))
  .mutation(async ({ ctx, input }) => {
    // Import visionMemoryService.deleteFromMemory
    // Call with ctx.user.id and ctx.user.tenantId
    // Return the result
  })
```

**`pinImageToMemory` mutation**:

```typescript
pinImageToMemory: protectedProcedure
  .input(z.object({
    assetId: z.number(),
  }))
  .mutation(async ({ ctx, input }) => {
    // Import visionMemoryService.pinToMemory
    // Call with ctx.user.id and ctx.user.tenantId
    // Return the result
  })
```

Both mutations use `protectedProcedure` (requires authenticated user), consistent with every other mutation in the existing memory router. The `ctx.user` object provides `id` (userId) and `tenantId` for authorization.

### 10.4 Chat Command Deletion

When a user types a message like "ลบรูปนี้ออกจาก memory" (or English equivalents like "remove this image from memory"), the system should:

1. **Detect the deletion intent**: In the chat message processing pipeline (before the normal LLM call), check the user message against a keyword set for deletion commands. Suggested keywords:
   - Thai: `ลบ.*memory`, `ลบรูป.*ออก`, `ลืมรูป`
   - English: `remove.*from memory`, `delete.*from memory`, `forget.*image`

2. **Resolve the target image**: Use the same `resolveVisualReferences()` from `multimodalRetrievalService.ts` (section 06) to identify which image the user is referring to. The reference resolver already handles Thai/English ordinal and recency references like "รูปนี้", "this image", "the previous photo", etc.

3. **Execute deletion**: Call `visionMemoryService.deleteFromMemory()` with the resolved `assetId`.

4. **Respond to user**: Instead of sending the message to the LLM, return a system response confirming the deletion, e.g.: "Removed image from memory." / "ลบรูปออกจาก memory เรียบร้อยแล้ว"

**Implementation location**: This logic belongs in `apps/web/server/routers/chat.ts`, within the message handling flow -- specifically after the feature flag check for `MULTIMODAL_MEMORY_ENABLED` and before the normal LLM context assembly. It is a short-circuit: if a deletion command is detected and a target image is resolved, the deletion is performed and a confirmation is returned without invoking the LLM.

If the reference resolver cannot identify a target image (e.g., ambiguous reference or no images in conversation), the message should be passed through to the LLM normally -- the LLM can respond with a clarification request.

### 10.5 Feature Flag Gating

Both mutations and the chat command handler must check the `MULTIMODAL_MEMORY_ENABLED` feature flag (from section 09). If the flag is off for the caller's tenant:
- `deleteImageFromMemory` should throw `TRPCError({ code: "FORBIDDEN", message: "Multimodal memory is not enabled" })`
- `pinImageToMemory` should throw the same error
- The chat command detection should be skipped entirely

This follows the same gating pattern used in the upload hook and `buildChatContext()` visual assembly (section 09).

### 10.6 Cascade Cleanup Summary

When `deleteFromMemory(assetId)` is called, the following data is removed:

| Table | What is removed | How |
|-------|----------------|-----|
| `multimodal_memory_items` | The memory item row for this asset | Direct DELETE by `mediaAssetId` |
| `multimodal_memory_vectors` | All embedding vectors for this memory item | CASCADE from `memoryItemId` FK |
| `multimodal_memory_links` | Any relationship links involving this memory item | CASCADE from `fromMemoryItemId` / `toMemoryItemId` FK |
| `conversation_visual_state` | Asset removed from `recentAssetIds`, `activeAssetIds`, `comparedAssetIds` | Service call to `removeAssetFromState()` |

The `media_assets` row and `media_asset_analysis` row are **not** deleted -- the image remains visible as a normal chat attachment. Only the memory indexing (retrieval, embedding, visual state tracking) is removed.

---

## Key Patterns from Existing Code

The existing `memory.ts` router (at `apps/web/server/routers/memory.ts`) establishes these patterns that the new mutations must follow:

- All mutations use `protectedProcedure` from `../../../_core/trpc`
- Database access uses lazy imports: `const { getDb } = await import("../db");`
- Schema tables imported via: `const { tableName } = await import("../../drizzle/schema");`
- Drizzle operators imported via: `const { eq, and } = await import("drizzle-orm");`
- Authorization is enforced by including `ctx.user.id` in WHERE clauses (not just checking ownership separately)
- Return shapes are simple objects: `{ success: true }` or `{ success: true, deletedCount }`

The `deleteEntityMemory` mutation (lines 102-122) is the closest existing pattern to follow for the new deletion mutation.
