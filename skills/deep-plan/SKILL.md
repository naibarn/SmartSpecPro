---
name: deep-plan
description: Creates detailed, sectionized, TDD-oriented implementation plans in Codex using a file-based workflow (no Claude TaskList dependency). Use when planning complex features that need thorough pre-implementation analysis.
license: MIT
compatibility: "Requires uv (Python 3.11+). Review runs automatically: external LLM when credentials are available, otherwise self-review fallback."
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

Then perform a lightweight environment check directly:

```bash
command -v uv >/dev/null && echo "uv: available" || echo "uv: missing"
[ -n "${GEMINI_API_KEY:-}" ] && echo "gemini_auth: yes" || echo "gemini_auth: no"
[ -n "${OPENAI_API_KEY:-}" ] && echo "openai_auth: yes" || echo "openai_auth: no"
```

Store:
- `gemini_auth` (`yes` / `no`)
- `openai_auth` (`yes` / `no`)
- `valid` (`uv` available)

### 2) Handle Environment Errors and Resolve Review Mode

If `valid == false`:
- show errors to user
- stop on the critical error `uv not installed`

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
  /deep-plan @path/to/your-spec.md
═══════════════════════════════════════════════════════════════
```

Stop and wait for re-invocation.

### 4) Setup Planning Session (Codex Mode)

Determine the planning directory manually:

- If the input file is named `spec.md`, use its parent directory as `<planning_dir>`
- Otherwise use `<spec_dir>/<spec_stem>.plan/` as `<planning_dir>`
- Create `<planning_dir>` and `<planning_dir>/reviews/` if they do not exist

Infer session state from files already present in `<planning_dir>`:
- `mode = "resume"` if any canonical planning artifacts already exist
- otherwise `mode = "new"`
- `resume_from_step` is the first incomplete stage in this order: `research-notes.md`, `interview-notes.md`, `implementation-spec.md`, `implementation-plan.md`, `reviews/iteration-1-summary.md`, `implementation-plan-tdd.md`, `sections/index.md`

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
- If the planning directory contains pre-existing legacy-named artifacts, treat them as valid equivalents.
- On resume with legacy-only artifacts, canonicalize to neutral names first:
  - `claude-research.md` -> `research-notes.md`
  - `claude-interview.md` -> `interview-notes.md`
  - `claude-spec.md` -> `implementation-spec.md`
  - `claude-plan.md` -> `implementation-plan.md`
  - `claude-plan-tdd.md` -> `implementation-plan-tdd.md`
  - `claude-integration-notes.md` -> `integration-notes.md`
- Update intra-plan references after canonicalization so generated outputs keep using neutral names.
- Keep backward compatibility in tooling by accepting both name sets for discovery/resume.

### 4.1) Existing Plan Detection and Planning Intent (Required on Resume/Existing Plan)

Detect existing planning artifacts in `<planning_dir>`:
- `implementation-plan.md`
- `implementation-plan-tdd.md`
- `sections/index.md`

If any exist (or `mode == "resume"`), resolve planning intent automatically:
- If `<planning_dir>/planning-intent.md` already exists and user did not request changing it this turn, reuse it.
- Otherwise infer intent from the current codebase + spec state:
  - `resume_progress` when the existing plan is still aligned and only incomplete
  - `improve_existing_plan` when the spec/requirements changed materially but the current plan is still worth evolving
  - `rebuild_from_spec` only when existing artifacts are internally inconsistent or the user explicitly asked to discard and rebuild
- Ask the user only before destructive archival/reset (`rebuild_from_spec`) or when product intent is ambiguous.

Write the chosen intent to:
- `<planning_dir>/planning-intent.md`

Use values:
- `resume_progress`
- `improve_existing_plan`
- `rebuild_from_spec`

If `planning_intent == improve_existing_plan`:
- run a fresh interview round focused on deltas and unresolved product constraints
- reuse previous answers automatically where they still fit the current codebase
- write transcript to `<planning_dir>/interview-refresh.md`
- merge/append into `<planning_dir>/interview-notes.md` with clear timestamps
- regenerate downstream artifacts from step 10 onward (`implementation-spec.md`, `implementation-plan.md`, reviews, TDD plan, sections)

If `planning_intent == rebuild_from_spec`:
- archive existing plan artifacts into `<planning_dir>/archive/<timestamp>/`
- restart generation from step 6 with current spec and latest interview answers

### 5) Decision Style Handshake (Autonomous by Default)

Before running step 6+, resolve decision style:
- If `<planning_dir>/decision-mode.md` exists and user did not request changing mode this turn, reuse it.
- Otherwise default to `auto_by_default` and write it immediately.
- Switch away from `auto_by_default` only if the user explicitly asks for tighter control this turn.

Store as `decision_mode` for this run and write:
- `<planning_dir>/decision-mode.md`

Use values:
- `ask_every_choice` (only on explicit user request)
- `smart_auto`
- `auto_by_default` (default)

## Workflow

All generated files are saved in `planning_dir`.

## Decision Policy (Applies to All Steps)

Whenever a step has multiple valid options:

1) Evaluate option impact first:
- `high-impact`: architecture, data model, migration/destructive behavior, security posture changes, major UX behavior changes, large scope/cost changes.
- `low-impact`: formatting, ordering, naming, minor reversible process choices.

2) Default to codebase-first autonomous decisions:
- Prefer the option that matches existing repository conventions, minimizes diff surface, preserves tests/contracts, and keeps rollback simple.
- Use current dependencies, file patterns, and established interfaces as the primary tie-breakers.
- Treat purely technical tradeoffs as planner-owned decisions; do not ask the user to choose among them unless they explicitly requested control.

3) Apply `decision_mode`:
- `ask_every_choice`: ask only because the user explicitly requested that mode.
- `smart_auto`: auto-decide technical options; ask only for product/scope/destructive decisions.
- `auto_by_default`: auto-decide all technical options; ask only if destructive/irreversible risk is present, product intent is ambiguous, or confidence is genuinely low.

4) Always log decisions:
- Write/update `<planning_dir>/decision-log.md` with:
  - step
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

6) Execution autonomy:
- Do not ask the user for permission to inspect the codebase, search files, run safe read-only shell commands, or perform web research that is needed to produce a correct plan.
- These are planner-owned execution steps and should happen automatically.
- Ask only for destructive/irreversible actions, accepted-risk security bypasses, explicit cost/budget constraints, or genuine product ambiguity.

7) Git/GitHub recovery bias:
- Treat git history and the GitHub-backed repository as the default recovery path for plan artifacts and repo-local changes.
- Do not pause just because a plan rewrite might later need rollback; keep the workflow recoverable and continue.
- Ask only when the next action would discard work in a way git/GitHub cannot safely recover or when external state outside the repo is at risk.

8) Backup-first data safety:
- If a proposed implementation path introduces data-loss risk, require a concrete dump/export/copy backup step in the plan before the risky operation.
- Prefer timestamped file backups with an explicit restore path.
- Do not turn backup creation into a user confirmation gate; create the backup plan automatically and continue.
- Use `../BACKUP-PLAYBOOK.md` for naming, logging, and command patterns when the plan needs a backup section.

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

### 6) Mandatory Codebase Recon (Before Plan Writing)

Read `references/research-protocol.md`.

Before any planning artifacts are written, always run repository research for impacted areas:
- existing architecture and module boundaries
- touched routers/services/components and integration touchpoints
- existing tests and coverage gaps in impacted paths
- database schema/table dependencies and migration risk
- tenant attribution, permission checks, and security controls in current code

Execution rules:
- Use `multi_tool_use.parallel` for independent read-only discovery tasks.
- Keep all file writes sequential.
- If destructive or data-loss risk is detected, mark it explicitly.

Write findings to:
- `<planning_dir>/research-notes.md` (section: `Codebase Recon`)

### 7) Mandatory Web Research Topic Selection + Execution

After step 6, derive a focused list of web research topics from:
- spec scope
- codebase recon findings
- known uncertainty/risk areas (security, migration, compatibility, performance, UX)

Then present a concise multi-select prompt to user with numbered options (single-level list only):
- allow selecting multiple topics
- allow `apply_all`
- allow `skip` when user wants no additional web research

Required behavior:
- Do not skip topic proposal; always show candidate topics first.
- If user selects any topic, run web research and capture sources with short rationale per topic.
- If user selects `skip`, continue with codebase findings only and record that decision.

Write/append output to:
- `<planning_dir>/research-notes.md` (section: `Web Research`)

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

Use the manual context-check protocol in `references/context-check.md` for the upcoming operation `Automated Review`.

If the protocol says to prompt the user, ask:
1. Continue
2. `/clear + re-run`

If user chooses clear/re-run, stop here.

### 13) Automated Review (Always Required)

Read `references/external-review.md`.

Follow `review_mode`:
- `external_llm`:
  - use any available external LLM in the current environment to produce `<planning_dir>/reviews/iteration-1-external-review.md`
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

Always present a short review improvement summary in the notes, including:
- what was auto-applied
- what was deferred and why
- what would need explicit user input only if product intent is ambiguous

Update:
- `<planning_dir>/implementation-plan.md`

### 15) Optional User Review Checkpoint

Summarize the plan changes and continue automatically.

Only pause for explicit user review if:
- the user asked to inspect the plan before TDD splitting
- unresolved product-direction ambiguity remains
- the next step would archive, discard, or materially rewrite prior artifacts

### 16) Apply TDD Approach

Read `references/tdd-approach.md`.

Create:
- `<planning_dir>/implementation-plan-tdd.md`

Mirror plan structure with test stubs and verification criteria.

### 17) Context Check (Pre-Section Split)

Use the manual context-check protocol in `references/context-check.md` for the upcoming operation `Section splitting`.

If prompted, continue automatically unless the context state looks genuinely unsafe; only then pause and offer `/clear + re-run`.

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

Verify section state manually:
- every section listed in `sections/index.md` has a matching file in `<planning_dir>/sections/`
- the file count matches the manifest
- no section file is left empty or contains unresolved placeholder text

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
