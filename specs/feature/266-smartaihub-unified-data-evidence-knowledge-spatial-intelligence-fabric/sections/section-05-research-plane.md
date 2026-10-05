# Section 05 — Autonomous Research Plane

## Scope

Implement Phase D: provider-neutral research request admission, immutable runs/artifacts, candidate lifecycle, admission gate, source identity/dependency graph, corroboration, cost/security/placement policy and revalidation notices.

## Spec coverage

Spec 266 §§10–11, 46.10, 46.12 and 47 items 15–20, 21–22.

## Implementation

- Preserve bounded candidate/artifact/notice parsers in `researchAdmission.ts` and contracts in `researchContracts.ts`; treat all provider/model output as untrusted.
- Preserve atomic request + canonical `worker_jobs`/outbox admission in `researchPersistence.ts`. Bind a production executor only through approved runtime plus server-owned capability/secret/placement/budget/cancellation/lease policy. Dispatch envelopes contain identifiers only.
- Keep `researchRunPersistence.ts` append-only and exact-bound to tenant/request/job. Intentional revalidation creates a new immutable run; retries reuse stable identity.
- Store artifact references as opaque metadata. Promotion requires a server-owned scan receipt, current rights and authorization, source identity, schema validation, lineage closure, methodology, and full evidence admission. A caller-supplied `passed` flag never qualifies.
- Complete canonical promotion and watch notice sequencing without adding a queue/scheduler: commit canonical evidence first, write notice/outbox intent transactionally, then consumer reauthorizes and deduplicates.
- PUBLIC dispatch stays fail-closed until an explicit canonical public-principal design exists. No local runtime fallback.

## Tests

- Extend research contract/admission/persistence/run tests for server authority, idempotency, reference-only envelopes, exact job binding, candidate echo resistance, rights/scan-receipt promotion, budget/fan-out, cancellation, notice order, reauthorization, deduplication, and public fail-closed behavior.

## Acceptance

Spec 266 §46.10 items 58–75 and §46.12 items 80–87.

## Runtime and Promotion Gates

- `researchPromotion.ts` supplies a schema-free, fail-closed policy seam: it accepts candidate/artifact data only for structural validation, then resolves scan, rights, source/dataset, request/run, provenance, and schema receipts from server-owned authority before writing anything.
- It orders canonical evidence append before the watch notice inside one injected transaction and reauthorizes the consumer before deduplicated notice delivery.
- This is not an enabled runtime path yet. The active schema wave owns the candidate/notice ledger and the concrete transaction/outbox composition. Until those durable writers, current rights authority, and the approved research executor are bound, promotion and watch dispatch must remain unavailable.
- PUBLIC promotion and watch delivery remain explicitly fail-closed because no canonical public-principal design exists.
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

## Implementation evidence (2026-10-05)

- Added a fail-closed promotion boundary: server-resolved request/run/candidate/artifact/source/dataset identity, scan and rights receipts, provenance closure, and schema validation are required; caller `passed` fields do not grant authority.
- Canonical evidence append precedes the watch notice within one injected transaction. Notice identity is fully matched to server-owned watch/consumer/change/reference state. Consumption is tenant-only and uses a durable lease, post-claim reauthorization, successful-delivery acknowledgement, and retryable lease release.
- Focused proof: `pnpm --filter @smartspec/web exec vitest run server/services/intelligenceFabric/researchPromotion.test.ts server/services/intelligenceFabric/researchAdmission.test.ts server/services/intelligenceFabric/researchPersistence.test.ts server/services/intelligenceFabric/researchRunPersistence.test.ts` — 4 files, 24 tests passed; the promotion/notice suite now passes 8 tests after review fixes. `git diff --check` passed.
- External gate: the injected authority/writer/consumer are not composed with a production candidate ledger, canonical evidence store, outbox, scanner, or rights authority. No executor invocation or production ResearchRun is claimed; public async remains unsupported.
