<!-- SPLIT_MANIFEST
01-shared-handoff-contract
02-dynamic-spec-inventory
03-evidence-reconciliation-engine
04-global-views-and-migration
05-workflow-lifecycle-integration
06-exhaustive-reconciliation-proof
END_MANIFEST -->

# Project Manifest

## Overview

Build one canonical, evidence-backed handoff model and reconcile repository Specs into it. Normative feature requirements remain immutable during legacy reconciliation. The raw discovery count is not a canonical count; configured roots and alternate-root classification decide record kinds dynamically.

## Requirement ownership

| Split | Owns | Depends on | Completion evidence |
|---|---|---|---|
| 01 | Shared schema, lifecycle semantics, authority/disposition/continuation/confidence model, validator | None | Contract/schema tests; false-completion and state-separation tests |
| 02 | Configured roots, alternate-root candidate discovery, duplicate/malformed inventory, CLI inventory | 01 | Fixtures prove all candidates represented and IDs are not allowlisted |
| 03 | Evidence capture, requirement ledger, authority/supersession graph, relevance/continuation assessment, history semantics | 01, 02 | Policy and graph tests; deterministic/idempotent reconciliation |
| 04 | Per-Spec artifacts, generated STATUS, global index/report/queues, stale detection, repository migration | 01, 02, 03 | Global equality and generated-drift invariants over discovered canonical records |
| 05 | Deep-workflow, Orchestra, session-finish, integration-controller, verification/deployment adoption | 01 | Contract tests and updated skill behavior scenarios |
| 06 | Exhaustive reconciliation evidence, consolidated ambiguity review, 30+ scenario suite, final proof | 02, 03, 04, 05 | Reports/counters, all available tests, explicit external evidence boundaries |

## Execution order

1. Split 01 establishes the one shared contract.
2. Splits 02 and 05 can proceed after the contract is frozen, with disjoint ownership: discovery/tooling versus lifecycle skill files.
3. Split 03 follows inventory contracts and owns deterministic reconciliation policy.
4. Split 04 follows inventory and reconciliation, owns generated data only, and never writes normative Spec sources.
5. Split 06 closes repository-wide migration and invariant proof after all prior outputs exist.

No Spec-by-Spec parallel dispatch is planned. Each reconciliation batch is deterministic and bounded by filesystem/tool resource limits.

## Cross-cutting constraints

- No runtime feature code, retired architecture, or normative legacy Spec edits in the reconciliation phase.
- No age-only authority or relevance rules; no fabricated historical timestamps.
- Manual authoritative decisions survive reruns and are separately identified from inferred fields.
- All unresolved/low-confidence items remain visible and actionable.
- Completion, verification, integration, deployment, and acceptance are distinct evidence-backed states.
- Heavy application verification is not a prerequisite for a metadata-only integration checkpoint.
