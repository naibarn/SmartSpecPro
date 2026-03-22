# Code Review Protocol

Code review workflow for `/deep-implement`.

This protocol is backend-aware:
- Compatible mode: use Codex-style read-only sub-agents such as `explorer` or a constrained `default` review agent.
- Claude mode: legacy custom `code-reviewer` agent is still acceptable.

## Overview

After implementing a section, before committing:

1. Stage changes
2. Write staged diff to `{state_dir}/code_review/section-NN-diff.md`
3. Launch a read-only review agent
4. Save its findings to `{state_dir}/code_review/section-NN-review.md`

Then continue to `code-review-interview.md`.

## Review Inputs

The review agent should read:
- `{sections_dir}/section-NN-<name>.md`
- `{state_dir}/code_review/section-NN-diff.md`

## Compatible-Mode Review Agent

Recommended in Codex:
- use `explorer` for review when the task is mainly read-only analysis
- otherwise use a read-only `default` sub-agent with clear scope

Review prompt requirements:
- compare implementation against the section plan
- identify correctness gaps, regressions, and missing tests
- prioritize concrete findings over style preferences
- do not modify files directly unless the host workflow explicitly wants that

## Legacy Claude Review Agent

If custom Claude agents are available, `agents/code-reviewer.md` remains usable.

## Review Output

Write freeform findings to:
- `{state_dir}/code_review/section-NN-review.md`

Suggested structure:

```markdown
# Code Review: Section NN - Name

## Findings

- High severity issue...
- Medium severity issue...

## Test Gaps

- Missing regression coverage for ...

## Notes

- Optional improvements ...
```

If no issues are found, say so explicitly.
