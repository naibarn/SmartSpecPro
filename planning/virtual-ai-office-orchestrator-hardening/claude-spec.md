# Synthesized Hardening Specification

## Scope

This plan hardens the Virtual AI Office Orchestrator in four concrete areas:

1. **Connector callback security**
2. **Work-item revision concurrency**
3. **Mixed-member API contracts**
4. **Room redaction and data minimization**

## Why This Exists

The main orchestrator spec is already broad and product-complete.
This delta plan exists so the implementation team can address the most failure-prone details without reopening the whole architecture.

## Core Product Rules

- room-first collaboration remains mandatory
- one persona may still belong to multiple teams
- external systems are connector-backed members, not personas
- stale updates and replayed callbacks must fail explicitly
- human users and peer personas must retain inspectability even when sensitive payloads are redacted

## Hardening Principles

1. **No silent overwrite**
2. **No unauthenticated callback trust**
3. **No assistant-only API assumptions**
4. **No raw secret leakage in room timelines**

## Implementation Shape

- schema additions are additive
- API contracts use discriminated unions
- room posts preserve traceability even when redacted
- tests must cover abuse cases, not only happy paths
