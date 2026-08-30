# Research Findings

## Research auto-decision

- Codebase research: yes. This is an existing git repository with TypeScript,
  React, Python, Drizzle, BullMQ, and Vitest code.
- Web research: skipped. The plan follows repository-local contracts and does
  not require a new external API or a time-sensitive library decision.
- SocratiCode: unavailable in this runtime, so the required discovery fallback
  was targeted `rg`, file reads, existing focused test commands, and the prior
  audit evidence. No broad rewrite or generated index was used.

## Current implementation map

The first version is already present in:

- `apps/web/server/services/capacityAssessmentService.ts`: collects metrics,
  current monitoring data, service/runtime checks, queue health, temp paths, and
  Docker storage; assembles the skill input; persists the result.
- `apps/web/server/jobs/capacityAssessmentJob.ts`: schedules one daily BullMQ
  assessment at 03:15 server time and catches startup/scheduler failures.
- `apps/web/server/routers/monitoring.ts`: Admin-only latest/history/manual-run
  procedures.
- `apps/web/client/src/components/admin/CapacityAdvisorPanel.tsx`: Hybrid UI
  with summary, system detail, and history tabs.
- `apps/web/drizzle/schema.ts` and migration `0233_infrastructure_capacity_advisor.sql`:
  persisted assessment row with trigger, requester, status, snapshot, result,
  and error fields.
- `apps/web/skills/infrastructure-capacity-advisor/`: versioned input/output
  schemas, rubric, and skill instructions.

## Relevant existing sources to reuse

- `apps/web/server/services/workerFleetService.ts` already exposes queued,
  active, stalled, oldest queued timestamp/age, worker data, and related fleet
  health. The capacity collector currently does not include this complete
  overview.
- `python-backend/app/api/scheduled_jobs.py` exposes scheduled-job history with
  duration, retry, and error fields backed by `scheduled_job_runs`. This is the
  strongest existing source for long-running background-job evidence.
- `python-backend/app/tasks/system_health_task.py` uses `psutil` to publish CPU,
  memory, disk, and process metrics. Node-side collection and Python-side
  collection can see different container/mount namespaces; the snapshot needs
  explicit source and namespace identity.
- `apps/web/server/services/monitoringService.ts` has existing anomaly logic with
  thresholds that differ from the new Capacity Advisor UI. The new capacity
  policy must be centralized and its relationship to anomaly thresholds must be
  documented.
- `apps/web/server/services/queueHealthMonitor.ts` provides in-memory queue
  health. It is useful as a signal but cannot be treated as durable workload
  history because it resets on process restart.
- `python-backend/app/core/celery_app.py` routes the periodic system-health task
  to the media queue. A media backlog can therefore delay the very data used to
  judge capacity; the plan must either isolate this task or label coverage as
  delayed.

## Existing execution and data risks

- `runCapacityAssessment` currently performs collection, LLM execution, and
  persistence synchronously from the Admin mutation. A slow or unavailable LLM
  can hold the request open and manual clicks can overlap.
- The daily scheduler is best-effort at web startup and has no durable run
  record for scheduler attempt/next-run observability.
- The snapshot is bounded by a fixed number of metric/check rows and the prompt
  is truncated by character count. Truncation is not currently surfaced as a
  completeness signal.
- Temp storage is currently a point-in-time scan; without persisted comparable
  samples it cannot produce a reliable growth forecast.
- LLM output is Zod-parsed but its watchlist values are not fully reconciled to
  authoritative server metrics and policy thresholds.
- The current UI hardcodes CPU/RAM/disk thresholds and does not render temp-mount
  capacity, all freshness/coverage states, or query errors clearly.

## Testing conventions

- Web tests use Vitest. `apps/web/package.json` exposes `npm test` with the
  required JWT test secret; targeted runs use `npm exec vitest run <paths>`.
- Existing service tests live under `apps/web/server/services/__tests__`, and
  shared/menu tests live under `apps/web/shared/__tests__`.
- Python tests use pytest under `python-backend/tests`, including unit coverage
  for `system_health_task`.
- The repository's full TypeScript check is currently baseline-noisy. Focused
  changed-surface checks must be reported separately from unrelated errors.
- Existing migration verification is constrained by a pre-existing Drizzle
  snapshot parent collision around migrations 0146/0147; target-DB migration
  proof is still required for migration 0233 and any follow-up migration.

## Prior validation evidence

- Menu test passed (9 tests).
- Skill JSON schema parsing and formatting checks passed.
- Full web check completed without new errors in the touched Capacity Advisor
  files, but unrelated baseline diagnostics remain.
- Router test attempt was blocked by environment validation for missing
  `JWT_SECRET`/`CONTROL_PLANE_API_KEY`; this is an environment gate, not proof
  that the route is correct.
- No target database migration, authenticated browser pass, deployment, or live
  LLM/provider acceptance test has been completed.

## Design decisions derived from research

1. Build one server-owned normalized snapshot and deterministic assessment layer;
   treat LLM output as explanation/recommendation, not as the source of truth.
2. Reuse worker fleet and scheduled-job sources rather than introducing duplicate
   counters, while retaining explicit `unknown` when a source is unavailable.
3. Keep container/host namespace metadata in every metric group so Cloud-move
   decisions are not based on an accidental container-local disk view.
4. Make asynchronous guarded runs the default path for both manual and daily
   triggers; the mutation should acknowledge a run, not wait indefinitely for an
   LLM response.
5. Split the current UI by responsibility and add a coverage/freshness contract
   before adding more charts.
