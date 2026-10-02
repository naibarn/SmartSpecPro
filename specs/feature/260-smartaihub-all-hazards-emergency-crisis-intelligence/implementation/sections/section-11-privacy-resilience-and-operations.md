# Section 11 — Privacy, Resilience, and Operations

**Dependencies:** All product sections 04–10. **Owner:** conductor plus security/read-only review. **Status:** In progress (case-scoped consent grant/revocation is recorded in the consent-receipt ledger; an audited tenant-scoped case/evidence legal-hold register now gates evidence cleanup; the retention trigger uses Cloudflare Cron with canonical `worker_jobs`/outbox admission. Subject access/export, policy-based retention/deletion, surge, restore reconciliation, break-glass, SLO/runbooks and integrated accessibility evidence remain open).

## Scope

Close threat model, minimization and consent/disclosure lifecycle, quotas/backpressure, surge mode, backup/restore reconciliation, retention/legal hold/deletion, redacted observability, SLOs/runbooks, break-glass governance, accessibility, tenant review, cost controls and incident tabletop. Worker and data-provider failures are explicit user-visible states.

## Exit criteria

- Authorization, privacy, audit and tenant adversarial suite passes.
- Recovery preserves accepted cases and financial facts; retries remain idempotent and fenced.
- Retention/deletion respects legal holds and canonical audit/finance retention rules.
- Surge controls reserve capacity for anonymous intake and critical work.
- Operational and accessibility evidence is linked for every critical scenario.

## Current implementation boundary

Owner-authorized assignment disclosures now write a consent receipt with purpose, fields, recipient/assignment, jurisdiction and expiry in the same transaction as the disclosure grant. Owner revocation updates both the enforcement grant and matching consent receipt; responder reads still revalidate the grant on every access. This closes the previously unused consent-receipt writer path for this flow. It is not a full privacy lifecycle: subject access/export, takedown, legal hold, retention policies and deletion jobs remain open. Product tests/build and Cloudflare staging stay deferred to Sections 12 and 13.

Operations can place a legal hold on a tenant-local case or one of its evidence items, and release it only with a reason. Listing requires command capability; placement and release additionally require `emergency.verify` on the server. Writes are idempotent and audited. Retention claims a short database-fenced staging-cleanup lease before deleting; hold placement locks the same evidence rows and rejects while cleanup is in progress, so an accepted hold cannot race a destructive staging delete. Tenant/case/evidence relationships and active/released actor fields are also database constrained. This is a preservation control for the existing evidence cleanup path, not a complete retention schedule or privacy-request workflow. Migration `0376_spec260_emergency_legal_holds` is additive and has not been applied.

The five-minute evidence-retention trigger is declared in the Cloudflare production Wrangler template and calls a private platform endpoint with a deterministic UTC occurrence key. The platform coalesces delayed occurrences into its current five-minute bucket and admits only `emergency.evidence.retention` through the canonical job control-plane gateway with explicit `cloudflare` runtime type; the Node process no longer starts this Spec260 schedule. Missing private origin/allowlisted host/token/system tenant fails closed. Queue execution composition remains an unresolved runtime gate, reflected by Worker readiness.
