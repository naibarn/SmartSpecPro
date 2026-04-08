---
name: deep-plan
description: Creates detailed, sectionized, TDD-oriented implementation plans through research, stakeholder interviews, and multi-LLM review. Use when planning features that need thorough pre-implementation analysis.
license: MIT
compatibility: Requires uv (Python 3.11+), Gemini or OpenAI API key for external review
---

# Deep Planning Skill

Orchestrates a multi-step planning process: Research → Interview → External LLM Review → TDD Plan

## CRITICAL: First Actions

**BEFORE using any other tools**, do these in order:

### 1. Print Intro and Validate Environment

Print intro banner immediately:
```
⚠️  CONTEXT WARNING: This workflow is token-intensive. Consider compacting first.

═══════════════════════════════════════════════════════════════
DEEP-PLAN: AI-Assisted Implementation Planning
═══════════════════════════════════════════════════════════════
Research → Interview → External LLM Review → TDD Plan

DEEP-PLAN starts by running `validate-env.sh`. This script:
  - Checks env for external LLM auth values
  - Validates external LLM access by running tiny prompt(s) programmatically

SECURITY:
  - `validate-env.sh` reads secret auth values in order to validate LLM access
  - It never publishes these values or exposes them to claude
  
 Note: DEEP-PLAN will write many .md files to the planning directory you pass it
```

**Find and run validate-env.sh:**
```bash
find "$(pwd)" -path "*/deep_plan/scripts/checks/validate-env.sh" -type f 2>/dev/null | head -1
```

```bash
bash <script_path>
```

**Parse the JSON output:**
```json
{
  "valid": true,
  "errors": [],
  "warnings": [],
  "gemini_auth": "api_key",
  "openai_auth": true,
  "plugin_root": "/path/to/plugin"
}
```

**Store `plugin_root`** - it's used throughout the workflow.

### 2. Handle Environment Errors

If `valid == false`:
- Show the errors to the user

**If errors are critical** (uv not installed, plugin root not found):
- Stop the workflow. User must fix these before proceeding.

**If errors are ONLY about missing LLM credentials** (gemini_auth is null AND openai_auth is false):
```
AskUserQuestion:
  question: "No external LLMs configured. How should plan review be handled?"
  options:
    - label: "Use Claude Opus for review (Recommended)"
      description: "Launch an Opus subagent to review the plan"
    - label: "Exit to configure LLMs"
      description: "Stop to set up Gemini/OpenAI credentials"
    - label: "Skip external review"
      description: "Proceed without any external plan review"
```

**Store the choice as `review_mode`:**
- "Use Claude Opus" → `review_mode = "opus_subagent"`
- "Skip external review" → `review_mode = "skip"`
- Default (LLMs available) → `review_mode = "external_llm"`

```
Environment validated:
  Gemini: {gemini_auth or "not configured"}
  OpenAI: {openai_auth ? "configured" : "not configured"}
  Review mode: {review_mode}
```

### 3. Validate Spec File Input

**Check if user provided @file at invocation AND it's a spec file (ends with `.md`).**

If NO @file was provided OR the path doesn't end with `.md`, output this and STOP:
```
═══════════════════════════════════════════════════════════════
DEEP-PLAN: Spec File Required
═══════════════════════════════════════════════════════════════

This skill requires a markdown spec file path (must end with .md).
The planning directory is inferred from the spec file's parent directory.

To start a NEW plan:
  1. Create a markdown spec file describing what you want to build
  2. It can be as detailed or as vague as you like
  3. Place it in a directory where deep-plan can save planning files
  4. Run: /deep-plan @path/to/your-spec.md

To RESUME an existing plan:
  1. Run: /deep-plan @path/to/your-spec.md

Example: /deep-plan @planning/my-feature-spec.md
═══════════════════════════════════════════════════════════════
```
**Do not continue. Wait for user to re-invoke with a .md file path.**

### 4. Setup Planning Session

Run setup-planning-session.py with the spec file, plugin root, review mode, and
optionally the session ID:
```bash
uv run {plugin_root}/scripts/checks/setup-planning-session.py \
  --file "<file_path>" \
  --plugin-root "{plugin_root}" \
  --review-mode "{review_mode}"
```

If `DEEP_SESSION_ID` is available in your context, you MAY append:
```bash
  --session-id "{DEEP_SESSION_ID}"
```
This is optional in Codex. The setup script now auto-falls back to a file-based
workflow when no Claude task list/session ID is available.

Note: `review_mode` is from Step 2. If LLMs are available, use `external_llm` (or omit the flag).

**Parse the JSON output:**

This script:
1. Validates the spec file exists and has content
2. Creates `deep_plan_config.json` in the planning directory with `plugin_root`, `planning_dir`, and `initial_file`
3. Detects whether this is a new or resume session
4. Returns `workflow_backend = "task_list"` when a Claude task list is available and writes task files directly to `~/.claude/tasks/<task_list_id>/`
5. Returns `workflow_backend = "file_based"` when no task list is available and uses only planning-directory state
6. If `sections/index.md` exists and task-list mode is active, also writes section tasks

**If `success == false`:** The script failed validation. Display the error and stop:
```
═══════════════════════════════════════════════════════════════
DEEP-PLAN: Setup Failed
═══════════════════════════════════════════════════════════════
Error: {error}

Please fix the issue and re-run: /deep-plan @path/to/your-spec.md
═══════════════════════════════════════════════════════════════
```
**Do not continue. Wait for user to fix the issue and re-invoke.**

Common errors:
- "Spec file not found" → User provided a path to a file that doesn't exist
- "Spec file is empty" → User provided an empty file with no content
- "Expected a spec file, got a directory" → User provided a directory path instead of a file

**Handle conflict (if present):**

If `conflict` is present in output, this means `CLAUDE_CODE_TASK_LIST_ID` was set and the task list already has tasks. Use `AskUserQuestion`:
- Question: "CLAUDE_CODE_TASK_LIST_ID is set to '{task_list_id}' which already contains {existing_task_count} tasks. Proceeding will overwrite these tasks with the deep-plan workflow. Continue?"
- Options:
  - "Proceed and overwrite existing tasks" - Re-run with `--force` flag
  - "Exit" - Stop here, user can unset CLAUDE_CODE_TASK_LIST_ID and retry

If user chooses "Exit": Stop and tell user to `unset CLAUDE_CODE_TASK_LIST_ID`
If user chooses "Proceed": Re-run setup-planning-session.py with `--force` flag added.

**Workflow backend handling:**

- If `workflow_backend == "task_list"`:
  - Run `TaskList` to verify the workflow tasks are visible
  - The output `tasks_written` shows how many task files were written
- If `workflow_backend == "file_based"`:
  - Do **not** run `TaskList`
  - Treat the setup JSON output plus `<planning_dir>/deep_plan_config.json` as the source of truth

**Reading session context:**

Prefer values from the setup JSON output:
- `plugin_root`
- `planning_dir`
- `initial_file`
- `review_mode`
- `workflow_backend`

If you need to recover later, read them from `<planning_dir>/deep_plan_config.json`.

Print status:
```
Planning directory: {planning_dir}
Mode: {mode}
Workflow backend: {workflow_backend}
```

If `mode == "resume"`:
```
Resuming from step {resume_from_step}
To start fresh, delete the planning directory files.
```

If resuming, **skip to step {resume_from_step}** in the workflow below.

---

### Workflow

**Note:** All scripts use `{plugin_root}` from step 1's validate-env.sh output.

### 6. Research Decision

Read `{plugin_root}/skills/deep-plan/references/research-protocol.md` for details.

1. Read the spec file from `initial_file` (from setup output or `deep_plan_config.json`)
2. Extract potential research topics from the spec content (technologies, patterns, integrations)
3. Ask user about codebase research needs (existing code to analyze?)
4. Ask user about web research needs (present derived topics as multi-select options)
5. Record which research types to perform in step 7

**Always include testing** - either research existing test setup (codebase) or ask about preferences (new project).

### 7. Execute Research

Read `{plugin_root}/skills/deep-plan/references/research-protocol.md` for details.

Based on decisions from step 6, launch research subagents:
- **Codebase research:** `Task(subagent_type=Explore)`
- **Web research:** `Task(subagent_type=web-search-researcher)`

If both are needed, launch both Task tools in parallel (single message with multiple tool calls).

**Important:** Subagents return their findings - they do NOT write files directly. After collecting results from all subagents, combine them and write to `<planning_dir>/claude-research.md`.

Skip this step entirely if user chose no research in step 6.

### 8. Detailed Interview

Read `{plugin_root}/skills/deep-plan/references/interview-protocol.md` for details.

Run in main context (AskUserQuestion requires it). The interview should be informed by:
- The initial spec (from `initial_file`)
- Research findings (from step 7, if any research was done)

### 9. Save Interview Transcript

Write Q&A to `<planning_dir>/claude-interview.md`

### 10. Write Initial Spec

Combine into `<planning_dir>/claude-spec.md`:
- **Initial input** (read the file at `initial_file`)
- **Research findings** (if step 7 was done)
- **Interview answers** (from step 8)

This synthesizes the user's raw requirements into a complete specification.

### 11. Generate Implementation Plan

Read `{plugin_root}/skills/deep-plan/references/plan-writing.md` before writing anything.

Create detailed plan → `<planning_dir>/claude-plan.md`

**CRITICAL CONSTRAINTS** (from plan-writing.md):
- Plans are **prose documents**, not code
- **ZERO full function implementations** - that's deep-implement's job

Write for an unfamiliar reader. The plan must be fully self-contained - an engineer or LLM with no prior context should understand *what* we're building, *why*, and *how* just from reading this document. But it does not need to see full code implementations

### 12. Context Check (Pre-External Review)

Run:
```bash
uv run {plugin_root}/scripts/checks/check-context-decision.py \
  --planning-dir "<planning_dir>" \
  --upcoming-operation "External LLM Review"
```

Read `{plugin_root}/skills/deep-plan/references/context-check.md` for handling the output.

- If user chooses "Continue", proceed to step 13
- If user chooses "/clear + re-run", they will restart with fresh context (file-based recovery resumes here)

### 13. External LLM Review

Read `{plugin_root}/skills/deep-plan/references/external-review.md` for the full protocol.

Check `review_mode` from setup output or `<planning_dir>/deep_plan_config.json` and follow the appropriate path:
- `external_llm` → Run review.py script
- `opus_subagent` → Launch opus-plan-reviewer subagent
- `skip` → Skip to step 16

### 14. Integrate External Feedback

Analyze the suggestions in `<planning_dir>/reviews/`.

Remember that you are the authority on what to integrate or not. It's OK if you decide to not integrate anything.

**Step 1:** Write `<planning_dir>/claude-integration-notes.md` documenting:
- What suggestions you're integrating and why
- What suggestions you're NOT integrating and why

**Step 2:** Update `<planning_dir>/claude-plan.md` with the integrated changes.

### 15. User Review of Integrated Plan

Use AskUserQuestion:
```
The plan has been updated with external feedback. You can now review and edit claude-plan.md.

If you want Claude's help editing the plan, open a separate Claude session - this session
is mid-workflow and can't assist with edits until the workflow completes.

When you're done reviewing, select "Done" to continue.
```

Options: "Done reviewing"

Wait for user confirmation before proceeding.

### 16. Apply TDD Approach

Read `{plugin_root}/skills/deep-plan/references/tdd-approach.md` for details.

Verify testing context exists in `claude-research.md`. If missing, research (existing codebase) or recommend (new project). 

Create `claude-plan-tdd.md` mirroring the plan structure with test stubs for each section.

### 17. Context Check (Pre-Section Split)

Run:
```bash
uv run {plugin_root}/scripts/checks/check-context-decision.py \
  --planning-dir "<planning_dir>" \
  --upcoming-operation "Section splitting"
```

Read `{plugin_root}/skills/deep-plan/references/context-check.md` for handling the output.

- If user chooses "Continue", proceed to step 18
- If user chooses "/clear + re-run", they will restart with fresh context (file-based recovery resumes here)

### 18. Create Section Index

Read `{plugin_root}/skills/deep-plan/references/section-index.md` for details.

Read `claude-plan.md` and `claude-plan-tdd.md`. Identify natural section boundaries and create `<planning_dir>/sections/index.md`.

**CRITICAL:** index.md MUST start with a SECTION_MANIFEST block. See the reference for format requirements and examples.

Write `index.md` before proceeding to section file creation.

### 19. Generate and Write Section Tasks

This step depends on `workflow_backend`.

If `workflow_backend == "task_list"`, run generate-section-tasks.py to write section tasks directly to disk:
```bash
uv run {plugin_root}/scripts/checks/generate-section-tasks.py \
  --planning-dir "<planning_dir>"
```

If `DEEP_SESSION_ID` is available, you MAY append:
```bash
  --session-id "{DEEP_SESSION_ID}"
```

Handle task-list mode results:
- If `success == false`: Read `error` and fix the issue (common: missing/invalid SECTION_MANIFEST in index.md). Re-run until successful.
- If `state == "complete"`: All sections already written, skip to Final Verification.
- Otherwise: Tasks were written successfully. Run `TaskList` to verify the updated task structure.

If `workflow_backend == "file_based"`, do not generate task files. Instead validate section state directly:
```bash
uv run {plugin_root}/scripts/checks/check-sections.py \
  --planning-dir "<planning_dir>"
```

Handle file-based mode results:
- If `state == "fresh"`: index.md is missing — return to Step 18.
- If `state == "invalid_index"`: fix `sections/index.md` and re-run this step.
- If `state == "complete"`: all sections already exist — skip to Final Verification.
- If `state == "has_index"` or `state == "partial"`: proceed to Step 20.

### 20. Write Section Files (Parallel Subagents)

Read `{plugin_root}/skills/deep-plan/references/section-splitting.md` for the execution loop that matches `workflow_backend`.

In both backends:
1. Run `generate-batch-tasks.py --batch-num N` → get JSON with `prompt_files`
2. Launch Task calls for ALL prompt files in a single message (parallel execution)
3. **Wait for all subagents to complete**
4. **Verify section files were written**
5. Re-run `check-sections.py` (or inspect the task list in task-list mode) to determine what remains
6. Continue with the next batch until `check-sections.py` reports `state == "complete"`

**Validation After Each Batch:**

Hooks execute in isolation - Claude doesn't see success/failure. After subagents complete:

```bash
ls {planning_dir}/sections/section-*.md | wc -l
```

Compare count to expected sections. If any files are missing:
1. Re-run the missing section's subagent
2. If still failing, fall back to manual: parse subagent response JSON and Write the file

### 21. Final Status & Cleanup

Verify all section files were created successfully by running `check-sections.py` one final time. Confirm state is "complete".

### 22. Output Summary

Print generated files and next steps.

---

## Resuming After Compaction

**CRITICAL:** When resuming this workflow after context compaction, the detailed instructions from this file are lost. Planning files plus `deep_plan_config.json` are the source of truth. A task list may exist, but it is optional in file-based Codex mode. Follow these rules:

1. **ALWAYS read the reference file for your current step before proceeding**
   - Task descriptions include hints like "(read section-index.md)" - follow them
   - Reference files are in `{plugin_root}/skills/deep-plan/references/`
   - Get `plugin_root` from setup output or `<planning_dir>/deep_plan_config.json`

2. **NEVER skip steps** - follow the inferred workflow state in order
   - Re-run `setup-planning-session.py` on the same spec file to recover `resume_from_step`
   - If task-list mode is active and a task says "Run generate-section-tasks.py", run the script
   - If file-based mode is active, rely on `check-sections.py` and existing artifacts instead of task IDs
   - You can always re-read in the /deep-plan skill if unsure

3. **If message says "MISSING PREREQUISITE"** - a required file is missing but later files exist
   - This means a step was skipped but later steps ran anyway
   - Resume from the indicated step and **OVERWRITE any subsequent files**
   - Example: if `claude-plan-tdd.md` is missing but `sections/index.md` exists, create the TDD plan, then recreate the index (the old index was made without TDD context)

4. **Key reference files by step:**
   - Step 6-7: `research-protocol.md`
   - Step 8: `interview-protocol.md`
   - Step 11: `plan-writing.md`
   - Step 13: `external-review.md`
   - Step 16: `tdd-approach.md`
   - Step 18: `section-index.md` (CRITICAL - has required format)
   - Step 20: `section-splitting.md` (subagent workflow)
