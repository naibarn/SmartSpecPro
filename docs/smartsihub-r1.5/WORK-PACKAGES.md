# SmartAIHub R1.5 work packages

These are proposed implementation boundaries for future authorized product work. The current mission updates specifications and ADRs only.

| Package | Scope and acceptance | Canonical owners |
|---|---|---|
| **WP0 — Core identity and action boundary** | New-platform human, tenant, Agent, Service, Module and device principals; reuse existing `smartspec` user and Core data authority; environment-tenant-scoped access; WebAuthn/MFA-ready session flows; CSRF; revocation/policy epochs; typed action registry; separately scoped runtime credentials; no duplicate financial/job writer. | SPEC-312, 313, 315, 325 |
| **WP1 — Durable Chat Agent** | Chat as signed-in home; durable Agent identity and Goal/Run links; Workers/DO/Workflow/Queue event lifecycle; reconnect/replay; truthful `WAITING_*`, pause and revoke states; browser close does not cancel. | SPEC-312, 318, 319, 325 |
| **WP2 — Secure device foundation** | Local device key; explicit one-time owner pairing; outbound WSS with TLS validation and fresh proof-of-possession; short-lived audience-bound session; signed typed envelopes; dedupe/fencing; live revoke; no public inbound listener. | SPEC-313, 314, 315, 317, 318, 325 |
| **WP3 — Runner services and Companion** | Windows boot SCM/Linux systemd Core service before login; least-privilege Connector; separate user-session shared WebView Companion; on-demand scoped Executor; signed updates, rollback, low idle cost, locked-session truth and OS-specific recovery. | SPEC-316, 318, 319, 324, 325 |
| **WP4 — Credential tiers and broker** | Per-Worker/environment Tier A; carefully selected Tier B Secrets Store or approved fallback; application-side AES-GCM Tier C BYOK vault with external AWS KMS envelope keys and broker; rotation, revoke, tenant/App/run checks, recovery. | SPEC-313, 314, 315, 316, 322, 323, 325 |
| **WP5 — Secure modules and Mini Apps** | Signed capability manifests, independent binding/runtime/data scope, isolated origin and app data plane, prompt-injection provenance, BYOC owner grants and revocation. | SPEC-314, 317, 320, 323, 325 |
| **WP6 — Bounded commerce and release** | Existing canonical ledger, mandates, idempotent reserve/settle/release; least-privilege Workers-native deployment; signed/provenanced Runner artifacts; per-target identity, rollback and incident response. | SPEC-316, 321, 322, 325; existing SPEC-207/280/295 |

## Shared service contract

Cloud event transport, Agent state, device presence, UI state and per-App data are projections or stores with scoped ownership. Existing canonical `worker_jobs`/outbox/lease/settlement contracts remain authoritative. Device, cloud, browser and headless clients use the same effect authorization checks; no message or Service Binding grants authority by itself.

## Operational prerequisites and truthful status

- `aimarkethubs.com` is registered prepared/unavailable; keep the existing healthy port-3100 service until a replacement is healthy.
- `smartsihub.com` is registered-not-activated; future production provisioning and releases use their separate owner and target authority.
- The target map names the shared canonical `smartspec` database for both Modular environments. Before release, verify the actual endpoint and separately scoped runtime credential; do not infer readiness from the logical mapping or reuse a broad Legacy credential.
- `aimarkethubs.com` development/test and `smartsihub.com` production use distinct environment-tenant bindings over the shared Core database. Existing customer accounts and authorized canonical data remain shared under membership and role checks.
- R1.5 documents are `SPECIFIED`, not `IMPLEMENTED` or `DEPLOYED`. Device pairing, KMS setup, Runner installation and security tests remain future implementation evidence.
