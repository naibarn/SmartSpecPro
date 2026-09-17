# Worker Job Self-Healing and Stuck-Job Reconciliation

## Goal

Ensure every non-terminal `worker_jobs` row has an evidence-backed next action. A
job may be resumed, retried, cancelled, expired, or held intentionally, but it
must not remain silently stuck or be mislabeled as waiting for an external
worker.

## Design

1. Keep PostgreSQL `worker_jobs` and the outbox as the source of truth.
2. Extend the existing unified reconciler instead of adding a competing queue
   scheduler.
3. Classify each open job from persisted evidence: lease/heartbeat, retry
   deadline, outbox/dispatch, external-wait metadata, cancellation request, and
   domain run state.
4. Apply only bounded, idempotent actions:
   - recover an expired lease through the existing retry policy;
   - publish due outbox work;
   - finalize a durable cancellation request;
   - cancel storyboard continuation work whose run is cancelled or cancelling;
   - resume an intentional internal hold only when the domain run is active;
   - fail malformed or expired unknown waits with operator review;
   - leave a verified user pause/provider wait untouched, while recording the
     reason and evidence.
5. Record a `RECONCILED` lifecycle event for every decision class so operators
   can see why the reconciler acted or deliberately waited. Event keys are
   deterministic to make repeated sweeps idempotent.
6. Make direct cancellation tolerant of state races. A terminal winner or an
   already persisted cancellation request is treated as success, not as a user
   error.

## Safety boundaries

- No unbounded retry.
- No automatic retry of an ambiguous provider submission.
- No cancellation of a storyboard run that is still paused for user repair or
  approval.
- No Docker/OpenSandbox changes.
- Existing unrelated worktree changes remain untouched.

## Acceptance criteria

- A cancelled storyboard run cannot leave continuation jobs in an immortal
  `waiting_external` state.
- `waiting_external` with a real provider operation remains inspectable and is
  resumed/failed only from provider evidence or an explicit timeout.
- Repeated reconciler runs do not duplicate lifecycle evidence or actions.
- The historical eight-job incident is automatically classified and cancelled
  on the next reconciler pass.
