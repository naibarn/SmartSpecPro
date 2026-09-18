# Section 02 — Grouping and aggregate view model

## Objective

Create a bounded, deterministic server-side projection that groups open work
and includes only scoped dependency predecessors.

## Implementation

1. Define `UserWorkerTaskGroup`, page metadata and pure grouping helpers.
2. Query open statuses, resolve dependency IDs in a bounded batch/closure and
   project safe summaries/events/artifacts.
3. Group by `planId`, then `workflowRunId`, then `single:<jobId>`.
4. Sort steps by valid ordinal, then dependency/creation order and job ID.
5. Aggregate state with failure/cancel/expiry precedence, keep any open group
   non-terminal, compute completed/total and bounded progress, select active
   step/latest event, and expose `hasMore`/`nextOffset` plus a bounded-source
   marker.

## Tests before code

- A dependency-linked plan is one group with completed predecessor and open
  steps ordered correctly.
- Workflow IDs and single-job fallbacks are stable and isolated.
- Every terminal/open state and missing step yields the documented aggregate.
- Repository calls are bounded and scoped.

## Completion evidence

Run monitor service tests including grouping cases and inspect the returned
shape for raw-field absence.
