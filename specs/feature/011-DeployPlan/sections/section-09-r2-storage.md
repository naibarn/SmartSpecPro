Now I have a thorough understanding of the codebase and the requirements. Let me generate the section content.

# Section 9: R2 Storage Configuration

## Overview

This section configures Cloudflare R2 for production deployment with environment-specific buckets, prefix-based object organization, lifecycle rules for automatic cleanup, presigned URL generation, and a unified storage abstraction that works across both the Node.js and Python services. R2 uses the S3-compatible API, and the existing codebase already has partial R2 support via `@aws-sdk/client-s3` (Node.js) and `boto3` (Python).

## Dependencies

- **Section 01 (GCP Bootstrap):** R2 credentials (`R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_ACCOUNT_ID`) must be stored in GCP Secret Manager before Cloud Run services can access them.

## Blocks

- **Section 08 (Media Pipeline):** Media job processing uploads results to R2 under `temp/raw/`.
- **Section 11 (Video Pipeline):** Video rendering reads input assets from R2 and writes output to `renders/`.
- **Section 12 (Vectorize):** Gallery content in R2 triggers embedding indexing.
- **Section 15 (Admin Dashboard):** Storage panel queries R2 usage by prefix.

## Current State of the Codebase

The codebase already has R2/S3 integration in multiple places:

**Node.js side (`apps/web/server/storage.ts`):**
- A unified storage abstraction with `storagePut`, `storageGet`, `storageDelete`, `storagePresignPut`, `storageStreamFile`, and `storageResolveUrl` functions.
- Reads configuration from the `storage_settings` database table (via Drizzle ORM).
- Uses `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`.
- Supports local, S3/R2, and legacy Forge providers.
- Configuration caching with a 5-minute TTL.

**Python side:**
- `python-backend/app/services/r2_storage_service.py` -- DB-backed R2 service (singleton, reads from `storage_settings` table, decrypts credentials via `smartspecweb_crypto`).
- `python-backend/app/core/r2_config.py` -- Env-var-based `R2Config` dataclass and `R2Client` wrapper around `boto3`.
- `python-backend/app/services/generation/r2_storage.py` -- Full-featured async R2 storage service with upload, download, delete, thumbnail generation, presigned URLs, and file listing.

**Database schema (`apps/web/drizzle/schema.ts`):**
- `storage_settings` table with columns for `providerType`, `endpoint`, `region`, `bucket`, encrypted credentials (`accessKeyIdEncrypted`, `secretAccessKeyEncrypted`), `publicUrlPrefix`, `pathPrefix`, `configJson`, `isActive`, etc.
- Admin UI at `StorageSettingsPanel.tsx` for managing storage configuration.

The production deployment must extend this existing infrastructure, not replace it.

---

## Tests

Write these tests before implementing. Tests validate the lifecycle rules, presigned URL behavior, and cross-service storage compatibility.

### Lifecycle Rules (Integration Test)

**File:** `apps/web/server/__tests__/r2-lifecycle.integration.test.ts`

These tests verify that the S3 lifecycle configuration is applied correctly to the R2 bucket. They require actual R2 credentials and should be marked as integration tests (skip in CI without credentials).

```typescript
/**
 * @file r2-lifecycle.integration.test.ts
 * Integration tests for R2 bucket lifecycle configuration.
 * Requires R2_ACCESS_KEY, R2_SECRET_KEY, R2_ACCOUNT_ID env vars.
 * Run with: vitest run --config vitest.integration.config.ts
 */
import { describe, it, expect } from "vitest";

describe("R2 Lifecycle Rules", () => {
  it("should have lifecycle configuration applied to the bucket with correct rules", async () => {
    // Call GetBucketLifecycleConfiguration via S3Client
    // Assert rules array is non-empty
  });

  it("should set 12-day expiration on temp/* prefix", async () => {
    // Assert a rule exists with Filter.Prefix = "temp/"
    // and Expiration.Days = 12
  });

  it("should set 7-day expiration on renders/preview/* prefix", async () => {
    // Assert a rule exists with Filter.Prefix = "renders/preview/"
    // and Expiration.Days = 7
  });

  it("should set no expiration on gallery/* prefix", async () => {
    // Assert no rule targets gallery/ with Expiration
    // OR a rule with Status = "Disabled" for gallery/
  });

  it("should abort incomplete multipart uploads after 1 day", async () => {
    // Assert a rule with AbortIncompleteMultipartUpload.DaysAfterInitiation = 1
  });
});
```

### Presigned URLs (Vitest)

**File:** `apps/web/server/__tests__/r2-presigned.test.ts`

These tests validate presigned URL generation logic. They mock the S3 client to avoid requiring live credentials in unit tests.

```typescript
/**
 * @file r2-presigned.test.ts
 * Unit tests for R2 presigned URL generation.
 */
import { describe, it, expect, vi } from "vitest";

describe("Presigned URL Generation", () => {
  it("should generate a download URL with 1-hour expiry by default", async () => {
    // Call storagePresignGet with a key
    // Assert the URL contains the S3 API endpoint (ACCOUNT_ID.r2.cloudflarestorage.com)
    // Assert expiresIn was passed as 3600
  });

  it("should generate an upload URL that restricts content-type", async () => {
    // Call storagePresignPut with key, contentType, contentLength
    // Assert PutObjectCommand was created with ContentType parameter
    // Assert the URL uses the S3 API endpoint, not a custom domain
  });

  it("should use S3 API endpoint for presigned URLs, not custom domain", async () => {
    // Create S3Client with endpoint = https://{ACCOUNT_ID}.r2.cloudflarestorage.com
    // Generate presigned URL
    // Assert the URL hostname matches the S3 API endpoint
  });

  it("should support configurable expiry for admin download URLs (24-hour)", async () => {
    // Call storagePresignGet with expiresIn = 86400
    // Assert expiresIn was passed as 86400 to getSignedUrl
  });
});
```

### Storage Abstraction (Vitest + pytest)

**File:** `apps/web/server/__tests__/r2-storage-abstraction.test.ts`

```typescript
/**
 * @file r2-storage-abstraction.test.ts
 * Unit tests for the Node.js storage abstraction layer with R2 configuration.
 */
import { describe, it, expect, vi } from "vitest";

describe("Node.js Storage Abstraction", () => {
  it("should upload an object to R2 and return the proxy URL", async () => {
    // Mock S3Client.send for PutObjectCommand
    // Call storagePut("temp/raw/user1/job1/image.png", buffer, "image/png")
    // Assert key matches expected path
    // Assert returned URL is /api/storage/files/temp/raw/user1/job1/image.png
  });

  it("should retrieve an object via the proxy URL pattern", async () => {
    // Call storageGet("temp/raw/user1/job1/image.png")
    // Assert returned URL is /api/storage/files/temp/raw/user1/job1/image.png
  });

  it("should delete an object from R2", async () => {
    // Mock S3Client.send for DeleteObjectCommand
    // Call storageDelete("temp/raw/user1/job1/image.png")
    // Assert DeleteObjectCommand was sent with correct Bucket and Key
  });

  it("should read R2 credentials from environment variables via Secret Manager", async () => {
    // Verify getActiveStorageConfig reads from storage_settings table
    // or falls back to env-var-based config for Cloud Run deployment
  });
});
```

**File:** `python-backend/tests/unit/services/test_r2_storage_abstraction.py`

```python
"""
Unit tests for the Python R2 storage abstraction.
Tests that both the DB-backed and env-var-based R2 clients
can perform standard operations.
"""
import pytest

class TestPythonR2StorageAbstraction:
    """Tests for Python boto3 R2 client operations."""

    async def test_upload_bytes_to_r2(self):
        """Upload bytes via boto3 put_object to R2 bucket."""
        # Mock boto3 client
        # Call upload_bytes with key = "temp/raw/user1/job1/image.png"
        # Assert put_object was called with correct Bucket, Key, Body

    async def test_download_bytes_from_r2(self):
        """Download bytes via boto3 get_object from R2 bucket."""
        # Mock boto3 client
        # Call download_bytes with key
        # Assert get_object was called with correct Bucket, Key

    async def test_file_exists_head_object(self):
        """Check file existence via boto3 head_object."""
        # Mock head_object to return 200
        # Assert file_exists returns True
        # Mock head_object to raise ClientError 404
        # Assert file_exists returns False

    async def test_presigned_url_generation(self):
        """Generate presigned GET and PUT URLs."""
        # Mock generate_presigned_url
        # Assert correct method and params passed
```

### Cross-Service Compatibility (Integration Test)

**File:** `apps/web/server/__tests__/r2-cross-service.integration.test.ts`

```typescript
/**
 * @file r2-cross-service.integration.test.ts
 * Integration test verifying objects written by Node.js can be read by Python and vice versa.
 * Requires live R2 credentials. Skip in CI without credentials.
 */
import { describe, it, expect } from "vitest";

describe("Cross-Service R2 Compatibility", () => {
  it("should write an object with Node.js and read it back", async () => {
    // Use storagePut to write a test object
    // Use storageStreamFile to read it back
    // Assert content matches
    // Cleanup: storageDelete
  });

  it("should use the same bucket and credential source as Python service", async () => {
    // Verify that the R2 endpoint, bucket, and credential derivation
    // match between Node.js (storage.ts) and Python (r2_config.py / r2_storage_service.py)
  });
});
```

---

## Implementation Details

### 1. R2 Bucket Setup

Create one R2 bucket per environment using the Cloudflare dashboard or Wrangler CLI. Naming convention:

- **Staging:** `smartspecpro-staging`
- **Production:** `smartspecpro-production`

Prefix-based organization within each bucket:

```
smartspecpro-{env}/
  temp/raw/          # User uploads, camera footage, Kie AI raw results
  temp/work/         # Intermediate artifacts (proxies, assembly outputs)
  renders/preview/   # Preview-quality render outputs
  renders/final/     # Final render outputs
  gallery/           # Curated public content (permanent)
```

R2 API tokens needed:
- Create an R2 API token in Cloudflare Dashboard with **Object Read & Write** permissions on the target bucket.
- Note the **Access Key ID** and **Secret Access Key** -- these go into GCP Secret Manager as `R2_ACCESS_KEY` and `R2_SECRET_KEY`.
- Note the **Account ID** -- stored as `R2_ACCOUNT_ID`. The S3-compatible endpoint is `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`.

### 2. Lifecycle Rules

Configure lifecycle rules via the S3 API using `PutBucketLifecycleConfiguration`. Create a setup script at `scripts/setup-r2-lifecycle.ts` (Node.js) or extend the existing `python-backend/scripts/setup_r2.sh`.

**File to create:** `scripts/setup-r2-lifecycle.ts`

This script applies the following lifecycle configuration to the R2 bucket:

```typescript
/**
 * @file scripts/setup-r2-lifecycle.ts
 * One-time script to apply lifecycle rules to the R2 bucket.
 * Run: npx tsx scripts/setup-r2-lifecycle.ts
 *
 * Requires env vars: R2_ACCESS_KEY, R2_SECRET_KEY, R2_ACCOUNT_ID, R2_BUCKET_NAME
 */

// Lifecycle rules to apply:
// 1. temp/* -> Delete objects older than 12 days
//    { ID: "cleanup-temp", Filter: { Prefix: "temp/" }, Expiration: { Days: 12 }, Status: "Enabled" }
//
// 2. renders/preview/* -> Delete objects older than 7 days
//    { ID: "cleanup-preview", Filter: { Prefix: "renders/preview/" }, Expiration: { Days: 7 }, Status: "Enabled" }
//
// 3. renders/final/* -> Delete objects older than 12 days
//    { ID: "cleanup-final-renders", Filter: { Prefix: "renders/final/" }, Expiration: { Days: 12 }, Status: "Enabled" }
//
// 4. Abort incomplete multipart uploads after 1 day (all prefixes)
//    { ID: "abort-multipart", Filter: { Prefix: "" }, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 }, Status: "Enabled" }
//
// gallery/* has NO lifecycle rule -- objects are kept indefinitely.
```

Use `S3Client` from `@aws-sdk/client-s3` with `PutBucketLifecycleConfigurationCommand`. The S3Client must be configured with:
- `endpoint`: `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
- `region`: `auto`
- `credentials`: from `R2_ACCESS_KEY` and `R2_SECRET_KEY`

### 3. Presigned URL Generation

The existing `apps/web/server/storage.ts` already has `storagePresignPut` for generating presigned PUT URLs. Add a corresponding `storagePresignGet` function for download URLs.

**File to modify:** `apps/web/server/storage.ts`

Add the following function:

```typescript
/**
 * Generate a presigned GET URL for direct download from S3/R2.
 * Returns null if storage is local/forge (not S3-compatible).
 *
 * @param relKey - The object key relative to bucket root
 * @param expiresIn - URL validity in seconds (default 3600 = 1 hour; use 86400 for admin)
 * @returns Presigned GET URL and key, or null if not S3
 */
export async function storagePresignGet(
  relKey: string,
  expiresIn = 3600,
): Promise<{ url: string; key: string } | null>
```

Implementation notes:
- Use `GetObjectCommand` with `@aws-sdk/s3-request-presigner`'s `getSignedUrl`.
- Import `GetObjectCommand` (already available, used in `storageStreamFile`).
- Presigned URLs use the S3 API endpoint (`{ACCOUNT_ID}.r2.cloudflarestorage.com`), not any custom domain or public URL prefix. This is handled automatically by the S3 client's endpoint configuration.
- For user-facing content: default 1-hour expiry.
- For admin access: allow up to 24-hour expiry via the `expiresIn` parameter.

The existing `storagePresignPut` already enforces content-type restriction via `ContentType` in the `PutObjectCommand`. Verify that `ContentLength` is also being set to prevent oversized uploads.

### 4. Cloud Run Storage Configuration

In Cloud Run, R2 credentials come from GCP Secret Manager (mounted as environment variables). The existing storage abstraction in `apps/web/server/storage.ts` reads from the `storage_settings` database table. For Cloud Run deployment, there are two approaches:

**Approach A (Recommended): Pre-seed storage_settings in the database.**
The `seed-production.ts` script (from Section 03) should insert an active `storage_settings` row with:
- `providerType`: `"r2"`
- `endpoint`: `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com` (from env)
- `bucket`: `smartspecpro-production` (from env)
- `region`: `auto`
- `accessKeyIdEncrypted`: `encrypt(process.env.R2_ACCESS_KEY)`
- `secretAccessKeyEncrypted`: `encrypt(process.env.R2_SECRET_KEY)`
- `isActive`: `true`

This approach keeps the existing DB-driven config resolution unchanged. The Cloud Run service reads from the database just like the current setup.

**Approach B (Fallback): Environment variable fallback.**
If the `storage_settings` table has no active row, the storage module should fall back to constructing an S3 config from environment variables:
- `R2_ACCESS_KEY` -> accessKeyId
- `R2_SECRET_KEY` -> secretAccessKey
- `R2_ACCOUNT_ID` -> endpoint (`https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`)
- `R2_BUCKET_NAME` -> bucket

**File to modify:** `apps/web/server/storage.ts`

Add an env-var fallback in `getActiveStorageConfig()` after the DB query returns no active setting and before falling back to `{ provider: "local" }`:

```typescript
// Priority 4: Environment variable fallback (for Cloud Run)
const r2AccessKey = process.env.R2_ACCESS_KEY;
const r2SecretKey = process.env.R2_SECRET_KEY;
const r2AccountId = process.env.R2_ACCOUNT_ID;
const r2Bucket = process.env.R2_BUCKET_NAME;

if (r2AccessKey && r2SecretKey && r2AccountId && r2Bucket) {
  // Build S3Client from env vars (R2 credentials from Secret Manager)
  // endpoint = `https://${r2AccountId}.r2.cloudflarestorage.com`
  // region = "auto"
  // Return S3Config and cache it
}
```

### 5. Python Storage Configuration for Cloud Run

The Python services need R2 access for:
- Media pipeline (Section 08): Uploading processed media results.
- Video pipeline (Section 11): Reading input assets and writing rendered output.

**File to modify:** `python-backend/app/core/r2_config.py`

Update `R2Config.from_env()` to also read from the GCP Secret Manager environment variables used by Cloud Run. The current implementation reads `CLOUDFLARE_R2_*` env vars. Add fallback to `R2_*` env vars (the names used in Secret Manager):

```python
@classmethod
def from_env(cls) -> "R2Config":
    """Create configuration from environment variables.

    Checks both CLOUDFLARE_R2_* vars (local dev) and R2_* vars (Cloud Run / Secret Manager).
    """
    return cls(
        access_key_id=os.getenv("CLOUDFLARE_R2_ACCESS_KEY_ID") or os.getenv("R2_ACCESS_KEY", ""),
        secret_access_key=os.getenv("CLOUDFLARE_R2_SECRET_ACCESS_KEY") or os.getenv("R2_SECRET_KEY", ""),
        bucket_name=os.getenv("CLOUDFLARE_R2_BUCKET_NAME") or os.getenv("R2_BUCKET_NAME", "smartspec-media"),
        endpoint_url=(
            os.getenv("CLOUDFLARE_R2_ENDPOINT")
            or (f"https://{os.getenv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com" if os.getenv("R2_ACCOUNT_ID") else "")
        ),
        public_url=os.getenv("CLOUDFLARE_R2_PUBLIC_URL", ""),
        custom_domain=os.getenv("CLOUDFLARE_R2_CUSTOM_DOMAIN"),
        region=os.getenv("CLOUDFLARE_R2_REGION", "auto"),
    )
```

The Python `r2_storage_service.py` (DB-backed service) already handles Cloud Run correctly because it reads from the same `storage_settings` table that the Node.js side seeds. No changes needed there.

### 6. Prefix Organization in Existing Code

Review and update existing code that writes to R2 to use the new prefix structure.

**File:** `python-backend/app/services/generation/r2_storage.py`

The `StoragePath` class already defines paths like `images/generated/{user_id}/{task_id}.{ext}`. For the production deployment, these paths should be updated or aliased to use the `temp/raw/` prefix for intermediate content:

```python
class StoragePath:
    @staticmethod
    def media_raw(user_id: str, job_id: str, ext: str = "png") -> str:
        """Path for raw media results from Kie AI (temporary, 12-day lifecycle)."""
        return f"temp/raw/{user_id}/{job_id}/result.{ext}"

    @staticmethod
    def media_thumbnail(user_id: str, job_id: str, ext: str = "jpg") -> str:
        """Path for generated thumbnails (temporary, 12-day lifecycle)."""
        return f"temp/raw/{user_id}/{job_id}/thumbnail.{ext}"

    @staticmethod
    def render_preview(render_hash: str) -> str:
        """Path for preview renders (7-day lifecycle)."""
        return f"renders/preview/{render_hash}.mp4"

    @staticmethod
    def render_final(render_hash: str) -> str:
        """Path for final renders (12-day lifecycle)."""
        return f"renders/final/{render_hash}.mp4"

    @staticmethod
    def gallery_item(gallery_id: str, item_id: str, ext: str = "png") -> str:
        """Path for curated gallery content (permanent, no lifecycle expiry)."""
        return f"gallery/{gallery_id}/{item_id}.{ext}"

    @staticmethod
    def work_artifact(render_hash: str, stage: str, ext: str = "mp4") -> str:
        """Path for intermediate work artifacts (12-day lifecycle)."""
        return f"temp/work/{render_hash}_{stage}.{ext}"
```

### 7. Environment Variables Summary

The following environment variables must be set for R2 storage in Cloud Run (via GCP Secret Manager):

| Variable | Description | Example |
|----------|-------------|---------|
| `R2_ACCESS_KEY` | Cloudflare R2 API token access key | `abc123...` |
| `R2_SECRET_KEY` | Cloudflare R2 API token secret key | `xyz789...` |
| `R2_ACCOUNT_ID` | Cloudflare account ID | `a1b2c3d4e5f6` |
| `R2_BUCKET_NAME` | R2 bucket name | `smartspecpro-production` |

These are in addition to the existing `CLOUDFLARE_R2_*` variables used in local development. The code falls back gracefully between the two naming conventions.

### 8. Security Considerations

- R2 credentials are stored encrypted in the `storage_settings` table (via `encrypt()` from `crypto.ts`).
- In Cloud Run, credentials are mounted from GCP Secret Manager as environment variables -- never committed to code or Docker images.
- Presigned URLs are time-limited (1 hour for users, 24 hours for admin) and scoped to specific objects.
- The `normalizeKey` function in `apps/web/server/storage.ts` prevents path traversal attacks (blocks `..`, null bytes, absolute paths).
- Upload presigned URLs enforce `ContentType` and `ContentLength` restrictions.
- R2 buckets should not have public access enabled -- all access goes through presigned URLs or the server-side proxy (`/api/storage/files/...`).

---

## Implementation Checklist

1. Create R2 buckets in Cloudflare Dashboard (staging and production).
2. Generate R2 API tokens with Object Read & Write permissions.
3. Store R2 credentials in GCP Secret Manager (`R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`).
4. Write and run `scripts/setup-r2-lifecycle.ts` to apply lifecycle rules.
5. Add `storagePresignGet` function to `apps/web/server/storage.ts`.
6. Add environment variable fallback to `getActiveStorageConfig()` in `apps/web/server/storage.ts`.
7. Update `R2Config.from_env()` in `python-backend/app/core/r2_config.py` to support Cloud Run env vars.
8. Update `StoragePath` in `python-backend/app/services/generation/r2_storage.py` with production prefix structure.
9. Update `seed-production.ts` (Section 03) to seed an active `storage_settings` row for R2.
10. Write and run tests (lifecycle integration, presigned URL unit, storage abstraction unit, cross-service integration).
11. Verify lifecycle rules are applied by running the integration test against the staging bucket.