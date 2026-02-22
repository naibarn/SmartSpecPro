Now I have a thorough understanding of what section-04 needs to deliver. Let me generate the complete, self-contained section content.

# Section 04 — Quality Gates, Result Integration & Security Review Protocol

**Feature:** 000-AgentsSkill
**Depends On:** Section 01 (contract schemas, directory structure), Section 02 (task analysis, routing decision)
**Blocks:** Section 06 (Orchestra SKILL.md)
**Parallelizable with:** Section 03 (wave planning, dispatch, platform), Section 08 (security specialists)

---

## Overview

This section creates three reference documents that define how the orchestra conducts quality assurance after each wave of agent work:

1. `deep_plan/skills/orchestra/references/quality-gates.md` — All 6 gate types with exact commands, trigger conditions, blocking rules, and retry protocol.
2. `deep_plan/skills/orchestra/references/result-integration.md` — How to process wave outputs: conflict detection, merge strategy, and escalation paths.
3. `deep_plan/skills/orchestra/references/security-review-protocol.md` — Pre-merge security audit: trigger conditions, specialist dispatch flow, severity thresholds, auto-approve logging.

These files are read by the Orchestra SKILL.md (Section 06) at Steps 5 and 6. They must be complete before Section 06 is written.

---

## Dependencies

**Section 01 must be complete first** — directories `deep_plan/skills/orchestra/references/` must exist before these files can be placed there.

**Section 02 scope/risk levels are referenced** — quality-gates.md uses the risk classification terminology (low/medium/high/critical) defined in `task-analysis.md`.

Do not duplicate the scope/risk level definitions here. Reference them from `task-analysis.md`.

---

## Deliverables

| File | Location | Expected Size |
|------|----------|--------------|
| `quality-gates.md` | `deep_plan/skills/orchestra/references/` | 150–200 lines |
| `result-integration.md` | `deep_plan/skills/orchestra/references/` | 100–150 lines |
| `security-review-protocol.md` | `deep_plan/skills/orchestra/references/` | 200–300 lines |

---

## TDD Validation Checklist

Run these checks after creating each file. Do not mark the section complete until all pass.

### quality-gates.md
- [ ] **S** Documents exactly 6 gate types (TypeScript check, Python lint, unit tests, security review (general), full test suite, pre-merge security gate)
- [ ] **S** Each gate entry includes: exact command, trigger condition, blocking rule, retry protocol (max 3 attempts), and escalation path
- [ ] **S** Gate commands use exact SmartSpecPro syntax:
  - `cd apps/web && pnpm check`
  - `cd python-backend && ruff check app/`
  - `pnpm test`
  - `pytest`
- [ ] **S** Blocking vs warning matrix is present: LOW/MEDIUM = warnings (orchestra continues, logs); HIGH/CRITICAL = must pass before next wave
- [ ] **S** Gate failure protocol: identifies which agent caused failure → creates fix Task Packet → re-dispatches same agent type → max 3 retries → stops and asks user on exhaustion
- [ ] **C** The 6 gate types listed match the gate triggers referenced in SKILL.md Step 6 (verify after Section 06 is written)
- [ ] **C** Gate commands match the Quick Reference section in CLAUDE.md

### result-integration.md
- [ ] **S** Documents step-by-step integration process (read agent outputs, detect conflicts, merge/re-dispatch, verify contract compliance, update progress.md)
- [ ] **S** Covers file conflict detection (same file modified by 2 agents)
- [ ] **S** Merge strategy documented: different file sections → manual merge; conflicting implementations → pick contract-compliant, re-dispatch the other
- [ ] **S** Documents when conductor auto-resolves (contract-compliant pick + decision log)
- [ ] **S** Documents when to pause for user (both agents produced contradictory contract implementations)
- [ ] **S** References `orchestra/decisions.md` as the auto-resolution log
- [ ] **S** References `orchestra/progress.md` as the wave status log

### security-review-protocol.md
- [ ] **S** All trigger conditions documented: auth changes, new endpoints, encryption changes, RBAC changes, CORS/CSP changes, file upload/deserialization, security dependency upgrades, infra config changes
- [ ] **S** Explicitly states that orchestra (NOT security-review.md) dispatches the 3 specialists
- [ ] **S** Orchestra dispatch flow described: builds 3 Task Packets → dispatches in single message (parallel) → waits → passes collected findings to security-review.md aggregator
- [ ] **S** Severity threshold policy documented:
  - 0 CRITICAL + 0 HIGH → PASS (green)
  - 0 CRITICAL + N HIGH → CONDITIONAL PASS (user approval required; auto-approved in `auto_by_default` mode)
  - N CRITICAL → FAIL (blocked)
- [ ] **S** Auto-approve logging requirement is explicit: "⚠️ AUTO-APPROVED HIGH SECURITY FINDINGS" in final summary AND entry in `orchestra/decisions.md` with timestamp
- [ ] **S** Finding categories documented for SmartSpecPro's stack (tRPC IDOR, FastAPI injection, XSS, auth bypass, hardcoded secrets, missing tenant isolation)
- [ ] **S** Risk register output path (`orchestra/risk_register.md`) documented
- [ ] **S** Constraint "sub-agents cannot spawn sub-agents" explicitly stated
- [ ] **C** Specialist agent names used here (security-trpc, security-fastapi, security-frontend) match the agent files created in Section 08

---

## File 1: `deep_plan/skills/orchestra/references/quality-gates.md`

**Path:** `/home/dev/projects/SmartSpecPro/deep_plan/skills/orchestra/references/quality-gates.md`

### Purpose

This file is read by the Orchestra conductor at Step 6. It defines every quality gate that can run after a wave completes, including which commands to run, when each gate applies, whether failure blocks the workflow, and what to do when a gate fails repeatedly.

### Required Content

**Section: Gate Inventory Table**

Present all 6 gates as a table or structured list. For each gate, document:

| Field | What to include |
|-------|----------------|
| Gate name | Short identifier (e.g., "TypeScript Check") |
| Command | Exact shell command with correct working directory |
| Trigger condition | Which changes activate this gate |
| Blocking level | Whether this gate blocks by risk level |
| Max retries | Always 3 |
| Escalation | What happens after 3 failed retries |

The 6 gates in order:

1. **TypeScript Check** — Command: `cd apps/web && pnpm check`. Trigger: any `.ts` or `.tsx` files changed. Blocking: HIGH/CRITICAL risk tasks; warning for LOW/MEDIUM.

2. **Python Lint** — Command: `cd python-backend && ruff check app/`. Trigger: any `.py` files changed. Blocking: HIGH/CRITICAL; warning for LOW/MEDIUM.

3. **Unit Tests** — Commands: `cd apps/web && pnpm test` (for TS files) and/or `cd python-backend && pytest` (for Python files). Trigger: medium risk or higher, or when test files exist for changed code. Blocking: HIGH/CRITICAL.

4. **Security Review (General)** — Trigger: task risk level is HIGH. Action: dispatch the `security.md` agent (not the pre-merge gate — just the general security agent for a spot check). Blocking: CRITICAL findings block; HIGH findings are warnings unless risk is CRITICAL.

5. **Full Test Suite** — Commands: both `cd apps/web && pnpm test` and `cd python-backend && pytest`. Trigger: CRITICAL risk tasks. Always blocking regardless of risk level.

6. **Pre-Merge Security Gate** — Trigger: defined in `security-review-protocol.md`. Action: orchestra dispatches 3 security specialist agents in parallel and routes findings to security-review.md aggregator. See `security-review-protocol.md` for full details. This gate always blocks until a verdict is returned.

**Section: Blocking vs Warning Matrix**

| Risk Level | TypeScript Check | Python Lint | Unit Tests | Security (General) | Full Test Suite |
|------------|-----------------|-------------|------------|-------------------|-----------------|
| low | warning | warning | skip | skip | skip |
| medium | warning | warning | warning | skip | skip |
| high | blocking | blocking | blocking | blocking | skip |
| critical | blocking | blocking | blocking | blocking | blocking |

Orchestra logs warnings and continues. Blocking gates must pass before proceeding to the next wave or final summary.

**Section: Gate Failure Protocol**

When a gate fails:

1. Identify which agent's output caused the failure (read the error output).
2. Construct a fix Task Packet: include the exact error message, the gate that failed, the file paths involved, and which wave this was.
3. Re-dispatch the same agent type that produced the failing code.
4. Increment the retry counter for this gate.
5. If retry counter reaches 3: STOP. Report to user with full error context. Do NOT attempt a 4th dispatch.

The retry counter resets per wave, per gate. A gate that fails in wave 2 and succeeds on retry 1 starts fresh in wave 3.

**Section: Gate Command Reference**

Provide a quick copy-paste reference block of all commands:

```bash
# TypeScript type check
cd apps/web && pnpm check

# Python lint
cd python-backend && ruff check app/

# Node.js unit tests
cd apps/web && pnpm test

# Python unit tests
cd python-backend && pytest

# Both test suites (full test suite gate)
cd apps/web && pnpm test && cd ../../python-backend && pytest
```

---

## File 2: `deep_plan/skills/orchestra/references/result-integration.md`

**Path:** `/home/dev/projects/SmartSpecPro/deep_plan/skills/orchestra/references/result-integration.md`

### Purpose

This file is read by the Orchestra conductor at Step 5. It defines how to take the raw outputs from all agents in a completed wave and integrate them into a coherent state: detecting conflicts, resolving them, verifying contracts, and updating tracking files.

### Required Content

**Section: Step-by-Step Integration Process**

The conductor follows these steps after every wave completes:

1. **Collect outputs** — Read each agent's Result Report (status, files_changed, findings, blockers, next_steps, quality_gate_results). Parse using the schema in `contracts/result-report.schema.md`.

2. **Detect file conflicts** — For each file in `files_changed`, check if more than one agent reports modifications to the same path. If yes, flag it as a conflict and proceed to the merge strategy.

3. **Apply merge strategy** — See "Merge Strategy" section below.

4. **Verify contract compliance** — Compare each agent's output against the contract defined in `orchestra/contracts.md`. Check: were the correct files modified? Does the output API shape match the agreed interface? If an agent went out of scope, flag a contract violation.

5. **Update progress** — Write wave status (completed, partial, blocked) and file summary to `orchestra/progress.md`.

6. **Check pre-merge security gate** — After the final wave, evaluate whether trigger conditions in `security-review-protocol.md` apply. If yes, run the pre-merge gate before reporting completion.

**Section: Merge Strategy**

Two agents modified the same file. Use this decision tree:

```
Are the changes in different sections/functions of the file?
  YES → Manual merge: read both versions, combine non-conflicting changes, write result.
  NO  → Conflicting implementations. Apply contract-compliant result:
         1. Re-read orchestra/contracts.md.
         2. Determine which agent's output matches the agreed interface.
         3. Pick the contract-compliant version.
         4. Log the decision in orchestra/decisions.md:
            "Auto-resolved conflict: [file] — kept [agent A] output because it matches contract [section].
             Re-dispatching [agent B] to revise its output."
         5. Re-dispatch the non-compliant agent with a Task Packet containing:
            - The accepted implementation as context
            - The contract it must comply with
            - A note that its previous output was superseded
```

**Section: When to Pause for User**

Conductor auto-resolves conflicts silently in most cases. Pause for user input only when:

- Both agents produced implementations that each claim to be contract-compliant but are mutually contradictory (e.g., both agents changed the same API endpoint signature in incompatible ways, and the contract is ambiguous).
- A contract violation would require re-doing more than one wave's worth of work.
- An agent returned `status: failed` with a blocker that cannot be resolved by re-dispatch (e.g., an external API is unavailable, a required file was deleted by another agent).

When pausing: present the user with both implementations side-by-side, explain the conflict, and ask which to accept. Do not proceed until user responds.

**Section: Output Files Updated**

| File | Updated When | What Is Written |
|------|-------------|----------------|
| `orchestra/progress.md` | After every wave | Wave N status, files changed, gate results |
| `orchestra/decisions.md` | On every auto-resolution | Timestamp, decision made, rationale, which contract section was applied |
| `orchestra/contracts.md` | Never modified post-creation | Frozen after Wave 1; read-only during integration |

**Section: Failed Agent Handling**

If an agent returns `status: failed`:
1. Check `blockers` field in its Result Report.
2. If blocker is fixable (e.g., missing dependency, wrong file path): construct fix Task Packet and re-dispatch.
3. If blocker is unfixable (external service down, unresolvable conflict): log to `orchestra/progress.md` and pause for user.
4. Never silently skip a failed agent's work and proceed to the next wave.

---

## File 3: `deep_plan/skills/orchestra/references/security-review-protocol.md`

**Path:** `/home/dev/projects/SmartSpecPro/deep_plan/skills/orchestra/references/security-review-protocol.md`

### Purpose

This file is read by the Orchestra conductor at Steps 5 and 6 when the pre-merge security gate is triggered. It defines the full protocol for dispatching security specialists, collecting their findings, routing them to the aggregator, and applying the pass/conditional/fail verdict.

### Critical Architectural Constraint

**Sub-agents cannot spawn sub-agents in Claude Code.** The conductor (orchestra SKILL.md) always manages dispatch depth. The `security-review.md` file is an **aggregator only** — it receives pre-collected findings from 3 specialists that the conductor dispatched directly. It never contains Task tool dispatch instructions.

Document this constraint at the top of the file as a callout, because it is the most common misunderstanding:

> **IMPORTANT:** Orchestra (the conductor) dispatches all 3 security specialists. `security-review.md` is an aggregator, not a coordinator. It receives findings already collected by orchestra and produces the verdict. It does NOT dispatch any Task tool calls.

### Required Content

**Section: Trigger Conditions**

The pre-merge security gate runs automatically after Step 5 (result integration) if ANY of the following are true for the current session's changes:

- Auth middleware modified (files matching `*/middleware/auth*`, `*/middleware/isAuthenticated*`, `*/lib/jwt*`)
- New tRPC router procedures added (files matching `apps/web/server/routers/*.ts` with new `router.procedure` entries)
- New FastAPI endpoints added (files matching `python-backend/app/api/**/*.py` with new `@router.*` decorators)
- Encryption or secrets handling modified (files touching `crypto.ts`, `smartspecweb_crypto.py`, `encryption.py`, `*Encrypted` columns)
- RBAC or permission logic modified (files matching `*/lib/permissions*`, `*/middleware/requireRole*`, multi-tenant isolation queries)
- CORS or CSP configuration changed (Nginx configs, FastAPI CORS middleware, Express CORS setup)
- File upload or deserialization endpoints modified
- Security-related dependency version changes in `package.json` or `requirements.txt`
- Infrastructure or Nginx configuration changed

If none of the above apply: skip the pre-merge gate and proceed to final summary.

**Section: Gate Dispatch Flow (Conductor-Managed)**

When the trigger conditions are met, orchestra executes the following flow directly:

**Step A: Identify changed files by domain**

Sort all files changed in the current session into three buckets:
- tRPC bucket: `apps/web/server/routers/`, `apps/web/server/middleware/`, `apps/web/server/lib/`
- FastAPI bucket: `python-backend/app/api/`, `python-backend/app/middleware/`, `python-backend/app/core/`
- Frontend bucket: `apps/web/client/src/`

A file can appear in multiple buckets if it spans domains (rare, but possible with shared types).

**Step B: Build 3 Task Packets**

Construct one Task Packet for each specialist agent, scoped to its bucket of files. Each Task Packet must include:
- The specific files from the domain bucket (absolute paths)
- The type of change made (new endpoint, auth modification, etc.)
- The security areas to focus on (from the finding categories table below)

If a bucket is empty (e.g., no FastAPI files changed), omit that specialist from the dispatch.

**Step C: Dispatch all specialists in a single message**

All present specialists must be dispatched as a single message with parallel Task calls. Never dispatch them sequentially. Use:
- `security-trpc` agent for the tRPC bucket
- `security-fastapi` agent for the FastAPI bucket
- `security-frontend` agent for the frontend bucket

**Step D: Collect findings**

Wait for all specialists to return their Result Reports. Parse each report's `findings` list.

**Step E: Dispatch security-review aggregator**

Construct a Task Packet for the `security-review.md` aggregator. The context section of this Task Packet must contain all collected findings from all specialists, formatted as a structured list. The aggregator's job is to deduplicate, count by severity, apply the threshold policy, write `orchestra/risk_register.md`, and return the verdict.

**Step F: Apply verdict**

Based on the aggregator's returned verdict:
- `PASS` → continue to final summary
- `CONDITIONAL` → in `ask_every_choice` and `smart_auto` modes: pause, display findings to user, ask for approval. In `auto_by_default` mode: log auto-approval (see Auto-Approve Logging below) and continue.
- `FAIL` → STOP. Present CRITICAL findings to user. Cannot proceed until user resolves or explicitly marks as accepted risk.

**Section: Severity Threshold Policy**

| CRITICAL count | HIGH count | Verdict | Action |
|---------------|------------|---------|--------|
| 0 | 0 | PASS (green) | Continue to final summary |
| 0 | 1 or more | CONDITIONAL | User approval required (auto-approved in `auto_by_default` mode) |
| 1 or more | any | FAIL | Blocked — user must resolve |

**Section: Auto-Approve Logging Requirement**

When `auto_by_default` mode is active and the verdict is CONDITIONAL, the conductor MUST:

1. Log to `orchestra/decisions.md`:
   ```
   [TIMESTAMP] AUTO-APPROVED HIGH SECURITY FINDINGS
   Session: [task description]
   Findings: [count] HIGH severity findings
   Details: [list each finding with file path and description]
   Rationale: auto_by_default mode active
   ```

2. Include in the final summary a prominently displayed warning:
   ```
   ⚠️ AUTO-APPROVED HIGH SECURITY FINDINGS
   [count] HIGH severity security findings were auto-approved because decision mode is auto_by_default.
   Review orchestra/risk_register.md for details.
   ```

This warning must appear in the final summary regardless of how many waves were completed or how many other items are in the summary.

**Section: Finding Categories for SmartSpecPro Stack**

Use these categories when classifying findings. Severity defaults are shown but can be upgraded by context.

| Category | Default Severity | Applies To | Example |
|----------|-----------------|------------|---------|
| IDOR (tenant isolation missing) | HIGH | tRPC, FastAPI | Missing `WHERE tenantId = ctx.tenantId` in Drizzle query |
| Auth bypass | CRITICAL | tRPC, FastAPI | Procedure missing `.use(isAuthenticated)` middleware |
| SQL injection | CRITICAL | FastAPI | Raw SQLAlchemy query with unsanitized user input |
| LLM prompt injection | HIGH | FastAPI | User-controlled content inserted into LLM prompt without sanitization |
| XSS | HIGH | Frontend | `dangerouslySetInnerHTML` with unescaped user content |
| JWT storage insecurity | HIGH | Frontend | JWT stored in `localStorage` instead of httpOnly cookie |
| Secret exposure (VITE_) | CRITICAL | Frontend, tRPC | Server-only secret in `VITE_*` env var (included in client bundle) |
| Hardcoded secret | CRITICAL | Any | API key or password in source file |
| Missing Zod validation | MEDIUM | tRPC | tRPC procedure input not validated with Zod schema |
| Missing rate limiting | MEDIUM | tRPC | Mutation procedure with no rate limit |
| CSRF missing | MEDIUM | Frontend | State-changing mutation hook without CSRF token |
| Celery secret leakage | HIGH | FastAPI | Celery task arguments containing decrypted credentials |
| print() logging sensitive data | HIGH | FastAPI | `print(api_key)` or `print(password)` in Python code |
| os.environ serialization | HIGH | FastAPI | `json.dumps(os.environ)` or similar in response |
| Unauthenticated Wouter route | HIGH | Frontend | Protected page accessible without auth check |
| Missing tenant isolation (DB) | CRITICAL | tRPC, FastAPI | Cross-tenant data leakage possible |

**Section: Risk Register Format**

All findings from the pre-merge gate are written to `orchestra/risk_register.md`. Format:

```markdown
# Risk Register
Last updated: [ISO timestamp]
Session: [task description]
Verdict: [PASS / CONDITIONAL PASS / FAIL]

## Findings

| ID | Severity | Category | File | Line | Description | Status |
|----|----------|----------|------|------|-------------|--------|
| R001 | HIGH | IDOR | apps/web/server/routers/user.ts | 42 | Missing tenantId filter in getUserById | open |
| R002 | MEDIUM | Missing Zod | apps/web/server/routers/billing.ts | 88 | createSubscription input not validated | open |

## Verdict Rationale
[Aggregator's explanation of threshold applied]
```

---

## Implementation Notes (Actual)

**Status:** COMPLETE

**Files created:**
- `/home/dev/projects/SmartSpecPro/deep_plan/skills/orchestra/references/quality-gates.md` (136 lines)
- `/home/dev/projects/SmartSpecPro/deep_plan/skills/orchestra/references/result-integration.md` (124 lines)
- `/home/dev/projects/SmartSpecPro/deep_plan/skills/orchestra/references/security-review-protocol.md` (216 lines)

**Deviations from plan:**
- security-review-protocol.md enhanced with explicit Step 5 (trigger check) vs Step 6
  (dispatch+verdict) section headers per code review
- Gate 6 inventory row now lists all 3 specialists (security-trpc, security-fastapi,
  security-frontend); `security-fastapi` was originally omitted — fixed during code review
- Gate 6 retries changed from "N/A" to "3 per specialist"
- decisions.md log entry uses structured labeled fields — more readable for AI conductors

---

## Implementation Notes (Original Plan)

### Writing Style

All three files are reference documentation consumed by the orchestra conductor (an AI model) during active task execution. Write them as concise, structured reference documents — not tutorials. Use tables and bullet lists over prose paragraphs. Every actionable step must be unambiguous.

### Common Pitfalls

1. **Do not use relative paths in commands.** Always show the `cd apps/web &&` prefix — the orchestra may be invoked from the project root, not from within `apps/web/`.

2. **Do not duplicate the risk level definitions from task-analysis.md.** Simply reference "HIGH risk task" or "CRITICAL risk task" and trust that the reader has already classified the task using task-analysis.md (Step 1 of the workflow).

3. **Do not describe sub-agents dispatching other sub-agents.** The security-review-protocol.md must be crystal clear: orchestra dispatches the specialists, security-review.md receives the compiled results.

4. **The pre-merge gate check belongs in Step 5, not only Step 6.** The trigger condition check happens after result integration (Step 5). The actual dispatch and verdict application happen in Step 6. This two-step split matters because Step 5 is where orchestra knows what files changed.

5. **The auto-approve warning must be prominent.** "⚠️ AUTO-APPROVED HIGH SECURITY FINDINGS" must be a top-level warning in the final summary, not buried in a log file reference.

### Consistency Requirements

After completing these files and after Section 06 (SKILL.md) is written, cross-check:

- Gate names in quality-gates.md match what SKILL.md Step 6 calls
- The 6 gate types in quality-gates.md are all accounted for in SKILL.md Step 6 trigger logic
- The `decisions.md` and `progress.md` update patterns in result-integration.md match what artifact-management.md (Section 05) documents for those files
- The specialist agent names (security-trpc, security-fastapi, security-frontend, security-review) in security-review-protocol.md match the filenames created in Section 08