# Meta Activation

This reference turns skill selection into an explicit first-class step before
planning, editing, or final reporting.

## Purpose

Prevent accidental ad hoc work when a repo-local skill, sub-agent, or quality
gate already owns the task. The conductor must deliberately decide which skills
apply and record the decision for medium+ work.

## Activation Checklist

Before implementation, classify the request against these skill families:

| Signal | Preferred owner |
|---|---|
| End-to-end software work | `orchestra` |
| Project decomposition | `deep-project` through orchestra |
| Detailed feature planning | `deep-plan` through orchestra |
| Compact implementation plan | `deep-plan-quick` through orchestra |
| Plan execution | `deep-implement` through orchestra |
| UI polish, premium visual design, UX states | `visual-ui-enhancement` and visual UI agents |
| Build-vs-buy or solution choice | `programming-advisor` |
| Image prompt creation | `create-image-prompt` |
| Security audit or remediation | security agents and cybersecurity references |

## Rules

1. If a named skill is explicitly requested, read it before acting.
2. If a task has more than one plausible owner, choose the narrowest skill set
   that covers the work and record the choice in `orchestra/plan.md`.
3. If the task is small and implementation-ready, do not inflate it into a
   full planning pipeline merely because a skill could apply.
4. If a task is medium+ or risk is medium+, record the activation decision in
   `orchestra/plan.md`.
5. Before final summary, verify that every chosen skill family had either a
   completed action or a documented reason for being skipped.

## Skip Conditions

Skip a skill when:

- the user asks only for a factual answer or one shell command
- another explicit skill fully owns a narrow request
- the skill would add process without improving correctness, safety, or UX

