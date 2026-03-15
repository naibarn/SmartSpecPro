Now I have all the context needed. Let me produce the section content.

# Section 02 -- Media Asset Service

## Overview

This section implements `mediaAssetService.ts`, the foundational CRUD service for managing image assets in the multimodal chat memory system. It handles asset creation from chat attachments, signed URL generation, SHA-256 checksum deduplication, perceptual hashing for near-duplicate detection, image format/size validation, and dimension extraction via `sharp`.

**Depends on**: Section 01 (schema and migration -- the `media_assets` table must exist)

**Blocks**: Section 03 (vision pipeline dispatches analysis for assets created here), Section 08 (ingestion hook calls `createAssetFromAttachment`)

---

## File to Create

`/home/dev/projects/SmartSpecPro/apps/web/server/services/mediaAssetService.ts`

## Test File to Create

`/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/mediaAssetService.test.ts`

---

## Tests (Write First)

All tests use Vitest. Mock the database layer (`getDb`) and the storage module (`storage.ts`). The service follows the same DB-access pattern as `memoryService.ts` -- import `getDb` from `../db` and use Drizzle query builder.

```typescript
// /home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/mediaAssetService.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock getDb, storage, and sharp before imports
vi.mock("../../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../storage", () => ({
  storagePresignGet: vi.fn(),
}));

vi.mock("sharp", () => ({
  default: vi.fn(),
}));

describe("mediaAssetService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createAssetFromAttachment", () => {
    // Test: creates media_assets row with correct fields (tenantId, userId,
    //       conversationId, messageId, projectId, storageKey, mimeType, status='pending')
    it("creates media_assets row with correct fields", async () => {
      /* stub */
    });

    // Test: returns existing assetId when checksumSha256 matches for same user+tenant (idempotency)
    it("returns existing assetId when checksumSha256 matches", async () => {
      /* stub */
    });

    // Test: sets status to 'pending' on new asset
    it("sets status to pending on new asset", async () => {
      /* stub */
    });

    // Test: extracts width/height via sharp metadata
    it("extracts image dimensions via sharp", async () => {
      /* stub */
    });
  });

  describe("fetchAsset", () => {
    // Test: returns asset row + signed URL for valid assetId and tenantId
    it("returns asset with signed URL", async () => {
      /* stub */
    });

    // Test: rejects (returns null / throws) when tenantId does not match (tenant isolation)
    it("rejects request with wrong tenantId", async () => {
      /* stub */
    });
  });

  describe("generateSignedUrl", () => {
    // Test: calls storagePresignGet with 1-hour expiry and returns the URL string
    it("returns time-limited URL with 1h expiry", async () => {
      /* stub */
    });
  });

  describe("computePerceptualHash", () => {
    // Test: returns consistent hash string for the same image buffer
    it("returns consistent hash for same image", async () => {
      /* stub */
    });
  });

  describe("findSimilarAssets", () => {
    // Test: returns assets whose perceptual hash Hamming distance is below threshold
    it("returns matches below Hamming distance threshold", async () => {
      /* stub */
    });
  });

  describe("deleteAsset", () => {
    // Test: deletes the media_assets row (cascades to analysis, memory items, vectors via FK)
    it("cascades to analysis, memory items, vectors", async () => {
      /* stub */
    });

    // Test: rejects when userId or tenantId do not match the asset owner
    it("rejects when userId/tenantId do not match", async () => {
      /* stub */
    });
  });

  describe("validateImage", () => {
    // Test: rejects SVG mime type
    it("rejects SVG format", () => {
      /* stub */
    });

    // Test: rejects HEIC mime type
    it("rejects HEIC format", () => {
      /* stub */
    });

    // Test: rejects files larger than 20MB
    it("rejects files over 20MB", () => {
      /* stub */
    });

    // Test: accepts JPEG, PNG, WebP, GIF
    it("passes JPEG, PNG, WebP, GIF", () => {
      /* stub */
    });
  });
});
```

---

## Implementation Details

### Service Responsibilities

The `mediaAssetService` is a stateless service module exporting standalone async functions. It uses the Drizzle ORM for all database operations, following the pattern established in `memoryService.ts` (import `getDb` from `../db`, import table definitions from `../../drizzle/schema`).

### Prerequisites: Install `sharp`

**IMPORTANT**: `sharp` is NOT currently in `apps/web/package.json`. It must be added before implementing this section:

```bash
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm add sharp && pnpm add -D @types/sharp
```

After installing, verify it works: `node -e "const sharp = require('sharp'); console.log('sharp OK')"`.

### Dependencies (Node.js packages)

- `sharp` -- image metadata extraction (width, height), perceptual hashing (resize to 8x8 grayscale), and potential resize for images >4096px. **Must be installed as a prerequisite (see above).**
- `crypto` (Node built-in) -- for SHA-256 checksum computation.
- `@aws-sdk/s3-request-presigner` -- already used by `storage.ts`; the service delegates to `storagePresignGet` from `/home/dev/projects/SmartSpecPro/apps/web/server/storage.ts`.

### Exported Functions

#### `createAssetFromAttachment(attachment, context)`

**Parameters**:
- `attachment` -- object matching the `messages.attachments` array element shape: `{ type, url, key?, name?, size?, mimeType?, thumbnail? }`
- `context` -- `{ userId: number, tenantId: string, conversationId: number, messageId: number, projectId: string }`

**Behavior**:
1. Validate the image (call `validateImage` with mimeType and size). Throw or return an error result if invalid.
2. Compute SHA-256 checksum of the `storageKey` (or fetch the file bytes and hash them if the key is available). The checksum is used for dedup, not cryptographic security -- hashing the storage key is acceptable as a lightweight approach; hashing file content is more robust but requires fetching the file.
3. Check for existing asset with matching `checksumSha256` + `tenantId` + `userId`. If found, return the existing `assetId` (idempotency).
4. If `attachment.key` is available, attempt to extract dimensions using `sharp`. Call `sharp(buffer).metadata()` to get `width` and `height`. If dimensions cannot be extracted (e.g., remote URL without key), leave them null.
5. Insert into `media_assets` table with `status: 'pending'`, `sourceType: 'chat_attachment'`, and all context fields.
6. Return the new `assetId` (bigint from the insert).

**Database table**: `mediaAssets` from `drizzle/schema.ts` (created in Section 01).

**Tenant isolation**: The `tenantId` is always set from the authenticated session context, never from user input.

#### `fetchAsset(assetId, tenantId)`

Query `media_assets` with both `id = assetId` AND `tenantId = tenantId`. If no row matches, return `null`. If found, generate a signed URL via `generateSignedUrl(asset.storageKey)` and return the asset row augmented with the signed URL.

#### `generateSignedUrl(storageKey, expirySeconds?)`

Delegates to `storagePresignGet(storageKey, expirySeconds ?? 3600)` from `apps/web/server/storage.ts`. That function already handles S3/R2 presigning with clamped expiry. For local storage (where `storagePresignGet` returns null), fall back to the proxy URL pattern (`/api/storage/files/${storageKey}`).

Default expiry is 3600 seconds (1 hour), matching the security requirement that image URLs sent to LLM context must be time-limited.

#### `validateImage(mimeType, fileSize)`

Pure synchronous validation function.

**Allowed MIME types**: `image/jpeg`, `image/png`, `image/webp`, `image/gif`.
**Rejected types**: `image/svg+xml`, `image/heic`, `image/heif`, and anything not in the allowed list.
**Max file size**: 20 MB (20 * 1024 * 1024 bytes).

Returns `{ valid: boolean, reason?: string }`.

#### `computePerceptualHash(imageBuffer)`

Accepts a `Buffer` of the image. Uses `sharp` to:
1. Resize to a small fixed size (e.g., 8x8 grayscale).
2. Compute average pixel value.
3. Generate a binary hash string where each bit is 1 if pixel > average, 0 otherwise.

This is a standard dHash (difference hash) approach. The result is a hex-encoded string stored in `media_assets.perceptualHash`.

If `sharp` processing fails (corrupt image), return `null` rather than throwing.

#### `findSimilarAssets(hash, tenantId, threshold?)`

Query `media_assets` filtered by `tenantId` where `perceptualHash IS NOT NULL`. For each result, compute Hamming distance between the query hash and the stored hash. Return assets where distance is below `threshold` (default: 10 for a 64-bit hash).

The Hamming distance computation can be done in JavaScript after fetching candidates, or via a PostgreSQL bit-counting function if performance requires it. At the expected scale (<10K images/month), in-app filtering is acceptable.

#### `deleteAsset(assetId, userId, tenantId)`

1. Fetch the asset, verifying `userId` and `tenantId` match.
2. If no match, throw an authorization error.
3. Delete from `media_assets` where `id = assetId`. The database CASCADE constraints (defined in Section 01) automatically remove related `media_asset_analysis`, `multimodal_memory_items`, `multimodal_memory_vectors`, and `multimodal_memory_links` rows.
4. Return `{ deleted: true }`.

### Database Access Pattern

Follow the existing pattern from `memoryService.ts`:

```typescript
import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { mediaAssets } from "../../drizzle/schema";
```

Every query must include `tenantId` in the WHERE clause. The `getDb()` function returns a Drizzle database instance; if it returns null/undefined (during startup), the service should throw a clear error.

### Storage Integration

The service reuses the unified storage layer at `/home/dev/projects/SmartSpecPro/apps/web/server/storage.ts`. Key functions:

- `storagePresignGet(relKey, expiresIn)` -- generates a presigned GET URL for S3/R2. Returns `{ url, key }` or `null` for local storage.
- `storageResolveUrl(relKey)` -- resolves a key to a proxy URL (for local and R2). Used as fallback when presigning is not available.

### Image Dimension Extraction

Use `sharp` to extract metadata without fully decoding the image:

```typescript
import sharp from "sharp";

async function extractDimensions(buffer: Buffer): Promise<{ width?: number; height?: number }> {
  try {
    const metadata = await sharp(buffer).metadata();
    return { width: metadata.width, height: metadata.height };
  } catch {
    return {};
  }
}
```

If the image is only available as a URL (no buffer), dimension extraction can be deferred to the vision pipeline (Section 03) which downloads the image anyway.

### Resize Requirement

If either dimension exceeds 4096px, resize using sharp before the image enters the vision pipeline. This is a preparatory step -- the service stores the original but can provide a resized URL/buffer for downstream consumers. Implementation options:

1. **Eager**: resize on upload, store the resized version as a separate key.
2. **Lazy**: provide a `getResizedBuffer(assetId, maxDim)` function that resizes on demand.

The lazy approach is simpler and avoids storing duplicate files. The vision pipeline (Section 03) can call this when needed.

### Error Handling

- Database errors: let them propagate (the caller in the chat router handles error responses).
- Sharp errors (corrupt images): catch and return graceful defaults (null dimensions, null hash).
- Storage errors (presigning fails): catch and fall back to proxy URL.

---

## Integration Points

- **Section 01** provides the `mediaAssets` table definition in `drizzle/schema.ts`. The service imports this table for all queries.
- **Section 03** (vision pipeline) calls the asset after it is created to fetch the image URL for analysis.
- **Section 08** (ingestion hook in `chat.ts`) calls `createAssetFromAttachment` for each image attachment in a new message.
- **Section 10** (user controls) calls `deleteAsset` when a user removes an image from memory.