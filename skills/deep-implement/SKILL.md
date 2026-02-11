---
name: deep-implement
description: Implements code from deep-plan/deep-plan-codex section files in Codex with TDD workflow, code review, and section-by-section git commits.
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

If branch is protected (`main`, `master`, `release/*`), recommend switching branch before continuing.

If working tree is dirty, ask user explicitly whether to proceed on top of existing changes.

### 5) Determine Test Command

Prefer test command from `PROJECT_CONFIG` in `sections/index.md`.

If missing, infer from repository:
- JS/TS: `npm test` (or workspace-specific command)
- Python: `uv run pytest`

When uncertain, ask user once and store the chosen command in session notes.

### 6) Decision Style Handshake (Required)

Before entering the implementation loop, resolve decision style:
- If `<planning_dir>/decision-mode.md` exists and user did not request changing mode this turn, reuse it and do not ask again.
- Otherwise ask user with a single-choice prompt:
  - `ask_every_choice` = Ask on every multi-option decision
  - `smart_auto` = Smart auto-decide (Recommended)
  - `auto_by_default` = Auto-decide by default, ask only for critical risk

Store as `decision_mode` for this run and write:
- `<planning_dir>/decision-mode.md`

Use values:
- `ask_every_choice`
- `smart_auto`
- `auto_by_default`

---

## Decision Policy (Applies to All Steps)

Whenever there are multiple valid implementation options:

1) Evaluate impact:
- `high-impact`: skipping sections, scope changes, schema/migration changes, disabling/weakening tests, changing commit strategy, security-sensitive tradeoffs.
- `low-impact`: naming/order/style choices, minor reversible workflow details.

2) Apply `decision_mode`:
- `ask_every_choice`:
  - always ask user with numbered options.
- `smart_auto`:
  - ask user for `high-impact` decisions.
  - auto-decide `low-impact` decisions with concise rationale.
- `auto_by_default`:
  - auto-decide both low/high impact.
  - ask user only for destructive/irreversible risk or low-confidence decisions.

3) Always log decisions:
- Write/update `<planning_dir>/implementation-decision-log.md`:
  - section or step
  - options considered
  - decision taken
  - mode used (`asked` or `auto`)
  - rationale

4) Adaptive preference:
- If user repeatedly replies with quick numeric confirmations, bias toward more automation within current mode.
- If user requests more control/detail, bias toward more prompts.
- User can override anytime with:
  - `ask mode`
  - `smart auto`
  - `auto mode`

5) Safety prompts:
- Context/compaction checkpoints defined by workflow remain mandatory.

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
- Present hardening recommendations, then ask one adoption choice:
  - `plan_now` (create focused hardening plan)
  - `fix_now` (implement critical/high now)
  - `defer` (record and continue)

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

If tests fail repeatedly (3 focused attempts), stop and ask user whether to:
- `debug` = continue debugging
- `skip` = skip current section
- `pause` = pause workflow

Decision handling for repeated failures must follow `decision_mode`:
- `ask_every_choice`: always ask.
- `smart_auto`: ask before skip/pause; may auto-continue debugging with rationale.
- `auto_by_default`: auto-decide unless destructive/irreversible risk is present.

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

After sections 02, 04, 06, ... prompt user:
- `continue` = continue now
- `clear` = `/clear` and resume from progress file

If user chooses clear, stop cleanly.

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

### Mandatory User Prompt After Re-Review

After producing `implementation-security-review.md`, always ask user immediately:

- `plan_now` = Create improvement plan now (Recommended)
- `fix_now` = Implement critical/high fixes now without new planning
- `defer` = Defer improvements and continue

Record user choice in:
- `<planning_dir>/implementation-summary.md`

If user chooses `plan_now`:
- Generate a focused follow-up plan file:
  - `<planning_dir>/implementation-hardening-plan.md`

If user chooses `fix_now`:
- Prioritize only `critical`/`high` findings first, then re-run tests and update summary.

If user chooses `defer`:
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
