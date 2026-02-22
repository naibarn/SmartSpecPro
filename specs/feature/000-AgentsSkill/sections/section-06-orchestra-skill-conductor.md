Now I have everything I need to write the section. Let me compose the complete section content for `section-06-orchestra-skill-conductor.md`.

# Section 06 — Orchestra SKILL.md (Main Conductor)

## Overview

This section creates the main entry point for the `/orchestra` skill: `deep_plan/skills/orchestra/SKILL.md`. This is the most complex file in the entire skill pack — it must orchestrate all reference files written in sections 02–05 across an 8-step workflow.

**Prerequisites (must be complete before implementing this section):**
- Section 01: Contract schema files and directory structure exist
- Section 02: `references/task-analysis.md` and `references/routing-decision.md` exist
- Section 03: `references/wave-planning.md`, `references/sub-agent-dispatch.md`, and `references/platform-compat.md` exist
- Section 04: `references/quality-gates.md`, `references/result-integration.md`, and `references/security-review-protocol.md` exist
- Section 05: `references/artifact-management.md`, `references/compaction-safety.md`, `references/session-resume.md`, and `references/skill-pack-integration.md` exist

---

## File to Create

**Target file:** `/home/dev/projects/SmartSpecPro/deep_plan/skills/orchestra/SKILL.md`

**Expected size:** 400–600 lines

**Study first:** Read `/home/dev/projects/SmartSpecPro/deep_plan/skills/deep-plan/SKILL.md` to understand the conventions: YAML frontmatter, banner pattern, AskUserQuestion usage, reference file reading instructions, and resume-after-compaction section.

---

## Validation Tests (Verify Before and After)

These are the structural checks from `claude-plan-tdd.md` Section 06 that the finished SKILL.md must pass.

**Structural (S):**
- S: SKILL.md has exactly 8 steps (Step 0 through Step 8) — no missing steps
- S: Each step explicitly cites its reference file with exact relative path (e.g., "Read `references/task-analysis.md`")
- S: Step 4 includes platform detection BEFORE any Task call is dispatched
- S: Step 5 includes pre-merge security gate trigger check AFTER result integration
- S: Step 6 dispatches security specialists via orchestra directly (NOT delegated to security-review coordinator)
- S: Step 8 includes Context Health Check (CHC) with red-state snapshot protocol
- S: A "writing rules" or "lazy reference reading" note specifies which reference files are read conditionally vs always
- S: STOP conditions are tabulated (not prose) and cover at least 8 stop conditions
- S: AskUserQuestion options in SKILL.md match exactly:
  - Decision mode: 3 options (`ask_every_choice`, `smart_auto`, `auto_by_default`)
  - Platform: 3 options (`claude-code`, `codex`, `open-code`)
  - Fresh-start vs resume: 2 options

**Cross-reference (X):**
- X: Every reference file path cited in SKILL.md must resolve to an existing file in `references/`
- X: Banner text notes that `orchestra/` lives at project root and is shared across sessions

**Contract consistency (C):**
- C: `orchestra/plan.md`, `progress.md`, `backlog.md`, `decisions.md` update instructions in Steps 1–7 match the file lifecycle table in `artifact-management.md`

**Smoke tests (manual, after creation):**
- Smoke: Invoke `/orchestra "Fix the typo in apps/web/README.md"` → banner prints, scope classified as `trivial`, direct edit performed, no sub-agents spawned, `orchestra/plan.md` created
- Smoke: `orchestra/platform.md` is created on first invocation (after platform is selected)
- Smoke: `orchestra/plan.md` is created with scope/risk classification after Step 1 completes

---

## YAML Frontmatter (Required — Copy Exactly)

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

---

## The 8-Step Workflow

Below is the complete specification for all 8 steps. Implement each step as a numbered section in SKILL.md with the exact title shown, explicit reference file citations, and inline decision logic (not prose).

### Step 0: Banner + State Loading

Print the orchestra banner (see banner spec below). Check whether `orchestra/snapshot.json` exists at the project root.

**If snapshot.json exists**, use AskUserQuestion:
```
Question: "An orchestra session snapshot was found. How would you like to proceed?"
Options:
  - "Resume from snapshot" — Read orchestra/snapshot.md and snapshot.json, restore state, continue from in-progress step
  - "Fresh start" — Archive the entire orchestra/ directory to orchestra/archive/<ISO-timestamp>/, then begin a new session
```

**If no snapshot exists:** Create `orchestra/` if it does not exist. Begin fresh session.

**Banner text to print:**
```
═══════════════════════════════════════════════════════════════
ORCHESTRA: AI Multi-Agent Conductor
═══════════════════════════════════════════════════════════════
Task Analysis → Routing → Wave Planning → Dispatch → Integration
→ Quality Gates → Progress Update → Context Health Check

Note: orchestra/ lives at the project root and is shared across
sessions. If two developers run /orchestra simultaneously, they
share this directory.

Platform: [detected / unknown — will prompt in Step 4]
═══════════════════════════════════════════════════════════════
```

**On resume path:** Read `references/session-resume.md` and execute the R4 algorithm (Read, Restore, Reconcile, Resume). Jump to the step indicated in `snapshot.json`.`checkpoint.phase`.

### Step 1: Task Analysis

Read `references/task-analysis.md`.

Apply classification in this order:
1. **Bug sub-tree first** — if the task is a bug/error report, route through the bug sub-tree BEFORE applying the scope table. The bug sub-tree determines if it needs security handling, error-detective, Python-only investigation, or general debugging.
2. **Scope classification** — apply the 5-level scope table (trivial → small → medium → large → project). First match wins.
3. **Risk classification** — apply the 4-level risk table (low → medium → high → critical) independently of scope.

Write classification result to `orchestra/plan.md` with:
- scope: [trivial | small | medium | large | project]
- risk: [low | medium | high | critical]
- affected_domains: [list]
- estimated_file_count: [N]
- chosen_route: [see Step 2]
- task_summary: [one-sentence description of the task]

Print classification summary to the user.

### Step 2: Routing Decision

Read `references/routing-decision.md`.

**Decision mode setup (first time only):** If `orchestra/decision-mode.md` does not exist, use AskUserQuestion:
```
Question: "How much should Orchestra pause for your input on architectural choices?"
Options:
  - "ask_every_choice — Pause at every architectural decision (maximum control)"
  - "smart_auto — Pause only for HIGH/CRITICAL risk decisions (recommended)"
  - "auto_by_default — Proceed autonomously, log all decisions to orchestra/decisions.md"
```
Write the chosen value to `orchestra/decision-mode.md`.

**Routing decision table** (apply scope from Step 1):

| Scope | Route | Next Action |
|-------|-------|-------------|
| `trivial` | Direct edit | Conductor edits file directly. No sub-agents. Skip to Step 7. |
| `small` | Single agent | Build one Task Packet. Skip Step 3 (no wave planning needed). Proceed to Step 4. |
| `medium` | Multi-agent waves | Full pipeline: proceed to Step 3. |
| `large` | deep-plan-codex chain | Read `references/skill-pack-integration.md`. Create requirements spec. Instruct user to run `/deep-plan-codex @spec-file.md`. Write expected artifact paths to `orchestra/backlog.md`. STOP and wait for user to return with `/orchestra resume`. |
| `project` | Full pipeline | Read `references/skill-pack-integration.md`. Create high-level requirements doc. Instruct user to run `/deep-project @requirements.md`. STOP and wait. |

**STOP conditions** (tabulated — orchestra halts and waits for user):

| Condition | Action |
|-----------|--------|
| scope = `large` | Create spec, write backlog.md, instruct `/deep-plan-codex`, STOP |
| scope = `project` | Create requirements, write backlog.md, instruct `/deep-project`, STOP |
| Decision mode = `ask_every_choice` AND a HIGH/CRITICAL architectural choice is encountered | Present choice, STOP until answered |
| `/orchestra resume` invoked after deep-* handoff AND expected artifact paths missing from backlog.md | Report missing artifacts, STOP |
| Gate fails after 3 retry attempts (Step 6) | Report failure details, STOP |
| CRITICAL security findings found (Step 6) | Present findings, STOP — cannot auto-proceed |
| Circular dependency detected in wave plan (Step 3) | Report cycle, STOP until resolved |
| Conflict unresolvable between two agents (Step 5) | Present both options to user, STOP |

### Step 3: Contract and Wave Planning (Medium+ Scope Only)

Skip this step for `trivial` and `small` scope tasks.

Read `references/wave-planning.md`.

**Contract definition:** For every pair of agents that will work in parallel, define:
- shared interface (API endpoint + request/response shape, or tRPC procedure signature)
- ownership boundaries (which agent owns which files)
- test boundary (what each agent tests vs what the other tests)

Write all contracts to `orchestra/contracts.md` BEFORE dispatching any agents. **Contracts are frozen after they are written — they are never changed mid-session.**

**Wave grouping rules:**
- Assign each task to a wave such that no two tasks in the same wave have a file-level dependency on each other
- Later waves depend on earlier wave outputs
- Write the complete wave plan (all waves with their tasks) to `orchestra/plan.md` (append below the Step 1 classification)

**Circular dependency check:** Before finalizing the wave plan, verify that no pending tasks form a cycle. If no ready tasks remain but pending tasks exist, a cycle is present — STOP (see STOP conditions table in Step 2).

### Step 4: Dispatch

Read `references/sub-agent-dispatch.md` and `references/platform-compat.md`.

**Platform detection (REQUIRED before any Task call):**
- Check whether `orchestra/platform.md` exists
- If missing, use AskUserQuestion:
  ```
  Question: "Which platform are you running orchestra on?"
  Options:
    - "claude-code — Full Task tool support, parallel sub-agents"
    - "codex — Task tool available, inject agent templates manually"
    - "open-code — No Task tool; sequential execution, small scope only"
  ```
  Write the chosen value to `orchestra/platform.md`. Never ask again.

**Build Task Packets:** For each agent in the current wave, construct a Task Packet with all 8 required sections (TASK, DOMAIN, FILES, CONTEXT, CONSTRAINTS, CONTRACT, OUTPUT, QUALITY GATE). See `references/task-packet-format.md` for the construction guide.

**Wave N context injection:** When dispatching wave N+1 or later, prepend results from the prior wave into each Task Packet's CONTEXT section using this format:
```
### Results from Wave N
- [domain] Description of change: /absolute/path/to/file.ext — SUCCESS
- [domain] Description: /absolute/path/to/file.ext — SUCCESS
- Open contract note: what next-wave agents should know
```
Do NOT dump raw conversation history. Include only file paths, change descriptions, status, and contract notes.

**Dispatch by platform:**

| Platform | Dispatch method |
|----------|----------------|
| `claude-code` | Task tool with specific `subagent_type` from the agent mapping. All wave agents dispatched in a SINGLE message (multiple Task calls). |
| `codex` | Task tool with `subagent_type=general-purpose`. Prepend condensed agent identity + constraints template from `skills/sub-agents/agents/NAME.md` to the Task Packet prompt. Parallel dispatch still works. |
| `open-code` | No Task tool. Conductor executes sequentially. Announce each role transition explicitly. For medium+ scope, warn: "This task requires parallel agents. Consider switching to Claude Code or Codex. Proceeding sequentially." |

**Parallelism hard constraints:**
- Maximum 4 concurrent agents
- Maximum 2 agents editing files simultaneously (use `isolation: worktree` when enforcing this)
- Only 1 DB agent at a time
- Only 1 git agent at a time
- Parallel dispatch requires a written contract — no contract = sequential execution

### Step 5: Result Integration

Read `references/result-integration.md`.

**Integration sequence:**
1. Read all agent outputs — parse: files_changed, findings, blockers, status
2. Detect file conflicts — if 2 agents modified the same file, apply merge strategy:
   - Changes in different sections of the file → manual merge
   - Contradictory implementations of the same section → pick the contract-compliant result; re-dispatch the other agent with the conflict as CONTEXT
3. Verify contract compliance — each agent's output must match the interface contract written in `orchestra/contracts.md`
4. Update `orchestra/progress.md` with wave status (COMPLETE / PARTIAL / FAILED)
5. Append all auto-resolution decisions to `orchestra/decisions.md` with ISO timestamp

**Pre-merge security gate trigger check (run AFTER integration, BEFORE quality gates):**

Check whether ANY of these conditions apply to the completed wave's file changes:
- Auth middleware modified (any `middleware/` file, `isAuthenticated`, `requireRole`)
- New tRPC procedure added or existing one changed
- New FastAPI endpoint added or route modified
- Encryption or secrets handling changed (files matching `crypto.ts`, `*Encrypted`, `LLM_ENCRYPTION_KEY` usage)
- RBAC or role-check logic modified
- CORS or CSP configuration changed
- File upload or deserialization code added
- Security-related dependency version changed (package.json or requirements.txt)
- Infrastructure configuration changed (nginx, docker-compose, systemd service files)

If ANY trigger condition applies, set `security_gate_required = true`. The gate is dispatched in Step 6.

### Step 6: Quality Gates

Read `references/quality-gates.md`.

**Gate inventory** (run only when triggered):

| Gate | Command | Trigger | Blocking? |
|------|---------|---------|-----------|
| TypeScript check | `cd apps/web && pnpm check` | Any .ts/.tsx files changed | Yes (HIGH/CRITICAL risk) |
| Python lint | `cd python-backend && ruff check app/` | Any .py files changed | Yes (HIGH/CRITICAL risk) |
| Unit tests | `pnpm test` or `pytest` | Risk ≥ medium | Yes (HIGH/CRITICAL risk) |
| Security review (general) | Dispatch `security.md` agent | Risk = HIGH | Blocking for CRITICAL findings |
| Full test suite | Both `pnpm test` AND `pytest` | Risk = CRITICAL | Always blocking |
| Pre-merge security gate | 3-specialist parallel audit (see below) | `security_gate_required = true` | CRITICAL findings block |

**Blocking vs warning:**
- LOW/MEDIUM risk tasks: all gate failures are warnings (log and continue)
- HIGH/CRITICAL risk tasks: all gate failures block progression to next wave

**Gate failure retry protocol:**
1. Identify which agent caused the gate failure
2. Create a new Task Packet for that agent with the full error output as CONTEXT
3. Re-dispatch the same agent type
4. Maximum 3 retry attempts
5. If 3 attempts fail → STOP (see STOP conditions table in Step 2)

**Pre-merge security gate dispatch (when `security_gate_required = true`):**

Orchestra directly dispatches 3 specialists in a SINGLE message (parallel):
1. Task Packet → `security-trpc` agent — covering changed tRPC routers (`apps/web/server/routers/`)
2. Task Packet → `security-fastapi` agent — covering changed FastAPI endpoints (`python-backend/app/api/`)
3. Task Packet → `security-frontend` agent — covering changed React components (`apps/web/client/src/`)

After all 3 complete, orchestra dispatches `security-review` as aggregator with the collected findings in its CONTEXT. The security-review aggregator writes results to `orchestra/risk_register.md` and returns PASS/CONDITIONAL/FAIL verdict.

**Severity threshold policy:**
- 0 CRITICAL + 0 HIGH → PASS (green) — continue
- 0 CRITICAL + N HIGH → CONDITIONAL PASS — require user approval UNLESS decision-mode is `auto_by_default`, in which case auto-approve AND display prominently: "⚠️ AUTO-APPROVED HIGH SECURITY FINDINGS" header in the final summary AND log to `orchestra/decisions.md` with timestamp
- N CRITICAL → FAIL — blocked. User must resolve or explicitly mark each as accepted risk. This is a STOP condition.

**Critical constraint:** Sub-agents cannot spawn sub-agents. Orchestra always manages dispatch depth. The `security-review` agent is an aggregator only — it never dispatches Task calls.

### Step 7: Progress Update

Update all `orchestra/` files:
- `orchestra/progress.md` — mark current wave complete, update remaining wave list
- `orchestra/backlog.md` — if scope changed or new tasks discovered during the wave, add them
- `orchestra/decisions.md` — append all auto-approved decisions with ISO timestamp and reason

**Auto-approval logging rule:** Any decision auto-made in `auto_by_default` mode MUST be logged with this format:
```
[ISO-TIMESTAMP] AUTO-APPROVED: [decision description]
Reason: auto_by_default mode active
Risk: [LOW | MEDIUM | HIGH | CRITICAL]
Files affected: [list]
```

### Step 8: Context Health Check + Repeat or Finalize

Read `references/compaction-safety.md` (only when context state is `yellow` or `red`).

**Context Health Check (CHC) classification:**

| State | Criteria | Action |
|-------|----------|--------|
| `green` | Short conversation, few decisions, simple task | Continue normally |
| `yellow` | Multiple waves complete, growing context | Log warning in `orchestra/progress.md`; continue |
| `red` | Many decisions + contracts + active agents, OR about to change major topic, OR >5 wave cycles | Mandatory snapshot before continuing |

**Snapshot-before-compact protocol (red state):**
1. Update `orchestra/snapshot.json` with full structured checkpoint (see canonical schema below)
2. Update `orchestra/snapshot.md` with human-readable summary
3. Update `orchestra/progress.md` and `orchestra/backlog.md`
4. Notify user: "Context state is RED. Snapshot saved to orchestra/snapshot.json. Safe to continue or use /clear and re-invoke /orchestra to resume from snapshot."

**Canonical snapshot.json schema:**
```json
{
  "checkpoint": {
    "timestamp": "ISO-8601",
    "task_description": "...",
    "phase": "wave-N-integration",
    "completed_waves": [],
    "in_progress": {},
    "pending_waves": [],
    "decisions": [],
    "blockers": [],
    "key_files": ["/absolute/paths/only"]
  }
}
```

**Repeat or finalize:**
- If more waves remain in the plan → return to Step 4 for the next wave
- If all waves complete → print final summary:
  - What was built (files created/modified, with paths)
  - Quality gate results
  - Security gate verdict (if triggered)
  - Auto-approved decisions (if any, with "⚠️ AUTO-APPROVED HIGH SECURITY FINDINGS" header if applicable)
  - Any remaining items in `orchestra/backlog.md`

---

## Reference File Reading Rules (Lazy Loading)

Embed this rule table in SKILL.md to control when each reference file is loaded. This prevents unnecessary file reads on trivial and small tasks.

| Reference File | When to Read |
|----------------|-------------|
| `references/task-analysis.md` | Always — Step 1 |
| `references/routing-decision.md` | Always — Step 2 |
| `references/skill-pack-integration.md` | Only when scope is `large` or `project` — Step 2 |
| `references/wave-planning.md` | Only for `medium` scope and above — Step 3 |
| `references/sub-agent-dispatch.md` | Only for `medium` scope and above — Step 4 |
| `references/platform-compat.md` | Only for `medium` scope and above — Step 4 |
| `references/result-integration.md` | Only for `medium` scope and above — Step 5 |
| `references/quality-gates.md` | Always — Step 6 |
| `references/security-review-protocol.md` | Only when `security_gate_required = true` — Step 5/6 |
| `references/compaction-safety.md` | Only when context state is `yellow` or `red` — Step 8 |
| `references/session-resume.md` | Only on resume path — Step 0 |
| `references/artifact-management.md` | Only when setting up a fresh session or archiving — Step 0 |

---

## Resuming After Context Compaction

Include a "Resuming After Compaction" section at the end of SKILL.md. When Claude resumes with fresh context, it needs these instructions:

1. Check `orchestra/snapshot.json` — parse the `checkpoint` object
2. Check `orchestra/snapshot.md` — read the human summary to restore understanding of the task
3. Read all files listed in `checkpoint.key_files`
4. Read `orchestra/contracts.md` to restore contract awareness
5. Continue from `checkpoint.phase` — never re-execute completed waves unless files are missing
6. If `in_progress` was set in the snapshot, that is the current step to resume

The resume path is identical to the "Resume from snapshot" option in Step 0. The same R4 algorithm from `references/session-resume.md` applies.

---

## Implementation Notes (Actual Build)

### File Created
- `deep_plan/skills/orchestra/SKILL.md` — 457 lines

### Deviations from Plan
- **YAML frontmatter:** Changed `>` block scalars to single-line quoted strings to satisfy skill file validator (avoids "Unexpected indentation" errors).
- **STOP conditions table:** Hoisted to a top-level section before Step 0 (rather than inside Step 2) for global visibility. Updated internal cross-references from "Step 2" to "STOP Conditions section above".
- **contracts.md freeze rule:** Corrected to "frozen after Wave 1 begins" (matching artifact-management.md) rather than "frozen after written" — allows legitimate pre-dispatch amendments.
- **Red-state notification:** Used canonical two-phase message from compaction-safety.md (before-snapshot + after-snapshot).
- **artifact-management.md lazy loading:** Changed from conditional to always-read in Step 0 since all Step 0 paths (resume→fresh-start, no-snapshot→existing-dir, no-snapshot→new) need it.
- **Added `task-packet-format.md`** to lazy-loading table and Step 4 body (was missing from initial implementation).
- **`isolation: worktree`** added to Step 4 parallelism constraints.
- **Green state criteria** expanded to match compaction-safety.md canonical definition.

### All TDD Checks Pass
- 9 steps (0-8) ✅
- Platform detection before Task call ✅
- Pre-merge security gate AFTER integration ✅
- Security specialists dispatched directly ✅
- CHC with red-state snapshot in Step 8 ✅
- Lazy reference reading table ✅
- 8 STOP conditions tabulated ✅
- AskUserQuestion options match spec exactly ✅
- Banner notes orchestra/ at project root ✅

---

## Implementation Notes

### Writing Style Rules

When authoring SKILL.md, follow these conventions (derived from studying `deep_plan/skills/deep-plan/SKILL.md`):

- Write for a reader who has never seen this workflow before
- Every step references its corresponding reference file explicitly (never assume the reader knows where to look)
- All AskUserQuestion calls include the exact options defined in this spec — do not paraphrase them
- Use tables for decision logic, not prose
- Autonomous operation rules are inline decision trees (if/then/else format), not prose paragraphs
- STOP conditions are a single tabulated list, not scattered through prose
- No full code implementations — function signatures and config key names only
- Reference paths are always relative to the skill root (e.g., `references/task-analysis.md` not absolute)

### Skill Registration Verification

After creating SKILL.md, verify the `/orchestra` command is discoverable. The existing plugin root at `deep_plan/` auto-discovers sibling skills under `skills/` — check whether the `/orchestra` command is available without changes to `.claude/settings.json`. If explicit registration is required, add an entry analogous to `"deep-plan@piercelamb-plugins": true`. Acceptance criterion: invoking `/orchestra` displays the orchestra banner without a "skill not found" error.

### File Size Target

The finished SKILL.md should be 400–600 lines. If it is significantly shorter, the decision tables, AskUserQuestion options, and inline decision logic are likely incomplete. If significantly longer, the content likely duplicates reference file content that should remain in the references.