# Celery Media Doctor and Fail-Closed Admission

## Problem

The Media History task for user 1 was legitimately owned by that user and was
the only active task for that user. It remained pending because four messages
were present in Redis queue `media`, but no worker consumed that queue. The
existing API health check treated any responsive Celery worker as a media
worker, so the presentation worker made admission appear healthy. The
systemd `ExecStartPost` for the media Compose stack ignored Compose failures,
which made the outage silent.

## Goals

- Admit async image work only when a worker is actually subscribed to `media`.
- Never leave a newly-created task pending when dispatch fails before provider
  submission.
- Automatically restore `celery-media` and `celery-beat` when their managed
  containers stop or are missing.
- Keep recovery bounded and safe: operate only on the two named SmartSpecPro
  service containers, never stop a different Compose project, and never submit
  a provider retry from the doctor.
- Keep the existing per-user three-image dispatcher and beat-based stuck-task
  recovery as the source of task-level recovery.

## Design

### API admission

`_has_responsive_celery_worker()` becomes fail-closed. It returns true only
when Celery remote control reports a worker with an active queue named exactly
`media`; a successful generic ping is not sufficient. The image endpoint runs
this check before inserting `media_tasks`. If the worker disappears during
dispatch, the created row is marked failed immediately and the caller receives
503, allowing the existing Node credit reservation/refund path to reconcile
without a hidden pending row.

### Doctor process

`scripts/celery-doctor.sh` supports a single check and a long-running watch.
Every interval it:

1. checks Docker and the exact `smartspec-celery-media` and
   `smartspec-celery-beat` containers;
2. starts or recreates only those services with
   `docker compose -p smartspecpro -f docker-compose.media.yml up -d --no-deps`;
3. verifies the containers are running and logs a bounded failure;
4. leaves a running but unhealthy media process alone to avoid interrupting a
   provider request that might be non-idempotent; Docker's restart policy and
   the next doctor pass handle stopped processes;
5. relies on the restored beat plus the existing database recovery task to
   re-dispatch stale claims and unclaimed work.

The doctor uses a lock so overlapping systemd/manual invocations cannot race.
It has no database mutation, provider call, credit mutation, or broad Docker
cleanup operation.

### Service orchestration

The infrastructure unit starts only `celery-media` and `celery-beat` as its
optional media post-start action. This avoids a failure in an unrelated stale
presentation container preventing the required services from starting. The
doctor is a separate `systemd` service with `Restart=always`, so a failed
doctor process is itself restarted and its log is visible in journald.

### Verification

- Unit tests cover the queue-specific health predicate and dispatch failure
  cleanup.
- Shell tests cover doctor repair, no-op healthy checks, and refusal to act on
  containers owned by another Compose project.
- Runtime verification checks the worker queue subscription, beat process,
  Redis `media` backlog, and the affected database task after startup.

