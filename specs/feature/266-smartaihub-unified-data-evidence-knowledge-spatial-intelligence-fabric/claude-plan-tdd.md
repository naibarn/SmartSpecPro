# Spec 266 R1.2 — Test-First Plan

Use focused Vitest tests colocated with the existing service/router tests. Write each boundary test before implementation. Never use caller-owned DB/request payloads as auth authority. Keep schema tests read-only while the schema-owner marker is active.

## Section 01 — Authority and contracts

- Unknown contract version, missing/ambiguous scope, secret-bearing values, oversized IDs/arrays, sparse nested arrays, and post-parse mutation are rejected or detached.
- Compatibility inventory maps each authority to one writer and rejects accidental 260/262 duplicate ownership.
- Retired systems and alternate async authority do not appear in new references or entry points.

## Section 02 — Registry, rights, provenance, evidence, health

- Unknown/expired/revoked policy, source/dataset mismatch, unauthorized scope, invalid attribution/retention, invalid temporal envelope, lineage cycle, missing methodology, and mutation attempts fail closed.
- Evidence append resolves authority from server-owned records, allocates stable revision/idempotency identity, and leaves canonical state unchanged on rejection.
- Health dimension failures quarantine only the matching offer; stale snapshots and cross-source health reuse reject.
- Activation/revocation requires audited authority and invalidates derived state without rewriting evidence.

## Section 03 — Semantic, geo-time, entity

- Unit/method/version mismatch does not coerce; ambiguous identities remain unresolved.
- Geometry tests cover valid points/lines/polygons, ring closure, nested sparse arrays, complexity/size limits, coordinate bounds, unsupported CRS, and invalid temporal order.
- 262 projection preserves evidence class, source, timestamps, and authority; model/community data cannot become official warning.

## Section 04 — Resolver and retrieval

- Direct malformed DataRequirement inputs reject even when they bypass upstream parsing.
- Tenant/public scope, rights, purpose, residency, geography, time, freshness, quality, placement, and health gates run before ranking.
- Unknown cost never sorts as free; missing data is not zero; deterministic retrieval works when vector discovery is unavailable.
- Vector hit cannot hydrate or return protected content without fresh authorization; revocation invalidates cache/index projection only.
- Connector SSRF, untrusted prompt/control content, secret leakage, and unbounded query/fan-out inputs reject.

## Section 05 — Research plane

- Request retries reuse one request/job/outbox identity; runtime-unavailable and unauthorized requests dispatch nothing.
- Execution envelope contains references only; provider output, trace IDs, or caller scan flags cannot authorize admission.
- Run receipt binds exact request/job/tenant and is immutable, replay-safe, bounded, and secret-free.
- Candidate root/dependency/corroboration checks resist repost/summary echo; promotion re-runs full source/rights/schema/security/evidence policy.
- Artifact access requires server-owned scan receipt and reauthorization; missing policy fails closed.
- Notice transaction ordering occurs after durable evidence commit; reauthorized consumers cannot receive stale/revoked/cross-tenant evidence and duplicate notices are suppressed.
- Public scope remains blocked until an explicit canonical-public principal contract exists.

## Section 06 — Emergency compatibility

- Adapter output is lossless for the supported 260/262 fields and does not mutate source rows.
- No dual-write, no renderer duplication, no source activation from unverified catalog candidates, and no authority/confidence upgrade.
- Per-source cutover rehearsal proves replay parity and rollback without data loss before any writer switch can be enabled.

## Section 07 — Governance, UI, packs, observability

- Admin mutations require protected role/tenant scope, emit audit receipts, and use scoped kill switches.
- Pack digest/signature/dependency/permission/rights/revocation checks reject tampering and unauthorized export.
- Logs/metrics redact secrets and restricted payloads; bounded labels prevent cardinality/fan-out abuse.
- Existing admin surfaces cover loading, empty, error, success, keyboard/focus/labels, responsive behavior, and browser-visible evidence where applicable.

## Section 08 — Migration and gates

- Migration metadata and schema snapshot remain consistent when the schema owner authorizes the migration window.
- Inventory lists every existing writer, retention impact, replay evidence, cutover operator, and rollback route.
- Local code/test status cannot satisfy production §47; missing provider/runtime/rights/deployment proof remains explicitly open.
- Ten post-implementation review rounds each record surfaces examined, findings, fixes, rerun evidence, and remaining gate state.

## Focused command

Initial candidate (refine to changed tests per section):

```bash
pnpm --filter @smartspec/web exec vitest run \
  server/services/intelligenceFabric \
  server/services/decisionIntelligence \
  server/routers/intelligenceRegistry.test.ts \
  server/jobs/__tests__/feature186JobTypes.test.ts \
  drizzle/__tests__/spec265266DurableFoundationMigration.test.ts
```

Do not run full TypeScript typecheck or repository-wide suites.
