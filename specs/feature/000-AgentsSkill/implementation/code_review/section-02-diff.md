diff --git a/deep_plan/skills/orchestra/references/routing-decision.md b/deep_plan/skills/orchestra/references/routing-decision.md
new file mode 100644
index 0000000..d5a03a4
--- /dev/null
+++ b/deep_plan/skills/orchestra/references/routing-decision.md
@@ -0,0 +1,254 @@
+# Routing Decision Reference
+
+This document is read by SKILL.md at **Step 2**. After task classification (Step 1), apply the route decision table to choose the execution path. Then set or read the `decision-mode` for this session.
+
+**Scope-to-route mapping is a hard contract.** The scope level names (`trivial`, `small`, `medium`, `large`, `project`) must match the exact strings produced by `task-analysis.md` and referenced by SKILL.md Steps 3–8.
+
+---
+
+## Route Decision Table
+
+| Scope | Route Name | Execution Model |
+|-------|------------|-----------------|
+| `trivial` | `direct-edit` | Conductor edits the file directly — no sub-agent dispatched |
+| `small` | `single-agent` | One Task tool call with a complete Task Packet |
+| `medium` | `multi-agent-waves` | Contract + wave plan (Step 3), then parallel agent dispatch (Step 4) |
+| `large` | `deep-plan-codex-chain` | Spec file creation + handoff to `/deep-plan-codex` |
+| `project` | `full-pipeline` | Requirements doc + handoff to `/deep-project`, then codex chain per split |
+
+---
+
+## Route: `direct-edit`
+
+**Trigger:** Scope = `trivial`
+
+**Execution steps:**
+1. Read the target file using the Read tool.
+2. Apply the change inline using the Write or Edit tool.
+3. No Task tool call, no contract file, no agent dispatch.
+4. Run the applicable quality gate (TypeScript check for `.ts` files; ruff for `.py` files).
+5. Write result to `orchestra/plan.md`.
+
+**What to write in `orchestra/plan.md`:**
+```
+route: direct-edit
+files_changed:
+  - /absolute/path/to/file — description of change
+quality_gate: [passed|skipped]
+```
+
+**SmartSpecPro example:**
+Fix a typo in the title string of `apps/web/client/src/pages/Login.tsx`. Conductor reads the file, makes the edit, runs `pnpm check`, marks complete.
+
+**Decision-mode effect:** In all modes, `direct-edit` proceeds without prompting.
+
+---
+
+## Route: `single-agent`
+
+**Trigger:** Scope = `small`
+
+**Execution steps:**
+1. Identify the affected domain (CMD-1 through CMD-6).
+2. Select the correct `subagent_type` from `sub-agent-dispatch.md`.
+3. Build a Task Packet following `task-packet-format.md`. CONTRACT field = `N/A`.
+4. Dispatch via a single Task tool call.
+5. Read the agent's Result Report.
+6. Run quality gates from the Task Packet's QUALITY GATE section.
+7. If `status: failed` → apply retry rules (see `quality-gates.md`, 3-attempt limit).
+8. Write result to `orchestra/plan.md`.
+
+**What to write in `orchestra/plan.md`:**
+```
+route: single-agent
+agent: [agent name used]
+files_changed: [from Result Report]
+quality_gate: [passed|failed|partial]
+```
+
+**SmartSpecPro example:**
+Add Zod validation for a new `category` enum to the `skills.create` tRPC procedure in `apps/web/server/routers/skills.ts`. Dispatch `ssp-backend` (CMD-2 Backend). Quality gate: `cd apps/web && pnpm check && pnpm test`.
+
+**Decision-mode effect:**
+- `ask_every_choice`: Confirm agent selection before dispatching.
+- `smart_auto`: Proceed automatically (low risk).
+- `auto_by_default`: Proceed automatically.
+
+---
+
+## Route: `multi-agent-waves`
+
+**Trigger:** Scope = `medium`
+
+**Execution steps:**
+1. Proceed to Step 3 (contract + wave planning, see `wave-planning.md`).
+2. Write shared interface contracts to `orchestra/contracts.md` before any agent dispatch.
+3. Group tasks into waves — agents within a wave run in parallel; waves run sequentially.
+4. Dispatch wave 1 agents (max 4 concurrent). Wait for all results.
+5. Feed wave 1 results as structured CONTEXT into wave 2 packets.
+6. Continue until all waves complete.
+7. Run quality gates after each wave (TypeScript check, tests — see `quality-gates.md`).
+8. Run pre-merge security gate if any new endpoints were added (see `security-review-protocol.md`).
+9. Write final result to `orchestra/plan.md`.
+
+**What to write in `orchestra/plan.md`:**
+```
+route: multi-agent-waves
+waves_completed: N
+agents_dispatched: [list]
+quality_gates: [per-wave results]
+security_gate: [passed|skipped|failed]
+```
+
+**SmartSpecPro example:**
+New presentation export feature: Wave 1 dispatches `ssp-backend` (adds `presentationExport` tRPC procedure in `apps/web/server/routers/`) + `ssp-python` (adds Celery export task in `python-backend/app/tasks/`). Wave 2 dispatches `ssp-frontend` (builds export UI in `apps/web/client/src/pages/PresentationEditor.tsx`) after Wave 1 confirms the contract.
+
+**Decision-mode effect:**
+- `ask_every_choice`: Confirm each wave plan and agent selection before dispatch.
+- `smart_auto`: Auto-proceed for low/medium risk waves; pause before HIGH risk agents.
+- `auto_by_default`: Proceed autonomously for all waves; log decisions.
+
+---
+
+## Route: `deep-plan-codex-chain`
+
+**Trigger:** Scope = `large`
+
+**Execution steps:**
+1. Create a requirements spec file: `specs/feature/NNN-FeatureName/spec.md`. Populate it with the user's request, context, affected domains, and initial constraints.
+2. Tell the user:
+   > "This request requires detailed planning. Please run:
+   > `/deep-plan-codex @specs/feature/NNN-FeatureName/spec.md`
+   > When the plan is ready, run `/orchestra resume` to continue implementation."
+3. Log expected artifacts to `orchestra/backlog.md`:
+   - `specs/feature/NNN-FeatureName/sections/index.md`
+   - `specs/feature/NNN-FeatureName/claude-plan.md`
+   - `specs/feature/NNN-FeatureName/claude-plan-tdd.md`
+4. **STOP** — do not invoke `/deep-plan-codex` yourself. Orchestra creates the spec; the human runs the skill.
+5. On `/orchestra resume`: read `orchestra/backlog.md`, verify the expected artifacts exist at their declared paths. If missing, report the gap. If present, proceed to wave-based implementation using the section files.
+
+**Hard boundary:** Orchestra does NOT replicate deep-plan-codex functionality. Its role is spec creation + handoff + resume verification. Any attempt to inline deep-plan behavior into orchestra violates skill separation.
+
+**What to write in `orchestra/plan.md`:**
+```
+route: deep-plan-codex-chain
+spec_file: specs/feature/NNN-FeatureName/spec.md
+status: awaiting_deep_plan
+backlog: orchestra/backlog.md
+```
+
+**SmartSpecPro example:**
+"Add a full RAG pipeline to SmartSpecPro" — requires new DB tables, Python vector store integration, tRPC API, and React UI. Too large for direct waves. Orchestra creates `specs/feature/019-RAG-Pipeline/spec.md` and hands off to `/deep-plan-codex`.
+
+**Decision-mode effect:** In all modes, the handoff message is always shown to the user — this is a hard stop requiring human action.
+
+---
+
+## Route: `full-pipeline`
+
+**Trigger:** Scope = `project`
+
+**Execution steps:**
+1. Create a top-level requirements document: `specs/feature/NNN-FeatureName/requirements.md`. Cover all sub-features, integration points, and constraints.
+2. Tell the user:
+   > "This is a new project module. Please run:
+   > `/deep-project @specs/feature/NNN-FeatureName/requirements.md`
+   > This will produce a split plan. Once complete, run `/orchestra resume` to apply the deep-plan-codex-chain for each split."
+3. Log expected outputs to `orchestra/backlog.md`.
+4. **STOP** — do not invoke `/deep-project` yourself.
+5. On `/orchestra resume`: verify that `/deep-project` produced the expected split files. Apply `deep-plan-codex-chain` sequentially for each split.
+
+**What to write in `orchestra/plan.md`:**
+```
+route: full-pipeline
+requirements_file: specs/feature/NNN-FeatureName/requirements.md
+status: awaiting_deep_project
+backlog: orchestra/backlog.md
+```
+
+**SmartSpecPro example:**
+"Build the Skills Marketplace module" — no existing spec, no code. Orchestra creates `specs/feature/022-SkillsMarketplace/requirements.md` and hands off to `/deep-project`.
+
+**Decision-mode effect:** In all modes, the handoff message is always shown — hard stop requiring human action.
+
+---
+
+## Decision Mode
+
+The decision mode controls how much orchestra pauses for choices throughout execution. It is set **once per session** at Step 2. If `orchestra/decision-mode.md` already exists, read it and apply the saved mode without prompting.
+
+### Setting the Mode (AskUserQuestion at Step 2)
+
+```
+Question: "How should orchestra handle decision points?"
+
+Options:
+  1. ask_every_choice
+     Pause before every architectural choice, routing decision, agent selection,
+     and conflict resolution. Best for first-time use or high-stakes sessions.
+
+  2. smart_auto  [Recommended]
+     Proceed autonomously for low/medium risk decisions.
+     Pause for: high/critical risk agents, quality gate failures, security findings.
+
+  3. auto_by_default
+     Proceed fully autonomously. HIGH security findings are logged prominently but
+     do not pause. Only stops on CRITICAL gate failures or 3-attempt exhaustion.
+```
+
+### Mode Behavior Reference
+
+| Decision Point | ask_every_choice | smart_auto | auto_by_default |
+|----------------|-----------------|------------|-----------------|
+| Route selection | Ask | Auto (all routes) | Auto |
+| Agent selection (low risk) | Ask | Auto | Auto |
+| Agent selection (high risk) | Ask | **Ask** | Auto (log) |
+| Wave plan confirmation | Ask | Auto | Auto |
+| Quality gate failure | Ask | **Ask** | Auto-retry once |
+| CRITICAL gate failure | Ask | **Ask** | **Ask** |
+| Security finding HIGH | Ask | **Ask** | Auto-log |
+| Security finding CRITICAL | Ask | **Ask** | **Ask** |
+| 3-attempt exhaustion | Ask | **Ask** | **Ask** |
+
+### Writing the Mode Artifact
+
+After the user selects a mode, write to `orchestra/decision-mode.md`:
+
+```
+mode: smart_auto
+set_at: 2026-02-22T19:30:00Z
+```
+
+Do not ask again in the same session unless the user explicitly requests a mode change.
+
+---
+
+## Large/Project Constraint (Hard Boundary)
+
+For `large` and `project` scopes, orchestra's role is **specification creation and handoff only**:
+
+- ✅ Orchestra creates spec/requirements files
+- ✅ Orchestra resumes implementation after deep-* skills complete
+- ✅ Orchestra verifies artifact existence on resume
+- ❌ Orchestra does NOT run deep-plan analysis steps
+- ❌ Orchestra does NOT generate section files
+- ❌ Orchestra does NOT inline any deep-implement behavior
+
+Violating this boundary would duplicate functionality, cause context exhaustion, and produce inconsistent plans.
+
+---
+
+## SmartSpecPro Route Examples — Quick Reference
+
+| Scenario | Scope | Route |
+|----------|-------|-------|
+| Fix typo in `apps/web/client/src/pages/Login.tsx` | trivial | direct-edit |
+| Add Zod field to `apps/web/server/routers/skills.ts` | small | single-agent (ssp-backend) |
+| New tRPC router + React page + shared schema (3 files) | medium | multi-agent-waves |
+| New RAG pipeline (DB + Python + tRPC + UI, 4 domains) | large | deep-plan-codex-chain |
+| New Skills Marketplace module (no spec) | project | full-pipeline |
+| Bug: 500 in `python-backend/app/api/v1/rag_scopes.py` | bug → file known | ssp-debugger → post-fix waves |
+| Bug: unknown error, audit log investigation needed | bug → file unknown | ssp-research → ssp-debugger |
+| Security: suspected auth bypass in `middleware/auth.ts` | bug → security | ssp-security-trpc + ssp-security-review |
+| Add Celery task (Python only, no DB or UI) | small | single-agent (ssp-python) |
+| New multi-tenant feature: DB + tRPC + React + Celery | large | deep-plan-codex-chain |
diff --git a/deep_plan/skills/orchestra/references/task-analysis.md b/deep_plan/skills/orchestra/references/task-analysis.md
new file mode 100644
index 0000000..198f89c
--- /dev/null
+++ b/deep_plan/skills/orchestra/references/task-analysis.md
@@ -0,0 +1,142 @@
+# Task Analysis Reference
+
+This document is read by SKILL.md at **Step 1**. Apply it to classify the incoming request into a scope level and risk level. Write the result to `orchestra/plan.md` using the output format at the bottom of this file.
+
+**Classification order:**
+1. Check the bug sub-tree FIRST — if the input is a bug/error report, route directly without applying the scope table.
+2. If not a bug, apply the scope classification table (first-match-wins).
+3. Apply the risk classification table in parallel with scope (not as a gating step).
+
+---
+
+## Bug Sub-Tree (Apply First)
+
+When the input is a bug report, error message, test failure, or audit log investigation — apply this decision tree **before** the scope table. Bug routing takes priority over size-based routing.
+
+Apply branches in this order:
+
+```
+Is this a security vulnerability or auth bypass?
+  YES → Dispatch security specialists immediately.
+        - tRPC/backend issue: ssp-security-trpc
+        - FastAPI/Python issue: ssp-security-fastapi
+        - Frontend/XSS/JWT issue: ssp-security-frontend
+        - Unknown domain: dispatch all three + ssp-security-review as aggregator
+        Do NOT wait — critical security issues bypass all other routing.
+
+Is this an error log / audit trail investigation?
+  YES → Dispatch ssp-error-detective.
+        Context: provide the traceId and the JSONL log path:
+          apps/web/logs/audit/audit-YYYY-MM-DD.jsonl
+        After investigation, the detective may escalate to ssp-debugger.
+
+Is this a Python-only error (traceback in python-backend/)?
+  YES → Dispatch ssp-debugger with:
+        - subagent_type: error-debugging:debugger
+        - CONTEXT: full Python traceback
+        - FILES: the offending python-backend/app/ file(s)
+
+Is the affected file/component known?
+  YES → Dispatch ssp-debugger with that file as context.
+        Example: "500 error from skills.create" → files: apps/web/server/routers/skills.ts
+
+Is the affected file/component unknown?
+  YES → Dispatch ssp-research first to locate root cause.
+        After research returns, dispatch ssp-debugger with research findings as CONTEXT.
+```
+
+**Post-fix mandatory waves (apply after any bug route resolves):**
+- Run quality gates for affected domain (TypeScript check, tests, or Python lint)
+- If the bug was security-related: run full security review gate (dispatch 3 specialists)
+- Write outcome to `orchestra/plan.md` with `bug_route: true` flag
+
+---
+
+## Scope Classification Table
+
+Apply **first-match-wins** in priority order. Stop at the first matching rule.
+
+| Priority | Scope | Classification Rule |
+|----------|-------|---------------------|
+| 1 | `project` | Request is a "new feature / module / service / design" AND no spec file exists for it under `specs/feature/` |
+| 2 | `large` | File count > 10 OR a Drizzle/Alembic DB migration is required OR domains affected ≥ 3 |
+| 3 | `medium` | File count 4–10 OR 2 domains with inter-dependencies (e.g., backend tRPC + frontend React page) |
+| 4 | `small` | File count 1–3 AND single domain AND low-or-medium risk |
+| 5 | `trivial` | Single file AND the fix is immediately clear AND no schema changes AND no auth changes |
+
+**Scope estimation — counting files:**
+- Count distinct files to be read AND modified (not directories)
+- A tRPC router file + its test file = 2 files
+- A migration SQL file + schema.ts + the router that uses it = 3 files
+- Frontend component + page that imports it + shared type = 3 files
+
+**SmartSpecPro-specific scope examples:**
+
+- **trivial:** Fix a typo in `apps/web/client/src/pages/Login.tsx`. One file, display only, no logic change.
+
+- **small:** Add a new optional `description` field to the `skills.create` tRPC procedure input. Change: `apps/web/server/routers/skills.ts` (Zod schema update). Single domain (backend), no migration.
+
+- **medium:** Add a new tRPC router `apps/web/server/routers/ragScopes.ts` + a corresponding React page `apps/web/client/src/pages/RagScopesPage.tsx` + a shared Zod schema in `packages/shared/src/ragScopes.ts`. Two domains (backend, frontend) with a shared type contract.
+
+- **large:** New multi-tenant "Presentation Templates" feature: Drizzle migration (new `presentation_templates` table), tRPC router (`apps/web/server/routers/presentationTemplates.ts`), React UI (`apps/web/client/src/pages/TemplatesPage.tsx`), Python Celery template-render task (`python-backend/app/tasks/render_template.py`). 4 domains, DB migration.
+
+- **project:** "Skills Marketplace module" — no spec file exists under `specs/feature/`. Requires full deep-plan pipeline before any implementation.
+
+---
+
+## Risk Classification Table
+
+Apply **in parallel** with scope (not as a gating step). Record both independently.
+
+| Risk | Classification Rule |
+|------|---------------------|
+| `low` | Style/display/copy change, no data access, no auth modification, no new external API calls |
+| `medium` | New UI component with tRPC call, new tRPC procedure (no auth change), new Python Celery task, adding optional columns |
+| `high` | Auth middleware modification, new Drizzle columns with NOT NULL constraint, encryption or secrets handling, new tenantId isolation logic, multi-tenant data access path |
+| `critical` | Auth bypass possible (any change to `apps/web/server/middleware/auth.ts` or tRPC `baseProcedure`), schema DROP/TRUNCATE, credential or API key exposure, payment/billing path modification |
+
+**SmartSpecPro-specific risk examples:**
+
+- **low:** Changing a Tailwind class from `text-gray-500` to `text-gray-600` in a presentational component.
+
+- **medium:** Adding a new `trpc.userSettings.getNotificationPreferences` query procedure in `apps/web/server/routers/userSettings.ts` — new tRPC endpoint, no auth change, no migration.
+
+- **high:** Adding a `stripeCustomerId` column to the `tenants` table with `NOT NULL` and a backfill migration. Touches billing path and requires careful migration to avoid locking production rows.
+
+- **critical:** Modifying the `isAuthenticated` middleware in `apps/web/server/middleware/auth.ts`. Any change here could expose all authenticated endpoints.
+
+**Risk escalation rule:** If the request description mentions any of the following words, treat as HIGH or CRITICAL regardless of scope:
+- "auth", "authentication", "token", "JWT", "session", "permission", "role", "admin" → HIGH minimum
+- "bypass", "drop", "truncate", "credential", "key", "secret", "payment", "billing" → CRITICAL
+
+---
+
+## Classification Output Format
+
+After classification, write this block to `orchestra/plan.md`:
+
+```markdown
+## Task Classification
+- Scope: [trivial|small|medium|large|project]
+- Risk: [low|medium|high|critical]
+- Affected domains: [e.g., "CMD-2 Backend, CMD-1 Frontend"]
+- Estimated file count: [N]
+- Chosen route: [route name — see routing-decision.md]
+- Bug route: [true|false]
+- Classification notes: [1–2 sentences explaining why this classification was chosen]
+```
+
+**Example output:**
+
+```markdown
+## Task Classification
+- Scope: medium
+- Risk: medium
+- Affected domains: CMD-2 Backend, CMD-1 Frontend
+- Estimated file count: 5
+- Chosen route: multi-agent-waves
+- Bug route: false
+- Classification notes: Two domains with a shared tRPC contract (backend writes procedure,
+  frontend consumes it). File count is 5 (router, schema, page, component, test). Medium
+  risk — new endpoint, no auth or migration involved.
+```
