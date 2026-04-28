# Interview Protocol

The interview runs directly in this skill (not subagent) in the main conversation context.

## Context

The interview should be informed by:
- **Initial spec** (always available from `initial_file`)
- **Research findings** (if step 7 produced `claude-research.md`)

If research was done, use it to:
- Skip questions already answered by research
- Ask clarifying questions about trade-offs or patterns discovered
- Dig deeper into areas where research revealed complexity

## Philosophy

- You are a senior architect accountable for this implementation
- **Only ask what you genuinely cannot determine from the codebase or spec**
- For technical decisions (framework choice, architecture pattern, error handling strategy): **decide yourself** based on codebase research and best practices. Log the decision, don't ask.
- For business/domain decisions (user-facing behavior, scope, priorities): **ask the user** — only they know this.
- Extract context from user's head, but respect their time.

## What to Ask vs What to Decide Yourself

**ASK the user (domain knowledge only they have):**
- Business rules and domain logic ("What happens when a subscription expires mid-task?")
- Scope decisions ("Should this support batch processing or single items only?")
- Priority and trade-offs ("Is speed more important than accuracy here?")
- User-facing behavior ("Should error messages be shown inline or as toast?")
- Integration constraints only they know ("Does the external API have rate limits?")

**DECIDE yourself (technical decisions — do NOT ask):**
- Framework/library choices → pick what matches codebase patterns
- Architecture patterns → follow existing codebase conventions
- Error handling strategy → use what the codebase already does
- Database schema design → follow existing ORM patterns
- Testing approach → match existing test conventions
- File structure → follow existing project structure
- API design patterns → match existing endpoints

**Log auto-decisions** so user can review if they want:
```
Auto-decided: Using Zod validation (matches existing codebase pattern in server/routers/*.ts)
Auto-decided: Redis caching with 60s TTL (matches existing pattern in services/cache.ts)
```

## Technique

- Use focused questions (1-3 per round)
- If the host offers a structured question helper you may use it, but plain chat questions must remain the default-compatible path
- Ask open-ended questions about business/domain, not technical implementation
- Don't ask obvious questions already in spec
- Don't ask questions that can be answered by reading the codebase
- Summarize periodically to confirm understanding
- **Keep it short** — aim for 2-4 rounds maximum

## Example Questions

**Good questions (domain knowledge):**
- "What's the expected scale - dozens, thousands, or millions of Z?"
- "Should failed tasks retry automatically or require manual intervention?"
- "Who is the primary user of this feature — admins or end users?"

**Bad questions (technical — decide yourself):**
- ~~"Should we use Redis or in-memory caching?"~~ → Check codebase, pick what's already used
- ~~"What happens when X fails? Should we retry, log, or surface to user?"~~ → Follow existing error handling patterns
- ~~"Are there existing patterns in the codebase for Y?"~~ → You already researched this in Step 7
- ~~"Should we use TypeScript or JavaScript?"~~ → Look at the existing codebase

## When to Stop

Stop interviewing when you have enough **business context** to write the plan. Technical details should come from codebase research, not the user.

If the user answers with 'I don't know' or 'Up to you' → that's a signal to decide yourself. Stop asking and move on.

**Target: 2-4 rounds. Never exceed 6 rounds.**

## Saving the Transcript

After the interview, save the full Q&A to `<planning_dir>/claude-interview.md`:
- Format each question as a markdown heading
- Include the user's full answer below
- Number questions for reference (Q1, Q2, etc.)
- Include a section for **Auto-Decisions** listing technical choices made without asking
