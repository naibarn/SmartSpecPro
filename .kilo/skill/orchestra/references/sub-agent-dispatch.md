# Sub-Agent Dispatch

Tells the conductor exactly how to dispatch each of the 29 agent roles — which
`subagent_type` to use per platform, how to inject wave context and contracts into Task
Packets, and when the pre-merge security gate triggers automatically.

For the Task Packet format definition, see:
- `../../sub-agents/contracts/task-packet.schema.md`
- `task-packet-format.md`

For wave grouping and contract format, see:
- `wave-planning.md`

---

## 1. Agent Type Mapping Table

For each of the 29 agent roles, the `subagent_type` for Claude Code mode and the fallback
behavior for Standard/open-code are shown below. Agent identity files live in
`../../sub-agents/agents/NAME.md`.

| Agent Role | Claude Code `subagent_type` | Standard Fallback | Open-Code Mode |
|-----------|---------------------------|----------------|----------------|
| product-ux | `Plan` | `general-purpose` + injected template | Inline |
| research | `Explore` | `general-purpose` + injected template | Inline (conductor adopts role) |
| architect | `Plan` | `general-purpose` + injected template | Inline |
| frontend | `general-purpose` | `general-purpose` + injected template | Inline |
| backend | `backend-api-security:backend-architect` | `general-purpose` + injected template | Inline |
| python | `python-development:fastapi-pro` | `general-purpose` + injected template | Inline |
| database | `general-purpose` | `general-purpose` + injected template | Inline (sequential only) |
| test-qa | `general-purpose` | `general-purpose` + injected template | Inline |
| e2e-playwright | `general-purpose` | `general-purpose` + injected template | Inline |
| reviewer | `Explore` | `general-purpose` + injected template | Inline |
| security | `backend-api-security:backend-security-coder` | `general-purpose` + injected template | Inline |
| debugger | `error-debugging:debugger` | `general-purpose` + injected template | Inline (sequential) |
| error-detective | `error-debugging:error-detective` | `general-purpose` + injected template | Inline |
| infrastructure | `Explore` (analysis) or `general-purpose` (write) | `general-purpose` + injected template | Inline |
| performance | `general-purpose` | `general-purpose` + injected template | Inline |
| ci-release | `general-purpose` | `general-purpose` + injected template | Inline (sequential only) |
| dependency-supply-chain | `general-purpose` | `general-purpose` + injected template | Inline |
| docs-release | `general-purpose` | `general-purpose` + injected template | Inline |
| security-review | `Explore` | `general-purpose` + injected template | Inline |
| security-trpc | `backend-api-security:backend-security-coder` | `general-purpose` + injected template | Inline |
| security-fastapi | `backend-api-security:backend-security-coder` | `general-purpose` + injected template | Inline |
| security-frontend | `backend-api-security:backend-security-coder` | `general-purpose` + injected template | Inline |
| visual-ui-requirement-analyzer | `Plan` | `general-purpose` + injected template | Inline |
| visual-ui-direction | `Plan` | `general-purpose` + injected template | Inline |
| ui-builder | `general-purpose` | `general-purpose` + injected template | Inline |
| visual-ux-reviewer | `Explore` | `general-purpose` + injected template | Inline |
| accessibility-reviewer | `Explore` | `general-purpose` + injected template | Inline |
| responsive-reviewer | `Explore` | `general-purpose` + injected template | Inline |
| visual-final-refactor | `general-purpose` | `general-purpose` + injected template | Inline |

**25 general agents** (section-07): product-ux, research, architect, frontend, backend,
python, database, test-qa, e2e-playwright, reviewer, security, debugger, error-detective,
infrastructure, performance, ci-release, dependency-supply-chain, docs-release,
visual-ui-requirement-analyzer, visual-ui-direction, ui-builder, visual-ux-reviewer,
accessibility-reviewer, responsive-reviewer, visual-final-refactor

**4 security specialists** (section-08): security-review, security-trpc, security-fastapi,
security-frontend

---

## 2. Parallel Dispatch Rule

> **If the active platform exposes a Task/sub-agent tool, launch all independent agents in the same wave in one dispatch batch. If it does not, preserve the same wave plan and execute them sequentially inline.**

```
WRONG (sequential — do not do this):
  Message 1: Task(frontend agent) → wait for result
  Message 2: Task(backend agent) → wait for result

CORRECT (parallel — one message, all wave agents):
  Message 1: Task(frontend agent) + Task(backend agent) → wait for both results
```

On platforms with a Task/sub-agent tool, the conductor's single dispatch batch causes all agents to start concurrently. On platforms without that tool, the conductor executes the same wave sequentially and records each result before proceeding.

---

## 3. Task Packet Construction

The full Task Packet format is defined in `../../sub-agents/contracts/task-packet.schema.md`
and `task-packet-format.md`. This file covers
dispatch mechanics only.

**When building a Task Packet for dispatch:**

1. Start with all 8 sections from the Task Packet template (TASK, DOMAIN, FILES, CONTEXT,
   CONSTRAINTS, CONTRACT, OUTPUT, QUALITY GATE)
2. If this is wave N+1 or later, prepend the wave context block (see
   `wave-planning.md` Section 4) to the CONTEXT section
3. If the agent is part of a parallel pair, include the contract reference in the CONTRACT
   section (point to the relevant entry in `orchestra/contracts.md`)
4. Use absolute file paths only — never relative paths

---

## 4. Standard Mode: Template Injection

When the detected platform is `standard`, prepend the agent role identity at the top of every
Task Packet prompt:

```
You are the [Role] Agent for the active codebase. [One-sentence description of the role's
primary responsibility.]

[Full Task Packet follows]
```

**Inject only identity and constraints** from `../../sub-agents/agents/NAME.md`.
Do not inject the full file — it inflates prompt size beyond what Standard mode handles reliably.

**Include:**
- Identity paragraph (who the agent is, what stack it specializes in)
- Constraints section (what it must NOT do)

**Skip:**
- Workflow steps
- Quality Checklist
- Error Handling

**Example injection prefix for frontend agent (Standard mode):**

```
You are the Frontend Agent for the active codebase. You implement React 19 components following
Wouter routing, Radix UI + CVA component patterns, and TanStack Query for server state.

Constraints: Do not modify backend files. Do not modify database schema. Do not modify
Python backend files. Do not commit directly — stage only.

---

TASK: Add the UserDashboard page component
DOMAIN: CMD-1 Frontend
...
```

---

## 5. Pre-Merge Security Gate Auto-Trigger

After the final wave completes (all tasks done, no more waves pending), check whether the
security gate must run before reporting completion. Read
`security-review-protocol.md` for the full trigger
condition list. This check runs in **SKILL.md Step 5** (result integration), not Step 6.

**If any trigger condition matches, the conductor:**

1. Builds 3 Task Packets — one per specialist agent: `security-trpc`, `security-fastapi`,
   `security-frontend`
2. Dispatches all 3 in a single message (parallel)
3. Collects their Result Reports
4. Dispatches `security-review` as aggregator with the collected findings in its CONTEXT
5. `security-review` returns a `PASS` / `CONDITIONAL` / `FAIL` verdict
6. Only then proceeds to Step 7 (progress update)

**Critical constraint:** `security-review` is an aggregator — it receives pre-collected
findings and returns a verdict. It does **NOT** dispatch further Task tool calls. Only
the orchestra conductor dispatches agents.

**Dispatch pattern for security gate:**

```
CORRECT (orchestra dispatches 3 specialists in parallel):
  Message 1: Task(security-trpc) + Task(security-fastapi) + Task(security-frontend)
  [wait for all three]
  Message 2: Task(security-review) with findings in context

WRONG (security-review dispatching):
  security-review calls Task(security-trpc) — NEVER do this
```

---

## 6. Background Flag Usage

When dispatching agents that do not need to block the conductor's main workflow, set
`background: true` in the Task tool call.

| Agent Type | Background Safe? | Reason |
|-----------|-----------------|--------|
| product-ux | Yes | Read-only product analysis; result injected into planning/architecture context |
| research | Yes | Read-only analysis; result injected into next wave context |
| reviewer | Yes | Read-only review; result collected after wave |
| error-detective | Yes | Log analysis; result collected asynchronously |
| dependency-supply-chain | Yes | Usually read-heavy audit; block before changes if broad lockfile updates are needed |
| security-trpc | Yes | Read-only audit; results collected before security-review |
| security-fastapi | Yes | Read-only audit |
| security-frontend | Yes | Read-only audit |
| visual-ui-requirement-analyzer | Yes | Read-only UI requirement analysis |
| visual-ui-direction | Yes | Read-only visual direction |
| visual-ux-reviewer | Yes | Read-only UX review |
| accessibility-reviewer | Yes | Read-only accessibility review |
| responsive-reviewer | Yes | Read-only responsive review |
| frontend (writing) | No | Next wave depends on files written |
| ui-builder (writing) | No | Next wave depends on files written |
| visual-final-refactor (writing) | No | Final patch depends on collected review findings |
| backend (writing) | No | Next wave depends on files written |
| python (writing) | No | Next wave depends on files written |
| database | No | Sequential-only; migration must complete before next step |
| e2e-playwright | No | Browser tests usually depend on app state and generated artifacts |
| performance | No | Baseline/verification must be serialized around the code under test |
| ci-release | No | Workflow/release gate changes are serialized with git and deploy state |
| debugger | No | Investigation must conclude before fix can proceed |
| security-review | No | Verdict must be received before reporting completion |
