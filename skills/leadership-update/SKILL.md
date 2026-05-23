---
name: leadership-update
description: Rewrite engineering work, debugging status, RCA findings, incident state, launch risk, or technical progress into concise leadership, PM, release manager, Slack, email, Jira, standup, or meeting updates. Use for management update, exec summary, leadership update, status update, less technical rewrite, Slack update, email update, or talking points.
---

# Leadership Update

## Codex Compatibility Notes

Use the context available in Codex: user text, local files, diffs, logs, issue
summaries, or connected tools. Do not fetch or post to external systems unless
the user asks and the environment provides the tool. Never invent metrics,
owners, customer impact, dates, or commitments.

## Audience

Write for engineering-aware leaders, PMs, release managers, and stakeholders.
They need state, impact, owner, risk, and next step. They usually do not need
function names, file paths, stack internals, commit SHAs, or low-level debug
steps unless those identifiers are the tracking artifact.

## Workflow

1. Identify the destination: Slack, email, Jira/status comment, standup, or
   meeting talking points. If unclear, choose a concise written status block.
2. Preserve tracking identifiers that help coordination: product/component
   names, customer/workload names, Jira keys, PR numbers, release versions.
3. Translate low-level mechanism into plain cause-and-effect without hiding real
   technical risk.
4. Lead with current state. Then give impact, owner, next step, and risk only
   when evidence supports them.
5. If source facts are incomplete, state the gap instead of smoothing it over.

## Channel Shapes

### Slack

- First line: bold TL;DR.
- Then 2-4 short bullets covering impact, owner/link, next step, and risk.
- Keep it under roughly 80 words unless the user asks for detail.

### Standup

- 1-3 lines.
- Start with the verb: fixed, investigating, blocked, validating, backporting.
- Include the tracking key or PR when known.

### Email

- Provide a subject line.
- Use 2-3 short paragraphs.
- End with the next decision or expected update only if there is one.

### Jira Or Written Status

Use compact labels:

```markdown
**Status:** [fixed / investigating / blocked / validating / ready to merge]
**Impact:** [who/what is affected]
**What changed:** [plain-English mechanism or fix]
**Owner:** [person/team/artifact if known]
**Next step:** [specific next action]
**Risk:** [real risk, or omit]
```

### Meeting Talking Points

- Short bullets in speaking order.
- One clause per bullet.
- Include numbers or keys the speaker should say aloud.

## Rules

- Strip code internals unless the user explicitly asks for an engineer-facing
  version.
- Keep real technical words when they matter: regression, race condition,
  migration, auth guard, rate limit, rollout, rollback, backport.
- Do not overpromise timelines, scope, validation, or customer impact.
- Do not turn unknowns into certainty. Say "root cause still under
  investigation" when that is the state.
- For a formal engineering RCA, use `engineering-postmortem` instead.
