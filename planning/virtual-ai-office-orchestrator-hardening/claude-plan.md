# Virtual AI Office Orchestrator Hardening — Implementation Plan

## 1. Overview

This plan adds the security, concurrency, and contract hardening needed to make the orchestrator safe to implement and safe to operate.

It is intentionally narrower than the main orchestrator plan.
Its job is to define the non-optional production safeguards around:

- callbacks
- revisions
- mixed-member contracts
- room-visible content

## 2. Workstreams

### 2.1 External Callback Security

Add concrete contract requirements for connector dispatch and callback processing.

Implementation goals:

- every dispatch carries a stable `idempotencyKey`
- every callback validates signature, timestamp window, and nonce or one-time token
- callback payload must match original `handoffId`, `workItemId`, `teamId`, and `runId`
- duplicate deliveries become audit events, not duplicate completions
- retry semantics are explicit and bounded

Likely touchpoints:

- connector schema
- automation handoff service
- external intake routes
- webhook/callback verification helpers
- audit/event logging

### 2.2 Work-Item Revision Concurrency

Make revision loops safe when multiple agents are commenting on the same work.

Implementation goals:

- add `revisionVersion` and stale-write detection
- preserve thread lineage for critiques and revisions
- associate approvals/rejections with a concrete revision
- prevent silent overwrite of a newer draft by an older actor
- support explicit lock ownership for active draft editing

Likely touchpoints:

- `team_work_items`
- `team_room_messages`
- artifact write/update services
- room-thread retrieval
- approval state transitions

### 2.3 Mixed-Member API Contracts

Normalize API responses so persona, human, and connector members are first-class and not retrofitted.

Implementation goals:

- all roster APIs return a discriminated union by `memberKind`
- frontend thread/roster components can render all member kinds from one stable shape
- runtime resolution endpoints expose the execution mapping for each member kind
- no endpoint should require consumers to infer type from missing fields

Likely touchpoints:

- team router
- assistant profile router/service
- frontend roster rendering
- monitoring payloads

### 2.4 Room Redaction And Data Minimization

Protect room-first collaboration from leaking secrets or oversized internal payloads.

Implementation goals:

- sanitize tool output before room persistence
- preserve citations and inspectability even when content is redacted
- record structured redaction actions
- support per-team and per-risk-class policies
- keep user-visible room history readable and actionable

Likely touchpoints:

- room service
- summary service
- tool-result formatting
- connector callback handling
- room message rendering

## 3. Risks And Mitigations

### Replay Or Forged Callback

Mitigation:

- signature verification
- timestamp window
- idempotency and nonce tracking
- callback-to-handoff binding

### Lost Revision

Mitigation:

- optimistic concurrency
- explicit revision lineage
- lock ownership on active draft

### API Drift Between Member Kinds

Mitigation:

- discriminated union contracts
- shared DTO layer
- contract tests at router level

### Sensitive Payload Leakage

Mitigation:

- redaction policy before persistence
- sanitized summary fallback
- audit log of masking decisions

## 4. Acceptance Criteria

- replayed or stale callbacks cannot complete work a second time
- stale revision submissions fail clearly
- roster APIs are stable for all member kinds
- room timelines remain collaborative without exposing raw sensitive payloads

## 5. Recommended Delivery Order

1. callback security
2. revision concurrency
3. mixed-member APIs
4. room redaction
