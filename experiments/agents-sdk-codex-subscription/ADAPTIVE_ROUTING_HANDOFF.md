# Adaptive routing implementation handoff

## P0 strict Luna policy audit (2026-10-15)

- Root cause: `adaptive-routing.v1` selected the account default for GENERAL (the
  live SDK catalog marks `gpt-6.1-sol` as default), selected a `high`-effort
  peer for REASONING after high-risk keywords/repeated code failures, and
  selected a distinct catalog peer for REVIEW. An explicit configured fallback
  could also replace a missing model. The Codex SDK model catalog can therefore
  reorder/default Sol or Astra without any Developer choice in the WorkUnit.
- Catalog check: read-only `openai-codex` SDK call returned `gpt-6-luna` with
  `medium` supported and marked `gpt-6.1-sol` as the default. No provider API or
  Gateway path was used.
- Run evidence: the prior adaptive SPEC-038 WorkUnit recorded in this handoff
  is `30a9faff-add6-439b-9ff7-1395893118d1`; the existing summary reports 23
  Codex turns and 726,995 subscription tokens. Selection summaries show 16
  GENERAL calls requested `gpt-6.1-sol` and 7 REVIEW calls requested
  `gpt-5.6-sol` / `gpt-6.1-sol`; no REASONING transition occurred. Effective
  model identity was `UNVERIFIED` for all 23 calls. This SPEC-038 run is related
  harness evidence, not an identified SPEC-224 run. No target SPEC-224 Run ID
  or its raw model-call/usage receipts were supplied or located in this audit
  workspace, so no per-role target-run usage is inferred from session counts.
- Actor boundary: those 23 recorded turns belong to the Agents SDK custom Model
  delegating through the Codex SDK, not the outer Codex Controller or Codex
  collaboration subagents. `AGENTS.md` has a separate Codex subagent rule (Sol
  only for planning; Terra otherwise) and does not configure the harness or
  mention Astra. Controller/subagent usage must be attributed from their own
  thread receipts; the harness receipts do not prove it.
- Fix: `model-policy.v2` defaults to `LUNA_ONLY`, pins GENERAL/REASONING/REVIEW
  to catalog-verified `gpt-6-luna` at medium, disables catalog/fallback-based
  model substitution, and records policy and escalation receipts with the
  existing durable model-call selection. REVIEW remains a distinct agent and
  phase while permitting the same model. Historical calls retain their stored
  selection; new calls in a legacy run cannot silently change the established
  model binding.
- Controlled mode: Sol requires a real persisted Luna repair call followed by
  a code-test failure, explicit model allowlist, budget authorization, quota
  observation and sufficient token budget. Astra adds a separate opt-in.
  Environment/quota/network/tool failures are not escalation evidence. Passing
  test/review evidence returns the next new call to Luna under a recorded
  de-escalation receipt. Missing Luna/medium ends as `BLOCKED_MODEL_POLICY`;
  account capacity/network failures continue through `WAITING_CAPACITY`.
- Verification: `python -m unittest discover -s tests -q` passed 97/97;
  `py_compile` for the four changed Python modules and `git diff --check`
  passed. PR `progressive_integration_gate` passed; `build-preview` was skipped
  because no frontend scope changed. Full SPEC-224 live acceptance remains
  pending. No existing run/worktree/evidence/receipt was modified.
- P0 task checkpoint: PR [#962](https://github.com/naibarn/SmartSpecPro/pull/962)
  merged at `96aa726980c14ea4f4b88de30f3b9937e4d1a0ad`, confirmed reachable from
  `origin/main` at the same SHA. The code checkpoint branch was
  `codex/spec224-luna-policy-20261015`, based on Main
  `af92f9107dbfb57c86d02327bcbe054d56d2c5ce`; implementation commit
  `2202eb2395ffd61b850256f7a2ed4e94e8488402`. Next action: resolve the exact
  SPEC-224 WorkUnit/Run ID and owner, check active-owner and resume eligibility,
  then capture a fresh authorized run's selection/usage/thread receipts and
  Planning→Implement→Test→Repair→Review→Verify evidence.

- Task branch: `codex/adaptive-multi-model-routing-20261014`
- Base at task start: `origin/main` SHA `5d94eea92a2cd1b6f00460c4550fefcfb6dd2987`
- Workspace: `/home/dev/worktrees/adaptive-multi-model-routing-20261014`
- Primary checkout preserved: `/mnt/SmartSpecDev/projects/SmartSpecPro` (dirty and 687 commits behind at task start).
- Preflight: `READY_FULL` for SDK import/API compatibility, official Codex SDK login route, live model discovery, two-model A→B→A read-only probe, Agents SDK bridge and durable checkpoint restore. Effective model selection remains `UNVERIFIED` because the runtime turn result did not expose a confirmed model ID.
- Runtime: Python 3.12.12; `openai-agents 0.23.1`; `openai-codex 0.162.1`; bundled `openai-codex-cli-bin 0.162.1`; `openai 3.29.0`; `pydantic 2.14.1`; `uv pip check` passed. Product backend still pins Agents SDK 0.21.1; no product dependency was changed.
- Live catalog: 7 account-visible model records returned by the official SDK. Read-only A→B→A turns completed on one thread using requested IDs `gpt-6.1-sol`, `gpt-6-astra`, `gpt-6.1-sol`; all returned structured `READY` responses and usage receipts. The IDs are requested models only, not independent evidence of effective model selection.
- Bridge smoke: `CodexSubscriptionModel` through Agents SDK executed a harmless in-memory host tool; model receipts persisted; restoring `RunState` did not repeat the host tool effect. `OPENAI_API_KEY` was removed from the test process and Agents SDK tracing disabled.
- Reuse: existing Agents SDK loop, Codex adapter, `DurableRunStore`, RunState, SQLiteSession, WorkUnit supervisor/backoff and scoped host tools. Existing model-call identity is retained; selection is atomically persisted with call planning. Legacy unresolved calls keep their original implicit route. A crash boundary covers restart immediately after selection persistence.
- Implementation: dynamic runtime catalog and supported effort mapping; GENERAL/REASONING/REVIEW profiles; deterministic high-risk and repeated same-failure escalation; environmental failure exclusions; validated explicit overrides and compatible fallback; distinct-model reviewer preference; durable selection/transition receipts; permanent routing configuration blockers do not become quota waits.
- Verification: baseline experiment suite passed 54/54 before feature changes. Final experiment suite passed 66/66 from `experiments/agents-sdk-codex-subscription`; `py_compile` and `git diff --check` passed. The suite includes deterministic routing, durable selection/restart, failure classification, and existing recovery fixtures. One existing binding-drift fixture intentionally reports `BLOCKED_EXTERNAL`.
- Independent review: prior read-only Codex SDK reviews found and drove fixes for HTTP/resource/assertion classification, fallback compatibility, review model independence, and false quota waits. Final targeted regression covers those cases, including `HTTP error 404` and expected/received blocks followed by a missing test script.
- Live acceptance: the subscription-backed adapter completed requested GENERAL → REASONING → GENERAL turns (`gpt-6.1-sol/medium` → `gpt-6-astra/high` → `gpt-6.1-sol/medium`) with durable turn/usage receipts. The failure/repair/test-pass transition itself is fixture-driven; no real repair or comparable fixed-vs-adaptive WorkUnit benchmark is claimed. Effective model confirmation remains `UNVERIFIED`.
- Scope boundary: experimental development pilot only. Production Chat/Team Gateway policy, broad concurrent writes, production resources, Moli UAT and SPEC-224 Runner acceptance are unchanged and not claimed.
- Integration: PR [#936](https://github.com/naibarn/SmartSpecPro/pull/936), source head `603995022e83580bae9914278b14c1b65b2250a3`, merged to configured canonical `main` at `213f392cf7f59553032a52095068772ce31b21e5`. `progressive_integration_gate` passed; `build-preview` and cleanup were skipped by workflow. The merge SHA is confirmed as `origin/main`.
- Post-integration verification: experiment suite passed 66/66 against `213f392cf7f59553032a52095068772ce31b21e5` (`python -m unittest discover -s tests`, from the experiment directory). Repository-wide typecheck/build, UAT, production and SPEC-224 acceptance remain unverified; no repository-wide typecheck/build was run in this shared implementation session.

## Follow-up: profile-scoped interruption acceptance

- Acceptance workspace: `/home/dev/worktrees/adaptive-acceptance-adaptive-20261014` (registered Task worktree, owner session `codex-adaptive-acceptance-adaptive-20261014`). The fixed-model comparison workspace is `/home/dev/worktrees/adaptive-acceptance-fixed-20261014`.
- Base canonical revision: `8450ab2b6809fd2aa718bdf1afd7f059066e10ce`.
- This checkpoint adds a profile-qualified crash trigger to the existing model-selection fault injector. `model.after_selection_persisted@profile=REASONING` now waits through GENERAL selections and injects only after the REASONING selection receipt is durable. The same change is prepared in both comparison worktrees so the benchmark uses the same harness.
- Focused proof: `python -m unittest tests.test_adaptive_routing -v` passed 13/13 in both registered worktrees; `py_compile` and `git diff --check` passed in the adaptive worktree.
- Pending: commit/promotion through a protected PR; live comparable fixed/adaptive SPEC WorkUnit runs; real interruption/recovery at the REASONING selection boundary; source-bound independent review and final checks.
- Effective per-turn model identity remains UNVERIFIED with installed Codex SDK 0.162.1; SPEC-224 Runner acceptance remains UNVERIFIED.

## Follow-up: reviewer model avoidance scope

- Independent regression: `make_workunit_agent()` searched the newest model receipt when choosing a distinct REVIEW model, including earlier calls from the same reviewer phase. A fixed REVIEW override therefore blocked a second reviewer turn; the WorkUnit ended `BLOCKED_EXTERNAL` before final verification.
- Repair under review in `/home/dev/worktrees/adaptive-review-profile-fix-20261014`: select the last persisted model from a different phase, preserving the distinct-model rule between phases while allowing multi-turn review within one phase.
- Failed live adaptive run retained at `/home/dev/worktrees/adaptive-routing-evidence-20261014/adaptive-run`: 210.481 s, 18 completed Codex turns, 544,669 reported subscription tokens, 0 human interventions, 0 restarts. It repaired the independent usage test and reviewer marked that scoped behavior ready for user testing; final verification was blocked by the review routing configuration defect. The configured REASONING-only fault was not consumed because the run never produced a code-failure replanning boundary. Do not count this as REASONING transition or recovery acceptance.
- The acceptance test reproduces the existing `0/0` AgentRuntime token usage defect before implementation and passed after the live model's two-file fix. SPEC-038 remains PARTIAL because piece/artifact accounting and authenticated browser UAT are outside this slice.
- Full regression suite for the reviewer-routing fix: `python -m unittest discover -s tests -v` passed 69/69; targeted adaptive routing passed 14/14; syntax compilation and diff checks passed.
- Next action: promote the reviewer-routing fix through a protected PR, then resume the durable run only after updating the registered runtime harness consistently. Repeat fixed/adaptive WorkUnits on equivalent source and receipts; verify effective model identity stays UNVERIFIED absent per-turn runtime telemetry. Keep SPEC-224 Runner acceptance UNVERIFIED.
## Follow-up: real WorkUnit comparison and recovery evidence (2026-10-14)

- SDK preflight was re-run in the preserved `/tmp/agents-sdk-codex-subscription-venv`: Python 3.12.12, `openai-agents 0.23.1`, `openai-codex 0.162.1`, bundled `codex-cli 0.162.1`, `openai 3.29.0`, and `pydantic 2.14.1`; imports and `uv pip check` passed. The CLI subscription route remained in use with `OPENAI_API_KEY` unset. The live Codex catalog previously revalidated in this environment contained seven account-visible IDs: `gpt-6.1-sol`, `gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`.
- Real WorkUnit: `SPEC038_CONTENT_COST_BY_SKILL`, acceptance evidence directory `/home/dev/worktrees/adaptive-routing-evidence-20261014`. Both registered workspaces used the same acceptance test and no shared database (`DEBUG=false`, in-memory SQLite URL, test itself in database mode `none`). The independent regression failed on both baselines: SDK usage `137/29` was returned as `0/0` by the native Agents runtime response.
- Adaptive run `30a9faff-add6-439b-9ff7-1395893118d1` ended `IMPLEMENTED_READY_FOR_USER_TEST`. It used 23 Codex turns, 726,995 reported subscription tokens, 542.9 seconds, 1 supervisor restart, and 0 human interventions. It made one implementation iteration and its focused regression passed. Profile receipts show GENERAL requested `gpt-6.1-sol` and REVIEW requested `gpt-5.6-sol` / `gpt-6.1-sol`; it never selected REASONING. The crash trigger `model.after_selection_persisted@profile=REASONING` was not consumed. A prior resume recorded a REVIEW routing blocker; the resumed run finished, but the blocker remains in its durable state. Do not count this as Adaptive escalation or transition-recovery acceptance.
- Fixed run `89191226-29da-4f70-a18e-8ed3ba8a4c23` ended `IMPLEMENTED_READY_FOR_USER_TEST`. It used 20 Codex turns, 619,745 reported subscription tokens, 262.5 seconds, 3 supervisor restarts, and 0 human interventions. It made one implementation iteration and its focused regression passed. Two model-boundary faults (`model.after_turn_created_before_receipt`, `model.after_receipt`) and one post-verification fault were consumed. Durable receipts show tool receipt reuse after restart; 5 tool invocations have 5 unique operation IDs and no pending receipts. This proves the fixed-profile WorkUnit's exercised recovery boundaries, not recovery during an Adaptive profile transition.
- Comparison is observational evidence from equivalent SPEC WorkUnit/test permissions, not a performance claim: Adaptive used 16 GENERAL + 7 REVIEW calls; Fixed used 14 GENERAL + 6 REVIEW calls. Fixed requested `gpt-6.1-sol` for GENERAL, while its REVIEW calls selected `gpt-6-astra` and `gpt-6.1-sol`. All 43 receipts across both runs have `effectiveModelStatus=UNVERIFIED`; execution success does not confirm effective model identity. The separately documented A→B→A SDK probe proves requested-model switching only.
- A scoped implementation defect was repaired in the Adaptive acceptance workspace: `RunResult.context_wrapper.usage` now reaches `AgentRuntimeResponse.finalOutput.usage`. The new regression failed before the change and passed after it. This is only a token-propagation slice: SPEC-038 remains PARTIAL because `providerUsageLog` persistence, per-piece cost correlation, monetary cost breakdown, full HTTP/SDK RunResult coverage, and authenticated dashboard UAT are unverified. The code and regression are integrated through PR [#942](https://github.com/naibarn/SmartSpecPro/pull/942), source head `77c609ea7734476abc757b3be88f890aa4e2e7d2`, canonical merge SHA `2b313bfc01c11e2976e4f0d6c0bb721eed50192a`. Post-integration focused pytest passed 1/1 at that exact SHA; changed-file compilation and `git diff --check` passed.
- Browser UAT is UNVERIFIED (the WorkUnit contract has no authorized browser adapter). SPEC-224 Runner acceptance is separately UNVERIFIED and was not attempted. No production resource or shared database was used.
- Independent review approved the focused token-propagation slice for user testing and found no known defect in that slice. PR #941 repaired the distinct review-phase avoidance bug and merged through required checks at `1e3d9a7088fdfde91a4ce1a68f63cb700113524c`. Next action: protect and integrate the isolated token-propagation repair after fast gate; then continue only with authorized SPEC-038 usage-log/cost correlation and browser UAT evidence. Adaptive REASONING transition and transition crash recovery remain open acceptance gaps.
