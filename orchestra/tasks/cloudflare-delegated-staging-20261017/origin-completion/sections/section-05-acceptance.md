# Section 05 — Actual authentication, isolation and recovery acceptance

Owner/paths: main verifier; existing parent HANDOFF, scoped transport/runtime/preflight tests and existing browser tooling. Extend existing Admin diagnostics if required; do not add a second readiness authority or promote absent evidence to PASS.

Prerequisites: fixtures can be prepared before provisioning; live acceptance needs section 04 receipts, exact deployed artifact/config IDs, two legitimately authorized tenant contexts and real supported auth methods. Never seed production passwords, mint synthetic sessions or infer consent from browser UI rendering. Use bounded approved test data and operations; no real payment/cost side effects without their existing authority.

Actual route matrix: POST /trpc/auth.login, GET auth.me query using actual tRPC encoding, POST auth.logout, reload session persistence, pending 2FA where enabled, configured Google/GitHub callback and the applicable token refresh/revocation flow. /api/auth/session remains a generic proxy diagnostic, not the authenticated-session success oracle.

Prove CSRF rejection on actual middleware; missing/wrong Access/app attestation rejection; forwarded host/internal header spoof rejection; unknown/inactive tenant rejection; tenant A cannot read/write tenant B data; logout revocation and sibling Worker cookie isolation. Qualify multiple Set-Cookie, redirects, uploads/downloads, SSE and disconnects. Inspect real browsers on desktop/mobile. Moli unavailable means Moli UNVERIFIED; Chromium evidence is named explicitly.

UI/UX Contract: retain current login, 2FA and callback surfaces/components; no layout redesign. Cover loading, valid/invalid credentials, expired session, forbidden tenant, upstream unavailable and logged-out states; retain localized Thai/English copy and keyboard/form accessibility. No horizontal overflow on desktop/mobile. Capture screenshots/console/network failures without tokens, cookies or personal data.

Keep native health, HTTP origin/auth diagnostics and full job-runtime /readyz separate. Disabled activation may correctly leave /readyz 503 after auth succeeds. Runtime probe failures must identify the exact stage/config/version safely. Do not activate queues, cron or jobs to turn a health check green.

Acceptance/recovery: real canonical deploy → actual auth/isolation/browser probes → rollback to known origin-compatible version/config → repeat probes → restore latest → verify production health and revoke temporary authority. Capture actual job/outbox/provider/version/config/rollback IDs. Worker and origin recovery require separate evidence.

Full-migration follow-up: supported user-journey/API parity, active canonical jobs/media/private storage/provider callbacks, bounded credit/payment tests, and explicit SSE/WebSocket routing must pass before broad production route changes. Resolve existing full-target binding/recovery gates if those services are intended for activation. Preserve native ingress or implement/test an approved bridge; a 501 WebSocket path cannot be accepted as full parity. Database stays in its current location; retired routes remain retired.

Merge readiness: scoped fixtures/diagnostics can integrate before live proof. Final acceptance needs real evidence; missing authority or fixtures remain named outstanding items. Rollback: restore previous approved staged version/config and keep production routing unchanged on auth/isolation failure. Record exact integrated and serving SHAs in the existing HANDOFF.


## UI/UX Contract

### Target User / JTBD

Two legitimately authorized tenant users completing same-origin login and protected actions.

### Surface Inventory

Existing login, 2FA, callback, authenticated app and logout surfaces.

### Component Map

Existing form controls, useAuth consumers and protected page components.

### State Matrix

Loading, authenticated, invalid credentials, 2FA, expired, wrong tenant, upstream failure and logout.

### Responsive Matrix

Desktop 1440x1000 and mobile 390x844; no overflow or lost form controls.

### Accessibility Acceptance

Labels, keyboard/focus, error announcement and password toggle remain functional.

### Copy Contract

Preserve existing Thai/English messages and fallback; do not display provider secrets or internals.

### Browser Evidence Required

Real login/me/logout, reload, OAuth/2FA where configured, isolation and rollback evidence; label Moli/Chromium separately.
