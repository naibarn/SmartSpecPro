# Agents SDK + Codex subscription experiment

## Result

The current experiment demonstrates a working development route where the
OpenAI Agents SDK orchestrates planning, tool execution, review, repair, and
verification. Its experimental custom `Model` adapter invokes the official
Python Codex SDK, which authenticates through the existing Codex app-server
ChatGPT login. No Gateway, API key, direct provider HTTP call, or external
proxy is involved. This is an Agents SDK integration using Codex subscription
auth; it is not the Agents SDK built-in OpenAI provider.

Historical attempt 7 completed a new SplitFair Mini App task. A meaningful unknown defect
was seeded in the remainder-cent allocation. The hidden test first failed
(`$10.01 / 3` returned 333 cents for all three shares). The model changed
`allocateShares`, added visible tests, and all focused tests passed. The first
browser pass exposed a UI-label mismatch against the harness contract; an
independent reviewer rejected it, and the model repaired it. The second pass
passed Chromium functional UAT and independent final verification.

## Historical attempt 7 measurements

| Measure | Attempt 7 evidence | SPEC-224 Runner acceptance |
|---|---|---|
| End-to-end completion | Completed locally: plan → implement → test → review → repair → verify. | UNVERIFIED; no production-bound or authorized Runner dispatched. |
| Human interventions | 0. Two implementation attempts; repair was model-driven. | UNVERIFIED. |
| Latency | 214.459 seconds wall clock. | UNVERIFIED. |
| Model/tool invocations | 23 completed Codex SDK turns; 21 Agents SDK function-tool invocations. | UNVERIFIED. |
| Token usage | 474,090 total tokens reported across Codex turn receipts. Subscription usage; no dollar amount supplied by SDK. | Gateway tokens/cost UNVERIFIED. |
| Tests | 6/6 focused Node tests passed on accepted attempt. First hidden test failed on the seeded defect. | Runner test lifecycle UNVERIFIED. |
| Browser UAT | Chromium Playwright passed calculation, reset, and invalid-input interactions; screenshot and trace recorded. No page/console errors or external requests. | Runner browser acceptance UNVERIFIED. |
| Recovery | Model repaired both the seeded allocation defect and browser-discovered contract mismatch. | Runner interruption/recovery UNVERIFIED. |
| Gateway usage/cost | 0 Gateway calls; no Gateway charge to report. | UNVERIFIED. |
| Moli UAT | UNVERIFIED in this local Mini App experiment; no Moli browser tool/runtime was available. | Separate authenticated SmartAIHub Moli evidence supplied by user does not establish this local app's UAT. |
| Interruption/resume | Receipts are persisted after each finished turn/tool, but Python harness restart/resume is not implemented. Prior Codex SDK interruption/resume evidence is low-level and does not prove Agents SDK loop resume. | UNVERIFIED. |

Primary receipts and artifacts are under `evidence/acceptance-run-07/`.
`evidence/attempt-06/` preserves the failed harness run. No receipt is a
SPEC-224 Runner receipt, and no local result changes SPEC-224 authority or
acceptance status.

## Durable recovery run r9

Run `dfb56fd4-9152-4d9d-85e2-252b1bddf436` extends the same local Agents SDK
control loop with durable `RunState` checkpoints, `SQLiteSession` history,
Codex thread/turn reconciliation, stable event/call/operation IDs, SQLite
receipts, and a process lock. It is not a new workflow framework. Evidence is
under `evidence/durable-recovery-r9/`.

| Measure | r9 evidence |
|---|---|
| Completion | Mini App completed; live Planner, Implementer, independent Reviewer, and Final Verifier used Codex SDK turns through the Agents SDK Model adapter. |
| Restart recovery | Four forced process deaths consumed at `model.after_receipt`, `tool.write_file.after_effect`, `browser.after_receipt`, and `verification.after_phase_complete`; supervisor restarted five processes automatically. |
| Human intervention | 0, derived from persisted actor/event telemetry. |
| Duration | 183.450 seconds end-to-end, including four restarts. |
| Model/tool activity | 15 completed Codex SDK turns; 15 Agents SDK tool invocations but 9 unique receipt-bound operations. Six repeated invocations reused/reconciled the same stable receipts. |
| Subscription tokens | 321,557 reported total (316,123 input; 5,434 output; cached input 279,808). Dollar cost is unavailable and is not estimated. |
| Focused checks | Exit 0; 6/6 Node tests passed. |
| Browser UAT | Chromium passed calculate (`1001` cents → `334, 334, 333`), reset, and invalid amount validation. No page errors, console errors, or blocked external requests. Screenshot and trace are recorded. |
| Receipt integrity | 167 unique lifecycle event IDs, 15 stable model calls/turn receipts, 9 unique tool operations, 0 pending receipts, 0 superseded receipts. Two interrupted effects were reconciled from their durable input/digest receipts. |
| Provider/accounting | Existing ChatGPT/Codex login through Codex app-server; usage is subscription usage. No Gateway calls or Gateway spend. No direct provider API or API-key conversion. |
| SPEC-224 boundary | No Runner dispatched; no `worker_jobs`, shared database, production, canonical SPEC, approval, or remote trust changes. Runner acceptance remains UNVERIFIED. |

The r8 failure remains in `/tmp/agents-sdk-durable-acceptance-r8-20261013/`
outside the repo: its screenshot showed a working app, but the harness queried
`#results li strong` and `#message`, which did not match the app's `.share`
items and accessible alert. The corrected harness now has a regression test,
and r9 passed those interactions. r9 itself completed in one implementation
attempt; no application defect was seeded or recovered in that run. The four
tested failures were process terminations at the listed durability boundaries.

## Durable recovery acceptance r13

Run `dc1ec2ae-6cad-4aa2-a2a6-bf826c1fe8ad` is the latest fresh acceptance after
fixing the browser harness selectors. The planner did not know about the seeded
remainder-cent defect. The initial focused test exposed that `$10.01 / 3`
returned `333, 333, 333`; Codex repaired the allocator and added visible tests.
The independent reviewer caught a separate harness mismatch after the first
implementation. That false negative was traced to selectors that assumed one
specific result markup; the harness now reads result rows across the local app
markup variants. The corrected Chromium run passed, followed by an independent
review and final verification.

| Measure | r13 evidence |
|---|---|
| Completion | Plan → implement → tests → independent review → repair → Chromium UAT → final verification completed. |
| Process recovery | Five forced deaths across unbound model turn, persisted model receipt, post-write side effect, browser receipt, and verification completion. Supervisor restarted six processes automatically. |
| Human interventions | 0, from event-derived telemetry. |
| Duration | 331.951 seconds end-to-end, including five restarts. |
| Model/tool activity | 25 completed Codex SDK calls/turns; 18 tool intents and 17 tool completions plus receipt reconciliation/reuse. No duplicated file-write effect was observed. |
| Subscription tokens | 531,675 reported total tokens (525,150 input; 6,525 output; 438,272 cached input). No dollar estimate is available. |
| Tests | Seeded defect failed hidden acceptance first; repair passed all 6/6 focused/hidden Node tests. |
| Browser UAT | Chromium passed 1001 cents → 334/334/333, reset, and invalid-input validation. No page/console errors or external requests. Screenshot and trace are recorded. |
| Provider/accounting | Existing ChatGPT/Codex login through Codex app-server; usage is subscription usage. Gateway calls and Gateway spend: 0. |
| SPEC-224 boundary | No Runner dispatch or shared control-plane use. Runner acceptance remains UNVERIFIED. |

The preceding r12 acceptance (`evidence/durable-recovery-r12-failed/`) is
preserved. It exhausted three attempts because the harness queried the wrong
result selector even though the screenshot showed the app working. A direct
Chromium run with the corrected selector passed. r13 retains its initial failed
browser receipts beside the passing receipt, so the harness defect and repair
remain auditable.

### Recovery design gap mapping from the supplied proposal

The prototype proves durable checkpoints, stable lifecycle IDs, event-based
intervention counts, Codex turn reconciliation, receipt-bound idempotent local
tools, process restart, failure evidence, independent review, and evidence-gated
completion. It does not prove live Runner disconnect/failover, cross-worker
lease fencing, workspace conflict resolution, deployment receipt reconciliation,
Moli UAT, or SPEC-224 acceptance. Transient retries/backoff and progress-aware
adaptive replanning remain limited to the existing bounded Agents SDK phase
loop; this prototype does not add another recovery service or orchestrator.

### Restate license / fit

Restate remains a candidate only. Its Python SDK declares MIT, while the Restate
server is BSL 1.1 with additional grants and restrictions that require legal and
product review for SmartAIHub's intended deployment/service model. Its OpenAI
Agents integration also wraps model/provider configuration, so compatibility
with the existing Codex-subscription `Model` adapter needs a focused spike. No
Restate dependency or runtime was added. See [server license](https://github.com/restatedev/restate/blob/main/LICENSE),
[Python SDK metadata](https://github.com/restatedev/sdk-python/blob/main/pyproject.toml),
and [DurableRunner implementation](https://github.com/restatedev/sdk-python/blob/main/python/restate/ext/openai/runner_wrapper.py).

## Route details

1. Agents SDK `Runner.run_sync()` owns the orchestration loop and executes
   registered Python function tools.
2. The custom `agents.models.interface.Model` serializes each model request as
   a strict JSON dispatch contract.
3. `openai-codex` Python SDK uses persistent Codex threads through the existing
   local app-server ChatGPT/Codex login. Each model decision has a stable
   thread/turn receipt and subscription token usage; restart recovery checks
   thread history and avoids starting a duplicate while a turn is active.
4. The adapter converts Codex's strict response into an Agents SDK function
   call or final message. It does not call the Responses API or another provider
   endpoint.
5. App-file edits and tests run only through scoped Agents SDK tools inside a
   disposable `/tmp` workspace. Chromium loads only the loopback app; external
   browser requests are blocked and recorded.

The local experiment uses `Runner.run_streamed()` to checkpoint official
Agents SDK `RunState`, with `SQLiteSession` for conversation history, function
tools, bounded attempts, independent read-only review, and final verification.
This remains a local prototype: hosted tools, Moli UAT, Gateway mode, and the
SPEC-224 Runner lifecycle are not implemented or verified here.

## Comparison with SPEC-224 and prior Codex-native experiment

This run proves the narrow hypothesis that Agents SDK can orchestrate local
Mini App development while Codex subscription auth supplies model decisions.
It does not prove a runner lifecycle, job admission, settlement, DevelopmentRun
contract, tenant accounting, approval, or production integration. Those remain
under SPEC-224 ownership and authorization.

The earlier Round 2 Codex-native experiment also completed a Mini App and
Chromium UAT, but its model/tool loop was Codex SDK-native. Its low-level
interruption/resume evidence remains separate and is not attributed to this
Agents SDK run. The two modes are not treated as interchangeable: this result
is labeled `AGENTS_SDK_CODEX_SUBSCRIPTION_EXPERIMENT`, not
`AGENTS_SDK_VERIFIED`, Gateway-verified, or Runner-accepted.

## Recommended next step

### Minimal integration patch proposal (design only)

1. Keep the existing Agents SDK loop and Codex subscription `Model` adapter;
   add no second orchestrator or provider path.
2. When SPEC-224 owners authorize integration, persist `RunState` snapshots,
   `SQLiteSession` identity, stable model/tool IDs, and receipts under the
   existing DevelopmentRun/`worker_jobs` ownership and fencing model. The
   local SQLite journal here is experimental and must not become a shared
   production database.
3. Map failure evidence to the existing bounded retry/replan decisions;
   reconcile side effects before retry and let only the existing Runner
   settlement path decide terminal acceptance.
4. Extend SPEC-271 acceptance with source-bound test/browser receipts and an
   independent verifier. Keep authorization failures in `WAITING_AUTHORITY`;
   never convert them into retries or policy bypasses.
5. Treat runner loss/fencing and deployment receipt reconciliation as separate
   integration tests before claiming durable production recovery. Hold Restate
   until legal/product resolves its BSL scope and a Codex `Model` compatibility
   spike shows it preserves the subscription route.

Use this isolated prototype as the starting point for implementing remaining
Mini App specs through the updated Orchestra skill: the Agents SDK owns the
planning/review loop and Codex subscription remains the model route. Keep each
spec's implementation in its existing authorized worktree and lifecycle.
Before reusing this adapter beyond local experimentation, harden the
receipt-bound tool contract against filesystem changes outside the locked
workspace, and demonstrate one real spec task with Moli or Chromium acceptance.
Do not wire it to production Runner dispatch,
alter canonical SPEC-224 status, or represent Codex subscription tokens as
Gateway provider usage.
