# Section 01 — Inventory and Evidence

## Goal

Create a source-accurate Feature 192 inventory and local evidence primitives.
This section must not migrate runtime behavior yet and must not claim external
Cloudflare proof.

## Owned paths

- `apps/web/scripts/audit-feature-186-call-sites.ts` or a new adjacent Feature
  192 inventory script.
- `ops/feature-186/compatibility-drain-manifest.yaml` and/or a new Feature 192
  local manifest, preserving existing fields.
- `apps/web/server/services/cloudflareRuntimeTarget.ts` and focused tests only
  if the allowlist needs a reusable policy helper.
- Focused inventory/evidence tests.

## Implementation

Inventory direct transport producers, consumers, status readers/writers,
schedulers/timers, provider callbacks, result pollers, and domain projections
with exact file/line locations. Emit classification, owner, backup reviewer,
job type, active producer, flag, rollback rule, late-delivery disposition,
drain deadline, and evidence link. Classify browser/SSE heartbeat timers as
non-job only when they have no business side effect.

Add a positive Google OAuth/Drive product allowlist and a negative retired
Google runtime policy. A Google SDK or URL is not sufficient; the owning route
or service must be allowlisted. Evidence serialization must redact secrets,
signed URLs, database URLs, account IDs, tokens, and credentials.

## Tests

- Inventory completeness and classification schema.
- No unclassified discovered side-effecting producer.
- OAuth/Drive allowlist passes while Cloud Tasks/Run/OIDC/GCP runtime entries
  fail closed.
- Evidence redaction and immutable local command/build/schema identity fields.

## Acceptance

Every remaining legacy item is migrated, compatibility-drain,
product-integration-allowed, or operator-review. No local evidence has
`targetAccountProof` or `productionProof` true.

## Implemented

- Added `apps/web/scripts/verify-feature-192-inventory.ts` with direct-call,
  status-reader, Google allowlist, timer-inventory, and evidence-redaction
  checks.
- Added `ops/feature-192/timer-inventory.yaml` and focused inventory tests.
- Local output reports migrated, compatibility-drain, product-integration,
  and operator-review counts without exposing sensitive evidence.
