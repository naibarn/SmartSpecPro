# Synthesized Specification — SmartAIHub Intelligence Fabric (Spec 266 R1.2)

## Objective

Deliver one logical, governed data/evidence/knowledge foundation shared by SmartAIHub consumers. It owns canonical semantics, provenance, rights, verification/admission, resolution, and portable knowledge exchange semantics. Physical stores remain workload-specific. Spec 260 owns emergency/response authority; Spec 262 owns MapLibre and operational geospatial UI; Spec 265 owns decision methodology; Spec 261 owns application packages; Spec 278 owns portable Mini App provider/runtime mechanics; Spec 229 owns managed retrieval implementation.

## Required invariants

- Keep Provider, Source, Dataset, Record, Evidence, Interpretation, Knowledge, Claim, and Search Projection distinct.
- Distinguish observed, derived, forecast, model-estimated, and user-asserted evidence. Derived/forecast/model-estimated evidence carries lineage, rights, methodology, and provenance.
- Unknown/expired/revoked rights, authorization, scope, coverage, cost, or health fail closed. No data is not zero and stale data is not current.
- Provenance and canonical knowledge histories are append-only/versioned. Search/vector projections are rebuildable and never authoritative.
- Research discoveries are candidates until server-owned identity, rights, schema, security, corroboration, and admission gates pass.
- Store canonical metadata in the governed DB; store large artifacts in approved object storage under policy. References do not confer access.
- All async execution flows through `worker_jobs` and transactional outbox. Agents use the approved OpenAI Agents API runtime; isolated execution uses approved Cloudflare Containers. No retired Agency, workpacks, `/workflows`, Docker/OpenSandbox, or alternate scheduler.
- Preserve emergency/geo ownership and never dual-write or cut over existing 260/262 records without per-source replay and rollback evidence.
- Spec 266 defines portable object semantics and exchange; Spec 278 defines portable runtime/provider behavior. No second runtime or alternate Retrieval Broker.

## Delivery phases

1. Inventory owners/contracts and compatibility boundaries.
2. Complete source/dataset/rights/provenance/evidence/health foundation.
3. Complete semantic/entity/geospatial/temporal contracts and 262 projections.
4. Complete resolver/retrieval/index/cache/revocation policy.
5. Complete research request/run/artifact/candidate/admission and durable execution composition.
6. Add emergency compatibility adapters without transferring authority.
7. Add governance, packs, admin/observability and kill switches.
8. Validate migration/acceptance and keep all unavailable production/provider proof explicitly open.

## Completion boundary

Local source, migrations, and focused tests can establish code readiness only. Production Definition of Done (§47) requires actual environment, provider, migration, rights, deployment, rollback, and operational evidence. Active schema ownership is a hard implementation constraint for this session.

## Source of truth

The complete normative clauses, field contracts, exclusions, and acceptance IDs remain in [`spec.md`](./spec.md). This synthesis does not supersede or weaken it.
