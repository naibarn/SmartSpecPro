# Agents SDK + Codex subscription experiment

## Result

The current experiment demonstrates a working development route where the
OpenAI Agents SDK orchestrates planning, tool execution, review, repair, and
verification. Its experimental custom `Model` adapter invokes the official
Python Codex SDK, which authenticates through the existing Codex app-server
ChatGPT login. No Gateway, API key, direct provider HTTP call, or external
proxy is involved. This is an Agents SDK integration using Codex subscription
auth; it is not the Agents SDK built-in OpenAI provider.

Attempt 7 completed a new SplitFair Mini App task. A meaningful unknown defect
was seeded in the remainder-cent allocation. The hidden test first failed
(`$10.01 / 3` returned 333 cents for all three shares). The model changed
`allocateShares`, added visible tests, and all focused tests passed. The first
browser pass exposed a UI-label mismatch against the harness contract; an
independent reviewer rejected it, and the model repaired it. The second pass
passed Chromium functional UAT and independent final verification.

## Measurements and proof

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

## Route details

1. Agents SDK `Runner.run_sync()` owns the orchestration loop and executes
   registered Python function tools.
2. The custom `agents.models.interface.Model` serializes each model request as
   a strict JSON dispatch contract.
3. `openai-codex` Python SDK starts an ephemeral Codex thread through the
   existing local app-server ChatGPT/Codex login. Each model decision has its
   own thread/turn receipt and subscription token usage.
4. The adapter converts Codex's strict response into an Agents SDK function
   call or final message. It does not call the Responses API or another provider
   endpoint.
5. App-file edits and tests run only through scoped Agents SDK tools inside a
   disposable `/tmp` workspace. Chromium loads only the loopback app; external
   browser requests are blocked and recorded.

The integration currently supports non-streaming `Runner.run()`, function
tools, bounded implementation attempts, independent read-only model review,
and independent final verification. Streaming, hosted tools, resumable
Agents SDK run checkpoints, Moli UAT, and Gateway mode are not implemented or
verified here.

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

Use this isolated prototype as the starting point for implementing remaining
Mini App specs through the updated Orchestra skill: the Agents SDK owns the
planning/review loop and Codex subscription remains the model route. Keep each
spec's implementation in its existing authorized worktree and lifecycle.
Before reusing this adapter beyond local experimentation, add durable
Agents SDK interruption/resume checkpoints and demonstrate one real spec task
with Moli or Chromium acceptance. Do not wire it to production Runner dispatch,
alter canonical SPEC-224 status, or represent Codex subscription tokens as
Gateway provider usage.
