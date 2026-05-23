---
name: engineering-postmortem
description: Write a concise engineering postmortem, RCA, or bug-fix closeout after a bug, regression, or incident has a known root cause, identified fix, and validation evidence. Use for postmortem, post-mortem, RCA, root cause analysis, bug writeup, fix writeup, incident follow-up, or closeout requests.
---

# Engineering Postmortem

## Codex Compatibility Notes

Use Codex-native tools and repository context. Prefer SocratiCode first when it
is active, then targeted `rg` and narrow file reads. Do not assume Jira, GitHub,
Slack, or browser tools exist unless the active environment provides them. Never
post externally without explicit user confirmation.

## Purpose

Create the engineering record for a fixed problem. The output is for engineers
who may need to debug the same area later, so keep code identifiers, exact test
names, commands, commit/PR references, and validation scope when they are known.

## Required Gate

Do not draft a postmortem until all four inputs are present:

- Reproduction: deterministic or high-rate repro, failing test, command, log, or
  customer workload that demonstrates the original problem.
- Root cause: the mechanism is known, not guessed.
- Fix: PR, commit, branch, patch, or described code/config change is identified.
- Validation: the original repro or equivalent verification now passes.

If any input is missing, stop and list only the missing inputs plus the next
smallest step to obtain them.

## Workflow

1. Gather evidence from the user message, local diffs, logs, tests, PR metadata,
   or issue text. Use targeted reads; do not invent unknown facts.
2. Separate facts from inference. Mark inferred connections clearly unless the
   code/log/test evidence proves them.
3. Explain the cause chain from trigger to visible symptom.
4. State validation honestly. If only one configuration was tested, say so.
5. Produce a draft in chat unless the user requested a file path. Ask before
   posting to any external system.

## Output Shape

Use only sections that have evidence. Keep the draft concise.

```markdown
## Summary
[User/workload impact, root cause in one sentence, fix status/reference.]

## Symptom
[Exact failing behavior, command, test, error, log, or customer report.]

## Root Cause
[Concrete mechanism with code identifiers and cause chain.]

## Fix
[What changed and why it addresses the root cause.]

## Validation
[Commands/tests/workloads run, results, and coverage limits.]

## How It Slipped Through
[CI gap, review gap, latent path, workload gap, incomplete prior fix, or unknown.]

## Follow-Ups
[Owner + tracking artifact where known. If none, say none.]
```

## Rules

- Never invent root cause, owner, validation, timeline, customer impact, or
  action items.
- Keep engineering identifiers in the engineering version.
- Use blameless language: describe the bug and system gap, not personal fault.
- For live production incidents, route through `rescue` first; use this skill
  only after stabilization and evidence collection.
- If the audience is leadership or product, draft the engineering version first
  or route to `leadership-update` for a non-code summary.
