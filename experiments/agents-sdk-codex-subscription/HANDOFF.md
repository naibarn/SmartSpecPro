# Durable recovery experiment handoff

- Worktree: `/home/dev/worktrees/agents-sdk-durable-recovery-20261013`
- Current handoff branch: `codex/agents-sdk-durable-r17-handoff`
- Baseline: `94eabdff1b357fd73edf8f02ec3500ddbeb86b9d`
- Integrated durable-recovery checkpoint: PR [#915](https://github.com/naibarn/SmartSpecPro/pull/915), head `c1c4930d9df60169556aa5e91605f7ac491c68cd`, merged SHA `7ffca321be9b6ee77d7fb88d37f94c3927019d02` (confirmed reachable from `origin/main`). This follows experiment PR #913 and handoff correction PR #914.
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
- Integration: `progressive_integration_gate` passed on PR #915. `build-preview`
  was skipped by workflow; repository-wide typecheck/build remain pending
  post-integration verification against SHA
  `7ffca321be9b6ee77d7fb88d37f94c3927019d02`, using CI or an admitted resource
  window. Do not run repository-wide typecheck/build in this shared session.
- Route/authority: OpenAI Agents SDK loop with experimental custom `Model`
  adapter calling official `openai-codex` SDK through existing ChatGPT/Codex
  app-server login. No credentials were extracted or converted, no Gateway or
  direct provider API call occurred, and no Restate dependency was added.
  No production, shared DB, Runner, approval, remote-trust, or canonical SPEC
  changes. Moli UAT, Gateway, SPEC-224 Runner acceptance and production runtime
  remain UNVERIFIED.
- Next action: schedule the skipped build/typecheck against the integrated SHA
  in CI or an admitted resource window. Keep Gateway, Moli, Runner, and production
  evidence UNVERIFIED; do not change canonical SPEC status.

## Autonomous development continuity hardening (PR #922)

- Task worktree: `/home/dev/worktrees/agents-sdk-continuity-20261013`
- Source branch: `codex/agents-sdk-continuity-20261013`
- Canonical baseline: `15f3a9970bda6eafd274c2ff67bc6646ed18c84d`
- Implementation commits: `957e426cad7ed7059aaf7d60181fd6ca5e8897d7` and `92d9d70043f323fadbeb248bfe6b96d77142a57d` (source delta remains bound across a crash before tests/review).
- PR: [#922](https://github.com/naibarn/SmartSpecPro/pull/922), branch pushed through the normal path; latest head/checks and merge remain to be confirmed.
- Runtime changes: WorkUnit development proceeds through durable iterations after reviewer/test findings; same-run process recovery remains bound to its existing phase and Codex thread; MaxTurnsExceeded resumes the saved Agents SDK RunState; subscription capacity persists as WAITING_CAPACITY and supervisor wakes with backoff. Legacy maxAttempts is no longer a mission cutoff. Runtime delivery status does not update canonical requirement status.
- Regression evidence: `python -m unittest discover -s experiments/agents-sdk-codex-subscription/tests -p 'test_*.py'` — 39/39 passed; `py_compile` for the changed Python modules and `git diff --check` passed. Tests cover structured repair continuation, simulated quota wait/restore, same-run process restart and stable phase identity, and retained source deltas.
- Evidence boundary: quota restoration and the subprocess worker in the new supervisor tests are simulated fixtures. No new live Codex WorkUnit, browser UAT, Gateway usage, or SPEC-224 Runner receipt was generated. Prior live local restart evidence remains durable-recovery-r17.
- Scope: no production code, shared database, canonical SPEC status, approval policy, worker_jobs/outbox integration, or remote trust setting was changed.
- Next action: wait for PR #922 required checks, repair only slice-owned failures, merge through the protected executor when eligible, confirm the resulting `origin/main` SHA, then reselect eligible WorkUnits from the current SPEC registry. Keep SPEC-038 `REQ-028588461FFC` PARTIAL until active AgentRuntime artifact correlation and isolated dashboard UAT have real evidence.
