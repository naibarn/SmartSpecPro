# Virtual AI Office Orchestrator Hardening Delta Spec

## Purpose

This spec extends the main Virtual AI Office Orchestrator plan with implementation-critical hardening requirements that should be completed before or alongside the first production rollout.

Upstream source of truth:

- `planning/virtual-ai-office-orchestrator/spec.md`

This delta focuses on four areas:

1. callback security for external connector members and external task intake
2. revision/version safety for work items, room threads, and artifact updates
3. stable API contracts for mixed team members (`persona`, `human`, `external_connector`)
4. safe room-posting behavior with redaction and data minimization

## Non-Goals

- replacing the main orchestrator spec
- changing the rule that a persona may be reused across multiple teams
- removing room-first collaboration

## Requirements

### 1. External Callback Security

- every dispatch to a connector must include an idempotency key
- every callback must be signed, time-bounded, and replay-protected
- callbacks must bind to the original `handoffId`, `workItemId`, `teamId`, and `runId`
- retry semantics must be explicit and auditable

### 2. Work-Item Revision Concurrency

- work items must have optimistic concurrency via a revision/version field
- room threads must preserve revision lineage
- stale writes must fail explicitly rather than overwrite newer work
- artifact and work-item locks must be compatible with critique/revision loops

### 3. Mixed-Member API Contracts

- public and internal APIs must not assume every team member has an `assistantId`
- roster responses must be stable unions by `memberKind`
- runtime resolution rules must be explicit for persona, human, and connector members

### 4. Room Redaction And Data Minimization

- room-first posting remains mandatory for meaningful work
- raw sensitive payloads must not be posted into user-visible room timelines by default
- citations, summaries, and references must remain inspectable
- redaction actions must be auditable

## Deliverable Standard

This hardening work is complete only when schema, service contracts, APIs, and tests all encode these rules explicitly.
