# Section 03 — Managed Pi Isolated Spike

## Objective

Show that the internally managed Pi runtime can be privately pinned and hosted behind the approved Native Harness while every Native model call goes through SmartAIHub Gateway.

## Requirement IDs

R1.2 §A/§R; R1.3.1/5/6; A30, A65, A68. Reconcile R1.0 A01–A20 first.

## Scope

An isolated, non-production adapter/package experiment and focused tests. No user-facing Chat dispatch, no production flags, no provider fallback, no changes to current Companion branches and no second orchestration authority. Honor repository policy that OpenAI Agents API/Python is the canonical agent runtime.

## Prerequisites

Section 02 runtime/Gateway contract owner review; exact Pi source/version, package provenance and runtime compatibility; authorized isolated environment; Gateway test credentials bound to a non-production actor.

## Deliverable and completion predicate

Managed Pi loads from a verified immutable manifest, remains pinned for the attempt, and sends all inference to Gateway. Direct provider network use is technically denied. Cancellation, restart and error state reconcile against canonical attempt/fence. Flag remains off by default.

## Verification and evidence

Focused runtime and egress tests; include package digest/signature, runtime/ABI, resource profile, exact SHA and redacted Gateway attempt receipt. Mocks are `SPIKE_NOT_E2E`; no live acceptance inferred.

## Blocker challenge

If package provenance/ABI or Gateway authority is missing, keep the deterministic contract fixture and isolate only the blocked live spike. No substitute provider or Orca runtime.
