# Interview Protocol

The interview runs directly in this skill in the main conversation.

## Context

The interview should be informed by:
- **Initial spec** (always available from `initial_file`)
- **Research findings** (if step 7 produced `research-notes.md`)

If research was done, use it to:
- Skip questions already answered by research
- Ask clarifying questions about trade-offs or patterns discovered
- Dig deeper into areas where research revealed complexity

## Philosophy

- You are a senior architect accountable for this implementation
- Surface everything the user knows but hasn't mentioned
- Assume the initial spec is incomplete (research helps, but user context is still needed)
- Extract context from user's head

## Technique

- Ask focused questions in normal chat (2-4 per round)
- Ask open-ended questions, not yes/no
- Don't ask obvious questions already in spec
- Dig deeper when answers reveal complexity
- Summarize periodically to confirm understanding
- Avoid nested numbered option lists; use short option codes/keywords instead.
- Reuse known answers from existing planning files and ask only unresolved fields.

## Improvement Mode (Existing Plan Refresh)

When improving an existing plan, run a refresh interview before regenerating plan artifacts.

Questioning must be separated into two phases:
- **Stage A (Early Intake):** collect update inputs (`answer_mode`, `changes`, `gaps`, `focus`).
- **Stage B (Late Recommendation):** happens after plan rewrite, where recommended uplift items are presented for user adoption decision.

Required refresh flow:
1. Ask what changed since the last plan (scope, constraints, timeline, risk tolerance).
2. Ask what was missing or weak in the previous plan.
3. Ask re-answer mode using keyword choice:
   - `full` = Re-answer key questions fully
   - `delta` = Answer only changed parts
   - `keep` = Keep previous answers
4. Capture decisions and rationale for each changed area.

Use a single compact intake prompt in one message:

```text
Please reply in this format:
answer_mode: full|delta|keep
changes: <what changed>
gaps: <what is missing/weak>
focus: security|migration|tests|all
```

Do not re-ask these fields in follow-up unless:
- a field is missing/ambiguous, or
- user explicitly asks to revise a previous answer.

Do not ask Stage B recommendation/adoption questions during Stage A.
Stage B must occur after `implementation-plan.md` and `plan-uplift.md` are prepared.

Save refresh transcript to:
- `<planning_dir>/interview-refresh.md`

Then merge/append into:
- `<planning_dir>/interview-notes.md`

## Example Questions

**Good questions:**
- "What happens when X fails? Should we retry, log, or surface to user?"
- "Are there existing patterns in the codebase for Y that we should follow?"
- "What's the expected scale - dozens, thousands, or millions of Z?"

**Bad questions (too vague):**
- "Anything else?"
- "Is that all?"
- "Do you have any other requirements?"

## When to Stop

Stop interviewing when you are confident you can:
1. Write a detailed implementation plan
2. Make no assumptions about requirements
3. Handle all edge cases the user cares about

If uncertain, ask one more round. It's better to over-clarify than to make wrong assumptions.

If the user is predominantly answering with 'I don't know' or 'Up to you' to most questions, stop and move on.

## Saving the Transcript

After the interview, save the full Q&A to `<planning_dir>/interview-notes.md`:
- Format each question as a markdown heading
- Include the user's full answer below
- Number questions for reference (Q1, Q2, etc.)
