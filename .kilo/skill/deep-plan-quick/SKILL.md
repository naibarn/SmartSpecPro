---
name: deep-plan-quick
description: Creates lightweight, file-based implementation plans directly from a short request or optional markdown brief. Use for small/medium tasks that still need rigorous planning but do not require the full deep-plan spec-first pipeline.
license: MIT
compatibility: Compatible mode by default. Works in Codex and Claude without requiring Claude task lists or session hooks.
---

# Deep Plan Quick

`deep-plan-quick` is the compact, file-first planner for tasks that are still plan-worthy but do not justify the full `deep-plan` workflow.

It should produce artifacts that are directly consumable by `deep-implement` without any host-specific glue.

## Compatibility Model

`deep-plan-quick` is compatible-mode only.

That means:
- planning state lives in files
- outputs must be resumable from disk
- do not depend on Claude task lists, SessionStart hooks, or host-specific workflow primitives
- design outputs so Codex and Claude can both execute the follow-up implementation flow

## Output Contract

Produce a compact but implementation-safe planning package:
- `<planning_dir>/request.md`
- `<planning_dir>/research-notes.md`
- `<planning_dir>/decision-log.md`
- `<planning_dir>/implementation-plan.md`
- `<planning_dir>/implementation-plan-tdd.md`
- `<planning_dir>/sections/index.md`
- `<planning_dir>/sections/section-*.md`

These files are the source of truth.

## Input Modes

This skill accepts either:
- a markdown file path such as `@brief.md`, `@spec.md`, or `@request.md`
- a short free-form user request with no file

If no file is provided, create one before planning starts.

## Planning Directory Resolution

Determine `<planning_dir>` like this:
- if input file is `spec.md`, `brief.md`, or `request.md`, use its parent directory when that is clearly the intended planning home
- otherwise create `specs/quick/NNN-slug/`
- always create `<planning_dir>/sections/`

If no file exists yet, write `<planning_dir>/request.md` containing:
- original user request
- assumptions inferred from the repository
- unresolved product questions only when they are truly necessary

## Autonomy Policy

Default to `auto_by_default`.

Do not stop for technical choices unless:
- product intent is genuinely ambiguous
- a destructive or irreversible decision is required
- two options materially change scope, architecture, or user-visible behavior

Prefer the approach that best matches the current codebase.

## Confirmation Policy

Do not interrupt the workflow for routine confirmations.

Never pause just to ask permission for:
- read-only shell commands such as `sed`, `cat`, `rg`, `find`, `git status`, `git diff`
- ordinary file creation or edits inside the planning directory
- research, scan, validation, or self-review steps that are part of the workflow
- extra revision rounds needed to stabilize the plan

Only pause when:
- the user must choose between materially different product outcomes
- an operation is destructive, irreversible, or security-sensitive
- automatic promotion from quick-plan to full `deep-plan` would change scope in a non-obvious way

## Review Policy

`deep-plan-quick` should revise its own work before considering the plan complete.

Minimum standard:
- run at least 5 review/revision rounds
- allow up to 7 rounds when findings keep appearing
- each round must explicitly check completeness, contradictions, security/abuse cases, and "what obvious improvement is still missing?"
- stop only after 2 consecutive rounds with no meaningful `[AUTO-FIX]` items

This applies even to small plans. Small scope is not a reason to skip stabilization.

## Workflow

### 1. Normalize the Request

Create a concise planning brief from the available input.

Include:
- task summary
- likely affected areas
- constraints
- assumptions
- explicit non-goals when obvious

Write:
- `<planning_dir>/request.md`

### 2. Mandatory Lightweight Research

Always research before planning:
- codebase pattern scan
- impacted module and test scan
- dependency and config scan
- security, auth, tenant, permission, or data-boundary scan if relevant
- targeted web research only for unstable, version-sensitive, or unfamiliar topics

Write:
- `<planning_dir>/research-notes.md`

If the task is clearly larger than expected during research, promote it to full `deep-plan`.

### 3. Choose Planning Depth

Choose one of these automatically:

- `micro`
  - 1-2 section files
  - compact TDD guidance
  - used for tightly scoped changes

- `standard`
  - 2-5 section files
  - normal `implementation-plan-tdd.md`
  - used for most small/medium feature work

- `promote`
  - switch to full `deep-plan`
  - used when the request is actually large, cross-domain, architecture-heavy, or too ambiguous for quick planning

Record the choice in:
- `<planning_dir>/decision-log.md`

Also record:
- why this depth was chosen
- what kept the task in quick-plan or forced promotion
- key risks that could still trigger later promotion

### 4. Write the Implementation Plan

Create:
- `<planning_dir>/implementation-plan.md`

Include:
- objective
- current-codebase fit
- affected files and modules
- implementation approach
- risks and mitigations
- security or boundary concerns when relevant
- acceptance criteria
- rollout or testing notes when relevant

The plan must stay prose-first.
- no large implementation code dumps
- enough detail for `deep-implement` to execute without guessing

### 5. Mandatory Plan Self-Review

Review `implementation-plan.md` against:
- `request.md`
- `research-notes.md`
- `decision-log.md`

Check:
- scope fit
- requirement coverage
- current-codebase alignment
- security and permission assumptions
- missing tests
- hidden integration risks

Fix gaps directly in:
- `<planning_dir>/implementation-plan.md`

Optionally capture notable fixes in:
- `<planning_dir>/decision-log.md`

### 6. Write TDD Guidance

Create:
- `<planning_dir>/implementation-plan-tdd.md`

For `micro` depth, this can be compact, but it must still identify:
- tests to add or update first
- expected failing condition
- regression checks
- any mocking, fixture, or environment setup the implementer will need

### 7. Create Section Index

Create:
- `<planning_dir>/sections/index.md`

This file must begin with these blocks in this exact order:
- `PROJECT_CONFIG`
- `SECTION_MANIFEST`

`PROJECT_CONFIG` must include at least:
- `runtime`
- `test_command`

Example:

```markdown
<!-- PROJECT_CONFIG
runtime: python-uv
test_command: uv run pytest
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-foundation
section-02-integration
END_MANIFEST -->
```

Keep the section graph small and execution-oriented.
Avoid over-splitting.

### 8. Write Section Files

Create 1-5 section files depending on chosen depth.

Each section must be self-contained enough for `deep-implement` to execute directly.

Each section should define:
- ownership boundaries
- target files or modules
- TDD expectations
- acceptance checks
- known risks or coordination points

When parallel drafting is helpful:
- in Codex, prefer one `worker` sub-agent per section
- each sub-agent owns exactly one section file
- if direct writes are unavailable, have the sub-agent return pure markdown and write the file in the main agent

### 9. Cross-Section Consistency Review

After all section files exist, review them together.

Check:
- interface mismatches
- duplicated ownership
- missing plan coverage
- dependency-order mistakes
- naming drift
- security or permission blind spots spread across sections

Fix section files directly.

Run this as a stabilization loop using the same 5-7 round rule.

### 10. Final Verification

Verify:
- all required files exist
- `sections/index.md` has both `PROJECT_CONFIG` and `SECTION_MANIFEST`
- section count matches the manifest
- the plan is implementable without reopening major unanswered technical choices
- the quick-plan still genuinely fits quick-plan scope

If the task no longer fits, promote it to full `deep-plan` before handing off.

### 11. Output Summary

Summarize:
- chosen planning depth
- generated files
- any deferred product questions
- whether the task stayed in quick-plan or was promoted to full `deep-plan`
- whether the resulting package is ready for `deep-implement`

## Promotion Rule

If the task grows beyond small or medium scope, do not keep stretching this skill.

Promote to full `deep-plan` when:
- architecture becomes multi-domain or cross-team
- too many unstated requirements appear during research
- security, compliance, or migration risk becomes substantial
- section count wants to exceed the quick-plan limits
- the quick plan would otherwise hide meaningful uncertainty

When promoting:
- preserve all generated research and decision artifacts
- keep the same planning directory when practical
- synthesize or expand into the inputs expected by `deep-plan`
- do not throw away work that is still valid
