---
name: deep-plan-codex
description: Creates detailed, sectionized, TDD-oriented implementation plans in Codex using a file-based workflow (no Claude TaskList dependency). Use when planning complex features that need thorough pre-implementation analysis.
license: MIT
compatibility: Requires uv (Python 3.11+). Optional Gemini/OpenAI credentials for external review.
---

# Deep Planning Skill (Codex)

Codex-adapted workflow: Research -> Interview -> External Review -> TDD Plan -> Section Split.

This skill is a conversion of `deep-plan` to run without Claude-only task features.

## CRITICAL: First Actions

### 1) Print Intro and Validate Environment

Print this banner first:

```text
⚠️  CONTEXT WARNING: This workflow is token-intensive. Consider compacting first.

═══════════════════════════════════════════════════════════════
DEEP-PLAN (CODEX): AI-Assisted Implementation Planning
═══════════════════════════════════════════════════════════════
Research -> Interview -> External LLM Review -> TDD Plan
```

Then find and run validator:

```bash
find "$(pwd)" -path "*/deep_plan/scripts/checks/validate-env.sh" -type f 2>/dev/null | head -1
bash <script_path>
```

Parse JSON output and store:
- `plugin_root`
- `gemini_auth`
- `openai_auth`
- `valid`, `errors`, `warnings`

### 2) Handle Environment Errors

If `valid == false`:
- show errors to user
- stop only on critical errors:
  - `uv not installed`
  - plugin root cannot be resolved

If errors are only missing LLM credentials, ask user directly with numbered options:
1. `Self-review only (Recommended)` -> `review_mode=self_review`
2. `Exit to configure LLMs`
3. `Skip external review` -> `review_mode=skip`

If LLM credentials exist and are valid, use `review_mode=external_llm`.

### 3) Validate Spec File Input

This skill requires a markdown spec file path ending with `.md`.

If missing or invalid, output:

```text
═══════════════════════════════════════════════════════════════
DEEP-PLAN: Spec File Required
═══════════════════════════════════════════════════════════════

Run with a markdown spec file:
  /deep-plan-codex @path/to/your-spec.md
═══════════════════════════════════════════════════════════════
```

Stop and wait for re-invocation.

### 4) Setup Planning Session (Codex Mode)

Run:

```bash
python3 {plugin_root}/scripts/checks/setup-codex-session.py \
  --file "<file_path>" \
  --plugin-root "{plugin_root}" \
  --review-mode "{review_mode}"
```

Parse JSON output:
- `planning_dir`
- `mode` (`new` or `resume`)
- `resume_from_step`
- `message`

If `success == false`, show error and stop.

Status message format:

```text
Planning directory: {planning_dir}
Mode: {mode}
```

If `mode == "resume"`, continue from `resume_from_step`.

## Workflow

All generated files are saved in `planning_dir`.

### 6) Research Decision

Read `references/research-protocol.md`.

Decide with user:
- codebase research?
- web research?
- both?
- include testing coverage analysis (always yes)

### 7) Execute Research

If codebase research selected:
- inspect repository structure, existing services, schemas, and tests
- summarize findings

If web research selected:
- run web research and summarize sources

Write combined output to:
- `<planning_dir>/claude-research.md`

### 8) Detailed Interview

Read `references/interview-protocol.md`.

Run Q&A in main thread. Keep questions concrete and implementation-oriented.

### 9) Save Interview Transcript

Write:
- `<planning_dir>/claude-interview.md`

### 10) Write Initial Spec

Synthesize into:
- `<planning_dir>/claude-spec.md`

Use:
- original input spec file
- `claude-research.md` (if created)
- interview answers

### 11) Generate Implementation Plan

Read `references/plan-writing.md`.

Write:
- `<planning_dir>/claude-plan.md`

Hard constraints:
- prose only
- no full function/class implementations

### 12) Context Check (Pre-External Review)

Run:

```bash
uv run {plugin_root}/scripts/checks/check-context-decision.py \
  --planning-dir "<planning_dir>" \
  --upcoming-operation "External LLM Review"
```

If response action is `prompt`, ask user:
1. Continue
2. `/clear + re-run`

If user chooses clear/re-run, stop here.

### 13) External Review

Read `references/external-review.md`.

Follow `review_mode`:
- `external_llm`:
  - run:
    ```bash
    uv run {plugin_root}/scripts/llm_clients/review.py --planning-dir "<planning_dir>" --iteration 1
    ```
  - collect files in `<planning_dir>/reviews/`
- `self_review`:
  - produce `<planning_dir>/reviews/iteration-1-self-review.md`
- `skip`:
  - skip to step 16

### 14) Integrate Review Feedback

Create:
- `<planning_dir>/claude-integration-notes.md`

Document:
- accepted suggestions and rationale
- rejected suggestions and rationale

Update:
- `<planning_dir>/claude-plan.md`

### 15) User Review Checkpoint

Ask user to review `claude-plan.md` and confirm:
- `Done reviewing`

Wait for confirmation before continuing.

### 16) Apply TDD Approach

Read `references/tdd-approach.md`.

Create:
- `<planning_dir>/claude-plan-tdd.md`

Mirror plan structure with test stubs and verification criteria.

### 17) Context Check (Pre-Section Split)

Run:

```bash
uv run {plugin_root}/scripts/checks/check-context-decision.py \
  --planning-dir "<planning_dir>" \
  --upcoming-operation "Section splitting"
```

If prompted, ask user Continue vs `/clear + re-run`.

### 18) Create Section Index

Read `references/section-index.md`.

Create:
- `<planning_dir>/sections/index.md`

Must start with a valid `SECTION_MANIFEST` block.

### 19) Prepare Section Execution (Codex)

In Codex mode, skip task-list generation and execute directly from manifest:
- parse section list from `sections/index.md`
- verify order and dependencies

### 20) Write Section Files

Read `references/section-splitting.md`.

For each section in manifest, write:
- `<planning_dir>/sections/<section-name>.md`

After writing all sections, verify count:

```bash
ls <planning_dir>/sections/section-*.md | wc -l
```

### 21) Final Status & Cleanup

Run:

```bash
uv run {plugin_root}/scripts/checks/check-sections.py --planning-dir "<planning_dir>"
```

Confirm section state is complete.

### 22) Output Summary

List generated files and next steps.

## Resuming After Compaction

When resuming:
1. Load `deep_plan_config.json` from planning directory
2. Re-check generated files and infer current step
3. Continue from the earliest missing prerequisite step
4. If prerequisites are missing but downstream files exist, regenerate downstream files

Priority reference files:
- `references/research-protocol.md`
- `references/interview-protocol.md`
- `references/plan-writing.md`
- `references/external-review.md`
- `references/tdd-approach.md`
- `references/section-index.md`
- `references/section-splitting.md`
