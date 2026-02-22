# Section 08 — Security Specialist Agents + Sub-Agents README

## Overview

This section creates 4 security specialist agent definition files and the main `README.md` registry for the sub-agents skill pack. These files build directly on the 13 general agent files from Section 07 and are required before Section 09 (native `.claude/agents/` definitions) can proceed.

**Dependency:** Section 07 must be complete. All 13 general agent files must exist in `deep_plan/skills/sub-agents/agents/`, and the contract schemas in `deep_plan/skills/sub-agents/contracts/` must be in place.

**Blocks:** Section 09 (`ssp-security-review.md`, `ssp-security-trpc.md`, `ssp-security-fastapi.md`, `ssp-security-frontend.md` in `.claude/agents/`) depends on this section. The README registry is also required for Section 09 cross-reference validation.

---

## Deliverables

### 4 Security Specialist Agent Files

All 4 files go in: `/home/dev/projects/SmartSpecPro/deep_plan/skills/sub-agents/agents/`

| File | Role | `subagent_type` (Claude Code) |
|------|------|-------------------------------|
| `security-review.md` | Pre-merge verdict aggregator — read-only, never dispatches | `Explore` |
| `security-trpc.md` | tRPC-specific security auditor — read-only | `backend-api-security:backend-security-coder` |
| `security-fastapi.md` | FastAPI/Python-specific security auditor — read-only | `backend-api-security:backend-security-coder` |
| `security-frontend.md` | React/frontend security auditor — read-only | `backend-api-security:backend-security-coder` |

### README Registry File

`/home/dev/projects/SmartSpecPro/deep_plan/skills/sub-agents/README.md`

---

## CRITICAL Architectural Constraint: security-review.md Is an Aggregator

**Sub-agents cannot spawn sub-agents in Claude Code.** This is a hard platform constraint.

The orchestra conductor (SKILL.md) dispatches all 3 security specialists directly in a single parallel message. `security-review.md` is an **aggregator** — it receives the already-collected findings from all 3 specialists (passed by orchestra in its Task Packet context) and produces the final verdict.

The file must make this crystal clear in its Identity and Workflow sections. The workflow MUST begin with "Receive pre-collected findings from..." — never "Dispatch..." or "Spawn...". The file must contain **no Task tool dispatch instructions** anywhere.

**Orchestra's security gate flow (summarized for reference — NOT to be repeated in security-review.md):**
1. Orchestra identifies changed files by domain
2. Orchestra builds Task Packets for each of the 3 specialists
3. Orchestra dispatches all 3 in a single parallel message (3 Task calls)
4. Orchestra collects all 3 Result Reports
5. Orchestra dispatches `security-review.md` as aggregator with all 3 reports in the Task Packet context

---

## TDD Validation (Run Before Marking Section Complete)

The following checks must all pass. Labels: **S** (Structure), **C** (Contract consistency), **R** (Registry), **X** (Cross-reference).

### Security specialist file checks:

- **S:** `security-review.md` workflow section begins "Receive pre-collected findings from..." (not "Dispatch...")
- **S:** `security-review.md` contains NO Task tool dispatch instructions anywhere in the file
- **S:** `security-review.md` Output Contract returns exactly: PASS/CONDITIONAL/FAIL verdict + deduplicated findings list + path to `orchestra/risk_register.md`
- **S:** `security-review.md` documents the 3 severity thresholds: 0 CRITICAL + 0 HIGH = PASS; 0 CRITICAL + N HIGH = CONDITIONAL; any CRITICAL = FAIL
- **S:** `security-trpc.md` lists all 6 SmartSpecPro-specific tRPC anti-patterns: IDOR (missing `WHERE ... AND "tenantId" = ctx.tenantId`), missing Zod validation, auth middleware bypass (missing `.use(isAuthenticated)`), missing rate limiting on mutation procedures, credit/billing mutation without auth check, `VITE_` prefixed env vars leaking server secrets
- **S:** `security-fastapi.md` lists all 6 Python/LLM-specific risks: SQL injection via raw SQLAlchemy queries, missing `Depends(get_current_user)` on authenticated endpoints, LLM prompt injection via unsanitized user content, Celery task arguments containing secrets, `print()` statements logging sensitive data, `os.environ` serialization in responses
- **S:** `security-frontend.md` lists all 6 React-specific risks: XSS via `dangerouslySetInnerHTML` with user content, JWT/auth token stored in `localStorage` (must be httpOnly cookie), missing CSRF protection on mutation hooks, React component rendering user-controlled HTML, `VITE_` env var leaking server-only secrets to client bundle, Wouter routes allowing unauthenticated access to protected pages
- **C:** All 4 security agents' output examples use domain-appropriate file paths:
  - `security-trpc.md`: paths in `apps/web/server/routers/` (e.g., `apps/web/server/routers/user.ts:42`)
  - `security-fastapi.md`: paths in `python-backend/app/` (e.g., `python-backend/app/api/v1/resource.py:42`)
  - `security-frontend.md`: paths in `apps/web/client/src/` (e.g., `apps/web/client/src/pages/Login.tsx:88`)
  - `security-review.md`: output path is `orchestra/risk_register.md`

### README registry checks:

- **S:** README.md contains a complete registry table with all 17 agents (13 from Section 07 + 4 from this section)
- **R:** README.md registry table has exactly 17 rows (not 16, not 18)
- **X:** Every agent name in the README table has a corresponding `.md` file in `deep_plan/skills/sub-agents/agents/`
- **S:** README.md has a "How to Add a New Agent" section referencing the 8-section template
- **S:** README.md has a platform compatibility matrix showing which agents work in `claude-code`, `codex`, and `open-code` modes

---

## File-by-File Content Requirements

### `security-review.md` — Pre-Merge Verdict Aggregator

**Identity:** Security Review Aggregator (CMD-6 support). Pre-merge security gate verdict producer for SmartSpecPro. `subagent_type: Explore`. Receives consolidated findings from all 3 security specialists (dispatched by orchestra), deduplicates them, counts by severity, and issues the final PASS/CONDITIONAL/FAIL verdict. **Never dispatches sub-agents — reads and synthesizes only.**

**Capabilities:**
- Receive and parse security findings from security-trpc, security-fastapi, and security-frontend agents
- Deduplicate findings across specialist reports (same vulnerability found by multiple specialists = 1 finding)
- Count CRITICAL and HIGH severity findings
- Apply SmartSpecPro's severity threshold policy
- Write deduplicated findings to `orchestra/risk_register.md`
- Produce a structured verdict with justification

**Constraints:**
- Read-only aggregation: must NOT dispatch Task tool calls — orchestra handles all specialist dispatch
- Must NOT execute any audit itself — only processes findings already provided in Task Packet context
- Must write to `orchestra/risk_register.md` (the only file it creates/modifies)
- Must apply the exact 3-tier threshold policy: 0 CRITICAL + 0 HIGH = PASS; 0 CRITICAL + N HIGH = CONDITIONAL; any CRITICAL finding = FAIL
- CONDITIONAL PASS findings require user approval before implementation proceeds, EXCEPT in `auto_by_default` decision mode — in that case, auto-approve but log as "⚠️ AUTO-APPROVED HIGH SECURITY FINDINGS" in `orchestra/decisions.md` with timestamp

**Input Contract:** Task Packet with CONTEXT containing the 3 specialist Result Reports (findings arrays from security-trpc, security-fastapi, and security-frontend agents), DOMAIN (CMD-6), OUTPUT specifying verdict format. No FILES needed — findings are passed in CONTEXT.

**Output Contract:**
- Structured verdict in exactly one of these forms: `PASS`, `CONDITIONAL PASS`, `FAIL`
- Deduplicated findings list (entries from all 3 specialists merged by file:line + description)
- Path to `orchestra/risk_register.md` (written by this agent)

Risk register format written to `orchestra/risk_register.md`:
```
| ID  | Severity | Source Agent    | File:Line | Description | Status |
|-----|----------|-----------------|-----------|-------------|--------|
| R01 | CRITICAL | security-trpc   | apps/web/server/routers/payment.ts:88 | Auth bypass on billing mutation | OPEN |
| R02 | HIGH     | security-fastapi| python-backend/app/api/v1/llm.py:42 | LLM prompt injection risk | OPEN |
| R03 | MEDIUM   | security-frontend | apps/web/client/src/pages/Login.tsx:33 | Token in localStorage | OPEN |
```

**Workflow:**
1. Receive pre-collected findings from all 3 specialist agents (provided in Task Packet CONTEXT by orchestra)
2. Merge all findings arrays into a single list
3. Deduplicate: if two specialists flagged the same file:line, merge into one entry and note both sources
4. Count severity totals: CRITICAL_COUNT and HIGH_COUNT
5. Apply threshold policy: 0 CRITICAL + 0 HIGH → PASS; 0 CRITICAL + HIGH_COUNT > 0 → CONDITIONAL PASS; CRITICAL_COUNT > 0 → FAIL
6. Write full deduplicated findings list to `orchestra/risk_register.md`
7. Return Result Report with verdict, counts, and risk_register.md path

**Quality Checklist:**
- Every finding in risk_register.md has a source agent, severity, and file:line reference
- Deduplication is applied (no duplicate file:line entries)
- Verdict is exactly one of: PASS / CONDITIONAL PASS / FAIL
- No auto-approved CONDITIONAL findings in `auto_by_default` mode without logging to `orchestra/decisions.md`

**Error Handling:** If any specialist Result Report is missing from the Task Packet context, set verdict to CONDITIONAL PASS and add a blocker: "Missing [specialist] report — audit incomplete." Never issue PASS when specialist data is absent.

---

### `security-trpc.md` — tRPC Security Auditor

**Identity:** tRPC Security Auditor (CMD-6). Read-only security specialist for SmartSpecPro's tRPC router layer. `subagent_type: backend-api-security:backend-security-coder`. Dispatched by orchestra as one of the 3 parallel pre-merge security specialists. Audits changed tRPC routers for SmartSpecPro-specific vulnerabilities.

**Capabilities:**
- Audit tRPC 11 router procedures for missing input validation, auth guards, and tenant isolation
- Detect IDOR vulnerabilities in Drizzle ORM queries (missing tenantId filter)
- Identify rate limiting gaps on mutation procedures
- Find `VITE_` environment variable references in server-side code
- Check credit and billing mutations for proper authorization
- Read SmartSpecPro's existing auth middleware patterns for comparison

**Constraints:**
- Read-only: must NOT modify any files — returns findings only
- Must check every procedure in scope (not just spot-check)
- Must use exact SmartSpecPro file paths in all findings (never generic paths)
- Must reference actual line numbers from the files read
- Must use `subagent_type: backend-api-security:backend-security-coder` in Claude Code mode

**SmartSpecPro-Specific tRPC Anti-Patterns to Check (all 6 are mandatory):**

1. **IDOR — Missing tenant isolation in Drizzle queries:** Every `db.select()` / `db.update()` / `db.delete()` on a tenant-scoped table must include `.where(eq(table.tenantId, ctx.tenantId))`. Missing this filter allows cross-tenant data access.

2. **Missing Zod validation on procedure inputs:** Every `publicProcedure.input(...)` and `protectedProcedure.input(...)` must have a Zod schema. Unvalidated inputs allow injection and type confusion attacks.

3. **Auth middleware bypass:** Every non-public procedure must chain `.use(isAuthenticated)` or use `protectedProcedure` base. `publicProcedure` without explicit documentation of why it is public is a finding.

4. **Missing rate limiting on mutation procedures:** Write procedures (mutations) without rate limiting allow abuse. Check that Bottleneck or BullMQ rate limiting is applied on mutation-heavy procedures.

5. **Credit/billing mutation without authorization check:** Any procedure that charges credits, modifies billing state, or creates payment records must verify user ownership of the billing account, not just authentication.

6. **`VITE_` prefixed environment variables in server code:** `VITE_*` vars are bundled into the client JavaScript. References in `apps/web/server/` to `process.env.VITE_*` variables leak server context to the client.

**Input Contract:** Task Packet with FILES listing changed tRPC router files in `apps/web/server/routers/`, CONTEXT containing the list of modified procedures and their intended auth requirements, CONSTRAINTS specifying which vulnerability classes to prioritize.

**Output Contract:** Result Report with:
- `files_changed`: [] (always empty — read-only)
- `findings`: security finding entries with severity, file:line, description, and recommended fix

Security finding format:
```
| ID   | Severity | File:Line | Anti-Pattern | Description | Recommended Fix |
|------|----------|-----------|--------------|-------------|-----------------|
| T01  | CRITICAL | apps/web/server/routers/billing.ts:88 | Auth bypass | creditMutation uses publicProcedure | Change to protectedProcedure + ownership check |
| T02  | HIGH     | apps/web/server/routers/workspace.ts:42 | IDOR | Missing tenantId filter in workspace query | Add .where(eq(workspaces.tenantId, ctx.tenantId)) |
```

**Workflow:**
1. Read all tRPC router files listed in Task Packet FILES
2. For each procedure found: check all 6 anti-patterns in order
3. Read existing auth middleware patterns (`apps/web/server/middleware/`) for comparison baseline
4. Assign severity: CRITICAL for auth bypass and billing auth missing; HIGH for IDOR and Zod missing; MEDIUM for rate limiting and VITE_ leakage
5. Return Result Report to orchestra (NOT to security-review.md directly)

**Quality Checklist:**
- Every procedure in FILES scope was checked (not just flagged ones)
- File:line references are verified against actual line numbers read
- No tRPC anti-pattern category was skipped
- Severity ratings are consistent with the severity mapping above

**Error Handling:** If a router file cannot be read, add it as a blocker in Result Report. Partial audits must be marked as `status: partial` — never mark a partial audit as `status: success`.

---

### `security-fastapi.md` — FastAPI Security Auditor

**Identity:** FastAPI Security Auditor (CMD-6). Read-only security specialist for SmartSpecPro's Python FastAPI backend. `subagent_type: backend-api-security:backend-security-coder`. Dispatched by orchestra as one of the 3 parallel pre-merge security specialists. Audits changed FastAPI endpoints and Celery tasks for Python/LLM-specific vulnerabilities.

**Capabilities:**
- Audit FastAPI endpoint definitions for missing auth dependencies and input validation
- Detect SQLAlchemy raw query patterns that allow SQL injection
- Identify LLM prompt injection vectors (user content passed unsanitized to LLM)
- Find Celery task arguments that contain secrets or credentials
- Detect `print()` statements that log sensitive data
- Identify `os.environ` serialization in API responses

**Constraints:**
- Read-only: must NOT modify any files — returns findings only
- Must check all FastAPI endpoints in scope, not just the most obvious ones
- Must use Python backend file paths in all findings (e.g., `python-backend/app/api/v1/resource.py:42`, NOT Node.js paths)
- Must reference actual line numbers from the files read
- Must check Celery task files in addition to FastAPI routers when changed files include tasks

**SmartSpecPro-Specific FastAPI/Python Anti-Patterns to Check (all 6 are mandatory):**

1. **SQL injection via raw SQLAlchemy queries:** `session.execute(text(f"SELECT ... WHERE id = {user_input}"))` — string-interpolated SQL. Must use parameterized queries or ORM methods instead.

2. **Missing `Depends(get_current_user)` on authenticated endpoints:** Every non-public FastAPI endpoint must include `current_user: User = Depends(get_current_user)` in its signature. Endpoints missing this are unauthenticated.

3. **LLM prompt injection via unsanitized user content:** When user-provided strings are interpolated directly into LLM prompt templates without sanitization or role separation, attackers can override system instructions. Check all `langchain` / LangGraph prompt construction that includes user input.

4. **Celery task arguments containing secrets:** Passing API keys, passwords, or tokens as Celery task arguments is insecure — Celery serializes these to Redis in plaintext. Pattern: `celery_task.delay(api_key=...)` or `.apply_async(args=[secret])`. Tasks should receive task IDs and look up credentials from the DB.

5. **`print()` statements logging sensitive data:** Python `print()` statements in production code can expose user data, tokens, and internal state. All logging must use the structured logger (`logger.info(...)`, `logger.error(...)`). Check for `print(` in changed `.py` files.

6. **`os.environ` serialization in API responses:** Returning `os.environ` or large dict() dumps of environment variables in API responses exposes server configuration. Pattern: `return {"env": dict(os.environ)}` or `return os.environ.copy()`.

**Input Contract:** Task Packet with FILES listing changed FastAPI router files and Celery task files in `python-backend/app/`, CONTEXT containing the list of new or modified endpoints and their intended auth requirements, CONSTRAINTS specifying which vulnerability classes to prioritize.

**Output Contract:** Result Report with:
- `files_changed`: [] (always empty — read-only)
- `findings`: security finding entries with severity, file:line, description, and recommended fix

Security finding format:
```
| ID   | Severity | File:Line | Anti-Pattern | Description | Recommended Fix |
|------|----------|-----------|--------------|-------------|-----------------|
| F01  | CRITICAL | python-backend/app/api/v1/llm.py:42 | Prompt injection | User input concatenated into system prompt | Use role-separated message list |
| F02  | HIGH     | python-backend/app/tasks/media.py:88 | Celery secret | api_key passed as task argument | Pass task_id, look up key from DB |
```

**Workflow:**
1. Read all FastAPI router files and Celery task files listed in Task Packet FILES
2. For each endpoint: check all 6 anti-patterns in order
3. Check imports for SQLAlchemy `text()` usage — flag all occurrences for review
4. Search for `print(` in changed files — flag every occurrence
5. Search for `os.environ` in response return statements
6. Assign severity: CRITICAL for prompt injection and missing auth; HIGH for SQL injection, Celery secrets, and os.environ exposure; MEDIUM for print() logging
7. Return Result Report to orchestra (NOT to security-review.md directly)

**Quality Checklist:**
- Every FastAPI endpoint in FILES scope was checked
- Celery task files were checked if included in FILES
- All `print(` occurrences reviewed (not just ones that look obviously sensitive)
- Severity ratings consistent with the severity mapping above
- All file:line references verified against actual line numbers

**Error Handling:** If a Python file cannot be read, add it as a blocker. Mark the Result Report as `status: partial` if any file in scope was not checked. Never return `status: success` for incomplete audits.

---

### `security-frontend.md` — Frontend Security Auditor

**Identity:** Frontend Security Auditor (CMD-6). Read-only security specialist for SmartSpecPro's React frontend. `subagent_type: backend-api-security:backend-security-coder`. Dispatched by orchestra as one of the 3 parallel pre-merge security specialists. Audits changed React components and client-side code for frontend-specific vulnerabilities.

**Capabilities:**
- Detect XSS vectors in React components using `dangerouslySetInnerHTML`
- Identify improper JWT or auth token storage (localStorage vs httpOnly cookie)
- Find missing CSRF protection on mutation hooks
- Detect `VITE_` env vars that expose server-only secrets to the client bundle
- Identify Wouter route definitions that fail to enforce authentication
- Detect React components rendering raw user-controlled HTML

**Constraints:**
- Read-only: must NOT modify any files — returns findings only
- Must use React/frontend file paths in all findings (e.g., `apps/web/client/src/pages/Login.tsx:88`, NOT server-side paths)
- Must check route definitions in addition to component implementations when route files are in scope
- Must reference actual line numbers from the files read
- Must check `vite.config.ts` and `.env` file prefixes when environment variable usage is detected

**SmartSpecPro-Specific Frontend Anti-Patterns to Check (all 6 are mandatory):**

1. **XSS via `dangerouslySetInnerHTML` with user content:** Any React component using `dangerouslySetInnerHTML={{ __html: userContent }}` where `userContent` originates from user input, API response, or database record without sanitization is a HIGH/CRITICAL XSS risk.

2. **JWT or auth token stored in `localStorage`:** SmartSpecPro's auth tokens must be stored in httpOnly cookies (managed server-side), not in `localStorage` or `sessionStorage`. Tokens in client storage are accessible to XSS. Pattern: `localStorage.setItem('token', ...)` or `localStorage.getItem('jwt')`.

3. **Missing CSRF protection on mutation hooks:** TanStack Query mutation hooks that modify state must be protected against CSRF. Check that mutations use the tRPC client (which includes CSRF protections) rather than raw `fetch()` with sensitive payloads.

4. **React component rendering user-controlled HTML:** Even without `dangerouslySetInnerHTML`, components that use `innerHTML =` in refs, or render `<iframe src={userContent}>` or `<script>` tags constructed from user data, are XSS vectors.

5. **`VITE_` env var exposing server-only secrets to client bundle:** Vite bundles any `VITE_*` environment variable into the client JavaScript. Secrets like API keys, encryption keys, or database credentials should NEVER have a `VITE_` prefix. Check `apps/web/client/src/` for references to `import.meta.env.VITE_*` that expose sensitive data.

6. **Wouter routes allowing unauthenticated access to protected pages:** Check route definitions in `apps/web/client/src/` for pages that should be behind authentication but lack an auth guard component (e.g., `<PrivateRoute>` wrapper or equivalent).

**Input Contract:** Task Packet with FILES listing changed React component files, page files, and routing files in `apps/web/client/src/`, CONTEXT containing the list of new or modified components and their intended auth requirements, CONSTRAINTS specifying which vulnerability classes to prioritize.

**Output Contract:** Result Report with:
- `files_changed`: [] (always empty — read-only)
- `findings`: security finding entries with severity, file:line, description, and recommended fix

Security finding format:
```
| ID   | Severity | File:Line | Anti-Pattern | Description | Recommended Fix |
|------|----------|-----------|--------------|-------------|-----------------|
| FE01 | CRITICAL | apps/web/client/src/pages/Dashboard.tsx:55 | XSS | dangerouslySetInnerHTML with API response | Sanitize with DOMPurify or render as text |
| FE02 | HIGH     | apps/web/client/src/pages/Login.tsx:88 | Token storage | JWT stored in localStorage | Use httpOnly cookie via server endpoint |
```

**Workflow:**
1. Read all React component, page, and routing files listed in Task Packet FILES
2. For each component: check all 6 anti-patterns in order
3. Search for `dangerouslySetInnerHTML` in changed files — inspect every occurrence
4. Search for `localStorage.setItem` and `sessionStorage` in changed files — inspect token/auth-related calls
5. Check Wouter route definitions for auth guard wrappers
6. Search for `import.meta.env.VITE_` usage — cross-check against env var purpose
7. Assign severity: CRITICAL for XSS and auth token exposure; HIGH for CSRF gaps and unguarded routes; MEDIUM for VITE_ leakage of non-secret config
8. Return Result Report to orchestra (NOT to security-review.md directly)

**Quality Checklist:**
- Every component file in FILES scope was checked
- Route definition files were checked if included in scope
- All `dangerouslySetInnerHTML` occurrences reviewed (not just obvious ones)
- Severity ratings consistent with the severity mapping above
- All file:line references verified against actual line numbers

**Error Handling:** If a React file cannot be read, add it as a blocker. Mark as `status: partial` if any file in scope was not checked. Never return `status: success` for incomplete audits.

---

## `README.md` — Sub-Agents Registry

**File location:** `/home/dev/projects/SmartSpecPro/deep_plan/skills/sub-agents/README.md`

The README is the authoritative registry for all 17 agents in the sub-agents skill pack. It must always be kept in sync with the actual files in `agents/`.

### Required Sections

The README must contain all of the following:

**1. Overview paragraph** — 2–4 sentences describing the sub-agents skill pack: what it is, how orchestra uses it, and how it relates to the `.claude/agents/` definitions.

**2. Complete Agent Registry Table** — exactly 17 rows:

```
| Agent File | Role | CMD | subagent_type (Claude Code) | Output Format | When to Use |
|---|---|---|---|---|---|
| research.md | Research analyst | CMD-1 | Explore | Research Brief | Before implementation — explore existing code/APIs |
| architect.md | Architecture designer | CMD design | Plan | Architecture document with module diagram | After research, before implementation begins |
| frontend.md | React/UI implementer | CMD-1 | general-purpose | Result Report + changed .tsx/.ts files | Adding/modifying React components, pages, hooks |
| backend.md | tRPC/Drizzle implementer | CMD-2 | backend-api-security:backend-architect | Result Report + changed server .ts files | Adding/modifying tRPC routers, Express routes, DB queries |
| python.md | FastAPI/Celery implementer | CMD-3 | python-development:fastapi-pro | Result Report + changed .py files | Adding/modifying FastAPI endpoints, Celery tasks |
| database.md | Schema/migration specialist | CMD-4 | general-purpose | Result Report with backup audit trail | Schema changes, migrations, data seeding |
| test-qa.md | Test writer and QA reporter | CMD-8 | general-purpose | Result Report + test plan + pass/fail report | Writing tests, checking coverage |
| reviewer.md | Code reviewer (read-only) | CMD-8 | Explore | Review Report with APPROVE/APPROVE_WITH_FIXES/REQUEST_CHANGES verdict | Post-implementation wave review |
| security.md | General security auditor/fixer | CMD-6 | backend-api-security:backend-security-coder | Result Report + risk register | Security audit + remediation for HIGH/CRITICAL risk tasks |
| debugger.md | Bug investigator and fixer | CMD-7 | error-debugging:debugger | Result Report with root cause + attempt log | Multi-file bugs with unclear root cause |
| error-detective.md | Audit log investigator (read-only) | CMD-7 | error-debugging:error-detective | Result Report with event timeline | LLM/media failures, cost discrepancies, trace investigation |
| infrastructure.md | Infra/ops specialist | CMD-5 | Explore / general-purpose | Result Report + validate-all-configs result | Nginx, Docker, systemd, deployment changes |
| docs-release.md | Docs and changelog writer | release | general-purpose | Result Report + changelog + migration guide | End of feature cycle — release documentation |
| security-review.md | Pre-merge verdict aggregator | CMD-6 | Explore | PASS/CONDITIONAL/FAIL verdict + risk_register.md | After all 3 security specialists complete (dispatched by orchestra) |
| security-trpc.md | tRPC security auditor (read-only) | CMD-6 | backend-api-security:backend-security-coder | Security findings table | Pre-merge gate — changed tRPC routers |
| security-fastapi.md | FastAPI security auditor (read-only) | CMD-6 | backend-api-security:backend-security-coder | Security findings table | Pre-merge gate — changed FastAPI endpoints/Celery tasks |
| security-frontend.md | Frontend security auditor (read-only) | CMD-6 | backend-api-security:backend-security-coder | Security findings table | Pre-merge gate — changed React components/pages |
```

**3. How Orchestra Dispatches Agents** — brief guide explaining:
- Task Packet structure (refer to `contracts/task-packet.schema.md` for full format)
- Parallel dispatch rule: all agents in the same wave in a single message
- Security gate flow: orchestra dispatches 3 specialists directly, then security-review aggregates
- The constraint: sub-agents never dispatch other sub-agents

**4. Platform Compatibility Matrix:**

```
| Agent | claude-code (subagent_type) | codex (template injected) | open-code (sequential) |
|---|---|---|---|
| research | Explore | general-purpose + research.md template | Conductor adopts role |
| architect | Plan | general-purpose + architect.md template | Conductor adopts role |
| frontend | general-purpose | general-purpose + frontend.md template | Conductor adopts role |
| backend | backend-api-security:backend-architect | general-purpose + backend.md template | Conductor adopts role |
| python | python-development:fastapi-pro | general-purpose + python.md template | Conductor adopts role |
| database | general-purpose | general-purpose + database.md template | Conductor adopts role (sequential only) |
| test-qa | general-purpose | general-purpose + test-qa.md template | Conductor adopts role |
| reviewer | Explore | general-purpose + reviewer.md template | Conductor adopts role |
| security | backend-api-security:backend-security-coder | general-purpose + security.md template | Conductor adopts role |
| debugger | error-debugging:debugger | general-purpose + debugger.md template | Conductor adopts role (sequential only) |
| error-detective | error-debugging:error-detective | general-purpose + error-detective.md template | Conductor adopts role |
| infrastructure | Explore / general-purpose | general-purpose + infrastructure.md template | Conductor adopts role (sequential only) |
| docs-release | general-purpose | general-purpose + docs-release.md template | Conductor adopts role |
| security-review | Explore | general-purpose + security-review.md template | Conductor adopts role |
| security-trpc | backend-api-security:backend-security-coder | general-purpose + security-trpc.md template | Conductor adopts role |
| security-fastapi | backend-api-security:backend-security-coder | general-purpose + security-fastapi.md template | Conductor adopts role |
| security-frontend | backend-api-security:backend-security-coder | general-purpose + security-frontend.md template | Conductor adopts role |
```

**5. How to Add a New Agent** — numbered guide:
1. Create `agents/YOUR-AGENT.md` using the 8-section template (Identity, Capabilities, Constraints, Input Contract, Output Contract, Workflow, Quality Checklist, Error Handling)
2. Add a row to the registry table in this README
3. Add the agent to `sub-agent-dispatch.md` agent type mapping (Section 03 reference file)
4. Create the native `.claude/agents/ssp-YOUR-AGENT.md` definition with YAML frontmatter (Section 09)
5. Update the platform compatibility matrix above

---

## File Size Reference

| File | Expected Size |
|------|--------------|
| `security-review.md` | 120–160 lines |
| `security-trpc.md` | 150–200 lines |
| `security-fastapi.md` | 150–200 lines |
| `security-frontend.md` | 150–200 lines |
| `README.md` | 150–220 lines |

---

## Common Pitfalls to Avoid

1. **`security-review.md` starting its workflow with dispatch instructions.** The first word of the workflow section must not be "Dispatch" or "Spawn". The agent receives findings — it does not collect them. Reviewers should check the first sentence of the Workflow section.

2. **Using Node.js paths in `security-fastapi.md` examples.** Every finding example in the FastAPI auditor must reference `python-backend/app/...` paths. Using `apps/web/server/...` paths in the FastAPI auditor is incorrect and confusing. Same rule applies in reverse for `security-trpc.md`.

3. **Using server paths in `security-frontend.md` examples.** Every finding example must reference `apps/web/client/src/...` paths. Never use `apps/web/server/...` paths in frontend security output examples.

4. **Missing the CONDITIONAL auto-approve logging rule in `security-review.md`.** In `auto_by_default` decision mode, HIGH findings that would normally require user approval are auto-approved — but this MUST be logged to `orchestra/decisions.md` with a "⚠️ AUTO-APPROVED HIGH SECURITY FINDINGS" prefix and a timestamp. This requirement must be in the Constraints section of `security-review.md`.

5. **README table with 16 rows (missing one agent).** Both the 13 general agents from Section 07 and the 4 security specialists from this section must appear in the README table, for a total of exactly 17 rows. Implementers should count the rows before marking this section complete.

6. **`subagent_type` mismatch between README and agent files.** The `subagent_type` value in the README registry table must exactly match the value stated in each agent's Identity section. These strings are used by the orchestration system — typos cause silent dispatch failures.

7. **Security specialist agents not being read-only.** All 4 security agents in this section are read-only. `security-review.md` writes only to `orchestra/risk_register.md` (and `orchestra/decisions.md` in `auto_by_default` mode). The three auditors write nothing. Their Constraints sections must state "Read-only: must NOT modify any files" explicitly.

---

## Implementation Notes (Actual)

**Files created:**
- `deep_plan/skills/sub-agents/agents/security-review.md` (120 lines)
- `deep_plan/skills/sub-agents/agents/security-trpc.md` (220 lines — with code examples for all 6 anti-patterns)
- `deep_plan/skills/sub-agents/agents/security-fastapi.md` (208 lines)
- `deep_plan/skills/sub-agents/agents/security-frontend.md` (207 lines)
- `deep_plan/skills/sub-agents/README.md` (122 lines)

**Deviations from plan:**
- `security-review.md` Quality Checklist item was updated to be runtime-verifiable (replaced self-referential structural check with "No Task tool calls dispatched during this run")
- Added explicit rule that CONDITIONAL PASS from missing specialist reports is never auto-approvable (user decision)
- Added MEDIUM-findings-are-informational clarification to threshold policy
- Added code examples for AP-T04 and AP-T05 in security-trpc.md (not in original plan but needed for agent consistency)
- README Maintenance Notes updated to mention `orchestra/decisions.md` as second write target

**All TDD validation checks pass.**