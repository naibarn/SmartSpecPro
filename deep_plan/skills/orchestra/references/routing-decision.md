# Routing Decision Reference

This document is read by SKILL.md at **Step 2**. After task classification (Step 1), apply the route decision table to choose the execution path. Then set or read the `decision-mode` for this session.

**Scope-to-route mapping is a hard contract.** The scope level names (`trivial`, `small`, `medium`, `large`, `project`) must match the exact strings produced by `task-analysis.md` and referenced by SKILL.md Steps 3–8.

---

## Route Decision Table

| Scope | Route Name | Execution Model |
|-------|------------|-----------------|
| `trivial` | `direct-edit` | Conductor edits the file directly — no sub-agent dispatched |
| `small` | `single-agent` | One Task tool call with a complete Task Packet |
| `medium` | `multi-agent-waves` | Contract + wave plan (Step 3), then parallel agent dispatch (Step 4) |
| `large` | `deep-plan-codex-chain` | Spec file creation + handoff to `/deep-plan-codex` |
| `project` | `full-pipeline` | Requirements doc + handoff to `/deep-project`, then codex chain per split |

---

## Route: `direct-edit`

**Trigger:** Scope = `trivial`

**Execution steps:**
1. Read the target file using the Read tool.
2. Apply the change inline using the Write or Edit tool.
3. No Task tool call, no contract file, no agent dispatch.
4. Run the applicable quality gate (TypeScript check for `.ts` files; ruff for `.py` files).
5. Write result to `orchestra/plan.md`.

**What to write in `orchestra/plan.md`:**
```
route: direct-edit
files_changed:
  - /absolute/path/to/file — description of change
quality_gate: [passed|skipped]
```

**SmartSpecPro example:**
Fix a typo in the app name in `apps/web/README.md`. Conductor reads the file, makes the edit, marks complete. No quality gate needed for a pure markdown file.

**Decision-mode effect:** In all modes, `direct-edit` proceeds without prompting.

---

## Route: `single-agent`

**Trigger:** Scope = `small`

**Execution steps:**
1. Identify the affected domain (CMD-1 through CMD-6).
2. Select the correct `subagent_type` from `sub-agent-dispatch.md`.
3. Build a Task Packet following `task-packet-format.md`. CONTRACT field = `N/A`.
4. Dispatch via a single Task tool call.
5. Read the agent's Result Report.
6. Run quality gates from the Task Packet's QUALITY GATE section.
7. If `status: failed` → apply retry rules (see `quality-gates.md`, 3-attempt limit).
8. Write result to `orchestra/plan.md`.

**What to write in `orchestra/plan.md`:**
```
route: single-agent
agent: [agent name used]
files_changed: [from Result Report]
quality_gate: [passed|failed|partial]
```

**SmartSpecPro example:**
Add Zod validation for a new `category` enum to the `skills.create` tRPC procedure in `apps/web/server/routers/skills.ts`. Dispatch `ssp-backend` (CMD-2 Backend). Quality gate: `cd apps/web && pnpm check && pnpm test`.

**Decision-mode effect:**
- `ask_every_choice`: Confirm agent selection before dispatching.
- `smart_auto`: Proceed automatically (low risk).
- `auto_by_default`: Proceed automatically.

---

## Route: `multi-agent-waves`

**Trigger:** Scope = `medium`

**Execution steps:**
1. Proceed to Step 3 (contract + wave planning, see `wave-planning.md`).
2. Write shared interface contracts to `orchestra/contracts.md` before any agent dispatch.
3. Group tasks into waves — agents within a wave run in parallel; waves run sequentially.
4. Dispatch wave 1 agents (max 4 concurrent). Wait for all results.
5. Feed wave 1 results as structured CONTEXT into wave 2 packets.
6. Continue until all waves complete.
7. Run quality gates after each wave (TypeScript check, tests — see `quality-gates.md`).
8. Run pre-merge security gate if any new endpoints were added (see `security-review-protocol.md`).
9. Write final result to `orchestra/plan.md`.

**What to write in `orchestra/plan.md`:**
```
route: multi-agent-waves
waves_completed: N
agents_dispatched: [list]
quality_gates: [per-wave results]
security_gate: [passed|skipped|failed]
```

**SmartSpecPro example:**
New presentation export feature: Wave 1 dispatches `ssp-backend` (adds `presentationExport` tRPC procedure in `apps/web/server/routers/`) + `ssp-python` (adds Celery export task in `python-backend/app/tasks/`). Wave 2 dispatches `ssp-frontend` (builds export UI in `apps/web/client/src/pages/PresentationEditor.tsx`) after Wave 1 confirms the contract.

**Decision-mode effect:**
- `ask_every_choice`: Confirm each wave plan and agent selection before dispatch.
- `smart_auto`: Auto-proceed for low/medium risk waves; pause before HIGH risk agents.
- `auto_by_default`: Proceed autonomously for all waves; log decisions.

---

## Route: `deep-plan-codex-chain`

**Trigger:** Scope = `large`

**Execution steps:**
1. Create a requirements spec file: `specs/feature/NNN-FeatureName/spec.md`. Populate it with the user's request, context, affected domains, and initial constraints.
2. Tell the user:
   > "This request requires detailed planning. Please run:
   > `/deep-plan-codex @specs/feature/NNN-FeatureName/spec.md`
   > When the plan is ready, run `/orchestra resume` to continue implementation."
3. Log expected artifacts to `orchestra/backlog.md`:
   - `specs/feature/NNN-FeatureName/sections/index.md`
   - `specs/feature/NNN-FeatureName/claude-plan.md`
   - `specs/feature/NNN-FeatureName/claude-plan-tdd.md`
4. **STOP** — do not invoke `/deep-plan-codex` yourself. Orchestra creates the spec; the human runs the skill.
5. On `/orchestra resume`: read `orchestra/backlog.md`, verify the expected artifacts exist at their declared paths. If missing, report the gap. If present, proceed to wave-based implementation using the section files.

**Hard boundary:** Orchestra does NOT replicate deep-plan-codex functionality. Its role is spec creation + handoff + resume verification. Any attempt to inline deep-plan behavior into orchestra violates skill separation.

**What to write in `orchestra/plan.md`:**
```
route: deep-plan-codex-chain
spec_file: specs/feature/NNN-FeatureName/spec.md
status: awaiting_deep_plan
backlog: orchestra/backlog.md
```

**SmartSpecPro example:**
"Add a full RAG pipeline to SmartSpecPro" — requires new DB tables, Python vector store integration, tRPC API, and React UI. Too large for direct waves. Orchestra creates `specs/feature/019-RAG-Pipeline/spec.md` and hands off to `/deep-plan-codex`.

**Decision-mode effect:** In all modes, the handoff message is always shown to the user — this is a hard stop requiring human action.

---

## Route: `full-pipeline`

**Trigger:** Scope = `project`

**Execution steps:**
1. Create a top-level requirements document: `specs/feature/NNN-FeatureName/requirements.md`. Cover all sub-features, integration points, and constraints.
2. Tell the user:
   > "This is a new project module. Please run:
   > `/deep-project @specs/feature/NNN-FeatureName/requirements.md`
   > This will produce a split plan. Once complete, run `/orchestra resume` to apply the deep-plan-codex-chain for each split."
3. Log expected outputs to `orchestra/backlog.md`.
4. **STOP** — do not invoke `/deep-project` yourself.
5. On `/orchestra resume`: verify that `/deep-project` produced the expected split files. Apply `deep-plan-codex-chain` sequentially for each split.

**What to write in `orchestra/plan.md`:**
```
route: full-pipeline
requirements_file: specs/feature/NNN-FeatureName/requirements.md
status: awaiting_deep_project
backlog: orchestra/backlog.md
```

**SmartSpecPro example:**
"Build the Skills Marketplace module" — no existing spec, no code. Orchestra creates `specs/feature/022-SkillsMarketplace/requirements.md` and hands off to `/deep-project`.

**Decision-mode effect:** In all modes, the handoff message is always shown — hard stop requiring human action.

---

## Decision Mode

The decision mode controls how much orchestra pauses for choices throughout execution. It is set **once per session** at Step 2. If `orchestra/decision-mode.md` already exists, read it and apply the saved mode without prompting.

### Setting the Mode (AskUserQuestion at Step 2)

```
Question: "How should orchestra handle decision points?"

Options:
  1. ask_every_choice
     Pause before every architectural choice, routing decision, agent selection,
     and conflict resolution. Best for first-time use or high-stakes sessions.

  2. smart_auto  [Recommended]
     Proceed autonomously for low/medium risk decisions.
     Pause for: high/critical risk agents, quality gate failures, security findings.

  3. auto_by_default
     Proceed fully autonomously. HIGH security findings are logged prominently but
     do not pause. Only stops on CRITICAL gate failures or 3-attempt exhaustion.
```

### Mode Behavior Reference

| Decision Point | ask_every_choice | smart_auto | auto_by_default |
|----------------|-----------------|------------|-----------------|
| Route selection | Ask | Auto (all routes) | Auto |
| Agent selection (low risk) | Ask | Auto | Auto |
| Agent selection (high risk) | Ask | **Ask** | Auto (log) |
| Wave plan confirmation | Ask | Auto | Auto |
| Quality gate failure | Ask | **Ask** | Auto-retry once |
| CRITICAL gate failure | Ask | **Ask** | **Ask** |
| Security finding HIGH | Ask | **Ask** | Auto-log |
| Security finding CRITICAL | Ask | **Ask** | **Ask** |
| 3-attempt exhaustion | Ask | **Ask** | **Ask** |

### Writing the Mode Artifact

After the user selects a mode, write to `orchestra/decision-mode.md`:

```
mode: [chosen-mode]
set_at: [ISO 8601 timestamp, e.g. 2026-02-22T19:30:00Z]
```

Do not ask again in the same session unless the user explicitly requests a mode change.

---

## Large/Project Constraint (Hard Boundary)

For `large` and `project` scopes, orchestra's role is **specification creation and handoff only**:

- ✅ Orchestra creates spec/requirements files
- ✅ Orchestra resumes implementation after deep-* skills complete
- ✅ Orchestra verifies artifact existence on resume
- ❌ Orchestra does NOT run deep-plan analysis steps
- ❌ Orchestra does NOT generate section files
- ❌ Orchestra does NOT inline any deep-implement behavior

Violating this boundary would duplicate functionality, cause context exhaustion, and produce inconsistent plans.

---

## SmartSpecPro Route Examples — Quick Reference

| Scenario | Scope | Route |
|----------|-------|-------|
| Fix typo in `apps/web/client/src/pages/Login.tsx` | trivial | direct-edit |
| Add Zod field to `apps/web/server/routers/skills.ts` | small | single-agent (ssp-backend) |
| New tRPC router + React page + shared schema (2 domains, inter-dependent) | medium | multi-agent-waves (two-domain inter-dependency triggers medium even at 3-5 files) |
| New RAG pipeline (DB + Python + tRPC + UI, 4 domains) | large | deep-plan-codex-chain |
| New Skills Marketplace module (no spec) | project | full-pipeline |
| Bug: 500 in `python-backend/app/api/v1/rag_scopes.py` | bug → file known | ssp-debugger → post-fix waves |
| Bug: unknown error, audit log investigation needed | bug → file unknown | ssp-research → ssp-debugger |
| Security: suspected auth bypass in `middleware/auth.ts` | bug → security | ssp-security-trpc + ssp-security-review |
| Add Celery task (Python only, no DB or UI) | small | single-agent (ssp-python) |
| New multi-tenant feature: DB + tRPC + React + Celery | large | deep-plan-codex-chain |
