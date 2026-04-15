# Section 02 - Routine Scheduler, Queue, and Checkpoints

## Purpose

This section makes Feature 080 operationally real by defining the durable routine scheduler, queue semantics, ownership claims, checkpoint model, and recovery behavior for persistent role work.

The goal is to ensure that a role agent can wake, claim work, checkpoint progress, recover from failure, and continue safely across restarts, deploys, and duplicate trigger delivery without relying on one immortal process.

## Why this section comes early

- The monitor and role detail views cannot tell the truth about current role state unless routine-cycle boundaries and checkpoints exist first.
- Role-to-workpack resolution should occur inside a durable cycle boundary, not from a loose timer callback.
- Long-running autonomy claims are unsafe unless lease ownership, idempotency, and stale-cycle recovery are defined early.
- Later learning, promotion, and incident logic need durable routine-cycle evidence rather than ephemeral background job state.

## Files in scope

- `apps/web/server/services/roleRoutineSchedulerService.ts` new scheduler and queue orchestration service
- `apps/web/server/services/roleCheckpointService.ts` new checkpoint helper or module inside scheduler ownership
- `apps/web/server/jobs/roleRoutineSchedulerJob.ts` new background wake-and-reconcile job
- `apps/web/server/_core/index.ts` wiring for scheduler startup and shutdown
- `apps/web/server/services/__tests__/roleRoutineSchedulerService.test.ts` new scheduler tests
- `apps/web/server/services/__tests__/roleCheckpointService.test.ts` new checkpoint tests

## Scheduler model

Feature 080 should model role continuity as a sequence of durable routine cycles rather than one endless execution thread.

Each routine wake should follow this shape:

1. Evaluate schedule or event trigger.
2. Materialize a durable queue item with a deterministic idempotency key.
3. Claim or lease the queue item through durable ownership semantics.
4. Create a `role_routine_run` record if an eligible cycle does not already exist for that idempotency boundary.
5. Resolve the workpack target inside that cycle.
6. Launch bounded execution through Feature 079 or another approved existing runtime path.
7. Write checkpoints as state changes occur.
8. Mark the cycle succeeded, blocked, failed, quarantined, or awaiting approval.

This flow should be queue-backed and durable before any UI assumes the feature can operate for weeks or months.

## Wake sources and trigger handling

The first scheduler wave should support:

- time-based schedules
- inbox polling windows
- queue-threshold wakes
- connector event wakes
- exception follow-up timers
- KPI breach triggers

Every wake source should normalize into one durable queue item shape so the scheduler does not need a different recovery model per trigger type.

## Idempotency and concurrency rules

Every queue item should carry an idempotency key derived from:

- tenant id
- role id
- routine id
- trigger window or event key
- selected role-workpack binding family when known

Each routine must declare a concurrency policy:

- `singleton`
- `allow_overlap`
- `partitioned_by_key`

Implementation rules:

- `singleton` routines may not run more than one live routine cycle at a time.
- `allow_overlap` routines may run multiple cycles, but each cycle must still have distinct idempotency boundaries.
- `partitioned_by_key` routines may overlap only when the partition key differs.
- Duplicate wake delivery should coalesce rather than create unsafe duplicate cycles.

## Lease ownership and multi-node safety

The scheduler must not assume only one process or one node exists.

Each queue claim should therefore include:

- claimant identity
- claim timestamp
- heartbeat timestamp
- expiry timestamp
- claim state

Multi-node safety rules:

- only one valid claimant may own a given queue item at a time
- stale claims should expire into recovery or quarantine logic
- claim renewal should be explicit and heartbeat-backed
- recovery should write new routine-cycle state rather than silently overwriting the old owner

## Capacity and service-level envelope

The scheduler design should be implementation-locked enough that infra decisions stay consistent across services and deployments.

Before implementation begins, this section should require an explicit table for:

- wake latency objective by routine tier
- checkpoint freshness objective by role criticality
- heartbeat timeout and stale-lease thresholds
- maximum concurrent routine cycles per role
- maximum active routine cycles or queue depth per tenant cohort
- backpressure behavior when queue depth, wake lag, or active-cycle count exceeds the policy envelope
- partitioning or shard strategy for queue ownership
- monitor freshness expectation for "what is this role doing now?" queries

Exact defaults may vary by cohort, but these capacity and SLO categories should not be left implicit.

## Checkpoint model

`role_checkpoint` should be a durable continuity snapshot, not a second execution ledger.

Each checkpoint should capture:

- active or last-completed `role_routine_run` id
- current objective summary
- active queue summary
- recent decisions
- pending approvals
- next wake conditions
- resume cursor or progress markers
- health and recovery status
- last successful workpack outcome summary

Checkpoint writes should be triggered by:

- cycle start
- workpack dispatch
- approval boundary
- exception creation
- recovery or quarantine
- cycle completion

The checkpoint should never float independently of routine-cycle context. It should always point to the active or last completed `role_routine_run`.

## Watchdog and stale-cycle handling

The scheduler should include a watchdog path that evaluates:

- checkpoint freshness
- queue progress
- stale lease ownership
- repeated failures
- silent periods for critical roles

Recovery outcomes should be explicit:

- `resume`
- `retry`
- `pause`
- `quarantine`
- `needs_review`

If the system cannot resume safely, it should quarantine the cycle and open an operator-visible issue rather than guessing.

## Integration with existing runtime surfaces

This section should not implement workpack resolution details yet, but it must shape the execution boundary so later sections have a safe substrate.

- Scheduler ownership ends at "create or resume a durable routine cycle and request a resolved execution target."
- Feature 079 remains authoritative for workpack execution, replay, incidents, and readiness.
- Existing background job wiring and worker-fabric semantics should be reused where possible rather than introducing a brand-new task runner abstraction.

## Implementation guidance

1. Introduce durable queue entities and lease semantics before writing rich monitor views.
2. Keep trigger normalization simple so every wake source produces one queue-item shape.
3. Make `role_routine_run` the durable cycle boundary that all scheduler and monitor code can reference.
4. Ensure checkpoints are frequent enough for safe resume but compact enough to avoid turning into raw transcript dumps.
5. Make quarantine and recovery explicit first-class states, not ad hoc status strings hidden in scheduler logs.
6. Keep scheduler services thinly integrated with existing server job infrastructure so startup, shutdown, and testability remain straightforward.
7. Define backpressure and capacity behavior before broad rollout so scheduler overload downgrades safely instead of creating unsafe overlap.

## TDD expectations

Write the tests for this section before implementation work lands.

- Test: time-based, event-based, queue-threshold, and follow-up triggers all normalize into the same durable queue-item contract.
- Test: duplicate wake delivery coalesces by idempotency key instead of creating duplicate routine cycles.
- Test: `singleton`, `allow_overlap`, and `partitioned_by_key` policies behave as declared.
- Test: lease claiming allows only one active owner for a queue item at a time.
- Test: stale claims expire into recovery or quarantine logic rather than being overwritten silently.
- Test: routine-cycle creation always occurs inside a durable boundary before workpack execution starts.
- Test: checkpoint writes always reference the active or last-completed `role_routine_run`.
- Test: restart or deploy recovery can reconstruct current role continuity from queue items, routine cycles, and checkpoints.
- Test: watchdog evaluation downgrades to pause, quarantine, or review when freshness or progress rules fail.
- Test: declared scheduler capacity ceilings and wake-latency categories produce predictable backpressure and downgrade behavior under load.

## Done when

This section is complete when the system can wake role routines durably, claim work safely across nodes, checkpoint role continuity explicitly, and recover or quarantine stale cycles without depending on one long-lived process.
