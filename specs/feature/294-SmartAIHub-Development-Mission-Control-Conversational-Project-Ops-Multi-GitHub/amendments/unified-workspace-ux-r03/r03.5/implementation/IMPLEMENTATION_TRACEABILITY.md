# R03.5 Implementation Traceability

Evidence in this document distinguishes source/test evidence from a real authenticated Harness run. It must be refreshed after integration and DEV deployment.

| Status | Evidence / current result |
| --- | --- |
| `PRODUCER_IMPLEMENTED` | Implemented in `apps/web/server/services/runnerGateway.ts`: only supported adapter identities from an authenticated, replay-checked Runner capability snapshot are projected; stable identity is upserted with snapshot revision, workspace scope and provenance. Runner heartbeat/revocation updates registry freshness/trust. |
| `REGISTRATION_TESTED` | Focused `RunnerGateway` projection/revocation tests; disposable PostgreSQL 15.17 migration fixture exercised the catalog function, exact workspace projection, unknown entitlement, restricted runtime EXECUTE grant, and denial for unauthorized user/workspace. This is not evidence of a real Runner registration. |
| `CATALOG_API_IMPLEMENTED` | Platform Hono route `GET /v1/core/chat/harnesses`, workspace-scoped repository read, versioned shared contract, and Mission Control LIVE read path. Focused platform tests/typechecks pass. |
| `EXECUTION_BINDING_TESTED` | Dispatch resolves only one fresh trusted instance matching the exact tenant/Runner/adapter/workspace and execution capability; existing canonical execution session stores the optional FK after transactionally revalidating Job, Attempt, lease fence, Runner and Harness. Existing session/dispatcher tests and disposable PostgreSQL projection fixture pass. No genuine Harness-produced Job binding observed yet. |
| `DEV_DEPLOYED` | Pending. Do not infer deployment from successful builds/tests. |
| `REAL_INSTANCE_REGISTERED` | Pending. The inspected `smartaihub-runner.service` is the legacy `smartaihub.app` Runner and its control channel reports HTTP 502; it must not be retargeted or used as Modular tenant evidence. No separate Modular Runner has been proven. |
| `REAL_JOB_BOUND` | Pending; no genuine Modular Harness execution observed. |
| `MISSION_LINK_VERIFIED` | Pending. Mission remains explicitly `null` in the projection until a trusted explicit Mission association exists; Conversation is not used to infer it. |
| `TASK_LINK_VERIFIED` | Pending runtime UAT; source provides the identity-scoped LIVE Task Control navigation contract. |
| `OWNER_UAT` | Pending authenticated browser UAT. |

## Verification ledger

- SmartSpecPro focused Runner/migration suite: 39/40 passed; one known baseline refresh-token assertion expects `runner_auth_invalid` but receives `runner_refresh_revoked`. The other three files and the new R03.5 cases passed; no R03.5 failure was reported.
- Platform contracts tests: 10/10 passed.
- Platform Core focused tests: 49/49 passed; Core typecheck passed.
- Platform Shell focused tests: 5/5 passed; Shell typecheck passed.
- PostgreSQL migration validation used a disposable PostgreSQL 15.17 fixture, not the configured DEV database.
