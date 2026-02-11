# Security Hardening Spec (2026-02-11)

## Scope
- Review and hardening for Library + Document Management + Admin Gallery changes deployed on 2026-02-11.
- Keep existing product behavior working, especially:
  - image preview from external URLs (`https://...`)
  - markdown image links to external sources
  - existing upload/preview flows

## Findings (Ordered by Severity)
1. `High` Stored XSS risk from active-content uploads on same origin  
   - Current upload and preview paths can allow active files (for example HTML/SVG) to be served from `/uploads` on app origin.
   - Impact: attacker-controlled script execution in user browser context.

2. `High` Weak URL validation for `sourceUrl` / `thumbnailUrl` in library item mutations  
   - URL fields are accepted as generic strings, then rendered in `href/src/iframe`.
   - Impact: unsafe schemes, phishing payloads, and internal endpoint probing via crafted URLs.

3. `Medium` Library feature-flag allowlist bypass when tenant context is missing  
   - Allowlist mode may still return enabled when tenant id is empty.
   - Impact: library access may be wider than intended under misconfigured/missing tenant context.

4. `Medium` Library Ops endpoints are not fully tenant-scoped  
   - Retry/summary operations can affect or expose cross-tenant operational data if admin model is tenant-scoped.
   - Impact: cross-tenant visibility or action risk.

5. `Low` Office preview host checks are incomplete  
   - Current local-host checks are narrow and do not fully cover private IP ranges.
   - Impact: metadata leakage risk when forwarding internal-looking URLs to external viewer service.

## Additional Hardening (Must Keep External Image URLs Working)
1. Add centralized URL policy (server-side) with context-aware rules  
   - Allow for image/video preview:
     - relative `/uploads/...`
     - external `https://...`
   - Block dangerous schemes (`javascript:`, `file:`, `vbscript:`, unexpected `data:`).
   - Keep external image URLs functional (no blanket `https` block).

2. Separate active-content handling from media handling  
   - Keep external images allowed.
   - For uploaded active documents (for example HTML/SVG), force download mode (`Content-Disposition: attachment`) or serve from isolated domain.
   - Do not block `https` image links in markdown/editor.

3. Strengthen external media proxy for images (not remove feature)  
   - Keep `/api/media/image-proxy` available for external image preview.
   - Add strict host and redirect validation, content-length limits, and timeout.
   - Enforce `image/*` response type and reject private/internal destinations.

4. Tenant-safe gating and ops scoping  
   - In allowlist mode: missing tenant context => deny by default.
   - Scope library ops summary/retry/reprocess by tenant unless explicitly super-admin global operation.
   - Preserve current user flows for same-tenant operations.

5. Add regression + security test suite for preserved functionality  
   - Positive tests: external `https` image still previews and markdown image renders.
   - Negative tests: blocked unsafe schemes and active-content execution paths.
   - Add tests for tenant-missing allowlist behavior and tenant-bound ops behavior.

## Acceptance Criteria
- External image URLs continue to work in:
  - Document Management preview
  - Markdown editor image insertion/render
  - Media/library search thumbnail usage
- Unsafe schemes and active-content vectors are blocked by policy.
- No cross-tenant ops side effects in tenant-admin mode.
- Security tests added and passing for both positive (allowed) and negative (blocked) cases.
