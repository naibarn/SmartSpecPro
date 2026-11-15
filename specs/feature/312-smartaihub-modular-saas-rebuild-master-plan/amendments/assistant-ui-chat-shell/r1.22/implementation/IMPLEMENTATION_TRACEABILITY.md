# SPEC-312 R1.22 Implementation Traceability

**Status:** PARTIAL · **Required disposition:** keep SPEC-312 open until runtime and acceptance evidence is complete.

| Requirement | Source | Verification | Runtime evidence | Status |
| --- | --- | --- | --- | --- |
| REQ-312-R122-01 Mission authority | SPEC-294 §65 and R1.22 contract | Contract parser checks required tenant Mission identity | None yet | IMPLEMENTED |
| REQ-312-R122-02 tenant Mission source | Core `modular_chat_missions` migration, `create_modular_chat_mission`, `list_modular_chat_missions`; Core repository/API | Core route authorization tests and Core typecheck | Requires migration 0441 and exact platform release | IMPLEMENTED / TESTED; DEPLOYMENT_PENDING |
| REQ-312-R122-03 protected endpoints | Core `/v1/core/chat/conversations/:id/missions` and Chat authenticated proxy | Core authenticated route tests; anonymous denial; Chat proxy tests | Must verify on `aimarkethubs.com` after release | IMPLEMENTED / TESTED; RUNTIME_PENDING |
| REQ-312-R122-04 Chat integration | Chat Mission Control navigation, explicit create action, read projection and URL `view=missions` persistence | Chat API/UI tests and scoped typecheck | Must verify desktop/tablet/mobile on authorized browser session | IMPLEMENTED / TESTED; UAT_PENDING |
| REQ-312-R122-05 SPEC-277 owner API | Existing SmartSpecPro `workerJobs.observabilityV1` protected read model; preserves `workspaceId: null` if absent | Existing owner router tests at the integrated source; deployment check pending | Must be checked independently at `smartaihub.app` on `legacy-debian-dev` | SOURCE_IMPLEMENTED; DEPLOYMENT/RUNTIME_PENDING |
| REQ-312-R122-06 regressions and SQL/browser proof | Existing artifact/SSE paths unchanged; migration 0441 additive | Contract/Core/Chat package checks; disposable SQL test availability not established | Authenticated MFA UAT unavailable in this session | PARTIAL |

## Evidence and known limits

- Tenant Mission creation is explicit. Mission rows are user/environment/workspace/conversation bound; Job IDs, Run IDs, event cursor and unexpired artifact IDs are projected from the existing canonical Chat Job/Artifact records. No Job is enqueued and no Agent/Run identity is synthesized.
- Platform engineering Mission/Run catalog remains separate. SPEC-294 §65 clarifies the two authorities; SPEC-277 still owns `workerJobs.observabilityV1`.
- Focused package results and exact source SHAs will be appended after integration. A build or public health check alone will not be recorded as runtime acceptance.
- Disposable PostgreSQL integration, authenticated UAT, exact DEV release, owner API runtime and live cross-tenant denial remain pending until individually evidenced.
