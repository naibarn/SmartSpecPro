# Implementation Plan — Orchestra & Sub-Agents Skill Pack

**Feature:** 000-AgentsSkill
**Date:** 2026-02-22
**Scope:** ~50 markdown files across 3 directories

---

## Overview

This plan covers the creation of two new Claude Code skills for SmartSpecPro: `/orchestra` (conductor) and `sub-agents` (prompt library). Both are entirely composed of markdown files — there is no TypeScript or Python code to write. The "implementation" here is authoring well-structured skill documents that Claude Code interprets at runtime.

The deliverables live in three locations:
1. `deep_plan/skills/orchestra/` — the conductor skill (1 SKILL.md + 13 reference files)
2. `deep_plan/skills/sub-agents/` — the prompt library (1 README + 17 agent files + 2 contract files)
3. `.claude/agents/` — native Claude Code agent definitions (17 YAML+markdown files)

All files are markdown. The project builds on existing conventions established by the `deep-plan` skill (which lives at `deep_plan/skills/deep-plan/`). New authors should study that skill before implementing this one.

---

## Section Structure

The implementation is divided into 9 sections based on logical dependency order:

| Section | Contents | Depends On |
|---------|----------|------------|
| 01 | Foundation: directory scaffolding + contract schemas + task-packet-format.md | Nothing |
| 02 | Task Analysis & Routing: task-analysis.md + routing-decision.md | 01 |
| 03 | Wave Planning & Dispatch: wave-planning.md + sub-agent-dispatch.md + platform-compat.md | 01, 02 |
| 04 | Quality, Security & Integration: quality-gates.md + result-integration.md + security-review-protocol.md | 01, 02 |
| 05 | Artifact Management & Compaction: artifact-management.md + compaction-safety.md + session-resume.md + skill-pack-integration.md | 01 |
| 06 | Orchestra SKILL.md (main conductor) | 02, 03, 04, 05 |
| 07 | General Sub-Agent Agents (research, architect, frontend, backend, python, database, test-qa, reviewer, security, infrastructure, docs-release, debugger, error-detective) | 01 |
| 08 | Security Specialist Agents (security-review, security-trpc, security-fastapi, security-frontend) + sub-agents README | 07 |
| 09 | Native .claude/agents/ definitions for all 17 agents | 07, 08 |

---

## Section 01 — Foundation: Scaffolding + Contract Schemas

### What to Create

**Directories (empty — just structure):**
- `deep_plan/skills/orchestra/`
- `deep_plan/skills/orchestra/references/`
- `deep_plan/skills/sub-agents/`
- `deep_plan/skills/sub-agents/agents/`
- `deep_plan/skills/sub-agents/contracts/`

**Skill Registration Verification:**

After creating the `deep_plan/skills/orchestra/SKILL.md` file, verify the skill is discoverable. The existing plugin root at `deep_plan/` auto-discovers sibling skills under `skills/` — check whether the `/orchestra` command is available without changes to `.claude/settings.json`. If it requires explicit registration, add an entry to `.claude/settings.json` analogous to `"deep-plan@piercelamb-plugins": true`. Acceptance criterion: invoking `/orchestra` displays the orchestra banner without a "skill not found" error.

**Contract schema files:**

`deep_plan/skills/sub-agents/contracts/task-packet.schema.md` — defines the complete Task Packet format that orchestra uses to brief sub-agents. Every section is mandatory: TASK (imperative verb + object), DOMAIN (CMD-N designation), FILES (absolute paths only), CONTEXT (prior events, errors, trace IDs), CONSTRAINTS (what not to touch, style rules), CONTRACT (interface reference for parallel agents), OUTPUT (exact deliverable format), QUALITY GATE (what must pass). Includes example packets for frontend, backend, database, and security roles.

`deep_plan/skills/sub-agents/contracts/result-report.schema.md` — defines the Result Report that sub-agents return to the conductor. Fields: status (success/partial/failed), files_changed (list with brief description), findings (issues discovered, severity HIGH/MEDIUM/LOW), blockers (things that stopped progress), next_steps (recommended follow-on actions), quality_gate_results (per gate: passed/failed/skipped). Includes examples for successful and failed executions.

**File `deep_plan/skills/orchestra/references/task-packet-format.md`** — identical content to the contract schema above, rendered from the conductor's perspective (how to construct a Task Packet). Includes worked examples for each agent type and each platform mode (claude-code / codex / open-code).

### Acceptance Criteria
- All 5 directories exist
- Both contract files exist and document every field with examples
- task-packet-format.md exists and covers all 8 Task Packet sections

---

## Section 02 — Task Analysis & Routing

### task-analysis.md

This reference documents how the orchestra classifies incoming requests. It covers:

**Scope classification** (apply in strict order, first match wins):
1. `project` — "new feature/module/service/design" AND no spec file exists
2. `large` — files > 10 OR DB migration involved OR domains ≥ 3
3. `medium` — files 4–10 OR 2 domains with inter-dependencies
4. `small` — files 1–3 AND single domain AND low risk
5. `trivial` — single file, clear fix, no schema/auth changes

**Risk classification** (separate from scope, applied in parallel):
- `low` — style/display/copy changes, no data access, no auth
- `medium` — new UI component with API call, new tRPC procedure, Python task
- `high` — auth middleware, new DB columns, encryption/secrets, multi-tenant data
- `critical` — auth bypass possible, schema DROP, credential exposure, payment/billing

**Bug sub-tree** (applied BEFORE scope table for error/bug reports):
When task is a bug report, route first through: security vulnerability? → error-detective? → Python-only? → file known? → file unknown (research first). Post-fix mandatory waves after any bug route.

**Output:** Write classification result to `orchestra/plan.md` with: scope, risk, affected domains, estimated file count, and chosen route.

### routing-decision.md

Documents the decision tree from scope → execution path:

| Scope | Route | Implementation |
|-------|-------|----------------|
| trivial | Direct edit | Conductor edits file directly, no sub-agents |
| small | Single agent | One Task tool call with Task Packet |
| medium | Multi-agent waves | Contracts + wave plan + parallel dispatch |
| large | deep-plan-codex chain | Create spec file → invoke `/deep-plan-codex` → `/deep-implement` |
| project | Full pipeline | Invoke `/deep-project` → per-split pipeline |

For `large` and `project`: orchestra creates the requirement spec file then invokes the deep-* skill. It does NOT replicate any deep-* functionality.

The decision mode (ask_every_choice / smart_auto / auto_by_default) controls how much orchestra pauses for architectural choices. Stored in `orchestra/decision-mode.md` after being set once.

### Acceptance Criteria
- task-analysis.md covers all 5 scope levels, all 4 risk levels, and the bug sub-tree
- routing-decision.md covers all 5 routes with clear decision logic
- Both files include SmartSpecPro-specific examples (not generic examples)

---

## Section 03 — Wave Planning, Dispatch & Platform Compatibility

### wave-planning.md

Defines how orchestra structures parallel work. Key content:

**Contract definition format** — for every pair of agents working in parallel, define: shared interface (API endpoint + request/response schemas), ownership boundaries (which agent owns which files), test boundary (what each agent tests). Write contracts to `orchestra/contracts.md` before dispatching any parallel agents.

**Wave grouping rules** — tasks in the same wave have no file-level dependencies on each other. Later waves depend on earlier wave outputs. Results from wave N are prepended as structured context to wave N+1 task prompts (not raw conversation history dumps).

**Wave N context injection format** — when injecting wave results into the next wave's Task Packets, use this structured format:

```
### Results from Wave N
- [domain] Description of change: /absolute/path/to/file.ext — SUCCESS
- [domain] Description: /absolute/path/to/file.ext — SUCCESS
- Open contract note: what the next wave agents should know from this wave
```

Do not dump raw conversation history. Only include file paths, change descriptions, status, and cross-agent contract notes.

**Parallelism hard constraints:**
- Max 4 concurrent agents
- Max 2 agents editing files simultaneously (use `isolation: worktree` when enforcing this)
- Only 1 agent for DB operations at a time
- Only 1 agent for git operations at a time
- Parallel dispatch requires a contract — no contract = sequential execution

**Circular dependency detection** — if no ready tasks exist but pending tasks remain, a cycle is present. Report to user, resolve before proceeding.

### sub-agent-dispatch.md

Covers how to dispatch agents using Task tool calls:

**Agent type mapping** — for each of the 17 agent roles, documents which `subagent_type` to use for read-only vs. write mode, plus the platform-specific fallbacks (codex uses general-purpose with injected template; open-code executes inline).

**Parallel dispatch rule** — all agents in the same wave MUST be dispatched in a single message (multiple Task tool calls). Never dispatch agents one-by-one when they can run concurrently.

**Template injection for Codex mode** — when platform is `codex`, prepend the full `agents/NAME.md` content to the Task Packet prompt with a framing sentence ("You are the [Role] Agent for SmartSpecPro.").

**Pre-merge security gate auto-trigger** — after final wave, check if any of the trigger conditions apply (defined in `security-review-protocol.md`). If yes, dispatch `security-review.md` coordinator before reporting completion.

### platform-compat.md

Defines platform detection and adaptation:

**Detection flow** — check `orchestra/platform.md`. If missing, ask user once with 3 options: `claude-code`, `codex`, `open-code`. Write answer to file; never ask again.

**Dispatch adapter per platform:**

For `claude-code`: Use Task tool with specific `subagent_type` from the agent mapping. All waves dispatch in parallel. `background: true` for agents that don't need to pause the workflow.

For `codex`: Use Task tool with `subagent_type=general-purpose`. Inject the condensed agent role template (identity + constraints sections only from `skills/sub-agents/agents/NAME.md`) at the start of the Task Packet prompt. Parallel dispatch still works. Use condensed (not full) templates to avoid prompt size bloat.

For `open-code`: No Task tool available. Conductor executes sequentially, adopting each agent's identity from `agents/NAME.md` and executing the task inline. Clearly announce each role transition. **Cap open-code mode to `small` scope.** For medium+ scope, print: "This task requires parallel agents. Consider switching to Claude Code or Codex. Proceeding sequentially — you may want to use `/clear` between agent roles to manage context." Do not block — just warn and continue.

**Platform reset:** If the user needs to change the detected platform after initial selection, they can delete or edit `orchestra/platform.md` directly. Document this in platform-compat.md.

### Acceptance Criteria
- wave-planning.md covers contract format, wave grouping, circular dependency detection, and parallelism constraints
- sub-agent-dispatch.md documents all 17 agent type mappings and platform-specific dispatch patterns
- platform-compat.md documents all 3 platform modes with concrete examples of Task Packet construction

---

## Section 04 — Quality Gates, Result Integration & Security Review Protocol

### quality-gates.md

Defines all quality gates and their behavior:

**Gate inventory** with trigger conditions, commands, blocking behavior:
- TypeScript check: `cd apps/web && pnpm check` — always runs when TS files changed; blocking for HIGH/CRITICAL
- Python lint: `cd python-backend && ruff check app/` — always runs when .py files changed; blocking for HIGH/CRITICAL
- Unit tests: `pnpm test` / `pytest` — medium risk+; blocking for HIGH/CRITICAL
- Security review (general): dispatches security agent — HIGH risk; blocking for CRITICAL findings
- Full test suite: both test commands — critical risk; always blocking
- Pre-merge security gate: 3-specialist parallel audit — see security-review-protocol.md

**Gate failure protocol** — identify which agent caused failure → create fix Task Packet with error as context → re-dispatch same agent type → max 3 retries → stop and ask user if 3 attempts fail.

**Blocking vs warning matrix** — LOW/MEDIUM risk tasks: all gates are warnings (orchestra continues, logs). HIGH/CRITICAL risk tasks: all gates must pass before proceeding to next wave.

### result-integration.md

How the conductor processes wave results:

**Step-by-step integration:**
1. Read all agent outputs (parse files changed, findings, blockers)
2. Detect file conflicts — if 2 agents modified the same file, apply merge strategy
3. Merge strategy: if changes are in different file sections → merge manually; if changes conflict → pick the one matching the contract, re-dispatch the other
4. Verify contract compliance — each agent's output matches the interface contract
5. Update `orchestra/progress.md` with wave status

**When conductor auto-resolves conflicts** — pick contract-compliant result, log decision in `orchestra/decisions.md`.

**When to pause for user** — if conflict is unresolvable (both agents produced contradictory contract implementations), present both options to user.

### security-review-protocol.md

Defines the pre-merge security gate in full detail:

**Trigger conditions** — comprehensive list (auth, new endpoints, encryption changes, RBAC, CORS/CSP, file upload/deserialization, security dependency upgrades, infra config changes).

**Gate dispatch flow** (conductor-managed, NOT delegated to security-review agent):
Orchestra directly dispatches 3 specialists in parallel (single message, 3 Task calls):
- security-trpc agent → Task Packet covering changed tRPC routers
- security-fastapi agent → Task Packet covering changed FastAPI endpoints
- security-frontend agent → Task Packet covering changed React components

After all 3 complete, orchestra dispatches security-review.md as an **aggregator** (not dispatcher) — its Task Packet includes the collected findings from all 3 specialists, and its job is to deduplicate, count by severity, and produce the PASS/CONDITIONAL/FAIL verdict. The security-review aggregator writes findings to `orchestra/risk_register.md` and returns the verdict.

**Critical constraint: Sub-agents cannot spawn sub-agents.** The conductor (orchestra) always manages dispatch depth. security-review.md is an aggregator only — it never dispatches Task tool calls.

**Severity threshold policy:**
- 0 CRITICAL + 0 HIGH → PASS (green)
- 0 CRITICAL + N HIGH → CONDITIONAL PASS (user approval required; auto-approved in `auto_by_default` mode — **prominently displayed** in final summary with "⚠️ AUTO-APPROVED HIGH SECURITY FINDINGS" header, and logged to `orchestra/decisions.md` with timestamp)
- N CRITICAL → FAIL (blocked; cannot proceed; user must resolve or mark as accepted risk)

**Finding categories and severity mapping** for SmartSpecPro's stack (tRPC IDOR, FastAPI injection, XSS, auth bypass, hardcoded secrets, missing tenant isolation, etc.).

**Risk register** — all findings logged to `orchestra/risk_register.md` regardless of verdict.

### Acceptance Criteria
- quality-gates.md documents all 6 gate types with commands, triggers, blocking rules, and retry protocol
- result-integration.md covers conflict detection, merge strategy, and when to escalate to user
- security-review-protocol.md covers all trigger conditions, coordinator flow, severity thresholds, and finding categories for SmartSpecPro's stack

---

## Section 05 — Artifact Management, Compaction Safety & Skill Pack Integration

### artifact-management.md

Documents the `orchestra/` directory lifecycle:

**Directory location** — `orchestra/` lives at the project root (e.g., `/home/dev/projects/SmartSpecPro/orchestra/`). It is always relative to the current working directory when `/orchestra` is invoked. If two developers simultaneously run `/orchestra` sessions, they will share this directory — this is an acceptable limitation for a single-developer workflow tool. The banner should note: "Note: `orchestra/` is at project root and is shared across sessions."

**File inventory** — full table of all files in `orchestra/`: plan.md, progress.md, backlog.md, decisions.md, contracts.md, platform.md, decision-mode.md, risk_register.md, snapshot.json, snapshot.md, archive/.

**File lifecycle rules** — when each file is created, updated, and retired. Contracts.md is frozen after Wave 1 (never changed mid-session). Decisions.md is append-only with timestamps.

**Fresh start vs resume** — when `/orchestra` is invoked with existing `orchestra/` directory, offer: resume from snapshot (read snapshot.json, inject state into context) OR fresh start (archive entire old orchestra/ to `orchestra/archive/<ISO-timestamp>/`).

**Git tracking** — `orchestra/` should be committed to track the full history of a development session. `.gitignore` should NOT exclude it.

### snapshot-schema-note.md (embedded in compaction-safety.md)

**Canonical snapshot schema** (use this exact structure — do NOT use the generic research document schema with field names `completed_steps`/`pending`/`task_id`):

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

### compaction-safety.md

Context Health Check (CHC) protocol:

**When CHC runs** — after every wave, before any HIGH/CRITICAL work, after >5 wave cycles.

**Context state classification:**
- `green` — short conversation, few decisions, simple task → continue normally
- `yellow` — multiple waves complete, growing context → log warning in progress.md
- `red` — many decisions + contracts + active agents, or about to change major topic → mandatory snapshot

**Snapshot-before-compact protocol** — on red state: (1) update orchestra/snapshot.json with full structured checkpoint, (2) update orchestra/snapshot.md with human summary, (3) update progress.md and backlog.md, (4) notify user "Context state is RED. Snapshot saved. Safe to continue or start new session."

**Resume after compaction** — if user clears context and re-invokes `/orchestra`, the skill reads `orchestra/snapshot.md` and `orchestra/snapshot.json` to restore state. Inject summary into context, read key files, continue from in-progress step.

### session-resume.md

The R4 resume algorithm (Read, Restore, Reconcile, Resume):

**Read** — read `orchestra/snapshot.json` for structured state; read `orchestra/snapshot.md` for human summary; read all key_files listed in checkpoint.

**Restore** — re-establish mental model of: what was being built, what decisions were made, what contracts are active, what waves are complete, what is in-progress.

**Reconcile** — verify actual file state matches snapshot state. If files are missing or newer than snapshot, update the in-memory state to reflect reality.

**Resume** — continue from `in_progress` step. Never re-execute completed waves unless files are missing.

### skill-pack-integration.md

How orchestra hands off to deep-plan-codex and deep-implement for large/project tasks:

**For `large` scope** — orchestra creates a requirements spec file (based on the task description and research), tells the user to run `/deep-plan-codex @spec-file.md`, and logs the expected output paths to `orchestra/backlog.md` (e.g., `sections/index.md`, `claude-plan.md`). After the user completes the deep-* skill and returns with `/orchestra resume`, orchestra verifies those output paths exist before continuing.

**For `project` scope** — orchestra creates a high-level requirements document and tells the user to run `/deep-project @requirements.md`. Deep-project produces splits; orchestra then runs the large-scope pattern for each split.

**Handoff verification on resume** — when `/orchestra resume` is invoked after a deep-* handoff, check `orchestra/backlog.md` for the expected artifact paths. If they are missing, report: "Expected artifacts from deep-plan not found at [path]. Did the deep-plan session complete successfully?" Do not proceed until the user confirms or the files exist.

**State synchronization** — after deep-* skills complete, orchestra syncs their output artifacts into `orchestra/progress.md` and continues quality gates and progress tracking from there.

**Shared context** — pass the `orchestra/` directory location to deep-* invocations as context so they can append to `orchestra/decisions.md`.

### Acceptance Criteria
- artifact-management.md documents all orchestra/ files, lifecycle rules, and git tracking recommendation
- compaction-safety.md covers CHC states, snapshot protocol, and resume flow
- session-resume.md documents the R4 algorithm with concrete examples
- skill-pack-integration.md explains handoff mechanics for large and project scope

---

## Section 06 — Orchestra SKILL.md (Main Conductor)

This is the most complex file — the main entry point for the `/orchestra` skill. An implementer must read sections 02–05 reference documents first, then write SKILL.md to orchestrate all of them.

### YAML Frontmatter

```yaml
---
name: orchestra
description: >
  AI Orchestra Conductor: analyzes tasks, dispatches specialized sub-agents,
  integrates results, and manages file-based memory to survive context compaction.
  Coordinates with /deep-project, /deep-plan-codex, and /deep-implement.
license: MIT
compatibility: >
  Claude Code (full features), Codex (general-purpose subagents), OpenCode (sequential mode)
---
```

### Workflow (8 Steps)

**Step 0: Banner + State Loading**
Print the orchestra banner. Check for `orchestra/snapshot.json`. If present, use AskUserQuestion to offer: resume vs fresh start. If fresh start, archive old orchestra/ to timestamped subdirectory. Create orchestra/ if new session.

**Step 1: Task Analysis**
Read `references/task-analysis.md`. Apply scope and risk classification. Apply bug sub-tree first if task is a bug/error report. Write classification to `orchestra/plan.md` (initial entry). Print classification summary.

**Step 2: Routing Decision**
Read `references/routing-decision.md`. Determine execution path. If decision mode not set: ask once using AskUserQuestion (3 options), write to `orchestra/decision-mode.md`. For trivial tasks: proceed directly. For large/project: invoke deep-* integration (read `references/skill-pack-integration.md`). For small/medium: continue to contract and wave planning.

**Step 3: Contract & Wave Planning (medium+ only)**
Read `references/wave-planning.md`. Define interface contracts. Group tasks into dependency waves. Write contracts to `orchestra/contracts.md` and wave plan to `orchestra/plan.md`. Skip to step 4 for small-scope tasks.

**Step 4: Dispatch**
Read `references/sub-agent-dispatch.md` and `references/platform-compat.md`. Check or detect platform. Build Task Packets for all agents in current wave. Dispatch all as a SINGLE message (parallel). Wait for results.

**Step 5: Result Integration**
Read `references/result-integration.md`. Process agent outputs. Detect conflicts. Merge or re-dispatch. Verify contract compliance. Update `orchestra/progress.md`. Check pre-merge security gate trigger conditions.

**Step 6: Quality Gates**
Read `references/quality-gates.md`. Run applicable gates. Apply blocking rules by risk level. Retry failures (max 3). Pause for user only on gate CRITICAL failure or 3-attempt exhaustion. If pre-merge trigger detected: read `references/security-review-protocol.md` and dispatch security-review coordinator.

**Step 7: Progress Update**
Update all orchestra/ files. Log all auto-approved decisions with timestamps.

**Step 8: Context Health Check**
Read `references/compaction-safety.md`. Classify context state. If red: write snapshot before continuing. Repeat from Step 4 if more waves remain. When all waves complete: print final summary of what was done, quality gate results, and any remaining items in backlog.

### SKILL.md Writing Rules
- Written for a reader who has never seen this workflow before
- Every step references its corresponding reference file explicitly
- All AskUserQuestion calls include exactly the options defined in the spec
- No full code implementations — function signatures and config keys only
- Autonomous operation rules embedded as inline decision trees (not prose)
- STOP conditions listed as a bulleted table, not prose
- **Lazy reference reading** — read reference files only when their step is actually taken:
  - Always read: task-analysis.md (Step 1), routing-decision.md (Step 2)
  - Only for medium+ scope: wave-planning.md (Step 3), sub-agent-dispatch.md, platform-compat.md, result-integration.md
  - Always: quality-gates.md (Step 6)
  - Only when gate triggers: security-review-protocol.md (Step 5/6)
  - Only when context state = yellow+: compaction-safety.md (Step 8)

### Acceptance Criteria
- SKILL.md has all 8 steps with correct reference file citations
- All AskUserQuestion prompts match defined options from spec
- Platform detection is present in Step 4
- Pre-merge security gate trigger check is present in Step 5
- CHC is present in Step 8 with red-state snapshot protocol
- STOP conditions and auto-proceed conditions are clearly tabulated

---

## Section 07 — General Sub-Agent Agents (13 files)

13 general agent files in `deep_plan/skills/sub-agents/agents/`. The remaining 4 security specialists are defined in Section 08, bringing the total to 17 agents. Each file follows the 8-section template:
Identity, Capabilities, Constraints, Input Contract, Output Contract, Workflow, Quality Checklist, Error Handling.

### Key agents and their critical content:

**research.md** — subagent_type: `Explore`. Output must be a Research Brief in the defined format (Findings / Current Architecture / Risks / Options / Recommendation / Open Questions). Must NOT modify any files.

**architect.md** — subagent_type: `Plan`. Read-only. Produces architecture document with text-based module diagram, API contracts, data flow, and migration strategy. No code implementations.

**frontend.md** — subagent_type: `general-purpose`. Must follow: React 19, Wouter, Radix UI + CVA, TanStack Query, path alias `@/`. Must use contract API schemas. Must not modify backend files.

**backend.md** — subagent_type: `backend-api-security:backend-architect`. Must: validate all inputs with Zod, check auth/tenant isolation on every endpoint, follow tRPC 11 + Drizzle ORM conventions. Must not modify frontend.

**python.md** — subagent_type: `python-development:fastapi-pro`. Must: Python 3.11+, async-first, Black 100 chars, ruff, structured logging (not print), 80% coverage minimum.

**database.md** — subagent_type: `general-purpose`. Must follow Database Safety Protocol from CLAUDE.md: backup before changes, verify row counts after. Only 1 database agent active at a time.

**test-qa.md** — subagent_type: `general-purpose`. Writes test files + test plan + pass/fail report. Knows Vitest (TS) and pytest (Python) patterns and SmartSpecPro test markers.

**reviewer.md** — subagent_type: `Explore` (read-only). Output is a Review Report with severity table, contract compliance checklist, and verdict (APPROVE / APPROVE_WITH_FIXES / REQUEST_CHANGES).

**security.md** — subagent_type: `backend-api-security:backend-security-coder`. Checks OWASP Top 10, tenant isolation, secrets handling, per CLAUDE.md Encryption & Secrets Safety rules. Output: risk register + fix patches.

**debugger.md** — subagent_type: `error-debugging:debugger`. Enforces mandatory 3-phase protocol (UNDERSTAND → PLAN → FIX). 3-attempt limit, no shotgun debugging, revert failed fixes. Reports to orchestra after limit.

**error-detective.md** — subagent_type: `error-debugging:error-detective`. Reads JSONL audit logs, traces by traceId, correlates provider_usage_log and audit events. Knows SmartSpecPro audit log schema and query patterns.

**infrastructure.md** — subagent_type: `Explore` (analysis) or `general-purpose` (write). CMD-5 domain. Knows SmartSpecPro's service ports, Nginx rate limits, Celery worker configs. Must follow CRITICAL DEPLOYMENT RULES from CLAUDE.md (systemd only, never manual uvicorn/tsx). Validates Nginx changes with `./scripts/validate-all-configs.sh`.

**docs-release.md** — subagent_type: `general-purpose`. Updates changelog, migration notes, release checklists. Follows semantic versioning.

### Acceptance Criteria
- All 13 general agent files exist (Section 07) + 4 security specialists (Section 08) = 17 total
- Each agent documents the correct `subagent_type` for its platform modes
- SmartSpecPro-specific constraints are embedded in each relevant agent (not generic)
- debugger.md enforces the 3-phase protocol explicitly
- database.md references CLAUDE.md Database Safety Protocol
- error-detective.md knows the audit log schema (JSONL path, query patterns)

---

## Section 08 — Security Specialist Agents + Sub-Agents README

### security-review.md (Aggregator)

**IMPORTANT ARCHITECTURAL CONSTRAINT:** Sub-agents cannot spawn sub-agents in Claude Code. The conductor (orchestra) dispatches all 3 security specialists directly. `security-review.md` is an **aggregator**, not a dispatcher.

**Role:** Pre-merge security gate result aggregator. Orchestra dispatches the 3 specialists; security-review.md receives their combined findings and produces the verdict.

**Orchestra's dispatch flow (in SKILL.md Step 5/6):**
1. Orchestra identifies changed files by domain
2. Orchestra builds Task Packets for each specialist
3. Orchestra dispatches all 3 specialists in parallel (single message, 3 Task calls) — security-trpc, security-fastapi, security-frontend
4. Orchestra waits for all 3 to complete and collects their Result Reports
5. Orchestra dispatches security-review.md as aggregator with all findings in its Task Packet context

**security-review.md aggregator workflow (receives findings, does not dispatch):**
1. Receive pre-collected findings from all 3 specialists (passed in Task Packet context by orchestra)
2. Deduplicate findings across specialists
3. Count by severity: CRITICAL and HIGH findings
4. Apply threshold policy (0 CRITICAL + 0 HIGH → PASS; etc.)
5. Write all findings to `orchestra/risk_register.md`
6. Return structured verdict to conductor

**Output contract:** Single structured verdict (PASS/CONDITIONAL/FAIL) + deduplicated findings list + risk_register.md path.

### security-trpc.md (tRPC Auditor)

**Focus areas specific to SmartSpecPro's tRPC stack:**
- IDOR (missing `WHERE ... AND tenantId = ctx.tenantId` in queries)
- Missing Zod validation on procedure inputs
- Auth middleware bypass (procedures missing `.use(isAuthenticated)`)
- Rate limiting on mutation procedures
- Credit/billing mutation without proper authorization check
- VITE_ environment variables leaking server-only secrets

### security-fastapi.md (FastAPI Auditor)

**Focus areas specific to SmartSpecPro's Python stack:**
- SQL injection via SQLAlchemy raw queries
- Missing input validation on FastAPI endpoints (`Depends(get_current_user)` present?)
- LLM prompt injection via user-controlled content passed to LLM without sanitization
- Celery task arguments containing secrets
- Python `print()` statements logging sensitive data
- `os.environ` serialization in responses

### security-frontend.md (Frontend Auditor)

**Focus areas specific to SmartSpecPro's React stack:**
- XSS via `dangerouslySetInnerHTML` with user content
- Auth state exposed in `window` or `localStorage` (JWT should be in httpOnly cookie)
- Missing CSRF protection on mutation hooks
- React component rendering user-controlled HTML
- VITE_ environment variable leaking to bundle that should be server-only
- Wouter routing allowing unauthenticated access to protected pages

### sub-agents/README.md

The registry overview file. Content:
- Table of all 17 agents: name, purpose, subagent_type, output format, when to use
- How orchestra dispatches agents (Task Packet format reference)
- How to add a new agent (follow the 8-section template, add to registry table, create .claude/agents/ definition)
- Platform compatibility matrix (which agents work in each mode)

### Acceptance Criteria
- security-review.md is clearly an AGGREGATOR (not a dispatcher) — it does not contain Task tool dispatch instructions
- security-review.md workflow begins "Receive pre-collected findings from..." (not "Dispatch...")
- security-trpc.md includes SmartSpecPro-specific tRPC anti-patterns (IDOR, Zod, tenantId)
- security-fastapi.md includes Python/LLM-specific risks (prompt injection, Celery, print logging)
- security-fastapi.md output examples use Python paths (e.g., `python-backend/app/api/v1/resource.py:42`) NOT tRPC paths
- security-frontend.md includes React-specific risks (XSS, JWT storage, VITE_ leakage)
- security-frontend.md output examples use React paths (e.g., `apps/web/client/src/pages/Login.tsx:88`) NOT server paths
- README.md contains a complete agent registry table

---

## Section 09 — Native .claude/agents/ Definitions

Create 17 files at `/home/dev/projects/SmartSpecPro/.claude/agents/NAME.md` for each agent.

### YAML Frontmatter Pattern

Each file has YAML frontmatter followed by the agent's system prompt (derived from the corresponding `skills/sub-agents/agents/NAME.md` identity + constraints sections):

```yaml
---
name: [agent-name]
description: >
  [Trigger description — written to match when Claude auto-dispatches this agent.
   Include "Use proactively when..." language for agents that should auto-trigger.]
tools: [comma-separated list — read-only agents: Read, Grep, Glob; write agents: Read, Grep, Glob, Bash, Write, Edit]
model: [sonnet | opus | haiku | inherit]
permissionMode: [default | acceptEdits | dontAsk | plan]
maxTurns: [30-50 depending on task complexity]
memory: [project | user | local]
background: [true | false]
isolation: [worktree — only for writing agents dispatched in parallel waves; omit for read-only agents]
---

[System prompt: identity + constraints from skills/sub-agents/agents/NAME.md]
```

**Naming convention:** Use the `ssp-` prefix for `.claude/agents/` file names (e.g., `ssp-backend.md`, `ssp-frontend.md`) to clearly distinguish these native agent definitions from plugin-provided `subagent_type` values (e.g., `backend-api-security:backend-architect`). This prevents naming confusion when maintainers look at agent configuration. The `name:` field in the YAML frontmatter should match the prefixed filename without extension (e.g., `name: ssp-backend`).

**Dispatch mechanism note:** `.claude/agents/` definitions are used for auto-dispatch (Claude matches the `description` field to the user's request). The `subagent_type` parameter in Task tool calls targets plugin agents by ID. These are independent mechanisms and do not conflict.

### Agent Configuration Matrix

| Agent | File | Model | permissionMode | maxTurns | memory | background | tools | isolation |
|-------|------|-------|---------------|---------|--------|------------|-------|-----------|
| ssp-research | ssp-research.md | haiku | plan | 20 | project | true | Read, Grep, Glob | — |
| ssp-architect | ssp-architect.md | sonnet | plan | 20 | project | false | Read, Grep, Glob | — |
| ssp-frontend | ssp-frontend.md | sonnet | acceptEdits | 40 | project | true | Read, Grep, Glob, Bash, Write, Edit | worktree |
| ssp-backend | ssp-backend.md | sonnet | acceptEdits | 40 | project | true | Read, Grep, Glob, Bash, Write, Edit | worktree |
| ssp-python | ssp-python.md | sonnet | acceptEdits | 40 | project | true | Read, Grep, Glob, Bash, Write, Edit | worktree |
| ssp-database | ssp-database.md | sonnet | default | 30 | project | false | Read, Grep, Glob, Bash, Write, Edit | — |
| ssp-test-qa | ssp-test-qa.md | sonnet | acceptEdits | 40 | project | true | Read, Grep, Glob, Bash, Write, Edit | worktree |
| ssp-reviewer | ssp-reviewer.md | sonnet | plan | 30 | project | true | Read, Grep, Glob | — |
| ssp-security | ssp-security.md | sonnet | acceptEdits | 40 | project | true | Read, Grep, Glob, Bash, Write, Edit | worktree |
| ssp-debugger | ssp-debugger.md | sonnet | acceptEdits | 50 | project | false | Read, Grep, Glob, Bash, Write, Edit | — |
| ssp-error-detective | ssp-error-detective.md | haiku | plan | 30 | project | true | Read, Grep, Glob | — |
| ssp-security-review | ssp-security-review.md | sonnet | plan | 20 | project | false | Read, Grep, Glob, Write | — |
| ssp-security-trpc | ssp-security-trpc.md | sonnet | plan | 30 | project | true | Read, Grep, Glob | — |
| ssp-security-fastapi | ssp-security-fastapi.md | sonnet | plan | 30 | project | true | Read, Grep, Glob | — |
| ssp-security-frontend | ssp-security-frontend.md | sonnet | plan | 30 | project | true | Read, Grep, Glob | — |
| ssp-infrastructure | ssp-infrastructure.md | sonnet | default | 30 | project | false | Read, Grep, Glob, Bash, Write, Edit | — |
| ssp-docs-release | ssp-docs-release.md | sonnet | acceptEdits | 30 | project | false | Read, Grep, Glob, Bash, Write, Edit | — |

**Notes:**
- `database` and `infrastructure` use `default` permissionMode (not `acceptEdits`) because they can make high-impact changes; they also run sequentially (`background: false`) for safety
- `debugger` uses `maxTurns: 50` to allow thorough 3-phase investigation
- `research`, `error-detective`, and all security auditors use `haiku` or `sonnet` (fast, read-only work)
- `security-review` aggregator uses `plan` mode because it only reads findings and writes to risk_register.md — it never dispatches Task calls
- `isolation: worktree` only for writing agents that run in parallel waves — prevents file conflicts
- `isolation: —` for sequential agents (database, debugger, infrastructure) and read-only agents
- `background: false` for agents that hold the workflow sequentially (architect, database, debugger, infrastructure, docs-release, security-review aggregator)

### Description Field Requirements

The `description` field is the most important field for auto-dispatch. Each description must:
1. Describe what the agent does in one sentence
2. Include "Use proactively when..." or "Use when..." trigger language
3. Match the scenarios where orchestra would dispatch this agent

Example for `backend`:
```
Implements tRPC routers, Express routes, Drizzle ORM queries, and service layer for SmartSpecPro's Node.js backend. Use when adding new API endpoints, modifying server-side business logic, or updating database queries.
```

### Acceptance Criteria
- All 17 .claude/agents/ files exist with `ssp-` prefix (e.g., `ssp-backend.md`) and valid YAML frontmatter
- Each file has appropriate model, permissionMode, maxTurns, memory, background, tools, and isolation settings matching the matrix
- Read-only agents have tools limited to `Read, Grep, Glob` (no Bash/Write/Edit)
- Writing agents dispatched in parallel waves have `isolation: worktree`
- Description field includes trigger language for auto-dispatch and references SmartSpecPro-specific scenarios
- System prompt in each file is consistent with the corresponding `skills/sub-agents/agents/NAME.md`
- `ssp-security-review.md` system prompt describes aggregation workflow — no Task tool dispatch instructions
- No file has `background: true` AND `permissionMode: default` simultaneously (background agents need explicit permission grant)

---

## Testing Approach

Since these are skill/documentation files (no executable code), "testing" means validation:

1. **Structure validation** — every SKILL.md and reference file has the required sections
2. **Cross-reference validation** — SKILL.md references correct paths (e.g., `references/wave-planning.md` exists)
3. **Contract consistency** — task-packet.schema.md and SKILL.md use the same section names
4. **Agent registry completeness** — README.md table matches the actual files in `agents/`
5. **Native agent consistency** — `.claude/agents/NAME.md` description aligns with `agents/NAME.md` capabilities
6. **Manual smoke test** — invoke `/orchestra "Fix the typo in apps/web/README.md"` and verify: (a) banner prints, (b) trivial scope is detected, (c) direct edit is performed without spawning sub-agents
7. **Platform detection smoke test** — confirm `orchestra/platform.md` is created on first invocation

---

## Implementation Notes

### Writing Order

Implement sections in dependency order: 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09.

Sections 07–09 can be split into parallel batches since agent files are independent of each other (they only depend on Section 01 for contract schemas).

### File Size Guidance

| File | Expected Size |
|------|--------------|
| Orchestra SKILL.md | 400–600 lines |
| Reference docs (most) | 100–250 lines each |
| task-analysis.md, routing-decision.md | 150–250 lines (decision trees are verbose) |
| security-review-protocol.md | 200–300 lines |
| Agent files (general) | 80–150 lines each |
| Security specialist agents | 150–250 lines each |
| .claude/agents/ definitions | 40–80 lines each |
| Contract schemas | 100–150 lines each |

### Common Pitfalls to Avoid

1. **Hardcoding project-specific commands incorrectly** — always use the commands from CLAUDE.md (`pnpm check`, `cd apps/web && pnpm test`, `cd python-backend && pytest`)
2. **Using relative paths in snapshot.json** — always use absolute paths in `key_files`
3. **Forgetting the Codex/OpenCode fallback in SKILL.md** — platform detection must happen before any Task tool call
4. **Writing agent descriptions that are too generic** — every agent description must reference SmartSpecPro-specific triggers
5. **Missing the bug sub-tree** — task analysis must check for bug/error reports before applying the scope table
6. **Missing the pre-merge trigger check** — security gate check must happen after Step 5 (result integration), not only at Step 6
