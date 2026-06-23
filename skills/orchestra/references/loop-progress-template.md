# Loop Progress Template

Use this template in `orchestra/progress.md` whenever `agent-loop-policy.md` is
active. Keep it compact and update it after each wave, dispatch batch, repair
round, and verification command.

## Initial Ledger

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

## Sub-Agent Lifecycle Ledger

Add one entry per dispatch batch:

```text
Sub-agent lifecycle:
  batch: wave-<n>
  dispatched_at: <YYYY-MM-DDTHH:MM:SSZ>
  required_agents: [<name>, ...]
  background_agents: [<name>, ...]
  active_subagents: <n>/4
  parallel_writers: <n>/2
  waiting:
    - agent: <name>
      required: true
      waiting_since: <YYYY-MM-DDTHH:MM:SSZ>
      timeout_minutes: 10
      status: waiting | returned | timed_out | blocked
  replacement_allowed: false until timeout/blocker is recorded
```

Do not launch a replacement for a missing agent while `status: waiting`.
Record `timed_out` or `blocked` first, then decide whether inline recovery is
safe or whether the loop must stop.

## Evidence Ledger For Debug Work

When the loop is fixing a bug, include the compact ledger from
`data-first-debug.md` before the first implementation wave and refresh it before
repair rounds:

```text
Evidence ledger:
  source: traceId | runId | audit-log | db-row | test-output | server-log | ui-only
  identifier: <id/path/command>
  observed failure: <exact short excerpt>
  data state: <status/error/metadata row summary, or "not checked">
  confidence: high | medium | low
  next evidence needed: <only if confidence is not high>
```

## Update Checklist

- Increment `iteration` after each conductor decision cycle that changes state.
- Increment `tool_call_batches` before each notable tool or command group when
  exact host telemetry is unavailable.
- Increment `dispatch_waves` when a new wave is launched.
- Update `active_subagents`, `parallel_writers`, and each waiting entry when
  agents return or time out.
- Increment `repair_rounds` only for review/gate-driven repair loops.
- Keep raw logs, diffs, and long transcripts out of `progress.md`; store paths
  and short excerpts only.

## Final Ledger

```text
Loop policy final:
  iterations_used: <n>/12
  tool_call_batches_used: <n or unknown>/30
  estimated_cost_usd: <value or unknown>/0.50
  dispatch_waves_used: <n>/6
  timed_out_subagents: <none | names>
  repair_rounds_used: <n>/5
  stop_conditions_met: [success_criteria_met, tests_passed, no_open_blockers]
  stop_reason: <success | blocked reason>
```
