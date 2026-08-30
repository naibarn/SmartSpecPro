# Implementation Plan: Infrastructure Capacity Advisor V2

## Outcome and delivery boundary

Harden the existing Admin Capacity Advisor so an Admin can understand the
current Home Server decision in one glance and drill into trustworthy evidence.
The server will collect workload and storage evidence, calculate deterministic
status/forecast values, ask the existing skill for an explanation, reconcile the
answer, and expose one guarded run lifecycle for both scheduled and manual
triggers.

The delivery does not provision Cloud, resize services, delete files, migrate
data, or replace the general Monitoring dashboard. Every recommendation ends in
a human-reviewed action.

## Invariants

- Server-owned snapshot, thresholds, coverage, freshness, namespace, status,
  severity, and forecast values are authoritative.
- The LLM may summarize evidence and recommend an action, but cannot change a
  metric, threshold, severity, horizon, or missing-data state.
- `unknown`, `stale`, `partial`, and `namespace_mismatch` are explicit states and
  never collapse to healthy.
- Manual and scheduled runs use the same service/queue path, with a durable run
  state and an overlap guard.
- No secret, environment value, request body, private content, or raw log is
  placed in the skill input, persisted snapshot, UI, or error response.
- Temp inspection remains allowlisted, bounded, and non-destructive.

## Planned delivery waves and dependency order

### Wave 0 — Baseline, contracts, and migration guard

Record the dirty-tree baseline and scoped file manifest. Confirm current schema,
router, job, skill, UI, and test entry points. Add a focused capacity test
command/documentation and capture known baseline failures separately.

Before changing persistence, inspect the existing 0233 migration and target DB
state. Because Drizzle's historical 0146/0147 parent collision blocks a clean
global migration check, use the repository's approved manual/idempotent migration
convention and verify the new migration directly against a disposable/target
database. Define rollback as disabling the new worker/job path and retaining the
additive assessment rows; do not drop existing data during rollout.

### Wave 1 — Canonical metric, source, namespace, and policy contracts (P0)

Create `apps/web/server/services/capacityPolicy.ts` (or the repository's
established equivalent name) as the server-owned capacity policy module beside
the monitoring services. It
must contain CPU/RAM/disk/temp/queue/worker/job thresholds, staleness windows,
forecast minimum-history rules, and status precedence. Define one versioned
policy identifier so a historical result can be interpreted after policy
changes. Map or explicitly separate the older Ops anomaly thresholds instead of
leaving duplicate UI/service constants.

Introduce normalized types for:

- `MetricEvidence`: value, unit, capturedAt, source, scope/namespace, quality,
  availability, and optional threshold/trend/forecast.
- `WorkloadEvidence`: queues, queued/active/stalled counts, oldest queued age,
  worker count, configured/observed concurrency, long-running jobs, throughput,
  duration percentiles/maximum, retries, and failures.
- `CoverageEvidence`: expected metric groups, available groups, stale groups,
  truncated groups, namespace mismatches, and a human-readable coverage summary.
- `CapacityDecision`: deterministic overall status, per-area status, risk
  items, forecast, action class (`observe`, `optimize`, `scale_up`,
  `cloud_review`, `insufficient_data`), and evidence references.

Keep existing persisted fields backward compatible. Add additive columns or a
versioned JSON envelope for policy/snapshot/decision metadata according to the
current Drizzle conventions; do not reinterpret old rows in place.

### Wave 2 — Collector and workload/storage evidence (P0)

Refactor `apps/web/server/services/capacityAssessmentService.ts` collection into
bounded source adapters, with shared normalization in
`apps/web/server/services/capacityEvidence.ts` and forecast helpers in
`apps/web/server/services/capacityForecast.ts`.
Reuse `workerFleetService.ts` for queued/active/stalled/oldest queued data and
the scheduled-job API/data model for duration/retry/error history where the web
process can access it. If a source is unavailable, return an explicit unavailable
record with reason and source timestamp; do not substitute zero.

Add observed concurrency and worker capacity. Distinguish configured concurrency
from active jobs, and identify long-running jobs using a documented threshold and
bounded sample. Include queue names, queue source, and whether counters are
durable or in-memory. Treat the current in-memory queue-health monitor as a
short-lived signal only.

Complete storage collection for root and allowlisted temp/media mounts, Docker
storage, free/used/total bytes, inode pressure where available, temp-file count
and bytes, and scan completeness. Persist host/container identity, mount path,
namespace, and collection timestamp. Make Node/Python metrics comparable only
when identity/scope matches; otherwise expose a namespace warning.

Address the Python system-health task routing limitation: either route health
collection to a low-priority/monitoring queue independent of media backlog, or
record queue delay as coverage evidence and make the limitation visible in the
assessment. This is part of correctness, not merely optimization.

### Wave 3 — Deterministic assessment, history, and forecast (P0)

Implement pure functions for threshold evaluation, status precedence, coverage
scoring, freshness, trend slope, disk/temp growth rate, and time-to-threshold.
Require minimum sample count and time span; output `insufficient_data` rather
than extrapolating from one sample. Cap forecasts to a documented horizon and
include the sample window and calculation basis in evidence.

Compute a deterministic decision before calling the LLM. The prompt must include
that decision and immutable evidence IDs. Define the action mapping explicitly:
`observe` requires healthy evidence and adequate coverage; `optimize` is for a
bounded resource/workload warning without sustained capacity exhaustion;
`scale_up` is for sustained high utilization, queue saturation, or worker
concurrency pressure that remains inside the current host boundary; `cloud_review`
requires sustained multi-area pressure, an imminent disk/temp threshold, or
workload growth beyond the documented Home Server envelope plus adequate
evidence/forecast. If coverage is insufficient, the action is `insufficient_data`
even when one metric looks healthy. Persist the policy version, collector
version, namespace identity, coverage, deterministic decision, LLM result, and
run lifecycle fields. Add retention/compaction: keep full snapshots for the
short operational window and compact decision/history records for the longer
window. Make cleanup bounded and observable.

### Wave 4 — Skill input/output hardening and reconciliation (P0)

Update the skill input schema to require version, policy version, source/namespace,
coverage, deterministic metrics, workload evidence, forecast evidence, and an
explicit data-completeness section. Keep the sanitization rules and bounded
payload size; if truncation occurs, include a machine-readable truncation marker
and affected groups.

Update the output contract so each recommendation/watchlist item references an
evidence key and uses controlled severity/action/horizon values. At the server
boundary, validate every LLM metric/current/threshold/severity/trend/horizon
against the snapshot and policy. On mismatch, replace the claim with an
authoritative value, downgrade confidence, or omit it as unknown according to a
deterministic rule. The UI must render the reconciled result, never raw model
JSON. Preserve a safe fallback when the skill is unavailable: persist a
deterministic insufficient-data/error result without inventing a recommendation.

### Wave 5 — Guarded asynchronous execution and scheduler (P1)

Replace the synchronous Admin mutation path with a durable run lifecycle:
`requested` → `collecting` → `assessing` → `completed` or `failed`, with
timestamps, trigger, requester, error class, and duration. The mutation confirms
and enqueues/starts a run, then returns run identity/status. Add a lock/idempotency
key that prevents overlapping runs for the same deployment and avoids duplicate
LLM spend. Define timeout, retry count, backoff, and cancellation behavior.

Use the same worker handler for manual and daily triggers. Make the daily job
safe when Redis/LLM is unavailable: startup must continue, the attempt must be
observable, and a later retry must not create duplicates. Persist scheduler
last-attempt/last-success/next-expected-run metadata, including configured
timezone. Add Admin audit logging for manual confirmation and result access when
the existing audit boundary supports it.

The Admin API remains in the existing monitoring router and is Admin-only:

- `getLatestCapacityAssessment` returns the latest completed/reconciled DTO,
  coverage/freshness, and active-run metadata without raw private snapshot data.
- `getCapacityAssessmentHistory` accepts bounded limit/cursor filters and returns
  compact historical decisions plus safe failure metadata.
- `getCapacityAssessmentRun` returns one run's lifecycle and safe progress/error
  state for polling after manual or scheduled execution.
- `runCapacityAssessment` requires explicit confirmation, accepts an optional
  idempotency key, and returns the existing active run when deduplicated.

The API distinguishes no row, active row, failed row, stale completed row, and
insufficient-data completed row. Existing query invalidation/polling patterns are
sufficient; no new realtime transport is required.

### Wave 6 — Admin UI completion (P1)

Split `CapacityAdvisorPanel.tsx` into focused components/helpers without
changing the approved information architecture:

- `CapacityAdvisorSummaryTab`: verdict, exact figures, thresholds, coverage,
  freshness, risk list, action recommendation, confidence/limits.
- `CapacityAdvisorSystemTab`: CPU/RAM/process/service/disk/mount/temp evidence.
- `CapacityAdvisorWorkloadTab`: queues, workers, concurrency, long-running jobs,
  duration/retry/error/throughput, and monitoring delay.
- `CapacityAdvisorHistoryTab`: run states, trigger/requester, duration, failure,
  policy/collector version, and historical decision.
- Pure format/status/forecast helpers with unit coverage.

The summary must answer: “สถานะตอนนี้เป็นอย่างไร”, “อ้างอิงตัวเลขอะไร”, “ปัญหา
จุดไหนกำลังจะเกิด”, and “ควรทำอะไรต่อ”. It must show exact current value,
threshold, captured time, source/scope, and forecast basis for each warning. Do
not show a queue threshold of zero when it is unavailable; say “ไม่มีเกณฑ์ที่
กำหนด” and use coverage status.

Add temp-mount evidence, stale/partial/namespace banners, query error state,
manual-run confirmation, disabled/in-progress state, polling/refresh behavior,
and a clear distinction between no assessment, failed assessment, and insufficient
data. Critical results should integrate with the existing Admin alert convention
only after deduplication/cooldown is defined; otherwise show in-panel priority.

#### UI/UX contract

**Target user / JTBD**

- User: Admin/operator responsible for deciding whether the Home Server remains
  adequate.
- Job: understand current risk and next action quickly, then inspect evidence.
- Entry: Dashboard → Admin → Monitoring → Capacity Advisor.
- Success: an Admin can state the verdict, the figures behind it, and the next
  safe action without interpreting raw charts.

**Surface inventory**

| Surface | Route/file | Contract |
|---|---|---|
| Dashboard Admin menu | `packages/shared/src/constants/menu.ts` | Clearly named Capacity Advisor entry |
| Summary tab | `CapacityAdvisorSummaryTab.tsx` | Default, plain-language verdict and evidence |
| System tab | `CapacityAdvisorSystemTab.tsx` | CPU/RAM/disk/temp/service detail |
| Workload tab | `CapacityAdvisorWorkloadTab.tsx` | queues/concurrency/background jobs |
| History tab | `CapacityAdvisorHistoryTab.tsx` | run lifecycle and historical decisions |
| Manual run | summary header/action area | confirmation, progress, error, retry |

**Component ownership**

Summary owns user interpretation and action copy; details own evidence tables;
the server DTO owns values and status; shared helpers own localization-safe
formatting. No component recomputes thresholds or forecasts.

**State matrix**

| State | Expected behavior |
|---|---|
| loading | skeletons and disabled run action; preserve previous data if refreshing |
| no assessment | explain daily/manual availability and show run action |
| running | show trigger, start time, progress phase, and prevent duplicate run |
| success/healthy | green/neutral verdict with coverage and exact evidence |
| watch/action/critical | severity, metric/threshold, forecast horizon, and next action |
| insufficient data | explain missing/stale/namespace groups and avoid healthy wording |
| stale | show last sample/assessment age and warn that decision may be outdated |
| failed | show safe error class, retry action, and retain last successful result |
| partial | show available groups plus explicit omitted/truncated groups |
| keyboard focus/selected | visible focus ring and selected tab semantics |

**Responsive matrix**

| Viewport | Expected behavior |
|---|---|
| 390×844 | summary cards stack, tables scroll within region, action remains reachable |
| 768×1024 | cards use two columns, tabs and evidence remain readable |
| 1280×800 | summary stays concise; details use full table width |
| 1440+ | constrain content width; no excessive empty spread or unreadable long lines |

**Accessibility and visual direction**

Use existing design tokens and UI primitives. Tabs use semantic tablist/tab/tabpanel
roles, buttons have Thai accessible labels, severity uses text plus color/icon,
tables have headers, focus is visible, contrast meets existing app standards, and
reduced-motion preferences are respected. Avoid new chart dependencies; prefer
compact metric cards, evidence tables, badges, and a small trend/forecast row.

**Copy/localization contract**

Primary copy is concise Thai with stable English metric names in secondary text:
`สถานะปัจจุบัน`, `ตัวเลขอ้างอิง`, `จุดที่ต้องเฝ้าระวัง`, `ควรทำอะไรต่อ`,
`ข้อมูลไม่เพียงพอ`, `ข้อมูลล้าสมัย`, and `ยังไม่มีการประเมิน`. Error copy must
not expose internal secrets or raw provider errors. Missing translations use the
existing locale fallback.

**Browser evidence**

Run an authenticated Admin browser pass at mobile, tablet, laptop, and desktop
widths. Capture summary healthy/watch/critical/insufficient-data, running,
failed, stale, and empty states. Verify the default tab, menu entry, confirmation,
refresh, table overflow, keyboard tabs, and no raw secret/private payload in DOM.

### Wave 7 — Tests, migration proof, and rollout gates

Add tests before implementation for each wave. Cover pure policy/forecast logic,
collector source normalization, namespace mismatch and truncation, skill schema
and reconciliation, run lock/state transitions, Admin authorization, scheduler
idempotency/failure, migration shape, menu presence, and all key UI states.

Run focused web Vitest suites with required test secrets, relevant Python pytest
units, skill verification, formatting/diff checks, and changed-file type checks.
Run migration against a target/disposable DB and inspect stored JSON/retention.
Perform authenticated browser evidence only after server/API proof is green.
Record full-repo typecheck separately because existing unrelated diagnostics are
known. Do not call the feature live until migration, skill bundle parity,
scheduler observability, manual guard, and browser summary evidence pass.

## Suggested file ownership

**Server/data:** `capacityAssessmentService.ts`, new capacity policy/normalizer/
forecast modules, `workerFleetService.ts` integration, `monitoring.ts`,
`capacityAssessmentJob.ts`, schema and additive migration, relevant audit/alert
service, and focused server tests.

**Skill:** `apps/web/skills/infrastructure-capacity-advisor/skill.md`, schemas,
fixtures, verification script, and contract tests.

**UI:** `CapacityAdvisorPanel.tsx` split into nearby Admin components, shared
types/formatters, Admin Monitoring integration, and component/browser tests.

**Operational docs:** capacity runbook covering source namespaces, threshold
policy, scheduler timezone, retention, migration/rollback, and interpretation of
Home Server versus Cloud review recommendations.

## Risks and mitigations

- Different host/container views: make identity/scope first-class and downgrade
  mismatches.
- LLM hallucinated evidence: reconcile against deterministic snapshot and render
  only reconciled DTOs.
- Duplicate/manual LLM spend: durable lock and idempotency key.
- Queue backlog hides monitoring: isolate health task or expose delayed coverage.
- Large JSON growth: retention, compaction, bounded prompt, truncation metadata.
- Migration baseline collision: use additive idempotent migration and target-DB
  proof rather than claiming global Drizzle cleanliness.
- UI complexity regression: keep summary as a fixed information budget and move
  evidence to detail tabs.

## Definition of done

The feature is done when all acceptance criteria in `spec.md` pass, all planned
focused tests and target-DB/browser evidence are recorded, the migration is
applied/verified in the intended environment, and remaining baseline failures
are explicitly separated from this feature's proof.
