# Section 02 — G1 Versioned Contracts

## Objective

Specify the minimum versioned Native Harness interfaces and negative authority rules needed for independent review by Chat, Runner, Task Control, Gateway, workspace and economic owners.

## Requirement IDs

R1.3.1–R1.3.4; A60–A63; A67. Preserve all existing owner authorities in the owner map.

## Scope

New SPEC-310 contract docs and deterministic fixtures only. Define intent, attempt grant, runtime manifest, Gateway invocation, workspace refs, capability refs, result/artifact refs, idempotency, errors and handoff freshness. Runtime uses managed Pi internally but remains subordinate to Python OpenAI Agents API agent-runtime authority. No new database, API route, permission scope, scheduler, ledger or approval system.

## Prerequisites

Section 01 current at the review SHA. Identify producer/consumer owner for each contract row; an unacknowledged proposal is not a stable integration contract.

## Deliverable and completion predicate

Contracts are versioned, deny by default, avoid physical implementation details in public product APIs, and define three separate identities: desktop user, Runner device and per-attempt execution credential. Native LLM requests use only the SmartAIHub Gateway grant. Non-Git workspace absence is valid. `llm:chat` grants no execution.

## Verification and evidence

Schema fixtures cover version negotiation, missing/revoked grant, cross-tenant refs, replay conflict, no-workspace read-only intent, direct-provider denial contract, stale contract rejection and status freshness. Record owner ACK or `WAITING_OWNER` per interface.

## Blocker challenge

For disagreement, write a small `CROSS_SPEC_CHANGE_REQUEST` with producer, consumer, semantic delta, negative cases and acceptance. Continue other contract rows; do not alter producer branches.
