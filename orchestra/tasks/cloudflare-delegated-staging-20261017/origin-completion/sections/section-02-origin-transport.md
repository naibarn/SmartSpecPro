# Section 02 — Protected origin transport and trusted context

Owner/paths: main implementer; `apps/cloudflare/src/authOriginProxy.ts`, its tests, `contracts.ts`, existing `_core/cloudflareOriginAttestation.ts`, `_core/index.ts` integration and focused actual-middleware tests. Reuse `_core/tenant.ts`; no new tenant registry. Do not edit policy/settings storage owned by section 03 except its agreed interface.

Interface: versioned origin descriptor supplies pinned HTTPS origin/host, exact allowed public origins, Access mode and server-only Client ID/Secret plus attestation secret version. Proposed env fields AUTH_ORIGIN_ACCESS_CLIENT_ID/SECRET are new code, not already provisioned. Preserve existing unconfigured 503 and v1 staging behavior.

Implement Access headers atomically; discard caller Access/trust/forwarding headers before injecting credentials. Preserve the user's Authorization, CSRF, cookies, redirects and response Set-Cookie. Detect Access denial without rewriting legitimate OAuth callbacks. No automatic retry of ambiguous writes. Test header deadlines, body-stream lifetime and caller cancellation.

At the protected ingress, reject absent/wrong attestation before tenant/CSRF/auth; allow existing public production behavior. Establish a verified discriminator and exact public-host context through the actual cloudflared/proxy chain. A client Host or X-Forwarded-Host alone must not qualify. Resolve tenant explicitly, never through loopback first-tenant fallback. Keep trust proxy narrow.

TDD/acceptance: existing Worker proxy fixtures plus actual Express middleware requests for missing/wrong/right trust, host spoof, unknown/inactive tenant, real cookie serialization and actual CSRF policy. No copied-policy tests or startup/scheduler imports. See implementation-plan-tdd.md for routes and negative matrix.

True prerequisites: no provider provisioning for unit/integration code. Live proof waits for actual protected ingress and section 03 binding. Merge readiness: scoped tests and default-disabled behavior; verify legacy public requests unchanged. Rollback: previous code with origin capability disabled; no production route mutation in this slice.


## UI/UX Contract

### Target User / JTBD

Users whose login/API requests traverse the Worker to the existing origin.

### Surface Inventory

Existing login/OAuth/API error surfaces; no new screen or layout.

### Component Map

Existing login, 2FA and callback components consume unchanged response contracts.

### State Matrix

Success, invalid credentials, denied host/tenant, upstream unavailable and timeout.

### Responsive Matrix

Desktop/mobile HTTP and cookie behavior identical; preserve existing responsive layout.

### Accessibility Acceptance

Preserve accessible errors, focus and keyboard flow; no CSS or layout change.

### Copy Contract

Keep localized application errors; sanitize transport codes without credential detail.

### Browser Evidence Required

Actual browser redirect, multiple cookies, reload and interrupted request evidence after section 04.
