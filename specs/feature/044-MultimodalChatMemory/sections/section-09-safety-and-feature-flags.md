# Section 09: Safety and Feature Flags

## Overview

This section implements the safety mechanisms and feature flag gating for the entire multimodal memory subsystem. It adds three capabilities:

1. **NSFW blocking logic** in the `visionMemoryService.ts` safety check, ensuring images flagged by Gemini Flash vision analysis never enter the multimodal memory pipeline (no memory items, no vectors, no retrieval).
2. **`multimodalMemory` feature flag** (tenant-scoped) that gates all multimodal memory code paths -- upload hooks, context assembly, Python vision endpoint, and retrieval service.
3. **OCR PII filtering** that passes OCR text extracted by the vision pipeline through the existing `piiFilter.ts` before the text is stored in `searchableText` or included in LLM context.

**Dependencies**: Section 03 (vision pipeline -- produces `media_asset_analysis` rows with `safetyLabels` and `ocrText`), Section 08 (ingestion hook and credits -- the upload flow that dispatches analysis and needs the feature flag gate).

**Blocks**: Section 10 (user controls and deletion), which relies on the safety check and feature flag infrastructure established here.

---

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/server/services/__tests__/multimodalSafety.test.ts` | Vitest tests for NSFW blocking, PII filtering, feature flag gating |
| `python-backend/tests/test_vision_feature_flag.py` | pytest tests for Python-side feature flag check on the vision endpoint |

## Files to Modify

| File | Changes |
|------|---------|
| `apps/web/shared/featureFlags.ts` | Add `multimodalMemory` to `TenantFeatureFlags` interface, `ALLOWED_FEATURE_FLAGS` set, and `FEATURE_FLAG_DEFAULTS` |
| `apps/web/server/services/tenantFeatureFlagService.ts` | Add `"multimodalMemory"` to `REDIS_SYNCED_FLAGS` set |
| `apps/web/server/services/visionMemoryService.ts` | Implement `checkSafety()` and integrate PII filter into `buildSearchableText()` |
| `apps/web/server/routers/chat.ts` | Gate the upload hook (asset creation + vision dispatch) behind feature flag |
| `apps/web/server/services/memoryService.ts` | Gate the visual memory assembly step (step 4.5 in `buildChatContext()`) behind feature flag |
| `apps/web/server/services/multimodalRetrievalService.ts` | Return empty results when feature flag is off |
| `python-backend/app/api/vision.py` | Check feature flag before accepting analysis requests |

---

## Tests (Write First)

### `apps/web/server/services/__tests__/multimodalSafety.test.ts`

All tests use Vitest. Mock the database, Redis, and the PII filter module as needed.

```typescript
// apps/web/server/services/__tests__/multimodalSafety.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// ──────────────────────────────────────────────
// Group 1: NSFW Blocking
// ──────────────────────────────────────────────
describe("checkSafety", () => {
  it("returns blocked:true when safetyLabels contain NSFW category", () => {
    // Given an analysis object with safetyLabels: [{ category: "sexually_explicit", score: 0.95 }]
    // When checkSafety(analysis) is called
    // Then result.blocked === true
  });

  it("returns blocked:true for violence category above threshold", () => {
    // safetyLabels: [{ category: "violence", score: 0.8 }]
    // blocked === true
  });

  it("returns blocked:false for clean analysis with no safety flags", () => {
    // safetyLabels: [] or null
    // blocked === false
  });

  it("returns blocked:false for low-confidence safety flags below threshold", () => {
    // safetyLabels: [{ category: "sexually_explicit", score: 0.1 }]
    // blocked === false (below threshold)
  });
});

describe("NSFW blocking pipeline behavior", () => {
  it("does not create multimodal_memory_items when NSFW detected", () => {
    // Mock checkSafety returning blocked:true
    // Verify createMemoryItemFromAsset is NOT called
  });

  it("does not create multimodal_memory_vectors when NSFW detected", () => {
    // Verify no embedding generation dispatched for NSFW images
  });

  it("preserves the image as a normal attachment (media_assets row remains)", () => {
    // media_assets row should exist with status='nsfw_blocked'
    // The row is NOT deleted -- only memory creation is skipped
  });

  it("sets media_assets.status to 'nsfw_blocked'", () => {
    // Verify UPDATE on media_assets sets status='nsfw_blocked'
  });

  it("logs NSFW blocking event for admin audit trail", () => {
    // Verify a structured log entry is emitted with event type and assetId
  });
});

// ──────────────────────────────────────────────
// Group 2: OCR PII Filtering
// ──────────────────────────────────────────────
describe("OCR PII filtering in buildSearchableText", () => {
  it("passes OCR text through detectAndRedactPII before inclusion", () => {
    // Given analysis with ocrText: "Call me at 0891234567"
    // When buildSearchableText(analysis) is called
    // Then the returned text contains "[PHONE_REDACTED]" not the raw number
  });

  it("handles empty ocrText gracefully", () => {
    // ocrText: "" or null
    // buildSearchableText still returns valid text from caption + tags
  });

  it("handles ocrText that is entirely PII", () => {
    // ocrText: "0891234567 test@email.com"
    // Entire OCR portion is redacted, rest of searchableText intact
  });

  it("does not filter non-OCR fields (caption, tags)", () => {
    // shortCaption and tags pass through unchanged
    // Only the ocrText field goes through PII filter
  });
});

// ──────────────────────────────────────────────
// Group 3: Tenant Isolation (Safety)
// ──────────────────────────────────────────────
describe("tenant isolation safety", () => {
  it("user A cannot fetch user B's assets (different tenant)", () => {
    // fetchAsset(assetId, tenantIdB) when asset belongs to tenantIdA
    // Should return null or throw access denied
  });

  it("project isolation scopes assets in cross-session search", () => {
    // Assets from projectA are not returned when searching projectB
  });

  it("signed URLs expire after 1 hour", () => {
    // generateSignedUrl returns URL with expiry parameter
    // Verify expiry is set to 3600 seconds
  });
});

// ──────────────────────────────────────────────
// Group 4: Feature Flag Gating (TypeScript side)
// ──────────────────────────────────────────────
describe("MULTIMODAL_MEMORY feature flag", () => {
  it("flag exists in featureFlags.ts with key 'multimodalMemory'", () => {
    // Import TenantFeatureFlags and verify 'multimodalMemory' is a key
  });

  it("flag defaults to false in FEATURE_FLAG_DEFAULTS", () => {
    // Import FEATURE_FLAG_DEFAULTS, verify multimodalMemory === false
  });

  it("flag is tenant-scoped (different tenants can have different settings)", () => {
    // Verify isFeatureEnabled works per-tenant for multimodalMemory
  });

  it("upload hook skips asset creation when flag is off", () => {
    // Mock tenant feature flags with multimodalMemory: false
    // Call the chat upload flow
    // Verify mediaAssetService.createAssetFromAttachment is NOT called
  });

  it("buildChatContext skips visual assembly when flag is off", () => {
    // Mock multimodalMemory: false
    // Call buildChatContext
    // Verify resolveVisualReferences is NOT called
    // Verify visualMemoryContext is null and imageAssets is empty
  });

  it("retrieval service returns empty when flag is off", () => {
    // Mock multimodalMemory: false
    // Call retrieveRelevantAssets
    // Returns empty array without querying vectors
  });
});
```

### `python-backend/tests/test_vision_feature_flag.py`

```python
# python-backend/tests/test_vision_feature_flag.py
import pytest
from unittest.mock import patch, MagicMock

# Test: Python vision endpoint rejects request when flag is off
#   - Mock Redis lookup for feature_flag:multimodalMemory:{tenant_id} returning "false" or None
#   - POST /api/v1/vision/analyze with valid payload
#   - Assert 403 response with message about feature being disabled

# Test: Python vision endpoint accepts request when flag is on
#   - Mock Redis returning "true" for the flag
#   - POST /api/v1/vision/analyze
#   - Assert 202 response (task queued)

# Test: Python vision endpoint rejects request without x-proxy-token
#   - POST without the auth header
#   - Assert 401

# Test: Python vision endpoint rejects invalid x-proxy-token
#   - POST with wrong token value
#   - Assert 401
```

---

## Implementation Details

### 1. Feature Flag Registration

Add `multimodalMemory` to the shared feature flags system. This follows the exact pattern of all existing flags in the codebase.

**File: `apps/web/shared/featureFlags.ts`**

Add to the `TenantFeatureFlags` interface:

```typescript
multimodalMemory: boolean; // F20 — Multimodal chat memory (image analysis, embedding, retrieval)
```

Add to the `ALLOWED_FEATURE_FLAGS` set:

```typescript
"multimodalMemory",
```

Add to `FEATURE_FLAG_DEFAULTS` with value `false` (opt-in, gated for safety during rollout):

```typescript
multimodalMemory: false,
```

**File: `apps/web/server/services/tenantFeatureFlagService.ts`**

Add `"multimodalMemory"` to the `REDIS_SYNCED_FLAGS` set so that the flag is readable from Redis by both Node.js route guards and the Python backend:

```typescript
const REDIS_SYNCED_FLAGS: ReadonlySet<TenantFeatureFlagKey> = new Set([
  // ... existing flags ...
  "multimodalMemory",
]);
```

This ensures that when an admin toggles the flag in the tenant admin panel, the change propagates to Redis via `setTenantFeatureFlag()`, making it available to the Python backend without a database query.

### 2. Feature Flag Gate Locations

There are four locations where the feature flag must be checked. Each returns a no-op or empty result when the flag is off.

#### Gate 1: Chat Upload Hook (`apps/web/server/routers/chat.ts`)

In the message creation flow (around line 865), before calling `mediaAssetService.createAssetFromAttachment()` and dispatching vision analysis, check the flag:

```typescript
// Pseudocode for the gate
const flags = await getTenantFeatureFlags(ctx.user.registeredDomain || "default");
if (flags.multimodalMemory) {
  // Create asset, dispatch vision analysis, update visual state
  // (This is the section-08 ingestion hook code)
}
// If flag is off, the message is saved normally with attachments but
// no media_assets row is created and no analysis is dispatched.
```

Use the `getTenantFeatureFlags` function from `tenantFeatureFlagService.ts` which reads from the DB (with the `resolveFeatureFlags` fallback to defaults). The flag check should be a simple boolean guard wrapping the entire asset creation block.

#### Gate 2: `buildChatContext()` Visual Assembly (`apps/web/server/services/memoryService.ts`)

In the new step 4.5 (Visual Memory Assembly) added by section-07, wrap the entire visual assembly block:

```typescript
// Inside buildChatContext(), before calling resolveVisualReferences
const tenantFlags = await getTenantFeatureFlags(tenantId);
if (!tenantFlags.multimodalMemory) {
  // Skip visual memory entirely -- set defaults
  context.visualMemoryContext = null;
  context.imageAssets = [];
} else {
  // Proceed with visual reference resolution, retrieval, etc.
}
```

When the flag is off, the context builder behaves identically to the pre-feature state: no visual memory, no image assets, original budget allocation (40% entity, 60% summary, rest buffer).

#### Gate 3: Retrieval Service (`apps/web/server/services/multimodalRetrievalService.ts`)

At the top of `resolveVisualReferences()` and `retrieveRelevantAssets()`, add an early return:

```typescript
async function resolveVisualReferences(
  userMessage: string,
  conversationId: number,
  userId: number,
  tenantId: string,
): Promise<ResolvedReference[]> {
  const flags = await getTenantFeatureFlags(tenantId);
  if (!flags.multimodalMemory) return [];
  // ... rest of implementation
}
```

This provides a defense-in-depth check. Even if a caller bypasses the `buildChatContext` gate, the retrieval service itself refuses to operate when the flag is off.

#### Gate 4: Python Vision Endpoint (`python-backend/app/api/vision.py`)

Before enqueuing the Celery task, check the feature flag from Redis:

```python
# In the POST /api/v1/vision/analyze handler
redis_client = get_redis()
flag_key = f"feature_flag:multimodalMemory:{request.tenant_id}"
flag_value = redis_client.get(flag_key)

if flag_value != "true":
    raise HTTPException(
        status_code=403,
        detail="Multimodal memory is not enabled for this tenant",
    )
```

This follows the same pattern used by `automation_copilot.py` (line 103) which checks `feature_flag:automationCopilot:{tenant_id}` in Redis. The Redis key is set by `setTenantFeatureFlag()` on the Node.js side whenever the admin toggles the flag.

### 3. NSFW Blocking Logic

**File: `apps/web/server/services/visionMemoryService.ts`**

The `checkSafety()` function inspects the `safetyLabels` array from the Gemini Flash vision analysis result. The safety labels follow a structure like:

```typescript
interface SafetyLabel {
  category: string;    // e.g., "sexually_explicit", "violence", "hate_speech", "dangerous"
  score: number;       // 0.0 to 1.0
}
```

Implementation approach:

- Define a set of blocked categories: `"sexually_explicit"`, `"violence"`, `"hate_speech"`, `"dangerous"`.
- Define a score threshold: `0.5` (configurable). Any label with a category in the blocked set AND score >= threshold triggers blocking.
- Return `{ blocked: boolean; reason?: string }`.

When `checkSafety` returns `blocked: true`:

1. Update `media_assets.status` to `"nsfw_blocked"` via a direct DB update.
2. Store the analysis result in `media_asset_analysis` (the labels are useful for audit) but do NOT proceed to create `multimodal_memory_items` or `multimodal_memory_vectors`.
3. Log a structured audit event: `{ event: "nsfw_blocked", assetId, tenantId, categories: [...] }`. Use the existing server logger pattern.

The image remains accessible as a normal chat attachment (the `messages.attachments` JSON is unchanged). Only the memory pipeline is halted.

On the Python side (in `vision_tasks.py` from section-03), the same check occurs after the Gemini response is received. If NSFW is detected, the task:
- Writes the analysis row (with safety labels) to `media_asset_analysis`
- Sets `media_assets.status = 'nsfw_blocked'`
- Returns early without creating memory items or vectors
- Does NOT raise an exception (the task completes successfully -- blocking is expected behavior, not a failure)

### 4. OCR PII Filtering

**File: `apps/web/server/services/visionMemoryService.ts`**

In the `buildSearchableText(analysis)` function, the `ocrText` field extracted by Gemini Flash may contain personally identifiable information (phone numbers, email addresses, ID numbers, etc.) that were visible in the image.

Before including OCR text in the searchable text or sending it to LLM context, pass it through the existing `detectAndRedactPII()` function from `piiFilter.ts`:

```typescript
import { detectAndRedactPII } from "./piiFilter";

function buildSearchableText(analysis: MediaAssetAnalysis): string {
  const parts: string[] = [];

  // Caption and tags pass through as-is (LLM-generated, not user content)
  if (analysis.shortCaption) parts.push(analysis.shortCaption);
  if (analysis.objects?.length) parts.push(`objects: ${analysis.objects.join(", ")}`);
  if (analysis.styles?.length) parts.push(`style: ${analysis.styles.join(", ")}`);
  if (analysis.materials?.length) parts.push(`materials: ${analysis.materials.join(", ")}`);
  if (analysis.colors?.length) parts.push(`colors: ${analysis.colors.join(", ")}`);

  // OCR text goes through PII filter
  if (analysis.ocrText) {
    const { sanitizedText } = detectAndRedactPII(analysis.ocrText);
    parts.push(`ocr: ${sanitizedText}`);
  }

  return parts.join(" | ");
}
```

The `detectAndRedactPII` function (already in `apps/web/server/services/piiFilter.ts`) handles: email addresses, phone numbers (including Thai format), credit card numbers, Thai ID card numbers, SSN, IP addresses, API keys, JWT tokens, and more. Redacted content is replaced with bracketed placeholders like `[PHONE_REDACTED]`.

Only the `ocrText` field needs PII filtering. The `shortCaption`, `detailedCaption`, and tag arrays are generated by the vision LLM from the image content and are not user-originated text, so they do not require PII redaction.

### 5. Signed URL Security

All image URLs included in LLM context (via `buildImageContext` in the retrieval service) must be time-limited signed URLs. The `mediaAssetService.generateSignedUrl(storageKey, expirySeconds)` function (from section-02) should default to 3600 seconds (1 hour). This prevents stale URLs from being cached or replayed.

The signed URL generation reuses the existing S3/R2 client from the upload flow. Never pass raw storage keys or permanent URLs to the LLM -- always generate a fresh signed URL at context assembly time.

### 6. Tenant Isolation Enforcement

Every database query in the multimodal memory system must include `tenantId` in the WHERE clause. This is enforced at the service layer, not the router layer, so that internal callers also respect isolation.

Key enforcement points:
- `mediaAssetService.fetchAsset(assetId, tenantId)` -- rejects if asset's tenantId does not match
- `multimodalRetrievalService.retrieveRelevantAssets(query, scope)` -- scope includes tenantId, all vector queries filter by it
- `visualStateService` -- operates on conversationId which is already tenant-scoped via the conversations table FK chain

Never expose raw `assetId` values to clients without first verifying tenant ownership.

---

## Implementation Sequence

1. Register the feature flag in `featureFlags.ts` (interface, allowed set, defaults)
2. Add to `REDIS_SYNCED_FLAGS` in `tenantFeatureFlagService.ts`
3. Implement `checkSafety()` in `visionMemoryService.ts` with the NSFW category/threshold logic
4. Integrate PII filter call into `buildSearchableText()` in `visionMemoryService.ts`
5. Add feature flag gate to `chat.ts` upload hook
6. Add feature flag gate to `buildChatContext()` visual assembly step
7. Add feature flag early-return to `multimodalRetrievalService.ts`
8. Add feature flag check to Python vision endpoint `vision.py`
9. Write and verify all tests

---

## Key File Paths (Absolute)

- `/home/dev/projects/SmartSpecPro/apps/web/shared/featureFlags.ts` -- feature flag registration
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/tenantFeatureFlagService.ts` -- Redis sync set
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/visionMemoryService.ts` -- checkSafety, buildSearchableText with PII filter
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/piiFilter.ts` -- existing PII detection (imported, not modified)
- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/chat.ts` -- upload hook feature flag gate
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/memoryService.ts` -- buildChatContext feature flag gate
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/multimodalRetrievalService.ts` -- retrieval early return
- `/home/dev/projects/SmartSpecPro/python-backend/app/api/vision.py` -- Python-side feature flag check
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/multimodalSafety.test.ts` -- TypeScript tests
- `/home/dev/projects/SmartSpecPro/python-backend/tests/test_vision_feature_flag.py` -- Python tests