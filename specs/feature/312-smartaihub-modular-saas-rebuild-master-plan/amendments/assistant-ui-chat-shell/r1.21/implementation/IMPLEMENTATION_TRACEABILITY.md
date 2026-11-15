# SPEC-312 R1.21 Implementation Traceability

**Assessment:** PARTIAL · **Platform source:** to be recorded after integration · **SmartSpecPro source:** to be recorded after integration.

| Requirement | Source/API | Verification | Runtime evidence | Status |
| --- | --- | --- | --- | --- |
| Real completed output production | Chat queue completion uses actual provider result; private `CHAT_OUTPUTS` R2 write; SQL completion wrapper registers canonical `worker_artifacts` | Producer and failure/idempotency tests; no test-generated artifacts | Exact-SHA DEV deployment and capability check pending receipt | IMPLEMENTED / TESTED / DEPLOYMENT_PENDING |
| Private artifact metadata/content retrieval | Authenticated Core routes + scoped SQL list/get functions; object digest/size validation | Positive retrieval and cross-scope denial route tests; content headers/size validation | Authenticated end-user browser path pending | IMPLEMENTED / TESTED / RUNTIME_PENDING |
| Chat artifact viewing | Worker authenticated proxy; validated metadata/content API; image/video/text/Markdown/JSON preview, download and safe fallback | API/proxy/workspace tests | Served target asset parity pending | IMPLEMENTED / TESTED / DEPLOYMENT_PENDING |
| Retention | Expiration metadata and scheduled best-effort dev R2 cleanup | Cleanup unit coverage/source check | Expiry runtime evidence pending | IMPLEMENTED / TESTED / RUNTIME_PENDING |
| Task Control owner contract | SmartSpecPro `workerJobs.observabilityV1` maps `listTaskObservability` to `smartaihub.task-control-projection.v1` under existing protected scope | Worker router tests cover source scoping and canonical Job mapping | SPPRO dev route not deployed by this modular target; authenticated use pending | IMPLEMENTED / TESTED |
| Modular Chat Task adapter | Core authorized SQL projection reads existing canonical Chat `worker_jobs` and `worker_artifacts`; Chat inspector consumes it | Core auth/projection and Chat UI tests; unauthorized identity rejected | Exact-SHA target verification pending | IMPLEMENTED / TESTED / DEPLOYMENT_PENDING |
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
- Exact-SHA DEV release and runtime verification are recorded in the release receipt only after the target controller completes.

## Owner and contract boundaries

- SPEC-277 owns Task Control projection semantics. Source DTO and read model are SmartSpecPro's protected `workerJobs.observabilityV1` / `listTaskObservability`; Modular Chat has an independent authorized projection over its own canonical Core job store. No legacy auth cookie is forwarded.
- SPEC-294 owns Mission Control semantics. Its currently available Modular SaaS project procedure is restricted to platform project catalog, ingested platform workspaces and SPEC-224 runs; it does not provide tenant Missions. Mission identity, tenant binding and Chat/Job relationship require owner source/API before runtime navigation can be enabled.
