# Loop Learning Log

Use this reference after a bounded coding/debug loop completes, stops, or
blocks. The goal is to preserve compact evidence that helps improve the next
orchestration run without storing raw transcripts, secrets, or bulky logs.

Write the learning log to `orchestra/learning-log.md`. Append only.

## Entry Template

```text
## Learning entry - <YYYY-MM-DDTHH:MM:SSZ>

Outcome:
  stop_reason: <success | blocked reason>
  requested_goal: <one sentence>
  completed_scope: <one sentence>
  skipped_or_deferred: <none | concise list with reason>

Loop counters:
  iterations_used: <n>/<max>
  tool_call_batches_used: <n or unknown>/<max>
  dispatch_waves_used: <n>/<max>
  repair_rounds_used: <n>/<max>
  timed_out_subagents: <none | names>
  estimated_cost_usd: <value or unknown>/<max>

Evidence quality:
  data_first_debug_applied: true | false
  evidence_sources: [traceId | runId | audit-log | db-row | test-output | server-log | ui-only]
  evidence_gap: <none | what was missing>
  ui_guessing_prevented: true | false

Verification:
  commands_run: [<command or artifact path>, ...]
  commands_skipped: [<command> - <reason>, ...]
  stale_gates_rerun: [<gate>, ...]
  must_do_now_gaps_fixed: [<gap>, ...]
  should_offer_next: [<gap>, ...]
  safely_deferred: [<gap> - <reason>, ...]
  residual_risk: <none | concise risk>

Next improvement signals:
  routing_miss: <none | what should route differently next time>
  missing_agent_or_gate: <none | role/gate needed>
  repeated_failure_pattern: <none | pattern>
  context_pressure: low | medium | high
  suggested_policy_change: <none | concise change>
```

## When To Append

- Final response for any active `agent-loop-policy.md` session.
- A loop stops due to timeout, budget, missing evidence, repeated repair, or
  sub-agent lifecycle issue.
- A bug/debug task was initially UI-only and later required log/table/test
  evidence.
- A quality gate passed only after repair.
- The conductor skipped a useful verification because of time, missing env, or
  unavailable external state.

## Rules

- Do not paste raw prompts, full logs, full database rows, secrets, credentials,
  cookies, or user private content.
- Prefer ids, paths, short excerpts, counters, and one-line conclusions.
- Treat `learning-log.md` as operational memory, not user-facing release notes.
- If a later run fixes a recurring pattern, append a new entry rather than
  editing the old one.
