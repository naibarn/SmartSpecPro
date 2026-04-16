# Section 01: Governed Context Fabric And Memory

## Purpose

Build the governed context and memory foundation for the enterprise platform roadmap. This phase creates the contracts that later phases rely on for tracing, evaluation, pack installation, and readiness reporting.

## Goals

- define scoped context assembly for agent and operator surfaces
- define trust classes for hot, durable, archived, derived, and untrusted items
- ensure retrieval is explainable, tenant-scoped, and role-aware
- prevent archived or untrusted content from being silently promoted into trusted hot context

## Required Outcomes

- deterministic context assembly for the same input set
- explicit inclusion/exclusion reasons for each context item
- tenant isolation and role boundaries enforced in every retrieval path
- freshness and trust scoring available as first-class metadata
- archived/untrusted content remains recoverable but not implicitly trusted

## Implementation Notes

- keep context assembly deterministic whenever possible
- treat user-provided, external, and archived content as untrusted until a policy-approved promotion path exists
- expose why items were selected, redacted, excluded, or downgraded
- keep the contracts compatible with the existing Work OS, Teams, and registry layers

## Primary Codebase Touchpoints

- `apps/web/server/services/monitoringService.ts`
- `apps/web/server/services/workOsService.ts`
- `apps/web/server/services/runEngine.ts`
- shared context/memory helper modules used by Work OS and Teams

## Security Requirements

- no cross-tenant context leakage
- no cross-role escalation through retrieval
- redact sensitive payloads before returning context where policy requires it
- preserve auditability for every context decision

## Test Plan

- same inputs produce the same scoped context and explanation output
- low-trust and archived items are not auto-promoted to hot context
- tenant boundaries hold under mixed-role retrieval
- explainability output includes the inclusion/exclusion reason for every item

## Dependencies

- Requires the Work OS / registry / auto-team foundation already shipped in 082, 083, 095, and 096
- Unblocks tracing, evaluation, pack governance, and readiness reporting
