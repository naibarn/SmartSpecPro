# Agents SDK + ChatGPT subscription Mini App experiment

Disposable local experiment. OpenAI Agents SDK runs the agent/tool loop; a small
custom `Model` adapter asks the official `openai-codex` Python SDK for each model
decision. `openai-codex` reuses the existing Codex/ChatGPT login through the
Codex app-server. The adapter does not call OpenAI HTTP APIs, a Gateway, or a
third-party proxy. It does not extract or convert subscription credentials.

This is an experimental adapter, not a built-in Agents SDK provider. The Codex
model turn is restricted to a read-only sandbox with approvals denied. Workspace
read/write and check functions run as scoped Agents SDK tools in this process.
The first version supports non-streaming `Runner.run()` and function tools; it
fails closed for unsupported hosted tools and streaming.

## Isolated setup

Use a throwaway virtual environment; do not add these packages to the product:

```sh
python3 -m venv /tmp/agents-sdk-codex-subscription-venv
/tmp/agents-sdk-codex-subscription-venv/bin/pip install openai-agents openai-codex
codex login status
```

The Python SDK reuses the existing login. Never read/export Codex auth files or
turn subscription credentials into an API key.

```sh
/tmp/agents-sdk-codex-subscription-venv/bin/python \
  experiments/agents-sdk-codex-subscription/run_experiment.py \
  --workspace /tmp/split-fair-miniapp
```

The run writes its state and real Codex turn receipts beneath the workspace's
`evidence/`. The controlled acceptance check is held outside the agent-visible
workspace. It starts a loopback server and exercises the app with Chromium
Playwright when the existing Playwright package/browser is available. Do not
reuse a nonempty `--workspace`; each run is a new disposable app task.

Evidence labels are deliberately distinct:

- `AGENTS_SDK_CODEX_SUBSCRIPTION_PROBE`: a real Agents SDK `Model` call delegated
  through `openai-codex`; not a built-in Agents SDK provider.
- `AGENTS_SDK_CODEX_SUBSCRIPTION_EXPERIMENT`: the live local Mini App route
  demonstrated below; Agents SDK orchestrates while Codex SDK uses the
  subscription login. It is not the built-in Agents SDK provider.
- `AGENTS_SDK_SUBSCRIPTION_MINIAPP`: use only after the real planning,
  implementation, test, independent review, repair (if required), final verify,
  and local browser receipts are complete.
- `UNVERIFIED`: any absent model/auth, test, or browser evidence.

No Gateway usage or API dollar cost is claimed. Record Codex token usage from
the SDK receipts separately as ChatGPT/Codex subscription usage.

## Latest live acceptance run

`evidence/acceptance-run-07/` contains the successful app, full run state,
Chromium receipt, screenshot, and Playwright trace. The live Planner,
Implementer, independent Reviewer, and independent Final Verifier all used
real Codex SDK turns through the Agents SDK `Model` adapter. A seeded remainder
cent defect failed the first hidden test. The agent diagnosed and fixed it;
the first implementation was then rejected because its UI label did not match
the browser harness selector. The agent repaired the app and the next complete
test/UAT/review/verification pass succeeded without operator intervention.

- Result: completed, 0 human interventions, 2 implementation attempts.
- Duration: 214.459 seconds.
- Codex SDK: 23 completed turns, 474,090 reported total tokens (ChatGPT/Codex
  subscription usage; no dollar value available).
- Agents SDK: 21 function-tool invocations.
- Focused Node tests: 6/6 pass on the accepted attempt.
- Chromium Playwright: calculate `$10.01 / 3` as `$3.34`, `$3.34`, `$3.33`; reset
  clears results; invalid amount displays an error; no page/console errors and
  no external requests.
- Gateway usage/cost, Moli UAT, and SPEC-224 Runner acceptance: UNVERIFIED.

Attempt 6 remains in `evidence/attempt-06/` as a failed run. Its browser
assertion incorrectly selected a `span` although the amount was rendered in a
`strong`; this was a harness defect and was fixed before attempt 7. The first
implementation of attempt 7 also remains in the run-state history; its browser
label mismatch was independently caught and repaired before acceptance.

This experiment's state file persists receipts after each completed model/tool
turn, but restarting the Python harness does not resume an Agents SDK run.
The separate `round3-interrupt-resume.json` from the earlier Codex-native
experiment proves low-level Codex SDK thread interruption/resume only; durable
interruption/resume of this Agents SDK control loop remains UNVERIFIED.

See [COMPARISON.md](COMPARISON.md) for the SPEC-224 evidence boundary and
recommended next step.
