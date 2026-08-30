# Implementation Specification Synthesis

Feature 152 is a durable assurance workflow for vertical-drama story
generation. It wraps the existing generator and Feature 132 quality contracts
in a versioned run contract with immutable input snapshots, bounded context,
deterministic validation, semantic/plan alignment review, targeted repair, and
an explicit final gate.

## Required invariants

1. One active parent run per tenant/series/run key; idempotent enqueue and API
   operations.
2. Postgres is the business source of truth. Redis/BullMQ may lose delivery but
   must not create a false success.
3. Every attempt has a contract hash, source snapshot, checkpoint, lease/fence,
   and event cursor.
4. Candidate story output is never visible as final until all blocking rule
   packs and plan-alignment checks pass.
5. Repairs are bounded, targeted, impact-checked, and approval-gated for
   cross-episode/structural scope.
6. Credit reservations and provider calls use durable idempotency and an
   explicit reconciliation state for unknown outcomes.
7. API and UI expose the real state and a resumable action; transport success is
   not logical completion.

## Delivery order

The implementation is split into nine sections. Sections 01-03 establish the
shared and durable foundation. Sections 04-05 integrate the story quality loop
and server entry points. Section 06 completes the user-facing state machine.
Section 07 is the optional Feature 151/Agents adapter. Sections 08-09 close
rollout, observability, and proof gaps.

## Explicit non-deliverables

No production migration, provider live run, browser session, or Agents SDK
activation is claimed by local tests. The implementation must leave a safe
feature-flagged rollout path and report these proof boundaries.
