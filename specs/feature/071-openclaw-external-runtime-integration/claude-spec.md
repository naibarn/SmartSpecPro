# Deep Specification

## Overview

Feature 071 turns OpenClaw from a loosely referenced future runtime into a concrete SmartSpecPro implementation program.

The feature must deliver two outcomes together:

1. A real external worker control plane for `openclaw_gateway`
2. A truthful, documented gateway compatibility profile for Claw-family runtimes

This is intentionally narrower than the full worker-fabric roadmap. It does not attempt to complete ZeroClaw desktop provisioning, NemoClaw secure pools, or HiClaw collaborative cluster support in the same slice.

## Problem statement

SmartSpecPro already contains:

- team-level `external_connector` participants
- OpenClaw-flavored examples in product UX
- a substantial HTTP LLM gateway
- a public MCP endpoint

But the current implementation still lacks the concrete pieces needed to claim OpenClaw support end to end:

- no worker registry or worker job tables
- no worker registration and heartbeat API
- no canonical bridge from `externalRef` to a registered worker
- no scheduler that can select OpenClaw by capability
- no worker artifact publication path into the existing library/indexing system
- no truthful contract for what the Claw-family gateway really supports today

## Goals

- register OpenClaw runtimes as first-class workers
- preserve SmartSpecPro as the source of truth for auth, policy, audit, job state, and artifacts
- route the right typed jobs to OpenClaw while keeping Desktop + ZeroClaw as the preferred local media/runtime path
- expose a truthful HTTP gateway contract that external runtimes can consume
- resolve or explicitly defer MCP parity gaps instead of leaving them ambiguous
- preserve backward compatibility for unresolved `external_connector` team records

## Non-goals

- shipping Desktop + ZeroClaw provisioning in this feature
- using OpenClaw as the default GPU/media/local-files worker
- making NemoClaw or HiClaw part of the MVP rollout
- promising full MCP parity if the underlying handlers are still placeholders

## Product constraints

- `openclaw_gateway` is an external general-purpose runtime
- SmartSpecPro worker APIs must be REST-based and external-runtime-friendly
- artifact publication must reuse the existing library/indexing system
- gateway claims must match real routes and runtime behavior
- tenant identity must remain explicit for external callers

## Required deliverables

### A. Worker-runtime foundation

- canonical worker tables and enums
- worker policy/runtime profile tables
- team binding via nullable `externalWorkerId`
- shared worker contracts
- `openClawExternalRuntime` rollout flag

### B. Worker control-plane APIs

- worker register
- heartbeat
- policy fetch
- job claim
- job event reporting
- artifact upload init and completion
- diagnostics

### C. Scheduler, billing, and publication

- capability-aware runtime selection
- OpenClaw rejection for GPU/local-file/secure-sandbox-only jobs
- worker-job billing reservation/reconciliation
- canonical artifact publication and indexing

### D. Team, workflow, and admin integration

- optional worker binding for external connectors
- admin fleet visibility
- workflow dispatch via scheduler when worker-bound
- backward-compatible pause reasons during rollout

### E. Gateway compatibility work

- document supported HTTP contract:
  - `POST /v1/chat/completions`
  - `POST /v1/responses`
  - `GET /v1/models`
  - `GET /v1/credits`
  - `GET /v1/events` when relevant
- decide the fate of `smartspec.llm.*` MCP tools:
  - implement them
  - or hide/remove them
- normalize gateway tenant identity for external callers
- explicitly document whether embeddings are unsupported or newly added

## Current-codebase alignment

### Existing strengths to leverage

- team connector model already exists
- run engine already understands external handoff
- HTTP LLM gateway is already live
- public MCP route already exists
- library and indexing services already exist
- billing and audit services already exist
- test coverage already exists for routes and flags

### Existing gaps to close

- worker runtime schema and services
- worker route auth/scopes
- worker lifecycle and scheduler
- worker publication pipeline
- MCP truthfulness
- tenant-safe `/v1/responses` identity
- public gateway docs

## Acceptance bar

This feature is only complete when:

- OpenClaw worker lifecycle works end to end inside SmartSpecPro
- the HTTP gateway contract is explicit and tested
- MCP no longer advertises fake LLM parity
- gateway tenant identity is safe for external callers
- unresolved historical connectors still work

## Open questions left intentionally open

- whether embeddings should be added now or explicitly deferred
- whether `openClawExternalRuntime` must be Redis-synced for route-guard speed
- whether MCP LLM parity is worth implementing now versus hiding

These are implementation-planning questions, not blockers to writing a full plan.
