# Durable recovery experiment handoff

- Worktree: `/home/dev/worktrees/agents-sdk-durable-recovery-20261013`
- Branch: `codex/agents-sdk-durable-recovery-20261013`
- Base: `94eabdff1b357fd73edf8f02ec3500ddbeb86b9d`
- Implementation checkpoint: `630a5cd44521ef12f2e0368385bdd998624c4b7a`
- Outcome: local Agents SDK + Codex subscription durable recovery prototype and
  r13 acceptance complete; no SPEC-224 Runner or Gateway acceptance claimed.
- Latest acceptance: `evidence/durable-recovery-r13/`, run
  `dc1ec2ae-6cad-4aa2-a2a6-bf826c1fe8ad`; completed after five injected process
  deaths, with zero event-derived human interventions. The r12 harness failure
  and earlier failed receipts remain preserved.
- Focused proof: Python unittest 19/19; Chromium interactions and final
  verification pass; `py_compile`, `node --check`, and `git diff --check` pass.
- Authority boundaries: existing ChatGPT/Codex login only; no API key
  extraction, Gateway call, production change, shared DB, Runner dispatch,
  approval/remote-trust change, or canonical SPEC edit. Restate is not added;
  BSL license/product fit remains unresolved.
- Remaining UNVERIFIED: Gateway/provider accounting, Moli UAT on this local app,
  SPEC-224 Runner lifecycle/acceptance, worker fencing/failover, deployment
  receipt reconciliation, and production runtime behavior.
- Next action: open/refresh a normal protected PR from this branch, satisfy
  actual required repository checks, and promote only through the
  authorized repository path. After integration, track heavier verification
  against the integrated SHA. Do not change canonical SPEC status.
