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
  - `<planning_dir>/claude-plan.md`
  - `<planning_dir>/claude-plan-tdd.md`
  - `<sections_dir>/index.md`

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

---

## Implementation Loop (Per Section)

Process sections in manifest order.

For each incomplete `section-NN-*`:

### Step 1: Read Section Instructions

Read:
- `<sections_dir>/section-NN-*.md`
- relevant plan context from `<planning_dir>/claude-plan.md`
- matching TDD expectations in `<planning_dir>/claude-plan-tdd.md`

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
1. continue debugging,
2. skip section,
3. pause workflow.

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

Append per section:
- section name
- commit hash
- test command used
- pass/fail summary
- notable deviations

### Step 9: Context Check (Every 2 Sections)

After sections 02, 04, 06, ... prompt user:
1. Continue now
2. `/clear` and resume from progress file

If user chooses clear, stop cleanly.

---

## Finalization

After all sections complete:

1. Run full agreed test command (or best available comprehensive suite).
2. Write final report:
   - `<planning_dir>/implementation-summary.md`
3. Include:
   - implemented sections
   - commit list
   - remaining risks / deferred items
   - suggested next implementation steps

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
