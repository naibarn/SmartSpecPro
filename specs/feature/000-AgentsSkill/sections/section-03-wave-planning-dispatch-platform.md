I now have all the context needed. Let me generate the complete section content for section-03-wave-planning-dispatch-platform.

# Section 03 — Wave Planning, Dispatch & Platform Compatibility

**Feature:** 000-AgentsSkill
**Depends on:** section-01 (contracts scaffolding), section-02 (task analysis + routing)
**Blocks:** section-06 (Orchestra SKILL.md)

---

## Overview

This section creates three reference files that govern how the orchestra conductor structures parallel work, dispatches agents, and adapts behavior across different AI platform environments. These files are consumed by SKILL.md Steps 3 and 4 at runtime.

**Deliverables:**

| File | Purpose |
|------|---------|
| `deep_plan/skills/orchestra/references/wave-planning.md` | Contract format, wave grouping rules, concurrency limits, circular dependency detection |
| `deep_plan/skills/orchestra/references/sub-agent-dispatch.md` | All 17 agent type mappings, parallel dispatch mechanics, Codex template injection, pre-merge gate trigger |
| `deep_plan/skills/orchestra/references/platform-compat.md` | Platform detection flow, per-platform dispatch adapter, scope caps, platform reset |

---

## Dependencies (Already Completed)

Before implementing this section, the following must exist:

- **Section 01** must have created:
  - `deep_plan/skills/sub-agents/contracts/task-packet.schema.md` (8-section Task Packet format)
  - `deep_plan/skills/sub-agents/contracts/result-report.schema.md` (6-field Result Report)
  - `deep_plan/skills/orchestra/references/task-packet-format.md`
  - All 5 directory scaffolds

- **Section 02** must have created:
  - `deep_plan/skills/orchestra/references/task-analysis.md` (scope/risk classification)
  - `deep_plan/skills/orchestra/references/routing-decision.md` (5 routes + decision-mode options)

Do not duplicate content from those files. Reference them by path.

---

## Tests First (TDD Validation Checklist)

These validations must pass after all three files in this section are created. Run them before moving to section-04.

### wave-planning.md

- **S:** Has a "Contract Format" section defining at least 3 required fields: `shared interface` (API endpoint + request/response schemas), `ownership boundaries` (which agent owns which files), `test boundary` (what each agent tests)
- **S:** Has a "Parallelism Hard Constraints" section that explicitly states all 4 limits:
  - Max 4 concurrent agents
  - Max 2 agents editing files simultaneously (with `isolation: worktree` enforcement note)
  - Only 1 DB agent active at a time
  - Only 1 git agent active at a time
- **S:** Has a "Wave Grouping Rules" section explaining that tasks in the same wave have no file-level dependencies on each other
- **S:** Has a "Wave N Context Injection Format" section with the `[domain] description: /path — STATUS` pattern example
- **S:** Has a "Circular Dependency Detection" section with explicit handling instructions (report to user, resolve before proceeding)
- **S:** States that "Parallel dispatch requires a contract — no contract = sequential execution"
- **C:** Contract field names here match what SKILL.md Step 3 uses when writing `orchestra/contracts.md`

### sub-agent-dispatch.md

- **S:** Documents all 17 agent roles with their `subagent_type` value for Claude Code mode
- **S:** States the parallel dispatch rule explicitly: "all agents in the same wave MUST be dispatched in a single message (multiple Task tool calls)"
- **S:** Documents the Codex template injection procedure (prepend `agents/NAME.md` identity + constraints with framing sentence)
- **S:** Documents the pre-merge security gate auto-trigger check that happens after the final wave
- **C:** The 17 agent types listed here match the 17 agents defined in sections 07 and 08 (general x13 + security specialists x4)
- **C:** The `subagent_type` values used here are valid Claude Code plugin IDs (e.g., `Explore`, `general-purpose`, `backend-api-security:backend-security-coder`, `python-development:fastapi-pro`, `error-debugging:debugger`, `error-debugging:error-detective`)

### platform-compat.md

- **S:** Documents all 3 platform modes: `claude-code`, `codex`, `open-code`
- **S:** Includes detection flow: check `orchestra/platform.md` → if missing, ask user once with 3 options → write answer → never ask again
- **S:** Includes the open-code scope cap: "Cap open-code mode to `small` scope" and the exact warning message to print for medium+ scope
- **S:** Documents platform reset: user can delete or edit `orchestra/platform.md` to change platform selection
- **S:** Includes concrete Task Packet construction example for each of the 3 platform modes
- **C:** The 3 platform mode names (`claude-code`, `codex`, `open-code`) match what SKILL.md Step 4 uses when detecting and branching

---

## File 1: `deep_plan/skills/orchestra/references/wave-planning.md`

**Absolute path:** `/home/dev/projects/SmartSpecPro/deep_plan/skills/orchestra/references/wave-planning.md`

**Target size:** 150–250 lines

**Purpose:** Teaches the conductor how to structure parallel work by grouping tasks into waves, defining contracts between co-working agents, and enforcing safe concurrency limits.

### Required Sections and Content

**Header:** Brief description of what wave planning achieves (parallel speed without file conflicts).

**1. Contract Definition Format**

Before dispatching any parallel agents, write contracts to `orchestra/contracts.md`. Each contract covers one pair (or group) of agents working in parallel and must include:

- **Shared Interface** — the exact API boundary between the agents' work. For a frontend+backend pair this means: the tRPC procedure name, input Zod schema, and response shape. For a backend+database pair: the Drizzle query signature and returned columns. Write this as a mini-specification, not prose.
- **Ownership Boundaries** — a table listing each file and which agent owns it. No file should appear in two agents' ownership columns. If a file needs changes from both, split the changes into sequential waves.
- **Test Boundary** — what each agent is expected to test. The frontend agent tests the component render against the mocked API contract; the backend agent tests the tRPC handler with a real database call.

Example contract stub (show structure, not full implementation):

```
## Contract: frontend ↔ backend — UserDashboard feature

### Shared Interface
- Procedure: `trpc.dashboard.getSummary`
- Input: `{ userId: string, tenantId: string }`
- Response: `{ stats: DashboardStats; recentActivity: ActivityItem[] }`

### Ownership Boundaries
| File | Owner |
|------|-------|
| apps/web/client/src/pages/Dashboard.tsx | frontend agent |
| apps/web/client/src/components/StatsCard.tsx | frontend agent |
| apps/web/server/routers/dashboard.ts | backend agent |
| apps/web/server/services/dashboardService.ts | backend agent |

### Test Boundary
- frontend: test component renders with mocked `getSummary` response
- backend: test `getSummary` procedure with Drizzle test DB, check tenantId isolation
```

**2. Wave Grouping Rules**

State the core principle: tasks in the same wave have no file-level dependencies on each other. A task belongs to wave N+1 if and only if it requires the output of a wave N task.

Guidelines for grouping:
- Read the ownership boundaries of all planned tasks
- If task A writes files that task B reads or imports, B goes in a later wave
- If tasks A and B share no files and have no import relationship, they can be in the same wave
- Database migrations always occupy their own wave (only 1 DB agent constraint)
- Git operations (commit, branch) always occupy their own wave (only 1 git agent constraint)

**3. Parallelism Hard Constraints**

These limits are non-negotiable. The conductor must enforce them when building the wave plan:

| Constraint | Limit | Enforcement |
|-----------|-------|-------------|
| Concurrent agents | Max 4 | Count active Task tool calls; queue excess |
| File-editing agents in parallel | Max 2 | Use `isolation: worktree` for parallel writers; if more than 2 write tasks needed, split into sub-waves |
| DB agents active simultaneously | 1 | Database tasks always run alone in their wave |
| Git agents active simultaneously | 1 | Git tasks always run alone in their wave |
| Parallel dispatch without contract | Not allowed | If contract not written, dispatch sequentially |

**4. Wave N Context Injection Format**

When injecting results from wave N into wave N+1 Task Packets, use this structured format (do NOT dump raw conversation history):

```
### Results from Wave N
- [frontend] Added StatsCard component: /home/dev/projects/SmartSpecPro/apps/web/client/src/components/StatsCard.tsx — SUCCESS
- [backend] Added getSummary tRPC procedure: /home/dev/projects/SmartSpecPro/apps/web/server/routers/dashboard.ts — SUCCESS
- Open contract note: Backend returns `stats.activeUsers` as `number`, not `string`. Frontend must not wrap in `parseInt()`.
```

Rules for context injection:
- Include: file paths (absolute), change descriptions (one line), status (SUCCESS/PARTIAL/FAILED), cross-agent contract notes
- Exclude: raw conversation transcripts, full file contents, internal agent reasoning
- Prepend this block at the top of every wave N+1 Task Packet CONTEXT section

**5. Circular Dependency Detection**

A cycle is present when no tasks are ready (all remaining tasks depend on other remaining tasks). Detection algorithm:

1. After each wave, compute the set of tasks whose dependencies are all complete
2. If this set is empty but the pending task list is non-empty: cycle detected
3. Action: stop dispatch, report to user with the dependency chain that forms the cycle, ask user to resolve (split the cycle or reorder)
4. Do not attempt to auto-resolve cycles — they indicate a planning error that needs human judgment

---

## File 2: `deep_plan/skills/orchestra/references/sub-agent-dispatch.md`

**Absolute path:** `/home/dev/projects/SmartSpecPro/deep_plan/skills/orchestra/references/sub-agent-dispatch.md`

**Target size:** 150–250 lines

**Purpose:** Tells the conductor exactly how to dispatch each of the 17 agent roles — which `subagent_type` to use per platform, how to construct the Task Packet prompt, and when the pre-merge security gate triggers automatically.

### Required Sections and Content

**1. Agent Type Mapping Table**

For each of the 17 agent roles, document the `subagent_type` for Claude Code mode and the fallback behavior for Codex/open-code. The 17 agents are: research, architect, frontend, backend, python, database, test-qa, reviewer, security, debugger, error-detective, infrastructure, docs-release (13 general from section-07) + security-review, security-trpc, security-fastapi, security-frontend (4 specialists from section-08).

| Agent Role | Claude Code `subagent_type` | Codex Fallback | open-code Mode |
|-----------|---------------------------|----------------|----------------|
| research | `Explore` | `general-purpose` + injected template | Inline (conductor adopts role) |
| architect | `Plan` | `general-purpose` + injected template | Inline |
| frontend | `general-purpose` | `general-purpose` + injected template | Inline |
| backend | `backend-api-security:backend-architect` | `general-purpose` + injected template | Inline |
| python | `python-development:fastapi-pro` | `general-purpose` + injected template | Inline |
| database | `general-purpose` | `general-purpose` + injected template | Inline (sequential only) |
| test-qa | `general-purpose` | `general-purpose` + injected template | Inline |
| reviewer | `Explore` | `general-purpose` + injected template | Inline |
| security | `backend-api-security:backend-security-coder` | `general-purpose` + injected template | Inline |
| debugger | `error-debugging:debugger` | `general-purpose` + injected template | Inline (sequential) |
| error-detective | `error-debugging:error-detective` | `general-purpose` + injected template | Inline |
| infrastructure | `Explore` (analysis) or `general-purpose` (write) | `general-purpose` + injected template | Inline |
| docs-release | `general-purpose` | `general-purpose` + injected template | Inline |
| security-review | `backend-api-security:backend-security-coder` | `general-purpose` + injected template | Inline |
| security-trpc | `backend-api-security:backend-security-coder` | `general-purpose` + injected template | Inline |
| security-fastapi | `backend-api-security:backend-security-coder` | `general-purpose` + injected template | Inline |
| security-frontend | `Explore` | `general-purpose` + injected template | Inline |

**2. Parallel Dispatch Rule**

State this rule explicitly as a callout:

> All agents in the same wave MUST be dispatched in a single message containing multiple Task tool calls. Never dispatch agents one-by-one when they are intended to run concurrently. Sequential one-by-one dispatch wastes time and defeats the purpose of wave planning.

Show a side-by-side comparison:

```
WRONG (sequential — do not do this):
  Message 1: Task(frontend agent) → wait for result
  Message 2: Task(backend agent) → wait for result

CORRECT (parallel — one message, all wave agents):
  Message 1: Task(frontend agent) + Task(backend agent) → wait for both
```

**3. Task Packet Construction**

Remind that the full Task Packet format is defined in `deep_plan/skills/sub-agents/contracts/task-packet.schema.md` and `deep_plan/skills/orchestra/references/task-packet-format.md`. Sub-agent-dispatch.md focuses on the dispatch mechanics, not the format definition.

When building a Task Packet for dispatch:
1. Start with the Task Packet template (all 8 sections)
2. Prepend wave context block if this is wave N+1 (using Wave N context injection format from `wave-planning.md`)
3. Include contract reference if the agent is part of a parallel pair (reference `orchestra/contracts.md` entry)
4. Include absolute file paths only — no relative paths

**4. Codex Mode: Template Injection**

When the detected platform is `codex`, prepend the agent role identity at the top of every Task Packet prompt:

```
You are the [Role] Agent for SmartSpecPro. [One-sentence description of role.]

[Then the full Task Packet follows]
```

Inject only the **identity and constraints** sections from `deep_plan/skills/sub-agents/agents/NAME.md`, not the full file. This keeps prompts within Codex's context limits. Specifically include:
- Identity paragraph (who the agent is)
- Constraints section (what it must not do)
- Skip: Workflow, Quality Checklist, Error Handling (these make prompts too long)

**5. Pre-Merge Security Gate Auto-Trigger**

After the final wave completes (all tasks done, no more waves pending), check whether the security gate must run before reporting completion. Read `deep_plan/skills/orchestra/references/security-review-protocol.md` for the full trigger condition list. The check belongs in SKILL.md Step 5 (result integration), not Step 6.

If any trigger condition matches, the conductor:
1. Builds 3 Task Packets (one per specialist: security-trpc, security-fastapi, security-frontend)
2. Dispatches all 3 in a single message (parallel)
3. Collects their Result Reports
4. Then dispatches security-review agent as aggregator with collected findings in its context
5. The security-review agent returns PASS/CONDITIONAL/FAIL verdict
6. Only then proceeds to Step 7 (progress update)

**Critical constraint:** The security-review agent is an aggregator — it receives pre-collected findings and returns a verdict. It does NOT dispatch further Task tool calls. Only the conductor dispatches.

**6. Background Flag Usage**

When dispatching agents that do not need to block the conductor's main workflow, use `background: true` in the Task tool call. Read-only analysis agents (research, reviewer, error-detective, security auditors) are safe to run as background agents. Writing agents that the next wave depends on must run in the foreground (`background: false` or omit flag).

---

## File 3: `deep_plan/skills/orchestra/references/platform-compat.md`

**Absolute path:** `/home/dev/projects/SmartSpecPro/deep_plan/skills/orchestra/references/platform-compat.md`

**Target size:** 100–200 lines

**Purpose:** Tells the conductor how to detect which AI platform it is running on and how to adapt dispatch behavior for that platform. Platform detection happens once per session (Step 4 of SKILL.md) and is persisted so it never needs to be asked again.

### Required Sections and Content

**1. Platform Detection Flow**

```
1. Check if `orchestra/platform.md` exists
   → Yes: read it, use the stored value, skip detection
   → No: proceed to step 2

2. Ask user once using AskUserQuestion:
   "Which AI platform are you running on?"
   Options:
   a) claude-code — Full features (native Task tool, parallel agents, worktree isolation)
   b) codex — Task tool available but subagent_type is general-purpose; inject agent templates
   c) open-code — No Task tool; conductor executes all roles sequentially inline

3. Write the user's answer to `orchestra/platform.md` (a single line: the platform name)

4. Never ask again for this session (and not in future sessions until platform.md is deleted)
```

**2. Claude Code Mode**

Full feature set available. Use the exact `subagent_type` values from the agent mapping table in `sub-agent-dispatch.md`. Parallel waves dispatch all agents in a single message. Use `isolation: worktree` for writing agents running in parallel.

Example Task Packet dispatch for claude-code (stub — show the pattern, not full implementation):

```
Dispatch (single message, both Task calls simultaneously):
  Task #1: subagent_type="general-purpose", background=true
    Prompt: [Full Task Packet for frontend agent]

  Task #2: subagent_type="backend-api-security:backend-architect", background=true
    Prompt: [Full Task Packet for backend agent]
```

**3. Codex Mode**

Task tool is available but `subagent_type` must be `general-purpose` for all agents (Codex does not support plugin agent types). To preserve agent specialization, inject the identity + constraints section from the corresponding `skills/sub-agents/agents/NAME.md` file at the top of each Task Packet prompt.

Example Task Packet dispatch for codex:

```
Task #1: subagent_type="general-purpose"
  Prompt:
    You are the Frontend Agent for SmartSpecPro. You implement React components
    following React 19, Wouter, Radix UI + CVA, TanStack Query conventions.
    You must not modify backend files.

    ---

    TASK: Add the UserDashboard page component
    DOMAIN: CMD-1 Frontend
    FILES: [absolute paths]
    CONTEXT: [prior wave results]
    CONSTRAINTS: [...]
    CONTRACT: [see orchestra/contracts.md — frontend ↔ backend contract]
    OUTPUT: [...]
    QUALITY GATE: [...]
```

Use condensed templates (identity + constraints only). Do not inject the full agent file — it inflates prompt size beyond what Codex handles reliably.

**4. Open-Code Mode**

No Task tool is available. The conductor adopts each agent's identity inline and executes sequentially.

**Scope cap:** Open-code mode is capped at `small` scope. For medium or larger scope tasks, print this warning and continue (do not block):

```
⚠️ This task requires parallel agents (medium+ scope). Open-code mode executes
sequentially, which will take longer and may lose cross-agent contract discipline.

Consider switching to Claude Code or Codex for better results.
Proceeding sequentially. You may want to use `/clear` between agent role
transitions to manage context window size.
```

When adopting an agent role inline, announce the role transition clearly:

```
--- [Adopting Frontend Agent role] ---
Following: React 19, Wouter, Radix UI + CVA, TanStack Query. Not modifying backend files.
```

After completing the inline task, announce the role exit:

```
--- [Returning to Orchestra Conductor role] ---
```

**5. Platform Reset**

If the user needs to change the platform after the initial selection:
- Have them delete `orchestra/platform.md`: `rm orchestra/platform.md`
- Or edit it directly with a text editor: change its contents to the new platform name
- On the next invocation of `/orchestra`, platform detection runs again (file missing = re-ask)

Document this in the file so users know the self-service path. The conductor must not provide a built-in "change platform" command — file-based reset is sufficient.

---

## Implementation Notes

### Writing Order Within This Section

Implement files in this order (each is independent, but this order makes review easier):
1. `wave-planning.md` — establishes the conceptual model (waves, contracts, concurrency)
2. `sub-agent-dispatch.md` — builds on wave concepts to explain dispatch mechanics
3. `platform-compat.md` — completes the picture by showing platform-specific adaptations

### SmartSpecPro-Specific Requirements

All three files must reference SmartSpecPro's actual stack. Do not use generic examples. Use:
- `apps/web/client/src/` for frontend paths
- `apps/web/server/routers/` for tRPC paths
- `apps/web/server/services/` for service layer paths
- `python-backend/app/api/v1/` for FastAPI paths
- `cd apps/web && pnpm check` for TypeScript validation
- `cd apps/web && pnpm test` for JS/TS test command
- `cd python-backend && ruff check app/` for Python linting
- `cd python-backend && pytest` for Python tests

### What NOT to Include

- Do not replicate the Task Packet schema — it lives in `contracts/task-packet.schema.md` (Section 01)
- Do not replicate agent identity definitions — they live in `sub-agents/agents/NAME.md` (Sections 07, 08)
- Do not replicate quality gate commands — they live in `quality-gates.md` (Section 04)
- Do not duplicate the bug sub-tree or scope/risk classification — those live in `task-analysis.md` (Section 02)

### File Path Conventions

All file paths in wave context injection blocks and contract examples must use absolute paths. The project root is `/home/dev/projects/SmartSpecPro/`. Always prefix example paths with this root, not with `./` or relative segments.

---

## Implementation Notes (Actual)

**Status:** COMPLETE

**Files created:**
- `/home/dev/projects/SmartSpecPro/deep_plan/skills/orchestra/references/wave-planning.md` (159 lines)
- `/home/dev/projects/SmartSpecPro/deep_plan/skills/orchestra/references/sub-agent-dispatch.md` (185 lines)
- `/home/dev/projects/SmartSpecPro/deep_plan/skills/orchestra/references/platform-compat.md` (181 lines)

**Deviations from plan:**
- wave-planning.md Section 2 includes a 6th wave-grouping guideline (TypeScript shared types
  must be in an earlier wave) — additive improvement, not in original plan
- platform-compat.md Task Packet examples use full 8-section format rather than the "stub"
  style the plan requested — more useful in practice
- Wave breakdown table originally used relative path `packages/shared/`; corrected to
  absolute path `/home/dev/projects/SmartSpecPro/packages/shared/` during code review

**Code review finding:** Reviewer flagged `backend-api-security:backend-architect` as
incorrect, claiming `multi-platform-apps:backend-architect` is the right value. This was
investigated and rejected — `backend-api-security:backend-architect` is the correct
installed Claude Code plugin ID. CLAUDE.md's orchestration matrix references a plugin that
may not be installed.

**Tests:** No executable tests (markdown-only deliverable). All TDD validation checks
verified via grep.

---

## Acceptance Criteria

All of the following must be true before this section is considered done:

1. `deep_plan/skills/orchestra/references/wave-planning.md` exists and covers:
   - Contract format with 3 required fields (shared interface, ownership boundaries, test boundary)
   - Wave grouping principle (no intra-wave file-level dependencies)
   - Wave N context injection format with the `[domain] description: /path — STATUS` pattern
   - All 4 parallelism hard constraints in a table
   - Circular dependency detection algorithm and resolution instruction

2. `deep_plan/skills/orchestra/references/sub-agent-dispatch.md` exists and covers:
   - Agent type mapping table for all 17 agents with Claude Code `subagent_type` values
   - Explicit parallel dispatch rule ("all agents in same wave in single message")
   - Codex template injection procedure (identity + constraints only, with framing sentence)
   - Pre-merge security gate auto-trigger flow (orchestra dispatches 3 specialists, then aggregator)
   - Background flag guidance

3. `deep_plan/skills/orchestra/references/platform-compat.md` exists and covers:
   - Detection flow with `orchestra/platform.md` as persistence mechanism
   - All 3 platform modes with concrete Task Packet dispatch examples
   - Open-code scope cap with exact warning message text
   - Platform reset instructions (delete/edit `orchestra/platform.md`)

4. Cross-references validate:
   - The 17 agent roles in `sub-agent-dispatch.md` match the 17 agent files to be created in sections 07 and 08
   - The 3 platform mode names match what SKILL.md Step 4 will use
   - The `subagent_type` values are valid Claude Code plugin IDs (not made-up names)