# Skill Pack Integration — Automatic deep-* Chaining

## Overview

Orchestra remains the top-level conductor for the whole lifecycle. It does **not** wait for the user to manually type `/deep-plan`, `/deep-plan-quick`, `/deep-project`, or `/deep-implement`.

Instead, orchestra:
- creates or selects the correct planning artifact
- reads the sibling skill instructions directly from the installed skill pack
- executes the matching deep-* workflow inline
- verifies that the expected artifacts were written
- continues automatically into implementation when planning is complete

The human should only be interrupted when product intent is ambiguous, destructive reset is required, or a critical blocker cannot be resolved safely.

## Route Selection

Use these rules when orchestra decides to leave the normal wave model:

- `quick-plan-chain`
  - Use when the task benefits from a written plan but does not require a full heavyweight planning pipeline.
  - Typical triggers: user request is short/free-form, no `spec.md` exists, task is small/medium, or the work needs planning before implementation but not a full deep decomposition.
  - Planner: `../../deep-plan-quick/SKILL.md`

- `deep-plan-chain`
  - Use when scope is `large`, when a `spec.md` already exists, or when the task needs the full structured planning pipeline.
  - Planner: `../../deep-plan/skills/deep-plan/SKILL.md`

- `full-pipeline`
  - Use when scope is `project` and the request must first be decomposed into multiple feature/spec units.
  - Decomposer: `../../deep-project/skills/deep-project/SKILL.md`
  - Follow-on planner per split: `../../deep-plan/skills/deep-plan/SKILL.md`

## Automatic Large-Scope Planning

When scope is `large`:

1. Create or refresh `specs/feature/NNN-name/spec.md`.
2. Write a backlog entry with the expected planning artifacts.
3. Read `../../deep-plan/skills/deep-plan/SKILL.md` and execute that workflow immediately.
4. Verify these artifacts exist:
   - `claude-plan.md`
   - `claude-plan-tdd.md`
   - `sections/index.md`
5. Record completion in `orchestra/progress.md` and `orchestra/decisions.md`.
6. Continue directly into `deep-implement` using the generated `sections/` directory.

Do not print a manual handoff command to the user unless the user explicitly asks to take over the planning step themselves.

## Automatic Quick Planning Without spec.md

When a written plan is useful but the request is still small/medium or under-specified:

1. Create a lightweight planning directory under `specs/quick/NNN-name/`.
2. Save the original user request to `request.md`.
3. Read `../../deep-plan-quick/SKILL.md` and execute it immediately.
4. Verify these artifacts exist:
   - `implementation-plan.md`
   - `sections/index.md`
   - at least one `sections/section-*.md`
5. If the quick planner determines the task is actually `large`, promote the work into the full `deep-plan-chain` by synthesizing `spec.md` and switching to `../../deep-plan/skills/deep-plan/SKILL.md`.
6. Continue directly into `deep-implement` using the generated `sections/` directory.

## Automatic Project Decomposition

When scope is `project`:

1. Create or refresh `specs/project/NNN-name/requirements.md`.
2. Write a backlog entry with the expected decomposition artifacts.
3. Read `../../deep-project/skills/deep-project/SKILL.md` and execute it immediately.
4. For each generated split spec, invoke the full `deep-plan-chain` automatically.
5. For each completed plan, invoke `deep-implement` automatically.
6. Aggregate progress, decisions, and blockers centrally in `orchestra/`.

## Backlog Tracking

`orchestra/backlog.md` remains the source of truth for automatic chained work.

Use entries like:

```text
[PENDING] {item description}
  Type: quick-plan-chain | deep-plan-chain | full-pipeline | deep-implement-chain
  Expected artifacts:
    - /absolute/path/to/file.md
  Invocation: automatic
  Added: YYYY-MM-DDTHH:MM:SSZ
```

When a chained stage completes:

```text
[DONE] {item description}
  Resolved: YYYY-MM-DDTHH:MM:SSZ
  Artifacts verified: yes
```

## Resume Behavior

If orchestration is interrupted and `/orchestra resume` is invoked:

1. Read `orchestra/backlog.md` and `orchestra/progress.md`.
2. Identify the most recent incomplete chain stage.
3. Verify which expected artifacts already exist.
4. Resume from the earliest incomplete automatic stage:
   - quick planning
   - full planning
   - decomposition
   - implementation
5. Do not ask the user to manually re-run deep-* skills unless a critical failure requires explicit takeover.

## Automatic Transition to deep-implement

After planning artifacts exist and are verified:

1. Read `../../deep-implement/skills/deep-implement/SKILL.md`.
2. Run it against the generated `sections/` directory.
3. Track commits, tests, blocked tasks, and hardening decisions in the same `orchestra/` session.
4. If `deep-implement` generates a hardening follow-up plan, keep that inside the same orchestra backlog rather than handing control back to the user.

## Human Interaction Boundary

Orchestra should interrupt the user only when:
- product intent is ambiguous
- destructive archival/reset is required
- a critical security finding needs explicit acceptance
- implementation is blocked by an external dependency the conductor cannot resolve safely

Everything else should chain automatically.
