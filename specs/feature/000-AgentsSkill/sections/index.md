<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-foundation-scaffolding-contracts
section-02-task-analysis-routing
section-03-wave-planning-dispatch-platform
section-04-quality-gates-integration-security
section-05-artifact-compaction-integration
section-06-orchestra-skill-conductor
section-07-general-subagent-agents
section-08-security-specialists-readme
section-09-native-claude-agents
END_MANIFEST -->

# Implementation Sections Index — Orchestra & Sub-Agents Skill Pack

**Feature:** 000-AgentsSkill
**Plan:** claude-plan.md
**TDD:** claude-plan-tdd.md
**Total Sections:** 9 (markdown-only deliverables — no executable code)

---

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-foundation-scaffolding-contracts | — | all | Yes |
| section-02-task-analysis-routing | 01 | 03, 04, 06 | Yes (with 05, 07) |
| section-03-wave-planning-dispatch-platform | 01, 02 | 06 | Yes (with 04, 08) |
| section-04-quality-gates-integration-security | 01, 02 | 06 | Yes (with 03, 08) |
| section-05-artifact-compaction-integration | 01 | 06 | Yes (with 02, 07) |
| section-06-orchestra-skill-conductor | 02, 03, 04, 05 | 09 (indirectly) | No |
| section-07-general-subagent-agents | 01 | 08, 09 | Yes (with 02, 05) |
| section-08-security-specialists-readme | 07 | 09 | Yes (with 03, 04) |
| section-09-native-claude-agents | 07, 08 | — | No |

---

## Execution Order (Batch Plan)

```
Batch 1: section-01-foundation-scaffolding-contracts
         (no dependencies — must run first)

Batch 2: section-02-task-analysis-routing
         section-05-artifact-compaction-integration
         section-07-general-subagent-agents
         (all depend only on 01 — can run in parallel)

Batch 3: section-03-wave-planning-dispatch-platform
         section-04-quality-gates-integration-security
         section-08-security-specialists-readme
         (03,04 depend on 02; 08 depends on 07 — all batch 2 complete)

Batch 4: section-06-orchestra-skill-conductor
         section-09-native-claude-agents
         (06 depends on 02,03,04,05; 09 depends on 07,08 — all batch 3 complete)
```

---

## Section Summaries

### section-01-foundation-scaffolding-contracts

Creates the directory structure and contract schema files that all other sections depend on.

**Deliverables:**
- Directories: `deep_plan/skills/orchestra/`, `deep_plan/skills/orchestra/references/`, `deep_plan/skills/sub-agents/`, `deep_plan/skills/sub-agents/agents/`, `deep_plan/skills/sub-agents/contracts/`
- `deep_plan/skills/sub-agents/contracts/task-packet.schema.md` — 8-section Task Packet format (TASK, DOMAIN, FILES, CONTEXT, CONSTRAINTS, CONTRACT, OUTPUT, QUALITY GATE)
- `deep_plan/skills/sub-agents/contracts/result-report.schema.md` — 6-field Result Report (status, files_changed, findings, blockers, next_steps, quality_gate_results)
- `deep_plan/skills/orchestra/references/task-packet-format.md` — conductor-perspective view of Task Packet construction

**TDD validation:** All 5 directories exist; both schema files have correct field counts; task-packet-format.md covers all 8 sections.

---

### section-02-task-analysis-routing

Defines how orchestra classifies incoming tasks (scope + risk) and routes them to the correct execution path.

**Deliverables:**
- `deep_plan/skills/orchestra/references/task-analysis.md` — 5 scope levels, 4 risk levels, bug sub-tree (applied before scope table)
- `deep_plan/skills/orchestra/references/routing-decision.md` — 5 routes with decision logic and decision-mode options

**TDD validation:** Both files use SmartSpecPro-specific examples (tRPC, FastAPI, Drizzle); scope levels match routes 1:1; decision-mode options (ask_every_choice, smart_auto, auto_by_default) are defined.

---

### section-03-wave-planning-dispatch-platform

Defines parallel execution mechanics: how orchestra plans waves, dispatches agents across platforms, and enforces concurrency limits.

**Deliverables:**
- `deep_plan/skills/orchestra/references/wave-planning.md` — contract format, wave grouping, context injection pattern, parallelism constraints (max 4 concurrent, max 2 file-editing, 1 DB, 1 git), circular dependency detection
- `deep_plan/skills/orchestra/references/sub-agent-dispatch.md` — all 17 agent type mappings, platform-specific dispatch patterns, Codex template injection, pre-merge gate auto-trigger
- `deep_plan/skills/orchestra/references/platform-compat.md` — detection flow, claude-code/codex/open-code modes, scope cap for open-code, platform reset docs

**TDD validation:** sub-agent-dispatch.md documents all 17 agents; platform-compat.md has concrete Task Packet construction examples for all 3 modes; open-code scope cap warning is present.

---

### section-04-quality-gates-integration-security

Defines all quality gates, result merging, and the pre-merge security audit protocol.

**Deliverables:**
- `deep_plan/skills/orchestra/references/quality-gates.md` — 6 gate types with exact SmartSpecPro commands, trigger conditions, blocking rules, 3-attempt retry protocol
- `deep_plan/skills/orchestra/references/result-integration.md` — conflict detection, merge strategy (same-section → manual; conflicting → contract-compliant wins), escalation to user
- `deep_plan/skills/orchestra/references/security-review-protocol.md` — trigger conditions, orchestra-dispatches-3-specialists flow, severity thresholds (PASS/CONDITIONAL/FAIL), auto-approve logging rule, finding categories for SmartSpecPro stack

**TDD validation:** Gate commands use exact syntax from CLAUDE.md; security-review-protocol.md documents that orchestra (NOT security-review.md) dispatches the 3 specialists; CONDITIONAL auto-approve logging requirement is explicit.

---

### section-05-artifact-compaction-integration

Documents the `orchestra/` directory lifecycle, snapshot schema, session resume algorithm, and handoff to deep-* skills.

**Deliverables:**
- `deep_plan/skills/orchestra/references/artifact-management.md` — full file inventory (11 files), lifecycle rules, git tracking recommendation, shared-session collision note
- `deep_plan/skills/orchestra/references/compaction-safety.md` — CHC protocol (green/yellow/red), snapshot-before-compact for red state, canonical snapshot JSON schema
- `deep_plan/skills/orchestra/references/session-resume.md` — R4 algorithm (Read, Restore, Reconcile, Resume) with concrete examples
- `deep_plan/skills/orchestra/references/skill-pack-integration.md` — large/project scope handoff to deep-plan-codex/deep-project, backlog.md artifact tracking, resume verification

**TDD validation:** snapshot.json schema has all 9 fields (timestamp, task_description, phase, completed_waves, in_progress, pending_waves, decisions, blockers, key_files); artifact-management.md covers all 11 orchestra/ files; skill-pack-integration.md documents the `/orchestra resume` verification check.

---

### section-06-orchestra-skill-conductor

The main entry point SKILL.md for the `/orchestra` command. Orchestrates all reference files across 8 steps.

**Deliverables:**
- `deep_plan/skills/orchestra/SKILL.md` — 400–600 lines, 8 steps (Step 0 through Step 8), YAML frontmatter

**Key requirements:**
- Step 0: Banner + snapshot resume-vs-fresh-start prompt
- Step 1: Task analysis (reads task-analysis.md)
- Step 2: Routing decision + decision-mode setup
- Step 3: Contract + wave planning (medium+ scope only)
- Step 4: Platform detection + agent dispatch
- Step 5: Result integration + pre-merge security gate trigger check
- Step 6: Quality gates + security specialist dispatch (orchestra directly, not delegated)
- Step 7: Progress update + auto-approval logging
- Step 8: CHC + red-state snapshot + repeat or final summary

**TDD validation:** All 8 steps present with reference file citations; AskUserQuestion options match spec exactly; STOP conditions tabulated; lazy reference reading implemented.

---

### section-07-general-subagent-agents

13 general-purpose agent definition files for the sub-agents skill pack.

**Deliverables** (all in `deep_plan/skills/sub-agents/agents/`):
- `research.md`, `architect.md`, `frontend.md`, `backend.md`, `python.md`, `database.md`, `test-qa.md`, `reviewer.md`, `security.md`, `debugger.md`, `error-detective.md`, `infrastructure.md`, `docs-release.md`

Each file follows the 8-section template: Identity, Capabilities, Constraints, Input Contract, Output Contract, Workflow, Quality Checklist, Error Handling.

**Key agent requirements:**
- `debugger.md`: 3-phase UNDERSTAND→PLAN→FIX with 3-attempt limit
- `database.md`: References CLAUDE.md Database Safety Protocol explicitly
- `error-detective.md`: Knows JSONL audit log schema, traceId query patterns
- `infrastructure.md`: References CRITICAL DEPLOYMENT RULES (systemd only, validate-all-configs.sh)
- `backend.md`: Zod validation, auth/tenant isolation check on every endpoint

**TDD validation:** Each file has all 8 sections; SmartSpecPro-specific constraints embedded; correct `subagent_type` documented.

---

### section-08-security-specialists-readme

4 security specialist agent files and the sub-agents README registry.

**Deliverables** (all in `deep_plan/skills/sub-agents/agents/`):
- `security-review.md` — **AGGREGATOR only** (receives findings, never dispatches Task calls)
- `security-trpc.md` — tRPC IDOR, Zod, tenantId, auth middleware, rate limiting, VITE_ leakage
- `security-fastapi.md` — SQL injection, missing auth Depends, LLM prompt injection, Celery secrets, print() logging
- `security-frontend.md` — XSS via dangerouslySetInnerHTML, JWT storage, CSRF, VITE_ leakage, Wouter auth

**Also:**
- `deep_plan/skills/sub-agents/README.md` — complete 17-agent registry table (name, purpose, subagent_type, output format, when to use), dispatch guide, "add a new agent" guide, platform compatibility matrix

**TDD validation:** security-review.md workflow begins "Receive pre-collected findings from..." with no Task calls; output examples use domain-appropriate file paths; README has 17 rows.

---

### section-09-native-claude-agents

17 native `.claude/agents/ssp-*.md` files that enable auto-dispatch in Claude Code.

**Deliverables** (all in `/home/dev/projects/SmartSpecPro/.claude/agents/`):
- `ssp-research.md`, `ssp-architect.md`, `ssp-frontend.md`, `ssp-backend.md`, `ssp-python.md`, `ssp-database.md`, `ssp-test-qa.md`, `ssp-reviewer.md`, `ssp-security.md`, `ssp-debugger.md`, `ssp-error-detective.md`, `ssp-security-review.md`, `ssp-security-trpc.md`, `ssp-security-fastapi.md`, `ssp-security-frontend.md`, `ssp-infrastructure.md`, `ssp-docs-release.md`

Each file: YAML frontmatter (name, description, tools, model, permissionMode, maxTurns, memory, background, isolation) + system prompt from corresponding agents/NAME.md.

**Key configuration rules:**
- Read-only agents: `tools: Read, Grep, Glob` (no Bash/Write/Edit)
- Parallel writing agents: `isolation: worktree`
- `ssp-database`, `ssp-infrastructure`: `permissionMode: default`, `background: false`
- `ssp-debugger`: `maxTurns: 50`
- `ssp-security-review`: `permissionMode: plan`, system prompt is aggregation-only

**TDD validation:** All 17 files with ssp- prefix; YAML frontmatter fields match agent configuration matrix; isolation: worktree on all parallel writing agents; no `background: true` + `permissionMode: default` combination.

---

## File Count Summary

| Location | Expected Files |
|----------|---------------|
| `deep_plan/skills/orchestra/` | 1 SKILL.md |
| `deep_plan/skills/orchestra/references/` | 13 reference files |
| `deep_plan/skills/sub-agents/` | 1 README.md |
| `deep_plan/skills/sub-agents/agents/` | 17 agent files |
| `deep_plan/skills/sub-agents/contracts/` | 2 contract schema files |
| `.claude/agents/` | 17 ssp-*.md files |
| **Total** | **~51 markdown files** |
