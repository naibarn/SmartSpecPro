# Section 09: R2 Storage — Code Review Interview

## Findings Triage

### Fixed (user approved all 3 security fixes):

1. **Presigned URL expiry clamp (HIGH)** — Added `MAX_PRESIGN_EXPIRY_S = 86400` constant and clamped both `storagePresignGet` and `storagePresignPut` to `Math.min(Math.max(expiresIn, 60), 86400)`. Prevents indefinitely-valid presigned URLs.

2. **R2Client ACL default changed to `public=False` (HIGH)** — Changed `upload_file()` and `upload_fileobj()` default from `public=True` to `public=False`. Backward-compatible: existing callers that need public access can explicitly pass `public=True`. Aligns with the plan's security requirement that all access goes through presigned URLs or server proxy.

3. **StoragePath input sanitization (HIGH)** — Added `_safe_path_component()` function that rejects null bytes, `..`, `/`, and `\` in path components. Applied to all 6 new production StoragePath methods. Prevents path traversal attacks within the R2 bucket.

### Auto-fixed:

4. **Stale priority comment** — Updated file header comment to reflect actual 5-level priority.
5. **Local fallback not cached** — Added `_configCache` assignment for local fallback path.

### Let go:

6-12. Low-priority items deferred (S3Client recreation, missing integration tests, audit logging, etc.)

## Test Results

- Python: 13/13 pass
- Node.js: 29/29 pass (+ 7 skipped)
- No regressions
