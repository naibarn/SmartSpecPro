# Section 08 -- Ingestion Hook and Credits

## Overview

This section wires the multimodal memory pipeline into the existing chat message upload flow. When a user sends a message with image attachments, the system now creates `media_assets` rows, updates the attachment JSON with `assetId`, registers each image in the conversation's visual state, dispatches async vision analysis to the Python backend, and deducts credits for all API operations (vision, embedding, reference resolution).

**Dependencies**: This section requires the following to be implemented first:

- **Section 01** (schema): All 6 new tables must exist (`media_assets`, `media_asset_analysis`, etc.)
- **Section 02** (`mediaAssetService.ts`): `createAssetFromAttachment()`, `fetchAsset()`, `generateSignedUrl()`
- **Section 05** (`visualStateService.ts`): `addRecentAsset()`
- **Section 07** (context packing): `buildChatContext()` extended with visual memory assembly

**Files modified**:

| File | Change |
|------|--------|
| `apps/web/server/routers/chat.ts` | Hook asset creation + dispatch after message save |
| `apps/web/server/services/creditService.ts` | Add `vision_analysis` and `embedding_generation` to `CreditSourceType` |
| `apps/web/server/services/visionMemoryService.ts` | (created in section 03/04) -- add credit-aware wrappers |

**Files read (no modifications)**:

| File | Why |
|------|-----|
| `apps/web/shared/featureFlags.ts` | Check `MULTIMODAL_MEMORY_ENABLED` flag (added in section 09, but ingestion hook needs the gate) |

---

## Tests (write these FIRST)

All tests go in a new file: `apps/web/server/routers/__tests__/chat.ingestion.test.ts`

Credit-tracking tests go in: `apps/web/server/services/__tests__/creditTracking.multimodal.test.ts`

### Ingestion hook tests

```typescript
// File: apps/web/server/routers/__tests__/chat.ingestion.test.ts

// Test: message creation with image attachment creates media_assets row
//   - Mock mediaAssetService.createAssetFromAttachment to return { assetId: 42 }
//   - Call sendMessage with an image attachment
//   - Assert createAssetFromAttachment was called with correct context (userId, tenantId, conversationId, messageId, projectId)

// Test: message creation updates attachment JSON with assetId
//   - After sendMessage, verify the attachment object in the returned message contains assetId

// Test: message creation calls addRecentAsset on visual state
//   - Mock visualStateService.addRecentAsset
//   - Call sendMessage with an image attachment
//   - Assert addRecentAsset called with (conversationId, assetId)

// Test: message creation dispatches vision analysis to Python backend
//   - Mock the HTTP call to POST /api/v1/vision/analyze
//   - Call sendMessage with an image attachment
//   - Assert the HTTP call was made with { asset_id, image_url, tenant_id, user_id }

// Test: message creation is gated by MULTIMODAL_MEMORY_ENABLED feature flag
//   - Mock the feature flag as disabled
//   - Call sendMessage with an image attachment
//   - Assert none of the asset/vision functions were called
//   - Message is still saved normally (the flag only gates memory pipeline, not the message itself)

// Test: message creation without images does not trigger asset pipeline
//   - Call sendMessage with text only (no attachments)
//   - Assert createAssetFromAttachment was NOT called

// Test: asset pipeline failure does not block message creation
//   - Mock createAssetFromAttachment to throw
//   - Call sendMessage with an image attachment
//   - Assert message is still saved and returned successfully
//   - Assert the error is logged, not thrown to the client
```

### Credit tracking tests

```typescript
// File: apps/web/server/services/__tests__/creditTracking.multimodal.test.ts

// Test: vision analysis records cost in provider_usage_log
//   - Mock the deductCredits call
//   - Dispatch a vision analysis
//   - Assert provider_usage_log row created with requestType='vision_analysis', appropriate costUsd, traceId

// Test: embedding generation records cost in provider_usage_log
//   - Similar to above but requestType='embedding_generation'

// Test: reference resolution records cost in provider_usage_log
//   - requestType='reference_resolution'

// Test: credit check blocks analysis when user has insufficient credits
//   - Mock hasEnoughCredits to return false
//   - Attempt to dispatch vision analysis
//   - Assert the analysis is NOT dispatched
//   - Assert the asset remains in 'pending' status (not 'analyzing')

// Test: credit multiplier ~0.5x per image total
//   - Verify the sum of vision (0.3x) + embedding (0.1x) + reference resolution (0.1x) = 0.5x base credit
```

---

## Implementation Details

### 1. Extend `CreditSourceType` in `creditService.ts`

Add two new values to the `CreditSourceType` union type at `apps/web/server/services/creditService.ts`:

```typescript
export type CreditSourceType =
  | "chat" | "skill" | "media_image" | /* ... existing values ... */
  | "vision_analysis" | "embedding_generation" | "reference_resolution";
```

No other changes to `creditService.ts`. The existing `deductCredits()` function already supports arbitrary `sourceType` strings, and the `provider_usage_log` insert already supports arbitrary `requestType` strings. The new source types simply enable filtering and reporting.

### 2. Modify `sendMessage` in `chat.ts`

Location: `apps/web/server/routers/chat.ts`, inside the `sendMessage` mutation (around line 664).

After the user message is saved (line 708-713), insert a new block that runs the ingestion pipeline for image attachments. The key design decisions:

**A. The pipeline is fire-and-forget (non-blocking).** The message creation must succeed even if the asset pipeline fails. Wrap the entire pipeline block in a `try/catch` that logs errors but does not rethrow.

**B. The pipeline is gated by the feature flag.** Import the tenant-scoped feature flag check. If the flag is off, skip all asset processing. The message is still saved normally.

**C. Only process image attachments.** Filter attachments by `type === 'image'` (matching existing attachment schema). Non-image attachments (PDFs, audio) are ignored.

**D. Process each image sequentially within the hook** (they share the same message context), but the vision analysis dispatch itself is async (HTTP call to Python, does not await completion).

Pseudocode for the ingestion block:

```
// After userMessage = await createMessage(...)

if (MULTIMODAL_MEMORY_ENABLED for tenant) {
  const imageAttachments = (input.attachments || []).filter(a => a.type === 'image');

  for (const attachment of imageAttachments) {
    try {
      // 1. Create media_assets row
      const asset = await mediaAssetService.createAssetFromAttachment(attachment, {
        userId: ctx.user.id,
        tenantId: ctx.user.tenantId,
        conversationId: input.conversationId,
        messageId: userMessage.id,
        projectId: conversation.projectId,
      });

      // 2. Update attachment JSON with assetId
      //    This patches the attachment in the message's attachments JSON column
      await updateAttachmentAssetId(userMessage.id, attachment.url, asset.assetId);

      // 3. Register in visual state
      await visualStateService.addRecentAsset(input.conversationId, asset.assetId);

      // 4. Check credits before dispatching analysis
      const analysisCreditCost = calculateVisionCreditCost(); // ~0.5x base
      const hasCredits = await hasEnoughCredits(ctx.user.id, analysisCreditCost);

      if (hasCredits) {
        // 5. Dispatch async vision analysis (fire-and-forget)
        dispatchVisionAnalysis({
          assetId: asset.assetId,
          imageUrl: attachment.url,
          tenantId: ctx.user.tenantId,
          userId: ctx.user.id,
        }).catch(err => logger.error('Vision analysis dispatch failed', { assetId: asset.assetId, err }));
      } else {
        logger.warn('Insufficient credits for vision analysis', { userId: ctx.user.id, assetId: asset.assetId });
      }
    } catch (err) {
      // Log but do NOT fail the message creation
      logger.error('Asset ingestion failed for attachment', { url: attachment.url, err });
    }
  }
}
```

### 3. `updateAttachmentAssetId` helper

Add a small helper function (either in `chat.ts` or in `mediaAssetService.ts`) that patches a single attachment's JSON to include the `assetId`. This uses a Drizzle update with `jsonb_set` or a full JSON rewrite. Since `messages.attachments` is a JSON column, read the current array, find the matching attachment by URL, add `assetId`, and write back.

Signature:

```typescript
async function updateAttachmentAssetId(
  messageId: number,
  attachmentUrl: string,
  assetId: number
): Promise<void>
```

### 4. `dispatchVisionAnalysis` helper

This sends an HTTP POST to the Python backend at `POST /api/v1/vision/analyze`. The Python endpoint is created in Section 03.

Signature:

```typescript
async function dispatchVisionAnalysis(params: {
  assetId: number;
  imageUrl: string;
  tenantId: string;
  userId: number;
}): Promise<void>
```

Implementation notes:
- Use the existing `SMARTSPEC_WEB_GATEWAY_TOKEN` for the `x-proxy-token` header (same pattern as other Node-to-Python calls in the codebase, e.g., `agencyStreamProxy.ts`).
- The Python backend URL is read from `process.env.PYTHON_BACKEND_URL` (defaults to `http://localhost:8000`).
- This is a fire-and-forget call. The function resolves once the HTTP request is accepted (202 or 200). The actual analysis happens asynchronously in the Celery worker.

### 5. `calculateVisionCreditCost` helper

Returns the estimated credit cost for the full vision pipeline (analysis + embedding + reference resolution). Based on the cost table from the plan:

| Operation | Credit Multiplier |
|-----------|-------------------|
| Vision analysis (Gemini Flash) | 0.3x |
| Embedding generation | 0.1x |
| Reference resolution | 0.1x |
| **Total** | **0.5x** |

The base unit is 1 credit. So `calculateVisionCreditCost()` returns `0.5` (or whatever the base credit unit translates to in the existing credit system's scale).

Signature:

```typescript
function calculateVisionCreditCost(): number
```

This is a simple constant function for now. In a future iteration, it could be dynamic based on image size or provider costs.

### 6. Credit recording in `provider_usage_log`

When the Python Celery task completes vision analysis, it records the cost in `provider_usage_log` (this is handled on the Python side in Section 03). On the Node.js side, when the context packing step (Section 07) calls the reference resolution LLM, it should record that cost as well.

For the ingestion hook specifically, the credit deduction happens in two places:

1. **Pre-check** (Node.js, in the ingestion hook): `hasEnoughCredits()` verifies the user can afford the analysis before dispatching.
2. **Actual deduction** (Python, in the Celery task): The Python task calls `deductCredits` (or its Python equivalent via the shared PostgreSQL `credit_transactions` table) after each API call completes, recording the actual cost.

This two-phase approach prevents overcharging (we only deduct actual costs) while still guarding against dispatching work for users with no credits.

### 7. Error handling strategy

The ingestion pipeline must NEVER break the chat flow. Specific error scenarios:

| Error | Handling |
|-------|----------|
| `createAssetFromAttachment` fails (DB error) | Log error, skip this attachment, continue with next |
| `addRecentAsset` fails | Log error, continue (visual state is non-critical) |
| `dispatchVisionAnalysis` HTTP call fails | Log error, asset stays in `pending` status, can be retried later |
| User has insufficient credits | Log warning, skip analysis dispatch, asset saved but not analyzed |
| Feature flag is off | Skip entire pipeline silently, no logging needed |

### 8. Attachment type filtering

The existing `attachmentSchema` in `chat.ts` (line 192) defines an attachment with a `type` field. The ingestion hook filters for `type === 'image'`. The supported image MIME types are validated in `mediaAssetService.ts` (Section 02): JPEG, PNG, WebP, GIF. SVG and HEIC are rejected at that layer, not in the hook.

---

## Integration notes

- The `MULTIMODAL_MEMORY_ENABLED` feature flag is defined in Section 09. If implementing this section before Section 09, use a temporary hardcoded check or stub the flag as `false`. The flag should be tenant-scoped (checked via `tenantFeatureFlagService`).
- The `dispatchVisionAnalysis` function calls the Python endpoint defined in Section 03. If the Python endpoint is not yet deployed, the dispatch will fail gracefully (fire-and-forget with error logging).
- The `updateAttachmentAssetId` function modifies the `messages.attachments` JSON column. This is backward compatible -- existing code that reads attachments will simply ignore the new `assetId` field until Section 07 (context packing) starts using it.
