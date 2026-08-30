# Infrastructure Capacity Advisor V2 Hardening

## Goal

Make the Admin Capacity Advisor trustworthy enough to answer, in plain Thai,
whether the current Home Server is healthy, should be watched, should be
optimized/expanded, or should be evaluated for Cloud migration. The first tab
must remain a simple Hybrid summary; deeper evidence belongs in separate tabs.

## Existing baseline

The repository already has a first implementation consisting of a capacity
collector, a daily BullMQ job, Admin-only monitoring procedures, a persisted
capacity assessment table, an `infrastructure-capacity-advisor` skill bundle,
and a three-tab Admin panel (`สรุปสถานะ`, `รายละเอียดระบบ`, `ประวัติการประเมิน`).
The audit found that this baseline is not yet decision-grade because it lacks
real worker/job concurrency and duration evidence, deterministic forecasts,
centralized thresholds, LLM evidence reconciliation, operational safeguards,
and complete freshness/error/UI coverage.

## Approved product behavior

- The summary tab is the default and shows one overall status, the exact current
  figures used, threshold context, detected problems, and recommendations.
- Detail tabs expose system metrics, workload/background-job evidence, storage
  and temp-file evidence, and assessment history without overcrowding the
  summary.
- An assessment can run automatically once per day and manually after an Admin
  confirms the action.
- LLM output is advisory only. It cannot mutate infrastructure, delete files,
  resize services, or migrate data.
- Unknown, stale, partial, or cross-namespace metrics must never be presented as
  healthy. The UI must explain coverage and freshness.
- No credentials, environment values, request payloads, raw logs, or private
  content may be sent to the LLM.

## V2 gaps to close

### P0 decision correctness

- Add a normalized workload snapshot: queued, active, stalled, oldest queued age,
  worker count, configured/observed concurrency, throughput, retry/error rate,
  and long-running jobs. Reuse existing worker fleet and scheduled-job sources
  instead of inventing a second counter.
- Establish metric identity and namespace: record host/container identity,
  mount scope, source, timestamp, and collection quality so Node and Python
  values are not silently compared when they describe different filesystems.
- Persist enough history to compute deterministic disk and temp growth rate and
  a bounded time-to-threshold forecast. LLM may explain the result but may not
  invent current values, thresholds, or horizons.
- Centralize capacity policy thresholds and use the same policy in collector,
  deterministic status, prompt evidence, and UI. Existing Ops anomaly thresholds
  must either be mapped explicitly or remain separate with documented semantics.
- Reconcile every LLM watchlist item against authoritative snapshot evidence;
  reject or downgrade mismatches and mark unsupported claims as unknown.

### P1 operational reliability

- Make manual execution asynchronous or bounded with an explicit run state,
  timeout, deduplication/concurrency lock, and safe retry behavior.
- Make the daily scheduler observable and idempotent, including last attempt,
  next run, trigger, duration, and failure reason. Scheduler/LLM outages must not
  prevent web startup.
- Add retention for large snapshots/assessment JSON and bounded prompt input with
  an explicit completeness indicator when data is truncated.
- Separate monitoring health traffic from a potentially congested media queue or
  document the limitation and expose it as a coverage warning.
- Add an Admin audit trail for manual run confirmation and result access where the
  existing audit conventions support it.

### P1/P2 Admin UX and proof

- Add metric coverage/freshness/namespace banners and explicit loading, empty,
  error, stale, partial, and insufficient-data states.
- Render temp-mount disk evidence and real queue/workload details in the detail
  tabs; never show a threshold of zero when a queue threshold is unavailable.
- Split the large panel into summary, detail, workload/storage, and history
  responsibilities plus pure status/formatting helpers.
- Add focused unit/router/contract tests and a browser-authenticated visual pass.
- Verify the migration against the target database and record deployment/rollback
  gates before calling the feature live.

## Technical constraints and assumptions

- Follow existing TypeScript, React, tRPC, Drizzle, BullMQ, Zod, and Vitest
  conventions. Do not add dependencies unless the repository already has a
  supported alternative that cannot satisfy the contract.
- Initial policy scope is the SmartSpecPro Home Server deployment and its
  observable worker/container domains. The system must label container-scoped
  metrics rather than pretending they are host-wide.
- Daily schedule remains in the server's configured timezone until an Admin
  timezone setting exists; the plan must make this visible in run metadata.
- Keep the threshold policy server-owned with safe defaults; Admin editing of
  thresholds is out of scope for this delivery unless existing policy storage
  makes it low risk.
- Use a bounded retention default (full snapshots for a short operational
  window, compact historical summaries for a longer window) and make the exact
  values configuration constants documented in the plan.
- There is no automatic migration or upgrade action. Recommendations end in a
  human-reviewed next step and an evidence list.

## Acceptance criteria

- An Admin can open the first tab and understand the current verdict, exact
  figures, thresholds, detected risks, evidence coverage, and next action within
  one screen without opening details.
- The details show CPU/RAM/disk/temp, worker queue/concurrency, long-running and
  background jobs, recent history, source/namespace, and forecast evidence, or
  clearly state unavailable/partial data.
- Daily and manual runs share one guarded execution path and cannot create
  duplicate overlapping LLM assessments.
- The server determines status, severity, thresholds, and forecasts from trusted
  data. The LLM can summarize and recommend but cannot override those values.
- A stale, incomplete, namespace-mismatched, failed, or missing assessment is
  visually distinct from healthy.
- Focused tests cover collector normalization, threshold/status/forecast logic,
  LLM reconciliation, route authorization and run guards, scheduler behavior,
  migration shape, menu entry, and UI state rendering.
- Target-database migration verification, focused checks, and authenticated
  browser evidence are recorded; baseline-wide unrelated typecheck failures are
  reported separately.

## Out of scope

- Automatic cloud provisioning, server resizing, data migration, or file cleanup.
- Replacing the existing general monitoring dashboard.
- Full Prometheus/Grafana adoption.
- Arbitrary filesystem traversal or sending raw logs/private payloads to an LLM.
