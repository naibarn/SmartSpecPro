# SPEC-308 Progress

Loop policy:
  orchestra_id: fable_style_coding_orchestra
  purpose: coding webapp with an agent loop
  current_stage: PLANNING
  resume_from: PLANNING
  iteration: 1/12
  tool_call_batches: unknown/30
  estimated_cost_usd: unknown <= 0.50
  dispatch_waves: 1/6
  active_subagents: 0/4 (WP0 scout returned)
  parallel_writers: 0/2
  required_subagent_wait: 0/10 minutes
  background_subagent_wait: <10 minutes
  repair_rounds: 0/5
  stop_conditions: lifecycle_converged, tests_passed, no_open_blockers
  stop_reason: active

## Baseline
- Configured canonical: `origin/main` `ccd4cd11c664cf81cc54fe1287c60ce7f5c36978`.
- Task worktree: `/home/dev/worktrees/spec-308-dual-surface-20261009`, branch `codex/spec-308-dual-surface-20261009`.
- Canonical workspace user-uploaded untracked files preserved in `/home/dev/projects/SmartSpecPro`; all implementation occurs in task worktree.
- WP0 scout: `/root/wp0_source_audit`, read-only, returned; no files changed.
- Import and handoff exist locally; index check clean. No implementation or browser evidence yet.

## Work Units
| ID | Owner | Scope | Status | Completion predicate |
|---|---|---|---|---|
| WP0 | conductor | canonical spec/handoff and source audit | IN_PROGRESS | import promoted; baseline screenshots/facts recorded |
| WP1 | subagent A | mascot renderer/tests only | READY | five variants + focused tests |
| WP2 | subagent B | pure attention reducer/tests only | READY | trust-gated reducer + fake-timer tests |
| WP3–WP7 | conductor | bell, launcher, settings, coordinator, responsive, QA | PENDING | all relevant AC + gates |

## Dispatch batch 1
- Required: `wp0_source_audit` (read-only scout), returned at 2026-10-09 UTC.
- Result: canonical ID free; current SSE row identity supports only distinct newly seen notification IDs; no per-occurrence identity; no new data source.
- Next: integrate WP0 safe checkpoint, then dispatch WP1/WP2 with frozen contracts.

## Verification state
- PASS: `tools.spec_handoff index --check` (315 canonical / 473 records, no drift).
- PASS: target SPEC handoff structurally valid; completion correctly false.
- PASS: `git diff --check`; zip integrity and extracted contents verified.
- PENDING: implementation tests, baseline/browser captures, responsive evidence, 12-pass QA, PR merge, final verification.
