# R03.6 Implementation Traceability

Updated: 2026-11-16

## Source and scope

| Area | Evidence | Status |
|---|---|---|
| Modular Runner enrollment | Current Platform Hono source exposes authenticated `GET /v1/core/chat/harnesses` only. The registration, capability-publication and heartbeat routes found in `apps/web/server/routes/runnerControl.ts` belong to the legacy SmartAIHub tenant-bound server; they cannot safely enroll a Modular tenant. `/usr/local/bin/codex` exists, but its presence does not prove authorization or a registered Harness. | BLOCKED: no Modular tenant-scoped enrollment/dispatch endpoint or credential binding; no service started |
| Explicit Mission admission | Core accepts a UUID `missionId` only alongside an explicit conversation and sends it to a dedicated SQL admission function. The existing canonical chat Job/outbox function still creates and dispatches the Job. | IMPLEMENTED / UNIT TESTED |
| Association integrity | Additive migration 0443 (`SHA-256 83cf992a0eef0793597ca855f6e45c789e75cfca509bc74ce91bf34cf2f6d6f3`) records one explicit Mission association per canonical Job with tenant, workspace, actor and conversation scope. Replays require the existing same association; a missionless historical Job cannot be retroactively bound. Applied to configured DEV database `smartspec` on PostgreSQL 15.17; ledger row `id=422`, timestamp `1794770000004`, exact hash verified. | DEV MIGRATED / DISPOSABLE FIXTURE PENDING |
| Mission projection | Migration 0443 changes Mission job/run/event/artifact projections to join only through the association table. Jobs sharing a conversation do not appear unless they were explicitly bound. | DEV MIGRATED / FIXTURE PENDING |
| Harness projection | Migration 0443 replaces the literal null Mission field with an exact scoped association lookup; Runner session and Attempt remain sourced from canonical tables. | DEV MIGRATED / FIXTURE PENDING |
| Core API tests | `pnpm --dir apps/saas-core exec vitest run src/chat/chatService.test.ts src/identity/authRoutes.test.ts` — 39 tests passed. | PASS |
| Runner refresh regression | Focused Runner route/service suite — 53 tests passed. The old test expected generic `runner_auth_invalid`, while the verifier and route contract intentionally return `runner_refresh_revoked` for revoked refresh credentials; assertion aligned to the specific contract. | PASS |
| SQL integration fixture | `modularChatQueue.integration.test.ts` now applies 0443 in the rollback transaction, requires PostgreSQL 15.17 and verifies explicit association, retry, non-inference and projection source. Latest focused run: 53 Runner tests passed; the SQL suite was skipped because `MODULAR_CHAT_TEST_DATABASE_URL`/`MODULAR_CHAT_TEST_EMAIL` are not configured. The only installed local server is PostgreSQL 17.11 and is not substituted for the required fixture. | PENDING |
| DEV migration and release | Migration 0443 applied after a protected pre-migration dump at `/home/dev/.config/smartspec-dev/backups/spec312-r036-pre-0443-2026-11-16T081709158Z.dump`. Post-migration checks: owner column grants present; owner schema CREATE revoked; runtime role can execute the admission function but has no direct table SELECT; function owner is `modular_chat_mission_owner`, fixed `search_path=pg_catalog, public`. Platform source `92f309e1043c47a5710528aca118c9d557520f39` deployed through the registered `modular-debian-dev` controller. Local Core/Chat/Shell health and public root/login/chat health passed; unauthenticated chat session/catalog correctly returned 401. Rollback service remains `smartspec-dev-web.service:3100`; release receipt: `/home/dev/modular-development-releases/modular-debian-dev-92f309e1043c47a5710528aca118c9d557520f39-built/release-manifest.json`. | PASS: DEV MIGRATED + DEPLOYED |
| Authenticated runtime/UAT | The deployed authenticated catalog endpoint returns 401 without credentials as expected. Read-only DB inspection found zero `runner_harness_instances` for tenant `modular-development`. No genuine Modular Runner registration, Codex Harness execution, Mission/Task live proof, or owner browser UAT was performed. | PENDING / BLOCKED BY MISSING MODULAR RUNNER PRODUCER |

## Implemented contract

- `POST /v1/core/chat/turns` accepts `missionId` as an optional UUID only when `conversationId` is present.
- Mission-bound admission selects `create_modular_chat_turn_job_for_mission`; missionless admission continues through the existing canonical function.
- The database function validates authenticated environment, workspace authorization, Mission owner, workspace, tenant, active lifecycle and exact conversation before invoking canonical admission in the same transaction.
- A newly created Job receives one append-only association. Idempotent retry is accepted only when the same Job already has the same Mission association. Conflicting or absent prior association on a replay is rejected.
- Existing Jobs are never associated by `conversationId`, title, timestamp or guessed identity.
- Mission and Harness execution projections read `missionId`/Job relationships only from the association. Attempts, sessions, Harness IDs, Runner IDs, Run IDs, events and artifacts remain canonical records, not duplicated association state.

## Remaining acceptance

1. Provision/bind the registered disposable PostgreSQL 15.17 fixture (`MODULAR_CHAT_TEST_DATABASE_URL`, `MODULAR_CHAT_TEST_EMAIL`) and run the SQL integration test; the configured shared DEV database is not a substitute.
2. Implement the missing independently scoped Modular Runner Gateway/enrollment/capability-publication/heartbeat/dispatch producer and scoped credential binding. The legacy `runnerControl` routes and current `smartaihub-runner.service` must remain isolated.
3. After a genuine authenticated Codex Runner appears, create/choose an explicit Mission, dispatch one harmless DEV task, and prove exact Mission→Job→Attempt→Harness→Task Control identity and captured evidence.
4. Perform authorized owner browser UAT and verify workspace denial, reconnect/no-redispatch, identity stability and evidence coverage.

## Runtime acceptance status

| Acceptance item | Status | Evidence |
|---|---|---|
| `MODULAR_RUNNER_ENROLLED` | NO | No modular enrollment producer/credentials exist. |
| `HARNESS_INSTANCE_REGISTERED` | NO | DEV tenant registry count is zero; no manual rows were inserted. |
| `HEARTBEAT_VERIFIED` | NO | No registered modular Runner. |
| `REAL_JOB_DISPATCHED` | NO | No eligible modular Harness/dispatch path. |
| `RUNNER_ACK_VERIFIED` | NO | No dispatch occurred. |
| `ATTEMPT_BOUND` | NO | No real Harness attempt. |
| `MISSION_JOB_BOUND` | IMPLEMENTED, NOT RUNTIME-VERIFIED | Explicit admission path and migration deployed; no real Job association produced. |
| `MISSION_LIVE_VERIFIED` | NO | No authenticated live execution read. |
| `TASK_LIVE_VERIFIED` | NO | No real Task Control deep link verified. |
| `EVIDENCE_CAPTURED` | NO | No real execution evidence. |
| `DEV_DEPLOYED` | YES | Platform `92f309e1043c47a5710528aca118c9d557520f39`; release manifest and controller receipt are recorded above. |
| `OWNER_UAT` | PENDING | No authorized MFA browser session used in this run. |

The release metadata was corrected in Platform commit `92f309e1043c47a5710528aca118c9d557520f39` so component build commands match the commands actually run. R03.6 remains PARTIAL: migration and DEV release are proven, but no real Runner execution or LIVE Mission/Task proof exists. No fixture is presented as live runtime evidence.
