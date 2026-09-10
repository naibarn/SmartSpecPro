# Celery Admin Dashboard, Safe Recovery, and Duplicate-Container Guard

## Problem and scope

The media queue can appear healthy when only a presentation worker responds to
Celery ping. Media tasks then remain pending while credits are already reserved.
The host has also previously accumulated stale or duplicate Docker Compose
containers, and an ignored Compose failure made the outage persist without an
operator signal.

This change adds an admin-only dashboard surface, a runtime status contract,
safe automatic recovery for stale image claims, critical admin feedback, and
duplicate-container protection. It does not expose queue data to ordinary
users and does not add a second provider retry path.

## Operating policy

- Inspect every 60 seconds; a claimed image task is suspicious after 3 minutes
  in `pending` without an external provider task id.
- A task is eligible for automatic re-dispatch only when its Celery state is
  `PENDING`, it has no provider task id, its owner has no other image task in
  `processing`, and the current media worker is subscribed to `media`.
- Re-dispatch uses the existing `celery_task_id`, PostgreSQL per-user advisory
  lock, and row claim guard. Duplicate delivery is therefore convergent at the
  database boundary; a provider task id always wins and is never submitted a
  second time.
- If any inspection is unavailable or contradictory, the doctor reports the
  condition and does not re-dispatch or mutate user task state.
- One fingerprinted Admin Feedback ticket is opened at `critical` priority;
  repeated observations update the same ticket rather than flooding admins.
- The doctor may start/recreate only the exact `celery-media` and `celery-beat`
  services belonging to Compose project `smartspecpro`. It refuses to act when
  a same-service container belongs to another project or when duplicate
  service containers make ownership ambiguous.
- No broad `docker compose down`, `docker rm`, provider call, credit mutation,
  or automatic restart of a running worker with active tasks is allowed.

## Backend contract

Add an exact-admin-only tRPC contract under infrastructure:

- `getCeleryMediaDoctorStatus({ userId?: number })` returns timestamp,
  `celery-media` and `celery-beat` runtime state, queue depth, active/unclaimed
  counts, duplicate-container findings, the selected user's queue, and a
  bounded list of per-user queue summaries with oldest pending age and stale
  flag.
- `runCeleryMediaDoctor()` runs the fixed `scripts/celery-doctor.sh --once`
  command with a timeout, then returns the post-check status. No command or
  path is accepted from the browser.

The server check is exact `role === "admin"`; `system_agent` and
`domain_admin` do not receive this data or mutation even if broader admin
procedures allow them elsewhere.

## Automatic recovery and feedback

The existing Celery beat recovery schedule changes to one minute. Its claimed
pending phase uses the three-minute policy and performs the safe eligibility
checks above before re-publishing the same Celery id. It invokes the existing
system auto-report client with a stable source and a critical priority so the
existing fingerprint/dedup and Admin Feedback notification fan-out are reused.

The Node process also has a lightweight startup monitor for dashboard/runtime
visibility and stale feedback fallback. It is best-effort and must never block
the web server. The systemd doctor remains the low-level self-healing process;
the Node monitor does not independently create Docker containers.

## Dashboard UX

On the authenticated main Dashboard, render a compact admin-only card near the
top. It contains:

- two explicit service rows with healthy/degraded/stopped state, health, and
  last checked time;
- queue totals for Redis and database (`pending`, `processing`, stale count);
- a user selector/list showing the selected user's active image queue and age;
- a bounded all-user incident list ordered by oldest suspicious task;
- `ตรวจสอบและกู้ระบบ` with loading, success, failure, disabled, and focus states.

The card refreshes every 30 seconds, preserves the rest of the dashboard when
the status endpoint is unavailable, and links to Admin Feedback for an urgent
incident. It uses existing dashboard cards, badges, icons, translations, and
accessibility conventions.

## Duplicate Docker protection

The doctor checks Compose labels and service cardinality before repair. A
healthy single managed instance is a no-op. A stopped/missing managed instance
is repaired by service-scoped Compose `up --no-deps`; an ambiguous duplicate or
foreign project is surfaced as critical and left untouched. The compose
startup template also starts only the required media/beat services, avoiding a
stale unrelated presentation container from blocking them.

## Verification

- Unit tests cover exact-admin authorization, status aggregation, duplicate
  detection, safe-repair eligibility, critical feedback dedup input, and the
  dashboard states/button behavior.
- Python tests cover the three-minute pending recovery rule, provider-id and
  active-task safety gates, and same-Celery-id re-dispatch.
- Shell tests cover healthy no-op, stopped-service repair, foreign-project
  refusal, and duplicate refusal.
- Runtime checks verify both containers, media queue subscription, queue depth,
  Admin Feedback path, and the affected user's task state without injecting a
  live worker crash while provider work is active.

