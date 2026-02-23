# Synthesized Specification — Orchestra & Sub-Agents Skill Pack

**Feature:** 000-AgentsSkill
**Date:** 2026-02-22
**Status:** Ready for implementation planning

---

## 1. What We Are Building

Two new Claude Code skills that form a complete orchestration layer for SmartSpecPro development:

### 1.1 `/orchestra` — AI Development Conductor

A skill that acts as the single entry point for any development task. It:
- Classifies incoming tasks by scope (trivial → project) and risk (low → critical)
- Routes tasks to the appropriate execution path (direct edit / sub-agent dispatch / deep-* pipeline)
- Designs wave-based parallel execution plans with explicit file-ownership contracts
- Dispatches specialized sub-agents using Task Packets with full context
- Collects and integrates results, detecting and resolving conflicts
- Runs quality gates (TypeScript check, lint, tests, security review) based on risk level
- Maintains file-based state in `orchestra/` directory to survive context compaction
- Detects platform (Claude Code / Codex / OpenCode) and adapts dispatch strategy

### 1.2 `sub-agents` — Prompt Library + Native Agent Definitions

A reference library of:
- **Prompt templates** (`skills/sub-agents/agents/*.md`) — role-specific identities, workflows, and output contracts
- **Native agent definitions** (`.claude/agents/*.md`) — YAML-configured Claude Code agents with model, tools, memory, and isolation settings
- **Contract schemas** (`skills/sub-agents/contracts/*.md`) — Task Packet and Result Report format specifications

### 1.3 What This Is NOT

- Not a runtime framework (not LangGraph/Autogen). Orchestra is a skill file (markdown) that Claude interprets.
- Not replacing deep-plan, deep-implement, or deep-project. Orchestra calls them as sub-pipelines for large/project scope work.
- Not required for every task. Simple single-file fixes can still be done without orchestra.

---

## 2. Deliverables

### 2.1 Orchestra Skill Files

```
deep_plan/skills/orchestra/
  SKILL.md                          # Main conductor workflow (8 steps)
  references/
    task-analysis.md                # Classification algorithm, scope/risk table
    task-packet-format.md           # Complete Task Packet spec with all sections
    routing-decision.md             # Decision tree: trivial/small/medium/large/project + bug sub-tree
    wave-planning.md                # Wave-based DAG planning, contract definition, parallelism rules
    sub-agent-dispatch.md           # Dispatch protocol, platform detection, Task tool usage
    result-integration.md           # Result collection, conflict detection, merge strategy
    quality-gates.md                # Gate definitions, blocking rules, retry protocol
    artifact-management.md          # orchestra/ directory layout, file lifecycle
    compaction-safety.md            # CHC protocol, snapshot/resume, context state classification
    skill-pack-integration.md       # How to invoke deep-project/plan-codex/implement as sub-pipelines
    session-resume.md               # R4 resume algorithm, snapshot parsing, context injection
    platform-compat.md              # Platform detection (Claude Code/Codex/OpenCode), dispatch adapters
    security-review-protocol.md     # Pre-merge gate: trigger rules, severity thresholds, PASS/FAIL/CONDITIONAL
```

### 2.2 Sub-Agents Library Files

```
deep_plan/skills/sub-agents/
  README.md                         # Registry overview, how to invoke each agent
  agents/
    research.md                     # Research Agent (Explore): codebase analysis, Research Brief format
    architect.md                    # Architect Agent (Plan): module design, API contracts, data flow
    frontend.md                     # Frontend Agent (general-purpose): React, Wouter, Radix UI, TanStack
    backend.md                      # Backend Agent (backend-architect): tRPC, Express, Drizzle, auth
    python.md                       # Python Agent (fastapi-pro): FastAPI, SQLAlchemy, Celery, LLM
    database.md                     # Database Agent: schema, migrations, backup protocol, row count verification
    test-qa.md                      # Test/QA Agent: Vitest/pytest, TDD stubs, regression suites
    reviewer.md                     # Reviewer Agent (Explore): code review, Review Report format
    security.md                     # Security Agent (backend-security-coder): OWASP, secrets, tenant isolation
    debugger.md                     # Debugger Agent (error-debugging:debugger): 3-phase debug protocol
    error-detective.md              # Error Detective (error-debugging:error-detective): audit log analysis
    security-review.md              # Security Review Coordinator: dispatches 3 specialists in parallel
    security-trpc.md                # tRPC Endpoint Auditor: routers, Zod, auth middleware, IDOR
    security-fastapi.md             # FastAPI Auditor: Python endpoints, deps, input validation
    security-frontend.md            # Frontend Auditor: XSS, auth bypass, data exposure, CSP
    infrastructure.md               # Infrastructure Agent (CMD-5): Docker, Nginx, systemd, deploy
    docs-release.md                 # Docs/Release Agent: changelog, migration notes, release checklist
  contracts/
    task-packet.schema.md           # Task Packet format: TASK/DOMAIN/FILES/CONTEXT/CONSTRAINTS/CONTRACT/OUTPUT/QUALITY GATE
    result-report.schema.md         # Result Report format: status/files_changed/findings/blockers/next_steps
```

### 2.3 Native Claude Code Agent Definitions

```
.claude/agents/
  (one .md file per agent above, with YAML frontmatter:
   name, description, tools, model, permissionMode, maxTurns, memory, background)
```

17 files total, project-scoped (checked into git at `/home/dev/projects/SmartSpecPro/.claude/agents/`).

---

## 3. Orchestra Workflow (8 Steps)

### Step 0: Banner + State Loading
Print banner. Check if `orchestra/snapshot.json` exists — if yes, offer resume or fresh start (archiving old orchestra/ to timestamped subdirectory). Create `orchestra/` directory if new.

### Step 1: Task Analysis
Classify task on 3 dimensions: **scope** (trivial/small/medium/large/project), **risk** (low/medium/high/critical), **domains** (frontend/backend/python/database/infra/security). Apply bug sub-tree first for error/bug reports. Write classification to `orchestra/plan.md`.

### Step 2: Routing Decision
Choose execution path based on scope:
- `trivial` → direct edit (no sub-agents)
- `small` → single sub-agent dispatch
- `medium` → multi-agent with contracts + waves
- `large` → invoke deep-plan-codex → deep-implement
- `project` → invoke deep-project → per-split pipeline

Ask user once for decision mode (ask_every_choice / smart_auto / auto_by_default) if not already stored in `orchestra/decision-mode.md`.

### Step 3: Contract & Wave Planning (medium+ only)
Define interface contracts between parallel agents. Group tasks into dependency waves. Write contracts to `orchestra/contracts.md` and wave plan to `orchestra/plan.md`. Enforce parallelism rules (max 4 concurrent, max 2 file-editing, 1 DB agent, 1 git agent).

### Step 4: Dispatch
Detect platform from `orchestra/platform.md` (ask once if missing). Build Task Packets. Dispatch all agents in a wave as a single message (parallel execution). Platform-adaptive: Claude Code uses specific subagent_type; Codex injects full template into general-purpose; OpenCode executes sequentially inline.

### Step 5: Result Integration
After each wave: read agent outputs, check file conflicts (merge or re-dispatch), verify contract compliance, update `orchestra/progress.md`.

### Step 6: Quality Gates
Run gates based on risk level. LOW/MEDIUM → warnings only. HIGH/CRITICAL → all gates blocking. Retry failed gates up to 3 times, then pause and ask user. Pre-merge security gate triggered by security-sensitive changes.

### Step 7: Progress Update
Update `orchestra/plan.md`, `orchestra/progress.md`, `orchestra/backlog.md`, `orchestra/decisions.md`, `orchestra/contracts.md` after each wave.

### Step 8: Context Health Check (CHC)
After each wave and before high/critical work: classify context state (green/yellow/red). On red: write snapshot (`orchestra/snapshot.json` + `orchestra/snapshot.md`) before continuing. No user pause required for CHC — it's automatic.

---

## 4. Autonomous Operation Policy

**Default: autonomous** — proceed without asking.

**Mandatory pause (STOP conditions):**
1. Security gate FAIL (CRITICAL finding) — blocked, cannot proceed
2. Schema DROP operation — requires backup + explicit approval
3. Scope escalation beyond original classification — confirm with user
4. 3-attempt limit hit on same error — need user guidance
5. Force push to remote branch — confirm
6. Production deploy / infra changes (terraform, service restarts, feature flags) — confirm
7. HIGH/CRITICAL risk task at start — confirm scope and approach
8. Unresolvable conflict between parallel agent results — need human judgment

**Ask once, then auto-proceed:**
- Decision mode (stored in `orchestra/decision-mode.md`)
- Platform detection (stored in `orchestra/platform.md`)
- Security gate CONDITIONAL (HIGH findings, no CRITICAL) — ask once; auto-approve in `auto_by_default` mode

**Everything else:** auto-proceed, log to `orchestra/decisions.md`.

---

## 5. Quality Gate Specification

| Gate | Triggered When | Blocking? |
|------|----------------|-----------|
| TypeScript check (`pnpm check`) | TS files changed | Always warns; blocking for HIGH+ |
| Python lint (`ruff check`) | .py files changed | Always warns; blocking for HIGH+ |
| Unit tests | medium risk+ | Blocking for HIGH+ |
| Security review (general) | HIGH risk domains | Blocking for CRITICAL |
| Full test suite | critical risk | Always blocking |
| Pre-merge security gate | Security-sensitive changes (see list below) | CRITICAL findings = blocking; HIGH = conditional |

**Pre-merge security gate triggers (any one is sufficient):**
- Auth/JWT/session code changes
- New tRPC routers or FastAPI routes
- HIGH/CRITICAL risk classification
- Encryption/secret handling changes (`crypto.ts`, `smartspecweb_crypto.py`, `LLM_ENCRYPTION_KEY`)
- RBAC/permissions/ACL/IAM/middleware authz changes
- CORS/CSP/security headers/cookie settings (SameSite, Secure, HttpOnly)
- File upload/download/deserialization/template rendering code
- Security-relevant dependency upgrades (auth libs, crypto libs, web frameworks)
- Infrastructure config changes (Dockerfile, k8s, terraform, CI secrets, env vars)

**Pre-merge gate verdict:**
- 0 CRITICAL + 0 HIGH → PASS
- 0 CRITICAL + N HIGH → CONDITIONAL PASS (user approval required)
- N CRITICAL → FAIL (blocked, cannot merge)

---

## 6. Artifact Management

### 6.1 `orchestra/` Directory

Created in the project working directory when `/orchestra` is first invoked. Git-tracked.

| File | Purpose | Updated When |
|------|---------|--------------|
| `plan.md` | Current plan with wave status | After routing (step 2) and each wave |
| `progress.md` | Per-wave status: done/in-progress/blocked/next | After each wave |
| `backlog.md` | Remaining work items, prioritized | After each wave |
| `decisions.md` | All auto-approved and user-approved decisions (ADR-lite) | Every decision point |
| `contracts.md` | Interface contracts between parallel agents | After wave planning (step 3) |
| `platform.md` | Detected platform (claude-code/codex/open-code) | Once, first invocation |
| `decision-mode.md` | User's choice of autonomy level | Once, first invocation |
| `risk_register.md` | Logged MEDIUM/LOW security findings | When security gate runs |
| `snapshot.json` | Structured checkpoint (JSON) | When CHC state = red |
| `snapshot.md` | Human-readable checkpoint summary | When CHC state = red |
| `archive/` | Old orchestra/ state from previous sessions | When user chooses "fresh start" |

### 6.2 Snapshot Structure

```json
{
  "checkpoint": {
    "timestamp": "ISO-8601",
    "task_description": "...",
    "phase": "wave-N-integration",
    "completed_waves": [...],
    "in_progress": {...},
    "pending_waves": [...],
    "decisions": [...],
    "blockers": [],
    "key_files": ["/absolute/paths/only"]
  }
}
```

Human summary in `snapshot.md` covers: task description, completed/remaining work, open decisions, blockers, and how to resume.

---

## 7. Platform Compatibility

| Mode | Dispatch | Parallel? | subagent_type |
|------|----------|-----------|---------------|
| `claude-code` | Task tool with specific subagent_type | Yes | Full mapping (17 agents) |
| `codex` | Task tool with general-purpose + full template injected in prompt | Yes | general-purpose only |
| `open-code` | Inline sequential execution (Claude adopts each role in turn) | No | N/A |

Platform is detected once, stored in `orchestra/platform.md`, never asked again.

---

## 8. Security Review Coordinator Architecture

When the pre-merge gate triggers, the `security-review.md` coordinator:
1. Identifies which files changed (by domain)
2. Dispatches 3 auditors **in parallel** (single message, 3 Task calls):
   - `security-trpc.md` → all changed tRPC routers
   - `security-fastapi.md` → all changed FastAPI endpoints
   - `security-frontend.md` → changed React components, hooks, routing
3. Waits for all 3 to complete
4. Aggregates findings, deduplicates, applies severity thresholds
5. Returns verdict: PASS / CONDITIONAL PASS / FAIL

Findings logged to `orchestra/risk_register.md` regardless of verdict.

---

## 9. Sub-Agent Prompt Library Structure

Each `agents/*.md` file follows this template:
- **Identity** — who this agent is, what it specializes in
- **Capabilities** — specific tools, patterns, knowledge
- **Constraints** — what it must NOT do (scope guardrails)
- **Input Contract** — what it expects in the Task Packet
- **Output Contract** — what it must produce (format, files, quality criteria)
- **Workflow** — step-by-step execution
- **Quality Checklist** — what to verify before reporting completion
- **Error Handling** — what to do when blocked, uncertain, or failing

Each `agents/*.md` also has a corresponding `.claude/agents/NAME.md` with YAML frontmatter for native Claude Code dispatch.

---

## 10. Native .claude/agents/ Definition Format

```yaml
---
name: backend-security-coder
description: >
  Audits tRPC routers and Express endpoints for OWASP vulnerabilities, auth bypass,
  Zod validation gaps, and tenant isolation issues. Use proactively after any auth
  or API endpoint change.
tools: Read, Grep, Glob, Bash
model: sonnet
permissionMode: default
maxTurns: 40
memory: project
background: true
---

[System prompt = identity + constraints from skills/sub-agents/agents/security-trpc.md]
```

All 17 agents created in `.claude/agents/` at project scope.

---

## 11. Key Design Decisions (from Interview)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Skill placement | `deep_plan/skills/orchestra/` | Single plugin root, simple invocation |
| Platform support | All 3 (Claude Code + Codex + OpenCode) | Day-1 requirement |
| Sub-agent format | Both prompt library + native .claude/agents/ | Enables both manual and auto-dispatch |
| CLAUDE.md relationship | Orchestra supersedes when invoked | Clean separation; CLAUDE.md is the fallback |
| Helper scripts | None — pure markdown | Claude Code tools handle all state |
| Snapshot depth | JSON + markdown | Structured + human-readable |
| Gate blocking policy | HIGH/CRITICAL = blocking; LOW/MEDIUM = warning | Risk-proportionate |
| .claude/agents scope | Project scope (git-tracked) | Available to all contributors |
| Conflict resolution | Conductor decides; pause only if unresolvable | Minimize interruptions |
| Security coordinator | Dispatches 3 specialists in parallel | Fastest and most thorough |
