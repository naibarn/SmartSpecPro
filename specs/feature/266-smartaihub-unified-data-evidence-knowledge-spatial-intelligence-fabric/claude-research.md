# Spec 266 Research — Provenance and Autonomous Research Slice

**Research date:** 2026-10-05
**Scope:** Codebase authority, provenance/evidence persistence, research admission, and relevant interoperability standards.
**Discovery fallback:** SocratiCode tools were unavailable. Used targeted `rg`, bounded reads, migration/schema inspection, and one read-only codebase research agent. No code or tests were changed/run during reconnaissance.

## Repository Findings

### Implemented at source level

- `apps/web/server/services/intelligenceFabric/registry.ts` contains bounded, fail-closed source/dataset offer validation, including status, review, expiry, rights, attribution, retention, audience, purpose, geography, and residency constraints.
- `apps/web/server/services/intelligenceFabric/contracts.ts` validates immutable evidence references, public/tenant scope, temporal order, lineage cycles, and the additional lineage, rights-policy, and methodology references required for derived/forecast/model-estimated evidence.
- `apps/web/server/services/intelligenceFabric/researchAdmission.ts` validates candidate state, source identity hints, dependency/corroboration relationships, artifact metadata, and scan-state hints. A caller-provided `passed` state is not treated as an authoritative scan receipt.
- Drizzle schema and migration `apps/web/drizzle/0381_spec265_266_durable_foundation.sql` define source/dataset/evidence and research request/run persistence. Migration constraints/triggers enforce scope and append-only evidence/run behavior.
- `researchPersistence.ts` validates trusted server authority and atomically persists an idempotent request with canonical `worker_jobs`/outbox intent, then binds the job identity. `researchRunPersistence.ts` appends immutable run receipts after verifying request/job/tenant binding.

### Partial or absent runtime behavior

1. **Evidence admission/promotion is absent.** `registryPersistence.ts` reads evidence but has no append/promotion flow. The planned service must re-resolve source, dataset, rights, lineage, methodology, and authorization from server-owned state; capture immutable provenance and content identity; allocate revisions; and append in a transaction.
2. **Registry workflow is pending-review only.** Durable activation, revocation, rights-policy lifecycle, and authoritative source-health history/remediation are not complete.
3. **Research has no execution composition.** Targeted searches found no mounted Fabric router, canonical research executor registration, or worker consumer. `runtimeAvailable` is supplied by the caller, which preserves fail-closed behavior but is not proof that an approved runtime is bound.
4. **PUBLIC research cannot currently dispatch.** The canonical job plane requires tenant identity. Preserve this gate unless a separately authorized canonical-public principal model is designed; do not introduce a local scheduler or bypass.
5. **Watch notices are parser-only.** Durable notice creation, commit ordering, consumer reauthorization, and deduplication remain unimplemented.
6. **Candidate validation is weaker than evidence admission.** `EvidenceCandidate` lineage validation does not substitute for full `EvidenceItem` rights/methodology checks. Promotion must invoke the full admission contract.

### Durable ordering boundary

`admitResearchRequest()` runs a transaction that creates the idempotent research request, calls `createCanonicalJobInTransaction()` (which owns canonical job/event/outbox intent), and updates the request with the resulting job ID. Research run receipt, evidence promotion, and watch notice ordering are not yet proven to share an atomic durable sequence. The plan must state which state transition owns the transaction and when outbox consumers may observe it.

### Focused verification candidate

`apps/web/package.json` uses Vitest. A focused candidate command is:

```bash
pnpm --filter @smartspec/web exec vitest run \
  server/services/intelligenceFabric/contracts.test.ts \
  server/services/intelligenceFabric/registry.test.ts \
  server/services/intelligenceFabric/registryPersistence.test.ts \
  server/services/intelligenceFabric/researchContracts.test.ts \
  server/services/intelligenceFabric/researchAdmission.test.ts \
  server/services/intelligenceFabric/researchPersistence.test.ts \
  server/services/intelligenceFabric/researchRunPersistence.test.ts \
  server/services/intelligenceFabric/sourceHealth.test.ts \
  drizzle/__tests__/spec265266DurableFoundationMigration.test.ts
```

This is a proposal only; it was not run as part of reconnaissance. Repository-wide TypeScript typecheck remains prohibited by the provided AGENTS.md instructions.

## Testing

- Framework: Vitest via pnpm in `apps/web` (`package.json` test script is `vitest run`).
- Pattern: focused `server/services/**` colocated `*.test.ts`; Drizzle migration metadata tests live under `apps/web/drizzle/__tests__`.
- Use injected/mock persistence dependencies where existing service tests do so; do not invent a parallel testing stack.
- Scope execution to changed tests and direct consumers. Do not run full TypeScript typecheck or repository-wide verification due the repo instruction/resource policy.

## Standards and Runtime References

- [W3C PROV-O](https://www.w3.org/TR/prov-o/) models provenance using Entities, Activities, and Agents, with relations such as `used`, `wasGeneratedBy`, `wasDerivedFrom`, `wasAssociatedWith`, and `wasAttributedTo`. **Planning implication:** keep source/evidence/artifact entities distinct from collection/research activities and responsible provider/agent identities; an optional serialization/export mapping may use PROV-O without replacing SmartAIHub's typed authorization and rights model.
- [W3C Data Catalog Vocabulary (DCAT) v3](https://www.w3.org/TR/vocab-dcat-3/) provides interoperable catalog semantics for catalogs, datasets, distributions, and data services. **Planning implication:** catalog exchange should map these concepts at the boundary; internal tenant, rights, review, and admission fields remain explicit and authoritative.
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) documents agents, tools, handoffs, guardrails, sessions, and built-in tracing. [Tracing](https://openai.github.io/openai-agents-python/tracing/) records generations, tool calls, handoffs, and guardrails. **Planning implication:** research execution must retain server-owned run receipts and scoped references; vendor traces are observability evidence, not the canonical request, evidence, or rights authority.
- [Cloudflare Containers](https://developers.cloudflare.com/containers/) is the approved container execution boundary referenced by repository instructions. **Planning implication:** risky/isolated execution is bound only through the approved runtime path, never through Docker/OpenSandbox or an ad-hoc host process.

## Provenance Slice Decisions for Plan Writing

- Treat candidate discovery, source verification, evidence admission, and reusable catalog publication as separate lifecycle states.
- Keep provenance append-only and reference-based; derived claims retain lineage, rights, methodology, actor, and time evidence.
- Reauthorize source, tenant, purpose, and rights at every promotion/export/read boundary instead of trusting discovery-time decisions or candidate payload fields.
- Research artifacts remain untrusted until a server-owned scan/admission receipt exists; an object reference alone grants no payload access.
- Canonical jobs/outbox own durable asynchronous work. Any future public-scope execution needs an explicit principal and policy contract before dispatch is enabled.
- External standards inform exchange mappings; they do not create a second registry, evidence store, retrieval engine, or execution authority.

## Evidence and Limitations

- Read-only codebase scout: `spec266_research` (Terra); no files changed and no tests run.
- Repository path set was deliberately narrowed to `server/services/intelligenceFabric`, its schema/migration boundary, existing related tests, and Spec 266 sections 02/05.
- No migration was applied and no provider, environment, runtime, or production state was verified.
