# Section 03 — Protected router contract

## Objective

Expose task groups to authenticated callers and improve new plan metadata
without adding an execution path.

## Implementation

1. Add `workerJobs.taskGroups` with bounded `limit`/`offset` input and caller
   tenant/user context.
2. Keep `list`, `detail` and `cancelQueued` backward compatible.
3. Add `stepIndex` and `totalSteps` to orchestration metadata emitted by
   `buildJobDefinitions`, preserving plan hash, selected offer and dependency
   fields.

## Tests before code

- Protected router passes caller scope and validates input.
- Response includes groups, ordered jobs and continuation metadata.
- New plan definitions contain stable step order while old dependencies remain
  unchanged.

## Completion evidence

Run worker-jobs router tests and orchestration contract tests only.
