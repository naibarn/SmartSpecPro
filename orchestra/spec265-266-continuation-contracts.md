# Spec 265/266 Continuation Wave Contracts

## Wave 1 shared boundaries

Both writers may read but must not edit `apps/web/drizzle/schema.ts`, migration files, routers, job executor files, or each other's owned files. Each owns exactly its two new files listed below. If a schema mismatch appears, return `NEEDS_SCHEMA_CHANGE` without editing schema or SQL.

### Decision repository
- Files: `/home/dev/projects/SmartSpecPro/apps/web/server/services/decisionIntelligence/decisionProjectPersistence.ts`, `/home/dev/projects/SmartSpecPro/apps/web/server/services/decisionIntelligence/decisionProjectPersistence.test.ts`.
- Interface: expose tenant/owner-scoped project create/list/get/status update and append/list AnalysisRun operations. Effective tenant/principal are explicit trusted function arguments, never request JSON. AnalysisRun writes are append-only and require canonical project tenant equality. Use existing Drizzle tables and `getDb` or an injected DB for tests; do not introduce process-local authority.
- Test boundary: persistence predicates include tenant and owner; cross-tenant/project references reject; bounded JSON rejects oversized input; run history appends and does not mutate existing rows.
- No tRPC registration or shared file edit in this wave.

### ResearchRun repository
- Files: `/home/dev/projects/SmartSpecPro/apps/web/server/services/intelligenceFabric/researchRunPersistence.ts`, `/home/dev/projects/SmartSpecPro/apps/web/server/services/intelligenceFabric/researchRunPersistence.test.ts`.
- Interface: append immutable `ResearchRun` receipts linked to a persisted request and canonical job; verify exact tenant/request/job binding from DB state, never trust caller payload; use request/run number or canonical stable identity for idempotent replay, reject conflicting replay. Do not execute providers or dispatch jobs.
- Test boundary: tenant/request/job mismatch rejects, identical replay returns existing row, conflicting replay rejects, stored receipt is normalized and secret-free, and no update/delete path exists.
- No executor composition, schema edit, or shared file edit in this wave.

## Impact boundary
| Surface | Handling |
|---|---|
| Drizzle schema and migration 0381 | read-only; existing dirty upstream state preserved |
| `server/routers.ts` and route mounting | later conductor-owned integration wave |
| canonical worker executor registration | later conductor-owned integration after runtime availability audit |
| full typecheck | skipped by explicit AGENTS.md memory constraint |
| application DB migration | deferred until a migration-ledger-bearing target and schema single-writer window exist |
