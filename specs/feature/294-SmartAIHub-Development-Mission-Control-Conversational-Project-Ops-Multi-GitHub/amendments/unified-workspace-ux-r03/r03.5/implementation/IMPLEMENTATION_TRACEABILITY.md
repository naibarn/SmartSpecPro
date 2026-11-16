# R03.5 Implementation Traceability

Evidence in this document distinguishes source/test evidence from a real authenticated Harness run. It must be refreshed after integration and DEV deployment.

| Status | Evidence / current result |
| --- | --- |
| `PRODUCER_IMPLEMENTED` | Implemented in `apps/web/server/services/runnerGateway.ts`: only supported adapter identities from an authenticated, replay-checked Runner capability snapshot are projected; stable identity is upserted with snapshot revision, workspace scope and provenance. Runner heartbeat/revocation updates registry freshness/trust. |
| `REGISTRATION_TESTED` | Focused `RunnerGateway` projection/revocation tests; disposable PostgreSQL 15.17 migration fixture exercised the catalog function, exact workspace projection, unknown entitlement, restricted runtime EXECUTE grant, and denial for unauthorized user/workspace. This is not evidence of a real Runner registration. |
| `CATALOG_API_IMPLEMENTED` | Platform Hono route `GET /v1/core/chat/harnesses`, workspace-scoped repository read, versioned shared contract, and Mission Control LIVE read path. Focused platform tests/typechecks pass. |
| `EXECUTION_BINDING_TESTED` | Dispatch resolves only one fresh trusted instance matching the exact tenant/Runner/adapter/workspace and execution capability; existing canonical execution session stores the optional FK after transactionally revalidating Job, Attempt, lease fence, Runner and Harness. Existing session/dispatcher tests and disposable PostgreSQL projection fixture pass. No genuine Harness-produced Job binding observed yet. |
| `DEV_DEPLOYED` | Deployed and controller-verified to `modular-debian-dev` / `https://aimarkethubs.com` from Platform SHA `0d2356dafa4e61b8f15777b0dc9758cc86d5fc78`; exact release, local/public smoke and rollback evidence are in `evidence/r035-modular-debian-dev-20261116.md`. Core, Chat and Shell returned 200; unauthenticated Chat session remained 401. |
| `DEV_MIGRATION_APPLIED` | Registered `pnpm --dir apps/web db:migrate` applied migration 0442 with exact source hash `d4405de7352115d1d580edc5e6cfb0762e74e8c65470e85aa01286975a97277a` at ledger timestamp `1794770000003`. Pre-migration `public`/`drizzle` custom dump is mode 0600 and `pg_restore --list` succeeded. `modular_chat_mission_owner` received temporary schema CREATE only during migration; it was revoked and verified absent afterward. Function ownership, fixed search_path, runtime EXECUTE, PUBLIC denial and lack of broad `worker_jobs` SELECT were verified against PostgreSQL 15.17. |
| `REAL_INSTANCE_REGISTERED` | Pending. The Modular DEV registry currently contains zero Harness instances. The only inspected active Runner service is the legacy `smartaihub-runner.service`, bound to `smartaihub.app`; it must not be retargeted or used as Modular tenant evidence. Do not infer Modular Harness availability from unrelated rows in the shared legacy Runner table. |
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
- The shared-tenant migration preflight previously allowed 0441 only while pending, so it blocked every authorized successor migration after 0441 had been applied. The preflight now validates the exact 0441 hash and a contiguous, hash-matching canonical suffix; focused migration-target tests cover both the one-time 0441 path and later successors.
- The first immutable Platform release build exposed a missing dependency build (`@smartaihub/saas-contracts`); release script fix `0d2356dafa4e61b8f15777b0dc9758cc86d5fc78` now builds that package before Core, after which Core/Shell/Chat dry-run builds passed.
