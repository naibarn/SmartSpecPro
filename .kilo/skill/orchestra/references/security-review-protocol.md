# Security Review Protocol

Full protocol for the pre-merge security gate. This file is used at two distinct points:

- **Step 5 (Result Integration):** Check trigger conditions only — does the gate need to run?
- **Step 6 (Quality Gates):** Execute the gate — dispatch specialists, collect findings,
  apply the verdict.

Do not dispatch specialists during Step 5. Only check whether any trigger condition is true.
If yes, set a flag and proceed to Step 6 to execute the gate.

> **IMPORTANT:** Orchestra (the conductor) dispatches all 3 security specialists.
> `security-review.md` is an **aggregator only** — it receives findings already collected
> by orchestra and produces the verdict. It does **NOT** dispatch any Task tool calls.
> Sub-agents cannot spawn sub-agents in Claude Code. Only the conductor dispatches.

---

## Step 5: Trigger Condition Check

During result integration (SKILL.md Step 5), check whether the pre-merge security gate must
run. Inspect all files changed across the entire session. If **any** of the following
conditions match, set `security_gate_required = true` and proceed to Step 6 after quality
gates begin.

If **none** of the conditions match: skip the gate entirely and proceed to the final summary.

## Trigger Conditions

The pre-merge security gate runs automatically after Step 5 (result integration) if **any**
of the following are true for the current session's changed files:

| Condition | File Patterns |
|-----------|---------------|
| Auth middleware modified | `*/middleware/auth*`, `*/middleware/isAuthenticated*`, `*/lib/jwt*` |
| New tRPC router procedures added | `apps/web/server/routers/*.ts` with new `router.procedure` entries |
| New FastAPI endpoints added | `python-backend/app/api/**/*.py` with new `@router.*` decorators |
| Encryption or secrets handling modified | Files touching `crypto.ts`, `project_crypto.py`, `encryption.py`, `*Encrypted` columns |
| RBAC or permission logic modified | `*/lib/permissions*`, `*/middleware/requireRole*`, multi-tenant isolation queries |
| CORS or CSP configuration changed | Nginx configs, FastAPI CORS middleware, Express CORS setup |
| File upload or deserialization endpoints modified | Any endpoint handling `multipart/form-data` or `application/octet-stream` |
| Security-related dependency upgrades | `package.json` or `requirements.txt` with security library version changes |
| Infrastructure or Nginx configuration changed | `nginx/conf.d/*.conf`, `docker-compose*.yml` service definitions |

If **none** of the above apply: skip the pre-merge gate and proceed to the final summary.

---

## Step 6: Gate Dispatch Flow (Conductor-Managed)

When trigger conditions are met, orchestra executes this flow directly:

### Step A: Sort Changed Files into Domain Buckets

| Bucket | File Paths |
|--------|-----------|
| tRPC bucket | `apps/web/server/routers/`, `apps/web/server/middleware/`, `apps/web/server/lib/` |
| FastAPI bucket | `python-backend/app/api/`, `python-backend/app/middleware/`, `python-backend/app/core/` |
| Frontend bucket | `apps/web/client/src/` |

A file can appear in multiple buckets (e.g., shared type definitions used by both frontend
and backend). If a bucket is empty (no files changed in that domain), omit that specialist
from the dispatch.

### Step B: Build Task Packets for Each Specialist

Each Task Packet must include:
- The specific files from the domain bucket (absolute paths)
- The type of change made (new endpoint, auth modification, encryption change, etc.)
- The finding categories relevant to the domain (see Finding Categories table)
- **Reference cybersecurity skills** — include relevant skills from `skills/cybersecurity/` in the CONTEXT:
  - tRPC agent: `exploiting-idor-vulnerabilities.md`, `exploiting-sql-injection-vulnerabilities.md`, `implementing-api-key-security-controls.md`
  - FastAPI agent: `exploiting-sql-injection-vulnerabilities.md`, `performing-ssrf-vulnerability-exploitation.md`, `exploiting-insecure-deserialization.md`
  - Frontend agent: `testing-for-xss-vulnerabilities.md`, `performing-csrf-attack-simulation.md`, `testing-jwt-token-security.md`
  - Full protocol: `skills/cybersecurity/SECURITY-AUDIT-PROTOCOL.md`

### Step C: Dispatch All Specialists in a Single Message (Parallel)

```
Single message, all specialists simultaneously:

  Task #1: security-trpc agent
    Prompt: [Task Packet for tRPC bucket files]
    background: true

  Task #2: security-fastapi agent
    Prompt: [Task Packet for FastAPI bucket files]
    background: true

  Task #3: security-frontend agent
    Prompt: [Task Packet for frontend bucket files]
    background: true
```

Never dispatch the 3 specialists sequentially. All must run in a single message.

### Step D: Collect Findings

Wait for all specialists to return their Result Reports. Parse each report's `findings`
field. Consolidate into a structured findings list organized by severity.

### Step E: Dispatch security-review Aggregator

Construct a Task Packet for the `security-review` aggregator. The CONTEXT section of
this Task Packet must contain all collected findings from all specialists, formatted as:

```
### Pre-Collected Security Findings

#### From security-trpc:
- SEVERITY: HIGH | CATEGORY: IDOR | FILE: <absolute-repo-root>/apps/web/server/routers/user.ts:42 | getUserById missing tenantId filter
- SEVERITY: MEDIUM | CATEGORY: Missing Zod | FILE: <absolute-repo-root>/apps/web/server/routers/billing.ts:88 | createSubscription input not validated

#### From security-fastapi:
- SEVERITY: CRITICAL | CATEGORY: Auth bypass | FILE: <absolute-repo-root>/python-backend/app/api/v1/llm.py:31 | /generate endpoint missing auth Depends

#### From security-frontend:
(none)
```

The aggregator's job: deduplicate cross-domain findings, count by severity, apply threshold
policy, write `orchestra/risk_register.md`, and return the verdict.

### Step F: Apply Verdict

| Verdict | Action |
|---------|--------|
| `PASS` | Continue to final summary |
| `CONDITIONAL` | In `ask_every_choice` / `smart_auto` modes: pause, display findings to user, request approval. In `auto_by_default` mode: apply auto-approve logging (see below) and continue. |
| `FAIL` | STOP. Present CRITICAL findings to user. Cannot proceed until user resolves or explicitly marks as accepted risk with written acknowledgment. |

---

## Severity Threshold Policy

| CRITICAL count | HIGH count | Verdict | Action |
|---------------|------------|---------|--------|
| 0 | 0 | PASS (green) | Continue to final summary |
| 0 | 1 or more | CONDITIONAL | User approval required (auto-approved in `auto_by_default` mode) |
| 1 or more | any | FAIL | Blocked — user must resolve |

MEDIUM and LOW findings are documented in `orchestra/risk_register.md` but do not affect
the verdict.

---

## Auto-Approve Logging Requirement

When `auto_by_default` mode is active and the verdict is CONDITIONAL, the conductor **MUST**:

**1. Log to `orchestra/decisions.md`:**

```
[YYYY-MM-DDTHH:MM:SSZ] AUTO-APPROVED HIGH SECURITY FINDINGS
Session: [task description]
Findings: [N] HIGH severity findings
Details:
  - HIGH | IDOR | apps/web/server/routers/user.ts:42 | getUserById missing tenantId filter
  - HIGH | IDOR | apps/web/server/routers/billing.ts:88 | createSubscription missing tenantId
Rationale: auto_by_default mode active
```

**2. Include a prominent top-level warning in the final summary:**

```
⚠️ AUTO-APPROVED HIGH SECURITY FINDINGS
[N] HIGH severity security findings were auto-approved because decision mode is auto_by_default.
Review orchestra/risk_register.md for details.
```

This warning must appear in the final summary regardless of how many waves were completed
or how many other items appear in the summary. It must not be buried in a subsection.

---

## Finding Categories for the Active Stack

| Category | Default Severity | Domain | Example |
|----------|-----------------|--------|---------|
| IDOR (tenant isolation missing) | HIGH | tRPC, FastAPI | Missing `WHERE tenantId = ctx.tenantId` in Drizzle query |
| Auth bypass | CRITICAL | tRPC, FastAPI | tRPC procedure missing `.use(isAuthenticated)` middleware |
| SQL injection | CRITICAL | FastAPI | Raw SQLAlchemy query with unsanitized user input |
| LLM prompt injection | HIGH | FastAPI | User-controlled content inserted into LLM prompt without sanitization |
| XSS | HIGH | Frontend | `dangerouslySetInnerHTML` with unescaped user content |
| JWT storage insecurity | HIGH | Frontend | JWT stored in `localStorage` instead of httpOnly cookie |
| Secret exposure (VITE_) | CRITICAL | Frontend, tRPC | Server-only secret in `VITE_*` env var (bundled into client) |
| Hardcoded secret | CRITICAL | Any | API key or password literal in source code |
| Missing Zod validation | MEDIUM | tRPC | tRPC procedure input not validated with Zod schema |
| Missing rate limiting | MEDIUM | tRPC | Mutation procedure with no rate limit |
| CSRF missing | MEDIUM | Frontend | State-changing mutation hook without CSRF token |
| Celery secret leakage | HIGH | FastAPI | Celery task arguments containing decrypted credentials |
| print() logging sensitive data | HIGH | FastAPI | `print(api_key)` or `print(password)` in Python code |
| os.environ serialization | HIGH | FastAPI | `json.dumps(os.environ)` or similar serialized into a response |
| Unauthenticated Wouter route | HIGH | Frontend | Protected page accessible without auth check |
| Missing tenant isolation (DB) | CRITICAL | tRPC, FastAPI | Cross-tenant data leakage possible via unfiltered query |

---

## Risk Register Format

All pre-merge gate findings are written to `orchestra/risk_register.md`:

```markdown
# Risk Register
Last updated: [ISO timestamp]
Session: [task description]
Verdict: [PASS / CONDITIONAL PASS / FAIL]

## Findings

| ID | Severity | Category | File | Line | Description | Status |
|----|----------|----------|------|------|-------------|--------|
| R001 | HIGH | IDOR | apps/web/server/routers/user.ts | 42 | getUserById missing tenantId filter | open |
| R002 | MEDIUM | Missing Zod | apps/web/server/routers/billing.ts | 88 | createSubscription input not validated | open |

## Verdict Rationale
[Aggregator's explanation of which threshold was applied and why]
```

File paths in the risk register must be relative to project root (no leading `/`) for
readability. Absolute paths are used in Task Packets; relative paths in reports.
