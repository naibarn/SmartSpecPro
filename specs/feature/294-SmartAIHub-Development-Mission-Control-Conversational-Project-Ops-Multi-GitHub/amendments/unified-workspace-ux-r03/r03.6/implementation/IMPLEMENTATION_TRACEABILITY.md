# R03.6 Implementation Traceability

Updated: 2026-11-16

## Source and scope

| Area | Evidence | Status |
|---|---|---|
| Modular Runner enrollment | Current Platform Hono source exposes authenticated `GET /v1/core/chat/harnesses` only. The registration, capability-publication and heartbeat routes found in `apps/web/server/routes/runnerControl.ts` belong to the legacy SmartAIHub tenant-bound server; they cannot safely enroll a Modular tenant. `/usr/local/bin/codex` exists, but its presence does not prove authorization or a registered Harness. | BLOCKED: no Modular tenant-scoped enrollment/dispatch endpoint or credential binding; no service started |
| Explicit Mission admission | Core accepts a UUID `missionId` only alongside an explicit conversation and sends it to a dedicated SQL admission function. The existing canonical chat Job/outbox function still creates and dispatches the Job. | IMPLEMENTED / UNIT TESTED |
| Association integrity | Additive migration 0443 (`SHA-256 83cf992a0eef0793597ca855f6e45c789e75cfca509bc74ce91bf34cf2f6d6f3`) records one explicit Mission association per canonical Job with tenant, workspace, actor and conversation scope. Replays require the existing same association; a missionless historical Job cannot be retroactively bound. | SOURCE READY / PG15 FIXTURE PENDING |
| Mission projection | Migration 0443 changes Mission job/run/event/artifact projections to join only through the association table. Jobs sharing a conversation do not appear unless they were explicitly bound. | SOURCE READY / PG15 FIXTURE PENDING |
| Harness projection | Migration 0443 replaces the literal null Mission field with an exact scoped association lookup; Runner session and Attempt remain sourced from canonical tables. | SOURCE READY / PG15 FIXTURE PENDING |
| Core API tests | `pnpm --dir apps/saas-core exec vitest run src/chat/chatService.test.ts src/identity/authRoutes.test.ts` — 39 tests passed. | PASS |
| Runner refresh regression | Focused Runner route/service suite — 53 tests passed. The old test expected generic `runner_auth_invalid`, while the verifier and route contract intentionally return `runner_refresh_revoked` for revoked refresh credentials; assertion aligned to the specific contract. | PASS |
| SQL integration fixture | `modularChatQueue.integration.test.ts` now applies 0443 in the rollback transaction, requires PostgreSQL 15.17 and verifies explicit association, retry, non-inference and projection source. Latest focused run: 53 Runner tests passed; the SQL suite was skipped because `MODULAR_CHAT_TEST_DATABASE_URL`/`MODULAR_CHAT_TEST_EMAIL` are not configured. The only installed local server is PostgreSQL 17.11 and is not substituted for the required fixture. | PENDING |
| DEV migration and release | R03.5 baseline release was Platform `0d2356dafa4e61b8f15777b0dc9758cc86d5fc78`. Platform source commit `b4fcf0c676fbbb3bbea2f99ca577bf5fede4b5d4` is integrated but not yet deployed. 0443 has not been applied. | PENDING |
| Authenticated runtime/UAT | No genuine Modular Runner registration, Codex Harness execution, Mission/Task live proof, or owner browser UAT was performed. | PENDING / BLOCKED BY RUNNER GATEWAY |

## Implemented contract

- `POST /v1/core/chat/turns` accepts `missionId` as an optional UUID only when `conversationId` is present.
- Mission-bound admission selects `create_modular_chat_turn_job_for_mission`; missionless admission continues through the existing canonical function.
- The database function validates authenticated environment, workspace authorization, Mission owner, workspace, tenant, active lifecycle and exact conversation before invoking canonical admission in the same transaction.
- A newly created Job receives one append-only association. Idempotent retry is accepted only when the same Job already has the same Mission association. Conflicting or absent prior association on a replay is rejected.
- Existing Jobs are never associated by `conversationId`, title, timestamp or guessed identity.
- Mission and Harness execution projections read `missionId`/Job relationships only from the association. Attempts, sessions, Harness IDs, Runner IDs, Run IDs, events and artifacts remain canonical records, not duplicated association state.

## Remaining acceptance

1. Provision/bind the registered disposable PostgreSQL 15.17 fixture (`MODULAR_CHAT_TEST_DATABASE_URL`, `MODULAR_CHAT_TEST_EMAIL`) and run the SQL integration test; diagnose and repair any migration, ACL or fixture failure.
2. Apply migration 0443 through the registered `pnpm --dir apps/web db:migrate` DEV procedure and verify hash, owner, fixed search path, PUBLIC denial and runtime grants.
3. Release Platform `b4fcf0c676fbbb3bbea2f99ca577bf5fede4b5d4` to `modular-debian-dev` after the migration succeeds, then verify the exact source SHA and Core/Chat/Shell health.
4. Add or provision the independently scoped Modular Runner Gateway/enrollment/publication contract. Do not bridge through legacy Runner credentials or retarget `smartaihub-runner.service`.
5. Only after a genuine authenticated Codex Runner appears, create/choose a Mission, dispatch one harmless DEV task, and prove exact Mission→Job→Attempt→Harness→Task Control identity and captured evidence.

R03.6 remains PARTIAL. The accepted UI and R03.5 registry are preserved; no fixture is presented as live runtime evidence.
