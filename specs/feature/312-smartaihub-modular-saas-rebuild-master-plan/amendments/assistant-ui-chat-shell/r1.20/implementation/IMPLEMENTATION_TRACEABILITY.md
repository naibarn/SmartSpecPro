# SPEC-312 R1.20 Implementation Traceability

**Assessment:** PARTIAL · **Source:** `smartaihub-platform@dfa5eaf9a1fcfe6796d1fa8ac54c90341afed950` · **SmartSpecPro:** `b537915eaa4c3dc08f4d5881814de94c78946277`

| Requirement | Source/API | Verification | Dev evidence | Status |
| --- | --- | --- | --- | --- |
| Versioned conversation to Job/Attempt/Event cursor projection | `ChatExecutionProjectionV1`; `GET /v1/core/chat/conversations/:id/execution`; migration function `list_modular_chat_conversation_execution` | Contract tests reject fabricated IDs/invalid cursors; Core route test validates authenticated workspace scope; migration integration fixture updated but skipped because its dedicated test DB credentials were not configured | Migration 0438 applied to configured `smartspec` dev DB; audit matched migration hash/timestamp, ledger row 417. Catalog confirms SECURITY DEFINER, owner `smartspec`, dev execute granted, PUBLIC execute denied. Anonymous deployed Core and Chat paths return 401. | IMPLEMENTED / TESTED / SCHEMA APPLIED / DEPLOYED_DEV |
| Inspector selection and refresh reads canonical Job status/Attempt | Chat Worker proxy allowlist and `loadConversationExecution`; Inspector displays canonical job/status/attempt and explicit unavailable fields | `@smartaihub/chat` 49/49; package typecheck/build pass; renders null Agent/Harness/Run/Executor/Machine relationships without synthetic values | Release controller deployed exact source SHA `dfa5eaf9a1fcfe6796d1fa8ac54c90341afed950`; served Chat entry SHA-256 matches artifact. Anonymous requests rejected. | IMPLEMENTED / TESTED / DEPLOYED_DEV / AUTHENTICATED UAT PENDING |
| Durable event references | Existing R1.19 `worker_job_events.eventSequence` reused as per-job cursor | R1.19 replay tests cover replay/order/reconnect/polling; projection contract binds cursor to canonical event sequence | No change to event ledger in R1.20 | REUSED / PARTIAL |
| Agent, Harness, Run, Executor and Machine relationships | Contract supports explicit nullable identity fields and unavailable-source reasons | Tests assert absent source IDs remain null; no upstream canonical identities supplied to this Chat source | None | PARTIAL / UPSTREAM CONTRACT REQUIRED |
| Private output artifacts | No R1.20 producer or retrieval source | Not enabled; artifact capability remains false | None | MISSING |
| Task Control / Mission Control | SPEC-294 source ownership located; no verified Modular API/DTO contract | No adapter/integration test | None | BLOCKED ON API/DTO INVESTIGATION |
| Authenticated browser UAT | Normal MFA browser sign-in required | Not available in this session; no credential/MFA bypass attempted | None | UAT_PENDING |

## Eight-area completion matrix

| Area | State | Evidence or remaining work |
| --- | --- | --- |
| Canonical conversation → Job correlation | DEPLOYED_DEV · PARTIAL | Authorized resolver and projection are deployed; signed-in real-conversation response is pending UAT. |
| Agent / Harness / Run / Executor / Machine identities | PARTIAL | Contract keeps absent identities null; authoritative producers are not exposed to Modular Chat. |
| Attempt and durable event references | IMPLEMENTED · TESTED | Latest persisted attempt and `worker_job_events.eventSequence` cursor; R1.19 owns SSE replay/reconnect. |
| Inline output artifacts | MISSING | No genuine Modular Chat output producer/private-object resolver; capability remains false. Input attachment R2 is not output storage evidence. |
| Thread Inspector | DEPLOYED_DEV · TESTED · UAT_PENDING | Loads projection on selection/refresh; anonymous boundary and served asset are verified; signed-in rendering remains pending. |
| Task Control / Mission Control | DEPENDENCY IDENTIFIED | SPEC-277 owns the Task Control read-model foundation; SPEC-294 defines Mission Control projection semantics; no versioned Modular DTO/adapter found. |
| Runtime authorization and release | DEPLOYED_DEV · VERIFIED | Exact SHA and target controller receipt; local/public smoke and anonymous 401 boundaries pass. |
| Authenticated runtime and responsive UAT | UAT_PENDING | Requires normal authorized MFA browser session; no credentials or MFA bypass used. |

## Checks

- `pnpm --filter @smartaihub/saas-contracts test` — PASS, 7/7.
- `pnpm --filter @smartaihub/saas-core test` — PASS, 121/121.
- `pnpm --filter @smartaihub/saas-core typecheck` — PASS.
- `pnpm --filter @smartaihub/saas-core build` — PASS (Wrangler dry-run).
- `pnpm --filter @smartaihub/chat test` — PASS, 49/49.
- `pnpm --filter @smartaihub/chat typecheck` — PASS.
- `pnpm --filter @smartaihub/chat build` — PASS (Vite and Wrangler dry-run).
- `drizzle/modularChatQueue.integration.test.ts` — SKIPPED; `RUN_MODULAR_CHAT_DB_INTEGRATION` and dedicated test DB credentials were not configured. It is not counted as a pass.
- `git diff --check` — PASS before the source commits.

## Deployment and acceptance

Exact-SHA immutable Core/Shell/Chat build and target-gated release passed for `dfa5eaf9a1fcfe6796d1fa8ac54c90341afed950` on `modular-debian-dev` / `aimarkethubs.com`. Controller local/public smoke and rollback evidence are in [r1.20-dev-release-20261115-dfa5eaf.md](r1.20-dev-release-20261115-dfa5eaf.md). The projection route's anonymous boundary was checked on both Core and Chat proxy; signed-in conversation projection and rendered Inspector UAT were not performed because no authorized browser session was available. This deployment does not close R1.20 or the parent SPEC.
