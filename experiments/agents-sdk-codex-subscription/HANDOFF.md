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
- PR: [#922](https://github.com/naibarn/SmartSpecPro/pull/922), merged through the protected executor after `progressive_integration_gate` passed for head `e6442ee912340f813d0479f3bd558028828a867c`. Merged Main SHA: `bee035d98d97c013115e22e9acbb258af26e554d` (confirmed at `origin/main` and reachable).
- Runtime changes: WorkUnit development proceeds through durable iterations after reviewer/test findings; same-run process recovery remains bound to its existing phase and Codex thread; MaxTurnsExceeded resumes the saved Agents SDK RunState; subscription capacity persists as WAITING_CAPACITY and supervisor wakes with backoff. Legacy maxAttempts is no longer a mission cutoff. Runtime delivery status does not update canonical requirement status.
- Regression evidence: `python -m unittest discover -s experiments/agents-sdk-codex-subscription/tests -p 'test_*.py'` — 39/39 passed; `py_compile` for the changed Python modules and `git diff --check` passed. Tests cover structured repair continuation, simulated quota wait/restore, same-run process restart and stable phase identity, and retained source deltas.
- Evidence boundary: quota restoration and the subprocess worker in the new supervisor tests are simulated fixtures. No new live Codex WorkUnit, browser UAT, Gateway usage, or SPEC-224 Runner receipt was generated. Prior live local restart evidence remains durable-recovery-r17.
- Scope: no production code, shared database, canonical SPEC status, approval policy, worker_jobs/outbox integration, or remote trust setting was changed.
- Post-integration: `build-preview` was skipped by its workflow. Full repository build/typecheck remains a post-integration obligation for CI or an admitted resource window; do not run the repository-wide typecheck in this shared session.
- Next action: continue from Main SHA `bee035d98d97c013115e22e9acbb258af26e554d`, inspect current ownership/handoff evidence, and select the next eligible WorkUnits. Keep SPEC-038 `REQ-028588461FFC` PARTIAL until active AgentRuntime artifact correlation and isolated dashboard UAT have real evidence.

## Scoped patch relative import guard follow-up (PR #931)

- Worktree: `/home/dev/worktrees/agents-sdk-continuity-20261013`
- Source branch: `codex/allow-relative-import-scoped-patches-20261014`
- Canonical baseline: `9e397ffa1d2e1bd3110cd890dcc74700b94c31b9`
- Finding: `ScopedRepoTools.patch_file` rejected any patch body containing `../`, which blocked ordinary relative imports before creating an idempotent tool intent/receipt. Agents SDK surfaced only a generic tool error; the live SPEC-038 run then repeated the same patch dispatch. Target path still requires exact allowlist and now rejects absolute/traversal paths directly.
- Change: scope traversal protection to the target path; add regressions for a legitimate `../costTracker` import and a traversal target.
- Verification: `PYTHONPATH=experiments/agents-sdk-codex-subscription /tmp/agents-sdk-codex-subscription-venv/bin/python -m unittest test_spec_workunit_tools.ScopedPatchTests -v` — 9/9 passed; `py_compile` and `git diff --check` passed.
- Integration: PR [#931](https://github.com/naibarn/SmartSpecPro/pull/931), head `81cf3a42a9182dc0542c223cab3f033f99b3a0d1`, required `progressive_integration_gate` SUCCESS; merged Main SHA `f41088cca7fb54e8b8447b1be77c8fa01440f38d` confirmed at `origin/main`. `build-preview` was skipped.
- Follow-up: the live SPEC-038 run continues from the same durable run and phase identities. Iteration 7 used a child that loaded the prior guard. Iteration 8 started a new child after the merge; its replanner still carried forward a mistaken read-only tool-surface claim. Earlier failed patch dispatches remain in the run evidence.
- Next action: verify the next implementation continuation uses scoped `patch_file` and records a completed receipt; keep all other test/database authority unchanged.

## Replanner tool-surface correction (PR #932)

- Source branch: `codex/replanner-tool-surface-clarity-20261014`
- Canonical baseline: `f41088cca7fb54e8b8447b1be77c8fa01440f38d`
- Finding: the replanner runs with read-only tools and incorrectly instructed a later implementation phase that no registered write mechanism existed. The implementation phase has scoped `patch_file`/`write_file` tools under the same validated WorkUnit contract.
- Change: make the replanner prompt state its tools do not describe implementation tools; strengthen implementation instructions to follow its own registered tool surface; add a regression for that distinction.
- Verification: continuation regression suite 8/8 passed; scoped patch tool suite 9/9 passed; Python `py_compile` and `git diff --check` passed. First test invocation used an incorrect unittest module path and failed to import; rerun with `unittest discover -s experiments/agents-sdk-codex-subscription/tests` passed.
- Integration: PR [#932](https://github.com/naibarn/SmartSpecPro/pull/932), head `d6ed9f220cc431e14a9ef71cb91c7283b50f5371`, required `progressive_integration_gate` SUCCESS; merged Main SHA `e43ef9c222cbb3debaec38e70697df4640405f39` confirmed at `origin/main`. `build-preview` was skipped.
- Follow-up: the live run continues with the existing phase/thread bindings; its iteration 8 implementation phase started before PR #932 merged. The next child will load the clearer prompts.
- Next action: verify implementation continuation and review against cumulative source and test evidence.

## Cumulative review evidence correction (PR #933)

- Source branch: `codex/cumulative-review-evidence-20261014`
- Canonical baseline: `e43ef9c222cbb3debaec38e70697df4640405f39`
- Finding: reviewers received only the current iteration's `sourceDelta`, which led iteration 8 to overlook source changes made in earlier durable iterations.
- Change: include concise source-path and test-receipt history from all prior/current iterations in independent review and final verification inputs; omit large test logs.
- Verification: continuation regression suite passed; PR `progressive_integration_gate` SUCCESS, `build-preview` SKIPPED.
- Integration: merged through protected executor; Main SHA `0d6bc2d97106cdb450c84a801e19816c4f3b06d3`.
- Follow-up: iteration 8's independent reviewer still found the seeded Postgres and browser UAT evidence missing; those findings remain open and are now included as repair input.

## Supervisor continuation and contract-reconciliation repair (PR #934)

- Root cause: supervisor treated the projected `PARTIAL_CONTINUABLE` status as sufficient to launch another child, even when the child exited `1` before loading the run. A WorkUnit contract guidance refresh changed its raw digest, so each child failed the same binding check and the supervisor relaunched it every ~1.6s. These were sequential launches from one supervisor, not concurrent workers.
- Safety fix: only explicit worker continuation exit code `75` schedules the next development iteration. Binding drift now records `BLOCKED_EXTERNAL` and stops. Run continuation compares a durable authority/acceptance snapshot (allowlists, owner/workspace/revision, tests, authority, requirement, acceptance); legacy snapshots are recovered from the first persisted planner request. Only trusted explanatory guidance/budget may change without widening capability, and the refresh is durably recorded.
- Verification: supervisor/continuation regression tests passed 23/23, `py_compile` and `git diff --check` passed. PR #934 `progressive_integration_gate` SUCCESS; `build-preview` SKIPPED.
- Integration: PR [#934](https://github.com/naibarn/SmartSpecPro/pull/934) merged through the protected executor. Main SHA: `dc13646d33a1395da6abaa06abbd7a27416d1dcb`.
- Run evidence: run `422d25c8-c45e-4ad6-bf98-05bc03806a14` recovered its guidance-only contract refresh after proving exact authority-scope equality, retained the same run ID, and advanced from iteration 8 to 9. Iteration 9 then received independent review findings and the supervisor automatically began iteration 10. One deliberate conductor stop was recorded as one event-derived intervention; do not report this as zero.
- Current state: iteration 10 is active with Codex subscription authentication. Iteration 9's tests passed (50 Python adapter/contract tests); reviewer correctly left the slice continuable because TS/database/browser evidence and one usage-source defect remain. No Gateway or production/shared DB use is claimed.
- Next action: let iteration 10 repair the review finding and continue cycles. Keep seeded-Postgres and browser UAT UNVERIFIED until the validated contract/authorized runtime permits those checks. Keep SPEC-038 requirement PARTIAL until actual full acceptance evidence exists.

## Cumulative source diff for multi-iteration WorkUnits (pending PR)

- Source branch: `codex/cumulative-source-evidence-20261014`
- Canonical baseline: `213f392cf7f59553032a52095068772ce31b21e5`
- Owned code commit: `65a55fe879e1f092e16983deddc9505e2553cbe8`
- Finding: reviewer inputs clipped large files to their first 20,000 characters and used only the current iteration's `changedPaths`. Reviewers consequently reported that prior-cycle changes, including the pre-dispatch generation-ID propagation, were absent even though those changes remained in the current WorkUnit source. This caused repeated false findings and unproductive implementation cycles.
- Change: WorkUnit implementer, reviewer, and verifier inputs now include the allowlisted cumulative diff from the validated WorkUnit source revision, cumulative changed paths, and the current-iteration delta as a separate field. Test receipts identify both iteration-local paths and paths changed across the WorkUnit. The reviewer is instructed not to treat an iteration-local receipt as the complete task diff.
- Verification: `test_development_continuation.py` 7/7 passed; `py_compile` and `git diff --check` passed after conflict resolution with main.
- Integration: pending protected PR from `codex/cumulative-source-evidence-20261014`.
- Active-run effect: run `422d25c8-c45e-4ad6-bf98-05bc03806a14` is not restarted or rebound. Its next supervisor child will load the updated harness and provide cumulative source evidence. The run remains independent of this harness PR's acceptance state.
- Next action: open the normal protected PR; after merge, confirm the next WorkUnit review sees the existing route delta. Keep REQ-028588461FFC PARTIAL; TypeScript/PostgreSQL persistence evidence and browser UAT are still UNVERIFIED.
