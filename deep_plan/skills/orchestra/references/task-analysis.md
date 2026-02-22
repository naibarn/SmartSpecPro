# Task Analysis Reference

This document is read by SKILL.md at **Step 1**. Apply it to classify the incoming request into a scope level and risk level. Write the result to `orchestra/plan.md` using the output format at the bottom of this file.

**Classification order:**
1. Check the bug sub-tree FIRST — if the input is a bug/error report, route directly without applying the scope table.
2. If not a bug, apply the scope classification table (first-match-wins).
3. Apply the risk classification table in parallel with scope (not as a gating step).

---

## Bug Sub-Tree (Apply First)

When the input is a bug report, error message, test failure, or audit log investigation — apply this decision tree **before** the scope table. Bug routing takes priority over size-based routing.

Apply branches in this order:

```
Is this a security vulnerability or auth bypass?
  YES → Dispatch security specialists immediately.
        - tRPC/backend issue: ssp-security-trpc
        - FastAPI/Python issue: ssp-security-fastapi
        - Frontend/XSS/JWT issue: ssp-security-frontend
        - Unknown domain: dispatch all three + ssp-security-review as aggregator
        Do NOT wait — critical security issues bypass all other routing.

Is this an error log / audit trail investigation?
  YES → Dispatch ssp-error-detective.
        Context: provide the traceId and the JSONL log path:
          apps/web/logs/audit/audit-YYYY-MM-DD.jsonl
        After investigation, the detective may escalate to ssp-debugger.

Is this a Python-only error (traceback in python-backend/)?
  YES → Dispatch ssp-debugger with:
        - subagent_type: error-debugging:debugger
        - CONTEXT: full Python traceback
        - FILES: the offending python-backend/app/ file(s)

Is the affected file/component known?
  YES → Dispatch ssp-debugger with that file as context.
        Example: "500 error from skills.create" → files: apps/web/server/routers/skills.ts

Is the affected file/component unknown?
  YES → Dispatch ssp-research first to locate root cause.
        After research returns, dispatch ssp-debugger with research findings as CONTEXT.
```

**Post-fix mandatory waves (apply after any bug route resolves):**
- Run quality gates for affected domain (TypeScript check, tests, or Python lint)
- If the bug was security-related: run full security review gate (dispatch 3 specialists)
- Write outcome to `orchestra/plan.md` with `bug_route: true` flag

---

## Scope Classification Table

Apply **first-match-wins** in priority order. Stop at the first matching rule.

| Priority | Scope | Classification Rule |
|----------|-------|---------------------|
| 1 | `project` | Request is a "new feature / module / service / design" AND no spec file exists for it under `specs/feature/` |
| 2 | `large` | File count > 10 OR a Drizzle/Alembic DB migration is required OR domains affected ≥ 3 |
| 3 | `medium` | File count 4–10 OR 2 domains with inter-dependencies (e.g., backend tRPC + frontend React page) |
| 4 | `small` | File count 1–3 AND single domain AND low risk |
| 5 | `trivial` | Single file AND the fix is immediately clear AND no schema changes AND no auth changes |

**Scope estimation — counting files:**
- Count distinct files to be read AND modified (not directories)
- A tRPC router file + its test file = 2 files
- A migration SQL file + schema.ts + the router that uses it = 3 files
- Frontend component + page that imports it + shared type = 3 files

**SmartSpecPro-specific scope examples:**

- **trivial:** Fix a typo in `apps/web/client/src/pages/Login.tsx`. One file, display only, no logic change.

- **small:** Add a new optional `description` field to the `skills.create` tRPC procedure input. Change: `apps/web/server/routers/skills.ts` (Zod schema update). Single domain (backend), no migration.

- **medium:** Add a new tRPC router `apps/web/server/routers/ragScopes.ts` + a corresponding React page `apps/web/client/src/pages/RagScopesPage.tsx` + a shared Zod schema in `packages/shared/src/ragScopes.ts`. Two domains (backend, frontend) with a shared type contract.

- **large:** New multi-tenant "Presentation Templates" feature: Drizzle migration (new `presentation_templates` table), tRPC router (`apps/web/server/routers/presentationTemplates.ts`), React UI (`apps/web/client/src/pages/TemplatesPage.tsx`), Python Celery template-render task (`python-backend/app/tasks/render_template.py`). 4 domains, DB migration.

- **project:** "Skills Marketplace module" — no spec file exists under `specs/feature/`. Requires full deep-plan pipeline before any implementation.

---

## Risk Classification Table

Apply **in parallel** with scope (not as a gating step). Record both independently.

| Risk | Classification Rule |
|------|---------------------|
| `low` | Style/display/copy change, no data access, no auth modification, no new external API calls |
| `medium` | New UI component with tRPC call, new tRPC procedure (no auth change), new Python Celery task, adding optional columns |
| `high` | Auth middleware modification, new Drizzle columns with NOT NULL constraint, encryption or secrets handling, new tenantId isolation logic, multi-tenant data access path |
| `critical` | Auth bypass possible (any change to `apps/web/server/middleware/auth.ts` or tRPC `baseProcedure`), schema DROP/TRUNCATE, credential or API key exposure, payment/billing path modification |

**SmartSpecPro-specific risk examples:**

- **low:** Changing a Tailwind class from `text-gray-500` to `text-gray-600` in a presentational component.

- **medium:** Adding a new `trpc.userSettings.getNotificationPreferences` query procedure in `apps/web/server/routers/userSettings.ts` — new tRPC endpoint, no auth change, no migration.

- **high:** Adding a `stripeCustomerId` column to the `tenants` table with `NOT NULL` and a backfill migration. Touches billing path and requires careful migration to avoid locking production rows.

- **critical:** Modifying the `isAuthenticated` middleware in `apps/web/server/middleware/auth.ts`. Any change here could expose all authenticated endpoints.

**Risk escalation rule:** If the request description mentions any of the following words, treat as HIGH or CRITICAL regardless of scope:
- "auth", "authentication", "token", "JWT", "session", "permission", "role", "admin" → HIGH minimum
- "bypass", "drop", "truncate", "credential", "key", "secret", "payment", "billing" → CRITICAL

---

## Classification Output Format

After classification, write this block to `orchestra/plan.md`:

```markdown
## Task Classification
- Scope: [trivial|small|medium|large|project]
- Risk: [low|medium|high|critical]
- Affected domains: [e.g., "CMD-2 Backend, CMD-1 Frontend"]
- Estimated file count: [N]
- Chosen route: [route name — see routing-decision.md]
- Bug route: [true|false]
- Classification notes: [1–2 sentences explaining why this classification was chosen]
```

**Example output:**

```markdown
## Task Classification
- Scope: medium
- Risk: medium
- Affected domains: CMD-2 Backend, CMD-1 Frontend
- Estimated file count: 5
- Chosen route: multi-agent-waves
- Bug route: false
- Classification notes: Two domains with a shared tRPC contract (backend writes procedure,
  frontend consumes it). File count is 5 (router, schema, page, component, test). Medium
  risk — new endpoint, no auth or migration involved.
```
