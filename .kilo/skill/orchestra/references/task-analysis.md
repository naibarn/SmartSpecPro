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

Is this a CI, GitHub Actions, deployment, or release failure?
  YES → Dispatch ssp-ci-release.
        Context: failing workflow/job name, log excerpt, changed workflow files.

Is this an E2E/browser workflow or Playwright failure?
  YES → Dispatch ssp-e2e-playwright.
        Context: route, user role, viewport, test output, screenshot/trace path if available.

Is this a performance/load/latency regression?
  YES → Dispatch ssp-performance.
        Context: baseline metric, endpoint/component/query, load-test or log output.

Is this a dependency, lockfile, package audit, or supply-chain issue?
  YES → Dispatch ssp-dependency-supply-chain.
        Context: manifest/lockfile paths, scanner output, requested dependency change.

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

## Plain-Text Intent Detection

Before scope classification, interpret the raw user message and decide whether this request should be owned by orchestra at all.
Read `intent-matrix.md` before finalizing this judgment. Use it as the calibration layer for positive, negative, and borderline examples.
Read `intent-regression-suite.md` whenever a message feels borderline, when you adjust heuristics, or when you want to sanity-check whether a trigger decision is consistent with the canonical examples.


### Auto-Own The Request When The Message Implies:
- multi-step software work
- planning + implementation together
- decomposition, coordination, or staged execution
- cross-domain or system-level changes
- resume/continue semantics for prior implementation work
- “analyze then execute” behavior rather than a narrow one-shot change

### Message Patterns That Usually Mean Orchestra
- “ช่วยวางแผนแล้วทำต่อ” / “ช่วยจัดการงานนี้ให้จบ” / “แตกงานให้หน่อย”
- “implement this end-to-end” / “plan and execute” / “coordinate this work”
- “what all needs to change” / “drive this to completion”
- “ปรับ UI ให้ premium/modern/responsive/accessible” / “ทำ UX ให้ดีขึ้น” when the request implies code changes or review across UI files

### Message Patterns That Usually Do NOT Mean Orchestra
- narrow factual Q&A
- one-off shell command requests
- obvious single-file tweak requests with no decomposition value
- requests explicitly targeted at another named specialized skill that does not need conductor behavior

### Escalate Into Orchestra After Quick Inspection When:
- the task appears under-specified
- the likely file/domain count is larger than the user message suggests
- planning artifacts would reduce risk
- the job is likely to require `deep-plan-quick`, `deep-plan`, `deep-project`, or `deep-implement`

If orchestra takes ownership from plain text, treat the original message itself as the task description and continue into scope/risk classification.

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

**Quick-plan override:** If scope lands in `small` or `medium` but the request is still under-specified, has no `spec.md`, or would benefit from a written plan before coding, choose `quick-plan-chain` instead of going straight to implementation.

**Product-UX preflight:** If scope lands in `medium`, `large`, or `project` and user-facing behavior, role behavior, UX states, or acceptance criteria are unclear, dispatch `ssp-product-ux` before architecture or deep planning. Its Product UX Brief becomes CONTEXT for `architect`, `deep-plan-quick`, or `deep-plan`.

**Visual UI preflight:** If the request asks for premium/modern UI, visual polish, responsive behavior, accessibility, dark mode, Tailwind/shadcn cleanup, or production-ready frontend refinement, route through the visual UI workflow:
`visual-ui-requirement-analyzer` → `visual-ui-direction` → `ui-builder`/`frontend` → `visual-ux-reviewer` + `accessibility-reviewer` + `responsive-reviewer` → `visual-final-refactor` as needed.

**project-specific scope examples:**

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

**project-specific risk examples:**

- **low:** Changing a Tailwind class from `text-gray-500` to `text-gray-600` in a presentational component.

- **medium:** Adding a new `trpc.userSettings.getNotificationPreferences` query procedure in `apps/web/server/routers/userSettings.ts` — new tRPC endpoint, no auth change, no migration.

- **high:** Adding a `stripeCustomerId` column to the `tenants` table with `NOT NULL` and a backfill migration. Touches billing path and requires careful migration to avoid locking production rows.

- **critical:** Modifying the `isAuthenticated` middleware in `apps/web/server/middleware/auth.ts`. Any change here could expose all authenticated endpoints.

**Risk escalation rule:** If the request description mentions any of the following words, treat as HIGH or CRITICAL regardless of scope:
- "auth", "authentication", "token", "JWT", "session", "permission", "role", "admin" → HIGH minimum
- "bypass", "drop", "truncate", "credential", "key", "secret", "payment", "billing" → CRITICAL
- "dependency", "lockfile", "package", "npm", "pnpm", "pip", "uv", "Docker image", "GitHub Actions", "CI", "deploy" → MEDIUM minimum
- "load test", "performance", "latency", "timeout", "N+1", "slow query", "cache" → MEDIUM minimum
- "premium UI", "modern UI", "responsive", "accessibility", "a11y", "dark mode", "Tailwind", "shadcn", "visual polish", "UX" → LOW minimum; MEDIUM when multiple UI files or user workflows are affected

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

A `small` or `medium` classification can still route to `quick-plan-chain` when planning value is high and implementation readiness is low.


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
