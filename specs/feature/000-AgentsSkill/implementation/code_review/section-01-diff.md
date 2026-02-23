diff --git a/deep_plan/skills/orchestra/references/task-packet-format.md b/deep_plan/skills/orchestra/references/task-packet-format.md
new file mode 100644
index 0000000..380add0
--- /dev/null
+++ b/deep_plan/skills/orchestra/references/task-packet-format.md
@@ -0,0 +1,368 @@
+# Task Packet Construction Guide (Conductor Reference)
+
+This document is the conductor's reference for **building** Task Packets. It covers the same 8-field schema as `deep_plan/skills/sub-agents/contracts/task-packet.schema.md` but from the perspective of the `/orchestra` conductor writing packets — not agents reading them.
+
+**Read `task-packet.schema.md` first** to understand what each field means. This document focuses on *how to construct a correct packet* before dispatching.
+
+---
+
+## Construction Checklist
+
+Before dispatching any Task Packet, verify all of the following:
+
+- [ ] **TASK** starts with an imperative verb and names the exact target (not just the feature area)
+- [ ] **DOMAIN** matches the `subagent_type` you will use in the Task tool call
+- [ ] **FILES** uses absolute paths only (`/home/dev/projects/SmartSpecPro/...`) — no relative paths
+- [ ] **CONTEXT** includes the actual error text or audit log traceId (not a paraphrase)
+- [ ] **CONSTRAINTS** lists every file/table the agent must not touch
+- [ ] **CONTRACT** is filled in for parallel agents, or explicitly `N/A` for solo agents
+- [ ] **OUTPUT** names the specific file to modify or the report format to return
+- [ ] **QUALITY GATE** contains exact shell commands, not descriptions
+
+---
+
+## Field-by-Field Construction Guide
+
+### TASK
+
+Write the task as though it is a Git commit message subject line: imperative, specific, ≤80 characters if possible.
+
+**Conductor note:** If you find yourself writing "look at X" or "investigate Y", you have not decided what to do yet. Finish your analysis before dispatching. Agents that receive vague tasks produce vague outputs.
+
+**Good:** `Add Zod validation to the createSkill tRPC procedure`
+**Bad:** `Check the skills router for issues`
+
+---
+
+### DOMAIN
+
+Match the domain to the `subagent_type` you will pass to the `Task` tool:
+
+| DOMAIN | subagent_type | Edits files in |
+|--------|---------------|----------------|
+| CMD-1 Frontend | `multi-platform-apps:frontend-developer` | `apps/web/client/src/`, `packages/ui/` |
+| CMD-2 Backend | `multi-platform-apps:backend-architect` | `apps/web/server/`, `packages/shared/` |
+| CMD-3 Python | `python-development:fastapi-pro` | `python-backend/app/` |
+| CMD-4 Database | `Explore` (analysis) or direct (migration) | `apps/web/drizzle/`, `packages/db/` |
+| CMD-5 Infra | `Explore` (analysis) | `docker/`, `nginx/`, `docker-compose*.yml` |
+| CMD-6 Security | `backend-api-security:backend-security-coder` | Audit only or targeted fixes |
+
+---
+
+### FILES
+
+**Construction rule:** List every file the agent needs to *read* to understand the codebase, plus every file the agent will *write or modify*. If an agent writes a new file that does not exist yet, include the target path anyway — this signals to the agent where to create it.
+
+**Conductor note:** Agents that receive incomplete file lists make assumptions, read wrong files, and produce incorrect implementations. Err on the side of including more files.
+
+**Resolution shortcut:** If unsure which files are relevant, run a quick Grep before dispatching:
+```bash
+grep -r "functionName" /home/dev/projects/SmartSpecPro/apps/web/server/ --include="*.ts" -l
+```
+
+---
+
+### CONTEXT
+
+**Construction rule:** Copy-paste the actual error message, not a summary. If you are dispatching a bug-fix agent, include:
+1. The exact error text (stack trace, message)
+2. The file:line where it originated
+3. What was already tried and why it failed
+4. The relevant audit log traceId if it is an LLM/media call
+
+**For a new-feature wave:** Describe what the previous wave did and what this wave must build on top of.
+
+---
+
+### CONSTRAINTS
+
+**Construction rule:** Write constraints as if you are writing a code review comment to a junior developer who will do exactly what you say and nothing more. Be explicit about:
+- Off-limits files/tables (especially the database schema if migration is complete)
+- Coding conventions the agent must follow for this domain
+- API surface shapes the agent must preserve
+
+**Conductor note:** The most common constraint violation is a backend agent modifying shared types in ways that break the frontend. Always add: "Do not change the response type shape if it is already in the CONTRACT."
+
+---
+
+### CONTRACT
+
+**Construction rule:** Use the CONTRACT field whenever two or more agents in the same wave must interoperate. The conductor sets the contract *before* dispatching — neither agent defines it unilaterally.
+
+**What to include:**
+- The shared TypeScript type name and its fields
+- The exact tRPC procedure name and route
+- Which agent "owns" the contract (the one that cannot change it once set)
+
+**When to write N/A:** Solo agents (single dispatch, no parallel counterparts) always get `CONTRACT: N/A`.
+
+**Conductor note:** If you set a contract and then one agent changes the shared type, you must re-dispatch the other agent with updated CONTEXT explaining the contract change. Never let agents silently drift from the contract.
+
+---
+
+### OUTPUT
+
+**Construction rule:** The OUTPUT must be parseable. When you integrate the result (SKILL.md Step 5), you need to know exactly what to look for. Write the output spec as a checklist:
+
+```
+OUTPUT:
+  Modify /home/dev/projects/.../skills.ts:
+    - Add createSkillInput Zod schema above router definition
+    - Apply .input(createSkillInput) to the create procedure
+  Return a Result Report per result-report.schema.md with status success or partial.
+```
+
+---
+
+### QUALITY GATE
+
+**Construction rule:** Copy the exact command from CLAUDE.md or the project's README. Do not paraphrase. If the command requires a specific working directory, include `cd X &&` in the gate.
+
+**SmartSpecPro quality gates by domain:**
+
+| Domain | Gate command |
+|--------|-------------|
+| TypeScript (web) | `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check` |
+| Tests (web) | `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test` |
+| Python type check | `cd /home/dev/projects/SmartSpecPro/python-backend && mypy app/` |
+| Python lint | `cd /home/dev/projects/SmartSpecPro/python-backend && ruff check app/` |
+| Python tests | `cd /home/dev/projects/SmartSpecPro/python-backend && pytest` |
+| Read-only audit | `skipped (read-only — no files modified)` |
+
+---
+
+## Platform-Mode Notes
+
+The Task Packet format is identical across all three platforms. What changes is how you *dispatch* it.
+
+### Mode: `claude-code` (default)
+
+Standard dispatch via the Task tool:
+
+```
+Task(
+  subagent_type="multi-platform-apps:backend-architect",
+  prompt="
+    TASK: Add Zod validation to createSkill procedure
+    DOMAIN: CMD-2 Backend
+    FILES: ...
+    CONTEXT: ...
+    CONSTRAINTS: ...
+    CONTRACT: N/A
+    OUTPUT: ...
+    QUALITY GATE: cd apps/web && pnpm check
+  "
+)
+```
+
+Use the `subagent_type` that matches the DOMAIN (see domain table above).
+
+---
+
+### Mode: `codex`
+
+Codex does not support `subagent_type` specialization. Prepend the full agent definition file content **before** the Task Packet:
+
+```
+Task(
+  subagent_type="general-purpose",
+  prompt="
+    [Full contents of deep_plan/skills/sub-agents/agents/backend.md]
+
+    ---
+
+    TASK: Add Zod validation to createSkill procedure
+    DOMAIN: CMD-2 Backend
+    FILES: ...
+    ...
+  "
+)
+```
+
+**Scope cap warning:** Codex agents have a smaller context window. If the agent definition + packet exceeds 8,000 tokens, split the packet into two dispatches (reduce FILES and CONSTRAINTS per dispatch).
+
+---
+
+### Mode: `open-code`
+
+No Task tool is available. The conductor adopts the agent identity and executes inline:
+
+1. Read `deep_plan/skills/sub-agents/agents/NAME.md`
+2. Follow its Workflow section step-by-step, in-context
+3. Apply all Constraints and Quality Checklist items manually
+4. Write the Result Report inline and continue
+
+**Scope cap:** In open-code mode, limit each "dispatch" to one file or one logical unit of work. Do not attempt multi-file changes in a single inline execution.
+
+**Platform reset:** If the platform changes mid-session (e.g., switching from open-code to claude-code after getting access), run the R4 resume algorithm from `session-resume.md` before continuing with new dispatches.
+
+---
+
+## Worked Construction Examples
+
+### Example 1 — Backend Agent: Adding a tRPC Router
+
+**Situation:** Wave 2. Wave 1 created the Drizzle schema migration. Now adding the `skills.list` tRPC procedure.
+
+```
+TASK: Add a `skills.list` tRPC query procedure to
+      /home/dev/projects/SmartSpecPro/apps/web/server/routers/skills.ts
+      that returns all skills for the authenticated tenant, paginated (page, limit).
+
+DOMAIN: CMD-2 Backend
+
+FILES:
+  Read:
+    - /home/dev/projects/SmartSpecPro/apps/web/server/routers/skills.ts
+    - /home/dev/projects/SmartSpecPro/apps/web/server/db/schema.ts
+    - /home/dev/projects/SmartSpecPro/apps/web/server/middleware/auth.ts
+    - /home/dev/projects/SmartSpecPro/apps/web/server/trpc.ts
+  Write:
+    - /home/dev/projects/SmartSpecPro/apps/web/server/routers/skills.ts
+
+CONTEXT:
+  The `skills` table was added in drizzle migration 0030. The schema has columns:
+  id (uuid, PK), tenantId (uuid, FK), name (text), category (text), createdAt (timestamp).
+  The skills router currently only has the `create` procedure. This wave adds `list`.
+  Auth middleware sets ctx.tenantId from the JWT session cookie.
+
+CONSTRAINTS:
+  - Do NOT modify the database schema (migration 0030 is already applied)
+  - Do NOT modify frontend files in apps/web/client/
+  - Every query MUST filter by ctx.tenantId
+  - Use Drizzle `.where(eq(skills.tenantId, ctx.tenantId))`
+  - Validate page and limit with Zod: page (number, min 1), limit (number, 1–100)
+
+CONTRACT:
+  Response type: { items: SkillSummary[]; total: number; page: number; limit: number }
+  SkillSummary: { id: string; name: string; category: string; createdAt: string }
+  Frontend agent (CMD-1) will implement SkillCard against this exact shape.
+  Do NOT change the response shape once this packet is dispatched.
+
+OUTPUT:
+  Modify /home/dev/projects/SmartSpecPro/apps/web/server/routers/skills.ts:
+    - Export `SkillSummary` type at the top of the file
+    - Add `list` query procedure with Zod input { page: z.number().min(1), limit: z.number().min(1).max(100) }
+    - Return paginated result matching the CONTRACT shape
+  Return a Result Report per result-report.schema.md.
+
+QUALITY GATE:
+  - TypeScript: cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check
+  - Tests: cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test
+```
+
+---
+
+### Example 2 — Frontend Agent: Building UI against the backend contract
+
+**Situation:** Wave 2, parallel with Example 1. CMD-1 Frontend builds SkillCard component.
+
+```
+TASK: Create /home/dev/projects/SmartSpecPro/apps/web/client/src/components/skills/SkillCard.tsx
+      that displays skill name, category badge, and a "Run" button using the skills.list response.
+
+DOMAIN: CMD-1 Frontend
+
+FILES:
+  Read:
+    - /home/dev/projects/SmartSpecPro/apps/web/client/src/pages/SkillsPage.tsx
+    - /home/dev/projects/SmartSpecPro/apps/web/client/src/utils/trpc.ts
+    - /home/dev/projects/SmartSpecPro/packages/ui/src/components/
+  Write:
+    - /home/dev/projects/SmartSpecPro/apps/web/client/src/components/skills/SkillCard.tsx
+    - /home/dev/projects/SmartSpecPro/apps/web/client/src/pages/SkillsPage.tsx
+
+CONTEXT:
+  SkillsPage.tsx renders a hardcoded list. After this wave, it should use TanStack Query
+  to call trpc.skills.list and render a SkillCard per result.
+  Backend contract (SkillSummary type) is defined in the CONTRACT field below.
+
+CONSTRAINTS:
+  - Do NOT modify any files in apps/web/server/
+  - Use Radix UI + Tailwind utility classes (existing pattern in packages/ui/)
+  - Use TanStack Query via trpc (no raw fetch)
+  - Match badge colors: category "llm" → blue, "media" → purple, "code" → green
+
+CONTRACT:
+  Backend procedure: trpc.skills.list
+  Input: { page: number; limit: number }
+  Response: { items: SkillSummary[]; total: number; page: number; limit: number }
+  SkillSummary: { id: string; name: string; category: string; createdAt: string }
+  Frontend must use this exact response shape. Do not import or re-define SkillSummary
+  locally — import it from the backend router once the backend agent creates it.
+
+OUTPUT:
+  Create /home/dev/projects/SmartSpecPro/apps/web/client/src/components/skills/SkillCard.tsx
+  Modify /home/dev/projects/SmartSpecPro/apps/web/client/src/pages/SkillsPage.tsx:
+    - Replace hardcoded list with trpc.skills.list query
+    - Render SkillCard for each result
+  Return a Result Report per result-report.schema.md.
+
+QUALITY GATE:
+  - TypeScript: cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check
+  - Tests: cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test
+```
+
+---
+
+### Example 3 — Database Agent: Schema change with safety protocol
+
+**Situation:** Adding a new `status` column to the `skills` table. Must follow CLAUDE.md Database Safety Protocol.
+
+```
+TASK: Add a `status` column (enum: "active" | "inactive" | "archived", default "active")
+      to the skills table in
+      /home/dev/projects/SmartSpecPro/apps/web/server/db/schema.ts
+      and generate + apply the Drizzle migration.
+
+DOMAIN: CMD-4 Database
+
+FILES:
+  Read:
+    - /home/dev/projects/SmartSpecPro/apps/web/server/db/schema.ts
+    - /home/dev/projects/SmartSpecPro/apps/web/drizzle/meta/_journal.json
+    - /home/dev/projects/SmartSpecPro/apps/web/drizzle/ (existing migration files)
+  Write:
+    - /home/dev/projects/SmartSpecPro/apps/web/server/db/schema.ts
+    - /home/dev/projects/SmartSpecPro/apps/web/drizzle/ (new migration file)
+
+CONTEXT:
+  The skills table currently has: id, tenantId, name, category, createdAt.
+  Product request: add a status field so skills can be deactivated without deletion.
+  No previous migration for this column. This is the first time status is added.
+
+CONSTRAINTS:
+  - MANDATORY: Follow the CLAUDE.md Database Safety Protocol before running ANY migration:
+      1. Back up the skills table: pg_dump "$DATABASE_URL" --data-only --table=skills
+      2. Record row count: psql "$DATABASE_URL" -c "SELECT count(*) FROM skills"
+      3. THEN run: cd apps/web && pnpm db:push
+      4. Verify row count matches after migration
+  - Add with a DEFAULT ("active") so existing rows are not broken
+  - Do NOT use NOT NULL without a DEFAULT on an existing table
+  - Do NOT modify any routers or frontend files — those are separate waves
+
+CONTRACT: N/A — solo database agent dispatch
+
+OUTPUT:
+  Modify /home/dev/projects/SmartSpecPro/apps/web/server/db/schema.ts:
+    - Add statusEnum definition: pgEnum("skill_status", ["active", "inactive", "archived"])
+    - Add status column to skills table: status: statusEnum("status").default("active").notNull()
+  Run: cd /home/dev/projects/SmartSpecPro/apps/web && pnpm db:push
+  Return a Result Report per result-report.schema.md with pre- and post-migration row counts in next_steps.
+
+QUALITY GATE:
+  - Migration applied: pnpm db:push completes without error
+  - Row count preserved: pre-migration count == post-migration count
+  - TypeScript: cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check
+
+```
+
+---
+
+## Skill Registration Note
+
+After section 06 creates `deep_plan/skills/orchestra/SKILL.md`, verify whether the `/orchestra` command is auto-discoverable by the Claude Code plugin system. The `deep_plan/` root auto-discovers sibling skills under `skills/` — check if `/orchestra` is available without changes to `.claude/settings.json`.
+
+If explicit registration is required, add an entry to `.claude/settings.json` analogous to the existing `"deep-plan"` entry. The acceptance criterion: invoking `/orchestra` displays the orchestra banner without a "skill not found" error.
+
+This verification step belongs to section 06.
diff --git a/deep_plan/skills/sub-agents/contracts/result-report.schema.md b/deep_plan/skills/sub-agents/contracts/result-report.schema.md
new file mode 100644
index 0000000..c429c42
--- /dev/null
+++ b/deep_plan/skills/sub-agents/contracts/result-report.schema.md
@@ -0,0 +1,177 @@
+# Result Report Schema
+
+The Result Report is the structured response that every sub-agent returns to the `/orchestra` conductor after completing its assigned Task Packet. The conductor's result integration step (SKILL.md Step 5) parses this format to detect conflicts, assess quality gate status, and plan the next wave.
+
+Every field is **mandatory**. If a field has no content, use an explicit empty list `[]` — never omit the field.
+
+---
+
+## Schema Reference
+
+### status
+
+**Allowed values (exactly 3):**
+
+| Value | Meaning |
+|-------|---------|
+| `success` | All assigned work is complete. All blocking quality gates passed. |
+| `partial` | Work is complete but one or more non-blocking quality gates failed, or the deliverable is narrower than specified (with explanation in `blockers`). |
+| `failed` | Unable to complete assigned work. A blocking gate failed or a hard blocker was encountered. Conductor must not proceed with dependent waves. |
+
+**Format:**
+```
+status: success
+```
+
+---
+
+### files_changed
+
+**What it must contain:** A list of every file that was modified, created, or deleted during this agent's execution.
+
+**Format:**
+```
+files_changed:
+  - /absolute/path/to/file.ext — brief description of what changed
+```
+
+**Rules:**
+- Absolute paths only (starting with `/`)
+- One entry per file
+- New files are listed with "— created"
+- Deleted files are listed with "— deleted"
+- If no files were changed (read-only audit): `files_changed: []`
+
+---
+
+### findings
+
+**What it must contain:** Issues discovered during the work that were **not** part of the original Task Packet. These are observations the conductor should consider for future waves.
+
+**Severity levels:**
+| Severity | Meaning |
+|----------|---------|
+| `HIGH` | Security vulnerability, data loss risk, or blocking regression |
+| `MEDIUM` | Code quality issue that will cause problems at scale or in edge cases |
+| `LOW` | Nitpick, style issue, or minor optimization opportunity |
+
+**Format:**
+```
+findings:
+  - [HIGH] Description of issue — /absolute/path/to/file.ext:42
+  - [MEDIUM] Description of issue — /absolute/path/to/file.ext:107
+  - [LOW] Description of issue — /absolute/path/to/file.ext:88
+```
+
+**If no findings:** `findings: []`
+
+---
+
+### blockers
+
+**What it must contain:** Things that prevented the agent from completing work, or that will prevent dependent waves from succeeding.
+
+**Format:**
+```
+blockers:
+  - what: Description of what was blocked and why
+    action: What the conductor should do (e.g., "Re-dispatch after resolving contract conflict in wave 2")
+```
+
+**If no blockers:** `blockers: []`
+
+---
+
+### next_steps
+
+**What it must contain:** Recommended follow-on actions the conductor should consider after integrating this result. This is **advisory** — the conductor decides what to do.
+
+**Format:**
+```
+next_steps:
+  - Run TypeScript check before dispatching wave 3: cd apps/web && pnpm check
+  - Consider adding index on skills.tenantId for query performance (wave 4 or later)
+  - Frontend agent (CMD-1) should receive the SkillSummary type before building UI
+```
+
+**If no next steps:** `next_steps: []`
+
+---
+
+### quality_gate_results
+
+**What it must contain:** The pass/fail/skip result for every quality gate listed in the Task Packet's QUALITY GATE section.
+
+**Allowed values per gate:** `passed`, `failed`, `skipped`
+
+**Format:**
+```
+quality_gate_results:
+  - TypeScript check (cd apps/web && pnpm check): passed
+  - Unit tests (cd apps/web && pnpm test): passed
+  - Security scan: skipped (no new endpoints added)
+```
+
+**Rules:**
+- List every gate from the QUALITY GATE section — do not omit any
+- If a gate was not in the original packet but was run anyway, include it with a note
+- `skipped` is only valid when the gate genuinely does not apply (e.g., no TS files changed, read-only audit)
+
+---
+
+## Worked Examples
+
+### Example 1 — Successful Backend Agent Result
+
+```
+status: success
+
+files_changed:
+  - /home/dev/projects/SmartSpecPro/apps/web/server/routers/skills.ts — added `list` query procedure with pagination and tenantId filter
+
+findings:
+  - [MEDIUM] The `create` procedure (added in wave 1) does not validate `category` against the allowed enum values. Line 47. Recommend adding Zod enum validation in a follow-up wave.
+
+blockers: []
+
+next_steps:
+  - Frontend agent (CMD-1) is unblocked and can begin building SkillCard component
+  - Consider adding database index on (tenantId, createdAt) for the list query — currently doing a full table scan on the skills table
+  - The MEDIUM finding in the create procedure should be addressed before release
+
+quality_gate_results:
+  - TypeScript check (cd apps/web && pnpm check): passed
+  - Unit tests (cd apps/web && pnpm test): passed
+```
+
+---
+
+### Example 2 — Failed Frontend Agent Result
+
+```
+status: failed
+
+files_changed:
+  - /home/dev/projects/SmartSpecPro/apps/web/client/src/components/skills/SkillCard.tsx — created (partial — Run button not implemented)
+
+findings:
+  - [HIGH] The tRPC client import path used in SkillsPage.tsx is deprecated (@/lib/trpc vs @/utils/trpc). Using the wrong path causes a runtime import error. File: /home/dev/projects/SmartSpecPro/apps/web/client/src/pages/SkillsPage.tsx:3
+
+blockers:
+  - what: Cannot implement the Run button because the tRPC client import convention is ambiguous.
+          Two import paths exist (@/lib/trpc and @/utils/trpc). TypeScript accepts both but
+          only one resolves at runtime. The conductor must clarify which path is canonical
+          before the frontend agent can safely wire up the mutation.
+    action: Conductor should dispatch CMD-2 Backend to confirm canonical tRPC client export,
+            then re-dispatch CMD-1 Frontend with updated CONTEXT and FILES pointing to the
+            correct import source.
+
+next_steps:
+  - Resolve the tRPC import ambiguity (see blocker above) before re-dispatching CMD-1
+  - The HIGH finding in SkillsPage.tsx should be fixed regardless of the blocker — it is a pre-existing issue
+  - After re-dispatch, frontend agent should be able to complete in one additional wave
+
+quality_gate_results:
+  - TypeScript check (cd apps/web && pnpm check): failed (2 type errors in SkillCard.tsx related to unresolved tRPC types)
+  - Unit tests (cd apps/web && pnpm test): skipped (TypeScript errors prevented test run)
+```
diff --git a/deep_plan/skills/sub-agents/contracts/task-packet.schema.md b/deep_plan/skills/sub-agents/contracts/task-packet.schema.md
new file mode 100644
index 0000000..feee679
--- /dev/null
+++ b/deep_plan/skills/sub-agents/contracts/task-packet.schema.md
@@ -0,0 +1,304 @@
+# Task Packet Schema
+
+The Task Packet is the structured briefing that the `/orchestra` conductor sends to every sub-agent. Every field is **mandatory**. If a field does not apply, it must be explicitly marked `N/A` — never omitted.
+
+The packet is written in the `prompt` field of the `Task` tool call and must appear in this exact order.
+
+---
+
+## Schema Reference
+
+### TASK:
+
+**What it must contain:** An imperative verb phrase stating exactly what to do. The agent must be able to start work immediately after reading this line alone.
+
+**Format constraints:**
+- Must start with a verb: "Add", "Fix", "Audit", "Create", "Refactor", "Remove", "Validate"
+- Must name the specific target (function, file, endpoint, component)
+- Must never be vague: "investigate", "look at", "check", and "review" are forbidden unless the OUTPUT is a structured report
+
+**Example:**
+```
+TASK: Add Zod input validation to the `createSkill` tRPC procedure in
+      /home/dev/projects/SmartSpecPro/apps/web/server/routers/skills.ts
+```
+
+---
+
+### DOMAIN:
+
+**What it must contain:** The Commander designation that identifies which agent family handles this packet.
+
+**Format constraints:**
+- One of exactly: `CMD-1` (Frontend), `CMD-2` (Backend), `CMD-3` (Python), `CMD-4` (Database), `CMD-5` (Infrastructure), `CMD-6` (Security)
+- Optionally append a label: `CMD-2 Backend`
+
+**Example:**
+```
+DOMAIN: CMD-2 Backend
+```
+
+---
+
+### FILES:
+
+**What it must contain:** Absolute file paths the agent must read and/or may modify.
+
+**Format constraints:**
+- Always absolute paths starting with `/`
+- Never relative paths (not `./apps/...` or `apps/...`)
+- Separate read-only from write targets when relevant
+- If the agent will write new files, include the target path even if it does not yet exist
+
+**Example:**
+```
+FILES:
+  Read:
+    - /home/dev/projects/SmartSpecPro/apps/web/server/routers/skills.ts
+    - /home/dev/projects/SmartSpecPro/apps/web/server/db/schema.ts
+  Write:
+    - /home/dev/projects/SmartSpecPro/apps/web/server/routers/skills.ts
+```
+
+---
+
+### CONTEXT:
+
+**What it must contain:** Prior events, relevant error messages, trace IDs, and what was already attempted. This section allows an agent to pick up mid-stream without reading conversation history.
+
+**Format constraints:**
+- Must be specific — include actual error output, not summaries
+- Include traceId from audit logs if available: `grep '"traceId":"abc123"' apps/web/logs/audit/audit-*.jsonl`
+- State what was already tried and why it failed
+
+**Example:**
+```
+CONTEXT:
+  The `createSkill` endpoint currently accepts unvalidated input, causing a
+  Drizzle ORM crash when `name` is empty (TypeError: NOT NULL constraint failed:
+  skills.name). Wave 1 added the database column migration. This is wave 2.
+  No previous fix attempt. Audit traceId: n/a (not an LLM call).
+```
+
+---
+
+### CONSTRAINTS:
+
+**What it must contain:** What the agent must not touch, plus domain-specific coding conventions.
+
+**Format constraints:**
+- List every off-limits file, table, or API surface
+- Include relevant coding standards for this domain (TypeScript strict, Zod schemas, etc.)
+
+**Example:**
+```
+CONSTRAINTS:
+  - Do NOT modify the frontend files in apps/web/client/
+  - Do NOT change the database schema (migration already applied in wave 1)
+  - Do NOT alter the tRPC router export name or procedure key
+  - Follow existing Zod schema patterns in apps/web/server/routers/
+  - All inputs must be validated before reaching the Drizzle ORM layer
+```
+
+---
+
+### CONTRACT:
+
+**What it must contain:** Interface definitions shared with parallel agents in the same wave. Required when the conductor dispatches two or more agents whose outputs must interoperate.
+
+**Format constraints:**
+- For parallel agents: document the shared API endpoint shape, request/response schema, and any shared TypeScript type names
+- For solo agents: write `N/A`
+
+**Example (parallel dispatch):**
+```
+CONTRACT:
+  Shared type: SkillCreateInput
+    { name: string; description: string; category: "llm" | "media" | "code" }
+  Backend will expose: POST /trpc/skills.create accepting SkillCreateInput
+  Frontend agent must call this exact procedure with this exact type.
+  Backend agent must NOT change the response shape after this contract is set.
+```
+
+**Example (solo dispatch):**
+```
+CONTRACT: N/A — solo agent dispatch
+```
+
+---
+
+### OUTPUT:
+
+**What it must contain:** The exact deliverable format. The conductor will parse this to verify completion.
+
+**Format constraints:**
+- Must be specific: name the file to modify, the function to add, the report format to return
+- Never vague: "implement it" or "do the work" are not valid
+- If the output is a structured report, reference `result-report.schema.md`
+
+**Example:**
+```
+OUTPUT:
+  Modify /home/dev/projects/SmartSpecPro/apps/web/server/routers/skills.ts:
+    - Add a Zod schema `createSkillInput` above the router definition
+    - Apply `.input(createSkillInput)` to the `create` procedure
+  Return a Result Report in the format defined in result-report.schema.md
+  with status: success or partial.
+```
+
+---
+
+### QUALITY GATE:
+
+**What it must contain:** The exact commands that must pass before this agent's work is considered complete.
+
+**Format constraints:**
+- Include the exact shell command (no paraphrasing)
+- Commands are run from the git root unless otherwise specified
+
+**Example:**
+```
+QUALITY GATE:
+  - TypeScript must compile: cd apps/web && pnpm check
+  - Unit tests must pass: cd apps/web && pnpm test
+```
+
+---
+
+## Worked Examples
+
+### Example 1 — Frontend Agent Packet (Adding a React component)
+
+```
+TASK: Create a SkillCard component in apps/web/client/src/components/skills/SkillCard.tsx
+      that displays skill name, category badge, and a "Run" button calling the
+      skills.create tRPC procedure.
+
+DOMAIN: CMD-1 Frontend
+
+FILES:
+  Read:
+    - /home/dev/projects/SmartSpecPro/apps/web/client/src/components/skills/
+    - /home/dev/projects/SmartSpecPro/packages/ui/src/
+  Write:
+    - /home/dev/projects/SmartSpecPro/apps/web/client/src/components/skills/SkillCard.tsx
+
+CONTEXT:
+  The skills list page at apps/web/client/src/pages/SkillsPage.tsx was added in
+  wave 1. It currently renders skill names as plain text. Wave 2 (this wave)
+  introduces the SkillCard component for richer presentation.
+  Backend `skills.create` procedure is already live with the contract below.
+
+CONSTRAINTS:
+  - Do NOT modify any files in apps/web/server/
+  - Use Radix UI primitives + Tailwind utility classes (no custom CSS files)
+  - Use TanStack Query via the tRPC client (no raw fetch)
+  - Follow the Button and Badge patterns in packages/ui/src/
+
+CONTRACT:
+  Backend procedure: trpc.skills.create
+  Input type: SkillCreateInput { name: string; description: string; category: "llm" | "media" | "code" }
+  Response type: { id: string; name: string; category: string; createdAt: string }
+  Frontend must use this exact type when calling the procedure.
+
+OUTPUT:
+  Create /home/dev/projects/SmartSpecPro/apps/web/client/src/components/skills/SkillCard.tsx
+  The component must:
+    - Accept a `skill: SkillSummary` prop
+    - Render name, category badge, and Run button
+    - Call trpc.skills.create on button click
+  Return a Result Report per result-report.schema.md.
+
+QUALITY GATE:
+  - TypeScript must compile: cd apps/web && pnpm check
+  - No lint errors: cd apps/web && pnpm format
+```
+
+---
+
+### Example 2 — Backend Agent Packet (Adding a tRPC router)
+
+```
+TASK: Add a `skills.list` tRPC query procedure to
+      /home/dev/projects/SmartSpecPro/apps/web/server/routers/skills.ts
+      that returns all skills for the authenticated tenant, paginated.
+
+DOMAIN: CMD-2 Backend
+
+FILES:
+  Read:
+    - /home/dev/projects/SmartSpecPro/apps/web/server/routers/skills.ts
+    - /home/dev/projects/SmartSpecPro/apps/web/server/db/schema.ts
+    - /home/dev/projects/SmartSpecPro/apps/web/server/middleware/auth.ts
+  Write:
+    - /home/dev/projects/SmartSpecPro/apps/web/server/routers/skills.ts
+
+CONTEXT:
+  The skills table was added in migration 0030. The skills router file exists
+  but only has the `create` procedure (added in wave 1). This wave adds `list`.
+  Tenant isolation is enforced via ctx.tenantId (set by auth middleware).
+
+CONSTRAINTS:
+  - Do NOT modify the database schema
+  - Do NOT modify frontend files
+  - Every query MUST filter by ctx.tenantId (tenant isolation)
+  - Use Drizzle ORM `.where(eq(skills.tenantId, ctx.tenantId))`
+  - Validate pagination inputs with Zod: page (number, min 1), limit (number, min 1, max 100)
+  - Return type must match the CONTRACT below
+
+CONTRACT:
+  Response type for skills.list:
+    { items: SkillSummary[]; total: number; page: number; limit: number }
+  SkillSummary: { id: string; name: string; category: string; createdAt: string }
+  Frontend agent will build UI against this exact shape.
+
+OUTPUT:
+  Modify /home/dev/projects/SmartSpecPro/apps/web/server/routers/skills.ts
+    - Add `list` query procedure with Zod input { page: number, limit: number }
+    - Query skills table filtered by tenantId
+    - Return paginated result matching the CONTRACT shape
+  Return a Result Report per result-report.schema.md.
+
+QUALITY GATE:
+  - TypeScript must compile: cd apps/web && pnpm check
+  - Tests must pass: cd apps/web && pnpm test
+```
+
+---
+
+### Example 3 — Security Audit Packet (Read-only, no CONTRACT)
+
+```
+TASK: Audit all tRPC procedures in
+      /home/dev/projects/SmartSpecPro/apps/web/server/routers/
+      for missing tenant isolation, missing auth middleware, and Zod validation gaps.
+
+DOMAIN: CMD-6 Security
+
+FILES:
+  Read:
+    - /home/dev/projects/SmartSpecPro/apps/web/server/routers/ (all files)
+    - /home/dev/projects/SmartSpecPro/apps/web/server/middleware/auth.ts
+    - /home/dev/projects/SmartSpecPro/apps/web/server/trpc.ts
+
+CONTEXT:
+  Pre-merge security gate triggered after wave 3 implementation.
+  No specific vulnerability was reported — this is a routine sweep.
+  Stack: tRPC 11, Zod, Drizzle ORM, JWT auth via ctx.userId + ctx.tenantId.
+
+CONSTRAINTS:
+  - READ ONLY — do not modify any files
+  - Focus on: missing tenantId filter, unprotected procedures, raw SQL injection vectors,
+    VITE_ env leakage, unvalidated inputs reaching the ORM layer
+
+CONTRACT: N/A — solo read-only audit
+
+OUTPUT:
+  Return a Result Report per result-report.schema.md with:
+    - status: success (audit complete, no blockers)
+    - findings: all issues with severity HIGH/MEDIUM/LOW, file:line references
+    - next_steps: recommended fixes for each HIGH finding
+
+QUALITY GATE:
+  - No code changes — gate is not applicable. Mark as: skipped (read-only audit)
+```
