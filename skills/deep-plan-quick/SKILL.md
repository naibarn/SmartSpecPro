---
name: deep-plan-quick
description: Creates lightweight, file-based implementation plans directly from a short request or optional markdown brief. Use for small/medium tasks that still need rigorous planning but do not require a full heavy spec-first pipeline.
license: MIT
compatibility: Requires git repository recommended; works with or without spec.md
---

# Deep Plan Quick (Codex)

Prompt-first, file-based planning for tasks that are too fuzzy to implement immediately but too small for the full deep-plan pipeline.

## Goals

Produce a compact but rigorous planning package that is still safe to implement from:
- `request.md`
- `research-notes.md`
- `implementation-plan.md`
- `implementation-plan-tdd.md` (lightweight when appropriate)
- `sections/index.md`
- `sections/section-*.md`

## Input Modes

This skill accepts either:
- a markdown file path (`@brief.md`, `@spec.md`, `@request.md`)
- a short free-form user request with no file

If no file is provided, create one before planning starts.

## Planning Directory Resolution

Determine `<planning_dir>` like this:
- if input file is `spec.md` or `brief.md`, use its parent directory when appropriate
- otherwise create `specs/quick/NNN-slug/`
- always create `<planning_dir>/sections/`

If no file exists yet, write `<planning_dir>/request.md` containing:
- original user request
- assumptions inferred from the repository
- unresolved product questions (only if truly necessary)

## Autonomy Policy

Default to `auto_by_default`.

Do not ask the user for technical choices unless:
- product intent is ambiguous
- a destructive/irreversible decision is required
- two options materially change scope or user-visible behavior

Prefer the approach that best matches the current codebase.

## Workflow

### 1. Normalize the Request

Create a concise planning brief from the available input:
- task summary
- likely affected areas
- constraints
- assumptions
- explicit non-goals when obvious

Save it to:
- `<planning_dir>/request.md`

### 2. Mandatory Lightweight Research

Always do research before planning:
- codebase pattern scan
- impacted module/test scan
- dependency/config scan
- security/tenant boundary scan if relevant
- targeted web research only for unstable, version-sensitive, or unfamiliar topics

Write:
- `<planning_dir>/research-notes.md`

If the task is clearly larger than expected during research, promote it to the full `deep-plan` flow.

### 3. Choose Planning Depth

Choose one of these automatically:

- `micro`
  - 1-2 section files
  - minimal TDD checklist
  - used for tightly scoped changes

- `standard`
  - 2-5 section files
  - normal `implementation-plan-tdd.md`
  - used for most small/medium feature work

- `promote`
  - switch to full `deep-plan`
  - used when the request is actually large, cross-domain, or architecture-heavy

Record the choice in:
- `<planning_dir>/decision-log.md`

### 4. Write the Implementation Plan

Create:
- `<planning_dir>/implementation-plan.md`

Include:
- objective
- current-codebase fit
- affected files/modules
- implementation approach
- risks and mitigations
- acceptance criteria
- rollout/testing notes when relevant

### 5. Write TDD Guidance

Create:
- `<planning_dir>/implementation-plan-tdd.md`

For `micro` depth, this can be compact, but it must still identify:
- tests to add/update first
- expected failing condition
- regression checks

### 6. Create Section Manifest

Create:
- `<planning_dir>/sections/index.md`

The manifest should be small and execution-oriented. Avoid over-splitting.

### 7. Write Section Files

Create 1-5 section files depending on chosen depth.
Each section must be self-contained enough for `deep-implement` to execute directly.

### 8. Final Verification

Verify:
- all required files exist
- section count matches `sections/index.md`
- plan is implementable without reopening major unanswered technical choices

### 9. Output Summary

Summarize:
- chosen planning depth
- generated files
- any deferred product questions
- whether the task stayed in quick-plan or should be promoted to full `deep-plan`

## Escalation Rule

If the task grows beyond small/medium scope, do not keep stretching this skill.
Promote to the full `deep-plan` workflow and preserve all generated research/decision artifacts.
