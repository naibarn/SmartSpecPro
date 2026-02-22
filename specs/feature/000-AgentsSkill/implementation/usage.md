# AgentsSkill — Usage Guide

**Feature:** 000-AgentsSkill
**Implementation complete:** 9/9 sections
**Total commits:** 9

---

## What Was Built

The SmartSpecPro AI Orchestra system — a full multi-agent orchestration framework enabling parallel, domain-specialized AI development.

---

## Key Entry Points

### 1. Orchestra Skill (main conductor)

```
skills/orchestra/SKILL.md
.claude/commands/orchestra.md   ← registered as /orchestra command
```

Invoke via `/orchestra`. The conductor:
- Analyzes incoming tasks and routes to the correct domain agents
- Plans wave-based parallel execution
- Enforces quality gates (code review + security gate) before merge
- Manages decision mode (`ask_always` vs `auto_by_default`)

### 2. Sub-Agent Library

```
skills/sub-agents/agents/   ← 17 agent definition files
skills/sub-agents/README.md ← registry + platform matrix
```

All 17 specialized agents — from `research.md` through `security-review.md`.

### 3. Native Claude Code Agents

```
.claude/agents/ssp-*.md   ← 17 native definitions
```

Claude Code will auto-dispatch these agents based on `description:` field matching. They can also be invoked directly by name.

---

## Agent Roster

| Agent | File | Role |
|---|---|---|
| ssp-research | `.claude/agents/ssp-research.md` | Codebase research (read-only) |
| ssp-architect | `.claude/agents/ssp-architect.md` | Architecture design (read-only) |
| ssp-frontend | `.claude/agents/ssp-frontend.md` | React/UI implementation |
| ssp-backend | `.claude/agents/ssp-backend.md` | tRPC/Drizzle implementation |
| ssp-python | `.claude/agents/ssp-python.md` | FastAPI/Celery implementation |
| ssp-database | `.claude/agents/ssp-database.md` | Schema/migrations (sequential) |
| ssp-test-qa | `.claude/agents/ssp-test-qa.md` | Tests and QA |
| ssp-reviewer | `.claude/agents/ssp-reviewer.md` | Code review (read-only) |
| ssp-security | `.claude/agents/ssp-security.md` | Security audit + fix |
| ssp-debugger | `.claude/agents/ssp-debugger.md` | Bug investigation (sequential) |
| ssp-error-detective | `.claude/agents/ssp-error-detective.md` | Audit log investigation (read-only) |
| ssp-infrastructure | `.claude/agents/ssp-infrastructure.md` | Docker/Nginx/systemd (sequential) |
| ssp-docs-release | `.claude/agents/ssp-docs-release.md` | Changelogs + release docs |
| ssp-security-review | `.claude/agents/ssp-security-review.md` | Security gate aggregator |
| ssp-security-trpc | `.claude/agents/ssp-security-trpc.md` | tRPC security audit (read-only) |
| ssp-security-fastapi | `.claude/agents/ssp-security-fastapi.md` | FastAPI security audit (read-only) |
| ssp-security-frontend | `.claude/agents/ssp-security-frontend.md` | Frontend security audit (read-only) |

---

## Pre-Merge Security Gate

The security gate flow (orchestrated by SKILL.md):

1. **Parallel dispatch** — 3 specialist auditors run simultaneously:
   - `ssp-security-trpc` → scans `apps/web/server/routers/`
   - `ssp-security-fastapi` → scans `python-backend/app/`
   - `ssp-security-frontend` → scans `apps/web/client/src/`

2. **Aggregation** — `ssp-security-review` receives all 3 findings, deduplicates, applies threshold:
   - 0 CRITICAL + 0 HIGH → **PASS**
   - 0 CRITICAL + N HIGH → **CONDITIONAL PASS** (user approval or auto-approve with log)
   - Any CRITICAL → **FAIL** (blocks merge)

3. Output written to `orchestra/risk_register.md`

---

## Contracts

```
skills/sub-agents/contracts/
├── task-packet.schema.md       ← How orchestra dispatches agents
└── result-report.schema.md     ← How agents return results
```

---

## Section Commits

| Section | Commit | Description |
|---|---|---|
| 01 foundation | (earlier) | Scaffold + contracts |
| 02 task-analysis | (earlier) | Routing logic |
| 03 wave-planning | (earlier) | Parallel dispatch platform |
| 04 quality-gates | (earlier) | Review + security integration |
| 05 artifact-compaction | (earlier) | Context management |
| 06 orchestra-conductor | (earlier) | SKILL.md conductor |
| 07 general-agents | (earlier) | 13 general sub-agents |
| 08 security-specialists | 9c6079f | 4 security agents + README |
| 09 native-agents | 45d5940 | 17 .claude/agents/ definitions |
