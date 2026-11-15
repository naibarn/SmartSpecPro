# SPEC-312 R1.21 Implementation Traceability

**Assessment:** PARTIAL · **Platform source:** `ca4f5a58dd7f7cc29db97bea0aebf0dd95362eb2` · **SmartSpecPro source:** `9857f1b04f8a2aa8db4374be5b3485e5c520ea9c`.

| Requirement | Source/API | Verification | Runtime evidence | Status |
| --- | --- | --- | --- | --- |
| Real completed output production | Chat queue completion uses actual provider result; private `CHAT_OUTPUTS` R2 write; SQL completion wrapper registers canonical `worker_artifacts` | Producer and failure/idempotency tests; no test-generated artifacts | Exact SHA deployed; binding present in release dry-run and target artifact | IMPLEMENTED / TESTED / DEPLOYED_DEV; signed-in production of an artifact UAT_PENDING |
| Private artifact metadata/content retrieval | Authenticated Core routes + scoped SQL list/get functions; object digest/size validation | Positive retrieval and cross-scope denial route tests; content headers/size validation | Anonymous artifact list/content requests returned 401; authorized target retrieval awaits user session | IMPLEMENTED / TESTED / DEPLOYED_DEV / AUTHENTICATED UAT_PENDING |
| Chat artifact viewing | Worker authenticated proxy; validated metadata/content API; image/video/text/Markdown/JSON preview, download and safe fallback | API/proxy/workspace tests | Served target entry SHA-256 matches immutable artifact; signed-in render pending | IMPLEMENTED / TESTED / DEPLOYED_DEV / AUTHENTICATED UAT_PENDING |
| Retention | Expiration metadata and scheduled best-effort dev R2 cleanup | Cleanup unit coverage/source check | Scheduled code included in exact deployed Core SHA; expiry behavior not time-elapsed | IMPLEMENTED / TESTED / DEPLOYED_DEV |
| Task Control owner contract | SmartSpecPro `workerJobs.observabilityV1` maps `listTaskObservability` to `smartaihub.task-control-projection.v1` under existing protected scope | Worker router tests cover source scoping and canonical Job mapping | Owner API source integrated but not deployed by this modular target | IMPLEMENTED / TESTED; owner API runtime pending separate SPPRO release |
| Modular Chat Task adapter | Core authorized SQL projection reads existing canonical Chat `worker_jobs` and `worker_artifacts`; Chat inspector consumes it | Core auth/projection and Chat UI tests; unauthorized identity rejected | Exact SHA deployed; anonymous route returned 401; signed-in Task projection pending | IMPLEMENTED / TESTED / DEPLOYED_DEV / AUTHENTICATED UAT_PENDING |
| Mission Control | Shared nullable `smartaihub.mission-control-projection.v1` contract/parser. Existing SPEC-294 route is platform-engineering catalog only; no tenant Mission entity/API source | Parser tests preserve absent Mission/Run IDs as null | No tenant runtime adapter; owner contract/source required | CONTRACT_IMPLEMENTED / RUNTIME_BLOCKED |
| Canonical execution identities | Job, workspace, conversation/thread where present, attempt where verified, event cursor/artifact references from canonical Chat tables | Contract and SQL fixture tests defined; DB fixture skipped without dedicated credentials | Runtime identities require signed-in target UAT | PARTIAL; absent Agent/Harness/Executor/Machine remain null |
| Regression and data safety | Existing SSE/replay/polling and canonical dispatch untouched; no new orchestration | See check record below | Browser reconnect/no-duplicate UAT pending | PARTIAL |

## Check record

- Core focused Vitest: 4 files, 47 tests passed.
- Chat focused Vitest: 3 files, 47 tests passed.
- `@smartaihub/saas-contracts` test: 9 passed.
- SmartSpecPro `workerJobs.test.ts`: 15 passed.
- `drizzle/modularChatQueue.integration.test.ts`: skipped (dedicated disposable DB credentials absent); do not count as passed.
- `pnpm --filter @smartaihub/saas-core typecheck` and `pnpm --filter @smartaihub/chat typecheck` — PASS.
- `pnpm --filter @smartaihub/saas-core build` and `pnpm --filter @smartaihub/chat build` — PASS (Wrangler dry-run). Vite reports the Chat entry bundle at 532.54 kB minified; build succeeds.
- Exact-SHA DEV release: `DEPLOYED_AND_VERIFIED` on `modular-debian-dev` for final platform SHA `ca4f5a58dd7f7cc29db97bea0aebf0dd95362eb2`; see [release receipt](r1.21-dev-release.md). Local Core/Chat/Shell health 200, public Shell/Chat health 200, anonymous session/artifact/Task paths 401, and served Chat entry asset hash parity pass.

## Owner and contract boundaries

- SPEC-277 owns Task Control projection semantics. Source DTO and read model are SmartSpecPro's protected `workerJobs.observabilityV1` / `listTaskObservability`; that owner source supplies tenant/user authorization but no canonical workspace ID, so owner DTO `workspaceId` is null instead of relabeling a tenant ID. Modular Chat has an independent authorized projection over its own canonical Core job store. No legacy auth cookie is forwarded.
- SPEC-294 owns Mission Control semantics. Its currently available Modular SaaS project procedure is restricted to platform project catalog, ingested platform workspaces and SPEC-224 runs; it does not provide tenant Missions. Mission identity, tenant binding and Chat/Job relationship require owner source/API before runtime navigation can be enabled.
