# Section 02 — Registry, Rights, Provenance, Evidence, Health

## Scope

Implement Phase A: provider/source/dataset authority, rights verdicts, versioned source contracts, immutable captures/evidence, temporal envelopes, lineage and source health. Preserve 260/262 as source authority until separately proven cutover.

## Spec coverage

Spec 266 §§5–9, 12–15, 33, 46.1–46.3, 46.8, 46.11.

## Implementation

- Preserve `registry.ts` and `sourceHealth.ts` as bounded, fail-closed evaluators. Load rights and health receipts from server-owned persistence, not caller snapshots.
- Complete review/activation/revocation/rights-policy persistence in `registryPersistence.ts` where existing schema supports it. Do not edit schema or migrations while `orchestra/.wave-active` exists.
- Define append-only evidence admission that resolves source/dataset/tenant/rights from trusted state; enforces class-specific lineage/methodology and temporal bounds; binds capture/content identity, actor/time, and immutable revision; and rejects replay/cycle conflicts without partial writes.
- Read APIs return bounded references and metadata only after fresh authorization. Secrets and restricted payloads never enter logs or prompts.
- Activation requires reviewed rights, purpose, attribution/retention, geography, temporal coverage, refresh, placement, and pricing references. Positive allow-lists require exact request matches.
- Health is source+dataset+offer scoped. Connectivity/schema/semantic/freshness/rights/placement/index failures stay separate; index health gates discovery only. Quarantine only the affected offer.

## Tests

- Extend registry, persistence, evidence, and health tests for unknown/expired/revoked rights, tenant mismatch, invalid time, missing derived lineage/methodology, mutation, offer-specific drift, and unchanged canonical state after rejection.
- If the active schema marker blocks durable persistence proof, keep it explicitly blocked and cover the pure policy boundary only.

## Acceptance

Spec 266 §§46.1–46.3 and security items 43–47.
## UI/UX Contract

### Target User / JTBD
- N/A: this section implements backend contracts/policies only; browser UI ownership is Section 07.

### Existing Pattern Reference
- N/A: no user-facing surface is added by this section.

### Surface Inventory
- N/A: no route/page/dialog/form/table is added.

### Component Map
- N/A: no client component is added.

### State Matrix
- N/A: no browser state is added.

### Responsive Matrix
- N/A: no browser layout is added.

### Accessibility Acceptance
- N/A: no user-facing control is added.

### Copy Contract
- N/A: no user-facing copy is added.

### Browser Evidence Required
- N/A: no browser-visible changes are planned in this section.

## Implementation Evidence — 2026-10-05

- Added a fail-closed, uncomposed evidence-admission seam in `apps/web/server/services/intelligenceFabric/evidenceAdmission.ts`. It requires an authoritative active source/dataset store, serialized validate-plus-append transaction, rights receipt resolver, and server-composed capture receipt resolver; no router or default persistence composition was added.
- Admission requires the full authorized parent closure, rejects dangling parents and cycles before append, and treats immutable concurrent conflicts as failure unless an exact replay is observable inside the same serialized transaction.
- Immutable evidence JSON snapshots the parsed contract, bounded capture policy/mode/provenance/reproducibility receipt, and authoritative rights policy revision/terms/purpose/issued/reviewer/expiry receipt. Raw content identity is SHA-256 hashed and never persisted.
- `staleAt` and `expiresAt` must be after `observedAt` and after admission time; stale or expired evidence is rejected. Schema/migrations remain untouched because `orchestra/.wave-active` is present.
- Scoped verification: `pnpm --filter @smartspec/web exec vitest run server/services/intelligenceFabric/evidenceAdmission.test.ts server/services/intelligenceFabric/contracts.test.ts server/services/intelligenceFabric/registryPersistence.test.ts` — 3 files, 30 tests passed; `git diff --check` passed.

## Implementation evidence (2026-10-05)

- Added a schema-free, dependency-injected append admission boundary. It resolves active source/dataset and current rights through server-owned ports, binds a server-composed capture receipt, validates tenant/time/lineage, hashes content identity without persisting the raw value, and rejects replay/collision without overwriting prior revisions.
- Focused proof: `pnpm --filter @smartspec/web exec vitest run server/services/intelligenceFabric/evidenceAdmission.test.ts server/services/intelligenceFabric/contracts.test.ts server/services/intelligenceFabric/registryPersistence.test.ts` — current focused suite: 3 files, 34 tests passed after review fixes; `evidenceAdmission.test.ts` alone passes 15 tests. `git diff --check` passed.
- The seam serializes lineage closure validation and append per tenant/source, verifies every transitive parent contract against its durable row, and rejects unknown resolver receipt keys. It is not composed into a router/default runtime. The current schema lacks a rights-policy receipt and activation writer; append store atomicity, rights lifecycle, revocation, source-health persistence, and production use remain blocked. No schema/migration changed.
