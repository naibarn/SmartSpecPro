# Section 04 — Provision protected ingress and release compatible origin

Owner/paths: platform/origin operator through existing authorities; reviewed existing Tunnel configuration and canonical Linux release tools. Owned mutations must name exact ingress/Access/service-token/DNS resources and origin release/config SHA. Do not modify unrelated hostnames or global Access organization behavior.

Prerequisites: integrated sections 02/03; actual effective provider IAM; real origin release authority; bounded resource/cost scope and expiry; captured old config/runtime/provider receipts. Access/Tunnel/DNS write permissions are not implied by the saved Workers deployment token. Use existing Admin/provisioning authority or stop only the denied operation. No new generic approval checkpoint when the exact existing policy can decide.

Order: protect an exact Access application with Service Auth → create/verify dedicated token → add dedicated named-Tunnel ingress with cloudflared JWT validation → install paired attestation and exact staging public-host/tenant settings on the existing origin through compatible release → upload/deploy the Worker through worker_jobs/outbox → qualify actual routes. Preserve production browser-origin entries and tenant domains when adding the exact staging host. Do not run a second full backend with shared schedulers/consumers.

OAuth configuration must support a staging-specific allowlisted callback/client without replacing global production callback settings. Use actual provider application capabilities and credentials; a provider console/API action retains its exact authority boundary. Validate state/nonce; keep 2FA, account restrictions and revocation active.

Acceptance: external direct origin denied without credentials, cloudflared rejects wrong Access AUD/JWT, correct Worker path reaches the actual backend with verified public host, unknown hosts denied, production health/callback/cookies unchanged. Actual resource IDs and effective scopes are captured safely; secret values never enter logs/Git. Partial mutations reconcile observed ownership/IDs rather than blindly recreate resources.

Rollback: preserve previous origin release/config and ingress/Access snapshot, previous Worker version/config and still-valid secret versions. Keep current/previous app token acceptance bounded until the rollback window ends. Restore in a compatible order; Worker rollback does not restore Access, Tunnel or Linux config. No DB move or unrelated migration. Code may merge earlier; this section does not block independent development.


## UI/UX Contract

### Target User / JTBD

Platform operator configures an origin; existing users retain production access.

### Surface Inventory

Existing login and callback URLs; existing Admin metadata surfaces only.

### Component Map

Reuse existing Admin controls and login/callback components; no new design system.

### State Matrix

Unconfigured, configured-unverified, verified, denied, expired and recovered.

### Responsive Matrix

Production and staging browser flows tested on desktop/mobile; operator config has no layout delta.

### Accessibility Acceptance

Existing form labels/focus and meaningful configuration errors remain intact.

### Copy Contract

Retain Thai/English copy; expose safe status and exact operation, never secrets.

### Browser Evidence Required

Actual staged auth and unchanged production callback behavior after the approved release, with secrets redacted.
