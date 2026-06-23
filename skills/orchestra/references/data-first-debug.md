# Data-First Debug Protocol

Use this protocol before forming or acting on a bug-fix hypothesis. Its goal is
to stop UI-first guessing loops and force the conductor to anchor debugging in
runtime evidence.

## Trigger

Apply this protocol when the user reports a bug, regression, failed run, broken
workflow, stuck job, timeout, unexpected status, or asks to debug/fix a system
behavior.

## Required Evidence Before Fixing

Before proposing or implementing a fix, collect at least one concrete evidence
source:

- exact error text, stack trace, test output, or failing command
- traceId, runId, jobId, taskId, provider task id, or request id
- audit JSONL entry path and matching event excerpt
- server/worker log excerpt with timestamp and component
- database table row/status/metadata for the failed run/job/task
- reproducible request/route/input payload and observed response
- screenshot or UI observation only when paired with one of the evidence items
  above

UI behavior alone is not enough evidence for a bug fix unless the bug is purely
presentational and the affected component/file is already obvious.

## Search Order

Prefer this order when evidence is not provided directly:

1. Look for trace/run/task/job ids in the user message, UI text, test output, or
   existing artifacts.
2. Inspect audit logs or runtime trace tables using the id and current date.
3. Inspect the relevant DB table row/status/metadata for the failed run/job/task.
4. Inspect server/worker logs around the failure timestamp.
5. Only then inspect UI/component code for how the bad state is rendered.

If the first available evidence is a UI screenshot or user-visible label, treat
it as a symptom and trace it back to the data source before changing code.

## Conductor Requirements

For bug routes, write a compact Evidence Ledger in `orchestra/plan.md` or the
Task Packet CONTEXT:

```text
Evidence ledger:
  source: traceId | runId | audit-log | db-row | test-output | server-log | ui-only
  identifier: <id/path/command>
  observed failure: <exact short excerpt>
  data state: <status/error/metadata row summary, or "not checked">
  confidence: high | medium | low
  next evidence needed: <only if confidence is not high>
```

Do not mark confidence `high` when `data state` is `not checked`, unless the
failure is a compile/type/test error with exact local output.

## Dispatch Rules

- Dispatch `error-detective` first when an id/log/trace exists or the failing
  component is unknown.
- Dispatch `debugger` only after an Evidence Ledger exists.
- If the user gives only UI symptoms and no route/file is obvious, ask for the
  smallest missing identifier or inspect local logs/tests before guessing.
- In Codex standard light mode, apply the same protocol inline instead of
  spawning a sub-agent.

## Stop And Ask

Stop and ask for a narrow identifier only when:

- no local logs/tests/data are available
- the bug cannot be reproduced locally
- there is no trace/run/task/job id, timestamp, tenant/user scope, or failing
  command to search from

The question should ask for one concrete artifact, for example:
`traceId/runId/jobId, approximate time, tenant/user, or the failing command output`.

## Anti-Patterns

Avoid:

- changing UI state handling before checking the backend/status row that feeds it
- assuming a provider or worker failed without checking task/job metadata
- treating "looks wrong in UI" as root cause
- sending full logs or full DB dumps to sub-agents
- running repeated repair loops with no new evidence
