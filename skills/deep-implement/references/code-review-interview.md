# Code Review Triage + User Checkpoint (Codex)

Process review findings and involve user only when decisions require product/architecture tradeoffs.

## Input

- `{planning_dir}/reviews/section-NN-review.md`

## Triage Rules

### Ask User

Ask only for:
- Tradeoff decisions with multiple valid options
- Security/compliance-impacting choices
- Behavior changes that may affect product expectations

### Auto-Fix

Fix directly when:
- Change is low-risk and clearly correct
- It improves robustness/readability without altering product intent
- Missing test coverage can be added deterministically

### Defer

Defer as follow-up when:
- Out of section scope
- Nice-to-have optimization

## User Prompt Style

Use a concise numbered question in chat:

```text
Section NN review found 2 decision items:
1) <decision A>
2) <decision B>
Reply with choices (e.g., 1A, 2B) or say "auto" to let me choose safest defaults.
```

## Transcript Artifact

Write:
- `{planning_dir}/reviews/section-NN-interview.md`

Include:
- Asked items and user decisions
- Auto-fixes selected
- Deferred follow-ups

Then proceed to `apply-interview-fixes.md`.
