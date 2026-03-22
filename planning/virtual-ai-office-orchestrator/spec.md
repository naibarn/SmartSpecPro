# Virtual AI Office Orchestrator

## 1. Purpose

SmartSpec should evolve from:

- one user talking to one assistant

into:

- one orchestrator coordinating a team of virtual specialists that can discuss, delegate, remember, and execute work across the platform

This spec defines a unified system that extends the current persona model into:

- user personas
- assistant personas
- team agents
- orchestrated team chat
- scoped memories
- autonomous intra-agent discussion
- cross-surface automation

The goal is not to create “many bots” for novelty. The goal is to create a durable virtual office where specialized assistants collaborate toward outcomes while the user can choose how hands-on or hands-off to be.

## 2. Product Thesis

### 2.1 Core Shift

Today:

- the user asks
- one assistant answers
- complex work requires repeated user prompting

Target state:

- the user can act as an orchestrator
- the user can assign goals, constraints, and approvals
- virtual team members can continue the work among themselves
- SmartSpec returns either:
  - the full discussion trace
  - structured artifacts
  - a final summary
  - or a review-ready package

### 2.2 Core Product Principles

1. `Persona is identity, not the whole runtime`
2. `Teams are durable, not ad hoc prompt bundles`
3. `Memories are scoped, not dumped into one global context`
4. `Artifacts matter more than raw token exchange`
5. `The orchestrator controls autonomy, budget, and approvals`
6. `Single-assistant mode must remain excellent`

## 3. Definitions

### 3.1 User Persona

A user persona describes the user’s professional identity, communication style, goals, and preferences.

Examples:

- founder
- lawyer
- product manager
- teacher
- analyst

The user persona helps SmartSpec:

- infer likely goals
- propose useful team templates
- shape summaries and orchestration UX

### 3.2 Assistant Persona

An assistant persona is the identity of one virtual collaborator.

It includes:

- name or nickname
- gender style / language style
- role
- expertise
- tone
- instructions
- restrictions
- memory defaults

Examples:

- `Nong Jen`, research strategist
- `Arun`, legal reviewer
- `Mina`, product analyst

### 3.3 Role Agent

A role agent is an executable assistant persona with:

- a persona
- tools
- permissions
- memory scopes
- handoff rules
- work responsibilities

### 3.4 Team

A team is a durable collection of role agents with:

- team identity
- communication graph
- shared memory
- orchestration policy
- output rules
- approval rules

### 3.5 Orchestrator

The orchestrator is usually the user, but may later be assisted by a lead agent.

The orchestrator:

- sets goals
- selects autonomy level
- decides what is reviewable
- chooses whether to watch discussion or only see the summary
- approves high-risk execution

### 3.6 Room

A room is a conversation space where:

- the orchestrator and assistants can all participate
- a subset of assistants can discuss without the user posting each turn
- all relevant room memory and artifacts are preserved

### 3.7 Automation Destination

An automation destination is any SmartSpec execution surface an assistant may use, such as:

- workflow
- presentation
- video edit
- browser session
- agency job
- scheduled automation

## 4. Product Surfaces

### 4.1 Single Assistant Chat

This remains available for speed and simplicity.

Use when:

- task is short
- task is personal
- decomposition is unnecessary
- autonomy is low

### 4.2 Team Chat

The user opens a new chat with a team rather than a single assistant.

Capabilities:

- address the whole team
- address one member
- ask one member to challenge another
- request a synthesis
- request silent team work and final output only

### 4.3 Autonomous Team Session

The user creates a new automatic team discussion session where assistants talk to each other first.

The orchestrator can choose:

- `Watch everything`
- `Watch milestones only`
- `Show me only the final summary`

### 4.4 Team Builder

The user can:

- create a team from templates
- mix templates
- assign names to members
- choose models/tools/permissions
- choose memory policy
- choose escalation/approval rules

### 4.5 Orchestrator Dashboard

The user sees:

- active teams
- current jobs
- running autonomous sessions
- pending approvals
- recent artifacts
- summaries and decision logs

## 5. Domain Model

### 5.1 User

Fields:

- user profile
- user persona
- preferred language and style
- orchestrator defaults
- notification and autonomy preferences

### 5.2 Assistant Profile

Fields:

- id
- teamId
- personaId or inline persona config
- display name
- nickname
- role title
- specialty tags
- tool policy
- approval policy
- default memory policy
- visibility policy

Required rule:

- every assistant member in a team must resolve to exactly one assistant profile
- every assistant profile must resolve to exactly one active persona binding at runtime
- every assistant profile must have its own private agent-memory scope, even when it also participates in shared team and room memory

### 5.3 Team Profile

Fields:

- id
- team name
- description
- purpose
- category
- owner user/tenant
- lead agent
- member list
- execution policy
- memory policy
- artifact policy

Required rule:

- a team is not valid unless every active member has both:
  - an assistant persona
  - a private agent-memory scope

### 5.4 Room

Fields:

- id
- room type: `direct`, `team`, `auto-team`, `job-review`
- teamId
- orchestrator userId
- participant list
- view mode
- summary mode
- activity visibility level

### 5.5 Run / Work Session

Fields:

- run id
- room id
- task brief
- status
- active agents
- artifacts
- approvals
- cost and token usage
- stop reason

### 5.6 Team Member Binding

The team roster should support more than one member kind while still presenting a unified team view in the UI.

Supported member kinds:

- `persona`
- `human`
- `external_connector`

Required rule:

- all three kinds may appear in the same team roster
- only `persona` members resolve to persona identity/tone/prompt configuration
- `human` members participate in approval, intervention, and review workflows
- `external_connector` members represent external execution systems such as OpenClaw, Manus, ComfyUI, n8n, or future MCP-backed services
- the room UI should present all roster members uniformly while the runtime keeps their trust, capability, and execution semantics distinct

### 5.7 Routine Definition

Routine work must be first-class rather than encoded only as free-form schedule text.

Fields:

- id
- teamId
- name
- description
- schedule
- trigger source
- target blueprint or workflow
- work item template
- required capabilities
- review requirements
- approval policy
- fallback policy
- success criteria
- createdAt
- updatedAt

Required rule:

- routines do not directly wake a producer member by default
- routines wake the orchestrator or the team intake pipeline, which then creates work items and dispatches work through the team loop

### 5.8 Work Item

The orchestrator system requires a durable operational object that represents real work.

Fields:

- id
- teamId
- roomId
- runId
- sourceType
- sourceRef
- title
- objective
- status
- priority
- assignedMemberId
- reviewerMemberId
- approverMemberId
- riskClass
- dueAt
- artifactRefs
- approvalState
- summary
- createdAt
- updatedAt

Recommended baseline statuses:

- `planned`
- `triaged`
- `researching`
- `drafting`
- `in_review`
- `needs_revision`
- `awaiting_approval`
- `scheduled_for_delivery`
- `completed`
- `failed`
- `blocked`

### 5.9 External Connector

An external connector is a durable integration record that allows an outside system to act like a team member without being modeled as a persona.

Fields:

- id
- tenantId
- name
- connectorType
- authConfig
- endpointConfig
- capabilityTags
- healthStatus
- defaultTimeoutSec
- retryPolicyJson
- approvalPolicyJson
- callbackConfig
- createdAt
- updatedAt

## 6. Persona Architecture

### 6.1 Persona Hierarchy

The platform should support persona at multiple layers:

- `user persona`
- `assistant persona`
- `team style overlay`

Effective behavior for one assistant is:

`assistant persona + team conventions + task instructions + active memory context`

### 6.2 Why User Persona Matters

The user should also have a persona because it helps the system decide:

- what team to recommend
- what default communication style to use
- what summaries are most useful
- what execution surfaces are likely relevant

Example:

- a lawyer-user may want formal summaries and higher compliance checks
- a marketer-user may want a campaign team and fast brainstorm mode
- a founder-user may want summary-first output and action items

### 6.3 Assistant Persona Requirements

Each assistant persona must support:

- natural name
- role identity
- domain expertise
- tone and style
- behavioral rules
- restrictions
- memory behavior
- interaction style with other assistants

### 6.4 Team Persona Overlay

Teams should also have a shared behavioral layer, such as:

- this team is conservative and review-heavy
- this team is fast and iterative
- this team always produces:
  - summary
  - action list
  - artifact references

### 6.5 Current Persona Foundation That Must Be Preserved

The spec should explicitly build on the persona work that already exists in SmartSpec.

Current implemented capabilities include:

- reusable persona records with user, tenant, and platform scope
- quick-start persona templates across multiple professions
- template provenance tracking
- mixed-template personas for multi-role users
- assistant nickname and gender-style support

This means the new team/orchestrator system must treat the existing persona layer as a real foundation, not as a placeholder.

### 6.6 Persona Template Coverage Requirements

The persona system must continue supporting profession-oriented templates that reduce blank-page setup for users.

Current template direction already covers broad categories such as:

- legal
- engineering
- research
- analytics
- support
- creative
- marketing
- sales
- product
- operations
- HR
- finance
- education
- healthcare
- design
- commerce
- real estate

The team/orchestrator spec should preserve and extend this idea rather than replacing it with generic assistant presets only.

### 6.7 Multi-Role Persona Requirements

Many users have more than one professional identity or combine work and hobby roles.

The persona system should therefore support:

- single-role personas
- mixed personas from several templates
- user personas that influence team recommendations
- assistant personas that can also start from mixed templates when appropriate

Current compatibility rule:

- mixed-template persona creation must remain a first-class path
- the team builder should be able to bind either:
  - a single-template persona
  - a mixed-template persona
  - or a newly created inline mixed persona

### 6.8 Persona Provenance And Analytics

The spec should preserve persona provenance fields such as:

- source template ids
- source template labels
- source template categories

This is required for:

- understanding what kind of work the user likely does
- understanding how teams are composed
- recommending better team/persona presets later
- avoiding loss of context when a persona is reused inside a team

### 6.9 User Persona And Assistant Persona Should Share The Same Foundation

The user persona and assistant persona systems should not drift into separate incompatible models.

Preferred rule:

- both user personas and assistant personas are built from the same canonical persona definition model
- assistant profiles add execution/runtime policy on top
- user orchestrator profiles add recommendation and UX policy on top

### 6.10 Persona Acceptance Criteria For The New System

The persona layer is sufficiently covered only if:

1. existing profession templates remain reusable
2. mixed-template personas remain supported
3. template provenance remains visible and queryable
4. nickname and gender style continue working for assistant identities
5. both user personas and assistant personas can be created from the same template foundation
6. team builder can reuse existing personas without forcing duplicate creation

## 7. Memory Architecture

### 7.1 Problem Statement

Existing project-scoped or user-scoped memory is not enough.

A multi-assistant office requires memories that do not bleed across:

- different users
- different assistants
- different teams
- different rooms
- different runs

### 7.2 Required Memory Scopes

#### User Memory

Applies to the user regardless of team.

Examples:

- language preference
- preferred summary format
- stable goals
- recurring business context

#### Agent Memory

Private memory for one virtual assistant.

Examples:

- how this assistant should reason
- its own checklists
- recurrent issues it tracks
- its own past discoveries
- role-specific rules and heuristics

Non-negotiable rule:

- agent memory belongs to exactly one assistant member
- one assistant must not read another assistant’s private memory by default
- sharing between assistants happens only through team memory, room memory, or explicit promotion

#### Team Memory

Shared memory for the entire assistant team.

Examples:

- common glossary
- working agreements
- decision log
- standing assumptions
- shared policies

#### Room Memory

Shared memory for one team chat room.

Examples:

- current brief
- decisions made in this room
- task state
- latest draft references
- unresolved questions

#### Project Memory

Cross-room memory about a project or workspace.

Examples:

- tech stack
- business constraints
- project facts
- deadlines

#### Run / Task Memory

Temporary execution memory for one autonomous session or job.

Examples:

- which agent has done what
- current hypotheses
- intermediate notes
- incomplete handoffs

### 7.3 Memory Ownership Model

Memory should support:

- `owner_type`: `user | agent | team | room | project | run`
- `owner_id`
- `memory_kind`: `fact | rule | preference | decision | note | checklist | artifact_note | handoff_note | episode`
- `visibility`: `private | shared_team | shared_room | shared_project`
- `source_agent_id`
- `confidence`
- `importance`
- `expires_at`

### 7.4 Retrieval Order

When an assistant responds, the default retrieval order should be:

1. agent private memory
2. run/task memory
3. room memory
4. team memory
5. project memory
6. user memory

This avoids contaminating every prompt with global context.

### 7.5 Memory Promotion Rules

Assistants should not automatically publish all private notes to shared memory.

Rules:

- assistants can write private agent memory
- assistants can suggest promotion to room/team memory
- lead agent or orchestrator may approve promotion for important items
- sensitive memory can remain private even within the team

### 7.6 Memory Lifecycle

Memory types should differ by durability:

- private heuristics: long-lived
- room task state: medium-lived
- run scratch notes: short-lived with TTL
- decisions and policies: persistent

## 8. Chat And Conversation Model

### 8.1 New Chat Types

The product must support:

- `New Chat`
- `New Team Chat`
- `New Automatic Team Chat`

### 8.2 New Team Chat

Behavior:

- user selects or creates a team
- team members appear as participants
- user can type to all or to specific members
- assistants can respond individually or as a coordinated group

### 8.3 New Automatic Team Chat

Behavior:

- user gives the objective, constraints, and stop condition
- assistants discuss internally
- orchestrator chooses one of:
  - full transcript
  - milestones
  - summary only

### 8.4 Message Model

Messages should support:

- sender type: `user | agent | system`
- sender id
- recipient type: `all | user | agent | subgroup`
- message type: `work_update | critique | suggestion | revision | approval | decision | summary`
- visibility level
- artifact refs
- memory refs
- citation refs, including RAG/library references when applicable
- work item id
- reply-to message id
- reasoning/public note distinction
- turn type: `discussion | handoff | review | decision | execution_update | summary`

### 8.5 Visibility Modes

The orchestrator should control discussion visibility:

- `transparent`: show all assistant discussion
- `milestone`: show only important exchanges and decisions
- `summary`: show final synthesis and attached artifacts

### 8.6 Room-First Work Trace

The team room is the canonical shared workspace for the team.

Non-negotiable collaboration rules:

- every meaningful work step performed by a persona must be posted into the room
- draft artifacts, research findings, RAG/library links, review comments, revision attempts, and completion proposals must all appear in the room timeline
- other personas must be able to comment on, challenge, or extend that work inside the same room
- the real user must be able to inspect the full chain of “proposal -> critique -> revision -> approval/decision”
- private scratch memory may still exist, but it does not replace room posting for work that changes team-visible state or output
- when the underlying output is sensitive, the room should show a sanitized summary plus references rather than raw secret-bearing payloads

Example room thread shape:

1. agent A posts research findings and article draft with cited references
2. agent B replies with creative direction or a proposed visual idea
3. agent C replies with editorial or conversion-oriented critique
4. agent A posts a revised draft
5. reviewers react or approve
6. orchestrator posts the final decision and next action

## 9. Brainstorm Migration

### 9.1 Current Limitation

Current brainstorm is a fixed pattern:

- model A
- model B
- summary

It is useful, but too narrow.

### 9.2 Target State

Brainstorm should become a team discussion preset.

Examples:

- `Debate Pair`
- `Research Trio`
- `Strategy + Critic + Synthesizer`
- `Planner + Specialist + Reviewer`

### 9.3 Migration Rule

Do not keep “brainstorm” as a separate product concept forever.

Instead:

- preserve the UX entry point if helpful
- route it internally to a team discussion template
- support richer roles, memory, and artifacts

### 9.4 Backward Compatibility

Legacy brainstorm users may still see:

- partner model
- max rounds

But internally these become:

- team composition
- round or stop policy
- summary policy

## 10. Orchestrator UX

### 10.1 Orchestrator Controls

The orchestrator should be able to set:

- team selection
- task brief
- constraints
- expected outputs
- autonomy level
- budget and time cap
- approval requirements
- visibility mode

### 10.2 Orchestrator Views

The orchestrator can switch between:

- `Conversation`
- `Activity`
- `Artifacts`
- `Memories`
- `Approvals`
- `Summary`

### 10.3 Team Member Presentation

Each virtual member should visibly show:

- name
- role
- persona tag
- current status
- current assignment

This is important for trust and inspectability.

### 10.4 Daily Operations Board

The orchestrator workspace should include a daily operations view that answers, at a glance:

- what routines were due today
- what work is still open from yesterday
- what succeeded yesterday
- what failed yesterday
- what alerts or approvals are still waiting
- which member is currently blocked or overloaded
- what the orchestrator plans to do next

The board should support both:

- `operator view`
  - designed for the user or admin
- `orchestrator summary view`
  - the AI-produced morning brief and end-of-day recap

This turns the system from “multi-agent chat” into a durable office operating surface.

## 11. Team Templates

### 11.1 Template Types

SmartSpec should support:

- single assistant templates
- team templates
- auto-discussion templates

### 11.2 Example Team Templates

- Executive Office
- Product Squad
- Research Desk
- Marketing Studio
- Legal Review Cell
- Video Production Cell
- Presentation Factory
- Customer Operations Desk

### 11.3 Mixed Teams

Users should be able to compose mixed teams from several template categories.

Examples:

- product + marketing
- legal + operations
- research + writer + designer

### 11.4 Team Blueprint Contract

Preset teams must be richer than a member list.

Every preset blueprint should package:

- team purpose
- recommended roster size
- member definitions
- member kinds
- lead/orchestrator default
- handoff order
- review loop
- approval gate defaults
- routine seeds
- sample prompts/objectives
- artifact expectations
- escalation rules

This allows a user to load a functioning office pattern in one action rather than assembling five uncoordinated personas manually.

### 11.5 Default Blueprint Examples

The first system blueprints should include at least:

- `Daily Content Desk`
  - orchestrator, news researcher, writer, visual producer, reviewer/publisher
- `Quote And Proposal Desk`
  - orchestrator, requirement analyst, pricing specialist, proposal writer, reviewer/approver
- `Research And Insight Desk`
  - orchestrator, researcher, data analyst, writer, reviewer
- `Operations Watch Desk`
  - orchestrator, alert investigator, analyst, remediation planner, human escalation liaison
- `Presentation Studio`
  - orchestrator, brief analyst, slide writer, visual producer, reviewer

### 11.6 Template Acceptance Rule

A preset is not complete unless it teaches the user how team coordination works.

Minimum blueprint standard:

- at least one producer role
- at least one independent reviewer role
- a clearly defined orchestrator
- a visible handoff path
- a visible approval path
- a visible summary/output format

## 12. Execution And Automation

### 12.1 Cross-Surface Execution

Assistants should be able to initiate or continue work across:

- workflow creation and execution
- presentation generation and editing
- video editing jobs
- browser-driven tasks
- agency jobs
- scheduled recurring jobs

### 12.2 Required Contract

Any agent-triggered automation should emit:

- what was requested
- why it was selected
- what artifacts were produced
- what requires approval
- what follow-up is still pending

### 12.3 Future Direction

In the future, each assistant may continue work proactively, but only under explicit guardrails:

- approved destinations
- cost ceilings
- tool allowlists
- maximum autonomous rounds
- user-visible audit trail

### 12.4 Routine Execution Model

Daily work should be initiated by routines, inbox tasks, or user requests, but all of them should converge into the same operational path:

1. intake
2. triage
3. work item creation
4. delegation
5. review
6. approval
7. delivery or publication
8. summary and carry-over

Default rule:

- schedules wake the orchestrator or intake pipeline
- schedules do not bypass the team loop for medium-risk or high-risk work

### 12.5 Quality Loop Requirement

The purpose of multi-persona teams is not only parallelism. It is quality improvement through structured re-checking.

Required quality loop behaviors:

- one member may research or draft
- a different member should review or challenge the work
- each meaningful update should be posted to the team room so peers can react in context
- peers may add suggestions, critiques, alternative creative directions, or approval comments directly on that room thread
- rejected work should return to revision rather than silently fail
- important artifacts should not be marked complete until they pass their review gate
- the end-of-day summary should record what failed, what was revised, and what still needs attention

Default loop for content-like work:

- orchestrator -> researcher -> producer -> reviewer -> approver/publisher -> orchestrator summary

### 12.6 External Connector Members

The runtime should support connector-backed members that can receive work from the orchestrator when the platform itself cannot complete the task.

Examples:

- OpenClaw for external agent task execution
- Manus for browser or tool-driven external workflows
- ComfyUI for image generation/render pipelines
- n8n for workflow/action delivery

Required rule:

- external connector members appear in the team roster
- they are not modeled as personas
- routing to them is capability-based and policy-checked
- all handoffs and callbacks must be auditable in the room/run timeline

### 12.7 Unsupported-Action Escalation Rule

If the orchestrator determines that the desired action is not yet supported natively, the runtime should:

1. search for an eligible external connector member with the required capability
2. evaluate approval and trust policy
3. create an auditable handoff
4. wait for callback/result/timeout
5. continue the review loop inside the team after the external result returns

## 13. Governance And Safety

### 13.1 Existing Strengths To Preserve

The current agency system already provides important guardrails:

- tenancy boundaries
- RBAC
- allowlists
- loop prevention
- depth limits
- budget caps
- concurrency caps

These must remain foundational for the new system.

### 13.2 New Guardrails Needed

- memory visibility boundaries
- assistant-to-assistant disclosure rules
- approval requirements for automation side effects
- redaction policies for summaries
- autonomous room stop conditions

### 13.3 Approval Tiers

Suggested risk tiers:

- low: drafting, analysis, internal discussion
- medium: workflow creation, draft content generation, scheduled jobs in draft mode
- high: publishing, external communication, account actions, destructive edits

### 13.4 Connector And External Source Safety

External systems should never be treated as implicitly trusted just because they are visible in the team roster.

Required guardrails:

- connector capabilities must be explicitly declared
- approvals may be required before dispatch, before side effects, or before delivery
- connector health and auth validity must be monitored
- callbacks must be authenticated and bound to the original handoff
- unsupported or degraded connectors must not be silently selected

Required callback security controls:

- every outbound connector dispatch must carry an idempotency key
- every callback must include a signed body hash plus timestamp
- every callback must be validated against an allowed clock skew window
- callback tokens/nonces must be one-time or short-lived
- replayed callbacks must be rejected and audit-logged
- callback payloads must bind to the original `handoffId`, `workItemId`, `teamId`, and `runId`

### 13.5 Room Posting Redaction And Data Minimization

Room-first traceability must not become a mechanism for leaking raw secrets, personal data, or oversized tool dumps.

Required rules:

- room posts should default to sanitized summaries plus references, not raw internal tool payloads
- citations may point to underlying RAG/library sources, but secrets, credentials, and private connector payloads must be redacted
- attachments and tool outputs must respect per-room and per-team visibility policy
- personally identifiable data should be masked or minimized unless the room policy explicitly allows the full content
- the system should preserve the audit trail that a tool was used, without requiring the raw sensitive payload to be shown in the room timeline
- summarization/redaction policy must be configurable per team and overridable per work item risk class

## 14. Observability And Agent Monitoring

### 14.1 Why Monitoring Is Critical

When multiple AI assistants work autonomously, the user must be able to:

- see what each assistant is doing **right now**
- understand **who did what** after a run completes
- catch **stuck, looping, or misbehaving** assistants early
- track **cost and token consumption** per assistant
- review **decision quality** per assistant over time
- intervene, pause, or redirect any assistant mid-run

Without a monitoring layer, the “virtual office” becomes a black box that users cannot trust.

### 14.2 Agent Status Model

Each assistant in an active run must expose a real-time status:

```
idle → activated → thinking → responding → tool_calling → waiting_approval → handing_off → idle
                                                                                    ↑
                                                                             error ──┘
```

Required status fields per assistant:

- `currentStatus`: enum of states above
- `currentTaskSummary`: one-line human-readable description of what the assistant is doing
- `activeSince`: timestamp when the assistant became active in this turn
- `turnCount`: number of turns this assistant has taken in the current run
- `lastMessagePreview`: truncated preview of the assistant's last output
- `lastToolCall`: name and status of the most recent tool invocation
- `tokenUsage`: cumulative input/output tokens for this run
- `costEstimate`: estimated cost in credits for this assistant's work so far
- `errorState`: null or error summary if the assistant encountered a problem

### 14.3 Monitoring Surfaces

#### 14.3.1 Live Run Monitor (Primary)

Available when a run is active. Shows real-time agent activity.

Layout:

```
┌──────────────────────────────────────────────────────────┐
│ Run: “Analyze competitor pricing”          ▶ Running  ⏸ │
│ Team: Research Desk    Budget: 120/300 credits           │
├──────────┬───────────────────────────────────────────────┤
│ Agents   │  Activity Timeline                            │
│          │                                               │
│ ● Nong   │  10:01  [Nong] Searching market data...       │
│   Jen    │  10:02  [Nong] Found 3 competitor reports     │
│  active  │  10:02  [Nong] → Handoff to Mina              │
│  12 tok  │  10:03  [Mina] Analyzing pricing structure... │
│          │  10:03  [Mina] 🔧 spreadsheet_tool (running)  │
│ ○ Mina   │  10:04  [Mina] Tool completed (2.1s)          │
│  thinking│  10:04  [Mina] Drafting comparison table...    │
│  85 tok  │                                               │
│          │                                               │
│ ○ Arun   │                                               │
│  idle    │                                               │
│  0 tok   │                                               │
├──────────┴───────────────────────────────────────────────┤
│ [⏸ Pause] [⏹ Stop] [💬 Intervene] [📊 Cost Detail]      │
└──────────────────────────────────────────────────────────┘
```

Required elements:

- **Agent roster panel**: shows all team members with live status indicators
- **Activity timeline**: chronological stream of events with agent attribution
- **Run controls**: pause, stop, intervene (inject a user message mid-run)
- **Budget indicator**: credit consumption vs cap with progress bar
- **Duration indicator**: elapsed time vs time cap if set

#### 14.3.2 Agent Detail Popover

Clicking an agent in the roster expands a detail view:

- agent name, role, persona summary
- current task description
- turn-by-turn history for this run (this agent's messages only)
- tools used with success/failure counts
- tokens consumed (input vs output breakdown)
- memories read and written
- artifacts created
- handoffs sent and received
- error log if any

#### 14.3.3 Run History Browser

After a run completes, users need a structured review interface:

- list of all runs per room, sorted by recency
- each run shows: objective, participants, duration, total cost, status, artifact count
- drill-down into any run shows the full activity timeline with agent attribution
- filter timeline by: agent, event type, visibility level
- export run transcript as markdown or JSON

#### 14.3.4 Orchestrator Dashboard Monitoring Tab

The orchestrator dashboard (Section 10.2) should include a dedicated monitoring tab:

- **Active Runs**: all currently running team sessions across all teams
- **Agent Utilization**: which assistants are active, idle, or errored
- **Pending Approvals**: approval requests waiting for user action with aging indicator
- **Recent Completions**: last N completed runs with outcome summary
- **Cost Overview**: credit consumption by team, by agent, by time period
- **Alerts**: stuck runs (no progress for N seconds), budget threshold warnings, repeated errors

#### 14.3.5 Per-Agent Performance Card

Each assistant profile should have a historical performance view accessible from team settings:

- total runs participated
- average turns per run
- average tokens per run
- average cost per run
- tool usage frequency and success rate
- common handoff patterns (who does this agent hand off to most?)
- error rate
- user satisfaction signals (if collected)

### 14.4 Monitoring Data Model

#### 14.4.1 Agent Activity Events (append-only)

Every meaningful agent action should be recorded as an immutable event:

- `eventId`
- `tenantId`
- `teamId`
- `roomId`
- `runId`
- `assistantId`
- `eventType` (see Section 14.5)
- `eventCategory`: `status_change | communication | tool_use | memory_op | artifact_op | handoff | approval | error`
- `visibility`: `transparent | milestone | summary_only | private_internal`
- `summary`: human-readable one-line description
- `detailJson`: structured payload per event type
- `tokenUsageSnapshot`: cumulative tokens at time of event
- `costSnapshot`: cumulative cost at time of event
- `durationMs`: time since previous event from this agent
- `createdAt`

#### 14.4.2 Run Snapshots (periodic)

During active runs, the system should capture periodic snapshots:

- `snapshotId`
- `runId`
- `capturedAt`
- `activeAssistantId`
- `agentStatusesJson`: status of every agent at snapshot time
- `tokenUsageJson`: per-agent token totals
- `costJson`: per-agent cost totals
- `artifactCountJson`: per-agent artifact counts
- `pendingApprovalsCount`

These snapshots enable:

- historical replay of run progress
- performance debugging
- billing accuracy verification

#### 14.4.3 Agent Run Summary (computed on run completion)

When a run ends, compute and store per-agent summaries:

- `runId`
- `assistantId`
- `turnCount`
- `totalInputTokens`
- `totalOutputTokens`
- `totalCostCredits`
- `toolCallCount`
- `toolSuccessCount`
- `toolFailureCount`
- `memoriesRead`
- `memoriesWritten`
- `memoriesPromoted`
- `artifactsCreated`
- `handoffsSent`
- `handoffsReceived`
- `errorCount`
- `activeDurationMs`
- `waitDurationMs`

### 14.5 Monitoring Event Types

Extend the event taxonomy from Section 18.3 with monitoring-specific events:

#### Status Events

- `agent_status_changed`: agent transitions between states (idle → thinking → responding etc.)
- `agent_task_assigned`: agent receives a specific sub-task from lead or orchestrator
- `agent_task_completed`: agent finishes its assigned sub-task

#### Health Events

- `agent_error`: agent encountered an error (with error category and message)
- `agent_retry`: agent is retrying after a transient failure
- `agent_stuck_detected`: system detected no progress from an agent for N seconds
- `agent_loop_detected`: system detected repetitive behavior from an agent
- `agent_budget_warning`: agent approaching individual or run budget cap
- `agent_budget_exceeded`: agent hit budget cap and was stopped

#### Performance Events

- `agent_turn_completed`: agent finished one full turn (with token count and duration)
- `agent_slow_response`: agent response time exceeded threshold
- `run_milestone_reached`: significant progress point (configurable by team policy)

### 14.6 Alerting And Notifications

#### 14.6.1 In-App Notifications

The orchestrator should receive real-time notifications for:

| Event | Default Behavior | Configurable? |
|-------|-----------------|---------------|
| Approval required | Always notify | No |
| Run completed | Always notify | Yes |
| Run failed | Always notify | No |
| Agent error | Notify if repeated | Yes |
| Agent stuck | Notify after threshold | Yes (threshold) |
| Budget 80% reached | Always notify | Yes (threshold) |
| Budget exceeded | Always notify, auto-pause run | No |
| Artifact ready | Notify | Yes |
| External task received | Notify | Yes |

#### 14.6.2 Notification Delivery

Near-term:

- in-app notification badge and dropdown
- SSE push for real-time delivery to open browser tabs

Future:

- email digest for completed runs
- webhook callbacks for external integrations

#### 14.6.3 Notification Preferences

Users should configure:

- which event types trigger notifications
- whether to receive notifications for all teams or specific teams
- quiet hours (suppress non-critical notifications)
- summary mode (batch notifications into periodic digests)

### 14.7 Intervention Controls

The orchestrator must be able to intervene in a running session:

#### 14.7.1 Pause Run

- pauses all agent activity
- preserves current state
- shows what each agent was doing when paused
- allows resume from exact pause point

#### 14.7.2 Stop Run

- terminates the run
- generates a partial summary of work completed so far
- preserves all artifacts created up to that point
- records stop reason

#### 14.7.3 Redirect Agent

- send a message to a specific agent mid-run
- change the agent's current task
- ask the agent to reconsider its approach
- force a handoff to a different agent

#### 14.7.4 Mute/Unmute Agent

- temporarily exclude an agent from the discussion
- useful when an agent is producing low-quality output
- muted agent's assigned work redistributes to lead or next agent

#### 14.7.5 Adjust Budget Mid-Run

- increase or decrease the remaining budget cap
- useful when a run is proving more or less valuable than expected

### 14.8 Tracing And Debugging

For developers and advanced users:

- full trace view showing every LLM call, tool invocation, and memory operation
- trace filtering by agent, event type, time range
- trace export as JSONL for external analysis
- correlation IDs linking team events to underlying agency runtime events
- link from any team event to the corresponding `provider_usage_log` entry

### 14.9 Monitoring Acceptance Criteria

The monitoring system is sufficiently specified when implementation can answer:

1. how the user sees what each agent is doing during an active run
2. how the user knows which agent contributed what to the final output
3. how the user detects a stuck, looping, or errored agent
4. how the user intervenes (pause, stop, redirect) in a running session
5. how the user reviews per-agent cost and token consumption
6. how the user compares agent performance across multiple runs
7. how the system alerts the user to problems without requiring constant watching
8. how completed runs are reviewable with full agent-level attribution
9. how run monitoring integrates with the existing audit log infrastructure
10. how external intake tasks show monitoring data alongside internally initiated runs

## 14A. Prompt Composition And Context Assembly

### 14A.1 Problem Statement

Section 7 defines memory retrieval order and Section 6 defines persona layers. But neither section specifies how the actual LLM prompt is assembled when an agent takes its turn.

Without this specification, implementers must guess how to combine persona, memory, task context, and conversation history into a prompt. Different guesses lead to inconsistent agent behavior.

### 14A.2 Prompt Assembly Order

When an assistant takes a turn, the prompt should be composed in this order:

```
1. System message
   ├── assistant persona (name, role, expertise, tone, restrictions)
   ├── team persona overlay (team conventions, output format rules)
   ├── current task instructions (run objective, constraints, deadline)
   └── behavioral rules (approval requirements, tool allowlists, memory write permissions)

2. Memory context block (retrieved in Section 7.4 order)
   ├── agent private memory (top-K relevant)
   ├── run/task memory (current run state, prior agent notes)
   ├── room memory (task state, decisions, draft references)
   ├── team memory (glossary, agreements, policies)
   ├── project memory (business context, deadlines)
   └── user memory (preferences, goals, language)

3. Conversation history
   ├── room messages visible to this agent (filtered by visibility)
   ├── truncated to context window budget
   └── most recent N turns prioritized

4. Current turn input
   ├── user message or handoff message from another agent
   ├── tool results from prior tool calls in this turn
   └── orchestrator intervention message (if any)
```

### 14A.3 Context Window Budget

Each section of the prompt should have a configurable token budget:

| Section | Default Budget | Notes |
|---------|---------------|-------|
| System message (persona + task) | 2000 tokens | Relatively stable per run |
| Memory context | 3000 tokens | Top-K retrieval with relevance scoring |
| Conversation history | Remaining budget | Most compressible section |
| Current turn input | Uncapped | Actual user/agent message |

Total budget should respect the selected model's context window minus a reserve for output.

### 14A.4 Memory Retrieval Strategy

For each turn:

1. Retrieve top-K memories from each scope using the current conversation context as the query
2. Deduplicate across scopes (same fact in agent and team memory → prefer agent version)
3. Score by: relevance × importance × recency
4. Truncate to budget
5. Format as structured context block (not raw dump)

### 14A.5 Conversation History Compression

When conversation history exceeds budget:

1. Keep all messages from the current run
2. Summarize earlier turns into a condensed form
3. Always preserve: handoff messages, decision messages, approval messages
4. Prefer sanitized `summaryContent` over raw tool payloads when a room message is marked redacted
5. Preserve thread structure for the active work item so critique and revision context is not lost
4. Drop: internal reasoning that has already been summarized

### 14A.6 Tool And Permission Injection

Each agent's prompt should include:

- list of available tools (from `toolPolicyJson`)
- which tools require approval before execution
- which automation destinations are allowed
- current budget remaining
- any muted/excluded agents (so the agent doesn't try to hand off to them)

## 14B. Stop Policy Specification

### 14B.1 Problem Statement

Sections 8.3 and 12.3 mention stop conditions and maximum rounds, but the spec never defines the formal stop policy model that controls when an autonomous run ends.

### 14B.2 Stop Policy Model

Every autonomous run must have a stop policy:

```ts
type StopPolicy = {
  maxRounds: number;              // maximum total agent turns (default: 20)
  maxDurationMinutes: number;     // wall-clock time limit (default: 30)
  maxBudgetCredits: number;       // credit cap (required)
  stopOnConsensus: boolean;       // stop if agents agree on conclusion
  stopOnArtifactReady: boolean;   // stop when target artifact is produced
  stopOnLeadSummary: boolean;     // stop when lead agent emits summary
  requireFinalSummary: boolean;   // force summary generation before stop
  idleTimeoutSeconds: number;     // stop if no agent produces output for N seconds
};
```

### 14B.3 Stop Evaluation

After each agent turn, the system evaluates:

1. Has `maxRounds` been reached? → stop
2. Has `maxDurationMinutes` elapsed? → stop
3. Has `maxBudgetCredits` been exceeded? → stop (hard limit)
4. Has `idleTimeoutSeconds` passed with no output? → stop
5. Did the lead agent emit a `summary` turn type and `stopOnLeadSummary` is true? → stop
6. Did agents reach consensus and `stopOnConsensus` is true? → stop
7. Was a target artifact produced and `stopOnArtifactReady` is true? → stop

If stopped by any condition:
- If `requireFinalSummary` is true and no summary exists, generate one
- Emit `run_completed` with stop reason
- Compute and store `agent_run_summaries`

### 14B.4 Graceful Stop vs Hard Stop

- **Graceful stop**: current agent finishes its turn, then the run stops
- **Hard stop**: run terminates immediately (used for budget exceeded or user-initiated stop)

Default: graceful stop for all conditions except budget exceeded.

## 14C. Agent Turn Order And Communication Protocol

### 14C.1 Problem Statement

In autonomous mode, multiple agents need to take turns. The spec describes what agents can do (Section 8) but not how turn order is determined.

### 14C.2 Turn Order Strategies

The system should support multiple strategies, selectable per team or per run:

#### Round-Robin

- agents take turns in a fixed order
- simple, predictable, good for structured workflows
- example: Researcher → Analyst → Writer → Reviewer

#### Lead-Directed

- the lead agent decides who speaks next after each turn
- most flexible, allows dynamic task allocation
- lead agent's prompt includes a `next_speaker` directive
- if lead agent does not specify, default to round-robin

#### Handoff-Based

- each agent decides who to hand off to at the end of their turn
- natural for workflows where expertise determines flow
- system validates that handoff targets are valid team members
- loop detection: if agent A → B → A → B repeats 3+ times, escalate to lead or stop

#### Orchestrator-Directed

- the orchestrator (user) manually selects who speaks next
- highest control, lowest autonomy
- useful for review-heavy workflows

### 14C.3 Default Strategy

- Team Chat: Lead-Directed (if lead exists) or Round-Robin
- Automatic Team Chat: Lead-Directed
- User can override via run configuration

### 14C.4 Agent Communication Rules

When an agent speaks, it must declare:

- `recipientType`: `all | specific_agent | lead | orchestrator`
- `turnType`: `discussion | handoff | review | decision | execution_update | summary`
- `nextSpeakerHint` (optional): suggested next agent

The system enforces:

- muted agents cannot be selected as next speaker
- maximum consecutive turns by one agent: 3 (configurable, prevents monopolization)
- dead-letter rule: if suggested next speaker is unavailable, fall back to lead or round-robin

## 14D. Model Selection Per Agent

### 14D.1 Problem Statement

Section 4.4 mentions "choose models" but the domain model, schema, and API never specify where the LLM model choice lives for each agent.

### 14D.2 Model Selection Hierarchy

Model selection should follow this resolution order:

1. **Per-agent override** (set in assistant profile or at run time)
2. **Per-team default** (set in team configuration)
3. **Per-tenant default** (set in tenant settings)
4. **Platform default** (system-wide fallback)

### 14D.3 Schema Extension

Add to `assistant_profiles`:

- `preferredModelId`: optional model identifier (e.g., `claude-sonnet-4-5-20250514`)
- `modelSelectionPolicy`: `fixed | cost_optimized | quality_optimized | auto`

Add to `assistant_teams`:

- `defaultModelId`: team-wide default model
- `modelBudgetPolicy`: whether to allow expensive models or enforce cost tier limits

### 14D.4 Model Selection At Runtime

When an agent takes a turn:

1. Resolve model from hierarchy above
2. Check model availability (via existing provider health circuit breaker)
3. If unavailable, fall back to next tier
4. Log which model was actually used (in `agent_activity_events.detailJson`)

### 14D.5 Cost Implications

Different models have different costs. The monitoring system should:

- show which model each agent is using in the agent detail popover
- factor model choice into cost estimates
- allow budget policies to restrict expensive models (e.g., "no opus-class models for research agents")

## 14E. Summary Generation Strategy

### 14E.1 Problem Statement

Sections 8.5 and 10.2 reference summaries extensively (summary view, summary mode, summary artifacts) but never define how summaries are generated.

### 14E.2 Summary Types

| Type | When Generated | By Whom |
|------|---------------|---------|
| Turn summary | After each agent turn (for milestone mode) | System (using fast model) |
| Run progress summary | Periodically during long runs | Lead agent or system |
| Run completion summary | When run ends | Lead agent (preferred) or system |
| Room summary | On demand or when room goes idle | System |
| Handoff summary | When work transfers between agents | Sending agent |

### 14E.3 Summary Generation Methods

#### Agent-Generated Summary

- The lead agent (or designated summarizer) is prompted to produce a summary
- Best quality, most contextual
- Uses the agent's own persona voice
- Cost: one additional LLM call

#### System-Generated Summary

- A lightweight model call with the conversation history
- Uses a neutral summarizer prompt (no persona)
- Used as fallback or for turn-level summaries
- Cost: lower (uses fast model)

#### Extractive Summary

- No LLM call; simply extracts key messages by turn type
- Collects all `decision`, `summary`, and `execution_update` messages
- Cheapest, least fluent
- Good for activity log views

### 14E.4 Summary Content Structure

Every summary should include:

```ts
type RunSummary = {
  objective: string;
  participants: string[];
  keyDecisions: string[];
  keyFindings: string[];
  artifactsProduced: Array<{ type: string; title: string; id: string }>;
  openQuestions: string[];
  nextSteps: string[];
  totalCost: number;
  totalDuration: number;
};
```

### 14E.5 Summary Freshness

- Summaries should be marked with a `generatedAt` timestamp
- If the run continues after a summary was generated, the UI should show "summary may be outdated"
- Auto-refresh summary when the run reaches a new milestone or completes

## 14F. Concurrency And Conflict Resolution

### 14F.1 Problem Statement

Multiple agents may attempt to write to the same artifact, memory scope, or automation destination simultaneously. Without conflict resolution, data corruption or lost updates can occur.

### 14F.2 Write Conflict Rules

#### Artifacts

- Only one agent may edit a given artifact at a time
- If agent B tries to edit an artifact locked by agent A, agent B receives a "busy" response and should retry or skip
- Lock timeout: 60 seconds (auto-release if agent doesn't complete)
- Artifact revisions should be explicit: every new revision records `parentRevisionId`, `createdByMemberId`, and `supersedesArtifactId` when applicable

#### Shared Memory

- Multiple agents may write to shared memory (team/room) concurrently
- Writes are append-only for new memories (no conflict)
- Updates to existing memories: last-writer-wins with audit trail in `memory_promotions`
- If two agents write contradictory facts, the lead agent or orchestrator resolves

#### Automation Destinations

- Only one agent may trigger a given automation destination per run at a time
- Queue additional requests; second agent's request executes after the first completes
- Prevents duplicate workflow creation or conflicting presentation edits

#### Work Items And Room Threads

- Work items must use optimistic concurrency via a revision/version field
- A revision attempt that is based on a stale version must fail with a conflict response rather than silently overwrite
- Work-item discussions should preserve thread lineage through `threadRootMessageId` and `replyToMessageId`
- A final approval or rejection should resolve the active revision thread, not just mutate top-level status
- If multiple peers suggest changes at once, the orchestrator or assigned owner chooses the next active revision explicitly

### 14F.3 Turn Concurrency

In the current design, only one agent takes a turn at a time (sequential turns). This is the safest model.

Future enhancement: parallel turns where independent agents work simultaneously. This requires:

- per-agent artifact locks
- merge strategies for shared context
- clear handoff sequencing

This is explicitly out of scope for Phase 1-4 but the schema should not preclude it.

## 14G. Inter-Agent Communication Protocol

### 14G.1 Problem Statement

The Virtual AI Office has two distinct agent worlds that must communicate:

1. **Team agents** (user-facing) — assistants in team rooms doing user-initiated work
2. **System agents** (system-facing) — the Virtual Admin Agent (Spec 046) monitoring infrastructure 24/7

Without a communication protocol between these worlds:

- a system agent detects "LLM provider X is down" but team agents keep trying provider X and failing
- a system agent detects "credit exhausted for tenant" but running team sessions burn tokens with no budget enforcement
- team agents detect persistent tool failures but can't escalate to system-level diagnosis
- the orchestrator sees team monitoring and system monitoring as two disconnected dashboards

### 14G.2 Agent Classification

All agents in the platform belong to one of these categories:

| Category | Examples | Lifecycle | User Visibility |
|----------|----------|-----------|-----------------|
| **Team Agent** | Nong Jen (researcher), Mina (analyst), Arun (reviewer) | Created by user, persisted in `assistant_profiles` | Full visibility in team rooms |
| **System Agent** | System Guardian (Virtual Admin Agent) | Created at server startup, reserved user id | Visible in admin dashboard + optional team notifications |
| **Lead Agent** | Team lead assistant | Created by user, marked `isLead` | Full visibility, turn-order authority |
| **External Agent** | MCP client, webhook partner | Registered in `external_task_sources` | Visible in inbox, author attribution |

### 14G.3 Communication Channels

#### Channel 1: System-to-Team Broadcast

System agents can send messages to team rooms without being a team member.

Use cases:

- "LLM provider X is degraded — your requests may be slower"
- "Credit balance for your tenant is below 100 — run budget enforcement active"
- "Celery worker recovered — your queued media tasks are now processing"
- "Emergency maintenance in 30 minutes — active runs will be paused"

Delivery:

- system message injected into the room's activity timeline
- visibility: `milestone` (user sees it, but it doesn't interrupt agent turns)
- sender: `senderType: "system"`, `senderSystemAgentId: "system-guardian"`

#### Channel 2: System-to-Run Control

System agents can control active runs based on infrastructure state.

Use cases:

- provider down → pause all runs using that provider
- credit exhausted → hard-stop all runs for that tenant
- worker recovered → auto-resume paused runs
- maintenance window → graceful-stop all active runs

Actions:

- `system_pause_run` — same as orchestrator pause but triggered by system agent
- `system_stop_run` — same as orchestrator stop with system-generated stop reason
- `system_resume_run` — resume runs that were system-paused
- `system_adjust_budget` — reduce budget caps based on remaining tenant credits

These actions MUST:

- be logged in `agent_activity_events` with `actorType: "system"`
- generate orchestrator notifications
- be visible in the run's activity timeline
- respect the run's existing approval policies (system cannot bypass high-risk approvals)

#### Channel 3: Team-to-System Escalation

Team agents can escalate issues to the system layer.

Use cases:

- agent encounters repeated tool failures → escalate to system diagnosis
- agent detects unusual latency → report to system monitoring
- lead agent identifies a pattern of errors across multiple tools → request system analysis

Delivery:

- team agent emits an `escalation_request` event
- system agent's sensor picks it up and creates an incident
- system agent's diagnosis result is sent back to the team room as a system message

#### Channel 4: System-to-Orchestrator Direct

System agents can send notifications directly to the orchestrator user.

Use cases:

- "3 of your active runs are affected by provider degradation — pausing recommended"
- "Auto-fix applied: retried 5 failed media tasks for your team"
- "Approval needed: System Guardian wants to restart Celery worker"

Delivery:

- notification via `orchestrator_notifications` table
- appears in the orchestrator dashboard's alert section
- optional: appears as a system message in the active room

#### Channel 5: Cross-Team System Context

System agents can inject shared context that all team agents read.

Use cases:

- "Provider X is currently unavailable" → all agents' prompt assembly skips provider X
- "Platform is in maintenance mode" → all agents' prompts include a caution instruction
- "New global policy: no external API calls until further notice" → injected as a temporary system rule

Delivery:

- stored in `scoped_memories` with `ownerType: "system"`, `visibility: "shared_project"`
- included in every agent's prompt via memory retrieval (Section 14A)
- auto-expired when system condition clears

### 14G.4 Message Protocol

All inter-agent messages use a common envelope:

```ts
type InterAgentMessage = {
  messageId: string;
  channel: "system_broadcast" | "system_control" | "team_escalation" | "system_direct" | "system_context";
  sourceAgentType: "team" | "system" | "external";
  sourceAgentId: string;
  targetType: "room" | "run" | "team" | "user" | "all_active_runs";
  targetId: string;
  priority: "low" | "normal" | "high" | "critical";
  messageType: string;          // e.g., "provider_degraded", "credit_warning", "escalation_request"
  payload: Record<string, any>; // structured data per message type
  displayMessage: string;       // human-readable summary for UI
  actionRequired: boolean;      // whether recipient must act
  expiresAt?: string;           // auto-dismiss after this time
  relatedIncidentId?: number;   // link to virtual_admin_incidents
  relatedRunId?: string;        // link to team_runs
  createdAt: string;
};
```

### 14G.5 System Event → Team Impact Mapping

When the Virtual Admin Agent detects an incident, the orchestrator system must determine the impact on active team runs:

| System Incident | Impact Assessment | Automatic Action |
|---|---|---|
| `llm_provider_down` | Which runs use this provider? | Inject provider switch context, notify orchestrator |
| `all_providers_down` | All LLM-dependent runs | Hard-pause all active runs, critical notification |
| `credit_exhausted` | All runs for this tenant | Hard-stop all runs, notify with cost summary |
| `credit_low` | All runs for this tenant | Inject budget warning into runs, reduce autonomy level |
| `celery_worker_down` | Runs with pending media tasks | Notify orchestrator, queue retry when worker recovers |
| `queue_depth_critical` | All runs creating new tasks | Throttle new task creation, notify |
| `error_rate_spike` | Runs experiencing errors | Inject caution context, suggest pause |
| `disk_95_percent` | Runs producing artifacts | Pause artifact creation, notify |
| `db_pool_exhausted` | All runs | Emergency pause all, critical notification |
| `emergency_maintenance` | All runs | Graceful-stop all runs, generate partial summaries |

### 14G.6 Impact Assessment Engine

When a system incident is created, the impact engine runs:

```
1. Load all active team_runs
2. For each run, evaluate:
   - Does this run use the affected resource? (provider, queue, storage)
   - What is the run's current status? (running, paused, completing)
   - What is the run's budget remaining?
   - What agents are currently active?
3. Classify impact per run:
   - "unaffected" — no action needed
   - "degraded" — inject warning context, reduce autonomy
   - "blocked" — pause run, notify orchestrator
   - "critical" — hard-stop, preserve artifacts, notify immediately
4. Execute classified actions
5. Emit inter-agent messages to affected rooms
6. Update orchestrator dashboard
```

### 14G.7 Escalation Protocol

When a team agent encounters a problem it cannot resolve:

```
1. Agent detects repeated failure (e.g., tool call fails 3x)
2. Agent emits escalation_request event:
   {
     channel: "team_escalation",
     messageType: "tool_failure_pattern",
     payload: {
       toolName: "spreadsheet_tool",
       failureCount: 3,
       lastError: "Connection timeout",
       affectedRunId: "run_123"
     }
   }
3. System agent's sensor picks up escalation events
4. System agent creates incident (sensor: "team_escalation")
5. System agent diagnoses (rule engine or LLM analysis)
6. System agent sends diagnosis back to team room:
   {
     channel: "system_broadcast",
     messageType: "diagnosis_result",
     displayMessage: "Spreadsheet service is down — switching to fallback. ETA: 5 minutes.",
     relatedIncidentId: 456
   }
7. Team lead adjusts task allocation based on diagnosis
```

### 14G.8 Shared Resource State

Both agent worlds need a shared view of resource availability:

```ts
type SystemResourceState = {
  providers: Record<string, {
    status: "healthy" | "degraded" | "down";
    fallbackProvider?: string;
    estimatedRecovery?: string;
  }>;
  queues: Record<string, {
    status: "healthy" | "congested" | "paused";
    depth: number;
    estimatedDrainTime?: number;
  }>;
  storage: {
    status: "healthy" | "warning" | "critical";
    usagePercent: number;
  };
  creditBalance: Record<string, {  // per tenant
    remaining: number;
    warningThreshold: number;
    exhausted: boolean;
  }>;
  maintenanceMode: boolean;
  maintenanceMessage?: string;
};
```

This state is:

- maintained by the Virtual Admin Agent (sensors update it)
- readable by the orchestrator's prompt assembly engine (Section 14A)
- published via SSE to the orchestrator dashboard
- used by the impact assessment engine to classify run impacts

### 14G.9 Schema: Inter-Agent Message Table

```sql
-- Canonical store for all inter-agent messages
CREATE TABLE inter_agent_messages (
  id              VARCHAR(36) PRIMARY KEY,
  tenant_id       VARCHAR(36) REFERENCES tenants(id),
  channel         VARCHAR(32) NOT NULL,
  source_agent_type VARCHAR(16) NOT NULL,
  source_agent_id VARCHAR(64) NOT NULL,
  target_type     VARCHAR(16) NOT NULL,
  target_id       VARCHAR(64) NOT NULL,
  priority        VARCHAR(16) NOT NULL DEFAULT 'normal',
  message_type    VARCHAR(64) NOT NULL,
  payload         JSONB NOT NULL,
  display_message TEXT NOT NULL,
  action_required BOOLEAN NOT NULL DEFAULT false,
  status          VARCHAR(16) NOT NULL DEFAULT 'delivered',
  acknowledged_at TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  related_incident_id INTEGER REFERENCES virtual_admin_incidents(id),
  related_run_id  VARCHAR(36),
  related_room_id VARCHAR(36),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX inter_agent_msg_target_idx ON inter_agent_messages(target_type, target_id, created_at DESC);
CREATE INDEX inter_agent_msg_incident_idx ON inter_agent_messages(related_incident_id);
CREATE INDEX inter_agent_msg_run_idx ON inter_agent_messages(related_run_id);
```

### 14G.10 Schema: System Resource State Table

```sql
-- Current state of shared system resources (updated by Virtual Admin Agent sensors)
CREATE TABLE system_resource_state (
  id              VARCHAR(64) PRIMARY KEY,  -- resource identifier (e.g., "provider:openai", "queue:media")
  tenant_id       VARCHAR(36) REFERENCES tenants(id),
  resource_type   VARCHAR(32) NOT NULL,     -- "provider", "queue", "storage", "credit", "system"
  status          VARCHAR(16) NOT NULL,     -- "healthy", "degraded", "down", "critical"
  state_json      JSONB NOT NULL,           -- resource-specific state details
  updated_by      VARCHAR(64) NOT NULL,     -- agent that last updated this
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 14G.11 API: Inter-Agent Communication

tRPC surface:

- `interAgentMessage.send` — send a message from any agent to any target
- `interAgentMessage.listByRoom` — get all inter-agent messages for a room
- `interAgentMessage.listByRun` — get all inter-agent messages affecting a run
- `interAgentMessage.acknowledge` — mark a message as acknowledged
- `systemResource.getState` — get current system resource state
- `systemResource.getImpactAssessment` — given an incident, return affected runs

Internal service API (Node.js → Python, Python → Node.js):

```typescript
// Called by Virtual Admin Agent when incident impacts team runs
POST /api/internal/orchestrator/system-impact
{
  incidentId: number,
  incidentType: string,
  severity: string,
  affectedResources: string[],
  recommendedAction: "notify" | "degrade" | "pause" | "stop",
  displayMessage: string
}

// Response: list of affected runs and actions taken
{
  affectedRuns: Array<{
    runId: string,
    roomId: string,
    impactLevel: string,
    actionTaken: string
  }>,
  messagesDelivered: number
}
```

```typescript
// Called by team agents when escalating to system layer
POST /api/internal/virtual-admin/team-escalation
{
  roomId: string,
  runId: string,
  assistantId: string,
  escalationType: string,
  context: Record<string, any>,
  urgency: "low" | "medium" | "high"
}

// Response: acknowledgment + created incident ID
{
  incidentId: number,
  status: "created" | "merged_with_existing",
  estimatedResponseTime: number  // seconds
}
```

### 14G.12 Event Types For Inter-Agent Communication

Add to the event taxonomy (Section 18.3):

- `system_message_received` — system agent sent a message to a room/run
- `system_run_paused` — system agent paused a run (distinct from orchestrator pause)
- `system_run_stopped` — system agent stopped a run
- `system_run_resumed` — system agent resumed a previously system-paused run
- `system_context_injected` — system agent injected shared context into memory
- `system_context_cleared` — system condition cleared, context removed
- `team_escalation_sent` — team agent escalated an issue to system layer
- `team_escalation_resolved` — system agent responded to escalation
- `resource_state_changed` — system resource status changed (provider up/down, queue congested, etc.)
- `impact_assessment_completed` — impact engine finished evaluating an incident

### 14G.13 UI Integration

#### In Team Room (user sees)

System messages appear as distinctive system bubbles in the chat timeline:

```
┌─────────────────────────────────────────┐
│ ⚠️ System Guardian                        │
│ LLM provider OpenAI is degraded.         │
│ Your requests are being routed to         │
│ Anthropic. No action needed.              │
│                              10:15 AM     │
└─────────────────────────────────────────┘
```

- System messages use a distinct visual style (different background, system icon)
- Not mixed with agent discussion messages
- Collapsible for long sequences of system updates
- Linkable to the related incident in admin dashboard

#### In Orchestrator Dashboard

A new "System Impact" section shows:

- current system resource state (traffic light indicators)
- active incidents affecting the user's runs
- inter-agent messages received in the last 24 hours
- "View in System Guardian" link to admin dashboard

#### In Live Run Monitor

The run monitor (Section 14.3.1) gains:

- a system status bar showing affected resources
- system-paused runs show "Paused by System Guardian: [reason]"
- a "System Events" filter in the activity timeline

### 14G.14 Communication With External Agents

External agents (MCP clients, webhook partners) communicate through the external intake pipeline (Section 16.7). However, the inter-agent communication protocol should also support:

- external agent → team room messages (via `external_task_inbox` → materialized as inter-agent message)
- team room → external agent responses (via webhook callback or MCP response)
- system agent → external agent notifications (e.g., "your submitted task's run was paused due to maintenance")

The external binding table (`external_task_bindings`) already tracks the mapping between external thread IDs and SmartSpec rooms/runs. Inter-agent messages should be deliverable to external agents via:

1. Look up `external_task_bindings` for the affected room/run
2. If a binding exists and `syncMode` includes outbound, deliver the message via the source's callback mechanism
3. Log delivery status

### 14G.15 Communication Security Rules

| Rule | Enforcement |
|---|---|
| System agents cannot impersonate team agents | `sourceAgentType` must match the actual sender's registration |
| Team agents cannot send system-control messages | Only `sourceAgentType: "system"` can use `system_control` channel |
| External agents cannot send direct inter-agent messages | Must go through external intake pipeline |
| All inter-agent messages are audit-logged | Written to `inter_agent_messages` table + `agent_activity_events` |
| System messages cannot contain sensitive data | Sanitization before delivery (same rules as LLM data in Spec 046 Section 11) |
| Rate limit on inter-agent messages | Max 100 messages per minute per source agent |
| System-pause respects run approval policies | System cannot bypass high-risk approval requirements |

### 14G.16 Integration With Virtual Admin Agent (Spec 046)

The Virtual Admin Agent spec (046) defines sensors, brain, and actuators. The inter-agent communication protocol adds a new actuator type:

| Existing Actuator (046) | New Capability |
|---|---|
| `notify_admin` | Also sends `system_direct` message to orchestrator dashboard |
| `failover_provider` | Also sends `system_broadcast` to all rooms using that provider |
| `retry_failed_job` | Also sends `system_broadcast` to the room that created the job |
| `pause_queue` | Also triggers `system_run_paused` for runs with pending queue jobs |
| `emergency_maintenance` | Triggers `system_stop_run` for all active runs, generates partial summaries |

The Virtual Admin Agent should also gain a new sensor:

- `team_escalation` sensor — monitors `inter_agent_messages` where `channel = "team_escalation"` and creates incidents

### 14G.17 Acceptance Criteria For Inter-Agent Communication

The protocol is sufficiently specified when implementation can answer:

1. how a system incident automatically affects running team sessions
2. how team agents see system status messages in their room
3. how team agents escalate failures to the system layer and receive diagnosis
4. how the orchestrator knows which runs are system-impacted vs user-paused
5. how system resource state is injected into agent prompts
6. how external agents receive notifications about their submitted tasks
7. how the admin dashboard shows both system incidents and team impact together
8. how system messages are visually distinguished from agent messages in the UI
9. how the impact assessment engine maps incidents to affected runs
10. how communication between agent worlds is secured and audit-logged

## 15. Suggested Architecture Fit With Current SmartSpec

### 15.1 Reuse

Reuse current:

- persona management
- agency agents
- communication flows
- agency chat streaming
- cross-agency call tool
- artifact and preview pipelines
- scheduler and automation surfaces

### 15.2 Extend

Extend current:

- chat/new chat entry points
- agency chat into team room behavior
- memory schema to multi-scope ownership
- brainstorm into reusable discussion presets

### 15.3 Avoid

Avoid:

- creating a second orchestration engine unrelated to agencies
- keeping brainstorm logic as a hard-coded special case
- using project shared memory as the only cross-session sharing mechanism
- dumping all memories into a single context block

## 16. Technical Design

### 16.1 Technical Design Goals

This technical design should be:

- additive before it becomes consolidating
- compatible with current persona and agency foundations
- explicit about ownership and visibility
- event-driven for streaming and auditability
- safe for incremental rollout

### 16.2 Compatibility-First Strategy

The preferred implementation strategy is not a rewrite. It is a layered model:

- keep `personas` as the reusable identity definition
- keep `agencies` and `agency_agents` as the execution graph substrate
- keep `agency_conversations` and agency streaming as the initial run/room backbone where possible
- introduce product-facing team/orchestrator data structures that wrap or map to agency entities
- introduce a unified scoped memory layer that can absorb or supersede existing chat/entity memory over time

### 16.3 Canonical Entity Mapping

Preferred mapping in the first major implementation phase:

- `assistant_team` maps 1:1 to one underlying `agency`
- `assistant_profile` maps to one underlying `agency_agent`
- `team_room` may wrap one underlying `agency_conversation`
- `team_run` may wrap one underlying `agency run`
- `assistant persona` references a reusable `persona`
- `user persona` references a reusable `persona` or a dedicated user-persona link

This preserves existing runtime investments while creating a clearer product model.

### 16.4 Proposed Schema Strategy

The technical design should introduce a product-facing schema layer rather than overload existing chat tables.

#### 16.4.1 Reuse Existing Tables

Reuse these existing foundations:

- `personas`
- `agencies`
- `agency_agents`
- `agency_agent_tools`
- `agency_communication_flows`
- `agency_conversations`
- `agency_run_artifacts`

#### 16.4.2 New Tables Or Major Extensions

Preferred new or extended entities:

##### `user_orchestrator_profiles`

Purpose:

- stores the user’s orchestration profile and default persona selection

Key fields:

- `id`
- `userId`
- `defaultPersonaId`
- `orchestratorDisplayName`
- `preferredViewMode`
- `preferredAutonomyLevel`
- `preferredSummaryStyle`
- `defaultApprovalPolicy`
- `createdAt`
- `updatedAt`

##### `assistant_teams`

Purpose:

- product-facing team definition

Key fields:

- `id`
- `tenantId`
- `ownerUserId`
- `agencyId`
- `name`
- `description`
- `category`
- `teamPersonaOverlay`
- `defaultViewMode`
- `defaultSummaryMode`
- `defaultAutonomyLevel`
- `memoryPolicyJson`
- `artifactPolicyJson`
- `status`
- `createdAt`
- `updatedAt`

Notes:

- `agencyId` links the team to the underlying execution graph
- this table becomes the main UX-facing object for “virtual office teams”

##### `assistant_profiles`

Purpose:

- product-facing team roster and behavioral layer

Key fields:

- `id`
- `tenantId`
- `teamId`
- `agencyAgentId`
- `personaId`
- `memberKind`
- `humanUserId`
- `externalConnectorId`
- `displayName`
- `nickname`
- `roleTitle`
- `genderStyle`
- `specialtyTags`
- `capabilityTags`
- `toolPolicyJson`
- `approvalPolicyJson`
- `memoryPolicyJson`
- `visibilityPolicyJson`
- `routingPolicyJson`
- `workingHoursOverrideJson`
- `sortOrder`
- `isLead`
- `isActive`
- `createdAt`
- `updatedAt`

Notes:

- `personaId` links to reusable persona definitions
- `agencyAgentId` links to the runtime node that executes work
- `memberKind` distinguishes persona, human, and external connector members inside one roster
- `workingHoursOverrideJson` allows team-specific schedule rules without mutating the shared persona itself

##### `assistant_team_templates`

Purpose:

- reusable preset team definitions

Key fields:

- `id`
- `name`
- `description`
- `category`
- `teamConfigJson`
- `memberTemplateJson`
- `routineTemplateJson`
- `reviewLoopJson`
- `approvalFlowJson`
- `defaultDiscussionMode`
- `isSystem`
- `createdAt`
- `updatedAt`

##### `team_routines`

Purpose:

- durable recurring work definitions for a team

Key fields:

- `id`
- `tenantId`
- `teamId`
- `name`
- `description`
- `scheduleExpr`
- `timezone`
- `triggerMode`
- `workTemplateJson`
- `reviewPolicyJson`
- `approvalPolicyJson`
- `fallbackPolicyJson`
- `isActive`
- `lastTriggeredAt`
- `createdAt`
- `updatedAt`

##### `team_work_items`

Purpose:

- first-class work/backlog objects for orchestrator-driven operations

Key fields:

- `id`
- `tenantId`
- `teamId`
- `roomId`
- `runId`
- `routineId`
- `sourceType`
- `sourceRef`
- `title`
- `objective`
- `status`
- `revisionVersion`
- `threadRootMessageId`
- `activeDraftArtifactId`
- `priority`
- `riskClass`
- `assignedMemberId`
- `reviewerMemberId`
- `approverMemberId`
- `lockOwnerMemberId`
- `lockExpiresAt`
- `parentWorkItemId`
- `artifactRefsJson`
- `approvalState`
- `carryOverReason`
- `dueAt`
- `completedAt`
- `createdAt`
- `updatedAt`

##### `external_connectors`

Purpose:

- stores external execution systems that can be attached to one or more teams

Key fields:

- `id`
- `tenantId`
- `name`
- `connectorType`
- `authMode`
- `endpointUrl`
- `authConfigEncrypted`
- `secretVersion`
- `capabilityTags`
- `healthStatus`
- `healthCheckedAt`
- `lastHealthError`
- `allowedSourceIpsJson`
- `callbackSigningKeyId`
- `maxClockSkewSec`
- `defaultTimeoutSec`
- `retryPolicyJson`
- `approvalPolicyJson`
- `callbackConfigJson`
- `isActive`
- `createdAt`
- `updatedAt`

##### `work_item_events`

Purpose:

- immutable audit log for triage, delegation, review, approval, failure, retry, and completion decisions

Key fields:

- `id`
- `workItemId`
- `roomId`
- `runId`
- `actorMemberId`
- `eventType`
- `summary`
- `payloadJson`
- `createdAt`

##### `room_message_redactions`

Purpose:

- track structured redaction decisions for room-visible content and attachments

Key fields:

- `id`
- `roomMessageId`
- `tenantId`
- `redactionType`
- `targetPath`
- `reason`
- `appliedByType`
- `appliedById`
- `createdAt`

##### `team_rooms`

Purpose:

- durable room/chat abstraction for orchestrator-plus-team conversations

Key fields:

- `id`
- `tenantId`
- `teamId`
- `orchestratorUserId`
- `backingAgencyConversationId`
- `roomType`
- `title`
- `goalPrompt`
- `projectId`
- `viewMode`
- `summaryMode`
- `autonomyLevel`
- `status`
- `lastRunId`
- `createdAt`
- `updatedAt`

Notes:

- `backingAgencyConversationId` allows incremental reuse of current agency chat
- `roomType` supports `direct`, `team`, `auto-team`, `job-review`

##### `team_room_participants`

Purpose:

- explicit participant roster for each room

Key fields:

- `id`
- `roomId`
- `participantType`
- `participantUserId`
- `participantAssistantId`
- `participantLabel`
- `roleInRoom`
- `isMuted`
- `canWriteSharedMemory`
- `joinedAt`

Notes:

- supports user plus multiple assistants
- supports future observers or approvers

##### `team_room_messages`

Purpose:

- canonical multi-party message store for team conversations

Key fields:

- `id`
- `roomId`
- `runId`
- `senderType`
- `senderUserId`
- `senderAssistantId`
- `recipientType`
- `recipientAssistantId`
- `recipientGroupJson`
- `turnType`
- `messageType`
- `visibility`
- `content`
- `summaryContent`
- `artifactRefsJson`
- `memoryRefsJson`
- `citationRefsJson`
- `workItemId`
- `threadRootMessageId`
- `replyToMessageId`
- `redactionState`
- `metadataJson`
- `tokenUsageJson`
- `createdAt`

Why a separate table:

- existing chat message semantics are user/assistant-oriented
- team conversations need sender, recipient, visibility, and run-awareness

##### `team_runs`

Purpose:

- track one orchestrated work session inside a room

Key fields:

- `id`
- `roomId`
- `teamId`
- `backingAgencyRunId`
- `initiatedByUserId`
- `executionMode`
- `objective`
- `constraintsJson`
- `status`
- `activeAssistantId`
- `stopPolicyJson`
- `approvalPolicyJson`
- `budgetSnapshotJson`
- `summaryArtifactId`
- `startedAt`
- `endedAt`

##### `scoped_memories`

Purpose:

- unified memory table for all scopes

Key fields:

- `id`
- `tenantId`
- `ownerType`
- `ownerId`
- `memoryKind`
- `visibility`
- `sourceType`
- `sourceUserId`
- `sourceAssistantId`
- `sourceRoomId`
- `projectId`
- `title`
- `content`
- `summary`
- `tags`
- `metadataJson`
- `confidence`
- `importance`
- `reinforcementCount`
- `lastAccessedAt`
- `expiresAt`
- `createdAt`
- `updatedAt`

Notes:

- this should gradually replace simple user-only memory insertion paths
- vector index storage may stay in Python/backend infrastructure initially

##### `memory_promotions`

Purpose:

- audit trail when memory moves from private scope to shared scope

Key fields:

- `id`
- `memoryId`
- `fromOwnerType`
- `fromOwnerId`
- `toOwnerType`
- `toOwnerId`
- `promotedByUserId`
- `promotedByAssistantId`
- `reason`
- `createdAt`

##### `automation_handoffs`

Purpose:

- normalized record of cross-surface actions initiated by a team or assistant

Key fields:

- `id`
- `roomId`
- `runId`
- `assistantId`
- `workItemId`
- `destinationType`
- `destinationId`
- `intent`
- `idempotencyKey`
- `dispatchTokenHash`
- `callbackNonce`
- `callbackDeadlineAt`
- `requestPayloadJson`
- `resultPayloadJson`
- `status`
- `approvalState`
- `attemptCount`
- `lastAttemptAt`
- `createdAt`
- `updatedAt`

##### `external_task_sources`

Purpose:

- register trusted external systems or agent platforms that can submit work into a team

Key fields:

- `id`
- `tenantId`
- `ownerUserId`
- `name`
- `sourceType`
- `authMode`
- `authConfigJson`
- `secretVersion`
- `allowedSourceIpsJson`
- `maxClockSkewSec`
- `defaultTeamId`
- `defaultRoomMode`
- `defaultAutonomyLevel`
- `trustTier`
- `isActive`
- `createdAt`
- `updatedAt`

Supported `sourceType` examples:

- `api_client`
- `webhook_partner`
- `mcp_client`
- `external_agent_platform`

##### `external_task_inbox`

Purpose:

- canonical intake queue for externally submitted work before it becomes a room/run

Key fields:

- `id`
- `tenantId`
- `sourceId`
- `receivedAt`
- `status`
- `submittedByLabel`
- `externalTaskId`
- `idempotencyKey`
- `requestBodyHash`
- `targetTeamId`
- `targetRoomId`
- `suggestedAssistantId`
- `intent`
- `objective`
- `payloadJson`
- `attachmentsJson`
- `routingDecisionJson`
- `approvalRequirement`
- `approvedByUserId`
- `approvedAt`
- `rejectedByUserId`
- `rejectedAt`
- `materializedRunId`
- `materializedRoomId`
- `createdAt`
- `updatedAt`

Statuses should include:

- `received`
- `awaiting_review`
- `approved`
- `rejected`
- `materialized`
- `failed`

##### `external_task_bindings`

Purpose:

- bind external sessions, threads, or task ids to SmartSpec teams/rooms/runs

Key fields:

- `id`
- `tenantId`
- `sourceId`
- `externalThreadId`
- `externalTaskId`
- `teamId`
- `roomId`
- `runId`
- `syncMode`
- `metadataJson`
- `createdAt`
- `updatedAt`

##### `agent_activity_events`

Purpose:

- append-only log of all agent actions during runs for monitoring and audit

Key fields:

- `id`
- `tenantId`
- `teamId`
- `roomId`
- `runId`
- `assistantId`
- `eventType`
- `eventCategory`
- `visibility`
- `summary`
- `detailJson`
- `tokenUsageSnapshot`
- `costSnapshot`
- `durationMs`
- `createdAt`

Notes:

- this table powers the live activity timeline and run history browser
- should be indexed by `(runId, createdAt)` and `(assistantId, createdAt)` for efficient queries
- retention policy: keep for 90 days, then archive or summarize

##### `agent_run_summaries`

Purpose:

- computed per-agent performance summary generated at run completion

Key fields:

- `id`
- `runId`
- `assistantId`
- `turnCount`
- `totalInputTokens`
- `totalOutputTokens`
- `totalCostCredits`
- `toolCallCount`
- `toolSuccessCount`
- `toolFailureCount`
- `memoriesRead`
- `memoriesWritten`
- `memoriesPromoted`
- `artifactsCreated`
- `handoffsSent`
- `handoffsReceived`
- `errorCount`
- `activeDurationMs`
- `waitDurationMs`
- `createdAt`

Notes:

- used by agent performance cards and orchestrator dashboard
- one row per assistant per run

##### `run_snapshots`

Purpose:

- periodic state captures during active runs for progress tracking and replay

Key fields:

- `id`
- `runId`
- `capturedAt`
- `activeAssistantId`
- `agentStatusesJson`
- `tokenUsageJson`
- `costJson`
- `artifactCountJson`
- `pendingApprovalsCount`

Notes:

- captured every 10-30 seconds during active runs
- enables historical replay of run progress
- short retention (7 days after run completion)

##### `orchestrator_notifications`

Purpose:

- persistent notification records for the orchestrator user

Key fields:

- `id`
- `tenantId`
- `userId`
- `teamId`
- `roomId`
- `runId`
- `notificationType`
- `severity`
- `title`
- `body`
- `actionUrl`
- `isRead`
- `isDismissed`
- `createdAt`
- `readAt`

Notes:

- supports in-app notification badge and dropdown
- types include: `approval_required`, `run_completed`, `run_failed`, `agent_error`, `agent_stuck`, `budget_warning`, `artifact_ready`, `external_task_received`

### 16.5 Memory Storage Design

Use a hybrid design:

- relational metadata in the web/database layer for ownership, visibility, and audit
- semantic retrieval in the Python/memory backend for embeddings and relevance search

Preferred near-term approach:

- persist `scoped_memories` in primary app DB
- replicate/query semantic indexes via the existing Python memory services
- keep retrieval policy in one orchestration layer so prompt assembly remains deterministic

### 16.6 Schema Migration Guidance

Implementation should prefer:

- additive tables first
- compatibility adapters second
- consolidation only after the product model is stable

Specific guidance:

- keep `entity_memories` readable during migration
- map legacy brainstorm runs into `team_runs` semantics
- allow `team_room` to coexist with `agency_conversations` until runtime parity is proven

### 16.7 External Task Intake Design

#### 16.7.1 Problem Statement

The system should not assume that all work begins from a user typing into SmartSpec.

Future-compatible behavior requires:

- external systems submitting tasks directly to a team
- external agent platforms passing documents, briefs, or action requests
- SmartSpec materializing those requests into team rooms and runs
- orchestrator approval being policy-driven rather than mandatory every time

Examples:

- an external agent platform sends a research brief to the “Research Desk”
- a partner workflow sends a contract document to the “Legal Review Cell”
- an MCP client submits a task package to a presentation team

#### 16.7.2 Supported Intake Channels

The design should support:

- authenticated REST API submissions
- inbound webhook submissions
- MCP-based task invocation
- future agent-to-agent protocol adapters

Near-term implementation should prioritize:

- REST API
- inbound webhook
- MCP task submission

#### 16.7.3 Intake Pipeline

Every external submission should pass through the same normalized pipeline:

1. authenticate source
2. validate timestamp, signature, and replay window
3. deduplicate via idempotency key and/or request body hash
4. validate payload shape and attachment references
5. normalize into `external_task_inbox`
6. classify intent and target team
7. evaluate policy:
   - auto materialize
   - require inbox review
   - require approval before execution
   - require approval only before side effects
8. create or attach to a room
9. create a run if allowed
10. emit intake and routing events

#### 16.7.4 Intake Materialization Modes

Supported modes:

- `create_room_and_wait`
- `create_room_and_run`
- `attach_to_existing_room`
- `append_to_existing_run_context`

These modes should be selected by:

- source trust tier
- team policy
- requested autonomy level
- risk class of intended tools/destinations

#### 16.7.5 External Attachment Handling

External tasks may include:

- text brief
- structured JSON payload
- uploaded documents
- URLs to fetch
- artifact references

The normalized intake model should convert these into:

- `attachmentsJson`
- artifact references
- memory candidates
- room bootstrap context

#### 16.7.6 Source Trust Tiers

Suggested trust tiers:

- `untrusted`
- `verified`
- `trusted_internal`

The trust tier affects:

- whether auto materialization is allowed
- whether side-effecting tools are blocked until approval
- maximum autonomy level
- allowed destination types

#### 16.7.7 Human-In-The-Loop Policy Model

Human-in-the-loop should not be a single on/off switch.

Recommended policy modes:

- `manual_first`
  - every external task lands in inbox and waits for orchestrator approval
- `auto_start_review_before_side_effects`
  - assistants may analyze and draft automatically
  - publishing, sending, scheduling, or destructive actions require approval
- `trusted_source_auto_run`
  - pre-approved sources can create rooms and runs automatically within strict caps
- `conditional`
  - policy evaluated from source trust, budget, tool class, team, and task type

#### 16.7.8 Human Approval Decision Matrix

Approval should be decided from the combination of:

- source trust tier
- target team
- requested autonomy level
- planned tool usage
- external payload sensitivity
- cost estimate
- destination risk

Typical policy outcomes:

- low-risk analysis from trusted source -> auto-run
- medium-risk drafting from verified source -> auto-run with review before delivery
- high-risk workflow edits or publishing -> approval required before side effects
- unknown external source -> inbox review only

#### 16.7.9 External-To-Team Contract

Every external submission should be normalized to a contract like:

```json
{
  "source": {
    "sourceId": "src_123",
    "sourceType": "mcp_client",
    "submittedBy": "OpenClaw Research Worker"
  },
  "target": {
    "teamId": "team_456",
    "roomMode": "create_room_and_run"
  },
  "task": {
    "intent": "research_report",
    "objective": "Analyze competitor pricing and summarize risks",
    "constraints": {
      "deadline": "2026-03-18T18:00:00Z",
      "budgetCap": 300
    }
  },
  "attachments": [],
  "approvalPreference": "review_before_side_effects"
}
```

#### 16.7.10 Relation To Existing MCP And Webhook Foundations

SmartSpec already has:

- MCP endpoints
- inbound webhook trigger infrastructure
- public API/webhook patterns

The new design should reuse these transport foundations while adding:

- task normalization
- routing to teams/rooms
- policy-based human review
- source trust management

#### 16.7.11 External Connector Members In The Intake Model

An external platform may participate in two distinct roles:

- `task source`
  - sends work into SmartSpec
- `connector member`
  - receives delegated work from SmartSpec

The same platform may support both roles, but the policy model must track them separately.

Example:

- OpenClaw submits a new quotation request into the team inbox
- the same tenant also configures Manus as a connector member for browser-based posting work

#### 16.7.12 Callback And Result Continuation

When an external connector returns a result, the runtime should not treat that callback as the final answer automatically.

Required continuation flow:

1. validate callback authenticity, timestamp window, and nonce/idempotency requirements
2. attach result to the related handoff and work item
3. post an auditable room event
4. return control to the orchestrator/reviewer stage
5. only mark the work item complete after review/approval policy is satisfied

### 16.8 Existing Chat UI Integration Design

#### 16.8.1 Why This Section Is Necessary

The current `/chat` UI is still centered on:

- one `selectedConversationId`
- a legacy chat sidebar
- a single-chat `ChatView`
- a brainstorm toggle that assumes two-model debate
- right panels tuned for single-conversation workflows

This means the product spec is not complete unless it explicitly defines how the current chat surface evolves.

#### 16.8.2 Current UI Constraints To Design Around

Observed in the current codebase:

- `/chat` page uses `selectedConversationId: number | null` as its primary state
- `ChatSidebar` is titled “Chats” and lists only chat conversations
- empty state offers `Start New Chat` and `Explore Agencies`
- `ChatView` assumes one conversation header, one model selector, and a brainstorm toggle
- right panel modes are currently:
  - `memory`
  - `skills`
  - `artifacts`
  - `schedule`
  - `canvas`

These constraints should be treated as migration inputs, not implementation blockers.

#### 16.8.3 Primary UI Decision

`/chat` should remain the main front door.

However, it must become a unified orchestration shell rather than a legacy single-chat shell.

Recommended shell model:

- left rail for threads and task sources
- center pane for chat/room content
- right rail for context, activity, artifacts, approvals, and memory

#### 16.8.4 Unified Thread Reference Model

The current UI should stop assuming that the active item is always a chat conversation id.

Preferred client-side active reference:

```ts
type ActiveThreadRef =
  | { kind: "chat"; id: number }
  | { kind: "team_room"; id: string }
  | { kind: "agency_conversation"; id: string; agencyId: string }
  | { kind: "external_inbox_task"; id: string };
```

This enables:

- single chat continuity
- team rooms in the same shell
- migration from agency chat
- external intake review inside the same shell

#### 16.8.5 Sidebar Redesign

The current `ChatSidebar` should evolve into a unified thread navigator.

Recommended top-level sections:

- `Chats`
- `Teams`
- `Auto Sessions`
- `Inbox`
- `Agency Jobs`

Each item should show badges as relevant:

- participant count
- pending approval
- active run
- unread updates
- source icon for external tasks

The current `New` button should become a creation menu:

- `New Chat`
- `New Team Chat`
- `New Automatic Team Chat`
- `New Team`

#### 16.8.6 Team Creation And Persona Reuse UI

The spec must explicitly cover how users create teams without abandoning the current persona investments.

Current foundation already exists in the persona settings/admin surfaces:

- user-scoped persona creation and template mixing
- tenant/platform persona management
- nickname and gender style fields
- reviewed template catalog and template provenance

The new team creation UX should reuse those foundations rather than invent a second persona editor.

##### Entry Points

Users should be able to start team creation from:

- `/chat` creation menu
- a dedicated `Teams` or `Virtual Office` browser
- the existing persona settings area via:
  - `Create Team From Persona`
  - `Use In Team`
- admin surfaces for tenant-wide team templates

##### Recommended Team Creation Modes

- `Quick Team`
  - start from a system/team template
  - minimal required fields
  - good for first-time users
- `Guided Builder`
  - step-by-step wizard
  - allows persona selection, role assignment, policies, and memory defaults
- `Advanced Builder`
  - opens graph/agency-style configuration for power users

##### Guided Builder Steps

Step 1: Team purpose

- team name
- goal/category
- recommended team templates based on user persona

Step 2: Team composition

- choose preset members
- add/remove assistants
- mix role templates
- choose lead assistant

Step 3: Persona binding

For each assistant slot:

- choose existing persona
- create new persona inline
- clone and adapt an existing persona
- choose from platform/tenant personas when allowed
- confirm private memory scope will be created for that member

Step 4: Runtime policies

- autonomy level
- visibility mode
- default summary mode
- approval defaults
- memory defaults

Step 5: Review

- show member roster
- show each member’s persona source
- show tools and permissions summary
- show expected behavior summary

##### Inline Persona Creation Requirements

Team creation must allow inline persona authoring without forcing the user to leave the flow.

Minimum inline persona fields:

- persona name
- assistant nickname
- gender style
- description
- template or mixed template source
- system prompt prefix
- tone
- language
- restrictions

Advanced persona authoring may still link to the existing full editor.

##### Persona Source Types In Team Builder

Each assistant member should declare one persona source:

- `existing_user_persona`
- `existing_tenant_persona`
- `existing_platform_persona`
- `inline_new_persona`
- `inline_cloned_persona`

This is important for provenance, permissions, and later editing UX.

##### Team Builder Validation Rules

The UI should validate:

- at least one assistant member exists
- exactly one lead assistant is chosen unless the team type explicitly supports no lead
- each assistant has either a bound persona or an inline persona config
- each assistant is provisioned with a private memory scope
- high-risk tools require visible approval policy
- memory policy is selected for team/room/agent scopes

##### Persona Management Compatibility Rules

The spec should preserve these existing persona behaviors:

- user personas remain reusable outside teams
- tenant/platform personas remain selectable where permitted
- template provenance remains visible
- nickname and gender style remain first-class fields

##### Editing Existing Teams

The edit flow should let users:

- replace an assistant’s persona
- fork a persona only for one team member
- convert an inline persona into a saved reusable persona
- update a shared persona with warning about downstream impact

##### Admin And Shared Persona Coverage

The spec should also cover admin-facing team/persona composition:

- tenant admins can create shared team templates
- tenant admins can restrict which shared personas are available for team building
- platform admins can publish canonical personas and team kits

##### Minimum Acceptance Criteria For Team/Persona Creation UI

The team/persona creation UX is sufficiently specified only if implementation can answer:

1. where users start team creation
2. how existing personas are reused in team setup
3. how a new persona can be created inline during team setup
4. how tenant/platform personas appear in the same selection flow
5. how persona provenance and downstream editing impact are shown
6. how private memory is provisioned for each team member
7. how the builder escalates from quick mode to advanced mode

#### 16.8.7 Header Integration

The main content header should vary by active thread kind.

##### Direct Chat Header

Keep:

- title
- model selector
- persona indicator

##### Team Room Header

Add:

- team name
- member chips
- room type badge
- visibility mode switch
- summary mode switch
- run status
- approvals badge

##### Automatic Team Session Header

Add:

- current run status
- stop policy summary
- last active assistant
- summary freshness state

#### 16.8.8 Composer Integration

The current composer should gain targeting and orchestration controls.

Required additions for team rooms:

- recipient selector:
  - all members
  - one assistant
  - subgroup
- mode selector:
  - reply now
  - let team discuss
  - request review
- optional run instructions:
  - constraints
  - approval hints
  - deadline

Composer behavior by thread type:

- direct chat: current simple behavior
- team room: recipient-aware behavior
- automatic room: orchestration control behavior
- inbox task: approve/reject/materialize controls

#### 16.8.9 Brainstorm UI Migration

The current brainstorm toggle must not remain a permanent special-case control.

Recommended UI migration:

- keep a short-term `Brainstorm` quick action for continuity
- internally route it to:
  - create a temporary discussion room
  - or invoke a team discussion preset in the current thread

Longer-term replacement controls:

- `Discuss as Team`
- `Debate`
- `Critique Draft`
- `Synthesize`

The partner-model selector should become a team/preset selector over time.

#### 16.8.10 Right Panel Redesign

The current right rail is not sufficient for orchestrator workflows.

Recommended right panel modes:

- `context`
- `memory`
- `participants`
- `activity`
- `artifacts`
- `approvals`
- `summary`
- `skills`
- `schedule`
- `canvas`

Notes:

- `memory` must filter by scope:
  - user
  - agent
  - team
  - room
  - project
- `activity` should surface the event stream in human-readable form
- `participants` should show assistant identity, status, and assigned task
- `approvals` should aggregate pending human-in-loop checkpoints

#### 16.8.11 Empty State Redesign

The current empty state should no longer only suggest a new single chat.

Recommended empty state actions:

- `Start New Chat`
- `Start Team Chat`
- `Start Automatic Team Session`
- `Review External Inbox`
- `Explore Teams`

#### 16.8.12 Routing And Deep Links

The current `/chat?c=123` deep-link model should be extended.

Recommended query model:

- `/chat?thread=chat:123`
- `/chat?thread=team_room:room_123`
- `/chat?thread=agency:agency_1:conv_2`
- `/chat?thread=inbox:task_123`

Optional secondary params:

- `panel=activity`
- `run=run_123`
- `view=summary`

#### 16.8.13 Agency Chat Integration

The spec should explicitly allow two rollout stages:

##### Stage A

- keep `/agencies/:id` as a richer specialist workspace
- `/chat` links into it for advanced editing or monitoring

##### Stage B

- fold most team-room runtime into `/chat`
- keep `Agency Builder` as the graph-editing surface

This avoids forcing immediate route convergence.

#### 16.8.14 Backward Compatibility Rules For The Existing Chat UI

The following behaviors must remain intact during migration:

- existing direct chats remain readable and usable
- current artifacts continue rendering
- browser session integration in chat keeps working
- skills panel remains available for direct chat
- old brainstorm entries remain readable in history

#### 16.8.15 Minimum UI Acceptance Criteria

The UI integration is sufficiently covered only if the implementation plan can answer:

1. how `/chat` selects and renders non-chat threads
2. how the sidebar lists team rooms and inbox tasks
3. how `New` actions create team rooms and automatic sessions
4. how users create teams and bind personas without leaving the flow
5. how the composer targets one assistant vs the team
6. how brainstorm transitions into discussion presets
7. how activity, approvals, and scoped memory appear in the right rail
8. how old direct chat flows continue to work unchanged

## 17. API Model

### 17.1 API Design Principles

The API model should:

- separate product orchestration APIs from low-level runtime internals
- preserve existing agency APIs during migration
- expose rooms, runs, memories, and approvals as first-class resources
- keep streaming event contracts stable

### 17.2 Team Management APIs

Preferred tRPC surface:

- `team.list`
- `team.get`
- `team.create`
- `team.update`
- `team.archive`
- `team.cloneFromTemplate`
- `team.listTemplates`
- `team.instantiateBlueprint`
- `team.reorderMembers`
- `team.assignLead`

Representative payloads:

```ts
team.create({
  name,
  description,
  templateId,
  memberConfigs,
  defaultAutonomyLevel,
  defaultViewMode,
  projectId,
})
```

Returns:

```ts
{
  teamId: string,
  agencyId: string,
  members: Array<
    | { memberKind: "persona"; memberId: string; assistantId: string; agencyAgentId: string; personaId: string }
    | { memberKind: "human"; memberId: string; humanUserId: number; roleTitle: string }
    | { memberKind: "external_connector"; memberId: string; externalConnectorId: string; connectorType: string; capabilityTags: string[] }
  >
}
```

Team creation/update must support roster members with:

- `memberKind = persona`
- `memberKind = human`
- `memberKind = external_connector`

### 17.3 Assistant Profile APIs

Preferred tRPC surface:

- `assistantProfile.create`
- `assistantProfile.update`
- `assistantProfile.reorder`
- `assistantProfile.setPersona`
- `assistantProfile.setPolicies`
- `assistantProfile.setMemoryPolicy`
- `assistantProfile.resolveRuntimeMember`

### 17.4 Room APIs

Preferred tRPC surface:

- `teamRoom.list`
- `teamRoom.get`
- `teamRoom.create`
- `teamRoom.update`
- `teamRoom.setViewMode`
- `teamRoom.addParticipant`
- `teamRoom.removeParticipant`
- `teamRoom.sendMessage`
- `teamRoom.postWorkUpdate`
- `teamRoom.listMessages`
- `teamRoom.listWorkThread`
- `teamRoom.getSummary`

Representative `create` payload:

```ts
teamRoom.create({
  teamId,
  roomType: "team" | "auto-team",
  title,
  objective,
  viewMode,
  summaryMode,
  projectId,
  participantAssistantIds,
})
```

Representative `sendMessage` payload:

```ts
teamRoom.sendMessage({
  roomId,
  senderType: "user" | "assistant",
  senderId,
  recipientType: "all" | "assistant" | "subgroup",
  recipientId,
  content,
  additionalInstructions,
  attachments,
  workItemId?,
  messageType?,
  artifactRefs?,
  citationRefs?,
  replyToMessageId?,
})
```

Default room API rule:

- any agent-generated work update that changes team-visible progress or proposes an output must be persisted as a room message linked to the relevant work item when one exists

Room API safety rule:

- room-message write APIs must run sanitization/redaction before persisting user-visible content when the source is a tool output, connector callback, or sensitive attachment summary

### 17.5 Run APIs

Preferred tRPC surface:

- `teamRun.start`
- `teamRun.get`
- `teamRun.listByRoom`
- `teamRun.pause`
- `teamRun.resume`
- `teamRun.stop`
- `teamRun.approve`
- `teamRun.reject`

Representative `start` payload:

```ts
teamRun.start({
  roomId,
  objective,
  constraints,
  stopPolicy,
  autonomyLevel,
  budgetCap,
  summaryMode,
})
```

Representative result:

```ts
{
  runId: string,
  roomId: string,
  backingAgencyRunId?: string,
  status: "queued" | "running"
}
```

### 17.6 Memory APIs

Preferred tRPC surface:

- `memory.list`
- `memory.search`
- `memory.create`
- `memory.update`
- `memory.promote`
- `memory.dismiss`
- `memory.getAccessLog`

Representative query:

```ts
memory.search({
  ownerScopes: [
    { ownerType: "agent", ownerId: assistantId },
    { ownerType: "room", ownerId: roomId },
    { ownerType: "team", ownerId: teamId },
  ],
  query,
  topK,
})
```

### 17.7 Automation APIs

Preferred tRPC surface:

- `automationHandoff.create`
- `automationHandoff.get`
- `automationHandoff.listByRun`
- `automationHandoff.approve`
- `automationHandoff.reject`

Destinations supported from the beginning should include:

- workflow
- presentation
- video_edit
- browser_session
- agency_job
- scheduled_job

Automation routing should also expose connector-targeted actions such as:

- `automationHandoff.dispatchToConnector`
- `automationHandoff.getConnectorStatus`
- `automationHandoff.retryConnectorDispatch`

Connector dispatch contract requirements:

- requests must include `handoffId`, `workItemId`, `teamId`, `runId`, `idempotencyKey`, and signed callback metadata
- retries must reuse the original `idempotencyKey` while incrementing attempt counters

### 17.8 Monitoring APIs

Preferred tRPC surface:

- `monitoring.getRunStatus`
- `monitoring.getAgentStatuses`
- `monitoring.getActivityTimeline`
- `monitoring.getAgentDetail`
- `monitoring.getRunSummary`
- `monitoring.getAgentRunSummaries`
- `monitoring.getActiveRuns`
- `monitoring.getCostBreakdown`
- `monitoring.getAgentPerformanceCard`

Representative `getRunStatus` response:

```ts
{
  runId: string,
  status: "running" | "paused" | "completed" | "failed",
  objective: string,
  elapsed: number,
  budgetUsed: number,
  budgetCap: number,
  agents: Array<{
    assistantId: string,
    displayName: string,
    currentStatus: string,
    currentTaskSummary: string | null,
    turnCount: number,
    tokenUsage: { input: number, output: number },
    costEstimate: number,
    errorState: string | null,
  }>,
  pendingApprovals: number,
  artifactCount: number,
}
```

Representative `getActivityTimeline` query:

```ts
monitoring.getActivityTimeline({
  runId,
  assistantId?,      // filter by agent
  eventCategory?,    // filter by category
  visibility?,       // filter by visibility level
  cursor?,           // pagination
  limit: 50,
})
```

Returns:

```ts
{
  events: Array<{
    eventId: string,
    eventType: string,
    assistantId: string,
    assistantName: string,
    summary: string,
    visibility: string,
    tokenUsageSnapshot: number,
    costSnapshot: number,
    createdAt: string,
  }>,
  nextCursor: string | null,
}
```

#### Run Control APIs

- `teamRun.pause` — pause active run, preserves state
- `teamRun.resume` — resume paused run
- `teamRun.stop` — terminate run, generate partial summary
- `teamRun.intervene` — inject a user message to a specific agent mid-run
- `teamRun.muteAgent` — temporarily exclude agent from discussion
- `teamRun.unmuteAgent` — re-include muted agent
- `teamRun.adjustBudget` — increase or decrease remaining budget cap

Representative `intervene` payload:

```ts
teamRun.intervene({
  runId,
  targetAssistantId,
  message: "Please reconsider your approach and focus on pricing data only",
  action: "redirect" | "message" | "force_handoff",
  handoffToAssistantId?,
})
```

#### Notification APIs

- `notification.list`
- `notification.markRead`
- `notification.markAllRead`
- `notification.dismiss`
- `notification.getPreferences`
- `notification.updatePreferences`

#### SSE Streaming Endpoints

For real-time monitoring, extend the existing SSE infrastructure:

- `GET /api/runs/{runId}/stream` — stream all events for a specific run
- `GET /api/teams/{teamId}/stream` — stream events across all active runs for a team
- `GET /api/monitoring/active-stream` — stream events across all active runs for the user

Each SSE event should include the `eventType`, `assistantId`, `visibility`, and `summary` fields to enable client-side filtering without additional API calls.

### 17.9 Compatibility APIs

Compatibility behavior should be explicit:

- existing `agency.*` APIs remain operational
- existing brainstorm entry points remain callable
- legacy brainstorm requests are internally translated into room/run creation and discussion templates
- existing single-chat APIs continue to work independently

### 17.10 External Intake APIs

Preferred control-plane APIs:

- `externalSource.list`
- `externalSource.create`
- `externalSource.update`
- `externalSource.rotateSecret`
- `externalConnector.list`
- `externalConnector.create`
- `externalConnector.update`
- `externalConnector.rotateSecret`
- `externalConnector.checkHealth`
- `teamRoutine.list`
- `teamRoutine.create`
- `teamRoutine.update`
- `teamRoutine.runNow`
- `workItem.list`
- `workItem.get`
- `workItem.updateStatus`
- `workItem.requestReview`
- `workItem.requestApproval`
- `externalTaskInbox.list`
- `externalTaskInbox.get`
- `externalTaskInbox.approve`
- `externalTaskInbox.reject`
- `externalTaskInbox.materialize`

Preferred public or partner-facing endpoints:

- `POST /v1/teams/{teamId}/tasks`
- `POST /v1/rooms/{roomId}/tasks`
- `POST /v1/external-tasks/{sourceId}`
- `POST /v1/mcp` task submission via dedicated task tools
- inbound webhook endpoints bound to `external_task_sources`

Required transport semantics:

- external submissions must support idempotency keys
- webhook and callback bodies must be signed
- stale or replayed requests must be rejected
- all accepted external requests must log body-hash and auth decision metadata for audit

Representative external submission:

```json
POST /v1/teams/team_456/tasks
{
  "externalTaskId": "task-ext-789",
  "submittedBy": "Manus Ops",
  "intent": "contract_review",
  "objective": "Review the attached draft and identify negotiation risks",
  "constraints": {
    "reviewMode": "redline_and_summary",
    "deadline": "2026-03-19T09:00:00Z"
  },
  "attachments": [
    { "type": "file", "name": "msa-draft.docx", "url": "https://..." }
  ],
  "approvalPreference": "review_before_side_effects"
}
```

Representative response:

```json
{
  "inboxTaskId": "inbox_123",
  "status": "awaiting_review",
  "teamId": "team_456",
  "policyDecision": "requires_orchestrator_review"
}
```

### 17.11 MCP Task Tools

For MCP, the recommended abstraction is not “raw message injection”.

Preferred task-oriented tools:

- `team_submit_task`
- `team_append_context`
- `team_list_rooms`
- `team_get_summary`
- `team_request_review`
- `team_list_blueprints`
- `team_list_connectors`
- `team_submit_connector_result`

This keeps external agent platforms working at the task layer instead of impersonating chat participants unsafely.

### 17.12 Human Review APIs

Approval APIs should support:

- `approval.list`
- `approval.get`
- `approval.approve`
- `approval.reject`
- `approval.requestChanges`

Approval payloads should include:

- what external source initiated the work
- what the team has done already
- what next side effect is pending
- what happens if approved or rejected

## 18. Event Model

### 18.1 Event Model Principles

The event model should support:

- streaming UX
- auditability
- resumability
- visibility filtering
- downstream automation triggers

### 18.2 Common Event Envelope

All streamed events should normalize toward:

```json
{
  "eventId": "evt_123",
  "eventType": "assistant_message_delta",
  "tenantId": "t_1",
  "teamId": "team_1",
  "roomId": "room_1",
  "runId": "run_1",
  "ts": "2026-03-18T10:00:00Z",
  "actorType": "assistant",
  "actorId": "assistant_1",
  "visibility": "transparent",
  "audience": { "mode": "all" },
  "data": {}
}
```

### 18.3 Core Event Types

Suggested event taxonomy:

- `room_created`
- `participant_joined`
- `run_queued`
- `run_started`
- `assistant_activated`
- `assistant_message_delta`
- `assistant_message_final`
- `handoff_requested`
- `handoff_completed`
- `tool_call_started`
- `tool_call_completed`
- `artifact_created`
- `artifact_updated`
- `work_update_posted`
- `work_comment_posted`
- `work_revision_posted`
- `work_review_approved`
- `work_review_rejected`
- `memory_written`
- `memory_promoted`
- `approval_required`
- `approval_resolved`
- `summary_updated`
- `summary_ready`
- `run_paused`
- `run_completed`
- `run_failed`
- `external_task_received`
- `external_task_routed`
- `external_task_materialized`
- `external_task_rejected`
- `human_review_required`
- `human_review_completed`

### 18.3.1 Monitoring-Specific Event Types

In addition to the core event types above, the monitoring system requires:

Agent lifecycle events:

- `agent_status_changed`
- `agent_task_assigned`
- `agent_task_completed`
- `agent_error`
- `agent_retry`
- `agent_stuck_detected`
- `agent_loop_detected`
- `agent_budget_warning`
- `agent_budget_exceeded`
- `agent_muted`
- `agent_unmuted`

Performance events:

- `agent_turn_completed`
- `agent_slow_response`
- `run_milestone_reached`
- `run_budget_threshold`
- `run_snapshot_captured`

Intervention events:

- `orchestrator_intervened`
- `orchestrator_paused_run`
- `orchestrator_resumed_run`
- `orchestrator_stopped_run`
- `orchestrator_redirected_agent`
- `orchestrator_adjusted_budget`

Notification events:

- `notification_sent`
- `notification_read`
- `notification_dismissed`

### 18.4 Visibility Rules

Each event should carry visibility metadata:

- `transparent`
- `milestone`
- `summary_only`
- `private_internal`

Rule:

- internal-only notes may be stored and audited, but must not leak raw hidden reasoning to users
- if internal discussion is hidden, the system should emit structured summaries instead

### 18.5 Event Compatibility Mapping

Current event streams map naturally into the new taxonomy:

- `agent_switch` -> `assistant_activated`
- `tool_call` -> `tool_call_started`
- `tool_result` -> `tool_call_completed`
- `handoff` -> `handoff_requested` or `handoff_completed`
- `preview_ready` -> `artifact_created`
- `brainstorm_done` -> `summary_ready` plus `run_completed`

### 18.6 Recommended Transport

Near-term:

- continue using SSE for room/run streaming

Later:

- add resumable event replay and cursor-based subscription

### 18.7 Event Consumers

The event model should support these consumers:

- orchestrator chat UI
- activity panel
- summary panel
- approvals inbox
- analytics and traces
- automation downstream listeners

### 18.8 External Intake Event Flow

Typical flow for external work:

1. `external_task_received`
2. `external_task_routed`
3. one of:
   - `human_review_required`
   - `external_task_materialized`
4. if approved:
   - `human_review_completed`
   - `run_queued`
   - `run_started`
5. later:
   - `summary_ready`
   - `run_completed`

### 18.9 Approval Event Rules

Approval events should always capture:

- source identity
- pending action
- affected team/room/run
- risk level
- expiry or timeout policy

This is important for inbox UX and audit logs.

## 19. Phased Rollout

### Phase 1: Identity And Team Foundations

- support user persona explicitly
- support assistant persona as named team members
- support team templates
- support team chat creation
- support member kinds in one roster (`persona`, `human`, `external_connector`)
- support preset team blueprints that include roles, review loops, and approval defaults

### Phase 2: Scoped Memory

- add agent memory
- add team memory
- add room memory
- add retrieval and promotion policy

### Phase 3: Brainstorm Migration

- map brainstorm to discussion templates
- add structured team discussion presets
- add summary visibility options

### Phase 4: Orchestrator Workspace And Agent Monitoring

- add orchestrator controls
- add activity/artifact/summary tabs
- add approvals and budget controls
- add live run monitor with per-agent status roster and activity timeline
- add agent detail popover with turn history and tool/token stats
- add run control actions (pause, stop, intervene, redirect)
- add notification system for approvals, completions, errors, and budget alerts
- add run history browser with per-agent attribution and filtering
- add per-agent performance cards with historical stats

### Phase 5: Inter-Agent Communication And System Integration

- implement inter-agent message protocol and `inter_agent_messages` table
- implement `system_resource_state` table and publishing from Virtual Admin Agent sensors
- implement impact assessment engine (system incident → affected runs mapping)
- implement system-to-room broadcast (system messages in team rooms)
- implement system-to-run control (auto-pause/stop runs on critical incidents)
- implement team-to-system escalation (agent failure → system diagnosis loop)
- implement system resource state injection into agent prompts (Section 14A)
- add system status bar to live run monitor and orchestrator dashboard
- integrate with Virtual Admin Agent (Spec 046) actuators

### Phase 6: Automation Integration

- allow team members to create workflows
- allow team members to generate presentations/video jobs
- allow team members to schedule recurring work
- allow routines to create work items and wake the orchestrator automatically
- allow orchestrator to hand off unsupported work to connector-backed external members

### Phase 7: Autonomous Sessions

- add automatic team chat
- add stop policies
- add milestone-only and summary-only modes
- add multi-step quality loops with review and revision before completion
- add end-of-day and next-morning operational summaries

## 20. Acceptance Criteria

The system is successful when:

1. a user can create a named assistant team with named members and individual personas
2. a user can start a team chat and see members as participants
3. assistants can talk to each other without requiring a user turn each time
4. the orchestrator can choose between full trace and summary-only modes
5. each assistant can use its own private memory without polluting other assistants
6. team/room/project shared memories are distinct and retrievable
7. brainstorm becomes a team-discussion preset rather than a hard-coded separate mode
8. assistants can trigger SmartSpec automation surfaces with auditability and approvals
9. the user can see real-time status of every agent during an active run (name, state, current task, token usage)
10. the user can pause, stop, or redirect any agent mid-run without losing progress
11. the user can review a completed run with full per-agent attribution (who did what, cost per agent, errors)
12. the system alerts the user when an agent is stuck, looping, or approaching budget limits
13. the user can view per-agent performance history across multiple runs
14. cost and token consumption are tracked and displayed per agent, per run, and per team
15. the notification system delivers approval requests, run completions, and agent errors without requiring constant manual checking
16. autonomous runs stop reliably under all stop conditions (rounds, time, budget, consensus, idle)
17. agent turn order follows the configured strategy without deadlocks or infinite loops
18. each agent's prompt is composed correctly from persona + memory + history within context budget
19. summaries are generated at appropriate points and contain structured actionable content
20. concurrent artifact/memory writes do not corrupt data
21. system agent incidents automatically impact-assess and notify/pause/stop affected team runs
22. team agents can escalate failures to system-level diagnosis and receive results in their room
23. system resource state (provider health, credit balance, queue status) is visible in orchestrator dashboard and injected into agent prompts
24. inter-agent messages between system and team worlds are audit-logged and security-enforced
25. external agents receive notifications when their submitted tasks are affected by system events
26. preset team blueprints can be instantiated into a working 4-5 member roster with clear review and approval paths
27. scheduled work wakes the orchestrator/intake layer rather than silently bypassing review by sending work to a single producer
28. work items preserve a full state machine from intake through review, approval, carry-over, and completion
29. at least one independent review loop exists for medium-risk and high-risk artifact production
30. external connector members can appear in the team roster without being modeled as personas
31. unsupported native actions can be routed to approved connector members with authenticated callbacks and full audit history
32. the daily operations board shows routine status, yesterday success/failure, open alerts, pending approvals, and current blockers in one place
33. every meaningful team work update is posted into the room timeline with enough context for peers and the real user to inspect, comment, and drive revisions

## 21. Open Product Questions

These do not block the direction, but should be decided before implementation deepens:

- Should team membership be defined per room, per reusable team, or both?
- Should room summaries be generated continuously or only on demand?
- Which memory promotions require orchestrator approval?
- Should the orchestrator itself be represented as a participant avatar in the room model?
- How much of assistant-to-assistant reasoning should be visible versus summarized?
- What is the stuck-agent detection threshold? (e.g., 30s, 60s, configurable per team?)
- Should run snapshots be captured at fixed intervals or event-driven milestones?
- How long should `agent_activity_events` be retained? (90 days proposed, but configurable?)
- Should agent performance cards be visible to all team members or orchestrator-only?
- Should the user be able to "replay" a completed run step-by-step like a debugger?
- What is the maximum concurrent active runs per user/tenant for monitoring feasibility?
- Should notification preferences be per-team or global?
- What model should be used for system-generated summaries? (fast/cheap model vs same as agent?)
- Should parallel agent turns be supported in Phase 1 or deferred?
- How should cross-language teams handle artifact language? (room language or creator's language?)
- What is the maximum number of agents per team for UX feasibility? (roster panel space)
- Should `entity_memories` be dual-written or migrated batch-wise?
- Should the system auto-detect consensus, or should agents explicitly declare it?
- Should system agent messages be shown inline in the chat timeline or in a separate system panel?
- Should system-paused runs auto-resume when the system issue is resolved, or require orchestrator approval?
- Should team agents be aware of other teams' system-impacted status? (cross-team awareness)
- What is the maximum delay between system incident detection and team impact notification?
- Should the impact assessment engine use LLM analysis or rule-based logic only?
- Should external agents receive system messages in real-time (SSE) or batch (webhook callback)?
- Should the team builder allow multiple connector members of the same connector type in one roster with weighted routing, or only one primary connector per capability in Phase 1?

## 22. Localization And Multi-Language Support

### 22.1 Problem Statement

SmartSpec already supports Thai and English. The virtual office must not break this.

### 22.2 Language Rules For Teams

- Each assistant persona may have a `preferredLanguage` field
- Team rooms should have a `roomLanguage` setting (default: inherit from user preference)
- Summaries should be generated in the room language
- Agent names and role titles should support non-Latin characters (Thai, CJK, etc.)
- UI labels for monitoring surfaces (status names, event descriptions) must be localizable

### 22.3 Cross-Language Agent Interaction

When agents in the same team have different language preferences:

- the room language takes precedence for shared output
- agents may think in their preferred language internally (private reasoning)
- final summaries and artifacts must be in the room language

## 23. Rate Limiting And Abuse Prevention

### 23.1 Run-Level Limits

To prevent runaway costs and resource exhaustion:

| Limit | Default | Configurable? |
|-------|---------|---------------|
| Max concurrent runs per user | 3 | Yes (tenant setting) |
| Max concurrent runs per tenant | 10 | Yes (platform setting) |
| Max agents per team | 10 | Yes |
| Max rounds per run | 50 | Yes (stop policy) |
| Max run duration | 60 minutes | Yes (stop policy) |
| Max credit spend per run | Tenant credit balance | Yes (budget cap) |
| Max tool calls per agent per turn | 5 | Yes |
| Max memory writes per run | 100 | Yes |

### 23.2 Abuse Detection

The system should detect and flag:

- runs that consistently hit max rounds without producing artifacts
- agents that call the same tool repeatedly with the same parameters
- runs that consume credits far above the team's historical average
- rapid room/run creation (potential bot abuse)

### 23.3 Throttling Behavior

When limits are hit:

- soft limits: warn the orchestrator, continue with reduced autonomy
- hard limits: pause the run, require orchestrator approval to continue

## 24. Data Migration Strategy

### 24.1 Existing Chat Memory → Scoped Memory

Current `entity_memories` records must be migrated to `scoped_memories`:

| Current Field | Maps To |
|--------------|---------|
| `userId` owner | `ownerType: "user"`, `ownerId: userId` |
| `entityType: "conversation"` | `ownerType: "room"` (if in a team room) |
| `entityType: "project"` | `ownerType: "project"` |
| memory content | `content` + `summary` |

Migration should be:

- additive (write to new table, keep old table readable)
- dual-write during transition period
- cut over when new retrieval is proven

### 24.2 Existing Brainstorm Runs → Team Runs

Existing brainstorm conversation records should be:

- readable as legacy format indefinitely
- optionally convertible to `team_runs` for unified history
- not forcefully migrated (avoid breaking old data)

### 24.3 Existing Agency Conversations → Team Rooms

The `backingAgencyConversationId` field in `team_rooms` allows coexistence. Migration strategy:

- new team rooms create new agency conversations automatically
- existing agency conversations remain accessible via `/agencies/:id`
- no forced migration of existing conversations

## 25. Testing Strategy

### 25.1 Unit Testing Requirements

| Component | Minimum Coverage | Key Test Cases |
|-----------|-----------------|----------------|
| Prompt composition | 90% | Memory retrieval order, budget truncation, persona injection |
| Stop policy evaluation | 95% | All 7 stop conditions, graceful vs hard stop |
| Turn order strategies | 90% | Round-robin, lead-directed, handoff, loop detection |
| Memory scope isolation | 95% | Agent A cannot read agent B's private memory |
| Budget tracking | 95% | Per-agent accumulation, threshold alerts, cap enforcement |
| Notification delivery | 85% | All notification types, deduplication, preferences |

### 25.2 Integration Testing Requirements

- Full run lifecycle: create team → create room → start run → agent turns → stop → summary
- Cross-surface automation: agent triggers presentation generation, approval required
- External intake: submit task via API → inbox review → materialize → run → complete
- Memory promotion: agent writes private → suggests promotion → orchestrator approves → shared

### 25.3 Load Testing Considerations

- Simulate 10 concurrent runs with 5 agents each
- SSE stream fan-out to multiple browser tabs
- `agent_activity_events` write throughput under heavy run load
- Memory retrieval latency with 10K+ scoped memories

## 26. Recommended Next Step

After review of this spec, the next planning step should be a technical design that covers:

- schemas
- APIs
- prompt/retrieval composition
- room runtime events
- brainstorm migration steps
- phased implementation slices
