I now have all the context I need. Let me produce the section content for `section-02-task-analysis-routing.md`.

# Section 02: Task Analysis & Routing

## Overview

This section creates the two reference files that give orchestra its "brain" for classifying tasks and choosing execution paths. These are markdown documents read by SKILL.md at runtime — there is no executable code. An implementer reads this section, produces both files, and verifies the TDD checklist before declaring the section complete.

**Depends on:** `section-01-foundation-scaffolding-contracts` (directories must exist before writing files here)

**Blocks:** `section-03-wave-planning-dispatch-platform`, `section-04-quality-gates-integration-security`, `section-06-orchestra-skill-conductor`

---

## Deliverables

| File | Location | Est. Size |
|------|----------|-----------|
| `task-analysis.md` | `deep_plan/skills/orchestra/references/task-analysis.md` | 150–250 lines |
| `routing-decision.md` | `deep_plan/skills/orchestra/references/routing-decision.md` | 150–250 lines |

Both files live inside the `references/` subdirectory created in section 01. Do not create them anywhere else — SKILL.md reads them with relative path `references/task-analysis.md`.

---

## TDD Validation Checklist

Perform these checks after writing the files. All must pass before the section is complete.

**Structure checks (`task-analysis.md`):**
- [x] S: Covers all 5 scope levels (trivial, small, medium, large, project) with explicit definitions
- [x] S: Covers all 4 risk levels (low, medium, high, critical) with explicit definitions
- [x] S: Contains a bug sub-tree section that is applied BEFORE the scope table, not after
- [x] S: Uses SmartSpecPro-specific examples — must reference tRPC, FastAPI, Drizzle ORM, or specific file paths like `apps/web/server/routers/` (not generic examples)

**Structure checks (`routing-decision.md`):**
- [x] S: Covers all 5 routes: direct-edit, single-agent, multi-agent-waves, deep-plan-codex chain, full-pipeline
- [x] S: Each route has a concrete execution description (not just a name)
- [x] S: The three decision-mode options are defined: `ask_every_choice`, `smart_auto`, `auto_by_default`
- [x] S: Uses SmartSpecPro-specific examples (same requirement as above)

**Contract consistency:**
- [x] C: The 5 scope levels in `task-analysis.md` map one-to-one to the 5 routes in `routing-decision.md` — no orphaned levels
- [x] C: Route names used in `routing-decision.md` exactly match what SKILL.md Step 2 will reference (see section-06 spec: "trivial", "small", "medium", "large", "project")
- [x] C: The three `decision-mode` option identifiers (`ask_every_choice`, `smart_auto`, `auto_by_default`) are spelled consistently across both files and will match SKILL.md Step 2

**Cross-reference check:**
- [x] X: Any references to other skills (`/deep-plan-codex`, `/deep-project`, `/deep-implement`) use the invocation patterns that `skill-pack-integration.md` (section 05) will document — do not invent new invocation syntax here; use `@spec-file.md` argument pattern

---

## File 1: `task-analysis.md`

**Absolute path:** `/home/dev/projects/SmartSpecPro/deep_plan/skills/orchestra/references/task-analysis.md`

### Purpose

This file is read by SKILL.md at Step 1. Orchestra reads it to classify the incoming request into a scope level and risk level, then writes the result to `orchestra/plan.md`. The document is written as instructions to the conductor, not as a reference for the end user.

### Required Structure

The file must contain these sections in this order:

**1. Preamble — Classification Order**

State explicitly: scope and risk are classified in parallel. The bug sub-tree is applied FIRST (before scope classification) when the input is a bug/error report.

**2. Bug Sub-Tree (applied first)**

A decision tree for bug/error inputs. The conductor must check these branches in order before the scope table:
- Is this a security vulnerability? → route to security specialist immediately (dispatch `ssp-security` or `ssp-security-trpc`/`ssp-security-fastapi`/`ssp-security-frontend` based on domain)
- Is this an error log / audit trail investigation? → route to `error-detective`
- Is this a Python-only error? → route to `debugger` with `subagent_type: error-debugging:debugger`, Python context
- Is the affected file known? → route to `debugger` with that file as context
- Is the affected file unknown? → dispatch `research` first, then `debugger` with research findings

After any bug route resolves, mandatory post-fix waves apply (quality gates, security review if applicable).

**3. Scope Classification Table**

Apply first-match-wins in this strict order:

| Priority | Scope | Classification Rule |
|----------|-------|---------------------|
| 1 | `project` | Request is "new feature/module/service/design" AND no spec file exists for it |
| 2 | `large` | File count > 10 OR DB migration involved OR domains affected >= 3 |
| 3 | `medium` | File count 4–10 OR 2 domains with inter-dependencies |
| 4 | `small` | File count 1–3 AND single domain AND low risk |
| 5 | `trivial` | Single file AND clear fix AND no schema changes AND no auth changes |

Include SmartSpecPro-specific examples for each level:
- `trivial` example: Fix a typo in `apps/web/client/src/pages/Login.tsx`
- `small` example: Add a new field to an existing tRPC procedure input with Zod validation
- `medium` example: Add a new tRPC router (`apps/web/server/routers/`) + corresponding React page (`apps/web/client/src/pages/`) + shared Zod schema
- `large` example: New multi-tenant feature touching Drizzle schema migration + tRPC routers + React UI + Python Celery task (4 domains, DB migration)
- `project` example: New "Skills Marketplace" module with no existing spec file — full deep-plan pipeline required

**4. Risk Classification Table**

Applied in parallel with scope (not as a gating step):

| Risk | Classification Rule |
|------|---------------------|
| `low` | Style/display/copy changes, no data access, no auth changes |
| `medium` | New UI component with tRPC call, new tRPC procedure (no auth change), new Python Celery task |
| `high` | Auth middleware change, new Drizzle columns with NOT NULL, encryption/secrets handling, multi-tenant data access, new `tenantId` isolation |
| `critical` | Auth bypass possible, schema DROP/TRUNCATE, credential/key exposure, payment or billing path change |

Include SmartSpecPro-specific examples for each level:
- `low` example: Updating a Tailwind class in a presentational component
- `medium` example: Adding a new `trpc.router.procedure` to fetch user settings
- `high` example: Adding a new column to `users` table with a NOT NULL constraint + backfill
- `critical` example: Modifying `isAuthenticated` middleware in `apps/web/server/middleware/`

**5. Classification Output Format**

The conductor writes this block to `orchestra/plan.md`:

```
## Task Classification
- Scope: [trivial|small|medium|large|project]
- Risk: [low|medium|high|critical]
- Affected domains: [list]
- Estimated file count: [N]
- Chosen route: [route name from routing-decision.md]
- Classification notes: [brief reasoning]
```

---

## File 2: `routing-decision.md`

**Absolute path:** `/home/dev/projects/SmartSpecPro/deep_plan/skills/orchestra/references/routing-decision.md`

### Purpose

This file is read by SKILL.md at Step 2. After task classification, orchestra reads this document to determine which execution path to follow. It also defines the `decision-mode` options that control how much orchestra pauses for architectural choices.

### Required Structure

**1. Route Decision Table**

| Scope | Route Name | Execution |
|-------|------------|-----------|
| `trivial` | `direct-edit` | Conductor edits the file directly using Write/Edit tools, no sub-agents dispatched |
| `small` | `single-agent` | One Task tool call with a complete Task Packet; pick agent type from `sub-agent-dispatch.md` |
| `medium` | `multi-agent-waves` | Build contracts + wave plan (Step 3), dispatch multiple agents in parallel waves (Step 4) |
| `large` | `deep-plan-codex-chain` | Create requirement spec file, tell user to run `/deep-plan-codex @spec-file.md`, log expected outputs to `orchestra/backlog.md`, resume after user confirms |
| `project` | `full-pipeline` | Create high-level requirements document, tell user to run `/deep-project @requirements.md`, then apply `deep-plan-codex-chain` per split |

**2. Route Detail Sections**

For each route, include:
- Trigger condition (scope level)
- Step-by-step execution description (3–8 bullet points)
- What orchestra writes to `orchestra/plan.md` at this route
- SmartSpecPro-specific example of when this route fires

**direct-edit details:**
- Read the target file, apply the change inline using Write or Edit tool
- No Task tool call, no contract file needed
- Write to `orchestra/plan.md`: route = direct-edit, files_changed list
- Example: fix a typo in `apps/web/README.md`

**single-agent details:**
- Pick the correct agent type from sub-agent-dispatch.md for the domain (frontend, backend, python, database, etc.)
- Build a Task Packet following `task-packet-format.md`
- Dispatch as a single Task tool call
- Apply quality gates after the agent completes
- Example: add a new tRPC input field with Zod — dispatch `ssp-backend` agent

**multi-agent-waves details:**
- Proceed to Step 3 (contract + wave planning)
- Contracts must be written to `orchestra/contracts.md` before any agent dispatch
- Waves dispatched in parallel; results fed forward as structured context
- Example: new presentation export feature touching `apps/web/server/services/presentationPlaybackExport.ts` + `apps/web/client/src/pages/PresentationEditor.tsx` + Python Celery export task

**deep-plan-codex-chain details:**
- Orchestra creates a requirements spec file (usually `specs/feature/NNN-FeatureName/spec.md`)
- Tells user: "Run `/deep-plan-codex @specs/feature/NNN-FeatureName/spec.md` to generate the implementation plan."
- Logs expected artifacts to `orchestra/backlog.md`: `sections/index.md`, `claude-plan.md`, `claude-plan-tdd.md`
- Pauses — does NOT invoke deep-plan-codex itself (orchestrator creates spec, human runs the skill)
- On `/orchestra resume`: verifies artifact paths exist before continuing; if missing, reports the gap
- Note: orchestra does NOT replicate any deep-* functionality. Its job is spec creation + handoff.
- Example: "Add a full RAG pipeline to SmartSpecPro" — too large for waves, needs deep-plan

**full-pipeline details:**
- Creates a top-level requirements document covering all splits
- Tells user to run `/deep-project @requirements.md`
- After deep-project produces splits, apply `deep-plan-codex-chain` for each split sequentially
- Example: "Build the Skills Marketplace module from scratch" — new module with no existing code

**3. Decision Mode**

The decision mode controls how much orchestra pauses for architectural choices. It is set once (written to `orchestra/decision-mode.md`) and applies for the rest of the session.

| Mode | Behavior |
|------|----------|
| `ask_every_choice` | Orchestra pauses before every architectural choice, routing decision, agent selection, and conflict resolution |
| `smart_auto` | Orchestra proceeds autonomously for low/medium risk decisions; pauses for high/critical risk decisions and gate failures |
| `auto_by_default` | Orchestra proceeds autonomously for all decisions including HIGH security findings (prominently logged); only stops on CRITICAL security gate failures or 3-attempt exhaustion |

How decision mode is set (SKILL.md Step 2 AskUserQuestion):
```
Options:
1. ask_every_choice — I want to approve each architectural decision
2. smart_auto — Proceed autonomously for low risk, ask me for high/critical
3. auto_by_default — Proceed fully autonomously (I'll review the log)
```

Once selected, write to `orchestra/decision-mode.md`:
```
mode: [chosen-mode]
set_at: [ISO timestamp]
```

Do not ask again in the same session. If `orchestra/decision-mode.md` exists at Step 2, read it and apply the mode without prompting.

**4. Large/Project Constraint**

This section must emphasize: for `large` and `project` scopes, orchestra creates the specification artifact and defers to the deep-* skill. It does NOT replicate deep-plan or deep-implement functionality. This is a hard boundary — any attempt to inline deep-plan behavior into orchestra would violate the skill separation principle.

**5. SmartSpecPro Route Examples Summary**

A quick-reference table tying real SmartSpecPro scenarios to routes:

| Scenario | Scope | Route |
|----------|-------|-------|
| Fix typo in Login.tsx | trivial | direct-edit |
| Add Zod field to existing tRPC endpoint | small | single-agent (ssp-backend) |
| New tRPC router + React page + shared schema | medium | multi-agent-waves |
| New feature: RAG pipeline (DB + Python + UI) | large | deep-plan-codex-chain |
| New module: Skills Marketplace (no spec yet) | project | full-pipeline |
| Bug: 500 error in `python-backend/app/api/v1/` | bug → file known | debugger route → post-fix waves |
| Security: suspected auth bypass in isAuthenticated | bug → security | security specialist dispatch |

---

## Implementation Notes

**Writing tone:** Both files are written as operational instructions to the conductor (orchestra), using imperative voice ("Apply the bug sub-tree first", "Write the result to..."). They are not user-facing documentation.

**Do not cross-reference files not yet written:** `routing-decision.md` may reference `skill-pack-integration.md` and `sub-agent-dispatch.md` by name for context, but do not copy their content. Section 05 owns `skill-pack-integration.md`; section 03 owns `sub-agent-dispatch.md`.

**Scope level naming is a contract:** The exact strings `trivial`, `small`, `medium`, `large`, `project` are used as keys throughout SKILL.md and other reference files. Do not introduce synonyms or alternate capitalization.

**Bug sub-tree placement:** The bug sub-tree section in `task-analysis.md` must appear before the scope classification table, not after. The conductor must see it first so that bug routing takes precedence over size-based routing.

**decision-mode.md is an artifact, not a reference file:** The `orchestra/decision-mode.md` file is a runtime artifact written during a session. `routing-decision.md` only defines the options and behavior — it does not create the artifact.

**Avoiding generic examples:** Every example in both files must reference actual SmartSpecPro paths or components. Do not use placeholder names like "MyComponent" or "someRoute". Use real names: `tRPC`, `presentationRouter`, `apps/web/server/routers/`, `python-backend/app/api/v1/`, etc.