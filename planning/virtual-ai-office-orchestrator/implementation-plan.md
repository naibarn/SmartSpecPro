# Implementation Plan

## Objective

Turn the current SmartSpec persona + agency + brainstorm + memory foundations into a coherent virtual office product where the user can orchestrate teams of virtual assistants.

## Current-Codebase Fit

The plan intentionally builds on:

- current persona infrastructure for identity and response style
- current agency schema/runtime for multi-agent execution
- current agency chat for participant and activity streaming
- current brainstorm runtime as a migration source
- current memory work as the base for scoped retrieval
- current webhook/MCP/public API foundations for external task intake

## Main Workstreams

### 1. Identity, Roster, And Team Model

- formalize user persona
- formalize assistant profile
- formalize team profile
- relate assistant profiles to agency agents
- add mixed roster member kinds:
  - persona
  - human
  - external connector

### 2. Team Blueprints And Presets

- define blueprint schema richer than a simple team template
- ship default 4-5 member office presets with visible review and approval paths
- support one-click instantiation into a working team roster

### 3. Memory Scopes

- add agent memory
- add team memory
- add room memory
- define retrieval order and promotion rules

### 4. Room Runtime

- support team rooms
- support automatic team rooms
- support sender/recipient/visibility semantics
- support milestone and summary views
- add daily operations board and room-linked work item traceability

### 5. Routine Work And Quality Loop

- introduce routine catalog and work-item state machine
- route schedule-triggered work through orchestrator triage
- enforce producer -> reviewer -> approval loops where policy requires
- add carry-over, failure digestion, and daily summary paths
- add revision/version tracking so concurrent critique and rewrite loops do not overwrite each other silently

### 6. Brainstorm Migration

- preserve current brainstorm entry points
- route them to team discussion presets
- deprecate brainstorm-specific hard-coding over time

### 7. Automation Integration And External Members

- standardize agent-triggered handoff contracts for workflow, presentation, video, browser, and agency execution
- support connector-backed external members such as OpenClaw, Manus, ComfyUI, and n8n
- support inbound external task intake plus outbound connector delegation
- require callback signature verification, replay protection, idempotency handling, and callback-to-handoff binding

### 8. API And Room Safety Hardening

- align mixed-member API shapes so persona, human, and connector members share one stable union contract
- add room-message sanitization/redaction policy before persisting user-visible updates
- preserve thread lineage for work updates, critiques, and revisions

## Risks And Mitigations

### Memory Sprawl

Risk:

- too many memory scopes create noisy retrieval

Mitigation:

- strict retrieval ordering
- visibility boundaries
- TTL and promotion rules

### UX Complexity

Risk:

- users may feel overwhelmed by too many assistants

Mitigation:

- keep single-assistant chat simple
- use team presets and office blueprints
- default to summary view for automatic sessions

### Safety And Cost

Risk:

- autonomous teams can loop or overrun budget
- external connectors can fail, drift, or silently degrade
- one-shot schedule execution can skip review and ship bad output
- callback replay or stale revision updates can corrupt workflow state
- room-first posting can leak sensitive tool outputs if sanitization is weak

Mitigation:

- reuse cross-agency guardrails
- add stop policies
- require approvals for risky actions
- route scheduled work through work items and review gates
- add connector health checks, timeout policies, and callback verification
- add optimistic concurrency and revision lineage to work items
- add redaction/minimization before room persistence

## Acceptance Summary

- team creation works
- team rooms exist
- assistant-private and shared memory are distinct
- brainstorm migrates to team discussion
- automation handoffs are inspectable
- preset office blueprints create a complete 4-5 member team with clear handoffs
- routines create work items and wake the orchestrator automatically
- unsupported actions can be delegated to connector-backed external members without losing auditability
- callback and external intake flows are replay-safe and idempotent
- mixed roster member APIs are stable and do not assume every member is an assistant runtime node

## Recommended Delivery Order

1. team/roster domain model
2. blueprint presets
3. memory scopes
4. room runtime
5. routine/work-item loop
6. external connector members
7. brainstorm migration
8. automation contracts
9. autonomous sessions
