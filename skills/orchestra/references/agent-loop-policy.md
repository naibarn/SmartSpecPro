# Agent Loop Policy

This policy turns Orchestra into a bounded coding-webapp conductor loop. It is
designed for agent-assisted implementation, debugging, review, and repair while
preventing context bloat, unbounded tool use, runaway sub-agents, and UI-first
debug guessing.

## Default Loop Profile

Use this profile unless the user or a plan artifact provides a stricter one:

```json
{
  "orchestra_id": "fable_style_coding_orchestra",
  "purpose": "coding webapp with an agent loop",
  "loop_policy": {
    "max_iterations": 12,
    "max_tool_calls": 30,
    "max_cost_usd": 0.5,
    "max_dispatch_waves": 6,
    "max_active_subagents": 4,
    "max_parallel_writers": 2,
    "max_subagent_wait_minutes": 10,
    "max_background_analysis_wait_minutes": 15,
    "max_repair_rounds": 5,
    "max_context_capsule_words": 1500,
    "stop_conditions": [
      "success_criteria_met",
      "tests_passed",
      "no_open_blockers"
    ]
  }
}
```

## Enforcement Model

Orchestra is a skill-level workflow, not a process supervisor. It must enforce
what it can directly observe and record soft limits for values that require host
telemetry.

| Field | Enforcement |
|---|---|
| `max_iterations` | Hard workflow limit. Count planning, implementation, review, repair, and verification cycles. |
| `max_tool_calls` | Soft limit. Increment a manual counter in `orchestra/progress.md` before each tool call batch or notable command group. |
| `max_cost_usd` | Soft limit. Track estimated-cost proxies: model tier, sub-agent count, web/browser/image calls, full-suite gates, and long-running commands. Stop before high-cost actions when the estimate could exceed the limit. |
| `max_dispatch_waves` | Hard wave-planning limit unless a blocker requires user approval to continue. |
| `max_active_subagents` | Hard dispatch-planning limit. Never launch a wave above this count. |
| `max_parallel_writers` | Hard dispatch-planning limit. Split writer waves above this count. |
| `max_subagent_wait_minutes` | Hard wait limit for required sub-agents. Record timeout before recovery, replacement, or stop. |
| `max_background_analysis_wait_minutes` | Hard wait limit for optional/background read-only agents. Integrate late results only if still relevant. |
| `max_repair_rounds` | Hard review/repair limit, also bounded by `review-convergence.md`. |
| `max_context_capsule_words` | Hard context discipline limit for Task Packet handoffs and Result Capsules. |

If a soft limit cannot be measured, record `unknown` and use the conservative
proxy. Do not claim that cost/tool-call limits were hard-enforced unless the host
runtime exposed exact telemetry.

## Progress Ledger

At Step 0/1, create or update this compact ledger in `orchestra/progress.md`:

```text
Loop policy:
  orchestra_id: fable_style_coding_orchestra
  purpose: coding webapp with an agent loop
  iteration: 0/12
  tool_call_batches: 0/30
  estimated_cost_usd: unknown <= 0.50
  dispatch_waves: 0/6
  active_subagents: 0/4
  parallel_writers: 0/2
  required_subagent_wait: 0/10 minutes
  background_subagent_wait: 0/15 minutes
  repair_rounds: 0/5
  stop_conditions: success_criteria_met, tests_passed, no_open_blockers
  stop_reason: active
```

Update the ledger after each implementation wave, sub-agent dispatch batch,
review/repair round, and verification command. Keep it compact; do not paste raw
tool output, transcripts, logs, or diffs.

## Iteration Definition

Count one iteration for each full conductor decision cycle that changes state:

- task classification/routing after initial preflight
- implementation wave, whether direct or sub-agent
- result integration after a wave
- quality gate pass/fail that changes next actions
- review/repair round
- recovery from blocker, timeout, or failed gate

Read-only SocratiCode narrowing and small targeted file reads during the same
cycle do not each count as separate iterations.

## Stop Conditions

Stop successfully only when all requested policy stop conditions are true:

- `success_criteria_met`: the user objective and accepted scope are implemented
  or explicitly deferred with rationale
- `tests_passed`: fresh relevant tests/typecheck/lint/gates passed after the last
  code or skill-doc change, or a skipped gate is recorded with residual risk
- `no_open_blockers`: no `MUST_FIX`, missing evidence, stale gate, unresolved
  contract violation, or blocked sub-agent remains

Stop blocked with a concrete `stop_reason` when any of these occurs:

- `loop_policy_iteration_limit`
- `loop_policy_tool_call_limit`
- `loop_policy_cost_limit_risk`
- `loop_policy_dispatch_wave_limit`
- `loop_policy_subagent_limit`
- `loop_policy_context_limit`
- `loop_policy_repair_limit`
- `data_first_debug_evidence_missing`
- `blocking_gate_failed`
- `user_decision_required`
- `external_dependency_unavailable`

The final summary must report the stop reason.

## Context Budget

Each wave handoff and Task Packet must use capsules:

- changed files: path + one-line summary
- findings: severity + one-line evidence
- logs/tests: command/artifact path + exact short excerpt only
- debug evidence: Evidence Ledger from `data-first-debug.md`
- prior results: status, blockers, stale gates, open contract notes

If a handoff would exceed `max_context_capsule_words`, split the task into a new
wave or write an artifact file and pass only the path plus a short index.

## Sub-Agent Lifecycle Guard

Before dispatching sub-agents:

1. Confirm dispatch is authorized by platform mode and user instruction.
2. Verify `active_subagents + wave_agents <= max_active_subagents`.
3. Verify writer count is `<= max_parallel_writers`.
4. Assign each agent a bounded Task Packet with:
   - exact files
   - no raw full logs/diffs/transcripts
   - report target words
   - timeout/stop instruction
   - Evidence Ledger for bug/debug work
5. Record the dispatch batch in `orchestra/progress.md`.
6. Do not start a new wave until all required non-background agents have returned
   a Result Capsule or a timeout/blocker has been recorded.
7. Record `waiting_since`, `timeout_minutes`, and `required: true|false` for each
   dispatched agent. Required agents time out at `max_subagent_wait_minutes`;
   optional/background read-only agents time out at
   `max_background_analysis_wait_minutes`.

If a sub-agent appears stuck or does not return:

- do not dispatch replacement agents blindly
- first record the elapsed wait and timeout status in `orchestra/progress.md`
- mark `subagent_timeout_or_missing_result`
- switch to direct inline recovery only if scope and risk permit it
- otherwise stop with `loop_policy_subagent_limit` or
  `external_dependency_unavailable`

## Debug And Repair Guard

For bug/debug work, apply `data-first-debug.md` before the first fix and again
before each repair round. A repair round with no new evidence must not change
implementation code unless the prior evidence already isolates the root cause.

If a reviewer asks for repair but the Evidence Ledger is missing or UI-only,
classify the finding as `VERIFY_ONLY` or `BLOCKED`, not `MUST_FIX`.

## Cost Proxy Policy

When exact cost is unavailable, estimate conservatively:

- lightweight local shell/SocratiCode/read-only checks: negligible
- one targeted test/typecheck command: low
- full test suite, browser/e2e, visual diff, or web search: medium
- image/video/audio generation, external API calls, or multiple sub-agents:
  high

If a high-cost action is not required to satisfy a blocking gate, defer it or ask
for confirmation when the policy includes `max_cost_usd`.

## Required Final Ledger

Before final response, include or update:

```text
Loop policy final:
  iterations_used: <n>/<max>
  tool_call_batches_used: <n or unknown>/<max>
  estimated_cost_usd: <value or unknown>/<max>
  dispatch_waves_used: <n>/<max>
  timed_out_subagents: <none | names>
  repair_rounds_used: <n>/<max>
  stop_conditions_met: [success_criteria_met, tests_passed, no_open_blockers]
  stop_reason: <success | blocked reason>
```

If exact tool calls or cost are unknown, say so and report the conservative proxy
used. Do not hide missing telemetry.
