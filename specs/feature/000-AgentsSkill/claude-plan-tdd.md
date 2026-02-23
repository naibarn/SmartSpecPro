# TDD Plan — Orchestra & Sub-Agents Skill Pack

**Feature:** 000-AgentsSkill
**Date:** 2026-02-22
**Paired with:** claude-plan.md

---

## Testing Philosophy for Markdown-Only Deliverables

This feature produces no executable TypeScript or Python code. All deliverables are markdown skill files. "Tests" are therefore **structural validation steps** that must be performed after creating each section's files. They verify: required sections exist, cross-references resolve, contracts are consistent, and the skill behaves correctly when invoked.

**Validation categories used throughout:**
- **S** — Structure (required headings/sections exist)
- **X** — Cross-reference (file paths mentioned in one file actually exist)
- **C** — Contract consistency (field names match across documents)
- **R** — Registry completeness (inventory tables are accurate)
- **Smoke** — Manual invocation tests

---

## Section 01 — Foundation: Scaffolding + Contract Schemas

### Before implementing, verify:

- S: `task-packet.schema.md` has exactly 8 required sections: TASK, DOMAIN, FILES, CONTEXT, CONSTRAINTS, CONTRACT, OUTPUT, QUALITY GATE
- S: `result-report.schema.md` has exactly 6 required fields: status, files_changed, findings, blockers, next_steps, quality_gate_results
- S: `task-packet-format.md` covers all 8 Task Packet sections from the conductor's perspective
- C: Field names in `task-packet.schema.md` match the field names used in SKILL.md Step 4 and in agent files' "Input Contract" sections
- C: `status` values in `result-report.schema.md` (success/partial/failed) match what SKILL.md expects in Step 5 (result integration)
- S: All 5 directories exist (not just created by one file reference — physically present)
- Smoke: `/orchestra` command is discoverable after creating SKILL.md — check `.claude/settings.json` or plugin discovery mechanism

---

## Section 02 — Task Analysis & Routing

### Before implementing, verify:

- S: `task-analysis.md` covers all 5 scope levels (trivial, small, medium, large, project) with definitions
- S: `task-analysis.md` covers all 4 risk levels (low, medium, high, critical) with definitions
- S: `task-analysis.md` includes the bug sub-tree (applied BEFORE the scope table)
- S: `routing-decision.md` covers all 5 routes with concrete execution description per route
- S: Both files include SmartSpecPro-specific examples (not generic — must reference tRPC, FastAPI, Drizzle, etc.)
- C: The 5 scope levels in `task-analysis.md` match the 5 routes in `routing-decision.md` (one-to-one)
- C: The route names in `routing-decision.md` match what SKILL.md Step 2 references
- X: `routing-decision.md` references to other skills (deep-plan-codex, deep-project, deep-implement) match the actual invocation patterns documented in `skill-pack-integration.md`
- C: The `decision-mode` options (ask_every_choice, smart_auto, auto_by_default) are defined in `routing-decision.md` and used consistently in SKILL.md Step 2

---

## Section 03 — Wave Planning, Dispatch & Platform Compatibility

### Before implementing, verify:

- S: `wave-planning.md` defines contract format with at least 3 required fields (shared interface, ownership boundaries, test boundary)
- S: `wave-planning.md` specifies all 4 parallelism hard constraints (max 4 concurrent, max 2 file-editing, 1 DB agent, 1 git agent)
- S: `wave-planning.md` covers circular dependency detection with explicit handling instructions
- S: `wave-planning.md` includes the wave N context injection format example (with `[domain] description: /path — STATUS` pattern)
- S: `sub-agent-dispatch.md` covers all 17 agent roles with their `subagent_type` for each platform mode
- S: `sub-agent-dispatch.md` states the parallel dispatch rule ("all agents in the same wave MUST be dispatched in a single message")
- S: `platform-compat.md` documents all 3 platform modes with concrete Task Packet construction examples
- S: `platform-compat.md` includes the open-code mode scope cap (small scope only) warning
- S: `platform-compat.md` documents how to reset platform detection (delete/edit `orchestra/platform.md`)
- C: The 17 agent types in `sub-agent-dispatch.md` match the 17 agents defined in sections 07+08
- C: The `subagent_type` values in `sub-agent-dispatch.md` match the available plugins listed in research doc (1.7 and 1.8)

---

## Section 04 — Quality Gates, Result Integration & Security Review Protocol

### Before implementing, verify:

- S: `quality-gates.md` documents all 6 gate types with: exact command, trigger condition, blocking rule, retry protocol (max 3 attempts), and escalation path
- S: `quality-gates.md` commands use exact SmartSpecPro syntax: `cd apps/web && pnpm check`, `cd python-backend && ruff check app/`, `pnpm test`, `pytest`
- S: `result-integration.md` covers file conflict detection, merge strategy (same section → manual merge; conflicting → pick contract-compliant), and when to pause for user
- S: `security-review-protocol.md` covers all trigger conditions (auth, new endpoints, encryption, RBAC, CORS/CSP, file upload, security deps, infra config)
- S: `security-review-protocol.md` documents that orchestra (NOT security-review.md) dispatches the 3 specialists
- S: `security-review-protocol.md` documents the severity threshold policy (0 CRIT + 0 HIGH = PASS, 0 CRIT + N HIGH = CONDITIONAL, N CRIT = FAIL)
- S: `security-review-protocol.md` documents auto-approve logging requirement ("⚠️ AUTO-APPROVED HIGH SECURITY FINDINGS" in final summary + decisions.md entry)
- C: Gate commands in `quality-gates.md` match the commands in CLAUDE.md Quick Reference section
- C: The 6 gate types listed in `quality-gates.md` match the gate triggers in SKILL.md Step 6

---

## Section 05 — Artifact Management, Compaction Safety & Skill Pack Integration

### Before implementing, verify:

- S: `artifact-management.md` table covers all 11 files in `orchestra/`: plan.md, progress.md, backlog.md, decisions.md, contracts.md, platform.md, decision-mode.md, risk_register.md, snapshot.json, snapshot.md, archive/
- S: `artifact-management.md` clarifies that `orchestra/` lives at project root and notes concurrent-session collision risk
- S: `compaction-safety.md` defines 3 context states (green/yellow/red) with classification criteria
- S: `compaction-safety.md` documents snapshot-before-compact protocol for red state
- S: `compaction-safety.md` includes the canonical snapshot JSON schema with fields: `timestamp`, `task_description`, `phase`, `completed_waves`, `in_progress`, `pending_waves`, `decisions`, `blockers`, `key_files`
- S: `session-resume.md` documents the R4 algorithm (Read, Restore, Reconcile, Resume) with concrete examples
- S: `skill-pack-integration.md` documents handoff verification: when `/orchestra resume` is invoked after deep-* handoff, check for expected artifact paths
- S: `skill-pack-integration.md` documents writing expected output paths to `orchestra/backlog.md` before handing off
- C: Snapshot field names in `compaction-safety.md` exactly match what SKILL.md Step 8 writes and `session-resume.md` Step 1 (Read) parses
- C: File inventory in `artifact-management.md` matches the files that SKILL.md Steps 1-8 actually create/update

---

## Section 06 — Orchestra SKILL.md

### Before implementing, verify (structural):

- S: SKILL.md has exactly 8 steps (Step 0 through Step 8) — no missing steps
- S: Each step explicitly cites its reference file with exact path (e.g., "Read `references/task-analysis.md`")
- S: SKILL.md Step 4 includes platform detection before any Task call
- S: SKILL.md Step 5 includes pre-merge security gate trigger check (after result integration)
- S: SKILL.md Step 6 dispatches security specialists via orchestra (NOT via security-review coordinator)
- S: SKILL.md Step 8 includes CHC with red-state snapshot protocol
- S: SKILL.md writing rules section includes conditional reference file reading guidance
- S: STOP conditions are tabulated (not prose) with exactly 8 stop conditions from the spec
- S: AskUserQuestion options in SKILL.md match exactly: decision mode (3 options), platform (3 options), fresh-start-vs-resume (2 options)

### Cross-reference validation:

- X: Every reference file cited in SKILL.md exists at the path cited (`references/task-analysis.md`, `references/routing-decision.md`, etc.)
- X: SKILL.md banner mentions `orchestra/` as shared project-root directory
- C: The `orchestra/plan.md`, `progress.md`, `backlog.md`, `decisions.md` updates in SKILL.md Steps 1-7 match the "Updated When" column in `artifact-management.md`

### Smoke test (manual):

- Smoke: Invoke `/orchestra "Fix the typo in apps/web/README.md"` → verify: banner prints, scope classified as `trivial`, direct edit performed, no sub-agents spawned, `orchestra/plan.md` created
- Smoke: Verify `orchestra/platform.md` is created after first invocation with a platform value (claude-code / codex / open-code)

---

## Section 07 — General Sub-Agent Agents (13 files)

### Before implementing, verify (per file):

For each of the 13 general agent files, check:
- S: Has all 8 sections: Identity, Capabilities, Constraints, Input Contract, Output Contract, Workflow, Quality Checklist, Error Handling
- S: Specifies `subagent_type` for Claude Code mode (use exact values from CLAUDE.md orchestration matrix)
- S: Identity and Constraints sections reference SmartSpecPro-specific tech/conventions (not generic)

**Agent-specific validation stubs:**

- research.md — S: Output section documents Research Brief format (Findings/Current Architecture/Risks/Options/Recommendation/Open Questions); Constraints say "Must NOT modify any files"
- architect.md — S: Output section produces architecture document with text-based module diagram; Constraints say read-only
- frontend.md — S: Constraints reference React 19, Wouter, Radix UI + CVA, TanStack Query, path alias `@/`; Constraints say "Must not modify backend files"
- backend.md — S: Constraints reference Zod input validation, auth/tenant isolation check on every endpoint, tRPC 11, Drizzle ORM; Constraints say "Must not modify frontend"
- python.md — S: Constraints reference Python 3.11+, async-first, Black 100 chars, ruff, structured logging (not print), 80% coverage minimum
- database.md — S: Constraints reference CLAUDE.md Database Safety Protocol (backup before changes, verify row counts after); Identity states "Only 1 database agent active at a time"
- test-qa.md — S: Output includes test plan + pass/fail report; references Vitest (TS) and pytest (Python) with SmartSpecPro test markers
- reviewer.md — S: Output documents Review Report with severity table, contract compliance checklist, and verdict (APPROVE / APPROVE_WITH_FIXES / REQUEST_CHANGES)
- security.md — S: Covers OWASP Top 10, tenant isolation, secrets handling per CLAUDE.md Encryption & Secrets Safety; Output includes risk register + fix patches
- debugger.md — S: Workflow section enforces mandatory 3-phase protocol (UNDERSTAND → PLAN → FIX) with 3-attempt limit and "revert failed fixes" rule
- error-detective.md — S: Capabilities include reading JSONL audit logs, tracing by traceId, correlating provider_usage_log; knows SmartSpecPro audit log schema and query patterns
- infrastructure.md — S: Constraints reference CRITICAL DEPLOYMENT RULES from CLAUDE.md (systemd only, never manual uvicorn/tsx, use `./scripts/validate-all-configs.sh`)
- docs-release.md — S: Output includes changelog, migration notes, release checklist following semantic versioning

---

## Section 08 — Security Specialist Agents + Sub-Agents README

### Before implementing, verify:

- S: security-review.md describes itself as an AGGREGATOR — workflow begins "Receive pre-collected findings from..." (NOT "Dispatch...")
- S: security-review.md workflow has NO Task tool dispatch instructions
- S: security-review.md Output Contract: returns PASS/CONDITIONAL/FAIL verdict + deduplicated findings list
- S: security-trpc.md lists SmartSpecPro-specific tRPC anti-patterns: IDOR (`WHERE ... AND tenantId = ctx.tenantId` missing), missing Zod validation, auth middleware bypass, rate limiting on mutations, credit mutations without auth check, VITE_ leaking server secrets
- S: security-fastapi.md lists Python/LLM-specific risks: SQL injection via raw SQLAlchemy, missing `Depends(get_current_user)`, LLM prompt injection via user content, Celery task args with secrets, `print()` logging sensitive data, `os.environ` serialization
- S: security-frontend.md lists React-specific risks: XSS via `dangerouslySetInnerHTML`, JWT in localStorage (should be httpOnly cookie), missing CSRF protection, user-controlled HTML rendering, VITE_ leakage to client bundle, unauthenticated Wouter routes
- C: All 4 security agents' output examples use domain-appropriate file paths (FastAPI: `python-backend/app/...`, Frontend: `apps/web/client/src/...`, tRPC: `apps/web/server/routers/...`)
- S: README.md contains a complete registry table with all 17 agents: name, purpose, subagent_type, output format, when to use
- R: README.md registry table row count equals 17 (13 general + 4 security specialists)
- X: README.md table entries match actual files in `agents/` directory

---

## Section 09 — Native .claude/agents/ Definitions

### Before implementing, verify (per file):

For all 17 `ssp-*.md` files:
- S: Valid YAML frontmatter with all required fields: name, description, tools, model, permissionMode, maxTurns, memory, background, isolation (where applicable)
- S: File name follows `ssp-` prefix convention (e.g., `ssp-backend.md`)
- S: `name:` field matches filename without extension (e.g., `name: ssp-backend`)
- C: Fields match the agent configuration matrix (model, permissionMode, maxTurns, background, tools, isolation values)

**Agent-specific validation stubs:**

- ssp-research.md and ssp-error-detective.md: `tools: Read, Grep, Glob` (no Bash/Write/Edit)
- ssp-security-review.md: `permissionMode: plan`, `background: false`; system prompt describes aggregation, NOT dispatch; `tools: Read, Grep, Glob, Write` only
- All security auditor agents (ssp-security-trpc/fastapi/frontend): `tools: Read, Grep, Glob` only (read-only)
- All parallel writing agents (ssp-frontend, ssp-backend, ssp-python, ssp-test-qa, ssp-security): `isolation: worktree`
- ssp-database and ssp-infrastructure: `permissionMode: default` (not acceptEdits), `background: false`
- ssp-debugger: `maxTurns: 50`
- Description fields include "Use proactively when..." or "Use when..." trigger language
- System prompts are consistent with corresponding `skills/sub-agents/agents/NAME.md` identity + constraints

**Registry cross-reference:**

- R: All 17 ssp-*.md files listed in README.md registry table
- X: README.md `subagent_type` values match what `sub-agent-dispatch.md` documents for each agent
- C: ssp-*.md `description` fields trigger language aligns with the scenarios described in each agent's `agents/NAME.md` "When to use" guidance

---

## Final Validation Checklist (Post All Sections)

Run after all 9 sections are complete:

### Directory structure check:
- `deep_plan/skills/orchestra/SKILL.md` exists (400–600 lines)
- `deep_plan/skills/orchestra/references/` has exactly 13 reference files
- `deep_plan/skills/sub-agents/README.md` exists
- `deep_plan/skills/sub-agents/agents/` has exactly 17 `.md` files
- `deep_plan/skills/sub-agents/contracts/` has exactly 2 `.md` files
- `.claude/agents/` has exactly 17 `ssp-*.md` files

### Cross-system consistency:
- C: All 17 agent names appear in: `sub-agents/agents/`, `.claude/agents/`, `README.md` registry, and `sub-agent-dispatch.md` agent mapping
- C: All field names in task-packet.schema.md match the field names agents refer to in their Input Contract sections
- C: All output fields in result-report.schema.md match what SKILL.md Step 5 expects when parsing agent results
- X: Every reference file path cited in SKILL.md resolves to an existing file

### Smoke tests:
- Smoke: `/orchestra "Fix the typo in apps/web/README.md"` → trivial route → direct edit, no agents
- Smoke: `orchestra/platform.md` created on first invocation
- Smoke: `orchestra/plan.md` created with scope/risk classification after Step 1
- Smoke: For a medium scope task, `orchestra/contracts.md` created before any agent dispatch
