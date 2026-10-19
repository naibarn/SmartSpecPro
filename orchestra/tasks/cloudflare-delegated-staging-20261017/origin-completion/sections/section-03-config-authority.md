# Section 03 — Scoped origin configuration and canonical deployment

Owner/paths: main implementer; existing `providerDeploymentTargetAuthority.ts`, `cloudflareCredentialCenter.ts`, `infrastructure.ts`, `cloudflareStagingDeploymentRuntime.ts`, `cloudflareStagingDeploymentExecutor.ts`, `cloudflareStagingApiTransport.ts`, executor proof/grant parsing and associated tests; existing Python `cloudflare_staging_policy.py`/approvals branch/tests. No new approval/control-plane tables or generic secret registry.

Interface with section 02: immutable scoped descriptor/secret-version references, pinned origin/public-host values, Access mode, config digest, redacted configured-state metadata. Reuse system_settings encryption and runtimePolicy reference; never place secrets in a short policy column, plaintext metadata or deployment API-token column. Respect existing tenant/project/environment/account/worker filters and Admin/owner checks.

Extend the existing typed origin-capable grant explicitly; v1 remains artifact-only. Policy decision, canonical job, signed executor attempt, target, configuration digest and immutable secret references must agree. Recheck current authority/lease/deadline/config before provider writes and reject revocation/drift. Keep artifact and config digests separate in receipts.

Compose approved origin values and secret bindings on every version upload through the existing transport, with sanitized errors. Preserve no-origin/default-disabled mode. Rollback verifies original config, secret versions and origin compatibility, not only bytes. Version-aware uploads must not activate a secret change outside the recorded canonical action.

Tests: scoped resolver mismatch/redaction/encryption, actual Python owner authority/revocation/budget, disposable PostgreSQL issuance → outbox publication → executor proof → version payload/receipt, retry/config drift and rollback. Production storage is not a fixture. No new dependency or migration is presumed necessary; justify one if a concrete gap proves otherwise.

Merge readiness: focused tests and old-contract compatibility; provider execution can remain blocked independently. Exposure/fallback: origin bindings only with the explicit approved scope; no activation/jobs/Container/DB binding side effect. Rollback: keep old artifact-only mode and prior immutable config/secret versions during the recovery window. Additional IAM is a separate provider authority, never inferred from a passing policy decision.
