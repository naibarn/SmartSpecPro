# Sub-Agent Dispatch

Tells the conductor exactly how to dispatch each of the 35 agent roles — which
registered agent name or fallback role to use per platform, how to inject wave context and contracts into Task
Packets, and when the pre-merge security gate triggers automatically.

For the Task Packet format definition, see:
- `../../sub-agents/contracts/task-packet.schema.md`
- `task-packet-format.md`
- `../../sub-agents/references/shared-operational-discipline.md`
- `model-routing.md`

For wave grouping and contract format, see:
- `wave-planning.md`

---

## 1. Agent Type Mapping Table

For each of the 35 agent roles, Claude Code mode uses the generated native agent name
from `.claude/agents/ssp-*.md`. Standard/open-code modes use the portable role name and
inject identity/constraints from `../../sub-agents/agents/NAME.md`.

| Agent Role | Claude Code native agent | Standard Fallback | Open-Code Mode |
|-----------|--------------------------|-------------------|----------------|
| product-ux | `ssp-product-ux` | `default`/`explorer` + injected template | Inline |
| research | `ssp-research` | `explorer` + injected template | Inline (conductor adopts role) |
| architect | `ssp-architect` | `default`/`explorer` + injected template | Inline |
| api-contract-reviewer | `ssp-api-contract-reviewer` | `explorer` + injected template | Inline |
| frontend | `ssp-frontend` | `worker` + injected template | Inline |
| backend | `ssp-backend` | `worker` + injected template | Inline |
| python | `ssp-python` | `worker` + injected template | Inline |
| database | `ssp-database` | `worker` + injected template | Inline (sequential only) |
| test-qa | `ssp-test-qa` | `worker`/`explorer` + injected template | Inline |
| e2e-playwright | `ssp-e2e-playwright` | `worker` + injected template | Inline |
| reviewer | `ssp-reviewer` | `explorer` + injected template | Inline |
| security | `ssp-security` | `worker`/`explorer` + injected template | Inline |
| tenant-data-isolation-reviewer | `ssp-tenant-data-isolation-reviewer` | `explorer` + injected template | Inline |
| browser-automation-sandbox-reviewer | `ssp-browser-automation-sandbox-reviewer` | `explorer` + injected template | Inline |
| debugger | `ssp-debugger` | `worker` + injected template | Inline (sequential) |
| error-detective | `ssp-error-detective` | `explorer` + injected template | Inline |
| infrastructure | `ssp-infrastructure` | `worker`/`explorer` + injected template | Inline |
| performance | `ssp-performance` | `worker`/`explorer` + injected template | Inline |
| llm-runtime-cost-auditor | `ssp-llm-runtime-cost-auditor` | `explorer` + injected template | Inline |
| ci-release | `ssp-ci-release` | `worker` + injected template | Inline (sequential only) |
| dependency-supply-chain | `ssp-dependency-supply-chain` | `explorer` + injected template | Inline |
| docs-release | `ssp-docs-release` | `worker` + injected template | Inline |
| i18n-content-reviewer | `ssp-i18n-content-reviewer` | `explorer` + injected template | Inline |
| observability-audit-agent | `ssp-observability-audit-agent` | `explorer` + injected template | Inline |
| security-review | `ssp-security-review` | `explorer` + injected template | Inline |
| security-trpc | `ssp-security-trpc` | `explorer` + injected template | Inline |
| security-fastapi | `ssp-security-fastapi` | `explorer` + injected template | Inline |
| security-frontend | `ssp-security-frontend` | `explorer` + injected template | Inline |
| visual-ui-requirement-analyzer | `ssp-visual-ui-requirement-analyzer` | `explorer` + injected template | Inline |
| visual-ui-direction | `ssp-visual-ui-direction` | `explorer` + injected template | Inline |
| ui-builder | `ssp-ui-builder` | `worker` + injected template | Inline |
| visual-ux-reviewer | `ssp-visual-ux-reviewer` | `explorer` + injected template | Inline |
| accessibility-reviewer | `ssp-accessibility-reviewer` | `explorer` + injected template | Inline |
| responsive-reviewer | `ssp-responsive-reviewer` | `explorer` + injected template | Inline |
| visual-final-refactor | `ssp-visual-final-refactor` | `worker` + injected template | Inline |

**Invariant:** The Claude Code native agent column must match the `name:` field in
`.claude/agents/ssp-*.md`. Do not dispatch built-in names such as `Plan`, `Explore`,
`backend`, or `security` when a generated `ssp-*` native agent exists; doing so bypasses
the repo-specific role prompt and can silently reduce parallel execution quality.

**31 general/domain agents** (section-07 + vNext reviewers): product-ux, research, architect,
api-contract-reviewer, frontend, backend,
python, database, test-qa, e2e-playwright, reviewer, security, debugger, error-detective,
infrastructure, performance, ci-release, dependency-supply-chain, docs-release,
visual-ui-requirement-analyzer, visual-ui-direction, ui-builder, visual-ux-reviewer,
accessibility-reviewer, responsive-reviewer, visual-final-refactor,
tenant-data-isolation-reviewer, llm-runtime-cost-auditor,
browser-automation-sandbox-reviewer, i18n-content-reviewer, observability-audit-agent

**4 security specialists** (section-08): security-review, security-trpc, security-fastapi,
security-frontend

---

## 2. Conductor-First Dispatch Rule

> **Default:** Main Codex keeps the overview and dispatches only when a sub-agent has a
> bounded job that improves the next decision or proof. Tool availability alone is not a
> reason to spawn agents.

For broad, uncertain, or multi-area work, use one read-only scout/explorer first. Add
sidecar agents only after the scout or conductor preflight proves distinct workstreams,
clear ownership paths, and decision-relevant outputs. Avoid fanout of 3-6 agents just to
show parallelism.

When 2+ independent agents are genuinely ready and agent dispatch is authorized, launch
them in the same wave in one dispatch batch. If the platform does not expose agent tools,
preserve the same wave plan and execute sequentially inline as a platform fallback. In
Codex standard light mode, the active `spawn_agent` tool may require the user to explicitly
ask for sub-agents, delegation, or parallel agent work. In that case, availability is not
enough: do not spawn agents unless the user gave that authorization. Record the
direct/inline light-mode decision in `orchestra/progress.md`.

Direct conductor work or inline role execution is allowed for non-trivial tasks when:
- the work is short, obvious, fast-lane, or single-surface
- no decision-relevant independent workstream has been proven
- agent-tool capability detection fails
- an attempted authorized dispatch fails and the fallback is recorded
- Codex standard light mode applies and the user did not explicitly authorize delegation

```
WRONG (sequential — do not do this):
  Message 1: Task(ssp-frontend) → wait for result
  Message 2: Task(ssp-backend) → wait for result

CORRECT (parallel — one message, all wave agents):
  Message 1: Task(ssp-frontend) + Task(ssp-backend) → wait for both results
```

On platforms with a Task/sub-agent tool, the conductor's single dispatch batch causes all
authorized agents to start concurrently. On platforms without that tool, or in standard
light mode without delegation authorization, the conductor executes the same wave
sequentially/directly and records each result before proceeding.

Read-only reviewers and specialists that do not depend on each other's output should batch
together only when their verdicts are all needed for the next decision. Examples:
- `visual-ux-reviewer` + `accessibility-reviewer` + `responsive-reviewer`
- `security-trpc` + `security-fastapi` + `security-frontend`
- independent `research` / `api-contract-reviewer` / `observability-audit-agent`
  questions whose answers feed a later implementation wave

### Model Routing Rule

Before dispatching any sub-agent, read `model-routing.md` and choose a model preference.
The default for bounded, routine, non-deep sub-agent work is
`gpt-5.5`. Preserve explicit user or Task Packet model overrides. Escalate to the inherited
current/default model for deep-* routes, high-complexity/high-risk work,
performance-critical analysis, failed or blocked GPT 5.5 attempts, and repeated gate fixes.

If the active Task/sub-agent tool exposes a model override field, pass
`gpt-5.5` for lightweight-default packets. If the tool does not support model
overrides, keep the metadata in the Task Packet and proceed normally.

Codex enforcement: when using `spawn_agent` for lightweight-default work, the tool
call MUST include `model: "gpt-5.5"`. A Task Packet that only says
`model_preference: gpt-5.5` is documentation, not an actual model
override.

### Dispatch Metadata

Every wave plan must include dispatch metadata before launch:

```text
agent: ssp-frontend
portable_role: frontend
model_preference: gpt-5.5 | inherited-default | explicit:<model>
model_reason: lightweight-default | explicit-user-request | high-complexity | high-risk | performance-critical | deep-route | retry-escalation | unavailable
writes_files: true
background: false
isolation: worktree | none
ownership: [/absolute/path/to/file.tsx]
dispatch_mode: parallel_batch | parallel_with_worktree | single_agent | sequential_exception
same_wave_peers: [ssp-backend]
depends_on: [wave-1-backend-contract]
sequential_reason: N/A
loop_policy:
  iteration: 3/12
  dispatch_wave: 2/6
  active_subagents_after_dispatch: 2/4
  parallel_writers: 1/2
  report_target_words: 1500
```

Guidance:

- `background: true` is only for read-only or non-blocking analysis whose result will be
  collected before it is needed.
- File-editing agents use `background: false` because later waves depend on their files.
- If two file-editing agents run in the same wave, either use worktree isolation or prove
  their write sets are disjoint in `orchestra/contracts.md`.
- Every file-editing worker must have explicit `ownership_paths`; do not let workers fight
  over the same files.
- If the platform cannot enforce isolation and two writers might touch the same file, split
  them into sequential sub-waves.
- If `same_wave_peers` is non-empty and `dispatch_mode` is not parallel, `sequential_reason`
  is mandatory.
- If dispatch would exceed `agent-loop-policy.md` limits for active sub-agents,
  dispatch waves, parallel writers, or context capsule size, do not dispatch. Split the
  wave, reduce fanout, or stop with the matching `loop_policy_*` stop reason.
- Never launch replacement sub-agents for a missing/stuck result until the previous
  sub-agent is recorded as timed out or failed in `orchestra/progress.md`.
- Track every dispatched agent by id/role/scope/proof/usefulness/close status. Close the
  agent after its Result Capsule is integrated, or report why it could not be closed.
- If the owner changes the task while agents are active, reconcile the new scope and stop
  or rebrief any agent whose packet no longer matches the current command.

---

## 3. Task Packet Construction

The full Task Packet format is defined in `../../sub-agents/contracts/task-packet.schema.md`
and `task-packet-format.md`. This file covers
dispatch mechanics only.

**When building a Task Packet for dispatch:**

1. Start with all 8 sections from the Task Packet template (TASK, DOMAIN, FILES, CONTEXT,
   CONSTRAINTS, CONTRACT, OUTPUT, QUALITY GATE)
2. If this is wave N+1 or later, prepend the wave context block (see
   `wave-planning.md` Section 4) to the CONTEXT section
3. If the agent is part of a parallel pair, include the contract reference in the CONTRACT
   section (point to the relevant entry in `orchestra/contracts.md`)
4. Use absolute file paths only — never relative paths
5. Include the shared operational discipline in CONTEXT/CONSTRAINTS:
   - SocratiCode-first or targeted-shell fallback for local discovery
   - stay within FILES and CONTRACT
   - report blockers/options for unapproved shared contract or out-of-scope file changes
   - choose the least-impact contract-compliant implementation when options are equivalent
6. Include context and token discipline:
   - `packet_target_tokens`, `report_target_words`, `large_evidence_policy`, and
     `split_if_exceeded`
   - no full prior Result Reports, raw transcripts, full diffs, full logs, full stack
     traces, or full command output in CONTEXT
   - prior wave handoff uses a compact result capsule: status, changed files, top
     findings, blockers, stale gates, and open contract notes
7. Include the conductor's impact preflight summary and escalation criteria. A sub-agent
   should know exactly which downstream files/tests are in scope and when to stop.
8. Include model routing metadata from `model-routing.md`, and pass the model override to
   the sub-agent tool when supported.
9. Include loop policy metadata from `agent-loop-policy.md`, including stop instructions:
   return a compact Result Capsule, do not exceed report budget, and stop with a blocker
   instead of expanding scope or waiting indefinitely.

---

## 4. Standard Mode: Template Injection

When the detected platform is `standard`, prepend the agent role identity at the top of every
Task Packet prompt:

```
You are the [Role] Agent for the active codebase. [One-sentence description of the role's
primary responsibility.]

[Full Task Packet follows]
```

**Inject only identity, constraints, and shared operational discipline** from
`../../sub-agents/agents/NAME.md` plus
`../../sub-agents/references/shared-operational-discipline.md`.
Do not inject the full file — it inflates prompt size beyond what Standard mode handles reliably.

**Include:**
- Identity paragraph (who the agent is, what stack it specializes in)
- Constraints section (what it must NOT do)
- Shared operational discipline summary (SocratiCode/impact/scope/least-impact rules)
- Context discipline summary (bounded reads, compact Result Report, no raw dumps)

**Skip:**
- Workflow steps
- Quality Checklist
- Error Handling

### Standard Light Mode

Before building a Task Packet in standard mode, check the active sub-agent tool policy. If
it says spawning is allowed only when the user explicitly asks for sub-agents, delegation,
or parallel agent work, then:

1. Do not call `spawn_agent` for routine `small` or `medium` work.
2. Do not treat inline/direct execution as a policy violation.
3. Preserve the same ownership boundaries in `orchestra/plan.md` and `orchestra/contracts.md`.
4. Run targeted conductor review and repository commands instead of reviewer-agent waves.
5. If the user later asks for agents, switch back to normal Standard mode and use the
   dispatch metadata/model-routing rules above.

**Example injection prefix for frontend agent (Standard mode):**

```
You are the Frontend Agent for the active codebase. You implement React 19 components following
Wouter routing, Radix UI + CVA component patterns, and TanStack Query for server state.

Constraints: Do not modify backend files. Do not modify database schema. Do not modify
Python backend files. Do not commit directly — stage only.
Context discipline: keep report under 1,500 words; cite file:line evidence; do not paste
full files, diffs, logs, or test output.

---

TASK: Add the UserDashboard page component
DOMAIN: CMD-1 Frontend
...
```

---

## 5. Pre-Merge Security Gate Auto-Trigger

After the final wave completes (all tasks done, no more waves pending), check whether the
security gate must run before reporting completion. Read
`security-review-protocol.md` for the full trigger condition list.

**Phase split:** Step 5 performs the trigger check only and sets
`security_gate_required = true` when needed. Step 6 executes the security gate.

**If any trigger condition matches, the conductor:**

1. Builds up to 3 Task Packets — one per specialist portable role:
   `security-trpc`, `security-fastapi`, `security-frontend`
2. Dispatches all 3 in a single message (parallel)
3. Collects their Result Reports
4. Dispatches `security-review` as aggregator with the collected findings in its CONTEXT
5. `security-review` returns `status` plus `security_verdict: PASS | CONDITIONAL | FAIL`
6. Only then proceeds to Step 7 (progress update)

**Critical constraint:** `security-review` is an aggregator — it receives pre-collected
findings and returns a verdict. It does **NOT** dispatch further Task tool calls. Only
the orchestra conductor dispatches agents.

**Dispatch pattern for security gate:**

```
CORRECT (orchestra dispatches 3 specialists in parallel):
  Message 1: Task(ssp-security-trpc) + Task(ssp-security-fastapi) + Task(ssp-security-frontend)
  [wait for all three]
  Message 2: Task(ssp-security-review) with findings in context

WRONG (security-review dispatching):
  ssp-security-review calls Task(ssp-security-trpc) — NEVER do this
```

---

## 6. Background Flag Usage

When dispatching agents that do not need to block the conductor's main workflow, set
`background: true` in the Task tool call.

| Agent Type | Background Safe? | Reason |
|-----------|-----------------|--------|
| product-ux | Yes | Read-only product analysis; result injected into planning/architecture context |
| research | Yes | Read-only analysis; result injected into next wave context |
| reviewer | Yes | Read-only review; result collected after wave |
| error-detective | Yes | Log analysis; result collected asynchronously |
| dependency-supply-chain | Yes | Usually read-heavy audit; block before changes if broad lockfile updates are needed |
| security-trpc | Yes | Read-only audit; results collected before security-review |
| security-fastapi | Yes | Read-only audit |
| security-frontend | Yes | Read-only audit |
| visual-ui-requirement-analyzer | Yes | Read-only UI requirement analysis |
| visual-ui-direction | Yes | Read-only visual direction |
| visual-ux-reviewer | Yes | Read-only UX review |
| accessibility-reviewer | Yes | Read-only accessibility review |
| responsive-reviewer | Yes | Read-only responsive review |
| frontend (writing) | No | Next wave depends on files written |
| ui-builder (writing) | No | Next wave depends on files written |
| visual-final-refactor (writing) | No | Final patch depends on collected review findings |
| backend (writing) | No | Next wave depends on files written |
| python (writing) | No | Next wave depends on files written |
| database | No | Sequential-only; migration must complete before next step |
| e2e-playwright | No | Browser tests usually depend on app state and generated artifacts |
| performance | No | Baseline/verification must be serialized around the code under test |
| ci-release | No | Workflow/release gate changes are serialized with git and deploy state |
| debugger | No | Investigation must conclude before fix can proceed |
| security-review | No | Verdict must be received before reporting completion |

### Foreground Requirement — Never Promise "I'll Follow Up Automatically"

Background dispatch relies on the host re-invoking the conductor when the task
completes. In practice this notification is unreliable in some clients (e.g.
observed stalls in the VSCode Claude Code extension, where background-task
visibility is documented as limited compared to the CLI) — a promised
follow-up can silently never arrive, leaving the user to ask "is this done
yet?" instead of seeing the final summary.

**Rule:** any agent whose result gates the next wave, a quality gate, the
post-completion review, or the final summary — this includes every `No` row
above, i.e. all file-writing agents, `database`, `e2e-playwright`,
`performance`, `ci-release`, `debugger`, `security-review` — MUST be
dispatched with `background: false` and awaited before the conductor's turn
ends. Do not tell the user "I'll follow up as soon as it finishes" and then
end the turn; if the result is needed this session, wait for it inline and
report the outcome in the same turn.

`background: true` is reserved strictly for the `Yes` rows above (read-only
analysis/audits whose result is only consumed by a later wave, not by this
turn's closing summary). Even then, do not defer the final summary on an
unbounded background promise — collect the result before Step 7/8 finalizes,
per the normal wave-integration sequence in `result-integration.md`.

A `SubagentStop` hook (`.claude/hooks/notify.sh`) logs every sub-agent
completion to `.claude/hooks/notify.log` as a diagnostic safety net, but it is
not a substitute for this rule — it only helps confirm after the fact whether
a background agent finished; it does not make the conductor resume.
