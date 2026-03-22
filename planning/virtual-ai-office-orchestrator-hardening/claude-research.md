# Research Notes — Virtual AI Office Orchestrator Hardening

## Codebase Fit

The main orchestrator plan already defines:

- room-first collaboration
- connector-backed external members
- work items and quality loops
- mixed roster member kinds

However, the current planning detail was still too loose in four areas:

### 1. Callback Security

The main spec introduced `external_connectors`, `external_task_sources`, `external_task_inbox`, and `automation_handoffs`, but did not fully pin down:

- replay protection
- idempotency semantics
- callback/handoff binding
- stale timestamp handling

This would create real production risk once OpenClaw, Manus, n8n, or custom MCP systems are allowed to call back into SmartSpec.

### 2. Revision Concurrency

The main spec already had a concurrency section, but it focused mostly on artifact locks.

The room-first quality loop means:

- several agents may critique the same work
- the owner may submit revised drafts repeatedly
- reviewers may approve or reject specific revisions

Without revision lineage and optimistic concurrency, the team can lose updates silently.

### 3. Mixed-Member APIs

The main spec added `memberKind`, but parts of the API examples still looked assistant-centric.
That would force frontend/backend implementers to invent ad hoc compatibility shims later.

### 4. Redaction And Minimization

The main spec now requires all meaningful work updates to appear in the room.
That is correct for transparency, but it also creates a need for:

- redacted/sanitized room posts
- explicit summary-vs-raw payload rules
- auditable masking decisions

## Design Direction

The safest pattern is:

- keep the main orchestrator spec as the source of truth
- isolate hardening as its own implementation workstream
- make security/concurrency contracts additive
- prefer auditability over hidden magic
