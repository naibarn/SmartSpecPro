# Interview Protocol

## Context to Read

Before starting the interview:
- `{initial_file}` - The requirements file passed by user

## Philosophy

The interview surfaces the user's mental model. Claude has freedom to ask questions adaptively - there's no fixed number of rounds. The goal is reconciling context from the user's brain with Claude's intelligence.

**Key principle: Only ask what you cannot determine yourself.** Technical decisions should be made by Claude based on codebase analysis. Business and domain decisions require user input.

Use short direct questions in the main conversation. If the host offers a structured question helper, you may use it, but the protocol must also work in plain chat.

## What to Ask vs What to Decide Yourself

**ASK the user:**
- Business scope and priorities ("Which of these features is highest priority?")
- Domain rules only they know ("How does your approval workflow work?")
- Natural boundaries they see in the work ("How do you think about dividing this?")
- Ordering intuition ("What feels foundational to you?")
- Uncertainty areas ("What parts are you least sure about?")

**DECIDE yourself (do NOT ask):**
- Technology choices → analyze codebase
- Architecture patterns → follow existing conventions
- Split granularity → use split-heuristics.md
- Dependency ordering → analyze code imports and data flow
- Testing approach → match existing setup

**Log auto-decisions:**
```
Auto-decided: Split into 3 units based on clear system boundaries (frontend, backend API, data pipeline)
Auto-decided: Sequential ordering because backend API depends on data models
```

## Core Topics to Cover

### 1. Natural Boundaries

Try to discover how the user naturally thinks about dividing the work while also providing your advice for how it might be split. Try to identify foundational systems.

**Listen for:**
- Repeated mentions of specific modules or features
- Clear separation in how they describe different parts
- "This part is about X, but that part is about Y"

### 2. Ordering Intuition

Understand what needs to come first or is foundational. Tease context out of the user's mind about dependencies and combine it with your advice.

**Listen for:**
- Mentions of "core" or "foundation"
- Dependencies: "X needs Y to work"
- Bootstrap requirements

### 3. Uncertainty Mapping

Identify what's clear vs. what needs exploration. Extract detail from the user on the most vague pieces while combining your knowledge.

**Listen for:**
- Hesitation or qualifiers ("maybe", "probably", "I think")
- Multiple alternatives being considered
- "I'm not sure how to..."

### 4. Existing Context

Capture constraints and integration points.

**Listen for:**
- Specific technologies, frameworks, or patterns
- API contracts or database schemas
- Organizational or deployment constraints

**Important:** Pass through to specs without researching. Your job is to capture context, not validate it.

## When to Stop

**Target: 2-4 rounds. Never exceed 5 rounds.**

Stop the interview when you have enough information to:

1. **Propose a split structure the user will recognize**
2. **Identify dependencies between splits** (if multiple)
3. **Flag which splits could run in parallel** (if multiple)
4. **Capture key context and clarifications for /deep-plan**

If the user answers with 'I don't know' or 'Up to you' → that's a signal to decide yourself and move on.

## Output

After the interview, write `{planning_dir}/deep_project_interview.md` with a complete transcript of the interview, plus a section for **Auto-Decisions** listing technical choices made without asking.
