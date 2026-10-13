# Durable recovery experiment handoff

- Worktree: `/home/dev/worktrees/agents-sdk-durable-recovery-20261013`
- Current branch: `codex/agents-sdk-durable-recovery-r17` (task-owned checkpoint
  for protected PR)
- Baseline: `94eabdff1b357fd73edf8f02ec3500ddbeb86b9d`
- Existing integrated experiment: PR #913 (`630a5cd...`, follow-up handoff
  correction PR #914); current `origin/main` at handoff: `7893b1a9ed3c5100752ee64aa0b6f9276a421d2e`.
- Latest acceptance: `evidence/durable-recovery-r17/`, run
  `70168176-8161-4e75-ae4e-8c072927d6c8`. It completed with five forced process
  deaths recovered, six processes total, 0 event-derived interventions,
  123.273 seconds, and 307,363 Codex subscription tokens. Focused tests passed
  5/5; functional Chromium UAT, independent review, and independent final
  verification passed. All receipts settled; no Runner/Gateway evidence is
  claimed.
- Recovery root fixes: preserve source-bound test/browser receipts across
  `RunState` resume; reconcile a completed verification phase into its attempt
  after a crash; make browser result parsing independent of nested markup and
  validate sub-cent rejection. Focused regression tests cover changed evidence
  failing closed and completed verification reconciliation.
- Run history: r13 is contaminated because harness code changed during its live
  run; r14 had review phase-input mismatch; r15 and r16 exhausted retries (r16
  due to another harness false negative). These are retained as evidence and
  are not represented as clean acceptance. See `COMPARISON.md`.
- Proof commands: `python3 -m unittest discover -s
  experiments/agents-sdk-codex-subscription/tests -v`, Python `py_compile` for
  changed modules, `node --check` for browser harness, and `git diff --check`.
- Integration status for this checkpoint: pending protected PR and
  `progressive_integration_gate`. Do not run repository-wide typecheck/build in
  this shared implementation session; preview build/typecheck remain a
  post-integration CI/resource-window obligation tied to the integrated SHA.
- Route/authority: OpenAI Agents SDK loop with experimental custom `Model`
  adapter calling official `openai-codex` SDK through existing ChatGPT/Codex
  app-server login. No credentials were extracted or converted, no Gateway or
  direct provider API call occurred, and no Restate dependency was added.
  No production, shared DB, Runner, approval, remote-trust, or canonical SPEC
  changes. Moli UAT, Gateway, SPEC-224 Runner acceptance and production runtime
  remain UNVERIFIED.
- Next action: run focused checks, refresh/reconcile against latest `origin/main`,
  pass FAST INTEGRATION GATE, and promote this safe experimental checkpoint by
  the repository protected path. Keep heavy verification tied to the integrated
  SHA; do not change canonical SPEC status.
