---
name: orchestra
description: "AI Orchestra Conductor: analyzes tasks, dispatches specialized sub-agents, integrates results, manages file-based memory to survive context compaction, and automatically chains into deep-project, deep-plan, deep-plan-quick, and deep-implement when needed."
license: MIT
compatibility: "Claude Code (registered agents), Standard (default/worker/explorer agents when available), OpenCode (sequential mode)"
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
| `references/task-analysis.md` | Always — Step 1 |
| `references/intent-matrix.md` | Always — Step 1 plain-text activation and edge-case calibration |
| `references/intent-regression-suite.md` | Always when tuning or validating Step 1 trigger behavior; recommended for ambiguous trigger decisions |
| `references/routing-decision.md` | Always — Step 2 |
| `references/installed-skill-routing.md` | When the user names a skill/slash tool, asks for audit/scan/generate/deploy/release/SEO/security/content/analytics/UI/image/OpenAI-docs work, or when routing needs installed skill coverage |
| `references/skill-pack-integration.md` | Only when scope is `large` or `project` — Step 2 |
| `references/wave-planning.md` | Only for `medium` scope and above — Step 3 |
| `references/sub-agent-dispatch.md` | Only for `medium` scope and above — Step 4 |
| `references/task-packet-format.md` | Only for `medium` scope and above — Step 4 |
| `references/platform-compat.md` | Only for `medium` scope and above — Step 4 |
| `references/model-routing.md` | Always before dispatching a sub-agent, building Task Packets, or selecting inline fallback model behavior |
| `references/result-integration.md` | Only for `medium` scope and above — Step 5 |
| `references/quality-gates.md` | Always — Step 6 |
| `references/ui-ux-planning-contract.md` | When UI/UX, visual polish, responsive, accessibility, or user-facing workflow work is in scope |
| `references/ui-browser-verification.md` | When browser-visible UI, route-level workflow, visual regression, responsive, or accessibility evidence is required |
| `references/design-token-extraction.md` | Before changing existing visual systems or matching product UI vocabulary |
| `references/ui-review-report-template.md` | When producing UI/UX/a11y/responsive review reports |
| `references/visual-regression-policy.md` | When visual-diff, screenshot comparison, or before/after UI evidence is required |
| `../sub-agents/references/shared-operational-discipline.md` | Always before dispatching or inline-executing any sub-agent role |
| `references/meta-activation.md` | Always — before Step 1 skill/route classification |
| `references/worktree-discipline.md` | When scope is `large`/`project`, risk is `high`/`critical`, or unrelated dirty files overlap planned edits |
| `references/tdd-discipline.md` | When changing routing, gates, security behavior, orchestration behavior, or bug fixes with reproducible failures |
| `references/verification-before-completion.md` | Always before final summary and after every implementation wave |
| `references/review-convergence.md` | Before final summary for medium+ scope/risk, after any review findings, or after any fix caused by review/gate feedback |
| `references/branch-finishing.md` | When the user asks to commit, push, open PR, keep, discard, or finish a branch |
| `references/skill-behavior-tests.md` | When adding/changing skills, sub-agents, routing triggers, or quality gates |
| `references/security-review-protocol.md` | Only when `security_gate_required = true` — Step 5/6 |
| `references/compaction-safety.md` | Only when context state is `yellow` or `red` — Step 8 |
| `references/session-resume.md` | Only on resume path — Step 0 |
| `references/artifact-management.md` | Always on Step 0 when orchestra/ needs to be created, archived, or verified — fresh start, archive path, and first-ever invocation all read this file |
| `../BACKUP-PLAYBOOK.md` | Any time the planned route includes destructive data risk, backup creation, restore planning, or irreversible transforms |

## Codex Standard Light Mode

When the detected platform is `standard` and the available sub-agent tool's own rules
require explicit user authorization before spawning agents, Orchestra runs in **light
mode** by default.

Light mode keeps the SocratiCode preflight, planning notes, impact checks, progress files,
targeted implementation, and relevant verification, but it does not spawn sub-agents just
because a tool exists. Use sub-agents in standard mode only when one of these is true:
- the user explicitly asks for sub-agents, delegation, parallel agents, reviewers, or
  agent waves
- the task is high/critical risk and the active tool policy permits the dispatch
- a previous direct/inline attempt is blocked and delegation is explicitly authorized

For `trivial`, `small`, and implementation-ready `medium` work in standard light mode,
prefer direct conductor implementation with bounded file reads and targeted gates. Promote
to written planning or ask a narrow question only when product intent, destructive risk,
or accepted security risk blocks progress.

### Token-Efficient Reading Discipline

When SocratiCode is active, use it to narrow files, symbols, and line ranges before
opening source files or producing large diffs. Prefer this sequence:

1. `codebase_status` or `codebase_health` once near Step 0/Step 1.
2. `codebase_search`, `codebase_symbols`, `codebase_symbol`, `codebase_graph_query`,
   `codebase_flow`, or `codebase_impact` as appropriate for the question.
3. Targeted `rg` only within SocratiCode-narrowed files/directories.
4. Targeted file reads using small line ranges around the matched section.
5. `git diff --stat` before full diffs; inspect only relevant hunks unless a full
   diff is needed for a quality gate or conflict resolution.

Avoid broad `rg`, whole-file `sed`, `cat` of large files, or full `git diff` as
the first discovery step. If a broad read is necessary, record why in
`orchestra/progress.md`.

---

## Auto-Activation From Plain Text

Orchestra should not rely only on explicit slash invocation.

If the user does **not** type `/orchestra` but their message clearly describes work that benefits from orchestration, treat that message as an implicit orchestra invocation and start Step 0 automatically.

### Positive Intent Signals

Activate orchestra automatically when the user message implies one or more of these intents:

- multi-step implementation work: “build”, “create”, “implement”, “add a feature”, “wire this up”, “make this work end-to-end”
- planning/decomposition work: “plan this”, “break this down”, “analyze before coding”, “design the approach”, “what should we change across the system”
- cross-file or cross-domain work: frontend + backend + DB + Python + infra, or any request likely to touch multiple subsystems
- orchestration/conductor language: “manage this task”, “coordinate the work”, “handle this end-to-end”, “drive this to completion”
- ambiguous but substantial engineering asks: short requests that are clearly not single-file edits and would benefit from routing, planning, or staged execution
- recovery/resume intent: “continue where we left off”, “resume the previous work”, “pick this back up”
- review-and-execute intent: “analyze what needs to change and do it”, “figure out the best approach and implement it”

### Strong Trigger Patterns

Bias strongly toward orchestra when the message includes phrases like:
- “ทำต่อให้จบ”, “ทำให้ครบ”, “จัดการให้ทั้งหมด”, “วิเคราะห์แล้วลงมือแก้”, “ช่วยวางแผนและทำต่อ”, “แตกงานให้หน่อย”, “ช่วยจัดลำดับงาน”, “ทำ end-to-end”
- “build a module/service/system”, “implement the full flow”, “plan and execute”, “coordinate this”, “handle the whole task”, “work through this systematically”

### Promotion Rules

Even if the initial wording looks small, promote into orchestra automatically when any of these are true after quick inspection:
- more than one subsystem is likely involved
- planning artifacts would reduce risk
- the task is under-specified and needs decomposition before coding
- execution may require chained skills (`deep-plan-quick`, `deep-plan`, `deep-project`, `deep-implement`)
- the user is delegating ownership of the workflow rather than asking a narrow factual question

### Do Not Auto-Activate Orchestra For

Do **not** activate orchestra automatically for:
- simple factual questions
- single-command utility requests (“what time is it”, “show git status”)
- purely editorial rewrites with no execution plan needed
- direct small bug fixes where the file and change are already obvious and no planning/routing value exists
- explicit requests for a different named skill when that skill alone clearly covers the job

### Tie-Break Rule

If you are unsure whether the task is just a direct implementation request or an orchestration-worthy request, prefer orchestra when the downside of missing orchestration is higher than the cost of a brief classification pass.

### Invocation Wording

When orchestra auto-activates from plain text, do not ask the user to rephrase with `/orchestra`.
Treat the original message as the task description and proceed immediately.

## Language Detection — MANDATORY

Detect the language of the user's task description at invocation time:
- If the user typed in **Thai** → use Thai for all user prompts, option labels, descriptions, banners, and status messages throughout this session.
- If the user typed in **English** → use English for all prompts and messages.
- If mixed → default to **Thai** (respect the dominant language).

This applies to ALL user-facing output from Orchestra: questions, confirmations, progress messages, and final summaries. Internal artifact files (`orchestra/plan.md`, `orchestra/decisions.md`, etc.) are always written in English for consistency.

---

## SocratiCode Discovery — MANDATORY When Active

When Orchestra is running inside a code repository, treat SocratiCode as the
preferred codebase discovery layer if it is active.

### Active Detection

SocratiCode is considered active when any of these are true:
- MCP tools named `codebase_*` / `mcp__socraticode__.*` are available and
  `codebase_status` or `codebase_health` succeeds.
- The Codex config includes an MCP server named `socraticode` and a manual MCP
  smoke test succeeds.
- A project-local SocratiCode watcher/index service is running and logs show a
  healthy index, even if the current MCP transport must be restarted.

### Required Use

If SocratiCode is active:
- Run `codebase_status` near Step 0/Step 1 before any repository shell
  exploration, broad repository analysis, or dispatch planning. This preflight
  is allowed before shell commands even when the banner/platform check would
  otherwise be first.
- Use `codebase_search` before reading many files, asking explorers to inspect
  the codebase, or running broad `rg` searches for architecture, feature,
  service, router, UI, data model, or domain questions.
- Use `codebase_impact` before planning or executing refactors, renames,
  deletions, schema changes, route changes, shared service changes, or exported
  symbol changes.
- Use `codebase_graph_query`, `codebase_graph_stats`, or `codebase_flow` when
  planning dependency direction, blast radius, call flow, or integration waves.
- Use `codebase_symbols` / `codebase_symbol` when routing work around specific
  functions, classes, route handlers, exported constants, or shared types.

After SocratiCode narrows the relevant area, use `rg`, file reads, and normal
shell tools for exact verification and implementation details.

### Token Budget Guardrails

When SocratiCode is active, Orchestra must minimize context spent on discovery:
- Prefer SocratiCode result snippets over opening whole files.
- Prefer `sed -n 'start,endp'` or equivalent narrow reads over `cat`/whole-file
  output for files larger than a few hundred lines.
- Prefer `rg pattern narrowed/path` over repository-wide `rg` once candidate
  paths are known.
- Prefer `git diff --stat` and targeted hunk inspection before printing a full
  diff.
- Ask sub-agents for specific answers or bounded patches, not broad exploratory
  dumps, unless the task explicitly requires a wide audit.
- Record in `orchestra/progress.md` when SocratiCode was active, what it
  narrowed, and any fallback to shell discovery.

### Fallback

If SocratiCode is configured but the current MCP transport fails, do not block
the task. Fall back to shell search, record the transport failure in
`orchestra/progress.md`, and mention the fallback in the final summary. If a
manual wrapper or project watcher log can provide status safely, use it to
confirm the index/watch health before proceeding.

---

## When to Re-invoke `/orchestra`

| Situation | What to do |
|-----------|-----------|
| **Continuing the same task** in the same session | No re-invocation needed — just type your response or next instruction. Orchestra instructions remain active in context. |
| **New, unrelated task** in the same session | Run `/orchestra <new task description>` to start a fresh classification cycle for the new task. |
| **After `/clear` or context compaction** with a snapshot | Run `/orchestra resume` to restore state from `orchestra/snapshot.json`. |
| **New Claude Code session** (browser/terminal restarted) | If `orchestra/snapshot.json` exists: `/orchestra resume`. If not: `/orchestra <task description>`. |

**Rule of thumb:** Within the same session working on the same task, Orchestra stays active — no re-invocation needed. Re-invoke only when starting a different task or after clearing context.

---

## STOP Conditions

Orchestra halts and waits for user input when any of these conditions occur. Do not auto-proceed.

| Condition | Action |
|-----------|--------|
| A destructive reset/archive is required before planning can continue | Create a timestamped backup/dump first and continue automatically. STOP only if no reliable backup can be produced or the operation would still cause irreversible external loss |
| Product intent remains ambiguous after codebase/spec analysis | Present the ambiguity clearly, ask only for the product decision, STOP |
| `/orchestra resume` after an automatic deep-* chain AND expected artifact paths are still missing | Reconstruct from the earliest incomplete safe stage automatically. STOP only if recovery would require destructive reset, accepted-risk security bypass, or ambiguous product intent |
| Quality gate fails after 3 retry attempts (Step 6) | Report full failure details, STOP |
| CRITICAL security findings found (Step 6) | Present each finding, STOP — cannot auto-proceed |
| Circular dependency detected in wave plan (Step 3) | Report cycle with affected task names, STOP until resolved |
| Conflict unresolvable between two agents or two valid product-direction options | Present both options with a direct user prompt, STOP |

---

## Step 0: Banner + State Loading

**Platform pre-check (for banner accuracy):** Before printing the banner, check if `orchestra/platform.md` exists at the project root. If it does, read its contents (`claude-code`, `standard`, or `open-code`) and substitute it into the banner line:
- Replace: `Platform: [detected / unknown — will prompt in Step 4]`
- With: `Platform: detected ✓ — {value from platform.md}`

If `orchestra/platform.md` does NOT exist, auto-detect the current runtime. In this skill pack, default to `standard`, persist it, and continue without asking unless runtime evidence clearly shows another platform.

Print the orchestra banner. Then check whether `orchestra/snapshot.json` exists at the project root.

**If `orchestra/snapshot.json` exists:**
- If the user explicitly asked for `new`, `fresh`, `reset`, or `archive and restart`, follow the fresh-start path.
- If the user explicitly asked to resume, continue, or pick up prior Orchestra work, follow the **Resume path**: read `references/session-resume.md`, execute the R4 algorithm (Read, Restore, Reconcile, Resume), and jump to the step indicated by `snapshot.json` > `checkpoint.phase`.
- Otherwise inspect `orchestra/progress.md` and `orchestra/review-findings.md` first. If they indicate completed/converged work with no `FAILED`, `PARTIAL`, `BLOCKED`, or pending wave markers, treat the snapshot as stale-complete state and follow the fresh-start path. If the snapshot records active in-progress work, resume automatically.
- **Fresh start path:** Read `references/artifact-management.md`. Move `orchestra/` to `orchestra/archive/<ISO-8601-timestamp>/`. Create a new empty `orchestra/` directory.

**If no `orchestra/snapshot.json` exists:**
- Read `references/artifact-management.md`.
- If `orchestra/` already exists: check for stale session (old files from a previous run without a snapshot). Archive the existing directory to `orchestra/archive/<ISO-8601-timestamp>/` before starting fresh.
- Create `orchestra/` at the project root if it does not exist.
- Run the **uncommitted work check** (see below).
- Begin fresh session.

**Uncommitted/unpushed work check (fresh start only — skip on resume path):**

Run the following two commands:
```bash
git status --short
git log --oneline "@{u}..HEAD" 2>/dev/null | head -5
```

If either command returns non-empty output (uncommitted files OR unpushed commits exist):
- Treat this as advisory by default, not a blocking confirmation gate.
- Log the dirty/unpushed state to `orchestra/progress.md` once the session directory exists.
- Continue normally unless the next planned action would require destructive git operations, risky history rewriting, or ownership is materially ambiguous due to overlapping in-progress changes.

If both commands return empty output, skip this check silently and proceed.

**Execution autonomy rule:** Do not ask for permission to inspect the codebase, run repository searches, do web research, or run safe non-destructive shell commands. These are conductor-owned execution steps and should happen automatically. Ask only for destructive/irreversible actions, accepted-risk security bypasses, or genuine product ambiguity.

**Git/GitHub recovery rule:** For repo-local work, treat git history and the GitHub-backed repository as the primary recovery mechanism. Do not stop for confirmation merely because rollback might be needed later. Instead, prefer recoverable workflows: preserve history, avoid destructive rewrites, keep artifacts in git, and continue automatically. Ask only when the next action could destroy data that git/GitHub cannot restore (for example DB table loss, external state deletion, or irreversible side effects outside the repository).

**Backup-first rule:** If an operation may destroy data, dump/copy/export the at-risk state to timestamped backup files first, record their paths, and then continue automatically. Examples: SQL dump before destructive migration, file copy before overwrite-heavy refactor, JSON/CSV export before bulk rewrite. Ask the user only if a reliable backup cannot be created or restore viability is unclear.

---

## Step 1: Task Analysis

Read `references/meta-activation.md`.
Read `references/task-analysis.md`.

### Sub-Agent-First Default

For every non-trivial task, Orchestra must first look for useful sub-agent work before
choosing direct conductor execution.

Default behavior:
- Use direct conductor edits only for `trivial` scope or emergency integration fixes after
  a failed agent wave.
- Use at least one sub-agent for `small` implementation/review work when a Task/sub-agent
  tool is available.
- In Codex standard light mode, the previous sub-agent-first bullets become advisory:
  direct conductor execution is preferred for `small` and implementation-ready `medium`
  work unless the user explicitly authorized agent delegation.
- Promote the task to `medium` when two or more independent workstreams can run safely in
  parallel, even if the estimated file count is small.
- Prefer parallel read-only analysis/review agents whenever their findings can be collected
  before the next implementation step.
- If a Task/sub-agent tool is unavailable, preserve the same agent plan and execute inline
  only as a platform fallback; record the fallback in `orchestra/progress.md`.

Apply classification in this order:

1. **Bug sub-tree first** — if the task is a bug or error report, route through the bug sub-tree before applying the scope table. The bug sub-tree determines whether this needs security handling, error-detective investigation, Python-only debugging, or general debugging.
2. **Parallel opportunity scan** — identify independent workstreams before scope is final:
   - domain slices: frontend, backend, Python, database, infra, docs, tests, UI review, security review
   - independent read-only questions that can be answered by explorer/reviewer agents
   - disjoint writer scopes that can safely run in the same wave
   - required gates/reviewers that can run in parallel after an implementation wave
   If the scan finds 2+ safe independent workstreams, set `parallel_default = true` and
   classify at least `medium`.
3. **Scope classification** — apply the 5-level scope table (first match wins):
   - `trivial` — single file edit, no API changes, no new dependencies
   - `small` — 2–5 files, single domain, clear implementation, no safe parallel split
   - `medium` — 6+ files, multiple domains, or requires parallel agents
   - `large` — new feature requiring structured planning (deep-plan chain)
   - `project` — multiple independent features or system decomposition
4. **Risk classification** — apply the 4-level risk table independently:
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
- parallel_default: [true | false]
- planned_agents: [portable role names, or [] for trivial direct-edit]
- dispatch_preference: [parallel | single-agent | inline-fallback | direct-edit]
```

Print the classification summary to the user before proceeding.

### Impact & Option Preflight

For implementation, feature, refactor, and bug-fix tasks, perform impact preflight before final routing or dispatch planning:

1. If SocratiCode is active, use `codebase_search` to identify candidate files, symbols, routes, services, schemas, and tests.
2. Use `codebase_impact` before changing shared modules, routers, schemas, services, exported symbols/types, public API shapes, auth/RBAC code, DB models/migrations, or config consumed by other systems.
3. Use `codebase_graph_query`, `codebase_flow`, or `codebase_symbols` when dependency direction or call flow determines the order of work.
4. Record the blast-radius summary in `orchestra/plan.md`:
   - directly changed files
   - dependent files/tests that may need updates
   - risk-sensitive surfaces (auth, tenant isolation, DB, security, public API, UI workflow)
   - parallelizable workstreams and their candidate agents
   - workstreams that must stay sequential and why
   - confidence level and unknowns
5. Choose the least-impact option that satisfies the user's goal and preserves existing contracts. If multiple valid options have materially different product, security, data, performance, or API tradeoffs, ask the user the smallest direct decision question before implementation.

If SocratiCode is unavailable, do the same preflight with targeted shell search and record the fallback.

---

## Step 2: Routing Decision

Read `references/routing-decision.md`.

**Decision mode setup (first time only):**
- If `orchestra/decision-mode.md` does not exist, write `auto_by_default` immediately.
- Change mode only if the user explicitly requests `smart auto` or `ask mode`.

**Routing decision table** (apply scope from Step 1):

| Scope | Route | Next Action |
|-------|-------|-------------|
| `trivial` | Direct edit | Conductor edits file directly only when the parallel opportunity scan found no useful agent work. No sub-agents. Skip to Step 7. |
| `small` | Direct edit, single-agent, or quick-plan-chain | In standard light mode, implement directly when obvious. Outside light mode, build one Task Packet and dispatch the best-matching sub-agent when tooling exists. If the task is under-specified or benefits from a written plan, auto-run `deep-plan-quick`. |
| `medium` | Direct/inline wave, multi-agent waves, or quick-plan-chain | In standard light mode, use direct/inline sequential execution unless the user authorized agents. Outside light mode, default to multi-agent waves when implementation-ready. Use `deep-plan-quick` only when a compact written plan is still needed before dispatch. |
| `large` | deep-plan chain | Read `references/skill-pack-integration.md`. Create or refresh `spec.md`, auto-run `deep-plan`, verify artifacts, then continue directly into `deep-implement`. |
| `project` | full-pipeline | Read `references/skill-pack-integration.md`. Create or refresh `requirements.md`, auto-run `deep-project`, then auto-run `deep-plan` and `deep-implement` per split. |

**Sub-agent default enforcement:**
- If `parallel_default = true`, the chosen route must be `multi-agent-waves`,
  `visual-ui-flow`, `security-gate`, or a deep-* chain that later produces waves. Do not
  collapse the work into direct conductor implementation.
- If a non-trivial task routes to `single-agent`, still dispatch one sub-agent through the
  active platform's agent tool when available. Inline execution is allowed only when the
  platform truly lacks agent tooling.
- In Codex standard light mode, do not dispatch merely because the tool exists. If the
  active sub-agent tool requires explicit user authorization and the user has not granted
  it, record `dispatch_preference: direct-standard-light` and proceed directly/inline.
- Record the selected route and planned agents in `orchestra/plan.md` before execution.

If the task touches auth, RBAC, tenant isolation, secrets, encryption, browser automation
sandboxing, uploads/deserialization, CORS/CSP, or security-sensitive dependencies, overlay
the `security-gate` route from `references/routing-decision.md` on top of the normal scope
route and run the pre-merge security gate before final completion.

> **Automatic chaining rule:** Orchestra owns the end-to-end lifecycle. It may create planning artifacts, read sibling deep-* skill files, execute those workflows inline, verify their outputs, and continue automatically. Do not wait for the user to type `/deep-plan`, `/deep-plan-quick`, `/deep-project`, or `/deep-implement` unless the user explicitly asks to take over that step manually.

> **Quick planning rule:** If the user provides only a short request and no `spec.md`, but the task still benefits from planning, orchestra should route to `deep-plan-quick` instead of forcing a full spec-first flow.

**Resume after automatic deep-* chaining:** When `/orchestra resume` is invoked, read `orchestra/backlog.md`. Check that all expected artifact paths exist. If some are missing, fall back to the earliest incomplete safe automatic stage and continue; stop only if recovery would require destructive reset or product-direction clarification.

---

## Step 3: Contract and Wave Planning (Parallel / Medium+ Scope)

**Skip this step only for `trivial` and true `single-agent` small scope.** If the
parallel opportunity scan found 2+ independent workstreams, the task is not treated as
small for execution purposes; plan waves here.

Read `references/wave-planning.md`.

**Parallel-first wave rule:** Build the widest safe first wave from the parallel opportunity
scan. If two workstreams have disjoint ownership and no dependency edge, they must be placed
in the same wave up to the concurrency limits. Sequential waves require an explicit reason
in `orchestra/plan.md`.

**Contract definition (before any dispatch):**

For every pair of agents that will run in parallel, define and write to `orchestra/contracts.md`:
- Shared interface: API endpoint, tRPC procedure signature, or schema shape
- Ownership boundaries: which agent owns which files
- Test boundary: what each agent tests vs. what the other tests
- Impact boundary: which downstream files/tests from the preflight are in-scope now,
  which are explicitly out-of-scope, and which must be verified by quality gates

**Contracts are frozen after Wave 1 begins — they are never modified once dispatching has started.** There is a legitimate window between Step 3 completion and Wave 1 dispatch to amend contracts if needed. After Wave 1 begins, amendments are prohibited. See `references/artifact-management.md` for the full enforcement rule.

**Wave grouping:**
- Assign each task to a wave such that no two tasks in the same wave have a file-level dependency on each other
- Later waves depend on earlier wave outputs
- Append the complete wave plan to `orchestra/plan.md` (below the Step 1 classification)

**Circular dependency check:** Before finalizing, verify no pending tasks form a cycle. If all pending tasks are blocked by each other with no ready tasks — STOP (see STOP Conditions section above).

---

## Step 4: Dispatch

Read `references/sub-agent-dispatch.md`, `references/platform-compat.md`, and
`references/model-routing.md`.

**Platform detection (REQUIRED before any Task call):**

Check whether `orchestra/platform.md` exists. If missing:
- infer the current platform automatically
- in this skill pack, default to `standard`
- write the detected value to `orchestra/platform.md`
- ask the user only if runtime evidence is contradictory and dispatch strategy would materially change

**Build Task Packets:** For each agent in the current wave, construct a Task Packet following `references/sub-agent-dispatch.md`. See `references/task-packet-format.md` for the construction guide. The packet must include all 8 required sections: TASK, DOMAIN, FILES, CONTEXT, CONSTRAINTS, CONTRACT, OUTPUT, QUALITY GATE.

By default, lightweight sub-agent work that does not require deep reasoning or maximum
capability MUST use `gpt-5.3-codex-spark`. Do not use Spark when the user or Task Packet
explicitly names another model, the task is high-risk/high-complexity or
performance-critical, a quality gate has failed repeatedly, or a previous Spark attempt
could not complete the work; in those cases use the inherited current/default model unless
a stronger explicit override is required.

Before dispatching, read `../sub-agents/references/shared-operational-discipline.md` and include its rules in every Task Packet's CONTEXT/CONSTRAINTS. In Standard or Open-Code mode, also inject those rules with the agent identity.

**Wave N context injection (for wave 2+):** Prepend prior wave results to each Task Packet's CONTEXT section:

```
### Results from Wave N
- [domain] Description of change: /absolute/path/to/file.ext — success
- [domain] Description: /absolute/path/to/file.ext — success
- Open contract note: {what next-wave agents must know}
```

Do NOT dump raw conversation history. Include only file paths, change descriptions, status, and contract notes.

**Dispatch by platform:**

| Platform | Method |
|----------|--------|
| `claude-code` | Task tool with registered agent names from `sub-agents/agents/*.md`. All wave agents dispatched in a **single message** where supported. Max 4 concurrent agents. |
| `standard` | Use Codex standard light mode unless the user explicitly authorized sub-agents. If authorized, use default/worker/explorer-style agents with condensed identity templates. If not authorized or no agent tool is available, execute directly/inline while preserving the same impact, progress, and Result Report discipline. |
| `open-code` | No Task tool. Conductor executes each agent role sequentially. For medium+ scope: warn "This task requires parallel agents. Consider switching to Claude Code or Standard mode. Proceeding sequentially." |

**Agent-tool availability check:** Before inline fallback, check the active tool list and
deferred tool discovery for Task/sub-agent/spawn-agent capability. Also read the tool's
authorization rules. If the tool requires explicit user authorization and the user did not
ask for delegation, treat dispatch as not authorized and use standard light mode. Inline
fallback while an authorized agent tool is available is a policy violation unless the tool
call fails and the failure is recorded in `orchestra/progress.md`.

**Parallelism hard constraints:**
- Maximum 4 concurrent agents
- Maximum 2 agents editing files simultaneously (use `isolation: worktree` when enforcing this on Claude Code)
- Only 1 DB agent at a time
- Only 1 git agent at a time
- Parallel dispatch requires a written contract — no contract = sequential execution
- When a wave has 2+ independent agents and an agent tool exists, dispatch them in one
  batch/message. Waiting for one independent agent before launching the next is a policy
  violation.

---

## Step 5: Result Integration

Read `references/result-integration.md`.

**Integration sequence:**

1. Read all agent outputs: parse `files_changed`, `findings`, `blockers`, `status` from each.
2. Detect file conflicts — if 2 agents modified the same file:
   - Changes in different sections → manual merge
   - Contradictory implementations of the same section → pick the contract-compliant result; re-dispatch the other agent with the conflict as CONTEXT
3. Verify contract compliance — each agent's output must match the interface written in `orchestra/contracts.md`.
4. Run impact closure for the wave:
   - If SocratiCode is active, re-run `codebase_impact` or graph/symbol checks for any changed shared module, route, schema, service, exported symbol/type, auth/RBAC surface, DB model/migration, or public API shape.
   - Verify every newly affected file/test is either already handled, added to a later wave, covered by a quality gate, or recorded as an explicit backlog item with rationale.
   - If the wave introduced an unplanned required change, add it to the current flow and continue; do not silently finish with a broken dependent path.
   - Write an impact hypothesis: what could this wave have broken next, which gates/reviewers
     cover that risk, and which previously passed checks are now stale.
5. Update `orchestra/progress.md` with wave status: `COMPLETE`, `PARTIAL`, or `FAILED`.
6. Append all auto-resolution decisions to `orchestra/decisions.md` with ISO timestamp.

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
| Security-related dependency version changed (`package.json`, `pnpm-lock.yaml`, `pyproject.toml`, `uv.lock`, Docker image, or GitHub Actions version) |
| Infrastructure configuration changed (nginx, docker-compose, systemd service files) |

If ANY trigger applies: set `security_gate_required = true`. Gate runs in Step 6.

---

## Step 6: Quality Gates

Read `references/quality-gates.md`.
Read `references/verification-before-completion.md` before reporting any wave or final completion status.

**Gate inventory:**

| Gate | Command | Trigger | Blocking? |
|------|---------|---------|-----------|
| TypeScript check | `repo typecheck command` (repository example default: `cd apps/web && pnpm check`) | Any type-checked source changed | Yes for HIGH/CRITICAL |
| Python lint | `repo Python lint command` (repository example default: `cd python-backend && ruff check app/`) | Any `.py` changed | Yes for HIGH/CRITICAL |
| Unit tests | `repo unit/integration test command(s)` (repository example defaults: `cd apps/web && pnpm test`, `cd python-backend && pytest`) | Risk ≥ medium | Yes for HIGH/CRITICAL |
| E2E browser tests | Dispatch `e2e-playwright.md` or run discovered Playwright command | User workflow, routing, auth flow, or browser regression changed | Yes for HIGH/CRITICAL |
| Performance gate | Dispatch `performance.md`; run load/benchmark command when available | Performance-sensitive endpoint, query, cache, bundle, or load-test change | Blocking for CRITICAL; warning for HIGH unless latency budget is explicit |
| CI/release gate | Dispatch `ci-release.md`; run workflow validation scripts | GitHub Actions, deployment, release, or rollback files changed | Yes for HIGH/CRITICAL |
| Dependency/supply-chain gate | Dispatch `dependency-supply-chain.md`; run available audit/tree commands | Dependency manifests, lockfiles, Docker images, or Actions versions changed | Yes for HIGH/CRITICAL |
| Security review (general) | Dispatch `security.md` agent | Risk = HIGH | Blocking for CRITICAL findings |
| Full test suite | All relevant repo test suites | Risk = CRITICAL | Always blocking |
| Pre-merge security gate | 3-specialist audit: parallel `ssp-*` dispatch when Task tooling exists, sequential inline fallback otherwise (see below) | `security_gate_required = true` | CRITICAL findings block |
| Visual UI gates | Visual polish, accessibility, responsive, component states, dark/light, screenshot/E2E | UI visual polish, responsive, accessibility, route-level UI changes | Blocking for MEDIUM+ user workflows when primary action, accessibility, or responsive usability fails |
| Review Convergence Gate | Apply `references/review-convergence.md` | Medium+ scope/risk, any review finding, or any fix after review/gate feedback | Blocking until convergence criteria pass or a stop condition is reached |

**Blocking policy:**
- LOW/MEDIUM risk tasks: gate failures are warnings (log and continue)
- HIGH/CRITICAL risk tasks: gate failures block progression to next wave
- In standard light mode, run the smallest relevant gate set for `small`/`medium` work:
  typecheck/lint/tests that directly cover changed files, plus explicitly requested
  browser/security checks. Do not launch reviewer agents or full gate suites for
  low/medium risk unless the change surface demands it or the user asked for that depth.

**Long-running gate protocol:**
- Prefer narrow commands and repository-defined focused scripts.
- For any command or sub-agent wait that runs longer than 10 minutes, write a status entry
  to `orchestra/progress.md` with the command, elapsed time, and whether it is still
  blocking.
- If a non-blocking low/medium gate exceeds the timeout budget, stop waiting, record it as
  skipped with residual risk, and continue to final summary.
- If a blocking high/critical gate exceeds the timeout budget, pause with a compact status
  report instead of silently waiting.

**Gate failure retry protocol:**
1. Identify which agent caused the failure
2. Build a new Task Packet for that agent with bounded failure evidence as CONTEXT:
   command, exit code, decisive error lines, a short first/last excerpt, and the path to
   the full captured output when available. Do not paste full logs, stack traces, or test
   transcripts into the packet.
3. Re-dispatch the same agent type. If the failed attempt used
   `gpt-5.3-codex-spark`, escalate the retry packet to
   `model_preference: inherited-default` per `references/model-routing.md`
4. After each fix, mark all gates covering changed files/contracts/runtime paths as stale
5. Re-run stale gates and impact closure before continuing
6. Maximum 3 retry attempts per blocking gate
7. If 3 attempts fail → STOP (see STOP Conditions section above)

**Pre-merge security gate (when `security_gate_required = true`):**

Read `references/security-review-protocol.md`.

Orchestra dispatches 3 specialists in a **single message** when the active platform exposes
Task/sub-agent tooling:
1. Task Packet → `ssp-security-trpc` (portable role: `security-trpc`) — covering changed tRPC routers (`apps/web/server/routers/`)
2. Task Packet → `ssp-security-fastapi` (portable role: `security-fastapi`) — covering changed FastAPI endpoints (`python-backend/app/api/`)
3. Task Packet → `ssp-security-frontend` (portable role: `security-frontend`) — covering changed React components (`apps/web/client/src/`)

When no Task/sub-agent tool is available, execute those specialist roles sequentially inline,
but collect every applicable specialist Result Report before dispatching or inline-running the
`ssp-security-review` aggregator.

After all 3 complete, orchestra dispatches `ssp-security-review` as aggregator with the collected findings in its CONTEXT. The `ssp-security-review` aggregator writes results to `orchestra/risk_register.md` and returns a verdict.

**Critical constraint:** The `security-review` aggregator is read-only — it never dispatches Task calls. Sub-agents cannot spawn sub-agents. Orchestra always owns dispatch depth.

**Severity threshold policy:**

| Verdict | Condition | Action |
|---------|-----------|--------|
| PASS (green) | 0 CRITICAL + 0 HIGH | Continue |
| CONDITIONAL | 0 CRITICAL + N HIGH | Require user approval UNLESS decision-mode is `auto_by_default`. If auto-approved: display "⚠️ AUTO-APPROVED HIGH SECURITY FINDINGS" header in final summary AND log to `orchestra/decisions.md` with timestamp |
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

Read `references/compaction-safety.md` **only** when context state is `yellow` or `red`.

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
4. Notify user (two-phase notification) and continue automatically unless the user
   explicitly asks to pause or the next step is destructive/high-risk:

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

   Optional manual recovery (Orchestra cannot run these commands for you):
     1. Type /clear   ← clears context, if you want a clean context
     2. Type /orchestra resume   ← restores state from snapshot

   Continuing automatically in the same session.
   ```

   > **Note:** Orchestra cannot automatically run `/clear` or `/orchestra resume`. These are optional manual recovery actions. Claude Code's auto-compact (context compression) is separate and happens automatically, but may or may not preserve Orchestra's skill instructions — if Orchestra seems unresponsive after auto-compact, run `/orchestra resume` to restore state.

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

All paths in `key_files` must be **absolute paths**. See `references/compaction-safety.md` for the full field definitions.

**Repeat or finalize:**

- If more waves remain → return to Step 4 for the next wave.
- If all waves complete → run the **Post-Completion Review and Convergence Loop** (see
  below), then print final summary only after convergence criteria pass or a stop condition
  is reached.

---

## Post-Completion Review and Convergence Loop

Read `references/review-convergence.md`.

**Trigger:** Run when ALL waves complete AND scope is `medium` (risk >= medium), `large`,
or `project`, or when any review/gate produced findings. Skip only for `trivial`, clean
`small`, and `medium` with `low` risk and no findings.

**Purpose:** Catch gaps, security issues, missing features, second-order regressions, and
quality concerns before the session closes. The default is to fix and re-check, not to ask
the user how many review rounds to run.

### Review Process

Read the following files to gather signals (do NOT re-scan all source files):
- `orchestra/plan.md` — original task, scope, affected domains
- `orchestra/progress.md` — what was completed per wave
- `orchestra/backlog.md` — known remaining/deferred items
- `orchestra/decisions.md` — decisions made, especially any deferred ones
- `orchestra/contracts.md` — interfaces and boundaries defined

Evaluate across **7 dimensions**:

| Dimension | What to check |
|-----------|--------------|
| **Completeness** | Did all waves deliver what the original task required? Any items from `backlog.md` not addressed? Any deferred decisions left unresolved? |
| **Security** | New endpoints/routes without auth checks? Secrets in logs or responses? Missing input validation? Unencrypted sensitive fields? RBAC gaps? |
| **Quality** | Tests written for new code? Edge cases handled (empty inputs, null, concurrent access)? Error messages exposed to clients? |
| **Standards** | For this type of feature, what do similar systems typically include that we haven't built? (e.g., audit logging for auth changes, rate limiting for new APIs, pagination for list endpoints) |
| **Technical debt** | TODOs left in code? Hardcoded values? Commented-out code? Migration left pending? |
| **Impact ripple** | Could fixes or new contracts have broken callers, tests, routes, UI states, schemas, migrations, docs, or deploy/runtime config? |
| **Review coverage** | Were the right reviewers/gates run for every changed domain, and are any previously passing gates stale after later changes? |

### Convergence Behavior

For every post-completion finding:
- Auto-fix all CRITICAL, HIGH, and in-scope MEDIUM findings that are safe and 80%+
  confident.
- Dispatch the owning sub-agent for fixes when a Task/sub-agent tool is available.
- After each fix, rerun impact closure and all stale gates.
- Run another review round until `review-convergence.md` stop rules are satisfied.
- Defer only LOW/optional or genuinely out-of-scope improvements, with rationale in
  `orchestra/backlog.md`.
- Do not finalize after a single clean-looking pass when medium+ work had fixes; require the
  minimum consecutive clean rounds from `review-convergence.md`.

### Report Format

Print the review report using this exact format:

```
═══════════════════════════════════════════════════════════════
POST-COMPLETION REVIEW
═══════════════════════════════════════════════════════════════
Completeness: [COMPLETE | GAPS FOUND]
Security:     [CLEAN | ISSUES FOUND]
Quality:      [GOOD | IMPROVEMENTS AVAILABLE]
Standards:    [COMPLIANT | GAPS FOUND]
Tech Debt:    [NONE | ITEMS FOUND]

FINDINGS:

🔴 Critical — address before shipping:
  1. [finding] — [why it matters] — Suggested: [action]

🟡 Recommended — high value, low risk to add:
  1. [finding] — [why it matters] — Suggested: [action]

🟢 Optional — nice to have:
  1. [finding] — [benefit] — Suggested: [action]

(If a dimension has no findings, write: ✅ No issues found)

CONVERGENCE:
  Rounds run: [N]
  Clean rounds: [N]
  Stop reason: [criteria passed | blocked | max rounds reached]
  Stale gates rerun after last change: [list]

RECOMMENDED NEXT STEPS:
  1. [highest priority action]
  2. [second priority action]
  ...
═══════════════════════════════════════════════════════════════
```

### Follow-up Handling

After the report:
- If ALL 7 dimensions return clean (no findings) and the required clean-round count is met,
  go directly to the final summary. Print: `"✅ Post-completion convergence: no gaps,
  security issues, missing features, stale gates, or impact-ripple risks found."`
- If material findings remain and are safe/in-scope, fix them and re-run the convergence
  loop instead of finalizing.
- If only LOW/optional findings remain and `decision-mode` is `auto_by_default` or
  `smart_auto`, write actionable follow-ups to `orchestra/backlog.md`, log the decision,
  and proceed directly to the final summary after convergence criteria pass.
- Ask the user what to do next only if `decision-mode` is `ask_every_choice` or if a remaining item requires destructive/irreversible acceptance.

### Final Summary (after review)

Before printing the final summary, apply `references/verification-before-completion.md`.
If the user asked to commit, push, open a PR, keep, discard, or otherwise finish the
branch, also apply `references/branch-finishing.md`.

Print the final summary:
- Files created and modified (with absolute paths)
- Quality gate results
- Security gate verdict (if triggered)
- Review convergence rounds run and stop reason
- Auto-approved decisions (with "⚠️ AUTO-APPROVED HIGH SECURITY FINDINGS" header if any HIGH findings were auto-approved)
- Post-completion review verdict (CLEAN or summary of findings addressed/deferred)
- Remaining items in `orchestra/backlog.md` (if any)

---

## Resuming After Compaction

**This section is for when this SKILL.md is NOT in context** — i.e., after `/clear` or after context compaction has removed the original skill instructions. The `orchestra/` files are the source of truth. Follow these steps to restore the session.

**Recovery procedure:**

1. Check `orchestra/snapshot.json` — parse the `checkpoint` object to restore session state.
2. Read `orchestra/snapshot.md` — the human-readable summary restores understanding of the task.
3. Read `checkpoint.key_files` digest-first: verify existence and inspect only recorded
   line/section hints or compact summaries first. Read full files only when they are small,
   changed since the snapshot, or the digest is insufficient to resume safely.
4. Read `orchestra/contracts.md` as a digest first. Read the full file only when active
   contracts are missing from the digest or a pending wave depends on exact contract text.
5. Continue from `checkpoint.phase` — **never re-execute waves in `completed_waves`** unless a key file from that wave is missing.
6. If `checkpoint.in_progress` is set, that step is where work resumes.
7. Print a resume banner listing: task, completed waves, in-progress step, pending waves, any blockers.

This is the R4 algorithm from `references/session-resume.md`. On resume, read that file for the full procedure including edge cases.

**Key files to read on resume (in order):**
- `orchestra/snapshot.json` — structured state
- `orchestra/snapshot.md` — human summary
- `orchestra/contracts.md` — active contract digest first, exact sections when needed
- `orchestra/plan.md` — current phase/wave sections first
- `orchestra/decisions.md` — most recent relevant decisions first
- Files listed in `checkpoint.key_files` — line/section hints first, full file only when needed
