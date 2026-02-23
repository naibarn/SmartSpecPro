# 000 — Orchestra Agent & Sub-Agents Skill Pack

**Status:** Draft
**Created:** 2026-02-22
**Author:** AI Conductor
**Priority:** Critical
**Estimated Scope:** 4 phases, ~28 deliverables

---

## 1. Executive Summary

SmartSpecPro ใช้ Claude Code เป็นเครื่องมือหลักในการพัฒนา โดยมี skill pack 3 ตัว (`deep-project`, `deep-plan-codex`, `deep-implement`) ที่ทำงานเป็น pipeline ตามลำดับ: แบ่งงาน -> วางแผน -> implement แต่ขาด **ตัวประสาน (Orchestrator)** ที่ทำหน้าที่:

1. **ตัดสินใจ** ว่างานที่ได้รับควรเข้า pipeline ไหน หรือสั่ง sub-agent เฉพาะทางตัวไหน
2. **แบ่งงาน** เป็น Task Packets ที่ sub-agents ทำงานได้ทันทีโดยไม่ต้องถามกลับ
3. **ควบคุมคู่ขนาน** ตัดสินใจว่าอะไรทำพร้อมกันได้ อะไรต้องรอ
4. **รวมผลลัพธ์** ตรวจ conflict, สั่งแก้, คุม quality gate
5. **ป้องกัน context หาย** ด้วยระบบไฟล์ snapshot/progress ที่ทำให้เริ่มต่อ session ใหม่ได้

Spec นี้กำหนดการสร้าง skill pack ใหม่ 2 ตัว ที่วางใน `skills/`:

| Skill | Slash Command | หน้าที่ |
|-------|---------------|---------|
| `orchestra` | `/orchestra` | Conductor: วิเคราะห์งาน, แบ่ง, สั่ง sub-agents, รวมผล, คุมคุณภาพ |
| `sub-agents` | (เรียกผ่าน orchestra เท่านั้น) | Reference library: prompt templates + contracts สำหรับ sub-agent แต่ละบทบาท |

ทั้งสองทำงานร่วมกับ skill เดิม 3 ตัวได้อย่างสมบูรณ์:

```
User Request
    │
    ▼
/orchestra  ─── วิเคราะห์ scope + ตัดสินใจ routing ───┐
    │                                                    │
    ├── งานเล็ก (1-2 files) ──► สั่ง sub-agent โดยตรง   │
    │                                                    │
    ├── งานกลาง (feature) ──► /deep-plan-codex ──► /deep-implement
    │                                                    │
    └── งานใหญ่ (project) ──► /deep-project ──► /deep-plan-codex ──► /deep-implement
```

### หลักการออกแบบ

1. **File-first memory** — ข้อมูลสำคัญอยู่ในไฟล์ ไม่ขึ้นกับ context window
2. **Contract-driven parallel** — sub-agents ทำงานคู่ขนานได้เมื่อมี contract กำหนด interface
3. **Snapshot-before-compact** — ก่อน context ถูกตัด ต้องบันทึก snapshot ที่เริ่มต่อได้
4. **Minimal overhead** — orchestra ไม่ทำงานแทน sub-agent แต่สั่งและตรวจผลเท่านั้น
5. **Composable** — ใช้ร่วมกับ deep-* skills ได้ หรือใช้เดี่ยวกับ sub-agents ก็ได้
6. **Autonomous by default** — Orchestra และ sub-agents ทำงานต่อเนื่องโดยไม่หยุดรอ user confirmation ยกเว้นในกรณีต่อไปนี้เท่านั้น (ดู Section 4.11)

---

## 2. Goals & Non-Goals

### Goals

1. สร้าง `/orchestra` skill ที่เป็น single entry point สำหรับงานพัฒนาทุกขนาด
2. สร้าง sub-agent prompt templates ที่ให้ผลลัพธ์คุณภาพสูงและ consistent
3. มีระบบ Task Packet ที่ sub-agents เข้าใจได้ทันทีโดยไม่ต้องถามกลับ
4. มีระบบ `orchestra/` artifacts ที่ป้องกัน context หายจาก compaction
5. ทำงานร่วมกับ `/deep-project`, `/deep-plan-codex`, `/deep-implement` ได้เป็น pipeline เดียวกัน
6. รองรับ Wave-based parallelism ที่ลด file conflict ระหว่าง sub-agents

### Non-Goals

- ไม่สร้าง runtime agent framework (ไม่ใช่ LangGraph/Autogen) — ใช้ Claude Code Task tool เป็น execution layer
- ไม่ replicate ความสามารถของ deep-* skills — orchestra เรียกใช้เท่านั้น ไม่ทำซ้ำ
- ไม่บังคับให้ทุกงานผ่าน orchestra — งานเล็กทำตรงได้, orchestra สำหรับงานที่ต้องการประสานงาน

---

## 3. Deliverables — Skill File Structure

### 3.1 Orchestra Skill

```
skills/orchestra/
  SKILL.md                              # Main skill: Conductor workflow
  references/
    task-analysis.md                    # วิธีวิเคราะห์และจำแนกงาน
    task-packet-format.md               # Task Packet specification
    routing-decision.md                 # Decision tree: เลือก path ไหน
    wave-planning.md                    # Wave-based parallel planning
    sub-agent-dispatch.md               # วิธีสร้าง Task tool calls
    result-integration.md               # วิธีรวมผล + conflict resolution
    quality-gates.md                    # Gate definitions (test/lint/review/security)
    artifact-management.md              # orchestra/ file management protocol
    compaction-safety.md                # CHC + snapshot-before-compact
    skill-pack-integration.md           # วิธีเรียก deep-project/plan/implement
    session-resume.md                   # Resume protocol + templates
    platform-compat.md                  # Platform detection + dispatch adapter (Claude Code/Codex/OpenCode)
    security-review-protocol.md         # Pre-merge security gate: trigger rules, severity thresholds, PASS/FAIL
```

### 3.2 Sub-Agent Prompt Library

```
skills/sub-agents/
  README.md                             # Registry overview
  agents/
    research.md                         # Research Agent prompt template
    architect.md                        # Planner/Architect Agent prompt template
    frontend.md                         # Frontend Implementer prompt template
    backend.md                          # Backend Implementer prompt template
    python.md                           # Python Backend Implementer prompt template
    database.md                         # Database/Schema Agent prompt template
    test-qa.md                          # Test/QA Agent prompt template
    reviewer.md                         # Code Reviewer Agent prompt template
    security.md                         # Security/Compliance Agent (general hardening)
    debugger.md                         # Debugger Agent — focused code bug investigation (CMD-7)
    error-detective.md                  # Error Detective — production log/audit analysis (CMD-7)
    security-review.md                  # Security Review Coordinator — pre-merge gate dispatcher
    security-trpc.md                    # tRPC Endpoint Security Auditor
    security-fastapi.md                 # FastAPI/Python Security Auditor
    security-frontend.md                # Frontend Security Auditor (XSS, auth bypass, data exposure)
    infrastructure.md                   # Infrastructure Agent prompt template (CMD-5)
    docs-release.md                     # Docs/Release Agent prompt template
  contracts/
    task-packet.schema.md               # Task Packet format reference
    result-report.schema.md             # Result Report format reference
```

---

## 4. Phase 1 — Orchestra Skill Core (`/orchestra`)

### 4.1 SKILL.md — Conductor Workflow

**Invocation:** `/orchestra <description or @file>`

**YAML Frontmatter:**

```yaml
---
name: orchestra
description: >
  AI Orchestra Conductor: analyzes tasks, dispatches specialized sub-agents,
  integrates results, and manages file-based memory to survive context compaction.
  Coordinates with /deep-project, /deep-plan-codex, and /deep-implement.
license: MIT
compatibility: Claude Code with Task tool support; git repository recommended
---
```

**Workflow Overview:**

```
Step 0: Print Banner + Load State
Step 1: Task Analysis — classify scope, risk, affected domains
Step 2: Routing Decision — choose path (direct/sub-agent/deep-*)
Step 3: Contract & Wave Planning — define interfaces, plan parallelism
Step 4: Dispatch — send Task Packets to sub-agents or invoke deep-* skills
Step 5: Result Integration — collect, validate, resolve conflicts
Step 6: Quality Gates — tests, lint, type-check, security review
Step 7: Progress Update — update orchestra/ artifacts
Step 8: Context Health Check — snapshot if needed
```

### 4.2 Step 0 — Banner + State Loading

Print banner:

```text
════════════════════════════════════════════════════════════════
ORCHESTRA: AI Development Conductor
════════════════════════════════════════════════════════════════
Analyzes → Routes → Dispatches → Integrates → Validates

Mode: {new | resume}
════════════════════════════════════════════════════════════════
```

**State loading:**
- Check if `orchestra/` directory exists in the working directory
- If `orchestra/snapshot.md` exists, parse it and offer resume:
  - `resume` = Continue from snapshot
  - `fresh` = Start new (archive old orchestra/ to `orchestra/archive/<timestamp>/`)
- If no state exists, create `orchestra/` directory

### 4.3 Step 1 — Task Analysis

Read `references/task-analysis.md` for detailed guidance.

**Goal:** Classify the incoming task along these dimensions:

| Dimension | Values | Purpose |
|-----------|--------|---------|
| **Scope** | `trivial` / `small` / `medium` / `large` / `project` | Determines routing path |
| **Risk** | `low` / `medium` / `high` / `critical` | Determines quality gate strictness |
| **Domains** | list of `frontend` / `backend` / `python` / `database` / `infra` / `security` | Determines which sub-agents |
| **Files (estimated)** | count | Determines parallelism strategy |
| **Dependencies** | list of inter-domain dependencies | Determines wave ordering |

**Classification decision table (use numbers — not subjective descriptions):**

| Scope | Files (est.) | Domains | Has spec? | Risk signals | Route |
|-------|-------------|---------|-----------|-------------|-------|
| `trivial` | 1 | 1 | — | Clear root cause, no auth/DB touch | Direct edit |
| `small` | 1–3 | 1 | — | Low risk, no schema change | Single sub-agent |
| `medium` | 4–10 | 1–2 | Optional | Medium risk, may touch auth or DB | Multi sub-agent + contracts |
| `large` | 10+ | 2+ | Should exist | High risk, schema/migration involved | /deep-plan-codex → /deep-implement |
| `project` | Unknown | 3+ | Missing | Unclear scope, new major feature | /deep-project → /deep-plan-codex → /deep-implement |

**Classification algorithm (apply in order — first match wins):**

```
1. If task mentions "new feature", "new module", "new service", "design" AND no spec file:
   → project

2. If estimated files > 10 OR task involves DB migration OR task touches 3+ domains:
   → large

3. If estimated files 4–10 OR task touches 2 domains with dependencies:
   → medium

4. If estimated files 1–3 AND single domain AND risk = low:
   → small

5. If single file, clear fix, no schema/auth changes:
   → trivial
```

**Risk classification:**

| Risk Level | Signals |
|------------|---------|
| `low` | Style/display/copy changes, no data access, no auth |
| `medium` | New UI component with API call, new tRPC procedure, Python task |
| `high` | Auth middleware changes, new DB columns, encryption/secrets, multi-tenant data |
| `critical` | Auth bypass possible, schema DROP, credential exposure, payment/billing logic |

**Output:** Write classification to `orchestra/plan.md` (schema defined in Appendix C).

### 4.4 Step 2 — Routing Decision

Read `references/routing-decision.md` for decision tree.

Based on Step 1 classification:

| Scope | Route | Action |
|-------|-------|--------|
| `trivial` | **Direct** | Orchestra handles directly, no sub-agents |
| `small` | **Single Agent** | Dispatch 1 sub-agent with Task Packet |
| `medium` | **Multi Agent** | Create contracts, dispatch 2-4 sub-agents in waves |
| `large` | **Deep Plan + Implement** | Invoke `/deep-plan-codex` then `/deep-implement` |
| `project` | **Full Pipeline** | Invoke `/deep-project` then per-split `/deep-plan-codex` + `/deep-implement` |

**Decision mode integration:**
- If `orchestra/decision-mode.md` exists, reuse it
- Otherwise ask user (same 3 options as deep-plan-codex):
  - `ask_every_choice`
  - `smart_auto` (recommended)
  - `auto_by_default`
- Write choice to `orchestra/decision-mode.md`

**For `large` and `project` routes:** Orchestra creates a requirement spec file then invokes the deep-* skill chain. It does NOT replicate deep-* functionality.

**Bug/Error Classification Sub-Tree:**

When the task is a bug report, error, or "something is broken" — apply this sub-tree BEFORE the scope table above to pick the right specialist:

```
Bug / Error reported
│
├─ Is it a security vulnerability?
│   └─ YES → Security agent (5.10) → security-review.md (pre-merge gate)
│
├─ Is it a production error / audit log investigation?
│   └─ YES → Error Detective agent (5.14)
│             (reads JSONL audit logs, traces by traceId, correlates events)
│
├─ Is it definitely a Python backend error?
│   └─ YES → Python agent (5.6, fastapi-pro)
│
├─ Do we know WHICH FILE the bug is in?
│   ├─ YES → Debugger agent (5.13, error-debugging:debugger)
│   │         scope = trivial/small depending on fix size
│   │
│   └─ NO  → Wave 0: Research agent (Explore)
│             → then Debugger agent with file location from research
│
└─ All bug fix waves end with:
    - Test/QA agent (regression check)
    - If security-adjacent: security-review.md re-audit
```

**Post-fix mandatory waves** (applies to ALL bug routes):

| After fixing | Run |
|-------------|-----|
| Code fix by Debugger | Test/QA agent (regression check) |
| Security fix | security-review.md (re-audit changed files) |
| Database fix | Row count verification before + after |
| Python fix | `pytest` with relevant test markers |

### 4.5 Step 3 — Contract & Wave Planning

Read `references/wave-planning.md` for wave planning rules.

**Only for `medium` scope and above.** For `small`, skip to Step 4.

**Contract definition:**

For each pair of sub-agents that will work in parallel, define a contract:

```markdown
## Contract: backend ↔ frontend

### Shared Interface
- API endpoint: POST /api/v1/resource
- Request schema: { name: string, type: enum["a","b"] }
- Response schema: { id: string, created: timestamp }

### Ownership
- Backend owns: route handler, service, DB schema, validation
- Frontend owns: form component, API hook, UI state

### Test Boundary
- Backend: unit test service + integration test endpoint
- Frontend: mock API response, test component render
```

Write contracts to `orchestra/contracts.md`.

**Wave planning:**

Group tasks into waves based on dependency order:

```markdown
## Wave Plan

### Wave 1 (parallel-safe: no shared files)
- [DB] Create migration for new table
- [Backend] Add service skeleton with interface from contract

### Wave 2 (depends on Wave 1)
- [Backend] Implement route handler using service
- [Frontend] Build form component using contract API schema

### Wave 3 (depends on Wave 2)
- [Test/QA] Integration tests across backend + frontend
- [Security] Review new endpoint auth + validation
```

Write wave plan to `orchestra/plan.md`.

**Parallelism rules (hard constraints):**

| Rule | Description |
|------|-------------|
| Max 4 parallel agents | Claude Code Task tool limit for quality |
| Max 2 agents editing simultaneously | Prevent file conflict |
| Only 1 agent for DB operations | Schema changes are sequential |
| Only 1 agent for git operations | Commits are sequential |
| Contract required for parallel | No contract = sequential execution |

### 4.6 Step 4 — Dispatch

Read `references/sub-agent-dispatch.md` for dispatch protocol.

**Task Packet format** (every sub-agent receives this):

```markdown
## Task Packet

### TASK
[Specific imperative action — what to do, not what to "look at"]

### DOMAIN
[CMD-N designation: CMD-1 Frontend / CMD-2 Backend / CMD-3 Python / etc.]

### FILES
[Exact file paths to read/modify — be specific]

### CONTEXT
[What happened before, what the user reported, relevant errors, contract references]

### CONSTRAINTS
[What NOT to touch, max scope, coding conventions, security requirements]

### CONTRACT
[Relevant contract section — shared interfaces, ownership boundaries]

### OUTPUT
[Exact deliverable — "modify file X to add Y" or "return analysis as markdown"]

### QUALITY GATE
[What must pass: tests, lint, type-check, specific assertions]
```

**Sub-agent type mapping** (maps to Claude Code Task tool `subagent_type`):

| Agent Role | subagent_type (read-only) | subagent_type (write/analyze) |
|------------|--------------------------|-------------------------------|
| Research | `Explore` | N/A |
| Architect | `Plan` | N/A |
| Frontend | `Explore` | `general-purpose` |
| Backend | `Explore` | `backend-api-security:backend-architect` |
| Python | `Explore` | `python-development:fastapi-pro` |
| Database | `Explore` | `general-purpose` |
| Test/QA | `Explore` | `general-purpose` |
| Reviewer | `Explore` | N/A (read-only) |
| Security | `Explore` | `backend-api-security:backend-security-coder` |
| **Debugger** | `error-debugging:debugger` | `error-debugging:debugger` |
| **Error Detective** | `error-debugging:error-detective` | `error-debugging:error-detective` |
| **Security-tRPC** | `backend-api-security:backend-security-coder` | `backend-api-security:backend-security-coder` |
| **Security-FastAPI** | `backend-api-security:backend-security-coder` | `backend-api-security:backend-security-coder` |
| **Security-Frontend** | `Explore` | `Explore` (read-only audit) |
| **Security Review** | (coordinator — dispatches 3 auditors) | N/A |

**Platform Detection Block:**

Read `orchestra/platform.md` to determine dispatch mode. If file does not exist, ask user once:

```
Which AI coding tool are you using?
  1) claude-code   — Claude Code CLI (full Task tool + subagent_type)
  2) codex         — Codex / Claude web interface (Task tool, general-purpose only)
  3) open-code     — OpenCode or other (no Task tool, sequential mode)
```

Write answer to `orchestra/platform.md`. Then dispatch accordingly:

| Mode | Dispatch Method | Parallel? | subagent_type used? |
|------|----------------|-----------|---------------------|
| `claude-code` | Task tool with specific subagent_type | ✅ Yes | ✅ Full mapping above |
| `codex` | Task tool with `general-purpose` + full template in prompt | ✅ Yes | ❌ Template injection |
| `open-code` | Direct inline execution (no Task spawning) | ❌ Sequential | ❌ Template inline |

**Pre-merge Security Gate trigger:**

Automatically trigger `security-review.md` coordinator when ANY of these are true:
- User message contains: "before merge", "before PR", "pre-merge", "ready to ship"
- Task risk level = `high` or `critical`
- Task domains include `security`
- Any agent modifies auth middleware, tRPC routers, FastAPI endpoints, or VITE_* config

**Dispatch execution:**

1. Read `orchestra/platform.md` → determine mode
2. For each wave, create Task tool calls for all agents in that wave
3. Send all Task calls in a **single message** (parallel execution — claude-code/codex only)
4. Wait for all agents in wave to complete
5. Run result integration (Step 5) before starting next wave
6. After final wave: check pre-merge gate trigger conditions → run security-review if triggered

**Example dispatch (Wave 1, claude-code mode):**

```
Message with 2 Task tool calls:

Task 1: subagent_type=general-purpose
  prompt: "## Task Packet\n### TASK\nCreate migration...\n### DOMAIN\nCMD-4 Database\n..."

Task 2: subagent_type=backend-api-security:backend-architect
  prompt: "## Task Packet\n### TASK\nAdd service skeleton...\n### DOMAIN\nCMD-2 Backend\n..."
```

**Example dispatch (Wave 1, codex mode):**

```
Message with 2 Task tool calls (both general-purpose, template injected):

Task 1: subagent_type=general-purpose
  prompt: "You are the Database Agent for SmartSpecPro.\n[full agents/database.md content]\n\n## Task Packet\n..."

Task 2: subagent_type=general-purpose
  prompt: "You are the Backend Agent for SmartSpecPro.\n[full agents/backend.md content]\n\n## Task Packet\n..."
```

**Example execution (open-code mode — sequential):**

```
Step 1: Read agents/database.md → apply as current role → execute task
Step 2: Read agents/backend.md → apply as current role → execute task
[No parallel — complete one before starting next]
```

### 4.7 Step 5 — Result Integration

Read `references/result-integration.md` for integration protocol.

After each wave completes:

1. **Read all agent outputs** — parse what each agent changed
2. **Check for file conflicts** — if 2 agents modified the same file, resolve:
   - If changes are in different sections of the file: merge manually
   - If changes conflict: pick the one that matches the contract, re-dispatch the other
3. **Verify contract compliance** — check that each agent's output matches the contract interface
4. **Update progress** — write to `orchestra/progress.md`

### 4.8 Step 6 — Quality Gates

Read `references/quality-gates.md` for gate definitions.

Run gates based on risk level:

| Gate | When Required | Action |
|------|--------------|--------|
| **TypeScript check** | Always (if TS files changed) | `cd apps/web && pnpm check` |
| **Python lint** | Always (if .py files changed) | `cd python-backend && ruff check app/` |
| **Unit tests** | `medium` risk and above | `cd apps/web && pnpm test` / `cd python-backend && pytest` |
| **Security review** | `high` risk and above | Dispatch Security sub-agent (5.10, general hardening) |
| **Full test suite** | `critical` risk | `pnpm test && pytest` |
| **Pre-merge security gate** | Pre-merge trigger (see 4.6) | Dispatch `security-review.md` coordinator — runs tRPC + FastAPI + Frontend auditors in parallel |

**Pre-merge Security Gate rules:**

```
security-review.md coordinator dispatches 3 auditors in parallel:
  Wave S1:
    ├─ security-trpc.md    → audit all changed tRPC routers
    ├─ security-fastapi.md → audit all changed FastAPI endpoints
    └─ security-frontend.md → audit changed React components, hooks, routing

After Wave S1 completes → aggregate findings:
  CRITICAL found → BLOCK. Must fix before merge. Orchestra stops and reports.
  HIGH found     → WARN. Recommended fix. User must explicitly approve to proceed.
  MEDIUM/LOW     → Log in orchestra/risk_register.md. Proceed.

Threshold policy:
  - 0 CRITICAL + 0 HIGH  → PASS (green)
  - 0 CRITICAL + N HIGH  → CONDITIONAL PASS (user approval required)
  - N CRITICAL           → FAIL (blocked)
```

**Gate failure protocol:**
1. Identify which sub-agent's output caused the failure
2. Create a fix Task Packet with the error output as context
3. Re-dispatch to the same sub-agent type
4. Max 3 retry attempts per gate failure — then stop and ask user
5. For security gate CRITICAL failures: do NOT allow bypass. User must resolve or explicitly mark as accepted risk.

### 4.9 Step 7 — Progress Update

Update these files after every wave:

| File | Content |
|------|---------|
| `orchestra/plan.md` | Current plan with completed/remaining waves |
| `orchestra/progress.md` | Per-wave status: done/in-progress/blocked/next |
| `orchestra/backlog.md` | Remaining work items, prioritized |
| `orchestra/decisions.md` | Decisions made during this session (ADR-lite) |
| `orchestra/contracts.md` | Active contracts (freeze after Wave 1) |

### 4.10 Step 8 — Context Health Check (CHC)

Read `references/compaction-safety.md` for full protocol.

**When to run CHC:**
- After completing every wave
- Before starting `high` or `critical` risk work
- When conversation has been long (heuristic: >5 wave cycles)

**Context state classification:**

| State | Condition | Action |
|-------|-----------|--------|
| `green` | Short conversation, few decisions, simple task | Continue normally |
| `yellow` | Multiple waves complete, several decisions, growing context | Log warning in `progress.md` |
| `red` | Many decisions + contracts + active sub-agents, or about to change major topic | **Mandatory snapshot** before continuing |

**Snapshot-before-compact protocol (when `red`):**

1. Update `orchestra/snapshot.md` (format defined in Section 7)
2. Update `orchestra/progress.md` + `orchestra/backlog.md` to match
3. Notify user: "Context state is RED. Snapshot saved. Safe to continue or start new session."

### 4.11 Autonomous Operation Rules

**Default behavior: proceed without asking.**

Orchestra and all sub-agents operate continuously. Do not pause for user confirmation unless the situation explicitly matches one of the STOP conditions below.

#### When to STOP and ask the user (mandatory pause)

| Condition | Why Required | What to output |
|-----------|-------------|----------------|
| Security gate = **FAIL** (CRITICAL finding) | CRITICAL must be fixed before merge — irreversible if shipped | "BLOCKED: Security gate FAIL. Found N CRITICAL issues. Fix required before continuing." + list issues |
| Schema **DROP** operation proposed | Data loss is irreversible (Database Safety Protocol) | "STOP: DROP operation detected on {table}. Backup + explicit user approval required." |
| Scope has **escalated beyond original classification** | User may not want a trivial fix to become a large refactor | "Scope escalation: task grew from {trivial} to {medium}. Confirm to proceed or narrow scope." |
| **3-attempt limit** hit on same error | 3 attempts exhausted without resolution | "BLOCKED: 3 attempts failed. Last error: {error}. Need user guidance." |
| **Force push** to remote branch | Risk of overwriting others' work | "STOP: Force push requested. Confirm (yes/no)." |

#### When to ask ONCE then auto-proceed

| Condition | Behavior |
|-----------|----------|
| **Decision mode** not set | Ask once (Section 4.4), write `orchestra/decision-mode.md`, never ask again |
| **Platform** not set | Ask once (Section 4.6 Platform Detection), write `orchestra/platform.md`, never ask again |
| Security gate = **CONDITIONAL** (HIGH finding, no CRITICAL) | Ask once: "N HIGH findings found. Approve to proceed? (yes/no)". If `decision_mode=auto_by_default`: skip ask, auto-approve with warning logged |
| Wave plan **requires choosing** between design options | In `smart_auto` mode: choose the safer/simpler option and log the decision. In `ask_every_choice`: ask once per choice |

#### Auto-proceed cases (no user input needed)

All other situations: proceed automatically and log actions in `orchestra/decisions.md`:
- Quality gate PASS (green) → continue to next wave
- Quality gate failure → create fix Task Packet and re-dispatch (up to 3 attempts)
- Research complete → proceed to implementation wave
- Wave complete → start next wave
- Sub-agent succeeds → integrate results and continue
- Security findings MEDIUM/LOW → log in `risk_register.md`, proceed
- Deep-* skill returns → sync artifacts, continue from resume point (R4 algorithm)
- CHC state = green/yellow → continue without snapshot
- CHC state = red → write snapshot, print CHC warning, continue (no pause needed)
- Lock file stale (>30 min) → overwrite, continue

#### Integration with decision_mode

| decision_mode | Additional behavior |
|---------------|---------------------|
| `ask_every_choice` | For each architectural option in wave planning: ask user to choose. All else: auto-proceed |
| `smart_auto` *(default)* | Orchestra chooses safer/simpler option when multiple routes exist. Only STOP conditions require user input |
| `auto_by_default` | Even CONDITIONAL security gate auto-approves. Only hard STOP conditions require user input |

**Logging rule:** Every auto-approved decision must be logged in `orchestra/decisions.md` with timestamp, what was decided, and why auto-approved.

---

## 5. Phase 2 — Sub-Agent Prompt Library

### 5.1 Agent Prompt Template Format

Every agent file in `skills/sub-agents/agents/` follows this structure:

```markdown
# {Role} Agent

## Identity
[Who this agent is and what it specializes in]

## Capabilities
[What this agent can do — specific tools, patterns, expertise]

## Constraints
[What this agent must NOT do — scope boundaries]

## Input Contract
[What this agent expects in the Task Packet]

## Output Contract
[What this agent must produce — format, files, quality criteria]

## Workflow
[Step-by-step execution instructions]

## Quality Checklist
[What the agent checks before reporting completion]

## Error Handling
[What to do when blocked, uncertain, or encountering errors]
```

### 5.2 Research Agent (`agents/research.md`)

**subagent_type:** `Explore`

**Purpose:** Codebase and documentation research. Produce structured findings without modifying any files.

**Output format — Research Brief:**

```markdown
## Research Brief: {topic}
Date: {date}

### Findings
- [Fact 1 with file:line reference]
- [Fact 2 with file:line reference]

### Current Architecture
[How the relevant system currently works]

### Risks
- [Risk 1: description + severity]

### Options
| Option | Pros | Cons | Effort |
|--------|------|------|--------|
| A: ... | ...  | ...  | ...    |
| B: ... | ...  | ...  | ...    |

### Recommendation
[Option X because Y]

### Open Questions
- [Question that needs user input]
```

### 5.3 Architect Agent (`agents/architect.md`)

**subagent_type:** `Plan`

**Purpose:** Design technical architecture, module structure, API contracts, data flow. Read-only analysis that produces implementation blueprints.

**Output:** Architecture document with:
- Module diagram (text-based)
- API contracts (request/response schemas)
- Data flow description
- Migration strategy (if applicable)
- Integration points with existing code

### 5.4 Frontend Agent (`agents/frontend.md`)

**subagent_type:** `general-purpose` (write mode)

**Purpose:** React components, UI state, routing, TanStack Query hooks, Tailwind/Radix styling.

**Constraints:**
- Must follow project conventions: React 19, Wouter routing, Radix UI + CVA, path alias `@/`
- Must not modify backend files
- Must use contract API schemas for mock/real data

### 5.5 Backend Agent (`agents/backend.md`)

**subagent_type:** `backend-api-security:backend-architect` (write mode)

**Purpose:** tRPC routers, Express routes, Drizzle ORM queries, service layer, auth middleware.

**Constraints:**
- Must follow project conventions: tRPC 11, Drizzle ORM, Zod validation
- Must not modify frontend files
- Must validate all inputs with Zod
- Must check auth/tenant isolation on every endpoint

### 5.6 Python Agent (`agents/python.md`)

**subagent_type:** `python-development:fastapi-pro` (write mode)

**Purpose:** FastAPI endpoints, SQLAlchemy models, Celery tasks, LLM integration, async patterns.

**Constraints:**
- Must follow project conventions: Python 3.11+, Black 100 chars, ruff, async-first
- Must not modify Node.js files
- Must use structured logging (not print)
- Coverage minimum 80%

### 5.7 Database Agent (`agents/database.md`)

**subagent_type:** `general-purpose` (write mode)

**Purpose:** Schema design, Drizzle migration, SQLAlchemy model updates, query optimization.

**Constraints:**
- Must follow Database Safety Protocol from CLAUDE.md
- Must backup affected tables before ANY schema change
- Must verify row counts after migration
- Only 1 database agent active at a time (hard rule)

### 5.8 Test/QA Agent (`agents/test-qa.md`)

**subagent_type:** `general-purpose` (write mode)

**Purpose:** Write tests (Vitest for TS, pytest for Python), create test plans, run regression suites.

**Output:** Test files + test plan document + pass/fail report.

### 5.9 Reviewer Agent (`agents/reviewer.md`)

**subagent_type:** `Explore` (read-only)

**Purpose:** Code review: style, correctness, edge cases, regression risk, contract compliance.

**Output format — Review Report:**

```markdown
## Review: {scope}

### Summary
[1-2 sentence overview]

### Findings
| # | Severity | File:Line | Issue | Recommendation |
|---|----------|-----------|-------|----------------|
| 1 | HIGH | src/x.ts:42 | ... | ... |
| 2 | MEDIUM | src/y.ts:15 | ... | ... |

### Contract Compliance
- [x] API schema matches contract
- [ ] Missing error handling for edge case X

### Verdict
APPROVE / APPROVE_WITH_FIXES / REQUEST_CHANGES
```

### 5.10 Security Agent (`agents/security.md`)

**subagent_type:** `backend-api-security:backend-security-coder` (write mode)

**Purpose:** Security audit and hardening: auth, injection, secrets, PII, tenant isolation.

**Constraints:**
- Must follow Encryption & Secrets Safety from CLAUDE.md
- Must check OWASP Top 10
- Must verify tenant isolation on multi-tenant endpoints
- Must never log/expose secrets

**Output:** Risk register + fix patches.

### 5.11 Infrastructure Agent (`agents/infrastructure.md`)

**subagent_type:** `Explore` (analysis) / `general-purpose` (write mode)

**Purpose:** Docker Compose configuration, Nginx routing/SSL/rate-limiting, production scripts, Celery worker scaling, and monitoring setup. Also covers Control Plane (Fastify) and Tauri desktop configuration.

**Domain scope (CMD-5):**
- `docker-compose*.yml` (5 variants: base, full, nginx, media, dev)
- `nginx/conf.d/`, `nginx/ssl/` (routing rules, SSL, rate limiting)
- `scripts/` (backup-prod.sh, logs-prod.sh, restart-prod.sh, alert-monitor.sh)
- `dev-local.sh`, `run-services.sh`
- `control-plane/` (Fastify, Prisma, API keys, artifact storage)
- `apps/tauri-shell/` (desktop app config, CSP, bundled binaries)

**Key infrastructure facts (from `planning/ai-orchestra/domains/cmd5-infrastructure.md`):**

```
Service ports:
  postgres:5432   redis:6379    chromadb:8001→8000
  smartspec-web:3000            python-backend:8000
  docker-status:3001            control-plane:7070
  nginx:80/443                  flower:5555

Nginx rate limits:
  api_limit:  30 req/sec per IP (10MB zone)
  web_limit:  60 req/sec per IP (10MB zone)

Celery workers (separate compose):
  celery-media (concurrency:4, CPU:2.0, RAM:3GB)
  celery-video (concurrency:2, CPU:4.0, RAM:8GB)
```

**Constraints:**
- Must follow CRITICAL DEPLOYMENT RULES from CLAUDE.md (systemd only, no manual uvicorn/tsx)
- Must NOT modify application code (backend/frontend)
- Only 1 infra agent active at a time (docker operations are sequential)
- Changes to Nginx config MUST be validated with `./scripts/validate-all-configs.sh`
- Service restarts: use `sudo systemctl restart` — never kill processes directly

**Sub-agents it can spawn:**
- Docker Composer (modify compose files, add/remove services)
- Nginx Configurator (routing rules, SSL, performance tuning)
- Deploy Orchestrator (production deployment steps)
- Monitor Setup (health checks, alerting, log rotation)

**Output:** Modified config files + validation result + restart instructions.

### 5.12 Docs/Release Agent (`agents/docs-release.md`)

**subagent_type:** `general-purpose` (write mode)

**Purpose:** Update documentation, changelog, migration notes, release checklists.

### 5.13 Debugger Agent (`agents/debugger.md`)

**subagent_type:** `error-debugging:debugger` (Claude Code) / `general-purpose` + full protocol injected (Codex) / inline sequential (OpenCode)

**Purpose:** Focused code bug investigation and fixing. Triggered when a bug location is known or suspected. Uses mandatory 3-phase protocol from `planning/ai-orchestra/domains/cmd7-debug.md`.

**Domain context:** `planning/ai-orchestra/domains/cmd7-debug.md` (error pattern tables, CSS debug protocol, audit log queries, anti-patterns)

**Mandatory 3-Phase Protocol:**

```
Phase 1: UNDERSTAND (no code edits)
  1. Reproduce — run exact failing command, copy full output
  2. Read error — parse error message, stack trace, file:line references
  3. Trace data flow — read source from entry point → error location
  4. Identify root cause — state in ONE sentence: "Bug is caused by X because Y"
  5. Search similar — grep codebase for same pattern

Phase 2: PLAN (still no edits)
  6. Minimal fix — smallest change that fixes root cause
  7. Predict side effects — what depends on the code you'll change?
  8. Write failing test first (if no test covers this case)

Phase 3: FIX (now may edit)
  9. ONE focused change — no refactoring, no cleanup
  10. Run failing test → verify it passes
  11. Run full test suite → ensure no regressions
  12. If still fails → STOP, re-read NEW error (do not keep trying same approach)
```

**Hard Rules:**
- 3-attempt limit: same error after 3 tries → STOP, report to orchestra for user escalation
- No shotgun debugging: one change, one test, one verification
- Revert failed fixes before trying next approach
- No silent assumptions: if unsure what code does, READ it

**SmartSpecPro error domain mapping** (from cmd7-debug.md):

| Error Pattern | Domain | Start Looking |
|---|---|---|
| `TRPCClientError` | CMD-2 Backend | tRPC router → service → Zod schema |
| `TRPCError: UNAUTHORIZED` | CMD-2 | Auth middleware → `sdk.verifySession()` |
| `RuntimeWarning: coroutine never awaited` | CMD-3 Python | Async call sites |
| `sqlalchemy.exc.OperationalError` | CMD-3 | Connection pool, `async with` |
| `relation "X" does not exist` | CMD-4 Database | Run `pnpm db:push` |
| `Element renders blank/invisible` | CMD-1 Frontend | `index.css` global hide rules |

**Workflow (step-by-step execution):**

```
Step DB1: Parse Task Packet
  - Extract: error message, file:line hint (if any), test command, user description
  - If no file:line hint → this task should have gone through Research first (flag in output)

Step DB2: UNDERSTAND phase (no edits allowed)
  a. Run the exact failing command/test — copy FULL output
  b. Read error message + stack trace → extract file:line references
  c. Read source files from entry point → error location (full call chain)
  d. State root cause in ONE sentence: "Bug is caused by X because Y"
  e. Grep codebase for same error pattern (may be systemic)
  f. Check QUALITY GATE: if root cause not identified after steps a-e → stop, return "Root cause unclear, need [specific info]"

Step DB3: PLAN phase (still no edits)
  a. Identify minimal change that fixes root cause (1 file preferred, max 3)
  b. List files that depend on the code to be changed
  c. If no test covers this case: write failing test first
  d. Predict side effects (list all files that may break)

Step DB4: FIX phase
  a. Make ONE focused change (no refactoring, no cleanup nearby)
  b. Run failing test → must pass before proceeding
  c. Run full test suite (`pnpm test` or `pytest`)
  d. If tests still fail → STOP, return report with NEW error (do not retry same approach)
  e. If test suite passes → proceed to Step DB5

Step DB5: Attempt tracking
  - Track attempt count (max 3)
  - If attempt 3 fails → STOP, return blocked report with all findings
  - Each attempt must try a DIFFERENT approach; explain why prior approach failed

Step DB6: Output report (always output, even if not fully resolved)
```

**Quality Checklist** (before reporting complete):
- [ ] Root cause stated in one sentence
- [ ] Evidence cited (file:line)
- [ ] Failing test now passes
- [ ] Full test suite: 0 new failures
- [ ] Side effects listed and verified

**Output format:**

```markdown
## Debugger Report

### Root Cause
[One sentence: "Bug is caused by X because Y"]

### Evidence
- File:line where bug occurs
- Stack trace excerpt
- Relevant code read

### Fix Applied
- File changed
- What was changed (before/after)

### Test Results
- [x] Failing test now passes
- [x] Full test suite: N pass, 0 fail

### Side Effects Checked
- [list of affected files verified]
```

### 5.14 Error Detective Agent (`agents/error-detective.md`)

**subagent_type:** `error-debugging:error-detective` (Claude Code) / `general-purpose` + full protocol injected (Codex) / inline sequential (OpenCode)

**Purpose:** Production incident investigation via audit log analysis, traceId correlation, and cross-service timeline reconstruction. Triggered when the error source is unknown and may span multiple services.

**Domain context:** `planning/ai-orchestra/domains/cmd7-debug.md` (audit log queries section)

**SmartSpecPro Audit Log System:**

```bash
# Log files
apps/web/logs/audit/audit-YYYY-MM-DD.jsonl   # JSONL structured audit events

# Key event types
skill_detect, skill_execute                  # Skill pipeline events
llm_request, llm_response                   # LLM provider calls
media_request, media_response               # Media generation
error                                        # Error events

# Correlation field: traceId (present in all related events)

# Essential queries
grep '"traceId":"XYZ"' audit-$(date +%Y-%m-%d).jsonl | jq .
grep '"eventType":"error"' audit-$(date +%Y-%m-%d).jsonl | jq .
grep '"llm_response"' audit-$(date +%Y-%m-%d).jsonl | jq 'select(.timing.totalMs > 5000)'
```

```sql
-- Database cross-reference
SELECT "traceId", "modelUsed", "costUsd", "creditsCharged", "errorMessage"
FROM provider_usage_log
WHERE "createdAt" > NOW() - INTERVAL '7 days' AND "traceId" IS NOT NULL
ORDER BY "createdAt" DESC;
```

**Workflow (step-by-step):**

```
Step ED1: Parse Task Packet
  - Extract: time window, user description, any traceId or error message provided
  - If no info provided: start with "errors in last 1 hour"

Step ED2: Scope identification (run in parallel where possible)
  a. grep '"eventType":"error"' audit-{today}.jsonl | jq . → list all errors
  b. Count distinct traceIds in errors → identify affected scope
  c. If user provided specific traceId → skip a,b, go direct to ED3

Step ED3: Timeline reconstruction per traceId
  a. Extract all events: grep '"traceId":"{id}"' audit-{date}.jsonl | jq . | sort by timestamp
  b. Mark first failure event (error/exception) in timeline
  c. Identify all events BEFORE first failure (baseline)

Step ED4: Cross-service correlation
  a. Check provider_usage_log for matching traceId (costs, model, error)
  b. If media_request events found → check python-backend/logs/ for Celery task logs
  c. If Celery involved → look for external_task_id, check external API status

Step ED5: Root cause identification
  - Is it an isolated incident (1 traceId) or systemic (N traceIds same pattern)?
  - Is it a code bug → route to Debugger agent
  - Is it a provider issue (timeout, API error) → report as external
  - Is it a data issue → route to Database agent
  - Is it a rate limit / quota → report as infrastructure

Step ED6: Write Incident Report (output format below)

Step ED7: Routing recommendation
  - Always end with one of:
    "Route to: Debugger (code bug in {file})"
    "Route to: Database agent (data integrity issue)"
    "Route to: Infrastructure agent (provider/network issue)"
    "No action needed (external issue — monitor)"
```

**Quality Checklist:**
- [ ] All affected traceIds identified
- [ ] Timeline reconstructed with timestamps
- [ ] First failure event identified
- [ ] Root cause is one sentence
- [ ] Routing recommendation provided

**Output format — Incident Report:**

```markdown
## Incident Report

### Summary
[2-3 sentences: what happened, when, who affected]

### Timeline
| Time | Event | TraceId | Details |
|------|-------|---------|---------|
| 14:32:01 | llm_request | abc123 | model=claude-opus-4 |
| 14:32:08 | error | abc123 | "Provider timeout after 7000ms" |

### Root Cause
[One sentence root cause]

### Evidence
- Log file: audit-YYYY-MM-DD.jsonl, traceId: abc123
- DB record: provider_usage_log id=456
- [Other evidence citations]

### Affected Scope
- N traces affected
- Users: [list if known]
- Time range: HH:MM to HH:MM

### Recommended Fix
[What needs to change — route to Debugger or directly fixable]

### SQL Evidence Queries Used
[Queries run during investigation]
```

### 5.15 Security Review Coordinator (`agents/security-review.md`)

**subagent_type:** (Coordinator — dispatches tRPC, FastAPI, Frontend auditors) / `general-purpose` in Codex/OpenCode mode

**Purpose:** Pre-merge security gate. Dispatches 3 specialized auditors in parallel, aggregates findings by severity, returns PASS/FAIL/CONDITIONAL with a consolidated risk register.

**Trigger conditions** (from Section 4.6):
- User mentions "before merge", "pre-merge", "before PR", "ready to ship"
- Task risk = `high` or `critical`
- Changed files include: tRPC routers, FastAPI endpoints, React auth flows, middleware, VITE_* config

**Workflow (step-by-step):**

```
Step SR1: Determine scope
  a. Get list of changed files: `git diff --name-only HEAD~1` (or from Task Packet FILES section)
  b. If no changed files → scope = entire relevant directories
     - tRPC: apps/web/server/routers/ (all routers)
     - FastAPI: python-backend/app/api/ + python-backend/app/services/
     - Frontend: apps/web/client/src/ (auth-related paths)
  c. If too many files (> 30) → warn user and limit to highest-risk directories

Step SR2: Dispatch 3 auditors in parallel (Claude Code / Codex)
  Wave S1 — single message, 3 Tasks:
    Task 1: subagent_type=backend-api-security:backend-security-coder
            prompt = [security-trpc.md template] + "Audit these files: {tRPC_files}"
    Task 2: subagent_type=backend-api-security:backend-security-coder
            prompt = [security-fastapi.md template] + "Audit these files: {fastapi_files}"
    Task 3: subagent_type=Explore
            prompt = [security-frontend.md template] + "Audit these files: {frontend_files}"

  OpenCode mode: run each auditor sequentially (SR2a → SR2b → SR2c)

Step SR3: Collect and normalize findings
  - All 3 auditors must return findings in STANDARD TABLE FORMAT (see 5.16-5.18 output)
  - Table columns: # | Severity | Auditor | File:Line | Issue | Fix Direction

Step SR4: Deduplicate
  - Duplicate = same (File:Line + Issue Type) from 2 auditors
  - Merge rule: keep higher severity, combine Fix Directions
  - Mark merged items as "Multi-auditor finding"

Step SR5: Apply PASS/FAIL threshold
  - CRITICAL ≥ 1 → FAIL (merge blocked — must fix before proceeding)
  - HIGH ≥ 1 + no CRITICAL → CONDITIONAL (user must explicitly approve to proceed)
  - Only MEDIUM/LOW → PASS (log findings, proceed automatically)

Step SR6: Write outputs
  - Append findings to orchestra/risk_register.md
  - Print Security Gate Report (format below)

Step SR7: Post-gate action (auto-proceed unless user override required)
  - PASS → continue orchestra workflow automatically
  - CONDITIONAL → print warning, ask user once: "Approve to proceed? (yes/no)"
  - FAIL → stop orchestra, output: "Must fix CRITICAL findings before merge"
           Create fix Task Packets for each CRITICAL finding (route to backend/python/frontend agent)
```

**Output — Security Gate Report:**

```markdown
## Security Gate Report — {date}

### Result: PASS / CONDITIONAL / FAIL

### Findings Summary
| # | Severity | Auditor | File:Line | Issue | Fix |
|---|----------|---------|-----------|-------|-----|
| 1 | CRITICAL | tRPC | server/routers/admin.ts:42 | Missing tenantId check | Add tenantId filter |
| 2 | HIGH | Frontend | client/src/pages/Login.tsx:88 | Token in localStorage | Move to httpOnly cookie |

### By Auditor
- tRPC: N findings (C:1, H:0, M:2, L:1)
- FastAPI: N findings (C:0, H:1, M:0, L:0)
- Frontend: N findings (C:0, H:1, M:3, L:2)

### Verdict
[PASS: safe to merge | CONDITIONAL: needs approval | FAIL: blocked]
```

### 5.16 tRPC Security Auditor (`agents/security-trpc.md`)

**subagent_type:** `backend-api-security:backend-security-coder` (read-only audit mode)

**Purpose:** Audit tRPC routers and backend services for security vulnerabilities. Read-only analysis — findings only, no fixes (fixes go through Backend agent).

**Domain context:** `planning/ai-orchestra/domains/cmd2-backend.md`

**SmartSpecPro tRPC Security Checklist:**

```
For each tRPC router/procedure:

Auth checks:
  ☐ Uses protectedProcedure or adminProcedure (never publicProcedure for sensitive data)
  ☐ tenantId extracted from session context (ctx.tenant.id), NOT from user input
  ☐ All queries filter by tenantId — no cross-tenant data leaks possible

Input validation:
  ☐ Every input validated with Zod schema
  ☐ No raw SQL string interpolation (use Drizzle ORM parameterized queries)
  ☐ File upload limits enforced
  ☐ Pagination limits enforced (no unbounded queries)

Output safety:
  ☐ No encrypted fields returned in plaintext (check *Encrypted columns)
  ☐ No internal system fields exposed (passwords, tokens, internal IDs)
  ☐ Error messages don't leak stack traces or system paths

Audit logging:
  ☐ Sensitive operations emit audit events (credit changes, role changes, admin actions)
  ☐ No secrets logged in audit events

Rate limiting:
  ☐ LLM-calling endpoints have rate limiting via Bottleneck/BullMQ
  ☐ Admin endpoints have appropriate rate limits
```

**Output — STANDARD FORMAT (coordinator requires this exact structure):**

```markdown
| # | Severity | File:Line | Issue | Fix Direction |
|---|----------|-----------|-------|---------------|
| 1 | CRITICAL | apps/web/server/routers/admin.ts:42 | Missing tenantId filter | Add `where: { tenantId: ctx.tenant.id }` to all queries |
| 2 | HIGH | ... | ... | ... |
| 3 | MEDIUM | ... | ... | ... |
```

Severity scale: CRITICAL (exploitable now) / HIGH (exploitable with effort) / MEDIUM (risk in specific conditions) / LOW (best practice violation)
No CRITICAL → 0 items in table is valid output (security clean).

### 5.17 FastAPI Security Auditor (`agents/security-fastapi.md`)

**subagent_type:** `backend-api-security:backend-security-coder` (read-only audit mode)

**Purpose:** Audit FastAPI endpoints and Python backend for security vulnerabilities.

**Domain context:** `planning/ai-orchestra/domains/cmd3-python.md`

**SmartSpecPro FastAPI Security Checklist:**

```
For each FastAPI endpoint:

Auth checks:
  ☐ Uses Depends(verify_api_key) or appropriate auth dependency
  ☐ Celery tasks do not bypass auth (task params are from verified callers only)
  ☐ CORS settings restrict origins (not wildcard *)

Input validation:
  ☐ Pydantic models validate all request bodies
  ☐ SQLAlchemy queries use bound parameters (no f-string in SQL)
  ☐ File path inputs sanitized (no path traversal)

Output safety:
  ☐ No plaintext secrets in responses (API keys, DB passwords)
  ☐ Python `print()` statements removed (use structured logger)
  ☐ Stack traces not exposed in HTTP responses

Key management:
  ☐ Encrypted fields use `smartspecweb_crypto.py` (AES-256-GCM, same key as Node.js)
  ☐ `LLM_ENCRYPTION_KEY` read from env, never hardcoded
  ☐ No secrets logged via logging.info/debug

Celery tasks:
  ☐ Task inputs validated before processing (malicious task injection)
  ☐ Task results don't expose sensitive data
  ☐ Retry limits set (prevent infinite loops)
```

**Output — STANDARD FORMAT (coordinator requires this exact structure):**

```markdown
| # | Severity | File:Line | Issue | Fix Direction |
|---|----------|-----------|-------|---------------|
| 1 | CRITICAL | apps/web/server/routers/admin.ts:42 | Missing tenantId filter | Add `where: { tenantId: ctx.tenant.id }` to all queries |
| 2 | HIGH | ... | ... | ... |
| 3 | MEDIUM | ... | ... | ... |
```

Severity scale: CRITICAL (exploitable now) / HIGH (exploitable with effort) / MEDIUM (risk in specific conditions) / LOW (best practice violation)
No CRITICAL → 0 items in table is valid output (security clean).

### 5.18 Frontend Security Auditor (`agents/security-frontend.md`)

**subagent_type:** `Explore` (read-only audit — no code changes)

**Purpose:** Audit React frontend for client-side security vulnerabilities. Focus: XSS, auth bypass in routing, data exposure, secret leakage.

**SmartSpecPro Frontend Security Checklist:**

```
XSS prevention:
  ☐ No dangerouslySetInnerHTML with unsanitized user content
  ☐ User-controlled content rendered via React (auto-escapes) not innerHTML
  ☐ URL params validated before use in components

Authentication / Authorization:
  ☐ Protected routes check auth state before rendering (not just redirecting after)
  ☐ Admin-only UI components check role in addition to route guards
  ☐ JWT/session tokens stored in httpOnly cookies (not localStorage or sessionStorage)
  ☐ Auth state not derived from user-controllable URL params

Secret exposure:
  ☐ No VITE_SECRET_* or sensitive values in VITE_* env vars (bundled into client)
  ☐ No API keys or tokens in client-side code or components
  ☐ Console.log statements don't output user PII or tokens

Data exposure:
  ☐ tRPC query results don't include server-only fields (passwords, tokens, encrypted columns)
  ☐ Error messages shown to users don't include internal paths or stack traces
  ☐ Admin data not accessible through unauthenticated routes

CSP / Headers:
  ☐ Inline script usage checked (CSP violations)
  ☐ External scripts loaded from trusted CDN only
```

**Output — STANDARD FORMAT (coordinator requires this exact structure):**

```markdown
| # | Severity | File:Line | Issue | Fix Direction |
|---|----------|-----------|-------|---------------|
| 1 | CRITICAL | apps/web/server/routers/admin.ts:42 | Missing tenantId filter | Add `where: { tenantId: ctx.tenant.id }` to all queries |
| 2 | HIGH | ... | ... | ... |
| 3 | MEDIUM | ... | ... | ... |
```

Severity scale: CRITICAL (exploitable now) / HIGH (exploitable with effort) / MEDIUM (risk in specific conditions) / LOW (best practice violation)
No CRITICAL → 0 items in table is valid output (security clean).

### 5.19 Domain Knowledge References

Each agent template must be equipped with **SmartSpecPro-specific domain context** drawn from `planning/ai-orchestra/domains/`. These files contain facts accumulated from real development sessions and must be included in Task Packet `CONTEXT` sections when relevant.

| Agent | Domain File | Critical Facts to Include |
|-------|-------------|---------------------------|
| Frontend (CMD-1) | `domains/cmd1-frontend.md` | React 19, Wouter routing, Radix UI + CVA, path alias `@/`, TanStack Query patterns, 30+ existing components |
| Backend (CMD-2) | `domains/cmd2-backend.md` | 32 tRPC routers, 39 services, Drizzle ORM schema, `adminMiddleware`, `tenantMiddleware`, audit log pattern |
| Python (CMD-3) | `domains/cmd3-python.md` | FastAPI + SQLAlchemy 2 async, Celery task patterns, LangChain/LangGraph integration, 80% coverage rule |
| Database (CMD-4) | `domains/cmd4-database.md` | 30+ tables grouped by domain, Drizzle `pgTable` camelCase columns, migration safety protocol |
| Infrastructure (CMD-5) | `domains/cmd5-infrastructure.md` | Service ports, Nginx rate limits, Celery worker resource limits, systemd service names, Docker Compose variants |
| Security (CMD-6) | N/A (inline) | AES-256-GCM via `crypto.ts`, `LLM_ENCRYPTION_KEY`, OWASP Top 10, tenant isolation rules |
| Debugger (CMD-7) | N/A (inline) | Audit log path `apps/web/logs/audit/`, trace ID structure, 3-attempt debug limit |
| Test/QA (CMD-8) | N/A (inline) | Vitest for TS, pytest for Python, 80% coverage enforcement, test marker tags |

**Usage rule for orchestra dispatch:**

When creating a Task Packet, always include the relevant domain file path in the `CONTEXT` section:

```markdown
### CONTEXT
SmartSpecPro-specific context:
- See planning/ai-orchestra/domains/cmd2-backend.md for complete backend domain knowledge
- Relevant facts: 32 tRPC routers, auth uses adminMiddleware, tenantId isolation required
- [task-specific context here]
```

**Why this matters:**

Without domain context, sub-agents make generic assumptions (e.g., "add a new router" without knowing the existing 32-router structure). With domain context, agents produce idiomatic, conflict-free code on the first attempt.

---

## 6. Phase 3 — Deep-* Skill Integration

### 6.1 Integration Architecture

Orchestra acts as a **router** to deep-* skills, not a replacement:

```
/orchestra ──── scope=project ──► /deep-project @requirements.md
                                       │
                                       ▼
                                  splits/01-name/spec.md
                                  splits/02-name/spec.md
                                       │
/orchestra ──── scope=large ───► /deep-plan-codex @spec.md
                                       │
                                       ▼
                                  sections/index.md
                                  sections/section-01-*.md
                                       │
/orchestra ──── (continues) ───► /deep-implement @sections/
                                       │
                                       ▼
                                  Git commits + implementation-summary.md
```

### 6.2 Handoff Protocol: Orchestra → Deep-*

When orchestra routes to a deep-* skill:

1. **Prepare input** — Orchestra writes/validates the input file that the deep-* skill needs
2. **Set decision mode** — Write `orchestra/decision-mode.md` which deep-* skills will discover and reuse
3. **Invoke skill** — User runs the deep-* skill command (orchestra cannot invoke skills directly)
4. **Print handoff instructions:**

```text
════════════════════════════════════════════════════════════════
ORCHESTRA: Handoff to /deep-plan-codex
════════════════════════════════════════════════════════════════
Input prepared: specs/feature/xyz/spec.md
Decision mode: smart_auto (shared)

Next command:
  /deep-plan-codex @specs/feature/xyz/spec.md

After completion, return to orchestra:
  /orchestra resume
════════════════════════════════════════════════════════════════
```

### 6.3 Return Protocol: Deep-* → Orchestra

When a deep-* skill completes and user returns to orchestra:

1. **Detect deep-* artifacts** — Scan for `implementation-summary.md`, `implementation-plan.md`, `sections/index.md`
2. **Sync to orchestra/** — Extract key information into orchestra artifacts:

| Deep-* Artifact | Syncs To | What Gets Extracted |
|-----------------|----------|---------------------|
| `implementation-summary.md` | `orchestra/progress.md` | Section completion status, commit hashes |
| `implementation-plan.md` | `orchestra/plan.md` | Plan summary, architecture decisions |
| `decision-log.md` | `orchestra/decisions.md` | Key architectural decisions |
| `implementation-security-review.md` | `orchestra/risk_register.md` | Security findings |
| `implementation-blocked-tasks.md` | `orchestra/backlog.md` | Remaining blocked work |

3. **Update snapshot** — Refresh `orchestra/snapshot.md` with post-deep-* state

### 6.4 Shared Artifacts

These artifacts are shared between orchestra and deep-* skills:

| Artifact | Owner | Consumers |
|----------|-------|-----------|
| `decision-mode.md` | First to create (orchestra or deep-*) | All skills reuse |
| `contracts.md` | Orchestra | Deep-plan-codex reads for contract-aware planning |
| `research-notes.md` | Deep-plan-codex | Orchestra reads for progress tracking |
| `implementation-progress.md` | Deep-implement | Orchestra reads for sync |

### 6.5 Capability Registry

Orchestra maintains a registry of when to invoke each deep-* skill:

| Trigger | Skill | Input Required | Output Expected |
|---------|-------|----------------|-----------------|
| Scope = `project` + requirements unclear | `/deep-project` | `@requirements.md` | `project-manifest.md`, `splits/*/spec.md` |
| Scope = `large` + spec exists | `/deep-plan-codex` | `@spec.md` | `implementation-plan.md`, `sections/` |
| Sections exist + ready for implementation | `/deep-implement` | `@sections/` | Git commits, `implementation-summary.md` |
| Spec needs improvement | `/deep-plan-codex` (improve mode) | `@spec.md` | Updated plan + sections |

---

## 7. Phase 4 — Compaction Safety & Session Resume

### 7.1 Orchestra Artifact Directory

```
orchestra/
  plan.md                 # Current plan (Single Source of Truth)
  progress.md             # Status: done/in-progress/blocked/next + context_state
  backlog.md              # Prioritized remaining work
  decisions.md            # Decision log (ADR-lite format)
  contracts.md            # Interface contracts for parallel work
  snapshot.md             # Session resume snapshot (most critical file)
  decision-mode.md        # User's decision preference
  research.md             # Research findings (optional)
  test_plan.md            # Test strategy (optional)
  risk_register.md        # Security/risk findings (optional)
  archive/                # Archived previous sessions
    {timestamp}/
```

### 7.2 Snapshot Format (`orchestra/snapshot.md`)

```markdown
# Orchestra Snapshot

## Meta
- **Date:** {ISO timestamp}
- **Context State:** {green|yellow|red}
- **Session ID:** {uuid or timestamp}

## Current Goal
{1-2 sentence description of what we're building}

## What's Done
- [x] {completed item 1} — {commit hash or artifact reference}
- [x] {completed item 2}

## In Progress
- [ ] {active item 1} — {which sub-agent/skill is handling it}

## Blocked
- [ ] {blocked item} — blocked by: {reason}

## Key Decisions Made
- {Decision 1}: chose {option} because {reason} (see decisions.md #N)
- {Decision 2}: ...

## Active Contracts
{Summary of key contracts — full detail in contracts.md}

## Open Questions
- {Question needing user input}

## Risks
- {Risk 1}: {severity} — {mitigation}

## Next Steps (ordered)
1. {Next action 1}
2. {Next action 2}
3. ...

## Files Index
{List of all orchestra/ files and their purpose}

## Resume Commands

### Resume in same session:
/orchestra resume

### Resume in new session (full context):
Read these files first:
- orchestra/snapshot.md
- orchestra/plan.md
- orchestra/progress.md
- orchestra/backlog.md
- orchestra/contracts.md
- orchestra/decisions.md
Then run: /orchestra resume

### Resume in new session (minimal):
Read orchestra/snapshot.md, then run: /orchestra resume
```

### 7.3 Context Health Check (CHC) Protocol

Orchestra runs CHC at these checkpoints:

| Trigger | Action |
|---------|--------|
| After every completed wave | Evaluate context state |
| Before high/critical risk work | Mandatory evaluation |
| After 5+ wave cycles | Mandatory evaluation |
| Before routing to deep-* skill | Snapshot (deep-* will have its own context) |
| User requests `/orchestra snapshot` | Immediate snapshot |

**State evaluation heuristics:**

- **Green:** < 3 waves complete, < 5 decisions, single domain
- **Yellow:** 3-6 waves, 5-15 decisions, multi-domain, contracts active
- **Red:** > 6 waves, > 15 decisions, OR about to change major topic, OR multiple deep-* cycles complete

**When state = red (mandatory):**

1. Update ALL orchestra/ files to current state
2. Write/update `orchestra/snapshot.md` with full resume information
3. Print warning:

```text
════════════════════════════════════════════════════════════════
CONTEXT HEALTH CHECK: RED
════════════════════════════════════════════════════════════════
Context is heavy. Snapshot saved to orchestra/snapshot.md

If context compacts, resume with:
  /orchestra resume

All progress is persisted in orchestra/ files.
════════════════════════════════════════════════════════════════
```

### 7.4 Resume Protocol

**Full resume algorithm** (execute in this exact order):

```
Step R1: Check prerequisites
  - If orchestra/ does not exist → abort, tell user to start fresh
  - If orchestra/.lock exists AND timestamp < 30 min ago → warn: "Another session may be active"
  - Write orchestra/.lock with current timestamp

Step R2: Load state from files (read ALL — do not skip any)
  a. snapshot.md   → parse: Current Goal, What's Done, In Progress, Blocked, Key Decisions, Active Contracts, Next Steps
  b. plan.md       → parse: Wave Plan sections (find first wave with status != "Complete")
  c. progress.md   → parse: all wave records, find last complete wave number
  d. backlog.md    → parse: all items, sorted by priority (order in file = priority)
  e. contracts.md  → parse: all active contracts (needed if resuming mid-wave)
  f. decisions.md  → parse: all decisions (context only — no action needed)

Step R3: Validate consistency
  - If snapshot.last_wave_complete != progress.last_wave_complete:
    → Trust snapshot (more recently written)
    → Update progress.md to match snapshot
    → Log discrepancy in decisions.md: "Resume: snapshot/progress mismatch corrected"
  - If snapshot is older than 24 hours:
    → Warn user: "Snapshot is {N} hours old. Verify plan is still current."

Step R4: Determine resume point
  PRIORITY ORDER (first match wins):
    P1: If backlog.md has items with status="ready" → execute highest-priority ready item first
    P2: If plan.md shows a wave with status="in-progress" → resume that wave (re-dispatch incomplete agents)
    P3: If plan.md shows a wave with status="pending" → start that wave (Step 4 Dispatch)
    P4: If all waves are complete but security gate not run → run security-review.md
    P5: If everything complete → print final summary, ask if user has new tasks

Step R5: Print status summary (EXACTLY this format)
  ════════════════════════════════════════════════════════
  ORCHESTRA RESUME
  ════════════════════════════════════════════════════════
  Goal:       {snapshot.Current Goal — 1 line}
  Completed:  {N} waves ({list completed wave names})
  Resuming:   {current wave name and status}
  Blocked:    {N items in backlog}
  Next step:  {first action — 1 sentence}
  ════════════════════════════════════════════════════════

Step R6: Continue from resume point (Step R4 result)
  - Jump to corresponding workflow step (Step 3/4/5/6 based on resume point)
  - Remove orchestra/.lock when session ends normally

Step R7: Re-establish context
  - Before any sub-agent dispatch, include relevant decision history and contract info in Task Packets
  - Sub-agents should be re-briefed: "This is a resumed session. Prior context: [key decisions]"
```

**If files are inconsistent** (snapshot says X but progress says Y):
- Trust `snapshot.md` as source of truth (written most recently before compaction)
- Update other files to match
- Log the inconsistency in `decisions.md`

**Staleness rules:**
- snapshot.md < 30 min old → resume normally
- snapshot.md 30 min–24 hrs old → resume with warning
- snapshot.md > 24 hrs old → prompt user to confirm goal is still current before resuming
- orchestra/.lock older than 30 min → stale lock, safe to ignore

---

## 8. Affected Files (New Files Only)

### Skills Directory

| File | Type | Description |
|------|------|-------------|
| `skills/orchestra/SKILL.md` | **New** | Main conductor skill definition |
| `skills/orchestra/references/task-analysis.md` | **New** | Task classification guide |
| `skills/orchestra/references/task-packet-format.md` | **New** | Task Packet specification |
| `skills/orchestra/references/routing-decision.md` | **New** | Routing decision tree |
| `skills/orchestra/references/wave-planning.md` | **New** | Wave-based parallelism rules |
| `skills/orchestra/references/sub-agent-dispatch.md` | **New** | Sub-agent dispatch protocol |
| `skills/orchestra/references/result-integration.md` | **New** | Result merge + conflict resolution |
| `skills/orchestra/references/quality-gates.md` | **New** | Gate definitions + failure protocol |
| `skills/orchestra/references/artifact-management.md` | **New** | orchestra/ file management |
| `skills/orchestra/references/compaction-safety.md` | **New** | CHC + snapshot protocol |
| `skills/orchestra/references/skill-pack-integration.md` | **New** | deep-* integration protocol |
| `skills/orchestra/references/session-resume.md` | **New** | Resume protocol + templates |
| `skills/orchestra/references/platform-compat.md` | **New** | Platform detection + dispatch adapter (Claude Code/Codex/OpenCode) |
| `skills/orchestra/references/security-review-protocol.md` | **New** | Pre-merge security gate: trigger rules, severity thresholds |
| `skills/sub-agents/README.md` | **New** | Agent registry overview |
| `skills/sub-agents/agents/research.md` | **New** | Research agent template |
| `skills/sub-agents/agents/architect.md` | **New** | Architect agent template |
| `skills/sub-agents/agents/frontend.md` | **New** | Frontend implementer template |
| `skills/sub-agents/agents/backend.md` | **New** | Backend implementer template |
| `skills/sub-agents/agents/python.md` | **New** | Python implementer template |
| `skills/sub-agents/agents/database.md` | **New** | Database agent template |
| `skills/sub-agents/agents/test-qa.md` | **New** | Test/QA agent template |
| `skills/sub-agents/agents/reviewer.md` | **New** | Reviewer agent template |
| `skills/sub-agents/agents/security.md` | **New** | Security agent (general hardening) |
| `skills/sub-agents/agents/debugger.md` | **New** | Debugger agent — 3-phase bug investigation (CMD-7) |
| `skills/sub-agents/agents/error-detective.md` | **New** | Error Detective — audit log / production incident analysis |
| `skills/sub-agents/agents/security-review.md` | **New** | Security Review Coordinator — pre-merge gate dispatcher |
| `skills/sub-agents/agents/security-trpc.md` | **New** | tRPC Endpoint Security Auditor |
| `skills/sub-agents/agents/security-fastapi.md` | **New** | FastAPI/Python Security Auditor |
| `skills/sub-agents/agents/security-frontend.md` | **New** | Frontend Security Auditor (XSS, auth bypass, data exposure) |
| `skills/sub-agents/agents/infrastructure.md` | **New** | Infrastructure (CMD-5) agent template |
| `skills/sub-agents/agents/docs-release.md` | **New** | Docs/Release agent template |
| `skills/sub-agents/contracts/task-packet.schema.md` | **New** | Task Packet format reference |
| `skills/sub-agents/contracts/result-report.schema.md` | **New** | Result Report format reference |

### No Existing Files Modified

This skill pack is entirely additive. No existing files are changed.

---

## 9. Integration Matrix — How Everything Connects

### 9.0 System Architecture Map

Orchestra sub-agents operate within this SmartSpecPro infrastructure topology. Every Task Packet `CONTEXT` for infrastructure-touching work must reference this map:

```
                              ┌─────────────┐
                              │    Nginx     │ :80/:443 (SSL, reverse proxy)
                              │  (CMD-5)     │ rate-limit: 30 req/s (API), 60 req/s (web)
                              └──────┬───────┘
                      ┌──────────────┼──────────────┐
                      ▼              ▼               ▼
               ┌─────────────┐ ┌──────────┐ ┌──────────────┐
               │  Web App     │ │  Python  │ │   Control    │
               │  :3000       │ │  Backend │ │   Plane      │
               │  React+tRPC  │ │  :8000   │ │   :7070      │
               │  (CMD-1/2)   │ │  (CMD-3) │ │   (Fastify)  │
               └──────┬───────┘ └────┬─────┘ └──────────────┘
                      │              │
                      ▼              ▼
               ┌─────────────┐ ┌──────────┐
               │  PostgreSQL  │ │   Redis  │
               │  :5432       │ │   :6379  │
               │  (CMD-4)     │ │  (CMD-4) │
               └─────────────┘ └────┬─────┘
                                    │
                              ┌─────┴─────┐
                              │   Celery   │
                              │  Workers   │ celery-media (CPU:2, RAM:3GB)
                              │  (CMD-3/5) │ celery-video (CPU:4, RAM:8GB)
                              └────────────┘

Service ports (cmd5-infrastructure.md):
  postgres:5432   redis:6379    chromadb:8001→8000
  smartspec-web:3000            python-backend:8000
  docker-status:3001            control-plane:7070
  nginx:80/443                  flower:5555

Production access: https://smartaihub.app (only — no localhost for users)
Service management: systemd (smartspec-{infra,backend,web}.service) — NEVER manual start
```

### 9.1 Skill Chain Complete Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                         /orchestra                                    │
│                                                                       │
│  ┌─────────┐   ┌──────────┐   ┌───────────┐   ┌─────────────┐       │
│  │ Analyze  │──►│  Route   │──►│ Contract  │──►│  Dispatch   │       │
│  │  Task    │   │ Decision │   │ & Waves   │   │ Sub-Agents  │       │
│  └─────────┘   └──────────┘   └───────────┘   └──────┬──────┘       │
│                      │                                 │              │
│          ┌───────────┼────────────────┐               │              │
│          ▼           ▼                ▼               │              │
│    ┌──────────┐ ┌──────────┐ ┌──────────────┐        │              │
│    │  Direct  │ │  Sub-    │ │  Deep-*      │        │              │
│    │  (small) │ │  Agents  │ │  Pipeline    │        │              │
│    └──────────┘ │  (med)   │ │  (large+)    │        │              │
│                 └──────────┘ └──────────────┘        │              │
│                                    │                  │              │
│                    ┌───────────────┘                  │              │
│                    ▼                                  ▼              │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │              Result Integration + Quality Gates          │        │
│  └──────────────────────────┬──────────────────────────────┘        │
│                             ▼                                        │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │         Progress Update + Context Health Check           │        │
│  │         (orchestra/ artifacts + snapshot.md)              │        │
│  └─────────────────────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────────────────────┘
```

### 9.2 Artifact Flow Between All Skills

```
/deep-project artifacts:
  project-manifest.md ─────────► orchestra/plan.md (split summary)
  deep_project_interview.md ───► orchestra/research.md (append)
  splits/*/spec.md ────────────► input for /deep-plan-codex

/deep-plan-codex artifacts:
  research-notes.md ───────────► orchestra/research.md (append)
  implementation-plan.md ──────► orchestra/plan.md (plan summary)
  decision-log.md ─────────────► orchestra/decisions.md (merge)
  sections/index.md ───────────► input for /deep-implement

/deep-implement artifacts:
  implementation-progress.md ──► orchestra/progress.md (sync)
  implementation-summary.md ───► orchestra/progress.md (final status)
  implementation-decision-log.md → orchestra/decisions.md (merge)
  implementation-security-review.md → orchestra/risk_register.md
  implementation-blocked-tasks.md → orchestra/backlog.md

Sub-agent outputs:
  Research Brief ──────────────► orchestra/research.md
  Review Report ───────────────► orchestra/progress.md (gate results)
  Risk Register ───────────────► orchestra/risk_register.md
```

### 9.3 Decision Mode Sharing

All skills share a single decision mode preference:

```
orchestra/decision-mode.md  (created by whichever skill runs first)
        │
        ├──► /deep-plan-codex reads as <planning_dir>/decision-mode.md
        ├──► /deep-implement reads as <planning_dir>/decision-mode.md
        └──► sub-agents inherit from orchestra dispatch
```

Orchestra writes it first. If a deep-* skill runs in a standalone directory, it creates its own copy. On return to orchestra, the latest is synced.

### 9.4 Performance Metrics

Track these for each orchestration session (source: `planning/ai-orchestra/architecture.md`):

| Metric | Description | Target |
|--------|-------------|--------|
| **Time to resolution** | User request → task fully completed | Minimize; 2-3x faster than sequential with parallel waves |
| **Agent efficiency** | Tool calls per sub-agent (fewer = better prompts) | < 15 tool calls per sub-agent on average |
| **Parallel utilization** | % of agents running simultaneously across all waves | > 50% of agents in at least 1 parallel wave |
| **First-pass accuracy** | Fix/implement success without re-dispatch | > 80% (tracked via re-dispatch rate in `orchestra/progress.md`) |
| **Regression rate** | New bugs introduced by agent changes | < 5% of waves produce regressions |
| **Context survival rate** | Sessions resumed successfully after compaction | > 95% (requires snapshot.md before red state) |
| **File conflict rate** | Waves where parallel agents conflict on same file | < 5% (enforced by contract-driven ownership) |
| **Security gate pass rate** | % of pre-merge security reviews with no CRITICAL on first attempt | > 90% (indicates stable security posture) |

**Measurement protocol:**

Orchestra records per-wave stats in `orchestra/progress.md`:

```markdown
## Wave 2 — Complete
- Agents: [backend-architect, Explore(database)]
- Parallel: Yes (2 agents, different files)
- Tool calls: backend=12, database=6
- Result: PASS (no conflicts, gate passed)
- Re-dispatch: 0
```

At session end, copy aggregate stats to `orchestra/snapshot.md` under a `## Session Stats` section for future reference.

---

## 10. Error Handling & Edge Cases

### 10.1 Sub-Agent Failures

| Failure | Recovery |
|---------|----------|
| Agent returns empty/unhelpful result | Re-dispatch with more specific prompt (add file paths, line numbers) |
| Agent modifies wrong files | Revert via `git checkout -- <files>`, re-dispatch with corrected CONSTRAINTS |
| Agent output conflicts with another agent | Resolve manually based on contract, re-dispatch loser |
| Agent exceeds scope (touches files outside CONSTRAINTS) | Revert extra changes, log in decisions.md |
| Same error after 3 attempts | STOP, update backlog.md with blocked task, ask user |

### 10.2 Deep-* Skill Failures

| Failure | Recovery |
|---------|----------|
| Deep-plan-codex produces incomplete plan | Orchestra detects missing sections in `sections/index.md`, prompts user to re-run with `improve_existing_plan` intent |
| Deep-implement fails mid-section | Orchestra reads `implementation-progress.md` to find last complete section, updates `orchestra/backlog.md` with remaining sections |
| Deep-project splits are wrong | Orchestra prompts user to re-run `/deep-project` or manually adjust `project-manifest.md` |

### 10.3 Context Compaction Recovery

| Scenario | Recovery |
|----------|----------|
| Context compacts mid-wave | Read `orchestra/snapshot.md` + `progress.md`, resume from last complete wave |
| Context compacts during deep-* handoff | Deep-* skill has its own resume protocol; orchestra reads deep-* artifacts on return |
| snapshot.md is stale (older than progress.md) | Trust `progress.md` for status, `snapshot.md` for plan/contracts/decisions |
| All orchestra/ files missing | Start fresh; user's code changes are in git history |

### 10.4 Partial Wave Rollback Protocol

When a wave has multiple parallel agents and only some succeed:

```
Scenario: Wave N dispatches agents A + B simultaneously.
  Agent A: SUCCEEDS (modifies files, passes gate)
  Agent B: FAILS (error or wrong output)

Recovery:
  1. DO NOT roll back Agent A's changes — they may be required for Agent B's re-attempt
  2. Mark wave as "partial" in orchestra/progress.md:
       "Wave N — Partial: Agent A complete, Agent B failed"
  3. Run `git diff HEAD` — record exact files Agent A changed in progress.md
  4. Create fix Task Packet for Agent B:
       - Include Agent A's changes in CONTEXT (so Agent B sees current file state)
       - Reduce CONSTRAINTS to the exact problem Agent B must fix
  5. Re-dispatch Agent B (max 3 total attempts for this agent)

If Agent B fails after 3 attempts:
  6. Mark agent B task as BLOCKED in backlog.md with error details
  7. Option to roll back Agent A if its changes depend on Agent B:
       → git checkout -- <Agent_A_files>  (only if Agent A's work is useless without B)
  8. Report to orchestra: "Wave N BLOCKED — Agent B failed, Agent A work pending or rolled back"
```

**Principle:** Partial progress is preserved whenever possible. Only roll back if the partial result is actively harmful.

### 10.5 Concurrent Session Protection

Orchestra writes a lock file to prevent two concurrent sessions from corrupting the same `orchestra/` state:

**Lock file:** `orchestra/.lock`

**Lock format:**
```
session_id: {uuid}
timestamp: {ISO 8601}
purpose: {first line of current task}
```

**Lock lifecycle:**

| Event | Action |
|-------|--------|
| `/orchestra` starts | Check `.lock` exists? |
| Lock missing | Write new `.lock`, proceed |
| Lock exists, age < 30 min | Warn: "Active session detected (lock from {time}). Force-take? (yes/no)" |
| Lock exists, age > 30 min | Stale lock — overwrite silently, log in decisions.md |
| Session ends normally | Delete `.lock` |
| Session compacts/crashes | Lock stays until next session detects and resolves it |

**Note:** `orchestra/.lock` should be added to `.gitignore` — it is session-local state.

### 10.6 Git Pre-Dispatch Baseline

Before any wave that involves file-editing agents, record the git baseline:

```
Pre-wave baseline protocol:
  1. Run: git status --short
     → Record output in progress.md under "Wave N baseline"
  2. Run: git rev-parse HEAD
     → Record commit hash as "Wave N base commit: {hash}"

Post-wave verification:
  1. Run: git diff HEAD
     → Compare against expected changes from Task Packet OUTPUT section
     → Flag unexpected file changes (agent exceeded scope)
  2. Update progress.md: "Wave N changes: {list of modified files}"

Rollback command (if needed):
  git checkout -- <specific_files>     # Revert individual files
  git reset HEAD~1 --mixed             # Undo last commit (if committed)
```

**Why this matters:** Knowing the exact baseline allows precise rollback without losing unrelated work.

### 10.7 Agent-Level Retry Logic

Retries happen at the **agent level**, not the wave level:

```
Agent fails (wrong output / error / gate failure):
  Attempt 1: Original Task Packet → FAIL
  Attempt 2: Revised Task Packet (add specific error context + extra constraints) → FAIL
  Attempt 3: Revised Task Packet (different approach + explicit anti-pattern to avoid) → FAIL
  → BLOCKED: add to backlog.md, continue with other agents in wave

Wave does NOT restart from scratch when one agent fails.
Other agents in the same wave that SUCCEEDED are not re-run.
```

**Retry escalation rules (each attempt must be different):**

| Attempt | Change from previous |
|---------|---------------------|
| Attempt 2 | Add exact error text to CONTEXT, add the failed approach to CONSTRAINTS ("do NOT try X") |
| Attempt 3 | Add file:line references of error, shrink scope (tackle only the core issue), different approach |

**3-attempt limit is per agent per wave.** If an agent succeeds in Wave N but the same agent is needed in Wave M, it starts fresh with 3 new attempts.

---

## 11. Rollout Order

### 11.1 Phase Sequence

Phases must be implemented in dependency order:

```
Phase 1: Orchestra Skill Core              ← minimum viable skill (start here)
  └── SKILL.md + all 13 reference docs

Phase 2: Sub-Agent Prompt Library          ← depends on Phase 1
  └── All 17 agent templates + 2 contract schemas
      Makes sub-agent dispatch high-quality and consistent.

Phase 3: Deep-* Integration                ← depends on Phase 1 + 2
  └── Handoff/return protocols + artifact sync
      Connects orchestra to existing pipeline.

Phase 4: Compaction Safety                 ← depends on Phase 1
  └── CHC + snapshot + resume protocol (builds on orchestrator artifacts)
      Protects against context loss.
```

Phase 1 is usable standalone. Each subsequent phase adds capability without breaking prior phases.

### 11.2 Critical Path Within Phase 1

Reference files must be created in this order (each depends on the previous):

```
CRITICAL PATH (must exist before orchestra can run at all):
  1. SKILL.md                     ← conductor entry point
  2. task-analysis.md             ← Step 1 classification algorithm
  3. routing-decision.md          ← Step 2 routing table + bug sub-tree

SECOND PRIORITY (needed before first real dispatch):
  4. wave-planning.md             ← Step 3 contract + wave design
  5. sub-agent-dispatch.md        ← Step 4 Task Packet format + dispatch rules
  6. result-integration.md        ← Step 5 merge + conflict resolution

THIRD PRIORITY (needed for quality enforcement):
  7. quality-gates.md             ← Step 6 gate definitions + failure protocol
  8. artifact-management.md       ← Step 7 orchestra/ file management

FOURTH PRIORITY (compaction safety — Phase 4 begins here):
  9. compaction-safety.md         ← Step 8 CHC + snapshot protocol
  10. session-resume.md           ← Resume algorithm (7 steps R1-R7)

FIFTH PRIORITY (integration + compatibility):
  11. skill-pack-integration.md   ← deep-* handoff + return protocol
  12. platform-compat.md          ← Claude Code / Codex / OpenCode dispatch
  13. security-review-protocol.md ← pre-merge gate trigger rules + thresholds
```

### 11.3 Critical Path Within Phase 2

Sub-agent files should be created in this order:

```
FIRST: Registry
  1. README.md                    ← agent registry (prevents "what's available?" confusion)

SECOND: Core workflow agents (needed for most tasks)
  2. research.md                  ← first wave of nearly every task
  3. architect.md                 ← design before implementation
  4. frontend.md                  ← CMD-1 implementer
  5. backend.md                   ← CMD-2 implementer
  6. python.md                    ← CMD-3 implementer
  7. database.md                  ← CMD-4 (sequential, needed early)
  8. test-qa.md                   ← mandatory final wave
  9. reviewer.md                  ← mandatory pre-merge gate

THIRD: Domain specialist agents
  10. security.md                 ← general hardening (medium+ risk tasks)
  11. infrastructure.md           ← CMD-5 (less frequent, needed for infra tasks)
  12. docs-release.md             ← end-of-cycle documentation

FOURTH: Debugging agents (high value, needed for bug routing)
  13. debugger.md                 ← CMD-7 3-phase bug fix
  14. error-detective.md          ← production log analysis

FIFTH: Security review stack (pre-merge gate)
  15. security-review.md          ← coordinator (depends on 16-18 existing)
  16. security-trpc.md            ← tRPC auditor
  17. security-fastapi.md         ← FastAPI auditor
  18. security-frontend.md        ← Frontend auditor

LAST: Contract schemas
  19. contracts/task-packet.schema.md
  20. contracts/result-report.schema.md
```

### 11.4 Acceptance Criteria Per Phase

**Phase 1 complete when:**
- `/orchestra "add a button that shows user email"` classifies as `trivial` and handles directly
- `/orchestra "add CSV export for audit logs"` classifies as `medium`, creates wave plan with contracts, and dispatches 2+ agents
- All reference files exist and SKILL.md references them correctly

**Phase 2 complete when:**
- A medium task dispatches 2 parallel agents (frontend + backend) with correct Task Packet format
- Sub-agent output matches Output Contract from the agent's template
- Reviewer agent returns Review Report in the defined format

**Phase 3 complete when:**
- `/orchestra "build a new RAG pipeline" → /deep-plan-codex → /deep-implement` handoff produces correct spec input
- After `/deep-implement` returns, `/orchestra resume` syncs artifacts correctly (progress.md reflects implementation-progress.md)

**Phase 4 complete when:**
- CHC at RED state writes valid `snapshot.md`
- Context compacted during mid-wave → `/orchestra resume` restores exact state including in-progress wave
- Lock file prevents double-session: two terminals, same directory, second /orchestra detects lock

---

## 12. Success Criteria

### 12.1 Functional Criteria

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Task routing accuracy | N/A (manual) | >90% correct route on first try | User override rate |
| Sub-agent first-pass success | ~60% (vague prompts) | >85% (Task Packet format) | Re-dispatch rate |
| Context recovery after compaction | 0% (start over) | >95% (snapshot resume) | Manual test: compact + resume |
| Parallel wave efficiency | N/A (sequential) | 2-3x speedup for multi-domain tasks | Wall-clock time comparison |
| Deep-* integration seamless | Manual handoff | Automated artifact sync | User satisfaction |
| File conflicts between agents | Unknown | <5% of waves have conflicts | Conflict resolution count |

### 12.2 Performance Criteria (from Section 9.4)

| Metric | Target | Tracking |
|--------|--------|----------|
| Agent efficiency | < 15 tool calls per sub-agent | `orchestra/progress.md` per-wave stats |
| Parallel utilization | > 50% agents in parallel (at least 1 wave) | Wave plan structure |
| First-pass accuracy | > 80% (no re-dispatch needed) | Re-dispatch count per session |
| Regression rate | < 5% of waves | Test gate failures |
| Context survival | > 95% of sessions resume successfully | Snapshot availability at red state |

### 12.3 Acceptance Tests

1. **Route a trivial task** — Orchestra handles directly without spawning agents
2. **Route a medium task** — Parallel agents run with contracts, no file conflicts
3. **Route a large task** — Handoff to `/deep-plan-codex` with correct input + shared decision-mode
4. **Compact mid-session** — Run `/orchestra resume`, state fully restored from snapshot
5. **Domain context used** — Sub-agent's output references SmartSpecPro-specific facts (not generic code)

---

## 13. Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Sub-agent prompt templates too generic | High | Medium | Iterative refinement based on real task results |
| orchestra/ artifact overhead slows simple tasks | Medium | Medium | Skip artifacts for `trivial` and `small` scope |
| Context compaction loses snapshot before write | High | Low | Write snapshot proactively at yellow state, not just red |
| Parallel agents create merge conflicts | Medium | Medium | Contract-driven ownership + max 2 simultaneous editors |
| Deep-* skill changes break integration | Medium | Low | Integration tests; version-pin expected artifact names |
| Task Packet format too rigid | Medium | Medium | Keep format as guidelines not strict schema; iterate |

---

## 14. Open Questions

1. **Orchestra as slash command or CLAUDE.md directive?** — Slash command gives explicit invocation but adds ceremony. CLAUDE.md directive makes it automatic but harder to control. Current decision: slash command `/orchestra` with option to add CLAUDE.md auto-trigger later.

2. **Sub-agent model selection** — Should orchestra specify `model: opus` vs `model: sonnet` per agent role? Opus is better for architecture/security, sonnet is faster for implementation. Current decision: let orchestra decide based on task complexity.

3. **Artifact directory location** — `orchestra/` in project root vs `planning/orchestra/` vs `.orchestra/`. Current decision: `orchestra/` at project root for visibility, with `.gitignore` entry for snapshots that contain session-specific state.

4. **Maximum parallel agents** — Claude Code allows multiple Task calls but quality degrades with too many. Current decision: cap at 4 parallel, with 2 max for file-editing agents.

5. **Auto-trigger for deep-* skills** — Can orchestra invoke `/deep-plan-codex` programmatically or must user run it manually? Current decision: manual invocation with orchestra providing the exact command.

---

## 15. CLAUDE.md Update Plan

After the orchestra + sub-agents skill pack is implemented and validated, `CLAUDE.md` must be updated to reflect the new unified entry point. These changes ensure the Debugging Protocol, Orchestration Protocol, and Agent Type Selection Matrix all point to `/orchestra`.

### 15.1 Changes Required in CLAUDE.md

#### Section: "AI Orchestra Agents — MANDATORY Orchestration Protocol"

**Rule 1 — Mandatory Agent Dispatch table:** Add a row for `/orchestra` as the entry point for complex multi-domain tasks:

| Task Type | Mandatory? | Required Agents |
|---|---|---|
| **Complex multi-domain task (2+ domains)** | **ALWAYS** | `/orchestra` — then orchestra routes to appropriate agents |
| ... (existing rows) | ... | ... |

**Rule 5 — Agent Type Selection Matrix:** Add `/orchestra` as the preferred route before CMD-specific agents:

```
| **Multi-domain feature / orchestration** | `/orchestra` skill | Route through orchestra for contract-based parallelism |
```

**Rule 6 — Orchestration Patterns:** Add Pattern E (Orchestra-First):

```
Pattern E: Orchestra-First (user says "add feature" / complex work)
  Step 1: Run /orchestra <description>
  Step 2: Orchestra classifies scope and routes automatically
  Step 3: Follow orchestra's dispatch decisions (contracts + waves)
  Step 4: Orchestra returns with integrated result + quality gate results
```

#### Section: "Domain Commanders Reference"

Update CMD table to reference the new skill files:

| ID | Skill File | Domain File |
|----|-----------|-------------|
| CMD-1 | `skills/sub-agents/agents/frontend.md` | `planning/ai-orchestra/domains/cmd1-frontend.md` |
| CMD-2 | `skills/sub-agents/agents/backend.md` | `planning/ai-orchestra/domains/cmd2-backend.md` |
| CMD-3 | `skills/sub-agents/agents/python.md` | `planning/ai-orchestra/domains/cmd3-python.md` |
| CMD-4 | `skills/sub-agents/agents/database.md` | `planning/ai-orchestra/domains/cmd4-database.md` |
| CMD-5 | `skills/sub-agents/agents/infrastructure.md` | `planning/ai-orchestra/domains/cmd5-infrastructure.md` |
| CMD-6 | `skills/sub-agents/agents/security.md` | (inline in CLAUDE.md) |
| CMD-7 | `skills/sub-agents/agents/reviewer.md` + debugger | (inline in CLAUDE.md) |
| CMD-8 | `skills/sub-agents/agents/test-qa.md` | (inline in CLAUDE.md) |

### 15.2 New Section to Add to CLAUDE.md

Add after the "AI Orchestra Agents" section:

```markdown
## Skill Pack — Quick Reference

| Task Size | Entry Point | When to Use |
|-----------|------------|-------------|
| Trivial (1 file, clear fix) | Handle directly | Single file, obvious fix |
| Small (1-3 files, 1 domain) | Task tool directly | Clear scope, no parallelism needed |
| Medium (3-10 files, 1-2 domains) | `/orchestra` | Contract-based parallelism beneficial |
| Large (10+ files, feature spec exists) | `/orchestra` → routes to `/deep-plan-codex` | Complex feature, needs TDD plan |
| Project (new product/major feature) | `/orchestra` → routes to `/deep-project` | Unclear scope, needs decomposition |

Key skill commands:
- `/orchestra @description` — Unified entry point for all medium+ complexity work
- `/deep-project @requirements.md` — Decompose vague requirements into planning units
- `/deep-plan-codex @spec.md` — Create TDD implementation plan
- `/deep-implement @sections/` — Section-by-section implementation with git commits
```

### 15.3 What NOT to Change

- The existing Debugging Protocol — unchanged; orchestra respects it
- Database Safety Protocol — unchanged; database agent enforces it
- Service Management rules — unchanged; infrastructure agent enforces them
- The `subagent_type` matrix in Rule 5 — kept as-is; orchestra wraps it, does not replace it

### 15.4 When to Apply These Changes

Apply CLAUDE.md updates only AFTER:
1. Phase 1 (Orchestra Skill Core) is complete and tested
2. At least 3 real tasks have been processed through `/orchestra` successfully
3. The sub-agent type mapping in Section 4.6 has been validated against actual results

---

## 16. Cross-Platform Compatibility

### 16.1 Platform Detection Protocol

On first `/orchestra` invocation, check `orchestra/platform.md`. If missing, ask user once:

```text
════════════════════════════════════════
ORCHESTRA: Platform Setup (first run)
════════════════════════════════════════
Which AI coding tool are you using?

  1) claude-code  — Claude Code CLI
                    Full Task tool + specialized subagent_types
                    Best performance, true parallel agents

  2) codex        — Codex / Claude web interface
                    Task tool available, general-purpose mode only
                    Full templates injected into prompts

  3) open-code    — OpenCode or other AI coding tool
                    No Task tool — sequential inline execution
                    Compatible but agents run one at a time

Enter 1, 2, or 3:
════════════════════════════════════════
```

Write answer to `orchestra/platform.md`. Never ask again unless user explicitly resets.

### 16.2 Claude Code Mode (Full)

**Available:** Task tool + all `subagent_type` values

**Dispatch:** Use specific subagent_types from the mapping table in Section 4.6

**Parallelism:** Full parallel waves (single message, multiple Task calls)

**Security review:** Full 3-way parallel (security-trpc + security-fastapi + security-frontend in one message)

```
# Dispatch example — Wave with 3 parallel agents
[Single message]
  Task(subagent_type="error-debugging:debugger", prompt=debugger_packet)
  Task(subagent_type="python-development:fastapi-pro", prompt=python_packet)
  Task(subagent_type="backend-api-security:backend-security-coder", prompt=security_packet)
```

### 16.3 Codex Mode (Template Injection)

**Available:** Task tool + `general-purpose` only (no specialized subagent_types)

**Dispatch:** Prepend full agent template content to every Task Packet:

```
# Template injection pattern
agent_template = read_file("skills/sub-agents/agents/debugger.md")
task_prompt = f"""You are the Debugger Agent for SmartSpecPro.

{agent_template}

---

## Task Packet (Current Task)

{task_packet_content}
"""
Task(subagent_type="general-purpose", prompt=task_prompt)
```

**Parallelism:** Parallel waves still work — multiple `general-purpose` Tasks in one message

**Security review:** 3 parallel Tasks, each with their respective audit template injected

**Limitation:** Without specialized subagent_type, the AI does not have the extra system-level specialization. Template injection compensates by encoding the same expertise in the prompt.

### 16.4 OpenCode Mode (Sequential Inline)

**Available:** No Task tool — Claude/AI runs everything inline

**Dispatch:** Sequential role switching. Orchestra reads agent template, adopts role, executes, then switches:

```
Step 1: Read skills/sub-agents/agents/research.md
        Adopt Research Agent role
        Execute research task
        Output: Research Brief

Step 2: Read skills/sub-agents/agents/backend.md
        Adopt Backend Agent role
        Execute implementation task
        Output: Modified files

Step 3: Read skills/sub-agents/agents/test-qa.md
        Adopt Test/QA Agent role
        Run tests, verify results
        Output: Test report
```

**Parallelism:** None — all waves are sequential. Orchestra adjusts wave plan to linear execution order.

**Security review:** Sequential — run tRPC auditor, then FastAPI auditor, then frontend auditor, then aggregate.

**Performance impact:** ~3x slower for multi-agent tasks. Consider using Claude Code for large projects.

### 16.5 Template-as-Specialization Principle

**Core insight:** The `subagent_type` in Claude Code is just a routing mechanism that loads a specialized system prompt. Our agent templates *encode the same expertise* in markdown. Therefore:

```
Claude Code:    Task(subagent_type="error-debugging:debugger", prompt=packet)
                → System loads debugger specialization + our packet

Codex:          Task(subagent_type="general-purpose", prompt=debugger_template + packet)
                → Our template provides the debugger specialization

OpenCode:       Inline: adopt debugger role (from template) + execute packet
                → Template provides specialization, inline execution
```

All three produce equivalent quality outputs. The template IS the specialization — platform determines invocation, not capability.

### 16.6 Platform Compatibility Matrix

| Feature | Claude Code | Codex | OpenCode |
|---------|-------------|-------|---------|
| Parallel agent dispatch | ✅ Full | ✅ Full | ❌ Sequential |
| Specialized subagent_type | ✅ Yes | ❌ Template only | ❌ Template only |
| Security review (3-way) | ✅ Parallel | ✅ Parallel | ⚠️ Sequential |
| File-based artifacts (orchestra/) | ✅ | ✅ | ✅ |
| CHC / snapshot / resume | ✅ | ✅ | ✅ |
| Wave-based planning | ✅ Full | ✅ Full | ⚠️ Sequential waves |
| Deep-* skill handoff | ✅ | ✅ | ✅ |
| Bug routing decision tree | ✅ | ✅ | ✅ (sequential) |

**All platforms support:** agent templates, orchestra/ artifacts, decision mode, compaction safety, deep-* integration

**Claude Code advantage:** True parallel execution + specialized subagent capabilities

---

## 17. Re-Evaluation: Coherence Analysis

This section assesses the complete agent system for gaps, overlaps, and dispatch efficiency.

### 17.1 Agent Coverage Matrix

| Domain | Coverage Agent(s) | Gap? |
|--------|-------------------|------|
| Frontend implementation | Frontend (5.4) | ✅ Complete |
| Backend (tRPC/Express) | Backend (5.5) | ✅ Complete |
| Python (FastAPI/Celery) | Python (5.6) | ✅ Complete |
| Database (schema/migration) | Database (5.7) | ✅ Complete |
| Testing & regression | Test/QA (5.8) | ✅ Complete |
| Code review | Reviewer (5.9) | ✅ Complete |
| General security hardening | Security (5.10) | ✅ Complete |
| Infrastructure (Docker/Nginx) | Infrastructure (5.11) | ✅ Complete |
| Documentation & release | Docs/Release (5.12) | ✅ Complete |
| Code bug investigation | Debugger (5.13) | ✅ **NEW** |
| Production log analysis | Error Detective (5.14) | ✅ **NEW** |
| Pre-merge security gate | Security Review Coordinator (5.15) | ✅ **NEW** |
| tRPC endpoint security audit | tRPC Auditor (5.16) | ✅ **NEW** |
| FastAPI security audit | FastAPI Auditor (5.17) | ✅ **NEW** |
| Frontend security audit | Frontend Auditor (5.18) | ✅ **NEW** |
| Research / discovery | Research (5.2) | ✅ Complete |
| Architecture design | Architect (5.3) | ✅ Complete |

**No critical gaps identified** after this addition.

### 17.2 Overlap Analysis

| Potential Overlap | Resolution |
|-------------------|------------|
| Security (5.10) vs Security Review Coordinator (5.15) | **Distinct roles:** Security (5.10) = ongoing hardening during implementation. Security Review (5.15) = pre-merge gate that runs all 3 auditors. No overlap — they run at different points. |
| Debugger (5.13) vs Error Detective (5.14) | **Distinct triggers:** Debugger = "I have a code bug, fix it (3-phase)." Error Detective = "Something is broken in production, investigate logs." Error Detective MAY route to Debugger after finding root cause. |
| Security-tRPC/FastAPI/Frontend vs Security (5.10) | **Distinct scope:** Security (5.10) = broad hardening across any changed code. Auditors (5.16-5.18) = focused pre-merge checks on specific endpoint types in parallel. Auditors provide deeper checks than general Security. |
| Python agent (5.6) vs FastAPI Auditor (5.17) | **Distinct purpose:** Python (5.6) = implementation (write code). FastAPI Auditor (5.17) = read-only security audit (find vulnerabilities). Different modes, different triggers. |

### 17.3 Orchestra Dispatch Efficiency

**Agents that can ALWAYS parallelize** (no shared files by design):
- Research + any implementation agent (research is read-only)
- Frontend + Backend (different file trees: `client/` vs `server/`)
- Security-tRPC + Security-FastAPI + Security-Frontend (all read-only, different domains)
- Reviewer + Test/QA (reviewer reads, QA runs tests — different outputs)

**Agents that MUST be sequential** (hard constraints):
- Database agent — only 1 active at a time (schema changes sequential)
- Git operations — only 1 git agent (commits, PRs)
- Infrastructure agent — only 1 active (docker operations)
- Debugger fix → Test/QA (must test AFTER fix is applied)
- Security Review → Fixes → Re-audit (must fix BEFORE re-audit)

**Wave efficiency targets:**

| Wave Type | Recommended Agents | Parallel? |
|-----------|-------------------|-----------|
| Research wave | Research + Architect | ✅ Parallel |
| Feature wave | Frontend + Backend + Python (if applicable) | ✅ Parallel (with contracts) |
| DB + Backend skeleton | Database → then Backend | ❌ Sequential |
| Security gate | tRPC + FastAPI + Frontend auditors | ✅ Parallel (read-only) |
| Verification | Test/QA + Reviewer | ✅ Parallel |

### 17.4 Identified Gaps — Status After This Update

| Gap | Status | Resolution |
|-----|--------|------------|
| No debugger agent template | ✅ **Fixed** | Section 5.13 — 3-phase protocol with cmd7-debug.md |
| No production log analysis | ✅ **Fixed** | Section 5.14 — JSONL/traceId investigation |
| No pre-merge security gate | ✅ **Fixed** | Sections 5.15-5.18 + 4.8 gate + 4.6 trigger |
| No cross-platform support | ✅ **Fixed** | Section 16 — 3-mode dispatch (Claude Code/Codex/OpenCode) |
| No bug routing decision tree | ✅ **Fixed** | Section 4.4 bug classification sub-tree |
| No Error Detective template | ✅ **Fixed** | Section 5.14 with full audit log protocol |
| Test regression after bug fix not mandated | ✅ **Fixed** | Bug routing sub-tree includes mandatory Test/QA wave |
| Security re-audit after security fix not mandated | ✅ **Fixed** | 4.8 gate failure protocol: security fix → re-audit |

### 17.5 Revised Orchestra Dispatch Rules

Based on this analysis, update `references/sub-agent-dispatch.md` with these mandatory wave rules:

```
Bug fix tasks:
  [Research? if location unknown] → Debugger → Fix → Test/QA → [Reviewer if risk=medium+]

Security fix tasks:
  Security (or Security Review) → Fixes → Test/QA → Security Review re-audit

Feature tasks (medium scope):
  Research → Architect → [Contract] → Impl Wave (Frontend+Backend+Python) → Test/QA → Reviewer → [Security Review if risk=high]

Feature tasks (large scope):
  Orchestra handoff → /deep-plan-codex → /deep-implement → Security Review (pre-merge)

Database tasks:
  Database agent [sequential] → Backend/Python agent [next wave] → Test/QA

Pre-merge (any task):
  Security Review Coordinator → [Fix CRITICALs] → Test/QA
```

### 17.6 Recommended Wave Templates

Reusable wave patterns for common task types:

**Pattern BUG: Bug Fix**

```
Wave B0 (if location unknown): Research (Explore)
Wave B1: Debugger — investigate + fix
Wave B2 (parallel): Test/QA + Reviewer
Wave B3 (if security-adjacent): Security Review Coordinator
```

**Pattern SEC: Security Fix / Hardening**

```
Wave S1 (parallel): Security-tRPC + Security-FastAPI + Security-Frontend
Wave S2 (conditional): Security/Backend/Python/Frontend — fix CRITICALs + HIGHs
Wave S3 (parallel): Test/QA + Security Review re-audit (verify fixes)
```

**Pattern FEAT: New Feature**

```
Wave F1 (parallel): Research + Architect
Wave F2: [Contract definition] (by orchestra)
Wave F3 (parallel): Frontend + Backend (if no DB dependency)
  OR
Wave F3a: Database
Wave F3b (parallel): Backend + Python (after DB)
Wave F4 (parallel): Test/QA + Reviewer
Wave F5 (pre-merge): Security Review Coordinator
```

**Pattern PROD: Production Incident**

```
Wave P1: Error Detective — investigate logs, find root cause
Wave P2: Debugger — implement fix for identified root cause
Wave P3 (parallel): Test/QA + Security Review (if auth-related)
Wave P4: Docs/Release — update incident notes/runbook
```

### 17.7 Agent Count Summary

| Category | Count | Files |
|----------|-------|-------|
| Core workflow agents | 8 | research, architect, frontend, backend, python, database, test-qa, reviewer |
| Domain specialist agents | 3 | security (hardening), infrastructure, docs-release |
| Debugging agents (NEW) | 2 | debugger, error-detective |
| Security review agents (NEW) | 4 | security-review, security-trpc, security-fastapi, security-frontend |
| **Total sub-agents** | **17** | |
| Orchestra reference docs | 13 | SKILL.md + 12 references (incl. platform-compat, security-review-protocol) |
| Contract schemas | 2 | task-packet.schema.md, result-report.schema.md |
| **Total skill files** | **33** | |

The orchestra system now provides comprehensive coverage across all development lifecycle phases: planning → implementation → testing → security → release → incident response.

---

## Appendix A: Example Session

```
User: "Add a feature to let admins export audit logs as CSV"

/orchestra

Step 1 — Task Analysis:
  Scope: medium (5-8 files across backend + frontend)
  Risk: medium (touches audit data, needs auth check)
  Domains: [backend, frontend, security]
  Files: ~7 estimated
  Dependencies: backend API must exist before frontend can consume it

Step 2 — Routing Decision:
  Route: Multi Agent (medium scope)
  Decision mode: smart_auto (reused from previous session)

Step 3 — Contract & Wave Planning:
  Contract: backend ↔ frontend
    - GET /api/v1/admin/audit-logs/export?format=csv&from=DATE&to=DATE
    - Response: streaming CSV file
    - Auth: admin role required

  Wave 1: [Research] Explore current audit log system
  Wave 2: [Backend] Add export endpoint + [Database] Verify query performance
  Wave 3: [Frontend] Add export button + download handler
  Wave 4: [Security] Review endpoint auth + data exposure
  Wave 5: [Test/QA] Integration tests

Step 4 — Dispatch Wave 1:
  Task(subagent_type=Explore, prompt="Research Agent Task Packet...")

Step 5 — Integration: Research complete, no blockers found.

Step 4 — Dispatch Wave 2:
  Task(backend-architect, "Backend Task Packet...") +
  Task(Explore, "Database analysis Task Packet...")
  [parallel — different files, contract defined]

...continues through waves...

Step 8 — CHC: green (short session, simple task)

Done. 5 files modified, 2 tests added, 1 security review clean.
```

## Appendix B: Task Packet Full Example

```markdown
## Task Packet

### TASK
Add a tRPC endpoint `adminAuditExport` that streams audit logs as CSV
for a given date range. Must validate admin role and tenant isolation.

### DOMAIN
CMD-2 Backend

### FILES
Read:
- apps/web/server/routers/admin.ts (existing admin router)
- apps/web/server/services/auditService.ts (existing audit query logic)
- apps/web/shared/types/audit.ts (existing audit types)

Modify/Create:
- apps/web/server/routers/admin.ts (add export procedure)
- apps/web/server/services/auditExportService.ts (new — CSV streaming logic)

### CONTEXT
User requested admin audit log CSV export. Research agent confirmed audit logs
are stored in `provider_usage_log` table with per-tenant `tenantId` column.
Current admin router has 3 existing procedures, all using `adminMiddleware`.

### CONSTRAINTS
- Do NOT modify frontend files
- Do NOT modify database schema
- Use existing `adminMiddleware` for auth
- Must filter by `tenantId` from session (tenant isolation)
- CSV must stream (not buffer entire result in memory)
- Max export: 10,000 rows per request

### CONTRACT
See orchestra/contracts.md — "backend ↔ frontend" section:
- Endpoint: GET /api/v1/admin/audit-logs/export
- Query params: format=csv, from=ISO_DATE, to=ISO_DATE
- Response: Content-Type: text/csv, streaming body
- Error: 403 if not admin, 400 if invalid date range

### OUTPUT
- Modified `admin.ts` with new `auditExport` procedure
- New `auditExportService.ts` with CSV streaming logic
- Both files passing TypeScript type check

### QUALITY GATE
- `cd apps/web && pnpm check` passes
- Export returns valid CSV headers + rows for test query
- tenantId filter is applied (no cross-tenant data leak)
```

---

## Appendix C: Artifact Format Schemas

Every `orchestra/` file must conform to these exact schemas. Orchestra writes them; sub-agents and skills read them. Format consistency is required for the resume algorithm (Step R2) to parse reliably.

### C.1 `orchestra/plan.md`

```markdown
# Orchestra Plan

## Meta
- **Goal:** {1-2 sentence description of what we're building}
- **Scope:** trivial | small | medium | large | project
- **Risk:** low | medium | high | critical
- **Domains:** [frontend, backend, python, database, infra, security] (list only applicable)
- **Files (estimated):** {number}
- **Route:** Direct | Single Agent | Multi Agent | Deep Plan + Implement | Full Pipeline
- **Created:** {ISO 8601 timestamp}
- **Last Updated:** {ISO 8601 timestamp}

## Task Classification
{Copy the classification decision table row that matched, + reasoning}

## Wave Plan

### Wave 1 — {descriptive name} | Status: pending | in-progress | complete | blocked
- **Agents:** [list of agent roles]
- **Parallel:** yes | no
- **Files (target):** [list of files each agent will modify]
- **Dependencies:** none | "requires Wave N"

### Wave 2 — {descriptive name} | Status: pending
...

## Notes
{Any planning notes, open questions resolved during planning}
```

**Mandatory fields:** Meta (all), at least 1 wave with Status.
**Optional:** Notes section.

### C.2 `orchestra/progress.md`

```markdown
# Orchestra Progress

## Session
- **Session ID:** {uuid or timestamp}
- **Started:** {ISO 8601}
- **Context State:** green | yellow | red
- **Platform:** claude-code | codex | open-code
- **Decision Mode:** ask_every_choice | smart_auto | auto_by_default

## Wave History

### Wave 1 — {name} | Status: complete
- **Agents:** [list]
- **Parallel:** yes | no
- **Tool calls:** {agent_name}={N}, {agent_name}={N}
- **Result:** PASS | FAIL | PARTIAL
- **Gate results:** TypeScript check=PASS, pytest=PASS, security=N/A
- **Re-dispatch count:** {N}
- **Files modified:** [list]
- **Base commit:** {git hash}
- **End commit:** {git hash or "uncommitted"}

## Current Wave

### Wave {N} — {name} | Status: in-progress
- **Started:** {ISO 8601}
- **Agents dispatched:** [list]
- **Agents complete:** [list]
- **Agents pending:** [list]
- **Baseline (git status):** {output of git status --short}

## Session Stats (end of session)
- Total waves: {N}
- Parallel waves: {N}
- Total re-dispatches: {N}
- Gate failures: {N}
- Security findings: CRITICAL={N}, HIGH={N}, MEDIUM={N}, LOW={N}
```

### C.3 `orchestra/backlog.md`

```markdown
# Orchestra Backlog

Items are ordered by priority (top = highest). Orchestra works through this list when resuming.

## [READY] {Task title}
- **Priority:** 1 | 2 | 3 (1 = highest)
- **Added:** {ISO 8601}
- **Source:** {Wave N / Agent name / User request}
- **Reason:** {why deferred — not blocked, just queued}
- **Files:** [files to read/modify]
- **Blocked by:** none
- **Estimated scope:** trivial | small | medium

## [BLOCKED] {Task title}
- **Priority:** {N}
- **Added:** {ISO 8601}
- **Source:** {Wave N — Agent X failed}
- **Reason:** {exact error after 3 attempts}
- **Files:** [files involved]
- **Blocked by:** {what needs to be resolved — user input / external dependency / other task}
- **Attempts:** 3 (exhausted)
- **Last error:** {error text}
```

**Statuses:** `READY` (can be picked up), `BLOCKED` (needs external resolution), `DONE` (move to completed section at bottom).

### C.4 `orchestra/decisions.md`

```markdown
# Orchestra Decisions

Decision log using ADR-lite format. Append only — never delete entries.

---

## ADR-001: {Decision title}
- **Date:** {ISO 8601}
- **Status:** decided | superseded | revisited
- **Supersedes:** ADR-{N} (if applicable)
- **Context:** {Why we had to decide this — what problem/trade-off arose}
- **Decision:** {What we decided in one sentence}
- **Rationale:** {Why this option vs alternatives}
- **Alternatives considered:** {Other options and why rejected}
- **Consequences:** {What changes, what risks are accepted}
- **Auto-approved:** yes | no (if yes: "smart_auto: chose simpler option")

---

## ADR-002: {Decision title}
...
```

### C.5 `orchestra/contracts.md`

```markdown
# Orchestra Contracts

Contracts freeze after Wave 1 dispatch. No changes after that unless both agents re-agree.

---

## Contract: {AgentA} ↔ {AgentB}
- **Status:** draft | active | frozen | closed
- **Created:** Wave {N}
- **Frozen:** Wave {N} (or "not frozen")

### Shared Interface
[API endpoints, data schemas, function signatures, file formats]
Example:
- POST /api/v1/resource
- Request: { name: string, type: "a" | "b" }
- Response: { id: string, created: string }

### Ownership
- **{AgentA} owns:** [list of files/modules]
- **{AgentB} owns:** [list of files/modules]
- **Shared:** [any shared utilities or types]

### Test Boundary
- **{AgentA} tests:** [what it must verify]
- **{AgentB} tests:** [what it must verify]
- **Integration tested by:** {Test/QA agent in Wave N}

---

## Contract: {AgentC} ↔ {AgentD}
...
```

### C.6 `orchestra/risk_register.md`

```markdown
# Risk Register

## Security Findings

| Date | Source | Severity | File:Line | Issue | Status | Fixed in |
|------|--------|----------|-----------|-------|--------|----------|
| {date} | Security Review Gate | CRITICAL | server/routers/admin.ts:42 | Missing tenantId filter | open | — |
| {date} | Security Review Gate | HIGH | client/src/Login.tsx:88 | Token in localStorage | fixed | Wave 4 |
| {date} | Security Agent | MEDIUM | python-backend/app/api/v1/rag.py:15 | No rate limit | accepted | — |

## Accepted Risks

| Date | Risk | Severity | Accepted by | Reason | Review date |
|------|------|----------|------------|--------|-------------|
| {date} | CORS wildcard in dev mode | MEDIUM | user (smart_auto) | Dev environment only, not production | {30 days} |

## Architecture Risks

| Risk | Impact | Likelihood | Mitigation | Status |
|------|--------|------------|------------|--------|
{from Section 13 Risk Assessment — copy + update as project evolves}
```

### C.7 `orchestra/research.md`

```markdown
# Research Notes

Append-only. Multiple research agents write here. Orchestra reads for context when planning waves.

---

## Research: {Topic} — {date}
**Source:** Research agent / Wave {N} / Sub-task

### Key Findings
- [Finding 1 with file:line reference]
- [Finding 2 with file:line reference]

### Current Architecture
{How the relevant system currently works — code structure, patterns used}

### Risks Identified
- {Risk 1}: {description + severity}

### Options
| Option | Pros | Cons | Effort |
|--------|------|------|--------|
| A: ... | ... | ... | ... |

### Recommendation
{Option X because Y}

### Open Questions
- {Question that still needs resolution}

---
```

---

## Appendix D: SKILL.md Bootstrap Template

This is the exact content for `skills/orchestra/SKILL.md`. This file is the entry point that Claude Code reads when user runs `/orchestra`.

```markdown
---
name: orchestra
description: >
  AI Orchestra Conductor: analyzes tasks, dispatches specialized sub-agents,
  integrates results, and manages file-based memory to survive context compaction.
  Coordinates with /deep-project, /deep-plan-codex, and /deep-implement.

  Usage:
    /orchestra <task description>    — Analyze and route a new task
    /orchestra resume               — Resume from last snapshot
    /orchestra snapshot             — Force immediate snapshot (context safety)
    /orchestra status               — Print current orchestra/ state
    /orchestra reset                — Archive current session, start fresh
license: MIT
compatibility: Claude Code with Task tool support; git repository recommended
version: 1.0.0
---

# Orchestra Conductor

## Quick Reference

| Command | Effect |
|---------|--------|
| `/orchestra <task>` | Analyze scope, route, dispatch sub-agents, integrate results |
| `/orchestra resume` | Resume from `orchestra/snapshot.md` (after compaction or break) |
| `/orchestra snapshot` | Write snapshot now (use before long breaks or risky operations) |
| `/orchestra status` | Print current state without taking any action |
| `/orchestra reset` | Archive `orchestra/` to `orchestra/archive/<timestamp>/`, start fresh |

---

## Instructions

You are the **Orchestra Conductor** for the SmartSpecPro AI development platform. Your mission is to coordinate specialized sub-agents to complete development tasks efficiently, in parallel where possible, with full context preservation across sessions.

### Your Role

1. **Analyze** incoming tasks — classify scope, risk, domains, file count
2. **Route** — direct handling, sub-agent dispatch, or deep-* pipeline invocation
3. **Contract** — define interfaces between parallel agents before dispatch
4. **Dispatch** — send Task Packets to sub-agents via the Task tool (parallel where safe)
5. **Integrate** — merge results, resolve conflicts, verify contract compliance
6. **Gate** — run quality gates (tests, lint, type-check, security review)
7. **Persist** — maintain `orchestra/` artifacts at all times
8. **Protect** — run Context Health Checks, write snapshots before context compacts

### Platform

Read `orchestra/platform.md` before dispatching. If missing, run platform detection (Section 4.6). Your dispatch strategy depends on it:
- `claude-code` → full subagent_type + parallel Task tool calls
- `codex` → general-purpose + template injection + parallel Task tool calls
- `open-code` → sequential inline execution (no Task tool)

### Autonomous Operation (Section 4.11)

**Run without asking.** Only stop for:
- CRITICAL security gate failure
- Schema DROP operation
- Scope escalation beyond classification
- 3-attempt limit exhausted

For everything else: decide, log in `decisions.md`, proceed.

### Reference Files

All detailed protocols are in `skills/orchestra/references/`. Read the relevant file before each step:

| Step | Read This File |
|------|----------------|
| Step 1: Classify | `task-analysis.md` |
| Step 2: Route | `routing-decision.md` |
| Step 3: Contracts + Waves | `wave-planning.md` |
| Step 4: Dispatch | `sub-agent-dispatch.md` |
| Step 5: Integrate | `result-integration.md` |
| Step 6: Gates | `quality-gates.md` |
| Step 7: Artifacts | `artifact-management.md` |
| Step 8: CHC | `compaction-safety.md` |
| Resume | `session-resume.md` |
| Platform | `platform-compat.md` |
| Pre-merge | `security-review-protocol.md` |

### Sub-Agent Library

Agent templates are in `skills/sub-agents/agents/`. Inject the relevant template into every Task Packet (required in Codex/OpenCode mode; optional but recommended in Claude Code mode for context).

| Role | File | subagent_type (Claude Code) |
|------|------|-----------------------------|
| Research | `agents/research.md` | `Explore` |
| Architect | `agents/architect.md` | `Plan` |
| Frontend | `agents/frontend.md` | `general-purpose` |
| Backend | `agents/backend.md` | `backend-api-security:backend-architect` |
| Python | `agents/python.md` | `python-development:fastapi-pro` |
| Database | `agents/database.md` | `general-purpose` |
| Test/QA | `agents/test-qa.md` | `general-purpose` |
| Reviewer | `agents/reviewer.md` | `Explore` |
| Security | `agents/security.md` | `backend-api-security:backend-security-coder` |
| Debugger | `agents/debugger.md` | `error-debugging:debugger` |
| Error Detective | `agents/error-detective.md` | `error-debugging:error-detective` |
| Security Review | `agents/security-review.md` | (coordinator) |
| tRPC Auditor | `agents/security-trpc.md` | `backend-api-security:backend-security-coder` |
| FastAPI Auditor | `agents/security-fastapi.md` | `backend-api-security:backend-security-coder` |
| Frontend Auditor | `agents/security-frontend.md` | `Explore` |
| Infrastructure | `agents/infrastructure.md` | `general-purpose` |
| Docs/Release | `agents/docs-release.md` | `general-purpose` |

---

## Workflow

Execute these 8 steps in order. Steps auto-proceed unless a STOP condition is met.

### Step 0: Banner + State

Print banner (see Section 4.2 in spec). Check `orchestra/` for existing state:
- `orchestra/snapshot.md` exists → offer resume (or start fresh with archive)
- `orchestra/.lock` exists → check age → handle concurrent session (Section 10.5)
- Nothing exists → create `orchestra/`, write `.lock`, continue

### Step 1: Task Analysis

Read `references/task-analysis.md`.
Classify: scope / risk / domains / estimated files.
Output: classification table written to `orchestra/plan.md` (Appendix C, schema C.1).

### Step 2: Routing Decision

Read `references/routing-decision.md`.
Apply scope → route table. If task = bug/error, apply Bug Classification Sub-Tree first (Section 4.4).

### Step 3: Contract & Wave Planning

Read `references/wave-planning.md`.
(Skip for trivial/small scope.)
Define contracts → write `orchestra/contracts.md` (schema C.5).
Plan waves → write wave plan to `orchestra/plan.md`.
Record git baseline: `git status --short` + `git rev-parse HEAD`.

### Step 4: Dispatch

Read `references/sub-agent-dispatch.md`.
Create Task Packets (format: Section 4.6). Send all agents in a wave in a SINGLE message.
Check pre-merge trigger conditions → add Security Review if triggered.

### Step 5: Result Integration

Read `references/result-integration.md`.
After each wave: check for file conflicts → verify contract compliance → update `orchestra/progress.md`.

### Step 6: Quality Gates

Read `references/quality-gates.md`.
Run gates based on risk level. Gate failure → retry (max 3, agent-level) → blocked → report.

### Step 7: Progress Update

Update `orchestra/plan.md` (wave status) + `orchestra/progress.md` (per-wave stats).
Update `orchestra/backlog.md` with any deferred items.
Log decisions in `orchestra/decisions.md`.

### Step 8: Context Health Check

Read `references/compaction-safety.md`.
Evaluate context state: green / yellow / red.
If red → write `orchestra/snapshot.md` (format: Section 7.2) + `orchestra/progress.md` + `orchestra/backlog.md`.
Delete `.lock` when session ends normally.
```

---

**End of Spec**
