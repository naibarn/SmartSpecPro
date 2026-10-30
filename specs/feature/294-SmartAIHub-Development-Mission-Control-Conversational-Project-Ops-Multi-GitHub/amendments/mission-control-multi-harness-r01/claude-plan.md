# Plan — Mission Control multi-Harness workbench

## Requirements mapping

- SPEC-294-MH-01: start via the canonical Task Control/Goal flow; no new scheduler. Current inline arbitrary-Harness dispatch is unverified and remains a gap.
- SPEC-294-MH-02: durable Job tabs, reload/deep-link selection, hide != cancel.
- SPEC-294-MH-03: selected Job output uses `workerJobs.developerExecutionEvents` durable sequence replay.
- SPEC-294-MH-04: display Runner connected/trusted/fresh/dispatch readiness independently; never silently change pinning.
- SPEC-294-MH-05: only existing canonical Job actions may be exposed.
- SPEC-294-MH-06: handle ten concurrent rows with search, sorting, overflow and mobile layout.

## Execution order

1. Fleet read model/UI state: inspect actual projected fields; use activity ordering, state counts, deep-link selection and an exact Task Control entry.
2. Session tabs/output: create overflow-capable tabs from the authorized Job page; select one Job and replay the existing durable event cursor only for that Job.
3. Verify and handoff: focused UI tests, relevant API tests, production build if feasible, update handoff evidence and mark only directly proven requirements.

## Guardrails

No schema migration, package, provider/auth change, synthetic activity, global tenant aggregation, new runner protocol, or production deployment. Preserve Task Control authority and pre-existing workspace dirty content. Keep live owner browser acceptance and real concurrent multi-Harness execution as unresolved unless observed.

## Definition of Done for this implementation slice

The console presents selectable real execution tabs, preserves selected identity after reload, shows actual output for the selected run, gives an honest readiness explanation and lets users reach the canonical create/start path. Focused tests cover empty/loading/error, multiple runs, selected-run output, and navigation. SPEC completion remains open for runtime multi-Harness execution, live receipts, and authenticated UAT.
