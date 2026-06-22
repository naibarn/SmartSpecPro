# Plan vs Spec Completeness Review - Round 2

Planning directory: `specs/feature/124-smart-ai-hub-worker-app`

## Scope Reviewed

- Raw spec: `spec.md`
- Synthesized spec: `claude-spec.md`
- Implementation plan: `claude-plan.md`
- TDD plan: `claude-plan-tdd.md`
- Section index and all 11 section files

## Result

The plan covered the main architecture, but several raw-spec requirements were
too implicit for reliable implementation. I promoted those into explicit plan,
TDD, and section contracts.

## Improvements Applied

1. Persistence mapping and promotion criteria
   - Added explicit mapping from raw spec logical records
     (`worker_connections`, `worker_job_attempts`, etc.) to existing tables
     (`workers`, `worker_jobs`, `worker_job_events`, `worker_artifacts`) and
     promotion triggers for new tables/columns.

2. Endpoint namespace compatibility
   - Added a route mapping from raw `/api/worker-app/*` concepts to existing
     canonical `/api/workers/*` and `/api/worker-jobs/*` routes.
   - Clarified aliases must delegate to the same handlers and never create a
     second control plane.

3. Queue policy, priority, and fairness
   - Added priority classes, quota metadata, fairness keys, retry count, and
     no-user-starvation expectations to plan/TDD/section 02.

4. Cooperative stop and stale-attempt safety
   - Added heartbeat command handling, `cancel-ack`/`transfer-ack`, stop grace
     period, max attempts, and dead-letter behavior to plan/TDD/sections 03 and
     08.

5. Artifact retention and cleanup
   - Added explicit retention rules for signed manifests, incomplete uploads,
     stale artifacts, verified outputs, and sanitized support bundles to
     plan/TDD/section 04.

6. Billing and credit reconciliation
   - Added queue-time reservation, verification-time capture, queued
     cancellation refund/release, and failure reconciliation expectations to
     plan/TDD/sections 02 and 04.

7. Fallback-output rejection
   - Added explicit rejection for diagnostic smoke runtime and ASS/FFmpeg
     fallback output in final composite verification.

8. Auth scope alignment
   - Clarified that implementation should reuse existing `workers:*` route
     scope conventions while preserving worker-specific token type/audience and
     product capability claims.

9. Windows release gate
   - Added installer/update/first-run/runtime-doctor/minimize-to-tray release
     gate requirements to plan/TDD/section 07.

10. Observability and audit
    - Added metrics and audit events required by raw spec to plan/TDD/section
      10.

11. MCP tool naming
    - Replaced ambiguous `worker.jobs.*` public names with branded
      `smartaihub.worker.*` tool names in synthesized spec, plan, TDD, and
      section 11.

## Validation

- `check-sections.py`: complete, 11/11 sections.
- `check-ui-contracts.py`: passed, all UI-affecting sections have required
  UI/UX contract headings.
- Placeholder scan: no actionable placeholders found.

## Residual Notes

- The plan intentionally keeps implementation on existing worker routes
  (`/api/workers/*`, `/api/worker-jobs/*`) rather than raw spec's proposed
  `/api/worker-app/*` namespace, because SocratiCode/codebase research found
  the existing route family is already the repo's worker control plane.
- If product-facing docs later need `/api/worker-app/*`, implement it only as a
  thin alias layer over the canonical handlers.
