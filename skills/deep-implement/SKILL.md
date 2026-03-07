---
name: deep-implement
description: Implements code from deep-plan section files in Codex with TDD workflow, code review, and section-by-section git commits.
license: MIT
compatibility: Requires git repository; recommended test toolchain for target project
---

# Deep Implementation Skill (Codex)

Codex-adapted workflow: Preflight -> Implement Section (TDD) -> Review -> Fix -> Commit -> Record Progress.

This skill is a conversion of `deep-implement` to run in Codex without Claude-only task tools.

## CRITICAL: First Actions

### 1) Print Intro Banner

Print this banner first:

```text
⚠️  CONTEXT WARNING: This workflow is token-intensive. Consider compacting first.

═══════════════════════════════════════════════════════════════
DEEP-IMPLEMENT (CODEX): Section-by-Section Implementation
═══════════════════════════════════════════════════════════════
Implements /deep-plan sections with:
  - TDD methodology
  - Code review at each section
  - Git commits with section traceability
```

### 2) Validate Input

This skill requires a path to a `sections/` directory containing:
- `index.md` with `SECTION_MANIFEST`
- `section-NN-*.md` files

If input is missing or invalid, output:

```text
═══════════════════════════════════════════════════════════════
DEEP-IMPLEMENT: Sections Directory Required
═══════════════════════════════════════════════════════════════

Run with a sections directory:
  /deep-implement @path/to/planning/sections/

The directory must contain:
  - index.md with SECTION_MANIFEST block
  - section-NN-<name>.md files
═══════════════════════════════════════════════════════════════
```

Stop and wait for re-invocation.

### 3) Resolve Planning Context

Given `<sections_dir>`:
- `planning_dir = parent of sections_dir`
- expect files:
  - `<planning_dir>/implementation-plan.md`
  - `<planning_dir>/implementation-plan-tdd.md`
  - `<sections_dir>/index.md`

Compatibility resolution:
- If canonical filenames are missing, detect existing plan artifacts in `planning_dir`:
  - plan artifact: first match of `*plan.md` (excluding `*plan-tdd.md`)
  - TDD artifact: first match of `*plan-tdd.md`
- Use the detected pair consistently for reads/updates in this run.

Read `index.md` manifest and determine:
- ordered section list
- already-completed sections (heuristic: section has implementation notes updated, or recorded in local state file if present)

### 4) Preflight Check

Run and report:

```bash
git rev-parse --show-toplevel
git branch --show-current
git status --short
```

If branch is protected (`main`, `master`, `release/*`), recommend switching branch before continuing. Only pause if the user explicitly asked for branch safety review or if this run would require risky git history rewriting.

If working tree is dirty, inspect whether existing changes overlap the target section files. Proceed automatically when overlap risk is low and record that decision. Ask the user only if overlapping changes make ownership ambiguous or increase merge risk materially.

### 5) Determine Test Command

Prefer test command from `PROJECT_CONFIG` in `sections/index.md`.

If missing, infer from repository:
- JS/TS: `npm test` (or workspace-specific command)
- Python: `uv run pytest`

When uncertain, inspect repository scripts/config first and choose the most codebase-aligned command automatically. Ask the user only if no reliable command can be inferred.

### 6) Decision Style Handshake (Autonomous by Default)

Before entering the implementation loop, resolve decision style:
- If `<planning_dir>/decision-mode.md` exists and user did not request changing mode this turn, reuse it.
- Otherwise default to `auto_by_default` and write it immediately.
- Change mode only if the user explicitly asks for tighter control this turn.

Store as `decision_mode` for this run and write:
- `<planning_dir>/decision-mode.md`

Use values:
- `ask_every_choice` (only on explicit user request)
- `smart_auto`
- `auto_by_default` (default)

---

## Decision Policy (Applies to All Steps)

Whenever there are multiple valid implementation options:

1) Evaluate impact:
- `high-impact`: skipping sections, scope changes, schema/migration changes, disabling/weakening tests, changing commit strategy, security-sensitive tradeoffs.
- `low-impact`: naming/order/style choices, minor reversible workflow details.

2) Default to codebase-first autonomous implementation choices:
- Prefer the option that matches current repository conventions, keeps the diff smallest, preserves compatibility/contracts, and maintains testability.
- Treat purely technical tradeoffs as implementer-owned decisions.
- Ask the user only when a choice changes product behavior, expands/reduces agreed scope, introduces destructive/irreversible risk, or remains genuinely low-confidence after codebase inspection.

3) Apply `decision_mode`:
- `ask_every_choice`: ask only because the user explicitly requested that mode.
- `smart_auto`: auto-decide technical options; ask only for product/scope/destructive decisions.
- `auto_by_default`: auto-decide all technical options; ask only for destructive/irreversible risk, ambiguous product intent, or genuinely low confidence.

4) Always log decisions:
- Write/update `<planning_dir>/implementation-decision-log.md`:
  - section or step
  - options considered
  - decision taken
  - mode used (`asked` or `auto`)
  - rationale

5) Adaptive preference:
- Bias toward more automation by default.
- If user requests more control/detail, bias toward more prompts for the remainder of the run.
- User can override anytime with:
  - `ask mode`
  - `smart auto`
  - `auto mode`

6) Safety prompts:
- Context/compaction checkpoints should auto-continue unless the context state is genuinely unsafe.
- Do not ask the user for permission to inspect the codebase, search files, run tests, run safe non-destructive shell commands, or gather needed technical context.
- These are implementer-owned execution steps and should happen automatically.
- Ask only for destructive/irreversible actions, accepted-risk security bypasses, or product/scope ambiguity.

7) Git/GitHub recovery bias:
- Treat git history and the GitHub-backed repository as the default recovery mechanism for repo-local implementation work.
- Do not pause merely because a change may need rollback later; preserve recoverability and continue.
- Ask only when the next action would destroy data that git/GitHub cannot recover or would cause irreversible external side effects.

8) Backup-first data safety:
- If an operation risks data loss, create a timestamped dump/export/copy backup first and record the path plus restore command/steps.
- Continue automatically after the backup succeeds; do not wait for user confirmation merely because backup was necessary.
- Ask only if a reliable backup cannot be created, cannot be verified, or the risky action affects external state outside the available recovery path.
- Use `../BACKUP-PLAYBOOK.md` for backup naming, storage, restore-note format, and command patterns.

## Question UX Rules (Required)

When asking users for decisions:
- Ask one compact prompt at a time for related fields.
- Avoid nested numbered option lists; use short option codes/keywords.
- Reuse known answers from planning artifacts (especially `decision-mode.md`) and do not ask the same field twice unless user asks to revise it.
- If some fields are already known, ask only unresolved fields.

## Two-Stage Question Flow (Required)

Use strictly separated question phases:

### Stage A: Execution Decisions (Early/Mid Workflow)
- Decision mode selection (or reuse existing mode)
- Repeated test-failure branching
- Context-check continuation decisions
- Pre-commit hook triage decisions

### Stage B: Post-Implementation Hardening Decisions (Late Workflow)
- Only after `implementation-security-review.md` exists
- In `ask_every_choice`, present hardening recommendations and ask one adoption choice:
  - `plan_now` (create focused hardening plan)
  - `fix_now` (implement critical/high now)
  - `defer` (record and continue)
- In `smart_auto` or `auto_by_default`, choose automatically:
  - `fix_now` for safe in-scope critical/high items
  - `plan_now` when follow-up work is clearly needed but would expand scope materially
  - `defer` only for lower-priority residual hardening

Transition rule:
- Do not ask Stage B decisions during Stage A.
- Complete Stage B decision before closing final summary.

## Parallel Execution Policy (Codex)

Use `multi_tool_use.parallel` automatically when tasks are independent and low-risk.

### A) Auto-Parallel (use `multi_tool_use.parallel`)
- Safe read-only discovery:
  - listing files/dirs, reading files, searching text, checking git status/history.
- Independent analysis checks that do not mutate shared state.
- Multiple file reads in different paths for context gathering.

### B) Do NOT Parallelize (run sequentially)
- Any file edits that may touch overlapping files.
- Database/schema migrations and data backfills.
- Test runs likely to contend for same environment/resources.
- Git write operations (`add`, `commit`, `merge`, branch changes).
- Service start/stop/restart operations.
- Any step with non-trivial rollback risk.

### C) Risk Rule
- If uncertain whether tasks are independent, treat as risky and run sequentially.
- If parallel execution fails due to race/contention, retry sequentially and log the change.

## Blocked Task Queue Policy

When a task cannot proceed because of dependency/blocker, do not drop it. Record and revisit it.

### Tracking File
- Write/update: `<planning_dir>/implementation-blocked-tasks.md`

### Required fields per blocked task
- `task_id` (stable short id)
- `section`
- `task`
- `blocked_by`
- `unblock_condition`
- `status` (`blocked` | `ready` | `done` | `dropped-with-rationale`)
- `owner_step` (where to retry)
- `notes`

### Execution rule
1. Before starting a new section, scan blocked tasks and execute any `ready` tasks first.
2. After major milestones in a section (tests green, review fixes, pre-commit), re-check blocked tasks.
3. Before finalizing workflow, blocked queue must have no remaining `blocked`/`ready` items unless explicitly approved by user.
4. If any blocked task is intentionally dropped, record `dropped-with-rationale` and user approval reference.

## Implementation Loop (Per Section)

Process sections in manifest order.

For each incomplete `section-NN-*`:

### Step 1: Read Section Instructions

Read:
- `<sections_dir>/section-NN-*.md`
- relevant plan context from `<planning_dir>/implementation-plan.md`
- matching TDD expectations in `<planning_dir>/implementation-plan-tdd.md`

### Step 2: Plan Minimal Slice

Before coding, define:
- target files to modify
- tests to add/update first
- acceptance checks for this section

Keep scope strictly within section objective.

### Step 3: TDD Execution

1. Add/adjust tests based on section TDD stubs.
2. Run tests and confirm they fail for the right reason.
3. Implement minimal production code.
4. Re-run tests until green.
5. Run quick regression subset for touched area.

If tests fail repeatedly (3 focused attempts), escalate automatically:
- continue with a deeper debug pass if the failure still looks local and tractable
- if the section is blocked by an external dependency or unclear prerequisite, record a blocked task and move to the next safe ready task
- only ask the user if continuing would expand scope materially, require skipping agreed deliverables, or the blocker is product-directional rather than technical

Decision handling for repeated failures must still follow `decision_mode`, but autonomous modes should prefer `debug` or `blocked-and-continue` over asking the user to choose a technical path.

### Step 4: Section Review

Perform local code review of staged diff:
- correctness
- regression risk
- security/tenant isolation/auth checks
- performance risks
- missing tests

Write concise review notes to:
- `<planning_dir>/reviews/section-NN-review.md`

### Step 5: Apply Review Fixes

Apply high-value fixes immediately, re-run tests, and re-stage.

### Step 6: Update Section Doc (As-Built)

Update `<sections_dir>/section-NN-*.md` with:
- actual files changed
- deviations from plan (if any)
- tests added/updated
- known follow-ups

This keeps planning artifacts aligned with real implementation.

### Step 7: Commit Section

Commit once per section, including code + tests + section doc update.

Commit template:

```text
Implement section NN: <short-name>

- <key change 1>
- <key change 2>

Plan: section-NN-<short-name>.md
```

If pre-commit hooks modify files, re-stage and retry commit.

### Step 8: Record Progress

Write/update:
- `<planning_dir>/implementation-progress.md`
- `<planning_dir>/implementation-blocked-tasks.md` (if any blocked tasks exist)

Append per section:
- section name
- commit hash
- test command used
- pass/fail summary
- notable deviations
- blocked tasks resolved/remaining summary

### Step 9: Context Check (Every 2 Sections)

After sections 02, 04, 06, ... run a lightweight self-check on remaining context. Continue automatically by default. Only pause and offer `/clear` if context looks genuinely unsafe or the user explicitly asked for manual checkpoints.

---

## Finalization

After all sections complete:

1. Run full agreed test command (or best available comprehensive suite).
2. Run mandatory post-implementation security re-review.
3. Write final report:
   - `<planning_dir>/implementation-summary.md`
4. Include:
   - implemented sections
   - commit list
   - remaining risks / deferred items
   - suggested next implementation steps

### Mandatory Post-Implementation Security Re-Review

Always perform a fresh review after implementation to find:
- security vulnerabilities or regressions
- data/tenant isolation risks
- auth/authorization gaps
- unsafe input/output handling
- high-value hardening opportunities not yet implemented

Write findings to:
- `<planning_dir>/implementation-security-review.md`

Format findings by severity (`critical`, `high`, `medium`, `low`) with:
- file/path references
- risk statement
- recommended fix direction

### Autonomous Post-Re-Review Resolution

After producing `implementation-security-review.md`, choose the next action automatically:

- `fix_now` when findings are critical/high and can be resolved within the current task scope
- `plan_now` when the findings are significant but need a contained follow-up hardening plan
- `defer` when only medium/low findings remain or immediate fixes would expand scope disproportionately

Ask the user only if the choice would materially change product behavior, expand scope, or require destructive/irreversible changes.

Record the chosen action in:
- `<planning_dir>/implementation-summary.md`

If the chosen action is `plan_now`:
- Generate a focused follow-up plan file:
  - `<planning_dir>/implementation-hardening-plan.md`

If the chosen action is `fix_now`:
- Prioritize only `critical`/`high` findings first, then re-run tests and update summary.

If the chosen action is `defer`:
- Keep deferred findings explicitly listed in summary with rationale.

---

## Codex-Specific Rules

- Do not use Claude-only tools (`TaskList`, `TaskUpdate`, `AskUserQuestion`).
- Track progress with files in `planning_dir` instead.
- Prefer direct repository inspection and local test execution.
- Keep one commit per section unless user requests squashing strategy.
- Never assume scripts from legacy `deep_implement/scripts/*` exist.

---

## Reference Documents

Read as needed from this skill directory:
- `references/implementation-loop.md`
- `references/code-review-protocol.md`
- `references/code-review-interview.md`
- `references/apply-interview-fixes.md`
- `references/section-doc-update.md`
- `references/git-operations.md`
- `references/pre-commit-handling.md`
- `references/finalization.md`
