# Section 01 - URL Policy Foundation

## Objective
Build a shared, server-side URL policy module that becomes the single source of truth for accepting/rejecting library/media URLs.

## Scope
- Add a dedicated policy module for URL parsing, normalization, classification, and rejection reasons.
- Define context-aware policy evaluation for:
  - library `sourceUrl`
  - library `thumbnailUrl`
  - office preview candidate URL
  - image proxy target URL
- Provide deterministic error payloads suitable for API responses and audit logging.

## Files to Add / Modify
- Add: `apps/web/server/services/libraryUrlPolicy.ts`
- Add: `apps/web/server/services/libraryUrlPolicy.test.ts`
- Modify: `apps/web/server/services/libraryService.ts` (consume policy helpers only after tests in section 03)
- Optional add: `apps/web/server/services/urlHostSafety.ts` (if host checks are shared)

## TDD Stubs (Write First)
- Test: accepts relative `/uploads/...` URLs in library contexts.
- Test: accepts public `https://` URLs.
- Test: rejects unsafe schemes (`javascript:`, `vbscript:`, `file:`).
- Test: rejects malformed URL values.
- Test: classifies local/private hosts for public-only contexts.
- Test: returns stable reject codes/messages for downstream route mapping.

## Implementation Tasks
1. Design policy types (`UrlPolicyContext`, `UrlPolicyResult`, `UrlRejectReason`).
2. Implement normalization and validation pipeline.
3. Implement host-classification helper for local/private detection.
4. Add context-specific allow/deny matrix.
5. Add unit tests to lock matrix behavior.

## Acceptance Criteria
- Policy module passes full unit suite.
- Consumers can call a single API to validate URL inputs.
- Reject reason codes are deterministic and suitable for analytics/audit.

## Notes / Risks
- Keep compatibility: valid external `https://` image URLs must remain accepted.
- Do not silently mutate unsafe URLs; reject with explicit reason.
