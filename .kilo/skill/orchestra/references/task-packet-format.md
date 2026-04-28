# Task Packet Construction Guide (Conductor Reference)

This document is the conductor's reference for **building** Task Packets. It covers the same 8-field schema as `../../sub-agents/contracts/task-packet.schema.md` but from the perspective of the `/orchestra` conductor writing packets — not agents reading them.

**Read `task-packet.schema.md` first** to understand what each field means. This document focuses on *how to construct a correct packet* before dispatching.

---

## Construction Checklist

Before dispatching any Task Packet, verify all of the following:

- [ ] **TASK** starts with an imperative verb and names the exact target (not just the feature area)
- [ ] **DOMAIN** matches the `subagent_type` you will use in the Task tool call
- [ ] **FILES** uses absolute paths only (`<absolute-repo-root>/...`) — no relative paths
- [ ] **CONTEXT** includes the actual error text or audit log traceId (not a paraphrase)
- [ ] **CONSTRAINTS** lists every file/table the agent must not touch
- [ ] **CONTRACT** is filled in for parallel agents, or explicitly `N/A` for solo agents
- [ ] **OUTPUT** names the specific file to modify or the report format to return
- [ ] **QUALITY GATE** contains exact shell commands, not descriptions

---

## Field-by-Field Construction Guide

### TASK

Write the task as though it is a Git commit message subject line: imperative, specific, ≤80 characters if possible.

**Conductor note:** If you find yourself writing "look at X" or "investigate Y", you have not decided what to do yet. Finish your analysis before dispatching. Agents that receive vague tasks produce vague outputs.

**Good:** `Add Zod validation to the createSkill tRPC procedure`
**Bad:** `Check the skills router for issues`

---

### DOMAIN

Match the domain to the `subagent_type` you will pass to the `Task` tool:

| DOMAIN | subagent_type | Edits files in |
|--------|---------------|----------------|
| CMD-0 Product UX | `Plan` | Read-only product/UX brief |
| CMD-1 Frontend | `general-purpose` | `apps/web/client/src/`, `packages/ui/` |
| CMD-2 Backend | `backend-api-security:backend-architect` | `apps/web/server/`, `packages/shared/` |
| CMD-3 Python | `python-development:fastapi-pro` | `python-backend/app/` |
| CMD-4 Database | `general-purpose` (write) or `Explore` (analysis) | `apps/web/drizzle/`, `packages/db/` |
| CMD-5 Infra | `Explore` (analysis) or `general-purpose` (write) | `docker/`, `nginx/`, `docker-compose*.yml` |
| CMD-6 Security | `backend-api-security:backend-security-coder` | Audit only or targeted fixes |
| CMD-7 Debug | `error-debugging:debugger` or `error-debugging:error-detective` | Targeted fix or read-only investigation |
| CMD-8 QA | `general-purpose` or `Explore` | Tests/review reports |
| CMD-8E E2E | `general-purpose` | Playwright/browser tests and minimal selectors |
| CMD-9 Performance | `general-purpose` | Performance-sensitive source/config after baseline |
| CMD-10 CI Release | `general-purpose` | `.github/workflows/`, workflow scripts, release docs |
| CMD-11 Supply Chain | `general-purpose` | Manifests, lockfiles, Dockerfiles, workflow versions |
| CMD-12 Visual UI | `Plan`, `Explore`, or `general-purpose` | UI requirement briefs, visual direction, Tailwind/shadcn UI patches, UX/a11y/responsive review |

---

### FILES

**Construction rule:** List every file the agent needs to *read* to understand the codebase, plus every file the agent will *write or modify*. If an agent writes a new file that does not exist yet, include the target path anyway — this signals to the agent where to create it.

**Conductor note:** Agents that receive incomplete file lists make assumptions, read wrong files, and produce incorrect implementations. Err on the side of including more files.

**Resolution shortcut:** If unsure which files are relevant, run a quick Grep before dispatching:
```bash
grep -r "functionName" <absolute-repo-root>/apps/web/server/ --include="*.ts" -l
```

---

### CONTEXT

**Construction rule:** Copy-paste the actual error message, not a summary. If you are dispatching a bug-fix agent, include:
1. The exact error text (stack trace, message)
2. The file:line where it originated
3. What was already tried and why it failed
4. The relevant audit log traceId if it is an LLM/media call

**For a new-feature wave:** Describe what the previous wave did and what this wave must build on top of.

---

### CONSTRAINTS

**Construction rule:** Write constraints as if you are writing a code review comment to a junior developer who will do exactly what you say and nothing more. Be explicit about:
- Off-limits files/tables (especially the database schema if migration is complete)
- Coding conventions the agent must follow for this domain
- API surface shapes the agent must preserve

**Conductor note:** The most common constraint violation is a backend agent modifying shared types in ways that break the frontend. Always add: "Do not change the response type shape if it is already in the CONTRACT."

---

### CONTRACT

**Construction rule:** Use the CONTRACT field whenever two or more agents in the same wave must interoperate. The conductor sets the contract *before* dispatching — neither agent defines it unilaterally.

**What to include:**
- The shared TypeScript type name and its fields
- The exact tRPC procedure name and route
- Which agent "owns" the contract (the one that cannot change it once set)

**When to write N/A:** Solo agents (single dispatch, no parallel counterparts) always get `CONTRACT: N/A`.

**Conductor note:** If you set a contract and then one agent changes the shared type, you must re-dispatch the other agent with updated CONTEXT explaining the contract change. Never let agents silently drift from the contract.

---

### OUTPUT

**Construction rule:** The OUTPUT must be parseable. When you integrate the result (SKILL.md Step 5), you need to know exactly what to look for. Write the output spec as a checklist:

```
OUTPUT:
  Modify /home/dev/projects/.../skills.ts:
    - Add createSkillInput Zod schema above router definition
    - Apply .input(createSkillInput) to the create procedure
  Return a Result Report per result-report.schema.md with status success or partial.
```

---

### QUALITY GATE

**Construction rule:** Copy the exact command from the active plan artifacts or the project's docs. Prefer commands already recorded in `implementation-plan.md`, `sections/index.md`, or repo-level task docs. Do not paraphrase. If the command requires a specific working directory, include `cd X &&` in the gate.

**repository quality gates by domain:**

| Domain | Gate command |
|--------|-------------|
| TypeScript (web) | `cd <absolute-repo-root>/apps/web && pnpm check` |
| Tests (web) | `cd <absolute-repo-root>/apps/web && pnpm test` |
| Python type check | `cd <absolute-repo-root>/python-backend && mypy app/` |
| Python lint | `cd <absolute-repo-root>/python-backend && ruff check app/` |
| Python tests | `cd <absolute-repo-root>/python-backend && pytest` |
| E2E browser | Use discovered Playwright command, or dispatch `e2e-playwright.md` |
| Workflow validation | `cd <absolute-repo-root> && bash .github/workflows/tests/workflow-validation.test.sh` |
| Skill pack validation | `cd <absolute-repo-root> && bash skills/audit-skills.sh` |
| Visual UI validation | `cd <absolute-repo-root>/apps/web && pnpm check` plus visual polish/accessibility/responsive checklist |
| Dependency audit | Use ecosystem-specific audit/tree command if installed; otherwise dispatch `dependency-supply-chain.md` |
| Read-only audit | `skipped (read-only — no files modified)` |

---

## Platform-Mode Notes

The Task Packet format is identical across all three platforms. What changes is how you *dispatch* it.

### Mode: `claude-code` (default)

Standard dispatch via the Task tool:

```
Task(
  subagent_type="backend-api-security:backend-architect",
  prompt="
    TASK: Add Zod validation to createSkill procedure
    DOMAIN: CMD-2 Backend
    FILES: ...
    CONTEXT: ...
    CONSTRAINTS: ...
    CONTRACT: N/A
    OUTPUT: ...
    QUALITY GATE: cd apps/web && pnpm check
  "
)
```

Use the `subagent_type` that matches the DOMAIN (see domain table above).

---

### Mode: `standard`

If this environment exposes a general-purpose sub-agent tool, do not rely on `subagent_type` specialization. Prepend only the condensed identity + constraints from the agent definition before the Task Packet. If no sub-agent tool is available, use the inline fallback described below:

```
Task(
  subagent_type="general-purpose",
  prompt="
    [Condensed identity + constraints from ../../sub-agents/agents/backend.md]

    ---

    TASK: Add Zod validation to createSkill procedure
    DOMAIN: CMD-2 Backend
    FILES: ...
    ...
  "
)
```

**Scope cap warning:** Standard mode agents have a smaller context window. If the injected identity + packet exceeds 8,000 tokens, split the packet into two dispatches (reduce FILES and CONSTRAINTS per dispatch). If the environment does not expose a sub-agent tool, run the role inline instead of forcing a fake Task call.

---

### Mode: `open-code`

No Task tool is available. The conductor adopts the agent identity and executes inline:

1. Read `../../sub-agents/agents/NAME.md`
2. Follow its Workflow section step-by-step, in-context
3. Apply all Constraints and Quality Checklist items manually
4. Write the Result Report inline and continue

**Scope cap:** In open-code mode, limit each "dispatch" to one file or one logical unit of work. Do not attempt multi-file changes in a single inline execution.

**Platform reset:** If the platform changes mid-session (e.g., switching from open-code to claude-code after getting access), run the R4 resume algorithm from `session-resume.md` before continuing with new dispatches.

---

## Worked Construction Examples

### Example 1 — Backend Agent: Adding a tRPC Router

**Situation:** Wave 2. Wave 1 created the Drizzle schema migration. Now adding the `skills.list` tRPC procedure.

```
TASK: Add a `skills.list` tRPC query procedure to
      <absolute-repo-root>/apps/web/server/routers/skills.ts
      that returns all skills for the authenticated tenant, paginated (page, limit).

DOMAIN: CMD-2 Backend

FILES:
  Read:
    - <absolute-repo-root>/apps/web/server/routers/skills.ts
    - <absolute-repo-root>/apps/web/drizzle/schema.ts
    - <absolute-repo-root>/apps/web/server/middleware/auth.ts
    - <absolute-repo-root>/apps/web/server/trpc.ts
  Write:
    - <absolute-repo-root>/apps/web/server/routers/skills.ts

CONTEXT:
  The `skills` table was added in drizzle migration 0030. The schema has columns:
  id (uuid, PK), tenantId (uuid, FK), name (text), category (text), createdAt (timestamp).
  The skills router currently only has the `create` procedure. This wave adds `list`.
  Auth middleware sets ctx.tenantId from the JWT session cookie.

CONSTRAINTS:
  - Do NOT modify the database schema (migration 0030 is already applied)
  - Do NOT modify frontend files in apps/web/client/
  - Every query MUST filter by ctx.tenantId
  - Use Drizzle `.where(eq(skills.tenantId, ctx.tenantId))`
  - Validate page and limit with Zod: page (number, min 1), limit (number, 1–100)

CONTRACT:
  Response type: { items: SkillSummary[]; total: number; page: number; limit: number }
  SkillSummary: { id: string; name: string; category: string; createdAt: string }
  Frontend agent (CMD-1) will implement SkillCard against this exact shape.
  Do NOT change the response shape once this packet is dispatched.

OUTPUT:
  Modify <absolute-repo-root>/apps/web/server/routers/skills.ts:
    - Export `SkillSummary` type at the top of the file
    - Add `list` query procedure with Zod input { page: z.number().min(1), limit: z.number().min(1).max(100) }
    - Return paginated result matching the CONTRACT shape
  Return a Result Report per result-report.schema.md.

QUALITY GATE:
  - TypeScript: cd <absolute-repo-root>/apps/web && pnpm check
  - Tests: cd <absolute-repo-root>/apps/web && pnpm test
```

---

### Example 2 — Frontend Agent: Building UI against the backend contract

**Situation:** Wave 2, parallel with Example 1. CMD-1 Frontend builds SkillCard component.

```
TASK: Create <absolute-repo-root>/apps/web/client/src/components/skills/SkillCard.tsx
      that displays skill name, category badge, and a "Run" button using the skills.list response.

DOMAIN: CMD-1 Frontend

FILES:
  Read:
    - <absolute-repo-root>/apps/web/client/src/pages/SkillsPage.tsx
    - <absolute-repo-root>/apps/web/client/src/utils/trpc.ts
    - <absolute-repo-root>/packages/ui/src/components/
  Write:
    - <absolute-repo-root>/apps/web/client/src/components/skills/SkillCard.tsx
    - <absolute-repo-root>/apps/web/client/src/pages/SkillsPage.tsx

CONTEXT:
  SkillsPage.tsx renders a hardcoded list. After this wave, it should use TanStack Query
  to call trpc.skills.list and render a SkillCard per result.
  Backend contract (SkillSummary type) is defined in the CONTRACT field below.

CONSTRAINTS:
  - Do NOT modify any files in apps/web/server/
  - Use Radix UI + Tailwind utility classes (existing pattern in packages/ui/)
  - Use TanStack Query via trpc (no raw fetch)
  - Match badge colors: category "llm" → blue, "media" → purple, "code" → green

CONTRACT:
  Backend procedure: trpc.skills.list
  Input: { page: number; limit: number }
  Response: { items: SkillSummary[]; total: number; page: number; limit: number }
  SkillSummary: { id: string; name: string; category: string; createdAt: string }
  Frontend must use this exact response shape. Do not import or re-define SkillSummary
  locally — import it from the backend router once the backend agent creates it.

OUTPUT:
  Create <absolute-repo-root>/apps/web/client/src/components/skills/SkillCard.tsx
  Modify <absolute-repo-root>/apps/web/client/src/pages/SkillsPage.tsx:
    - Replace hardcoded list with trpc.skills.list query
    - Render SkillCard for each result
  Return a Result Report per result-report.schema.md.

QUALITY GATE:
  - TypeScript: cd <absolute-repo-root>/apps/web && pnpm check
  - Tests: cd <absolute-repo-root>/apps/web && pnpm test
```

---

### Example 3 — Database Agent: Schema change with safety protocol

**Situation:** Adding a new `status` column to the `skills` table. Must follow CLAUDE.md Database Safety Protocol.

```
TASK: Add a `status` column (enum: "active" | "inactive" | "archived", default "active")
      to the skills table in
      <absolute-repo-root>/apps/web/server/db/schema.ts
      and generate + apply the Drizzle migration.

DOMAIN: CMD-4 Database

FILES:
  Read:
    - <absolute-repo-root>/apps/web/server/db/schema.ts
    - <absolute-repo-root>/apps/web/drizzle/meta/_journal.json
    - <absolute-repo-root>/apps/web/drizzle/ (existing migration files)
  Write:
    - <absolute-repo-root>/apps/web/server/db/schema.ts
    - <absolute-repo-root>/apps/web/drizzle/ (new migration file)

CONTEXT:
  The skills table currently has: id, tenantId, name, category, createdAt.
  Product request: add a status field so skills can be deactivated without deletion.
  No previous migration for this column. This is the first time status is added.

CONSTRAINTS:
  - MANDATORY: Follow the CLAUDE.md Database Safety Protocol before running ANY migration:
      1. Back up the skills table: pg_dump "$DATABASE_URL" --data-only --table=skills
      2. Record row count: psql "$DATABASE_URL" -c "SELECT count(*) FROM skills"
      3. THEN run: cd apps/web && pnpm db:push
      4. Verify row count matches after migration
  - Add with a DEFAULT ("active") so existing rows are not broken
  - Do NOT use NOT NULL without a DEFAULT on an existing table
  - Do NOT modify any routers or frontend files — those are separate waves

CONTRACT: N/A — solo database agent dispatch

OUTPUT:
  Modify <absolute-repo-root>/apps/web/server/db/schema.ts:
    - Add statusEnum definition: pgEnum("skill_status", ["active", "inactive", "archived"])
    - Add status column to skills table: status: statusEnum("status").default("active").notNull()
  Run: cd <absolute-repo-root>/apps/web && pnpm db:push
  Return a Result Report per result-report.schema.md with pre- and post-migration row counts in next_steps.

QUALITY GATE:
  - Migration applied: pnpm db:push completes without error
  - Row count preserved: pre-migration count == post-migration count
  - TypeScript: cd <absolute-repo-root>/apps/web && pnpm check

```

---

### Example 4 — Python Agent: Adding a FastAPI endpoint

**Situation:** Wave 3. Adding a new RAG scope endpoint to the Python backend.

```
TASK: Add a POST `/api/v1/rag/scopes` endpoint to
      <absolute-repo-root>/python-backend/app/api/v1/rag_scopes.py
      that creates a new RAG scope for the authenticated user.

DOMAIN: CMD-3 Python

FILES:
  Read:
    - <absolute-repo-root>/python-backend/app/api/v1/rag_scopes.py
    - <absolute-repo-root>/python-backend/app/models/rag_scope.py
    - <absolute-repo-root>/python-backend/app/core/auth.py
    - <absolute-repo-root>/python-backend/app/main.py
  Write:
    - <absolute-repo-root>/python-backend/app/api/v1/rag_scopes.py

CONTEXT:
  The RAG scope model was added via Alembic migration in wave 1. The GET endpoint
  exists. This wave adds the POST (create) endpoint. Auth dependency is
  `get_current_user` from app.core.auth — it sets request.state.user_id.
  No previous attempt at this endpoint.

CONSTRAINTS:
  - Do NOT modify any files in apps/web/ (Node.js side)
  - Use FastAPI Depends pattern for auth: `current_user: User = Depends(get_current_user)`
  - Validate input with Pydantic v2 model (not raw dict)
  - Use async SQLAlchemy session: `async with get_async_session() as session`
  - Follow Black 100-char line length, ruff E/W/F rules
  - No print() statements — use `logger = logging.getLogger(__name__)`

CONTRACT: N/A — solo Python agent dispatch

OUTPUT:
  Modify <absolute-repo-root>/python-backend/app/api/v1/rag_scopes.py:
    - Add Pydantic model `RagScopeCreate { name: str; description: str; embedding_model: str }`
    - Add POST `/api/v1/rag/scopes` route with auth dependency
    - Return the created scope as `RagScopeResponse`
  Return a Result Report per result-report.schema.md.

QUALITY GATE:
  - Type check: cd <absolute-repo-root>/python-backend && mypy app/
  - Lint: cd <absolute-repo-root>/python-backend && ruff check app/
  - Tests: cd <absolute-repo-root>/python-backend && pytest tests/api/v1/test_rag_scopes.py
```

---

## Skill Registration Note

After section 06 creates the orchestra skill artifacts, verify whether `/orchestra` is discoverable in the active platform's skill system. In Claude Code this may rely on sibling skill auto-discovery; in standard/open-code environments verify that the installed skill pack exposes `/orchestra` without additional manual registration.

If explicit registration is required, add an entry to `.claude/settings.json` analogous to the existing `"deep-plan"` entry. The acceptance criterion: invoking `/orchestra` displays the orchestra banner without a "skill not found" error.

This verification step belongs to section 06.
