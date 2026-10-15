# SPEC-224 Autonomous Completion and Outcome Economics Audit

**Source implementation:** `06ea9d9cf` (`origin/main` base `609d815f4467ed2a00dbbe6be9380466aa125c1c`)
**Acceptance:** UNKNOWN / PARTIAL. No real protected Runner + independent final verification evidence was produced in this environment.
**Scope:** Existing control plane, routing and MCP implementation audit; one bounded recovery-path defect fix. No production or remote runtime was accessed.

## Gap matrix

| Area | Existing implementation and evidence | Gap / SPEC-224 impact | Disposition |
|---|---|---|---|
| A. Provider-agnostic orchestration | `capabilityRegistry.ts` loads capabilities and pricing; `agentControlPlaneContracts.ts` defines provider/runtime adapter and normalized agent event contracts; `spec224DeveloperModelAdmission.ts` reserves, dispatches, binds thread/turn identity, settles usage and parks on provider capacity. | No architectural gap requiring a new registry, adapter, runner or event framework. Provider Turn and DevelopmentRun/WorkUnit completion remain distinct; final acceptance still requires `spec224FinalVerify.ts`. | No new abstraction. Real Codex Subscription + Runner acceptance remains unverified. |
| B. Durable execution | Canonical `worker_jobs` + outbox via `jobControlPlaneGateway.ts`; `spec224DevelopmentRunPersistence.ts` persists event/projection transitions and reconciles canonical job status; `spec224PhaseController.ts` binds phase jobs with fencing and idempotency; provider scheduler stores usage receipt states and deduplicates settlements. Evidence tests: `spec224DevelopmentRunPersistence.test.ts`, `spec224DevelopmentRunIntegration.test.ts`, `spec224DevelopmentRunTaskControl.integration.test.ts`, `spec224DeveloperModelAdmission.test.ts`, `spec224RecoveryGrantFence.test.ts`, `spec224RecoveryGrantBinding.test.ts`. | Verified blocker-state bug: `decideNextSafeAction()` classified `BLOCKED_RECOVERABLE` as `WAIT_FOR_HUMAN_DECISION`, despite an allowed recovery transition. Phase controller also did not materialize the recorded resume phase or distinguish recovery attempts in job idempotency. Fixed in `06ea9d9cf`; it resumes within budget, persists the target phase/attempt, and keys each recovery attempt separately. | Acceptance-critical focused fix completed; 58/58 scoped tests pass. Crash/restart on a real protected runner remains unverified. |
| C. Lifecycle separation | `DevelopmentRun` state/event projection and `worker_jobs` status are separate; provider model call receipts track thread/turn and usage; `spec224FinalVerify.ts` is independent from provider completion and enforces final evidence / workspace receipts. Existing integration tests cover restart/reconcile behavior. | No evidence that Provider Turn completion alone settles a Development WorkUnit. End-to-end proof that evidence finalization and independent verification precede final settlement is absent for real Runner acceptance. | Keep existing separation. Live acceptance deferred to authorized non-production Runner/runtime. |
| D. Cost / quota routing | `capabilityRegistry.ts` has model capability/pricing data; `spec224DeveloperModelAdmission.ts` and `providerSchedulerService.ts` implement admission, provider pool scheduling, budget reservations, rate-limit waits and usage settlement. `postgresProviderSchedulerRepository.ts` retains unknown usage conservatively and handles duplicate settlement; `spec224CodexBudgetAdmission.integration.test.ts` covers unknown/overrun usage. `economicReceiptSettlement.ts` and `economicSettlementService.ts` settle verified Runner receipts idempotently. Routing handoff `experiments/agents-sdk-codex-subscription/ADAPTIVE_ROUTING_HANDOFF.md` documents Luna default, bounded evidence-based escalation and de-escalation policy. | Actual monetary cost and provider subscription quota consumption/reset/opportunity cost are UNKNOWN when provider does not expose trustworthy values; token counts are not billing evidence. There is no SPEC-224 sample sufficient to report cost/quota per verified completion, failure-attributed recovery rate, or P95 time-to-verification. No evidence supports inventing monetary estimates. | No routing/settlement defect proven to block current acceptance. Adaptive economics, learning and aggregate metrics deferred until real verified outcomes exist. |
| E. MCP external agent control | Existing Python MCP clients/gateway: `python-backend/app/api/internal_mcp.py`, `python-backend/app/services/mcp_client.py`, `python-backend/app/services/mcp_client_manager.py`; existing MCP security tests under `apps/web/server/_core/__tests__/mcpGatewaySecurityFixes.test.ts`. Tenant identity, tool authorization/validation, session handling and existing agent tools are already present. | No evidence that SPEC-224 requires a new MCP gateway or tool system. Protected remote Runner/MCP grants and live end-to-end authorization remain unverified in this environment. | Reuse existing gateway and tools; do not create a second control plane. |

## Outcome economics baseline and gaps

| Measurement | Current evidence status |
|---|---|
| Task type / complexity, provider / model / effort, account pool reference, call/turn identity | Captured for admitted provider operations where supplied; model identity may remain `UNVERIFIED`; account pool references are logical identifiers, not secrets. |
| Attempts, wait duration, tokens and usage settlement | Call-level usage and admission/wait state exist. Unknown post-dispatch usage is retained/conservatively charged; duplicate settlement is idempotent. There is no complete SPEC-224 WorkUnit-to-final-verification aggregate. |
| Actual monetary cost | `UNKNOWN` for subscription calls absent provider billing evidence. Do not infer cost from tokens. Verified economic receipt settlement exists for applicable Runner receipts. |
| Subscription quota consumption / reset window / shadow cost | Quota/reset timing may be available as provider capacity evidence; actual subscription consumption and opportunity cost are not consistently exposed as trusted measurements. Monetary shadow cost remains `UNKNOWN`. |
| Acceptance pass/fail, failure cause, escalation effectiveness, verified completion | Existing receipts and independent verification records exist, but no adequate live SPEC-224 sample was verified in this audit. Metrics by task/model/harness and cost per verified completion remain `UNKNOWN`. |
| Sample sufficiency | Insufficient for SPEC-224 outcome metrics. Historical SPEC-038/experiment evidence is adjacent evidence and is not a SPEC-224 baseline. |

No double-counting defect was found in reviewed settlement paths: operation/receipt idempotency keys return duplicate outcomes rather than adding a second settlement; unknown usage remains explicitly unknown/conservatively charged. This conclusion is limited to the reviewed code and tests, not an audited production ledger.

## Acceptance-critical change

- `BLOCKED_RECOVERABLE` now selects `RECOVER_PHASE` while `phaseAttempt < maxPhaseAttempts`; exhausted attempts preserve the explicit human decision gate.
- Phase controller transitions through the existing Recovery state to the recorded resume phase, carries an incremented retry attempt into the durable projection/event, and includes the recovery attempt in canonical job idempotency. Duplicate commands return the already-bound job without a second admission.
- Authorization scope, current-job reconciliation, revision checks, fencing checks, worker control plane and existing final verification requirements remain in force.

## Verification evidence

- On source commit `06ea9d9cf`: 9 focused Vitest files / 58 tests passed, covering DevelopmentRun contracts, phase controller, persistence, model admission, recovery grants/fence, DevelopmentRun integration, Fast Lane behavior and task control integration. These are scoped code-level tests; they do not establish real Runner acceptance.
- Existing Fast Lane E2E suite was attempted; its 4 tests could not load because the isolated checkout's shared dependency tree lacks `superjson` (`Cannot find package 'superjson'` from `server/_core/trpc.ts`). This is an environment/dependency limitation, not an assertion failure. No dependency installation was attempted.
- Existing SPEC-224 mock E2E / injected reset simulations are not counted as real acceptance.
- No multi-day live Runner E2E, protected dispatch, post-process-restart real session resume, external Codex Subscription call, or independent final verification was performed in this environment.
- No repository-wide typecheck/build was run; repository policy prohibits local full typecheck due RAM constraints.

## Remaining blockers and next actions

1. Keep acceptance `UNKNOWN` until owner-authorized disposable Runner registration, fresh source/workspace/capability binding, disposable PostgreSQL, protected dispatch grant, and non-production runtime are available.
2. Repair/prepare the scoped E2E dependency environment (install only from the existing lockfile in a resource-admitted checkout), then run the existing Fast Lane E2E and crash/restart tests; do not treat mock runner success as final acceptance.
3. Run multi-day injected-clock E2E with the real Agents SDK + Codex Subscription adapter + existing Runner, including quota resume, crash boundaries, fencing, source revision change, evidence finalization, and independent final verification.
4. Use the owner-provisioned HTTPS Mini-App/Gateway environment separately for Revision 24 hosted Factory acceptance; Codex Subscription is not a hosted Mini-App fallback.
5. After real verified SPEC-224 completions accrue, calculate outcome economics by task/model/harness with actual, estimated, unknown and quota measures kept separate; do not make new metrics a closure condition for current acceptance.

**Status: PARTIAL.** The blocker-state recovery defect is fixed and scoped tests pass. SPEC-224 remains open; required real end-to-end acceptance and independent verification have not been evidenced.
