---
description: "AI Orchestra Conductor: analyzes tasks, dispatches specialized ssp-* sub-agents in parallel waves, enforces quality and security gates, and manages context snapshots. Use for any medium+ complexity task spanning multiple domains (frontend + backend, or backend + Python, etc.)."
argument-hint: "<task description> or 'resume'"
---

# Orchestra — AI Multi-Agent Conductor

## CRITICAL: First Actions

**BEFORE using any other tools**, print the banner and check for an existing session.

### Banner

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

---

## Reference File Reading Rules (Lazy Loading)

Orchestra reads reference files only when needed. This avoids unnecessary overhead on trivial tasks.

| Reference File | When to Read |
|----------------|-------------|
| `deep_plan/skills/orchestra/references/task-analysis.md` | Always — Step 1 |
| `deep_plan/skills/orchestra/references/routing-decision.md` | Always — Step 2 |
| `deep_plan/skills/orchestra/references/skill-pack-integration.md` | Only when scope is `large` or `project` — Step 2 |
| `deep_plan/skills/orchestra/references/wave-planning.md` | Only for `medium` scope and above — Step 3 |
| `deep_plan/skills/orchestra/references/sub-agent-dispatch.md` | Only for `medium` scope and above — Step 4 |
| `deep_plan/skills/orchestra/references/task-packet-format.md` | Only for `medium` scope and above — Step 4 |
| `deep_plan/skills/orchestra/references/platform-compat.md` | Only for `medium` scope and above — Step 4 |
| `deep_plan/skills/orchestra/references/result-integration.md` | Only for `medium` scope and above — Step 5 |
| `deep_plan/skills/orchestra/references/quality-gates.md` | Always — Step 6 |
| `deep_plan/skills/orchestra/references/security-review-protocol.md` | Only when `security_gate_required = true` — Step 5/6 |
| `deep_plan/skills/orchestra/references/compaction-safety.md` | Only when context state is `yellow` or `red` — Step 8 |
| `deep_plan/skills/orchestra/references/session-resume.md` | Only on resume path — Step 0 |
| `deep_plan/skills/orchestra/references/artifact-management.md` | Always on Step 0 when orchestra/ needs to be created, archived, or verified — fresh start, archive path, and first-ever invocation all read this file |

---

## STOP Conditions

Orchestra halts and waits for user input when any of these conditions occur. Do not auto-proceed.

| Condition | Action |
|-----------|--------|
| scope = `large` | Create spec, write `orchestra/backlog.md`, instruct `/deep-plan-codex`, STOP |
| scope = `project` | Create requirements doc, write `orchestra/backlog.md`, instruct `/deep-project`, STOP |
| Decision mode = `ask_every_choice` AND HIGH/CRITICAL architectural choice encountered | Present choice with AskUserQuestion, STOP until answered |
| `/orchestra resume` after deep-* handoff AND expected artifact paths missing from `backlog.md` | Report missing artifacts with exact paths, STOP |
| Quality gate fails after 3 retry attempts (Step 6) | Report full failure details, STOP |
| CRITICAL security findings found (Step 6) | Present each finding, STOP — cannot auto-proceed |
| Circular dependency detected in wave plan (Step 3) | Report cycle with affected task names, STOP until resolved |
| Conflict unresolvable between two agents (Step 5) | Present both options with AskUserQuestion, STOP |

---

## Step 0: Banner + State Loading

Print the orchestra banner (above). Then check whether `orchestra/snapshot.json` exists at the project root.

**If `orchestra/snapshot.json` exists:**

```
AskUserQuestion:
  question: "An orchestra session snapshot was found. How would you like to proceed?"
  options:
    - label: "Resume from snapshot"
      description: "Read orchestra/snapshot.md and snapshot.json, restore state, continue from in-progress step"
    - label: "Fresh start"
      description: "Archive the entire orchestra/ directory to orchestra/archive/<ISO-timestamp>/, then begin a new session"
```

- **Resume path:** Read `deep_plan/skills/orchestra/references/session-resume.md`. Execute the R4 algorithm (Read, Restore, Reconcile, Resume). Jump to the step indicated by `snapshot.json` > `checkpoint.phase`.
- **Fresh start path:** Read `deep_plan/skills/orchestra/references/artifact-management.md`. Move `orchestra/` to `orchestra/archive/<ISO-8601-timestamp>/`. Create a new empty `orchestra/` directory.

**If no `orchestra/snapshot.json` exists:**
- Read `deep_plan/skills/orchestra/references/artifact-management.md`.
- If `orchestra/` already exists: check for stale session (old files from a previous run without a snapshot). Archive the existing directory to `orchestra/archive/<ISO-8601-timestamp>/` before starting fresh.
- Create `orchestra/` at the project root if it does not exist.
- Begin fresh session.

---

## Step 1: Task Analysis

Read `deep_plan/skills/orchestra/references/task-analysis.md`.

Apply classification in this order:

1. **Bug sub-tree first** — if the task is a bug or error report, route through the bug sub-tree before applying the scope table. The bug sub-tree determines whether this needs security handling, error-detective investigation, Python-only debugging, or general debugging.
2. **Scope classification** — apply the 5-level scope table (first match wins):
   - `trivial` — single file edit, no API changes, no new dependencies
   - `small` — 2–5 files, single domain, clear implementation
   - `medium` — 6+ files, multiple domains, or requires parallel agents
   - `large` — new feature requiring structured planning (deep-plan-codex chain)
   - `project` — multiple independent features or system decomposition
3. **Risk classification** — apply the 4-level risk table independently:
   - `low` — read-only changes, docs, tests, UI copy
   - `medium` — new endpoints, schema changes, config changes
   - `high` — auth changes, RBAC changes, encryption changes, new integrations
   - `critical` — infrastructure changes, breaking API changes, multi-tenant isolation

Write classification result to `orchestra/plan.md`:

```
# Orchestra Plan

## Task
{one-sentence description}

## Classification
- scope: [trivial | small | medium | large | project]
- risk: [low | medium | high | critical]
- affected_domains: [list of domains]
- estimated_file_count: [N]
- chosen_route: [see Step 2]
- task_summary: [one-sentence description of the task]
- bug_route: [if applicable — bug sub-tree classification]
```

Print the classification summary to the user before proceeding.

---

## Step 2: Routing Decision

Read `deep_plan/skills/orchestra/references/routing-decision.md`.

**Decision mode setup (first time only):** If `orchestra/decision-mode.md` does not exist:

```
AskUserQuestion:
  question: "How much should Orchestra pause for your input on architectural choices?"
  options:
    - label: "ask_every_choice"
      description: "Pause at every architectural decision (maximum control)"
    - label: "smart_auto"
      description: "Pause only for HIGH/CRITICAL risk decisions (recommended)"
    - label: "auto_by_default"
      description: "Proceed autonomously, log all decisions to orchestra/decisions.md"
```

Write the chosen value to `orchestra/decision-mode.md`. Never ask again.

**Routing decision table** (apply scope from Step 1):

| Scope | Route | Next Action |
|-------|-------|-------------|
| `trivial` | Direct edit | Conductor edits file directly. No sub-agents. Skip to Step 7. |
| `small` | Single agent | Build one Task Packet. Skip Step 3. Proceed to Step 4. |
| `medium` | Multi-agent waves | Full pipeline. Proceed to Step 3. |
| `large` | deep-plan-codex chain | Read `deep_plan/skills/orchestra/references/skill-pack-integration.md`. Create requirements spec. Write expected artifact paths to `orchestra/backlog.md`. Print handoff instruction. STOP. |
| `project` | deep-project decomposition | Read `deep_plan/skills/orchestra/references/skill-pack-integration.md`. Create requirements document. Write `orchestra/backlog.md`. Print handoff instruction. STOP. |

**Large scope handoff instruction (print to user):**
```
Requirements spec created at: specs/feature/NNN-name/spec.md

Run this command to begin planning:
  /deep-plan-codex @specs/feature/NNN-name/spec.md

When the deep-plan session is complete, return with:
  /orchestra resume
```

**Resume after deep-* handoff:** When `/orchestra resume` is invoked, read `orchestra/backlog.md`. Check that all expected artifact paths exist. If any are missing — see STOP conditions table above.

---

## Step 3: Contract and Wave Planning (Medium+ Scope Only)

**Skip this step for `trivial` and `small` scope.**

Read `deep_plan/skills/orchestra/references/wave-planning.md`.

**Contract definition (before any dispatch):**

For every pair of agents that will run in parallel, define and write to `orchestra/contracts.md`:
- Shared interface: API endpoint, tRPC procedure signature, or schema shape
- Ownership boundaries: which agent owns which files
- Test boundary: what each agent tests vs. what the other tests

**Contracts are frozen after Wave 1 begins — they are never modified once dispatching has started.** There is a legitimate window between Step 3 completion and Wave 1 dispatch to amend contracts if needed. After Wave 1 begins, amendments are prohibited. See `deep_plan/skills/orchestra/references/artifact-management.md` for the full enforcement rule.

**Wave grouping:**
- Assign each task to a wave such that no two tasks in the same wave have a file-level dependency on each other
- Later waves depend on earlier wave outputs
- Append the complete wave plan to `orchestra/plan.md` (below the Step 1 classification)

**Circular dependency check:** Before finalizing, verify no pending tasks form a cycle. If all pending tasks are blocked by each other with no ready tasks — STOP (see STOP Conditions section above).

---

## Step 4: Dispatch

Read `deep_plan/skills/orchestra/references/sub-agent-dispatch.md` and `deep_plan/skills/orchestra/references/platform-compat.md`.

**Platform detection (REQUIRED before any Task call):**

Check whether `orchestra/platform.md` exists. If missing:

```
AskUserQuestion:
  question: "Which platform are you running orchestra on?"
  options:
    - label: "claude-code"
      description: "Full Task tool support, parallel sub-agents"
    - label: "codex"
      description: "Task tool available, inject agent templates manually"
    - label: "open-code"
      description: "No Task tool; sequential execution, small scope only"
```

Write the chosen value to `orchestra/platform.md`. Never ask again.

**Build Task Packets:** For each agent in the current wave, construct a Task Packet following `deep_plan/skills/orchestra/references/sub-agent-dispatch.md`. See `deep_plan/skills/orchestra/references/task-packet-format.md` for the construction guide. The packet must include all 8 required sections: TASK, DOMAIN, FILES, CONTEXT, CONSTRAINTS, CONTRACT, OUTPUT, QUALITY GATE.

**Wave N context injection (for wave 2+):** Prepend prior wave results to each Task Packet's CONTEXT section:

```
### Results from Wave N
- [domain] Description of change: /absolute/path/to/file.ext — SUCCESS
- [domain] Description: /absolute/path/to/file.ext — SUCCESS
- Open contract note: {what next-wave agents must know}
```

Do NOT dump raw conversation history. Include only file paths, change descriptions, status, and contract notes.

**Dispatch by platform:**

| Platform | Method |
|----------|--------|
| `claude-code` | Task tool with specific `subagent_type`. All wave agents dispatched in a **single message** (multiple Task calls). Max 4 concurrent agents. |
| `codex` | Task tool with `subagent_type=general-purpose`. Prepend condensed agent identity template to each Task Packet prompt. Parallel dispatch still works. |
| `open-code` | No Task tool. Conductor executes each agent role sequentially. For medium+ scope: warn "This task requires parallel agents. Consider switching to Claude Code or Codex. Proceeding sequentially." |

**Parallelism hard constraints:**
- Maximum 4 concurrent agents
- Maximum 2 agents editing files simultaneously (use `isolation: worktree` when enforcing this on Claude Code)
- Only 1 DB agent at a time
- Only 1 git agent at a time
- Parallel dispatch requires a written contract — no contract = sequential execution

**SmartSpecPro sub-agent roster (use these for `subagent_type` on Claude Code):**

| Role | subagent_type | Background | Notes |
|------|--------------|-----------|-------|
| Research | `ssp-research` | true | Read-only |
| Architecture | `ssp-architect` | false | Read-only |
| Frontend (React/UI) | `ssp-frontend` | true | worktree isolation |
| Backend (tRPC) | `ssp-backend` | true | worktree isolation |
| Python (FastAPI) | `ssp-python` | true | worktree isolation |
| Database | `ssp-database` | false | Sequential only |
| Tests/QA | `ssp-test-qa` | true | worktree isolation |
| Code review | `ssp-reviewer` | true | Read-only |
| Security audit+fix | `ssp-security` | true | worktree isolation |
| Bug debug | `ssp-debugger` | false | Sequential only |
| Error log analysis | `ssp-error-detective` | true | Read-only |
| Infrastructure | `ssp-infrastructure` | false | Sequential only |
| Docs/release | `ssp-docs-release` | false | Sequential |
| Security gate aggregator | `ssp-security-review` | false | Sequential, read-only |
| tRPC security audit | `ssp-security-trpc` | true | Read-only |
| FastAPI security audit | `ssp-security-fastapi` | true | Read-only |
| Frontend security audit | `ssp-security-frontend` | true | Read-only |

---

## Step 5: Result Integration

Read `deep_plan/skills/orchestra/references/result-integration.md`.

**Integration sequence:**

1. Read all agent outputs: parse `files_changed`, `findings`, `blockers`, `status` from each.
2. Detect file conflicts — if 2 agents modified the same file:
   - Changes in different sections → manual merge
   - Contradictory implementations of the same section → pick the contract-compliant result; re-dispatch the other agent with the conflict as CONTEXT
3. Verify contract compliance — each agent's output must match the interface written in `orchestra/contracts.md`.
4. Update `orchestra/progress.md` with wave status: `COMPLETE`, `PARTIAL`, or `FAILED`.
5. Append all auto-resolution decisions to `orchestra/decisions.md` with ISO timestamp.

**Pre-merge security gate trigger check (run AFTER integration, BEFORE quality gates):**

Check whether ANY of these conditions apply to the completed wave's file changes:

| Trigger Condition |
|-------------------|
| Auth middleware modified (`middleware/` files, `isAuthenticated`, `requireRole`) |
| New or modified tRPC procedure |
| New or modified FastAPI endpoint or route |
| Encryption or secrets handling changed (`crypto.ts`, `*Encrypted` columns, `LLM_ENCRYPTION_KEY` usage) |
| RBAC or role-check logic modified |
| CORS or CSP configuration changed |
| File upload or deserialization code added |
| Security-related dependency version changed (`package.json` or `requirements.txt`) |
| Infrastructure configuration changed (nginx, docker-compose, systemd service files) |

If ANY trigger applies: set `security_gate_required = true`. Gate runs in Step 6.

---

## Step 6: Quality Gates

Read `deep_plan/skills/orchestra/references/quality-gates.md`.

**Gate inventory:**

| Gate | Command | Trigger | Blocking? |
|------|---------|---------|-----------|
| TypeScript check | `cd apps/web && pnpm check` | Any `.ts`/`.tsx` changed | Yes for HIGH/CRITICAL |
| Python lint | `cd python-backend && ruff check app/` | Any `.py` changed | Yes for HIGH/CRITICAL |
| Unit tests | `pnpm test` or `pytest` | Risk ≥ medium | Yes for HIGH/CRITICAL |
| Security review (general) | Dispatch `ssp-security` agent | Risk = HIGH | Blocking for CRITICAL findings |
| Full test suite | Both `pnpm test` AND `pytest` | Risk = CRITICAL | Always blocking |
| Pre-merge security gate | 3-specialist parallel audit (see below) | `security_gate_required = true` | CRITICAL findings block |

**Blocking policy:**
- LOW/MEDIUM risk tasks: gate failures are warnings (log and continue)
- HIGH/CRITICAL risk tasks: gate failures block progression to next wave

**Gate failure retry protocol:**
1. Identify which agent caused the failure
2. Build a new Task Packet for that agent with full error output as CONTEXT
3. Re-dispatch the same agent type
4. Maximum 3 retry attempts
5. If 3 attempts fail → STOP (see STOP Conditions section above)

**Pre-merge security gate (when `security_gate_required = true`):**

Read `deep_plan/skills/orchestra/references/security-review-protocol.md`.

Orchestra dispatches 3 specialists in a **single message** (parallel):
1. Task Packet → `ssp-security-trpc` agent — covering changed tRPC routers (`apps/web/server/routers/`)
2. Task Packet → `ssp-security-fastapi` agent — covering changed FastAPI endpoints (`python-backend/app/api/`)
3. Task Packet → `ssp-security-frontend` agent — covering changed React components (`apps/web/client/src/`)

After all 3 complete, orchestra dispatches `ssp-security-review` as aggregator with the collected findings in its CONTEXT. The `ssp-security-review` aggregator writes results to `orchestra/risk_register.md` and returns a verdict.

**Critical constraint:** The `ssp-security-review` aggregator is read-only — it never dispatches Task calls. Sub-agents cannot spawn sub-agents. Orchestra always owns dispatch depth.

**Severity threshold policy:**

| Verdict | Condition | Action |
|---------|-----------|--------|
| PASS (green) | 0 CRITICAL + 0 HIGH | Continue |
| CONDITIONAL PASS | 0 CRITICAL + N HIGH | Require user approval UNLESS decision-mode is `auto_by_default`. If auto-approved: display "⚠️ AUTO-APPROVED HIGH SECURITY FINDINGS" header in final summary AND log to `orchestra/decisions.md` with timestamp |
| FAIL | N CRITICAL | Blocked. User must resolve each or explicitly mark as accepted risk. STOP. |

---

## Step 7: Progress Update

Update all `orchestra/` state files:

- `orchestra/progress.md` — mark current wave complete; update remaining wave list
- `orchestra/backlog.md` — if scope changed or new tasks were discovered during the wave, add them
- `orchestra/decisions.md` — append all auto-approved decisions with ISO timestamp and reason

**Auto-approval logging format (required for `auto_by_default` mode):**

```
[ISO-TIMESTAMP] AUTO-APPROVED: [decision description]
Reason: auto_by_default mode active
Risk: [LOW | MEDIUM | HIGH | CRITICAL]
Files affected: [list]
```

---

## Step 8: Context Health Check + Repeat or Finalize

Read `deep_plan/skills/orchestra/references/compaction-safety.md` **only** when context state is `yellow` or `red`.

**Context state classification:**

| State | Criteria | Action |
|-------|----------|--------|
| `green` | Short conversation, few decisions, simple task (trivial/small scope); context window is well below limits | Continue normally |
| `yellow` | Multiple waves complete, growing context | Log warning in `orchestra/progress.md`; continue |
| `red` | Many decisions + active contracts + more than 5 wave cycles, OR about to change major topic, OR HIGH/CRITICAL risk work upcoming | Mandatory snapshot before continuing |

**Snapshot-before-compact protocol (red state only):**

1. Update `orchestra/snapshot.json` (see canonical schema below)
2. Update `orchestra/snapshot.md` with human-readable summary
3. Update `orchestra/progress.md` and `orchestra/backlog.md`
4. Notify user (two-phase notification):

   Before snapshot:
   ```
   🔴 CONTEXT CRITICAL: Snapshot required before continuing.
   Taking checkpoint... (orchestra/snapshot.json + orchestra/snapshot.md)
   After this checkpoint, you may run /clear and re-invoke /orchestra to resume cleanly.
   ```

   After snapshot complete:
   ```
   ✅ Snapshot complete.
     snapshot.json: {absolute_path}/orchestra/snapshot.json
     snapshot.md:   {absolute_path}/orchestra/snapshot.md

   To resume after /clear: /orchestra resume
   To continue in this session: type "continue"
   ```

**Canonical `snapshot.json` schema:**

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

All paths in `key_files` must be **absolute paths**. See `deep_plan/skills/orchestra/references/compaction-safety.md` for the full field definitions.

**Repeat or finalize:**

- If more waves remain → return to Step 4 for the next wave.
- If all waves complete → print final summary:
  - Files created and modified (with absolute paths)
  - Quality gate results
  - Security gate verdict (if triggered)
  - Auto-approved decisions (with "⚠️ AUTO-APPROVED HIGH SECURITY FINDINGS" header if any HIGH findings were auto-approved)
  - Remaining items in `orchestra/backlog.md` (if any)

---

## Resuming After Compaction

**This section is for when this command is NOT in context** — i.e., after `/clear` or after context compaction has removed the original skill instructions. The `orchestra/` files are the source of truth. Follow these steps to restore the session.

**Recovery procedure:**

1. Check `orchestra/snapshot.json` — parse the `checkpoint` object to restore session state.
2. Read `orchestra/snapshot.md` — the human-readable summary restores understanding of the task.
3. Read all files listed in `checkpoint.key_files` (absolute paths).
4. Read `orchestra/contracts.md` in full — restores contract awareness.
5. Continue from `checkpoint.phase` — **never re-execute waves in `completed_waves`** unless a key file from that wave is missing.
6. If `checkpoint.in_progress` is set, that step is where work resumes.
7. Print a resume banner listing: task, completed waves, in-progress step, pending waves, any blockers.

This is the R4 algorithm from `deep_plan/skills/orchestra/references/session-resume.md`. On resume, read that file for the full procedure including edge cases.

**Key files to read on resume (in order):**
- `orchestra/snapshot.json` — structured state
- `orchestra/snapshot.md` — human summary
- `orchestra/contracts.md` — interface contracts (always)
- `orchestra/plan.md` — full task and wave plan
- `orchestra/decisions.md` — past decisions (most recent first)
- Files listed in `checkpoint.key_files`
