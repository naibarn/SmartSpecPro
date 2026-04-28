# Task Packet Schema

The Task Packet is the structured briefing that the `/orchestra` conductor sends to every sub-agent. Every field is **mandatory**. If a field does not apply, it must be explicitly marked `N/A` — never omitted.

The packet is written in the `prompt` field of the `Task` tool call and must appear in this exact order.

---

## Schema Reference

### TASK:

**What it must contain:** An imperative verb phrase stating exactly what to do. The agent must be able to start work immediately after reading this line alone.

**Format constraints:**
- Must start with a verb: "Add", "Fix", "Audit", "Create", "Refactor", "Remove", "Validate"
- Must name the specific target (function, file, endpoint, component)
- Must never be vague: "investigate", "look at", "check", and "review" are forbidden unless the OUTPUT is a structured report

**Example:**
```
TASK: Add Zod input validation to the `createSkill` tRPC procedure in
      <absolute-repo-root>/apps/web/server/routers/skills.ts
```

---

### DOMAIN:

**What it must contain:** The Commander designation that identifies which agent family handles this packet.

**Format constraints:**
- One of exactly: `CMD-1` (Frontend), `CMD-2` (Backend), `CMD-3` (Python), `CMD-4` (Database), `CMD-5` (Infrastructure), `CMD-6` (Security)
- Optionally append a label: `CMD-2 Backend`

**Example:**
```
DOMAIN: CMD-2 Backend
```

---

### FILES:

**What it must contain:** Absolute file paths the agent must read and/or may modify.

**Format constraints:**
- Always absolute paths starting with `/`
- Never relative paths (not `./apps/...` or `apps/...`)
- Separate read-only from write targets when relevant
- If the agent will write new files, include the target path even if it does not yet exist

**Example:**
```
FILES:
  Read:
    - <absolute-repo-root>/apps/web/server/routers/skills.ts
    - <absolute-repo-root>/apps/web/server/db/schema.ts
  Write:
    - <absolute-repo-root>/apps/web/server/routers/skills.ts
```

---

### CONTEXT:

**What it must contain:** Prior events, relevant error messages, trace IDs, and what was already attempted. This section allows an agent to pick up mid-stream without reading conversation history.

**Format constraints:**
- Must be specific — include actual error output, not summaries
- Include traceId from audit logs if available: `grep '"traceId":"abc123"' apps/web/logs/audit/audit-*.jsonl`
- State what was already tried and why it failed

**Example:**
```
CONTEXT:
  The `createSkill` endpoint currently accepts unvalidated input, causing a
  Drizzle ORM crash when `name` is empty (TypeError: NOT NULL constraint failed:
  skills.name). Wave 1 added the database column migration. This is wave 2.
  No previous fix attempt. Audit traceId: n/a (not an LLM call).
```

---

### CONSTRAINTS:

**What it must contain:** What the agent must not touch, plus domain-specific coding conventions.

**Format constraints:**
- List every off-limits file, table, or API surface
- Include relevant coding standards for this domain (TypeScript strict, Zod schemas, etc.)

**Example:**
```
CONSTRAINTS:
  - Do NOT modify the frontend files in apps/web/client/
  - Do NOT change the database schema (migration already applied in wave 1)
  - Do NOT alter the tRPC router export name or procedure key
  - Follow existing Zod schema patterns in apps/web/server/routers/
  - All inputs must be validated before reaching the Drizzle ORM layer
```

---

### CONTRACT:

**What it must contain:** Interface definitions shared with parallel agents in the same wave. Required when the conductor dispatches two or more agents whose outputs must interoperate.

**Format constraints:**
- For parallel agents: document the shared API endpoint shape, request/response schema, and any shared TypeScript type names
- For solo agents: write `N/A`

**Example (parallel dispatch):**
```
CONTRACT:
  Shared type: SkillCreateInput
    { name: string; description: string; category: "llm" | "media" | "code" }
  Backend will expose: POST /trpc/skills.create accepting SkillCreateInput
  Frontend agent must call this exact procedure with this exact type.
  Backend agent must NOT change the response shape after this contract is set.
```

**Example (solo dispatch):**
```
CONTRACT: N/A — solo agent dispatch
```

---

### OUTPUT:

**What it must contain:** The exact deliverable format. The conductor will parse this to verify completion.

**Format constraints:**
- Must be specific: name the file to modify, the function to add, the report format to return
- Never vague: "implement it" or "do the work" are not valid
- If the output is a structured report, reference `result-report.schema.md`

**Example:**
```
OUTPUT:
  Modify <absolute-repo-root>/apps/web/server/routers/skills.ts:
    - Add a Zod schema `createSkillInput` above the router definition
    - Apply `.input(createSkillInput)` to the `create` procedure
  Return a Result Report in the format defined in result-report.schema.md
  with status: success or partial.
```

---

### QUALITY GATE:

**What it must contain:** The exact commands that must pass before this agent's work is considered complete.

**Format constraints:**
- Include the exact shell command (no paraphrasing)
- Commands are run from the git root unless otherwise specified

**Example:**
```
QUALITY GATE:
  - TypeScript must compile: cd <absolute-repo-root>/apps/web && pnpm check
  - Unit tests must pass: cd <absolute-repo-root>/apps/web && pnpm test
```

---

## Worked Examples

Before using any example command below, prefer the exact repo commands supplied by the conductor in the `QUALITY GATE` field. The commands in this document are repository example defaults and examples only.

### Example 1 — Frontend Agent Packet (Adding a React component)

```
TASK: Create a SkillCard component in apps/web/client/src/components/skills/SkillCard.tsx
      that displays skill name, category badge, and a "Run" button calling the
      skills.create tRPC procedure.

DOMAIN: CMD-1 Frontend

FILES:
  Read:
    - <absolute-repo-root>/apps/web/client/src/components/skills/
    - <absolute-repo-root>/packages/ui/src/
  Write:
    - <absolute-repo-root>/apps/web/client/src/components/skills/SkillCard.tsx

CONTEXT:
  The skills list page at apps/web/client/src/pages/SkillsPage.tsx was added in
  wave 1. It currently renders skill names as plain text. Wave 2 (this wave)
  introduces the SkillCard component for richer presentation.
  Backend `skills.create` procedure is already live with the contract below.

CONSTRAINTS:
  - Do NOT modify any files in apps/web/server/
  - Use Radix UI primitives + Tailwind utility classes (no custom CSS files)
  - Use TanStack Query via the tRPC client (no raw fetch)
  - Follow the Button and Badge patterns in packages/ui/src/

CONTRACT:
  Backend procedure: trpc.skills.create
  Input type: SkillCreateInput { name: string; description: string; category: "llm" | "media" | "code" }
  Response type: { id: string; name: string; category: string; createdAt: string }
  Frontend must use this exact type when calling the procedure.

OUTPUT:
  Create <absolute-repo-root>/apps/web/client/src/components/skills/SkillCard.tsx
  The component must:
    - Accept a `skill: SkillSummary` prop
    - Render name, category badge, and Run button
    - Call trpc.skills.create on button click
  Return a Result Report per result-report.schema.md.

QUALITY GATE:
  - TypeScript must compile: cd <absolute-repo-root>/apps/web && pnpm check
  - No lint errors: cd <absolute-repo-root>/apps/web && pnpm format
```

---

### Example 2 — Backend Agent Packet (Adding a tRPC router)

```
TASK: Add a `skills.list` tRPC query procedure to
      <absolute-repo-root>/apps/web/server/routers/skills.ts
      that returns all skills for the authenticated tenant, paginated.

DOMAIN: CMD-2 Backend

FILES:
  Read:
    - <absolute-repo-root>/apps/web/server/routers/skills.ts
    - <absolute-repo-root>/apps/web/server/db/schema.ts
    - <absolute-repo-root>/apps/web/server/middleware/auth.ts
  Write:
    - <absolute-repo-root>/apps/web/server/routers/skills.ts

CONTEXT:
  The skills table was added in migration 0030. The skills router file exists
  but only has the `create` procedure (added in wave 1). This wave adds `list`.
  Tenant isolation is enforced via ctx.tenantId (set by auth middleware).

CONSTRAINTS:
  - Do NOT modify the database schema
  - Do NOT modify frontend files
  - Every query MUST filter by ctx.tenantId (tenant isolation)
  - Use Drizzle ORM `.where(eq(skills.tenantId, ctx.tenantId))`
  - Validate pagination inputs with Zod: page (number, min 1), limit (number, min 1, max 100)
  - Return type must match the CONTRACT below

CONTRACT:
  Response type for skills.list:
    { items: SkillSummary[]; total: number; page: number; limit: number }
  SkillSummary: { id: string; name: string; category: string; createdAt: string }
  Frontend agent will build UI against this exact shape.

OUTPUT:
  Modify <absolute-repo-root>/apps/web/server/routers/skills.ts
    - Add `list` query procedure with Zod input { page: number, limit: number }
    - Query skills table filtered by tenantId
    - Return paginated result matching the CONTRACT shape
  Return a Result Report per result-report.schema.md.

QUALITY GATE:
  - TypeScript must compile: cd <absolute-repo-root>/apps/web && pnpm check
  - Tests must pass: cd <absolute-repo-root>/apps/web && pnpm test
```

---

### Example 3 — Security Audit Packet (Read-only, no CONTRACT)

```
TASK: Audit all tRPC procedures in
      <absolute-repo-root>/apps/web/server/routers/
      for missing tenant isolation, missing auth middleware, and Zod validation gaps.

DOMAIN: CMD-6 Security

FILES:
  Read:
    - <absolute-repo-root>/apps/web/server/routers/ (all files)
    - <absolute-repo-root>/apps/web/server/middleware/auth.ts
    - <absolute-repo-root>/apps/web/server/trpc.ts

CONTEXT:
  Pre-merge security gate triggered after wave 3 implementation.
  No specific vulnerability was reported — this is a routine sweep.
  Stack: tRPC 11, Zod, Drizzle ORM, JWT auth via ctx.userId + ctx.tenantId.

CONSTRAINTS:
  - READ ONLY — do not modify any files
  - Focus on: missing tenantId filter, unprotected procedures, raw SQL injection vectors,
    VITE_ env leakage, unvalidated inputs reaching the ORM layer

CONTRACT: N/A — solo read-only audit

OUTPUT:
  Return a Result Report per result-report.schema.md with:
    - status: success (audit complete, no blockers)
    - findings: all issues with severity HIGH/MEDIUM/LOW, file:line references
    - next_steps: recommended fixes for each HIGH finding

QUALITY GATE:
  - No code changes — gate is not applicable. Mark as: skipped (read-only audit)
```
