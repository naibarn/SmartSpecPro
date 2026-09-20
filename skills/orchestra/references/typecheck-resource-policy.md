# Typecheck Resource Policy

TypeScript verification must protect the host before it protects the gate.
Full-repository typechecking is not an automatic default because a command
that exhausts memory can terminate the agent, drop SSH, and produce no usable
diagnostic evidence.

## Default Route

For ordinary implementation work:

1. Inspect repository instructions and the package manager before selecting a
   command.
2. Map changed typed files to the smallest affected workspace(s).
3. Prefer focused tests, lint/format checks, contract checks, and changed-scope
   static checks that fit the resource budget.
4. Do not run the root full-repository typecheck unless the user explicitly
   requests it or a documented release gate requires it.
5. Do not run affected workspace typechecks automatically when repository
   instructions explicitly prohibit them for resource reasons.

## Explicit Typecheck Route

When explicitly requested, record the following before execution:

- exact command and workspace scope
- package manager and project configuration used
- memory budget and current available memory
- serial execution order; never start multiple typecheck processes in parallel
- output log path and a session-survivable wrapper such as CI or `tmux`
- whether the command is a diagnostic check or a release/blocking gate

Run the smallest independent workspace checks first. Use the root aggregate
only after the workspace-level evidence is understood; an orchestrator such as
Turbo may stop at the first failing package and hide later failures.

## Resource Failure Semantics

Classify these outcomes separately from code failures:

- `SKIPPED_POLICY`: repository policy does not allow an automatic typecheck
- `BLOCKED_RESOURCE`: preflight says the host cannot safely run it
- `UNVERIFIED_OOM`: the process or host ran out of memory
- `UNVERIFIED_TIMEOUT`: the bounded time budget expired
- `UNVERIFIED_SESSION_LOSS`: SSH or the host session disappeared
- `FAIL_CODE`: the command completed and reported code/type errors
- `PASS`: the command completed with exit code zero and fresh evidence

Only `PASS` satisfies the typecheck gate. Resource and session failures must
not be retried with the same command automatically. Record the command, exit
status or signal, log path, and residual risk, then continue with safe focused
proof or stop if the gate is blocking.

## Guardrails

- Never increase the Node heap beyond the host's safe memory budget as a blind
  fix; an 8 GB heap setting can still trigger host-level OOM on a smaller VM.
- Never interpret a disconnected SSH session as a successful check.
- Never report a skipped or resource-blocked check as passed.
- After any review fix touching the checked surface, mark the check stale and
  rerun it only under the same explicit/resource-safe policy.
