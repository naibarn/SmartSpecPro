# Spec 224 D3.46 — Independent P-RECOVERY Evidence

## Result

Independent local PostgreSQL/WebSocket crash-window reproduction: **4/4 cases PASS** against the D3.45 implementation commit. No defect was reproduced, so no code was changed. **P-RECOVERY remains BLOCKED / OWNER_ACTION_REQUIRED**: the D3.22 decision record is still `NOT APPROVED / NOT ISSUED`; passing local evidence does not issue the required grant or runtime admission.

## Exact candidate and independent execution

- Implementation under test: `6aa34bc0b8b9c51ef986afdbcdbb1ba8b30434f6` (tree `1ee10a7cffe3f1e838e69b4e93d2925515f81374`). It is an ancestor of the D3.45 evidence tip `00cd52a3824a68c413409bf30955119a2bab9a00` and includes D3.41 approval work.
- Reviewer: independent subagent `Hooke`, agent `01a0e25c-6f5d-7d40-ab43-4f066afba599`; no source writes. Reviewer worktree `/home/dev/projects/SmartSpecPro-spec224-d346-independent`, detached at the exact implementation commit and clean after execution.
- Disposable PostgreSQL: reviewer reports PostgreSQL `15.17`; dedicated D3.46 instance/database, migration and runtime roles checked non-superuser. Registered Rust Runner + WSS tests used the deterministic local adapter; no paid provider or production credentials. Reviewer reports only D3.46-named container/network/volume were removed. No D3.46 containers remained after the run.
- Independent test file: `apps/web/server/services/__tests__/spec224RegisteredRunnerE2E.integration.test.ts`; one Vitest test was selected per run with `SPEC224_RUNNER_CRASH_CASE` set to one case. Each log reports `Test Files 1 passed (1)` and `Tests 1 passed (1)`. Total: **4 test executions / 4 passed**. Vitest exit codes were not captured separately; logs contain successful summaries and the reviewer reported all four PASS.
- Focused command form (credential values redacted; exact expanded command line was not retained): `NODE_ENV=test RUN_DB_INTEGRATION_TESTS=true DATABASE_URL=<disposable-non-superuser-url> JWT_SECRET=<disposable-test-secret> FEATURE_186_HARD_CUTOVER=true SPEC224_RUNNER_CRASH_CASE=<one-of-four-cases> pnpm --filter @smartspec/web exec vitest run server/services/__tests__/spec224RegisteredRunnerE2E.integration.test.ts`.

| Failure window | Independent result | Persisted-state assertions exercised | Log |
|---|---:|---|---|
| Disconnect before ACK | PASS, 1/1 | After reconnect/replay: one receipt, one continuation intent, one settlement, one phase transition; duplicate ACK clears Runner receipt journal; continuation replay is a no-op. | [`evidence/disconnect-before-ack.log`](evidence/disconnect-before-ack.log) (SHA-256 `18197b57bde380a16f1c7afecc50e8458d272eba37355766f0b98dcc8bcdc3af`) |
| ACK lost, Runner resends | PASS, 1/1 | Server has one receipt/intent/settlement; Runner resends the same journaled receipt, receives duplicate ACK, journal empties; one phase transition only. | [`evidence/lost-ack-resend.log`](evidence/lost-ack-resend.log) (SHA-256 `53504958b9a76985707e945cada67808e8b04915f4b4b224656aaca43ff1a0c3`) |
| SIGKILL after receipt/intent persist, before ACK | PASS, 1/1 | Before restart: job `waiting_external`, receipt=1, intent=1, settlement=0. After restarted control process reconciliation and Runner replay: terminal settlement=1, transition=1; no duplicate receipt or intent; journal clears after ACK. | [`evidence/sigkill-after-persist.log`](evidence/sigkill-after-persist.log) (SHA-256 `5775df7fe0007c4cb707837592baa19c6290e7fdfae75c29c3895913bf48f29a`) |
| SIGKILL after ACK, before DevelopmentRun continuation | PASS, 1/1 | Before restart: job `succeeded`, receipt=1, intent=1, settlement=1, transition=0; Runner journal empty. After restart/reconciliation: transition=1, no repeated settlement. | [`evidence/sigkill-after-ack.log`](evidence/sigkill-after-ack.log) (SHA-256 `4ae9997a6ac6d7e749275afa9ff50b7c7e5ce1c6d899033c4c3fa6925f9f38c1`) |

The persisted row/event counts above are the exact SQL assertions in the executed integration test; captured Vitest logs contain summaries rather than raw query output. The test also asserts receipt/intent event and command correlation, a stable operation ID, final DevelopmentRun state `PLANNING`, `completedEvents=1`, and idempotent continuation replay. The two SIGKILL cases kill a separate Node WSS child process and restart it. These results prove only the named local deterministic cases. The test command's exact environment-expanded shell line and standalone exit-code record were not retained; the preserved Vitest logs show one test passed per invocation.

## P-RECOVERY evidence matrix

Traceability uses the existing D3.22 P-RECOVERY decision record sections and D3.21 proposed contract R1–R5 / crash IDs C1–C11; those C labels are proposal labels, not newly created product requirements.

| Existing requirement | Status | Evidence / limit |
|---|---|---|
| P-RECOVERY decision: named authority owners, exact permitted paths/scope, authenticated grant, expiry and revocation source | **OWNER_ACTION_REQUIRED** | `/home/dev/.codex/checkpoints/spec224-d322-20260925T1457Z/P-RECOVERY-decision.md` remains `BLOCKED / NOT APPROVED / NOT ISSUED`; owners, target, expiry, revocation authority and authorization evidence are unset. D3.46 owner direction authorizes this local test scope, but is not an issued runtime-admission grant. |
| Candidate source identity, provenance and hash binding | **PASS for tested source identity** | Reviewer worktree was clean and detached at exact implementation commit `6aa34bc…`; tested-source hashes below. This proves identity, not source authorization or admission. |
| R1 — final approval decision and delivery intent persist in the approval authority transaction | **PASS (focused evidence)** | `ApprovalDBService._record_spec224_decision_intent` and decision commit; D3.41 PostgreSQL Python approval test plus cross-language PostgreSQL continuation test (reported D3.41: 1/1). Source identity below. No cross-database atomicity claim. |
| R2 — versioned Python/Node contract, stable delivery ID/digest, claim lease/fencing, durable ACK/reconciliation | **PASS (focused evidence)** | Contract `spec224.approval-decision.v1`; Python PostgreSQL test verifies scope, idempotent same decision, conflicting decision rejection, lease reclaim epoch and stale ACK rejection, ACK persistence after a fresh session. Node/PostgreSQL test verifies canonical events/outbox and acknowledged state. |
| R3 — authorization binding to tenant/job/operation/attempt/session/capability/fence before continuation | **PASS (focused scope)** | D3.41 approval integration and D3.43–D3.45 continuation tests/evidence; D3.46 four real Runner crash runs preserve bound receipt correlation. This is local test evidence, not an admitted runtime grant. |
| R4 — duplicate delivery idempotent; conflicting/stale/ambiguous result fail-closed and operator review, no blind side-effect retry | **PASS (tested paths only)** | D3.45 focused PostgreSQL continuation suite reports unknown outcome → operator review and no retry; current continuation implementation routes missing/mismatched authority and ambiguous terminal outcomes to operator review. D3.46 tests assert duplicate replay settles/transitions once. Does not certify every provider/outcome class. |
| R5 — authenticated cancellation actor/tenant, finalization race and cancellation delivery intent | **PASS at Python authority / NOT_TESTED end-to-end in this run** | D3.41 PostgreSQL approval test verifies only one of approve/cancel wins and tenant/requester checks; current Python service persists a cancelled decision intent. The D3.46 Runner crash suite does not execute cancellation delivery through Node/Runner. |
| PostgreSQL restart and reconciliation | **PASS (bounded)** | D3.46 case 3 and 4 independent process restart assertions; D3.41 approval test separately reopens a DB session and reads acknowledged state. No power-loss or production recovery claim. |
| Registered local Rust Runner WSS ACK | **PASS (local deterministic scope)** | Independent 4/4 D3.46 registered Runner runs; no paid provider. |
| Independent crash-window reproduction | **PASS for four named windows** | Reviewer-run logs listed above; exact candidate commit verified. No general certification beyond these failpoints. |
| Revocation/source authority recheck and expiring runtime admission | **OWNER_ACTION_REQUIRED** | The decision record names no authenticated revocation reader/source, expiry, or authorized grant. Runner binding revocation/stale fencing test coverage is not a substitute for an issued P-RECOVERY admission/revocation contract. |
| Final Verify/provenance guard preventing completion outside required closure | **NOT_TESTED by D3.46 crash suite** | Crash tests stop at the tested DevelopmentRun phase transition; no independent Final Verify campaign was run. This remains separate from the four ACK windows. |

### Source and artifact identity

P-RECOVERY contract SHA-256 `a5eae3dc4ad37911a89a99a1a825944eb2229bd00297d68c45d8d9c4d8febb21`; D3.21 crash matrix `9cebbc9b57a0e090b2c8b492ac406bfc9107b139965792ce1a1e6115e65ead37`; D3.22 decision record `39ef5673dd40c2e51a7ca46beb1935ab376c08c8da31f09642227a3c73d2d168`; D3.45 report `d07df9778fa004d192b2084c3d222983fc89db3930f9cbb4f11be4453ea59394`.

| Source at tested implementation commit | SHA-256 |
|---|---|
| `python-backend/app/services/approval_db_service.py` | `5e6ce387b9696bef25dd04c4322601cc3e5dd8328d03e97f7622c219524d2ba7` |
| `python-backend/app/api/approvals.py` | `4fc7a6b9dfd9e7cfd8a7f21c453b3c717905720cc1b358272af5d92958df9d4a` |
| `python-backend/tests/integration/test_spec224_approval_postgres.py` | `edb1bba70c029ed1831004045d7e1934fb116d8a491298b2551b69df97b99e07` |
| `apps/web/server/services/spec224ApprovalContinuation.ts` | `4237e71ebc5375be4700895b37157a32d05a037ec52114478c8a894dd4cfaee0` |
| `apps/web/server/services/__tests__/spec224ApprovalContinuationPostgres.integration.test.ts` | `cd52df659e016a326c6a26d5f44a144b7cd2f37cbd187bb7b03e13672cc0dd9d` |
| `apps/web/server/services/__tests__/spec224RegisteredRunnerE2E.integration.test.ts` | `e81d317477eec1f622e04c8bcb2bdef6b6cc9552c3f877a332f8b91954f8f070` |
| `apps/web/server/services/__tests__/spec224RunnerCrashServer.ts` | `46765ca45b339ca4618d69a03b2c628bf7018849f500334dbe6dc114aa51b026` |
| `apps/web/server/services/jobControlPlane.ts` | `49b888b7be8e0d8af62d0a6c5fab4ca5110c799c2dbbf370d9e2ffcbfca0b9af` |
| `apps/runner-app/src/journal.rs` | `d32185b6dd7af0c860237dfc40480c740390802268d450e456a084900b8e58b0` |
| `apps/runner-app/src/diagnostics.rs` | `7c72f2e18a4e6a009ffbf7cada719e15ac3e09c0eb95161d73466ef3ff76d740` |

## Disposition and next package

- Implementation defects fixed in D3.46: **none**; no patch/repair commit was warranted.
- `IMPLEMENTED`: D3.45 recovery changes remain implemented at `6aa34bc…`.
- `FOCUSED TESTED`: D3.45 historical lead evidence plus D3.46 independent local crash tests; D3.46 added 4 passing executions.
- `LOCAL RUST RUNNER VERIFIED`: PASS for the deterministic registered local Runner/WSS scope only.
- `CRASH WINDOWS VERIFIED`: PASS for the four D3.46 cases listed above.
- `RUNTIME ADMISSION`: **BLOCKED / OWNER_ACTION_REQUIRED**.
- `PRODUCTION CERTIFICATION`: **NOT CERTIFIED**.
- `WP-RUNNER-06`: remains **DEPENDENCY_BLOCKED** by WP-SOURCE-03/P-SOURCE and WP-DB-05 plus admission prerequisites; D3.46 does not change the DAG.
- P-SOURCE, WP-DB-05 and supported historical upgrade remain separate blockers.
- TypeScript typecheck: `SKIPPED_POLICY`.
- No source code changed, no provider/production access, no migration changes. Shared dirty checkout was untouched.

Next exact owner action to unblock the admission decision: issue or reject a scope-bound P-RECOVERY grant naming the authority owners and exact source hashes/scope, local target/test operations, expiry, authenticated issuer, and revocation source. Until then, do not mark P-RECOVERY PASS or WP-RUNNER-06 READY.
