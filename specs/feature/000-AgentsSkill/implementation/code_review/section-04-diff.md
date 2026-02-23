diff --git a/deep_plan/skills/orchestra/references/quality-gates.md b/deep_plan/skills/orchestra/references/quality-gates.md
new file mode 100644
index 0000000..1400b4e
--- /dev/null
+++ b/deep_plan/skills/orchestra/references/quality-gates.md
@@ -0,0 +1,136 @@
+# Quality Gates
+
+Defines all 6 gate types that the orchestra conductor runs after each wave of agent work.
+Read by SKILL.md Step 6. Risk level terminology follows `task-analysis.md`.
+
+---
+
+## Gate Inventory
+
+| # | Gate | Command | Trigger | Blocking Level | Max Retries |
+|---|------|---------|---------|----------------|-------------|
+| 1 | TypeScript Check | `cd apps/web && pnpm check` | Any `.ts` or `.tsx` files changed | HIGH/CRITICAL: blocking; LOW/MEDIUM: warning | 3 |
+| 2 | Python Lint | `cd python-backend && ruff check app/` | Any `.py` files changed | HIGH/CRITICAL: blocking; LOW/MEDIUM: warning | 3 |
+| 3 | Unit Tests | `cd apps/web && pnpm test` and/or `cd python-backend && pytest` | Medium risk or higher; or when test files exist for changed code | HIGH/CRITICAL: blocking; MEDIUM: warning | 3 |
+| 4 | Security Review (General) | Dispatch `security.md` agent (spot check only — not the full pre-merge gate) | Task risk level is HIGH | CRITICAL findings: blocking; HIGH findings: warning unless task is CRITICAL | 3 |
+| 5 | Full Test Suite | `cd apps/web && pnpm test` AND `cd python-backend && pytest` | CRITICAL risk tasks | Always blocking | 3 |
+| 6 | Pre-Merge Security Gate | Dispatch 3 specialists + security-review aggregator (see `security-review-protocol.md`) | Trigger conditions defined in `security-review-protocol.md` | Always blocking until verdict returned | N/A (managed by security-review-protocol) |
+
+---
+
+## Blocking vs Warning Matrix
+
+| Risk Level | TypeScript Check | Python Lint | Unit Tests | Security (General) | Full Test Suite |
+|------------|-----------------|-------------|------------|-------------------|-----------------|
+| low | warning | warning | skip | skip | skip |
+| medium | warning | warning | warning | skip | skip |
+| high | **blocking** | **blocking** | **blocking** | **blocking** | skip |
+| critical | **blocking** | **blocking** | **blocking** | **blocking** | **blocking** |
+
+Orchestra logs warnings and continues. Blocking gates must pass before proceeding to the
+next wave or the final summary.
+
+---
+
+## Gate Details
+
+### Gate 1: TypeScript Check
+
+```bash
+cd apps/web && pnpm check
+```
+
+Runs `tsc --noEmit` (configured in `apps/web/tsconfig.json`). Catches type errors, missing
+imports, and schema shape mismatches across the full web app. This is the fastest signal
+of a broken contract between frontend and backend.
+
+### Gate 2: Python Lint
+
+```bash
+cd python-backend && ruff check app/
+```
+
+Runs ruff with `E, W, F, I, B, C4, UP` rules (configured in `python-backend/pyproject.toml`).
+Catches unused imports, undefined variables, and unsafe patterns. Does not run type checks.
+For type safety, use `mypy app/` as a separate manual step.
+
+### Gate 3: Unit Tests
+
+```bash
+# Node.js tests
+cd apps/web && pnpm test
+
+# Python tests
+cd python-backend && pytest
+```
+
+Run the relevant suite for the languages touched in the wave. Run both if the wave touched
+both TypeScript and Python files.
+
+### Gate 4: Security Review (General)
+
+Dispatch `security.md` agent (from `deep_plan/skills/sub-agents/agents/security.md`) as a
+spot check. This is not the full pre-merge gate — it is a targeted review of high-risk
+changes mid-workflow. The agent reads changed files and returns findings. Does not dispatch
+specialist sub-agents.
+
+### Gate 5: Full Test Suite
+
+```bash
+cd apps/web && pnpm test && cd ../../python-backend && pytest
+```
+
+Run both test suites end-to-end. Required for CRITICAL risk tasks. Blocking regardless of
+outcome — if either suite fails, the conductor must fix and retry before proceeding.
+
+### Gate 6: Pre-Merge Security Gate
+
+See `security-review-protocol.md` for complete protocol. Summary:
+1. Orchestra dispatches security-trpc, security-fastapi, and/or security-frontend agents
+   in parallel (single message)
+2. Collects findings from all specialists
+3. Dispatches security-review aggregator with collected findings
+4. Aggregator returns PASS / CONDITIONAL / FAIL verdict
+5. Conductor applies verdict per `security-review-protocol.md` threshold policy
+
+This gate is always blocking — no workflow-level bypass. Only the security-review aggregator
+can unblock it by returning a PASS or CONDITIONAL verdict.
+
+---
+
+## Gate Failure Protocol
+
+When a gate fails:
+
+1. **Identify the source** — read the error output to determine which agent's change caused
+   the failure. Check file paths in the error against the wave's ownership boundaries.
+2. **Construct a fix Task Packet** — include: exact error message, gate that failed, file
+   paths involved, wave number, and the original task.
+3. **Re-dispatch the same agent type** that produced the failing code.
+4. **Increment the retry counter** for this (gate, wave) pair.
+5. **If retry counter reaches 3** — STOP. Report to user with full error context and all 3
+   attempts' error outputs. Do NOT attempt a 4th dispatch.
+
+The retry counter resets per wave, per gate. A gate that fails in wave 2 and succeeds on
+retry 1 starts fresh in wave 3.
+
+---
+
+## Gate Command Reference
+
+```bash
+# TypeScript type check (web app)
+cd apps/web && pnpm check
+
+# Python lint
+cd python-backend && ruff check app/
+
+# Node.js unit tests
+cd apps/web && pnpm test
+
+# Python unit tests
+cd python-backend && pytest
+
+# Full test suite (both)
+cd apps/web && pnpm test && cd ../../python-backend && pytest
+```
diff --git a/deep_plan/skills/orchestra/references/result-integration.md b/deep_plan/skills/orchestra/references/result-integration.md
new file mode 100644
index 0000000..dd78f57
--- /dev/null
+++ b/deep_plan/skills/orchestra/references/result-integration.md
@@ -0,0 +1,124 @@
+# Result Integration
+
+Defines how the orchestra conductor processes wave outputs after all agents in a wave have
+returned their Result Reports. Read by SKILL.md Step 5.
+
+Result Report schema is defined in `deep_plan/skills/sub-agents/contracts/result-report.schema.md`.
+
+---
+
+## Step-by-Step Integration Process
+
+After every wave completes, the conductor follows these steps in order:
+
+### Step 1: Collect Outputs
+
+Read each agent's Result Report. Parse the 6 fields:
+- `status`: completed / partial / failed
+- `files_changed`: list of absolute paths modified or created
+- `findings`: observations, warnings, or unexpected behavior
+- `blockers`: issues preventing the agent from completing
+- `next_steps`: what the agent recommends for the next wave
+- `quality_gate_results`: pass/fail status of any gates the agent self-ran
+
+### Step 2: Detect File Conflicts
+
+For each file path in any `files_changed` list, check if more than one agent reports
+changes to the same path. If yes, flag it as a conflict and proceed to the merge strategy.
+
+Single-agent waves (sequential dispatch) cannot have file conflicts — skip this step.
+
+### Step 3: Apply Merge Strategy
+
+```
+Are the changes in different sections or functions of the file?
+  YES → Manual merge: read both agents' versions, combine non-conflicting changes, write result.
+
+  NO  → Conflicting implementations. Apply contract-compliant resolution:
+         1. Re-read orchestra/contracts.md.
+         2. Determine which agent's output matches the agreed interface.
+         3. Accept the contract-compliant version.
+         4. Log the decision in orchestra/decisions.md (see format below).
+         5. Re-dispatch the non-compliant agent with a Task Packet containing:
+            - The accepted implementation as context
+            - The contract the agent must comply with
+            - A note that its previous output was superseded
+```
+
+### Step 4: Verify Contract Compliance
+
+Compare each agent's output against the contract in `orchestra/contracts.md`:
+- Correct files modified (ownership boundaries respected)?
+- Output API shape matches the agreed interface?
+- No out-of-scope modifications to files the agent does not own?
+
+If an agent went out of scope, flag a contract violation. Log it to `orchestra/decisions.md`
+and re-dispatch with tighter constraints.
+
+### Step 5: Update Progress
+
+Write wave status to `orchestra/progress.md`:
+- Wave number and completion status (completed / partial / blocked)
+- Files changed (list of absolute paths)
+- Gate results (which gates passed/failed)
+- Any blockers to carry into the next wave
+
+### Step 6: Check Pre-Merge Security Gate
+
+After the **final wave only**, evaluate whether trigger conditions in
+`security-review-protocol.md` apply to the full session's changed files. If any condition
+matches, run the pre-merge security gate before reporting completion.
+
+---
+
+## Merge Strategy
+
+### Conflict Resolution Log Format (orchestra/decisions.md)
+
+```
+[YYYY-MM-DDTHH:MM:SSZ] Auto-resolved conflict
+File: /home/dev/projects/SmartSpecPro/apps/web/server/routers/dashboard.ts
+Kept: backend agent output (matches contract: trpc.dashboard.getSummary response shape)
+Superseded: frontend agent's incidental modification to the same router file
+Re-dispatching: frontend agent with corrected scope constraints
+Contract reference: orchestra/contracts.md — frontend ↔ backend — UserDashboard
+```
+
+---
+
+## When to Pause for User
+
+Conductor auto-resolves conflicts silently in most cases. Pause for user input only when:
+
+- Both agents produced implementations that each claim to match the contract, but the
+  contract itself is ambiguous (e.g., the Zod schema allows either interpretation)
+- Resolving the conflict would require re-running more than one previous wave
+- An agent returned `status: failed` with a blocker that cannot be fixed by re-dispatch
+  (external API unavailable, required file deleted by another agent, missing dependency)
+
+When pausing: present both implementations side-by-side, explain the conflict, and ask the
+user which to accept. Do not proceed until the user responds.
+
+---
+
+## Failed Agent Handling
+
+If an agent returns `status: failed`:
+
+1. Read the `blockers` field in its Result Report.
+2. If the blocker is fixable (wrong file path, missing import, minor schema mismatch):
+   construct a fix Task Packet and re-dispatch.
+3. If the blocker is unfixable (external service down, unresolvable merge conflict,
+   missing dependency that requires a new wave): log to `orchestra/progress.md` and pause
+   for user.
+4. Never silently skip a failed agent's work and proceed to the next wave.
+
+---
+
+## Output Files
+
+| File | Updated When | Content |
+|------|-------------|---------|
+| `orchestra/progress.md` | After every wave | Wave N status, files changed, gate results, blockers |
+| `orchestra/decisions.md` | On every auto-resolution or auto-approval | Timestamp, decision, rationale, contract reference |
+| `orchestra/contracts.md` | Never modified after creation | Read-only during integration; frozen after Wave 1 |
diff --git a/deep_plan/skills/orchestra/references/security-review-protocol.md b/deep_plan/skills/orchestra/references/security-review-protocol.md
new file mode 100644
index 0000000..610b05e
--- /dev/null
+++ b/deep_plan/skills/orchestra/references/security-review-protocol.md
@@ -0,0 +1,201 @@
+# Security Review Protocol
+
+Full protocol for the pre-merge security gate. Read by Orchestra SKILL.md at Steps 5
+and 6.
+
+> **IMPORTANT:** Orchestra (the conductor) dispatches all 3 security specialists.
+> `security-review.md` is an **aggregator only** — it receives findings already collected
+> by orchestra and produces the verdict. It does **NOT** dispatch any Task tool calls.
+> Sub-agents cannot spawn sub-agents in Claude Code. Only the conductor dispatches.
+
+---
+
+## Trigger Conditions
+
+The pre-merge security gate runs automatically after Step 5 (result integration) if **any**
+of the following are true for the current session's changed files:
+
+| Condition | File Patterns |
+|-----------|---------------|
+| Auth middleware modified | `*/middleware/auth*`, `*/middleware/isAuthenticated*`, `*/lib/jwt*` |
+| New tRPC router procedures added | `apps/web/server/routers/*.ts` with new `router.procedure` entries |
+| New FastAPI endpoints added | `python-backend/app/api/**/*.py` with new `@router.*` decorators |
+| Encryption or secrets handling modified | Files touching `crypto.ts`, `smartspecweb_crypto.py`, `encryption.py`, `*Encrypted` columns |
+| RBAC or permission logic modified | `*/lib/permissions*`, `*/middleware/requireRole*`, multi-tenant isolation queries |
+| CORS or CSP configuration changed | Nginx configs, FastAPI CORS middleware, Express CORS setup |
+| File upload or deserialization endpoints modified | Any endpoint handling `multipart/form-data` or `application/octet-stream` |
+| Security-related dependency upgrades | `package.json` or `requirements.txt` with security library version changes |
+| Infrastructure or Nginx configuration changed | `nginx/conf.d/*.conf`, `docker-compose*.yml` service definitions |
+
+If **none** of the above apply: skip the pre-merge gate and proceed to the final summary.
+
+---
+
+## Gate Dispatch Flow (Conductor-Managed)
+
+When trigger conditions are met, orchestra executes this flow directly:
+
+### Step A: Sort Changed Files into Domain Buckets
+
+| Bucket | File Paths |
+|--------|-----------|
+| tRPC bucket | `apps/web/server/routers/`, `apps/web/server/middleware/`, `apps/web/server/lib/` |
+| FastAPI bucket | `python-backend/app/api/`, `python-backend/app/middleware/`, `python-backend/app/core/` |
+| Frontend bucket | `apps/web/client/src/` |
+
+A file can appear in multiple buckets (e.g., shared type definitions used by both frontend
+and backend). If a bucket is empty (no files changed in that domain), omit that specialist
+from the dispatch.
+
+### Step B: Build Task Packets for Each Specialist
+
+Each Task Packet must include:
+- The specific files from the domain bucket (absolute paths)
+- The type of change made (new endpoint, auth modification, encryption change, etc.)
+- The finding categories relevant to the domain (see Finding Categories table)
+
+### Step C: Dispatch All Specialists in a Single Message (Parallel)
+
+```
+Single message, all specialists simultaneously:
+
+  Task #1: security-trpc agent
+    Prompt: [Task Packet for tRPC bucket files]
+    background: true
+
+  Task #2: security-fastapi agent
+    Prompt: [Task Packet for FastAPI bucket files]
+    background: true
+
+  Task #3: security-frontend agent
+    Prompt: [Task Packet for frontend bucket files]
+    background: true
+```
+
+Never dispatch the 3 specialists sequentially. All must run in a single message.
+
+### Step D: Collect Findings
+
+Wait for all specialists to return their Result Reports. Parse each report's `findings`
+field. Consolidate into a structured findings list organized by severity.
+
+### Step E: Dispatch security-review Aggregator
+
+Construct a Task Packet for the `security-review` aggregator. The CONTEXT section of
+this Task Packet must contain all collected findings from all specialists, formatted as:
+
+```
+### Pre-Collected Security Findings
+
+#### From security-trpc:
+- SEVERITY: HIGH | CATEGORY: IDOR | FILE: /home/dev/projects/SmartSpecPro/apps/web/server/routers/user.ts:42 | getUserById missing tenantId filter
+- SEVERITY: MEDIUM | CATEGORY: Missing Zod | FILE: /home/dev/projects/SmartSpecPro/apps/web/server/routers/billing.ts:88 | createSubscription input not validated
+
+#### From security-fastapi:
+- SEVERITY: CRITICAL | CATEGORY: Auth bypass | FILE: /home/dev/projects/SmartSpecPro/python-backend/app/api/v1/llm.py:31 | /generate endpoint missing auth Depends
+
+#### From security-frontend:
+(none)
+```
+
+The aggregator's job: deduplicate cross-domain findings, count by severity, apply threshold
+policy, write `orchestra/risk_register.md`, and return the verdict.
+
+### Step F: Apply Verdict
+
+| Verdict | Action |
+|---------|--------|
+| `PASS` | Continue to final summary |
+| `CONDITIONAL` | In `ask_every_choice` / `smart_auto` modes: pause, display findings to user, request approval. In `auto_by_default` mode: apply auto-approve logging (see below) and continue. |
+| `FAIL` | STOP. Present CRITICAL findings to user. Cannot proceed until user resolves or explicitly marks as accepted risk with written acknowledgment. |
+
+---
+
+## Severity Threshold Policy
+
+| CRITICAL count | HIGH count | Verdict | Action |
+|---------------|------------|---------|--------|
+| 0 | 0 | PASS (green) | Continue to final summary |
+| 0 | 1 or more | CONDITIONAL | User approval required (auto-approved in `auto_by_default` mode) |
+| 1 or more | any | FAIL | Blocked — user must resolve |
+
+MEDIUM and LOW findings are documented in `orchestra/risk_register.md` but do not affect
+the verdict.
+
+---
+
+## Auto-Approve Logging Requirement
+
+When `auto_by_default` mode is active and the verdict is CONDITIONAL, the conductor **MUST**:
+
+**1. Log to `orchestra/decisions.md`:**
+
+```
+[YYYY-MM-DDTHH:MM:SSZ] AUTO-APPROVED HIGH SECURITY FINDINGS
+Session: [task description]
+Findings: [N] HIGH severity findings
+Details:
+  - HIGH | IDOR | apps/web/server/routers/user.ts:42 | getUserById missing tenantId filter
+  - HIGH | IDOR | apps/web/server/routers/billing.ts:88 | createSubscription missing tenantId
+Rationale: auto_by_default mode active
+```
+
+**2. Include a prominent top-level warning in the final summary:**
+
+```
+⚠️ AUTO-APPROVED HIGH SECURITY FINDINGS
+[N] HIGH severity security findings were auto-approved because decision mode is auto_by_default.
+Review orchestra/risk_register.md for details.
+```
+
+This warning must appear in the final summary regardless of how many waves were completed
+or how many other items appear in the summary. It must not be buried in a subsection.
+
+---
+
+## Finding Categories for SmartSpecPro Stack
+
+| Category | Default Severity | Domain | Example |
+|----------|-----------------|--------|---------|
+| IDOR (tenant isolation missing) | HIGH | tRPC, FastAPI | Missing `WHERE tenantId = ctx.tenantId` in Drizzle query |
+| Auth bypass | CRITICAL | tRPC, FastAPI | tRPC procedure missing `.use(isAuthenticated)` middleware |
+| SQL injection | CRITICAL | FastAPI | Raw SQLAlchemy query with unsanitized user input |
+| LLM prompt injection | HIGH | FastAPI | User-controlled content inserted into LLM prompt without sanitization |
+| XSS | HIGH | Frontend | `dangerouslySetInnerHTML` with unescaped user content |
+| JWT storage insecurity | HIGH | Frontend | JWT stored in `localStorage` instead of httpOnly cookie |
+| Secret exposure (VITE_) | CRITICAL | Frontend, tRPC | Server-only secret in `VITE_*` env var (bundled into client) |
+| Hardcoded secret | CRITICAL | Any | API key or password literal in source code |
+| Missing Zod validation | MEDIUM | tRPC | tRPC procedure input not validated with Zod schema |
+| Missing rate limiting | MEDIUM | tRPC | Mutation procedure with no rate limit |
+| CSRF missing | MEDIUM | Frontend | State-changing mutation hook without CSRF token |
+| Celery secret leakage | HIGH | FastAPI | Celery task arguments containing decrypted credentials |
+| print() logging sensitive data | HIGH | FastAPI | `print(api_key)` or `print(password)` in Python code |
+| os.environ serialization | HIGH | FastAPI | `json.dumps(os.environ)` or similar serialized into a response |
+| Unauthenticated Wouter route | HIGH | Frontend | Protected page accessible without auth check |
+| Missing tenant isolation (DB) | CRITICAL | tRPC, FastAPI | Cross-tenant data leakage possible via unfiltered query |
+
+---
+
+## Risk Register Format
+
+All pre-merge gate findings are written to `orchestra/risk_register.md`:
+
+```markdown
+# Risk Register
+Last updated: [ISO timestamp]
+Session: [task description]
+Verdict: [PASS / CONDITIONAL PASS / FAIL]
+
+## Findings
+
+| ID | Severity | Category | File | Line | Description | Status |
+|----|----------|----------|------|------|-------------|--------|
+| R001 | HIGH | IDOR | apps/web/server/routers/user.ts | 42 | getUserById missing tenantId filter | open |
+| R002 | MEDIUM | Missing Zod | apps/web/server/routers/billing.ts | 88 | createSubscription input not validated | open |
+
+## Verdict Rationale
+[Aggregator's explanation of which threshold was applied and why]
+```
+
+File paths in the risk register must be relative to project root (no leading `/`) for
+readability. Absolute paths are used in Task Packets; relative paths in reports.
