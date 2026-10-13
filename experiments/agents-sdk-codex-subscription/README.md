# Agents SDK + ChatGPT subscription Mini App experiment

Disposable local experiment. OpenAI Agents SDK runs the agent/tool loop; a small
custom `Model` adapter asks the official `openai-codex` Python SDK for each model
decision. `openai-codex` reuses the existing Codex/ChatGPT login through the
Codex app-server. The adapter does not call OpenAI HTTP APIs, a Gateway, or a
third-party proxy. It does not extract or convert subscription credentials.

This is an experimental adapter, not a built-in Agents SDK provider. The Codex
model turn is restricted to a read-only sandbox with approvals denied. Workspace
read/write and check functions run as scoped Agents SDK tools in this process.
The existing loop now checkpoints official Agents SDK `RunState` through
`Runner.run_streamed()` and stores session history with `SQLiteSession`. A
SQLite journal persists phases, model/thread/turn lifecycle, usage, and
idempotent tool receipts; a process lock denies concurrent resume. Codex turns
use stable IDs and persistent SDK threads. The public Codex SDK has no attach to
active turn API, so recovery polls thread history and refuses a duplicate turn
while the old turn remains active.

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
  experiments/agents-sdk-codex-subscription/supervise_run.py \
  --workspace /tmp/split-fair-miniapp \
  --crash-at model.after_receipt,model.after_turn_created_before_receipt,tool.write_file.after_effect,browser.after_receipt,verification.after_phase_complete \
  --max-restarts 8 --max-attempts 3 --implementation-max-turns 20
```

The supervisor is a subprocess restart harness for real forced process death;
the development control loop remains the existing Agents SDK phase loop. To
resume manually, run `run_experiment.py --workspace <workspace> --resume
--run-id <runId>`. Pending tool intents are reconciled from durable inputs and
current source digests before restoring `RunState`. Final acceptance requires
zero unsettled tool intents.

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

## Earlier live acceptance run (attempt 7)

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

Durable recovery evidence is stored in `evidence/durable-recovery-r9/`: process
logs, lifecycle events, SQLite receipts, final app source, Chromium screenshot
and trace, and the forced-restart receipt. Four injected process deaths were
recovered automatically, including after final verification. See
`COMPARISON.md` for measured recovery and token results. This remains distinct
from Gateway verification, built-in OpenAI provider execution, and SPEC-224
Runner acceptance.

## Latest durable recovery acceptance

`evidence/durable-recovery-r17/` is the latest clean fresh acceptance. It
contains the completed disposable SplitFair app, 172 lifecycle events, portable
SQLite journals, six process logs, Codex turn receipts, Chromium screenshot and
trace, recovery receipt, and a SHA-256 manifest. No harness or application code
changed during the run. Five injected process deaths were recovered by the
supervisor (six processes total); event-derived human interventions were 0.
The planner did not know about the seeded remainder-cent defect. Hidden tests
first failed, the implementer repaired the allocation logic, then 5/5 focused
tests, Chromium UAT, independent review, and independent final verification
passed. The verifier result was reconciled after its phase-completion crash
without starting another attempt.

The exact metrics and earlier run history are in `COMPARISON.md`. r13 must not
be treated as a clean acceptance: the harness changed while its run was live.
The failed or contaminated r12-r16 evidence remains preserved in the matching
`evidence/durable-recovery-r*` directories.

Restate has not been added. The server's BSL 1.1 license and the fit of its
model-provider wrapper with Codex subscription authentication need review before
adoption; see `COMPARISON.md` for the license and integration notes.

See [COMPARISON.md](COMPARISON.md) for the SPEC-224 evidence boundary and
recommended next step.
