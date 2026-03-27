Now I have all the context needed. Let me produce the section content.

# Section 06: tRPC SSRF Defense-in-Depth

## Section ID
`section-06-security-ssrf`

## Overview

This section adds a tRPC-level SSRF (Server-Side Request Forgery) defense that validates all URL-like string values inside `extraParams` across every media generation endpoint. This is a defense-in-depth measure: the Python backend (`FalAIProvider._validate_urls()`) performs its own SSRF checks (see section-03), but this tRPC layer catches malicious URLs before they even reach the Python backend, and applies universally to all providers.

## Dependencies

- **No section dependencies.** This section is fully independent and can be implemented in parallel with all other sections (Batch 1).
- Uses only existing project infrastructure: Zod validation, tRPC router patterns.

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/media.ts` | Modify | Add Zod `.superRefine()` on `extraParams` in all media generation input schemas |

## Background Context

### Current State

The media router at `/home/dev/projects/SmartSpecPro/apps/web/server/routers/media.ts` defines six media generation mutations that accept `extraParams: z.record(z.any()).optional()`:

1. `generateImage` (line ~1045)
2. `generateVideo` (line ~1187)
3. `generateAudio` (line ~1297)
4. `generateAudioAsync` (line ~1410)
5. `generateImageAsync` (line ~1539)
6. `generateVideoAsync` (line ~1674)

Additionally, the `estimateCost` query (line ~2171) accepts `extraParams` but does not forward URLs to external systems, so it does not need SSRF validation.

The `extraParams` field is a pass-through bag of key-value pairs forwarded to the Python backend. For fal.ai models, this includes URL fields like `image_url`, `end_image_url`, `audio_url`, and `video_url` which are user-controlled and could target internal infrastructure.

### Existing SSRF Protection (Python Side)

The Python backend has `validate_uri_no_ssrf()` in `/home/dev/projects/SmartSpecPro/python-backend/app/core/media_job_validators.py` which rejects private IPs, localhost, and `file://` schemes. However, it **whitelists** `host.docker.internal` (needed for Docker workers downloading assets). The fal.ai provider (section-03) adds an explicit reject for `host.docker.internal` in its own `_validate_urls()`, but that only protects the fal.ai code path.

This tRPC layer provides defense-in-depth by blocking internal URLs for **all** providers before any Python code runs.

### Internal Hostname Blocklist

The following hostnames and IP patterns must be blocked when they appear in URL-like values inside `extraParams`:

- `localhost`
- `127.0.0.1` (and `127.*` range)
- `0.0.0.0`
- `host.docker.internal`
- `10.*` (Class A private)
- `172.16.*` through `172.31.*` (Class B private)
- `192.168.*` (Class C private)
- `169.254.*` (link-local / AWS metadata endpoint)
- `[::1]` (IPv6 loopback)

## Tests (TDD)

Tests go in `/home/dev/projects/SmartSpecPro/apps/web/server/__tests__/media-ssrf-validation.test.ts`.

### Test Cases

```typescript
// Test file: /home/dev/projects/SmartSpecPro/apps/web/server/__tests__/media-ssrf-validation.test.ts
// Framework: Vitest

// Import the shared validation helper (extracted for testability)
// import { validateExtraParamsNoSsrf } from "../routers/media";

// --- Blocked URLs (must reject) ---

// Test: extraParams with value "http://localhost:8000/api/admin" -> throws SSRF error
// Test: extraParams with value "http://127.0.0.1:3000/internal" -> throws SSRF error
// Test: extraParams with value "http://127.0.0.2/probe" -> throws SSRF error (full 127.0.0.0/8 range)
// Test: extraParams with value "http://host.docker.internal:8000/api" -> throws SSRF error
// Test: extraParams with value "http://0.0.0.0:3000" -> throws SSRF error
// Test: extraParams with value "http://10.0.0.1/private" -> throws SSRF error
// Test: extraParams with value "http://10.255.255.255/end" -> throws SSRF error
// Test: extraParams with value "http://172.16.0.1/private" -> throws SSRF error
// Test: extraParams with value "http://172.31.255.255/end" -> throws SSRF error
// Test: extraParams with value "http://172.15.0.1/ok" -> passes (172.15 is NOT private)
// Test: extraParams with value "http://172.32.0.1/ok" -> passes (172.32 is NOT private)
// Test: extraParams with value "http://192.168.1.1/private" -> throws SSRF error
// Test: extraParams with value "http://169.254.169.254/latest/meta-data" -> throws SSRF error (AWS metadata)
// Test: extraParams with value "http://[::1]:8000/internal" -> throws SSRF error (IPv6 loopback)

// --- Allowed URLs (must pass) ---

// Test: extraParams with value "https://example.com/image.png" -> passes
// Test: extraParams with value "https://v3b.fal.media/files/example.mp4" -> passes
// Test: extraParams with value "https://storage.googleapis.com/bucket/file.wav" -> passes

// --- Non-URL values (must pass without checking) ---

// Test: extraParams with value "1080p" -> passes (not a URL)
// Test: extraParams with value "hello world" -> passes (not a URL)
// Test: extraParams with value 42 (number) -> passes (not a string)
// Test: extraParams with value true (boolean) -> passes (not a string)

// --- Edge cases ---

// Test: empty extraParams ({}) -> passes
// Test: undefined/missing extraParams -> passes
// Test: extraParams with nested object containing URL -> passes (only validates top-level string values)
// Test: extraParams with multiple values, one bad URL -> rejects with message identifying the offending key
// Test: extraParams with key "image_url" set to "http://10.0.0.1/ssrf" -> rejects
// Test: extraParams with key "audio_url" set to "http://host.docker.internal:8000" -> rejects
// Test: extraParams with URL using uppercase scheme "HTTP://localhost" -> rejects (case-insensitive check)
```

## Implementation Details

### 1. Create a Shared SSRF Validation Helper

Extract a reusable function (exported from the media router file or a small utility) so it can be tested independently and applied to all six mutation schemas.

**Function signature:**

```typescript
// In /home/dev/projects/SmartSpecPro/apps/web/server/routers/media.ts
// (or extracted to a small helper file if preferred)

/**
 * Validates that no string value in extraParams is a URL targeting internal hosts.
 * Returns an array of error messages (empty if all values are safe).
 */
export function validateExtraParamsNoSsrf(
  extraParams: Record<string, unknown> | undefined
): string[];
```

**Logic:**

1. If `extraParams` is undefined or empty, return `[]` (no errors).
2. Iterate over all top-level key-value pairs in `extraParams`.
3. For each value that is a string and matches the pattern `^https?://` (case-insensitive):
   a. Parse the URL to extract the hostname.
   b. Check hostname against the blocklist (see below).
   c. If blocked, push an error message like `"extraParams.${key} targets internal host"`.
4. Return the collected error messages.

**Hostname blocklist check function:**

```typescript
/**
 * Returns true if the hostname is internal/private and should be blocked.
 */
function isInternalHost(hostname: string): boolean;
```

The function should check:

- Exact match: `localhost`, `host.docker.internal`, `0.0.0.0`
- IPv6 loopback: `[::1]` or `::1`
- IPv4 private ranges using numeric comparison:
  - `127.0.0.0/8` (loopback)
  - `10.0.0.0/8` (Class A private)
  - `172.16.0.0/12` (Class B private: 172.16.x.x through 172.31.x.x)
  - `192.168.0.0/16` (Class C private)
  - `169.254.0.0/16` (link-local, AWS metadata)

Use `new URL(value)` to parse the hostname. Wrap in try/catch -- if URL parsing fails, skip the value (it is not a valid URL, so not an SSRF risk).

### 2. Create a Reusable Zod Schema for extraParams

Define a single Zod schema that wraps the existing `z.record(z.any()).optional()` with a `.superRefine()` that calls `validateExtraParamsNoSsrf`:

```typescript
const extraParamsSchema = z
  .record(z.any())
  .optional()
  .superRefine((val, ctx) => {
    const errors = validateExtraParamsNoSsrf(val);
    for (const msg of errors) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg });
    }
  });
```

### 3. Replace extraParams in All Six Mutations

Replace every occurrence of `extraParams: z.record(z.any()).optional()` in the six media generation mutations with `extraParams: extraParamsSchema`. The affected mutations and their approximate line locations:

| Mutation | Approx Line |
|----------|-------------|
| `generateImage` | 1045 |
| `generateVideo` | 1187 |
| `generateAudio` | 1297 |
| `generateAudioAsync` | 1410 |
| `generateImageAsync` | 1539 |
| `generateVideoAsync` | 1674 |

The `estimateCost` query (line ~2171) does NOT need this validation because it never forwards URLs to external systems -- it only computes pricing.

### 4. Error Behavior

When SSRF validation fails:
- Zod `.superRefine()` produces a validation error that tRPC surfaces as a `BAD_REQUEST` TRPCError.
- The error message identifies which `extraParams` key contains the offending URL, e.g., `"extraParams.image_url targets internal host"`.
- The actual URL value is NOT included in the error message (to avoid information leakage about internal infrastructure).

## Verification Steps

1. Run the new tests: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run server/__tests__/media-ssrf-validation.test.ts`
2. Run the full web test suite: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test`
3. Run TypeScript type check: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check`
4. Verify no regressions in existing media generation flows (extraParams with normal non-URL values must pass through unchanged).

## Security Notes

- This is **defense-in-depth**: the Python backend (section-03) also validates URLs. Even if one layer is bypassed, the other catches it.
- The tRPC layer is **provider-agnostic** -- it protects all providers, not just fal.ai.
- Only top-level string values in `extraParams` are checked. Nested objects/arrays are not traversed because current usage patterns only place URLs at the top level of `extraParams`.
- Non-URL strings (e.g., `"1080p"`, `"h264"`) are not affected because they do not match the `^https?://` pattern.
- The validation runs synchronously (no DNS resolution) to avoid adding latency. DNS-based SSRF detection is handled by the Python layer.