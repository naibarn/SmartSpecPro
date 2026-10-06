# Shared Handoff Contract

## Goal
Define one reusable machine-readable handoff and requirement ledger contract that composes with the repository's universal development lifecycle and never treats workflow/session state as a competing authority.

## Scope
Define identity, authority, disposition, lifecycle, continuation, requirements, evidence freshness, blockers, dependencies, integration, verification, deployment, acceptance, reconciliation provenance, and generated view semantics. No feature behavior or database queue is included.

## User-Facing Behavior
Operators can distinguish what a Spec intended, what exists, whether it remains relevant, and what action is justified, with confidence and evidence visible.

## Technical Constraints
Use versioned JSON contracts and the existing shared lifecycle state vocabulary. Canonical repository ref comes from policy. STATUS.md is generated. Manual authoritative decisions must survive inference and reruns.

## Dependencies
None. Source: project `requirements.md`; shared semantics: `skills/development-lifecycle/SKILL.md`.

## Outputs
Versioned manifest and requirement-ledger schemas, state policy, completion kernel contract, evidence provenance rules, fixtures, and contract tests.

## Edge Cases
Old Spec completed then superseded; one Spec partially absorbed by multiple successors; evidence valid for an older implementation SHA; deployment required but absent; explicit human disposition overriding inferred metadata.

## Error Handling
Invalid or contradictory state is surfaced with validation errors and `INVALID_OR_UNKNOWN`/`AUTHORITY_CONFLICT`; no default to COMPLETE or CONTINUE_REQUIRED.

## Testing Expectations
Schema validation, enum/state separation, transitions, evidence freshness, no-false-complete, history event-type and timestamp rules, and manual-decision preservation.
