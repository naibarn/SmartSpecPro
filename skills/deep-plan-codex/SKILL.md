---
name: deep-plan-codex
description: Creates detailed, sectionized, TDD-oriented implementation plans in Codex using a file-based workflow (no Claude TaskList dependency). Use when planning complex features that need thorough pre-implementation analysis.
license: MIT
compatibility: Requires uv (Python 3.11+). Review runs automatically: external LLM when credentials are available, otherwise self-review fallback.
---

# Deep Planning Skill (Codex)

Codex-adapted workflow: Research -> Interview -> Automated Review -> TDD Plan -> Section Split.

This skill is a conversion of `deep-plan` to run without Claude-only task features.

## CRITICAL: First Actions

### 1) Print Intro and Validate Environment

Print this banner first:

```text
⚠️  CONTEXT WARNING: This workflow is token-intensive. Consider compacting first.

═══════════════════════════════════════════════════════════════
DEEP-PLAN (CODEX): AI-Assisted Implementation Planning
═══════════════════════════════════════════════════════════════
Research -> Interview -> Automated Review -> TDD Plan
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

### 2) Handle Environment Errors and Resolve Review Mode

If `valid == false`:
- show errors to user
- stop only on critical errors:
  - `uv not installed`
  - plugin root cannot be resolved

Review is mandatory and automatic:
- If any external review credential is available (`gemini_auth` or `openai_auth`), set `review_mode=external_llm`.
- If external credentials are missing/invalid, set `review_mode=self_review` automatically.
- Do not ask user to choose between external vs self review.

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
- `files_found`

If `success == false`, show error and stop.

Status message format:

```text
Planning directory: {planning_dir}
Mode: {mode}
```

If `mode == "resume"`, continue from `resume_from_step`.

Persist selected review mode:
- Write `<planning_dir>/review-mode.md` with chosen mode and reason.

Artifact naming compatibility:
- Canonical artifacts use neutral names (`research-notes.md`, `interview-notes.md`, `implementation-spec.md`, `implementation-plan.md`, etc.).
- If session output reports pre-existing legacy-named artifacts in `files_found`, treat them as valid equivalents.
- When updating existing plans, continue editing the artifact set already present in that planning directory to avoid split histories.

### 4.1) Existing Plan Detection and Planning Intent (Required on Resume/Existing Plan)

Detect existing planning artifacts in `<planning_dir>`:
- `implementation-plan.md`
- `implementation-plan-tdd.md`
- `sections/index.md`

If any exist (or `mode == "resume"`), resolve planning intent:
- If `<planning_dir>/planning-intent.md` already exists and user did not request changing it this turn, reuse it and do not ask again.
- Otherwise ask user with a single-choice prompt:
  - `resume_progress` = Resume from current progress
  - `improve_existing_plan` = Improve existing plan (Recommended when requirements changed)
  - `rebuild_from_spec` = Rebuild plan from spec (archive old plan files first)

Write selection to:
- `<planning_dir>/planning-intent.md`

Use values:
- `resume_progress`
- `improve_existing_plan`
- `rebuild_from_spec`

If `planning_intent == improve_existing_plan`:
- run a fresh interview round focused on deltas and unresolved decisions
- allow user to answer previous questions again (full or delta scope)
- write transcript to `<planning_dir>/interview-refresh.md`
- merge/append into `<planning_dir>/interview-notes.md` with clear timestamps
- regenerate downstream artifacts from step 10 onward (`implementation-spec.md`, `implementation-plan.md`, reviews, TDD plan, sections)

If `planning_intent == rebuild_from_spec`:
- archive existing plan artifacts into `<planning_dir>/archive/<timestamp>/`
- restart generation from step 6 with current spec and latest interview answers

### 5) Decision Style Handshake (Required)

Before running step 6+, resolve decision style:
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

## Workflow

All generated files are saved in `planning_dir`.

## Decision Policy (Applies to All Steps)

Whenever a step has multiple valid implementation options:

1) Evaluate option impact first:
- `high-impact`: architecture, data model, migration/destructive behavior, security posture changes, major UX behavior changes, large scope/cost changes.
- `low-impact`: formatting, ordering, naming, minor reversible process choices.

2) Apply `decision_mode`:
- `ask_every_choice`:
  - always ask user with numbered options.
- `smart_auto`:
  - ask user for `high-impact` options.
  - auto-decide `low-impact` options with concise rationale.
- `auto_by_default`:
  - auto-decide both low/high impact.
  - ask user only if destructive/irreversible risk is present or confidence is low.

3) Always log decisions:
- Write/update `<planning_dir>/decision-log.md` with:
  - step
  - options considered
  - decision taken
  - mode used (`asked` or `auto`)
  - rationale

4) Adaptive preference:
- If user repeatedly responds with quick numeric confirmations, bias toward more automation within current mode.
- If user requests more control/detail, bias toward more prompts.
- User can override anytime with:
  - `ask mode`
  - `smart auto`
  - `auto mode`

## Question UX Rules (Required)

When asking users for decisions or interview refresh input:
- Ask one compact prompt at a time for related fields (avoid multi-message repetition).
- Never use nested numbered option lists (this causes confusing duplicate numbering).
- Prefer option codes/keywords (`full`, `delta`, `keep`, `all`) over sub-numbering.
- Reuse previously answered values from planning files; do not ask the same field twice unless user asked to revise it.
- If some fields are already known, ask only unresolved fields.
- For improvement mode, use a single response template in one message.

## Two-Stage Question Flow (Required)

Use strictly separated questioning phases:

### Stage A: Early Intake (Before rewriting plan artifacts)
- Goal: collect only inputs needed to update scope/direction.
- Ask in step-by-step order:
  1. `answer_mode` (`full` | `delta` | `keep`)
  2. `changes` (what changed from current plan)
  3. `gaps` (what is missing/weak)
  4. `focus` (`security` | `migration` | `tests` | `all`)
- Do not ask recommendation/application decisions in Stage A.

### Stage B: Late Uplift Decisions (After writing `implementation-plan.md`)
- Goal: present recommended improvements and let user decide adoption.
- Ask only after `plan-uplift.md` exists.
- Present a concise recommended list first, then ask decision:
  - apply all
  - select items
  - keep current plan
- If `decision_mode` is auto-capable, auto-apply low-impact items and ask only high-impact items.

Transition rule:
- Complete Stage A intake before plan rewrite.
- Complete Stage B decisions before proceeding to review integration.

## Parallel Execution Policy (Codex)

Use `multi_tool_use.parallel` automatically when operations are independent and low-risk.

### A) Auto-Parallel (use `multi_tool_use.parallel`)
- Read-only repository discovery:
  - file listing, text search, reading docs/code, git read-only inspection.
- Independent analysis checks that do not mutate shared state.
- Running multiple web searches in parallel when web research is selected.

### B) Do NOT Parallelize (run sequentially)
- Any file writes/edits.
- Planning artifacts generation and updates (`*.md` planning artifacts, `sections/*.md`).
- Git write operations (`add`, `commit`, `merge`, branch changes).
- DB/schema operations or migration commands.
- Any operation where ordering affects correctness.

### C) Risk Rule
- If uncertain whether tasks are independent, treat as risky and run sequentially.
- If parallel execution causes contention or inconsistent findings, rerun sequentially and log rationale in `<planning_dir>/decision-log.md`.

### 6) Research Decision (Mandatory Baseline)

Read `references/research-protocol.md`.

Planning must always perform research before plan writing.

Mandatory baseline research:
- codebase structure and architecture patterns
- affected modules/services and integration touchpoints
- testing setup and current coverage in impacted areas
- schema/table dependencies and data flow for impacted features
- existing tenant/security constraints in touched paths

Additional research (decision policy applies):
- targeted web research for uncertain standards, security hardening, migration patterns, or framework best practices

If the user requests fast-track planning, keep baseline research mandatory and reduce only optional web research scope.

### 7) Execute Research

If codebase research selected:
- inspect repository structure, existing services, schemas, and tests
- summarize findings

If web research selected:
- run web research and summarize sources

Execution guidance:
- Use `multi_tool_use.parallel` for independent read-only tasks.
- Keep all file writes sequential and centralized in parent flow.
- If research signals migration or data-risk, explicitly flag this in research output.

Write combined output to:
- `<planning_dir>/research-notes.md`

### 8) Detailed Interview

Read `references/interview-protocol.md`.

Run Q&A in main thread. Keep questions concrete and implementation-oriented.

If `planning_intent == improve_existing_plan`:
- include change-focused questions first (what changed, what failed, what is missing)
- run Stage A intake prompt (single message) using this template:
  - `answer_mode`: `full` | `delta` | `keep`
  - `changes`: `<what changed>`
  - `gaps`: `<what is missing/weak>`
  - `focus`: `security` | `migration` | `tests` | `all`
- reflect this choice in interview transcript and decision log

### 9) Save Interview Transcript

Write:
- `<planning_dir>/interview-notes.md`

### 10) Write Initial Spec

Synthesize into:
- `<planning_dir>/implementation-spec.md`

Use:
- original input spec file
- `research-notes.md` (if created)
- interview answers

### 11) Generate Implementation Plan

Read `references/plan-writing.md`.

Write:
- `<planning_dir>/implementation-plan.md`

Hard constraints:
- prose only
- no full function/class implementations

Required risk and safety content in `implementation-plan.md`:
- Impact map for existing features likely to regress.
- Regression prevention strategy (tests, canary/rollout, monitoring, ownership).
- Data safety strategy for any DB-impacting change:
  - explicit risk classification (`none` / `low` / `high`).
  - pre-migration backup plan when risk is not `none`.
  - restore/rollback runbook with trigger conditions and verification.
  - non-destructive migration-first approach (`expand -> migrate/backfill -> contract`).
  - automated migration/backfill steps and post-migration consistency checks.
- Compatibility notes so existing functionality continues working unless explicitly changed.
- If no DB risk exists, plan must state why backup/restore is not required for this scope.

### 11.1) Plan Quality Uplift Checkpoint (Required)

Immediately after creating `implementation-plan.md`, run a quality-uplift pass.

Create:
- `<planning_dir>/plan-uplift.md`

Uplift checklist:
- missing edge cases or failure-mode handling
- unclear acceptance criteria or weak verification scope
- rollout/rollback gaps
- migration/backfill/data integrity gaps
- security hardening and tenant-isolation gaps
- backward-compatibility and regression-risk gaps
- observability/monitoring/alerting gaps

For each uplift item include:
- severity (`high` / `medium` / `low`)
- impact (`high-impact` / `low-impact`)
- rationale
- concrete plan delta to apply

Then present uplift items to user and ask whether to apply:
1. `Apply all recommended uplifts`
2. `Select uplifts to apply`
3. `Keep current plan`

This is Stage B question flow:
- show recommended uplift items first (short list)
- then ask the single adoption decision
- only ask follow-up selection details if user chose option 2

Write decision and applied changes to:
- `<planning_dir>/plan-uplift-decisions.md`

If user accepts any item, update:
- `<planning_dir>/implementation-plan.md`

### 12) Context Check (Pre-Automated Review)

Run:

```bash
uv run {plugin_root}/scripts/checks/check-context-decision.py \
  --planning-dir "<planning_dir>" \
  --upcoming-operation "Automated Review"
```

If response action is `prompt`, ask user:
1. Continue
2. `/clear + re-run`

If user chooses clear/re-run, stop here.

### 13) Automated Review (Always Required)

Read `references/external-review.md`.

Follow `review_mode`:
- `external_llm`:
  - run:
    ```bash
    uv run {plugin_root}/scripts/llm_clients/review.py --planning-dir "<planning_dir>" --iteration 1
    ```
  - collect files in `<planning_dir>/reviews/`
  - if external review execution fails or produces no usable review file, fallback immediately to `self_review`
- `self_review`:
  - produce `<planning_dir>/reviews/iteration-1-self-review.md`

After review generation, always produce:
- `<planning_dir>/reviews/iteration-1-summary.md`

Summary requirements:
- list concrete improvements (severity: `high` / `medium` / `low`)
- include rationale and affected area
- include recommended action
- mark each item as `high-impact` or `low-impact` for decision handling

### 14) Integrate Review Feedback

Create:
- `<planning_dir>/integration-notes.md`
- `<planning_dir>/review-actions.md`

Document:
- accepted suggestions and rationale
- rejected suggestions and rationale

For each review improvement item, apply decision handling via `decision_mode`:
- `ask_every_choice`: ask user for every item.
- `smart_auto`: ask user for `high-impact` items, auto-decide `low-impact` items with rationale.
- `auto_by_default`: auto-decide all items unless destructive/irreversible risk exists.

Always present review improvement summary to user before proceeding, including:
- what was auto-applied
- what needs user decision
- what was deferred and why

Update:
- `<planning_dir>/implementation-plan.md`

### 15) User Review Checkpoint

Ask user to review `implementation-plan.md` and confirm:
- `Done reviewing`

Wait for confirmation before continuing.

### 16) Apply TDD Approach

Read `references/tdd-approach.md`.

Create:
- `<planning_dir>/implementation-plan-tdd.md`

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
3. Check `<planning_dir>/planning-intent.md` if present; otherwise ask planning intent again when existing plan artifacts are found
4. Continue from the earliest missing prerequisite step
5. If prerequisites are missing but downstream files exist, regenerate downstream files
6. If intent is `improve_existing_plan`, re-run interview refresh and regenerate from step 10 onward

Priority reference files:
- `references/research-protocol.md`
- `references/interview-protocol.md`
- `references/plan-writing.md`
- `references/external-review.md`
- `references/tdd-approach.md`
- `references/section-index.md`
- `references/section-splitting.md`
