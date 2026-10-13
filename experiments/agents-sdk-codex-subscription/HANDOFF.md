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
