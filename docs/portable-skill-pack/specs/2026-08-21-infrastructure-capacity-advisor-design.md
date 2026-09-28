# Infrastructure Capacity Advisor

## Goal

Give Admin one clear place to see whether the current Home Server is approaching
resource or workload limits and whether to optimize, add worker capacity, move
to Cloud, or continue observing.

## Scope

- Collect CPU, RAM, disk capacity/free space, Docker storage when available,
  temporary-file usage, service runtime, queue backlog, worker/job counts, and
  recent persisted metrics.
- Run the same assessment automatically once per day and on demand from Admin.
- Send the sanitized snapshot through the `infrastructure-capacity-advisor`
  product skill so an LLM produces an evidence-based recommendation.
- Persist the snapshot and assessment for history and auditability.
- Expose the latest result/history only to Admin and present it as a dedicated
  Capacity Advisor tab in Admin Monitoring.

## Safety and decision rules

- The LLM can recommend; it cannot change infrastructure, delete files, resize
  services, or migrate data.
- Missing metrics are explicit (`unknown`/`insufficient_data`), never inferred
  as healthy.
- No secrets, environment values, credentials, request payloads, or raw logs
  are sent to the LLM.
- Recommendations must identify evidence, severity, confidence, next action,
  and the boundary between optimization, scale-up, and migration.
- Temporary-file inspection uses a fixed allowlist of known temp/media paths
  and bounded traversal so an assessment cannot become an unbounded scan.

## User flows

1. Admin opens Dashboard > Admin > Capacity Advisor.
2. The page shows the latest assessment, resource cards, warning points,
   recommendation, evidence, and recent runs.
3. Admin clicks `Run assessment now`; the server collects a fresh snapshot,
   executes the skill, persists the result, and refreshes the page.
4. A daily background job runs the same service with `trigger=scheduled`.

## Data contract

`capacity_assessments` stores `status`, `trigger`, requester, timestamps,
sanitized `snapshot`, structured `assessment`, and an error message when the run
cannot complete. The JSON contracts are versioned in the product skill folder.

## Acceptance criteria

- Admin-only API exposes latest assessment, bounded history, and manual trigger.
- Daily scheduler is idempotent and does not fail web startup when Redis/LLM is
  unavailable.
- CPU/RAM/disk/temp/queue/background-job evidence appears in the snapshot or is
  explicitly marked unavailable.
- UI clearly distinguishes `healthy`, `watch`, `action`, `critical`, and
  `insufficient_data`.
- Focused service, router/menu, and skill-contract tests pass.
