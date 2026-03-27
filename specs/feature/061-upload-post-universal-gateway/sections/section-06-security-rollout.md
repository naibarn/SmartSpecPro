# Section 06: Security, Rollout, and Cleanup

## Scope

Add the security controls, observability, rollout gating, and cleanup policies that make the feature safe to ship.

## Work

- Enforce SSRF validation on all media URLs.
- Enforce the no-fetch rule so the Node.js process never dereferences user-supplied media URLs directly.
- Add per-user Upload-Post rate limiting for publish, status, and management operations.
- Add nonce-verified JWT callback handling and origin-checked popup messaging.
- Add audit events and sanitize all external error data.
- Add job retention cleanup, 30-day metadata nullification, and connection delete cascades.
- Add a shared-key warning when multiple users in a tenant point to the same Upload-Post API key.

## Constraints

- Fail closed when the feature flag is disabled or Redis is unavailable.
- Check tenant opt-in in the tenant settings/feature-flag layer in addition to the global fail-closed helper.
- Never leak Upload-Post API keys, account email, or raw upstream error bodies.
- Preserve consent and tenant opt-in checks before any first-use connection or publish path.
- Keep cleanup and revalidation behavior best-effort so outages do not break the main user flow.
