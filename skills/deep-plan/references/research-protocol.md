# Research Protocol

This document defines the research decision and execution flow for steps 6-7 of the deep-plan workflow.

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│  RESEARCH FLOW                                              │
│                                                             │
│  Step 6: Decide what to research                            │
│    - Codebase research? (existing patterns/conventions)     │
│    - Web research? (best practices, SOTA approaches)        │
│                                                             │
│  Step 7: Execute research (parallel if both selected)       │
│    - Subagents return results                               │
│    - Main planner agent combines and writes research-notes.md     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Codex Execution Rules (Takes Precedence)

This reference may include legacy examples using `Task` or structured user prompts from older platforms.
When running in Codex, apply these rules first:

- If user input is truly needed, ask via normal chat with compact numbered options (no Claude-only tools).
- Use direct repository inspection commands for codebase research.
- Use web search tools for external research when needed.
- Default to planner-owned research choices; ask the user only if they explicitly provided research constraints, budget limits, or domain priorities that materially change what should be investigated.
- Do not ask for permission to perform necessary web searches, codebase inspection, or safe read-only shell commands. Those are required research actions, not approval checkpoints.
- Use `multi_tool_use.parallel` for independent read-only research operations.
- Keep write operations sequential (only parent flow writes `research-notes.md`).

Minimum research is mandatory before plan writing:
- architecture and code pattern scan
- impacted module/test coverage scan
- schema/data dependency scan for impacted areas
- tenant/security boundary scan for impacted areas

---

## Step 6: Research Decision

### 6.1 Read and Analyze the Spec File

Read the spec file (from `initial_file` in task context items) and extract potential research topics by identifying:

- **Technologies mentioned** (React, Python, PostgreSQL, Redis, etc.)
- **Feature types** (authentication, file upload, real-time sync, caching, etc.)
- **Architecture patterns** (microservices, event-driven, serverless, etc.)
- **Integration points** (third-party APIs, OAuth providers, payment gateways, etc.)

Generate 3-5 research topic suggestions based on what you find. Format them as searchable queries with year for recency:
- "React authentication patterns 2025"
- "PostgreSQL full-text search best practices"
- "Redis session storage patterns"
- "File upload security considerations"

If the spec is vague with no clear technologies, fall back to generic options:
- "General best practices for {detected_language/framework}"
- "Security considerations for {feature_type}"
- "Performance optimization patterns"

### 6.2 Determine Codebase Research Automatically

Inspect the repository directly to decide whether there is existing code to analyze.

- If relevant modules, routes, schemas, tests, or patterns already exist, perform codebase research automatically.
- If the repository truly lacks relevant code, treat it as a greenfield/new-module case and document that assumption in `research-notes.md`.
- Do not ask the user this question unless the repository state is inaccessible or ambiguous.

### 6.3 Select Web Research Topics Automatically

Use the derived topics to choose web research targets automatically. Prioritize topics that are:
- version-sensitive or rapidly changing
- security-sensitive
- integration-heavy
- not already answered clearly by the codebase

Skip web research when the repository already provides a strong, current precedent and no external uncertainty remains.

Only ask the user for custom research topics if they explicitly want to steer the investigation.

### 6.4 Handle "Minimal Research" Case

Do not skip step 7 entirely.

If user declines optional web research, still complete mandatory baseline research and write findings to `research-notes.md`.

For new projects with no existing code:
- research target stack conventions and testing approach
- identify expected data/migration risks before implementation planning
- document assumptions explicitly in `research-notes.md`

---

## Step 7: Execute Research

### Critical Pattern: Subagents Return Results, Parent Writes Files

**DO NOT** have subagents write to files directly. This is important because:

1. **Avoids race conditions** - Parallel subagents writing to the same file would overwrite each other
2. **Context isolation** - Subagents keep verbose output in their own context, returning only summaries
3. **Parent control** - Main planner agent decides final structure and handles file operations

```
┌─────────────────────────────────────────────────────────────┐
│  PARALLEL RESEARCH EXECUTION                                │
│                                                             │
│  Task 1: Explore ──────────┐                                │
│    (returns codebase       │                                │
│     findings as markdown)  ├──→ Main planner agent combines       │
│                            │    and writes single          │
│  Task 2: web-search ───────┘    research-notes.md         │
│    (returns best practices                                  │
│     findings as markdown)                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.1 Codebase Research (if selected)

Run repository discovery directly (prefer parallel read-only calls) and gather:
- project structure and architecture
- existing implementation patterns/conventions
- dependencies and usage patterns
- testing setup and test execution commands
- affected modules/services and tenant/security boundaries

Return findings to parent flow, then parent writes `research-notes.md`.

### 7.2 Web Research (if topics selected)

Use web search/fetch tools and gather authoritative references for selected topics.
For each topic:
1. find authoritative sources (official docs, standards, respected technical sources)
2. cross-validate key recommendations
3. capture concise recommendations with URLs
4. flag version/date sensitivity where relevant

Return findings to parent flow, then parent writes `research-notes.md`.

### 7.3 Parallel Execution

If both codebase and web research are needed, run both in one `multi_tool_use.parallel` request when they are independent.

```
# Single parallel request with independent read-only calls:
# - repository discovery calls
# - web search/fetch calls
```

Wait for both to complete, then proceed to combining results.

### 7.4 Combine Results and Write File

After collecting results from all subagents, combine them into `<planning_dir>/research-notes.md`.

Structure the file however makes sense for the findings. The goal is to capture useful research that will inform the implementation plan - there's no required format.

---

## Edge Cases

| Case | Handling |
|------|----------|
| Spec file is vague | Present generic options based on any detected language/framework |
| User selects no research | In autonomous mode, still perform mandatory baseline research before proceeding. |
| Web research subagent fails | Log warning, write file with only codebase research (if it succeeded) |
| Both subagents fail | Log error, proceed with codebase/spec-only planning, and record the research gap plus confidence impact in `research-notes.md` |
| Only one research type selected | Run single subagent, write file with just that content |
| WebFetch returns truncated content | Subagent handles internally - notes incomplete info and tries additional sources |

---

## Example Flow

**User runs:** `/deep-plan @planning/auth-feature-spec.md`

**Spec file contains:**
```markdown
# Authentication Feature

Add OAuth2 login with Google and GitHub providers.
Store sessions in Redis. Use JWT for API authentication.
```

**Step 6 - Claude extracts topics:**
- "OAuth2 implementation best practices 2025"
- "JWT vs session authentication trade-offs"
- "Redis session storage patterns"

**Step 6 - Claude asks:**
```
Q1: Is there existing code I should research first?
  → User selects: "Yes, research the codebase"

Q2: Should I research best practices for any of these topics?
  → User selects:
    ✓ "OAuth2 implementation best practices 2025"
    ✓ "JWT vs session authentication trade-offs"
    ✗ "Redis session storage patterns"
```

**Step 7 - Claude launches parallel research:**
```
# Single message:
[Parallel read-only repo discovery calls]
[Parallel web search/fetch calls]
```

**Step 7 - After both complete:**
Main planner agent combines both results and writes single `research-notes.md`.
