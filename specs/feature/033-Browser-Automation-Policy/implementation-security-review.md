# Implementation Security Review

## high

- file/path: `python-backend/app/tasks/automation_copilot_task.py`, `python-backend/app/services/self_healing_executor.py`, `apps/web/server/services/browserDataHandlingPolicy.ts`, `apps/web/server/services/browserIncidentControls.ts`
  risk: Sections 05-07 landed as helper-layer logic only. The live Automation Copilot and Python browser executor still do not invoke the shared per-action browser-policy path, so transfer controls, kill switches, revocation checks, and audit artifacts are not yet enforcing on production-style execution.
  recommended_fix_direction: finish the section-04 execution seam so every live browser action and transition calls the Node-owned policy contract before dispatch, and gate tenant-facing enablement on that wiring.

## medium

- file/path: `apps/web/server/services/browserPolicyAuditLogger.ts`, `apps/web/drizzle/browserPolicyMigrationPlan.ts`
  risk: Audit artifacts and migration readiness logic exist, but there is still no dedicated browser-policy decision table or live JSONL/DB persistence path. Incident review would therefore depend on helper outputs that are not durably written from runtime decisions.
  recommended_fix_direction: add the raw SQL decision-storage migration, monthly partitions, and the runtime writer that persists the browser-policy audit artifact for each live decision.

- file/path: `apps/web/server/services/browserDataHandlingPolicy.ts`, `python-backend/app/services/browser_policy_transfer_controls.py`
  risk: Same-site classification uses a lightweight registrable-domain heuristic rather than a public-suffix-aware resolver. Some multi-part public suffixes or edge-case domains could be misclassified, weakening trust-boundary enforcement.
  recommended_fix_direction: switch the same-site check to a PSL-aware resolver shared across Node and Python so trust-tier decisions stay consistent for public-suffix edge cases.

## low

- file/path: `apps/web/server/services/browserIncidentControls.ts`, `python-backend/app/services/browser_policy_incident_controls.py`
  risk: Emergency domain overrides currently match exact hostnames only. Operators cannot yet express wildcard or subtree blocks for fast-moving incidents across related subdomains.
  recommended_fix_direction: extend deny overrides to support validated wildcard or suffix policies with explicit normalization and tests.
