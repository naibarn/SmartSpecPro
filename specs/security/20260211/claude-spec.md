# Claude Spec - Security Hardening for Library / Document Management / Admin Gallery

## 1) Goal
Harden security controls for Library + Document Management + related ops while preserving existing product behavior for external image usage.

## 2) In-Scope Areas
- Library item create/update/upload flows.
- URL-bearing fields and preview rendering paths.
- Library feature gating with tenant allowlist.
- Library operational/admin endpoints for summary/retry/reprocess.
- Office and remote media preview safety controls.
- Security + regression test coverage.

## 3) Functional Requirements

### FR-1: Centralized URL policy enforcement
Implement server-side URL validation/sanitization policy used by all library mutations that accept/store URL fields.

Policy requirements:
- Allow:
  - relative app-local file URLs (for example `/uploads/...`)
  - external `https://...` URLs for image/video/document sources
- Deny:
  - `javascript:` / `vbscript:` / `file:` schemes
  - disallowed `data:` payloads (except explicitly allowed contexts, if any)
  - malformed URLs or unsupported protocols

Compatibility constraint:
- External `https://` image links must remain fully functional.

### FR-2: Active-content upload hardening
Prevent uploaded active content from executing in app origin context.

Expected behavior:
- Uploaded active-content types (for example HTML/SVG) must be served in non-executable mode (download/attachment or equivalent isolation strategy).
- Standard image/video/document previews remain available where safe.

### FR-3: Tenant-safe feature gating
When tenant allowlist mode is configured:
- Missing tenant context must result in deny-by-default.
- Only explicitly allowlisted tenant IDs can access library features.

### FR-4: Tenant-scoped library ops
Library ops endpoints and services must avoid cross-tenant exposure/actions in tenant-admin operation mode.

Requirements:
- Summary/retry/reprocess operations must be scoped by tenant where tenant identity exists in data.
- Any intentionally global operation must be explicit and role-gated.

### FR-5: Safer office/external preview decisions
Office viewer embedding must not forward private/internal/local targets.

Requirements:
- Extend host/range checks beyond localhost-only checks.
- Preserve preview/open behavior for safe public URLs.

### FR-6: Harden external image proxy without removing feature
Keep image proxy working for external image preview while adding safety controls.

Requirements:
- Enforce remote host safety (including redirects).
- Add timeout and payload-size limits.
- Continue enforcing image-only content type.

## 4) Non-Functional Requirements
- No regression in user flows for external image usage in:
  - Document Management preview
  - Markdown editor image links
  - Library/media search thumbnails
- Security failures should return clear, actionable errors.
- Changes should be observable via logs/metrics for denied requests and blocked unsafe inputs.

## 5) Testing Requirements
Add security regression tests covering both positive and negative scenarios.

Positive tests (must pass):
- External `https://` image URL can be stored and previewed.
- Markdown with external image URL renders as expected.

Negative tests (must fail/deny):
- Unsafe URL schemes rejected at mutation boundary.
- Active-content execution paths blocked.
- Allowlist mode denies missing tenant context.
- Tenant-scoped ops do not process cross-tenant targets.
- Office preview blocks private/internal host targets.

## 6) Acceptance Criteria
- Unsafe URL and active-content vectors are blocked by policy.
- External image URL behavior is preserved across target UI paths.
- No cross-tenant side effects from library ops in tenant-admin mode.
- New security/regression tests are added and passing.
