# TDD Plan: Infrastructure Capacity Advisor V2

Tests are written before each implementation wave and run with focused commands.
Stubs below describe behavior; implementers should follow existing Vitest,
pytest, router-test, and browser-test conventions.

## Wave 0 — Baseline and migration guard

- Test migration SQL is additive/idempotent and creates the expected run,
  policy, coverage, and lifecycle fields.
- Test legacy assessment rows still parse after the new versioned envelope is
  introduced.
- Verification stub: target/disposable DB applies the migration and reads back a
  representative row; rollback documentation is checked manually.

## Wave 1 — Metric/source/namespace/policy contracts

- Test every policy area maps to one threshold/version and no UI-local threshold
  is required for status computation.
- Test unavailable, stale, truncated, and namespace-mismatched evidence stays
  explicit.
- Test status precedence for healthy, watch, action, critical, and insufficient
  data, including mixed-area results.
- Test unit conversion and formatting preserve bytes, percentages, durations,
  timestamps, and source/scope labels.

## Wave 2 — Collector and workload/storage evidence

- Test worker fleet normalization includes queued, active, stalled, oldest age,
  worker count, and configured/observed concurrency.
- Test long-running/background-job normalization includes duration, retries,
  failures, throughput, and a bounded sample.
- Test queue health restart/in-memory limitations are labeled rather than treated
  as durable history.
- Test allowlisted temp paths, traversal bounds, partial scans, missing mounts,
  Docker storage absence, and zero-versus-unavailable semantics.
- Test Node/Python source identity and mount scope produce a mismatch warning when
  they cannot be compared.
- Python unit test: system-health routing/collection delay is represented as
  monitoring coverage or uses the isolated queue contract.

## Wave 3 — Deterministic assessment/history/forecast

- Test threshold evaluation and overall status are deterministic for boundary
  values and policy versions.
- Test forecast requires minimum samples/span, calculates disk/temp growth from
  history, caps the horizon, and returns insufficient data when evidence is weak.
- Test history persistence stores policy/collector versions, coverage, decision,
  timestamps, and source namespace.
- Test retention compacts/deletes only eligible rows and is bounded/idempotent.

## Wave 4 — Skill contract and reconciliation

- Test input/output JSON schemas reject missing evidence keys, invalid severity,
  unsafe fields, unbounded payload markers, and unknown action values.
- Test sanitized prompt input contains no credentials, environment values, raw
  logs, request bodies, or private content.
- Test matching LLM evidence is preserved; mismatched current/threshold/severity/
  trend/horizon is corrected, downgraded, or omitted according to policy.
- Test malformed/unavailable LLM output produces a safe deterministic result and
  never invents a healthy recommendation.
- Test skill verification and schema fixtures remain synchronized.

## Wave 5 — Guarded execution and scheduler

- Test Admin confirmation creates exactly one run and duplicate requests return
  the existing active run/idempotency result.
- Test lifecycle transitions, timeout, retry/backoff, failure persistence, and
  safe recovery of a stale running row.
- Test manual and scheduled triggers call the same handler and preserve trigger
  metadata/requester/timezone.
- Test scheduler startup failure does not reject web startup, and subsequent
  retries do not duplicate assessments.
- Test last-attempt/last-success/next-run observability and audit events.

## Wave 6 — Admin UI completion

- Component tests cover default summary, tabs, exact metric/threshold display,
  temp mounts, workload details, history, and no-threshold messaging.
- Component tests cover loading, no assessment, running, success, watch/action/
  critical, insufficient, stale, partial, failed, query error, disabled, and
  refresh states.
- Test Admin-only route/menu behavior and manual confirmation/duplicate-run UX.
- Browser test at 390, 768, 1280, and 1440 widths verifies no horizontal layout
  failure, readable summary, table overflow handling, accessible tabs/buttons,
  focus rings, and no secret/private DOM content.

## Wave 7 — Integration and release proof

- Run focused web service/router/UI Vitest suites with required test environment.
- Run relevant Python pytest units.
- Run skill verification, formatting, changed-file diagnostics, and `git diff
  --check`.
- Apply/verify the migration in a target/disposable database and exercise one
  scheduled and one confirmed manual run with a stubbed LLM.
- Capture authenticated browser screenshots/evidence for each required state.
- Record full-repo typecheck baseline separately from changed-surface proof.
