# Wave Planning — Parallel Execution Model

Wave planning structures parallel agent work into sequential waves. Each wave contains agents
that share no file-level dependencies, allowing them to be dispatched concurrently. Waves
execute one after another; each wave's output is injected as context into the next.

**Goal:** Parallel speed without file conflicts. Agents in the same wave cannot see changes
from each other — they only see the completed output of the previous wave.

---

## 1. Contract Definition Format

Before dispatching any parallel agents, write contracts to `orchestra/contracts.md`. Each
contract covers one pair (or group) of agents working in the same wave and must include all
three required fields:

### Required Fields

**1. Shared Interface**
The exact API boundary between the agents' work. Write this as a mini-specification, not
prose:
- Frontend ↔ Backend pair: tRPC procedure name, input Zod schema, and response shape
- Backend ↔ Database pair: Drizzle query signature and returned columns
- Python ↔ Node pair: HTTP endpoint path, request body shape, response JSON structure

**2. Ownership Boundaries**
A table listing each file and which agent owns it. No file may appear in two agents'
ownership columns. If a file needs changes from both agents, split the changes into
sequential waves (write the shared file in wave N; both agents consume it in wave N+1).

**3. Test Boundary**
What each agent is expected to test. The frontend agent tests the component render against
the mocked API contract; the backend agent tests the tRPC handler with a real database
call. Test boundaries prevent overlap and ensure coverage is complementary, not duplicated.

> **Rule:** Parallel dispatch requires a contract — no contract = sequential execution.

### Example Contract Stub

```
## Contract: frontend ↔ backend — UserDashboard feature

### Shared Interface
- Procedure: `trpc.dashboard.getSummary`
- Input: `{ userId: string, tenantId: string }`
- Response: `{ stats: DashboardStats; recentActivity: ActivityItem[] }`

### Ownership Boundaries
| File | Owner |
|------|-------|
| <absolute-repo-root>/apps/web/client/src/pages/Dashboard.tsx | frontend agent |
| <absolute-repo-root>/apps/web/client/src/components/StatsCard.tsx | frontend agent |
| <absolute-repo-root>/apps/web/server/routers/dashboard.ts | backend agent |
| <absolute-repo-root>/apps/web/server/services/dashboardService.ts | backend agent |

### Test Boundary
- frontend: test component renders with mocked `getSummary` response
- backend: test `getSummary` procedure with Drizzle test DB, verify tenantId isolation
```

---

## 2. Wave Grouping Rules

**Core principle:** Tasks in the same wave have no file-level dependencies on each other.
A task belongs to wave N+1 if and only if it requires the output of a wave N task.

**Grouping guidelines:**

1. Read the ownership boundaries of all planned tasks
2. If task A writes files that task B reads or imports, B goes in a later wave
3. If tasks A and B share no files and have no import relationship, they can run in the
   same wave
4. Database migrations always occupy their own wave (1 DB agent constraint — see Section 3)
5. Git operations (commit, branch) always occupy their own wave (1 git agent constraint)
6. TypeScript types shared between frontend and backend must be written in wave N before
   both consumers run in wave N+1

**Example wave breakdown for a tRPC endpoint + React page:**

| Wave | Tasks | Reason |
|------|-------|--------|
| Wave 1 | Write shared Zod schema in `<absolute-repo-root>/packages/shared/` | Foundation — no dependencies |
| Wave 2 | Backend tRPC router + Frontend React page | Both depend on Wave 1 schema, not on each other |
| Wave 3 | Integration tests | Depends on both Wave 2 outputs |
| Wave 4 | Git commit | Depends on all tests passing |

---

## 3. Parallelism Hard Constraints

These limits are non-negotiable. The conductor must enforce them when building the wave plan:

| Constraint | Limit | Enforcement |
|-----------|-------|-------------|
| Concurrent agents | Max 4 | Count active Task tool calls; queue excess into the next sub-wave |
| File-editing agents in parallel | Max 2 | Use `isolation: worktree` for parallel writers; if more than 2 write tasks are needed, split into sub-waves |
| DB agents active simultaneously | 1 | Database tasks always run alone in their wave |
| Git agents active simultaneously | 1 | Git tasks always run alone in their wave |
| Parallel dispatch without contract | Not allowed | Write contract first; if contract is missing, dispatch sequentially |

**Worktree isolation note:** When `isolation: worktree` is used, each agent works in a
separate git worktree and the conductor merges afterward. Do not use worktree isolation if
agents share no files — it adds merge overhead with no benefit.

---

## 4. Wave N Context Injection Format

When injecting results from wave N into wave N+1 Task Packets, use this structured format.
Do **not** dump raw conversation history.

```
### Results from Wave N
- [frontend] Added StatsCard component: <absolute-repo-root>/apps/web/client/src/components/StatsCard.tsx — SUCCESS
- [backend] Added getSummary tRPC procedure: <absolute-repo-root>/apps/web/server/routers/dashboard.ts — SUCCESS
- Open contract note: Backend returns `stats.activeUsers` as `number`, not `string`. Frontend must not call `parseInt()`.
```

**Context injection rules:**
- **Include:** Absolute file paths, one-line change descriptions, status (`SUCCESS` / `PARTIAL` / `FAILED`), cross-agent contract notes
- **Exclude:** Raw conversation transcripts, full file contents, internal agent reasoning, intermediate debugging output
- **Placement:** Prepend this block at the top of every wave N+1 Task Packet CONTEXT section

All paths must be absolute (prefixed with `<absolute-repo-root>/`). Never use
relative paths (`./`, `../`) in context injection blocks.

---

## 5. Circular Dependency Detection

A cycle is present when no tasks are ready — all remaining tasks depend on other remaining
tasks.

**Detection algorithm:**

1. After each wave, compute the set of tasks whose dependencies are all marked `COMPLETE`
2. If this set is empty but the pending task list is non-empty: **cycle detected**
3. Stop dispatch. Report to the user with the full dependency chain that forms the cycle
4. Ask the user to resolve — split the circular dependency or reorder tasks
5. Do not attempt to auto-resolve cycles. They indicate a planning error that requires human
   judgment.

**Example cycle report to user:**

```
⚠️ Circular dependency detected. No tasks are ready to execute.

Cycle:
  auth-middleware depends on → user-service
  user-service       depends on → session-store
  session-store      depends on → auth-middleware

Resolution options:
  a) Extract the shared interface into a separate Wave 1 task that all three depend on
  b) Reorder: implement session-store first (no runtime dep on auth), then auth-middleware,
     then user-service
```
