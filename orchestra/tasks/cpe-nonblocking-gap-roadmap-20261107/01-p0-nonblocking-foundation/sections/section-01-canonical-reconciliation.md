# Section 01 — Canonical Reconciliation

## Requirement IDs

P0-SPEC, NB-01–NB-08, CPE-01–CPE-16

## Objective

Establish which existing registered feature owns each remaining CPE requirement and reconcile normative conflicts before code changes.

## Owned scope

Read-only first: `specs/_status/spec-index.json`, handoffs for Features 137/138/140/149/150/155/157/167/170/173/175 and Quick 167/186/191/298, current source and tests. If ledger updates are needed, use the canonical existing writer and only the task-owned requirements after evidence is collected.

## Prerequisites

Canonical source preflight at `620bbe26c65f53d3026a67f9edd03818c51ee664`; preserve unrelated dirty files.

## Tasks

1. Map every CPE-01..16 and non-blocking acceptance item to source, existing tests and canonical requirement IDs.
2. Compare Feature 157's `provider_ready`, `awaiting_action`, `succeeded`, media QC and assembly gates to the critical CPE directive.
3. Mark source implementation, verification evidence, and canonical disposition as separate facts.
4. Record only genuine absent behavior as implementation work; classify stale evidence separately from missing code.

## Completion predicate and evidence

The matrix has no orphaned acceptance item, duplicate active owner, or unsupported completion claim. The normative decision states that advisory CPE findings cannot block image/video creation while existing hard controls remain hard. Evidence is a reviewed mapping in the existing canonical handoff or task-owned mapping file.

## Fallback and blocker strategy

If the ledger state is unresolved, keep it unresolved and plan exact source/test reconciliation. Do not invent `PASS`, create a new SPEC ID, or change old history.

## Focused tests and evidence

No behavior change is planned in this section. Produce a requirement-to-source/test/owner table for CPE-01–16 and NB-01–08, quote the canonical status and handoff revision for each candidate owner, and mark stale evidence separately from absent behavior. Verify the final table has no orphan row or duplicated active owner.

## Unresolved assumptions

The existing Feature/Quick Spec owners can accept reconciled evidence through their current handoff mechanism. Confirm this from repository tooling before modifying canonical ledgers; if not, leave ledger state unchanged and record the blocker.
