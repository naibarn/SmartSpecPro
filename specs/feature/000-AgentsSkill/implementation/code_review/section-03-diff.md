diff --git a/deep_plan/skills/orchestra/references/platform-compat.md b/deep_plan/skills/orchestra/references/platform-compat.md
new file mode 100644
index 0000000..6519f37
--- /dev/null
+++ b/deep_plan/skills/orchestra/references/platform-compat.md
@@ -0,0 +1,181 @@
+# Platform Compatibility
+
+Tells the conductor how to detect which AI platform it is running on and how to adapt
+dispatch behavior for that platform. Platform detection runs once per session (SKILL.md
+Step 4) and is persisted to `orchestra/platform.md` so it never needs to be asked again.
+
+---
+
+## 1. Platform Detection Flow
+
+```
+1. Check if `orchestra/platform.md` exists
+   → Yes: read it, use the stored platform name, skip to dispatch
+   → No: proceed to step 2
+
+2. Ask user once using AskUserQuestion:
+   "Which AI platform are you running on?"
+   Options:
+   a) claude-code  — Full features (native Task tool, parallel agents, worktree isolation)
+   b) codex        — Task tool available; subagent_type must be general-purpose; inject
+                     agent identity templates
+   c) open-code    — No Task tool; conductor executes all roles sequentially inline
+
+3. Write the user's answer to `orchestra/platform.md` (one line: the platform name)
+
+4. Never ask again for this session (or future sessions) until platform.md is deleted
+```
+
+**Platform names are case-sensitive:** Use exactly `claude-code`, `codex`, or `open-code`.
+
+---
+
+## 2. Claude Code Mode
+
+Full feature set available. Use exact `subagent_type` values from the agent mapping table
+in `sub-agent-dispatch.md`. Parallel waves dispatch all agents in a single message. Use
+`isolation: worktree` for writing agents running in parallel.
+
+**Dispatch example for a frontend + backend wave (claude-code):**
+
+```
+Dispatch (single message, both Task calls simultaneously):
+
+  Task #1:
+    subagent_type: "general-purpose"
+    background: true
+    prompt: |
+      TASK: Add the UserDashboard React page component
+      DOMAIN: CMD-1 Frontend
+      FILES:
+        - /home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Dashboard.tsx
+        - /home/dev/projects/SmartSpecPro/apps/web/client/src/components/StatsCard.tsx
+      CONTEXT: [wave N results block]
+      CONSTRAINTS: Do not modify server files. Use TanStack Query for data fetching.
+      CONTRACT: See orchestra/contracts.md — frontend ↔ backend — UserDashboard
+      OUTPUT: Dashboard.tsx + StatsCard.tsx created, tests passing
+      QUALITY GATE: cd apps/web && pnpm check && pnpm test
+
+  Task #2:
+    subagent_type: "backend-api-security:backend-architect"
+    background: true
+    prompt: |
+      TASK: Implement trpc.dashboard.getSummary procedure
+      DOMAIN: CMD-2 Backend
+      FILES:
+        - /home/dev/projects/SmartSpecPro/apps/web/server/routers/dashboard.ts
+        - /home/dev/projects/SmartSpecPro/apps/web/server/services/dashboardService.ts
+      CONTEXT: [wave N results block]
+      CONSTRAINTS: Enforce tenantId isolation. Validate input with Zod.
+      CONTRACT: See orchestra/contracts.md — frontend ↔ backend — UserDashboard
+      OUTPUT: dashboard.ts router + dashboardService.ts created, tests passing
+      QUALITY GATE: cd apps/web && pnpm check && pnpm test
+```
+
+---
+
+## 3. Codex Mode
+
+The Task tool is available but `subagent_type` must be `general-purpose` for all agents —
+Codex does not support plugin agent types. Preserve agent specialization by injecting
+the identity + constraints section from `deep_plan/skills/sub-agents/agents/NAME.md` at
+the top of each Task Packet prompt.
+
+See `sub-agent-dispatch.md` Section 4 for the full template injection procedure.
+
+**Dispatch example for a frontend agent (codex):**
+
+```
+Task #1:
+  subagent_type: "general-purpose"
+  prompt: |
+    You are the Frontend Agent for SmartSpecPro. You implement React 19 components
+    following Wouter routing, Radix UI + CVA patterns, and TanStack Query conventions.
+
+    Constraints: Do not modify backend files. Do not modify Python backend files.
+    Do not modify database schema. Stage changes only — do not commit.
+
+    ---
+
+    TASK: Add the UserDashboard page component
+    DOMAIN: CMD-1 Frontend
+    FILES:
+      - /home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Dashboard.tsx
+      - /home/dev/projects/SmartSpecPro/apps/web/client/src/components/StatsCard.tsx
+    CONTEXT:
+      ### Results from Wave N
+      - [backend] Added getSummary procedure: /home/dev/projects/SmartSpecPro/apps/web/server/routers/dashboard.ts — SUCCESS
+    CONSTRAINTS: [...]
+    CONTRACT: See orchestra/contracts.md — frontend ↔ backend — UserDashboard
+    OUTPUT: Dashboard.tsx and StatsCard.tsx created with passing tests
+    QUALITY GATE: cd apps/web && pnpm check && pnpm test
+```
+
+Use condensed templates (identity + constraints only). Do not inject the full agent file —
+it inflates prompt size beyond what Codex handles reliably.
+
+---
+
+## 4. Open-Code Mode
+
+No Task tool is available. The conductor adopts each agent's identity inline and executes
+tasks sequentially.
+
+**Scope cap:** Open-code mode is capped at `small` scope. For `medium` or larger scope
+tasks, print this exact warning and continue (do not block):
+
+```
+⚠️ This task requires parallel agents (medium+ scope). Open-code mode executes
+sequentially, which will take longer and may lose cross-agent contract discipline.
+
+Consider switching to Claude Code or Codex for better results.
+Proceeding sequentially. You may want to use `/clear` between agent role
+transitions to manage context window size.
+```
+
+**Role transition announcements (required in open-code mode):**
+
+When adopting an agent role inline, announce the transition clearly:
+
+```
+--- [Adopting Frontend Agent role] ---
+Following: React 19, Wouter, Radix UI + CVA, TanStack Query. Not modifying backend files.
+```
+
+After completing the inline task, announce the exit:
+
+```
+--- [Returning to Orchestra Conductor role] ---
+```
+
+**Dispatch example for a frontend task (open-code, inline):**
+
+```
+--- [Adopting Frontend Agent role] ---
+Following: React 19, Wouter, Radix UI + CVA, TanStack Query. Not modifying backend files.
+
+[Implements Dashboard.tsx and StatsCard.tsx inline]
+[Runs: cd apps/web && pnpm check && pnpm test]
+
+--- [Returning to Orchestra Conductor role] ---
+Wave 1 result: [frontend] Added Dashboard.tsx — SUCCESS
+Next: adopt backend agent role for getSummary procedure.
+```
+
+---
+
+## 5. Platform Reset
+
+If the user needs to change the platform after the initial selection:
+
+**Delete the file to re-prompt on next invocation:**
+```bash
+rm orchestra/platform.md
+```
+
+**Or edit it directly with any text editor** — change its single-line contents to the new
+platform name (`claude-code`, `codex`, or `open-code`).
+
+On the next invocation of `/orchestra`, the detection flow runs again (missing file →
+re-prompt). The conductor does not provide a built-in "change platform" command — file-based
+reset is the self-service path.
diff --git a/deep_plan/skills/orchestra/references/sub-agent-dispatch.md b/deep_plan/skills/orchestra/references/sub-agent-dispatch.md
new file mode 100644
index 0000000..8323c98
--- /dev/null
+++ b/deep_plan/skills/orchestra/references/sub-agent-dispatch.md
@@ -0,0 +1,185 @@
+# Sub-Agent Dispatch
+
+Tells the conductor exactly how to dispatch each of the 17 agent roles — which
+`subagent_type` to use per platform, how to inject wave context and contracts into Task
+Packets, and when the pre-merge security gate triggers automatically.
+
+For the Task Packet format definition, see:
+- `deep_plan/skills/sub-agents/contracts/task-packet.schema.md`
+- `deep_plan/skills/orchestra/references/task-packet-format.md`
+
+For wave grouping and contract format, see:
+- `deep_plan/skills/orchestra/references/wave-planning.md`
+
+---
+
+## 1. Agent Type Mapping Table
+
+For each of the 17 agent roles, the `subagent_type` for Claude Code mode and the fallback
+behavior for Codex/open-code are shown below. Agent identity files live in
+`deep_plan/skills/sub-agents/agents/NAME.md`.
+
+| Agent Role | Claude Code `subagent_type` | Codex Fallback | Open-Code Mode |
+|-----------|---------------------------|----------------|----------------|
+| research | `Explore` | `general-purpose` + injected template | Inline (conductor adopts role) |
+| architect | `Plan` | `general-purpose` + injected template | Inline |
+| frontend | `general-purpose` | `general-purpose` + injected template | Inline |
+| backend | `backend-api-security:backend-architect` | `general-purpose` + injected template | Inline |
+| python | `python-development:fastapi-pro` | `general-purpose` + injected template | Inline |
+| database | `general-purpose` | `general-purpose` + injected template | Inline (sequential only) |
+| test-qa | `general-purpose` | `general-purpose` + injected template | Inline |
+| reviewer | `Explore` | `general-purpose` + injected template | Inline |
+| security | `backend-api-security:backend-security-coder` | `general-purpose` + injected template | Inline |
+| debugger | `error-debugging:debugger` | `general-purpose` + injected template | Inline (sequential) |
+| error-detective | `error-debugging:error-detective` | `general-purpose` + injected template | Inline |
+| infrastructure | `Explore` (analysis) or `general-purpose` (write) | `general-purpose` + injected template | Inline |
+| docs-release | `general-purpose` | `general-purpose` + injected template | Inline |
+| security-review | `backend-api-security:backend-security-coder` | `general-purpose` + injected template | Inline |
+| security-trpc | `backend-api-security:backend-security-coder` | `general-purpose` + injected template | Inline |
+| security-fastapi | `backend-api-security:backend-security-coder` | `general-purpose` + injected template | Inline |
+| security-frontend | `Explore` | `general-purpose` + injected template | Inline |
+
+**13 general agents** (section-07): research, architect, frontend, backend, python, database,
+test-qa, reviewer, security, debugger, error-detective, infrastructure, docs-release
+
+**4 security specialists** (section-08): security-review, security-trpc, security-fastapi,
+security-frontend
+
+---
+
+## 2. Parallel Dispatch Rule
+
+> **All agents in the same wave MUST be dispatched in a single message containing multiple
+> Task tool calls. Never dispatch agents one-by-one when they are intended to run
+> concurrently. Sequential one-by-one dispatch wastes time and defeats the purpose of wave
+> planning.**
+
+```
+WRONG (sequential — do not do this):
+  Message 1: Task(frontend agent) → wait for result
+  Message 2: Task(backend agent) → wait for result
+
+CORRECT (parallel — one message, all wave agents):
+  Message 1: Task(frontend agent) + Task(backend agent) → wait for both results
+```
+
+The conductor's single message containing multiple Task calls causes the Task tool to
+dispatch all agents simultaneously. The conductor then waits for all results before
+proceeding to the next wave.
+
+---
+
+## 3. Task Packet Construction
+
+The full Task Packet format is defined in `deep_plan/skills/sub-agents/contracts/task-packet.schema.md`
+and `deep_plan/skills/orchestra/references/task-packet-format.md`. This file covers
+dispatch mechanics only.
+
+**When building a Task Packet for dispatch:**
+
+1. Start with all 8 sections from the Task Packet template (TASK, DOMAIN, FILES, CONTEXT,
+   CONSTRAINTS, CONTRACT, OUTPUT, QUALITY GATE)
+2. If this is wave N+1 or later, prepend the wave context block (see
+   `wave-planning.md` Section 4) to the CONTEXT section
+3. If the agent is part of a parallel pair, include the contract reference in the CONTRACT
+   section (point to the relevant entry in `orchestra/contracts.md`)
+4. Use absolute file paths only — never relative paths
+
+---
+
+## 4. Codex Mode: Template Injection
+
+When the detected platform is `codex`, prepend the agent role identity at the top of every
+Task Packet prompt:
+
+```
+You are the [Role] Agent for SmartSpecPro. [One-sentence description of the role's
+primary responsibility.]
+
+[Full Task Packet follows]
+```
+
+**Inject only identity and constraints** from `deep_plan/skills/sub-agents/agents/NAME.md`.
+Do not inject the full file — it inflates prompt size beyond what Codex handles reliably.
+
+**Include:**
+- Identity paragraph (who the agent is, what stack it specializes in)
+- Constraints section (what it must NOT do)
+
+**Skip:**
+- Workflow steps
+- Quality Checklist
+- Error Handling
+
+**Example injection prefix for frontend agent (Codex mode):**
+
+```
+You are the Frontend Agent for SmartSpecPro. You implement React 19 components following
+Wouter routing, Radix UI + CVA component patterns, and TanStack Query for server state.
+
+Constraints: Do not modify backend files. Do not modify database schema. Do not modify
+Python backend files. Do not commit directly — stage only.
+
+---
+
+TASK: Add the UserDashboard page component
+DOMAIN: CMD-1 Frontend
+...
+```
+
+---
+
+## 5. Pre-Merge Security Gate Auto-Trigger
+
+After the final wave completes (all tasks done, no more waves pending), check whether the
+security gate must run before reporting completion. Read
+`deep_plan/skills/orchestra/references/security-review-protocol.md` for the full trigger
+condition list. This check runs in **SKILL.md Step 5** (result integration), not Step 6.
+
+**If any trigger condition matches, the conductor:**
+
+1. Builds 3 Task Packets — one per specialist agent: `security-trpc`, `security-fastapi`,
+   `security-frontend`
+2. Dispatches all 3 in a single message (parallel)
+3. Collects their Result Reports
+4. Dispatches `security-review` as aggregator with the collected findings in its CONTEXT
+5. `security-review` returns a `PASS` / `CONDITIONAL` / `FAIL` verdict
+6. Only then proceeds to Step 7 (progress update)
+
+**Critical constraint:** `security-review` is an aggregator — it receives pre-collected
+findings and returns a verdict. It does **NOT** dispatch further Task tool calls. Only
+the orchestra conductor dispatches agents.
+
+**Dispatch pattern for security gate:**
+
+```
+CORRECT (orchestra dispatches 3 specialists in parallel):
+  Message 1: Task(security-trpc) + Task(security-fastapi) + Task(security-frontend)
+  [wait for all three]
+  Message 2: Task(security-review) with findings in context
+
+WRONG (security-review dispatching):
+  security-review calls Task(security-trpc) — NEVER do this
+```
+
+---
+
+## 6. Background Flag Usage
+
+When dispatching agents that do not need to block the conductor's main workflow, set
+`background: true` in the Task tool call.
+
+| Agent Type | Background Safe? | Reason |
+|-----------|-----------------|--------|
+| research | Yes | Read-only analysis; result injected into next wave context |
+| reviewer | Yes | Read-only review; result collected after wave |
+| error-detective | Yes | Log analysis; result collected asynchronously |
+| security-trpc | Yes | Read-only audit; results collected before security-review |
+| security-fastapi | Yes | Read-only audit |
+| security-frontend | Yes | Read-only audit |
+| frontend (writing) | No | Next wave depends on files written |
+| backend (writing) | No | Next wave depends on files written |
+| python (writing) | No | Next wave depends on files written |
+| database | No | Sequential-only; migration must complete before next step |
+| debugger | No | Investigation must conclude before fix can proceed |
+| security-review | No | Verdict must be received before reporting completion |
diff --git a/deep_plan/skills/orchestra/references/wave-planning.md b/deep_plan/skills/orchestra/references/wave-planning.md
new file mode 100644
index 0000000..f4ea8fd
--- /dev/null
+++ b/deep_plan/skills/orchestra/references/wave-planning.md
@@ -0,0 +1,159 @@
+# Wave Planning — Parallel Execution Model
+
+Wave planning structures parallel agent work into sequential waves. Each wave contains agents
+that share no file-level dependencies, allowing them to be dispatched concurrently. Waves
+execute one after another; each wave's output is injected as context into the next.
+
+**Goal:** Parallel speed without file conflicts. Agents in the same wave cannot see changes
+from each other — they only see the completed output of the previous wave.
+
+---
+
+## 1. Contract Definition Format
+
+Before dispatching any parallel agents, write contracts to `orchestra/contracts.md`. Each
+contract covers one pair (or group) of agents working in the same wave and must include all
+three required fields:
+
+### Required Fields
+
+**1. Shared Interface**
+The exact API boundary between the agents' work. Write this as a mini-specification, not
+prose:
+- Frontend ↔ Backend pair: tRPC procedure name, input Zod schema, and response shape
+- Backend ↔ Database pair: Drizzle query signature and returned columns
+- Python ↔ Node pair: HTTP endpoint path, request body shape, response JSON structure
+
+**2. Ownership Boundaries**
+A table listing each file and which agent owns it. No file may appear in two agents'
+ownership columns. If a file needs changes from both agents, split the changes into
+sequential waves (write the shared file in wave N; both agents consume it in wave N+1).
+
+**3. Test Boundary**
+What each agent is expected to test. The frontend agent tests the component render against
+the mocked API contract; the backend agent tests the tRPC handler with a real database
+call. Test boundaries prevent overlap and ensure coverage is complementary, not duplicated.
+
+> **Rule:** Parallel dispatch requires a contract — no contract = sequential execution.
+
+### Example Contract Stub
+
+```
+## Contract: frontend ↔ backend — UserDashboard feature
+
+### Shared Interface
+- Procedure: `trpc.dashboard.getSummary`
+- Input: `{ userId: string, tenantId: string }`
+- Response: `{ stats: DashboardStats; recentActivity: ActivityItem[] }`
+
+### Ownership Boundaries
+| File | Owner |
+|------|-------|
+| /home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Dashboard.tsx | frontend agent |
+| /home/dev/projects/SmartSpecPro/apps/web/client/src/components/StatsCard.tsx | frontend agent |
+| /home/dev/projects/SmartSpecPro/apps/web/server/routers/dashboard.ts | backend agent |
+| /home/dev/projects/SmartSpecPro/apps/web/server/services/dashboardService.ts | backend agent |
+
+### Test Boundary
+- frontend: test component renders with mocked `getSummary` response
+- backend: test `getSummary` procedure with Drizzle test DB, verify tenantId isolation
+```
+
+---
+
+## 2. Wave Grouping Rules
+
+**Core principle:** Tasks in the same wave have no file-level dependencies on each other.
+A task belongs to wave N+1 if and only if it requires the output of a wave N task.
+
+**Grouping guidelines:**
+
+1. Read the ownership boundaries of all planned tasks
+2. If task A writes files that task B reads or imports, B goes in a later wave
+3. If tasks A and B share no files and have no import relationship, they can run in the
+   same wave
+4. Database migrations always occupy their own wave (1 DB agent constraint — see Section 3)
+5. Git operations (commit, branch) always occupy their own wave (1 git agent constraint)
+6. TypeScript types shared between frontend and backend must be written in wave N before
+   both consumers run in wave N+1
+
+**Example wave breakdown for a tRPC endpoint + React page:**
+
+| Wave | Tasks | Reason |
+|------|-------|--------|
+| Wave 1 | Write shared Zod schema in `packages/shared/` | Foundation — no dependencies |
+| Wave 2 | Backend tRPC router + Frontend React page | Both depend on Wave 1 schema, not on each other |
+| Wave 3 | Integration tests | Depends on both Wave 2 outputs |
+| Wave 4 | Git commit | Depends on all tests passing |
+
+---
+
+## 3. Parallelism Hard Constraints
+
+These limits are non-negotiable. The conductor must enforce them when building the wave plan:
+
+| Constraint | Limit | Enforcement |
+|-----------|-------|-------------|
+| Concurrent agents | Max 4 | Count active Task tool calls; queue excess into the next sub-wave |
+| File-editing agents in parallel | Max 2 | Use `isolation: worktree` for parallel writers; if more than 2 write tasks are needed, split into sub-waves |
+| DB agents active simultaneously | 1 | Database tasks always run alone in their wave |
+| Git agents active simultaneously | 1 | Git tasks always run alone in their wave |
+| Parallel dispatch without contract | Not allowed | Write contract first; if contract is missing, dispatch sequentially |
+
+**Worktree isolation note:** When `isolation: worktree` is used, each agent works in a
+separate git worktree and the conductor merges afterward. Do not use worktree isolation if
+agents share no files — it adds merge overhead with no benefit.
+
+---
+
+## 4. Wave N Context Injection Format
+
+When injecting results from wave N into wave N+1 Task Packets, use this structured format.
+Do **not** dump raw conversation history.
+
+```
+### Results from Wave N
+- [frontend] Added StatsCard component: /home/dev/projects/SmartSpecPro/apps/web/client/src/components/StatsCard.tsx — SUCCESS
+- [backend] Added getSummary tRPC procedure: /home/dev/projects/SmartSpecPro/apps/web/server/routers/dashboard.ts — SUCCESS
+- Open contract note: Backend returns `stats.activeUsers` as `number`, not `string`. Frontend must not call `parseInt()`.
+```
+
+**Context injection rules:**
+- **Include:** Absolute file paths, one-line change descriptions, status (`SUCCESS` / `PARTIAL` / `FAILED`), cross-agent contract notes
+- **Exclude:** Raw conversation transcripts, full file contents, internal agent reasoning, intermediate debugging output
+- **Placement:** Prepend this block at the top of every wave N+1 Task Packet CONTEXT section
+
+All paths must be absolute (prefixed with `/home/dev/projects/SmartSpecPro/`). Never use
+relative paths (`./`, `../`) in context injection blocks.
+
+---
+
+## 5. Circular Dependency Detection
+
+A cycle is present when no tasks are ready — all remaining tasks depend on other remaining
+tasks.
+
+**Detection algorithm:**
+
+1. After each wave, compute the set of tasks whose dependencies are all marked `COMPLETE`
+2. If this set is empty but the pending task list is non-empty: **cycle detected**
+3. Stop dispatch. Report to the user with the full dependency chain that forms the cycle
+4. Ask the user to resolve — split the circular dependency or reorder tasks
+5. Do not attempt to auto-resolve cycles. They indicate a planning error that requires human
+   judgment.
+
+**Example cycle report to user:**
+
+```
+⚠️ Circular dependency detected. No tasks are ready to execute.
+
+Cycle:
+  auth-middleware depends on → user-service
+  user-service       depends on → session-store
+  session-store      depends on → auth-middleware
+
+Resolution options:
+  a) Extract the shared interface into a separate Wave 1 task that all three depend on
+  b) Reorder: implement session-store first (no runtime dep on auth), then auth-middleware,
+     then user-service
+```
