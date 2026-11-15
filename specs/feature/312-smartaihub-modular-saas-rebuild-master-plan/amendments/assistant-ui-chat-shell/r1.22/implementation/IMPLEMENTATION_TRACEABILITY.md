# SPEC-312 R1.22 Implementation Traceability

**Status:** PARTIAL · **Required disposition:** keep SPEC-312 open until runtime and acceptance evidence is complete.

| Requirement | Source | Verification | Runtime evidence | Status |
| --- | --- | --- | --- | --- |
| REQ-312-R122-01 Mission authority | SPEC-294 §65 and R1.22 contract | Contract parser checks required tenant Mission identity | None yet | IMPLEMENTED |
| REQ-312-R122-02 tenant Mission source | Core `modular_chat_missions` migration, `create_modular_chat_mission`, `list_modular_chat_missions`; Core repository/API | Core tests 127/127; scoped typecheck and dry-run build pass | Migration 0441 is not applied; no Modular Core release was attempted | IMPLEMENTED / TESTED; DEPLOYMENT_BLOCKED |
| REQ-312-R122-03 protected endpoints | Core `/v1/core/chat/conversations/:id/missions` and Chat authenticated proxy | Core auth tests; Chat tests 56/56; scoped typechecks pass | `aimarkethubs.com` still serves prior release; new SQL-backed endpoints unavailable there | IMPLEMENTED / TESTED; RUNTIME_PENDING |
| REQ-312-R122-04 Chat integration | Chat Mission Control navigation, explicit create action, read projection and URL `view=missions` persistence | Chat UI/API tests and scoped typecheck pass | Desktop/tablet/mobile browser UAT not performed | IMPLEMENTED / TESTED; UAT_PENDING |
| REQ-312-R122-05 SPEC-277 owner API | Existing SmartSpecPro `workerJobs.observabilityV1` protected read model; preserves `workspaceId: null` if absent | Owner router tests 15/15 pass | Legacy release status reports `smartaihub.app` on exact source `089ac45526dfb9742b9394513cbe5f9e7d8c3d59`; unauthenticated public probe returned 403 and local port 3000 returned 404, so authenticated endpoint/scope behavior is not runtime-verified | SOURCE_IMPLEMENTED / DEV_SOURCE_PRESENT; RUNTIME_PENDING |
| REQ-312-R122-06 regressions and SQL/browser proof | Existing artifact/SSE paths unchanged; migration 0441 additive | Contract tests 9/9; Core 127/127; Chat 56/56; owner router 15/15; scoped Core/Chat typechecks and dry-run builds pass | Disposable SQL fixture skipped because `MODULAR_CHAT_TEST_DATABASE_URL` and `MODULAR_CHAT_TEST_EMAIL` are unset; authenticated MFA UAT unavailable | PARTIAL |

## Evidence and known limits

- Tenant Mission creation is explicit. Mission rows are user/environment/workspace/conversation bound; Job IDs, Run IDs, event cursor and unexpired artifact IDs are projected from the existing canonical Chat Job/Artifact records. No Job is enqueued and no Agent/Run identity is synthesized.
- Platform engineering Mission/Run catalog remains separate. SPEC-294 §65 clarifies the two authorities; SPEC-277 still owns `workerJobs.observabilityV1`.
- Integrated source: SmartSpecPro `7bd7de8507c39e16efab91987af7574a0bd5f3a2`; platform `ddb5530bb894b609071ff85444b84d562d52c0b9`.
- Platform and SmartSpecPro commits are integrated on their respective `main` branches. Platform package tests/typechecks and scoped dry-run builds passed. No R1.22 Modular deployment was made.
- Migration 0441 remains unapplied: the configured database login does not meet the existing development migration runner's `_dev` credential requirement, and required scoped development environment variables are absent. Do not run DDL with the available credential.
- Disposable PostgreSQL integration and authenticated MFA UAT remain pending. Public unauthenticated probes do not establish authenticated runtime scope or cross-tenant denial.
