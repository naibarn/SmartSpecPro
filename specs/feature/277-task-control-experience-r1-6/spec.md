---
spec_id: 277
canonical_revision: "R1.8"
canonical_status: CANONICAL
canonicalized_at: "2026-10-05T19:12:00+07:00"
revision_kind: GOVERNANCE_ONLY
semantic_baseline_revision: "R1.7"
semantic_baseline_sha256: "9e02e4b94e9bcacd80313aea04e27bf41cba4fe3ed71699839b71c01f018a099"
embedded_predecessor_revision: "R1.6"
embedded_predecessor_sha256: "f34937bf99b83ff50e44791be83a4e3030d18a703378bab572092ed2b22a8def"
revision_authority: "SPEC_INDEX.yaml"
filesystem_mtime_authoritative: false
filename_authoritative: false
---

# CURRENT CUMULATIVE REVISION — R1.8
## Project Work, Handoff, Source Coverage & Artifact UX Alignment

**Date:** 2026-10-05  
**Status:** Proposed / Additive / Implementation-Ready  
**Revision precedence:** This section and the amendment sections appended at the end are normative where they are more specific than predecessor text. The predecessor content is retained verbatim for compatibility and historical context.  
**Implementation mode:** additive-only around implemented dependencies.


## Implemented dependency boundary — mandatory

The following owners are already implemented and are **READ-ONLY** for this program:

- **Spec 206** — A2A-first Hybrid External Agent Interoperability
- **Spec 208** — Hybrid Computer Use / Dynamic Capability Routing
- **Spec 224** — Development Orchestrator Runtime
- **Spec 256** — Skill-First Capability Discovery / Intent Execution

A requirement that touches one of these owners MUST be implemented through an additive adapter, projection, compatibility contract, read model, or consumer-side metadata contract. It MUST NOT redefine the implemented owner's semantics or create a competing authority.


## Cross-spec ownership for this revision


- Spec 277 remains a UX/read-model layer over canonical task/evidence/runtime authorities.
- Spec 282 adds Work Context/Handoff projections.
- Spec 284 adds Project source/artifact/evidence projections.
- Spec 283 adds external-agent/capability health projections.
- No new queue, approval authority, retrieval engine or artifact byte store is introduced here.



## Cross-program invariants

```text
PROJECT ≠ CHAT SESSION
CHAT HISTORY ≠ MEMORY
CHAT TRANSCRIPT ≠ TASK SOURCE OF TRUTH

MCP ≠ CAPABILITY
A2A ≠ BUSINESS AUTHORIZATION
EXTERNAL AGENT ≠ HUMAN PRINCIPAL
EXTERNAL AGENT MEMORY ≠ SMARTAIHUB MEMORY
EXTERNAL AGENT SUMMARY ≠ CANONICAL FACT

VECTOR MATCH ≠ ANSWER
VECTOR INDEX ≠ SOURCE OF TRUTH
RAG CHUNK ≠ CURRENT OPERATIONAL STATE
SEMANTIC SIMILARITY ≠ TRUTH

CLAIM ≠ FACT
FACT ≠ CURRENT OPERATIONAL STATE
LATEST ≠ MOST SEMANTICALLY SIMILAR

ATTACHMENT ≠ CHANNEL-OWNED OBJECT
FILENAME ≠ DOCUMENT IDENTITY
SUMMARY ≠ ORIGINAL DOCUMENT
OCR TEXT ≠ ORIGINAL DOCUMENT
EMBEDDING ≠ DOCUMENT BACKUP

EPHEMERAL SOURCE ≠ DURABLE STORAGE
PRESERVE FIRST, INDEX SECOND

MESSAGE ≠ HANDOFF
ASSISTANT CHATTER ≠ WORK PROGRESS
APPROVAL CANDIDATE ≠ FORMAL APPROVAL

RELEVANCE ≠ AUTHORIZATION
CAPABILITY_UNAVAILABLE MAY FALL BACK
PERMISSION_DENIED MUST NOT BE BYPASSED BY LOWER-LEVEL UI AUTOMATION

CROSS-TENANT EXCHANGE ≠ CROSS-TENANT MEMORY ACCESS

EVERY MATERIAL RESPONSIBILITY TRANSFER MUST LEAVE A DURABLE RECEIPT
EVERY MATERIAL ANSWER MUST BE TRACEABLE TO SUPPORTING EVIDENCE
```


---

# PRESERVED PREDECESSOR CONTENT

# Spec 277 — Task Control Experience & Verified Execution Visibility

**Status:** Proposed / Additive implementation specification  
**Revision:** 1.6 — MCP 2026 extension compatibility addendum on top of R1.5; the R1.5 50-pass integrity review remains authoritative (2026-10-04)  
**Scope:** SmartAIHub Web + Desktop-responsive Task Control UX, read models, evidence rendering, capability visibility, approval/decision presentation  
**Primary surfaces:** `AI Chat & Feedback → Task Control`, task/run detail, mobile/tablet responsive views  
**Must preserve:** existing canonical execution authority, job state, approval boundaries, billing safeguards, runner placement, and durable orchestration contracts  
**Reference inspiration:** Builderz Labs Mission Control is a UX/operations reference only. SmartAIHub MUST NOT depend on or embed Mission Control.
**Behavioral reference:** ApodexAI FrontierAgent / AgentCore patterns are reviewed only as execution-semantics references. SmartAIHub MUST NOT add FrontierAgent or AgentCore as a required orchestration dependency.

---

## 1. Executive Summary

SmartAIHub already has a substantially deeper execution substrate than the current Task Control UI communicates. The existing Task Control surface is technically correct but visually under-expressive: it exposes internal architecture terms and empty-state records while hiding the information users actually need to make decisions.

Spec 277 upgrades Task Control from a thin development/run listing into a **user-facing AI work control center** that answers, within a few seconds:

1. What is AI doing for me now?
2. Which work needs my attention or approval?
3. How far has each task progressed?
4. Which agent/runtime/location is executing it?
5. Has the result actually been verified, and what evidence exists?

This is primarily an **information architecture + projection + presentation layer upgrade**, with narrowly scoped additive data contracts where existing canonical state is insufficient.

Spec 277 MUST NOT create a second scheduler, a second task database, a second approval engine, or competing execution authority.

---

## 2. Why This Spec Exists

The current Task Control Center presents system-oriented concepts such as:

- `DevelopmentRun`
- `canonical worker job`
- `Spec 224 state`
- `Spec 226 control surface`
- `Runner/MCP`
- persistence/implementation terminology

These are useful for developers and diagnostics, but they are not the primary questions of normal users.

The current visual hierarchy also gives disproportionate space to task creation while active work, progress, approvals, verification, agent placement, and recent activity are either absent, sparse, or buried.

The result is a perception gap:

> SmartAIHub has sophisticated orchestration underneath, but Task Control can appear almost empty or unfinished.

Spec 277 closes that gap without changing the underlying authority model.

---

## 3. Product Principle

### 3.1 Primary principle

> **Show exceptions first, current work second, infrastructure last.**

Default information priority:

1. Needs Your Attention
2. Running Now
3. Pipeline / Queue
4. Recently Completed
5. Agents & Execution
6. Recent Activity
7. Advanced diagnostics

### 3.2 Progressive disclosure

The UI MUST support three visibility levels:

| Level | Default audience | Visible information |
|---|---|---|
| User | Everyone | status, progress, next step, approvals, verification summary |
| Advanced | power users | checks, files, artifacts, agent/runtime, cost, detailed evidence |
| Developer/Admin | operators | canonical IDs, job/run IDs, leases, authority snapshots, receipt hashes, raw adapter/runtime details |

Internal spec numbers and architectural jargon MUST NOT appear in User mode.

The selected visibility level SHOULD persist per user/device where an existing preference mechanism exists. Role must only cap maximum visibility; it must not silently grant access to data the user is not authorized to read.

### 3.3 Backend sophistication, frontend simplicity

The following backend concepts are required, but their technical names should not normally be exposed directly:

| Backend concept | User-facing concept |
|---|---|
| Runtime Capability Manifest | **What this agent can do** |
| Task Completion Contract | **What must pass before this task is done** |
| Normalized Evidence Receipt | **Verification results / proof** |
| Action Provenance + Permission Snapshot | **Activity / who did what / permissions used** |

---

## 4. Relationship to Existing Specs

Spec 277 is additive and MUST reuse existing contracts whenever possible.

### 4.1 Spec 186 — Unified Job Control Plane

Reuse as the canonical job/run execution source for:

- job identity
- status
- lease/ownership
- retry/recovery state
- worker/runner placement
- events
- terminal outcomes

Spec 277 MUST NOT implement another queue or lifecycle engine.

### 4.2 Spec 224 — Development Orchestrator Runtime

Reuse as the authoritative source for development workflow stages such as:

`Plan → Implement → Test → Debug → Review → Verify`

Spec 277 visualizes these stages and translates them into user-readable progress/checks.

### 4.3 Spec 226 — Task Control Center

Spec 226 remains the existing canonical task control integration surface. Spec 277 upgrades the UX and introduces normalized presentation/read-model contracts where necessary.

No existing Spec 226 behavior may be silently removed.

### 4.4 Spec 200 / 206 — External Agent Gateway / A2A

Reuse runtime/agent capability information and remote execution identity.

Spec 277 displays capability differences honestly rather than implying equal feature depth across Claude, Codex, Hermes, external A2A agents, local runners, and SmartAIHub-native execution.

### 4.5 Spec 269 — Chat / handoff / task presentation

Task cards and task detail MUST be deep-linkable from chat and able to return to the originating chat/thread without duplicating state.

### 4.6 Spec 276 — execution authority / durable orchestration refinements

Spec 277 MUST respect explicit execution authority and placement. A task may display multiple candidate runtimes, but only the authoritative execution lease/placement may be shown as active.

There MUST NOT be competing UI actions that accidentally cause two schedulers/runtimes to claim the same task.

### 4.7 Spec 256 — implemented Skill-first Capability Resolver

Spec 256 is implemented and remains the canonical semantic capability discovery/resolution layer for this integration. Spec 277 MAY project its selected capability/implementation/preflight facts but MUST NOT create a competing capability registry, semantic ranker, entitlement engine, or intent router.

Protocol-specific details such as MCP `server/discover`, extension settings, and wire negotiation remain below Spec 256 in their protocol adapters; Spec 256 consumes normalized qualified implementation offers.

### 4.8 MCP Gateway / Spec 199 and Skills transport / Spec 248

The MCP Gateway owns base-protocol compatibility, transport, request/response semantics, `server/discover`, generic extension negotiation and peer connection state. The Skills-over-MCP transport owner remains responsible for `io.modelcontextprotocol/skills` wire compatibility.

Spec 277 consumes normalized protocol/extension observations and qualification outcomes for display and preflight explanation only. It MUST NOT become an MCP client/server implementation or mint protocol authorization.

### 4.9 Spec 261 — SPAAS protocol requirements

Spec 261 owns portable application/product requirements, including required/optional protocol extensions and declared fallback semantics. Spec 277 projects whether the chosen runtime currently satisfies those requirements and why a fallback/degraded/block state was selected.

An application requirement and a runtime advertisement are separate facts; neither is execution authority.

---

## 5. Goals

### G1 — Make active AI work legible

A user should understand the current situation within 3–5 seconds.

### G2 — Make approvals and decisions impossible to miss

Items requiring user action must be visually prioritized over informational state.

### G3 — Show trustworthy progress

Progress must derive from actual state/checkpoints, not fabricated percentages generated by an LLM.

### G4 — Show whether work is really verified

A task may not be presented as fully complete when required completion checks or evidence are still missing.

### G5 — Expose runtime differences without overwhelming users

The system may auto-select runtime/placement while still providing advanced detail about capability and location.

### G6 — Preserve one source of truth

Task Control is a projection of canonical orchestration state, not another orchestration system.

### G7 — Work well on desktop, tablet, and phone

The interface must not require a wide desktop to be usable.

---

## 6. Non-Goals

Spec 277 does NOT:

- replace Spec 224 orchestration
- replace worker_jobs / canonical job state
- create a new scheduler
- create another approval engine
- force all runtimes to have feature parity
- require every user to understand runtime internals
- expose raw secrets, prompts, environment variables, or credential-bearing tool input/output
- guarantee that every workflow can compute a numeric percentage
- turn Task Control into a full DevOps console by default

---

## 7. Primary UX — Task Control Overview

### 7.1 Header

Replace development-centric copy with user-centric copy.

Recommended:

**Title:** `Task Control`  
**Subtitle:** `See what AI is doing, what needs your input, and what has been verified.`

A compact start-task composer may remain in the header, but MUST NOT dominate the page.

Desktop:

`[ Describe what you want the agent to do…                         ] [Start task]`

Mobile:

`[ + Start task ]`

Opening Start Task may expand the composer or route to Chat while preserving the current one-path safeguards.

### 7.2 Summary cards

Display four high-signal aggregate cards:

- **Running** — currently executing
- **Need You** — decision/approval/user input required
- **Waiting** — queued/planning/waiting dependency
- **Failed** — terminal failure or unresolved recovery

Counts MUST be owner/workspace/tenant scoped according to existing authorization.

Each card is filterable.

### 7.3 Pipeline

Show a compact pipeline projection.

Default general pipeline:

`Queue → Planning → Running → Verify → Done`

For development workflows, the detail view may show richer stages:

`Plan → Implement → Test → Debug → Review → Verify`

The overview SHOULD aggregate into the simpler five-stage model.

### 7.4 Needs Your Attention

This is the highest-priority section when non-empty.

Attention item types include:

- approval required
- decision required
- missing credential/configuration requiring user action
- runtime unavailable and user choice required
- budget exceeded or extension required
- security/policy block
- destructive action confirmation
- failed final verification requiring disposition
- ambiguous external side effect requiring confirmation

Each card MUST show:

- concise task title
- why attention is required
- agent/runtime if relevant
- age / time waiting
- one primary action
- optional secondary Review action

Examples:

- `Deploy production — Requires your approval`
- `Choose data source — 2 options need a decision`
- `Database migration blocked — Review schema change`

### 7.5 Running Now

Show active task cards with:

- title
- assigned agent/runtime
- execution location
- status/stage
- progress model
- current action
- completion checklist preview
- elapsed time
- attention indicator if blocked

Example:

```text
Fix Login session timeout                         82%
Claude Code • Office-PC
████████████████░░
✓ Analyze issue
✓ Code changes
✓ Unit tests
○ Browser verification
○ Final verify
```

### 7.6 Agents & Execution

Compact operational visibility, not a full infrastructure console.

Show:

- agent/runtime display name
- online/busy/idle/error/offline
- location: Office-PC / Home-PC / Cloud Container / Cloudflare / External
- active task count

Advanced mode may reveal:

- adapter version
- capability depth
- session ID
- runtime version
- heartbeat
- connection details with secrets redacted

### 7.7 Recent Activity

Show normalized user-readable events:

- tests passed
- file changed
- source verified
- browser verification started
- approval requested
- artifact generated
- deployment verified

Do not render raw worker logs in this section.

### 7.8 Recently Completed

The overview MUST provide a compact recently completed section or an immediately reachable history view. Each row/card should show:

- task title
- completion time
- verified / unverified / accepted-with-risk outcome
- producing agent/runtime when useful
- primary artifact/result link when authorized

A completed item MUST NOT be labeled `Verified` merely because its canonical lifecycle state is `done`. Verification is an orthogonal dimension defined in §8.8.

### 7.9 Search, filters, and history

Task Control MUST remain useful once an account has hundreds or thousands of tasks. Provide search/filter support over authorized projections, at minimum:

- text search by task title/reference
- status/display-state
- project/workspace/team when available
- agent/runtime
- verification state
- date range
- needs-attention only

Filters MUST be encoded in URL/query state on web where practical so a view can be shared/bookmarked without embedding sensitive task content.

### 7.10 Display-state classification and count invariants

The four summary cards are a **presentation partition**, not four independent queries. A task MUST appear in at most one headline bucket at a time.

Required precedence:

1. `Need You` — actionable human decision/approval/input is currently blocking or explicitly requested
2. `Failed` — terminal failure or recovery exhausted and no human action request currently supersedes it
3. `Running` — canonical execution is active, including verifying work that is still executing
4. `Waiting` — queued, planning, dependency wait, scheduled wait, placement wait, or non-terminal blocked state without required human action

`Done`, cancelled, archived, and historical terminal items are excluded from those four headline counts and appear in Recently Completed/History.

The backend MUST expose the classification reason so the UI does not independently reinterpret canonical state. Count totals MUST equal the distinct **headline count-unit identities** returned by the same scoped classification snapshot; by default these are user-visible root tasks as defined in §7.14, not every internal subtask/attempt.

### 7.11 Default ordering

Within sections, use deterministic ordering:

- Needs Your Attention: severity/risk → due/expiry time → oldest waiting first
- Running Now: blocked/at-risk first → most recently active → task priority
- Waiting: scheduled/due time → priority → FIFO
- Failed: unresolved impact/severity → newest failure
- Recently Completed: completion time descending

Ties MUST use a stable task identifier to avoid cards jumping between refreshes.

### 7.12 Attention lifecycle and notification handoff

`Needs Your Attention` is a projection of canonical approvals/decisions/blockers, not a standalone inbox database. Because users may not have Task Control open, actionable attention SHOULD integrate with the existing SmartAIHub notification/chat-continuation path.

Requirements:

- derive a stable `attentionKey` from the canonical task/run/decision/request identity;
- deduplicate repeated events for the same unresolved attention item;
- support states such as `open`, `acknowledged`, `resolved`, `expired`, and `superseded` without inventing a second decision state machine;
- notification/deep-link opens the exact Task Details / Decisions context;
- when the canonical decision resolves elsewhere, Task Control and any outstanding notification update/close accordingly;
- escalation/reminder cadence, if enabled, reuses the existing notification/scheduling subsystem and policy;
- high-risk approvals MUST NOT be executable from an untrusted notification payload without canonical re-auth/re-check.

Spec 277 MUST NOT create another push-notification or scheduler engine solely for Task Control.

### 7.13 Scope context

The active Task Control scope MUST be visible when a user can access multiple personal/project/team/tenant contexts. Counts, filters, search, activity, and agent lists MUST all use the same active scope snapshot.

Changing scope triggers a new scoped projection load; it MUST NOT merge counts from scopes that have different authorization boundaries.

### 7.14 Headline count unit and task-group aggregation

A user-visible task may fan out into retries, parallel child tasks, reviewer loops, research branches, or implementation subtasks. Task Control MUST NOT inflate the four headline cards by counting every internal work unit as an independent user task.

Default headline count unit is the **user-visible root task / intent**:

- one root task counts once in `Running`, `Need You`, `Waiting`, or `Failed`;
- internal child tasks, attempts, reviewer loops, and execution steps are summarized under that root unless they were explicitly created as separately user-visible tasks;
- a root with multiple child branches derives its headline bucket from the highest-precedence unresolved condition in §7.10;
- the UI MAY additionally show work-unit detail such as `1 task • 4 active steps` or `3 subtasks running`, but those work units MUST NOT silently change the headline task count;
- if a child task has independent ownership, due date, billing, approval, or user-visible lifecycle, it MAY opt into independent counting through an explicit canonical `userVisibleTask=true`/equivalent flag rather than UI inference;
- parent/child aggregation rules MUST be deterministic and versioned so projector rebuilds produce the same counts.

Pipeline labels MUST make the counting basis explicit when work-unit counts are shown. Do not mix root-task counts and execution-step counts in one unlabeled number.

### 7.15 Canonical Work Board / execution checklist

Task Control MUST expose a normalized **Work Board** for workflows that have explicit decomposed work. This is not a second task database and not a free-form agent notebook. It is a user-facing projection of canonical workflow/task state.

The Work Board answers:

- what sub-question/work item exists;
- who/what currently owns it;
- whether it is pending, active, completed, blocked, cancelled, or superseded;
- what completion/evidence dependency remains;
- whether it is user-visible or internal-only.

Recommended normalized shape:

```ts
interface WorkBoardItem {
  workItemId: string;
  rootTaskId: string;
  parentWorkItemId?: string;
  label: string;
  state: 'pending' | 'active' | 'completed' | 'blocked' | 'cancelled' | 'superseded';
  ownerRefs?: string[];
  group?: string;
  phase?: string;
  required: boolean;
  evidenceRefs?: string[];
  blockerRef?: string;
  userVisible: boolean;
  updatedAt: string;
}
```

Rules:

- the board tracks **resolution/state**, not long-form findings or hidden chain-of-thought;
- research notes, tool output, and evidence remain in their canonical stores/recoverable handles;
- board state MUST be replayable from canonical orchestration/task events or an explicit workflow contract;
- internal work items may be collapsed by default but remain inspectable when authorized;
- completion/finalization may depend on required board items, but the UI MUST NOT invent board requirements independently;
- a board item marked `completed` without required evidence does not automatically satisfy its completion criterion;
- board operations/events are idempotent and carry canonical version/revision metadata.

User-facing labels SHOULD remain simple: `Plan`, `In progress`, `Blocked`, `Done`. Developer identifiers remain behind progressive disclosure.

### 7.16 Execution topology summary

For tasks using parallel workers/sub-agents/reviewers, the overview and detail views SHOULD summarize topology without exposing internal orchestration noise.

Examples:

- `3 workers active • 2 completed`
- `Research split across 4 sources`
- `Implementation → independent review → final verify`
- `Browser verification delegated to Cloud Browser`

The topology summary MUST derive from canonical task/run/agent relations. It MUST NOT imply that every worker is an independent user-visible task. Bounded parallelism/budget policy remains owned by the orchestration/runtime specs; Spec 277 only projects the authoritative result.

### 7.17 Work Board mutation, plan revision, and user-edit semantics

Because the Work Board is a projection of canonical execution state, UI edits MUST NOT directly mutate projector rows. A user action such as adding, removing, reordering, reprioritizing, or reassigning a work item is a **plan-change command / steering instruction** submitted to the canonical orchestration layer.

Required semantics:

- every mutation has an idempotency key and expected board/plan revision;
- accepted mutations create a new canonical `planRevision` / equivalent immutable revision marker;
- removing or weakening a required work item that contributes to the Completion Contract is treated as contract weakening and follows §10.5;
- reordering is advisory unless the workflow declares order as execution-significant;
- reassignment MUST re-check runtime/capability/authority eligibility before ownership changes;
- a stale client cannot overwrite a newer plan revision; it receives a conflict and refreshes;
- internal-only work items cannot be promoted to user-visible or independently billable merely by UI inference;
- edits that invalidate already-completed work MUST mark affected board items/evidence `stale` or return them to an unresolved state rather than preserving false completion.

Suggested projection metadata:

```ts
interface WorkBoardRevisionSummary {
  planRevision: number;
  generatedAt: string;
  changedBy?: string;
  changeReason?: string;
  supersedesRevision?: number;
}
```

User mode SHOULD phrase this as `Update plan` / `Change task plan`, not `edit canonical task graph`.

### 7.18 Attention deadlines, expiry, and unattended fallback projection

An autonomous task may legitimately wait for a human decision for hours or days. Task Control MUST distinguish an ordinary wait from an **attention deadline** and MUST never convert lack of response into implicit approval.

Suggested projection:

```ts
interface AttentionDeadlineSummary {
  attentionKey: string;
  requestedAt: string;
  deadlineAt?: string;
  expiryBehavior:
    | 'remain-blocked'
    | 'cancel-pending-action'
    | 'safe-fallback'
    | 'escalate'
    | 'policy-defined';
  escalationRef?: string;
  fallbackSummary?: string;
}
```

Rules:

- expiry/fallback behavior comes from canonical approval/workflow policy, never from Task Control inference;
- `safe-fallback` MUST be explicitly authorized by policy and cannot mean auto-approve a privileged/destructive action;
- reminders/escalation reuse existing notification/scheduling infrastructure;
- the attention card SHOULD show `Due in 2h`, `Expired`, `Will remain blocked`, or a similarly truthful outcome when relevant;
- if an approval expires while the user is reviewing it, mutation is disabled and the card refreshes to the new canonical state;
- autonomous runs with no permitted fallback remain visibly blocked rather than silently continuing with reduced guarantees.

### 7.19 Parallelism budget, saturation, and resource-wait truthfulness

Spec 277 does not own spawn/concurrency budgets, but it MUST project when canonical work is waiting because bounded parallelism, runtime quota, sandbox capacity, GPU capacity, provider admission, or another execution resource is saturated.

Recommended summary:

```ts
interface ExecutionCapacitySummary {
  active: number;
  limit?: number;
  queued?: number;
  reason?: 'parallelism-limit' | 'runtime-capacity' | 'provider-admission' | 'sandbox-capacity' | 'resource-policy' | 'unknown';
  retryAfter?: string;
}
```

Requirements:

- resource wait is not a no-progress failure by itself;
- the liveness watchdog treats an authoritative capacity wait/deadline as a known wait condition;
- UI SHOULD say `4 workers active • 2 waiting for capacity` instead of implying the queued branches are already running;
- Task Control MUST NOT encourage users to increase worker count when policy/budget says the task is intentionally bounded;
- capacity/parallelism values are operational projections only and do not grant execution authority.

---

## 8. Task / Run Detail UX

Opening a task card MUST navigate to or overlay a unified Task Details view.

### 8.1 Header summary

Show:

- task title
- status
- assigned agent/runtime
- execution location
- started time
- elapsed time
- cost/token summary when available
- current stage

Recommended tabs:

1. Overview
2. Verification
3. Activity
4. Files
5. Decisions

Developer/Admin mode may add `Diagnostics`.

### 8.2 Overview tab

Show:

- intent / short task description
- current stage
- stage sequence
- current blocker, if any
- important artifacts
- next automatic action
- next user-required action, if any

### 8.3 Verification tab

This is the user-facing projection of the Task Completion Contract + Evidence Receipts.

Example:

| Check | Evidence | State |
|---|---|---|
| Unit tests | `38/38`, exit code 0 | Passed |
| Type check | 0 errors | Passed |
| API contract | no breaking changes | Passed |
| Browser login | 3/3 scenarios | Passed |
| Browser logout | 2/2 scenarios | Passed |
| Final verify | running | In progress |

The UI MUST distinguish:

- Passed
- Failed
- Pending
- In progress
- Not applicable
- Unsupported by runtime
- Manual review required
- Evidence missing / unverified

A prose statement from an agent MUST NOT be rendered as equivalent to machine-captured evidence.

### 8.4 Activity tab

Render a causal timeline of normalized events.

Examples:

- Task started
- Repository analyzed
- Code changes made
- Tests passed
- Approval requested
- User approved
- Deployment started
- Final verification passed

Each event can expand to advanced details.

### 8.5 Files tab

For coding/file workflows, show changed files and artifacts when available:

- file path
- change type: Added / Modified / Deleted / Renamed
- additions/deletions
- artifact reference
- diff link if available and authorized

For non-code tasks, this tab may become `Artifacts` or show generated reports/media/files.

### 8.6 Decisions tab

Unify human-in-the-loop items:

- pending approval
- answered approval
- rejected request
- decision alternatives
- operator override
- accepted risk

Show who decided and when, but do not leak sensitive identity data across scopes.

### 8.7 Handoffs, retries, parallel work, and task groups

A logical task may have multiple execution runs because of retry, recovery, runtime handoff, parallel subtasks, reviewer loops, or placement changes. Task Control MUST NOT flatten those into a misleading single run.

Rules:

- `taskId` identifies the user-visible logical task.
- `runId` identifies one durable execution run/attempt lineage.
- retries/attempts retain their own attempt identity and outcome.
- handoffs record `fromActor/fromRuntime → toActor/toRuntime` and the reason.
- parallel child work may be summarized under the parent task but remains inspectable.
- only the currently authoritative lease/placement may be labeled `Active executor`.
- superseded or fenced-out attempts MUST render as historical/superseded, never as concurrently active work.

The timeline SHOULD visually distinguish `Retry`, `Recovered`, `Handed off`, `Superseded`, and `Parallel child completed`.

### 8.8 Lifecycle state and verification state are orthogonal

Task Control MUST keep two dimensions separate:

**Lifecycle:** queued / planning / running / waiting / failed / cancelled / done  
**Verification:** not-required / pending / verifying / verified / failed / unverified / accepted-with-risk / stale

Examples:

- lifecycle `done` + verification `unverified` → `Completed — not verified`
- lifecycle `done` + verification `accepted-with-risk` → `Completed — risk accepted`
- lifecycle `running` + verification `verifying` → `Running — verifying`
- lifecycle `failed` + verification `failed` → `Failed verification` when verification caused the terminal outcome

The UI MUST NOT collapse these into a single ambiguous status string in API contracts.

### 8.9 Dependencies, blockers, and critical path visibility

Tasks may be blocked by other SmartAIHub tasks or by external dependencies. Waiting state MUST explain **what is being waited on** instead of showing a generic spinner.

Minimum dependency model:

```ts
interface TaskDependencySummary {
  dependencyId: string;
  type: 'task' | 'external-system' | 'time' | 'resource' | 'human' | 'policy';
  targetRef?: string;
  label: string;
  blocking: boolean;
  state: 'pending' | 'satisfied' | 'failed' | 'cancelled' | 'unknown';
  createdAt: string;
  satisfiedAt?: string;
  reason?: string;
}
```

Requirements:

- dependency edges come from canonical orchestration state or an explicit workflow contract, never UI inference;
- Task Details shows the current blocker and upstream/downstream relationship when authorized;
- parent tasks summarize child blockers without hiding which branch is responsible;
- dependency cycles MUST be detected by the orchestration/workflow layer or surfaced as a deterministic configuration error; Task Control MUST NOT display an endless unexplained `Waiting` state;
- ETA is shown only when a canonical scheduler/runtime supplies a bounded estimate; Task Control MUST NOT invent an ETA from elapsed time;
- when a dependency changes from satisfied back to invalid/failed, dependent progress and verification may regress truthfully and the reason is recorded in provenance.

### 8.10 Multi-party approvals, expiry, and action binding

Team/tenant workflows may require more than a single approver. The Decisions surface MUST support the canonical approval policy without flattening it to one `Approve` button.

Supported projection concepts SHOULD include:

- one approver;
- any-one-of an authorized role/group;
- all required approvers;
- `N-of-M` quorum;
- ordered approval stages;
- delegated approver when canonical policy permits delegation;
- expiry / decision deadline;
- revoked or superseded approval.

Every high-impact approval MUST be bound to the exact action/resource/version it authorizes (for example action type + target + payload/config digest + canonical version). A materially changed migration, deployment digest, destination, budget, or permission request invalidates the prior approval and requires a new decision according to policy.

The UI MUST show `2 of 3 approvals received`, `Approval expired`, or equivalent truthful state. Bulk approval MAY exist only when canonical policy explicitly allows it and the user is shown a precise summary of every action being authorized; high-risk actions default to individual review.

---

## 9. Runtime Capability Manifest

### 9.1 Purpose

Normalize what SmartAIHub can honestly do through each runtime/adapter.

### 9.2 Minimum schema

Capability support is not boolean because runtime depth can be unknown, temporarily degraded, or placement-dependent.

```ts
type CapabilityState = 'supported' | 'unsupported' | 'unknown' | 'degraded';

interface CapabilityDescriptor {
  state: CapabilityState;
  reason?: string;
  source: 'adapter-static' | 'runtime-probe' | 'remote-advertisement' | 'policy';
  observedAt: string;
  validUntil?: string;
}

interface RuntimeCapabilityManifest {
  manifestVersion: string;
  runtimeId: string;
  adapterId: string;
  adapterVersion: string;
  placementRef?: string;
  runtimeVersion?: string;
  capabilities: {
    dispatch: CapabilityDescriptor;
    sessionResume: CapabilityDescriptor;
    interactiveSession: CapabilityDescriptor;
    workspaceCwd: CapabilityDescriptor;
    toolPolicy: CapabilityDescriptor;
    budgetCap: CapabilityDescriptor;
    structuredOutput: CapabilityDescriptor;
    browser: CapabilityDescriptor;
    codeDiff: CapabilityDescriptor;
    tests: CapabilityDescriptor;
    artifacts: CapabilityDescriptor;
    skillsInventory: CapabilityDescriptor;
    telemetry: CapabilityDescriptor;
  };
  evidenceTypes: EvidenceType[];
  protocolProfiles?: ProtocolCapabilityProfile[];
  limitations?: string[];
  observedAt: string;
  validUntil?: string;
}
```

### 9.3 Rules

- Manifest is capability metadata, NOT execution authority.
- `supported` requires a shipping implementation path or a successful authoritative probe.
- `unknown` MUST remain unknown; it MUST NOT be promoted to supported by assumption.
- `degraded` means the capability exists but current placement/runtime/policy cannot guarantee normal depth.
- Capability may depend on placement/device/runtime/adapter version.
- Expired manifests MUST be refreshed or treated as `unknown` for hard-requirement routing.
- Remote-advertised capability is an attestation, not proof of successful execution; evidence receipts remain required for completion.
- UI default mode SHOULD show only relevant limitations.

### 9.4 Pre-dispatch use

Before dispatching work that has hard requirements, Capability Resolver SHOULD reject or degrade incompatible runtimes before execution.

Example:

A task requiring browser evidence cannot silently auto-complete using a runtime that cannot produce browser evidence.

Possible outcomes:

- Eligible
- Eligible with fallback capability provider
- Degraded / manual verification required
- Ineligible

### 9.5 Task capability requirements and preflight record

Hard requirements SHOULD be normalized separately from the runtime manifest:

```ts
interface TaskCapabilityRequirement {
  capability: string;
  required: boolean;
  fallbackAllowed: boolean;
  requiredEvidenceTypes?: EvidenceType[];
}

interface CapabilityPreflightResult {
  taskId: string;
  evaluatedAt: string;
  manifestRefs: string[];
  outcome: 'eligible' | 'eligible-with-fallback' | 'manual-review' | 'ineligible';
  missing: string[];
  degraded: string[];
  fallbackPlan?: string[];
}
```

Persist a reference to the preflight result used at dispatch so later incident review can explain why that runtime/placement was selected.

### 9.6 Capability composition and delegated providers

A task may legitimately combine capabilities from multiple providers, for example `Claude Code` for code changes plus `Cloud Browser` for browser verification. Capability composition MUST be explicit.

Rules:

- delegation does not mutate the primary runtime manifest; a runtime that lacks browser support remains `unsupported` for browser even if another provider supplies it;
- the preflight plan records which provider/placement satisfies each hard requirement and evidence type;
- every delegated step receives its own authority boundary, action identity, provenance, and evidence producer identity;
- a placement/runtime/provider change after preflight invalidates the affected preflight decision and requires re-evaluation before the delegated step executes;
- if a delegated provider becomes unavailable, the task moves to a truthful degraded/waiting/manual-review state rather than pretending the primary runtime can substitute;
- Task Control SHOULD summarize composition in user language such as `Claude Code • Browser verification via Cloud Browser` and reserve adapter-level detail for Advanced mode.

Suggested normalized fragment:

```ts
interface CapabilityFulfillment {
  requirement: string;
  providerRuntimeId: string;
  placementRef?: string;
  manifestRef: string;
  evidenceTypes?: EvidenceType[];
  delegated: boolean;
}
```

### 9.7 Phase-scoped capability and execution-authority gate

A runtime capability manifest answers **what a provider can do**; it does not answer **what it is allowed to do in the current phase**. Task Control therefore needs a normalized projection of the effective phase/stage policy produced by the canonical orchestration/policy layer.

Typical phases may include:

`Discover → Plan → Execute → Test → Verify → Finalize`

but workflow-specific stage graphs remain authoritative.

Recommended normalized projection:

```ts
interface PhaseExecutionPolicyView {
  taskId: string;
  runId: string;
  phase: string;
  policyRevision: string;
  allowedCapabilityClasses: string[];
  deniedCapabilityClasses?: string[];
  mutationAllowed: boolean;
  delegationAllowed: boolean;
  finalizationAllowed: boolean;
  transitionRequirements?: string[];
  observedAt: string;
}
```

Requirements:

- phase authorization is enforced server/runtime-side, never only by UI or prompt text;
- policy SHOULD be allowlist/fail-closed for phases that intentionally restrict mutation (for example Planning);
- a newly added mutating capability MUST NOT become usable in a restricted phase merely because the UI does not know about it;
- planning may allow read-only inspection and Work Board updates while blocking destructive/mutating execution until the canonical transition is accepted;
- phase transition events appear in Activity with the reason/requirements satisfied;
- the UI SHOULD explain blocked actions as `Available after planning`, `Requires verification`, or equivalent user language;
- Spec 277 MUST reuse the execution-authority/policy machinery defined by the orchestration stack rather than introducing a parallel permission engine.

### 9.8 Authority epoch, queued-action revalidation, and TOCTOU safety

A capability/tool action may be planned under one phase/policy and execute later after the phase, approval, placement, or policy has changed. Spec 277 MUST therefore distinguish **displayed permission** from the authority checked at actual execution time.

The canonical runtime/policy layer SHOULD expose an authority/policy epoch or equivalent immutable version reference that can be bound to action requests.

```ts
interface ExecutionAuthorityBinding {
  taskId: string;
  runId: string;
  phase: string;
  phaseRevision: string;
  authorityEpoch: string;
  capabilityClass: string;
  actionDigest?: string;
  evaluatedAt: string;
}
```

Rules:

1. every queued mutating action is re-authorized immediately before side effect;
2. a phase transition, policy update, approval revocation, placement change, or task cancellation invalidates stale authority bindings as defined by policy;
3. the UI may show `Allowed now`, but MUST NOT imply that permission is irrevocable until execution;
4. a stale queued action is rejected/replanned rather than executed under the old phase;
5. phase transition and the activation of the new effective authority MUST be atomic from the executor's perspective, or fenced by an epoch/version check;
6. retries MUST obtain fresh authority unless the canonical policy explicitly proves the old binding remains valid.

This closes time-of-check/time-of-use races between Task Control, the orchestrator, and delayed workers.


### 9.9 Protocol capability profiles

Runtime capability truth MUST support protocol-specific capability profiles without converting protocol details into top-level hard-coded fields.

```ts
interface ProtocolCapabilityProfile {
  protocol: string;                    // e.g. 'MCP', 'A2A'
  selectedProtocolVersion?: string;
  supportedProtocolVersions?: string[];
  discoverySource?: 'runtime-probe' | 'remote-advertisement' | 'adapter-static';
  coreCapabilities?: Record<string, CapabilityDescriptor>;
  extensions?: Record<string, ProtocolExtensionDescriptor>;
  negotiationReceiptRef?: string;
  observedAt: string;
  validUntil?: string;
}

interface ProtocolExtensionDescriptor {
  extensionId: string;
  extensionVersion?: string;
  state: CapabilityState;
  advertisementState: 'advertised' | 'not-advertised' | 'unknown';
  negotiationState: 'negotiated' | 'not-negotiated' | 'incompatible' | 'unknown';
  qualificationState: 'qualified' | 'unqualified' | 'failed' | 'unknown';
  settings?: Record<string, unknown>;
  fallbackMode?: 'core-protocol' | 'adapter' | 'durable-wrapper' | 'native-ui' | 'user-mediated' | 'none';
  source: 'adapter-static' | 'runtime-probe' | 'remote-advertisement' | 'policy';
  observedAt: string;
  validUntil?: string;
}
```

Protocol extension identifiers are open-ended namespaced IDs. Spec 277 MUST NOT enumerate the universe of MCP extensions in its core schema.

### 9.10 Advertised, negotiated, qualified, and eligible are distinct

For protocol capabilities, Task Control and routing diagnostics MUST preserve this sequence:

```text
peer advertised
      ↓
mutually negotiated
      ↓
SmartAIHub qualified
      ↓
currently eligible for this actor/context
```

Rules:

- remote advertisement is an attestation only;
- mutual negotiation proves wire-level compatibility/settings, not security/quality/readiness;
- qualification is produced by the protocol adapter/conformance/policy owner;
- eligibility adds current permission, entitlement, health, placement, data-egress, regional and other policy constraints;
- User mode normally shows only the resulting usable/degraded/block state;
- Advanced/Developer mode MAY show each stage and reason codes;
- a hard capability requirement MUST NOT be satisfied from `advertised` alone.

### 9.11 MCP 2026 discovery and extension negotiation projection

For an MCP `2026-07-28` peer, the MCP Gateway may produce a normalized negotiation receipt derived from `server/discover` and request/peer capability metadata.

```ts
interface ProtocolNegotiationReceipt {
  receiptId: string;
  protocol: 'MCP' | string;
  peerRef: string;
  requestedProtocolVersion?: string;
  selectedProtocolVersion: string;
  clientExtensionIds: string[];
  serverExtensionIds: string[];
  negotiatedExtensionIds: string[];
  incompatibleExtensionIds?: string[];
  fallbackDecisions?: Array<{
    extensionId: string;
    decision: 'use-extension' | 'core-fallback' | 'adapter-fallback' | 'reject';
    reasonCode: string;
  }>;
  observedAt: string;
  validUntil?: string;
}
```

This receipt is protocol compatibility evidence, not authorization and not completion evidence for the task's business outcome.

The projector MUST tolerate older MCP adapters that do not expose this structure by showing protocol details as `unknown` rather than fabricating extension support.

### 9.12 MCP Tasks external execution binding

An MCP Tasks handle MUST NOT be projected as a second SmartAIHub Task or as a second scheduler authority.

```ts
interface ExternalProtocolTaskBinding {
  protocol: 'MCP' | string;
  peerRef: string;
  externalTaskId: string;
  extensionId?: string;               // e.g. io.modelcontextprotocol/tasks
  extensionVersion?: string;
  canonicalTaskId: string;
  canonicalRunId: string;
  canonicalAttemptId?: string;
  assignmentGeneration?: number;
  observedRemoteState?: string;
  observedAt: string;
  reconciliationReceiptRef?: string;
}
```

Projection rules:

- lifecycle headline remains derived from canonical SmartAIHub state;
- remote task status may explain progress/waiting but cannot directly commit terminal SmartAIHub history;
- remote `completed` means the external protocol operation reports completion, not that Task Completion Contract criteria passed;
- late/superseded remote results obey existing assignment-generation and Result Inbox fencing;
- cancellation/updates flow through canonical command/authority policy even when translated to `tasks/cancel` or `tasks/update`;
- ambiguous remote side effects use the R1.5 reconciliation-receipt path before retry/finalization.

### 9.13 MCP Apps/UI rendering capability

MCP Apps/UI is an optional protocol-delivered interaction surface, not a SmartAIHub Mini App/application identity.

Task Control MAY project a qualified UI capability such as `Interactive result available` when the host can safely render the negotiated MCP UI profile. Advanced/Developer mode MAY show the extension ID/profile and sandbox status.

Rules:

- remote UI content is untrusted active content;
- rendering MUST use the canonical SmartAIHub/MCP Apps sandbox and host-bridge policy;
- possession/rendering of a UI resource never grants tool/action permission;
- UI-triggered calls use normal action binding, authorization and provenance;
- when MCP UI is optional but unsupported, Task Control MUST fall back to structured/text/native SmartAIHub result surfaces rather than mark the underlying tool unsupported;
- if the application requires MCP UI with no acceptable fallback, preflight is `ineligible`/`blocked` rather than silently degrading semantics.

### 9.14 Extension-aware fallback and downgrade visibility

A fallback decision that materially changes durability, authorization, billing, egress, evidence strength, interactivity, or user-visible behavior MUST be visible in Advanced mode and must trigger whatever re-admission/approval the canonical policy requires.

Examples:

- `MCP Tasks unavailable — SmartAIHub durable wrapper used`;
- `Interactive MCP UI unavailable — native result surface used`;
- `Required Skills extension unavailable — execution blocked`.

Unknown required or security-critical extension semantics fail closed. Unknown optional extension metadata may be ignored/preserved only when omission is safe according to the owning application/protocol contract.

---

## 10. Task Completion Contract

### 10.1 Purpose

Define what must be true before the system presents work as completed.

### 10.2 Minimum schema

```ts
interface TaskCompletionContract {
  schemaVersion: string;
  contractId: string;
  contractRevision: number;
  taskId: string;
  criteria: CompletionCriterion[];
  requiredEvidence: EvidenceRequirement[];
  humanReview: 'never' | 'conditional' | 'required';
  provenanceRequired: boolean;
  generatedBy: 'template' | 'orchestrator' | 'user' | 'policy';
  createdAt: string;
  inputSnapshotRef?: string;
  supersedesContractId?: string;
  changeReason?: string;
}
```

Example criterion:

```ts
interface CompletionCriterion {
  id: string;
  label: string;
  kind:
    | 'test'
    | 'typecheck'
    | 'lint'
    | 'browser'
    | 'api-contract'
    | 'artifact'
    | 'deployment'
    | 'source-verification'
    | 'human-review'
    | 'custom';
  required: boolean;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'unsupported' | 'manual' | 'stale';
}
```

### 10.3 Contract generation

The orchestrator may derive defaults from task type.

Examples:

**Code change**

- implementation completed
- relevant tests pass
- typecheck passes if applicable
- no newly introduced blocking lint errors
- final verify

**UI change**

- implementation completed
- responsive state checked
- browser/screenshot validation when available
- accessibility checks where configured
- final verify

**Research task**

- minimum source coverage
- source provenance captured
- cross-check requirement
- output artifact generated
- final synthesis completed

**Deployment**

- build passed
- migration readiness checked
- required secrets/config present
- target health verified
- human approval where policy requires

### 10.4 Completion rule

A task MUST NOT appear as fully verified/done in user-facing UI if a required criterion is:

- failed
- pending
- unsupported without approved manual fallback
- missing required evidence

Canonical job state remains authoritative; if legacy state says `done` but verification contract is incomplete, Task Control MUST display a clear `Completed — verification incomplete` / `Unverified` state rather than falsely show fully verified completion.

### 10.5 Contract revision and anti-weakening rules

Completion requirements may evolve, but they MUST NOT be silently weakened after work starts.

- Every material change creates a new immutable contract revision.
- The effective revision used for Final Verify MUST be recorded on the run.
- Removing a required criterion, lowering a required evidence class, or changing `humanReview` from required to optional/never is a **contract weakening**.
- Contract weakening after execution start requires an authorized policy/user decision and provenance event.
- Strengthening requirements may be allowed automatically by policy but must invalidate any completion decision that no longer satisfies the new revision.
- Historical receipts remain attached to the revision/snapshot they proved; they are not rewritten.
- Final Verify MUST evaluate a single explicit contract revision, never a mutable live object.

### 10.6 Explicit Finalization Gate

`done`, `final answer produced`, `artifact generated`, and `verified complete` are different facts. The canonical orchestration path SHOULD expose an explicit Finalization Gate evaluation that Task Control can project.

Finalization Gate inputs may include:

1. required Work Board items resolved;
2. effective Completion Contract revision satisfied;
3. required evidence present, current, and non-conflicting;
4. mandatory approvals/decisions resolved and still bound to the current action/version;
5. required delegated steps completed;
6. no unresolved side-effect reconciliation state;
7. final verification policy satisfied.

Recommended result:

```ts
interface FinalizationGateResult {
  taskId: string;
  runId: string;
  contractId?: string;
  contractRevision?: number;
  evaluatedAt: string;
  outcome: 'pass' | 'block' | 'manual-review' | 'accepted-with-risk';
  blockers: Array<{ code: string; label: string; ref?: string }>;
  evidenceRefs?: string[];
  decisionRefs?: string[];
  evaluatorVersion: string;
}
```

Rules:

- an agent's prose assertion `finished` cannot bypass this gate;
- a terminal lifecycle event that predates Spec 277 compatibility data may render as `Completed — verification unavailable`, never be retroactively fabricated as verified;
- if a compatibility path allows a lifecycle to terminate despite an unsatisfied gate, emit a visible `finalization gate bypassed / verification incomplete` diagnostic in Advanced/Developer views and never present the user-facing result as fully verified;
- Finalization Gate evaluation is deterministic/replayable for the referenced contract/input snapshot.

### 10.7 Finalization quiescence barrier and late-result rule

Passing individual checks is not sufficient if authoritative work is still in flight. Before a task is presented as finally verified, the orchestration layer SHOULD evaluate a **quiescence/completion barrier** in addition to the Completion Contract.

The barrier answers:

- are all required user-visible/required Work Board items terminal or explicitly waived?
- are all authoritative child executions that can affect the result terminal, cancelled, fenced, or intentionally detached by policy?
- has Result Inbox fan-in consumed all required results through the declared completion watermark?
- are there queued user interventions that materially change scope/requirements?
- are there unresolved control commands, approvals, side-effect reconciliation states, or dependency changes that can still alter the outcome?

Suggested projection:

```ts
interface FinalizationBarrierState {
  taskId: string;
  runId: string;
  barrierRevision: string;
  state: 'open' | 'waiting' | 'satisfied' | 'manual-review';
  pendingWorkItems: string[];
  pendingResultRefs: string[];
  pendingInterventionRefs: string[];
  unresolvedControlOps?: string[];
  resultWatermark?: string;
  evaluatedAt: string;
}
```

Late-result rules:

- a result arriving **before** the finalization barrier watermark is satisfied must be considered before verified completion;
- a late result from a superseded/fenced/cancelled child remains auditable but cannot silently reopen or overwrite the authoritative result;
- if policy permits detached/background work, that work must be explicitly marked `non-blocking` and excluded from the completion barrier before finalization;
- if a late authoritative result contradicts already-rendered completion because of an incident/reconciliation race, the system emits a corrective event, invalidates affected evidence, and moves verification to `stale`/`manual review` rather than hiding the contradiction.

User mode SHOULD translate this to plain language such as `Waiting for 1 worker result before finishing`.

### 10.8 Terminal commit point, continuation, and explicit reopen semantics

A task that has crossed its authoritative terminal commit point is historical truth. A later chat message or late result MUST NOT silently mutate that terminal run in place.

The orchestration layer SHOULD expose a stable terminal commit identity such as:

```ts
interface TerminalCommitSummary {
  terminalCommitId: string;
  taskId: string;
  runId: string;
  lifecycleOutcome: 'done' | 'failed' | 'cancelled';
  verificationOutcome?: string;
  contractRevision?: number;
  finalizationBarrierRevision?: string;
  committedAt: string;
}
```

Rules:

1. accepted user steering **before** the terminal cut-off follows §16.6 and may block/redirect finalization;
2. a material instruction arriving **after** terminal commit creates a continuation/new run/task lineage, or uses an explicit canonical `reopen` transition when the owning workflow supports reopen;
3. `reopen` MUST preserve the original terminal commit as immutable history and issue new run/plan/contract/input revisions as required;
4. late evidence/results cannot rewrite the terminal commit; they may invalidate verification and create an incident/review/continuation path according to policy;
5. UI SHOULD offer `Continue task` / `Reopen with changes` rather than presenting an already committed run as though it never completed;
6. billing, approvals, side effects, and provenance for the continuation remain separately attributable.

---

## 11. Normalized Evidence Receipt

### 11.1 Purpose

Capture proof of execution/verification independent of runtime-specific prose.

### 11.2 Minimum schema

```ts
interface EvidenceReceipt {
  schemaVersion: string;
  receiptId: string;
  taskId: string;
  runId: string;
  attempt: number;
  actionId?: string;
  criterionIds?: string[];
  contractId?: string;
  contractRevision?: number;
  inputSnapshotRef?: string;
  type:
    | 'test-result'
    | 'typecheck-result'
    | 'lint-result'
    | 'diff'
    | 'artifact'
    | 'browser-check'
    | 'api-check'
    | 'deployment-check'
    | 'source-verification'
    | 'command-result'
    | 'side-effect-result'
    | 'reconciliation-result'
    | 'telemetry'
    | 'manual-review';
  status: 'passed' | 'failed' | 'informational' | 'unverified';
  summary: string;
  capturedAt: string;
  producer: {
    runtimeId?: string;
    adapterId?: string;
    workerId?: string;
    trust: 'machine-captured' | 'runtime-attested' | 'human-attested' | 'agent-claim';
  };
  evidenceRef?: string;
  artifactRef?: string;
  exitCode?: number;
  metrics?: Record<string, number | string | boolean>;
  payloadHash?: string;
  signatureRef?: string;
  redactionPolicyVersion?: string;
  invalidatedAt?: string;
  invalidationReason?: string;
}
```

### 11.3 Evidence storage

Large/raw output MUST NOT be stuffed into primary task records.

Store:

- compact summary in canonical/read model
- recoverable reference/handle to detailed output
- artifact in R2/file storage when appropriate
- cryptographic hash/signature where required

This aligns with the compact-preview + recoverable-handle direction.

### 11.4 Trust hierarchy

Evidence UI SHOULD distinguish:

1. machine-captured verified result
2. runtime-reported structured result
3. human-reviewed result
4. agent prose claim only

Agent prose alone is `unverified` evidence unless corroborated.

### 11.5 Evidence freshness, binding, and invalidation

Evidence is only valid for the state it actually checked. The system MUST bind evidence to an input/code/artifact snapshot whenever the workflow has mutable inputs.

Examples that invalidate or stale prior evidence:

- source files change after tests/typecheck/browser checks passed
- dependency lockfiles change after a build receipt
- deployment target/release digest changes after staging verification
- research source set changes after a cross-check criterion was satisfied
- completion contract revision changes in a way that changes required proof

Rules:

1. evidence MUST reference `inputSnapshotRef` or an equivalent deterministic digest when feasible;
2. Final Verify compares required evidence against the current effective snapshot;
3. stale evidence is retained for history but changes criterion state to `stale/pending`, not `passed`;
4. a new run/attempt MUST NOT blindly inherit passed evidence unless the criterion explicitly declares it reusable and the bound snapshot is identical;
5. invalidation itself emits a provenance event explaining why proof is no longer current.

This prevents a common false-success case: tests pass, the agent edits code again, and the UI still shows the old tests as valid.

### 11.6 Conflicting, superseded, revoked, and integrity-failed evidence

Multiple receipts for the same criterion may disagree. The UI MUST NOT choose whichever result looks most favorable.

Evidence SHOULD carry or derive these additional dimensions:

- `supersedesReceiptId` / supersession chain;
- `integrityState: verified | unsigned | invalid-signature | unavailable`;
- `revokedAt` / `revocationReason` when a producer or operator formally revokes evidence;
- evaluator/version metadata identifying the deterministic criterion-evaluation rule.

Criterion evaluation rules:

1. receipts from the wrong contract revision or input snapshot cannot satisfy the current criterion;
2. revoked, integrity-failed, or invalidated receipts remain in history but cannot satisfy completion;
3. for the current snapshot, a later conclusive failure supersedes an earlier pass until a later valid pass re-establishes the criterion;
4. contradictory current receipts that cannot be deterministically ordered result in `manual review required` / `evidence conflict`, not automatic pass;
5. `accepted-with-risk` records a decision about unresolved evidence; it MUST NOT rewrite a failed receipt into a passed receipt;
6. signature/hash verification failure on evidence expected to be tamper-evident MUST emit a security/audit event and mark the receipt untrusted.

### 11.7 Structured Result Inbox and automatic fan-in

Parallel workers, sub-agents, external harnesses, browsers, and delegated capability providers SHOULD return results into a normalized **Result Inbox** rather than forcing a coordinator to repeatedly poll and ingest raw output.

Conceptual flow:

```text
worker / sub-agent / delegated provider
              │
              ▼
      structured completion/result
              │
              ▼
         Result Inbox
              │
      ┌───────┴────────┐
      ▼                ▼
Evidence Receipt   Artifact/handle
      │                │
      └───────┬────────┘
              ▼
      bounded coordinator fan-in
```

Recommended envelope:

```ts
interface ResultInboxItem {
  resultId: string;
  taskId: string;
  runId: string;
  workItemId?: string;
  workItemRevision?: string;
  assignmentRevision?: string;
  executionGeneration?: string;
  producerRef: string;
  producerType: 'agent' | 'worker' | 'runtime' | 'tool' | 'external-provider';
  state: 'complete' | 'partial' | 'failed' | 'cancelled' | 'superseded';
  summary: string;
  evidenceRefs?: string[];
  artifactRefs?: string[];
  recoverableHandle?: string;
  assertions?: Array<{ claim: string; evidenceRefs?: string[] }>;
  completedAt: string;
  sequence?: number;
}
```

Requirements:

- ingestion is idempotent and safe under reconnect/replay;
- large raw results remain behind bounded recoverable handles/artifact references;
- coordinator context receives compact, relevant fan-in summaries rather than unbounded raw transcripts;
- evidence and assertion counts MAY be surfaced in Advanced mode when useful;
- partial/failed worker results remain visible and MUST NOT be silently discarded during synthesis;
- result arrival SHOULD update the Work Board and Task Control projection through canonical events, not a UI-local polling loop;
- if multiple results conflict, evidence conflict rules in §11.6 apply before Finalization Gate evaluation.

### 11.8 Fan-in consumption cursor, completeness, and context-budget policy

Result Inbox ingestion and coordinator consumption are separate facts. At-least-once delivery can otherwise cause the same worker result to be injected repeatedly after reconnect/resume.

Result envelopes SHOULD additionally support:

```ts
interface ResultConsumptionState {
  resultId: string;
  dedupeKey: string;
  producerSequence?: number;
  completeness: 'complete' | 'partial' | 'truncated' | 'unknown';
  schemaVersion: string;
  coordinatorConsumptionState: 'unseen' | 'selected' | 'consumed' | 'deferred' | 'superseded';
  fanInEpoch?: string;
  consumedAt?: string;
  consumptionCursor?: string;
}
```

Requirements:

- result ingestion is idempotent by canonical `resultId/dedupeKey`;
- coordinator fan-in is idempotent by consumption cursor/epoch, not merely by UI rendering;
- replay/recovery may reconstruct the same Result Inbox, but MUST NOT inject the same result into coordinator context twice unless an explicit re-read is requested;
- `truncated`/`partial` results cannot masquerade as complete; the recoverable handle remains available;
- fan-in selection is bounded by context/token budget and uses deterministic relevance/priority policy when not all results fit;
- deferred results stay discoverable and may still block finalization if required by Work Board/Completion Contract;
- high-priority failures/security evidence cannot be dropped merely because context budget is exhausted;
- UI MAY show `5 results received • 4 reviewed by coordinator • 1 pending` in Advanced mode, while ordinary users see a simpler state.

### 11.9 Assignment lineage and stale-result fencing

A worker may finish a logically valid assignment after that work item was reassigned, replanned, or regenerated. `resultId` deduplication alone is insufficient because the result may be unique but no longer authoritative.

Every delegated/parallel result SHOULD bind to the work generation that created it through `workItemRevision`, `assignmentRevision`, `executionGeneration`, or equivalent canonical identifiers.

Rules:

- reassignment/replan increments or replaces the authoritative assignment generation;
- a result from an older generation is classified `stale-generation` / `historical` unless an explicit adoption policy proves it is still valid;
- stale-generation results remain visible in provenance and may retain useful artifacts/evidence, but they cannot automatically update the current Work Board, reset liveness, or satisfy Finalization Gate;
- adoption requires current snapshot/contract/capability compatibility and emits provenance;
- fan-in consumption keys MUST include sufficient lineage to prevent an old-generation result from being mistaken for the replacement assignment;
- UI may summarize `Result arrived from superseded assignment` in Advanced mode without exposing internal generation IDs to normal users.

### 11.10 External side-effect and reconciliation receipts

A successful API/tool response is not always proof that an external side effect reached its intended durable state. Deployments, messages, uploads, third-party mutations, payments-like actions, and remote configuration changes SHOULD emit a normalized side-effect/reconciliation receipt when verification matters.

Suggested shape:

```ts
interface SideEffectReceipt {
  effectId: string;
  taskId: string;
  runId: string;
  actionId: string;
  idempotencyKey?: string;
  targetDigest?: string;
  providerOperationRef?: string;
  state: 'requested' | 'accepted' | 'committed' | 'reconciled' | 'failed' | 'outcome-unknown' | 'compensated';
  observedAt: string;
  evidenceRefs?: string[];
  reconciliationMethod?: string;
}
```

Requirements:

- `HTTP 200`, tool prose, or command exit code alone MUST NOT be treated as durable external-state proof when the task contract requires reconciliation;
- provider transaction/deployment/message identifiers are stored only when policy permits and are redacted appropriately;
- `outcome-unknown` blocks blind retry as defined in §16.2;
- Finalization Gate can require `reconciled` rather than merely `accepted/committed` for high-impact workflows;
- duplicate retry/reconcile operations reuse canonical idempotency semantics and MUST NOT duplicate external effects;
- these receipts can be projected through normal Evidence/Activity surfaces without creating a second side-effect engine.

---

## 12. Action Provenance + Permission Snapshot

### 12.1 Purpose

Allow Task Control to reconstruct what happened, by whom/what, under which authority.

### 12.2 Minimum normalized event

```ts
interface ActionProvenanceEvent {
  eventId: string;
  eventSchemaVersion: string;
  workspaceId: string;
  taskId: string;
  runId: string;
  actionId: string;
  parentActionId?: string;
  correlationId?: string;
  causationId?: string;
  runSequence?: number;
  actorType: 'user' | 'agent' | 'runtime' | 'worker' | 'system';
  actorRef: string;
  actorInstanceRef?: string;
  principalRef?: string;
  delegationChainRef?: string;
  runtimeId?: string;
  toolOrOperation?: string;
  occurredAt: string;
  ingestedAt: string;
  startedAt?: string;
  finishedAt?: string;
  result: 'running' | 'success' | 'failed' | 'cancelled' | 'blocked';
  attempt: number;
  permissionSnapshotRef?: string;
  inputPreview?: string;
  outputPreview?: string;
  evidenceRefs?: string[];
  recoveryState?: string;
}
```

### 12.3 Permission snapshot

Store a redacted immutable snapshot/reference sufficient to answer:

- what capability was authorized?
- was approval required?
- which policy allowed it?
- who approved it, if required?
- what scope/resource was authorized?

Never store raw credentials/secrets in the snapshot.

### 12.4 UI projection

Default users see:

`19:16 — Unit tests passed — 38/38`

Advanced users may expand:

- runtime
- command category
- run/action IDs
- effective policy
- evidence receipt

Developer/Admin users may inspect raw normalized metadata subject to authorization.

### 12.5 Event ordering, deduplication, and causal gaps

Events may arrive late, duplicated, or out of order, especially from local runners and external agents.

- `eventId` MUST be globally unique/idempotent for ingestion.
- `runSequence` SHOULD be monotonic when the canonical source can provide it.
- `occurredAt` is source time; `ingestedAt` is control-plane receipt time.
- the projector MUST be safe under at-least-once delivery and duplicate replay.
- missing sequence/parent references are rendered as an observable `timeline gap`, not silently guessed.
- causal ordering should prefer explicit causation/sequence over wall-clock timestamp alone.
- reconnecting runtimes may backfill historical events without causing duplicate UI entries.

### 12.6 Logical actor, runtime instance, principal, and delegation chain

`Claude Code`, `Research Agent`, or `worker-7` is not enough identity for audit and authorization. Provenance SHOULD distinguish:

- **logical actor** — durable assistant/agent/worker role;
- **actor instance/session** — the concrete execution instance that produced the action;
- **runtime/placement** — where/how it ran;
- **principal** — the authenticated service/user/device identity whose authority was exercised;
- **delegation chain** — how authority flowed from user/policy/orchestrator to the executing principal.

Rules:

- display names are presentation only and MUST NOT be used as authorization identities;
- delegated child execution cannot inherit broader authority than the canonical delegation/policy grants;
- a runtime/session reconnect that changes instance identity remains linked to the same logical run only through canonical continuity/fencing checks;
- permission snapshots SHOULD reference the effective principal/delegation chain without persisting raw credentials;
- Task Control User mode shows friendly actor/runtime names; Developer/Admin mode can expose stable actor/instance/principal references subject to scope authorization;
- confused-deputy situations (for example one tenant's agent attempting to use another scope's principal) fail closed and produce a security/audit event.

---

## 13. Progress Semantics

Progress MUST be evidence/state based.

Allowed progress sources:

1. explicit deterministic stage graph
2. workflow node completion counts
3. completion criteria counts
4. bounded runtime progress API
5. known batch item completion counts

Not allowed:

- arbitrary LLM-estimated `82%` without a deterministic basis
- fake linear timer progress

If no meaningful percentage exists, render stage-based progress:

`Running • Testing`

instead of inventing a number.

### 13.1 Retries, regressions, and parallel branches

Progress is allowed to move backward when reality moves backward. For example, `Verify → Debug → Test` after a failed check is more truthful than freezing at 95%.

- UI MUST explain regressions with the current stage/reason.
- parallel branches SHOULD use completed/total work units only when those units are stable and meaningful.
- retries SHOULD show attempt context rather than resetting a task to a misleading 0% without explanation.
- percent values SHOULD include a machine-readable `progressBasis` such as `stage-weighted`, `criteria-count`, `batch-count`, or `runtime-native`.
- the UI MUST support `progress: null` and fall back to stage/status.

### 13.2 Progress / delegation liveness watchdog

Long-running agents can appear busy while making no useful progress. SmartAIHub SHOULD expose normalized liveness/progress signals from the canonical orchestration/runtime layer so Task Control can distinguish real work from pathological loops.

Signals may include:

- repeated identical or near-identical tool calls;
- repeated delegation/spawn/assignment with no new result;
- repeated search/query with no new evidence;
- no new evidence, artifact delta, Work Board transition, or criterion progress over a bounded interval/turn budget;
- reasoning/tool-loop timeout;
- oscillation between stages without satisfying a transition requirement;
- worker churn or retries exceeding the workflow budget.

Possible canonical responses:

`nudge → replan → change capability/provider → reduce/defer delegation → escalate/manual review → safe terminate/recover`

Task Control projection SHOULD use truthful states such as:

- `Replanning — no progress detected`
- `Waiting for worker results`
- `Retrying with another runtime`
- `Needs review — progress stalled`

rather than continuing to display generic `Running`.

The watchdog is not an additional scheduler. Detection/action remains owned by the execution/orchestration layer; Spec 277 standardizes visibility, activity events, and user intervention affordances.

### 13.3 Meaningful-progress fingerprint and watchdog false-positive suppression

A watchdog MUST NOT treat legitimate waiting, a long-running bounded tool call, or a known human/dependency wait as pathological looping. The execution layer SHOULD derive a normalized **meaningful-progress fingerprint** rather than using elapsed time alone.

Possible progress inputs:

- Work Board revision/state delta;
- new valid evidence receipt;
- new artifact/diff digest;
- criterion transition;
- new non-duplicate Result Inbox item;
- dependency satisfaction/change;
- acknowledged phase transition;
- explicit bounded runtime-native progress.

Suggested state:

```ts
interface LivenessSummary {
  state: 'healthy' | 'waiting-known' | 'suspected-stall' | 'replanning' | 'escalated' | 'terminated';
  lastMeaningfulProgressAt?: string;
  progressFingerprint?: string;
  stallReason?: string;
  escalationLevel: number;
  nextAction?: string;
  exemptUntil?: string;
}
```

Rules:

- known blocking waits and bounded long tool operations may set an exemption/deadline;
- receiving the same duplicated event/result does not reset progress;
- watchdog state resets only on a meaningful fingerprint change or explicit operator/runtime recovery event;
- escalation is bounded and auditable; repeated nudges alone cannot loop forever;
- after configured escalation is exhausted, the task moves to a truthful manual-review/recovery/terminal state;
- Task Control displays the reason and next step, not raw watchdog counters by default.

---

## 14. Read Model / Projection Architecture

Task Control SHOULD use a read-optimized projection assembled from canonical sources.

Conceptual flow:

```text
worker_jobs / DevelopmentRun / approvals / runtime registry / evidence
                              │
                              ▼
                     Task Control Projector
                              │
                              ▼
                  task_control_projection
                              │
                   ┌──────────┴──────────┐
                   ▼                     ▼
                REST/API              SSE/stream
                   │                     │
                   └──────────┬──────────┘
                              ▼
                         Task Control UI
```

The projection is disposable/rebuildable. It is NOT authoritative state.

### 14.1 Projection consistency contract

The projector MUST be deterministic, replayable, and idempotent. It SHOULD consume canonical events through the existing outbox/event path where available rather than ad-hoc table polling.

Each projection response SHOULD expose:

- `projectionRevision`
- `canonicalThrough` / source cursor or equivalent watermark
- `generatedAt`
- `lagMs` when measurable
- `stale: boolean`

Projection updates are at-least-once safe. Duplicate events MUST NOT duplicate cards/counts/activity. Rebuild/backfill MUST be possible per tenant/workspace without mutating canonical state.

When the UI submits an action, it MUST use canonical entity/version preconditions rather than assuming the read projection is current.

### 14.2 Suggested overview projection

```ts
interface TaskControlOverview {
  countBasis: 'user-visible-root-task';
  counts: {
    running: number;
    needsAttention: number;
    waiting: number;
    failed: number;
  };
  pipeline: PipelineStageCount[];
  attentionItems: TaskControlItem[];
  runningItems: TaskControlItem[];
  recentCompleted: TaskControlItem[];
  agents: AgentExecutionSummary[];
  recentActivity: ActivitySummary[];
  previewCaps?: Record<string, number>;
}
```

### 14.3 Task summary

```ts
interface TaskControlItem {
  taskId: string;
  rootTaskId: string;
  taskKind: 'root' | 'user-visible-child' | 'internal-child';
  userVisibleTask: boolean;
  runId?: string;
  activeAttempt?: number;
  title: string;
  displayStatus: string;
  displayBucket?: 'need-you' | 'failed' | 'running' | 'waiting' | 'done';
  classificationReason?: string;
  stage?: string;
  progress?: number;
  progressBasis?: string;
  runtime?: string;
  agent?: string;
  executionLocation?: string;
  elapsedMs?: number;
  childSummary?: { total: number; running: number; failed: number; blocked: number };
  dependencies?: TaskDependencySummary[];
  activeControlOperation?: ControlOperationSummary;
  attention?: AttentionSummary;
  checks?: CheckSummary[];
  verificationState?: 'not-required' | 'pending' | 'verifying' | 'verified' | 'failed' | 'unverified' | 'accepted-with-risk' | 'stale';
}

interface ControlOperationSummary {
  operationId: string;
  action: 'pause' | 'cancel' | 'resume' | 'retry' | 'handoff' | string;
  state: 'requested' | 'accepted' | 'applied' | 'rejected' | 'expired' | 'outcome-unknown';
  requestedAt: string;
  appliedAt?: string;
  message?: string;
}
```

### 14.4 Durable run-continuity projection and checkpoint reconstruction

After process crash, runner reconnect, server restart, or runtime handoff, Task Control MUST reconstruct the same logical state from canonical records rather than starting a visually fresh task. The continuity projection SHOULD include references sufficient to restore:

- active `taskId/runId/attempt`;
- effective plan/Work Board revision;
- current phase + authority/policy revision;
- Result Inbox ingestion and consumption cursors;
- queued/applied user interventions;
- outstanding control operations/approvals;
- Completion Contract revision + Finalization Barrier state;
- authoritative child executions and fencing/supersession state.

A resume MUST NOT:

- duplicate fan-in;
- apply the same intervention twice;
- resurrect a superseded worker as authoritative;
- regress to an older Work Board/contract revision;
- present a previously requested control command as applied unless canonical state confirms it.

If continuity cannot be proven because source events/checkpoints are incomplete, render `Recovery / state reconciliation required` and restrict high-impact mutations until canonical reconciliation succeeds.

### 14.5 Canonical execution consistency envelope / state vector

Task Control aggregates several independently evolving canonical facts: plan revision, phase/authority epoch, input snapshot, Completion Contract revision, Result Inbox watermark, intervention sequence, approval state, and lifecycle version. Reading those from different moments can create a **torn view** that never existed canonically.

Where a user-visible action or Finalization decision depends on multiple facts, the backend SHOULD return a consistency envelope/state vector captured from one canonical read boundary or from explicitly compatible source revisions.

```ts
interface ExecutionConsistencyEnvelope {
  taskId: string;
  runId: string;
  canonicalVersion: string;
  planRevision?: number;
  phaseRevision?: string;
  authorityEpoch?: string;
  inputSnapshotRef?: string;
  contractRevision?: number;
  resultWatermark?: string;
  interventionSequence?: number;
  approvalRevision?: string;
  capturedAt: string;
}
```

Requirements:

- high-impact UI actions bind to the envelope or equivalent canonical preconditions they were reviewed against;
- Finalization Gate records the envelope/state vector it evaluated;
- the projector may display eventually consistent summaries, but it MUST label stale/mixed-age data and MUST NOT manufacture an atomic action basis from unrelated timestamps;
- if one constituent revision changes before commit, the mutation/finalization path revalidates or returns a conflict;
- APIs may use a compact opaque state token instead of exposing every internal revision, provided semantics are equivalent;
- User mode does not expose raw vectors; Advanced/Developer diagnostics may show them for incident analysis.

This closes cross-source read skew in addition to the execute-time TOCTOU protection in §9.8.

---

## 15. API Requirements

Exact route naming may follow existing SmartAIHub conventions, but the following capabilities are required.

### 15.1 Overview

`GET /api/task-control/overview`

Returns current scoped overview projection.

### 15.2 Task detail

`GET /api/task-control/tasks/:taskId`

Returns normalized task/run detail.

### 15.3 Evidence

`GET /api/task-control/tasks/:taskId/evidence`

Supports pagination/filter by evidence type.

### 15.4 Activity

`GET /api/task-control/tasks/:taskId/activity`

Returns normalized provenance timeline.

### 15.5 Decisions

`GET /api/task-control/tasks/:taskId/decisions`

Returns pending/history of approvals and decisions, including canonical policy/quorum progress, expiry, supersession/revocation state, and the exact bound action/resource/version summary the user is being asked to authorize.

### 15.6 Runtime capabilities

`GET /api/task-control/runtimes/capabilities`

Advanced/admin visibility only as appropriate.

### 15.7 Streaming

Reuse canonical events where possible.

Task Control SHOULD receive incremental updates by SSE/WebSocket/event-stream adapter rather than refetching the entire dashboard on short polling intervals.

### 15.8 Query, pagination, and history contract

List/history APIs MUST use cursor pagination for potentially large result sets and support the authorized filters in §7.9. Do not expose unbounded `limit` values.

Responses SHOULD return stable item IDs, next cursor, applied filters, and projection/canonical revision metadata. Search must operate on scoped projections/indexes and MUST NOT broaden tenant/workspace access.

### 15.9 Stream resume and reconciliation

SSE/WebSocket updates MUST carry a stable event ID/cursor. Clients SHOULD resume from the last acknowledged ID after reconnect (`Last-Event-ID` or equivalent).

If a resume cursor is too old or unavailable, the client performs a snapshot refresh then continues from the returned watermark. UI reducers MUST deduplicate by event/entity revision.

### 15.10 Work Board / plan revision

`GET /api/task-control/tasks/:taskId/work-board` returns the authorized Work Board projection and `planRevision`.

Plan-change actions MUST call the canonical orchestration/steering service with expected revision/idempotency preconditions; a Task Control-only board mutation endpoint is prohibited.

### 15.11 Result Inbox

`GET /api/task-control/tasks/:taskId/results` returns bounded/paginated result envelopes, producer state, completeness, and authorized recoverable handles. Ordinary User mode may not expose this endpoint directly in navigation, but the data contract is required for advanced diagnostics and fan-in truth.

### 15.12 Interventions

`GET /api/task-control/tasks/:taskId/interventions` returns queued/applied/superseded steering. Submission routes through the canonical chat/orchestrator continuation path and returns a stable sequence/idempotency identity.

### 15.13 Finalization state

`GET /api/task-control/tasks/:taskId/finalization` returns the effective Completion Contract reference, Finalization Gate outcome, quiescence/barrier state, and user-readable blockers. It MUST NOT trigger finalization merely by being read.

### 15.14 Consistency envelope / action basis

High-impact detail/action responses SHOULD return an opaque `actionBasis` / `consistencyToken` or the equivalent revision vector from §14.5. Mutating requests echo that basis as a precondition; the server rejects it when materially stale.

### 15.15 Side-effect / reconciliation state

`GET /api/task-control/tasks/:taskId/effects` MAY expose authorized side-effect/reconciliation summaries for workflows with external effects. Raw provider payloads remain behind separately authorized evidence/artifact handles.

---

## 16. Actions and Authority

UI actions MUST call canonical services.

Examples:

- Approve → canonical approval service
- Reject → canonical approval service
- Pause → canonical run-control endpoint
- Cancel → canonical job/run cancellation path
- Retry → canonical recovery/retry path
- Open in Chat → existing chat/thread context
- Start task → existing Chat composer / orchestrator entry path

Task Control MUST NOT directly mutate job state tables from UI-specific endpoints.

### 16.1 Action availability and preconditions

The server SHOULD return `availableActions[]` for each task/decision based on current canonical state and authorization. The UI MUST NOT infer high-risk action availability from display state alone.

Every mutating action MUST support:

- idempotency key
- expected canonical entity/version or equivalent precondition
- authoritative re-check of actor/scope/policy/state
- structured conflict response when the projection is stale

If another device/user already approved, cancelled, retried, or advanced the task, stale UI actions MUST fail safely and refresh rather than repeat side effects.

### 16.2 Side-effect uncertainty

For external side effects (deployment, email, payment-like operations, third-party mutations), a timeout does not prove failure. The UI/runtime contract MUST support `outcome unknown / reconciliation required` and avoid offering blind retry until idempotency/reconciliation policy says it is safe.

### 16.3 Control-command acknowledgement semantics

`Pause`, `Cancel`, `Retry`, `Resume`, `Handoff`, and similar control actions are commands, not instantaneous facts. Task Control MUST distinguish command acknowledgement from the resulting canonical state transition.

Recommended operation states:

`requested → accepted → applied`

with terminal alternatives:

`rejected | expired | outcome-unknown`

Requirements:

- after clicking Pause/Cancel, the UI MAY immediately show `Pause requested…` / `Cancellation requested…`, but MUST NOT claim the run is paused/cancelled until canonical state confirms it;
- responses return an `operationId`, accepted canonical version, and current authoritative entity version;
- repeated clicks reuse/idempotently resolve the same operation rather than issuing duplicate commands;
- if the runner is unreachable, the UI shows that the request is pending/uncertain and explains whether lease expiry/recovery will take over;
- operation history is inspectable in Activity/Decisions for incident review;
- retries are enabled only after the prior attempt's side-effect/reconciliation state permits a safe retry.

### 16.4 Safe-turn user intervention / live steering

Users SHOULD be able to refine an active task without automatically cancelling all in-flight work. The canonical orchestration layer may accept a **queued intervention** that is applied at the next safe execution boundary.

Examples:

- `Also verify the mobile layout before finalizing.`
- `Do not deploy; stop after generating the migration plan.`
- `Use the newly uploaded file as an additional source.`

Recommended projection:

```ts
interface UserInterventionSummary {
  interventionId: string;
  taskId: string;
  runId: string;
  state: 'queued' | 'accepted' | 'applied' | 'superseded' | 'rejected' | 'expired';
  submittedAt: string;
  appliedAt?: string;
  safeBoundary?: string;
  affectsInFlightChildren: 'finish-current' | 'cancel-when-safe' | 'policy-defined';
  summary: string;
}
```

Requirements:

- intervention payloads are canonical user instructions, not hidden prompt edits;
- queued intervention state is visible from Chat and Task Details;
- by default, already-running bounded child work may finish unless policy/user explicitly requires cancellation;
- destructive or authority-changing intervention still passes canonical approval/policy checks;
- duplicate/replayed submissions are idempotent;
- intervention changes that invalidate prior plans/evidence trigger truthful Work Board/contract/evidence re-evaluation;
- `Open in Chat` SHOULD preserve the exact task/thread context and show whether an instruction is queued or already applied.

### 16.5 Runtime control versus steering

Task Control MUST distinguish:

- **control commands** — Pause, Cancel, Resume, Retry, Handoff;
- **steering instructions** — alter intent/constraints at a safe boundary;
- **approvals/decisions** — authorize a bound action;
- **task edits** — change canonical task metadata before/when policy allows.

These paths MUST NOT be collapsed into a generic `Send message` mutation because they have different authority, idempotency, reconciliation, and audit semantics.

### 16.6 Intervention sequencing, priority, supersession, and finalization race

Multiple user instructions may arrive while a task is busy. Order MUST be canonical and server-issued; client timestamps are not sufficient.

Recommended additions:

```ts
interface UserInterventionOrder {
  interventionId: string;
  sequence: number;
  priority: 'normal' | 'high';
  supersedesInterventionId?: string;
  submittedAt: string;
  acceptedAt?: string;
}
```

Rules:

- queued interventions apply in canonical sequence unless an explicit supersession/merge policy says otherwise;
- contradictory queued instructions are not silently merged by the UI; the orchestrator resolves them or requests clarification/decision;
- `Cancel now` / emergency stop is a **control command**, not ordinary safe-turn steering, and follows §16.3;
- finalization MUST check for accepted-but-unapplied interventions that can materially alter scope; if present, finalization waits or the intervention is explicitly superseded/rejected;
- if a new instruction arrives after finalization has begun but before the authoritative commit/barrier, the runtime uses a deterministic cut-off rule and records whether it applies to the current run or a continuation task;
- repeated identical user submissions are deduplicated when safe, while semantically distinct instructions remain separate;
- an intervention that changes task intent/requirements creates or references a new plan/contract/input revision where needed;
- user-facing UI shows `Queued`, `Applied`, `Will apply to next continuation`, or `Superseded` rather than implying immediate effect.

### 16.7 Orphaned/late child work after cancel, handoff, or supersession

Workers may finish after their parent run was cancelled, handed off, fenced, or superseded. Their results MUST remain traceable without regaining execution authority.

- orphan/late results are tagged with the producer's authoritative status at receipt time;
- they may be inspected as historical evidence but cannot mutate current Work Board/completion state unless the canonical recovery policy explicitly adopts them;
- adopting a late result requires snapshot/contract compatibility checks and a provenance event;
- cancellation/handoff views SHOULD show `1 late result archived` rather than silently ignoring it;
- a fenced worker cannot clear blockers, satisfy Finalization Gate, or apply side effects after authority loss.

### 16.8 Compensation / rollback projection after committed side effects

Cancellation and retry are not equivalent to undo. If an external side effect has already committed and later verification fails, the owning workflow may require compensation/rollback. Spec 277 projects this state; it does not implement the compensation engine.

Suggested states:

`not-required | required | requested | running | succeeded | failed | manual-review`

Requirements:

- the UI MUST NOT imply that `Cancel` reverses already committed external effects;
- when compensation is required, Task Details shows the affected effect/target and whether automated rollback is available;
- compensation actions route through canonical workflow/policy/approval paths with fresh authority and idempotency;
- compensation produces its own provenance/evidence/side-effect receipt and never rewrites the original effect as though it never happened;
- failed/uncertain compensation prevents a clean `verified complete` outcome unless an explicit risk/incident disposition allows it;
- user wording SHOULD be concrete: `Deployment completed, rollback required` rather than generic `Task failed`.

### 16.9 Decision review snapshot and live-update safety

Live Task Control updates create a security/UX race: the action/config being approved may change while the user is reading it. The decision surface MUST bind the user's review to the exact canonical action/resource/version snapshot.

Rules:

- opening a high-impact decision records or receives a `reviewSnapshotRef` / action digest / consistency token;
- background stream updates MAY update surrounding task status but MUST NOT silently replace the payload being reviewed under an enabled `Approve` button;
- if the bound action/payload/version changes, approval controls disable and the UI shows `Action changed — review again` with a concise diff/summary;
- submitting a decision sends the reviewed snapshot/action binding and current identity/policy preconditions;
- another approver/device resolving or superseding the request immediately makes the local review read-only/outdated;
- accessibility focus remains stable while the decision body is frozen; refresh/re-review is explicit.

---

## 17. Empty States

Current empty states should be replaced with explanatory product states.

Example:

```text
No tasks running

When SmartAIHub starts work for you, you’ll see:
• who is working on it
• current progress
• decisions that need you
• verification results
• files and artifacts produced

[Start a task]
```

Empty state must teach value, not expose internal persistence status.

Do not display:

`No DevelopmentRun is available for this account.`

in normal User mode.

---

## 18. Error / Degraded States

The UI MUST distinguish:

- runtime offline
- runtime capability missing
- task blocked waiting for user
- task blocked waiting for external dependency
- evidence unavailable
- projection stale
- canonical state unavailable
- recovery in progress
- runner disconnected while authoritative lease/run may still be active
- external side-effect outcome unknown / reconciliation required
- evidence stale because inputs changed

If the projection is stale but canonical state is healthy, show a non-destructive stale indicator and refresh/rebuild.

Do not silently convert unknown state into success.

### 18.1 Client connectivity and stale-readonly mode

Desktop/mobile clients will sleep, roam between networks, and lose event streams. Task Control MUST make connectivity state explicit enough to prevent stale control actions.

Client connectivity modes:

- `Live` — stream connected and snapshot within freshness threshold;
- `Reconnecting` — transient loss; existing data remains visible with age indicator;
- `Stale / read-only` — cached snapshot may be inspected but mutating actions are disabled until canonical revalidation succeeds;
- `Offline` — no canonical connectivity; only previously cached authorized summaries may be displayed according to local-storage/privacy policy.

Rules:

- approvals, destructive actions, retries, and permission changes MUST NOT be queued for later execution while offline;
- after app resume/background wake, scope change, or long disconnection, perform snapshot reconciliation before re-enabling mutations;
- cached task/evidence summaries need an explicit `last updated` age and must obey logout/tenant-switch purge rules;
- notification deep links re-establish authentication and active scope before showing or executing a decision;
- reconnect logic uses bounded backoff/jitter and avoids synchronized polling storms.

---

## 19. Responsive Design

### Desktop

Two-column information-dense layout is allowed.

### Tablet

- summary row may wrap 2×2
- Needs Attention remains above Running Now
- Agents and Recent Activity may stack beneath tasks

### Mobile

Order:

1. compact header
2. Need You count / attention item
3. Running Now
4. Pipeline collapsed
5. Recently completed
6. Agents/Activity behind expandable sections

Task cards should prioritize title, status, next action, and verification summary.

Do not force horizontal tables on mobile; Files and Verification become stacked rows/cards.

---

## 20. Accessibility

Requirements:

- WCAG 2.2 AA target
- status not encoded by color alone
- keyboard navigation for all controls
- visible focus states
- screen-reader labels for status icons
- `aria-live` only for important status transitions to avoid event spam
- background live updates MUST NOT steal keyboard focus or unexpectedly move the user
- after approval/decision submission, focus moves to a deterministic confirmation or refreshed action target
- reduced-motion preference respected
- approval actions require clear confirmation for high-risk operations

---

## 21. Internationalization

All user-facing strings MUST use the existing i18n system.

Avoid hard-coded English architecture terms.

Status labels must support Thai and English at minimum according to existing SmartAIHub language support.

Technical evidence such as command names may remain verbatim while explanatory labels are localized.

Times MUST render in the user-selected/account timezone with an absolute timestamp available on hover/detail. Relative times such as `12 min ago` are presentation only.

Cost display MUST use SmartAIHub billing semantics: distinguish estimated vs settled cost and credits vs provider currency. Do not hard-code USD when the canonical billing layer reports credits or another display currency.

---

## 22. Security and Privacy

### 22.1 Scope isolation

All overview/detail/evidence/activity queries MUST enforce user/project/team/tenant/workspace scope according to canonical authorization.

### 22.2 Redaction

Never surface:

- API keys
- bearer tokens
- raw cookies
- secrets
- private signing keys
- unrestricted environment dumps
- secret-bearing tool input/output

### 22.3 Approval integrity

UI approval state is not authority.

The canonical approval service must re-check:

- identity
- scope
- current task/run state
- requested action
- exact target/resource/config/payload digest being authorized
- policy/quorum/delegation requirements
- expiry/replay/revocation/supersession protection

### 22.4 Receipt integrity

If signed receipts are introduced, private signing keys MUST NOT be stored in ordinary task projection/read-model records.

Use the existing SmartAIHub secret architecture / secure signing boundary.

### 22.5 Artifact/evidence authorization

`evidenceRef`, `artifactRef`, diff links, screenshots, and downloadable outputs MUST be authorization-checked at access time. Do not treat possession of a reference as authorization. Use short-lived signed delivery URLs/tokens where appropriate.

### 22.6 Retention and privacy lifecycle

Evidence/provenance can grow much faster than task metadata. Define tenant-aware retention classes for:

- compact summaries
- detailed command/tool output
- screenshots/browser evidence
- artifacts
- audit/provenance required for governance

Expired large bodies may be archived/deleted according to policy while preserving a tombstone/hash/summary when required. Retention/deletion MUST preserve legal/security hold rules and tenant isolation.

### 22.7 Data classification and preview minimization

Task Control is an aggregation surface and therefore has high accidental-disclosure risk. Every previewable body SHOULD carry a sensitivity classification compatible with the existing SmartAIHub policy model, for example `public / internal / confidential / restricted / secret` or the canonical equivalent.

Requirements:

- `inputPreview`, `outputPreview`, evidence summaries, notification copy, and activity text are generated **after** redaction/classification, not from raw payloads in the browser;
- secret-class material MUST NOT be persisted in Task Control previews or analytics;
- restricted/confidential bodies use opaque references and a separately authorized fetch/reveal path where policy permits;
- raw prompts, terminal output, environment data, and tool payloads are never loaded merely to render the overview;
- reveal/download of sensitive evidence/artifacts SHOULD be auditable;
- classifiers/redactors must fail closed for recognized credentials/tokens and must preserve enough non-sensitive context for incident review.

### 22.8 Archive, deletion, and derived-data purge propagation

Archiving/deletion/retention actions must propagate to all Task Control derivatives.

- archived tasks are removed from live overview counts but remain searchable when policy permits;
- canonical deletion or retention-expiry events purge or tombstone corresponding projection rows, search/vector indexes, client caches, notification payloads, and temporary delivery links;
- audit/legal-hold requirements may preserve minimal tombstones/hashes even when content bodies are removed;
- deleted evidence/artifacts must not leave dangling links that reveal names or metadata;
- tenant/account logout or scope revocation invalidates locally cached sensitive Task Control state;
- projector rebuilds MUST honor tombstones/retention boundaries and MUST NOT resurrect deleted derived data from stale event backups without policy authorization.

---

## 23. Performance Targets

Initial targets:

- overview first useful render: ≤ 1.5s p95 after authenticated route shell under normal regional conditions
- incremental event-to-UI update: ≤ 2s p95
- task detail first useful render: ≤ 1.5s p95
- evidence detail lazy-loaded
- overview must not fetch raw logs or full artifact bodies

Large histories use pagination/virtualization.

Overview payloads SHOULD be bounded (counts + capped preview lists) and MUST NOT embed full diffs, raw transcripts, screenshots, or artifact bodies. Agent/runtime panels SHOULD lazy-load expensive diagnostics.

### 23.1 Scale, fan-out, and backpressure

The overview uses complete server-side counts plus capped preview lists. Suggested default preview caps are configurable, e.g. up to 10 attention items, 12 running items, 10 recent completions, and 20 recent activity rows before `View all`/pagination.

Requirements:

- counts MUST remain complete even when preview lists are capped;
- server queries/projector reads MUST avoid per-card N+1 lookups for agents, checks, approvals, or cost;
- stream fan-out is scoped by authorization and active view; clients should not receive every tenant event when subscribed to one project/workspace;
- non-critical burst events MAY be coalesced into short UI batches, but approvals, failures, authority changes, and security-relevant transitions MUST not be delayed behind cosmetic activity updates;
- stream consumers implement bounded queues/backpressure and snapshot reconciliation rather than unbounded in-memory event accumulation;
- evidence/detail data remains lazy-loaded and paginated.

Baseline synthetic performance fixture (not a product hard limit) SHOULD include at least:

- 10,000 historical root tasks in a scope;
- 500 active/waiting root tasks with child attempts/work units;
- 2,000 normalized events/minute burst for that scope;
- 100 concurrent Task Control viewers;
- reconnect/replay traffic mixed with normal updates.

The p95 targets above should be measured against this fixture or a documented production-equivalent workload before broad rollout.

---

## 24. Observability

Measure product behavior without logging sensitive task content by default.

Suggested metrics:

- task_control_overview_load_ms
- task_control_detail_load_ms
- attention_items_opened
- approval_latency_ms
- verification_details_opened
- unverified_completion_count
- projection_lag_ms
- runtime_capability_mismatch_count
- evidence_missing_count
- action_timeline_gap_count
- evidence_invalidated_count
- stale_action_conflict_count
- stream_resume_fallback_count
- duplicate_event_dedup_count
- attention_notification_to_resolution_ms
- headline_count_aggregation_mismatch_count
- dependency_cycle_or_unresolved_blocker_count
- control_operation_pending_ms
- control_operation_outcome_unknown_count
- approval_expired_or_superseded_count
- delegated_capability_fallback_count
- evidence_conflict_count
- evidence_integrity_failure_count
- stale_readonly_session_count
- derived_data_purge_lag_ms
- stream_backpressure_snapshot_reconcile_count
- shadow_projection_mismatch_count

---

## 25. Implementation Phases

### Phase 0 — state taxonomy and projection correctness

Before visual rollout, lock:

- display-bucket precedence/count invariants
- task vs run vs attempt identity
- lifecycle vs verification dimensions
- canonical version/precondition semantics
- projector replay/idempotency rules
- headline count-unit/root-child aggregation rules
- control-command acknowledgement state machine
- approval action-binding/quorum projection semantics

### Phase A — UX projection over existing state

Deliver high-value visual upgrade without waiting for every new backend primitive.

Implement:

- redesigned overview
- summary counts
- attention inbox
- running task cards
- pipeline projection
- agents/execution summary
- recent activity from existing events
- recently completed/history entry point
- search/filter basics
- improved empty states
- task detail shell
- remove internal Spec terminology from User mode

### Phase B — Completion Contract + Verification

Implement:

- normalized task completion contract
- verification tab
- required vs optional checks
- verified/unverified distinction
- deterministic progress basis

### Phase C — Evidence Receipts

Implement normalized receipts for high-value evidence first:

1. tests
2. typecheck/lint
3. artifacts
4. code diff
5. browser checks
6. API/deployment checks
7. source verification

### Phase D — Provenance + Permission Timeline

Implement:

- normalized causal action events
- permission snapshot references
- approval linkage
- incident/recovery timeline
- retry/handoff/parallel-attempt presentation
- advanced/admin expansion

### Phase E — Capability-aware routing UX

Implement:

- runtime capability manifest normalization
- eligibility/degradation display
- fallback capability provider selection
- warnings before dispatch when a required capability is unavailable

### 25.1 Shadow projection, canary rollout, and kill switch

Before making Spec 277 the default Task Control view:

1. run the new projector in shadow mode against canonical events without serving it as authority;
2. compare old/current UI-visible state and canonical source facts against the new classification, counts, active executor, attention items, and lifecycle/verification projection;
3. investigate every cross-scope mismatch, duplicate active executor, false verified state, or duplicated side effect as a release blocker;
4. canary the new view to selected internal/beta scopes behind a feature flag;
5. keep a UI/read-projection kill switch that can return users to the prior compatible view without changing canonical jobs/runs/approvals/evidence;
6. backfill/rebuild supports dry-run metrics and restartable checkpoints before writing production projections.

Minimum broad-rollout gates:

- zero known cross-tenant/workspace leakage in automated and manual UAT;
- zero cases where two attempts are presented as authoritative active executor for one lease lineage;
- zero false `verified` completions in the qualification fixture;
- zero duplicate canonical side effects caused by Task Control retries/approvals in fault-injection tests;
- unexplained classification/count mismatch rate effectively zero for the qualification sample; any accepted mismatch class must be documented and intentionally modeled;
- accessibility, responsive, reconnect, and stale-action conflict suites pass.

---

## 26. Migration / Compatibility

- Existing tasks/runs remain valid.
- Existing Spec 224/226 data MUST continue to render through a compatibility projection.
- Legacy completed tasks without evidence render as `Completed` with `Verification unavailable` / `Unverified`, not retroactively failed.
- No destructive migration is required for Phase A.
- New evidence/provenance schemas should be additive and versioned.
- Rollout behind a feature flag is recommended until projection parity is verified.
- Old and new projection/schema versions MAY coexist during rollout; API consumers must not assume one-shot migration.
- Backfill/rebuild jobs must be scope-bounded and resumable and must not acquire execution authority.
- Feature rollback must leave canonical jobs/runs/evidence intact.

### 26.1 Schema evolution and mixed-version compatibility

Task Control will coexist with local runners, external agents, mobile/desktop clients, and projectors that may not upgrade simultaneously. Versioned schemas therefore need explicit fail-safe compatibility behavior.

Requirements:

- every durable event/receipt/manifest/contract/projection schema carries a version or is wrapped by a versioned envelope;
- consumers MUST preserve/ignore unknown optional fields safely and MUST NOT map an unknown lifecycle/verification/authority state to success;
- unknown **safety-relevant** enum/state values fail closed to `unknown`, `manual-review`, `unsupported`, or read-only behavior according to context;
- projector migrations support deterministic replay from older stored events and SHOULD support at least the migration window required by current SmartAIHub rollout policy;
- API responses MAY advertise supported/minimum schema/client capability versions where an old client could otherwise perform an unsafe mutation;
- a client/runtime that cannot understand a required new approval, authority, evidence, or side-effect state is denied the affected mutation rather than silently degrading semantics;
- compatibility tests include mixed N/N-1 (or policy-defined) components and explicit unknown-field/unknown-enum fixtures.
- protocol compatibility additionally treats base MCP revision and each extension version/profile as independent dimensions; an old client MUST NOT infer extension support from base-protocol support alone.
- unknown required/security-critical protocol extensions fail closed for the affected operation; safe unknown optional extension metadata may be preserved without execution when the owner contract permits omission.
- cached protocol discovery/negotiation data that is stale for a hard requirement MUST be refreshed or treated as `unknown` before dispatch according to freshness policy.

---

## 27. Testing Requirements

### 27.1 Unit tests

Cover:

- status mapping
- pipeline mapping
- attention classification
- progress calculation
- capability eligibility
- completion contract evaluation
- evidence trust classification
- redaction

### 27.2 Integration tests

At minimum:

1. queued task appears in Waiting/Pipeline
2. task starts and moves to Running
3. approval request appears in Needs Your Attention
4. approval action resumes canonical run
5. required verification fails and task does not show verified completion
6. evidence receipt appears in Verification
7. runtime missing required capability produces degraded/manual state
8. task recovery appears in Activity
9. cross-tenant/workspace access is denied
10. stale projection does not overwrite canonical state
11. duplicate/out-of-order events do not duplicate counts or timeline rows
12. old evidence becomes stale after bound inputs change
13. retry/handoff shows only one authoritative active executor
14. contract weakening requires an authorized decision
15. stale approval/action precondition returns conflict without duplicate side effect
16. expired/unknown capability cannot satisfy a hard requirement
17. lifecycle `done` + verification `unverified` renders correctly
18. stream reconnect resumes or snapshot-reconciles without missing/duplicating events
19. duplicate attention events create one unresolved attention item/notification
20. resolving an approval from chat/another device clears or supersedes the Task Control attention item
21. switching personal/project/team/tenant scope never mixes counts or task previews
22. planning/phase gate blocks a mutating capability until the canonical transition is accepted
23. newly introduced mutating capability is fail-closed in a restricted phase unless explicitly allowed
24. parallel worker results arrive through Result Inbox without duplicate fan-in after reconnect/replay
25. partial/failed worker result remains visible and cannot be silently omitted from finalization
26. no-progress/delegation loop triggers a canonical liveness intervention and Task Control leaves generic `Running`
27. queued user steering appears as queued, applies at a safe boundary, and does not automatically cancel unrelated in-flight child work
28. required Work Board item left unresolved blocks Finalization Gate even if an agent emits a final answer
29. finalization gate bypass/legacy compatibility state renders `verification incomplete` rather than verified success
30. steering that changes inputs/requirements invalidates stale plan/evidence/contract state deterministically
31. tool/action queued under Planning cannot execute after authority epoch changes unless re-authorized under the new effective policy
32. phase transition and delayed mutating action race cannot bypass the phase gate
33. crash/restart reconstructs Result Inbox and does not fan-in the same result twice
34. coordinator context budget defers low-priority results while preserving required failures/security evidence and finalization blockers
35. finalization waits for the declared result watermark / required child work and does not race ahead of a late authoritative result
36. accepted-but-unapplied material user intervention blocks or deterministically redirects finalization
37. two queued contradictory interventions preserve canonical ordering/supersession rather than being silently merged
38. legitimate known wait/long-running tool does not trigger a no-progress false positive; duplicate events do not reset liveness
39. cancelled/fenced worker returning late cannot clear blockers or satisfy completion without explicit canonical adoption
40. resume after crash preserves plan revision, phase authority revision, interventions, control operations, and finalization state without regression
41. a high-impact action reviewed against one consistency envelope is rejected when plan/authority/contract/approval revision changes before submit
42. material instruction arriving after terminal commit creates a continuation/reopen lineage without rewriting the committed historical run
43. result from an older assignment/execution generation after reassignment remains historical and cannot satisfy the replacement work item automatically
44. canonical parallelism/resource saturation renders as capacity wait and does not trigger a false liveness failure
45. approval/attention deadline expires without implicit approval and follows the declared block/cancel/escalate/safe-fallback policy
46. external side effect with `outcome-unknown` cannot be blindly retried or satisfy required reconciliation until a receipt resolves it
47. verification failure after a committed external side effect surfaces required compensation/rollback and preserves original effect provenance
48. delegated execution records logical actor, runtime instance, effective principal, and delegation chain without cross-scope authority inheritance
49. approval payload changes while the review surface is open disables the old decision action and requires explicit re-review
50. mixed-version/unknown-enum fixtures fail safe and an old client cannot execute a mutation whose new safety state it cannot understand
51. MCP peer advertises an extension but qualification fails; Task Control shows it as unavailable/unqualified and routing does not treat it as ready
52. required MCP extension is absent/incompatible; preflight blocks without silent fallback
53. optional MCP Tasks extension is absent and declared SmartAIHub durable-wrapper fallback preserves one canonical task/job authority
54. MCP remote task reports `completed` while final verification is pending/failed; Task Control remains not verified
55. late MCP task result from a superseded assignment generation cannot satisfy replacement work
56. MCP UI is negotiated/qualified and rendered only through the sandboxed host surface; UI action still passes canonical authorization
57. optional MCP UI is unavailable and native result fallback is used without marking the underlying tool unavailable
58. mixed base-MCP/extension-version skew fails safely and is explainable in Advanced/Developer mode

### 27.3 E2E visual paths

Desktop + tablet + mobile:

- empty account
- one active task
- multiple tasks
- attention required
- verification failure
- completed verified task
- completed legacy/unverified task
- offline runtime
- retry/handoff with superseded attempt
- stale evidence after a new edit
- accepted-with-risk completion
- large-history search/filter/pagination
- waiting-for-worker-before-finalize / quiescence barrier
- plan revised while task is running
- two queued steering instructions with one superseded
- recovery/reconciliation after runner/app restart
- approval changed while user is reviewing (`Review again`)
- capacity-saturated task (`4 active • 2 waiting`)
- external effect reconciliation / outcome unknown
- compensation or rollback required after a committed effect
- completed task receiving a new instruction via `Continue task` rather than silent reopen

### 27.4 Accessibility tests

- keyboard-only approval flow
- screen-reader status labels
- focus order
- contrast
- reduced motion

### 27.5 Concurrency, fault-injection, and UAT

At minimum cover:

- root task with 20 internal subtasks still contributes one headline task count unless children are explicitly user-visible;
- blocked dependency becomes satisfied, fails again, and deterministically regresses dependent state;
- dependency cycle/configuration error becomes visible rather than indefinite waiting;
- two users/devices race to approve/cancel/retry and only the canonical valid action applies;
- multi-party `N-of-M` approval, ordered approval, expiry, revocation, and material payload change requiring re-approval;
- Pause/Cancel command accepted but runner delayed/offline: UI remains `requested/uncertain` until canonical application/recovery;
- capability is fulfilled by a delegated browser/runtime provider without falsely upgrading the primary runtime manifest;
- conflicting receipts on the same snapshot produce deterministic fail/manual-review semantics;
- invalid receipt signature/hash cannot satisfy completion and emits audit/security evidence;
- offline/stale-readonly client cannot execute approval/destructive actions;
- app resume after stale cache reconciles before mutations are enabled;
- archive/delete/retention event removes derived search/projection/cache/notification data without resurrection after rebuild;
- stream burst/backpressure preserves approvals/failures while coalescing non-critical activity safely;
- shadow/canary comparison detects an intentionally injected projection mismatch;
- coordinator receives 50 parallel child completions under burst load and bounded fan-in preserves every terminal/error result without context blow-up;
- safe-turn steering arrives while a child tool call is mutating state and is applied only after the declared safe boundary;
- a phase transition races with a stale UI action and server-side phase/authority preconditions prevent unauthorized execution;
- a no-progress watchdog nudge/replan/recovery is replayable and does not create duplicate child jobs.

UAT should use representative user journeys rather than only API fixtures: start in Chat → observe Task Control → receive attention notification → review evidence → approve → reconnect from another device → verify final outcome/history.

---

## 28. Acceptance Criteria

Spec 277 is complete only when:

- [ ] User mode no longer exposes Spec 224/226 or canonical worker terminology as primary copy.
- [ ] Overview answers running / need-you / waiting / failed at a glance.
- [ ] Needs Your Attention is visually prioritized when non-empty.
- [ ] Active tasks show agent/runtime, execution location, stage, progress basis, and verification preview.
- [ ] Pipeline is derived from canonical state.
- [ ] Empty state explains the value of Task Control.
- [ ] Task detail includes Overview, Verification, Activity, Files/Artifacts, and Decisions.
- [ ] Required completion checks can block “verified complete” presentation.
- [ ] Evidence receipts distinguish structured/machine evidence from agent prose.
- [ ] Activity can reconstruct the important causal sequence of a task.
- [ ] Permission/approval information is visible without leaking secrets.
- [ ] Runtime capability differences are represented honestly.
- [ ] No new execution authority, scheduler, or duplicate queue is introduced.
- [ ] All write actions route to canonical services.
- [ ] Desktop, tablet, and phone layouts are usable.
- [ ] Tenant/workspace authorization and redaction tests pass.
- [ ] Existing runs remain compatible.
- [ ] Summary headline counts are mutually exclusive and derived from one classification snapshot.
- [ ] Task/run/attempt/handoff identities remain inspectable and only one authoritative executor is shown active.
- [ ] Lifecycle and verification states are separate API/UI dimensions.
- [ ] Completion-contract revisions are immutable and weakening is auditable/authorized.
- [ ] Evidence is snapshot-bound where applicable and becomes stale after relevant inputs change.
- [ ] Projection/event processing is idempotent under duplicate/out-of-order delivery.
- [ ] Mutating actions use idempotency + canonical preconditions and reject stale UI safely.
- [ ] Search/filter/history is usable at large task counts with cursor pagination.
- [ ] Cost/time presentation uses canonical billing and user timezone semantics.
- [ ] Artifact/evidence references are access-checked and governed by retention policy.
- [ ] Needs Your Attention deduplicates canonical decisions/blockers and deep-links through existing notification/chat continuation paths.
- [ ] Multi-scope users always see an explicit active scope and counts/search/activity remain scope-consistent.
- [ ] Headline counts default to user-visible root tasks and do not inflate because of internal subtasks/attempts/reviewer loops.
- [ ] Task dependencies/blockers are inspectable and unexplained/cyclic waiting cannot remain silently indefinite.
- [ ] Pause/Cancel/Retry/Resume UI distinguishes command requested/accepted/applied/unknown instead of optimistic terminal state.
- [ ] Multi-party/quorum/ordered approvals, expiry, revocation, and action-payload binding render truthfully when canonical policy uses them.
- [ ] Delegated/fallback capabilities identify the actual provider and never mutate the primary runtime's declared capability depth.
- [ ] Conflicting/revoked/integrity-failed evidence cannot silently satisfy a completion criterion.
- [ ] Offline or stale-readonly clients cannot queue or execute high-impact canonical mutations.
- [ ] Sensitive Task Control previews are classification/redaction-aware and raw secret-bearing payloads are not loaded for overview rendering.
- [ ] Archive/delete/retention actions purge or tombstone all derived Task Control/search/cache/notification state according to policy.
- [ ] Canonical Work Board is a replayable resolution/state projection and does not store hidden reasoning as task state.
- [ ] Phase-scoped execution policy is visible and enforced server/runtime-side; restricted phases are fail-closed for unapproved mutations.
- [ ] Parallel worker/sub-agent results enter a structured Result Inbox and fan into coordinator/task state idempotently with bounded context.
- [ ] Progress/delegation watchdog can surface stalled/replanning/escalated states instead of misleading perpetual `Running`.
- [ ] Finalization Gate evaluates Work Board + Completion Contract + evidence + approvals/side-effect reconciliation before verified completion.
- [ ] User steering can be queued/applied at safe boundaries with canonical audit/idempotency and visible status in Task Details/Chat.
- [ ] Qualification includes shadow comparison, canary rollout, fault injection, and a rollback/kill-switch path that leaves canonical execution untouched.
- [ ] Work Board mutations are canonical plan-change commands with revision conflict protection; projection rows are never directly mutated.
- [ ] Delayed/queued actions are fenced by current phase/authority revision and re-authorized before side effect.
- [ ] Result Inbox ingestion and coordinator consumption are separately idempotent, including crash/reconnect replay.
- [ ] Finalization includes a quiescence/result-watermark barrier so authoritative in-flight work and material queued interventions cannot be skipped.
- [ ] Watchdog liveness is based on meaningful progress and suppresses known-wait/long-tool false positives.
- [ ] Multiple interventions have canonical ordering/supersession semantics and cannot silently race with finalization.
- [ ] Resume/recovery reconstructs plan, phase authority, fan-in cursor, interventions, control operations, and finalization state without duplicate application.
- [ ] Late/orphan/fenced worker results remain auditable but cannot regain authority or satisfy completion without explicit canonical adoption.
- [ ] High-impact actions/finalization use a coherent canonical consistency envelope/state vector or equivalent opaque precondition, preventing torn-view commits.
- [ ] Terminal commit is immutable history; post-commit instructions create a continuation/reopen lineage rather than silently rewriting the completed run.
- [ ] Results are bound to assignment/work-item execution generation so superseded-generation output cannot satisfy replacement work automatically.
- [ ] Resource/parallelism saturation is projected truthfully and is distinguishable from liveness failure.
- [ ] Attention deadlines/expiry/fallback never imply automatic privileged approval and are visible when material.
- [ ] External side effects can carry reconciliation receipts; `outcome-unknown` cannot silently pass completion or blind retry.
- [ ] Required compensation/rollback after a committed side effect is visible, auditable, and separate from cancellation.
- [ ] Provenance distinguishes logical actor, runtime instance, effective principal, and delegation chain sufficiently for cross-scope audit/authorization.
- [ ] High-impact decision UI freezes the reviewed action snapshot and requires re-review when the action/version changes.
- [ ] Schema evolution/mixed-version behavior fails safe for unknown safety-relevant states and prevents unsafe old-client mutations.

---

## 29. Explicit Anti-Patterns

Do NOT:

1. copy Mission Control's architecture wholesale
2. create `task_control_jobs` as a competing source of truth
3. let the UI invent task progress
4. mark work verified from prose alone
5. pretend every runtime supports the same capabilities
6. show raw logs by default
7. expose internal spec numbers to ordinary users
8. use “0 active” empty cards as the entire experience
9. place the large task composer above all operational state
10. bury approvals below activity/history
11. let Task Control directly update execution state tables
12. store secrets inside provenance/evidence records
13. keep a passed receipt valid after the files/artifact/input snapshot it verified has changed
14. count one task simultaneously in Running, Need You, Waiting, or Failed headline cards
15. collapse logical task, run, retry attempt, and handoff into one ambiguous identifier
16. execute a stale approval/retry/cancel action without canonical version/precondition checks
17. treat an expired/unknown runtime capability as supported
18. show estimated cost as settled/final cost
19. create a second attention/notification state machine disconnected from canonical approvals/decisions
20. mix tasks/counts from personal/project/team/tenant scopes in one unlabeled dashboard snapshot
21. count internal subtasks/reviewer loops/attempts as separate headline tasks unless explicitly user-visible
22. optimistically show `Paused` or `Cancelled` merely because a control command was submitted
23. reuse an approval after the authorized deployment/migration/action payload materially changed
24. claim the primary runtime supports a capability that was actually supplied by a delegated/fallback provider
25. resolve contradictory evidence by selecting the most favorable receipt or by rewriting failed evidence after risk acceptance
26. enable approvals/destructive actions from stale cached/offline Task Control state
27. persist raw secret/confidential payloads merely to create activity/evidence previews
28. delete a task while leaving searchable projection/cache/notification derivatives or resurrect deleted data during rebuild
29. subscribe a scoped Task Control client to broad tenant event firehoses it is not authorized or required to receive
30. launch the new projection broadly without shadow parity, canary validation, fault-injection, and rollback controls
31. treat the Work Board as a free-form reasoning notebook or second authoritative task database
32. rely on prompt text alone to keep Planning/read-only phases from mutating state
33. make the coordinator repeatedly poll raw sub-agent output when structured Result Inbox/fan-in is available
34. display endless `Running` while delegation/tool repetition makes no evidence, artifact, board, or criterion progress
35. accept an agent's final prose answer as equivalent to passing the Finalization Gate
36. cancel every in-flight child automatically whenever the user adds a steering instruction
37. collapse Pause/Cancel commands, steering instructions, approvals, and ordinary chat messages into one unaudited mutation channel
38. dump full child-agent transcripts into the coordinator context or dashboard instead of bounded summaries + recoverable handles
39. execute a queued mutating action using an authority decision captured before a phase/policy/approval change without revalidation
40. treat Result Inbox ingestion as equivalent to coordinator consumption or re-inject the same result after resume
41. finalize while required authoritative child work/results or material accepted interventions are still pending
42. reset the no-progress watchdog on duplicate/no-op events that do not change meaningful task state
43. silently merge contradictory queued user steering instructions or reorder them using client timestamps
44. let a cancelled/fenced/superseded worker's late result mutate the current Work Board or satisfy completion automatically
45. directly edit Work Board projection rows from the UI instead of issuing canonical plan-change commands
46. resume from a checkpoint without reconciling plan/phase/fan-in/intervention/finalization revisions
47. commit a high-impact action using a torn combination of plan/phase/contract/approval revisions that were never simultaneously authoritative
48. silently mutate a terminal committed run because a new instruction arrived after completion instead of creating an explicit continuation/reopen lineage
49. accept a result from an obsolete assignment/execution generation as fulfillment of the replacement work item without compatibility/adoption checks
50. label capacity-constrained queued workers as `Running` or let a legitimate bounded resource wait trigger no-progress recovery
51. interpret an expired unanswered approval as approval or continue with a weaker unauthorized guarantee
52. equate an accepted API/tool call with reconciled durable external state when the completion contract requires external-state proof
53. imply that Cancel undoes an already committed external effect or hide required compensation/rollback
54. authorize by friendly agent/runtime display name rather than stable principal/delegation scope
55. keep an `Approve` button active while silently replacing the action/configuration the user was reviewing
56. map an unknown safety-relevant schema/enum/state from a newer component to success or unrestricted mutation

31. treat an MCP extension advertisement as qualified/authorized readiness
32. create `mcp_tasks` as a competing canonical Task Control/job lifecycle authority
33. allow remote MCP task `completed` to bypass Completion Contract/Finalization Gate
34. equate an MCP App/UI resource with a SPAAS Mini App/product identity
35. hard-code only today's MCP extension IDs into the Runtime Capability Manifest schema
36. silently downgrade a required extension to a fallback that changes material semantics without re-admission/approval

---

## 30. Mockups

The mockups are **directional product references**, not pixel-perfect implementation contracts. Behavior, hierarchy, and information content are authoritative; exact colors/icons/spacing may adapt to the current SmartAIHub design system.

Revision 1.3 established the execution-semantics mockup baseline; Revision 1.5 adds further state variants in §30.2. Illustrative numbers, timestamps, cost units, counts, progress percentages, agent names, and button availability remain sample data only.

### 30.1 Mockup changes required in R1.3

The R1.2 mockups are visually strong but incomplete for the execution model. They MUST be revised as follows:

**Overview:**

- retain four high-signal cards and `Needs Your Attention` priority;
- when completion is waiting on fan-in/quiescence, show user-readable state such as `Waiting for 1 worker result` instead of `99%`;
- Running cards add a compact phase/status label and parallel work summary when applicable, e.g. `Executing • 3 workers`;
- show truthful liveness state such as `Replanning` / `Waiting for worker results` instead of generic Running when watchdog state says so;
- expose queued user steering with a subtle `Instruction queued` indicator when relevant;
- if plan/work was revised, show a compact `Plan updated`/revision activity cue without exposing raw revision numbers in User mode;
- preserve simplicity: Work Board detail stays collapsed behind task detail rather than expanding every subtask on the dashboard.

**Task Details / Verification:**

- add a compact phase rail such as `Plan → Execute → Test → Verify → Finalize`;
- add a user-readable `Ready to finish` / `Waiting before finish` panel that combines Finalization Gate + quiescence barrier rather than showing only check rows;
- show Finalization Gate state separately from individual checks;
- Verification rows may identify producing runtime/provider when delegated;
- permissions/approvals panel remains, but approval truth must stay bound to the exact current action/version;
- expose `Instruction queued/applied` status without replacing the canonical Chat thread.

**New Task Details / Work Plan view:**

- add a dedicated mockup showing Work Board, execution topology, parallel workers/result fan-in, current blocker, liveness/replan state, and safe-turn steering;
- ordinary users see short labels and ownership/status, not internal orchestration IDs;
- Advanced mode can expand result/evidence/provenance handles.

### 30.2 Additional mockup delta required in R1.5

No fourth primary mockup is required. The existing three R1.3 mockup surfaces are sufficient, but their implementation/reference variants SHOULD additionally cover:

- `Needs Your Attention` with an approval deadline/expiry consequence such as `Due in 2h • Will remain blocked`;
- Work Plan/topology state `4 workers active • 2 waiting for capacity` so resource saturation is not confused with execution;
- approval review state `Action changed — review again`, with the old Approve control disabled;
- Finalization/Verification state `External effect outcome unknown — reconciling` when reconciliation receipt is required;
- task detail state `Rollback required / Rollback in progress / Rollback failed` after an already committed effect;
- completed task action `Continue task` for post-terminal instructions rather than visually reopening immutable history;
- Advanced diagnostics may show the action basis/state vector, assignment generation, and principal/delegation references, but User mode MUST keep them hidden.

These are **state variants of existing mockups**, not justification for making the default dashboard denser.

### 30.3 Additional mockup delta required in R1.6

The default User view MUST remain simple and MUST NOT expose raw MCP extension namespaces. No new primary dashboard card is required solely for MCP.

Advanced/Developer variants of `Agents & Execution` and Task Details SHOULD add a compact **Protocol & capabilities** disclosure when protocol compatibility affected routing or degradation, for example:

```text
Protocol: MCP 2026-07-28
Core: Tools ✓  Resources ✓
Extensions:
  Skills     Negotiated • Qualified
  Tasks      Not available → SmartAIHub durable wrapper
  UI         Optional • Native result fallback

Why this path?
  Required code capability satisfied
  Required verification evidence satisfied via delegated browser provider
```

For an external MCP Task, Activity/Diagnostics MAY show `External task handle` under the canonical run, never as a sibling top-level SmartAIHub task.

When a required extension blocks execution, User mode SHOULD use plain language such as `This runtime cannot provide a required capability`; Advanced mode MAY reveal the exact extension/profile/version mismatch.

### Mockup 01 — Task Control Overview (R1.3)

![Task Control Overview R1.3](./mockup-01-task-control-overview-r1.3.png)

Key intent:

- compact start-task control
- four high-signal status summaries
- visible pipeline
- Needs Your Attention before operational detail
- Running Now with evidence-based progress/checks + phase/topology summary
- truthful stalled/replanning/waiting states
- Agents & Execution panel
- Recent Activity

### Mockup 02 — Task Details / Verification (R1.3)

![Task Details Verification R1.3](./mockup-02-task-details-verification-r1.3.png)

Key intent:

- user-readable task/run header
- phase rail and authoritative executor
- verification as first-class product surface
- explicit Finalization Gate
- normalized evidence rows including delegated producer where relevant
- files changed / artifacts
- causal activity timeline
- permissions and approvals
- queued/applied steering status without overwhelming default users

### Mockup 03 — Task Details / Work Plan & Live Steering (R1.3)

![Task Details Work Plan R1.3](./mockup-03-task-details-work-plan-r1.3.png)

Key intent:

- Work Board as resolution/state checklist, not a reasoning transcript
- phase-scoped allowed/blocked action explanation
- parallel execution topology and Result Inbox/fan-in status
- blockers and dependencies
- liveness/watchdog state and recovery/replan event
- safe-turn intervention composer/status
- compact evidence/artifact handles for completed work items

---

## 31. Recommended Implementation Order

The recommended order is intentionally chosen to improve product value early while minimizing architecture risk:

1. **Lock state taxonomy, task/run/attempt/work-item identity, headline count invariants, and projector replay semantics**
2. **Define canonical Work Board projection + phase/stage policy view using existing orchestration authority**
3. **Build projection + new overview UI using existing state**
4. **Task detail shell + Activity + Decisions + Work Plan from existing events/approvals/workflow state**
5. **Normalize Completion Contract with immutable revisions + explicit Finalization Gate result**
6. **Add snapshot-bound Evidence Receipts starting with tests/typecheck/artifacts**
7. **Add structured Result Inbox + bounded/idempotent auto fan-in for parallel workers/sub-agents/delegated providers**
8. **Add Provenance + Permission Snapshot normalization, including retry/handoff/steering chains**
9. **Formalize Runtime Capability Manifest freshness, capability composition, and phase-scoped execution policy projection**
10. **Add root-task/subtask aggregation, dependency/blocker projection, control-command acknowledgement semantics, and liveness/watchdog visibility**
11. **Add multi-party approval/action binding, delegated-capability fulfillment visibility, and safe-turn user intervention status**
12. **Harden evidence conflict/integrity handling, sensitive preview classification, archive/delete propagation, and bounded result-context policy**
13. **Add authority-epoch/TOCTOU fencing, fan-in consumption cursors, finalization quiescence barrier, intervention ordering, and coherent execution consistency envelope/action basis before enabling high-impact live controls**
14. **Add assignment-generation fencing, attention deadline projection, capacity-wait visibility, side-effect reconciliation receipts, and compensation/rollback projection for workflows that need them**
15. **Harden principal/delegation identity, decision review snapshots, and mixed-version/schema compatibility for external/local runtimes and clients**
16. **Qualify crash/resume continuity, orphan/late result handling, stale/offline client behavior, parallel fan-in burst/backpressure, terminal continuation/reopen behavior, shadow projection, canary, and rollback gates**
17. **Enable advanced/admin diagnostics, history search, deeper evidence inspection, and optional execution-topology drilldown**

This order keeps Spec 277 additive. Runtime enforcement (phase gate, watchdog, bounded spawn/fan-in, safe-boundary application) SHOULD reuse existing SmartAIHub orchestration/runtime contracts. The Task Control work standardizes their projection and user control semantics rather than creating another orchestration engine.

Before Phase E is considered complete for MCP-backed runtimes, implementation MUST also normalize protocol profiles, extension negotiation/qualification state, required-extension preflight, and external MCP Task bindings without changing canonical job authority. MCP UI rendering is a host-surface integration and may ship independently when the extension is optional.

---

## 32. Final Product Definition

After Spec 277, Task Control should feel like:

> **A simple control center where users can see what AI is doing, intervene only when needed, and know whether the result was actually verified.**

The underlying system may remain technically sophisticated, but users should not need to understand the orchestration kernel to trust and control their work.


---

## 33. Ten-Pass Gap Review Incorporated

Spec 277 revision 1.1 was reviewed in ten distinct passes. The resulting changes are normative where integrated above.

| Pass | Review focus | Gap found and resolved |
|---|---|---|
| 1 | Information architecture | Added Recently Completed, history/search/filter behavior, deterministic ordering, explicit scope context, attention lifecycle/deep-link behavior, and clarified progressive disclosure. |
| 2 | State semantics | Added mutually exclusive headline bucket precedence/count invariants and separated lifecycle from verification state. |
| 3 | Durable execution identity | Defined task vs run vs attempt, retry/handoff/parallel work, superseded attempts, and single authoritative active executor. |
| 4 | Capability truthfulness | Replaced boolean-only capability assumptions with supported/unsupported/unknown/degraded descriptors, freshness, placement/version binding, and preflight records. |
| 5 | Completion integrity | Added immutable completion-contract revisions, snapshot references, and anti-weakening rules requiring authorization/provenance. |
| 6 | Evidence integrity | Added criterion/contract binding, producer trust class, snapshot-bound evidence, invalidation/staleness after inputs change, and no blind evidence inheritance across attempts. |
| 7 | Provenance/event correctness | Added causal IDs, source/ingest time, run sequence, deduplication, out-of-order handling, replay safety, and visible timeline gaps. |
| 8 | Projection/actions consistency | Added projection revisions/watermarks, idempotent replay, stream resume, cursor pagination, canonical version preconditions, stale-action conflict handling, and side-effect uncertainty. |
| 9 | Security/scale/localization | Added artifact-reference authorization, retention/privacy lifecycle, bounded payload rules, timezone and SmartAIHub billing semantics, notification reuse/deduplication, and live-update accessibility behavior. |
| 10 | Delivery/QA/compatibility | Added Phase 0 correctness gate, rollout coexistence/backfill/rollback rules, expanded integration/E2E tests, acceptance criteria, and anti-patterns. |

### 33.1 Review conclusion

No architectural replacement of Specs 186/224/226 is required. The critical correction is to make Spec 277 a **truthful projection and verification experience**, not merely a richer dashboard. The UI can remain simple while its state, evidence, authority, and history contracts are explicit enough to prevent false progress, false verification, duplicate execution, stale approvals, and misleading runtime capability claims.

---

## 34. Second Ten-Pass Gap Review Incorporated (Passes 11–20)

Revision 1.2 adds a second independent ten-pass review focused on ambiguities that become visible only after the first correctness pass. These changes are normative where integrated above.

| Pass | Review focus | Gap found and resolved |
|---|---|---|
| 11 | Task graph & aggregation | Added root-task headline count semantics, internal work-unit aggregation, dependency/blocker modeling, cycle/error visibility, and truthful ETA rules. |
| 12 | Control-command lifecycle | Added requested/accepted/applied/rejected/outcome-unknown semantics so Pause/Cancel/Retry do not create optimistic false state. |
| 13 | Approval policy depth | Added multi-party, quorum, ordered/delegated approval projection, expiry/revocation, and exact action/payload/version binding. |
| 14 | Capability composition | Added explicit delegated/fallback provider fulfillment so a primary runtime is never credited with a capability supplied elsewhere. |
| 15 | Evidence conflicts & integrity | Added supersession/revocation/integrity states, deterministic contradiction handling, and security behavior for tamper-evidence failure. |
| 16 | Sensitive-data minimization | Added classification-aware previews, separately authorized raw reveal, auditability, and fail-closed secret handling. |
| 17 | Client/network resilience | Added Live/Reconnecting/Stale-readonly/Offline modes, mutation gating, app-resume reconciliation, and safe notification deep links. |
| 18 | Scale & event fan-out | Added capped previews with complete counts, N+1 prohibition, scoped subscriptions, backpressure/coalescing rules, and a synthetic load fixture. |
| 19 | Archive/delete propagation | Added purge/tombstone propagation across projections, search/indexes, caches, notifications, delivery links, and rebuild behavior. |
| 20 | Rollout & UAT | Added shadow projection, canary/feature flag, qualification gates, fault injection, restartable dry-run backfill, and canonical-safe rollback. |

### 34.1 Second-review conclusion

Spec 277 remains an additive projection and control experience over existing SmartAIHub authority. No new scheduler or execution kernel is justified. The new gaps primarily harden **representation under fan-out and uncertainty**: one user intent may contain many internal work units; commands and approvals may be pending rather than applied; capabilities may be delegated; evidence may conflict; and clients may be stale or offline. The UI must expose those truths without forcing ordinary users to understand the underlying machinery.

---

## 35. Third Ten-Pass Gap Review Incorporated (Passes 21–30)

Revision 1.3 performs an additional ten-pass review using FrontierAgent/AgentCore only as behavioral reference points and then checks each finding against SmartAIHub's existing orchestration boundaries. No external runtime dependency is introduced.

| Pass | Review focus | Gap found and resolved |
|---|---|---|
| 21 | Work decomposition truth | Added Canonical Work Board semantics as a resolution/state projection, explicitly excluding hidden reasoning/notebook content and duplicate task authority. |
| 22 | Phase authority | Added phase-scoped capability/execution-policy projection and fail-closed restricted-phase requirements so Planning restrictions cannot rely on prompts alone. |
| 23 | Parallel result collection | Added structured Result Inbox + bounded auto fan-in, deduplication, partial/failure preservation, and recoverable handles instead of raw transcript polling. |
| 24 | Completion boundary | Added explicit Finalization Gate joining Work Board, Completion Contract, evidence, approvals, delegated work, and side-effect reconciliation. |
| 25 | Liveness / no-progress | Added progress/delegation watchdog visibility for repeated tool/delegation/query loops with no evidence/artifact/board/criterion progress. |
| 26 | User intervention | Added safe-turn steering queue semantics, canonical audit/idempotency, in-flight child policy, and task/chat status projection. |
| 27 | Control-channel separation | Distinguished runtime control commands, steering, approvals, and ordinary chat/task edits so authority/reconciliation semantics remain explicit. |
| 28 | Execution topology | Added compact parallel worker/topology summaries without inflating headline task counts or exposing orchestration noise. |
| 29 | Mockup correctness | Determined that both existing mockups need revision and a third Work Plan/Live Steering mockup is required to visualize board, fan-in, phase gate, and steering without overloading Verification. |
| 30 | Fault/scale qualification | Added tests for fan-in bursts, phase races, safe-boundary intervention, finalization bypass, and replay-safe watchdog/recovery behavior. |

### 35.1 Third-review conclusion

The important change is not to make Task Control visually busier. It is to make the UI correspond to **real runtime control semantics**:

```text
User intent
   ↓
Canonical Work Board + phase policy
   ↓
Bounded execution / delegation
   ↓
Structured Result Inbox + Evidence Receipts
   ↓
Progress/liveness evaluation
   ↓
Completion Contract + Finalization Gate
   ↓
Verified result
```

Spec 277 therefore remains a projection/control experience over Specs 186/224/226/269/276. FrontierAgent/AgentCore are references for failure modes and useful patterns only; SmartAIHub's Durable Orchestration Kernel, canonical jobs, authority, placement, approvals, evidence, and task state remain authoritative.

---

## 36. Fourth Ten-Pass Gap Review Incorporated (Passes 31–40)

Revision 1.4 performs a fourth ten-pass review focused on concurrency, ordering, and crash/recovery boundaries that become critical once Work Board, fan-in, live steering, phase gates, and Finalization Gate are implemented together.

| Pass | Review focus | Gap found and resolved |
|---|---|---|
| 31 | Work Board mutation authority | Added canonical plan-change/revision semantics so UI edits cannot mutate projection state or silently weaken completion requirements. |
| 32 | Phase/action race | Added authority epoch/revision binding and execute-time reauthorization to close TOCTOU gaps between phase transitions and delayed tool actions. |
| 33 | Finalization concurrency | Added quiescence/result-watermark barrier so in-flight authoritative work cannot be skipped by an early final answer. |
| 34 | Fan-in exactly-once behavior | Separated Result Inbox ingestion from coordinator consumption and added dedupe/consumption cursor/epoch semantics for crash-replay safety. |
| 35 | Result completeness/context budget | Added complete/partial/truncated state and deterministic bounded fan-in policy that preserves required failures/security evidence. |
| 36 | Watchdog precision | Added meaningful-progress fingerprint, known-wait exemptions, bounded escalation, and duplicate/no-op suppression. |
| 37 | Steering ordering | Added canonical intervention sequence, supersession, contradiction handling, and explicit separation of emergency control from safe-turn steering. |
| 38 | Steering/finalization race | Added deterministic cut-off semantics and finalization checks for accepted-but-unapplied material instructions. |
| 39 | Crash/resume continuity | Added reconstruction requirements for plan/phase authority/fan-in/interventions/control/finalization state and mutation gating when reconciliation is incomplete. |
| 40 | Orphan/late worker results | Added fencing/adoption rules so late results remain auditable without regaining authority or silently changing completion. |

### 36.1 Fourth-review conclusion

The remaining high-risk failure mode was not missing UI information; it was **concurrent truth changing between check and use**. R1.4 therefore makes Spec 277 explicit about revision/epoch fencing, completion barriers, fan-in consumption, steering order, and recovery continuity.

The target behavior is:

```text
canonical plan/phase revision
        ↓
execute-time authority check
        ↓
bounded workers/results
        ↓
idempotent Result Inbox ingestion
        ↓
exactly-once coordinator consumption cursor
        ↓
meaningful-progress / liveness evaluation
        ↓
ordered safe-turn interventions
        ↓
quiescence + Completion Contract + Finalization Gate
        ↓
verified final result
```

This keeps Spec 277 a control/projection layer while making it safe enough to represent a genuinely concurrent SmartAIHub execution system.



---

## 37. Fifth Ten-Pass Gap Review Incorporated (Passes 41–50)

Revision 1.5 performs a fifth ten-pass review focused on coherent multi-source state, terminal-history semantics, delegation lineage, external side effects, approval-review races, and mixed-version safety. These gaps become visible only after the concurrency controls in R1.4 are treated as one integrated system.

| Pass | Review focus | Gap found and resolved |
|---|---|---|
| 41 | Cross-source consistency | Added an Execution Consistency Envelope/state vector so plan, phase/authority, contract, result watermark, intervention, and approval revisions cannot form a torn high-impact action/finalization basis. |
| 42 | Terminal history / continuation | Added immutable terminal commit semantics and explicit continuation/reopen lineage for instructions arriving after completion. |
| 43 | Delegated assignment lineage | Added work-item/assignment/execution-generation binding so obsolete reassigned worker results cannot automatically satisfy replacement work. |
| 44 | Bounded capacity visibility | Added parallelism/resource saturation projection and watchdog known-wait behavior so queued capacity is not mislabeled as running/stalled. |
| 45 | Human attention expiry | Added attention deadlines, expiry behavior, escalation/safe-fallback projection, and explicit prohibition on implicit approval. |
| 46 | External-effect reconciliation | Added side-effect/reconciliation receipts so accepted tool/API calls are not confused with durable verified external state. |
| 47 | Compensation / rollback | Added projection and authority semantics for compensation after already committed effects; Cancel is explicitly not Undo. |
| 48 | Actor/principal identity | Added logical actor vs runtime instance vs effective principal vs delegation-chain provenance for audit and confused-deputy protection. |
| 49 | Approval review race | Added review-snapshot freezing and `Action changed — review again` semantics when live state changes during a high-impact decision. |
| 50 | Schema/version evolution | Added fail-safe mixed-version/unknown-state compatibility rules so old clients/runtimes cannot downgrade new safety semantics. |

### 37.1 Fifth-review conclusion

R1.5 closes the remaining class of gaps where every individual subsystem can be correct while the **combination** is wrong: a UI may read mutually inconsistent revisions, a worker may return valid-but-obsolete work, an API call may succeed without durable reconciliation, or a user may approve a payload that changed while they were reading it.

The final high-integrity path is therefore:

```text
canonical consistency envelope
        ↓
coherent plan / phase / authority / contract basis
        ↓
bounded + generation-fenced execution
        ↓
idempotent Result Inbox / evidence / side-effect receipts
        ↓
ordered interventions + frozen decision review snapshot
        ↓
quiescence + reconciliation + Completion Contract
        ↓
terminal commit (immutable history)
        ↓
continuation/reopen lineage for later changes
```

Spec 277 still does not become the scheduler, policy engine, compensation engine, or job database. It defines the projection/control contracts needed for users to see and act on those canonical systems without false state, unsafe stale actions, or misleading completion.

---

## 38. R1.6 MCP 2026 Extension Compatibility Addendum

R1.6 is a targeted architecture reconciliation layered on the R1.5 50-pass integrity baseline. It does not reopen or weaken R1.5 concurrency, fencing, evidence, approval, side-effect or terminal-history contracts.

The addendum resolves six protocol-boundary gaps:

| Area | Gap in R1.5 | R1.6 resolution |
|---|---|---|
| Capability shape | runtime manifest was primarily flat | added generic protocol profile + extension descriptor |
| MCP truth | remote advertisement could not express negotiation/qualification stages | explicit advertised → negotiated → qualified → eligible model |
| Ownership | Spec 256/261/MCP owners were not explicit in §4 | added canonical ownership boundaries |
| Long-running MCP | external protocol task handle had no explicit projection contract | added `ExternalProtocolTaskBinding`; canonical jobs remain authoritative |
| Interactive MCP UI | rich protocol-delivered result surface was not modeled | added sandboxed MCP UI capability + native fallback semantics |
| Version growth | mixed-version rules did not explicitly separate base protocol vs extension version | added independent compatibility dimensions and fail-safe tests |

### 38.1 Normative upstream baseline

Implementation MUST pin exact upstream specification/schema snapshots. References verified 2026-10-04:

- MCP core `2026-07-28`, including mandatory `server/discover` and generic `extensions` capability maps: `https://github.com/modelcontextprotocol/modelcontextprotocol`
- Skills over MCP: `https://github.com/modelcontextprotocol/ext-skills`
- MCP Tasks: `https://github.com/modelcontextprotocol/ext-tasks`
- MCP Apps/UI: `https://github.com/modelcontextprotocol/ext-apps`

Upstream drafts are not self-executing product changes. A newer extension draft/version enters SmartAIHub only through adapter/schema review, compatibility tests, staged rollout and the existing R1.5 mixed-version safety policy.

### 38.2 R1.6 Definition of Done extension

In addition to every R1.5 acceptance requirement, MCP-backed Task Control integration is not complete until:

- a protocol profile can truthfully show MCP base revision and namespaced extension states without hard-coded extension enumeration;
- advertised, negotiated, qualified and eligible states cannot be confused in routing or UI;
- a required extension mismatch blocks before unsafe dispatch;
- an optional extension fallback is visible and used only when declared semantically acceptable;
- an MCP Tasks handle remains subordinate to canonical task/run/attempt identity and cannot bypass final verification;
- an MCP UI result is sandboxed and its actions re-enter canonical authorization/provenance;
- mixed base-protocol/extension-version skew and unknown extension fixtures fail safely;
- old runtimes lacking protocol-profile projection display `unknown` rather than fabricated capability support.



---

# CURRENT REVISION AMENDMENT


## A. Project-oriented Task Control views

Add user-facing views:

```text
My Work
My Approvals
Waiting on Me
Delegated by Me
Assigned to My Assistants
Waiting on Other Team/Department
External Agent Contributions
Project Health
Source Coverage
Documents / Artifacts
```

These are read projections only.

## B. Work Context header

A Project/Work Context view SHOULD surface:

- overall state;
- next milestone;
- blockers;
- overdue work;
- pending approvals;
- source coverage;
- stale/degraded sources;
- new documents;
- unresolved conflicts.

Technical backend concepts remain hidden by default.

## C. Handoff timeline

Task/Project detail SHOULD render meaningful responsibility transitions:

```text
Assigned
Accepted
Started
Waiting on Human
Waiting on Department
Blocked
Reassigned
Completed
Rejected
Expired
```

Each transition deep-links to its durable receipt/evidence.

## D. Artifact UX

When a task/decision refers to an artifact, show:

```text
document title
business type
version
received/captured time
source
preservation state
integrity state
used-by decision/approval
```

Actions MAY include:

```text
Open
Download preserved copy
Open source occurrence
View previous versions
View approval/decision
```

All actions re-check authorization.

## E. Source coverage UX

Example:

```text
SmartAIHub Chat      complete
Gmail Vendor Thread  complete from 2026-10-01
LINE Sponsor Group   realtime + bounded backfill
OpenChat             partial
Grok Observer         stale
```

The UI MUST NOT label project knowledge “complete” if coverage is partial.

## F. Conflict UX

Conflicting evidence receives a visible state such as:

```text
Needs review
Source conflict
Current state revalidation required
```

Never pick the most favorable result silently.

## G. Executive digest drill-down

Every material digest item SHOULD deep-link to:

- source/evidence;
- task/work item;
- responsible person/team;
- related artifact;
- approval/decision;
- source coverage/limitations.

## H. Mobile/tablet

Primary views MUST remain usable on narrow screens. Evidence/provenance details may progressively disclose rather than requiring desktop-width tables.

## I. Acceptance tests

- `R277-WORK-01`: user identifies “waiting on Finance” in under 5 seconds.
- `R277-WORK-02`: artifact card returns exact historical version used in approval.
- `R277-WORK-03`: partial source coverage is visible.
- `R277-WORK-04`: source conflict is not rendered as completed/verified.
- `R277-WORK-05`: external-agent contribution is labeled by producer/trust class.
- `R277-WORK-06`: sensitive artifact action rechecks authorization.
- `R277-WORK-07`: phone layout exposes approvals and blockers without developer mode.
- `R277-WORK-08`: Project views do not create independent task lifecycle state.



## 12-pass cross-spec gap audit

| Pass | Audit lens | Required closure |
|---|---|---|
| 1 | Canonical ownership | No duplicate Project, Job, Memory, Evidence, Retrieval, Auth, Capability, A2A or Browser/Computer authority |
| 2 | Principal identity | Human, Assistant, external agent and organization remain distinct and attributable |
| 3 | Project variability | Different Projects may use different vocabulary, people, bots, sources and workflows without schema forks |
| 4 | Authorization | Relevance/discovery never grants access; current authorization is checked before hydration/action |
| 5 | Temporal correctness | Current state, historical state, promise, observation and forecast remain distinguishable |
| 6 | Evidence/provenance | Claims and answers remain traceable to source/evidence/artifact versions |
| 7 | Artifact continuity | Expiring/external documents can be preserved, versioned, deduplicated and recovered |
| 8 | Retrieval quality | Structured, semantic, temporal, graph and live-source retrieval are composed rather than replaced by vector similarity |
| 9 | External agents/protocols | MCP/A2A/provider capability discovery does not grant business authority or silently import foreign memory |
| 10 | Failure/fallback | Unsupported/incomplete capability may fall back; denial/policy rejection cannot be bypassed |
| 11 | Multi-tenant/privacy | Cross-tenant collaboration uses explicit disclosure; private deliberation/memory stays private |
| 12 | Operability | Incremental checkpoints, stale-source detection, idempotency, cost budgets, mobile UX and rollback are testable |

A release candidate FAILS if any pass is unresolved without an explicit owner, blocker and rollback-safe mitigation.

## Canonical revision governance — R1.8

**Canonicalization decision:** `R1.8` is a governance-only revision of semantic baseline `R1.7`. No domain requirement from `R1.7` was intentionally removed, weakened, or reinterpreted.

**Verified lineage:** the accessible `R1.6` predecessor is contained verbatim inside `R1.7`. Therefore `R1.7` is a strict cumulative successor for the compared source pair, and the later filesystem modified time of a lower-numbered local copy MUST NOT be interpreted as a later semantic revision.

Normative revision-resolution rules:

1. `SPEC_INDEX.yaml` is the revision authority for this Spec ID.
2. Filesystem `mtime`, download time, copy time, filename suffix, chat/session recency, and agent memory are **non-authoritative**.
3. An editor MUST resolve the current canonical record and verify `content_sha256` before starting a new revision.
4. A new revision MUST declare `based_on_revision` and `based_on_sha256`.
5. If two descendants share the same base and neither contains the other, mark both `DIVERGENT` and reconcile them into a new canonical revision; never choose by timestamp.
6. A lower revision created later MUST NOT supersede a higher canonical revision unless an explicit rollback record is present in `SPEC_INDEX.yaml`.
7. Existing implemented dependency boundaries and ownership rules in this specification remain unchanged by this governance-only revision.
8. Automation SHOULD reject writes whose proposed revision is `<=` the registry canonical revision, except explicit rollback/reconciliation workflows.
9. Canonical publication MUST update the registry atomically with the new file/hash.
10. Superseded files remain historical evidence and SHOULD NOT be silently deleted until repository retention policy allows it.

## Conditional local subscription provider status note (2026-10-09)

This proposal does not resolve Spec 277's `DORMANT_UNRESOLVED` authority and adds no execution, scheduler, approval, or Task Control authority. If the adapter is later approved, Task Control may project existing Runner/job receipts to show the selected mode (official API, local CLI model call, or delegated agent), Runner availability, sanitized authentication/allowance status, cancellation outcome, and whether fallback was explicitly authorized.

The projection MUST distinguish SmartAIHub credits, official API quota/billing, reported CLI token usage, estimated API-equivalent cost, subscription allowance, and actual billed charge. Unknown remaining allowance MUST display as unknown. Read models MUST NOT expose credentials, raw provider payloads, or claim a provider switch that is not present in the canonical job/attempt receipt. This is a conditional UI contract only; no duplicate Task Control surface is proposed. See Spec 231 §102.
